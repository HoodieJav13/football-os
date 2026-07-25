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
