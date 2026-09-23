# Football OS

Football OS is an iPad-first football play designer and coach-facing playbook workspace. It is built for fast drawing, structured assignments, deterministic animation, and fluid game-day browsing.

## Current capabilities

- End-zone and regular field views
- Offensive and defensive formations with legal-formation checks
- Routes, motions, blocking, rush, coverage, man, and run-fit assignments
- Separate pre-snap and post-snap assignment stages
- Automatic animation timing with per-player pace and delay
- Reusable formations and concept templates with play-level overrides
- Multiple playbooks, folders, filters, variations, and game-plan collections
- Temporary game-day changes that can be promoted into permanent plays
- Production offline copy for game-day use
- Restorable workspace backup, current-play PNG export, and printable PDF collections

All playbook data is stored locally in the browser in this release. Download a Football OS backup regularly if the browser profile or device may be cleared.

## Field model

Every coordinate is stored in yards: `x` is yards right of the field's centre
line and `y` is yards downfield of the line of scrimmage, so a route's stem depth
and its `y` coordinate are the same number. The canvas draws both axes on one
scale, in a fixed window anchored on the line of scrimmage, so every play in a
playbook renders at the same scale and is directly comparable.

## Source playbooks

Personal Active is the working playbook. Three governed reference books provide
source-labelled plays: Air Raid Reference (4), LSU 2019 Reference (7), and Texas
Tech Reference (4). They remain read-only; **Add to Active** makes an editable copy.
The separate Air Raid Passing Game import (48 plays) is also retained. Its
route vocabulary uses printed call names with conventional, not measured, depths.
Assignment evidence distinguishes source labels, diagram traces and neutral
animation geometry. Existing personal edits survive migration.

## Responsibility areas and teaching

Select a defender's Zone assignment and choose **Add responsibility area**.
Edit the ellipse's label, color, width, height or field position. **Edit area**
exposes move/resize handles; arrow keys nudge the area, Escape cancels a drag,
and Delete removes only the area while that mode is active. Phone controls
support label, size, color and directional adjustments.

Areas stay in field coordinates when players move or paths mirror. Copies have
independent geometry and show a reminder to adjust it. Duplicate position labels
receive ownership keys such as C·1 and C·2. Areas follow both defense and
assignment visibility, and defense dimming/locking. Ambiguous concept transfers
are rejected before changing the play.

**More → Add Cover 3 teaching example** adds a generic editable lesson to Personal
Active, with W and M hook defenders. Nothing is auto-added on upgrade. See the
[lesson guide](docs/cover3-lesson-guide.md) for the revision exercise and coaching
prompts. Presentation, PNG and print fit the complete diagram and include a
wrapping keyed legend. Area-owning defenders and their drop paths match the area color. **Export phone PNG** uses a portrait layout with larger defender labels and a single-column legend. Offense dimming remains a view control. PNG/print omit editor selection, handles and animation.

Storage uses workspace v11, backup v3 and game-day v7. Damaged saved data enters
read-only recovery; successful restore preserves the original raw data before
replacement. Downloaded backups remain the portable recovery method.

## Keyboard

| Key | Action |
| --- | --- |
| `Tab` | Step through the controls, then every player on the field |
| `Enter` | Select the focused player and open its inspector |
| `1`–`5` | Select the Select, Route, Block, Motion or Defense tool |
| `Ctrl`/`Cmd` + `Z` | Undo |
| `Ctrl`/`Cmd` + `Shift` + `Z` | Redo |
| Arrow keys | Nudge the selected player by 0.25 yd (hold `Shift` for 1 yd) |
| `Delete` | Remove the selected assignment |
| `Space` | Run, pause or resume the animation |
| Timeline arrows | With the track focused, step the playhead 0.1s (`Shift` for 0.5s); `Home`/`End` jump |
| `[` / `]` | Previous or next play in the current filter |
| `Alt` + drag | Place a player freely, ignoring the alignment magnets |
| Wheel / pinch | Zoom the field about the cursor or the fingers; drag empty grass to pan |
| `Escape` | Drop the drawing tool, leave presentation, then clear the selection |

Dialogs close on `Escape` or a click outside, and keep keyboard focus inside
while they are open.

## Run locally

```bash
npm install
npm run dev
```

For a production-style offline test:

```bash
npm run build
npm run preview
```

## Verify

```bash
npm run test:unit      # football model, projection, workspace migration
npm run test:sites     # the Sites worker handoff
npm run test:browser   # the real app in a browser (build first)
npm test               # all of the above, in order
```

The browser suite is the only check that can see a blank screen — see
[`tests/browser/README.md`](tests/browser/README.md) for what it caught that
the unit tests and the build did not.
