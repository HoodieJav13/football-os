# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Durable product design decisions

- The selected editor direction is `option-2-field-focus.png` from the Football OS redesign audit.
- Preserve its layout anatomy: horizontal play-family filmstrip, left edge tool rail, right edge route inspector, and bottom playback timeline.
- Use a refined dark-mode theme derived from the original Football OS drafts. Avoid neon, glow-heavy game HUD styling, photographic turf, scoreboard typography, and floating controls that cover active routes.
- The canvas must remain the dominant region. End Zone is the default view with the offense moving upward; Sideline remains available.
- Touch targets are at least 44 by 44 CSS pixels. Phone support prioritizes viewing and quick adjustments over full editing parity.
- Functional coaching behavior must be real before visual polish: route presets change route geometry, per-player pace is stored on each route, drawn routes persist, temporary game-day changes can be resolved into permanent outcomes, and play thumbnails are generated from each play's actual data.
- The authoring loop supports one pre-snap slot and one post-snap slot per offensive player. Motion occupies the pre-snap slot; route or block occupies the post-snap slot. Defense currently uses one post-snap assignment slot per player.
- A receiver route is structured football data, not just a preset name or arbitrary polyline. Its core definition is release/stem leverage (`inside`, `outside`, `best`, or `none`), stem depth in yards, and one or more break segments with direction, angle, and distance. Double moves are represented as additional ordered break/stem segments. The visible path is generated from this definition, while manual landmarks remain an optional override.
- Route information imported from playbooks must retain its source evidence and confidence. Explicit labels such as `5 YDS`, `12 YDS`, `O/S REL.`, or `SET ANGLE` outrank geometric inference; conditional rules such as man/zone conversions must remain conditions instead of being collapsed into one deterministic path.
- A play can exist temporarily with an illegal alignment only as a clearly labeled draft. Creating a play and explicitly saving play details or a reusable formation require a named, legal 11-player formation; jersey-number legality is not part of this rule.
- Reusable formations store the offensive player labels and alignment, not play assignments. A play created from a formation receives an independent copy that can be edited without changing the saved formation.
- Undo and redo history is scoped to the current play and current editing session. It must never carry an edit across plays or playbooks.
- Treat Personal Active as the user's main working playbook. External source playbooks stay separate, preserve their source terminology and page references, and allow an individual play to be copied into Personal Active as an independent editable play.
- The next visual pass must directly resolve the three audited failures: replace the muddy photographic field with a crisp tactical work surface, make the play browser genuinely useful, and create clear hierarchy across the field, inspector, tools, and timeline without changing the selected Field Focus anatomy.
- The complete core designer assignment vocabulary is offense (`Route`, `Block`, `Motion`) and defense (`Rush`, `Man`, `Zone`, `Fit`). These are structured assignment objects with assignment-specific definitions and generated field geometry, not merely differently styled generic lines.
- Defensive players have stable internal identities that are separate from their visible labels. This is required because multiple defenders can share labels such as `C`, `T`, or `E` without assignments or selections colliding.
- Offense, defense, and assignments are independent canvas layers. Offense and defense can each be shown, hidden, dimmed, or locked; assignments can be shown or hidden. A locked unit remains visible but cannot be moved, relabeled, removed, or have its assignments edited.
- Assignment timing is stored per player as a start delay relative to the snap plus a pace multiplier. Motions default to a pre-snap start; other assignments default to the snap. The animation must honor both values without implying collision or reactive simulation.
- Reusable concepts store assignment stages by stable position label. Applying a concept translates its landmarks to the play's matching position locations. Explicit play-level assignment edits are overrides and must survive a later reapplication of the same concept.
- Production offline status may say `Offline ready` only after the service worker has primed a same-origin application cache. Development/localStorage persistence alone must not be presented as game-day offline readiness.
- Workspace persistence is versioned and migratable. Backup export includes every playbook, play, formation, and concept in a validated `.footballos` envelope; restore requires validation and explicit confirmation, and keeps the replaced workspace as a local recovery copy.
- Coach-facing exports are a clean PNG of the current play and a collection preview that uses the system Print / Save PDF flow. The printable collection follows the active folder/search result when one is present.
- Applying a saved formation translates assignments for matching offensive position labels, removes offensive assignments whose positions no longer exist, preserves the opponent look and defensive assignments, and remains undoable within the current play session.
- Duplicate-as-variation creates an independent editable play linked to the source through `variantOf`; later edits to either play do not silently change the other.
- Play browsing supports folders plus search across play name, family, formation, personnel, protection, and blocking scheme. Swiping the blank field advances within the currently filtered result set so browsing context is preserved.
- On phones, the play browser and canvas layers are compact 44–48px controls that open into temporary panels. They must not permanently consume field height. End Zone/Sideline switching lives inside the mobile Layers panel rather than floating over the canvas.
- The player inspector uses progressive disclosure: player identity, assignment stage, position label, and assignment type are primary; timing, football-specific definition details, and player actions are named expandable sections. On phones it behaves as a two-height bottom sheet with a compact coaching summary and an explicit expanded editing state.
