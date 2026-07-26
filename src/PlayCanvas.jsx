import { forwardRef, useLayoutEffect, useRef, useState } from "react";
import { assignmentStartSeconds, FIELD, isLineLabel, routeDuration } from "./playData";
import {
  fieldProjection,
  motionPath,
  polylinePoints,
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
  motionDot: { yards: 0.6, min: 4.5, max: 7 },
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
        The line of scrimmage, drawn as its own emphasised line. Previously the
        LOS was only inferable from where the linemen happened to be standing.
      */}
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
    </g>
  );
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
}, ref) {
  const [stageRef, size] = useElementSize();
  /*
   * The projection is a pure function of (box size, view), so App recomputes an
   * identical one from the same stage box when handling pointer input. Nothing
   * needs to be shared through a ref.
   */
  const projection = fieldProjection({ width: size.width, height: size.height, view });

  const showMotion = playback !== "idle";
  const assignments = play.assignments;
  const assignmentVisible = (item) => layers.assignments.visible && layers[item.unit].visible;
  const selected = assignments.find((item) => item.id === selectedAssignmentId) ?? null;
  const ready = size.width > 0 && size.height > 0;

  const defenderRadius = sizeOf(TOKEN.defense, projection);
  const defenderLabelSize = sizeOf(TOKEN.defenseLabel, projection);
  const hitRadius = projection.pixels(TOKEN.hitRadiusPx);

  return (
    <div
      ref={stageRef}
      className={`field-stage ${view} tool-${activeTool.toLowerCase()} ${layers.offense.dimmed ? "dim-offense" : ""} ${layers.defense.dimmed ? "dim-defense" : ""}`}
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

        {ready && layers.defense.visible ? play.defenders.map((player) => {
          const [screenX, screenY] = projection.project([player.x, player.y]);
          return (
            <g
              key={player.id}
              data-player={player.id}
              data-unit="defense"
              className={`defender ${selectedUnit === "defense" && selectedPlayerId === player.id ? "focus-player" : ""}`}
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
            </g>
          );
        }) : null}

        {ready ? assignments.map((item) => assignmentVisible(item) ? (
          <polyline
            key={item.id}
            data-assignment-id={item.id}
            data-preset={item.preset}
            data-pace={item.pace}
            data-assignment-type={item.type}
            data-assignment-unit={item.unit}
            data-assignment-delay={item.delay}
            data-assignment-phase={item.phase}
            data-geometry-mode={item.geometryMode}
            data-release={item.definition?.release}
            data-stem-yards={item.definition?.stemYards}
            data-break-count={item.definition?.breaks?.length}
            points={polylinePoints(
              item.id === selectedAssignmentId && draftAssignment.length > 1 ? draftAssignment : item.points,
              projection,
            )}
            className={`route assignment-${item.type.toLowerCase()} ${item.id === selectedAssignmentId ? "selected" : ""}`}
            markerEnd={item.id === selectedAssignmentId ? "url(#route-arrow-active)" : "url(#route-arrow)"}
            onPointerDown={(event) => {
              event.stopPropagation();
              suppressGhostClick(event);
              onSelectAssignment(item.id);
            }}
          />
        ) : null) : null}

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

        {ready && layers.offense.visible ? play.players.map((player) => {
          const [screenX, screenY] = projection.project([player.x, player.y]);
          const isSelected = selectedUnit === "offense" && selectedPlayerId === player.id;
          const onLine = isLineLabel(player.label);
          const labelSize = sizeOf(onLine ? TOKEN.lineLabel : TOKEN.skillLabel, projection);
          return (
            <g
              key={player.id}
              data-player={player.id}
              data-unit="offense"
              className={`player ${onLine ? "line-player" : ""} ${isSelected ? "focus-player" : ""}`}
              onPointerDown={(event) => {
                event.stopPropagation();
                suppressGhostClick(event);
                onSelectPlayer("offense", player.id, event);
              }}
            >
              <circle className="token-hit" cx={screenX} cy={screenY} r={hitRadius} />
              <circle cx={screenX} cy={screenY} r={sizeOf(onLine ? TOKEN.line : TOKEN.skill, projection)} />
              <text x={screenX} y={screenY + labelSize * 0.35} fontSize={labelSize}>
                {player.label}
              </text>
            </g>
          );
        }) : null}

        {ready && showMotion ? assignments.map((item) => assignmentVisible(item) ? (
          <circle
            key={`motion-${playKey}-${item.id}`}
            className={`motion-dot ${item.id === selectedAssignmentId ? "selected" : ""}`}
            r={sizeOf(TOKEN.motionDot, projection)}
          >
            <animateMotion
              dur={`${routeDuration(item, speed)}s`}
              begin={`${assignmentStartSeconds(item)}s`}
              path={motionPath(item.points, projection)}
              fill="freeze"
            />
          </circle>
        ) : null) : null}
      </svg>
    </div>
  );
});
