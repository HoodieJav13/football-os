import { useEffect, useState } from "react";
import { ArrowsLeftRight, Copy, Minus, Plus } from "@phosphor-icons/react";
import {
  blockTechniques,
  defensiveAssignmentTypes,
  offensiveAssignmentTypes,
  defensiveTechniques,
  fitResponsibilities,
  motionTypes,
  zoneAreas,
} from "./playData";

const titleCase = (value) => value
  .split("-")
  .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
  .join(" ");

/**
 * `unavailable` maps a type to the reason it cannot be used for this player, so
 * the option is visibly disabled with an explanation rather than accepting the
 * click and answering with a transient rejection message.
 */
export function AssignmentTypePicker({ unit, value, onChange, unavailable = {} }) {
  const options = unit === "defense" ? defensiveAssignmentTypes : offensiveAssignmentTypes;
  return (
    <div className="assignment-type-picker" role="group" aria-label={`${unit} assignment type`}>
      {options.map((option) => {
        const reason = unavailable[option];
        return (
          <button
            key={option}
            type="button"
            className={value === option ? "active" : ""}
            aria-pressed={value === option}
            disabled={Boolean(reason)}
            title={reason}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

export function AssignmentStagePicker({
  activeId,
  assignments,
  onAdd,
  onSelect,
  unit,
}) {
  const stages = unit === "defense"
    ? [["post", "At snap"]]
    : [["pre", "Pre-snap"], ["post", "At snap"]];
  return (
    <div className="assignment-stage-picker" role="group" aria-label="Assignment stages">
      {stages.map(([phase, label]) => {
        // `phase` is guaranteed by normalization, so no fallback is needed here.
        const assignment = assignments.find((item) => item.phase === phase);
        return (
          <button
            key={phase}
            type="button"
            className={assignment?.id === activeId ? "active" : ""}
            aria-pressed={assignment?.id === activeId}
            onClick={() => assignment ? onSelect(assignment.id) : onAdd(phase)}
          >
            <span>{label}</span>
            <strong>{assignment?.type ?? <><Plus size={14} />Add</>}</strong>
          </button>
        );
      })}
    </div>
  );
}

export function TimingControls({ assignment, onChange }) {
  const minimumDelay = assignment.type === "Motion" ? -2 : 0;
  const delay = Number.isFinite(assignment.delay) ? assignment.delay : assignment.type === "Motion" ? -1.5 : 0;
  const pace = Number.isFinite(assignment.pace) ? assignment.pace : 1;
  const updateDelay = (next) => onChange({
    delay: Math.max(minimumDelay, Math.min(3, Number(next.toFixed(2)))),
    phase: assignment.type === "Motion" && next < 0 ? "pre" : "post",
  });
  const updatePace = (next) => onChange({ pace: Math.max(0.5, Math.min(1.75, Number(next.toFixed(2)))) });

  return (
    <div className="assignment-timing">
      <div className="timing-heading">
        <span>Assignment timing</span>
        <small>{delay < 0 ? `${Math.abs(delay).toFixed(2)}s before snap` : delay === 0 ? "At snap" : `${delay.toFixed(2)}s after snap`}</small>
      </div>
      <div className="timing-row">
        <span>Start</span>
        <button type="button" aria-label="Start assignment earlier" onClick={() => updateDelay(delay - 0.25)}><Minus size={16} /></button>
        <strong>{delay > 0 ? "+" : ""}{delay.toFixed(2)}s</strong>
        <button type="button" aria-label="Start assignment later" onClick={() => updateDelay(delay + 0.25)}><Plus size={16} /></button>
      </div>
      <div className="timing-row">
        <span>Pace</span>
        <button type="button" aria-label="Reduce pace" onClick={() => updatePace(pace - 0.25)}><Minus size={16} /></button>
        <strong>{pace.toFixed(2)}×</strong>
        <button type="button" aria-label="Increase pace" onClick={() => updatePace(pace + 0.25)}><Plus size={16} /></button>
      </div>
    </div>
  );
}

export function BlockEditor({ definition, onChange }) {
  return (
    <div className="football-definition">
      <div className="definition-grid">
        <label>Technique
          <select value={definition.technique} onChange={(event) => onChange({ ...definition, technique: event.target.value })}>
            {blockTechniques.map((technique) => <option key={technique} value={technique}>{titleCase(technique)}</option>)}
          </select>
        </label>
        <label>Track
          <select value={definition.direction} onChange={(event) => onChange({ ...definition, direction: event.target.value })}>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        </label>
      </div>
      <label className="definition-text-field">Target / responsibility
        <input value={definition.target} onChange={(event) => onChange({ ...definition, target: event.target.value })} placeholder="e.g. 3-tech, Mike, B gap" />
      </label>
      <label className="definition-check">
        <input type="checkbox" checked={definition.climb} onChange={(event) => onChange({ ...definition, climb: event.target.checked })} />
        Climb to the second level
      </label>
    </div>
  );
}

export function MotionEditor({ definition, onChange }) {
  return (
    <div className="football-definition">
      <div className="definition-grid">
        <label>Motion
          <select value={definition.motionType} onChange={(event) => onChange({ ...definition, motionType: event.target.value })}>
            {motionTypes.map((motionType) => <option key={motionType} value={motionType}>{titleCase(motionType)}</option>)}
          </select>
        </label>
        <label>Direction
          <select value={definition.direction} onChange={(event) => onChange({ ...definition, direction: event.target.value })}>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        </label>
      </div>
      <label className="definition-text-field">Distance
        <span className="number-input"><input type="number" min="2" max="40" step="1" value={definition.distanceYards} onChange={(event) => onChange({ ...definition, distanceYards: event.target.value })} /><b>yds</b></span>
      </label>
    </div>
  );
}

export function DefensiveEditor({ assignment, offensePlayers, onChange }) {
  const { definition, type } = assignment;
  if (type === "Man") {
    return (
      <div className="football-definition">
        <div className="definition-grid">
          <label>Match
            {/* Coverage tracks a player id, so it survives that receiver being relabelled. */}
            <select value={definition.targetId} onChange={(event) => onChange({ ...definition, targetId: event.target.value })}>
              {definition.targetId ? null : <option value="">Choose a receiver</option>}
              {offensePlayers.map((player) => <option key={player.id} value={player.id}>{player.label}</option>)}
            </select>
          </label>
          <label>Leverage
            <select value={definition.leverage} onChange={(event) => onChange({ ...definition, leverage: event.target.value })}>
              <option value="inside">Inside</option>
              <option value="outside">Outside</option>
              <option value="head-up">Head up</option>
            </select>
          </label>
        </div>
      </div>
    );
  }
  if (type === "Zone") {
    return (
      <div className="football-definition">
        <label className="definition-text-field">Zone area
          <select value={definition.area} onChange={(event) => onChange({ ...definition, area: event.target.value })}>
            {zoneAreas.map((area) => <option key={area} value={area}>{titleCase(area)}</option>)}
          </select>
        </label>
        <label className="definition-text-field">Landmark / rule
          <input value={definition.landmark} onChange={(event) => onChange({ ...definition, landmark: event.target.value })} placeholder="e.g. midpoint #2 and #3" />
        </label>
      </div>
    );
  }
  if (type === "Fit") {
    return (
      <div className="football-definition">
        <div className="definition-grid">
          <label>Responsibility
            <select value={definition.responsibility} onChange={(event) => onChange({ ...definition, responsibility: event.target.value })}>
              {fitResponsibilities.map((responsibility) => <option key={responsibility} value={responsibility}>{responsibility}</option>)}
            </select>
          </label>
          <label>Technique
            <select value={definition.technique} onChange={(event) => onChange({ ...definition, technique: event.target.value })}>
              <option value="spill">Spill</option>
              <option value="box">Box</option>
              <option value="lever">Lever</option>
            </select>
          </label>
        </div>
      </div>
    );
  }
  return (
    <div className="football-definition">
      <div className="definition-grid">
        <label>Rush
          <select value={definition.technique} onChange={(event) => onChange({ ...definition, technique: event.target.value })}>
            {defensiveTechniques.map((technique) => <option key={technique} value={technique}>{titleCase(technique)}</option>)}
          </select>
        </label>
        <label>Gap
          <select value={definition.gap} onChange={(event) => onChange({ ...definition, gap: event.target.value })}>
            {["A", "B", "C", "D"].map((gap) => <option key={gap} value={gap}>{gap}</option>)}
          </select>
        </label>
      </div>
      <label className="definition-text-field">Track
        <select value={definition.direction} onChange={(event) => onChange({ ...definition, direction: event.target.value })}>
          <option value="left">Left</option>
          <option value="right">Right</option>
        </select>
      </label>
    </div>
  );
}

export function AssignmentTransfer({ targets, onCopy, onMirror }) {
  const [targetId, setTargetId] = useState(targets[0]?.id ?? "");

  useEffect(() => {
    if (!targets.some((target) => target.id === targetId)) setTargetId(targets[0]?.id ?? "");
  }, [targetId, targets]);

  return (
    <div className="assignment-transfer">
      <button type="button" onClick={onMirror}><ArrowsLeftRight size={17} />Mirror path</button>
      <div>
        <select aria-label="Copy assignment to player" value={targetId} disabled={!targets.length} onChange={(event) => setTargetId(event.target.value)}>
          {targets.length ? targets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>) : <option>No open players</option>}
        </select>
        <button type="button" aria-label="Copy assignment" disabled={!targetId} onClick={() => onCopy(targetId)}><Copy size={17} /></button>
      </div>
    </div>
  );
}
