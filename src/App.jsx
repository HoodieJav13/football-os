import { normalizeFieldSide } from "./fieldSide";
import { createCover3Lesson } from './cover3Lesson';
import { FIELD } from './playData';
import { copyResponsibilityArea, responsibilityOwnerKeys } from './responsibilityArea';
import { LessonExport } from './LessonExport';
import { GAME_DAY_RECOVERY_KEY, loadWorkspaceState, loadGameDayState, RecoveryCopyExistsError, RESOLVED_GAME_DAY, restoreWorkspace, recoverGameDay } from "./workspaceStorage.js";
import { createDurableStore, OutOfBandWriteError, RevokedWriteError, StorageReadError, WATCHED_KEYS } from "./durableStore.js";
import { getEditorAuthority } from "./editorAuthority.js";
import { getDraftsVersion, listDrafts, useDraft, subscribeDrafts } from "./draftRegistry.js";
import { adjustmentBelongs, createPreservationBundle, parseRestoreFile, preservationFilename } from "./preservation.js";
import { AuthorityBanner, HandoverNoticeContext, ViewOnlyChip } from "./AuthorityBanner";
import { createEmptyPlayFilters, createFamilyBases, createPlayFilterOptions, filterPlays } from "./playFilters";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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
  copyAssignmentForPlayer,
  mirrorAssignmentPath,
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
import { downloadBlob, downloadPlayPng, downloadWorkspaceBackup } from "./exportUtils";
import { refreshOfflineCopy, subscribeOfflineStatus } from "./offline";
import { RECOVERY_WORKSPACE_KEY, uniquePlaybookId, WORKSPACE_KEY, WORKSPACE_VERSION } from "./workspaceData";

/*
 * One authority and one durable store per document. The store asks the
 * authority whether a lease is current at the moment of every write, so no
 * component can write around it.
 */
let session = null;
function workspaceSession() {
  if (!session) {
    const authority = getEditorAuthority();
    session = { authority, store: createDurableStore({ isCurrent: (epoch) => authority.isCurrent(epoch) }) };
  }
  return session;
}

const GESTURE_LABELS = {
  player: "dragging a player",
  point: "moving a path handle",
  drawing: "drawing an assignment",
  region: "moving a responsibility area",
};

/** Matches the inspector exit keyframes in styles.css. */
const INSPECTOR_EXIT_MS = 200;

function starterPlay(playbookId) {
  return createPlayFromFormation({
    formation: defaultFormations[0],
    id: `${playbookId}-new-play`,
    name: "New Play",
  });
}

export function App() {
  const { authority, store } = workspaceSession();
  const auth = useSyncExternalStore(authority.subscribe, authority.getState);
  /*
   * What the page first shows is a view of storage, not an editable base: the
   * tab may not be the editor, and even if it becomes one, storage may change
   * between this read and the lock being granted. Editing starts only when
   * the lock callback has reread storage and tagged the state with its lease
   * epoch (adoptDurable).
   */
  const [storageState, setStorageState] = useState(() => loadWorkspaceState(store.reader));
  const [workspace, setWorkspace] = useState(storageState.workspace);
  const [saveError, setSaveError] = useState(null);
  const [gameDayStorage, setGameDayStorage] = useState(() => loadGameDayState(store.reader, storageState.workspace));
  /** The lease epoch the workspace in state was read under; 0 means view only. */
  const [baseEpoch, setBaseEpoch] = useState(0);
  /** Saved data changed outside this tab while it was editing. */
  const [conflict, setConflict] = useState(null);
  /*
   * What the last preservation file captured: the live workspace and
   * adjustment objects and every stored record. A destructive choice (keep
   * one version, start over from storage) is allowed only while all three are
   * still exactly what the file holds -- a file downloaded earlier, or before
   * storage changed again, does not cover what would be discarded.
   */
  const [preservedAs, setPreservedAs] = useState(null);
  /*
   * Drafts kept when this tab stopped being able to save (a conflict or a
   * lost lease). Demotion re-renders the inspector read-only, which unmounts
   * the editors that held typed-but-uncommitted values and drops their
   * registry entries, and it ends any area-preview drag. They are captured
   * first, here, so the preservation file still has them exactly.
   */
  const [heldDrafts, setHeldDrafts] = useState([]);
  const heldDraftsRef = useRef(heldDrafts);
  heldDraftsRef.current = heldDrafts;
  /*
   * Re-render on draft changes that only a child component knows about, but
   * only while that can change what is shown: whether a preservation file is
   * still current matters during a save problem, a conflict, a lost lease, or
   * once a file has been downloaded. Otherwise every keystroke in a dialog
   * would re-render the whole field. (Leaving the page is checked at unload
   * time from refs and does not depend on this.)
   */
  const draftsMatterRef = useRef(false);
  useSyncExternalStore(subscribeDrafts, () => (draftsMatterRef.current ? getDraftsVersion() : 0));
  /** The authority notice the coach has already seen and set aside. */
  const [dismissedNotice, setDismissedNotice] = useState(null);
  const isEditor = auth.status === "editor" && auth.epoch === baseEpoch && baseEpoch !== 0;
  const writable = storageState.writable;
  /** May this tab change the workspace at all right now. */
  const editable = writable && isEditor && !conflict;
  const [playId, setPlayId] = useState(null);
  const [view, setView] = useState("end");
  const [background, setBackground] = useState("field");
  const [activeTool, setActiveTool] = useState("Select");
  const [speed, setSpeed] = useState(1);
  const [playback, setPlayback] = useState("idle");
  const [runKey, setRunKey] = useState(0);
  const [present, setPresent] = useState(false);
  const [gameDay, setGameDay] = useState(gameDayStorage.gameDay);
  const [gameDayDialog, setGameDayDialog] = useState(false);
  const [detailsDialog, setDetailsDialog] = useState(false);
  const [createPlayDialog, setCreatePlayDialog] = useState(false);
  const [deletePlayDialog, setDeletePlayDialog] = useState(false);
  const [newPlaybookDialog, setNewPlaybookDialog] = useState(false);
  const [saveFormationDialog, setSaveFormationDialog] = useState(false);
  const [applyFormationDialog, setApplyFormationDialog] = useState(false);
  const [saveConceptDialog, setSaveConceptDialog] = useState(false);
  const [applyConceptDialog, setApplyConceptDialog] = useState(false);
  const [applyConceptError, setApplyConceptError] = useState("");
  const [dataToolsDialog, setDataToolsDialog] = useState(false);
  const [printPreview, setPrintPreview] = useState(false);
  const [restoreCandidate, setRestoreCandidate] = useState(null);
  const [restoreError, setRestoreError] = useState("");
  /** The exact recovery-copy bytes the coach agreed to replace, if any. */
  const [recoveryAck, setRecoveryAck] = useState(null);
  /** The chosen file's text, so a preservation file's other version can be picked. */
  const [restoreText, setRestoreText] = useState(null);
  // A chosen-but-unconfirmed backup is unfinished work: handover waits for it.
  useDraft("restore", {
    dirty: Boolean(restoreCandidate),
    label: "Backup chosen for restore (not yet confirmed)",
    values: restoreCandidate ? { exportedAt: restoreCandidate.exportedAt, playbooks: restoreCandidate.playbookCount, plays: restoreCandidate.playCount } : null,
  });
  const [offlineStatus, setOfflineStatus] = useState({
    online: typeof navigator === "undefined" ? true : navigator.onLine,
    ready: false,
    supported: typeof navigator !== "undefined" && "serviceWorker" in navigator,
    development: true,
  });
  const [editRegionId, setEditRegionId] = useState(null);
  const [regionPreview, setRegionPreview] = useState(null);
  const [frozenRegionProjection, setFrozenRegionProjection] = useState(null);
  const regionDrag = useRef(null);
  const [exportJob, setExportJob] = useState(null);
  const exporting = useRef(false);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState("offense");
  const [layers, setLayers] = useState({
    offense: { visible: true, dimmed: false, locked: false },
    defense: { visible: true, dimmed: false, locked: false },
    assignments: { visible: true },
  });
  const [playFilters, setPlayFilters] = useState(createEmptyPlayFilters);
  const [draftAssignment, setDraftAssignment] = useState([]);
  const draftAssignmentRef = useRef(draftAssignment);
  draftAssignmentRef.current = draftAssignment;
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

  const playbooks = workspace.playbooks.filter(book => !book.archived);
  const activePlaybook = playbooks.find((book) => book.id === workspace.activePlaybookId) ?? playbooks[0];
  const mainPlaybook = playbooks.find((book) => book.id === workspace.mainPlaybookId) ?? playbooks[0];
  const library = activePlaybook.plays;
  const referenceLocked = activePlaybook.readOnly === true;
  const mutationLocked = referenceLocked || !editable;
  /*
   * Each family's base is its first play in full library order -- stable even
   * when search or folder filters hide it, so a filtered strip still diffs
   * against the real base rather than whichever variant happens to be visible.
   */
  const familyBases = useMemo(() => createFamilyBases(library), [library]);
  const playFilterOptions = useMemo(() => createPlayFilterOptions(library), [library]);
  const visibleLibrary = useMemo(() => filterPlays(library, playFilters), [library, playFilters]);
  const playIndex = useMemo(() => Math.max(0, library.findIndex((item) => item.id === playId)), [library, playId]);
  const play = library[playIndex];
  /*
   * The inspector outlives its selection just long enough to slide out. The
   * grid column collapses on `open` (immediately), so the field starts
   * reclaiming the width while the panel is still leaving -- the two motions
   * overlap rather than queueing, which is what makes deselecting feel like one
   * gesture instead of two.
   */
  const [inspectorLeaving, setInspectorLeaving] = useState(false);
  const inspectorOpen = !present && Boolean(selectedPlayerId) && !inspectorLeaving;
  /*
   * The camera reads the current play and view, so it is created after both
   * exist; a state hook could sit at the top of the component, this cannot.
   */
  const stageFor = useCallback(() => svgRef.current?.parentElement ?? null, []);
  const { zoom, beginPan, panning, movePan, endPan, resetZoom, pinching } = useCanvasCamera({ stageFor, view, play });
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
  const currentLayerLocked = mutationLocked || (layers[selectedUnit]?.locked ?? false);
  const areaDisabled = currentLayerLocked || !layers.defense.visible || !layers.assignments.visible || playback !== 'idle' || present;
  const cancelRegionDrag = () => {
    regionDrag.current = null;
    setRegionPreview(null);
    setFrozenRegionProjection(null);
  };
  const leaveRegionEdit = () => { cancelRegionDrag(); setEditRegionId(null); };
  useEffect(() => {
    leaveRegionEdit();
  }, [play.id, view, layers, selectedAssignmentId, playback, present, mutationLocked]);
  useEffect(() => {
    if (editRegionId && !route?.definition?.responsibilityArea) leaveRegionEdit();
  }, [route, editRegionId]);
  const displayPlay = regionPreview?.playId === play.id ? {...play, assignments: play.assignments.map(a => a.id === regionPreview.assignmentId ? {...a, definition:{...a.definition, responsibilityArea:regionPreview.area}} : a)} : play;
  const changeResponsibilityArea = (area) => {
    if (areaDisabled || route?.unit !== 'defense' || route?.type !== 'Zone') return;
    if (JSON.stringify(area) === JSON.stringify(route.definition.responsibilityArea)) return;
    const next = area ? copyResponsibilityArea(area) : undefined;
    updateSelectedAssignment(current => {
      const definition = {...current.definition};
      if (next) definition.responsibilityArea = next;
      else delete definition.responsibilityArea;
      return {...current, definition};
    });
    if (!next) leaveRegionEdit();
  };
  const beginRegionDrag = (event, kind, projection) => {
    if (areaDisabled || editRegionId !== route?.id || pinching()) return;
    const box = svgRef.current.parentElement.getBoundingClientRect();
    const area = copyResponsibilityArea(route.definition.responsibilityArea);
    regionDrag.current = {playId:play.id, assignmentId:route.id, area, next:area, kind, projection, box, start:pointerToField(event,box,projection)};
    setFrozenRegionProjection(projection);
    capturePointer(svgRef.current.parentElement,event.pointerId);
  };
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
   *
   * Every write goes through the durable store with the epoch this state was
   * read under, so a timer or hide listener that fires after this tab handed
   * editing to another one is refused at the store, not merely skipped here.
   */
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const gameDayRef = useRef(gameDay);
  gameDayRef.current = gameDay;
  const storageStateRef = useRef(storageState);
  storageStateRef.current = storageState;
  const gameDayStorageRef = useRef(gameDayStorage);
  gameDayStorageRef.current = gameDayStorage;
  const epochRef = useRef(baseEpoch);
  epochRef.current = baseEpoch;
  const conflictRef = useRef(conflict);
  conflictRef.current = conflict;
  const saveErrorRef = useRef(saveError);
  saveErrorRef.current = saveError;
  draftsMatterRef.current = Boolean(saveError || conflict || auth.reason?.kind === "lost" || heldDrafts.length || preservedAs);

  /** Unfinished work with its values: registered drafts plus gestures still in hand. */
  const captureDrafts = () => [
    ...listDrafts(),
    ...(draftAssignmentRef.current.length > 1 ? [{ id: "stroke", label: GESTURE_LABELS.drawing, values: { points: draftAssignmentRef.current } }] : []),
    ...(regionDrag.current ? [{ id: "region", label: GESTURE_LABELS.region, values: { playId: regionDrag.current.playId, assignmentId: regionDrag.current.assignmentId, area: regionDrag.current.next } }] : []),
    ...(playerDrag.current?.moved ? [{ id: "player-drag", label: GESTURE_LABELS.player, values: { unit: playerDrag.current.unit, playerId: playerDrag.current.id } }] : []),
    ...(routePointDrag.current?.moved ? [{ id: "point-drag", label: GESTURE_LABELS.point, values: { pointIndex: routePointDrag.current.pointIndex } }] : []),
  ];
  /** Held drafts plus current ones, without duplicates. */
  const allDrafts = () => {
    const seen = new Set();
    return [...heldDraftsRef.current, ...captureDrafts()].filter((draft) => {
      const key = JSON.stringify([draft.label, draft.values]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  /** Keeps unfinished work before a demotion unmounts the editors holding it. */
  const holdDrafts = () => {
    const next = allDrafts();
    heldDraftsRef.current = next;
    setHeldDrafts(next);
  };
  /** The adjustment as last saved, so starting or resolving one is written at once. */
  const persistedGameDayRef = useRef(gameDay);
  /** Where the coach is looking, kept across a reread of storage. */
  const navRef = useRef(null);
  navRef.current = { bookId: workspace.activePlaybookId, playId };
  /** The state an editing lease started from, to tell a clean editor from one with changes. */
  const adoptedRef = useRef({ workspace: null, gameDay: null, at: 0 });

  /*
   * Saved data changed behind this editor. Right after taking over, with no
   * change made here yet, that is most likely the previous editor's final
   * save arriving after the lock did (storage and lock grants travel by
   * different routes between tabs): reread rather than raise a conflict,
   * since nothing here can be lost. Otherwise pause and preserve.
   */
  const handleDrift = (keys) => {
    const adopted = adoptedRef.current;
    // Typed values, previews and gestures count as changes: a reread would
    // leave them describing a version they were not typed against.
    const clean = workspaceRef.current === adopted.workspace && gameDayRef.current === adopted.gameDay
      && captureDrafts().length === 0 && heldDraftsRef.current.length === 0;
    if (clean && Date.now() - adopted.at < 5000 && authority.getState().status === "editor") {
      try {
        handlersRef.current.adoptDurable(epochRef.current, { fromGrant: true });
        return;
      } catch (error) {
        if (!(error instanceof StorageReadError)) throw error;
      }
    }
    holdDrafts();
    setConflict((current) => current ?? { keys, at: new Date().toISOString() });
  };

  /*
   * The workspace and the game-day record are written in one guarded
   * transaction, workspace first. Starting, editing and resolving an
   * adjustment then never leave the adjustment marked resolved while the
   * workspace still holds the temporary version -- the old separate,
   * undebounced game-day write did exactly that for 400 ms after every
   * resolution, and a tab killed in that window lost the original play.
   */
  const saveNow = () => {
    try {
      store.transact(epochRef.current, (guarded) => {
        if (!storageStateRef.current.writable) return;
        guarded.setItem(WORKSPACE_KEY, JSON.stringify(workspaceRef.current));
        const savedGameDay = gameDayStorageRef.current;
        if (!savedGameDay.writable) return;
        const current = gameDayRef.current;
        if (current) guarded.setItem(GAME_DAY_KEY, JSON.stringify({ ...current, workspaceVersion: WORKSPACE_VERSION }));
        else if (savedGameDay.gameDay || guarded.getItem(GAME_DAY_KEY) !== null) guarded.setItem(GAME_DAY_KEY, RESOLVED_GAME_DAY);
      });
    } catch (error) {
      if (error instanceof RevokedWriteError) return { ok: false, revoked: true };
      if (error instanceof StorageReadError) {
        setSaveError(`${error.message}. Saving is paused because this tab cannot check what is stored. Keep this page open and download a preservation file.`);
        return { ok: false, blocked: { kind: "save", message: error.message } };
      }
      if (error instanceof OutOfBandWriteError) {
        handleDrift(error.keys);
        return { ok: false, blocked: { kind: "conflict" } };
      }
      setSaveError(error.partialKeys
        ? `Changes could not be saved: ${error.message}. Saving stopped part-way and ${error.partialKeys.join(", ")} could not be put back. Keep this page open and download a preservation file.`
        : `Changes could not be saved: ${error.message}. Keep this page open and download a preservation file.`);
      return { ok: false, blocked: { kind: "save", message: error.message } };
    }
    persistedGameDayRef.current = gameDayRef.current;
    setSaveError(null);
    return { ok: true };
  };

  const canPersist = isEditor && writable && !conflict;
  useEffect(() => {
    if (!canPersist) return undefined;
    let timer = null;
    const flush = () => {
      window.clearTimeout(timer);
      if (saveNow().ok && authority.getState().requested) window.setTimeout(() => authority.tryHandover(), 0);
    };
    if (gameDay !== persistedGameDayRef.current) flush();
    else timer = window.setTimeout(flush, 400);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
    };
  }, [workspace, gameDay, canPersist, baseEpoch]);

  /**
   * Replaces what this tab holds with what is stored. With an epoch it is the
   * start of an editing lease: called inside the lock callback, so the base a
   * new editor edits is read after it holds the lock, and the store records
   * the same bytes as the ones it may overwrite. Without one it refreshes a
   * view-only tab. Navigation survives; undo history does not, because it
   * describes plays as they were before the reread.
   */
  const adoptDurable = (epoch, { keepNavigation = true, fromGrant = false } = {}) => {
    if (epoch) store.adopt(epoch);
    const freshStorage = loadWorkspaceState(store.reader);
    const freshGameDay = loadGameDayState(store.reader, freshStorage.workspace);
    installState(epoch, freshStorage, freshGameDay, { keepNavigation, fromGrant });
  };

  /*
   * Makes a known durable state the one this tab edits. The refs the save
   * path reads are updated here, synchronously, not at the next render: a
   * hide flush or a debounce that fires before React re-renders must write
   * this state, never the one it replaces.
   */
  const installState = (epoch, freshStorage, freshGameDay, { keepNavigation = true, fromGrant = false } = {}) => {
    const nav = navRef.current;
    const keepBook = keepNavigation && freshStorage.workspace.playbooks.some((book) => book.id === nav.bookId && !book.archived);
    const adoptedWorkspace = keepBook ? { ...freshStorage.workspace, activePlaybookId: nav.bookId } : freshStorage.workspace;
    storageStateRef.current = freshStorage;
    gameDayStorageRef.current = freshGameDay;
    gameDayRef.current = freshGameDay.gameDay;
    workspaceRef.current = adoptedWorkspace;
    epochRef.current = epoch;
    setStorageState(freshStorage);
    setGameDayStorage(freshGameDay);
    setGameDay(freshGameDay.gameDay);
    persistedGameDayRef.current = freshGameDay.gameDay;
    setWorkspace(adoptedWorkspace);
    setBaseEpoch(epoch);
    historyRef.current = new Map();
    setHistoryVersion((value) => value + 1);
    setSaveError(null);
    setConflict(null);
    setPreservedAs(null);
    if (epoch) { heldDraftsRef.current = []; setHeldDrafts([]); }
    adoptedRef.current = { workspace: adoptedWorkspace, gameDay: freshGameDay.gameDay, at: fromGrant ? Date.now() : 0 };
    playerDrag.current = null;
    routePointDrag.current = null;
    drawing.current = false;
    setDraftAssignment([]);
    setDragInfo(null);
    cancelRegionDrag();
  };

  /** Unfinished work a handover must wait for, in words a coach recognises. */
  const unfinishedWork = () => [
    ...listDrafts().map((draft) => draft.label),
    ...(playerDrag.current ? [GESTURE_LABELS.player] : []),
    ...(routePointDrag.current ? [GESTURE_LABELS.point] : []),
    ...(drawing.current ? [GESTURE_LABELS.drawing] : []),
    ...(regionDrag.current ? [GESTURE_LABELS.region] : []),
  ];

  /*
   * Called by the authority when another tab is queued for the lock. Handing
   * over requires no unfinished drafts or gestures, no unresolved conflict and
   * a save that succeeded; otherwise this tab keeps editing and says why.
   * Dialogs still open here are clean (a dirty one is a draft), so closing them
   * discards nothing.
   */
  const prepareHandover = (epoch) => {
    if (epoch !== epochRef.current) return { ok: false, blocked: { kind: "settling" } };
    const drafts = unfinishedWork();
    if (drafts.length) return { ok: false, blocked: { kind: "drafts", drafts } };
    if (conflictRef.current) return { ok: false, blocked: { kind: "conflict" } };
    const saved = saveNow();
    if (!saved.ok) return { ok: false, blocked: saved.blocked ?? { kind: "save" } };
    setGameDayDialog(false);
    setDetailsDialog(false);
    setCreatePlayDialog(false);
    setDeletePlayDialog(false);
    setNewPlaybookDialog(false);
    setSaveFormationDialog(false);
    setApplyFormationDialog(false);
    setSaveConceptDialog(false);
    setApplyConceptDialog(false);
    setActiveTool("Select");
    setEditRegionId(null);
    return { ok: true };
  };

  /** Storage changed in another tab: a viewer follows it, an editor treats it as out of band. */
  const onStorageChange = () => {
    if (authority.getState().status === "editor") {
      let drifted;
      try {
        drifted = store.drift(epochRef.current);
      } catch (error) {
        setSaveError(`${error.message}. Saving is paused because this tab cannot check what is stored. Keep this page open and download a preservation file.`);
        return;
      }
      if (drifted.length) handleDrift(drifted);
      return;
    }
    // A tab that lost its lease still holds unsaved work; it is only replaced
    // once the coach has kept a copy and chosen to edit again.
    if (authority.getState().reason?.kind === "lost") return;
    adoptDurable(0);
  };

  const handlersRef = useRef(null);
  handlersRef.current = { adoptDurable, prepareHandover, onStorageChange, holdDrafts, leaveIsSafe: () => leaveIsSafe() };
  useEffect(() => {
    authority.connect({
      acquire: (epoch) => handlersRef.current.adoptDurable(epoch, { fromGrant: true }),
      prepareHandover: (epoch) => handlersRef.current.prepareHandover(epoch),
      demote: () => handlersRef.current.holdDrafts(),
    });
    authority.start();
    const stopDrafts = subscribeDrafts(() => window.setTimeout(() => authority.tryHandover(), 0));
    const onStorage = (event) => {
      if (event.key !== null && !WATCHED_KEYS.includes(event.key)) return;
      handlersRef.current.onStorageChange();
    };
    // A page restored from the back/forward cache missed every storage event
    // while it was away: a viewer catches up, an editor checks for drift.
    const onPageShow = (event) => { if (event.persisted) handlersRef.current.onStorageChange(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      stopDrafts();
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [authority]);

  // Handing over ends this tab's editing session, and its undo history with it.
  useEffect(() => {
    if (isEditor) return;
    if (historyRef.current.size) {
      historyRef.current = new Map();
      setHistoryVersion((value) => value + 1);
    }
  }, [isEditor]);

  // A gesture that ends without a state change still clears the way to hand
  // over. A failing save is retried by the authority's poll instead: retrying
  // here would re-serialise the workspace on every render.
  useEffect(() => {
    if (auth.requested && !saveError) authority.tryHandover();
  });

  useEffect(() => subscribeOfflineStatus(setOfflineStatus), []);

  /*
   * A view-only notice announces a change (moved to another tab, editor
   * closed) and then steps aside after a few seconds; the header keeps the
   * View only chip and the Edit here button. Requests, conflicts, a lost
   * lease and save problems stay until resolved.
   */
  const noticeKey = `${auth.status}|${auth.reason?.kind ?? ""}|${auth.editorPresent}`;
  useEffect(() => {
    if (auth.status !== "viewer" || auth.reason?.kind === "lost") return undefined;
    const timer = window.setTimeout(() => setDismissedNotice(noticeKey), 8000);
    return () => window.clearTimeout(timer);
  }, [noticeKey, auth.status, auth.reason]);

  /*
   * Feedback is scoped to the play it was raised on -- an "Undo" offered for a
   * deleted assignment must not still be sitting there after switching plays.
   * Workspace-wide confirmations (a restore) carry no play-local action and
   * survive the play switch that usually follows them.
   */
  useEffect(() => { setFeedback((current) => (current?.scope === "workspace" ? current : null)); }, [play.id]);

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
    if (!editable) return;
    setWorkspace((current) => ({
      ...current,
      playbooks: current.playbooks.map((book) => {
        if (book.id !== current.activePlaybookId || book.readOnly) return book;
        const nextPlays = typeof nextValue === "function" ? nextValue(book.plays) : nextValue;
        return { ...book, plays: nextPlays };
      }),
    }));
  };

  const replacePlay = (targetId, replacement) => {
    setLibrary((current) => current.map((item) => item.id === targetId ? replacement : item));
  };

  const pushHistory = (targetId, snapshot = library.find((item) => item.id === targetId)) => {
    if (!snapshot || mutationLocked) return;
    const entry = historyRef.current.get(targetId) ?? { past: [], future: [] };
    historyRef.current.set(targetId, {
      past: [...entry.past.slice(-39), clonePlaybook([snapshot])[0]],
      future: [],
    });
    setHistoryVersion((value) => value + 1);
  };

  const updatePlay = (targetId, updater, { record = true } = {}) => {
    if (mutationLocked) return;
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
    setInspectorLeaving(false);
  };

  /*
   * Dismissing the inspector animates before the selection actually clears.
   * The panel's whole content is derived from the selected player, so dropping
   * the selection first would leave an empty shell to animate; deferring the
   * state change keeps it whole on the way out. The grid column collapses
   * immediately, so the field starts widening while the panel is still sliding
   * -- one gesture rather than two. Other paths that change the selection
   * (picking another player, switching plays) are replacements, not
   * dismissals, and stay instant.
   */
  const dismissInspector = () => {
    if (!selectedPlayerId || inspectorLeaving) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      clearSelection();
      return;
    }
    setInspectorLeaving(true);
    window.setTimeout(clearSelection, INSPECTOR_EXIT_MS);
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
    cancelRegionDrag();
    if (mutationLocked) return;
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
    cancelRegionDrag();
    if (mutationLocked) return;
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
    setPlayFilters(createEmptyPlayFilters());
    setDraftAssignment([]);
    setActiveTool("Select");
    setPlayback("idle");
    setPresent(false);
  };

  const copyToMain = () => {
    if (!editable) return;
    if (activePlaybook.id === mainPlaybook.id) return;
    const copy = {
      ...clonePlaybook([play])[0],
      id: `${mainPlaybook.id}-${play.id}-${Date.now()}`,
      name: uniqueName(mainPlaybook.plays, play.sourceCall || play.name),
      conceptName: play.conceptName ?? play.name,
      referenceStatus: "copied-reference",
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
    if (!editable) return;
    const id = uniquePlaybookId(name, workspace.playbooks);
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
    if (mutationLocked) return;
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

  const addCover3Lesson = () => {
    if (mutationLocked || mainPlaybook.readOnly) return;
    const lesson = createCover3Lesson(`cover3-${crypto.randomUUID()}`,uniqueName(mainPlaybook.plays,'Cover 3 — teaching example'));
    setWorkspace(current => ({...current,activePlaybookId:current.mainPlaybookId,playbooks:current.playbooks.map(book => book.id === current.mainPlaybookId ? {...book,plays:[...book.plays,lesson]} : book)}));
    setPlayId(lesson.id);
    setPlayFilters(createEmptyPlayFilters());
    clearSelection();
    setActiveTool('Select'); setPlayback('idle');
    notify('Editable Cover 3 example added. Adjust it for your teaching.');
  };

  const duplicatePlay = () => {
    createPlay({
      formationId: null,
      mode: "duplicate",
      name: `${play.name} Variation`,
    });
  };

  const deletePlay = () => {
    if (mutationLocked) return;
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
    if (mutationLocked) return;
    const saved = {
      id: `${activePlaybook.id}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "formation"}`,
      name,
      personnel: play.personnel,
      players: clonePlaybook(play.players),
    };
    setWorkspace((current) => ({
      ...current,
      playbooks: current.playbooks.map((book) => {
        if (book.id !== current.activePlaybookId || book.readOnly) return book;
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
    if (mutationLocked) return;
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
    if (mutationLocked) return;
    const existing = activePlaybook.concepts.find((concept) => concept.name.toLowerCase() === name.toLowerCase());
    const idBase = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "concept";
    const concept = createConceptTemplate(play, {
      id: existing?.id ?? `${activePlaybook.id}-${idBase}`,
      name,
    });
    setWorkspace((current) => ({
      ...current,
      playbooks: current.playbooks.map((book) => {
        if (book.id !== current.activePlaybookId || book.readOnly) return book;
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
    if (mutationLocked) return;
    const concept = activePlaybook.concepts.find((item) => item.id === conceptId);
    if (!concept) return;
    let candidate;
    try { candidate = applyConceptTemplateToPlay(play, concept); }
    catch (error) { setApplyConceptError(error.message); return; }
    setApplyConceptError("");
    updatePlay(play.id, () => candidate);
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
    setRecoveryAck(null);
    if (!file) return;
    try {
      const text = await file.text();
      setRestoreCandidate(parseRestoreFile(text));
      setRestoreText(text);
    } catch (error) {
      setRestoreError(error instanceof Error ? error.message : "That backup could not be opened.");
    }
  };

  /*
   * Restore runs as one guarded transaction under the current lease: the
   * recovery copy (workspace plus the raw game-day record, so an adjusted
   * play's original is kept), then the game-day record, then the workspace.
   * The store refuses it if this tab is not the editor or if anything it would
   * overwrite changed since this tab read it, and an existing recovery copy is
   * only replaced when the coach confirmed exactly that copy.
   */
  const confirmRestore = () => {
    if (!restoreCandidate) return;
    if (!isEditor) {
      setRestoreError("Backup was not restored: this tab is view only. Choose Edit here first; the current workspace is unchanged.");
      return;
    }
    // When storage does not hold what this tab holds (a save failed, or the
    // stored data changed under it), the recovery copy alone cannot keep both:
    // a current preservation file must exist first.
    if ((saveErrorRef.current || conflictRef.current) && !preservationCurrent({ needsStored: true })) {
      setRestoreError("Backup was not restored: this tab holds changes that are not saved. Download a preservation file first; it keeps this tab's version and what is stored.");
      return;
    }
    let restored;
    try {
      restored = store.transact(epochRef.current, (guarded) => restoreWorkspace(guarded, restoreCandidate.workspace, { ...storageState, workspace }, {
        replaceRecovery: recoveryAck,
        endAdjustment: gameDayStorage.writable,
        gameDay: restoreCandidate.gameDay ?? undefined,
        liveGameDay: gameDay,
      }));
    } catch (error) {
      if (error instanceof OutOfBandWriteError) setConflict((current) => current ?? { keys: error.keys, at: new Date().toISOString() });
      if (error.partialKeys) {
        const left = error.partialKeys.join(", ");
        setRestoreError(`Backup was not restored, and the attempt could not be fully undone: ${left} ${error.partialKeys.length === 1 ? "was" : "were"} left changed (${error.message}). Storage no longer matches this tab. This tab still holds everything: download a preservation file now.`);
        setSaveError(`A restore stopped part-way and ${left} could not be put back. Storage no longer matches this tab. Keep this page open and download a preservation file.`);
      } else {
        setRestoreError(error instanceof RecoveryCopyExistsError
          ? "Backup was not restored: the earlier recovery copy changed or was not confirmed. Review it below; the current workspace is unchanged."
          : `Backup was not restored: ${error.message}. The current workspace is unchanged.`);
      }
      setRecoveryAck(null);
      return;
    }
    let reread = true;
    try {
      adoptDurable(epochRef.current, { keepNavigation: false });
    } catch (error) {
      if (!(error instanceof StorageReadError)) throw error;
      // The restore is committed; only the reread failed. Install exactly
      // what the transaction wrote (the store already records those bytes),
      // so nothing can write the replaced live state over the restored one.
      reread = false;
      const committedGameDay = restoreCandidate.gameDay
        ? { gameDay: { ...restoreCandidate.gameDay, workspaceVersion: WORKSPACE_VERSION }, sourceKey: GAME_DAY_KEY, raw: JSON.stringify({ ...restoreCandidate.gameDay, workspaceVersion: WORKSPACE_VERSION }), writable: true, error: null }
        : gameDayStorage.writable
          ? { gameDay: null, sourceKey: gameDayStorage.sourceKey ? GAME_DAY_KEY : null, raw: gameDayStorage.sourceKey ? RESOLVED_GAME_DAY : null, writable: true, error: null }
          : gameDayStorage;
      installState(epochRef.current, { workspace: restored, sourceKey: WORKSPACE_KEY, raw: null, writable: true, error: null }, committedGameDay, { keepNavigation: false });
    }
    const restoredBook = restored.playbooks.find((book) => book.id === restored.activePlaybookId) ?? restored.playbooks[0];
    setPlayId(restoreCandidate.gameDay?.playbookId === restoredBook.id ? restoreCandidate.gameDay.playId : restoredBook.plays[0].id);
    clearSelection();
    setSelectedUnit("offense");
    setRestoreCandidate(null);
    setRecoveryAck(null);
    setDataToolsDialog(false);
    notify((restoreCandidate.gameDay
      ? "Preservation file restored · game-day adjustment and its original kept · previous workspace kept as a recovery copy"
      : "Backup restored · previous workspace kept as a recovery copy")
      + (reread ? "" : " · storage could not be re-read afterwards, so the restored state was taken from what was just saved"), { scope: "workspace" });
  };

  const recoverSavedGameDay = () => {
    if (!isEditor) {
      setRestoreError("Adjustment was not reset: this tab is view only. Choose Edit here first.");
      return;
    }
    let recovered;
    try {
      recovered = store.transact(epochRef.current, (guarded) => recoverGameDay(guarded, gameDayStorage, { replaceRecovery: recoveryAck }));
    } catch (error) {
      if (error.partialKeys) setSaveError(`Resetting the adjustment stopped part-way and ${error.partialKeys.join(", ")} could not be put back. Keep this page open and download a preservation file.`);
      setRestoreError(error instanceof RecoveryCopyExistsError
        ? "Adjustment was not reset: an earlier game-day recovery copy would be replaced. Download it or confirm replacing it first."
        : error.partialKeys
          ? `Adjustment was not reset, and ${error.partialKeys.join(", ")} could not be put back (${error.message}).`
          : `Adjustment was not reset: ${error.message}`);
      setRecoveryAck(null);
      return;
    }
    setGameDayStorage(recovered);
    persistedGameDayRef.current = null;
    setGameDay(null);
    setRestoreError("");
    setRecoveryAck(null);
    notify("Original game-day data kept as a recovery copy · adjustments available again", { scope: "workspace" });
  };

  /** Everything this tab holds that storage may not, as one file. */
  const downloadPreservation = (reason) => {
    const stored = store.snapshot();
    const drafts = allDrafts();
    const bundle = createPreservationBundle({
      reason,
      workspace,
      gameDay,
      liveValid: writable,
      location: { playbookId: activePlaybook.id, playId: play.id },
      drafts,
      durable: stored.records,
      durableUnavailable: stored.unavailable,
    });
    downloadBlob(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }), preservationFilename(bundle.createdAt));
    setPreservedAs({ workspace, gameDay, durable: JSON.stringify(stored), durableComplete: stored.unavailable === null, drafts: JSON.stringify(drafts) });
    notify("Preservation file downloaded", { scope: "workspace" });
  };

  /** Downloads an existing recovery copy before the coach agrees to replace it. */
  const downloadRecoveryCopy = (key) => {
    let raw;
    try { raw = store.reader.getItem(key); } catch (error) { notifyProblem(`${error.message}. The earlier copy cannot be downloaded until storage can be read.`); return; }
    if (raw === null) return;
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch { /* kept raw below */ }
    // The adjustment the tab held at restore time first: it may exist nowhere else.
    let liveGameDay = parsed?.liveGameDay ?? null;
    if (!liveGameDay) { try { liveGameDay = parsed?.gameDay?.raw ? JSON.parse(parsed.gameDay.raw) : null; } catch { /* raw is kept */ } }
    const bundle = createPreservationBundle({
      reason: `recovery-copy:${key}`,
      workspace: key === RECOVERY_WORKSPACE_KEY ? parsed?.workspace : null,
      gameDay: key === RECOVERY_WORKSPACE_KEY && adjustmentBelongs(liveGameDay, parsed?.workspace) ? liveGameDay : null,
      liveValid: key === RECOVERY_WORKSPACE_KEY && Boolean(parsed?.workspace),
      durable: { [key]: raw },
    });
    downloadBlob(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }), preservationFilename(bundle.createdAt));
  };

  /** Does the last preservation file still hold everything a destructive choice would drop? */
  /*
   * `needsStored`: the choice would replace what is stored, so the file must
   * actually hold it. A snapshot that could not read storage proves nothing
   * -- two failed snapshots compare equal however different the bytes they
   * missed -- so it never counts as preserving the stored version, though the
   * same file still preserves this tab's version.
   */
  const preservationCurrent = ({ needsStored = false } = {}) => {
    if (!preservedAs) return false;
    const now = store.snapshot();
    if (needsStored && (!preservedAs.durableComplete || now.unavailable !== null)) return false;
    return preservedAs.workspace === workspaceRef.current
      && preservedAs.gameDay === gameDayRef.current
      && preservedAs.durable === JSON.stringify(now)
      && preservedAs.drafts === JSON.stringify(allDrafts());
  };
  /*
   * Leaving is safe when nothing exists only in this page, or when a current
   * preservation file holds it. Evaluated when the page is about to go, from
   * refs, so a draft typed in a child component counts even if nothing else
   * re-rendered since.
   */
  const leaveIsSafe = () => {
    const atRisk = Boolean(saveErrorRef.current || conflictRef.current || authority.getState().reason?.kind === "lost" || allDrafts().length);
    return !atRisk || preservationCurrent();
  };
  const refusePreservation = () => {
    setPreservedAs(null);
    notifyProblem("Something changed since the preservation file was downloaded. Download it again before choosing.");
  };

  /** Resolving a conflict: keep this tab's version over the one written outside it. */
  const keepThisVersion = () => {
    if (authority.getState().status !== "editor") return refusePreservation();
    if (!preservationCurrent({ needsStored: true })) {
      if (!preservationCurrent()) return refusePreservation();
      notifyProblem("The preservation file does not hold the version in storage (it could not be read), so it cannot be replaced. Load saved version, or download again once storage can be read.");
      return undefined;
    }
    try { store.adopt(epochRef.current); } catch (error) { notifyProblem(`${error.message}. Nothing was changed.`); return; }
    heldDraftsRef.current = [];
    setHeldDrafts([]);
    setConflict(null);
    conflictRef.current = null;
    const saved = saveNow();
    if (saved.ok) notify("This tab's version saved · the other version is in your preservation file", { scope: "workspace" });
  };

  /** Resolving a conflict: continue from what is stored; this tab's version is in the file. */
  const loadSavedVersion = () => {
    if (!preservationCurrent() || authority.getState().status !== "editor") return refusePreservation();
    try { adoptDurable(epochRef.current); } catch (error) { notifyProblem(`${error.message}. Nothing was changed.`); return; }
    notify("Saved version loaded · this tab's version is in your preservation file", { scope: "workspace" });
  };

  const exportCurrentPng = async (format = "wide") => {
    if (exporting.current || exportJob) return;
    await document.fonts.ready;
    setExportJob({play:clonePlaybook([play])[0],view,layers:structuredClone(layers),background,format});
  };
  const exportReady = async (svg) => {
    if (!svg || !exportJob || exporting.current) return;
    exporting.current = true;
    try {
      await downloadPlayPng(svg, exportJob.play.name + (exportJob.format === "phone" ? " phone" : ""));
      notify(`${exportJob.play.name} PNG downloaded`);
    } catch (error) {
      notifyProblem(error instanceof Error ? error.message : 'PNG export failed');
    } finally { setExportJob(null); exporting.current = false; }
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
    let copy;
    try {
      copy = copyAssignmentForPlayer(play, route.id, targetId, `${play.id}-${selectedUnit}-${targetId}-${route.phase}-${Date.now()}`);
    } catch (error) { notifyProblem(error.message); return; }
    updatePlay(play.id, (current) => ({ ...current, assignments: [...current.assignments, copy] }));
    setSelectedPlayerId(targetId);
    setSelectedAssignmentId(copy.id);
    notify(copy.definition?.responsibilityArea
      ? `Assignment and responsibility area copied. Adjust the area for ${playerLabel(play, selectedUnit, targetId)}.`
      : `Assignment copied to ${playerLabel(play, selectedUnit, targetId)}`);
  };

  const mirrorAssignment = () => {
    if (!route || currentLayerLocked) return;
    const mirrored = mirrorAssignmentPath(play, route.id);
    updateSelectedAssignment(() => mirrored);
    notify(`${selectedPlayerLabel} path mirrored`);
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
    // Two fingers are a camera gesture, never a stroke or a player drag.
    if (pinching()) { leaveRegionEdit(); return; }
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
    if (pinching()) {
      leaveRegionEdit();
      // A drag that turns into a pinch must not keep moving whatever it grabbed.
      playerDrag.current = null;
      routePointDrag.current = null;
      drawing.current = false;
      setDragInfo(null);
      return;
    }
    if (regionDrag.current) {
      const drag = regionDrag.current;
      const point = pointerToField(event, drag.box, drag.projection);
      const dx = point[0] - drag.start[0], dy = point[1] - drag.start[1];
      const next = copyResponsibilityArea(drag.area);
      if (drag.kind === 'center') next.center = clampPoint([next.center[0]+dx,next.center[1]+dy]);
      else if (drag.kind === 'radiusX') next.radiusX = Math.max(.5,Math.min((FIELD.bounds.maxX-FIELD.bounds.minX)/2,next.radiusX+dx));
      else next.radiusY = Math.max(.5,Math.min((FIELD.bounds.maxY-FIELD.bounds.minY)/2,next.radiusY+dy));
      drag.next = next;
      setRegionPreview({playId:drag.playId,assignmentId:drag.assignmentId,area:next});
      return;
    }
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
    if (regionDrag.current) {
      const drag = regionDrag.current;
      if (drag.playId === play.id && drag.assignmentId === route?.id) changeResponsibilityArea(drag.next);
      cancelRegionDrag();
      return;
    }
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
      if (!mutationLocked && !layers[unit].locked && !pinching()) {
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
    if (mutationLocked || !gameDayStorage.writable) return;
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
    if (mutationLocked || !gameDayStorage.writable) return;
    if (mutationLocked) return;
    setGameDay({ playbookId: activePlaybook.id, playId: play.id, snapshot: clonePlaybook([play])[0], startedAt: new Date().toISOString() });
    setGameDayDialog(false);
    notify("Temporary game-day variation started");
  };

  const resolveGameDay = (resolution) => {
    if (!gameDayStorage.writable) return;
    if (mutationLocked) return;
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

    if (resolution !== "replace") {
      // The original was just restored from its snapshot, so the session
      // history (which still holds every edit made during the adjustment) no
      // longer describes it: one Ctrl+Z after Discard made the discarded
      // change permanent, with no Temporary chip to say so. Resolving is a
      // commit point, like deleting a play -- it is not part of undo history.
      historyRef.current.delete(gameDay.playId);
      setHistoryVersion((value) => value + 1);
    }
    setLibrary(nextLibrary);
    setPlayId(nextId);
    const nextPlay = nextLibrary.find((item) => item.id === nextId);
    if (compactViewport()) clearSelection();
    else focusAssignment(nextPlay, defaultAssignmentId(nextPlay));
    setGameDay(null);
    setGameDayDialog(false);
  };

  /*
   * Recovery copies the restore flow would replace, read fresh whenever the
   * dialog or the stored state changes, so the confirmation always names the
   * copy that is actually there.
   */
  const recoveryInfo = (key) => {
    let raw;
    try { raw = store.reader.getItem(key); } catch (error) { return { key, raw: null, createdAt: null, unavailable: error.message }; }
    if (raw === null) return null;
    let createdAt = null;
    try { createdAt = JSON.parse(raw)?.createdAt ?? null; } catch { /* damaged copy: still kept and offered */ }
    return { key, raw, createdAt };
  };
  const existingRecovery = useMemo(() => (dataToolsDialog ? recoveryInfo(RECOVERY_WORKSPACE_KEY) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataToolsDialog, restoreCandidate, baseEpoch, storageState, workspace]);
  const existingGameDayRecovery = useMemo(() => (dataToolsDialog && gameDayStorage.error ? recoveryInfo(GAME_DAY_RECOVERY_KEY) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataToolsDialog, baseEpoch, gameDayStorage]);
  const unsavedRisk = Boolean(saveError || conflict || auth.reason?.kind === "lost" || heldDrafts.length);
  const preservedNow = unsavedRisk ? preservationCurrent() : false;
  /** The file also holds what is stored, completely, so replacing it is allowed. */
  const storedPreservedNow = preservedNow && preservationCurrent({ needsStored: true });
  /** Restore must wait for a current, complete preservation file while storage lacks what this tab holds. */
  const restoreNeedsPreservation = Boolean(saveError || conflict) && !storedPreservedNow;
  /*
   * While this tab holds work that storage does not (a failed save, a paused
   * conflict, a lost lease) and no current preservation file covers it, ask
   * before the page goes away. Best effort: iPadOS may not show the prompt.
   */
  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (handlersRef.current.leaveIsSafe()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);
  const handoverNotice = auth.status === "editor" && auth.requested
    ? "Another tab is waiting to edit. Save or cancel this dialog so this tab can hand over."
    : null;

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
      if (mutationLocked && !["Escape", " ", "[", "]"].includes(event.key)) return;
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
          if (editRegionId) { leaveRegionEdit(); return; }
          // Step back out: drop a drawing tool first, then the selection.
          if (activeTool !== "Select") setActiveTool("Select");
          else if (present) setPresent(false);
          else dismissInspector();
          return;
        case "Delete":
        case "Backspace":
          if (!route) return;
          event.preventDefault();
          if (editRegionId) changeResponsibilityArea(undefined);
          else deleteAssignment();
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
          if (editRegionId && !areaDisabled && route?.definition.responsibilityArea) {
            const area = route.definition.responsibilityArea;
            cancelRegionDrag();
            changeResponsibilityArea({...area,center:clampPoint([area.center[0]+dx,area.center[1]+dy])});
            event.preventDefault();
          } else if (nudgeSelection(dx, dy)) event.preventDefault();
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
    <HandoverNoticeContext.Provider value={handoverNotice}>
    <main className={`app-shell ${present ? "is-presenting" : ""} ${playback === "running" ? "is-running" : ""}`} tabIndex={-1}>
      <div className="status-dock">
        {(storageState.error || gameDayStorage.error || saveError) ? (
          <aside className="storage-recovery" role="alert">
            <strong>{!writable ? "Read-only recovery view" : "Storage needs attention"}</strong>
            <p>{storageState.error || gameDayStorage.error || saveError}</p>
            <div className="authority-actions">
              <button onClick={() => setDataToolsDialog(true)}>Open backup and recovery</button>
              {saveError ? <button onClick={() => downloadPreservation("save-failed")}>Download preservation file</button> : null}
            </div>
          </aside>
        ) : null}
        <AuthorityBanner
          auth={auth}
          dismissed={dismissedNotice === noticeKey}
          onDismiss={() => setDismissedNotice(noticeKey)}
          conflict={conflict}
          preserved={preservedNow}
          storedPreserved={storedPreservedNow}
          storedUnavailable={preservedAs && !preservedAs.durableComplete ? JSON.parse(preservedAs.durable).unavailable : null}
          onEditHere={() => {
            // A tab that lost its lease holds work storage may not have; it
            // starts over from storage only after that work was preserved.
            if (auth.reason?.kind === "lost" && !preservationCurrent()) { refusePreservation(); return; }
            authority.requestEdit();
          }}
          onCancel={() => authority.cancelRequest()}
          onPreserve={() => downloadPreservation(conflict ? "conflict" : auth.reason?.kind === "lost" ? "lost-lease" : "save-failed")}
          onKeepMine={keepThisVersion}
          onLoadSaved={loadSavedVersion}
        />
      </div>
      <Header
        writable={editable}
        viewOnly={!isEditor && auth.status !== "starting"}
        onEditHere={auth.status === "viewer" && auth.reason?.kind !== "lost" ? () => authority.requestEdit() : null}
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
          allPlays={library} family={activePlaybook.name} familyBases={familyBases}
          filters={playFilters} filterOptions={playFilterOptions} plays={visibleLibrary}
          canCreate={!mutationLocked} activeId={play.id} onChange={selectPlay}
          onCreate={() => setCreatePlayDialog(true)} onFilters={setPlayFilters}
        />
      )}
      <section className={`editor-shell ${inspectorOpen ? "" : "inspector-closed"}`}>
        {(
          <ToolRail
            activeTool={activeTool}
            readOnly={mutationLocked}
            canAddPlayer={play.players.length < 11}
            canRedo={canRedo}
            canUndo={canUndo}
            onAddPlayer={addPlayer}
            onDelete={() => setDeletePlayDialog(true)}
            onDetails={() => setDetailsDialog(true)}
            onAddCover3={addCover3Lesson}
            onDuplicate={duplicatePlay}
            onApplyConcept={() => { setApplyConceptError(""); setApplyConceptDialog(true); }}
            onApplyFormation={() => setApplyFormationDialog(true)}
            canGameDay={gameDayStorage.writable}
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
          <LayerBar background={background} onBackground={setBackground} layers={layers} onChange={setLayers} view={view} onView={(nextView) => { setView(nextView); setPlayback("idle"); }} showDepths={showDepths} onShowDepths={setShowDepths} />
          <PlayCanvas
            ref={svgRef}
            background={background}
            editable={!mutationLocked}
            editRegionId={editRegionId}
            projectionOverride={frozenRegionProjection}
            onBeginRegionDrag={beginRegionDrag}
            onPointerCancel={() => { cancelRegionDrag(); playerDrag.current=null; routePointDrag.current=null; drawing.current=false; setDraftAssignment([]); setDragInfo(null); }}
            activeTool={activeTool}
            draftAssignment={draftAssignment}
            onPointerDown={startDraw}
            onPointerMove={movePointer}
            onPointerUp={finishPointer}
            onStartPointDrag={startPointDrag}
            onSelectPlayer={selectPlayer}
            onSelectAssignment={selectAssignment}
            play={displayPlay}
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
            areaDisabled={areaDisabled}
            areaOwner={responsibilityOwnerKeys(play).get(selectedPlayerId) ?? selectedPlayerLabel}
            editingArea={editRegionId === route?.id}
            onResponsibilityArea={changeResponsibilityArea}
            onEditArea={() => { cancelRegionDrag(); setEditRegionId(editRegionId === route?.id ? null : route?.id); }}
            assignments={playerAssignments}
            leaving={inspectorLeaving}
            route={route}
            unit={selectedUnit}
            label={selectedPlayerLabel}
            reference={referenceLocked}
            viewOnly={!isEditor ? (auth.status === "unsupported" ? "Editing is off in this browser." : auth.status === "starting" ? "Opening the workspace…" : "Editing is open in another tab. Choose Edit here to take over.") : conflict ? "Saving is paused until the conflict is resolved." : null}
            lockReason={!writable ? "Restore a valid backup to resume editing." : undefined}
            locked={currentLayerLocked}
            unavailableTypes={unavailableTypes}
            copyTargets={copyTargets}
            offensePlayers={play.players}
            onAddStage={addAssignmentStage}
            onClose={dismissInspector}
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
      {detailsDialog ? <PlayDetailsDialog play={play} onClose={() => setDetailsDialog(false)} onSave={(details) => { updatePlay(play.id, (current) => ({ ...current, ...details, fieldSide: normalizeFieldSide(details.fieldSide) })); setDetailsDialog(false); notify("Play details saved"); }} /> : null}
      {createPlayDialog ? <CreatePlayDialog currentPlay={play} formations={activePlaybook.formations} onClose={() => setCreatePlayDialog(false)} onCreate={createPlay} /> : null}
      {deletePlayDialog ? <DeletePlayDialog canDelete={library.length > 1} play={play} onClose={() => setDeletePlayDialog(false)} onDelete={deletePlay} /> : null}
      {newPlaybookDialog ? <NewPlaybookDialog onClose={() => setNewPlaybookDialog(false)} onCreate={createPlaybook} /> : null}
      {saveFormationDialog ? <SaveFormationDialog play={play} onClose={() => setSaveFormationDialog(false)} onSave={saveFormation} /> : null}
      {applyFormationDialog ? <ApplyFormationDialog currentFormation={play.formation} formations={activePlaybook.formations} onClose={() => setApplyFormationDialog(false)} onApply={applyFormation} /> : null}
      {saveConceptDialog ? <SaveConceptDialog concepts={activePlaybook.concepts} play={play} onClose={() => setSaveConceptDialog(false)} onSave={saveConcept} /> : null}
      {applyConceptDialog ? <ApplyConceptDialog error={applyConceptError} concepts={activePlaybook.concepts} currentConceptId={play.conceptTemplateId} onClose={() => setApplyConceptDialog(false)} onApply={applyConcept} /> : null}
      {dataToolsDialog ? (
        <DataToolsDialog
          gameDayRecovery={gameDayStorage.error ? gameDayStorage : null}
          onRecoverGameDay={recoverSavedGameDay}
          writable={writable}
          canRestore={isEditor}
          gameDayActive={Boolean(gameDay)}
          existingRecovery={existingRecovery}
          existingGameDayRecovery={existingGameDayRecovery}
          recoveryAck={recoveryAck}
          onRecoveryAck={setRecoveryAck}
          onDownloadRecovery={downloadRecoveryCopy}
          onPreserve={() => downloadPreservation(restoreNeedsPreservation ? "before-restore" : "manual")}
          restoreNeedsPreservation={restoreNeedsPreservation}
          preservationIncomplete={Boolean(preservedAs && !preservedAs.durableComplete)}
          activePlaybook={activePlaybook}
          offlineStatus={offlineStatus}
          onBackup={() => {
            if (!writable) return;
            try {
              downloadWorkspaceBackup(workspace);
              notify("Football OS backup downloaded");
            } catch (error) { notifyProblem(error.message); }
          }}
          onClose={() => { setDataToolsDialog(false); setRestoreCandidate(null); setRecoveryAck(null); }}
          onConfirmRestore={confirmRestore}
          onRestoreVersion={(version) => {
            try { setRestoreCandidate(parseRestoreFile(restoreText, { version })); setRecoveryAck(null); setRestoreError(""); }
            catch (error) { setRestoreError(error.message); }
          }}
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
      {exportJob ? <LessonExport {...exportJob} onReady={exportReady} /> : null}
      {printPreview ? <PrintCollectionPreview background={background} view={view} layers={layers} playbook={activePlaybook} plays={visibleLibrary.length ? visibleLibrary : library} onClose={() => setPrintPreview(false)} /> : null}
      <Feedback
        feedback={feedback}
        onAction={() => {
          feedback?.onAction?.();
          setFeedback(null);
        }}
        onDismiss={() => setFeedback(null)}
      />
    </main>
    </HandoverNoticeContext.Provider>
  );
}
