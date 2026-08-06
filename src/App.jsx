import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CaretLeft, CornersOut, Play, X } from "@phosphor-icons/react";

import { ApplyConceptDialog, DataToolsDialog, PrintCollectionPreview, SaveConceptDialog } from "./WorkspaceDialogs";
import { Modal } from "./Modal";
import { describeSpot, PlayCanvas } from "./PlayCanvas";
import { fieldProjection, pointerToField } from "./fieldView";
import { useCanvasCamera } from "./useCanvasCamera";

import { Feedback } from "./Feedback";
import { Filmstrip } from "./Filmstrip";
import { Header } from "./Header";
import { Inspector } from "./Inspector";
import { LayerBar } from "./LayerBar";
import {
  ApplyFormationDialog,
  CreatePlayDialog,
  DeletePlayDialog,
  GameDayDialog,
  NewPlaybookDialog,
  PlayDetailsDialog,
  SaveFormationDialog,
} from "./PlayDialogs";
import { Timeline } from "./Timeline";
import { ToolRail } from "./ToolRail";
import {
  GAME_DAY_KEY,
  assignmentFor,
  compactViewport,
  createAssignment,
  defaultAssignmentId,
  isLinePlayer,
  playerExists,
  preferredAssignment,
  readGameDay,
  readWorkspace,
  titleCase,
  toolItems,
  uniqueName,
} from "./appHelpers";
import {
  applyConceptTemplateToPlay,
  applyFormationToPlay,
  assignmentDefinitionToPoints,
  assignmentPhaseForType,
  clampPoint,
  clonePlaybook,
  createConceptTemplate,
  createPlayFromFormation,
  defaultFormations,
  defensiveAssignmentTypes,
  formationStatus,
  inferRouteDefinition,
  isLineLabel,
  manCoveragePoints,
  offensiveAssignmentTypes,
  playDuration,
  playerLabel,
  playerLocation,
  routeDefinitionToPoints,
  sanitizeAssignmentDefinition,
  snapDragTarget,
} from "./playData";
import { downloadPlayPng, downloadWorkspaceBackup } from "./exportUtils";
import { refreshOfflineCopy, subscribeOfflineStatus } from "./offline";
import { parseWorkspaceBackup, RECOVERY_WORKSPACE_KEY, WORKSPACE_KEY, WORKSPACE_VERSION } from "./workspaceData";

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
  /** Live drag feedback: which player is in hand, and which guides it snapped to. */
  const [dragInfo, setDragInfo] = useState(null);
  /** Install-sheet depth tags on route breaks, toggled from the Key popover. */
  const [showDepths, setShowDepths] = useState(false);
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
  /*
   * Each family's base is its first play in full library order -- stable even
   * when search or folder filters hide it, so a filtered strip still diffs
   * against the real base rather than whichever variant happens to be visible.
   */
  const familyBases = useMemo(() => {
    const bases = new Map();
    for (const item of library) if (!bases.has(item.family)) bases.set(item.family, item);
    return bases;
  }, [library]);
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
   * The camera reads the current play and view, so it is created after both
   * exist; a state hook could sit at the top of the component, this cannot.
   */
  const stageFor = useCallback(() => svgRef.current?.parentElement ?? null, []);
  const { zoom, beginPan, panning, movePan, endPan, resetZoom } = useCanvasCamera({ stageFor, view, play });
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

  /*
   * Feedback is scoped to the play it was raised on -- an "Undo" offered for a
   * deleted assignment must not still be sitting there after switching plays.
   */
  useEffect(() => { setFeedback(null); }, [play.id]);

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

  /**
   * Scrubs the play to a moment, in SMIL seconds (0 = start of pre-snap).
   *
   * The whole animation is one SVG time container, so a single setCurrentTime
   * drives every token at once. Scrubbing from idle first has to *enter* paused
   * playback -- the animations only exist while playback is live -- which means
   * a remount; the target time is parked in a ref and applied by the effect
   * below once the new SVG is in the DOM. Scrubbing while running pauses, which
   * matches what a coach means by grabbing the playhead: "stop it right there".
   */
  const pendingScrub = useRef(null);
  const scrubTo = (seconds) => {
    const duration = playDuration(play.assignments, speed);
    const target = Math.min(Math.max(seconds, 0), duration);
    if (playback === "idle") {
      pendingScrub.current = target;
      setRunKey((value) => value + 1);
      setPlayback("paused");
      return;
    }
    const svg = svgRef.current;
    if (!svg?.setCurrentTime) return;
    if (playback === "running") {
      svg.pauseAnimations?.();
      setPlayback("paused");
    }
    svg.setCurrentTime(target);
  };

  useEffect(() => {
    if (pendingScrub.current === null) return;
    const svg = svgRef.current;
    if (svg?.setCurrentTime) {
      svg.pauseAnimations?.();
      svg.setCurrentTime(pendingScrub.current);
    }
    pendingScrub.current = null;
  }, [runKey, playback]);

  /*
   * Playback theater: while the play runs, each route brightens for exactly
   * the window its player is running it and dims otherwise, and the LOS glow
   * flashes at the snap. Driven per-frame from the SVG clock rather than CSS
   * animation delays, so it stays truthful through pause and scrubbing -- a
   * CSS timeline would keep counting while SMIL stood still. The rAF writes
   * inline opacity; the .route transition turns those discrete flips into
   * eased light changes.
   */
  useEffect(() => {
    if (playback === "idle") return undefined;
    const svg = svgRef.current;
    if (!svg?.getCurrentTime) return undefined;
    let lastTime = svg.getCurrentTime();
    let frame = requestAnimationFrame(function step() {
      const t = svg.getCurrentTime();
      for (const element of svg.querySelectorAll(".route[data-run-start]")) {
        if (element.classList.contains("layer-hidden")) continue;
        const start = Number(element.dataset.runStart);
        const end = start + Number(element.dataset.runDur);
        element.style.opacity = t >= start && t <= end ? "1" : t < start ? "0.38" : "0.55";
      }
      const glow = svg.querySelector(".los-glow");
      if (glow && lastTime < 2 && t >= 2) {
        glow.classList.add("snap-flash");
        window.setTimeout(() => glow.classList.remove("snap-flash"), 500);
      }
      lastTime = t;
      frame = requestAnimationFrame(step);
    });
    return () => {
      cancelAnimationFrame(frame);
      for (const element of svg.querySelectorAll(".route[data-run-start]")) element.style.opacity = "";
    };
  }, [playback, runKey]);

  /*
   * The projection is a pure function of (stage box, view), so recomputing it
   * here yields exactly the one PlayCanvas drew with -- pointer input therefore
   * lands on the field yard under the finger, at any viewport size.
   */
  const pointerPoint = (event) => {
    const box = svgRef.current?.parentElement?.getBoundingClientRect();
    if (!box) return [0, 0];
    const projection = fieldProjection({ width: box.width, height: box.height, view, play, zoom, framePlay: present });
    return clampPoint(pointerToField(event, box, projection));
  };


  /** Drawing needs a minimum travel in yards before it registers a new vertex. */
  const DRAW_STEP_YARDS = 0.8;

  const startDraw = (event) => {
    if (activeTool === "Select") {
      // Zoomed in, an empty-field drag pans the camera; at base framing the
      // same gesture keeps its old meaning, a swipe between plays.
      if (beginPan(event)) {
        capturePointer(event.currentTarget, event.pointerId);
        return;
      }
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
    if (panning()) {
      movePan(event);
      return;
    }
    if (playerDrag.current) {
      const next = pointerPoint(event);
      // Magnetic placement: rows, columns and the LOS pull the player in; Alt
      // drags free for the rare deliberate near-miss alignment.
      const { point, guides } = snapDragTarget(
        play,
        playerDrag.current.unit,
        playerDrag.current.id,
        next,
        { free: event.altKey },
      );
      if (!playerDrag.current.moved) {
        pushHistory(play.id, playerDrag.current.snapshot);
        playerDrag.current.moved = true;
      }
      movePlayerTo(playerDrag.current.unit, playerDrag.current.id, point, { record: false });
      setDragInfo({ unit: playerDrag.current.unit, playerId: playerDrag.current.id, guides });
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
    if (panning()) {
      endPan();
      return;
    }
    if (playerDrag.current) {
      const movedLabel = playerLabel(play, playerDrag.current.unit, playerDrag.current.id);
      const landedAt = playerLocation(play, playerDrag.current.unit, playerDrag.current.id);
      const moved = playerDrag.current.moved;
      playerDrag.current = null;
      setDragInfo(null);
      if (moved) notify(`${movedLabel} placed ${landedAt ? describeSpot(landedAt) : ""}`.trim());
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
    <main className={`app-shell ${present ? "is-presenting" : ""} ${playback === "running" ? "is-running" : ""}`} tabIndex={-1}>
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
      {(
        <Filmstrip
          family={activePlaybook.name}
          familyBases={familyBases}
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
      )}
      <section className={`editor-shell ${!present && selectedPlayerId ? "" : "inspector-closed"}`}>
        {(
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
        )}
        <div className="canvas-workspace">
          <LayerBar layers={layers} onChange={setLayers} view={view} onView={(nextView) => { setView(nextView); setPlayback("idle"); }} showDepths={showDepths} onShowDepths={setShowDepths} />
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
            /*
              Deliberately NOT keyed by play id: switching plays keeps the same
              SVG so tokens can morph between formations. Every play switch
              forces playback idle (selectPlay), so no SMIL timing survives the
              transition; runs still remount via runKey to restart animations.
            */
            playKey={`${view}-${runKey}`}
            playback={playback}
            selectedPlayerId={selectedPlayerId}
            selectedAssignmentId={selectedAssignmentId}
            selectedUnit={selectedUnit}
            layers={layers}
            speed={speed}
            view={view}
            dragInfo={dragInfo}
            zoom={zoom}
            showDepths={showDepths}
            present={present}
          />
          {zoom ? (
            <button className="zoom-reset" onClick={resetZoom}>
              <CornersOut size={16} />
              {`Fit · ${zoom.factor.toFixed(1)}×`}
            </button>
          ) : null}
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
      {(
        <Timeline
          assignment={route}
          playback={playback}
          onRun={toggleRun}
          onRestart={restartRun}
          onScrub={scrubTo}
          duration={playDuration(play.assignments, speed)}
          getTime={() => svgRef.current?.getCurrentTime?.() ?? 0}
          speed={speed}
          onSpeed={setSpeed}
        />
      )}
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
