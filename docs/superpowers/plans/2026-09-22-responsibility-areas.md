> Local implementation complete. Verified code HEAD `461a2086f560212b4bac84bd7f51a54b0d013584`; [completion evidence and limits](../../reports/2026-09-22-responsibility-areas.md). Original planning evidence below remains historical.

# Football OS reconciliation and responsibility areas — Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task. Codex owns implementation; independent reviewers work at the migration and completed-change checkpoints. Steps use checkboxes. No parallel implementers or repeated planning review.

**Goal:** Preserve both Football OS development lines, then author, revise, save, present, and export one editable generic Cover 3 lesson from structured responsibility areas.

**Architecture:** Selectively port the reference-catalog/v10 behavior onto the integration branch's extracted shell and existing browser harness. Add optional ellipse data to Zone assignments, with one region geometry module and one canvas rendering path shared by editor and clean outputs. Keep legacy storage recoverable and refuse ambiguous concept transfers.

**Tech stack:** Existing React 19.2, Vite 6.4, JavaScript/JSX, SVG, browser localStorage, Node test runner and integration's Playwright harness. No added dependency or second browser framework.

**Spec:** [Responsibility-area design](/Users/jav/Documents/Codex/Portfolio/RESPONSIBILITY-AREA-DESIGN.md). [Lesson brief](/Users/jav/Documents/Codex/Portfolio/COVER-3-LESSON-BRIEF.md) supplies teaching and rehearsal requirements. This file is the single current working brief; older design approval status is superseded by the decision below, not its substantive requirements.

## Current decision and authority

On September 22, 2026, the owner answered **yes** to: “Do you accept the ellipse design and copying a region as independent geometry, retaining its field coordinates, with a notice to adjust it?” The combined planning pass is authorized and complete. **Tasks 0–5 approved by the owner on September 22, 2026: “ok up to task 5 is approved”.**

Example-label update: the owner requested M and W instead of two M hook defenders. Use W for left hook and M for right hook; label the left-flat defender OLB so W is not duplicated elsewhere. Paired C corners retain the natural duplicate-label test.

The proposed single implementation approval covers Tasks 0–5: isolated checkout, selective reconciliation, preservation fixtures, the region feature, necessary documentation, tests, and two independent reviews. It does not merge to main, deploy, publish a PR, push, clean up unrelated worktrees, or resume film research. Feature-branch commits may use existing O11 once O10a is verified effective; execution does not need another vote on those already-recorded permissions.

Use the fuller [Portfolio owner response](/Users/jav/Documents/Codex/Portfolio/reference/owner-decisions-response-2026-09-20.md) as the canonical approval reference, together with the [row definitions](/Users/jav/Documents/Codex/Portfolio/reference/owner-decision-sheet-2026-09-19.md). The dated chat copy has identical approvals and only lacks the execution-preference addendum. This index records the owner's authority; direct owner instructions remain authoritative.

Implementation estimate, not a promise: **4–8 hours of active agent work**, primarily reconciliation, persistence, and interactive/output verification. Reassess after Task 1; if its port needs more than two hours of active work or uncovers unrecoverable data/semantic conflicts, report the concrete scope growth before extending it. Likewise report before exceeding the overall estimate. Waiting for tools and owner review is separate. Stop at the bounded result rather than expanding into a coverage catalog.

## Global constraints

- “A drop path and a responsibility area are different data.”
- “One assignment owns its region in this slice.”
- “Overlapping regions are permitted; they are not automatically errors or evidence of shared responsibility.”
- “Do not silently repair corrupted geometry into a different football diagram.”
- “Selection handles and editing affordances must not appear in the clean output.”
- Store field yards; retain stable player/assignment IDs. No pixels, fixed bubble count, automatic backfill, or inferred boundaries from zone names.
- Moving a player or mirroring its path leaves its region field anchored. An explicit copy duplicates the geometry independently, also field anchored.
- Keep the integration shell, camera/pinch handling, presentation framing, route vocabulary, browser harness, and Sites packaging. One filmstrip, one inspector and one timeline.
- Owner P1 retains the fixed window at **8 yards behind / 38 downfield**. Do not port the source branch's unrelated 10-yard window change.
- Personal/custom content survives. Keep integration's **air-raid-sample** import separately from the **air-raid-reference** verified catalog. No upgrade of imported content's evidence status.
- End Zone default; preserve phone viewing and quick adjustments. Touch targets at least **44 × 44 CSS px**, desktop at least **40 × 40 CSS px**. Verify iPad and both phone orientations for changed layouts.
- Follow existing reduced-motion and undo/session boundaries. No route timing/reactive simulation changes.
- The generic example is editable teaching content, not a Green doctrine release or proof of mastery.
- Team Hub, Teach Tape/quiz sequencing, KB releases, Hudl sync, varsity match concepts, and film remain outside this slice.

## Review focus

1. **Two storage lineages:** a real v9 import and a v10 custom play must survive the same upgrade. Task 1 preservation fixtures and Task 2 round trips pin this.
2. **Corrupt current storage:** startup must not overwrite it with defaults; Task 2 startup guard and browser test pin this.
3. **Duplicate labels / missing concept owners:** no first-match assignment collision or partial apply; Task 3 tests pin atomic rejection.
4. **Fitted geometry / export state:** a far-edge ellipse, overlapping labels, hidden layer, zoom and live playback cannot produce a misleading clean lesson; Tasks 4–5 pin this.
5. **Interrupted edits / storage failures:** pointer cancellation, switching plays, quota failure and failed recovery-copy writes cannot report saved success or leak undo across plays; Tasks 2 and 4 pin this.

## Baseline and execution map

Observed unchanged local refs:

| Role | Ref / SHA |
| --- | --- |
| Current inspection checkout | codex/resolve-design-findings — d18501bb0b75bab2ed210f6b5f3b7fffa20e06f9 |
| Foundation for new isolated work | integration/2026-09-14 — 01a0c4c351cb4eb73dcf228cbcf6412ef4e615ea |
| Local main | 0264e22f1741ad5d3f3af5988288061018e29220 |
| Product port sources | 5c57a9d and 97cb208, preserved on the source branch |

Integration contains local main plus eight commits; its workspace is v9. Source is v10 and diverges from main by three source-only/eight main-only commits. All inspected local gate branches are v9; backup format is v2 throughout. Therefore this plan reserves **workspace v11 / backup format v3**, with **game-day key v7** for snapshots carrying region data. Recheck these reservations only if refs change.

Claude's dry-run conflict counts (four App blocks, two playData blocks, three test blocks) are **reported evidence**, not a repeated simulation or a merge prescription. Direct diff inspection confirmed the semantic port destinations below.

| File on integration foundation | Responsibility / port decision |
| --- | --- |
| src/playData.js | Reference definitions, provenance, route alternatives, empty opponent roster support; later Zone normalization and safe concept application |
| src/workspaceData.js | Additive v10 behavior, then v11 validation/migration and backup v3 |
| src/Header.jsx | Reference title, badge and copy-to-active action |
| src/Inspector.jsx | Reference read-only details, conditional route preview; later region controls |
| src/ToolRail.jsx | Reference mutation guards; deliberate example action |
| src/Filmstrip.jsx | Fold source PlayBrowser filter/reference-name behavior into existing filmstrip; later shared miniature region rendering |
| src/playFilters.js (new on integration) | Port existing pure filters and tests from source |
| src/App.jsx / src/appHelpers.js | State/command guards, persistence and region editing wiring; preserve extracted shell |
| src/PlayDialogs.jsx | Retain existing dialogs, port relevant source metadata/defaults without copying obsolete embedded components |
| src/PlayCanvas.jsx / src/fieldView.js | Shared region render, projection, fitting, handles and clean-render behavior |
| src/exportUtils.js / src/WorkspaceDialogs.jsx | PNG from a clean canvas, fitted print preview in either orientation |
| src/responsibilityArea.js (new) | Region validation, cloning, bounds and projection; no React or storage dependency |
| src/ResponsibilityAreas.jsx (new) | Fills/labels and selected editing handles using the pure geometry module |
| src/ResponsibilityAreaControls.jsx (new) | Existing-inspector controls; no separate drawing app |
| src/LessonExport.jsx (new) | Measured off-screen clean canvas for PNG with fixed output framing |
| src/cover3Lesson.js (new) | Optional synthetic editable example factory |
| src/styles.css | Port only needed reference/filter styles, then region/export controls |
| tests/fixtures/*, tests/*.test.mjs, tests/browser/*.test.mjs | Preservation fixtures, pure tests, integration browser scenarios |
| AGENTS.md, README.md, docs/* | Reconcile durable decisions, describe verified capability and record delivery evidence |

Do not introduce src/PlayBrowser.jsx, src/PlaybackTimeline.jsx, the source playwright.config.mjs or a second @playwright/test dependency. Port behavior into the existing equivalents. Keep routeVocabulary.js and its tests. Existing audit docs/protocol are already on integration.

## Task 0 — Establish the isolated execution baseline and authority

**Files:** no product edits. A temporary protection payload and the isolated checkout are execution artifacts.

**Interfaces:** consumes the three exact refs above; produces a new feature checkout based on integration, with source refs preserved and the same validated protocol. Name/path chosen through the worktree skill at execution time, not by deleting/reusing an occupied worktree.

- [x] Recheck refs, clean state and protocol; read the destination's AGENTS.md and installed protocol before edits. Use superpowers:using-git-worktrees for isolation. Keep all existing branches/worktrees.
- [x] Complete already-approved O10a. Read-only GitHub checks in this planning pass found public repository HoodieJav13/football-os, admin capability, main unprotected (classic API 404), no effective rulesets, and an existing successful GitHub Actions check named **test**, app ID **15368**. Recheck immediately before changing settings.
- [x] If still absent, configure only the approved PR/check/force-push/deletion protections. Use a temporary JSON body, never interpolate secrets:

~~~json
{
  "required_status_checks": {
    "strict": true,
    "checks": [{"context": "test", "app_id": 15368}]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 0
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
~~~

~~~sh
gh api --method PUT repos/HoodieJav13/football-os/branches/main/protection --input /private/tmp/football-os-main-protection.json
gh api repos/HoodieJav13/football-os/branches/main/protection
gh api repos/HoodieJav13/football-os/rules/branches/main
~~~

Zero required human approvals retains PR requirement without inventing an unavailable second-human requirement. Preserve stronger existing settings if state has changed; do not weaken them to match this payload. No paid upgrade or visibility change. If protection cannot be verified, O11 remains unavailable; explicitly approved local implementation may still proceed, with commits/pushes held under default policy.

- [x] Run the foundation's existing unit suite, Sites tests, build and browser suite once. Record failures as baseline-relevant or unrelated; do not blindly fix unrelated failures.
- [x] Snapshot synthetic baseline data from both refs into test fixtures before porting. Use temp copies of each ref's playData.js (and integration routeVocabulary.js) to evaluate createDefaultWorkspace(); no user's browser storage is involved.

**Exit:** known baseline, preserved source refs, recorded protection outcome and tests. No merge to main.

## Task 1 — Reconcile reference behavior into the current shell

**Files:** port destinations in the map; new tests/fixtures/workspace-v9.json, workspace-v10.json, tests/reference-port.test.mjs, tests/browser/reference-library.test.mjs. Extend existing data/filter tests. Keep integration's package/lock and add test paths only.

**Interfaces:** existing createDefaultWorkspace(), normalizeWorkspace(value), createSeedPlaybooks(personalPlays), filterPlays(plays, filters), createEmptyPlayFilters(); outputs the reconciled v10 behavior and current shell. Task 2 then upgrades to v11 before delivery.

- [x] Capture untouched synthetic v9/v10 workspaces, then add a saved custom edit to each fixture: rename a personal play, move a player and preserve assignments, formation/concept libraries, importedFrom and variantOf. Fixture tests compare those exact values, not just counts.
- [x] Write a failing preservation test using the fixtures:

~~~js
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { normalizeWorkspace } from "../src/workspaceData.js";

const fixture = (name) =>
  JSON.parse(readFileSync(new URL("./fixtures/" + name, import.meta.url), "utf8"));

test("both lineages preserve saved personal plays", () => {
  for (const name of ["workspace-v9.json", "workspace-v10.json"]) {
    const source = fixture(name);
    const output = normalizeWorkspace(source);
    const before = source.playbooks.find(b => b.id === source.mainPlaybookId);
    const after = output.playbooks.find(b => b.id === before.id);
    for (const play of before.plays) {
      const saved = after.plays.find(p => p.id === play.id);
      assert.deepEqual(saved.players, play.players);
      assert.deepEqual(saved.assignments.map(a => a.points), play.assignments.map(a => a.points));
      assert.equal(saved.name, play.name);
    }
    assert.deepEqual(after.formations, before.formations);
    assert.deepEqual(after.concepts, before.concepts);
  }
});
test("verified catalogs coexist with the independent source import", () => {
  const output = normalizeWorkspace(fixture("workspace-v9.json"));
  for (const [id, count] of [
    ["air-raid-reference", 4], ["lsu-2019-reference", 7], ["texas-tech-reference", 4]
  ]) {
    const book = output.playbooks.find(b => b.id === id);
    assert.equal(book?.readOnly, true);
    assert.equal(book.plays.length, count);
  }
  const imported = output.playbooks.find(b => b.id === "air-raid-sample");
  assert.equal(imported.plays.length, 48);
  assert.notEqual(imported.readOnly, true);
});
~~~

- [x] Run node --test tests/reference-port.test.mjs, observe the missing-catalog/behavior assertions fail, then port semantic changes. Do not use “take ours/theirs” wholesale.
- [x] In playData.js keep integration's Air Raid source import helpers under distinct names (airRaidSourcePlays / airRaidSourcePlay), and add source's verified catalog helpers with distinct names. Preserve **air-raid-sample**, its 48 plays, source labels and conditions. Add the three verified catalog IDs with counts **4 / 7 / 4**. Retain route-vocabulary support and source evidence. New-install personal defaults may use the corrected source definitions; never reseed a saved personal play.
- [x] Port source route-alternative normalization and geometry, metadata preservation, and the intentional empty-defense behavior. Preserve custom evidence and all independently saved geometry.
- [x] Port workspace catalog refresh only for known governed IDs; archive the two superseded Texas Tech/LSU sample IDs without erasing their content. Keep air-raid-sample visible as its existing source import and do not mark it verified. Preserve custom books/active selection where valid.
- [x] Fold reference UI and structured filters into Header, Inspector, ToolRail and Filmstrip. Guard mutation handlers as well as controls; verify keyboard shortcuts, drag, undo, game-day and dialogs cannot edit a read-only book. Copy-to-active produces an independent editable play with source call and provenance. Keep Timeline and camera behavior from integration.
- [x] Carry over source test assertions into integration's Node/browser harness. Adjust tests that assume “second book is editable” to copy a reference first or choose Personal Active explicitly. Update hard-coded workspace keys deliberately, retaining separate legacy fixtures.
- [x] Run unit/filter/reference tests, Sites/build, then reference-library and existing core-path/browser checks. Assert one filmstrip/inspector/timeline; no newly imported duplicate shell components.

Additional required assertions: verified catalog counts/evidence, no opponents added to offense-only references, call-specific source formations, independent copy edit/reload, source import IDs survive, archived samples recoverable, active folders/filters affect print and browsing.

**Exit:** passing reconciled baseline. Reassess effort here. Checkpoint commit only under effective O11. Do not review or ship the region feature on an unreconciled baseline.

## Task 2 — Add the region data contract and loss-safe persistence

**Files:** new src/responsibilityArea.js, tests/responsibility-area.test.mjs, tests/browser/storage-migration.test.mjs; modify playData.js, workspaceData.js, appHelpers.js, App.jsx and workspace tests.

**Interfaces:** responsibilityAreaError(value) returns null or a reason; copyResponsibilityArea(value) returns an independent validated area or throws. Region property is **assignment.definition.responsibilityArea**; absence only means no authored region. No standalone owner ID to drift from assignment.playerId.

Stored version-1 region:

~~~js
{
  version: 1, shape: "ellipse",
  center: [0, 22], radiusX: 8, radiusY: 10,
  label: "Deep middle", color: "blue"
}
~~~

- [x] Add the following validator contract, test it failing before implementation, then use it from both normalization and import validation. Fixed palette keys: blue, teal, amber, violet, rose; rendering consumes this trusted mapping, never arbitrary imported CSS.

~~~js
export const REGION_COLORS = {
  blue: "#7CB7FF", teal: "#67D9C0", amber: "#F1C86A",
  violet: "#BEA0F5", rose: "#F49DAF",
};
export function responsibilityAreaError(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "must be an object";
  if (value.version !== 1 || value.shape !== "ellipse") return "unsupported shape version";
  if (!Array.isArray(value.center) || value.center.length !== 2 ||
      !value.center.every(Number.isFinite)) return "center must contain two finite yards";
  if (![value.radiusX, value.radiusY].every(n => Number.isFinite(n) && n > 0))
    return "radii must be positive finite yards";
  if (!Number.isFinite(value.center[0] - value.radiusX) ||
      !Number.isFinite(value.center[0] + value.radiusX) ||
      !Number.isFinite(value.center[1] - value.radiusY) ||
      !Number.isFinite(value.center[1] + value.radiusY)) return "extent exceeds numeric range";
  if (typeof value.label !== "string" || !value.label.trim() ||
      value.label.length > 48 || /[\u0000-\u001f\u007f]/.test(value.label))
    return "label must contain 1–48 printable characters";
  if (!Object.hasOwn(REGION_COLORS, value.color)) return "unknown color";
  return null;
}
export function copyResponsibilityArea(value) {
  const error = responsibilityAreaError(value);
  if (error) throw new Error("Responsibility area: " + error);
  return { version: 1, shape: "ellipse", center: [...value.center],
    radiusX: value.radiusX, radiusY: value.radiusY,
    label: value.label, color: value.color };
}
~~~

- [x] Validate explicit null, zero/negative radius, strings masquerading as numbers, nonfinite values, future version, unknown color and oversized/control-character labels. Preserve legal off-viewport coordinates without clipping/rounding on load.
- [x] Extend sanitizeDefensiveDefinition only for Zone and only when the property is present; never generate a default in normalization. On valid authored values use copyResponsibilityArea. Remove the property when the coach explicitly changes assignment type away from Zone (undo restores it); reject imported regions on non-Zone/non-defense assignments.
- [x] Validate all region-bearing assignments in plays **and concepts before normalizePlay can filter away invalid owners**. Require a unique assignment ID and exactly one matching defender ID for each region-bearing assignment; duplicate visible labels remain legal. Include book/play/concept/assignment location in errors.
- [x] Use workspace v11, legacy keys [v10, v9, v8, v7, v6, v5], backup format v3 with supported legacy formats 1/2. A region in a legacy-format/legacy-workspace envelope is inconsistent and must be rejected, not normalized away. Export v3 even when no region is present; old clients reject the new envelope.
- [x] Version game-day snapshots with key football-os.game-day.v7 and read old v6/v5/v4 keys without removing them. Validate region-bearing snapshots before use, so an older client cannot silently rewrite new snapshots under the shared v6 key. A corrupt snapshot must disable its write/delete effect and show a persistent recovery error; returning null must not cause the existing effect to remove the corrupt key.
- [x] Protect startup and restore from destructive fallback. Add loadWorkspaceState(storage) in a small new src/workspaceStorage.js, returning {workspace, error, sourceKey, writable}. Check newest existing key first. Missing all keys returns defaults/writable; corrupt or unsupported existing data returns a visible error with writable=false and preserves raw storage. The app may display defaults for recovery navigation but must disable editing/autosave until a valid backup is explicitly restored. Do not silently fall through to an older key.
- [x] Keep debounce and page-hide flush. Catch storage failures and show a persistent “Changes could not be saved” error; never imply success. A failed recovery-copy write must abort restore before changing workspace. Do not auto-delete old keys or recovery snapshots.

Representative round-trip/negative assertions, appended to workspace tests:

~~~js
test("a malformed area cannot become a restorable candidate", () => {
  const workspace = createDefaultWorkspace();
  const play = workspace.playbooks[0].plays[0];
  const owner = play.defenders[0];
  play.assignments.push({
    id: "region-test", playerId: owner.id, unit: "defense", phase: "post",
    type: "Zone", points: [[owner.x, owner.y], [0, 20]], pace: 1, delay: 0,
    definition: { area: "hook", landmark: "", responsibilityArea: {
      version: 1, shape: "ellipse", center: [0, 22], radiusX: 8, radiusY: 10,
      label: "Deep middle", color: "blue"
    }}
  });
  const envelope = createWorkspaceBackup(workspace);
  const restored = parseWorkspaceBackup(JSON.stringify(envelope)).workspace;
  assert.deepEqual(restored.playbooks[0].plays[0].assignments.at(-1).definition,
    play.assignments.at(-1).definition);
  envelope.workspace.playbooks[0].plays[0].assignments.at(-1)
    .definition.responsibilityArea.radiusX = 0;
  assert.throws(() => parseWorkspaceBackup(JSON.stringify(envelope)), /[Rr]esponsibility area/);
});
~~~

Also test concepts, all legacy versions, normalization idempotence, empty-defense reference plays, invalid current localStorage left byte-for-byte unchanged after reload/wait, no writes on failed restore, and recovery of a valid replacement. Test workspaceStorage.js with a throwing synthetic storage adapter; browser test verifies visible failure and save suppression.

**Run:** node --test tests/responsibility-area.test.mjs tests/workspace-data.test.mjs tests/reference-port.test.mjs; then the migration browser file against a fresh build.

**Checkpoint A:** independent review of reconciliation and migration before authoring UI depends on it. Reviewer receives spec, exact diff, both baseline fixtures and raw test outputs; checks preservation independently. Codex resolves actionable in-scope findings, reruns affected checks, and records closure. This is an execution checkpoint, not an automatic additional owner approval.

## Task 3 — Make assignment operations preserve ownership and geometry

**Files:** playData.js, App.jsx; new tests/responsibility-operations.test.mjs. Factor pure copy/mirror helpers into playData.js so tests exercise the same path as App.

**Interfaces:** copyAssignmentForPlayer(play, assignmentId, targetPlayerId, newAssignmentId) returns a new assignment or throws; mirrorAssignmentPath(play, assignmentId) returns a mirrored assignment; existing applyConceptTemplateToPlay(play, concept) remains return-a-play and throws before mutation for unsafe region mappings.

- [x] Copy: require an existing same-unit target with an empty stage slot. Clone the entire assignment, replace assignment/player IDs, translate only path points by the existing offset/clamping behavior. Keep region center/radii unchanged and independent. App selects the copy and announces **“Assignment and responsibility area copied. Adjust the area for [label].”** For non-region assignments retain the existing notice.
- [x] Mirror: transform points about the player's x position using the existing formula; preserve responsibilityArea byte-for-byte. Keep the label “Mirror path.” Player move and applyFormation preserve defensive region geometry.
- [x] Concept preflight: for every region-bearing source assignment, resolve its source player by stable item.playerId. Require exactly one source and target match for its stored positionLabel/unit, and unique target slots; reject missing or duplicate-label mappings atomically. No silent first-match, deduplication, or partial application. Keep region field coordinates, existing path translation and override semantics. Generate incoming IDs with target unit/player ID and phase, not label alone.
- [x] In App, compute the candidate concept result before updatePlay/pushHistory, catch errors and keep the dialog/current play intact. Notice names the ambiguous label and tells the coach to use unique labels before applying. No new mapping dialog.
- [x] Duplicate play / variation / reference-to-active copy retain independent geometry. Relabeling a defender changes displayed ownership only. Removing a defender removes its assignment/region together; undo restores all three.

Core regression pattern:

~~~js
import assert from "node:assert/strict";
import test from "node:test";
import { copyAssignmentForPlayer } from "../src/playData.js";

test("copy retains field coordinates but never shares a center array", () => {
  const sourceId = "source-zone";
  const targetId = "right-c";
  const play = {
    id: "copy-test", players: [],
    defenders: [
      { id: "left-c", label: "C", x: -19, y: 8 },
      { id: targetId, label: "C", x: 19, y: 8 }
    ],
    assignments: [{
      id: sourceId, playerId: "left-c", unit: "defense", phase: "post",
      type: "Zone", points: [[-19, 8], [-18, 26]], pace: 1, delay: 0,
      definition: { area: "deep-third", landmark: "",
        responsibilityArea: { version: 1, shape: "ellipse", center: [-18, 26],
          radiusX: 8, radiusY: 11, label: "Deep left", color: "blue" } }
    }]
  };
  const copied = copyAssignmentForPlayer(play, sourceId, targetId, "copy-zone");
  assert.equal(copied.playerId, targetId);
  assert.deepEqual(copied.definition.responsibilityArea,
    play.assignments.find(a => a.id === sourceId).definition.responsibilityArea);
  copied.definition.responsibilityArea.center[0] += 1;
  assert.notDeepEqual(copied.definition.responsibilityArea.center,
    play.assignments.find(a => a.id === sourceId).definition.responsibilityArea.center);
});
~~~

The test deliberately uses the same visible label on different IDs. Extend this explicit fixture for source and target duplicate-label concept failures, no input mutation, unchanged history on failure, successful uniquely labeled concept with override preservation, and path-only mirror.

**Run:** node --test tests/responsibility-operations.test.mjs tests/play-data.test.mjs.

**Exit:** every existing operation in the scope has an explicit tested result. No whole-play mirror added.

## Task 4 — Author, render and export the same region

**Files:** new ResponsibilityAreas.jsx, ResponsibilityAreaControls.jsx, LessonExport.jsx; modify responsibilityArea.js, AssignmentEditors.jsx, Inspector.jsx, App.jsx, PlayCanvas.jsx, Filmstrip.jsx, fieldView.js, WorkspaceDialogs.jsx, exportUtils.js and styles.css. Tests: field-view.test.mjs and new tests/browser/responsibility-areas.test.mjs / responsibility-outputs.test.mjs.

**Interfaces:**

~~~js
// Pure exports from responsibilityArea.js
regionBounds(area) // => { minX, maxX, minY, maxY }
projectResponsibilityArea(area, projection) // => { cx, cy, rx, ry }
// JSX components
ResponsibilityAreas({ play, projection, layers, selectedAssignmentId,
  editing, onSelect, onBeginDrag }) // fill/label group plus separate controls
ResponsibilityAreaControls({ area, ownerLabel, disabled, onChange, onEdit })
// area undefined means absent; onChange(undefined) explicitly removes it
LessonExport({ play, view, layers, onReady }) // onReady(svg|null)
// PlayCanvas additions
// clean=false; framePlay=false; editRegionId=null; region event callbacks
~~~

- [x] Geometry implementation and tests first. regionBounds computes center ± radius; include these extrema in playBounds before fitting. The projection is already yard-isotropic:

~~~js
export function regionBounds(a) {
  return { minX: a.center[0] - a.radiusX, maxX: a.center[0] + a.radiusX,
    minY: a.center[1] - a.radiusY, maxY: a.center[1] + a.radiusY };
}
export function projectResponsibilityArea(a, projection) {
  const [cx, cy] = projection.project(a.center);
  return { cx, cy, rx: projection.view === "side" ? a.radiusY : a.radiusX,
    ry: projection.view === "side" ? a.radiusX : a.radiusY };
}
~~~

Test an area centered [0,45] with radii [12,10]: maxY=55 even if the last path point is y=20. In fitted End Zone and Sideline, all four extrema must fall within projection bounds; fixed editor clipping must leave input geometry unchanged.

- [x] Render translucent fills (start at opacity .20) behind paths/tokens. Use defense visibility AND assignment visibility; inherit defense dimming. Render ownership with a keyed label shared by token and region, e.g. C·1 / C·2 where visible labels duplicate. Keys derive from stable roster IDs/order, not region proximity or color. Display the coach's full region labels in a wrapping legend for clean outputs; avoid overlapping full text over the bubbles.
- [x] The clean-output legend must be inside the exported SVG, not only an HTML sibling that PNG conversion would omit. Append a reserved legend band below the projected field and extend the clean SVG viewBox accordingly; keep the field projection unchanged. Wrap each 48-character label into measured lines, include only intentionally visible regions, and size the band from its actual rows. This same clean SVG is used in print. Give SVG markers/other referenced defs unique per-canvas IDs so a hidden export canvas or multi-play print page cannot resolve another canvas's definitions.
- [x] Selected controls render above tokens without blocking unrelated controls. Unselected region fills are pointer-transparent; select its existing assignment or labeled region chip to edit. Edit mode exposes a center move handle and two axis resize handles with 44px hit targets. Locked defense, reference books, hidden assignments and clean mode expose no editing controls.
- [x] “Add responsibility area” appears only on the selected Zone assignment. Explicit Add creates center at its last path point, radii 6/6 yd, label “Responsibility”, color blue; this is a positioning convenience only. Controls include short label, palette, width/height in yards (diameters), Edit area, and Remove area. Region-only changes must not call the existing definition-change path that regenerates drop points; use a dedicated updateSelectedAssignment handler.
- [x] UI edit bounds use FIELD.bounds, not viewport size. Center moves clamp to existing field editing bounds; resize minimum radius .5 yd, maximum radius half the corresponding FIELD.bounds span. Imported finite positive geometry outside these UI limits remains intact until the coach deliberately resizes/moves it. Invalid text/number input stays a draft until corrected; never commit zero/NaN on an empty input.
- [x] Pointer math uses the same projection as canvas, frozen for the drag so auto-fit cannot chase the pointer. Record one history entry on commit, not per move. Pointer cancel/Escape restores the starting geometry; switching play/layer or starting pinch ends the edit safely. Use separate region editing mode so arrow keys nudge the region only when intended. Quarter-yard nudges, Shift=1 yd, text fields unaffected. Region Delete removes only the region; ordinary assignment Delete retains its existing meaning outside region edit mode.
- [x] Phone quick adjustments retain label/color/size and directional nudge buttons; full canvas handle editing is desktop/iPad-first. Do not disable all phone adjustments. Match existing inspector disclosure and temporary-panel behavior.
- [x] Add clean mode to PlayCanvas: no selection classes/active arrow marker, handles, focus highlights, draft path, drag guides, entry/FLIP motion or SMIL playback. Regions remain static even in normal playback. Keep reduced motion respected for any region fade on play switch.
- [x] PNG uses LessonExport's off-screen but measurable 1200×800 field canvas plus the SVG legend band, in the selected field orientation, current intentional layer visibility/dimming, idle playback, no zoom, framePlay=true and clean=true. Wait for measured SVG readiness and fonts; do not export a zero-sized or stale previous play. Keep clone-and-inline conversion in exportUtils, but clone this clean SVG. Never temporarily modify the live editor selection/camera to obtain the image.
- [x] PrintCollectionPreview uses clean/framePlay too. Pass current view and intentional layer state explicitly rather than hardcoded End Zone/all-visible values. Include the keyed legend and play title; no new print-theme system. Filmstrip miniatures reuse the region fill component and projection without controls/full legend.
- [x] Browser tests author/edit two regions on same-label defenders, verify lock/visibility and keyboard behavior, undo/redo, copy notice, save/reload, and removal. Compare persisted region data before/after moving a player, switching views and export.
- [x] Output tests export with selection, zoom and live playback present in the editor; inspect the clean SVG for absent controls/animation and preserved labels/visibility, then download and inspect the actual PNG. Capture print PDF in both views. Verify extreme area extents and overlapping keyed labels, not just PNG magic bytes.

**Run:** unit tests, build, then targeted browser files through integration's existing runner:

~~~sh
node scripts/with-preview.mjs node --test --test-concurrency=1 tests/browser/responsibility-areas.test.mjs tests/browser/responsibility-outputs.test.mjs
~~~

**Exit:** the same authored geometry survives editing and appears in clean outputs. Fixed editor viewport may clip off-screen data; presentation, PNG and print fit the complete lesson.

## Task 5 — Deliver the editable example and verify the complete workflow

**Files:** new cover3Lesson.js, tests/cover3-lesson.test.mjs, tests/browser/responsibility-lesson.test.mjs, docs/cover3-lesson-guide.md; update ToolRail/App, README/AGENTS and final evidence report.

**Interfaces:** createCover3Lesson(id, name = "Cover 3 — teaching example") returns a normalized independent play. The example action adds it to Personal Active with unique play/player/assignment IDs and selects it; no automatic insertion on upgrade and no replace-workspace import.

- [x] Implement an explicitly synthetic lesson using the existing legal 11-player offensive base. Use four generic front defenders and seven coverage defenders. Keep all geometry editable and do not claim program-specific reads or run-fit rules. The following is the initial illustrative content; count is fixture data, not application logic:

~~~js
const coverage = [
  ["cl", "C", -19, 8, -18, 26, 8, 11, "Deep left", "blue"],
  ["fs", "FS", 0, 15, 0, 27, 10, 11, "Deep middle", "violet"],
  ["cr", "C", 19, 8, 18, 26, 8, 11, "Deep right", "rose"],
  ["wl", "OLB", -14, 5.5, -20, 9, 7, 6, "Left flat", "teal"],
  ["ml", "W", -5, 5.5, -7, 12, 8, 7, "Left hook", "amber"],
  ["mr", "M", 5, 5.5, 7, 12, 8, 7, "Right hook", "amber"],
  ["sr", "S", 14, 5.5, 20, 9, 7, 6, "Right flat", "teal"],
];
// Tuple: id suffix, label, alignment x/y, region center x/y,
// radius x/y, lesson label, palette key.
~~~

Implement the factory with the tuple list above and existing playData exports:

~~~js
import { basePlayers, clonePlaybook, normalizePlay } from "./playData.js";
export function createCover3Lesson(id, name = "Cover 3 — teaching example") {
  const players = clonePlaybook(basePlayers).map(p => ({ ...p, id: id + "-" + p.id }));
  const front = [-6, -2, 2, 6].map((x, i) => ({
    id: id + "-front-" + i, label: ["E", "T", "T", "E"][i], x, y: 2.5
  }));
  const defenders = [...front, ...coverage.map(([key, label, x, y]) => ({
    id: id + "-" + key, label, x, y
  }))];
  const assignments = coverage.map(([key, label, x, y, cx, cy, rx, ry, title, color], i) => ({
    id: id + "-zone-" + key, playerId: id + "-" + key,
    unit: "defense", phase: "post", type: "Zone", pace: 1, delay: 0,
    geometryMode: "manual", preset: title, points: [[x, y], [cx, cy]],
    definition: {
      area: i < 3 ? "deep-third" : (key === "wl" || key === "sr" ? "flat" : "hook"),
      landmark: "Illustrative teaching area; adjust for your lesson.",
      responsibilityArea: { version: 1, shape: "ellipse", center: [cx, cy],
        radiusX: rx, radiusY: ry, label: title, color }
    }
  }));
  return normalizePlay({ id, name, family: "Cover 3 teaching", folder: "Teaching",
    formation: "Trips Right Open", personnel: "10 Personnel",
    players, defenders, assignments });
}
~~~

The paired C corners exercise duplicate-label independence; hook defenders have distinct W and M labels. This is an illustrative look, not a declaration that these are universal coverage boundaries.

- [x] Add a labeled “Add Cover 3 teaching example” action in the existing More menu, visible only for an editable workspace. Repeated adds make independent plays; do not seed into governed reference books. Add unit assertions for legal offense, stable ownership, clone independence, no mutation of base rosters and unchanged defaultWorkspace contents.
- [x] The short guide names the saved play ID and SHA-256 of its exported backup used for the rehearsal, and includes three coach-observed prompts: identify the shown responsibility, explain it in the player's words, and walk through a coach-approved changed look if available. Do not fabricate an answer key for an unapproved second look. “Correct” applies to the prompt only. Include one revision exercise: move/resize a region and relabel it, regenerate outputs, verify no second authoring source was needed.
- [x] Rehearse add example → revise region → save/reopen → backup/restore → presentation → PNG → print, using synthetic browser storage. Record active authoring, correction and export work separately. Owner's current-process time remains unmeasured; report that rather than claiming time savings. Coach/player usefulness review can follow local completion without being misreported as already observed.
- [x] Run the complete selected-baseline unit suite, Sites tests, production build and browser suite once after final edits. Add all new unit files to package.json test:unit; integration test:browser already picks up new browser files. Re-run only affected checks when review produces changes; final evidence must match the delivered diff.
- [x] Inspect desktop 1440×900 and 1280×720, iPad 1024×768 touch, phone 390×844 and 844×390. Test relevant touch/pinch interactions and keyboard, zoom, reduced motion, output readability and both views. Browser viewport emulation is not a claim of physical iPad/Safari verification; record unavailable physical checks honestly.
- [x] **Checkpoint B:** independent completed-diff review, including real exported artifacts and unresolved evidence gaps. Close actionable in-scope findings. Keep code review, visual inspection and owner coaching acceptance distinct.
- [x] Update README only to verified capabilities; record durable design/copy/layer behavior in AGENTS. Move this live plan into docs/superpowers/plans/2026-09-22-responsibility-areas.md in the isolated repository and replace the loose current brief with a pointer. Keep the design reference linked until requirements are carried forward. Write one exact-head completion report under docs/reports; no parallel current-state narratives.

## Completion, evidence and stop rules

Task completion is local, not a release. Required evidence: both lineage fixtures preserved; legacy/invalid backup and startup safety; ID/copy/concept rules; editing/undo and unchanged paths; clean presentation/PNG/print in both views; integration regressions; both independent review checkpoints. A failed migration or output check prevents claiming local completion.

Stop and surface the concrete issue if preservation requires dropping/reinterpreting content, an existing operation cannot meet the ownership contract, a new dependency or external scope is needed, or effort exceeds the stated boundary. Ordinary in-scope fixes remain with Codex. Do not pause for palette values, file naming or test plumbing already settled here.

The single approval requested is **implementation of Tasks 0–5 on an isolated feature branch, preserving both data lineages, with the two review checkpoints**. O10a/O11 retain their existing conditions. Main merge/deployment and unrelated cleanup remain separate.

## Planning evidence and self-review

Outcome: complete (combined plan); delivery depth: snapshot-valid; protocol v1.2; Football OS DIAL: REVIEW + PROPOSE. Source checkout remains clean at d18501b; no product files, branches, merges, worktrees, dependencies, commits or deployment changed in this pass. Only this planning file was rewritten.

Directly verified: local refs/data versions, semantic port destinations, catalog IDs, storage readers/writers, normalization, copy/concept/mirror handlers, projections, output paths, existing tests/CI, GitHub admin/public capability, successful existing test check, and absence of effective main protection. GitHub calls were read-only under existing O10a/policy authority. Initial sandbox network failure was resolved with authorized read access; no approval rejection occurred. A shell ref-quoting check was corrected and rerun successfully.

Reported only: Claude's simulated conflict counts. Not run: product tests/build/runtime/export (not-applicable to planning; execution steps above require them). No independent planning review claimed. Elapsed work, cost and manual review time not measured.

Self-review completed: design requirements mapped across Tasks 1–5; transfer/copy/presentation decisions explicit; review-focus cases assigned to tests; version reservation checked across local branches; no owner input needed for the original drawing. Implementation scope grew only to include the storage surfaces needed to avoid data loss (startup and game-day snapshots), explicitly included for the single review.

Plan verification: all nine JavaScript snippets passed Node syntax checks in disposable temporary files; every absolute document link exists. These are plan checks, not implemented-feature tests. Final git status remained clean at d18501b.

Judgment calls: (1) selective semantic port instead of blind branch merge; (2) retain both distinct Air Raid catalogs; (3) preserve owner-approved 8-yard window; (4) clean fitted exports independent of editor camera; (5) no shared old game-day key for new geometry; (6) one live plan, with no broad document/worktree cleanup.
