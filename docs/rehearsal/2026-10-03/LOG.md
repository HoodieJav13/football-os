# Rehearsal log — 2026-10-03

Progress log for the "prove one complete coaching workflow" run. Format: step → result → evidence.
If this session is interrupted, resume from the last entry.

## Setup

- **Worktree** → done → `git worktree add -b rehearsal/2026-10-03 /home/user/football-os-rehearsal cc7af9a213533061ae4e66143eeafe9cf446dd18`; `git rev-parse HEAD` = `cc7af9a213533061ae4e66143eeafe9cf446dd18`; `git status` clean. `origin/main` (`8d8ce69`) is an ancestor of HEAD (`git merge-base --is-ancestor` passed).
- **Protocol** → done → `.agentic/validate-contract-version.sh .` passed (contract v1.2, installation sha256 `f7d961fd…`). Read `protocol.md`, `EXECUTOR.md`, `PROJECT_POLICY.md`; no `PROTOCOL_OVERRIDE.md`. DIAL: AUDIT + FIX, authorised by the task text ("write a failing regression test first, then make the smallest fix … One commit per fix").
- **PR #9 inspected** → done → `pull_request_read` + `git diff --stat origin/main..HEAD` (57 files, +39178/−631, 23 commits). Only check run on the head is GitHub Actions `test` = success. Summary written to report.md §0.
- **Install** → done → `npm ci` from the existing lockfile, exit 0, `git status` still clean (no lockfile change).
- **Baseline tests** → running → `npm test` (unit → sites → build → browser) logged to scratchpad `baseline-test.log`. Result recorded below when complete.

## Auto-deploy check (before any push)

- `.github/workflows/`: only `ci.yml`. Triggers `push: branches [main]` and `pull_request`. Steps: npm ci, unit, sites, build, artifact existence check, Chromium install, browser tests, upload failure screenshots. **No deploy step, no secrets, no environment.**
- Hosting config files: none of `vercel.json`, `netlify.toml`, `firebase.json`, `wrangler.toml`, `CNAME`, `.nojekyll` exist. `.openai/hosting.json` is a Sites project id consumed by a manual handoff (`npm run build` → dist), not a git-triggered deploy; PR #9's description says deployment is "separate and conditional on that merge".
- GitHub API (`gh api`): `repos/…` → `has_pages: false`. `repos/…/deployments` → `[]` (no deployment has ever been recorded for this repo, across main and all 23 PR #9 commits). `commits/cc7af9a/status` → 0 statuses. `environments`, `pages`, `hooks` → HTTP 403 (not readable through this session's proxy).
- `commits/cc7af9a/check-suites` lists check-suite stubs for installed GitHub Apps: `claude`, `supabase`, `vercel`, `posthog`, `openship-io` (all conclusion `null`, no check runs) and `github-actions` (success). A Vercel app is therefore installed on the account/repo, but a Vercel-linked project creates a GitHub Deployment and a commit status for every push, and this repo has zero of either in its entire history. The stubs are what GitHub creates for any installed app with `checks:write`, whether or not it acts.
- Decision: see "Push / patch decision" at the end of the log once fixes are known.

## Rehearsal

(entries appended as steps run)

- **Baseline tests** → done, all green → `npm test` at `cc7af9a` (unit 146/146, Sites 3/3, build OK with Vite's existing bundle-size advisory, browser 94/94; 0 fail, 0 skipped, 0 todo). Full output: `evidence/baseline-npm-test.log`. No pre-existing failures to record.
- **Rehearsal harness** → scripts in `scripts/` (not part of the test suite) drive the built app served by `vite preview` through Playwright at an iPad-sized touch viewport (1024×768, `hasTouch`). Each script writes `evidence/<name>.json` (step → result → evidence) and saves its browser storage so the next step continues the same workspace.

### Runs against the unfixed head (cc7af9a build)

- **(a) personal play** → pass after two script corrections → `evidence/a-personal-play.json`. Create "Trips Rt 24 Blast" → route + stem 16 + rename X→W1 + nudge → Play details Cancel and Escape change nothing → 8× undo returns exactly to the post-create state, undo then disabled, no errors → 8× redo returns to the edited state → new edit after undo clears redo → Save details (folder/family/personnel/scheme/field side) → close tab, reopen, pick the play: screen state identical, saved play identical. Script corrections: (1) the Route tool stays active after giving X a route (by design), so my "deselect" click on the field drew a route; (2) reopening writes `templateOverride:false` (a normalizer default) back into assignments that never had the key — not an edit, recorded as a note.
  - Observation: the active play is not persisted; after reopen the app shows the first play of the book (documented as session-local in the existing lesson test).
  - **Defect D1** (probe `scratchpad/probe-rename.mjs`, deterministic): committing a Position label with Enter pushes two identical undo entries; the first Ctrl+Z after a rename visibly does nothing. Commit via Tab/blur pushes one. Cause: Enter handler commits, then blurs, and the blur commits again before React re-rendered the label prop.
- **(b) game day** → pass except one finding → `evidence/b-game-day.json`. Start → Temporary chip + snapshot stored → edits land on the play, snapshot untouched → reload mid-adjustment keeps chip, edits and snapshot → from another play, "Game Day Adjust" jumps back to the adjusted play → Save as Variation: original restored exactly, variation holds the edits with `variantOf` → Discard, Replace Original, Save as New Play all behave as labelled → reload: all plays present, nothing pending.
  - **Defect D2**: after Discard (and after Save as Variation / Save as New Play) the original's undo history still holds the adjustment's edits: one Ctrl+Z put the discarded rename back into the permanent play with no Temporary chip (`discard: Undo right after Discard … equalsOriginal:false`). Contradicts the dialog's "The original stays protected until you decide what to keep".
  - Observation: game-day Variation/New copies keep the original's assignment ids (Duplicate-as-variation remaps them). Ids are per-play like player ids, so nothing breaks; noted for consistency only.
- **(c) Cover 3 phone export** → pass except cosmetic overlaps → `evidence/c-export-cover3.json`, images `cover3-phone-field.png` (780×1136) and `cover3-phone-diagram.png` (780×818), export SVGs in `evidence/`. Every legend line, defender tag, offensive label, all 7 areas and the FIELD → indicator from the presented screen are in the image; nothing clipped; no editor handles/animation. Field version: three small text-box overlaps (yard number "10" under the B and A tags; the FIELD → box covers part of the mirrored "50"); Diagram version has none. The image carries no title text; the title is only in the filename (`cover-3-teaching-example-phone.png`). Double-tap export produces exactly one file. Export does not change the saved play.
- **(d) backup/restore** → pass except two over-strict checks → `evidence/d-backup-restore.json`, `rehearsal-backup.footballos` (sha256 in `evidence/d-backup-sha256.txt`). Backup equals the live workspace; fresh profile restores to an identical workspace, keeps the seed as recovery copy, survives reload; restore over existing data replaces it and keeps the replaced copy; same file twice is idempotent; double-tap restore and reload-right-after-restore are clean; a damaged file is refused without touching storage. Over-strict checks: two back-to-back backups differ only in `exportedAt`; the toast had faded before it was read.
- **(f) interruptions** → `evidence/f-interruptions.json`. Reload 0 ms after a rename, close-tab 0 ms after a rename, reload 0 ms after Save details: all on disk (pagehide flush). Reload mid-drag persists the pointer position (legal, clean). Double submit of Save details / Create play: one save, one play. Quick switching between two plays with fresh edits: each play keeps only its own edits; an uncommitted label commits to the play it was typed on; undo on B never touches A.
  - **Defect D3** (unfixed, documented): the same workspace open in two tabs — each tab writes its whole in-memory workspace on hide/close, so the last tab to hide or close silently overwrites the other tab's edits (tab1's X→T1 lost after tab2's Z→T2; then tab2's edit lost after tab1 reloaded; then tab1's lost again when tab2 closed).
  - Script correction: a nudge legitimately carries the route start, so "nothing else changed" must exclude assignments.
- **(e) offline** → pass → `evidence/e-offline-personal-play.json`, `evidence/e-offline-game-day-start.json`. Fresh profile reaches "Offline ready", network cut, reload serves the board from the worker ("Offline · ready"); all of (a) and the start of (b) pass offline.
- **Regression tests written first** → `tests/browser/game-day.test.mjs` (2 tests, D2) and a new test in `tests/browser/editing.test.mjs` (D1). Against the unfixed build: 3/3 fail (`evidence/regression-tests-before-fix.log`).

## Fixes

- **D1 fix** → `9f4eca3` "Commit a label rename once when Enter is pressed" (`src/Inspector.jsx`: Enter now only blurs; onBlur commits once) + test in `tests/browser/editing.test.mjs`.
- **D2 fix** → `4b270ec` "Drop a play's undo history when a game-day adjustment restores it" (`src/App.jsx` resolveGameDay: Discard/Variation/New drop that play's session history; Replace keeps it) + `tests/browser/game-day.test.mjs`. Judgement call: only the snapshot-restoring resolutions drop history, because after Replace the play really made those edits; the alternative (every resolution is a hard commit point) is logged as open question 1 in the report.
- **D3** (two tabs) → not fixed: every option changes persistence behaviour or discards a tab's edits by design; documented with repro and options in the report.
- Regression tests: red on the unfixed build (3/3, `evidence/regression-tests-before-fix.log`), green on the fixed build (3/3, `evidence/regression-tests-after-fix.log`).
- **Final full suite at 4b270ec** → `npm test`: unit 146/146, Sites 3/3, build OK, browser 97/97 (94 + 3 new); 0 fail, 0 skipped → `evidence/final-npm-test.log`.

## Final rehearsal re-run on the fixed build

- (a) 17 pass / 0 fail · (b) 15 / 0 (undo after Discard and after Save as Variation now leaves the original untouched) · (c) 15 / 1 (cosmetic overlaps only) · (d) 22 / 1 (restore toast unreadable: it is cleared by the play switch the restore causes — report §4.7) · (f) 12 / 1 (D3) · (e) 18 / 0 and 5 / 0. Logs `evidence/*-run.log`, steps `evidence/*.json`.
- Final artifacts regenerated: `cover3-phone-field.png` 780×1136, `cover3-phone-diagram.png` 780×818, `rehearsal-backup.footballos` sha256 `49562de3a4986e6a08a99e0ebd59852abaec381c68cc13dcff61504b588bf38b` (5 playbooks · 73 plays · 0 concepts).
- Housekeeping: bulky intermediate files (Playwright storage states, raw before/after dumps, duplicate screenshots) removed from `evidence/`; the scripts regenerate them.

## Push / patch decision

- Evidence (see "Auto-deploy check" above and report §5) establishes that a branch push and a draft PR trigger CI only. Decision: push `rehearsal/2026-10-03`, open a draft PR against `feat/responsibility-areas`, do not merge, no patches written. Residual: `hooks`/`environments` unreadable (403) from this session.
