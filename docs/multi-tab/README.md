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

## Independent review

An adversarial review of the first two commits (separate agent, no shared
implementation context beyond the diff and these docs) reported eleven
findings. Each was traced in code and fixed with a regression test that is red
on the pre-fix commit and green after:

| # | Finding | Fix |
| --- | --- | --- |
| 1 | A preservation file downloaded earlier unlocked a later conflict's destructive choices | The file's identity (live workspace, adjustment, every stored record) must still match at the moment of choosing |
| 2 | A lost lease never released the editor lock, deadlocking every tab | The lost path releases it |
| 3 | A lock query answered from before a grant could mark a new editor "lost" or see its own request | Snapshots that straddle a lease change are discarded; the editor's own client is excluded |
| 4 | An editor could hand over to a requester that had cancelled or closed | The queue is re-read immediately before release; cancel is broadcast |
| 5 | Two queued requesters bounced the first one out at once | Requests queued before a lease began are deferred and told so; asking again is honoured |
| 6 | A locked field's typed value held the handover open forever | Locked text fields are disabled and hold no draft |
| 7 | Closing a tab with unsaved, unpreserved work gave no warning | `beforeunload` prompt while unsaved and not covered by a current preservation file |
| 8 | "The other version is in your file" was not restorable | Restore offers both the tab's version and the stored version of a preservation file |
| 9 | Storage can reach a new editor after its lock grant | A clean editor rereads instead of raising a false conflict, within 5 s of the grant |
| 10 | Restore accepted adjustments the loader rejects; recovery-copy files could attach a non-matching adjustment | Restore applies the loader's validation; only a matching adjustment is attached |
| 11 | A failing save was retried on every render while a handover waited | Retries come from the authority's poll only |

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
- **Storage propagation after a grant (review #9).** The previous editor's last
  save normally reaches the new editor before its first debounced write; if it
  arrives later, the store's drift check pauses instead of overwriting, except
  in the unlikely case the new editor writes before the update arrives at all.
- **Deferred requesters (review #5).** A tab that queued before the current
  editor took over is told to ask again rather than handed the lock; if the
  deferral message is lost it simply keeps waiting (it is never handed over
  silently, and closing or cancelling clears it).
- **The unload prompt is best effort.** iPadOS Safari may not show
  `beforeunload` prompts; the banner and preservation file remain the route.
- **Chromium only in automation.** Safari/iPadOS behaviour is a manual check:
  `ipad-checklist.md`.
