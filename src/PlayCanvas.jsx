import { forwardRef, useLayoutEffect, useRef, useState } from "react";
import { assignmentStartSeconds, FIELD, isLineLabel, morphKeys, routeDuration } from "./playData";
import {
  fieldProjection,
  polylinePoints,
  tokenMotionPath,
  visibleYardLines,
  yardNumbers,
} from "./fieldView";

/**
 * Token sizing.
 *
 * Sizes are expressed in yards with a pixel floor and ceiling. A purely
 * pixel-constant token would collide with its neighbours wherever the field is
 * zoomed out (a narrow phone showing the full 53 yd width sits near 7 px/yd),
 * while a purely yard-based one would become illegible. Bounding a yard size
 * keeps tokens visually stable at normal zoom and separated when zoomed out.
 */
const TOKEN = {
  skill: { yards: 1.05, min: 7, max: 13 },
  // Interior linemen sit closest together, so their tokens are a little smaller.
  line: { yards: 0.85, min: 5.5, max: 9.5 },
  defense: { yards: 0.95, min: 6, max: 11 },
  skillLabel: { yards: 1.1, min: 7, max: 12.5 },
  lineLabel: { yards: 0.85, min: 6, max: 9.5 },
  defenseLabel: { yards: 0.95, min: 6.5, max: 10.5 },
  handle: { yards: 0.7, min: 5, max: 8 },
  depthTag: { yards: 1.0, min: 8, max: 11 },
  number: { yards: 2.4, min: 14, max: 30 },
  /** Hit targets stay a true 44 CSS px regardless of zoom. */
  hitRadiusPx: 22,
};

/** Resolves a token size to SVG user units (yards) for the current projection. */
function sizeOf(spec, projection) {
  const pixels = Math.min(spec.max, Math.max(spec.min, spec.yards * projection.pxPerYard));
  return projection.pixels(pixels);
}

/**
 * Suppresses the compatibility mouse events a touch generates.
 *
 * Selecting a player opens the inspector as a bottom sheet, and without this the
 * synthetic `mousedown`/`click` that follows the tap lands on whatever the sheet
 * just put under the finger -- in practice the sheet's own drag handle, which
 * expanded it over the whole field on every single tap.
 */
function suppressGhostClick(event) {
  if (event.pointerType === "touch" && event.cancelable) event.preventDefault();
}

/** What a screen reader should say about a token, and what a sighted user sees on focus. */
function tokenLabel(player, unit, assignments) {
  const owned = assignments.filter((item) => item.playerId === player.id);
  const duties = owned.length
    ? owned.map((item) => `${item.phase === "pre" ? "pre-snap" : "at snap"} ${item.type}`).join(", ")
    : "no assignment";
  const depth = player.y === 0
    ? "on the line of scrimmage"
    : `${Math.abs(player.y)} yards ${player.y > 0 ? "downfield" : "behind the line"}`;
  return `${player.label}, ${unit}, ${depth}, ${duties}`;
}

/**
 * The animations that carry a token through its assignments during playback.
 *
 * Playback used to move small anonymous dots along the routes while all
 * twenty-two players stood frozen at alignment -- accurate, but nothing like
 * watching a play. The tokens themselves now run their assignments. The path is
 * relative to the token's alignment (see `tokenMotionPath`), and begin/dur come
 * from the same timing model the dots used, so pre-snap motion still goes in
 * motion-speed before the snap and routes still leave on their delays.
 */
function tokenRunAnimations(player, assignments, projection, speed, visible) {
  return assignments
    .filter((item) => item.playerId === player.id && visible(item))
    .map((item) => (
      <animateMotion
        key={`run-${item.id}`}
        begin={`${assignmentStartSeconds(item)}s`}
        dur={`${routeDuration(item, speed)}s`}
        fill="freeze"
        path={tokenMotionPath(item.points, projection, [player.x, player.y])}
      />
    ));
}

/**
 * Morphs the board when the play changes: matched tokens glide from their old
 * alignment to the new one and routes fade in behind them, so browsing a family
 * reads as one living playbook instead of six flashcards. Uses FLIP over WAAPI
 * -- positions are recorded per render, and on a play switch each element gets
 * an inverse transform animated back to identity. CSS px inside an SVG
 * transform equal user units, so deltas in projected coordinates apply as-is.
 *
 * Skipped when the window itself moved (a fitted view refits per play, and
 * user-unit deltas would not describe the on-screen motion), during playback,
 * and under prefers-reduced-motion.
 */
function useFormationMorph({ stageRef, play, projection, ready, playback, positions }) {
  const previousRef = useRef({ playId: null, viewBox: null, positions: null });
  useLayoutEffect(() => {
    if (!ready) return;
    const previous = previousRef.current;
    previousRef.current = { playId: play.id, viewBox: projection.viewBox, positions };
    if (previous.playId === play.id || !previous.positions) return;
    if (previous.viewBox !== projection.viewBox) return;
    if (playback !== "idle") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
    const svg = stageRef.current?.querySelector("svg");
    if (!svg) return;

    for (const element of svg.querySelectorAll("[data-morph]")) {
      const from = previous.positions.get(element.dataset.morph);
      const to = positions.get(element.dataset.morph);
      if (!from || !to) continue;
      const dx = from[0] - to[0];
      const dy = from[1] - to[1];
      if (Math.hypot(dx, dy) < 0.05) continue;
      try {
        element.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0px, 0px)" }],
          { duration: 240, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
        );
      } catch {
        return; // WAAPI missing or SVG transforms unsupported: hard cut, as before.
      }
    }
    drawRoutesIn(svg, 120);
  });
}

/**
 * Routes draw themselves -- the whiteboard gesture of the sport. Solid strokes
 * reveal via dash offset from the player outward, staggered so the play is
 * authored in front of you rather than stamped. Dashed assignments (blocks,
 * motion) fade instead: a dash-offset reveal would destroy their dash pattern
 * for the duration of the animation. The arrowhead stays parked at the
 * destination while its line draws to it, which reads as "target marked".
 */
function drawRoutesIn(svg, baseDelay = 0) {
  let index = 0;
  for (const element of svg.querySelectorAll(".route")) {
    const delay = baseDelay + index * 36;
    index += 1;
    try {
      const type = element.dataset.assignmentType;
      if (type === "Block" || type === "Motion") {
        element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay, fill: "backwards", easing: "ease-out" });
        continue;
      }
      /*
       * The dash pattern must be measured in the stroke's own space.
       * `getTotalLength` returns user units (yards), but `non-scaling-stroke`
       * makes the browser lay dashes out in screen pixels -- a yard-length
       * dasharray on a pixel-length path renders as a marching dash pattern
       * instead of one revealing stroke. getScreenCTM's uniform scale converts.
       */
      const scale = element.getScreenCTM?.()?.a ?? 1;
      const length = element.getTotalLength() * scale;
      element.animate(
        [
          { strokeDasharray: `${length}`, strokeDashoffset: length },
          { strokeDasharray: `${length}`, strokeDashoffset: 0 },
        ],
        { duration: 280, delay, fill: "backwards", easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
    } catch {
      return; // no WAAPI: routes simply appear, as before
    }
  }
  for (const element of svg.querySelectorAll(".route-handle")) {
    try {
      element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: baseDelay + 160, fill: "backwards", easing: "ease-out" });
    } catch {
      return;
    }
  }
}

/** "@12" or "@7.5" -- a break's depth the way an install sheet writes it. */
function depthTag(depth) {
  const rounded = Math.round(depth * 2) / 2;
  return `@${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}`;
}

/** "12.3 L · on LOS" -- the live spot readout shown while dragging a player. */
export function describeSpot([x, y]) {
  const lateral = x === 0 ? "middle" : `${Math.abs(x).toFixed(1)} ${x > 0 ? "R" : "L"}`;
  const depth = y === 0 ? "on LOS" : y > 0 ? `${y.toFixed(1)} deep` : `${Math.abs(y).toFixed(1)} back`;
  return `${lateral} · ${depth}`;
}

/**
 * Enter activates a token. Space deliberately does not, even though the role is
 * button: Space is run/pause, the shortcut a coach uses most, and clicking a
 * player focuses its token. Activating on Space therefore swallowed the shortcut
 * for the rest of the session after the single most common action in the app,
 * and swallowed it silently, because activating an already-selected token does
 * nothing visible. Enter alone still gives the keyboard a way in.
 */
function onTokenKeyDown(event, activate) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  event.stopPropagation();
  activate();
}

/**
 * Tracks the canvas box in CSS pixels. The projection depends on it, because the
 * viewBox is derived from the viewport aspect rather than being a fixed
 * rectangle stretched to fit.
 */
function useElementSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const measure = () => {
      const box = element.getBoundingClientRect();
      setSize((current) => (
        Math.abs(current.width - box.width) < 0.5 && Math.abs(current.height - box.height) < 0.5
          ? current
          : { width: box.width, height: box.height }
      ));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}

function FieldMarkings({ projection }) {
  const half = FIELD.halfWidthYards;
  const hash = FIELD.hashFromCentreYards;
  const [nearDepth, farDepth] = projection.depthRange;
  const yardLines = visibleYardLines(projection);
  const numbers = yardNumbers(projection);
  const tick = 0.45;
  const numberInset = 4.5;

  const line = (from, to, key, className) => {
    const [x1, y1] = projection.project(from);
    const [x2, y2] = projection.project(to);
    return <line key={key} className={className} x1={x1} y1={y1} x2={x2} y2={y2} />;
  };

  // The playable surface, so the extra lateral room reads as out of bounds.
  const corners = [projection.project([-half, nearDepth]), projection.project([half, farDepth])];
  const surface = {
    x: Math.min(corners[0][0], corners[1][0]),
    y: Math.min(corners[0][1], corners[1][1]),
    width: Math.abs(corners[1][0] - corners[0][0]),
    height: Math.abs(corners[1][1] - corners[0][1]),
  };

  return (
    <g className="field-grid" aria-hidden="true">
      {/*
        The lighting model: a soft radial lift where the play lives, a vignette
        that lets the edges fall away, and a low glow under the LOS. All of it
        is deliberately near-subliminal -- the aim is that the field reads as a
        lit surface rather than a vector fill, not that anyone notices a
        gradient.
      */}
      <defs>
        <radialGradient id="field-light" cx="50%" cy="42%" r="85%">
          <stop offset="0%" stopColor="oklch(0.285 0.05 171)" />
          <stop offset="55%" stopColor="oklch(0.255 0.045 171)" />
          <stop offset="100%" stopColor="oklch(0.235 0.042 171)" />
        </radialGradient>
        <radialGradient id="field-vignette" cx="50%" cy="46%" r="78%">
          <stop offset="62%" stopColor="oklch(0 0 0 / 0)" />
          <stop offset="100%" stopColor="oklch(0 0 0 / 0.26)" />
        </radialGradient>
      </defs>
      <rect className="field-surface" x={surface.x} y={surface.y} width={surface.width} height={surface.height} />

      {yardLines.filter((depth) => depth !== 0).map((depth) => (
        line([-half, depth], [half, depth], `yard-${depth}`, depth % 10 === 0 ? "yard-line major" : "yard-line")
      ))}

      {/* Hash marks: short ticks along the field's length, at the real hash positions. */}
      {yardLines.flatMap((depth) => [-hash, hash].map((x) => (
        line([x, depth - tick], [x, depth + tick], `hash-${x}-${depth}`, "hash")
      )))}

      {/* Sidelines */}
      {line([-half, nearDepth], [-half, farDepth], "sideline-left", "sideline")}
      {line([half, nearDepth], [half, farDepth], "sideline-right", "sideline")}

      {/*
        The line of scrimmage, drawn as its own emphasised line over a soft
        glow. Previously the LOS was only inferable from where the linemen
        happened to be standing.
      */}
      {line([-half, 0], [half, 0], "los-glow", "los-glow")}
      {line([-half, 0], [half, 0], "line-of-scrimmage", "line-of-scrimmage")}

      {numbers.flatMap(({ depth, label }) => [-(half - numberInset), half - numberInset].map((x) => {
        const [screenX, screenY] = projection.project([x, depth]);
        const rotation = projection.view === "end" ? 90 : 0;
        return (
          <text
            key={`number-${depth}-${x}`}
            x={screenX}
            y={screenY}
            fontSize={sizeOf(TOKEN.number, projection)}
            transform={`rotate(${rotation} ${screenX} ${screenY})`}
          >
            {label}
          </text>
        );
      }))}

      <rect className="field-vignette" x={surface.x} y={surface.y} width={surface.width} height={surface.height} />
    </g>
  );
}

/**
 * Puts keyboard focus back on a token after the <svg> remounts.
 *
 * Starting a run bumps the play key so `animateMotion` restarts, which remounts
 * the whole canvas and destroys the focused token, dropping focus to <body>.
 * Now that tokens are focusable that would cost a keyboard user their place in
 * the tab order -- 23 presses back to the field -- every time they previewed a
 * play. Only fires when focus was genuinely lost, so it can never steal focus
 * from something the coach moved to deliberately.
 */
function useRestoreTokenFocus(playKey) {
  const lastToken = useRef(null);
  const remember = (playerId) => { lastToken.current = playerId; };

  useLayoutEffect(() => {
    const playerId = lastToken.current;
    if (!playerId || document.activeElement !== document.body) return;
    document.querySelector(`[data-player="${playerId}"]`)?.focus?.();
  }, [playKey]);

  return remember;
}

export const PlayCanvas = forwardRef(function PlayCanvas({
  activeTool,
  draftAssignment,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onStartPointDrag,
  onSelectPlayer,
  onSelectAssignment,
  play,
  playKey,
  playback,
  selectedPlayerId,
  selectedAssignmentId,
  selectedUnit,
  layers,
  speed,
  view,
  dragInfo,
  zoom,
  showDepths,
}, ref) {
  const [stageRef, size] = useElementSize();
  const rememberFocusedToken = useRestoreTokenFocus(playKey);
  /*
   * The projection is a pure function of (box size, view, zoom), so App
   * recomputes an identical one from the same stage box when handling pointer
   * input. Nothing needs to be shared through a ref.
   */
  const projection = fieldProjection({ width: size.width, height: size.height, view, play, zoom });

  const showMotion = playback !== "idle";
  const assignments = play.assignments;
  const assignmentVisible = (item) => layers.assignments.visible && layers[item.unit].visible;
  const selected = assignments.find((item) => item.id === selectedAssignmentId) ?? null;
  const ready = size.width > 0 && size.height > 0;

  const defenderRadius = sizeOf(TOKEN.defense, projection);
  const defenderLabelSize = sizeOf(TOKEN.defenseLabel, projection);
  const hitRadius = projection.pixels(TOKEN.hitRadiusPx);
  const runAnimations = (player) => (showMotion
    ? tokenRunAnimations(player, assignments, projection, speed, assignmentVisible)
    : null);

  const draggedPlayer = ready && dragInfo
    ? (dragInfo.unit === "defense" ? play.defenders : play.players).find((p) => p.id === dragInfo.playerId)
    : null;

  /*
   * First-mount entrance: tokens pop in with a slight stagger, once per app
   * session. The ref (not state) matters -- the SVG remounts on every run and
   * view change, and replaying the entrance there would fight the playback
   * animations. Setting it in an effect with no re-render is enough: the class
   * only needs to be absent the next time anything renders.
   */
  const entered = useRef(false);
  const entering = !entered.current;
  // Only counts once tokens have actually rendered: the first mount is a
  // zero-size canvas with nothing on it, and flipping there would skip the show.
  // The first-load routes draw in after the roster has landed.
  useLayoutEffect(() => {
    if (!ready || entered.current) return;
    entered.current = true;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
    const svg = stageRef.current?.querySelector("svg");
    if (svg) drawRoutesIn(svg, 340);
  }, [ready]);
  const enterStyle = (index) => (entering ? { animationDelay: `${index * 18}ms` } : undefined);

  const offenseMorph = morphKeys(play.players, "offense");
  const defenseMorph = morphKeys(play.defenders, "defense");
  const morphPositions = new Map();
  if (ready) {
    for (const player of play.players) morphPositions.set(offenseMorph.get(player.id), projection.project([player.x, player.y]));
    for (const player of play.defenders) morphPositions.set(defenseMorph.get(player.id), projection.project([player.x, player.y]));
  }
  useFormationMorph({ stageRef, play, projection, ready, playback, positions: morphPositions });

  return (
    <div
      ref={stageRef}
      className={`field-stage ${view} tool-${activeTool.toLowerCase()} ${dragInfo ? "is-dragging" : ""} ${projection.zoomFactor > 1 ? "is-zoomed" : ""} ${layers.offense.dimmed ? "dim-offense" : ""} ${layers.defense.dimmed ? "dim-defense" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <svg
        ref={ref}
        key={playKey}
        className="play-canvas"
        viewBox={projection.viewBox}
        preserveAspectRatio="xMidYMid meet"
        aria-label={`${play.name} play diagram`}
      >
        <defs>
          <marker id="route-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" />
          </marker>
          <marker id="route-arrow-active" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" />
          </marker>
        </defs>

        {ready ? <FieldMarkings projection={projection} /> : null}
        <title>{`${play.name}, ${play.formation}, ${play.personnel}`}</title>

        {/*
          Layer order: markings, routes, offence, offence labels, defence,
          handles, motion. SVG has no z-index, so paint order and tab order are
          the same list read once -- which makes this ordering a compromise
          rather than a free choice. Offence comes before defence so a coach
          building an offensive play reaches their own eleven on the first Tab
          instead of walking through the defence to get there. The cost is that
          a defender now paints over an offensive player where the two overlap,
          which no seeded play does: the units are 2.5 yd apart and the largest
          token is 0.72 yd in radius. Routes sit under both token layers so a
          route never crosses the player it belongs to.
        */}

        {/*
          Layers stay mounted when hidden and crossfade via opacity, so toggling
          a layer breathes instead of blinking. Hidden layers drop pointer
          events in CSS and tab stops in tabIndex.
        */}
        {ready ? (
          <g className={`assignments-layer ${layers.assignments.visible ? "" : "layer-hidden"}`}>
            {assignments.map((item) => (
              <polyline
                key={item.id}
                data-assignment-id={item.id}
                data-preset={item.preset}
                data-pace={item.pace}
                data-assignment-type={item.type}
                data-assignment-unit={item.unit}
                data-assignment-delay={item.delay}
                data-assignment-phase={item.phase}
                data-run-start={assignmentStartSeconds(item)}
                data-run-dur={routeDuration(item, speed)}
                data-geometry-mode={item.geometryMode}
                data-release={item.definition?.release}
                data-stem-yards={item.definition?.stemYards}
                data-break-count={item.definition?.breaks?.length}
                points={polylinePoints(
                  item.id === selectedAssignmentId && draftAssignment.length > 1 ? draftAssignment : item.points,
                  projection,
                )}
                className={`route assignment-${item.type.toLowerCase()} ${item.id === selectedAssignmentId ? "selected" : ""} ${layers[item.unit].visible ? "" : "layer-hidden"}`}
                markerEnd={item.id === selectedAssignmentId ? "url(#route-arrow-active)" : "url(#route-arrow)"}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  suppressGhostClick(event);
                  onSelectAssignment(item.id);
                }}
              />
            ))}
          </g>
        ) : null}

        {/*
          Break depths, the way an install sheet annotates them. Route-type only:
          stems and breaks are where depth is coached ("stick at 6, corner at
          12"); blocks and motion have no depth vocabulary. Behind a toggle in
          the Key because they are reference detail, not always-on signal.
        */}
        {ready && showDepths ? assignments.flatMap((item) => (
          item.type === "Route" && assignmentVisible(item)
            ? item.points.slice(1).map((point, pointOffset) => {
                const [screenX, screenY] = projection.project(point);
                const size = sizeOf(TOKEN.depthTag, projection);
                return (
                  <text
                    key={`depth-${item.id}-${pointOffset + 1}`}
                    className="depth-tag"
                    x={screenX + size * 0.65}
                    y={screenY - size * 0.45}
                    fontSize={size}
                  >
                    {depthTag(point[1])}
                  </text>
                );
              })
            : []
        )) : null}

        {ready ? <g className={`unit-layer ${layers.offense.visible ? "" : "layer-hidden"}`}>{play.players.map((player, playerIndex) => {
          const [screenX, screenY] = projection.project([player.x, player.y]);
          const isSelected = selectedUnit === "offense" && selectedPlayerId === player.id;
          const onLine = isLineLabel(player.label);
          return (
            <g
              key={player.id}
              data-player={player.id}
              data-unit="offense"
              data-morph={offenseMorph.get(player.id)}
              className={`player ${onLine ? "line-player" : ""} ${isSelected ? "focus-player" : ""} ${entering ? "token-enter" : ""}`}
              style={enterStyle(playerIndex)}
              tabIndex={layers.offense.locked || !layers.offense.visible ? -1 : 0}
              role="button"
              aria-label={tokenLabel(player, "offense", assignments)}
              aria-current={isSelected}
              onFocus={() => rememberFocusedToken(player.id)}
              onKeyDown={(event) => onTokenKeyDown(event, () => onSelectPlayer("offense", player.id, event))}
              onPointerDown={(event) => {
                event.stopPropagation();
                suppressGhostClick(event);
                onSelectPlayer("offense", player.id, event);
              }}
            >
              <circle className="token-hit" cx={screenX} cy={screenY} r={hitRadius} />
              <circle cx={screenX} cy={screenY} r={sizeOf(onLine ? TOKEN.line : TOKEN.skill, projection)} />
              {runAnimations(player)}
            </g>
          );
        })}</g> : null}

        {/*
          Labels are a separate pass so a neighbouring token can never paint over
          one. Interior linemen sit close enough that their two-character labels
          were being clipped by the next circle in document order.
        */}
        {ready ? <g className={`unit-layer ${layers.offense.visible ? "" : "layer-hidden"}`}>{play.players.map((player, playerIndex) => {
          const [screenX, screenY] = projection.project([player.x, player.y]);
          const labelSize = sizeOf(isLineLabel(player.label) ? TOKEN.lineLabel : TOKEN.skillLabel, projection);
          return (
            <text
              key={`label-${player.id}`}
              className={`player-label ${entering ? "token-enter" : ""}`}
              style={enterStyle(playerIndex)}
              data-morph={offenseMorph.get(player.id)}
              x={screenX}
              y={screenY + labelSize * 0.35}
              fontSize={labelSize}
            >
              {player.label}
              {/* Labels live outside their token's group, so they run the play separately. */}
              {runAnimations(player)}
            </text>
          );
        })}</g> : null}

        {ready ? <g className={`unit-layer ${layers.defense.visible ? "" : "layer-hidden"}`}>{play.defenders.map((player, playerIndex) => {
          const [screenX, screenY] = projection.project([player.x, player.y]);
          return (
            <g
              key={player.id}
              data-player={player.id}
              data-unit="defense"
              data-morph={defenseMorph.get(player.id)}
              className={`defender ${selectedUnit === "defense" && selectedPlayerId === player.id ? "focus-player" : ""} ${entering ? "token-enter" : ""}`}
              style={enterStyle(play.players.length + playerIndex)}
              tabIndex={layers.defense.locked || !layers.defense.visible ? -1 : 0}
              role="button"
              aria-label={tokenLabel(player, "defense", assignments)}
              aria-current={selectedUnit === "defense" && selectedPlayerId === player.id}
              onFocus={() => rememberFocusedToken(player.id)}
              onKeyDown={(event) => onTokenKeyDown(event, () => onSelectPlayer("defense", player.id, event))}
              onPointerDown={(event) => {
                event.stopPropagation();
                suppressGhostClick(event);
                onSelectPlayer("defense", player.id, event);
              }}
            >
              <circle className="token-hit" cx={screenX} cy={screenY} r={hitRadius} />
              <circle cx={screenX} cy={screenY} r={defenderRadius} />
              <text x={screenX} y={screenY + defenderLabelSize * 0.35} fontSize={defenderLabelSize}>
                {player.label}
              </text>
              {runAnimations(player)}
            </g>
          );
        })}</g> : null}

        {/*
          Route handles paint above both token layers because they are draggable
          and a route drawn into the defence would otherwise bury its own handles
          under the defenders. They never sit on the route's own player: point 0
          is the anchor and is deliberately not given a handle.
        */}
        {ready && selected && assignmentVisible(selected) ? selected.points.slice(1).map((point, pointOffset) => {
          const pointIndex = pointOffset + 1;
          const [screenX, screenY] = projection.project(point);
          return (
            <circle
              key={`${selected.id}-handle-${pointIndex}`}
              className="route-handle"
              cx={screenX}
              cy={screenY}
              r={sizeOf(TOKEN.handle, projection)}
              data-route-point={pointIndex}
              onPointerDown={(event) => {
                event.stopPropagation();
                suppressGhostClick(event);
                onStartPointDrag(pointIndex, event);
              }}
            />
          );
        }) : null}

        {/*
          Alignment guides while dragging: a line through the row or column the
          player just snapped to, so "why did it click there" is always visible.
        */}
        {draggedPlayer && dragInfo.guides ? (
          <g className="drag-guides" aria-hidden="true">
            {dragInfo.guides.x ? (() => {
              const [nearDepth, farDepth] = projection.depthRange;
              const [x1, y1] = projection.project([dragInfo.guides.x.value, nearDepth]);
              const [x2, y2] = projection.project([dragInfo.guides.x.value, farDepth]);
              return <line className="drag-guide" x1={x1} y1={y1} x2={x2} y2={y2} />;
            })() : null}
            {dragInfo.guides.y ? (() => {
              const [nearLateral, farLateral] = projection.lateralRange;
              const [x1, y1] = projection.project([nearLateral, dragInfo.guides.y.value]);
              const [x2, y2] = projection.project([farLateral, dragInfo.guides.y.value]);
              return <line className="drag-guide" x1={x1} y1={y1} x2={x2} y2={y2} />;
            })() : null}
          </g>
        ) : null}
      </svg>

      {/*
        The live spot readout, as chrome rather than SVG so it can hold a
        constant size and never fight the diagram for space. It trails the token
        by a fixed offset; position comes from the same projection the token
        used, so it cannot drift.
      */}
      {draggedPlayer ? (() => {
        const [sx, sy] = projection.project([draggedPlayer.x, draggedPlayer.y]);
        return (
          <output
            className="drag-readout"
            style={{
              left: (sx - projection.bounds.minX) * projection.pxPerYard,
              top: (sy - projection.bounds.minY) * projection.pxPerYard,
            }}
          >
            {describeSpot([draggedPlayer.x, draggedPlayer.y])}
          </output>
        );
      })() : null}
    </div>
  );
});
