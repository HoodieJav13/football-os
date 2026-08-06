import {
  basePlayers,
  clonePlaybook,
  createSeedPlaybooks,
  migrateRoster,
  normalizePlay,
} from "./playData.js";

/**
 * Version 9 moved every stored coordinate from an arbitrary 0-100 percentage
 * space to yards measured from the line of scrimmage, gave players stable ids,
 * and renamed `play.routes` to `play.assignments`. Versions 5-8 are read and
 * upconverted; their keys are left in place so an upgrade is recoverable.
 */
export const WORKSPACE_VERSION = 9;
export const WORKSPACE_KEY = `football-os.playbooks.v${WORKSPACE_VERSION}`;
export const RECOVERY_WORKSPACE_KEY = "football-os.recovery.v1";
export const LEGACY_WORKSPACE_KEYS = [
  "football-os.playbooks.v8",
  "football-os.playbooks.v7",
  "football-os.playbooks.v6",
  "football-os.playbooks.v5",
];
const SUPPORTED_VERSIONS = [5, 6, 7, 8, 9];

export const BACKUP_FORMAT = "football-os-workspace";
export const BACKUP_FORMAT_VERSION = 2;
const SUPPORTED_BACKUP_VERSIONS = [1, 2];

function validPoints(points) {
  return Array.isArray(points)
    && points.length >= 2
    && points.every((point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite));
}

/** Accepts both the v9 shape (`playerId`) and the legacy shape (`player`). */
function validAssignments(assignments) {
  return Array.isArray(assignments)
    && assignments.every((item) => (
      item
      && typeof item.id === "string"
      && (typeof item.playerId === "string" || typeof item.player === "string")
      && validPoints(item.points)
    ));
}

function validRoster(roster) {
  if (!Array.isArray(roster)) return false;
  return roster.every((player) => (
    Array.isArray(player)
      // legacy [label, x, y] tuple
      ? player.length === 3 && typeof player[0] === "string" && Number.isFinite(player[1]) && Number.isFinite(player[2])
      : player
        && typeof player.id === "string"
        && typeof player.label === "string"
        && Number.isFinite(player.x)
        && Number.isFinite(player.y)
  ));
}

export function validPlays(value) {
  return Array.isArray(value)
    && value.length > 0
    && value.every((play) => (
      play
      && typeof play.id === "string"
      && typeof play.name === "string"
      && play.name.trim().length > 0
      && validRoster(play.players)
      && validAssignments(play.assignments ?? play.routes)
    ));
}

export function validConcepts(value) {
  return Array.isArray(value)
    && value.every((concept) => (
      concept
      && typeof concept.id === "string"
      && typeof concept.name === "string"
      && concept.name.trim().length > 0
      && validRoster(concept.players)
      && validRoster(concept.defenders)
      && validAssignments(concept.assignments)
    ));
}

/**
 * Concepts are stored alongside plays and use the same coordinate space, so a
 * pre-v9 concept needs the same percent-to-yard conversion. Reusing
 * `normalizePlay` keeps one migration path rather than two.
 */
function migrateConcept(concept) {
  // v5-v8 concepts stored tuple rosters; v9 concepts store player objects.
  // The roster shape is the only unambiguous signal here.
  if (!Array.isArray(concept.players?.[0])) return clonePlaybook(concept);
  const asPlay = normalizePlay({
    id: concept.id,
    name: concept.name,
    players: concept.players,
    defenders: concept.defenders,
    routes: concept.assignments,
  });
  const labelById = new Map([...asPlay.players, ...asPlay.defenders].map((player) => [player.id, player.label]));
  return {
    ...concept,
    players: asPlay.players,
    defenders: asPlay.defenders,
    assignments: asPlay.assignments.map((item) => ({
      ...item,
      positionLabel: item.positionLabel ?? labelById.get(item.playerId) ?? item.playerId,
    })),
  };
}

export function normalizeWorkspace(value) {
  const valid = SUPPORTED_VERSIONS.includes(value?.version)
    && typeof value.mainPlaybookId === "string"
    && typeof value.activePlaybookId === "string"
    && Array.isArray(value.playbooks)
    && value.playbooks.length > 0
    && value.playbooks.every((book) => (
      book
      && typeof book.id === "string"
      && typeof book.name === "string"
      && validPlays(book.plays)
      && (book.concepts === undefined || validConcepts(book.concepts))
    ));

  if (!valid) return null;

  const playbooks = value.playbooks.map((book) => {
    const plays = book.plays.map(normalizePlay);
    return {
      ...book,
      concepts: (book.concepts ?? []).map(migrateConcept),
      formations: book.formations?.length
        ? book.formations.map((formation) => ({
            ...formation,
            players: migrateRoster(formation.players ?? [], { unit: "offense" }),
          }))
        : [{
            id: `${book.id}-base`,
            name: plays[0].formation,
            personnel: plays[0].personnel,
            players: clonePlaybook(plays[0].players ?? basePlayers),
          }],
      plays,
    };
  });

  const mainPlaybookId = playbooks.some((book) => book.id === value.mainPlaybookId)
    ? value.mainPlaybookId
    : playbooks[0].id;
  const activePlaybookId = playbooks.some((book) => book.id === value.activePlaybookId)
    ? value.activePlaybookId
    : mainPlaybookId;

  return { version: WORKSPACE_VERSION, mainPlaybookId, activePlaybookId, playbooks };
}

export function createDefaultWorkspace(personalPlays) {
  const playbooks = createSeedPlaybooks(personalPlays);
  return {
    version: WORKSPACE_VERSION,
    mainPlaybookId: playbooks[0].id,
    activePlaybookId: playbooks[0].id,
    playbooks,
  };
}

export function createWorkspaceBackup(workspace, exportedAt = new Date().toISOString()) {
  const normalized = normalizeWorkspace(workspace);
  if (!normalized) throw new Error("The current workspace is not valid enough to back up.");
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt,
    workspace: normalized,
  };
}

export function parseWorkspaceBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid JSON.");
  }

  if (parsed?.format !== BACKUP_FORMAT) {
    throw new Error("That file is not a Football OS backup.");
  }
  if (!SUPPORTED_BACKUP_VERSIONS.includes(parsed?.formatVersion)) {
    throw new Error(`That backup was written by a newer version of Football OS (format ${parsed?.formatVersion}).`);
  }

  // A format-1 backup holds a v5-v8 percent-space workspace; normalizeWorkspace upconverts it.
  const workspace = normalizeWorkspace(parsed.workspace);
  if (!workspace) throw new Error("The backup is incomplete or contains invalid play data.");

  return {
    exportedAt: parsed.exportedAt ?? null,
    upconvertedFrom: parsed.formatVersion === BACKUP_FORMAT_VERSION ? null : parsed.formatVersion,
    workspace,
    playbookCount: workspace.playbooks.length,
    playCount: workspace.playbooks.reduce((total, book) => total + book.plays.length, 0),
    conceptCount: workspace.playbooks.reduce((total, book) => total + book.concepts.length, 0),
  };
}
