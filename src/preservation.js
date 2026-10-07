import { normalizePlay } from "./playData.js";
import { validateResponsibilityAreas } from "./responsibilityArea.js";
import { normalizeWorkspace, parseWorkspaceBackup, validPlays, WORKSPACE_VERSION } from "./workspaceData.js";
import { loadGameDayState, loadWorkspaceState } from "./workspaceStorage.js";

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
 *   durableUnavailable
 *             why stored records could not be read, when they could not: the
 *             file is still written, and says so, rather than failing
 *
 * It restores through the normal Restore flow: the live workspace and, when
 * it is consistent, the adjustment with its original.
 */

export const PRESERVATION_FORMAT = "football-os-preservation";
export const PRESERVATION_FORMAT_VERSION = 1;
const PRESERVATION_EXTENSION = ".footballos";

export function createPreservationBundle({ reason, workspace, gameDay, location, drafts = [], durable = {}, durableUnavailable = null, liveValid = true, createdAt = new Date().toISOString() }) {
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
    durableUnavailable,
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
  if (bundle.durableUnavailable) parts.push(`saved records could not be read (${bundle.durableUnavailable})`);
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

/** Whether a saved adjustment belongs to this workspace (and so can be restored with it). */
export function adjustmentBelongs(gameDay, workspace) {
  return Boolean(gameDay && workspace?.playbooks && adjustmentBook(gameDay, workspace));
}

/**
 * The adjustment as the loader would accept it, or an error. Restore must not
 * write an adjustment that the next load would reject as damaged.
 */
function checkedAdjustment(saved, workspace, what) {
  if (!saved) return null;
  const book = adjustmentBook(saved, workspace);
  if (!book) throw new Error(`${what} game-day adjustment does not match its workspace, so it was not restored.`);
  try {
    validateResponsibilityAreas(saved.snapshot, "game-day snapshot", true);
  } catch (error) {
    throw new Error(`${what} game-day adjustment is damaged (${error.message}), so it was not restored.`);
  }
  return { ...saved, playbookId: book.id, snapshot: normalizePlay(saved.snapshot) };
}

/** One shape for comparing adjustments, whichever key or loader produced them. */
const canonicalAdjustment = (gameDay) => (gameDay
  ? { playbookId: gameDay.playbookId, playId: gameDay.playId, startedAt: gameDay.startedAt ?? null, snapshot: normalizePlay(gameDay.snapshot) }
  : null);

/**
 * The version the file recorded as stored, chosen exactly as the app chooses
 * what to open: the first present workspace key (current or legacy) and the
 * first present adjustment key (current or legacy), through the same loaders.
 * Returns `{ error }` when a stored version exists but cannot be restored
 * whole -- a damaged workspace, or an adjustment that is damaged or does not
 * belong to it -- rather than offering it without its adjustment.
 */
function storedVersion(durable) {
  if (!durable || typeof durable !== "object") return null;
  const reader = { getItem: (key) => (Object.hasOwn(durable, key) ? durable[key] : null) };
  const saved = loadWorkspaceState(reader);
  if (saved.sourceKey === null) return null;
  if (!saved.writable) return { error: `The stored workspace (${saved.sourceKey}) is damaged, so it cannot be restored from this file.` };
  const adjustment = loadGameDayState(reader, saved.workspace);
  if (!adjustment.writable) return { error: `The stored game-day adjustment (${adjustment.sourceKey}) is damaged, so the stored version cannot be restored whole.` };
  try {
    return { workspace: saved.workspace, gameDay: checkedAdjustment(adjustment.gameDay, saved.workspace, "The stored"), sourceKey: saved.sourceKey, gameDaySourceKey: adjustment.gameDay ? adjustment.sourceKey : null };
  } catch (error) {
    return { error: error.message };
  }
}

const sameState = (a, b) => JSON.stringify({ workspace: a.workspace, gameDay: canonicalAdjustment(a.gameDay) })
  === JSON.stringify({ workspace: b.workspace, gameDay: canonicalAdjustment(b.gameDay) });

const summary = (workspace) => ({
  playbookCount: workspace.playbooks.length,
  playCount: workspace.playbooks.reduce((total, book) => total + book.plays.length, 0),
  conceptCount: workspace.playbooks.reduce((total, book) => total + book.concepts.length, 0),
});

/**
 * Accepts an ordinary backup or a preservation file. A preservation file whose
 * adjustment does not belong to its workspace is refused whole rather than
 * restored without the original it was meant to protect.
 *
 * A preservation file written during a conflict holds two versions: this
 * tab's (`live`) and the one found in storage (`durable`). `version: "stored"`
 * restores the latter, so "the other version is in the file" is a version a
 * coach can actually get back, not just bytes in JSON.
 */
export function parseRestoreFile(text, { version = "live" } = {}) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  if (parsed?.format !== PRESERVATION_FORMAT) return { ...parseWorkspaceBackup(text), gameDay: null, drafts: [] };
  if (parsed.formatVersion !== PRESERVATION_FORMAT_VERSION) throw new Error(`That preservation file was written by a newer version of Football OS (format ${parsed.formatVersion}).`);
  const stored = storedVersion(parsed.durable);
  const drafts = Array.isArray(parsed.drafts) ? parsed.drafts : [];
  const base = { exportedAt: parsed.createdAt ?? null, upconvertedFrom: null, preservation: true, drafts };
  if (version === "stored") {
    if (!stored) throw new Error("The preservation file holds no stored version.");
    if (stored.error) throw new Error(stored.error);
    return { ...base, version: "stored", storedAvailable: true, liveAvailable: Boolean(parsed.live), ...stored, ...summary(stored.workspace) };
  }
  if (!parsed.live) {
    if (stored?.error) throw new Error(stored.error);
    if (stored) return { ...base, version: "stored", storedAvailable: true, liveAvailable: false, ...stored, ...summary(stored.workspace) };
    throw new Error("That preservation file holds only raw saved records (the tab that wrote it was in recovery). Open it to copy data out; it cannot be restored directly.");
  }
  const workspace = normalizeWorkspace(parsed.live.workspace);
  if (!workspace) throw new Error("The preservation file's workspace is incomplete or contains invalid play data.");
  const gameDay = checkedAdjustment(parsed.live.gameDay ?? null, workspace, "The preservation file's");
  // Offered whenever the stored version is restorable and differs from the
  // tab's in workspace *or* adjustment -- identical playbooks with different
  // adjustments are two different states.
  const storedDiffers = Boolean(stored) && !stored.error && !sameState(stored, { workspace, gameDay });
  return { ...base, version: "live", storedAvailable: storedDiffers, storedError: stored?.error ?? null, liveAvailable: true, workspace, gameDay, ...summary(workspace) };
}
