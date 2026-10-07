/*
 * PROTOTYPE -- NOT ACTIVE. Nothing in the app imports this file
 * (tests/write-boundary.test.mjs enforces that) and no stored data uses it.
 * Activating it is a persistence-format change that needs owner approval;
 * see docs/multi-tab/crash-atomicity.md.
 *
 * Problem. localStorage is atomic per key, not across keys. A game-day
 * resolution writes the workspace and the game-day record; a restore writes
 * the recovery copy, the game-day record and the workspace. The editor lock
 * stops two tabs interleaving those writes, and the durable store rolls back
 * when a write *throws*, but a tab that *dies* between two setItem calls
 * leaves a mix of old and new records.
 *
 * Approach: a redo journal. A multi-key commit first writes one record under
 * JOURNAL_KEY holding every new value plus the bytes it expects to replace.
 * Writing one key is atomic, so the journal either exists in full or not at
 * all. Then the keys are applied and the journal removed. On the next start,
 * before anything is read for editing, `recoverJournal` finishes a journal it
 * finds (roll forward). Every crash point therefore yields the complete old
 * state (journal never written) or the complete new state (journal replayed).
 *
 * Replay is refused, and the journal kept, when a key holds bytes that are
 * neither the expected old value nor the new one: a writer outside the lock
 * changed it, and replaying would overwrite that silently.
 */

export const JOURNAL_KEY = "football-os.journal.v1";
export const JOURNAL_FORMAT = 1;

export class JournalConflictError extends Error {
  constructor(keys) {
    super(`A pending save could not be finished because ${keys.join(", ")} changed outside it. Both versions are kept.`);
    this.name = "JournalConflictError";
    this.keys = keys;
  }
}

/** writes: [[key, value | null], ...] in apply order. */
export function commitWithJournal(storage, writes, { id = `${Date.now()}`, now = () => new Date().toISOString() } = {}) {
  if (storage.getItem(JOURNAL_KEY) !== null) throw new Error("An unfinished save must be recovered before saving again.");
  const entries = writes.map(([key, value]) => ({ key, value, expected: storage.getItem(key) }));
  // 1. The intent, in one atomic write. If this throws (quota), nothing changed.
  storage.setItem(JOURNAL_KEY, JSON.stringify({ format: JOURNAL_FORMAT, id, createdAt: now(), entries }));
  // 2. Apply. A crash anywhere from here on is finished by recoverJournal.
  for (const { key, value } of entries) {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  }
  // 3. Done.
  storage.removeItem(JOURNAL_KEY);
}

/**
 * Run under the editor lock at startup, before the editable base is read.
 * Returns what happened so the app can say so.
 */
export function recoverJournal(storage) {
  const raw = storage.getItem(JOURNAL_KEY);
  if (raw === null) return { state: "clean" };
  let journal;
  try { journal = JSON.parse(raw); } catch { return { state: "unreadable", raw }; }
  if (journal?.format !== JOURNAL_FORMAT || !Array.isArray(journal.entries)) return { state: "unreadable", raw };
  const conflicts = journal.entries
    .filter(({ key, value, expected }) => { const now = storage.getItem(key); return now !== expected && now !== value; })
    .map(({ key }) => key);
  if (conflicts.length) throw new JournalConflictError(conflicts);
  for (const { key, value } of journal.entries) {
    if (storage.getItem(key) === value) continue;
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  }
  storage.removeItem(JOURNAL_KEY);
  return { state: "replayed", id: journal.id, keys: journal.entries.map(({ key }) => key) };
}
