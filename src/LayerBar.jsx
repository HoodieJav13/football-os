import { SegmentedControl } from "./SegmentedControl";
import { titleCase } from "./appHelpers";
import { useDismissable } from "./useDismissable";
import {
  CaretDown,
  CaretUp,
  CircleHalfTilt,
  Eye,
  EyeSlash,
  Info,
  LockSimple,
  LockSimpleOpen,
  Stack,
} from "@phosphor-icons/react";

/** Canvas layer controls (show/dim/lock per unit) and the assignment key popover. */
const assignmentKeyEntries = [
  ["Route", "route", "Receiver release, stem and breaks"],
  ["Block", "block", "Blocking track and target"],
  ["Motion", "motion", "Pre-snap movement"],
  ["Rush", "rush", "Pass rush or blitz track"],
  ["Man", "man", "Man coverage on a receiver"],
  ["Zone", "zone", "Zone drop to a landmark"],
  ["Fit", "fit", "Run fit responsibility"],
];

function AssignmentKey({ showDepths, onShowDepths }) {
  const { open, toggle, containerRef } = useDismissable();
  return (
    <div className="assignment-key" ref={containerRef}>
      <button type="button" aria-expanded={open} aria-haspopup="true" onClick={toggle}>
        <Info size={17} />
        <strong>Key</strong>
      </button>
      {open ? (
        <div className="assignment-key-panel" role="group" aria-label="Assignment key">
          <div className="assignment-key-head">Assignment types</div>
          {assignmentKeyEntries.map(([label, type, meaning]) => (
            <div className="assignment-key-row" key={type}>
              <svg viewBox="0 0 34 10" aria-hidden="true">
                <polyline className={`route assignment-${type}`} points="1,5 33,5" />
              </svg>
              <strong>{label}</strong>
              <small>{meaning}</small>
            </div>
          ))}
          <div className="assignment-key-row is-selected-note">
            <svg viewBox="0 0 34 10" aria-hidden="true">
              <polyline className="route assignment-route selected" points="1,5 33,5" />
            </svg>
            <strong>Selected</strong>
            <small>Amber marks the selected assignment only</small>
          </div>
          <button type="button" className="assignment-key-row key-depth-toggle" aria-pressed={showDepths} onClick={() => onShowDepths(!showDepths)}>
            <svg viewBox="0 0 34 10" aria-hidden="true">
              <text className="depth-tag" x="4" y="8" fontSize="9">@12</text>
            </svg>
            <strong>Break depths</strong>
            <small>{showDepths ? "Shown on route breaks" : "Hidden"}</small>
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function LayerBar({ layers, onChange, onView, view, showDepths, onShowDepths }) {
  const { open: mobileOpen, setOpen: setMobileOpen, toggle: toggleMobile, containerRef } = useDismissable();
  const update = (name, patch) => onChange((current) => ({
    ...current,
    [name]: { ...current[name], ...patch },
  }));
  return (
    <div className={`layer-bar ${mobileOpen ? "mobile-open" : ""}`} aria-label="Canvas layers" ref={containerRef}>
      <button type="button" className="mobile-layer-toggle" aria-expanded={mobileOpen} onClick={toggleMobile}>
        <Stack size={18} />
        <strong>Layers</strong>
        <span className="layer-visibility-summary" aria-hidden="true">
          <i className={layers.offense.visible ? "on" : ""}>O</i>
          <i className={layers.defense.visible ? "on" : ""}>D</i>
          <i className={layers.assignments.visible ? "on" : ""}>A</i>
        </span>
        {mobileOpen ? <CaretUp size={18} /> : <CaretDown size={18} />}
      </button>
      <div className="layer-items">
        <div className="mobile-field-view">
          <span>Field view</span>
          <SegmentedControl value={view} onChange={(nextView) => { onView(nextView); setMobileOpen(false); }} />
        </div>
        {["offense", "defense"].map((name) => {
          const layer = layers[name];
          return (
            <div className={`layer-item ${layer.visible ? "visible" : "hidden"} ${layer.dimmed ? "dimmed" : ""}`} key={name}>
              <strong>{titleCase(name)}</strong>
              <button type="button" aria-label={`${layer.visible ? "Hide" : "Show"} ${name}`} aria-pressed={layer.visible} onClick={() => update(name, { visible: !layer.visible })}>
                {layer.visible ? <Eye size={17} /> : <EyeSlash size={17} />}
              </button>
              <button type="button" aria-label={`${layer.dimmed ? "Restore" : "Dim"} ${name}`} aria-pressed={layer.dimmed} onClick={() => update(name, { dimmed: !layer.dimmed, visible: true })}>
                <CircleHalfTilt size={17} />
              </button>
              <button type="button" aria-label={`${layer.locked ? "Unlock" : "Lock"} ${name}`} aria-pressed={layer.locked} onClick={() => update(name, { locked: !layer.locked })}>
                {layer.locked ? <LockSimple size={17} /> : <LockSimpleOpen size={17} />}
              </button>
            </div>
          );
        })}
        <div className={`layer-item assignments ${layers.assignments.visible ? "visible" : "hidden"}`}>
          <strong>Assignments</strong>
          <button type="button" aria-label={`${layers.assignments.visible ? "Hide" : "Show"} assignments`} aria-pressed={layers.assignments.visible} onClick={() => update("assignments", { visible: !layers.assignments.visible })}>
            {layers.assignments.visible ? <Eye size={17} /> : <EyeSlash size={17} />}
          </button>
        </div>
        <AssignmentKey showDepths={showDepths} onShowDepths={onShowDepths} />
      </div>
    </div>
  );
}
