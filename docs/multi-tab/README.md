# Dependable multi-tab editing

Product rule: **one editor per workspace.** Other tabs are view-only and may
request a cooperative transfer. A transfer waits until the editor's unfinished
form and gesture drafts are resolved and its changes are saved. There is no
timeout-based stealing, forced reload or silent draft discard. A hidden or
suspended editor keeps ownership. After the editor actually closes, a tab must
acquire authority and reread durable state before editing.

This closes the rehearsal's D3 (`docs/rehearsal/2026-10-03/report.md` §3):
two tabs silently overwrote each other because each wrote its whole in-memory
copy on a debounce and again on hide/close.

## Architecture

```
            ┌────────────── one browser profile, one origin ──────────────┐
  Tab A     │  editorAuthority ──Web Lock "football-os.editor"── Tab B     │
  (editor)  │   lease epoch N                                  (viewer)    │
            │        │ isCurrent(N)?                                       │
  App state ┼──► durableStore.transact(N, writes) ──► localStorage ◄── read │
  (epoch N) │     · lease check     · out-of-band check                    │
            │     · ordered writes  · rollback on throw                    │
            └──────────────────────────────────────────────────────────────┘
```

| Module | Responsibility |
| --- | --- |
| `src/editorAuthority.js` | Web Lock lease per editing session (epoch), `requestEdit` queues for the lock, cooperative `tryHandover`, BroadcastChannel hints plus `locks.query()` polling so a missed message cannot strand a request, lease-lock verification on resume, fail-closed when Web Locks are missing. |
| `src/durableStore.js` | The **only** module that writes localStorage. `adopt(epoch)` records the bytes a lease starts from; `transact(epoch, fn)` refuses a non-current lease, refuses if any watched key (legacy keys included) changed behind the editor, writes in order, and undoes earlier writes if a later one throws. |
| `src/draftRegistry.js` | `useDraft` for dirty dialogs and blur-committed fields; handover waits for them; preservation files list them. |
| `src/preservation.js` | Preservation file (live workspace, game-day adjustment with its original snapshot, location, drafts, every `football-os.*` key as stored) and `parseRestoreFile`, which restores it — adjustment included — through the normal Restore flow. |
| `src/AuthorityBanner.jsx` | View-only chip, editor/requester/conflict/unsupported notices, the in-dialog handover notice. |
| `src/journalPrototype.js` | **Inactive** crash-atomicity prototype; see `crash-atomicity.md`. |

### Every shared writer, one boundary

| Writer | Path |
| --- | --- |
| Autosave (debounced) and the hide/close flush | `saveNow` → `transact(epoch)` writes workspace then game-day record |
| Mount / first save of a migrated or normalised workspace | the same autosave, only after the lock callback reread storage (`adoptDurable(epoch)`) |
| Game-day start and every resolution | the same transaction, immediately (commit point) |
| Backup or preservation-file restore | `transact(epoch, restoreWorkspace)`: recovery copy (with raw game-day record) → game-day record → workspace |
| Damaged-adjustment recovery | `transact(epoch, recoverGameDay)` |
| Conflict resolution ("Keep this tab's version") | `adopt` again after the coach downloaded a preservation file, then `saveNow` |
| Handover | `prepareHandover` → `saveNow`; the lock is released only after it succeeds |

`tests/write-boundary.test.mjs` fails if any other module writes storage.

### Why epochs

The workspace in React state is tagged with the epoch it was read under
(`baseEpoch`). A write carries that epoch; the store accepts it only while that
exact lease is active. So a debounce timer, a hide listener or an awaited
continuation created before a handover cannot publish its stale copy after it,
and a new editor's first write is guaranteed to start from the bytes it read
under the lock.

## Evidence

- Red-before / green-after logs: see the delivery notes for this branch (raw
  logs are attached to the hand-off, not committed).
- Browser acceptance: `tests/browser/multi-tab.test.mjs` (two genuine pages in
  one context; durable state read by a fresh third page that does not run the
  app) and `tests/browser/crash-windows.test.mjs`.
- Unit: `tests/editor-authority.test.mjs`, `tests/durable-store.test.mjs`,
  `tests/preservation.test.mjs`, `tests/write-boundary.test.mjs`,
  `tests/journal-prototype.test.mjs`.

## Known limits

- **Crash atomicity is not provided** across the two or three keys of a
  game-day or restore save; see `crash-atomicity.md` (owner decision).
- **Out-of-band check granularity.** A writer outside the lock that changes a
  key *between* the store's check and its `setItem` in the same task is not
  detected; only older app builds or devtools can be such a writer.
- **Same profile only.** Separate browser profiles, private windows and
  different browsers have separate storage and are separate workspaces.
- **Draft registration** covers the dialogs and blur-committed fields that
  exist today. A new form must call `useDraft` to hold a handover.
- **Chromium only in automation.** Safari/iPadOS behaviour is a manual check:
  `ipad-checklist.md`.
