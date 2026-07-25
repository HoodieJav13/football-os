import {
  basePlayers,
  clonePlaybook,
  createSeedPlaybooks,
  normalizePlay,
} from "./playData.js";

export const WORKSPACE_VERSION = 8;
export const WORKSPACE_KEY = `football-os.playbooks.v${WORKSPACE_VERSION}`;
export const RECOVERY_WORKSPACE_KEY = "football-os.recovery.v1";
export const LEGACY_WORKSPACE_KEYS = [
  "football-os.playbooks.v7",
  "football-os.playbooks.v6",
  "football-os.playbooks.v5",
];

function validAssignments(assignments) {
  return Array.isArray(assignments)
    && assignments.every((assignment) => (
      assignment
      && typeof assignment.id === "string"
      && typeof assignment.player === "string"
      && Array.isArray(assignment.points)
      && assignment.points.length >= 2
      && assignment.points.every((point) => (
        Array.isArray(point)
        && point.length === 2
        && point.every(Number.isFinite)
      ))
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
      && Array.isArray(play.players)
      && validAssignments(play.routes)
    ));
}

export function validConcepts(value) {
  return Array.isArray(value)
    && value.every((concept) => (
      concept
      && typeof concept.id === "string"
      && typeof concept.name === "string"
      && concept.name.trim().length > 0
      && Array.isArray(concept.players)
      && Array.isArray(concept.defenders)
      && validAssignments(concept.assignments)
    ));
}

export function normalizeWorkspace(value) {
  const valid = [5, 6, 7, 8].includes(value?.version)
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

  const playbooks = value.playbooks.map((book) => ({
    ...book,
    concepts: clonePlaybook(book.concepts ?? []),
    formations: book.formations?.length
      ? clonePlaybook(book.formations)
      : [{
          id: `${book.id}-base`,
          name: book.plays[0].formation,
          personnel: book.plays[0].personnel,
          players: clonePlaybook(book.plays[0].players ?? basePlayers),
        }],
    plays: book.plays.map(normalizePlay),
  }));

  const mainPlaybookId = playbooks.some((book) => book.id === value.mainPlaybookId)
    ? value.mainPlaybookId
    : playbooks[0].id;
  const activePlaybookId = playbooks.some((book) => book.id === value.activePlaybookId)
    ? value.activePlaybookId
    : mainPlaybookId;

  return {
    version: WORKSPACE_VERSION,
    mainPlaybookId,
    activePlaybookId,
    playbooks,
  };
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
    format: "football-os-workspace",
    formatVersion: 1,
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

  if (parsed?.format !== "football-os-workspace" || parsed?.formatVersion !== 1) {
    throw new Error("That file is not a Football OS backup.");
  }

  const workspace = normalizeWorkspace(parsed.workspace);
  if (!workspace) throw new Error("The backup is incomplete or contains invalid play data.");

  return {
    exportedAt: parsed.exportedAt ?? null,
    workspace,
    playbookCount: workspace.playbooks.length,
    playCount: workspace.playbooks.reduce((total, book) => total + book.plays.length, 0),
    conceptCount: workspace.playbooks.reduce((total, book) => total + book.concepts.length, 0),
  };
}
