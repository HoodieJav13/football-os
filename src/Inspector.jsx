import { useEffect, useRef, useState } from "react";
import {
  AssignmentStagePicker,
  AssignmentTransfer,
  AssignmentTypePicker,
  BlockEditor,
  DefensiveEditor,
  MotionEditor,
  TimingControls,
} from "./AssignmentEditors";
import { titleCase } from "./appHelpers";
import {
  breakDirections,
  inferRouteDefinition,
  releaseOptions,
  routeDefinitionSummary,
  sanitizeRouteDefinition,
} from "./playData";
import { CaretDown, CaretRight, CaretUp, Copy, GitMerge, LockSimple, Play, Plus, Trash, X } from "@phosphor-icons/react";

/** The right edge player inspector: identity, assignment stage, and the detail editors. */
function PositionLabelControl({ label, onSave }) {
  const [value, setValue] = useState(label);

  useEffect(() => setValue(label), [label]);

  const commit = () => {
    const next = value.trim().toUpperCase();
    if (!next) {
      setValue(label);
      return;
    }
    if (next !== label) onSave(next);
  };

  return (
    <label className="position-label-control">
      <span>Position label</span>
      <input
        aria-label="Position label"
        maxLength={4}
        value={value}
        onBlur={commit}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

function RouteDefinitionEditor({ route, onChange, onRegenerate }) {
  const definition = sanitizeRouteDefinition(route.definition ?? inferRouteDefinition(route));
  const evidence = route.evidence;
  const detected = route.geometryMode === "detected";
  const manual = route.geometryMode === "manual";
  const [conditionDraft, setConditionDraft] = useState(definition.condition);
  const conditionDraftRef = useRef(definition.condition);

  useEffect(() => {
    setConditionDraft(definition.condition);
    conditionDraftRef.current = definition.condition;
  }, [definition.condition, route.id]);

  const changeDefinition = (updater) => {
    const next = typeof updater === "function" ? updater(definition) : updater;
    onChange(sanitizeRouteDefinition(next));
  };

  const changeBreak = (index, patch) => {
    changeDefinition((current) => ({
      ...current,
      breaks: current.breaks.map((segment, segmentIndex) => segmentIndex === index ? { ...segment, ...patch } : segment),
    }));
  };

  const addBreak = () => {
    changeDefinition((current) => ({
      ...current,
      breaks: [
        ...current.breaks,
        current.breaks.length
          ? { direction: "vertical", angle: 0, distanceYards: 10 }
          : { direction: "inside", angle: 45, distanceYards: 8 },
      ],
    }));
  };

  return (
    <div className="route-definition">
      <div className={`definition-status ${manual ? "manual" : detected ? "detected" : "structured"}`}>
        <span>{manual ? "Manual landmark override" : detected ? "Detected from existing diagram" : "Structured route"}</span>
        {manual ? <button onClick={onRegenerate}>Regenerate</button> : null}
      </div>

      {evidence?.sourcePage ? (
        <div className="source-evidence">
          <span>{evidence.method === "labels-and-geometry" ? "PDF labels + geometry" : "PDF geometry inferred"} · {titleCase(evidence.confidence)}</span>
          <strong>{evidence.sourceLabel} · page {evidence.sourcePage}</strong>
          {evidence.note ? <small>{evidence.note}</small> : null}
          {evidence.coachEdited ? <small>Coach-edited after detection</small> : null}
        </div>
      ) : null}

      <fieldset className="release-control">
        <legend>Release / stem leverage</legend>
        <div>
          {releaseOptions.map((option) => (
            <button
              key={option}
              type="button"
              className={definition.release === option ? "active" : ""}
              aria-pressed={definition.release === option}
              onClick={() => changeDefinition({ ...definition, release: option })}
            >
              {titleCase(option)}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="route-number-field">
        <span>Stem depth</span>
        <span className="number-input"><input type="number" min="0" max="40" step="1" value={definition.stemYards} onChange={(event) => changeDefinition({ ...definition, stemYards: event.target.value })} /><b>yds</b></span>
      </label>

      <div className="break-list">
        <div className="break-list-head"><span>Break sequence</span><small>{definition.breaks.length ? `${definition.breaks.length} segment${definition.breaks.length === 1 ? "" : "s"}` : "No break"}</small></div>
        {definition.breaks.map((segment, index) => (
          <section className="break-card" key={`${index}-${segment.direction}`}>
            <div className="break-card-head"><strong>{index === 0 ? "Primary break" : `Move ${index + 1}`}</strong><button type="button" aria-label={`Remove break ${index + 1}`} onClick={() => changeDefinition({ ...definition, breaks: definition.breaks.filter((_, segmentIndex) => segmentIndex !== index) })}><X size={16} /></button></div>
            <label>Direction
              <select value={segment.direction} onChange={(event) => changeBreak(index, { direction: event.target.value, angle: event.target.value === "vertical" ? 0 : segment.angle || 45 })}>
                {breakDirections.map((direction) => <option key={direction} value={direction}>{titleCase(direction)}</option>)}
              </select>
            </label>
            <div className="break-measures">
              <label>Angle<span className="number-input"><input type="number" min="0" max="135" step="5" disabled={segment.direction === "vertical"} value={segment.angle} onChange={(event) => changeBreak(index, { angle: event.target.value })} /><b>°</b></span></label>
              <label>Distance<span className="number-input"><input type="number" min="0" max="40" step="1" value={segment.distanceYards} onChange={(event) => changeBreak(index, { distanceYards: event.target.value })} /><b>yds</b></span></label>
            </div>
          </section>
        ))}
        <button type="button" className="add-break" onClick={addBreak}><Plus size={17} />{definition.breaks.length ? "Add double-move segment" : "Add break"}</button>
      </div>

      <label className="route-condition">Condition / conversion
        <textarea
          value={conditionDraft}
          placeholder="e.g. Convert to bender vs MFO"
          onChange={(event) => {
            conditionDraftRef.current = event.target.value;
            setConditionDraft(event.target.value);
          }}
          onBlur={() => {
            if (conditionDraftRef.current !== definition.condition) changeDefinition({ ...definition, condition: conditionDraftRef.current });
          }}
        />
      </label>
      {conditionDraft !== definition.condition ? (
        <button type="button" className="apply-condition" onClick={() => changeDefinition({ ...definition, condition: conditionDraftRef.current })}>
          Apply conversion note
        </button>
      ) : null}
    </div>
  );
}

export function Inspector({
  assignments,
  copyTargets,
  locked,
  offensePlayers,
  onAddStage,
  onAssignmentDefinition,
  onClose,
  onCopyAssignment,
  onDefinition,
  onDeleteAssignment,
  onMirrorAssignment,
  onRegenerate,
  onRemovePlayer,
  onRenamePlayer,
  onSetAssignmentType,
  onSelectStage,
  onTiming,
  label,
  route,
  unavailableTypes,
  unit,
}) {
  const [mobileExpanded, setMobileExpanded] = useState(false);
  /*
   * On a phone this sheet appears directly under the finger that selected the
   * player, and the tap's trailing `click` would land on whatever is now beneath
   * it -- reliably the drag handle, which expanded the sheet over the whole field
   * on every tap. Suppressing the synthetic mouse events is not enough on its own
   * (Chrome still delivers the click), so the sheet ignores input until the tap
   * that opened it has finished.
   */
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setArmed(true), 350);
    return () => window.clearTimeout(timer);
  }, []);
  if (!label) return null;
  const timingSummary = route
    ? `${route.delay > 0 ? "+" : ""}${(route.delay ?? 0).toFixed(2)}s · ${(route.pace ?? 1).toFixed(2)}×`
    : "No assignment";
  const detailLabel = route?.type === "Route"
    ? "Route definition"
    : route?.type === "Block"
      ? "Block details"
      : route?.type === "Motion"
        ? "Motion details"
        : unit === "defense" && route
          ? `${route.type} details`
          : "Assignment details";
  return (
    <aside
      className={`inspector ${mobileExpanded ? "mobile-expanded" : "mobile-peek"} ${armed ? "" : "is-arming"}`}
      aria-label="Selected player inspector"
    >
      <button
        type="button"
        className="mobile-sheet-handle"
        aria-label={mobileExpanded ? "Collapse player inspector" : "Expand player inspector"}
        aria-expanded={mobileExpanded}
        onClick={() => setMobileExpanded((value) => !value)}
      >
        <span aria-hidden="true" />
        {mobileExpanded ? <CaretDown size={17} /> : <CaretUp size={17} />}
      </button>
      {/*
        One identity row. This was two: a head reading "Offense / Route" above a
        badge row repeating "Z / Z Route", which cost ~50px of pinned height to
        say the same thing twice.
      */}
      <div className="inspector-head">
        <span className={`assignment-badge ${unit}`}>{label}</span>
        <div>
          <h2>{label}{route ? ` ${route.type}` : ""}</h2>
          <small title={route?.type === "Route" ? routeDefinitionSummary(route.definition) : undefined}>
            {titleCase(unit)}
            {" · "}
            {route?.type === "Route"
              ? `${route.definition.stemYards} yd stem · ${route.definition.breaks.length} break${route.definition.breaks.length === 1 ? "" : "s"}`
              : route?.preset ?? "Drag to reposition"}
          </small>
        </div>
        <button className="icon-control" aria-label="Close player inspector" onClick={onClose}><X size={21} /></button>
      </div>
      <AssignmentStagePicker
        activeId={route?.id ?? null}
        assignments={assignments}
        onAdd={onAddStage}
        onSelect={onSelectStage}
        unit={unit}
      />
      <div className="inspector-body">
        {route?.inheritedFrom ? (
          <div className={`concept-source ${route.templateOverride ? "override" : ""}`}>
            <GitMerge size={16} />
            <span>{route.templateOverride ? "Play-level override" : `Inherited from ${route.inheritedFrom.conceptName}`}</span>
          </div>
        ) : null}
        <PositionLabelControl label={label} onSave={onRenamePlayer} />
        <div className="control-group">
          <span>Assignment</span>
          <AssignmentTypePicker unit={unit} value={route?.type ?? ""} onChange={onSetAssignmentType} unavailable={unavailableTypes} />
        </div>
        {locked ? <div className="locked-layer-note"><LockSimple size={17} />Unlock the {unit} layer to edit assignments.</div> : null}
        {route ? (
          <details className="inspector-section">
            <summary><span>Timing</span><small>{timingSummary}</small><CaretRight size={16} /></summary>
            <div className="section-body">
              <TimingControls assignment={route} onChange={onTiming} />
            </div>
          </details>
        ) : null}
        {route ? (
          <details className="inspector-section" open>
            <summary><span>{detailLabel}</span><small>{route.preset ?? route.type}</small><CaretRight size={16} /></summary>
            <div className="section-body">
              {route.type === "Route" ? <RouteDefinitionEditor route={route} onChange={onDefinition} onRegenerate={onRegenerate} /> : null}
              {route.type === "Block" ? <BlockEditor definition={route.definition} onChange={onAssignmentDefinition} /> : null}
              {route.type === "Motion" ? <MotionEditor definition={route.definition} onChange={onAssignmentDefinition} /> : null}
              {unit === "defense" ? <DefensiveEditor assignment={route} offensePlayers={offensePlayers} onChange={onAssignmentDefinition} /> : null}
            </div>
          </details>
        ) : null}
        <details className="inspector-section inspector-actions">
          <summary><span>Player actions</span><small>Copy, mirror, or remove</small><CaretRight size={16} /></summary>
          <div className="section-body">
            {route ? <AssignmentTransfer targets={copyTargets} onCopy={onCopyAssignment} onMirror={onMirrorAssignment} /> : null}
            {route ? <button className="inspector-secondary danger-text" onClick={onDeleteAssignment}><Trash size={17} />Delete assignment</button> : (
              <p className="inspector-hint">Choose an assignment type above. The path appears immediately and can be drawn or refined with its handles.</p>
            )}
            <button className="advanced-toggle remove-player" onClick={onRemovePlayer}><Trash size={18} />Remove {unit === "defense" ? "defender" : "player"}</button>
          </div>
        </details>
      </div>
    </aside>
  );
}
