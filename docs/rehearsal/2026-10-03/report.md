# Football OS rehearsal — 2026-10-03

One complete coaching workflow, end to end, on the production build of
`feat/responsibility-areas` (PR #9) at `cc7af9a213533061ae4e66143eeafe9cf446dd18`,
driven through Chromium at an iPad-sized touch viewport (1024×768). Fictional
data only ("Trips Rt 24 Blast", labels W1/W2/QA/QB/T1/T2, the shipped Cover 3
teaching example). Everything below is directly verified against raw output
unless marked otherwise; the step-by-step record is `LOG.md`, the per-step
evidence is `evidence/*.json`, and the scripts that produced it are `scripts/`.

## 0. What PR #9 / `feat/responsibility-areas` changes (read before testing)

- 23 commits, 57 files, +39 178 / −631 against `main` (`8d8ce69`); `origin/main` is an ancestor, merged not rebased. The one CI check on the head (`test`) passed.
- Adds editable defender **responsibility areas** (ellipses with label, colour, size, position) on Zone assignments, with stable ownership keys (`C·1`, `C·2`), move/resize handles, keyboard nudging, undo/redo, layer dim/lock behaviour, and refusal of ambiguous concept transfers (`src/responsibilityArea.js`, `ResponsibilityAreas.jsx`, `ResponsibilityAreaControls.jsx`).
- Adds the editable **Cover 3 teaching example** (More → Add Cover 3 teaching example): BC/S/FC deep thirds, W/M hooks, B/A flats, a keyed legend in Present/PNG/print, and the lesson guide `docs/cover3-lesson-guide.md`.
- Adds a **Diagram** canvas background beside Field, a saved per-play **field side** (None/Left/Right) with a `FIELD →` indicator, and a **phone PNG export** (390-px portrait layout, larger labels, grouped legend) next to the wide PNG.
- Ports the reference playbook catalogs into the shell (Air Raid, LSU 2019, Texas Tech reference books; read-only, "Add to Active" copies), keeping personal books and archiving the superseded sample catalogs.
- Bumps storage to **workspace v11, backup v3, game-day v7** with upgrade validation, v9/v10 fixtures, and read-only recovery that preserves damaged bytes (`workspaceStorage.js`).
- Test coverage grew to 146 unit + 3 Sites + 94 browser tests, including migration, backup/restore, damaged-data recovery, game-day recovery, outputs and narrow-phone checks. None of that work was changed by this rehearsal.

## 1. Verdict

**Yes with caveats.** One coach, one iPad, one tab: the whole workflow held — create/edit/cancel/undo/redo/save/reopen, game-day start/edit/reload/resolve, Cover 3 phone export, backup → fresh profile restore, and all of it again offline — without losing work or mixing data between plays. The two defects it did find (a phantom undo step after a rename, and undo re-applying a discarded game-day change) are fixed here with regression tests. The caveats: **never have the playbook open in two tabs or two windows** (edits in one are silently overwritten by the other; documented, not fixed), the phone PNG carries no title text, and nothing here is a Safari/iPadOS check.

## 2. Baseline vs final test results

| | Command | Unit | Sites | Build | Browser | Fail / skip |
| --- | --- | --- | --- | --- | --- | --- |
| Baseline, `cc7af9a` | `npm test` | 146 / 146 | 3 / 3 | OK (Vite bundle-size advisory, pre-existing) | 94 / 94 | 0 / 0 |
| Final, `4b270ec` (head + 2 fix commits; the later docs commit touches only `docs/`) | `npm test` | 146 / 146 | 3 / 3 | OK (same advisory) | 97 / 97 (94 existing + 3 new) | 0 / 0 |

After the fixes, every rehearsal script was re-run against the rebuilt app (`evidence/*-run.log`, `evidence/*.json`): (a) 17 pass / 0 fail, (b) 15 / 0 — the D2 probe now reports undo disabled and the original untouched after Discard and after Save as Variation, (c) 15 / 1 — the one failure is the cosmetic overlap check in §4, (d) 22 / 1 — the one failure is a toast the script could not read (§4 item 7), (f) 12 / 1 — the one failure is D3, (e) offline 18 / 0 and 5 / 0.

`npm test` = `npm run test:unit && npm run test:sites && npm run build && npm run test:browser`. Logs: `evidence/baseline-npm-test.log`, `evidence/final-npm-test.log`. The three new browser tests were run against the unfixed build first (3 / 3 fail, `evidence/regression-tests-before-fix.log`) and then against the fixed build (3 / 3 pass, `evidence/regression-tests-after-fix.log`). No existing assertion was weakened and no snapshot updated; no dependency changed (`npm ci`, lockfile untouched).

## 3. Defects

| # | What happened | Repro | Fixed? | Regression test | Commit |
| --- | --- | --- | --- | --- | --- |
| D1 | Renaming a player's position label and pressing Enter pushed **two identical undo entries**, so the first Ctrl+Z after a rename visibly did nothing (Tab/blur pushed one). Enter committed, then blurred, and the blur committed again before React re-rendered the label. | Select X → type `W1` in Position label → Enter → Ctrl+Z (label reverts) → Undo is still enabled; a second Ctrl+Z changes nothing. | Yes — Enter now only blurs; onBlur commits once (`src/Inspector.jsx`, 1 line changed + comment). | `tests/browser/editing.test.mjs` › "a rename committed with Enter is exactly one undo step" | `9f4eca3` |
| D2 | After resolving a game-day adjustment with **Discard** (also Save as Variation / Save as New Play) the restored original's undo history still held the adjustment's edits: one Ctrl+Z put the discarded rename **back into the permanent play**, with no Temporary chip; after Save as Variation, Ctrl+Z on the original copied the variation's edit into it. Contradicts the dialog's "The original stays protected until you decide what to keep." | More → Game Day Adjust → Start → rename X→`GD` → More → Resolve adjustment → Discard → Ctrl+Z → `GD` is back and permanent. | Yes — resolving with Discard/Variation/New drops that play's session history, like Delete play (`src/App.jsx`, +9 lines). Replace Original keeps its history, because the play really went through those edits. | `tests/browser/game-day.test.mjs` › "discarding a game-day adjustment leaves nothing for undo to bring back", "saving a game-day adjustment as a variation keeps the variation's edits out of the original's undo" | `4b270ec` |
| D3 | **Same workspace open in two tabs loses work.** Each tab holds its own copy and writes the whole workspace on a 400 ms debounce and on hide/close. Tab 1 renamed X→`T1` (on disk); tab 2, loaded earlier, renamed Z→`T2` and its write dropped `T1`; switching back to tab 1 made tab 2 flush again; reloading tab 1 flushed tab 1's stale copy over tab 2's (`T2` gone); closing tab 2 flushed once more (`T1` gone again). Last tab to hide or close wins, silently. | Open the app in two tabs → rename a player in tab 1 → rename a different player in tab 2 → reload either tab: only one rename survives. (`evidence/f-interruptions.json`, "two tabs" steps.) | **No** — see §4. Any fix changes persistence behaviour and needs a design decision. | — | — |

Not defects (recorded as observations in §4): assignment ids shared between a game-day Variation/New copy and its original; the phone PNG has no title text; three small text overlaps in the Field-background phone PNG; the active play is not remembered across a reopen; `templateOverride:false` is written back on load.

## 4. Unfixed issues and open questions

### Unfixed

1. **D3 — two tabs / two windows overwrite each other.** Options, in rough order of size: (a) listen for the `storage` event and, when another tab wrote a different workspace, mark this tab read-only with a "changed in another tab — reload" banner (reuses the existing `writable=false` recovery state; ~40–80 lines, but it discards this tab's unsaved edits by design, so it is a product call); (b) a single-editor lease via `BroadcastChannel`/localStorage so the second tab opens read-only; (c) merge per play on the `storage` event (largest; needs conflict rules). Until one is chosen: **one tab, one window** on the iPad. Split View with two Football OS windows is the same failure.
2. **Phone PNG has no title.** The lesson name is only in the filename (`cover-3-teaching-example-phone.png`). Adding a title row changes the export layout (design decision).
3. **Field-background phone PNG overlaps (cosmetic).** The B and A tag boxes sit over the "10" yard numbers, and the `FIELD →` box covers part of the mirrored "50". The Diagram export (the lesson guide's stated teaching preference) has no overlaps.
4. **Small labels in the phone PNG.** Legend lines and bubble tags are 12 CSS px (24 px in the 2× image) and defender tokens 15 px — readable without zoom. Offensive-line/defensive-line labels are ~7 px and yard numbers ~6 px; in the Diagram export OL labels are omitted by design and the E/T labels stay small. Preference, not a defect.
5. **Active play is session-local.** After closing and reopening, the app opens on the book's first play; the coach picks the play again. Already noted in the existing lesson test.
6. **Reopen rewrites storage once.** Loading fills `templateOverride:false` into assignments that never had the key and the next autosave writes it back; bytes change, content does not.
7. **The "Backup restored · previous workspace kept as a recovery copy" toast never shows** (cosmetic). Restoring switches the current play, and feedback is cleared whenever the play changes (`useEffect(() => setFeedback(null), [play.id])`), so the confirmation is wiped in the same render. The restore itself is correct; the coach just gets no confirmation line.

### Open questions (football/app behaviour — your call, left as is)

1. **Replace Original keeps undo.** After "Replace Original", Ctrl+Z still walks back the adjustment's edits one by one (the play really made them). Discard/Variation/New now drop history (D2 fix). Should every resolution be a hard commit point like Delete play, and should the dialog say "not part of undo history" as the Delete menu does?
2. **Game-day copies keep the original's assignment ids** (Variation/New), while Duplicate-as-variation remaps them. Nothing breaks today (ids are per-play, like player ids), but if cross-play assignment identity is ever used, this is the inconsistency to resolve.
3. **A stray tap with the Route tool active replaces a receiver's structured route** with a manual line to the tap (by design: "the drawing tool stays selected after a stroke"; undoable). On an iPad this is easy to do with a knuckle; worth a Human check.

## 5. Artifacts, auto-deploy finding, push decision

All paths relative to `docs/rehearsal/2026-10-03/`:

- `report.md` (this file), `LOG.md` (step → result → evidence, kept as the run progressed).
- **Cover 3 phone images:** `cover3-phone-field.png` — **780 × 1136 px** (Field background, all layers, as added); `cover3-phone-diagram.png` — **780 × 818 px** (Diagram background, offense dimmed, the lesson guide's teaching preference). Both are 2× of the 390-px phone layout. The export SVGs that produced them: `evidence/c-cover3-phone-*.svg`; the presented screen they were checked against: `evidence/c-cover3-present.png`.
- **Fictional backup:** `rehearsal-backup.footballos` (sha256 `49562de3a4986e6a08a99e0ebd59852abaec381c68cc13dcff61504b588bf38b`, 5 playbooks · 73 plays · 0 concepts: the seed books plus Trips Rt 24 Blast, its Variation and New copies, and the Cover 3 example). Steps used to verify it restores into a fresh profile: `scripts/d-backup-restore.mjs` (a brand-new browser context = empty profile → playbook menu → Backup and export → Choose backup to restore → "Valid Football OS backup · 5 playbooks · 73 plays" → Restore this backup → stored workspace deep-equals the file's `workspace`, the seed workspace is kept under `football-os.recovery.v1`, the restored play opens on screen, and it all survives a reload). Evidence: `evidence/d-backup-restore.json`, screenshot `evidence/d-fresh-profile-restored.png`.
- Per-step evidence: `evidence/{a-personal-play,b-game-day,c-export-cover3,d-backup-restore,f-interruptions,e-offline-personal-play,e-offline-game-day-start}.json`; test logs as listed in §2; the saved play JSON `evidence/a-personal-play-play.json`.
- Scripts: `scripts/lib.mjs` plus one script per step; run with `APP_URL=<vite preview url> node scripts/<step>.mjs` after `npm run build && npx vite preview`. They are evidence, not part of `npm test`.

**Auto-deploy check.** `.github/workflows/ci.yml` is the only workflow: `push` to `main` and `pull_request`, test-only steps, no deploy, no environment, no secrets. No `vercel.json`, `netlify.toml`, `firebase.json`, `wrangler.toml`, `CNAME` or `.nojekyll`; `.openai/hosting.json` is consumed by a manual Sites handoff (`npm run build`), and PR #9's own description says deployment is separate and conditional on the owner's merge. GitHub API: `has_pages: false`; `/deployments` is `[]` for the whole repository (no deployment has ever been recorded, across `main` and all 23 PR #9 commits); the PR head has 0 commit statuses. The `environments`, `pages` and `hooks` endpoints returned HTTP 403 through this session's proxy, so they could not be read directly. The head's check-suites list inert stubs for installed GitHub Apps (`claude`, `supabase`, `vercel`, `posthog`, `openship-io`: no check runs, no conclusion), which GitHub creates for any app with `checks:write`; a Vercel-linked project would also have created GitHub Deployments and statuses on every push, and there are none anywhere in the repository's history.

**Decision:** the evidence above establishes that pushing this branch and opening a draft PR deploys nothing (CI runs tests only; no hosting integration has ever produced a deployment or status for this repository), so the branch was **pushed** as `rehearsal/2026-10-03` and a **draft PR** opened against `feat/responsibility-areas` (so its diff is only the rehearsal's commits, not PR #9's). Not merged. The residual uncertainty is that the `hooks`/`environments` endpoints were unreadable (403) from this session; if a webhook-based deploy exists that has never fired, it would not show in the evidence consulted. No `format-patch` output was written, since the push went ahead.

## 6. Human checks (physical iPad / Safari / on-field)

1. **Offline on the actual device.** In Safari on the iPad, open the app on Wi-Fi until the header says "Offline ready", then switch to Airplane Mode and relaunch from the Home Screen icon (add it first). The board must come up and say "Offline · ready". iPadOS evicts site storage for sites not used for a while and Safari's service-worker behaviour differs from Chromium; this rehearsal only proves Chromium.
2. **Storage survives a real day.** Make one edit, force-quit Safari, reboot the iPad, reopen: the edit must still be there, and a `.footballos` backup must download to Files and re-import from Files (the file picker, download sheet and `.footballos` association were not exercised on iPadOS here). Keep a backup before practice regardless.
3. **Finger, not mouse.** With the Route tool active, rest a knuckle on the field: it should not replace a receiver's route (see §4 Q3); if it does, Ctrl/⌘-Z or the rail's Undo must bring it back. Also check that the phone PNG opens readable on the phone it is meant for without pinching, and that only one Football OS window is open (no Split View / second tab, see D3).
