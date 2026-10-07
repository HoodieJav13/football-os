import { LEGACY_WORKSPACE_KEYS, RECOVERY_WORKSPACE_KEY, WORKSPACE_KEY } from "./workspaceData.js";
import { GAME_DAY_KEY, GAME_DAY_RECOVERY_KEY, LEGACY_GAME_DAY_KEYS, LEGACY_LIBRARY_KEY } from "./workspaceStorage.js";

/*
 * The one place in the app that writes localStorage.
 *
 * Every shared writer -- autosave, the hide/close flush, game-day start and
 * resolution, backup restore, damaged-data recovery and the first save of a
 * migrated workspace -- goes through `transact`, which enforces three things
 * at the moment of writing rather than trusting the caller:
 *
 *   1. Authority. The write carries the epoch of the editing lease its data
 *      was read under. A revoked lease, a lease from an earlier editing
 *      session in this same tab, or data adopted before the lease began are
 *      all refused, so a timer or listener that outlived its lease cannot
 *      publish a stale copy.
 *   2. No silent overwrite. Every watched key must still hold exactly the
 *      bytes this tab last read or wrote. Anything else means a writer that
 *      does not take part in the lock (an older version of the app still open
 *      in another tab, devtools, a bug) changed it, and the transaction stops
 *      before touching anything.
 *   3. All or nothing on failure. Keys are written in the order given; if a
 *      write throws (quota), the ones already written are put back. If even
 *      that fails the error says which keys were left changed.
 *
 * This is concurrency protection, not crash atomicity: a process that dies
 * between two setItem calls still leaves the first one written. See
 * docs/multi-tab/crash-atomicity.md.
 */

/** Keys this app writes. Anything else is refused outright. */
export const WRITABLE_KEYS = Object.freeze([WORKSPACE_KEY, GAME_DAY_KEY, RECOVERY_WORKSPACE_KEY, GAME_DAY_RECOVERY_KEY]);

/** Keys whose bytes must not change behind an editor's back, legacy ones included. */
export const WATCHED_KEYS = Object.freeze([
  ...WRITABLE_KEYS,
  ...LEGACY_WORKSPACE_KEYS,
  LEGACY_LIBRARY_KEY,
  ...LEGACY_GAME_DAY_KEYS,
]);

export class RevokedWriteError extends Error {
  constructor() {
    super("This tab is not the editor, so nothing was saved.");
    this.name = "RevokedWriteError";
  }
}

export class OutOfBandWriteError extends Error {
  constructor(keys) {
    super(`Saved data was changed outside this tab (${keys.join(", ")}). Nothing was overwritten.`);
    this.name = "OutOfBandWriteError";
    this.keys = keys;
  }
}

const windowStorage = () => window.localStorage;

/**
 * `isCurrent(epoch)` is supplied by the editor authority and answers whether
 * that lease is the active one right now.
 */
export function createDurableStore({ storage = windowStorage, isCurrent }) {
  let known = new Map();
  let knownEpoch = 0;

  const read = (key) => storage().getItem(key);
  const changedKeys = () => WATCHED_KEYS.filter((key) => read(key) !== known.get(key));

  return {
    /** Read-only view for loaders and for display. */
    reader: Object.freeze({ getItem: (key) => read(key) }),

    /** Every Football OS key as it is stored right now, for preservation files. */
    snapshot() {
      const values = {};
      const all = storage();
      for (let index = 0; index < all.length; index += 1) {
        const key = all.key(index);
        if (key?.startsWith("football-os.")) values[key] = all.getItem(key);
      }
      return values;
    },

    /**
     * Records the bytes an editing lease starts from. Called inside the lock
     * callback, before the tab is allowed to edit, by the same code that
     * rereads the workspace -- so what the editor edits and what the store
     * expects to overwrite are the same bytes.
     */
    adopt(epoch) {
      knownEpoch = epoch;
      known = new Map(WATCHED_KEYS.map((key) => [key, read(key)]));
    },

    /** Watched keys that differ from what this editor last read or wrote. */
    drift(epoch) {
      if (epoch !== knownEpoch || !isCurrent(epoch)) return [];
      return changedKeys();
    },

    transact(epoch, apply) {
      if (epoch === 0 || epoch !== knownEpoch || !isCurrent(epoch)) throw new RevokedWriteError();
      const drifted = changedKeys();
      if (drifted.length) throw new OutOfBandWriteError(drifted);

      const undo = [];
      const write = (key, value) => {
        if (!WRITABLE_KEYS.includes(key)) throw new Error(`Refusing to write ${key}`);
        if (!isCurrent(epoch)) throw new RevokedWriteError();
        const previous = read(key);
        if (previous !== known.get(key)) throw new OutOfBandWriteError([key]);
        if (previous === value) return;
        if (value === null) storage().removeItem(key);
        else storage().setItem(key, value);
        undo.push([key, previous]);
        known.set(key, value);
      };
      const guarded = Object.freeze({
        getItem: read,
        setItem: (key, value) => write(key, String(value)),
        removeItem: (key) => write(key, null),
      });

      try {
        return apply(guarded);
      } catch (error) {
        const stuck = [];
        for (const [key, previous] of undo.reverse()) {
          try {
            if (previous === null) storage().removeItem(key);
            else storage().setItem(key, previous);
            known.set(key, previous);
          } catch {
            stuck.push(key);
          }
        }
        if (stuck.length) error.partialKeys = stuck;
        throw error;
      }
    },
  };
}
