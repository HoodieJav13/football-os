# Football OS route and play-language audit

Date: 2026-07-22
Viewport: 1194 × 834
Surface: iPad-first play editor
User goal: create, browse, teach, animate, and revise plays using the coach's real football language.

## Overall verdict

The interface shell is materially improved, but the football semantics are not yet credible. The current six-play library is demo scaffolding: its names imply real concepts while its diagrams do not consistently execute those concepts. The next build should prioritize football truth, route-authoring quality, and the user's terminology before expanding the feature set.

## Step 1 — Browse the play family

Health: structurally good; football content weak.

Evidence: `01-current-editor.png`

Strengths:

- Six variations remain visible and swipeable in one context.
- The selected play, field, inspector, and playback controls have a clear hierarchy.
- Offline status and field-view controls are easy to find.

Risks:

- Every example is hard-coded into a generic Mesh family.
- Names such as Mesh Stick, Mesh Sit, Mesh Choice, Mesh Corner, and Mesh Wheel imply concept relationships that the routes do not substantiate.
- The browser needs to show the coach's full call and structured football categories, not invented demo labels.

Accessibility notes:

- Selected state, button names, and touch-target sizing are generally clear in the captured state.
- The thumbnails are visually dense and do not have route-specific text alternatives beyond their play names.

## Step 2 — Inspect a named play

Health: interaction works; route model is not football-accurate enough.

Evidence: `02-mesh-play.png`

Strengths:

- Selecting a play updates the canvas and inspector.
- Routes are structured objects rather than a flattened image.
- A selected player and assignment are visually obvious.

Risks:

- The play named Mesh does not show the defining paired shallow crossers; the visible assignments are generic Go, Out, and Post-style paths.
- Route presets are percentages on the canvas rather than football landmarks measured from the line of scrimmage.
- Player movement uses one fixed duration plus a per-player delay. This changes launch time, not player pace.
- The current legal-formation check only counts seven on the line and four in the backfield. It does not yet reason about eligible receivers, covered/uncovered players, or formation-specific legality.

Accessibility notes:

- Inspector controls have semantic button labels and visible selection states.
- Animation still needs reduced-motion handling and non-motion state communication before accessibility can be considered complete.

## Highest-impact recommendations

1. Replace the demo library with a football truth set supplied by the coach: one exact formation and five representative plays with full calls, position assignments, routes, and line calls.
2. Split play identity into `full call`, `short display name`, `family/concept`, `variation`, `formation`, `personnel`, and structured terminology such as OL assignment/protection.
3. Rebuild route presets around depth and landmarks: stem depth, break depth, break direction, endpoint, and optional smoothing. A player's route must remain anchored to that player.
4. Replace visible Delay with per-player Pace. Pace should control travel speed; global playback speed should remain a separate presentation control.
5. Keep sequencing as a separate concept: pre-snap motion, snap, and post-snap assignment phase. Add an explicit release/hold control later only if real plays require it.
6. Upgrade formation legality after the first truth set exposes the rules that matter to the coach's system.
7. Only after the editor is football-accurate, expand folders, filters, downloaded game-plan collections, offense/defense layers, and export.

## Recommended pace model

- UI: Slow / Normal / Fast with optional numeric refinement later.
- Data: a `pace` multiplier per assignment, default `1.0`.
- Playback: duration is derived from actual path length divided by base movement speed and the player's pace multiplier.
- Global speed: 0.5× / 1× / 1.5× remains a presentation-only multiplier.
- Future refinement: pace per route segment, useful for tempo changes before and after a break, is deferred.

## Evidence limits

- This review verifies the visible editor structure and current implementation data. It does not validate the plays against the coach's actual playbook because that source material has not yet been provided.
- Screenshots cannot establish full keyboard, screen-reader, or reduced-motion compliance.
- Browser QA found no console errors, four visible routes on Mesh, six play cards, and no horizontal overflow at 1194 × 834.
