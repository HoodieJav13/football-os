# Football OS export formats

**What this is.** A description of the export Football OS *already has*: the
`.footballos` workspace backup and the per-play PNG, as the code writes them
today. It exists so that anyone reading a backup outside the app can do so
without reverse-engineering the JSON.

**What this is not.** This is not an approved interchange contract. In
particular it is not the Team Hub (CoachOS2.0) Phase 4 "Published Play
System" contract; that contract remains a separate, future decision, and
nothing here commits either app to it. Team Hub may find this useful as a
reference when that decision is made.

## Inventory

| | |
| --- | --- |
| Repository | `HoodieJav13/football-os` (public) |
| Documented from | `main` at `8d8ce69` (the branch this doc's PR #10 starts from) |
| Pending change read | PR #9 `feat/responsibility-areas` at `cc7af9a` |
| **On main today** | backup **format 2** · workspace **version 9** · game-day key **v6** · PNG at **26 px/yd** |
| **Pending (PR #9)** | backup **format 3** · workspace **version 11** · game-day key **v7** · PNG at **2× measured pixels** |

**Merge dependency.** Every section marked *pending* describes PR #9 and
becomes current only if PR #9 merges. If it is closed or changed, those
sections are wrong and the *on main* sections stay right. Nothing in this
document alters PR #9.

Two files sit beside this page and are checked by `tests/export-format.test.mjs`
in `npm run test:unit`:

| File | Purpose |
| --- | --- |
| [`export-format.schema.json`](export-format.schema.json) | JSON Schema (draft 2020-12) with one branch per backup format |
| [`export-format.example.json`](export-format.example.json) | Minimal, complete, restorable **format-2** backup: every assignment type and a concept |
| [`export-format.example-v3.json`](export-format.example-v3.json) | Minimal **format-3** backup produced by PR #9's own `createWorkspaceBackup` at `cc7af9a` (personal playbook only) |

The test validates the seeded workspace's real `createWorkspaceBackup`
output, a coach-authored workspace covering every assignment type and a
concept, and the format-2 example against the schema; restores the format-2
example and re-exports it to prove the normaliser leaves it byte-for-byte
alone; validates the format-3 example; and asserts that main *refuses* the
format-3 example as newer, so the merge dependency is pinned by a test rather
than a sentence. The validator is hand-written (`tests/json-schema-validator.mjs`);
it implements only the keywords the schema uses and the test asserts that set
is complete.

Source of truth in code: `src/workspaceData.js` (envelope, workspace
validation, migration), `src/playData.js` (`normalizePlay`, the assignment
vocabulary, the field model), `src/exportUtils.js` (PNG). On PR #9 also
`src/workspaceStorage.js`, `src/responsibilityArea.js`, `src/fieldSide.js`,
and `src/LessonExport.jsx`.

## 1. The `.footballos` backup envelope

A backup is a UTF-8 JSON document, pretty-printed with two-space indentation,
downloaded as `football-os-backup-YYYY-MM-DD.footballos` with MIME type
`application/json`. The date is the first ten characters of `exportedAt`.

```json
{
  "format": "football-os-workspace",
  "formatVersion": 2,
  "exportedAt": "2026-09-24T18:30:00.000Z",
  "workspace": { "version": 9, "...": "see §2" }
}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `format` | `"football-os-workspace"` | Discriminator. Anything else is "not a Football OS backup". |
| `formatVersion` | integer | Envelope version; see the table below. |
| `exportedAt` | ISO 8601 date-time string | `new Date().toISOString()` at export. Informational; the app does not order or dedupe by it. |
| `workspace` | object | The workspace, already normalised. |

| `formatVersion` | Wraps workspace | Status |
| --- | --- | --- |
| 1 | 5–8 (percent space) | Legacy. Accepted on import, upconverted, never written. Not described here. |
| **2** | **9** | **Current on main.** Written by main today. §2. |
| 3 | 11 | *Pending.* Written by PR #9. Main refuses it as "newer". §3. |

There is no checksum, signature, compression, or size limit. The seeded
workspace serialises to roughly 250 KB on main (four playbooks, 66 plays) and
roughly 340 KB on PR #9 (five playbooks, 69 plays). Every value is plain JSON:
no `NaN`, no `Infinity`, no `undefined`.

### Versioning rules

- `formatVersion` moves when the envelope or its acceptance rules change;
  `workspace.version` moves when the stored workspace shape changes. They are
  independent numbers.
- A newer `formatVersion` than the app understands is refused on import with
  "written by a newer version of Football OS". A consumer should do the same:
  refuse an unknown `formatVersion` rather than guess.
- Objects may carry keys not listed here. The normaliser spreads unknown keys
  through (`{ ...play }`, `{ ...assignment }`), so a key added by a future
  version, or by a coach's older data, survives a round trip. **Consumers must
  ignore keys they do not know and must not strip them on write-back.** The
  schema therefore does not set `additionalProperties: false` anywhere.
- Fields marked *always present* below are guaranteed by `normalizeWorkspace`;
  every backup passes through it before being written, so they are safe to
  read without a fallback.

### How the app restores one (main)

`parseWorkspaceBackup(text)` in `src/workspaceData.js`:

1. `JSON.parse`; a syntax error is "not valid JSON".
2. `format` must equal `football-os-workspace`.
3. `formatVersion` must be `1` or `2`.
4. `normalizeWorkspace(parsed.workspace)` must return a workspace, otherwise
   "incomplete or contains invalid play data". This is a structural check
   (§2.10), not a football-legality check: a play with nine offensive players
   restores fine and is shown as a draft.
5. The coach confirms in a dialog. On confirmation the workspace being
   replaced is written to `localStorage["football-os.recovery.v1"]` as
   `{ version: 9, createdAt, workspace }` before the restored one is adopted.

Restoring is whole-workspace replacement. There is no merge and no per-play
import (§6).

### How PR #9 restores one (pending)

Same steps, with these differences:

- `formatVersion` must be `1`, `2`, or `3`.
- Before normalising, every assignment in every play and concept is checked
  for a `definition.responsibilityArea` (§3.6). One is **rejected in a format-1
  or format-2 envelope** ("new geometry cannot appear in a legacy envelope") and
  validated in a format-3 envelope. A malformed area anywhere fails the whole
  restore.
- Playbook ids must be unique across the workspace.
- The recovery copy is written *before* the live workspace is replaced, and
  when the current workspace could not be opened (damaged local data) the
  recovery copy also carries `sourceKey` and the raw stored string, so nothing
  is lost even when nothing could be parsed.

## 2. Workspace schema, version 9 — on main today

Everything below is what `normalizeWorkspace` emits on main. The same object
is what the app stores in `localStorage["football-os.playbooks.v9"]`, so a
backup is the persisted workspace with an envelope around it.

### 2.1 Coordinates

Every coordinate in the file is in **yards**, relative to the play, not the
stadium:

- `x` is yards right of the field's centre line from the offence's point of
  view. Negative is the offence's left. The sidelines are at ±26.65.
- `y` is yards downfield of the line of scrimmage. The backfield is negative.
  The LOS is `y = 0`, so a route's stem depth and the `y` of its stem end are
  the same number.
- Editing bounds are `x ∈ [-30, 30]`, `y ∈ [-18, 55]`; a route may legitimately
  run out of bounds. Values are typically rounded to a tenth of a yard, but
  nothing enforces that.

There is no percentage space and no pixel space anywhere in the file. A
consumer that draws a play needs one scale factor and one origin.

### 2.2 Workspace

```
workspace
├── version            9                                   always present
├── mainPlaybookId     id of the coach's working playbook  always present, always resolves
├── activePlaybookId   playbook open at export             always present, always resolves
└── playbooks[]        ≥ 1                                 always present
```

`mainPlaybookId` is the coach's own book ("Personal Active", id
`personal-active` in a seeded workspace). The other books are read-only source
transcriptions in the app, but nothing in the version-9 file marks them
read-only: `isMain` is the only distinction. If either id fails to resolve on
import, the normaliser silently falls back to the first playbook.

### 2.3 Playbook

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Unique within the workspace (not enforced on main). |
| `name` | string | |
| `description` | string | Optional. |
| `isMain` | boolean | Optional. True on the working playbook. |
| `source` | string | Optional. `"personal"` or the title of the published source. |
| `formations[]` | formation | Always present, ≥ 1. The normaliser synthesises one from the first play if a book has none. |
| `concepts[]` | concept | Always present, may be empty. |
| `plays[]` | play | Always present, ≥ 1. A playbook cannot be empty. |

### 2.4 Play

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Unique **within its playbook**. Copying a play into another book keeps it independent by giving it a new id. |
| `name` | string, non-empty | The coach-facing name. Source books keep duplicate names on purpose, suffixed with their alignment (`93 H (Ace)`). |
| `family` | string | Grouping shown in the filmstrip. Expected but not guaranteed on hand-built data. |
| `personnel` | string | Free text: `"11 Personnel"`, `"X · H · Y · Z · T"`. |
| `formation` | string | The formation's **display name**, not a formation id. |
| `folder` | string | Always present. `"Offense"`, `"Source Plays"`, or coach-defined. |
| `protection` | string | Always present, may be empty. |
| `blockingScheme` | string | Always present, may be empty. |
| `variantOf` | string \| null | Always present. Id of the play this was duplicated from, in the same playbook. Later edits to either play never propagate. |
| `conceptTemplateId` | string \| null | Always present. Id of the concept last applied, in the same playbook's `concepts`. |
| `sourcePage` | integer \| null | Page in the published source, or null. |
| `sourceLabel` | string \| null | Title of the published source, or null. |
| `importedFrom` | `{ playbookId, playbookName, playId, sourcePage }` | Present only on a play copied into the working playbook from another book. A record of origin, not a live link. |
| `players[]` | player | Always present. The offence. Eleven for a legal formation; a draft may have any count. |
| `defenders[]` | player | Always present. The opponent look. |
| `assignments[]` | assignment | Always present, may be empty. |

`players` is the play's **own copy** of its alignment. It is not a reference
to a formation and editing it never changes a saved formation.

### 2.5 Player

Offence and defence share one shape:

```json
{ "id": "o-z", "label": "Z", "x": 17, "y": 0 }
```

- `id` is the stable identity. Assignments reference it. Ids are unique within
  a play (across both units, by convention `o-` and `d-` prefixed) but **not**
  across plays: every play has its own `o-x`.
- `label` is what the coach sees and can change freely. Duplicates are legal
  on a unit (two defensive `T`, two `E`, two `C`). Never key anything by label.
- `x`, `y` in yards (§2.1).

To match "the same player" across two plays the app uses unit + label +
occurrence index ("the second defensive T"), see `morphKeys` in
`src/playData.js`. A consumer comparing plays should do the same, not compare ids.

### 2.6 Assignment

An assignment is one player's job in one phase. Common fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Unique within the play. |
| `playerId` | string | The `id` of a player in this play's `players` (offense) or `defenders` (defense). An assignment whose `playerId` matches no player is dropped by the normaliser. |
| `unit` | `"offense"` \| `"defense"` | Always present. |
| `type` | `Route` `Block` `Motion` (offense) · `Rush` `Man` `Zone` `Fit` (defense) | Always present. |
| `phase` | `"pre"` \| `"post"` | Always present. Motion is `pre`; everything else `post`. One pre and one post slot per player. |
| `preset` | string | Display name (`"Corner"`, `"Jet"`, `"Structured"`, `"Custom"`). Not a key into anything. |
| `pace` | number > 0 | Playback speed multiplier, default 1. |
| `delay` | number | Seconds relative to the snap. Default `-1.5` for Motion, `0` otherwise. Always present. |
| `points[][2]` | yards | Always present, ≥ 2 points. **The rendered path.** Starts at the player's alignment. |
| `definition` | object | Always present; shape depends on `type` (below). |
| `templateOverride` | boolean | Always present on a play's assignments (absent on a concept's). True once a coach edits an assignment a concept supplied. |
| `inheritedFrom` | `{ conceptId, conceptName, assignmentId }` | Present only when a concept supplied the assignment. |

**Draw from `points`.** The `definition` is the football meaning and is what
the inspector edits; `points` is what the canvas draws and what playback
animates, and the two are kept consistent by the app. A consumer that only
needs to show the play never has to reimplement route geometry.

Per-type `definition`:

| `type` | `definition` |
| --- | --- |
| `Route` | `{ release, stemYards, breaks[], condition }` — see §2.7 |
| `Block` | `{ technique: drive\|reach\|down\|double\|pull\|wrap\|kick-out\|pass-set\|combo, direction: left\|right, target: string, climb: boolean }` |
| `Motion` | `{ motionType: jet\|orbit\|return\|shift\|trade, direction: left\|right, distanceYards: 2–40 }` |
| `Rush` | `{ technique: rush\|contain\|blitz\|stunt, gap: A\|B\|C\|D, direction: left\|right }` |
| `Man` | `{ targetId: string, leverage: inside\|outside\|head-up }` — `targetId` is an offensive player **id** in the same play, or `""` |
| `Zone` | `{ area: flat\|hook\|curl\|deep-third\|deep-half\|quarter, landmark: string }` |
| `Fit` | `{ responsibility: A\|B\|C\|D\|force\|cutback, technique: spill\|box\|lever }` |

The normaliser sanitises every definition to these shapes, substituting a
default for any missing or unknown value, so they are safe to switch on.

### 2.7 Route assignments

A receiver route carries three extra fields, all always present:

```json
"definition": {
  "release": "outside",
  "stemYards": 12,
  "breaks": [{ "direction": "outside", "angle": 35, "distanceYards": 10 }],
  "condition": ""
},
"geometryMode": "structured",
"evidence": {
  "method": "coach-authored",
  "confidence": "high",
  "sourceLabel": null,
  "sourcePage": null,
  "note": "",
  "coachEdited": true
}
```

- `definition.release`: `none` `inside` `outside` `best`.
- `definition.stemYards`: 0–40.
- `definition.breaks`: 0–4 ordered segments, each `{ direction: inside|outside|vertical, angle: 0–135 (degrees off vertical, 0 when vertical), distanceYards: 0–40 }`. A double move is two segments.
- `definition.condition`: a conversion rule kept as prose (`"Read man/zone"`).
  Conditions are deliberately never collapsed into one path.
- `geometryMode`: how `points` relates to `definition`.
  `structured` — points were generated from the definition.
  `detected` — the definition was inferred from points traced off a diagram.
  `manual` — the coach dragged a landmark; points are the truth and the
  definition is a description.
- `evidence`: provenance. `method` and `confidence` are open strings; the
  values main writes today are `existing-diagram`, `diagram-geometry`,
  `labels-and-geometry`, `coach-authored`, `coach-copied` and `medium`,
  `medium-high`, `high`. `note` may quote the source verbatim
  (`"Source call: X Slant"`, `"5 YDS with man/zone read shown"`).

Two normaliser behaviours matter to a consumer that writes files back:

1. While `evidence.coachEdited` is `false`, `evidence.sourceLabel` and
   `evidence.sourcePage` are **recomputed from the play's** `sourceLabel` /
   `sourcePage` on every normalise. Set them on the play, not the route.
2. A handful of seeded LSU route ids carry built-in evidence
   (`sourceRouteEvidence` in `src/playData.js`); while not coach-edited, their
   definition and points are regenerated from it. Any other id is left as
   written. Do not reuse those ids for new content.

### 2.8 Formation

```json
{ "id": "trips-right-open", "name": "Trips Right Open", "personnel": "11 Personnel", "players": [ ...player ] }
```

Labels and alignment only — never assignments. A play created from a formation
receives an independent copy of `players`. Applying a formation to an existing
play translates assignments by matching position label and drops offensive
assignments whose label no longer exists; defenders are untouched.

### 2.9 Concept

```json
{
  "id": "concept-z-corner",
  "name": "Z Corner",
  "sourceFormation": "Trips Right Open",
  "sourcePersonnel": "11 Personnel",
  "players": [ ...player ],
  "defenders": [ ...player ],
  "assignments": [ { ...assignment, "positionLabel": "Z" } ]
}
```

A reusable set of assignments keyed by **position label**, with the roster it
was captured from so each landmark can be translated by the offset between the
concept's player and the target play's player of the same label. Concept
assignments have every assignment field except `templateOverride` and
`inheritedFrom`, plus `positionLabel`. Applying a concept sets the play's
`family` to the concept's name and `conceptTemplateId` to its id; a play
assignment with `templateOverride: true` survives reapplication.

### 2.10 Structural validity (what "restorable" means)

`normalizeWorkspace` returns `null`, and restore is refused, unless:

- `version` ∈ {5, 6, 7, 8, 9}; `mainPlaybookId` and `activePlaybookId` are strings;
- `playbooks` is a non-empty array; each has string `id` and `name`, and a
  non-empty `plays` array;
- each play has string `id`, non-blank `name`, a `players` array of
  `{ id, label, x, y }` (or legacy `[label, x, y]` tuples), and an
  `assignments` (or legacy `routes`) array whose items each have string `id`,
  string `playerId` (or legacy `player`), and ≥ 2 finite `[x, y]` points;
- each concept, if any, has string `id`, non-blank `name`, valid `players`,
  `defenders`, and `assignments`.

Everything else is defaulted or dropped, never rejected: a missing assignment
`type` becomes `Route` (an unknown type string is passed through untouched,
which the schema then rejects), assignments for missing players vanish,
missing definitions are filled with defaults, a play with no `players` gets
the base Trips Right Open alignment, and a play with no `defenders` gets the
base 4-3 look. Football legality (eleven players, seven on the line) is **not**
checked on import.

### 2.11 Migration from earlier versions

Versions 5–8 stored coordinates as percentages of the canvas (`x` 0–100
left-to-right, `y` 0–100 top-to-bottom with the LOS at 73), offence as
`[label, x, y]` tuples, and `play.routes` keyed by position label.
`normalizeWorkspace` upconverts them: `x_yd = (x − 50) × 0.533`,
`y_yd = (73 − y) × 10/13`, tuples gain ids (`o-<label>`, deduplicated with a
numeric suffix), and label references become `playerId`. A consumer only ever
sees version 9 in a format-2 backup; format-1 backups should be handed to the
app to upgrade rather than parsed directly.

### 2.12 What is not in the file

- **Temporary game-day changes.** They live in local storage (§4) until the
  coach resolves them into a permanent outcome, and are not exported.
- Selection, zoom, the active view (End Zone / Sideline), presentation mode,
  playback state, undo history, and the offline-cache status.
- Play thumbnails and PNGs. Thumbnails are generated from play data on the fly.
- Any user identity. The file has no author field.

## 3. Workspace schema, version 11 — pending, PR #9

*Everything in this section describes `feat/responsibility-areas` at
`cc7af9a` and is current only if PR #9 merges.* Version 11 is a superset of
version 9: every §2 field keeps its meaning, and a version-9 file is read and
upgraded in place. What follows is the delta. The schema's `format3` branch
and `export-format.example-v3.json` (produced by that branch's own
`createWorkspaceBackup`, personal playbook only) show the exact shape.

### 3.1 Version 10, the step in between

PR #9's history includes a workspace version 10 (reference-playbook port:
governed catalogs, `readOnly`, and the `source*` play fields below) that was
never on main. Version 11 adds responsibility areas and `fieldSide`. Both are
upgrade sources: `SUPPORTED_VERSIONS` is 5–11 and the app reads
`football-os.playbooks.v10` as a legacy key. A consumer will not see version
10 in a backup written by either branch.

### 3.2 Playbooks: governed reference catalogs

| Field | Type | Notes |
| --- | --- | --- |
| `readOnly` | boolean | Optional. True on the three governed reference catalogs (`air-raid-reference`, `lsu-2019-reference`, `texas-tech-reference`). |
| `archived` | boolean | Optional. Set by the normaliser on the two superseded sample books from main (`texas-tech-sample`, `lsu-2019-sample`) when they still carry their original `source`. Archived books are kept for recovery but hidden, and can no longer be `mainPlaybookId` or `activePlaybookId`. |
| `migratedFromId` | string | Optional. Present when a personal book had an id that collides with a reference catalog id and was re-id'd (`<id>-personal`) to make room. `importedFrom.playbookId` on its plays is remapped to match. |

Two behaviours a consumer must expect:

- **The catalogs are refreshed from the app's seeds on every normalise.** A
  `readOnly: true` book whose `id` and `source` match a governed catalog is
  replaced wholesale by the seeded version, and any governed catalog missing
  from the file is appended. Restoring a one-playbook backup therefore yields
  four playbooks. Content in those three books is app content, not coach
  content, and edits to them do not survive.
- **Playbook ids must be unique.** A duplicate id makes the whole workspace
  invalid.

`air-raid-sample` (48 plays) is still seeded on PR #9, alongside
`air-raid-reference` (4 verified concepts), so a seeded workspace has five
books.

### 3.3 Plays

| Field | Type | Notes |
| --- | --- | --- |
| `fieldSide` | `"left"` \| `"right"` \| `"none"` | **Always present.** Which sideline the field is on, shown as a `FIELD →` indicator on the canvas and in exports. Any other value fails validation. Never changes geometry. |
| `conceptName` | string | **Always present.** The concept the play teaches; defaults to the play name. |
| `sourceDocumentId` | string \| null | Seeded on reference plays. |
| `sourceCall` | string | The call as printed in the source; defaults to the play name on seeds. |
| `sourceVerified` | boolean | True only on governed catalog plays. |
| `referenceStatus` | string \| null | `"verified-reference"` on governed catalog plays, otherwise null. |

`defenders` may now be an empty array on a seeded reference play (the
normaliser no longer substitutes the base look when the array exists but is
empty). Seeded personnel labels change to `"10 Personnel"` and folders to
teaching groups such as `"Quick Game"`; these are content, not shape.

### 3.4 Players

Offensive players on seeded reference content may carry `sourceLabel`, the
position label the source document used. Optional; absent on coach-authored
players.

### 3.5 Route definitions: alternatives

`definition` gains two **always present** fields on a play's route
assignments (a concept's assignments keep the shape they were captured with):

```json
"alternatives": [
  { "id": "man", "label": "Versus man", "when": "Man coverage",
    "release": "inside", "stemYards": 5,
    "breaks": [{ "direction": "outside", "angle": 90, "distanceYards": 6 }] }
],
"activeAlternativeId": null
```

Up to four alternatives, each a complete release/stem/breaks set with a prose
`when`. `activeAlternativeId` names the alternative whose geometry is
currently generated into `points`, or `null` for the base route; it always
resolves to an entry or is nulled. `condition` still exists for the prose rule.

`evidence` gains `geometryBasis` (known values `source-explicit`,
`diagram-traced`, `neutral-animation`, `existing-diagram`; present on every
non-coach-edited route) and `sourcePositionLabel` (string or null). New
`method` values appear on seeds: `source-explicit`, `diagram-traced`. The
evidence-recompute rule in §2.7 changes: embedded `sourceLabel` / `sourcePage`
now **win** over the play's, and the play's are only a fallback.

### 3.6 Zone definitions: responsibility areas

A defensive `Zone` assignment may carry a coach-drawn responsibility ellipse:

```json
"definition": {
  "area": "flat",
  "landmark": "Outside leverage on X",
  "responsibilityArea": {
    "version": 1, "shape": "ellipse",
    "center": [-19, 4], "radiusX": 6, "radiusY": 5,
    "label": "Flat", "color": "teal"
  }
}
```

- `center` in yards, `radiusX` / `radiusY` positive yards along the lateral and
  depth axes.
- `label`: 1–48 printable characters. `color`: `blue` `teal` `amber` `violet`
  `rose` (the job, not the player).
- Validated *before* normalisation, strictly: only on a defensive `Zone`; the
  assignment id must be unique in the play; `playerId` must match exactly one
  defender. Any failure rejects the whole restore. A format-1 or format-2
  envelope may not contain one at all (§1).
- It is geometry of its own, separate from the assignment's `points` (the drop
  path). Draw both.

### 3.7 What did not change

Coordinates, players, the assignment base fields, `points`, the non-Route
definitions apart from `Zone`, formations, concepts, `importedFrom`, and the
legacy percent-space migration are all as in §2.

## 4. Local storage and game-day state

Not part of the backup, but the same shapes appear in the browser and in the
recovery copy.

| Key | On main | Pending (PR #9) |
| --- | --- | --- |
| Workspace | `football-os.playbooks.v9` | `football-os.playbooks.v11` (reads `v10`…`v5` and `football-os.library.v4` as legacy) |
| Recovery copy | `football-os.recovery.v1` = `{ version, createdAt, workspace }` | same, plus `sourceKey` and `raw` when the replaced data could not be parsed |
| Game-day | `football-os.game-day.v6` | `football-os.game-day.v7` (reads `v6`, `v5`, `v4`) |
| Game-day recovery | — | `football-os.game-day-recovery.v1` = `{ sourceKey, raw, createdAt }` |

**Game-day record, main (v6):**

```json
{ "playbookId": "personal-active", "playId": "mesh-wheel", "snapshot": { "...play" }, "startedAt": "2026-09-24T19:02:11.000Z" }
```

`snapshot` is the play as it was before the temporary change began, so the
change can be discarded. Missing `playbookId` is read as the working playbook.

**Game-day record, pending (v7):** the same fields plus `workspaceVersion: 11`,
stamped on every write. A record with a different `workspaceVersion` is
refused as "unsupported snapshot version". Resolving or discarding writes a
tombstone `{ "resolved": true, "workspaceVersion": 11 }` instead of removing
the key. `playId` must equal `snapshot.id`, and a snapshot with a
responsibility area is only accepted under the v7 key.

## 5. PNG export conventions

### 5.1 On main today

`downloadPlayPng(svg, playName)` in `src/exportUtils.js` rasterises the live
canvas `<svg>` for the current play and downloads it as
`<safe-play-name>.png`, where the name is lower-cased, every run of characters
outside `a-z0-9` becomes `-`, leading/trailing `-` are trimmed, and an empty
result falls back to `play`. (`Mesh Wheel` → `mesh-wheel.png`; `93 H (Ace)` →
`93-h-ace.png`.)

**Scale: 26 px per yard**, both axes, always. The canvas draws both axes on one
scale and the export inherits that, so a lateral yard and a vertical yard are
the same number of pixels and the image is never stretched. Token sizes and
stroke widths are whatever the canvas was drawing at the moment of export.

**Framing: the viewBox is read, not assumed.** The export reads the `viewBox`
attribute off the live SVG (falling back to `0 0 100 100` only if it is
missing) and sets the PNG size to:

```
width  = round(viewBox.width  × 26)
height = round(viewBox.height × 26)
```

The viewBox is in SVG user units, which on this canvas **are yards**
(`fieldProjection` in `src/fieldView.js`), so the PNG is literally the visible
field at 26 px/yd. What is visible depends on the state of the canvas:

| Canvas state | Window in yards | Typical PNG |
| --- | --- | --- |
| Desktop / iPad, End Zone view, unzoomed | fixed: 53.3 wide × 46 deep (8 yd behind the LOS, 38 downfield), extended along the looser axis to match the viewport's aspect | ≈ 1386 × 1196 when the viewport is nearly square; wider or taller otherwise |
| Sideline view, presentation mode, or a canvas narrower than 700 px | fitted to the play: its bounding box (players and every assignment point, always including the LOS) plus 4 yd padding, never smaller than 34 × 26 yd | varies per play |
| Zoomed (wheel / pinch) | the zoomed window, clamped inside the base framing | smaller |

Orientation follows the view. End Zone: screen x = field x, screen y = −field y
(offence moves up). Sideline: screen x = field y, screen y = field x. The LOS
is at user-space `0` on the depth axis in both.

Consequences a consumer should expect:

- Two exports of the same play from different window sizes can differ in
  pixel dimensions, because the loose axis shows more field rather than
  letterboxing. They share the same scale.
- A zoomed export crops. There is no "export whole play" option separate from
  what is on screen.
- Nothing in the PNG encodes the scale or the origin. Anyone placing the image
  on a field of their own needs the play JSON beside it.

**Rendering.**

1. The SVG is deep-cloned; for every element the computed values of
   `fill`, `fill-opacity`, `stroke`, `stroke-width`, `stroke-dasharray`,
   `stroke-linecap`, `stroke-linejoin`, `stroke-opacity`, `opacity`,
   `font-family`, `font-size`, `font-weight`, `text-anchor` are inlined as
   `style`, because a serialised SVG loses the page's stylesheet.
2. A `<rect>` covering the viewBox with fill `#12352c` is inserted first, and
   the 2D canvas is pre-filled with the same colour, so the PNG has an opaque
   field-green background rather than transparency.
3. `xmlns`, `width`, `height` are set; the markup is serialised, loaded into an
   `Image`, drawn onto a `<canvas>` of the computed size, and encoded with
   `canvas.toBlob(..., "image/png")`. No embedded metadata, no DPI hint.
4. Fonts are whatever the browser resolves for the inlined `font-family`; the
   app ships Manrope, and the export renders in the same document so it is
   available.

Playback state is whatever the DOM holds when the button is pressed.

### 5.2 Pending, PR #9

PR #9 replaces the yard-based scale with a pixel-based one and stops
exporting the live canvas:

- **The export renders an off-screen copy**, not the editor's SVG: a hidden
  `LessonExport` container mounts a clean `PlayCanvas` (`clean`, `framePlay`,
  no zoom, idle playback) for the current play, waits for it to be ready, and
  rasterises that. The editor's zoom and window never affect the PNG.
- **Two formats.** *Wide* is 1200 px wide with an 800 px field; *phone* is
  390 px wide with a 480 px field, larger labels, and the file name suffixed
  ` phone` (`mesh-wheel-phone.png`). Under the *Diagram* background the field
  height is fitted to the play instead (`fittedOutputHeight`, aspect clamped
  to 0.5–1.5).
- **A responsibility legend** is appended below the field when the play has
  responsibility areas and the defence and assignment layers are visible; its
  height is added to the container.
- **Scale is `2 × measured CSS pixels`** of that container, not 26 px/yd:
  `width = round(measured.width × 2)`, so a wide export is 2400 px across and
  a phone export 780 px. The number of pixels per yard therefore varies with
  the play's fitted framing. An unmeasurable (zero-size) container throws
  "The export canvas is not ready."
- The viewBox is still read from the rendered SVG and still used for the
  background rect, so the image is still yard-true within itself; only the
  absolute scale changed.
- Three more computed properties are inlined (`vector-effect`, `display`,
  `visibility`), and `url("…#id")` references in them are rewritten to plain
  `url(#id)` so gradients and markers survive serialisation.
- The `fieldSide` indicator (`FIELD →`) is drawn when the play sets one.

## 6. There is no single-play export

Today the only JSON Football OS writes is the whole workspace. If a
single-play file is ever wanted, the natural design and what it would need
are recorded here so the question is not re-derived from scratch. **Nothing
in this section exists in the code, and nothing here is agreed with any other
application.** Whether Team Hub's Phase 4 uses this, something else, or
nothing, is a separate decision.

A single-play file would be a sibling envelope:

```json
{
  "format": "football-os-play",
  "formatVersion": 1,
  "exportedAt": "…",
  "workspaceVersion": 9,
  "playbook": { "id": "personal-active", "name": "Personal Active", "source": "personal" },
  "play": { "…": "one play exactly as in §2.4 (or §3.3 after PR #9)" },
  "concept": null,
  "png": null
}
```

What it has to carry that a bare play does not:

1. **A distinct `format` discriminator** (`football-os-play`), so
   `parseWorkspaceBackup` keeps refusing it and a play importer can be strict.
2. **`workspaceVersion`**, so the importer knows which play shape it is
   reading; the play would go through `normalizePlay` on import exactly as a
   backup does. After PR #9, a play carrying a responsibility area would also
   need the same before-normalise validation the backup gets.
3. **Playbook identity** (`id`, `name`, `source`), because a play's `id` is
   unique only within its playbook, and because a source-book play should
   arrive still labelled with its source.
4. **The referenced concept**, inline, when `conceptTemplateId` is set:
   the id points into the origin playbook's `concepts`, which the file does
   not otherwise contain. Alternatively null the id on export and accept that
   the imported play forgets its lineage.
5. **A decision on `variantOf`.** Either null it (the imported play is
   standalone) or inline the source play too. Nulling is simpler and matches
   how copy-into-Personal-Active already behaves.
6. **The formation, or explicitly not.** `play.players` is already a full copy
   of the alignment, so a formation object is not required to render or
   restore the play. A formation is only needed to offer "save as formation".
7. **An optional PNG**, base64 or a sidecar, plus the framing it was taken
   with (`viewBox` in yards and the scale), if the image is to be placed on
   another field. Without that record a PNG cannot be located (§5).
8. **Import rules on the Football OS side**: the same ones "Add this play to
   Personal Active" follows today — a fresh id, a name made unique within the
   book, `variantOf` nulled, an `importedFrom` record (§2.4), always into the
   working playbook, never overwriting by id, and football legality shown as
   a draft label rather than refused.

Nothing in this list needs a new coordinate system or a new assignment shape;
§2 and §3 already hold everything needed to draw and edit the play. The work
is the envelope, the two lineage decisions (4, 5), an importer, and the
decision of whether to build it at all.
