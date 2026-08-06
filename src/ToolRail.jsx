import { toolItems } from "./appHelpers";
import { useDismissable } from "./useDismissable";
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  Copy,
  FloppyDisk,
  GitMerge,
  NotePencil,
  Play,
  PlusCircle,
  SlidersHorizontal,
  Stack,
  Trash,
  UserFocus,
} from "@phosphor-icons/react";

/** The left edge tool rail: tools, undo/redo, and the overflow authoring menu. */
export function ToolRail({
  activeTool,
  canAddPlayer,
  canRedo,
  canUndo,
  onDelete,
  onDetails,
  onDuplicate,
  onApplyConcept,
  onApplyFormation,
  onGameDay,
  onAddPlayer,
  onRedo,
  onSaveConcept,
  onSaveFormation,
  onTool,
  onUndo,
  temporary,
}) {
  const { open, close, toggle, containerRef } = useDismissable();
  const run = (action) => { close(); action(); };
  return (
    <nav className="tool-rail" aria-label="Drawing tools">
      {/*
        Undo and redo are the most-used actions in a drawing tool, so they are
        top-level controls with a visible enabled state rather than the first two
        items inside an eleven-item overflow menu.
      */}
      <div className="tool-history" role="group" aria-label="History">
        <button type="button" disabled={!canUndo} onClick={onUndo} aria-label="Undo" title="Undo (Ctrl+Z)">
          <ArrowCounterClockwise size={19} />
        </button>
        <button type="button" disabled={!canRedo} onClick={onRedo} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
          <ArrowClockwise size={19} />
        </button>
      </div>
      <span className="tool-rail-rule" aria-hidden="true" />
      {toolItems.map(([name, Icon], index) => (
        <div className="tool-slot" key={name} ref={name === "More" ? containerRef : undefined}>
          <button
            className={`tool-button ${activeTool === name ? "active" : ""}`}
            onClick={() => {
              if (name === "More") toggle();
              else { close(); onTool(name); }
            }}
            aria-pressed={name === "More" ? undefined : activeTool === name}
            aria-expanded={name === "More" ? open : undefined}
            aria-haspopup={name === "More" ? "menu" : undefined}
            title={name === "More" ? undefined : `${name} tool (${index + 1})`}
          >
            <span className="tool-icon"><Icon size={23} weight={activeTool === name ? "duotone" : "regular"} /></span>
            <span>{name}</span>
          </button>
          {name === "More" && open ? (
            <div className="tool-menu authoring-menu" role="menu">
              <button role="menuitem" onClick={() => run(onDuplicate)}><Copy size={19} />Duplicate as variation</button>
              <button role="menuitem" disabled={!canAddPlayer} onClick={() => run(onAddPlayer)}><PlusCircle size={19} />Add player</button>
              <button role="menuitem" onClick={() => run(onApplyFormation)}><UserFocus size={19} />Apply formation</button>
              <button role="menuitem" onClick={() => run(onSaveFormation)}><FloppyDisk size={19} />Save formation</button>
              <button role="menuitem" onClick={() => run(onApplyConcept)}><GitMerge size={19} />Apply concept</button>
              <button role="menuitem" onClick={() => run(onSaveConcept)}><Stack size={19} />Save concept</button>
              <button role="menuitem" onClick={() => run(onGameDay)}><SlidersHorizontal size={19} />{temporary ? "Resolve adjustment" : "Game Day Adjust"}</button>
              <button role="menuitem" onClick={() => run(onDetails)}><NotePencil size={19} />Play details</button>
              {/*
                Deleting a play is the one action here that undo cannot reverse,
                so it is separated and labelled as such rather than sitting in the
                same flat list as the reversible ones.
              */}
              <span className="tool-menu-rule" />
              <div className="tool-menu-note">Cannot be undone</div>
              <button role="menuitem" className="danger-action" onClick={() => run(onDelete)}><Trash size={19} />Delete play</button>
            </div>
          ) : null}
        </div>
      ))}
    </nav>
  );
}

/**
 * Decodes the canvas. Seven distinct stroke treatments were on screen with
 * nothing to explain them, so a coach handed the app in Present mode could not
 * tell a zone drop from a motion.
 *
 * The swatches reuse the canvas classes, so the key cannot drift from what the
 * field actually draws.
 */
