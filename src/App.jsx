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
import { PlayCanvas } from "./PlayCanvas";
import {
  applyConceptTemplateToPlay,
  applyFormationToPlay,
  assignmentDefinitionToPoints,
  assignmentStartSeconds,
  basePlayers,
  breakDirections,
  clonePlaybook,
  createConceptTemplate,
  createPlayFromFormation,
  defaultFormations,
  defensiveAssignmentTypes,
  formationStatus,
  inferRouteDefinition,
  MAIN_PLAYBOOK_ID,
  normalizePlay,
  playDuration,
  releaseOptions,
  routeDefinitionSummary,
  routeDefinitionToPoints,
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
const GAME_DAY_KEY = "football-os.game-day.v5";
const LEGACY_GAME_DAY_KEY = "football-os.game-day.v4";
const linePlayers = new Set(["LT", "LG", "C", "RG", "RT"]);
const compactViewport = () => typeof window !== "undefined" && window.matchMedia("(max-width: 700px)").matches;
const clampValue = (value, minimum = 2, maximum = 98) => Math.min(maximum, Math.max(minimum, value));

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
      ?? JSON.parse(window.localStorage.getItem(LEGACY_GAME_DAY_KEY));
    return saved?.playId && saved?.snapshot
      ? { ...saved, playbookId: saved.playbookId ?? MAIN_PLAYBOOK_ID, snapshot: normalizePlay(saved.snapshot) }
      : null;
  } catch {
    return null;
  }
}

function defaultRouteIndex(play) {
  const zRoute = play.routes.findIndex((route) => route.unit !== "defense" && route.player === "Z");
  const firstOffense = play.routes.findIndex((route) => route.unit !== "defense");
  return zRoute >= 0 ? zRoute : firstOffense >= 0 ? firstOffense : play.routes.length ? 0 : null;
}

function assignmentPhaseForType(type) {
  return type === "Motion" ? "pre" : "post";
}

function assignmentIndexFor(play, unit, playerId, phase) {
  return play.routes.findIndex((assignment) => (
    (assignment.unit ?? "offense") === unit
    && assignment.player === playerId
    && (!phase || (assignment.phase ?? assignmentPhaseForType(assignment.type)) === phase)
  ));
}

function preferredAssignmentIndex(play, unit, playerId) {
  const postSnap = assignmentIndexFor(play, unit, playerId, "post");
  return postSnap >= 0 ? postSnap : assignmentIndexFor(play, unit, playerId, "pre");
}

function playerLabelFor(play, unit, playerId) {
  if (unit === "defense") return play.defenders.find((player) => player.id === playerId)?.label ?? playerId;
  return playerId;
}

function playerStartFor(play, unit, playerId) {
  if (unit === "defense") {
    const player = play.defenders.find((item) => item.id === playerId);
    return player ? [player.x, player.y] : null;
  }
  const player = play.players.find(([label]) => label === playerId);
  return player ? [player[1], player[2]] : null;
}

function playerExists(play, unit, playerId) {
  return unit === "defense"
    ? play.defenders.some((player) => player.id === playerId)
    : play.players.some(([label]) => label === playerId);
}

function createAssignment({ playId, playerId, start, type, unit }) {
  let definition;
  if (type === "Route") {
    definition = sanitizeRouteDefinition({ release: "none", stemYards: 10, breaks: [], condition: "" });
  } else if (type === "Block") {
    definition = sanitizeBlockDefinition({ technique: "drive", direction: start[0] < 50 ? "right" : "left", target: "", climb: false });
  } else if (type === "Motion") {
    definition = sanitizeMotionDefinition({ motionType: "jet", direction: start[0] < 50 ? "right" : "left", distanceYards: 18 });
  } else {
    definition = sanitizeDefensiveDefinition(type, {});
  }
  const points = type === "Route"
    ? routeDefinitionToPoints(start, definition)
    : assignmentDefinitionToPoints(start, type, definition);
  return {
    id: `${playId}-${unit}-${playerId.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
    player: playerId,
    unit,
    type,
    preset: type === "Route" ? "Structured" : titleCase(definition.technique ?? definition.motionType ?? definition.area ?? definition.responsibility ?? type),
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
  const [open, setOpen] = useState(false);
  const canCopy = activePlaybook.id !== mainPlaybook.id;
  return (
    <div className="playbook-switcher">
      <button
        className="playbook-trigger"
        aria-label={`Playbook ${activePlaybook.name}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
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

function previewPoint([x, y]) {
  return [12 + x * 1.24, 5 + (y - 18) * 0.62];
}

function MiniDiagram({ play }) {
  const players = play.players ?? basePlayers;
  return (
    <svg className="mini-diagram" viewBox="0 0 148 58" aria-hidden="true">
      {players.map(([label, x, y]) => {
        const [cx, cy] = previewPoint([x, y]);
        return <circle key={`${play.id}-${label}-player`} className={label === "Z" ? "focus" : undefined} cx={cx} cy={cy} r="3.25" />;
      })}
      {play.routes.map((route, index) => (
        <polyline
          key={route.id}
          points={route.points.map((point) => previewPoint(point).join(",")).join(" ")}
          className={`mini-route ${route.player === "Z" || index === play.routes.length - 1 ? "active" : ""}`}
        />
      ))}
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
    <section className="filmstrip" aria-label={`${family} playbook plays`}>
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
            onClick={() => onChange(play.id)}
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
  const [open, setOpen] = useState(false);
  return (
    <nav className="tool-rail" aria-label="Drawing tools">
      {toolItems.map(([name, Icon]) => (
        <div className="tool-slot" key={name}>
          <button
            className={`tool-button ${activeTool === name ? "active" : ""}`}
            onClick={() => {
              if (name === "More") setOpen((value) => !value);
              else { setOpen(false); onTool(name); }
            }}
            aria-pressed={activeTool === name}
          >
            <span className="tool-icon"><Icon size={23} weight={activeTool === name ? "duotone" : "regular"} /></span>
            <span>{name}</span>
          </button>
          {name === "More" && open ? (
            <div className="tool-menu authoring-menu">
              <button disabled={!canUndo} onClick={() => { onUndo(); setOpen(false); }}><ArrowCounterClockwise size={19} />Undo</button>
              <button disabled={!canRedo} onClick={() => { onRedo(); setOpen(false); }}><ArrowClockwise size={19} />Redo</button>
              <span className="tool-menu-rule" />
              <button onClick={() => { onDuplicate(); setOpen(false); }}><Copy size={19} />Duplicate as variation</button>
              <button disabled={!canAddPlayer} onClick={() => { onAddPlayer(); setOpen(false); }}><PlusCircle size={19} />Add player</button>
              <button onClick={() => { onApplyFormation(); setOpen(false); }}><UserFocus size={19} />Apply formation</button>
              <button onClick={() => { onSaveFormation(); setOpen(false); }}><FloppyDisk size={19} />Save formation</button>
              <button onClick={() => { onApplyConcept(); setOpen(false); }}><GitMerge size={19} />Apply concept</button>
              <button onClick={() => { onSaveConcept(); setOpen(false); }}><Stack size={19} />Save concept</button>
              <button onClick={() => { onGameDay(); setOpen(false); }}><SlidersHorizontal size={19} />{temporary ? "Resolve adjustment" : "Game Day Adjust"}</button>
              <button onClick={() => { onDetails(); setOpen(false); }}><NotePencil size={19} />Play details</button>
              <span className="tool-menu-rule" />
              <button className="danger-action" onClick={() => { onDelete(); setOpen(false); }}><Trash size={19} />Delete play</button>
            </div>
          ) : null}
        </div>
      ))}
    </nav>
  );
}

function LayerBar({ layers, onChange }) {
  const update = (name, patch) => onChange((current) => ({
    ...current,
    [name]: { ...current[name], ...patch },
  }));
  return (
    <div className="layer-bar" aria-label="Canvas layers">
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
  playerLabel,
  route,
  unit,
}) {
  if (!playerLabel) return null;
  return (
    <aside className="inspector" aria-label="Selected player inspector">
      <div className="inspector-head"><div><small>{titleCase(unit)}</small><h2>{route ? route.type : "Player"}</h2></div><button className="icon-control" aria-label="Close player inspector" onClick={onClose}><X size={21} /></button></div>
      <div className="selected-assignment">
        <span className={`assignment-badge ${unit}`}>{playerLabel}</span>
        <div><strong>{playerLabel}{route ? ` ${route.type}` : " selected"}</strong><span title={route?.type === "Route" ? routeDefinitionSummary(route.definition) : undefined}><i aria-hidden="true" />{route?.type === "Route" ? `${route.definition.stemYards} yd stem · ${route.definition.breaks.length} break${route.definition.breaks.length === 1 ? "" : "s"}` : route?.preset ?? "Drag to reposition"}</span></div>
      </div>
      <AssignmentStagePicker
        activeId={route?.id ?? null}
        assignments={assignments}
        onAdd={onAddStage}
        onSelect={onSelectStage}
        unit={unit}
      />
      {route?.inheritedFrom ? (
        <div className={`concept-source ${route.templateOverride ? "override" : ""}`}>
          <GitMerge size={16} />
          <span>{route.templateOverride ? "Play-level override" : `Inherited from ${route.inheritedFrom.conceptName}`}</span>
        </div>
      ) : null}
      <PositionLabelControl label={playerLabel} onSave={onRenamePlayer} />
      <div className="control-group">
        <span>Assignment</span>
        <AssignmentTypePicker unit={unit} value={route?.type ?? ""} onChange={onSetAssignmentType} />
      </div>
      {locked ? <div className="locked-layer-note"><LockSimple size={17} />Unlock the {unit} layer to edit assignments.</div> : null}
      {route ? <TimingControls assignment={route} onChange={onTiming} /> : null}
      {route?.type === "Route" ? <RouteDefinitionEditor route={route} onChange={onDefinition} onRegenerate={onRegenerate} /> : null}
      {route?.type === "Block" ? <BlockEditor definition={route.definition} onChange={onAssignmentDefinition} /> : null}
      {route?.type === "Motion" ? <MotionEditor definition={route.definition} onChange={onAssignmentDefinition} /> : null}
      {route && unit === "defense" ? <DefensiveEditor assignment={route} offensePlayers={offensePlayers} onChange={onAssignmentDefinition} /> : null}
      {route ? <AssignmentTransfer targets={copyTargets} onCopy={onCopyAssignment} onMirror={onMirrorAssignment} /> : null}
      {route ? <button className="inspector-secondary danger-text" onClick={onDeleteAssignment}><Trash size={17} />Delete assignment</button> : (
        <p className="inspector-hint">Choose an assignment type above. The path appears immediately and can be drawn or refined with its handles.</p>
      )}
      <button className="advanced-toggle remove-player" onClick={onRemovePlayer}><Trash size={18} />Remove {unit === "defense" ? "defender" : "player"}</button>
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
    <div className="modal-scrim" role="dialog" aria-modal="true" aria-label="Game day adjustment">
      <section className="adjustment-modal">
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
      </section>
    </div>
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
    <div className="modal-scrim" role="dialog" aria-modal="true" aria-label="Play details">
      <form className="adjustment-modal details-modal" onSubmit={(event) => {
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
      </form>
    </div>
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
    <div className="modal-scrim" role="dialog" aria-modal="true" aria-label="Create a play">
      <form className="adjustment-modal details-modal create-play-modal" onSubmit={(event) => {
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
      </form>
    </div>
  );
}

function SaveFormationDialog({ play, onClose, onSave }) {
  const [name, setName] = useState(play.formation || "");
  const status = formationStatus(play.players);
  const canSave = name.trim().length > 0 && status.legal;
  return (
    <div className="modal-scrim" role="dialog" aria-modal="true" aria-label="Save formation">
      <form className="adjustment-modal details-modal" onSubmit={(event) => {
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
      </form>
    </div>
  );
}

function ApplyFormationDialog({ currentFormation, formations, onApply, onClose }) {
  const [formationId, setFormationId] = useState(
    formations.find((formation) => formation.name === currentFormation)?.id ?? formations[0]?.id ?? "",
  );
  const formation = formations.find((item) => item.id === formationId);
  const status = formationStatus(formation?.players ?? []);
  return (
    <div className="modal-scrim" role="dialog" aria-modal="true" aria-label="Apply formation">
      <form className="adjustment-modal details-modal" onSubmit={(event) => {
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
      </form>
    </div>
  );
}

function DeletePlayDialog({ canDelete, onClose, onDelete, play }) {
  return (
    <div className="modal-scrim" role="dialog" aria-modal="true" aria-label="Delete play">
      <section className="adjustment-modal destructive-modal">
        <div className="adjustment-icon danger-icon"><Trash size={25} /></div>
        <span className="modal-label">Delete play</span>
        <h2>{canDelete ? `Delete ${play.name}?` : "Keep at least one play"}</h2>
        <p>{canDelete ? "This removes the play from this playbook. This action is not part of undo history." : "Create another play before deleting this one."}</p>
        <button className="modal-danger" disabled={!canDelete} onClick={onDelete}>Delete play</button>
        <button className="modal-close" onClick={onClose}><X size={18} />Cancel</button>
      </section>
    </div>
  );
}

function NewPlaybookDialog({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const canCreate = name.trim().length > 0;
  return (
    <div className="modal-scrim" role="dialog" aria-modal="true" aria-label="Create a playbook">
      <form className="adjustment-modal details-modal" onSubmit={(event) => {
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
      </form>
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
  const [selectedRoute, setSelectedRoute] = useState(() => compactViewport() ? null : 3);
  const [selectedPlayer, setSelectedPlayer] = useState(() => compactViewport() ? null : "Z");
  const [selectedUnit, setSelectedUnit] = useState("offense");
  const [layers, setLayers] = useState({
    offense: { visible: true, dimmed: false, locked: false },
    defense: { visible: true, dimmed: false, locked: false },
    assignments: { visible: true },
  });
  const [browserQuery, setBrowserQuery] = useState("");
  const [browserFolder, setBrowserFolder] = useState("all");
  const [draftRoute, setDraftRoute] = useState([]);
  const [toast, setToast] = useState("");
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
  const route = selectedRoute === null ? null : play.routes[selectedRoute] ?? null;
  const selectedPlayerLabel = selectedPlayer ? playerLabelFor(play, selectedUnit, selectedPlayer) : null;
  const playerAssignments = useMemo(() => selectedPlayer
    ? play.routes.filter((assignment) => (assignment.unit ?? "offense") === selectedUnit && assignment.player === selectedPlayer)
    : [], [play.routes, selectedPlayer, selectedUnit]);
  const currentLayerLocked = layers[selectedUnit]?.locked ?? false;
  const copyTargets = useMemo(() => {
    if (!selectedPlayer) return [];
    const phase = route?.phase ?? assignmentPhaseForType(route?.type);
    const assigned = new Set(play.routes
      .filter((assignment) => (
        (assignment.unit ?? "offense") === selectedUnit
        && (assignment.phase ?? assignmentPhaseForType(assignment.type)) === phase
      ))
      .map((assignment) => assignment.player));
    if (selectedUnit === "defense") {
      return play.defenders
        .filter((player) => player.id !== selectedPlayer && !assigned.has(player.id))
        .map((player) => ({ id: player.id, label: player.label }));
    }
    return play.players
      .filter(([label]) => label !== selectedPlayer && !assigned.has(label))
      .map(([label]) => ({ id: label, label }));
  }, [play.defenders, play.players, play.routes, route?.phase, route?.type, selectedPlayer, selectedUnit]);
  const temporary = gameDay?.playbookId === activePlaybook.id && gameDay?.playId === play.id;
  const currentFormationStatus = formationStatus(play.players);
  const historyEntry = historyRef.current.get(play.id) ?? { past: [], future: [] };
  const canUndo = historyEntry.past.length > 0;
  const canRedo = historyEntry.future.length > 0;

  useEffect(() => {
    window.localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace));
  }, [workspace]);

  useEffect(() => subscribeOfflineStatus(setOfflineStatus), []);

  useEffect(() => {
    if (gameDay) window.localStorage.setItem(GAME_DAY_KEY, JSON.stringify(gameDay));
    else window.localStorage.removeItem(GAME_DAY_KEY);
  }, [gameDay]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (playback !== "running") return undefined;
    const duration = playDuration(play.routes, speed);
    const timer = window.setTimeout(() => setPlayback("idle"), duration * 1000 + 150);
    return () => window.clearTimeout(timer);
  }, [play.routes, playback, runKey, speed]);

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

  const updateRoute = (updater, options = {}) => {
    if (selectedRoute === null) return;
    const { markOverride = true, ...historyOptions } = options;
    updatePlay(play.id, (current) => ({
      ...current,
      routes: current.routes.map((item, index) => {
        if (index !== selectedRoute) return item;
        const updated = updater(item);
        return markOverride && item.inheritedFrom ? { ...updated, templateOverride: true } : updated;
      }),
    }), historyOptions);
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
    const nextRoute = selectedPlayer ? assignmentIndexFor(previous, selectedUnit, selectedPlayer, route?.phase) : -1;
    setSelectedRoute(nextRoute >= 0 ? nextRoute : null);
    if (selectedPlayer && !playerExists(previous, selectedUnit, selectedPlayer)) setSelectedPlayer(null);
    setHistoryVersion((value) => value + 1);
    setToast("Undid last change");
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
    const nextRoute = selectedPlayer ? assignmentIndexFor(next, selectedUnit, selectedPlayer, route?.phase) : -1;
    setSelectedRoute(nextRoute >= 0 ? nextRoute : null);
    if (selectedPlayer && !playerExists(next, selectedUnit, selectedPlayer)) setSelectedPlayer(null);
    setHistoryVersion((value) => value + 1);
    setToast("Redid change");
  };

  const selectPlay = (nextId) => {
    const nextPlay = library.find((item) => item.id === nextId);
    if (!nextPlay) return;
    const nextRouteIndex = compactViewport() ? null : defaultRouteIndex(nextPlay);
    setPlayId(nextId);
    setSelectedRoute(nextRouteIndex);
    setSelectedPlayer(nextRouteIndex === null ? null : nextPlay.routes[nextRouteIndex]?.player ?? null);
    setSelectedUnit(nextRouteIndex === null ? "offense" : nextPlay.routes[nextRouteIndex]?.unit ?? "offense");
    setDraftRoute([]);
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
    const nextRouteIndex = compactViewport() ? null : defaultRouteIndex(nextPlay);
    setWorkspace((current) => ({ ...current, activePlaybookId: nextBookId }));
    setPlayId(nextPlay.id);
    setSelectedRoute(nextRouteIndex);
    setSelectedPlayer(nextRouteIndex === null ? null : nextPlay.routes[nextRouteIndex]?.player ?? null);
    setSelectedUnit(nextRouteIndex === null ? "offense" : nextPlay.routes[nextRouteIndex]?.unit ?? "offense");
    setBrowserQuery("");
    setBrowserFolder("all");
    setDraftRoute([]);
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
    setToast(`${play.name} added to ${mainPlaybook.name}`);
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
    setSelectedRoute(null);
    setSelectedPlayer(null);
    setSelectedUnit("offense");
    setNewPlaybookDialog(false);
    setToast(`${name} created`);
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
        routes: play.routes.map((item, index) => ({ ...clonePlaybook([item])[0], id: `${id}-assignment-${index + 1}` })),
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
      setToast("A name and legal formation are required");
      return;
    }

    setLibrary((current) => [...current, created]);
    setPlayId(created.id);
    setSelectedRoute(null);
    setSelectedPlayer(null);
    setSelectedUnit("offense");
    setCreatePlayDialog(false);
    setActiveTool("Select");
    setToast(`${created.name} created`);
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
    const nextRouteIndex = compactViewport() ? null : defaultRouteIndex(nextPlay);
    setSelectedRoute(nextRouteIndex);
    setSelectedPlayer(nextRouteIndex === null ? null : nextPlay.routes[nextRouteIndex]?.player ?? null);
    setSelectedUnit(nextRouteIndex === null ? "offense" : nextPlay.routes[nextRouteIndex]?.unit ?? "offense");
    setDeletePlayDialog(false);
    setToast(`${play.name} deleted`);
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
    setToast(`${name} saved for reuse`);
  };

  const applyFormation = (formationId) => {
    const formation = activePlaybook.formations.find((item) => item.id === formationId);
    if (!formation || !formationStatus(formation.players).legal) {
      setToast("Choose a legal saved formation");
      return;
    }
    const nextLabels = new Set(formation.players.map(([label]) => label));
    const removed = play.routes.filter((assignment) => (assignment.unit ?? "offense") === "offense" && !nextLabels.has(assignment.player)).length;
    updatePlay(play.id, (current) => applyFormationToPlay(current, formation));
    setSelectedRoute(null);
    setSelectedPlayer(null);
    setSelectedUnit("offense");
    setApplyFormationDialog(false);
    setToast(`${formation.name} applied${removed ? ` · ${removed} unmatched assignment${removed === 1 ? "" : "s"} removed` : " · matching assignments preserved"}`);
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
    setToast(`${name} concept ${existing ? "updated" : "saved"}`);
  };

  const applyConcept = (conceptId) => {
    const concept = activePlaybook.concepts.find((item) => item.id === conceptId);
    if (!concept) return;
    updatePlay(play.id, (current) => applyConceptTemplateToPlay(current, concept));
    setSelectedRoute(null);
    setSelectedPlayer(null);
    setSelectedUnit("offense");
    setApplyConceptDialog(false);
    setToast(`${concept.name} applied · play-level overrides preserved`);
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
    setSelectedRoute(null);
    setSelectedPlayer(null);
    setSelectedUnit("offense");
    setGameDay(null);
    setRestoreCandidate(null);
    setDataToolsDialog(false);
    setToast(`Backup restored · previous workspace kept as a recovery copy`);
  };

  const exportCurrentPng = async () => {
    try {
      await downloadPlayPng(svgRef.current, play.name);
      setToast(`${play.name} PNG downloaded`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "PNG export failed");
    }
  };

  const refreshOffline = async () => {
    const ready = await refreshOfflineCopy();
    setToast(ready ? "Offline game-day copy refreshed" : "Offline copy could not be refreshed yet");
  };

  const renamePlayer = (nextLabel) => {
    if (!selectedPlayer || nextLabel === selectedPlayerLabel) return;
    if (currentLayerLocked) {
      setToast(`Unlock the ${selectedUnit} layer to relabel players`);
      return;
    }
    if (selectedUnit === "defense") {
      updatePlay(play.id, (current) => ({
        ...current,
        defenders: current.defenders.map((player) => player.id === selectedPlayer ? { ...player, label: nextLabel } : player),
      }));
      setToast(`${selectedPlayerLabel} relabeled as ${nextLabel}`);
      return;
    }
    if (play.players.some(([label]) => label === nextLabel)) {
      setToast(`${nextLabel} is already used in this formation`);
      return;
    }
    const previousLabel = selectedPlayer;
    updatePlay(play.id, (current) => ({
      ...current,
      players: current.players.map(([label, x, y]) => label === previousLabel ? [nextLabel, x, y] : [label, x, y]),
      routes: current.routes.map((item) => item.player === previousLabel ? { ...item, player: nextLabel } : item),
    }));
    setSelectedPlayer(nextLabel);
    setToast(`${previousLabel} relabeled as ${nextLabel}`);
  };

  const deleteAssignment = () => {
    if (selectedRoute === null || !route) return;
    if (currentLayerLocked) {
      setToast(`Unlock the ${selectedUnit} layer to delete assignments`);
      return;
    }
    const fallbackIndex = play.routes.findIndex((item, index) => (
      index !== selectedRoute
      && (item.unit ?? "offense") === selectedUnit
      && item.player === selectedPlayer
    ));
    updatePlay(play.id, (current) => ({
      ...current,
      routes: current.routes.filter((_, index) => index !== selectedRoute),
    }));
    setSelectedRoute(fallbackIndex < 0 ? null : fallbackIndex > selectedRoute ? fallbackIndex - 1 : fallbackIndex);
    setToast(`${route.player} ${route.type.toLowerCase()} deleted`);
  };

  const removePlayer = () => {
    if (!selectedPlayer) return;
    if (currentLayerLocked) {
      setToast(`Unlock the ${selectedUnit} layer to remove players`);
      return;
    }
    const removed = selectedPlayer;
    updatePlay(play.id, (current) => selectedUnit === "defense"
      ? {
          ...current,
          defenders: current.defenders.filter((player) => player.id !== removed),
          routes: current.routes.filter((item) => !((item.unit ?? "offense") === "defense" && item.player === removed)),
        }
      : {
          ...current,
          players: current.players.filter(([label]) => label !== removed),
          routes: current.routes.filter((item) => !((item.unit ?? "offense") === "offense" && item.player === removed)),
        });
    setSelectedPlayer(null);
    setSelectedRoute(null);
    setSelectedUnit("offense");
    setToast(`${selectedPlayerLabel} removed — undo to restore`);
  };

  const addPlayer = () => {
    if (play.players.length >= 11) return;
    const labels = new Set(play.players.map(([label]) => label));
    let nextLabel = "P";
    let suffix = 2;
    while (labels.has(nextLabel)) {
      nextLabel = `P${suffix}`;
      suffix += 1;
    }
    updatePlay(play.id, (current) => ({
      ...current,
      players: [...current.players, [nextLabel, 50, 88]],
    }));
    setSelectedUnit("offense");
    setSelectedPlayer(nextLabel);
    setSelectedRoute(null);
    setToast(`${nextLabel} added — drag and relabel the player`);
  };

  const setAssignmentType = (type) => {
    if (!selectedPlayer) return;
    if (currentLayerLocked) {
      setToast(`Unlock the ${selectedUnit} layer to edit assignments`);
      return;
    }
    const allowed = selectedUnit === "defense" ? defensiveAssignmentTypes : ["Route", "Block", "Motion"];
    if (!allowed.includes(type)) return;
    if (selectedUnit === "offense" && linePlayers.has(selectedPlayer) && type !== "Block") {
      setToast(`${selectedPlayer} uses blocking assignments`);
      return;
    }
    const targetPhase = selectedUnit === "defense" ? "post" : assignmentPhaseForType(type);
    const targetIndex = assignmentIndexFor(play, selectedUnit, selectedPlayer, targetPhase);
    if (targetIndex >= 0 && play.routes[targetIndex]?.type === type) {
      setSelectedRoute(targetIndex);
      return;
    }
    const start = playerStartFor(play, selectedUnit, selectedPlayer);
    if (!start) return;
    const previousAssignment = targetIndex >= 0 ? play.routes[targetIndex] : null;
    const nextAssignment = {
      ...createAssignment({
      playId: play.id,
      playerId: selectedPlayer,
      start,
      type,
      unit: selectedUnit,
      }),
      ...(play.conceptTemplateId ? { templateOverride: true } : {}),
      ...(previousAssignment?.inheritedFrom ? { inheritedFrom: previousAssignment.inheritedFrom } : {}),
    };
    if (targetIndex < 0) {
      updatePlay(play.id, (current) => ({ ...current, routes: [...current.routes, nextAssignment] }));
      setSelectedRoute(play.routes.length);
    } else {
      updatePlay(play.id, (current) => ({
        ...current,
        routes: current.routes.map((item, index) => index === targetIndex ? nextAssignment : item),
      }));
      setSelectedRoute(targetIndex);
    }
    setActiveTool(selectedUnit === "defense" ? "Defense" : type);
    setToast(`${selectedPlayerLabel} ${type.toLowerCase()} assignment ready`);
  };

  const selectAssignmentStage = (assignmentId) => {
    const index = play.routes.findIndex((assignment) => assignment.id === assignmentId);
    if (index >= 0) setSelectedRoute(index);
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
    setAssignmentType(linePlayers.has(selectedPlayer) ? "Block" : "Route");
  };

  const changeAssignmentDefinition = (nextDefinition) => {
    if (!route || currentLayerLocked) return;
    const start = playerStartFor(play, selectedUnit, selectedPlayer);
    if (!start) return;
    const definition = route.type === "Block"
      ? sanitizeBlockDefinition(nextDefinition)
      : route.type === "Motion"
        ? sanitizeMotionDefinition(nextDefinition)
        : sanitizeDefensiveDefinition(route.type, nextDefinition);
    let points = assignmentDefinitionToPoints(start, route.type, definition);
    if (route.type === "Man") {
      const target = play.players.find(([label]) => label === definition.target);
      if (target) {
        const leverageOffset = definition.leverage === "inside" ? (target[1] < 50 ? 3 : -3) : definition.leverage === "outside" ? (target[1] < 50 ? -3 : 3) : 0;
        points = [start, [clampValue(target[1] + leverageOffset), clampValue(target[2] - 5, 4, 96)]];
      }
    }
    updateRoute((current) => ({
      ...current,
      definition,
      preset: titleCase(definition.technique ?? definition.motionType ?? definition.area ?? definition.responsibility ?? current.type),
      points,
      geometryMode: "structured",
    }));
    setToast(`${selectedPlayerLabel} ${route.type.toLowerCase()} updated`);
  };

  const changeAssignmentTiming = (patch) => {
    if (!route || currentLayerLocked) return;
    updateRoute((current) => ({ ...current, ...patch }));
  };

  const copyAssignment = (targetId) => {
    if (!route || currentLayerLocked) return;
    const sourceStart = playerStartFor(play, selectedUnit, selectedPlayer);
    const targetStart = playerStartFor(play, selectedUnit, targetId);
    const phase = route.phase ?? assignmentPhaseForType(route.type);
    if (!sourceStart || !targetStart || assignmentIndexFor(play, selectedUnit, targetId, phase) >= 0) return;
    const dx = targetStart[0] - sourceStart[0];
    const dy = targetStart[1] - sourceStart[1];
    const copy = {
      ...clonePlaybook([route])[0],
      id: `${play.id}-${selectedUnit}-${targetId.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${phase}-${Date.now()}`,
      player: targetId,
      points: route.points.map(([x, y]) => [clampValue(x + dx), clampValue(y + dy, 4, 96)]),
      evidence: route.evidence ? { ...route.evidence, coachEdited: true, method: "coach-copied" } : route.evidence,
      templateOverride: route.inheritedFrom ? true : route.templateOverride,
    };
    updatePlay(play.id, (current) => ({ ...current, routes: [...current.routes, copy] }));
    setSelectedPlayer(targetId);
    setSelectedRoute(play.routes.length);
    setToast(`Assignment copied to ${playerLabelFor(play, selectedUnit, targetId)}`);
  };

  const mirrorAssignment = () => {
    if (!route || currentLayerLocked) return;
    const start = playerStartFor(play, selectedUnit, selectedPlayer);
    if (!start) return;
    updateRoute((current) => ({
      ...current,
      preset: `${current.preset ?? current.type} Mirror`,
      geometryMode: "manual",
      points: current.points.map(([x, y]) => [clampValue(start[0] - (x - start[0])), y]),
      evidence: current.evidence ? { ...current.evidence, coachEdited: true } : current.evidence,
    }));
    setToast(`${selectedPlayerLabel} assignment mirrored`);
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

  const pointerPoint = (event) => {
    const box = svgRef.current?.parentElement?.getBoundingClientRect();
    if (!box) return [50, 50];
    const x = Math.min(98, Math.max(2, ((event.clientX - box.left) / box.width) * 100));
    const y = Math.min(96, Math.max(4, ((event.clientY - box.top) / box.height) * 100));
    return view === "end" ? [x, y] : [y, 100 - x];
  };

  const startDraw = (event) => {
    if (activeTool === "Select") {
      canvasSwipe.current = { x: event.clientX, y: event.clientY };
      return;
    }
    const drawingTool = ["Route", "Block", "Motion"].includes(activeTool)
      || (activeTool === "Defense" && route?.unit === "defense");
    if (!drawingTool) return;
    if (selectedRoute === null) {
      setToast(`Select a ${activeTool === "Defense" ? "defender" : "player"} before drawing`);
      return;
    }
    if (currentLayerLocked || !layers.assignments.visible) {
      setToast(currentLayerLocked ? `Unlock the ${selectedUnit} layer to draw` : "Show the assignments layer to draw");
      return;
    }
    if (activeTool !== "Defense" && route?.type !== activeTool) {
      setToast(`${route?.player ?? "This player"} already has a ${route?.type.toLowerCase() ?? "different assignment"}`);
      return;
    }
    drawing.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const start = route.points[0];
    const next = pointerPoint(event);
    setDraftRoute(Math.hypot(next[0] - start[0], next[1] - start[1]) > 1.5 ? [start, next] : [start]);
  };

  const movePointer = (event) => {
    if (playerDrag.current) {
      const next = pointerPoint(event);
      const snapped = playerDrag.current.unit === "offense"
        ? [next[0], Math.abs(next[1] - 73) <= 3.5 ? 73 : next[1]]
        : next;
      if (!playerDrag.current.moved) {
        pushHistory(play.id, playerDrag.current.snapshot);
        playerDrag.current.moved = true;
      }
      const draggedId = playerDrag.current.id;
      const draggedUnit = playerDrag.current.unit;
      updatePlay(play.id, (current) => {
        const currentStart = playerStartFor(current, draggedUnit, draggedId);
        if (!currentStart) return current;
        const dx = snapped[0] - currentStart[0];
        const dy = snapped[1] - currentStart[1];
        return {
          ...current,
          players: draggedUnit === "offense"
            ? current.players.map(([label, x, y]) => label === draggedId ? [label, snapped[0], snapped[1]] : [label, x, y])
            : current.players,
          defenders: draggedUnit === "defense"
            ? current.defenders.map((player) => player.id === draggedId ? { ...player, x: snapped[0], y: snapped[1] } : player)
            : current.defenders,
          routes: current.routes.map((item) => (item.unit ?? "offense") === draggedUnit && item.player === draggedId
            ? {
                ...item,
                points: item.points.map(([x, y]) => [clampValue(x + dx), clampValue(y + dy, 4, 96)]),
                templateOverride: item.inheritedFrom ? true : item.templateOverride,
              }
            : item),
        };
      }, { record: false });
      return;
    }

    if (routePointDrag.current && selectedRoute !== null) {
      if (!routePointDrag.current.moved) {
        pushHistory(play.id, routePointDrag.current.snapshot);
        routePointDrag.current.moved = true;
      }
      const next = pointerPoint(event);
      const pointIndex = routePointDrag.current.pointIndex;
      updateRoute((current) => ({
        ...current,
        preset: "Custom",
        geometryMode: "manual",
        evidence: current.evidence ? { ...current.evidence, coachEdited: true } : current.evidence,
        points: current.points.map((point, index) => index === pointIndex ? next : point),
      }), { record: false });
      return;
    }

    const drawingTool = ["Route", "Block", "Motion"].includes(activeTool) || activeTool === "Defense";
    if (!drawing.current || !drawingTool) return;
    const next = pointerPoint(event);
    setDraftRoute((current) => current.length && Math.hypot(next[0] - current.at(-1)[0], next[1] - current.at(-1)[1]) < 1.5 ? current : [...current, next]);
  };

  const finishPointer = (event) => {
    if (playerDrag.current) {
      const movedLabel = playerLabelFor(play, playerDrag.current.unit, playerDrag.current.id);
      const moved = playerDrag.current.moved;
      playerDrag.current = null;
      if (moved) setToast(`${movedLabel} repositioned`);
      return;
    }
    if (routePointDrag.current) {
      const moved = routePointDrag.current.moved;
      routePointDrag.current = null;
      if (moved) setToast("Assignment landmark updated");
      return;
    }
    if (drawing.current) {
      drawing.current = false;
      if (draftRoute.length > 1) {
        updateRoute((current) => {
          const sketched = { ...current, points: draftRoute, preset: "Custom" };
          return {
            ...sketched,
            definition: current.type === "Route" ? inferRouteDefinition(sketched) : current.definition,
            geometryMode: current.type === "Route" ? "manual" : current.geometryMode,
            evidence: current.evidence ? { ...current.evidence, coachEdited: true } : current.evidence,
          };
        });
        setToast(`${route?.player ?? "Player"} ${route?.type.toLowerCase() ?? "assignment"} updated`);
      }
      setDraftRoute([]);
      setActiveTool("Select");
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
    const existingIndex = toolPhase
      ? assignmentIndexFor(play, unit, playerId, toolPhase)
      : preferredAssignmentIndex(play, unit, playerId);

    setSelectedUnit(unit);
    setSelectedPlayer(playerId);

    if (activeTool === "Select") {
      setSelectedRoute(existingIndex >= 0 ? existingIndex : null);
      if (!layers[unit].locked) {
        playerDrag.current = {
          id: playerId,
          unit,
          moved: false,
          snapshot: clonePlaybook([play])[0],
        };
        event.currentTarget.ownerSVGElement?.parentElement?.setPointerCapture?.(event.pointerId);
      }
      return;
    }

    const unitToolMatches = unit === "defense"
      ? activeTool === "Defense"
      : ["Route", "Block", "Motion"].includes(activeTool);
    if (!unitToolMatches) {
      setSelectedRoute(existingIndex >= 0 ? existingIndex : null);
      setToast(unit === "defense" ? "Use the Defense tool for defensive assignments" : "Choose Route, Block, or Motion for offensive players");
      return;
    }

    if (existingIndex >= 0) {
      setSelectedRoute(existingIndex);
      const existing = play.routes[existingIndex];
      return;
    }

    if (layers[unit].locked) {
      setToast(`Unlock the ${unit} layer to add assignments`);
      return;
    }

    if (unit === "offense" && linePlayers.has(playerId) && activeTool !== "Block") {
      setToast(`${playerId} uses blocking assignments`);
      return;
    }

    const start = playerStartFor(play, unit, playerId);
    if (!start) return;
    const type = unit === "defense" ? "Rush" : activeTool;
    const newRoute = {
      ...createAssignment({ playId: play.id, playerId, start, type, unit }),
      ...(play.conceptTemplateId ? { templateOverride: true } : {}),
    };
    updatePlay(play.id, (current) => ({ ...current, routes: [...current.routes, newRoute] }));
    setSelectedRoute(play.routes.length);
    setToast(`${playerLabelFor(play, unit, playerId)} ${type.toLowerCase()} added — draw or refine its handles`);
  };

  const selectAssignment = (index) => {
    setSelectedRoute(index);
    setSelectedPlayer(play.routes[index]?.player ?? null);
    setSelectedUnit(play.routes[index]?.unit ?? "offense");
  };

  const startPointDrag = (pointIndex, event) => {
    if (selectedRoute === null) return;
    if (currentLayerLocked || !layers.assignments.visible) {
      setToast(currentLayerLocked ? `Unlock the ${selectedUnit} layer to edit paths` : "Show the assignments layer to edit paths");
      return;
    }
    routePointDrag.current = {
      moved: false,
      pointIndex,
      snapshot: clonePlaybook([play])[0],
    };
    event.currentTarget.ownerSVGElement?.parentElement?.setPointerCapture?.(event.pointerId);
  };

  const changeRouteDefinition = (definition) => {
    if (currentLayerLocked) return;
    updateRoute((current) => ({
      ...current,
      definition,
      geometryMode: "structured",
      preset: "Structured",
      points: routeDefinitionToPoints(current.points[0], definition),
      evidence: current.evidence ? { ...current.evidence, coachEdited: true } : current.evidence,
    }));
    setDraftRoute([]);
    setToast(`${route.player} route definition updated`);
  };

  const regenerateRoute = () => {
    if (!route?.definition || currentLayerLocked) return;
    updateRoute((current) => ({
      ...current,
      geometryMode: "structured",
      preset: "Structured",
      points: routeDefinitionToPoints(current.points[0], current.definition),
    }));
    setToast(`${route.player} regenerated from its route definition`);
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
    setToast("Temporary game-day variation started");
  };

  const resolveGameDay = (resolution) => {
    if (!gameDay) return;
    if (gameDay.playbookId !== activePlaybook.id) {
      setToast("Open the adjusted playbook before resolving this change");
      return;
    }
    const sourceIndex = library.findIndex((item) => item.id === gameDay.playId);
    const current = library[sourceIndex];
    const snapshot = gameDay.snapshot;
    let nextLibrary = [...library];
    let nextId = snapshot.id;

    if (resolution === "discard") {
      nextLibrary[sourceIndex] = snapshot;
      setToast("Temporary changes discarded");
    } else if (resolution === "replace") {
      setToast("Original play updated");
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
      setToast(isVariation ? "Saved as a linked variation" : "Saved as a new play");
    }

    setLibrary(nextLibrary);
    setPlayId(nextId);
    const nextPlay = nextLibrary.find((item) => item.id === nextId);
    const nextRouteIndex = compactViewport() ? null : defaultRouteIndex(nextPlay);
    setSelectedRoute(nextRouteIndex);
    setSelectedPlayer(nextRouteIndex === null ? null : nextPlay.routes[nextRouteIndex]?.player ?? null);
    setSelectedUnit(nextRouteIndex === null ? "offense" : nextPlay.routes[nextRouteIndex]?.unit ?? "offense");
    setGameDay(null);
    setGameDayDialog(false);
  };

  return (
    <main className={`app-shell ${present ? "is-presenting" : ""}`}>
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
          {!present ? <LayerBar layers={layers} onChange={setLayers} /> : null}
          <PlayCanvas
            ref={svgRef}
            activeTool={activeTool}
            draftRoute={draftRoute}
            onPointerDown={startDraw}
            onPointerMove={movePointer}
            onPointerUp={finishPointer}
            onStartPointDrag={startPointDrag}
            onSelectPlayer={selectPlayer}
            onSelectRoute={selectAssignment}
            paths={play.routes}
            play={play}
            playKey={`${play.id}-${view}-${runKey}`}
            playback={playback}
            selectedPlayer={selectedPlayer}
            selectedRoute={selectedRoute}
            selectedUnit={selectedUnit}
            layers={layers}
            speed={speed}
            view={view}
          />
        </div>
        {!present && selectedPlayer ? (
          <Inspector
            assignments={playerAssignments}
            route={route}
            unit={selectedUnit}
            playerLabel={selectedPlayerLabel}
            locked={currentLayerLocked}
            copyTargets={copyTargets}
            offensePlayers={play.players}
            onAddStage={addAssignmentStage}
            onClose={() => { setSelectedRoute(null); setSelectedPlayer(null); }}
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
        {!present && !selectedPlayer ? <button className="open-inspector" onClick={() => {
          const nextRouteIndex = defaultRouteIndex(play);
          setSelectedRoute(nextRouteIndex);
          setSelectedPlayer(nextRouteIndex === null ? play.players.find(([label]) => !linePlayers.has(label))?.[0] ?? null : play.routes[nextRouteIndex]?.player ?? null);
          setSelectedUnit(nextRouteIndex === null ? "offense" : play.routes[nextRouteIndex]?.unit ?? "offense");
        }}><CaretLeft size={19} />Player inspector</button> : null}
        {present ? <button className="exit-present" onClick={() => setPresent(false)}><X size={18} />Exit presentation</button> : null}
      </section>
      {!present ? <Timeline assignment={route} playback={playback} onRun={toggleRun} onRestart={restartRun} speed={speed} onSpeed={setSpeed} /> : null}
      {gameDayDialog ? <GameDayDialog active={Boolean(gameDay)} play={gameDay ? playbooks.find((book) => book.id === gameDay.playbookId)?.plays.find((item) => item.id === gameDay.playId) ?? play : play} onClose={() => setGameDayDialog(false)} onStart={startGameDay} onResolve={resolveGameDay} /> : null}
      {detailsDialog ? <PlayDetailsDialog play={play} onClose={() => setDetailsDialog(false)} onSave={(details) => { updatePlay(play.id, (current) => ({ ...current, ...details })); setDetailsDialog(false); setToast("Play details saved"); }} /> : null}
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
            setToast("Football OS backup downloaded");
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
      <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">{toast}</div>
    </main>
  );
}
