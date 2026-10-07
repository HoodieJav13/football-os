import { normalizePlay } from "./playData.js";
import { normalizeWorkspace, parseWorkspaceBackup, validPlays, WORKSPACE_VERSION } from "./workspaceData.js";

/*
 * A preservation file is what a coach downloads when this tab cannot save, or
 * before choosing between two versions of a workspace. An ordinary backup is
 * not enough for that job: during a game-day adjustment the workspace holds
 * the *temporary* version of the play and the original exists only in the
 * adjustment record, and a dialog with typed-but-unsaved values exists only in
 * the page. So the file carries:
 *
 *   live      what this tab is showing: workspace, active adjustment with its
 *             original snapshot, and where the coach was (book and play)
 *   drafts    unfinished UI work with its values (not applied on restore)
 *   durable   every football-os.* key exactly as stored, so a version written
 *             by another tab or an older app is kept byte for byte
 *
 * It restores through the normal Restore flow: the live workspace and, when
 * it is consistent, the adjustment with its original.
 */

export const PRESERVATION_FORMAT = "football-os-preservation";
export const PRESERVATION_FORMAT_VERSION = 1;
const PRESERVATION_EXTENSION = ".footballos";

export function createPreservationBundle({ reason, workspace, gameDay, location, drafts = [], durable = {}, liveValid = true, createdAt = new Date().toISOString() }) {
  return {
    format: PRESERVATION_FORMAT,
    formatVersion: PRESERVATION_FORMAT_VERSION,
    createdAt,
    reason,
    live: liveValid && workspace ? {
      workspaceVersion: WORKSPACE_VERSION,
      workspace,
      gameDay: gameDay ? { ...gameDay, workspaceVersion: WORKSPACE_VERSION } : null,
      location: location ?? null,
    } : null,
    drafts,
    durable,
  };
}

export function preservationFilename(createdAt) {
  return `football-os-preservation-${createdAt.slice(0, 19).replace(/[:T]/g, "-")}${PRESERVATION_EXTENSION}`;
}

/** What a coach is told the file contains, so the claim matches the content. */
export function describePreservation(bundle) {
  const parts = [];
  if (bundle.live) {
    const plays = bundle.live.workspace.playbooks.reduce((total, book) => total + book.plays.length, 0);
    parts.push(`${bundle.live.workspace.playbooks.length} playbooks · ${plays} plays from this tab`);
    if (bundle.live.gameDay) parts.push("the game-day adjustment and its original play");
  } else {
    parts.push("no loaded workspace (this tab is in recovery)");
  }
  if (bundle.drafts.length) parts.push(`${bundle.drafts.length} unfinished draft${bundle.drafts.length === 1 ? "" : "s"}`);
  const keys = Object.keys(bundle.durable).length;
  parts.push(`${keys} saved record${keys === 1 ? "" : "s"} exactly as stored`);
  return parts.join(" · ");
}

/** The book an adjustment belongs to, following an id the upgrade remapped. */
function adjustmentBook(gameDay, workspace) {
  if (typeof gameDay.playId !== "string" || gameDay.playId !== gameDay.snapshot?.id || !validPlays([gameDay.snapshot])) return null;
  const holds = (book) => book.plays.some((play) => play.id === gameDay.playId);
  return workspace.playbooks.find((book) => book.id === gameDay.playbookId && holds(book))
    ?? workspace.playbooks.find((book) => book.migratedFromId === gameDay.playbookId && holds(book))
    ?? null;
}

/**
 * Accepts an ordinary backup or a preservation file. A preservation file whose
 * adjustment does not belong to its workspace is refused whole rather than
 * restored without the original it was meant to protect.
 */
export function parseRestoreFile(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  if (parsed?.format !== PRESERVATION_FORMAT) return { ...parseWorkspaceBackup(text), gameDay: null, drafts: [] };
  if (parsed.formatVersion !== PRESERVATION_FORMAT_VERSION) throw new Error(`That preservation file was written by a newer version of Football OS (format ${parsed.formatVersion}).`);
  if (!parsed.live) throw new Error("That preservation file holds only raw saved records (the tab that wrote it was in recovery). Open it to copy data out; it cannot be restored directly.");
  const workspace = normalizeWorkspace(parsed.live.workspace);
  if (!workspace) throw new Error("The preservation file's workspace is incomplete or contains invalid play data.");
  const saved = parsed.live.gameDay ?? null;
  const book = saved ? adjustmentBook(saved, workspace) : null;
  if (saved && !book) throw new Error("The preservation file's game-day adjustment does not match its workspace, so it was not restored.");
  const gameDay = saved ? { ...saved, playbookId: book.id } : null;
  return {
    exportedAt: parsed.createdAt ?? null,
    upconvertedFrom: null,
    preservation: true,
    workspace,
    gameDay: gameDay ? { ...gameDay, snapshot: normalizePlay(gameDay.snapshot) } : null,
    drafts: Array.isArray(parsed.drafts) ? parsed.drafts : [],
    playbookCount: workspace.playbooks.length,
    playCount: workspace.playbooks.reduce((total, book) => total + book.plays.length, 0),
    conceptCount: workspace.playbooks.reduce((total, book) => total + book.concepts.length, 0),
  };
}
