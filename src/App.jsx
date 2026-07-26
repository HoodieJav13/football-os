import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowsOut,
  BookOpen,
  Books,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  CheckCircle,
  CloudCheck,
  CircleHalfTilt,
  Copy,
  CornersOut,
  CursorClick,
  DownloadSimple,
  DotsThree,
  Eye,
  EyeSlash,
  FloppyDisk,
  GitMerge,
  Info,
  LockSimple,
  LockSimpleOpen,
  MagnifyingGlass,
  Minus,
  NotePencil,
  Pause,
  Play,
  Plus,
  PlusCircle,
  Presentation,
  ShareNetwork,
  ShieldCheck,
  SlidersHorizontal,
  Stack,
  Star,
  Trash,
  UserFocus,
  Warning,
  WifiHigh,
  WifiSlash,
  X,
} from "@phosphor-icons/react";
import {
  AssignmentTransfer,
  AssignmentStagePicker,
  AssignmentTypePicker,
  BlockEditor,
  DefensiveEditor,
  MotionEditor,
  TimingControls,
} from "./AssignmentEditors";
import {
  ApplyConceptDialog,
  DataToolsDialog,
  PrintCollectionPreview,
  SaveConceptDialog,
} from "./WorkspaceDialogs";
import { Modal } from "./Modal";
import { PlayCanvas } from "./PlayCanvas";
import { fieldProjection, pointerToField, polylinePoints } from "./fieldView";
import { FIELD } from "./playData";
import { useDismissable } from "./useDismissable";
import {
  applyConceptTemplateToPlay,
  applyFormationToPlay,
  assignmentDefinitionToPoints,
  assignmentPhaseForType,
  assignmentStartSeconds,
  basePlayers,
  breakDirections,
  clampFieldX,
  clampFieldY,
  clampPoint,
  clonePlaybook,
  createConceptTemplate,
  createPlayFromFormation,
  defaultFormations,
  defensiveAssignmentTypes,
  findPlayer,
  formationStatus,
  inferRouteDefinition,
  isLineLabel,
  MAIN_PLAYBOOK_ID,
  manCoveragePoints,
  normalizePlay,
  offensiveAssignmentTypes,
  playDuration,
  playerLabel,
  playerLocation,
  releaseOptions,
  routeDefinitionSummary,
  routeDefinitionToPoints,
  sanitizeAssignmentDefinition,
  sanitizeBlockDefinition,
  sanitizeDefensiveDefinition,
  sanitizeMotionDefinition,
  sanitizeRouteDefinition,
} from "./playData";
import {
  downloadPlayPng,
  downloadWorkspaceBackup,
} from "./exportUtils";
import {
  refreshOfflineCopy,
  subscribeOfflineStatus,
} from "./offline";
import {
  createDefaultWorkspace,
  LEGACY_WORKSPACE_KEYS,
  normalizeWorkspace,
  parseWorkspaceBackup,
  RECOVERY_WORKSPACE_KEY,
  validPlays,
  WORKSPACE_KEY,
  WORKSPACE_VERSION,
} from "./workspaceData";

const LEGACY_LIBRARY_KEY = "football-os.library.v4";
const GAME_DAY_KEY = "football-os.game-day.v6";
const LEGACY_GAME_DAY_KEYS = ["football-os.game-day.v5", "football-os.game-day.v4"];
const compactViewport = () => typeof window !== "undefined" && window.matchMedia("(max-width: 700px)").matches;

const toolItems = [
  ["Select", CursorClick],
  ["Route", ShareNetwork],
  ["Block", ArrowClockwise],
  ["Motion", ArrowsOut],
  ["Defense", ShieldCheck],
  ["More", DotsThree],
];

function readWorkspace() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(WORKSPACE_KEY))
      ?? LEGACY_WORKSPACE_KEYS
        .map((key) => JSON.parse(window.localStorage.getItem(key)))
        .find(Boolean);
    const normalized = normalizeWorkspace(saved);
    if (normalized) return normalized;

    const legacy = JSON.parse(window.localStorage.getItem(LEGACY_LIBRARY_KEY));
    return createDefaultWorkspace(validPlays(legacy) ? legacy : undefined);
  } catch {
    return createDefaultWorkspace();
  }
}

function readGameDay() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(GAME_DAY_KEY))
      ?? LEGACY_GAME_DAY_KEYS
        .map((key) => JSON.parse(window.localStorage.getItem(key)))
        .find(Boolean);
    return saved?.playId && saved?.snapshot
      ? { ...saved, playbookId: saved.playbookId ?? MAIN_PLAYBOOK_ID, snapshot: normalizePlay(saved.snapshot) }
      : null;
  } catch {
    return null;
  }
}

/** The flanker is the most useful default selection; fall back to any assignment. */
function defaultAssignmentId(play) {
  const flanker = play.players.find((player) => player.label === "Z");
  const flankerAssignment = flanker
    ? play.assignments.find((item) => item.unit === "offense" && item.playerId === flanker.id)
    : null;
  return flankerAssignment?.id
    ?? play.assignments.find((item) => item.unit === "offense")?.id
    ?? play.assignments[0]?.id
    ?? null;
}

function assignmentFor(play, unit, playerId, phase) {
  return play.assignments.find((item) => (
    item.unit === unit && item.playerId === playerId && (!phase || item.phase === phase)
  )) ?? null;
}

/** A player's post-snap assignment is the one a coach means by default. */
function preferredAssignment(play, unit, playerId) {
  return assignmentFor(play, unit, playerId, "post") ?? assignmentFor(play, unit, playerId, "pre");
}

function playerExists(play, unit, playerId) {
  return Boolean(findPlayer(play, unit, playerId));
}

function isLinePlayer(play, unit, playerId) {
  return unit === "offense" && isLineLabel(playerLabel(play, unit, playerId));
}

function createAssignment({ play, playerId, start, type, unit }) {
  const towardField = start[0] < 0 ? "right" : "left";
  let definition;
  if (type === "Route") {
    definition = sanitizeRouteDefinition({ release: "none", stemYards: 10, breaks: [], condition: "" });
  } else if (type === "Block") {
    definition = sanitizeBlockDefinition({ technique: "drive", direction: towardField, target: "", climb: false });
  } else if (type === "Motion") {
    definition = sanitizeMotionDefinition({ motionType: "jet", direction: towardField, distanceYards: 18 });
  } else if (type === "Man") {
    // Default to covering the nearest uncovered receiver rather than nothing.
    const covered = new Set(play.assignments
      .filter((item) => item.type === "Man")
      .map((item) => item.definition?.targetId));
    const candidates = play.players
      .filter((player) => !isLineLabel(player.label) && player.label !== "Q" && !covered.has(player.id))
      .sort((a, b) => Math.abs(a.x - start[0]) - Math.abs(b.x - start[0]));
    definition = sanitizeDefensiveDefinition(type, { targetId: candidates[0]?.id ?? "", leverage: "inside" });
  } else {
    definition = sanitizeDefensiveDefinition(type, {});
  }

  const points = type === "Man"
    ? manCoveragePoints(play, start, definition)
    : assignmentDefinitionToPoints(start, type, definition);

  return {
    id: `${play.id}-${unit}-${playerId.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${assignmentPhaseForType(type)}-${Date.now()}`,
    playerId,
    unit,
    type,
    preset: type === "Route"
      ? "Structured"
      : titleCase(definition.technique ?? definition.motionType ?? definition.area ?? definition.responsibility ?? type),
    pace: 1,
    delay: type === "Motion" ? -1.5 : 0,
    phase: assignmentPhaseForType(type),
    points,
    definition,
    ...(type === "Route" ? {
      geometryMode: "structured",
      evidence: {
        method: "coach-authored",
        confidence: "high",
        sourceLabel: null,
        sourcePage: null,
        note: "",
        coachEdited: true,
      },
    } : {}),
  };
}

function uniqueName(library, baseName) {
  const names = new Set(library.map((play) => play.name));
  if (!names.has(baseName)) return baseName;
  let index = 2;
  while (names.has(`${baseName} ${index}`)) index += 1;
  return `${baseName} ${index}`;
}

function SegmentedControl({ value, onChange }) {
  return (
    <div className="segmented" role="group" aria-label="Field view">
      <button className={value === "end" ? "active" : ""} aria-pressed={value === "end"} onClick={() => onChange("end")}><CornersOut size={18} />End Zone</button>
      <button className={value === "side" ? "active" : ""} aria-pressed={value === "side"} onClick={() => onChange("side")}><ArrowsOut size={18} />Sideline</button>
    </div>
  );
}

function PlaybookSwitcher({ activePlaybook, mainPlaybook, onCopy, onCreate, onDataTools, onSwitch, play, playbooks }) {
  const { open, setOpen, toggle, containerRef } = useDismissable();
  const canCopy = activePlaybook.id !== mainPlaybook.id;
  return (
    <div className="playbook-switcher" ref={containerRef}>
      <button
        className="playbook-trigger"
        aria-label={`Playbook ${activePlaybook.name}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={toggle}
      >
        <span className="playbook-icon"><Books size={21} weight="duotone" /></span>
        <span className="playbook-trigger-copy">
          <small>Playbook</small>
          <strong>{activePlaybook.name}</strong>
        </span>
        <CaretDown size={16} />
      </button>
      {open ? (
        <div className="playbook-menu" role="menu">
          <div className="playbook-menu-head">
            <span>Switch playbook</span>
            <small>{playbooks.length} saved</small>
          </div>
          {playbooks.map((book) => (
            <button
              key={book.id}
              className={book.id === activePlaybook.id ? "active" : ""}
              onClick={() => { onSwitch(book.id); setOpen(false); }}
              role="menuitem"
            >
              <span className="book-mark"><BookOpen size={20} weight={book.id === activePlaybook.id ? "fill" : "regular"} /></span>
              <span><strong>{book.name}</strong><small>{book.description ?? `${book.plays.length} plays`}</small></span>
              {book.isMain ? <span className="main-book-badge"><Star size={13} weight="fill" />Main</span> : null}
            </button>
          ))}
          <div className="playbook-menu-actions">
            {canCopy ? (
              <button onClick={() => { onCopy(); setOpen(false); }}>
                <Copy size={19} /><span><strong>Add this play to {mainPlaybook.name}</strong><small>Creates an independent copy</small></span>
              </button>
            ) : null}
            <button onClick={() => { onCreate(); setOpen(false); }}>
              <PlusCircle size={19} /><span><strong>New playbook</strong><small>Start a separate collection</small></span>
            </button>
            <button onClick={() => { onDataTools(); setOpen(false); }}>
              <DownloadSimple size={19} /><span><strong>Backup and export</strong><small>Offline copy, restore, PNG, and PDF</small></span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Header({
  activePlaybook,
  formationLegal,
  mainPlaybook,
  onCopy,
  onCreate,
  onDataTools,
  offlineStatus,
  onSwitch,
  play,
  playbooks,
  present,
  playback,
  onPresent,
  onRun,
  view,
  onView,
  temporary,
}) {
  const running = playback === "running";
  const runLabel = running ? "Pause" : playback === "paused" ? "Resume" : "Run";
  return (
    <header className="topbar">
      <div className="play-heading">
        <PlaybookSwitcher
          activePlaybook={activePlaybook}
          mainPlaybook={mainPlaybook}
          onCopy={onCopy}
          onCreate={onCreate}
          onDataTools={onDataTools}
          onSwitch={onSwitch}
          play={play}
          playbooks={playbooks}
        />
        <span className="heading-rule" aria-hidden="true" />
        <div>
          <span className="family-label">{play.family} Family</span>
          <div className="title-line">
            <h1>{play.name}</h1>
            {temporary ? <span className="temporary-chip">Temporary</span> : <NotePencil size={18} aria-hidden="true" />}
          </div>
          <div className="play-meta"><span>{play.personnel}</span><span>{play.formation}</span></div>
        </div>
      </div>
      <div className="top-actions">
        <span className={`offline-state ${formationLegal ? "" : "draft-state"}`}>
          {!formationLegal ? <Warning size={18} /> : offlineStatus.ready ? <WifiHigh size={18} /> : offlineStatus.online ? <CloudCheck size={18} /> : <WifiSlash size={18} />}
          {!formationLegal
            ? "Draft · fix formation"
            : offlineStatus.ready
              ? offlineStatus.online ? "Offline ready" : "Offline · ready"
              : offlineStatus.development ? "Local workspace" : "Preparing offline"}
        </span>
        <SegmentedControl value={view} onChange={onView} />
        <button className="header-button" onClick={onPresent}><Presentation size={20} weight="duotone" />{present ? "Edit" : "Present"}</button>
        <button className={`run-button ${running ? "is-running" : ""}`} onClick={onRun}>
          {running ? <Pause size={21} weight="fill" /> : <Play size={21} weight="fill" />}
          {runLabel}
          <CaretDown size={16} />
        </button>
      </div>
    </header>
  );
}

/**
 * The thumbnail uses the same yard-true projection as the canvas, at a box shaped
 * to fit the whole fixed window, so a thumbnail is a faithful miniature of the
 * play rather than a differently-distorted sketch.
 */
const MINI_BOX = { width: 96, height: 74 };
const miniProjection = fieldProjection({ ...MINI_BOX, view: "end" });

function MiniDiagram({ play }) {
  return (
    <svg
      className="mini-diagram"
      viewBox={miniProjection.viewBox}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <line
        className="mini-line-of-scrimmage"
        x1={-FIELD.halfWidthYards}
        y1="0"
        x2={FIELD.halfWidthYards}
        y2="0"
      />
      {play.assignments.map((item) => (
        <polyline
          key={item.id}
          points={polylinePoints(item.points, miniProjection)}
          className={`mini-route mini-${item.type.toLowerCase()} mini-${item.unit}`}
        />
      ))}
      {play.players.map((player) => {
        const [cx, cy] = miniProjection.project([player.x, player.y]);
        return <circle key={player.id} cx={cx} cy={cy} r={miniProjection.pixels(3.25)} />;
      })}
    </svg>
  );
}

function Filmstrip({
  activeId,
  family,
  folder,
  folders,
  fullCount,
  library,
  onChange,
  onCreate,
  onFolder,
  onQuery,
  query,
}) {
  const scrollRef = useRef(null);
  const [scrollState, setScrollState] = useState({ previous: false, next: false });
  const { open: mobileOpen, setOpen: setMobileOpen, toggle: toggleMobile, containerRef } = useDismissable();
  const activePlay = library.find((play) => play.id === activeId);

  const measure = () => {
    const element = scrollRef.current;
    if (!element) return;
    setScrollState({
      previous: element.scrollLeft > 4,
      next: element.scrollLeft + element.clientWidth < element.scrollWidth - 4,
    });
  };

  useEffect(() => {
    measure();
    const element = scrollRef.current;
    const observer = new ResizeObserver(measure);
    if (element) observer.observe(element);
    return () => observer.disconnect();
  }, [library.length]);

  useEffect(() => {
    const element = scrollRef.current?.querySelector(`[data-play-id="${activeId}"]`);
    element?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [activeId]);

  const nudge = (direction) => scrollRef.current?.scrollBy({ left: direction * 240, behavior: "smooth" });

  return (
    <section className={`filmstrip ${mobileOpen ? "mobile-open" : ""}`} aria-label={`${family} playbook plays`} ref={containerRef}>
      <button
        type="button"
        className="mobile-browser-toggle"
        aria-expanded={mobileOpen}
        onClick={toggleMobile}
      >
        <span><small>Browse</small><strong>{activePlay?.name ?? "No matching play"}</strong></span>
        <span className="mobile-browser-count">{library.length}/{fullCount}</span>
        {mobileOpen ? <CaretUp size={18} /> : <CaretDown size={18} />}
      </button>
      <div className="play-browser-controls">
        <label>
          <MagnifyingGlass size={16} />
          <input aria-label="Search plays" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Find a play" />
        </label>
        <select aria-label="Play folder" value={folder} onChange={(event) => onFolder(event.target.value)}>
          <option value="all">All folders</option>
          {folders.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <small>{library.length} of {fullCount} plays</small>
      </div>
      {scrollState.previous ? <button className="strip-arrow previous" aria-label="Previous plays" onClick={() => nudge(-1)}><CaretLeft size={22} /></button> : null}
      <div className="filmstrip-scroll" ref={scrollRef} onScroll={measure}>
        {library.map((play, index) => (
          <button
            key={play.id}
            data-play-id={play.id}
            className={`film-card ${play.id === activeId ? "active" : ""}`}
            onClick={() => { setMobileOpen(false); onChange(play.id); }}
            aria-label={`Open ${play.name}`}
            aria-current={play.id === activeId ? "true" : undefined}
          >
            <span className="film-index">{index + 1}</span>
            <MiniDiagram play={play} />
            <strong>{play.name}</strong>
          </button>
        ))}
        {!library.length ? (
          <div className="filmstrip-empty">
            <MagnifyingGlass size={23} />
            <strong>No matching plays</strong>
            <span>Clear the search or choose another folder.</span>
          </div>
        ) : null}
        <button className="film-card create-card" onClick={onCreate} aria-label="Create a new play">
          <span className="film-index">New</span>
          <span className="create-play-icon"><Plus size={24} /></span>
          <strong>Create play</strong>
        </button>
      </div>
      {scrollState.next ? <button className="strip-arrow next" aria-label="Next plays" onClick={() => nudge(1)}><CaretRight size={22} /></button> : null}
    </section>
  );
}

function ToolRail({
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
const assignmentKeyEntries = [
  ["Route", "route", "Receiver release, stem and breaks"],
  ["Block", "block", "Blocking track and target"],
  ["Motion", "motion", "Pre-snap movement"],
  ["Rush", "rush", "Pass rush or blitz track"],
  ["Man", "man", "Man coverage on a receiver"],
  ["Zone", "zone", "Zone drop to a landmark"],
  ["Fit", "fit", "Run fit responsibility"],
];

function AssignmentKey() {
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
        </div>
      ) : null}
    </div>
  );
}

function LayerBar({ layers, onChange, onView, view }) {
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
        <AssignmentKey />
      </div>
    </div>
  );
}

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

const titleCase = (value) => value ? `${value[0].toUpperCase()}${value.slice(1)}` : "";

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

function Inspector({
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
    <aside className={`inspector ${mobileExpanded ? "mobile-expanded" : "mobile-peek"}`} aria-label="Selected player inspector">
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
      <div className="inspector-head"><div><small>{titleCase(unit)}</small><h2>{route ? route.type : "Player"}</h2></div><button className="icon-control" aria-label="Close player inspector" onClick={onClose}><X size={21} /></button></div>
      <div className="selected-assignment">
        <span className={`assignment-badge ${unit}`}>{label}</span>
        <div><strong>{label}{route ? ` ${route.type}` : " selected"}</strong><span title={route?.type === "Route" ? routeDefinitionSummary(route.definition) : undefined}><i aria-hidden="true" />{route?.type === "Route" ? `${route.definition.stemYards} yd stem · ${route.definition.breaks.length} break${route.definition.breaks.length === 1 ? "" : "s"}` : route?.preset ?? "Drag to reposition"}</span></div>
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
            <TimingControls assignment={route} onChange={onTiming} />
          </details>
        ) : null}
        {route ? (
          <details className="inspector-section" open>
            <summary><span>{detailLabel}</span><small>{route.preset ?? route.type}</small><CaretRight size={16} /></summary>
            {route.type === "Route" ? <RouteDefinitionEditor route={route} onChange={onDefinition} onRegenerate={onRegenerate} /> : null}
            {route.type === "Block" ? <BlockEditor definition={route.definition} onChange={onAssignmentDefinition} /> : null}
            {route.type === "Motion" ? <MotionEditor definition={route.definition} onChange={onAssignmentDefinition} /> : null}
            {unit === "defense" ? <DefensiveEditor assignment={route} offensePlayers={offensePlayers} onChange={onAssignmentDefinition} /> : null}
          </details>
        ) : null}
        <details className="inspector-section inspector-actions">
          <summary><span>Player actions</span><small>Copy, mirror, or remove</small><CaretRight size={16} /></summary>
          {route ? <AssignmentTransfer targets={copyTargets} onCopy={onCopyAssignment} onMirror={onMirrorAssignment} /> : null}
          {route ? <button className="inspector-secondary danger-text" onClick={onDeleteAssignment}><Trash size={17} />Delete assignment</button> : (
            <p className="inspector-hint">Choose an assignment type above. The path appears immediately and can be drawn or refined with its handles.</p>
          )}
          <button className="advanced-toggle remove-player" onClick={onRemovePlayer}><Trash size={18} />Remove {unit === "defense" ? "defender" : "player"}</button>
        </details>
      </div>
    </aside>
  );
}

function Timeline({ assignment, playback, onRun, onRestart, speed, onSpeed }) {
  const speeds = [0.5, 1, 1.5];
  const cycleSpeed = () => onSpeed(speeds[(speeds.indexOf(speed) + 1) % speeds.length]);
  const selectedStart = assignment ? assignmentStartSeconds(assignment) : null;
  return (
    <footer className="timeline">
      <button className="timeline-play" aria-label={playback === "running" ? "Pause animation" : playback === "paused" ? "Resume animation" : "Play animation"} onClick={onRun}>
        {playback === "running" ? <Pause size={22} weight="fill" /> : <Play size={22} weight="fill" />}
      </button>
      <button className="speed-control" aria-label={`Playback speed ${speed.toFixed(2)}x`} onClick={cycleSpeed}>{speed.toFixed(2)}x<CaretDown size={15} /></button>
      <div className="timeline-track" aria-label="Play timing">
        <div className="phase-labels"><span>Pre-snap</span><strong>Snap</strong><span>Assignments{selectedStart === null ? "" : ` · selected ${selectedStart.toFixed(2)}s`}</span></div>
        <div className="phase-bars"><span className="motion-phase" /><i className="snap-marker" /><span className="route-phase" /><b className={playback} />{selectedStart !== null ? <em className="selected-timing-marker" style={{ "--timing-position": `${Math.min(96, Math.max(4, (selectedStart / 7.5) * 100))}%` }} /> : null}</div>
        <div className="time-labels"><span>−2.0</span><span>−1.0</span><span>0</span><span>1.0</span><span>2.0</span><span>3.0</span></div>
      </div>
      <button className="timeline-settings" aria-label="Restart animation" onClick={onRestart}><ArrowClockwise size={21} /></button>
    </footer>
  );
}

function GameDayDialog({ active, play, onClose, onStart, onResolve }) {
  return (
    <Modal label="Game day adjustment" className="adjustment-modal" onClose={onClose}>
      <div className="adjustment-icon"><SlidersHorizontal size={25} /></div>
      <span className="modal-label">Temporary variation</span>
      <h2>{active ? "Resolve Game Day Adjustment" : "Game Day Adjustment"}</h2>
      <p>{active ? `Choose what to do with the temporary changes to ${play.name}.` : `Start a temporary variation of ${play.name}. The original stays protected until you decide what to keep.`}</p>
      {active ? (
        <div className="resolution-grid">
          {[
            ["discard", "Discard"],
            ["replace", "Replace Original"],
            ["variation", "Save as Variation"],
            ["new", "Save as New Play"],
          ].map(([value, label]) => <button key={value} data-resolution={value} onClick={() => onResolve(value)}>{label}</button>)}
        </div>
      ) : <button className="modal-primary" onClick={onStart}>Start adjusting</button>}
      <button className="modal-close" onClick={onClose}><X size={18} />Close</button>
    </Modal>
  );
}

function PlayDetailsDialog({ play, onClose, onSave }) {
  const [name, setName] = useState(play.name);
  const [family, setFamily] = useState(play.family ?? "");
  const [folder, setFolder] = useState(play.folder ?? "Offense");
  const [personnel, setPersonnel] = useState(play.personnel ?? "");
  const [protection, setProtection] = useState(play.protection ?? "");
  const [blockingScheme, setBlockingScheme] = useState(play.blockingScheme ?? "");
  const status = formationStatus(play.players ?? basePlayers);
  const canSave = name.trim().length > 0 && status.legal;
  return (
    <Modal label="Play details" className="adjustment-modal details-modal" onClose={onClose} as="form" onSubmit={(event) => {
      event.preventDefault();
      if (canSave) onSave({
        name: name.trim(),
        family: family.trim() || "Unsorted",
        folder: folder.trim() || "Unfiled",
        personnel: personnel.trim() || play.personnel,
        protection: protection.trim(),
        blockingScheme: blockingScheme.trim(),
      });
      }}>
      <span className="modal-label">Play details</span>
      <h2>Keep the call clear</h2>
      {play.sourcePage ? <p className="source-reference">{play.sourceLabel} · PDF page {play.sourcePage}</p> : null}
      <label className="details-field">Play name<input value={name} onChange={(event) => setName(event.target.value)} aria-invalid={!name.trim()} required autoFocus /></label>
      <div className="details-grid">
        <label className="details-field">Folder<input value={folder} onChange={(event) => setFolder(event.target.value)} placeholder="Offense" /></label>
        <label className="details-field">Play family<input value={family} onChange={(event) => setFamily(event.target.value)} placeholder="Mesh" /></label>
        <label className="details-field">Personnel<input value={personnel} onChange={(event) => setPersonnel(event.target.value)} placeholder="11 Personnel" /></label>
        <label className="details-field">Protection<input value={protection} onChange={(event) => setProtection(event.target.value)} placeholder="Texas" /></label>
        <label className="details-field">Blocking scheme<input value={blockingScheme} onChange={(event) => setBlockingScheme(event.target.value)} placeholder="Inside zone" /></label>
      </div>
      <div className={`formation-check ${status.legal ? "legal" : "illegal"}`}>
        <CheckCircle size={22} weight="fill" />
        <div><strong>{status.legal ? "Legal formation" : "Formation needs attention"}</strong><span>{status.onLine} on the line · {status.inBackfield} in the backfield · {status.playerCount} players</span></div>
      </div>
      {!name.trim() ? <p className="form-error">A play name is required.</p> : null}
      <button className="modal-primary" type="submit" disabled={!canSave}>Save details</button>
      <button className="modal-close" type="button" onClick={onClose}><X size={18} />Cancel</button>
    </Modal>
  );
}

function CreatePlayDialog({ currentPlay, formations, onClose, onCreate }) {
  const [name, setName] = useState("");
  const [mode, setMode] = useState("formation");
  const [formationId, setFormationId] = useState(formations[0]?.id ?? "");
  const formation = formations.find((item) => item.id === formationId) ?? formations[0];
  const candidatePlayers = mode === "duplicate"
    ? currentPlay.players
    : mode === "blank"
      ? defaultFormations[0].players
      : formation?.players;
  const status = formationStatus(candidatePlayers ?? []);
  const canCreate = name.trim().length > 0 && status.legal;

  return (
    <Modal label="Create a play" className="adjustment-modal details-modal create-play-modal" onClose={onClose} as="form" onSubmit={(event) => {
      event.preventDefault();
      if (canCreate) onCreate({ formationId, mode, name: name.trim() });
      }}>
      <div className="adjustment-icon"><PlusCircle size={25} /></div>
      <span className="modal-label">New play</span>
      <h2>Choose a starting point</h2>
      <label className="details-field">Play name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Trips Right Texas" required autoFocus /></label>
      <div className="creation-modes" role="group" aria-label="Play starting point">
        <button type="button" className={mode === "formation" ? "active" : ""} aria-pressed={mode === "formation"} onClick={() => setMode("formation")}><UserFocus size={19} /><span><strong>Formation</strong><small>Use a saved alignment</small></span></button>
        <button type="button" className={mode === "blank" ? "active" : ""} aria-pressed={mode === "blank"} onClick={() => setMode("blank")}><Plus size={19} /><span><strong>Blank play</strong><small>Start from your base 11</small></span></button>
        <button type="button" className={mode === "duplicate" ? "active" : ""} aria-pressed={mode === "duplicate"} onClick={() => setMode("duplicate")}><Copy size={19} /><span><strong>Duplicate</strong><small>Copy {currentPlay.name}</small></span></button>
      </div>
      {mode === "formation" ? (
        <label className="details-field">Saved formation
          <select aria-label="Saved formation" value={formationId} onChange={(event) => setFormationId(event.target.value)}>
            {formations.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.personnel}</option>)}
          </select>
        </label>
      ) : null}
      <div className={`formation-check ${status.legal ? "legal" : "illegal"}`}>
        {status.legal ? <CheckCircle size={22} weight="fill" /> : <Warning size={22} weight="fill" />}
        <div><strong>{status.legal ? "Legal starting formation" : "Formation needs attention"}</strong><span>{status.onLine} on the line · {status.inBackfield} in the backfield · {status.playerCount} players</span></div>
      </div>
      <button className="modal-primary" type="submit" disabled={!canCreate}>Create play</button>
      <button className="modal-close" type="button" onClick={onClose}><X size={18} />Cancel</button>
    </Modal>
  );
}

function SaveFormationDialog({ play, onClose, onSave }) {
  const [name, setName] = useState(play.formation || "");
  const status = formationStatus(play.players);
  const canSave = name.trim().length > 0 && status.legal;
  return (
    <Modal label="Save formation" className="adjustment-modal details-modal" onClose={onClose} as="form" onSubmit={(event) => {
      event.preventDefault();
      if (canSave) onSave(name.trim());
      }}>
      <div className="adjustment-icon"><FloppyDisk size={25} /></div>
      <span className="modal-label">Reusable formation</span>
      <h2>Save this alignment</h2>
      <p>The player positions and labels become a reusable starting point. Assignments are not included.</p>
      <label className="details-field">Formation name<input value={name} onChange={(event) => setName(event.target.value)} required autoFocus /></label>
      <div className={`formation-check ${status.legal ? "legal" : "illegal"}`}>
        {status.legal ? <CheckCircle size={22} weight="fill" /> : <Warning size={22} weight="fill" />}
        <div><strong>{status.legal ? "Legal formation" : "Cannot save this formation"}</strong><span>{status.onLine} on the line · {status.inBackfield} in the backfield · {status.playerCount} players</span></div>
      </div>
      <button className="modal-primary" type="submit" disabled={!canSave}>Save formation</button>
      <button className="modal-close" type="button" onClick={onClose}><X size={18} />Cancel</button>
    </Modal>
  );
}

function ApplyFormationDialog({ currentFormation, formations, onApply, onClose }) {
  const [formationId, setFormationId] = useState(
    formations.find((formation) => formation.name === currentFormation)?.id ?? formations[0]?.id ?? "",
  );
  const formation = formations.find((item) => item.id === formationId);
  const status = formationStatus(formation?.players ?? []);
  return (
    <Modal label="Apply formation" className="adjustment-modal details-modal" onClose={onClose} as="form" onSubmit={(event) => {
      event.preventDefault();
      if (formation && status.legal) onApply(formation.id);
      }}>
      <div className="adjustment-icon"><UserFocus size={25} /></div>
      <span className="modal-label">Change alignment</span>
      <h2>Apply a saved formation</h2>
      <p>Matching players keep their assignments, translated to the new alignment. Assignments without a matching position are removed.</p>
      <label className="details-field">Saved formation
        <select aria-label="Formation to apply" value={formationId} onChange={(event) => setFormationId(event.target.value)}>
          {formations.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.personnel}</option>)}
        </select>
      </label>
      <div className={`formation-check ${status.legal ? "legal" : "illegal"}`}>
        {status.legal ? <CheckCircle size={22} weight="fill" /> : <Warning size={22} weight="fill" />}
        <div><strong>{status.legal ? "Legal saved formation" : "Formation needs attention"}</strong><span>{status.onLine} on the line · {status.inBackfield} in the backfield · {status.playerCount} players</span></div>
      </div>
      <button className="modal-primary" type="submit" disabled={!formation || !status.legal || formation.name === currentFormation}>Apply formation</button>
      <button className="modal-close" type="button" onClick={onClose}><X size={18} />Cancel</button>
    </Modal>
  );
}

function DeletePlayDialog({ canDelete, onClose, onDelete, play }) {
  return (
    <Modal label="Delete play" className="adjustment-modal destructive-modal" onClose={onClose}>
      <div className="adjustment-icon danger-icon"><Trash size={25} /></div>
      <span className="modal-label">Delete play</span>
      <h2>{canDelete ? `Delete ${play.name}?` : "Keep at least one play"}</h2>
      <p>{canDelete ? "This removes the play from this playbook. This action is not part of undo history." : "Create another play before deleting this one."}</p>
      <button className="modal-danger" disabled={!canDelete} onClick={onDelete}>Delete play</button>
      <button className="modal-close" onClick={onClose}><X size={18} />Cancel</button>
    </Modal>
  );
}

function NewPlaybookDialog({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const canCreate = name.trim().length > 0;
  return (
    <Modal label="Create a playbook" className="adjustment-modal details-modal" onClose={onClose} as="form" onSubmit={(event) => {
      event.preventDefault();
      if (canCreate) onCreate(name.trim());
      }}>
      <div className="adjustment-icon"><BookOpen size={25} /></div>
      <span className="modal-label">Separate playbook</span>
      <h2>Start another playbook</h2>
      <p>Your new book stays separate. You can switch between books or copy individual plays into Personal Active.</p>
      <label className="details-field">Playbook name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. 2026 Varsity Offense" required autoFocus /></label>
      <button className="modal-primary" type="submit" disabled={!canCreate}>Create playbook</button>
      <button className="modal-close" type="button" onClick={onClose}><X size={18} />Cancel</button>
    </Modal>
  );
}

/**
 * Confirmations are polite and fade; problems are announced assertively and stay
 * until dismissed or superseded. A reversible action can carry its own undo.
 */
function Feedback({ feedback, onAction, onDismiss }) {
  const problem = feedback?.tone === "error";
  return (
    <div
      className={`toast ${feedback ? "show" : ""} ${problem ? "is-problem" : ""}`}
      role={problem ? "alert" : "status"}
      aria-live={problem ? "assertive" : "polite"}
    >
      {problem ? <Warning size={18} weight="fill" /> : null}
      <span>{feedback?.message}</span>
      {feedback?.actionLabel ? (
        <button type="button" className="toast-action" onClick={onAction}>{feedback.actionLabel}</button>
      ) : null}
      {problem ? (
        <button type="button" className="toast-dismiss" aria-label="Dismiss message" onClick={onDismiss}>
          <X size={16} />
        </button>
      ) : null}
    </div>
  );
}

function starterPlay(playbookId) {
  return createPlayFromFormation({
    formation: defaultFormations[0],
    id: `${playbookId}-new-play`,
    name: "New Play",
  });
}

export function App() {
  const [workspace, setWorkspace] = useState(readWorkspace);
  const [playId, setPlayId] = useState(null);
  const [view, setView] = useState("end");
  const [activeTool, setActiveTool] = useState("Select");
  const [speed, setSpeed] = useState(1);
  const [playback, setPlayback] = useState("idle");
  const [runKey, setRunKey] = useState(0);
  const [present, setPresent] = useState(false);
  const [gameDay, setGameDay] = useState(readGameDay);
  const [gameDayDialog, setGameDayDialog] = useState(false);
  const [detailsDialog, setDetailsDialog] = useState(false);
  const [createPlayDialog, setCreatePlayDialog] = useState(false);
  const [deletePlayDialog, setDeletePlayDialog] = useState(false);
  const [newPlaybookDialog, setNewPlaybookDialog] = useState(false);
  const [saveFormationDialog, setSaveFormationDialog] = useState(false);
  const [applyFormationDialog, setApplyFormationDialog] = useState(false);
  const [saveConceptDialog, setSaveConceptDialog] = useState(false);
  const [applyConceptDialog, setApplyConceptDialog] = useState(false);
  const [dataToolsDialog, setDataToolsDialog] = useState(false);
  const [printPreview, setPrintPreview] = useState(false);
  const [restoreCandidate, setRestoreCandidate] = useState(null);
  const [restoreError, setRestoreError] = useState("");
  const [offlineStatus, setOfflineStatus] = useState({
    online: typeof navigator === "undefined" ? true : navigator.onLine,
    ready: false,
    supported: typeof navigator !== "undefined" && "serviceWorker" in navigator,
    development: true,
  });
  const [selectedAssignmentId, setSelectedAssignmentId] = useState(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState("offense");
  const [layers, setLayers] = useState({
    offense: { visible: true, dimmed: false, locked: false },
    defense: { visible: true, dimmed: false, locked: false },
    assignments: { visible: true },
  });
  const [browserQuery, setBrowserQuery] = useState("");
  const [browserFolder, setBrowserFolder] = useState("all");
  const [draftAssignment, setDraftAssignment] = useState([]);
  /*
   * One transient toast used to carry everything: "Undid last change" and a
   * blocking "A name and legal formation are required" got the same polite,
   * 2.6-second treatment, and each new message destroyed the previous one.
   * Feedback now has a tone, so a problem is announced assertively and stays put,
   * and a reversible action can offer undo in place.
   */
  const [feedback, setFeedback] = useState(null);
  const drawing = useRef(false);
  const historyRef = useRef(new Map());
  const playerDrag = useRef(null);
  const routePointDrag = useRef(null);
  const canvasSwipe = useRef(null);
  const svgRef = useRef(null);
  const [, setHistoryVersion] = useState(0);

  const playbooks = workspace.playbooks;
  const activePlaybook = playbooks.find((book) => book.id === workspace.activePlaybookId) ?? playbooks[0];
  const mainPlaybook = playbooks.find((book) => book.id === workspace.mainPlaybookId) ?? playbooks[0];
  const library = activePlaybook.plays;
  const folders = useMemo(() => [...new Set(library.map((item) => item.folder ?? "Unfiled"))].sort(), [library]);
  const visibleLibrary = useMemo(() => {
    const query = browserQuery.trim().toLowerCase();
    return library.filter((item) => {
      if (browserFolder !== "all" && (item.folder ?? "Unfiled") !== browserFolder) return false;
      if (!query) return true;
      return [
        item.name,
        item.family,
        item.formation,
        item.personnel,
        item.protection,
        item.blockingScheme,
        item.folder,
      ].some((value) => value?.toLowerCase().includes(query));
    });
  }, [browserFolder, browserQuery, library]);
  const playIndex = useMemo(() => Math.max(0, library.findIndex((item) => item.id === playId)), [library, playId]);
  const play = library[playIndex];
  /*
   * Selection is held as a stable assignment id rather than an index into
   * play.assignments, so deleting, reordering, applying a concept, or undoing
   * cannot silently move the selection onto a different player's assignment.
   */
  const route = selectedAssignmentId
    ? play.assignments.find((item) => item.id === selectedAssignmentId) ?? null
    : null;
  const selectedPlayerLabel = selectedPlayerId ? playerLabel(play, selectedUnit, selectedPlayerId) : null;
  const playerAssignments = useMemo(() => selectedPlayerId
    ? play.assignments.filter((item) => item.unit === selectedUnit && item.playerId === selectedPlayerId)
    : [], [play.assignments, selectedPlayerId, selectedUnit]);
  const currentLayerLocked = layers[selectedUnit]?.locked ?? false;
  const copyTargets = useMemo(() => {
    if (!selectedPlayerId) return [];
    const phase = route?.phase ?? "post";
    const assigned = new Set(play.assignments
      .filter((item) => item.unit === selectedUnit && item.phase === phase)
      .map((item) => item.playerId));
    const roster = selectedUnit === "defense" ? play.defenders : play.players;
    return roster
      .filter((player) => player.id !== selectedPlayerId && !assigned.has(player.id))
      .map((player) => ({ id: player.id, label: player.label }));
  }, [play.assignments, play.defenders, play.players, route?.phase, selectedPlayerId, selectedUnit]);
  /*
   * Why an assignment type is not available for this player, so the inspector can
   * disable it with an explanation instead of accepting the click and answering
   * with a rejection message.
   */
  const unavailableTypes = useMemo(() => {
    if (!selectedPlayerId) return {};
    const reasons = {};
    if (currentLayerLocked) {
      const locked = `Unlock the ${selectedUnit} layer to change assignments`;
      for (const type of selectedUnit === "defense" ? defensiveAssignmentTypes : offensiveAssignmentTypes) {
        reasons[type] = locked;
      }
      return reasons;
    }
    if (isLinePlayer(play, selectedUnit, selectedPlayerId)) {
      const label = playerLabel(play, selectedUnit, selectedPlayerId);
      reasons.Route = `${label} is an interior lineman and uses blocking assignments`;
      reasons.Motion = `${label} is an interior lineman and uses blocking assignments`;
    }
    return reasons;
  }, [currentLayerLocked, play, selectedPlayerId, selectedUnit]);
  const temporary = gameDay?.playbookId === activePlaybook.id && gameDay?.playId === play.id;
  const currentFormationStatus = formationStatus(play.players);
  const historyEntry = historyRef.current.get(play.id) ?? { past: [], future: [] };
  const canUndo = historyEntry.past.length > 0;
  const canRedo = historyEntry.future.length > 0;

  const notify = (message, options = {}) => setFeedback({ message, tone: "info", ...options, at: Date.now() });
  /** A problem the coach must resolve: announced assertively and left on screen. */
  const notifyProblem = (message) => notify(message, { tone: "error" });

  /*
   * Persistence is debounced. Dragging a player updates the play on every
   * pointermove, and writing straight through meant a single 25-frame drag
   * serialised the entire workspace 25 times -- about 1.4 MB of JSON.stringify on
   * the main thread. A trailing write plus a flush when the page is hidden keeps
   * the same durability without the per-frame cost.
   */
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;

  useEffect(() => {
    const flush = () => {
      window.localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspaceRef.current));
    };
    const timer = window.setTimeout(flush, 400);
    const onHide = () => {
      window.clearTimeout(timer);
      flush();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [workspace]);

  useEffect(() => subscribeOfflineStatus(setOfflineStatus), []);

  useEffect(() => {
    if (gameDay) window.localStorage.setItem(GAME_DAY_KEY, JSON.stringify(gameDay));
    else window.localStorage.removeItem(GAME_DAY_KEY);
  }, [gameDay]);

  // Confirmations fade; problems stay until acknowledged or superseded.
  useEffect(() => {
    if (!feedback || feedback.tone === "error") return undefined;
    const timer = window.setTimeout(() => setFeedback(null), feedback.actionLabel ? 6000 : 2600);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    if (playback !== "running") return undefined;
    const duration = playDuration(play.assignments, speed);
    const timer = window.setTimeout(() => setPlayback("idle"), duration * 1000 + 150);
    return () => window.clearTimeout(timer);
  }, [play.assignments, playback, runKey, speed]);

  // Open on a useful selection, but leave phones on a clean, view-first canvas.
  useEffect(() => {
    if (compactViewport()) return;
    const firstPlay = library[0];
    if (!firstPlay) return;
    const id = defaultAssignmentId(firstPlay);
    const item = firstPlay.assignments.find((entry) => entry.id === id);
    if (!item) return;
    setSelectedAssignmentId(item.id);
    setSelectedPlayerId(item.playerId);
    setSelectedUnit(item.unit);
    // Mount only: later selection is driven by interaction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLibrary = (nextValue) => {
    setWorkspace((current) => ({
      ...current,
      playbooks: current.playbooks.map((book) => {
        if (book.id !== current.activePlaybookId) return book;
        const nextPlays = typeof nextValue === "function" ? nextValue(book.plays) : nextValue;
        return { ...book, plays: nextPlays };
      }),
    }));
  };

  const replacePlay = (targetId, replacement) => {
    setLibrary((current) => current.map((item) => item.id === targetId ? replacement : item));
  };

  const pushHistory = (targetId, snapshot = library.find((item) => item.id === targetId)) => {
    if (!snapshot) return;
    const entry = historyRef.current.get(targetId) ?? { past: [], future: [] };
    historyRef.current.set(targetId, {
      past: [...entry.past.slice(-39), clonePlaybook([snapshot])[0]],
      future: [],
    });
    setHistoryVersion((value) => value + 1);
  };

  const updatePlay = (targetId, updater, { record = true } = {}) => {
    if (record) pushHistory(targetId);
    setLibrary((current) => current.map((item) => item.id === targetId ? updater(item) : item));
  };

  const updateSelectedAssignment = (updater, options = {}) => {
    if (!selectedAssignmentId) return;
    const { markOverride = true, ...historyOptions } = options;
    updatePlay(play.id, (current) => ({
      ...current,
      assignments: current.assignments.map((item) => {
        if (item.id !== selectedAssignmentId) return item;
        const updated = updater(item);
        return markOverride && item.inheritedFrom ? { ...updated, templateOverride: true } : updated;
      }),
    }), historyOptions);
  };

  const clearSelection = () => {
    setSelectedAssignmentId(null);
    setSelectedPlayerId(null);
  };

  /** Selects an assignment and brings its player and unit along with it. */
  const focusAssignment = (targetPlay, assignmentId) => {
    const item = targetPlay.assignments.find((entry) => entry.id === assignmentId);
    if (!item) {
      setSelectedAssignmentId(null);
      return;
    }
    setSelectedAssignmentId(item.id);
    setSelectedPlayerId(item.playerId);
    setSelectedUnit(item.unit);
  };

  /*
   * After a history jump the selected player may be gone, or may no longer own
   * an assignment in the same phase. Both are resolved by id, so neither can
   * land on an unrelated assignment.
   */
  const restoreSelection = (nextPlay) => {
    if (selectedPlayerId && !playerExists(nextPlay, selectedUnit, selectedPlayerId)) {
      clearSelection();
      return;
    }
    if (nextPlay.assignments.some((item) => item.id === selectedAssignmentId)) return;
    const replacement = selectedPlayerId
      ? assignmentFor(nextPlay, selectedUnit, selectedPlayerId, route?.phase)
        ?? preferredAssignment(nextPlay, selectedUnit, selectedPlayerId)
      : null;
    setSelectedAssignmentId(replacement?.id ?? null);
  };

  const undo = () => {
    const entry = historyRef.current.get(play.id);
    const previous = entry?.past.at(-1);
    if (!previous) return;
    historyRef.current.set(play.id, {
      past: entry.past.slice(0, -1),
      future: [clonePlaybook([play])[0], ...entry.future].slice(0, 40),
    });
    replacePlay(play.id, previous);
    restoreSelection(previous);
    setHistoryVersion((value) => value + 1);
    notify("Undid last change");
  };

  const redo = () => {
    const entry = historyRef.current.get(play.id);
    const next = entry?.future[0];
    if (!next) return;
    historyRef.current.set(play.id, {
      past: [...entry.past, clonePlaybook([play])[0]].slice(-40),
      future: entry.future.slice(1),
    });
    replacePlay(play.id, next);
    restoreSelection(next);
    setHistoryVersion((value) => value + 1);
    notify("Redid change");
  };

  const selectPlay = (nextId) => {
    const nextPlay = library.find((item) => item.id === nextId);
    if (!nextPlay) return;
    setPlayId(nextId);
    if (compactViewport()) clearSelection();
    else focusAssignment(nextPlay, defaultAssignmentId(nextPlay));
    setDraftAssignment([]);
    setActiveTool("Select");
    setPlayback("idle");
  };

  const selectAdjacentPlay = (direction) => {
    if (!visibleLibrary.length) return;
    const currentIndex = visibleLibrary.findIndex((item) => item.id === play.id);
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (baseIndex + direction + visibleLibrary.length) % visibleLibrary.length;
    selectPlay(visibleLibrary[nextIndex].id);
  };

  const switchPlaybook = (nextBookId) => {
    const nextBook = playbooks.find((book) => book.id === nextBookId);
    if (!nextBook || nextBook.id === activePlaybook.id) return;
    const nextPlay = nextBook.plays[0];
    setWorkspace((current) => ({ ...current, activePlaybookId: nextBookId }));
    setPlayId(nextPlay.id);
    if (compactViewport()) clearSelection();
    else focusAssignment(nextPlay, defaultAssignmentId(nextPlay));
    setBrowserQuery("");
    setBrowserFolder("all");
    setDraftAssignment([]);
    setActiveTool("Select");
    setPlayback("idle");
    setPresent(false);
  };

  const copyToMain = () => {
    if (activePlaybook.id === mainPlaybook.id) return;
    const copy = {
      ...clonePlaybook([play])[0],
      id: `${mainPlaybook.id}-${play.id}-${Date.now()}`,
      name: uniqueName(mainPlaybook.plays, play.name),
      variantOf: null,
      importedFrom: {
        playbookId: activePlaybook.id,
        playbookName: activePlaybook.name,
        playId: play.id,
        sourcePage: play.sourcePage ?? null,
      },
    };
    setWorkspace((current) => ({
      ...current,
      playbooks: current.playbooks.map((book) => book.id === current.mainPlaybookId
        ? { ...book, plays: [...book.plays, copy] }
        : book),
    }));
    notify(`${play.name} added to ${mainPlaybook.name}`);
  };

  const createPlaybook = (name) => {
    const idBase = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "playbook";
    const existingIds = new Set(playbooks.map((book) => book.id));
    let id = idBase;
    let suffix = 2;
    while (existingIds.has(id)) {
      id = `${idBase}-${suffix}`;
      suffix += 1;
    }
    const firstPlay = starterPlay(id);
    const newBook = {
      id,
      name,
      description: "New separate playbook",
      isMain: false,
      source: "personal",
      formations: clonePlaybook(defaultFormations),
      concepts: [],
      plays: [firstPlay],
    };
    setWorkspace((current) => ({
      ...current,
      activePlaybookId: id,
      playbooks: [...current.playbooks, newBook],
    }));
    setPlayId(firstPlay.id);
    clearSelection();
    setSelectedUnit("offense");
    setNewPlaybookDialog(false);
    notify(`${name} created`);
  };

  const createPlay = ({ formationId, mode, name }) => {
    const id = `${activePlaybook.id}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "play"}-${Date.now()}`;
    let created;

    if (mode === "duplicate") {
      created = {
        ...clonePlaybook([play])[0],
        id,
        name: uniqueName(library, name),
        variantOf: play.id,
        assignments: play.assignments.map((item, index) => ({
          ...clonePlaybook([item])[0],
          id: `${id}-assignment-${index + 1}`,
        })),
      };
    } else {
      const formation = mode === "blank"
        ? defaultFormations[0]
        : activePlaybook.formations.find((item) => item.id === formationId) ?? activePlaybook.formations[0];
      created = createPlayFromFormation({
        formation,
        id,
        name: uniqueName(library, name),
      });
    }

    const status = formationStatus(created.players);
    if (!created.name.trim() || !status.legal) {
      notifyProblem("A name and legal formation are required");
      return;
    }

    setLibrary((current) => [...current, created]);
    setPlayId(created.id);
    clearSelection();
    setSelectedUnit("offense");
    setCreatePlayDialog(false);
    setActiveTool("Select");
    notify(`${created.name} created`);
  };

  const duplicatePlay = () => {
    createPlay({
      formationId: null,
      mode: "duplicate",
      name: `${play.name} Variation`,
    });
  };

  const deletePlay = () => {
    if (library.length <= 1) return;
    const nextLibrary = library.filter((item) => item.id !== play.id);
    const nextPlay = nextLibrary[Math.min(playIndex, nextLibrary.length - 1)];
    setLibrary(nextLibrary);
    historyRef.current.delete(play.id);
    setHistoryVersion((value) => value + 1);
    setPlayId(nextPlay.id);
    if (compactViewport()) clearSelection();
    else focusAssignment(nextPlay, defaultAssignmentId(nextPlay));
    setDeletePlayDialog(false);
    notify(`${play.name} deleted`);
  };

  const saveFormation = (name) => {
    const saved = {
      id: `${activePlaybook.id}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "formation"}`,
      name,
      personnel: play.personnel,
      players: clonePlaybook(play.players),
    };
    setWorkspace((current) => ({
      ...current,
      playbooks: current.playbooks.map((book) => {
        if (book.id !== current.activePlaybookId) return book;
        const existing = book.formations.findIndex((item) => item.name.toLowerCase() === name.toLowerCase());
        const formations = existing >= 0
          ? book.formations.map((item, index) => index === existing ? { ...saved, id: item.id } : item)
          : [...book.formations, saved];
        return { ...book, formations };
      }),
    }));
    updatePlay(play.id, (current) => ({ ...current, formation: name }));
    setSaveFormationDialog(false);
    notify(`${name} saved for reuse`);
  };

  const applyFormation = (formationId) => {
    const formation = activePlaybook.formations.find((item) => item.id === formationId);
    if (!formation || !formationStatus(formation.players).legal) {
      notifyProblem("Choose a legal saved formation");
      return;
    }
    const nextLabels = new Set(formation.players.map((player) => player.label));
    const removed = play.assignments.filter((item) => (
      item.unit === "offense" && !nextLabels.has(playerLabel(play, "offense", item.playerId))
    )).length;
    updatePlay(play.id, (current) => applyFormationToPlay(current, formation));
    clearSelection();
    setSelectedUnit("offense");
    setApplyFormationDialog(false);
    notify(`${formation.name} applied${removed ? ` · ${removed} unmatched assignment${removed === 1 ? "" : "s"} removed` : " · matching assignments preserved"}`);
  };

  const saveConcept = (name) => {
    const existing = activePlaybook.concepts.find((concept) => concept.name.toLowerCase() === name.toLowerCase());
    const idBase = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "concept";
    const concept = createConceptTemplate(play, {
      id: existing?.id ?? `${activePlaybook.id}-${idBase}`,
      name,
    });
    setWorkspace((current) => ({
      ...current,
      playbooks: current.playbooks.map((book) => {
        if (book.id !== current.activePlaybookId) return book;
        return {
          ...book,
          concepts: existing
            ? book.concepts.map((item) => item.id === existing.id ? concept : item)
            : [...book.concepts, concept],
        };
      }),
    }));
    setSaveConceptDialog(false);
    notify(`${name} concept ${existing ? "updated" : "saved"}`);
  };

  const applyConcept = (conceptId) => {
    const concept = activePlaybook.concepts.find((item) => item.id === conceptId);
    if (!concept) return;
    updatePlay(play.id, (current) => applyConceptTemplateToPlay(current, concept));
    clearSelection();
    setSelectedUnit("offense");
    setApplyConceptDialog(false);
    notify(`${concept.name} applied · play-level overrides preserved`);
  };

  const chooseRestoreFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setRestoreCandidate(null);
    setRestoreError("");
    if (!file) return;
    try {
      setRestoreCandidate(parseWorkspaceBackup(await file.text()));
    } catch (error) {
      setRestoreError(error instanceof Error ? error.message : "That backup could not be opened.");
    }
  };

  const confirmRestore = () => {
    if (!restoreCandidate) return;
    window.localStorage.setItem(RECOVERY_WORKSPACE_KEY, JSON.stringify({
      version: WORKSPACE_VERSION,
      createdAt: new Date().toISOString(),
      workspace,
    }));
    const restored = restoreCandidate.workspace;
    const restoredBook = restored.playbooks.find((book) => book.id === restored.activePlaybookId) ?? restored.playbooks[0];
    setWorkspace(restored);
    setPlayId(restoredBook.plays[0].id);
    clearSelection();
    setSelectedUnit("offense");
    setGameDay(null);
    setRestoreCandidate(null);
    setDataToolsDialog(false);
    notify(`Backup restored · previous workspace kept as a recovery copy`);
  };

  const exportCurrentPng = async () => {
    try {
      await downloadPlayPng(svgRef.current, play.name);
      notify(`${play.name} PNG downloaded`);
    } catch (error) {
      notifyProblem(error instanceof Error ? error.message : "PNG export failed");
    }
  };

  const refreshOffline = async () => {
    const ready = await refreshOfflineCopy();
    if (ready) notify("Offline game-day copy refreshed");
    else notifyProblem("Offline copy could not be refreshed yet");
  };

  /*
   * Relabelling only touches the label. Identity lives on the player's id, so
   * assignments stay attached and duplicate labels are allowed on both units --
   * a defense can carry two `C` and two `T`, and so can an offense.
   */
  const renamePlayer = (nextLabel) => {
    if (!selectedPlayerId || nextLabel === selectedPlayerLabel) return;
    if (currentLayerLocked) {
      notifyProblem(`Unlock the ${selectedUnit} layer to relabel players`);
      return;
    }
    const previousLabel = selectedPlayerLabel;
    const rosterKey = selectedUnit === "defense" ? "defenders" : "players";
    updatePlay(play.id, (current) => ({
      ...current,
      [rosterKey]: current[rosterKey].map((player) => (
        player.id === selectedPlayerId ? { ...player, label: nextLabel } : player
      )),
    }));
    notify(`${previousLabel} relabeled as ${nextLabel}`);
  };

  const deleteAssignment = () => {
    if (!route) return;
    if (currentLayerLocked) {
      notifyProblem(`Unlock the ${selectedUnit} layer to delete assignments`);
      return;
    }
    const removedId = route.id;
    const label = selectedPlayerLabel;
    const type = route.type.toLowerCase();
    // The player's other stage, if they have one, becomes the selection.
    const fallback = play.assignments.find((item) => (
      item.id !== removedId && item.unit === selectedUnit && item.playerId === selectedPlayerId
    ));
    updatePlay(play.id, (current) => ({
      ...current,
      assignments: current.assignments.filter((item) => item.id !== removedId),
    }));
    setSelectedAssignmentId(fallback?.id ?? null);
    notify(`${label} ${type} deleted`, { actionLabel: "Undo", onAction: undo });
  };

  const removePlayer = () => {
    if (!selectedPlayerId) return;
    if (currentLayerLocked) {
      notifyProblem(`Unlock the ${selectedUnit} layer to remove players`);
      return;
    }
    const removedId = selectedPlayerId;
    const removedLabel = selectedPlayerLabel;
    const rosterKey = selectedUnit === "defense" ? "defenders" : "players";
    updatePlay(play.id, (current) => ({
      ...current,
      [rosterKey]: current[rosterKey].filter((player) => player.id !== removedId),
      assignments: current.assignments.filter((item) => item.playerId !== removedId),
    }));
    clearSelection();
    setSelectedUnit("offense");
    notify(`${removedLabel} removed`, { actionLabel: "Undo", onAction: undo });
  };

  const addPlayer = () => {
    if (play.players.length >= 11) return;
    const labels = new Set(play.players.map((player) => player.label));
    let nextLabel = "P";
    let suffix = 2;
    while (labels.has(nextLabel)) {
      nextLabel = `P${suffix}`;
      suffix += 1;
    }
    const id = `o-added-${Date.now()}`;
    // Drop the new player in the backfield, behind the quarterback.
    updatePlay(play.id, (current) => ({
      ...current,
      players: [...current.players, { id, label: nextLabel, x: 0, y: -7.5 }],
    }));
    setSelectedUnit("offense");
    setSelectedPlayerId(id);
    setSelectedAssignmentId(null);
    notify(`${nextLabel} added — drag and relabel the player`);
  };

  const setAssignmentType = (type) => {
    if (!selectedPlayerId) return;
    if (currentLayerLocked) {
      notifyProblem(`Unlock the ${selectedUnit} layer to edit assignments`);
      return;
    }
    const allowed = selectedUnit === "defense" ? defensiveAssignmentTypes : offensiveAssignmentTypes;
    if (!allowed.includes(type)) return;
    if (isLinePlayer(play, selectedUnit, selectedPlayerId) && type !== "Block") {
      notifyProblem(`${selectedPlayerLabel} uses blocking assignments`);
      return;
    }
    const targetPhase = selectedUnit === "defense" ? "post" : assignmentPhaseForType(type);
    const existing = assignmentFor(play, selectedUnit, selectedPlayerId, targetPhase);
    if (existing?.type === type) {
      setSelectedAssignmentId(existing.id);
      return;
    }
    const start = playerLocation(play, selectedUnit, selectedPlayerId);
    if (!start) return;
    const nextAssignment = {
      ...createAssignment({ play, playerId: selectedPlayerId, start, type, unit: selectedUnit }),
      ...(play.conceptTemplateId ? { templateOverride: true } : {}),
      ...(existing?.inheritedFrom ? { inheritedFrom: existing.inheritedFrom } : {}),
    };
    updatePlay(play.id, (current) => ({
      ...current,
      assignments: existing
        ? current.assignments.map((item) => item.id === existing.id ? nextAssignment : item)
        : [...current.assignments, nextAssignment],
    }));
    setSelectedAssignmentId(nextAssignment.id);
    setActiveTool(selectedUnit === "defense" ? "Defense" : type);
    notify(`${selectedPlayerLabel} ${type.toLowerCase()} assignment ready`);
  };

  const selectAssignmentStage = (assignmentId) => {
    if (play.assignments.some((item) => item.id === assignmentId)) setSelectedAssignmentId(assignmentId);
  };

  const addAssignmentStage = (phase) => {
    if (phase === "pre") {
      setAssignmentType("Motion");
      return;
    }
    if (selectedUnit === "defense") {
      setAssignmentType("Rush");
      return;
    }
    setAssignmentType(isLinePlayer(play, selectedUnit, selectedPlayerId) ? "Block" : "Route");
  };

  const changeAssignmentDefinition = (nextDefinition) => {
    if (!route || currentLayerLocked) return;
    const start = playerLocation(play, selectedUnit, selectedPlayerId);
    if (!start) return;
    const definition = sanitizeAssignmentDefinition(route.type, nextDefinition);
    const points = route.type === "Man"
      ? manCoveragePoints(play, start, definition)
      : assignmentDefinitionToPoints(start, route.type, definition);
    updateSelectedAssignment((current) => ({
      ...current,
      definition,
      preset: titleCase(definition.technique ?? definition.motionType ?? definition.area ?? definition.responsibility ?? current.type),
      points,
      geometryMode: "structured",
    }));
    notify(`${selectedPlayerLabel} ${route.type.toLowerCase()} updated`);
  };

  const changeAssignmentTiming = (patch) => {
    if (!route || currentLayerLocked) return;
    updateSelectedAssignment((current) => ({ ...current, ...patch }));
  };

  const copyAssignment = (targetId) => {
    if (!route || currentLayerLocked) return;
    const sourceStart = playerLocation(play, selectedUnit, selectedPlayerId);
    const targetStart = playerLocation(play, selectedUnit, targetId);
    if (!sourceStart || !targetStart || assignmentFor(play, selectedUnit, targetId, route.phase)) return;
    const dx = targetStart[0] - sourceStart[0];
    const dy = targetStart[1] - sourceStart[1];
    const copy = {
      ...clonePlaybook([route])[0],
      id: `${play.id}-${selectedUnit}-${targetId.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${route.phase}-${Date.now()}`,
      playerId: targetId,
      points: route.points.map(([x, y]) => clampPoint([x + dx, y + dy])),
      evidence: route.evidence ? { ...route.evidence, coachEdited: true, method: "coach-copied" } : route.evidence,
      templateOverride: route.inheritedFrom ? true : route.templateOverride,
    };
    updatePlay(play.id, (current) => ({ ...current, assignments: [...current.assignments, copy] }));
    setSelectedPlayerId(targetId);
    setSelectedAssignmentId(copy.id);
    notify(`Assignment copied to ${playerLabel(play, selectedUnit, targetId)}`);
  };

  const mirrorAssignment = () => {
    if (!route || currentLayerLocked) return;
    const start = playerLocation(play, selectedUnit, selectedPlayerId);
    if (!start) return;
    updateSelectedAssignment((current) => ({
      ...current,
      preset: `${current.preset ?? current.type} Mirror`,
      geometryMode: "manual",
      points: current.points.map(([x, y]) => clampPoint([start[0] - (x - start[0]), y])),
      evidence: current.evidence ? { ...current.evidence, coachEdited: true } : current.evidence,
    }));
    notify(`${selectedPlayerLabel} assignment mirrored`);
  };

  const toggleRun = () => {
    if (playback === "running") {
      svgRef.current?.pauseAnimations?.();
      setPlayback("paused");
      return;
    }
    if (playback === "paused") {
      svgRef.current?.unpauseAnimations?.();
      setPlayback("running");
      return;
    }
    setRunKey((value) => value + 1);
    setPlayback("running");
  };

  const restartRun = () => {
    setRunKey((value) => value + 1);
    setPlayback("running");
  };

  /*
   * The projection is a pure function of (stage box, view), so recomputing it
   * here yields exactly the one PlayCanvas drew with -- pointer input therefore
   * lands on the field yard under the finger, at any viewport size.
   */
  const pointerPoint = (event) => {
    const box = svgRef.current?.parentElement?.getBoundingClientRect();
    if (!box) return [0, 0];
    const projection = fieldProjection({ width: box.width, height: box.height, view });
    return clampPoint(pointerToField(event, box, projection));
  };

  /** Drawing needs a minimum travel in yards before it registers a new vertex. */
  const DRAW_STEP_YARDS = 0.8;

  const startDraw = (event) => {
    if (activeTool === "Select") {
      canvasSwipe.current = { x: event.clientX, y: event.clientY };
      return;
    }
    const drawingTool = offensiveAssignmentTypes.includes(activeTool)
      || (activeTool === "Defense" && route?.unit === "defense");
    if (!drawingTool) return;
    if (!route) {
      notifyProblem(`Select a ${activeTool === "Defense" ? "defender" : "player"} before drawing`);
      return;
    }
    if (currentLayerLocked || !layers.assignments.visible) {
      notifyProblem(currentLayerLocked ? `Unlock the ${selectedUnit} layer to draw` : "Show the assignments layer to draw");
      return;
    }
    if (activeTool !== "Defense" && route.type !== activeTool) {
      notifyProblem(`${selectedPlayerLabel ?? "This player"} already has a ${route.type.toLowerCase()}`);
      return;
    }
    drawing.current = true;
    capturePointer(event.currentTarget, event.pointerId);
    const start = route.points[0];
    const next = pointerPoint(event);
    setDraftAssignment(Math.hypot(next[0] - start[0], next[1] - start[1]) > DRAW_STEP_YARDS ? [start, next] : [start]);
  };

  /**
   * Moves a player to a field point, carrying their assignments so each path
   * keeps its shape. Shared by dragging and by keyboard nudging.
   */
  const movePlayerTo = (unit, playerId, target, options = {}) => {
    const rosterKey = unit === "defense" ? "defenders" : "players";
    const next = clampPoint(target);
    updatePlay(play.id, (current) => {
      const from = playerLocation(current, unit, playerId);
      if (!from) return current;
      const dx = next[0] - from[0];
      const dy = next[1] - from[1];
      return {
        ...current,
        [rosterKey]: current[rosterKey].map((player) => (
          player.id === playerId ? { ...player, x: next[0], y: next[1] } : player
        )),
        assignments: current.assignments.map((item) => item.playerId === playerId
          ? {
              ...item,
              points: item.points.map(([x, y]) => clampPoint([x + dx, y + dy])),
              templateOverride: item.inheritedFrom ? true : item.templateOverride,
            }
          : item),
      };
    }, options);
  };

  const movePointer = (event) => {
    if (playerDrag.current) {
      const next = pointerPoint(event);
      // Snap an offensive player onto the line of scrimmage when they are close to it.
      const snapped = playerDrag.current.unit === "offense" && Math.abs(next[1]) <= 0.7
        ? [next[0], 0]
        : next;
      if (!playerDrag.current.moved) {
        pushHistory(play.id, playerDrag.current.snapshot);
        playerDrag.current.moved = true;
      }
      movePlayerTo(playerDrag.current.unit, playerDrag.current.id, snapped, { record: false });
      return;
    }

    if (routePointDrag.current && route) {
      if (!routePointDrag.current.moved) {
        pushHistory(play.id, routePointDrag.current.snapshot);
        routePointDrag.current.moved = true;
      }
      const next = pointerPoint(event);
      const pointIndex = routePointDrag.current.pointIndex;
      updateSelectedAssignment((current) => ({
        ...current,
        preset: "Custom",
        geometryMode: "manual",
        evidence: current.evidence ? { ...current.evidence, coachEdited: true } : current.evidence,
        points: current.points.map((point, index) => index === pointIndex ? next : point),
      }), { record: false });
      return;
    }

    const drawingTool = offensiveAssignmentTypes.includes(activeTool) || activeTool === "Defense";
    if (!drawing.current || !drawingTool) return;
    const next = pointerPoint(event);
    setDraftAssignment((current) => (
      current.length && Math.hypot(next[0] - current.at(-1)[0], next[1] - current.at(-1)[1]) < DRAW_STEP_YARDS
        ? current
        : [...current, next]
    ));
  };

  const finishPointer = (event) => {
    if (playerDrag.current) {
      const movedLabel = playerLabel(play, playerDrag.current.unit, playerDrag.current.id);
      const moved = playerDrag.current.moved;
      playerDrag.current = null;
      if (moved) notify(`${movedLabel} repositioned`);
      return;
    }
    if (routePointDrag.current) {
      const moved = routePointDrag.current.moved;
      routePointDrag.current = null;
      if (moved) notify("Assignment landmark updated");
      return;
    }
    if (drawing.current) {
      drawing.current = false;
      if (draftAssignment.length > 1) {
        const label = selectedPlayerLabel ?? "Player";
        const type = route?.type.toLowerCase() ?? "assignment";
        updateSelectedAssignment((current) => {
          const sketched = { ...current, points: draftAssignment, preset: "Custom" };
          return {
            ...sketched,
            definition: current.type === "Route" ? inferRouteDefinition(sketched) : current.definition,
            geometryMode: current.type === "Route" ? "manual" : current.geometryMode,
            evidence: current.evidence ? { ...current.evidence, coachEdited: true } : current.evidence,
          };
        });
        notify(`${label} ${type} updated`);
      }
      setDraftAssignment([]);
    }
    if (canvasSwipe.current && event) {
      const dx = event.clientX - canvasSwipe.current.x;
      const dy = event.clientY - canvasSwipe.current.y;
      canvasSwipe.current = null;
      if (Math.abs(dx) >= 64 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        selectAdjacentPlay(dx < 0 ? 1 : -1);
      }
    }
  };

  const selectPlayer = (unit, playerId, event) => {
    const toolPhase = unit === "defense"
      ? "post"
      : activeTool === "Motion"
        ? "pre"
        : ["Route", "Block"].includes(activeTool)
          ? "post"
          : null;
    const existing = toolPhase
      ? assignmentFor(play, unit, playerId, toolPhase)
      : preferredAssignment(play, unit, playerId);

    setSelectedUnit(unit);
    setSelectedPlayerId(playerId);

    if (activeTool === "Select") {
      setSelectedAssignmentId(existing?.id ?? null);
      if (!layers[unit].locked) {
        playerDrag.current = {
          id: playerId,
          unit,
          moved: false,
          snapshot: clonePlaybook([play])[0],
        };
        capturePointer(event.currentTarget.ownerSVGElement?.parentElement, event.pointerId);
      }
      return;
    }

    const unitToolMatches = unit === "defense"
      ? activeTool === "Defense"
      : offensiveAssignmentTypes.includes(activeTool);
    if (!unitToolMatches) {
      setSelectedAssignmentId(existing?.id ?? null);
      notifyProblem(unit === "defense" ? "Use the Defense tool for defensive assignments" : "Choose Route, Block, or Motion for offensive players");
      return;
    }

    if (existing) {
      setSelectedAssignmentId(existing.id);
      return;
    }

    if (layers[unit].locked) {
      notifyProblem(`Unlock the ${unit} layer to add assignments`);
      return;
    }

    const label = playerLabel(play, unit, playerId);
    if (isLinePlayer(play, unit, playerId) && activeTool !== "Block") {
      notifyProblem(`${label} uses blocking assignments`);
      return;
    }

    const start = playerLocation(play, unit, playerId);
    if (!start) return;
    const type = unit === "defense" ? "Rush" : activeTool;
    const created = {
      ...createAssignment({ play, playerId, start, type, unit }),
      ...(play.conceptTemplateId ? { templateOverride: true } : {}),
    };
    updatePlay(play.id, (current) => ({ ...current, assignments: [...current.assignments, created] }));
    setSelectedAssignmentId(created.id);
    notify(`${label} ${type.toLowerCase()} added — draw or refine its handles`);
  };

  const selectAssignment = (assignmentId) => {
    focusAssignment(play, assignmentId);
  };

  const startPointDrag = (pointIndex, event) => {
    if (!route) return;
    if (currentLayerLocked || !layers.assignments.visible) {
      notifyProblem(currentLayerLocked ? `Unlock the ${selectedUnit} layer to edit paths` : "Show the assignments layer to edit paths");
      return;
    }
    routePointDrag.current = {
      moved: false,
      pointIndex,
      snapshot: clonePlaybook([play])[0],
    };
    capturePointer(event.currentTarget.ownerSVGElement?.parentElement, event.pointerId);
  };

  const changeRouteDefinition = (definition) => {
    if (!route || currentLayerLocked) return;
    updateSelectedAssignment((current) => ({
      ...current,
      definition,
      geometryMode: "structured",
      preset: "Structured",
      points: routeDefinitionToPoints(current.points[0], definition),
      evidence: current.evidence ? { ...current.evidence, coachEdited: true } : current.evidence,
    }));
    setDraftAssignment([]);
    notify(`${selectedPlayerLabel} route definition updated`);
  };

  const regenerateRoute = () => {
    if (!route?.definition || currentLayerLocked) return;
    updateSelectedAssignment((current) => ({
      ...current,
      geometryMode: "structured",
      preset: "Structured",
      points: routeDefinitionToPoints(current.points[0], current.definition),
    }));
    notify(`${selectedPlayerLabel} regenerated from its route definition`);
  };

  /** Nudges the selected player, or the selected path landmark if one is grabbed. */
  const nudgeSelection = (dx, dy) => {
    if (!selectedPlayerId || currentLayerLocked) return false;
    const from = playerLocation(play, selectedUnit, selectedPlayerId);
    if (!from) return false;
    movePlayerTo(selectedUnit, selectedPlayerId, [from[0] + dx, from[1] + dy]);
    return true;
  };

  /*
   * Pointer capture is best-effort: the pointer can already be released (or be a
   * synthetic event), and a throw here would break selection entirely.
   */
  const capturePointer = (element, pointerId) => {
    try {
      element?.setPointerCapture?.(pointerId);
    } catch {
      // no active pointer; dragging simply will not capture
    }
  };

  const openGameDay = () => {
    if (gameDay && (gameDay.playbookId !== activePlaybook.id || gameDay.playId !== play.id)) {
      const targetBook = playbooks.find((book) => book.id === gameDay.playbookId);
      if (targetBook) {
        setWorkspace((current) => ({ ...current, activePlaybookId: targetBook.id }));
        setPlayId(gameDay.playId);
      }
    }
    setGameDayDialog(true);
  };

  const startGameDay = () => {
    setGameDay({ playbookId: activePlaybook.id, playId: play.id, snapshot: clonePlaybook([play])[0], startedAt: new Date().toISOString() });
    setGameDayDialog(false);
    notify("Temporary game-day variation started");
  };

  const resolveGameDay = (resolution) => {
    if (!gameDay) return;
    if (gameDay.playbookId !== activePlaybook.id) {
      notifyProblem("Open the adjusted playbook before resolving this change");
      return;
    }
    const sourceIndex = library.findIndex((item) => item.id === gameDay.playId);
    const current = library[sourceIndex];
    const snapshot = gameDay.snapshot;
    let nextLibrary = [...library];
    let nextId = snapshot.id;

    if (resolution === "discard") {
      nextLibrary[sourceIndex] = snapshot;
      notify("Temporary changes discarded");
    } else if (resolution === "replace") {
      notify("Original play updated");
    } else {
      const isVariation = resolution === "variation";
      const baseName = isVariation ? `${snapshot.name} Variation` : `${snapshot.name} New`;
      const saved = {
        ...clonePlaybook([current])[0],
        id: `${snapshot.id}-${isVariation ? "variation" : "new"}-${Date.now()}`,
        name: uniqueName(library, baseName),
        variantOf: isVariation ? snapshot.id : null,
      };
      nextLibrary[sourceIndex] = snapshot;
      nextLibrary.push(saved);
      nextId = saved.id;
      notify(isVariation ? "Saved as a linked variation" : "Saved as a new play");
    }

    setLibrary(nextLibrary);
    setPlayId(nextId);
    const nextPlay = nextLibrary.find((item) => item.id === nextId);
    if (compactViewport()) clearSelection();
    else focusAssignment(nextPlay, defaultAssignmentId(nextPlay));
    setGameDay(null);
    setGameDayDialog(false);
  };

  const anyDialogOpen = gameDayDialog || detailsDialog || createPlayDialog || deletePlayDialog
    || newPlaybookDialog || saveFormationDialog || applyFormationDialog || saveConceptDialog
    || applyConceptDialog || dataToolsDialog || printPreview;

  /*
   * Keyboard shortcuts. The app previously had none at all -- no undo, no Escape,
   * no delete, no way to nudge a player -- which for an editor is a significant
   * gap for keyboard and iPad-with-keyboard use alike.
   *
   * Dialogs own their own keys (Modal handles Escape and the focus trap), and
   * typing in a field is never intercepted.
   */
  useEffect(() => {
    const isTyping = (target) => (
      target instanceof HTMLElement
      && (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable)
    );

    const onKeyDown = (event) => {
      if (anyDialogOpen || isTyping(event.target)) return;
      const accel = event.metaKey || event.ctrlKey;

      if (accel && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (accel && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (accel) return;

      switch (event.key) {
        case "Escape":
          event.preventDefault();
          // Step back out: drop a drawing tool first, then the selection.
          if (activeTool !== "Select") setActiveTool("Select");
          else if (present) setPresent(false);
          else clearSelection();
          return;
        case "Delete":
        case "Backspace":
          if (!route) return;
          event.preventDefault();
          deleteAssignment();
          return;
        case " ":
          event.preventDefault();
          toggleRun();
          return;
        case "ArrowLeft":
        case "ArrowRight":
        case "ArrowUp":
        case "ArrowDown": {
          // Shift is a coarse yard step; otherwise a fine tenth-of-a-yard step.
          const step = event.shiftKey ? 1 : 0.25;
          const [dx, dy] = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, step],
            ArrowDown: [0, -step],
          }[event.key];
          if (nudgeSelection(dx, dy)) event.preventDefault();
          return;
        }
        case "[":
          event.preventDefault();
          selectAdjacentPlay(-1);
          return;
        case "]":
          event.preventDefault();
          selectAdjacentPlay(1);
          return;
        default:
          break;
      }

      // Number keys pick a tool, matching the order of the rail.
      const toolIndex = Number(event.key) - 1;
      if (Number.isInteger(toolIndex) && toolIndex >= 0 && toolIndex < toolItems.length - 1) {
        event.preventDefault();
        setActiveTool(toolItems[toolIndex][0]);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // Deliberately no dependency list: the handler closes over the current
    // selection, tool and history, and re-binding each render keeps it correct
    // rather than acting on a stale snapshot.
  });

  return (
    <main className={`app-shell ${present ? "is-presenting" : ""}`} tabIndex={-1}>
      <Header
        activePlaybook={activePlaybook}
        formationLegal={currentFormationStatus.legal}
        mainPlaybook={mainPlaybook}
        onCopy={copyToMain}
        onCreate={() => setNewPlaybookDialog(true)}
        onDataTools={() => {
          setRestoreCandidate(null);
          setRestoreError("");
          setDataToolsDialog(true);
        }}
        offlineStatus={offlineStatus}
        onSwitch={switchPlaybook}
        play={play}
        playbooks={playbooks}
        present={present}
        playback={playback}
        onPresent={() => setPresent((value) => !value)}
        onRun={toggleRun}
        view={view}
        onView={(nextView) => { setView(nextView); setPlayback("idle"); }}
        temporary={temporary}
      />
      {!present ? (
        <Filmstrip
          family={activePlaybook.name}
          library={visibleLibrary}
          fullCount={library.length}
          folders={folders}
          folder={browserFolder}
          query={browserQuery}
          activeId={play.id}
          onChange={selectPlay}
          onCreate={() => setCreatePlayDialog(true)}
          onFolder={setBrowserFolder}
          onQuery={setBrowserQuery}
        />
      ) : null}
      <section className="editor-shell">
        {!present ? (
          <ToolRail
            activeTool={activeTool}
            canAddPlayer={play.players.length < 11}
            canRedo={canRedo}
            canUndo={canUndo}
            onAddPlayer={addPlayer}
            onDelete={() => setDeletePlayDialog(true)}
            onDetails={() => setDetailsDialog(true)}
            onDuplicate={duplicatePlay}
            onApplyConcept={() => setApplyConceptDialog(true)}
            onApplyFormation={() => setApplyFormationDialog(true)}
            onGameDay={openGameDay}
            onRedo={redo}
            onSaveConcept={() => setSaveConceptDialog(true)}
            onSaveFormation={() => setSaveFormationDialog(true)}
            onTool={setActiveTool}
            onUndo={undo}
            temporary={temporary}
          />
        ) : null}
        <div className="canvas-workspace">
          {!present ? <LayerBar layers={layers} onChange={setLayers} view={view} onView={(nextView) => { setView(nextView); setPlayback("idle"); }} /> : null}
          <PlayCanvas
            ref={svgRef}
            activeTool={activeTool}
            draftAssignment={draftAssignment}
            onPointerDown={startDraw}
            onPointerMove={movePointer}
            onPointerUp={finishPointer}
            onStartPointDrag={startPointDrag}
            onSelectPlayer={selectPlayer}
            onSelectAssignment={selectAssignment}
            play={play}
            playKey={`${play.id}-${view}-${runKey}`}
            playback={playback}
            selectedPlayerId={selectedPlayerId}
            selectedAssignmentId={selectedAssignmentId}
            selectedUnit={selectedUnit}
            layers={layers}
            speed={speed}
            view={view}
          />
        </div>
        {!present && selectedPlayerId ? (
          <Inspector
            assignments={playerAssignments}
            route={route}
            unit={selectedUnit}
            label={selectedPlayerLabel}
            locked={currentLayerLocked}
            unavailableTypes={unavailableTypes}
            copyTargets={copyTargets}
            offensePlayers={play.players}
            onAddStage={addAssignmentStage}
            onClose={clearSelection}
            onAssignmentDefinition={changeAssignmentDefinition}
            onCopyAssignment={copyAssignment}
            onDefinition={changeRouteDefinition}
            onDeleteAssignment={deleteAssignment}
            onMirrorAssignment={mirrorAssignment}
            onRegenerate={regenerateRoute}
            onRemovePlayer={removePlayer}
            onRenamePlayer={renamePlayer}
            onSetAssignmentType={setAssignmentType}
            onSelectStage={selectAssignmentStage}
            onTiming={changeAssignmentTiming}
          />
        ) : null}
        {!present && !selectedPlayerId ? <button className="open-inspector" onClick={() => {
          const fallbackId = defaultAssignmentId(play);
          if (fallbackId) {
            focusAssignment(play, fallbackId);
            return;
          }
          // No assignments yet: open on the first skill player instead.
          const player = play.players.find((item) => !isLineLabel(item.label)) ?? play.players[0];
          setSelectedUnit("offense");
          setSelectedPlayerId(player?.id ?? null);
          setSelectedAssignmentId(null);
        }}><CaretLeft size={19} />Player inspector</button> : null}
        {present ? <button className="exit-present" onClick={() => setPresent(false)}><X size={18} />Exit presentation</button> : null}
      </section>
      {!present ? <Timeline assignment={route} playback={playback} onRun={toggleRun} onRestart={restartRun} speed={speed} onSpeed={setSpeed} /> : null}
      {gameDayDialog ? <GameDayDialog active={Boolean(gameDay)} play={gameDay ? playbooks.find((book) => book.id === gameDay.playbookId)?.plays.find((item) => item.id === gameDay.playId) ?? play : play} onClose={() => setGameDayDialog(false)} onStart={startGameDay} onResolve={resolveGameDay} /> : null}
      {detailsDialog ? <PlayDetailsDialog play={play} onClose={() => setDetailsDialog(false)} onSave={(details) => { updatePlay(play.id, (current) => ({ ...current, ...details })); setDetailsDialog(false); notify("Play details saved"); }} /> : null}
      {createPlayDialog ? <CreatePlayDialog currentPlay={play} formations={activePlaybook.formations} onClose={() => setCreatePlayDialog(false)} onCreate={createPlay} /> : null}
      {deletePlayDialog ? <DeletePlayDialog canDelete={library.length > 1} play={play} onClose={() => setDeletePlayDialog(false)} onDelete={deletePlay} /> : null}
      {newPlaybookDialog ? <NewPlaybookDialog onClose={() => setNewPlaybookDialog(false)} onCreate={createPlaybook} /> : null}
      {saveFormationDialog ? <SaveFormationDialog play={play} onClose={() => setSaveFormationDialog(false)} onSave={saveFormation} /> : null}
      {applyFormationDialog ? <ApplyFormationDialog currentFormation={play.formation} formations={activePlaybook.formations} onClose={() => setApplyFormationDialog(false)} onApply={applyFormation} /> : null}
      {saveConceptDialog ? <SaveConceptDialog concepts={activePlaybook.concepts} play={play} onClose={() => setSaveConceptDialog(false)} onSave={saveConcept} /> : null}
      {applyConceptDialog ? <ApplyConceptDialog concepts={activePlaybook.concepts} currentConceptId={play.conceptTemplateId} onClose={() => setApplyConceptDialog(false)} onApply={applyConcept} /> : null}
      {dataToolsDialog ? (
        <DataToolsDialog
          activePlaybook={activePlaybook}
          offlineStatus={offlineStatus}
          onBackup={() => {
            downloadWorkspaceBackup(workspace);
            notify("Football OS backup downloaded");
          }}
          onClose={() => setDataToolsDialog(false)}
          onConfirmRestore={confirmRestore}
          onExportPng={exportCurrentPng}
          onOpenPrint={() => {
            setDataToolsDialog(false);
            setPrintPreview(true);
          }}
          onRefreshOffline={refreshOffline}
          onRestoreFile={chooseRestoreFile}
          restoreCandidate={restoreCandidate}
          restoreError={restoreError}
          workspace={workspace}
        />
      ) : null}
      {printPreview ? <PrintCollectionPreview playbook={activePlaybook} plays={visibleLibrary.length ? visibleLibrary : library} onClose={() => setPrintPreview(false)} /> : null}
      <Feedback
        feedback={feedback}
        onAction={() => {
          feedback?.onAction?.();
          setFeedback(null);
        }}
        onDismiss={() => setFeedback(null)}
      />
    </main>
  );
}
