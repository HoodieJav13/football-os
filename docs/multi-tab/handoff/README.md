# PR #13 hand-off — replacement guards (after `20ea612`)

## Outcome

| | |
| --- | --- |
| Tested commit | `4ec5f8ed19bf9ea1c371e735e31da6194d7bb696` |
| Tested tree | `e496dc383994534d90542e9922ff92e720aef241` (clean, `uncommitted=0`, first line of `logs/09-…`) |
| Branch | `claude/optimistic-mayer-eyggff` (draft PR #13) |
| Stack | PR #13 → `rehearsal/2026-10-03` @ `f41365f` (PR #12) → `feat/responsibility-areas` @ `cc7af9a` (PR #9); neither head moved, nothing rebased or force-pushed |
| Full suite on the tested commit | unit 187/187 · Sites 3/3 · build OK · browser 141 pass / 0 fail / 2 TODO (`EXIT=0`) |
| Still failing on purpose | the 2 crash-window TODOs (redo journal not activated) |
| Owner decision pending | crash atomicity, options A/B/C in `../crash-atomicity.md` |
| Not run | physical Safari, iPad and installed-PWA checks (`../ipad-checklist.md`) |

The hand-off commit adds only this directory (the report, raw logs, capture
notes and a manifest) and a one-line pointer to it in `../README.md`. No source
or test file changes after `4ec5f8e`.

## The two failure combinations

Each was reproduced in the real app before fixing. The new tests are in
`tests/browser/replacement-guards.test.mjs` and were run against a build of
the unchanged `20ea612` source. All three are red there (`logs/07-…`, 3 fail /
0 pass) and green after the fix (`logs/08-…`, `logs/09-…`).

### 7. An incomplete export allowed a destructive replacement

**Sequence.**
1. The editor holds version A, with the unique label `AONE`.
2. A genuine same-origin page writes version B, a workspace whose first play is
   named `B ONLY`.
3. The editor pauses with a conflict.
4. Only `Storage.prototype.key` is made to throw; `getItem` and `setItem`
   still work.
5. The coach downloads a preservation file and then chooses **Keep this tab's
   version**.

**Before.** Two stored snapshots that failed in the same way compared equal,
so the file "matched" what was stored. Keep was enabled, and A overwrote B,
which the file did not hold. Stored after the attempt: `Mesh` with `AONE`, so
B was lost.

**After.**
- The file records whether its stored snapshot was complete.
- Replacing what is stored requires a complete file that still matches. This
  covers **Keep this tab's version** and also **Restore** over unsaved work
  (test 3).
- The live-only rescue file is still produced, still holds `AONE`, and is
  marked `durableUnavailable`.
- That rescue file still unlocks **Load saved version**, which discards only
  what the file holds.
- Keep stays disabled, and the banner says why: the stored version could not
  be read, so it is not in the file.
- Stored after the attempt: `B ONLY`, untouched.
- No new abandonment choice was added.

### 8. A successful restore followed by a failed reread left the old live state writable

**Sequence.**
1. A has an active game-day adjustment and the saved edit `AOLD`.
2. A backup B (`From Backup`) is restored.
3. The restore transaction succeeds.
4. The very next `getItem` throws once: this is the `store.adopt` reread.
5. Then `visibilitychange`, `pagehide` and an ordinary edit (`Z` → `AFTR`) follow.

**Before.** The store already expected B, but state still held A. The next
flush therefore wrote A over B. Stored afterwards: `Mesh` with `AOLD`, and the
adjustment still active.

**After.**
- The reread and the installation of state are now separate steps.
- If the reread fails, the app installs exactly what the transaction committed:
  the restored workspace and the resolved or unchanged game-day record.
- It also updates the refs the save path reads synchronously, so no write can
  run in between.
- Stored afterwards: `From Backup`, without `AOLD` and with `AFTR`.
- Game-day record: `{ resolved: true, workspaceVersion: 11 }`.
- The board shows `From Backup` with no temporary chip.
- The notice says the state was taken from what was just saved.

### UI captures

The same script was run against both builds (`captures/*-guard-notes.json`):

| | `20ea612` (before) | `4ec5f8e` (after) |
| --- | --- | --- |
| Keep disabled with incomplete file | `false` | `true` |
| Stored name after Keep attempt | `Mesh` (A overwrote B) | `B ONLY` |
| Stored name after restore + failed reread + edit | `Mesh` (old A) | `From Backup` |
| Game-day record afterwards | adjustment still active for `mesh` | `resolved: true` |

The PNG screenshots, the capture script and a git bundle are kept out of the
repository for later direct transfer. Their checksums are in `MANIFEST.txt`.

## Logs

These are raw `node --test` TAP output, copied byte for byte. The `.txt`
extension is used only because `*.log` is gitignored. A first line naming the
tree was written by the run itself; it is absent from the first log.

| File | What ran | Result |
| --- | --- | --- |
| `logs/01-baseline-f41365f-npm-test.txt` | `npm test` on the base `f41365f` | unit 146 · Sites 3 · browser 97 |
| `logs/02-red-before-multitab-on-f41365f.txt` | multi-tab acceptance tests on the base | 0 pass / 25 fail / 2 TODO |
| `logs/03-…`, `logs/03b-…` | independent-review regression tests on `62e4953` | browser 0/3 · unit 8 pass / 4 fail |
| `logs/04-full-npm-test-0f73f16.txt` | `npm test` on `0f73f16` | 179 · 3 · 125 + 2 TODO |
| `logs/05-…`, `logs/05b-…` | preservation-gap tests on `0f73f16` | browser 0/13 · unit 19 pass / 7 fail |
| `logs/06-full-npm-test-20ea612.txt` | `npm test` on `20ea612` | 187 · 3 · 138 + 2 TODO |
| `logs/07-red-before-replacement-guards-on-20ea612.txt` | the 3 new tests on a `20ea612` build | **0 pass / 3 fail** |
| `logs/08-green-after-affected-suites-uncommitted-fix.txt` | replacement-guards, preservation-gaps, multi-tab, storage-migration, on the fix just before it was committed | 52/52 |
| `logs/09-full-npm-test-4ec5f8e.txt` | **`npm test` on the tested commit, clean tree** | **187 · 3 · build OK · 141 + 2 TODO · EXIT=0** |

`logs/09` is the authoritative result. `logs/08` predates the commit and is
kept to show the targeted green run.

## TODOs, kept visible

Both are in `tests/browser/crash-windows.test.mjs`. They still execute and
still fail, reported as `not ok … # TODO` in `logs/09`:

- **Discard after the first write.** The test expects the adjustment cleared,
  but the stored record still shows `active: true`.
- **Restore after two writes.** The test expects the workspace to read
  `From Backup`, but it still reads `Mesh`.

They model an incomplete write prefix while JavaScript keeps running, not a
real browser restart. Closing them needs the redo journal
(`src/journalPrototype.js`), which is **not activated**. The persistence format
is unchanged. The choice between A (activate), B (keep ordered writes and
accept the window) and C (store the game-day record inside the workspace, v12)
is still yours (`../crash-atomicity.md`).

## Not run

- **Physical checks.** Safari, iPadOS Safari, the installed PWA and real
  suspension or eviction behaviour were not checked on a device. Automation is
  Chromium only. Use `../ipad-checklist.md`.
- **Not done.** No CI workflow was added. No release assets were published.
  Nothing was merged or deployed, and no production, security or billing
  settings were changed.

## Publication safeguard

The only workflow is `ci.yml`, which runs tests. The repository's
`/deployments` list is empty, and earlier pushes to this PR created no
deployment statuses. `hooks`, `environments` and `pages` are not readable from
this session (403).

## Content check

- The logs contain only test names, TAP diagnostics and container-local paths
  (`/home/user/football-os`, a scratch directory).
- The test data is the app's fictional seed content and synthetic labels
  (`AONE`, `B ONLY`, `From Backup`).
- The logs were scanned for tokens, keys, passwords, auth headers and e-mail
  addresses; none were found.
- There are no athlete names or other private data.
