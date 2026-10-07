# Crash atomicity of multi-key saves — proposal (needs owner approval)

**Status: prototype only. Nothing in the app uses it; no stored data changes.**
`src/journalPrototype.js` is not imported anywhere (`tests/write-boundary.test.mjs`
fails if it is). Activating it changes the persistence format and needs an
explicit owner decision.

## Two different guarantees

| Guarantee | What it covers | Status |
| --- | --- | --- |
| **Concurrency protection** | Two tabs can never interleave or overwrite each other's saves. One Web Lock picks the editor; every write goes through `durableStore.transact`, which checks the lease and refuses to overwrite bytes it did not read. | Implemented |
| **Failure atomicity (thrown errors)** | A multi-key save that *throws* part-way (quota) is rolled back to exactly the old bytes. | Implemented (`transact` undo log) |
| **Crash atomicity** | A tab or browser that *dies* between two `setItem` calls leaves either all old or all new records. | **Not implemented** — needs a journal |

localStorage is atomic per key, not across keys. Three operations write more
than one key:

| Operation | Writes, in order (after this change) |
| --- | --- |
| Game-day start / resolve, and any save during an adjustment | workspace → game-day record |
| Restore (backup or preservation file) | recovery copy → game-day record → workspace |
| Recover a damaged adjustment | game-day recovery copy → game-day record |

## What this change already fixed (independently safe)

Before: the game-day record was written immediately on every change but the
workspace only after a 400 ms debounce. A Discard (or Variation / New Play)
wrote "resolved" first; a tab killed in the next 400 ms left the temporary
version as the only copy of the play, with the original gone.
`tests/browser/crash-windows.test.mjs` › "never loses the original play"
reproduces it (red on `f41365f`, green now).

Now both records are written in one transaction, workspace first, so every
crash point keeps the original somewhere durable. Restore records the raw
game-day record inside the recovery copy, so an active adjustment's original
survives a restore (before this change it was lost even without a crash).

## What remains (the residual window)

With ordered writes, these crash points leave a **mixed** state (all
reproduced as `todo` tests that run and report but do not fail the suite):

1. Discard/Variation/New Play, crash after the workspace write: the play is
   already restored (or the new play exists), but the adjustment is still
   marked active. Nothing is lost; the play shows *Temporary* again and must be
   resolved a second time. (`tests/journal-prototype.test.mjs`: crash point 1.)
2. Restore during an adjustment, crash after the game-day write: the restore
   did not land, but the adjustment is marked resolved, so the temporary
   version looks permanent. The original is in the recovery copy, not on the
   board. (Crash points 1–2.)

Real-world exposure is a renderer or browser crash, OS kill or power loss inside
one synchronous task — rare, but iPadOS does kill backgrounded tabs.

## Proposal: redo journal

`commitWithJournal(storage, writes)`:

1. Write one record, `football-os.journal.v1`, holding every new value and the
   bytes each key is expected to hold now. One `setItem`, so it is all or
   nothing; a quota failure here changes nothing.
2. Apply the writes in order.
3. Remove the journal.

`recoverJournal(storage)` runs under the editor lock at startup, before the
editable base is read: a journal it finds is replayed (roll forward) and
removed. Every crash point then yields the complete old state (journal never
written) or the complete new state (journal replayed). Replay is refused, and
the journal kept for preservation, if a key holds bytes that are neither the
expected old value nor the new one.

Tested in isolation (`tests/journal-prototype.test.mjs`): every crash point of
both operations recovers to all-old or all-new; replay refuses an out-of-band
change; a journal that cannot be written changes nothing.

## Costs and decisions for the owner

- **Format change.** A new stored key. A tab running an older build ignores it,
  so during a mixed-version window an old tab could read a half-applied state.
  The lock does not cover old builds (they predate it); the out-of-band check
  does, by pausing the new tab.
- **Storage.** A journal duplicates the records it writes for one task (about
  0.35 MB for the seed workspace, more for large books). Near the quota a
  journaled save can fail where an unjournaled one would succeed; it fails
  cleanly, with the existing save-failure route.
- **Scope.** Activation means: call `recoverJournal` inside the lock callback
  before `adoptDurable`, route multi-key `transact` calls through
  `commitWithJournal`, add the key to `WRITABLE_KEYS`, include it in
  preservation files, flip the three `todo` tests to required.

Options: (A) activate as above; (B) keep ordered writes only (current) and
accept the documented residual window; (C) avoid multi-key saves by storing the
game-day record inside the workspace record (a larger migration: workspace v12).
