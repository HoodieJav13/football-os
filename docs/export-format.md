# Football OS export formats

This is the contract for everything Football OS writes out of the browser: the
`.footballos` workspace backup and the per-play PNG. It is written for a
consumer that does not run Football OS code — the sibling app Team Hub
([HoodieJav13/CoachOS2.0](https://github.com/HoodieJav13/CoachOS2.0)) reads
the backup in its Phase 4 "Published Play System" — so it describes the bytes on
disk, not the React state behind them.

Two files sit beside this page and are checked in CI against real output of
`createWorkspaceBackup`:

| File | Purpose |
| --- | --- |
| [`export-format.schema.json`](export-format.schema.json) | JSON Schema (draft 2020-12) for the backup envelope |
| [`export-format.example.json`](export-format.example.json) | A minimal, complete, restorable backup showing every assignment type |

`tests/export-format.test.mjs` validates the seeded workspace's backup, a
coach-authored workspace covering every assignment type and a concept, and the
example file against the schema, then restores the example and re-exports it
to prove the normaliser leaves it byte-for-byte alone. The validator is
hand-written (`tests/json-schema-validator.mjs`); it implements only the
keywords the schema uses and the test asserts that set is complete.

Source of truth in code: `src/workspaceData.js` (envelope, workspace
validation, migration), `src/playData.js` (`normalizePlay`, the assignment
vocabulary, the field model), `src/exportUtils.js` (PNG).

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
| `formatVersion` | `2` | Envelope version. `1` wrapped a version 5–8 workspace and is still accepted on import; this document describes `2` only. |
| `exportedAt` | ISO 8601 date-time string | `new Date().toISOString()` at export. Informational; the app does not order or dedupe by it. |
| `workspace` | object | The workspace, already normalised (§2). |

There is no checksum, signature, compression, or size limit. The seeded
workspace (four playbooks, 66 plays) serialises to roughly 250 KB; a coach's
own book is smaller. Every value is plain JSON: no `NaN`, no `Infinity`, no
`undefined` (they cannot survive `JSON.stringify`).

### Versioning rules

- `formatVersion` moves when the envelope changes; `workspace.version` moves
  when the stored workspace shape changes. They are independent numbers.
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

### How the app restores one

`parseWorkspaceBackup(text)` in `src/workspaceData.js`:

1. `JSON.parse`; a syntax error is "not valid JSON".
2. `format` must equal `football-os-workspace`.
3. `formatVersion` must be `1` or `2`.
4. `normalizeWorkspace(parsed.workspace)` must return a workspace, otherwise
   "incomplete or contains invalid play data". This is a structural check
   (§2.6), not a football-legality check: a play with nine offensive players
   restores fine and is shown as a draft.
5. The coach confirms in a dialog. On confirmation the workspace being
   replaced is written to `localStorage["football-os.recovery.v1"]` as
   `{ version: 9, createdAt, workspace }` before the restored one is adopted.

Restoring is whole-workspace replacement. There is no merge and no per-play
import yet (see §4).

## 2. Workspace schema, version 9

Everything below is what `normalizeWorkspace` emits. The same object is what
the app stores in `localStorage["football-os.playbooks.v9"]`, so a backup is
the persisted workspace with an envelope around it.

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
transcriptions in the app, but nothing in the file marks them read-only:
`isMain` is the only distinction. If either id fails to resolve on import, the
normaliser silently falls back to the first playbook.

### 2.3 Playbook

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Unique within the workspace. |
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
  values the app writes today are `existing-diagram`, `diagram-geometry`,
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
missing definitions are filled with defaults, a play with no `players` gets the base
Trips Right Open alignment, and a play with no `defenders` gets the base 4-3
look. Football legality (eleven players, seven on the line) is **not** checked
on import.

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

- **Temporary game-day changes.** They live in
  `localStorage["football-os.game-day.v6"]` until the coach resolves them into
  a permanent outcome, and are not exported.
- Selection, zoom, the active view (End Zone / Sideline), presentation mode,
  playback state, undo history, and the offline-cache status.
- Play thumbnails and PNGs. Thumbnails are generated from play data on the fly.
- Any user identity. The file has no author field.

## 3. PNG export conventions

`downloadPlayPng(svg, playName)` in `src/exportUtils.js` rasterises the live
canvas `<svg>` for the current play and downloads it as
`<safe-play-name>.png`, where the name is lower-cased, every run of characters
outside `a-z0-9` becomes `-`, leading/trailing `-` are trimmed, and an empty
result falls back to `play`. (`Mesh Wheel` → `mesh-wheel.png`; `93 H (Ace)` →
`93-h-ace.png`.)

### Scale

**26 px per yard**, both axes, always. The canvas draws both axes on one scale
and the export inherits that, so a lateral yard and a vertical yard are the
same number of pixels and the image is never stretched. Token sizes and stroke
widths are whatever the canvas was drawing at the moment of export.

### Framing: the viewBox is read, not assumed

The export does not compute its own framing. It reads the `viewBox` attribute
off the live SVG (falling back to `0 0 100 100` only if it is missing) and
sets the PNG size to:

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
- Nothing in the PNG encodes the scale or the origin. If Team Hub needs to
  place the image on a field, keep the play JSON beside it (§4).

### Rendering

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

Playback state is whatever the DOM holds when the button is pressed. The app
exports from an idle canvas in practice; a consumer should not rely on the PNG
showing a particular moment of the animation.

## 4. There is no single-play export yet

Today the only JSON Football OS writes is the whole workspace. Team Hub's
"Published Play System" wants one play at a time. The natural design, and
what it would need, is recorded here so the two apps agree before either
builds it; **nothing in this section exists in the code.**

A single-play file would be a sibling envelope:

```json
{
  "format": "football-os-play",
  "formatVersion": 1,
  "exportedAt": "…",
  "workspaceVersion": 9,
  "playbook": { "id": "personal-active", "name": "Personal Active", "source": "personal" },
  "play": { "…": "one play exactly as in §2.4" },
  "concept": null,
  "png": null
}
```

What it has to carry that a bare play does not:

1. **A distinct `format` discriminator** (`football-os-play`), so
   `parseWorkspaceBackup` keeps refusing it and a play importer can be strict.
2. **`workspaceVersion`**, so the importer knows which play shape it is
   reading; the play would go through `normalizePlay` on import exactly as a
   backup does.
3. **Playbook identity** (`id`, `name`, `source`), because a play's `id` is
   unique only within its playbook, and because a source-book play should
   arrive in Team Hub still labelled with its source.
4. **The referenced concept**, inline, when `conceptTemplateId` is set:
   the id points into the origin playbook's `concepts`, which the file does
   not otherwise contain. Alternatively null the id on export and accept that
   the imported play forgets its lineage.
5. **A decision on `variantOf`.** Either null it (the imported play is
   standalone) or inline the source play too. Nulling is simpler and matches
   how copy-into-Personal-Active already behaves.
6. **The formation, or explicitly not.** `play.players` is already a full copy
   of the alignment, so a formation object is not required to render or
   restore the play. Team Hub only needs one if it wants to offer "save as
   formation".
7. **An optional PNG**, base64 or a sidecar, plus the framing it was taken
   with (`viewBox` in yards, px/yd), if Team Hub wants to place the image on
   its own field. Without that record a PNG cannot be located (§3).
8. **Import rules on the Football OS side**: the same ones "Add this play to
   Personal Active" follows today — a fresh id, a name made unique within the
   book, `variantOf` nulled, an `importedFrom` record (§2.4), always into the
   working playbook, never overwriting by id, and football legality shown as
   a draft label rather than refused.

Nothing in this list needs a new coordinate system or a new assignment shape;
§2 already holds everything needed to draw and edit the play. The work is the
envelope, the two lineage decisions (4, 5), and an importer.
