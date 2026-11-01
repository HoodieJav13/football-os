# Data format

Practice Week Planner stores one **FICTIONAL** project per browser profile and
exports it as one versioned JSON file. Everything here describes this
prototype's own format; it is not an agreed contract with any other app.

- Schema id: `practice-week-planner.project`
- Schema version: `1` (integer). Files with a higher version are refused
  ("Unsupported schema version N … nothing was imported"); a missing or
  non-integer version is malformed.
- Source of truth: `src/domain/project.js` (`validateProject`, `importProject`,
  `exportProject`, `pruneReferences`). Tests: `tests/project.test.mjs`.

## 1. Identity

Every entity has an opaque, stable id `prefix-xxxxxxxxxx` (lowercase base36):
`prj-`, `wk-`, `day-`, `per-`, `ppl-`, `card-`, `clk-`, `tpl-`, plus fixed
library ids such as `drill-pursuit`, `grp-skill`, `card-trips-rt`.

- Ids are never derived from names. Renaming a period, day, card or
  participant keeps its id; references keep resolving.
- Reordering moves objects; ids do not change.
- Duplicating a period or day always issues new ids (a day duplicate re-ids
  all its periods and returns an `idMap`).
- Ids must be unique across the whole project (import rejects duplicates and
  names both paths). Role slot ids are unique within their group; diagram
  token/arrow ids are unique within their card.

## 2. Time model

- `project.timezone` is one explicit IANA name (default `America/Chicago`).
  All **schedule** times are wall-clock minutes after local midnight in that
  zone (`day.startMin`, `period.fixedStart`). Changing the zone relabels; it
  does not shift times. A time past midnight is shown with `+1d`.
- **Elapsed** practice time is measured in milliseconds from a monotonic
  source (`performance.now()` in the browser) and is never derived from the
  wall clock or from counting timer ticks.

## 3. Top level

```json
{
  "schema": "practice-week-planner.project",
  "schemaVersion": 1,
  "project":  { "id", "name", "fictional": true, "timezone", "rev", "seed?", "scenario?" },
  "week":     { "id", "version", "opponentLabel", "notes", "days": [Day] },
  "groups":   [Group],
  "participants": [Participant],
  "drills":   [Drill],
  "templates":[Template],
  "cards":    [Card],
  "rotations": { "<dayId>": Rotation },
  "records":  [PracticeRecord],   // saved debriefs (C1); missing in older files = []
  "clock":    ClockSession | null
}
```

`project.rev` increases on every committed change, including undo and import
(it never goes backwards). `week.version` and `day.version` increase on every
change to the week / that day. Both are printed on every page. Unknown
top-level fields are reported as warnings and dropped on import.

### Day

`{ id, label (≤60), date ("YYYY-MM-DD" or ""), startMin (0–1439), plannedMinutes (10–360), version (≥1), notes (≤1000), periods: [Period] }`

### Period

| field | type / limit | meaning |
|---|---|---|
| `id` | id | stable |
| `title` | 1–120 chars | rendered as text, never markup |
| `minutes` | integer 1–240 | planned duration |
| `category` | `walkthrough` `individual` `group` `team` `break` | breaks are explicit periods |
| `objective` | ≤300 | teaching objective |
| `callLabel` | ≤60 | fictional call / look label |
| `drillId` | drill id or `null` | |
| `cardIds` | card ids | local scout cards |
| `groupIds` | group ids | scout groups needed |
| `equipment` | ≤20 items × ≤60 chars | |
| `notes` | ≤2000 | coach notes |
| `scheduled` | boolean | `false` = on the visible "shelf": no times, not on the clock |
| `parallel` | boolean | declared station: starts with the previous block |
| `fixedStart` | minutes or `null` | pins the wall time |

### Schedule rule (computed, never stored)

For scheduled periods in order: a normal period starts when everything before
it has ended; a `parallel` period starts with the previous block's start and
the block ends at its longest station; a `fixedStart` period starts at that
time — earlier than the running end is an **overlap** warning (minutes),
later is a visible **gap**. Day total = last end − start. Total above
`plannedMinutes` is an **over-duration** warning. Nothing is ever shortened.
Overlapping periods that share a group raise **group-overlap**. Intervals are
half-open: a period ending at 4:10 does not overlap one starting at 4:10.

### Practice Pilot days (no schema change)

Days added by Practice Pilot (`src/domain/pilot.js`) are ordinary Days with
ordinary Periods: new `day-`/`per-` ids from the id factory, `version` 1,
parallel stations as `parallel: true` periods, equipment as text items such
as `"Cones (8)"`, and the coach's objective text (if any) quoted in the day
`notes`. Nothing Pilot-specific is stored: proposals live only in the open
page, and the schema version stays `1`. A shorter copy re-ids every period
(as Duplicate day does) and copies the arrays; rotations and participant
availability stay keyed to the original day.

### Group, participant

```json
{ "id": "grp-skill", "label": "Scout Skill A",
  "roles": [ { "slotId": "grp-skill-qb", "roleKey": "QB", "label": "QB" } ] }
{ "id": "ppl-…", "label": "Fict Scout 07", "roleKeys": ["QB"], "groupIds": ["grp-skill"],
  "unavailable": [ { "dayId": "day-…", "periodId": "per-…" }, { "dayId": "day-…", "periodId": null } ] }
```

Participants may carry only these five fields; anything else (for example a
health or identity field) fails import. Labels (≤40) must contain "Fict" so
they stay obviously synthetic. `periodId: null` means out for the whole day.
Availability is a coach-set planning flag with no reason stored.

### Drill, template

Drill: `{ id, title, category, defaultMinutes, objective, setup, steps[], cues[], tags[], equipment[] }`.
Cues are generic and every one starts "REFERENCE / FICTIONAL cue (generic):" — they are
not program rules. Template: `{ id, label, dayLabel?, description, startMin?,
plannedMinutes, periods: [period fields without id] }`.

### Card (local scout card)

```json
{ "id", "version" (≥1, +1 per saved edit), "title" (1–80), "lookLabel" (≤60), "family" (≤30),
  "diagram": { "width": 100, "height": 60, "los": 24,
               "tokens": [ { "id", "label" (1–4), "x" 0–100, "y" 0–60, "side": "O"|"D" } ],   // ≤24
               "arrows": [ { "id", "from": {x,y}, "to": {x,y}, "kind": "route"|"run"|"block"|"motion", "label" (≤12) } ] }, // ≤24
  "notes" (≤500), "cues" (≤4 lines × ≤140), "fictional": true,
  "provenance": null | { "sourceProject", "sourceCardId", "sourceVersion" } }
```

Diagram units are illustrative (not to scale). Every printed or displayed
card is labelled REFERENCE / FICTIONAL. Provenance binds **only** by an exact
`sourceProject` + `sourceCardId` match; an unknown source stays
`unresolved` and is never matched by title. The field limits alone do not
guarantee a quarter-page fit; the two print rules below do.

**Printed-line rule (correction F2).** Character limits alone do not bound a
printed card: 80 one-letter lines are only 163 characters. So notes and cues
together must fit `PRINT_FIT.maxLines` = **21 printed lines**, estimated
conservatively by `printedLines()` in `src/domain/cards.js`: every explicit
line counts (blank lines included), a long line wraps every 60 "average"
characters, and wide or non-Latin characters weigh more. The rule is checked
when a card is saved in the editor (live counter "Printed lines: N of 21";
Save is refused with the reason, and the text stays in the field) and on
import (refused with path `cards[i].notes`). A card saved by an older version
of this planner that breaks the rule is **loaded unchanged and flagged**
(banner and card tile), never altered; it prints alone on its own page with
its notes in two columns, or — if even that cannot hold it — the print shows
an explicit "Not printed" notice instead of a cut card. An export that
contains such a card cannot be re-imported until the card is shortened.
Print always measures every card: a card that does not fit its quarter page
is never clipped (dense text first, then its own page).

**Whole-card rule (four-up correction).** The 21-line rule budgets notes and
cues only, so a card can pass it and still be too tall once a long title and
look label wrap (80 W's in the title, 60 in the look label and 21 short note
lines need about 445 px of a 429 px quarter-page card). So every card that is
saved, duplicated or imported must also pass `cardFit()` in
`src/domain/cards.js`, which assesses the **whole printed card**:

- It word-wraps the look label (beside the version stamp, which is wider from
  v10 and again from v100), the title, every note line (blank lines included)
  and every cue, using per-character glyph widths measured in Chrome print
  media (`src/domain/printmetrics.js`, generated from
  `evidence/correction-fourup-20261015/calibration/`). Every glyph width is
  taken 3% wider; a character that was not measured counts as 1.25× the widest
  measured one.
- Only ASCII spaces, tabs and line breaks collapse in the title, look label and
  cues, as in CSS. Other spaces (ideographic, em, thin, no-break) keep their
  width. A tab in the notes counts as a full tab stop (8 spaces).
- It adds the fixed parts (card padding, the 105 px minimum diagram, the gaps
  between blocks and a 3 px margin) and requires the total to fit the 429 px
  quarter-page card at the densest print type.

The editor counter shows both rules, for the card as it would be saved:
"Printed lines: N of 21 (notes a, cues b). Whole card: X of Y lines (look
label L, title T, notes N, cues C)." Y is about 27.1 note lines; the label and
title lines are what a long title or look label costs. A card over either
limit shows a ⚠ line saying what to shorten or join. Save is refused with the
reason and the draft stays in the fields. Save checks the stored version: a
card that fits at v9 but not with the wider v10 stamp is refused with that
explanation. **Duplicate** checks the copy, whose title gains " (copy)", and
if it would not fit says so in a message and adds nothing. Import is refused
atomically, with path `cards[i].notes` and a message that names the card
(title and id) and the title, look label and notes.

Accepted cards therefore print four per page (1, 4, 5, 10 cards → 1, 1, 2, 3
pages, `[1]`, `[4]`, `[4,1]`, `[4,4,2]`). Examples, no cues:

- The realistic maximum (80-character title, 60-character look label, 21
  ordinary lines, 482 characters) uses about 25.3 of 27.1 and prints four-up.
- W×80 / W×60 with 21 short lines needs about 30.2 and is refused; the same
  labels accept 17 short lines.
- W×80 / W×60 with wrapped prose up to the 500-character limit fits.
- For ordinary all-caps labels with cues and the maximum 24-player diagram, the
  21-line rule stops first, within about half a line of the whole-card limit.

The published field maxima and multiline notes are unchanged. A stored card
from an earlier version that breaks this rule is handled like the 21-line
legacy case: loaded unchanged and flagged. If it does not fit a quarter page it
prints alone with a visible note ("Saved by an older version and too long for
a quarter-page card…"). That note is part of the page that is measured, so
the card is never cut. If the card and note do not fit even a full page, the
explicit "Not printed" notice appears. Any other card the print measurement
promotes to its own page also carries a visible note; nothing is promoted
silently.

**Scope of the estimate:** it is calibrated for Chrome on macOS with the
print font stack's first font, Avenir Next, installed. Where Chrome falls back
to Segoe UI, system-ui or another font, and in Safari or other print engines,
the widths were not measured.

## 4. Rotation and the fairness rule

```json
{ "dayId", "seed",
  "entries": [ { "periodId", "groupId",
                 "slots": [ { "slotId", "roleKey", "participantId"|null, "locked", "reason", "rationale" } ] } ],
  "orphans": [ locked assignments whose period/group no longer exists — kept, not applied ],
  "constraints": { "fairnessRule", "participantCount", "lockedCount", "slotCount", "dayVersion" },
  "warnings": [...], "counts": { "<participantId>": { "total", "byRole": { "QB": 2 } } } }
```

**Slots** are scheduled period × group in that period × role slot of the group,
processed in schedule order (start time, then position).

**A candidate** for a slot must hold its role key, belong to its group, be
available for that period (and day), and not be assigned to any slot whose
period interval overlaps this one — the same period, a parallel station or a
colliding fixed start. Sequential periods may reuse a person.

**Generation:**
1. Locked slots from the previous rotation are placed first and never
   changed, even if no longer valid (they are then reported as errors).
2. Each remaining slot takes the candidate with, in order:
   **(a)** the fewest slots so far that day (locks counted from the start),
   **(b)** the fewest earlier times in this role key,
   **(c)** the lowest seeded rank `FNV-1a("<seed>:<participantId>")`.
   The rule id is `fewest-day-total > fewest-same-role > seeded-rank`.
3. No candidate → the slot stays **empty** with a reason that names every
   eligible person and why they cannot take it. Nobody is invented.

The same day, participants, locks and seed always give the same result. The
seed and the rule are stored with the rotation. The counts are planning
counts in a fictional model — **not** a workload, contact or health measure.

**Warnings** (recomputed from the current plan every time it is shown):
`shortage`, `not-generated` (slot added after generation), `conflict` (same
person in two overlapping slots), `ineligible-role`, `not-in-group`,
`unavailable`, `unknown-participant` (errors carry `locked: true` when the
slot is locked), `repeat-role` (informational; `unavoidable: true` when every
other eligible, free participant had already played that role),
`group-overlap`, `orphan`, `unknown-group`.

**Manual change:** only an eligible, in-group, available, non-overlapping
participant is accepted; otherwise the change is refused with every reason.
After any change the whole day is revalidated. Clearing a slot is an
explicit edit and also unlocks it. An empty slot cannot be locked.

## 5. Clock session

```json
{ "id", "dayId", "dayVersion", "state": "idle"|"running"|"paused"|"completed",
  "index", "steps": [ { "periodIds", "title", "plannedSec", "extensionSec", "elapsedMs",
                        "status": "pending"|"active"|"done"|"skipped", "endedBy": null|"next"|"skip" } ],
  "run": null | { "mono", "wall", "instanceId" },
  "rev", "history": [ { "type", "at": {mono, wall, instanceId}, "wasRunning", "before": {...} } ],
  "recovery": null | { "wasState", "savedAtWall", "awayEstimateMs"|null, "elapsedAtSaveMs" },
  "notice", "checkpoint": { "index", "elapsedMs", "wall", "instanceId" },
  "lastInstanceId", "startedWall", "endedWall" }
```

- Steps are the day's scheduled blocks, snapshotted at set-up (parallel
  stations form one step; `buildSteps(day)`). Later plan edits never change
  the clock on their own; the run view says so and offers **Rebuild from the
  current plan…**.
- **Reset (correction F1)** is confirmed and always rebuilds the steps from
  the *current* version of the same day: period ids, titles, durations, order
  and parallel blocks, and `dayVersion`. It is allowed from running, paused
  and completed, and from idle when the plan changed. The action carries the
  day (`{ type: 'reset', rev, day }`); a missing or different day is refused.
  It adds one history entry and one revision; Undo restores the previous
  complete session, including its old script and `dayVersion`.
- `elapsed(active) = elapsedMs + (running ? mono_now − run.mono : 0)`.
- Every accepted action carries the revision it was made for; a stale one is
  rejected. Each accepted action adds exactly one history entry and +1 rev
  (history keeps the last 200). Only `next`/`skip` end a period; overrun is
  shown, never acted on.
- **Double tap**: a real double tap lands on the freshly re-rendered button
  and carries a fresh revision, so the app also ignores a second
  start/pause/resume/next/skip within 700 ms of the previous one in the same
  page (`isLikelyDoubleTap`). Undo, add time and reset are not throttled.
- A clock whose day was deleted is set aside: it is not exported and does
  not block other days (`clockForProject`); undoing the delete brings it back.
- History snapshots (`before`) hold the state, index, steps, `dayVersion`
  (older history without it keeps the session's version) and start/end times.
- **Undo** restores the snapshot taken just before the last action. If that
  state was running in this page instance, the time since the action is
  added back; if the action happened before a reload, the state is restored
  **paused** with a notice.
- **Checkpoint**: while running, the live elapsed time is written every 5 s
  (and on page hide) without a new revision.
- **Recovery**: a session saved by another page instance (a reload) comes
  back **paused** at the larger of the folded or checkpointed elapsed time,
  with `recovery` filled in and +1 rev. Time away is shown as a wall-clock
  estimate (or `null` if the wall clock went backwards) and is never added.
- **Sleep / wall-clock changes** never change elapsed time. If wall and
  monotonic deltas between repaints differ by more than 5 s, the run view
  shows a notice.

### Disruption and recovery (C1)

The session also keeps (all optional, so clocks saved before C1 stay valid):

```json
"plan":       { "dayVersion", "steps": [{ "periodIds", "title", "plannedSec" }], "periods": [{ "id", "title", "minutes" }] },
"unfinished": [{ "periodId", "title", "plannedSec", "ranMs", "reason": "deferred"|"station-unavailable" }],
"changes":    [{ "at" (wall ms), "kind": "rebalance"|"station", "summary" }],
"debriefDraft": "text (≤4000)",
step extras:  "originalSec" (set when the coach changed its length), "origin": "plan"|"moved",
              "removed": [{ "periodId", "title", "reason" }]
```

- `plan` is the script as set up (or as rebuilt by Reset) and never changes
  during practice, so the original plan stays traceable.
- **Late:** `projection()` compares running time (elapsed + current
  remaining + remaining periods) with the plan total. 1 min or more behind
  shows a notice; nothing changes on its own. Pauses and a late start are
  **not** counted (the clock never trusts the wall clock); the coach sets
  the real minutes left in the rebalance panel.
- **`revise`** is one more clock action (revision guard, undo snapshot). Its
  change lists the remaining periods with their new lengths and any work
  moved to `unfinished`. It is refused unless every period of the current
  and remaining steps reappears exactly once (in the current step, a remaining
  step or `unfinished`), every length is whole seconds from 60 to 4 h, and
  the current step only loses stations. Finished steps and the current
  step's time never change.
- **Rebalance** (coach chooses): minutes left (default: to the planned end),
  *fit* (scale the remaining periods down in whole minutes, none below 2 min
  or below its own length; if even that cannot fit, the preview says how
  much it is still over) or *keep* (finish late), and any periods moved to
  unfinished work. The minutes left set an end point on the steady clock,
  so they count down while the panel is open. Apply re-checks the plan at
  that moment and applies it only if it is still what the preview shows;
  otherwise it shows the updated preview first.
- **Station unavailable**: a station of the current parallel period or of a
  later period either runs later today as its own period (its own planned
  minutes, right after its block) or moves to unfinished work (with the time
  it already ran). The only station of the current period is ended with Skip.
- **Outcomes** (`stepOutcomes`): *completed*, *ended early* (coach advanced
  more than 30 s before its time), *shortened by coach* (`originalSec` →
  `plannedSec`), *skipped*, *not reached*. Shortening is never reported as a
  full completion.
- Reset clears `unfinished`/`changes` and rebuilds `plan`; Undo brings them
  back. Undo of a `revise` restores the previous script exactly.

### PracticeRecord (saved debrief)

```json
{ "id", "dayId", "dayLabel", "dayVersion", "sessionId", "savedWall", "startedWall"|null, "endedWall"|null,
  "state", "notes" (≤4000),
  "steps": [{ "title", "periodIds", "originalSec", "plannedSec", "extensionSec", "ranMs", "outcome" }],
  "changes": [{ "at", "kind", "summary" }],
  "unfinished": [{ "id", "periodId", "title", "plannedSec", "ranMs",
                   "reason": "deferred"|"station-unavailable"|"skipped"|"not-reached",
                   "carriedTo": null | { "dayId", "periodId" } }] }
```

Saved with **Save debrief** (undoable). A record belongs to one run of the
clock (session id + start time; Reset starts a new run and an empty draft,
Undo brings the draft back). **Update debrief** recomputes everything from
the clock and keeps where already-carried items went. **Add to that day**
carries an unfinished item to another day as an **unscheduled** period
(copied from the original period, "Carried over from …" in its notes, the
day's version +1; undoable) and records where it went. An item is carried
once, never to its own day, and never to a day that already received that
period from another debrief. Records are
validated on load and import like everything else (a malformed record
refuses the whole import, nothing replaced).

## 6. Browser storage and competing tabs

| key | content |
|---|---|
| `pwp:v1:project` | the project (top-level fields above, without `clock`) |
| `pwp:v1:clock` | the serialized clock session (with checkpoint) |
| `pwp:v1:meta` | `{ projectRev, clockRev, savedBy, savedAt }` |
| `pwp:v1:lease` | `{ instanceId, heartbeatAt }` — the writer lease |

- One tab holds the lease (heartbeat every 2 s, stale after 8 s, released on
  page hide; a lease dated more than 8 s in the future counts as stale).
  Another tab opens **read-only**, follows changes through `storage` events
  and offers an explicit **Take over here**.
- Every write first compares the stored meta revision with the revision this
  tab last saved. A mismatch — including saved data that vanished — is a
  **conflict**: nothing is written; the tab offers "Export this tab's copy"
  and "Load the saved version".
- Every storage call is guarded. Quota or access errors show **Not saved**
  with the reason; the plan stays usable in memory and can be exported.
  Plan and clock write errors are tracked separately, so a later successful
  clock write cannot hide a failed plan write.
- "Unsaved" means a real edit has not been saved yet (an explicit flag), not
  a revision mismatch, so a tab never writes back data it merely loaded.
- Saved data that cannot be read or validated blocks every write. "Load the
  saved version" and "Take over here" keep the tab blocked while it is still
  unreadable; only "Replace saved data with this example" (confirmed)
  overwrites it, after offering an export of the raw data.
- Validation never throws: wrong shapes (for example `null` list items or a
  broken clock step or history entry) become errors.

## 7. Export / import

Pruning after a delete (`pruneReferences`) bumps the version of every day
whose periods it edits, and the week version once.

`exportProject(project, clock)` writes the top level above with 2-space
indentation in a fixed key order (byte-stable round trip). The UI labels the
download "Export requested" because a browser download request is not proof
that a file was saved. `importProject(text)` checks JSON syntax, schema id,
schema version, structure, field limits, duplicate ids and every reference
(drills, cards, groups, participants, days, periods, role slots, clock day),
and replaces nothing unless all checks pass. A successful import is undoable.

**Clock validation on import and load (correction F3).** The current clock and
every undo snapshot in `clock.history[i].before` follow the same rules
(`clockErrors`, `historyEntryErrors`, `clockStateErrors` in
`src/domain/clock.js`): each step is an object with one or more non-empty,
unique period ids, a text title, whole-second `plannedSec`/`extensionSec`,
non-negative `elapsedMs`, a known `status` and a matching `endedBy`; the index
points at a step; and the state agrees with the step statuses (idle: all
pending; running/paused: the current step active, earlier ones done or
skipped, later ones pending; completed: none pending or active). A period id
may not belong to another day. A period id that no longer exists anywhere is
allowed — an older script legitimately names periods deleted since — and is
reported as a warning. History entries need a known action type, the action
time and a `wasRunning` flag that matches the snapshot. A failure refuses the
whole import with the exact path (for example
`clock.history[0].before.steps[0]`) and changes nothing. A saved clock that
fails these rules when the app starts is left in storage untouched and
reported; setting up a new clock replaces it. Undo itself refuses a damaged
in-memory snapshot instead of throwing.

## 8. Practice-debrief export (frozen producer contract, v1)

**Export debrief (JSON)** on a saved debrief writes one small, self-contained
document for consumers that should not read the whole project
(`src/domain/debrief-export.js`: `exportPracticeDebrief`,
`parsePracticeDebrief`, `validatePracticeDebrief`). It is pure: exporting
changes nothing that is saved.

```json
{ "schema": "practice-week-planner.practice-debrief", "schemaVersion": 1, "fictional": true,
  "notice": "…no doctrine, ratings, adoption decisions or player evaluation.",
  "exportedWall": ms,
  "producer": { "app": "practice-week-planner", "contract": "practice-debrief/1",
                "projectSchema": "practice-week-planner.project", "projectSchemaVersion": 1 },
  "source": { "projectId", "projectRev", "weekId", "weekVersion", "dayId", "dayLabel",
              "dayVersionAtPractice", "dayVersionNow" | null, "sessionId", "recordId",
              "recordSavedWall", "startedWall" | null, "endedWall" | null, "state" },
  "periods": [ { "periodId", "title", "category"|null, "minutes"|null, "drillId"|null,
                 "cards": [{ "cardId", "cardVersion"|null }], "objective", "callLabel",
                 "asOf": "export"|"deleted", "missing"?: true } ],
  "steps": [ { "index", "title", "periodIds", "originalSec", "plannedSec", "extensionSec", "ranMs",
               "outcome": "completed"|"ended-early"|"shortened"|"skipped"|"not-reached"|"in-progress" } ],
  "disruptions": [ { "at", "kind": "rebalance"|"station", "summary" } ],
  "debrief": { "notes" },
  "unfinished": [ { "id", "periodId", "title", "plannedSec", "ranMs",
                    "reason": "deferred"|"station-unavailable"|"skipped"|"not-reached",
                    "carriedTo": null | { "dayId", "periodId" } } ] }
```

- **Steps** are as practised: titles, lengths and outcomes come from the saved
  record. **Periods** are the source period details as of export (drill id,
  card ids and their current versions). `dayVersionAtPractice` differs from
  `dayVersionNow` when the plan was edited after practice. A period deleted
  since then is listed with `asOf: "deleted"`, `missing: true` and its
  practised title.
- **Readers must refuse, never guess**: a wrong schema, any other version,
  unknown top-level fields, `fictional` not `true`, or any period id in
  `steps` or `unfinished` that is not listed in `periods`. The validator names
  the field. Nested objects are not closed: a v1 reader ignores extra keys
  inside them, but never fields at the top level. A period is practised in
  at most one step. `missing` appears only with `asOf: "deleted"` (and then
  `category` and `minutes` are null). The producer validates every document
  before handing it out; a hand-edited record that v1 cannot carry is
  refused with the reason, never exported. Version 1 is frozen; any change
  gets a new version.
