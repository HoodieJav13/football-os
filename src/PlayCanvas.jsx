import { forwardRef } from "react";
import { assignmentStartSeconds, baseDefenders, basePlayers, routeDuration } from "./playData";

function screenPoint([x, y], view) {
  return view === "end" ? [x * 10, y * 6.8] : [(100 - y) * 10, x * 6.8];
}

function pointsFor(points, view) {
  return points.map((point) => screenPoint(point, view).join(",")).join(" ");
}

function motionPath(points, view) {
  return points
    .map((point) => screenPoint(point, view))
    .map((point, index) => `${index ? "L" : "M"}${point[0]} ${point[1]}`)
    .join(" ");
}

function FieldMarkings({ view }) {
  const yardLines = [14, 27, 40, 53, 66, 79, 92];
  const hashColumns = [30, 70];
  const yardLabels = [
    [24, "30"],
    [46, "20"],
    [68, "10"],
  ];

  if (view === "side") {
    return (
      <g className="field-grid" aria-hidden="true">
        <rect x="26" y="26" width="948" height="628" rx="2" className="field-boundary" />
        {yardLines.map((value) => <line key={value} x1={value * 10} y1="26" x2={value * 10} y2="654" />)}
        {yardLines.flatMap((value) => [180, 500].map((y) => <line key={`${value}-${y}`} x1={value * 10 - 7} y1={y} x2={value * 10 + 7} y2={y} className="hash" />))}
      </g>
    );
  }

  return (
    <g className="field-grid" aria-hidden="true">
      <rect x="26" y="26" width="948" height="628" rx="2" className="field-boundary" />
      {yardLines.map((value) => <line key={value} x1="26" y1={value * 6.8} x2="974" y2={value * 6.8} />)}
      {hashColumns.flatMap((x) => yardLines.flatMap((value) => [-18, 18].map((offset) => (
        <line key={`${x}-${value}-${offset}`} x1={x * 10 + offset} y1={value * 6.8 - 7} x2={x * 10 + offset} y2={value * 6.8 + 7} className="hash" />
      ))))}
      {yardLabels.flatMap(([y, label]) => [150, 850].map((x) => (
        <text key={`${label}-${x}`} x={x} y={y * 6.8} transform={`rotate(90 ${x} ${y * 6.8})`}>{label}</text>
      )))}
    </g>
  );
}

export const PlayCanvas = forwardRef(function PlayCanvas({
  activeTool,
  draftRoute,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onStartPointDrag,
  onSelectPlayer,
  onSelectRoute,
  paths,
  play,
  playKey,
  playback,
  selectedPlayer,
  selectedRoute,
  selectedUnit,
  layers,
  speed,
  view,
}, ref) {
  const showMotion = playback !== "idle";
  const players = play.players ?? basePlayers;
  const defenders = play.defenders ?? baseDefenders;
  const assignmentVisible = (assignment) => layers.assignments.visible && layers[assignment.unit ?? "offense"].visible;
  const selectedAssignment = selectedRoute === null ? null : paths[selectedRoute];
  const selectedAssignmentVisible = selectedAssignment ? assignmentVisible(selectedAssignment) : false;

  return (
    <div
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
        viewBox="0 0 1000 680"
        preserveAspectRatio="none"
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

        <FieldMarkings view={view} />

        {layers.defense.visible && defenders.map((player) => {
          const [screenX, screenY] = screenPoint([player.x, player.y], view);
          return (
            <g
              key={player.id}
              data-player={player.id}
              data-unit="defense"
              className={`defender ${selectedUnit === "defense" && selectedPlayer === player.id ? "focus-player" : ""}`}
              onPointerDown={(event) => {
                event.stopPropagation();
                onSelectPlayer("defense", player.id, event);
              }}
            >
              <circle cx={screenX} cy={screenY} r="16" />
              <text x={screenX} y={screenY + 5}>{player.label}</text>
            </g>
          );
        })}

        {paths.map((routeData, index) => assignmentVisible(routeData) ? (
          <polyline
            key={routeData.id}
            data-route-id={routeData.id}
            data-preset={routeData.preset}
            data-pace={routeData.pace}
            data-assignment-type={routeData.type}
            data-assignment-unit={routeData.unit ?? "offense"}
            data-assignment-delay={routeData.delay}
            data-geometry-mode={routeData.geometryMode}
            data-release={routeData.definition?.release}
            data-stem-yards={routeData.definition?.stemYards}
            data-break-count={routeData.definition?.breaks?.length}
            points={pointsFor(index === selectedRoute && draftRoute.length > 1 ? draftRoute : routeData.points, view)}
            className={`route assignment-${routeData.type.toLowerCase()} route-${index} ${selectedRoute === index ? "selected" : ""}`}
            markerEnd={selectedRoute === index ? "url(#route-arrow-active)" : "url(#route-arrow)"}
            onPointerDown={(event) => {
              event.stopPropagation();
              onSelectRoute(index);
            }}
          />
        ) : null)}

        {selectedAssignmentVisible && paths[selectedRoute]?.points.slice(1).map((point, pointOffset) => {
          const pointIndex = pointOffset + 1;
          const [screenX, screenY] = screenPoint(point, view);
          return (
            <circle
              key={`${paths[selectedRoute].id}-handle-${pointIndex}`}
              className="route-handle"
              cx={screenX}
              cy={screenY}
              r="10"
              data-route-point={pointIndex}
              onPointerDown={(event) => {
                event.stopPropagation();
                onStartPointDrag(pointIndex, event);
              }}
            />
          );
        })}

        {layers.offense.visible && players.map(([label, x, y]) => {
          const [screenX, screenY] = screenPoint([x, y], view);
          const isSelected = selectedUnit === "offense" && selectedPlayer === label;
          return (
            <g
              key={`${label}-${x}-${y}`}
              data-player={label}
              data-unit="offense"
              className={`player ${isSelected ? "focus-player" : ""}`}
              onPointerDown={(event) => {
                event.stopPropagation();
                onSelectPlayer("offense", label, event);
              }}
            >
              <circle cx={screenX} cy={screenY} r="17" />
              <text x={screenX} y={screenY + 5}>{label}</text>
            </g>
          );
        })}

        {showMotion && paths.map((routeData, index) => assignmentVisible(routeData) ? (
          <circle key={`motion-${playKey}-${routeData.id}`} className={`motion-dot motion-${index}`} r="9">
            <animateMotion
              dur={`${routeDuration(routeData, speed)}s`}
              begin={`${assignmentStartSeconds(routeData)}s`}
              path={motionPath(routeData.points, view)}
              fill="freeze"
            />
          </circle>
        ) : null)}
      </svg>
    </div>
  );
});
