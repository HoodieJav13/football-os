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

## Keyboard

| Key | Action |
| --- | --- |
| `Tab` | Step through the controls, then every player on the field |
| `Enter` / `Space` | Select the focused player and open its inspector |
| `1`–`5` | Select the Select, Route, Block, Motion or Defense tool |
| `Ctrl`/`Cmd` + `Z` | Undo |
| `Ctrl`/`Cmd` + `Shift` + `Z` | Redo |
| Arrow keys | Nudge the selected player by 0.25 yd (hold `Shift` for 1 yd) |
| `Delete` | Remove the selected assignment |
| `Space` | Run, pause or resume the animation |
| `[` / `]` | Previous or next play in the current filter |
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
npm run test:unit
npm run test:sites
npm run build
```
