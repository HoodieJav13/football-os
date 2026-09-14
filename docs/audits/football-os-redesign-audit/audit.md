# Football OS redesign audit

## Outcome to optimize

An iPad-first coach should be able to open a related play, understand the formation immediately, draw or refine an assignment with one hand or Apple Pencil, and run the play without the interface competing with the field.

## Core diagnosis

The prototype contains the right workflow ingredients, but presents them with the visual language of a dark sports dashboard. The field is visually muddy, the floating route inspector and tool dock cover important canvas space, and the top bar gives secondary controls nearly the same prominence as the play itself. The result feels busy before the coach has taken an action.

## Reference-grounded changes

| Before | After |
| --- | --- |
| Dark, textured field plus glow effects make routes compete with the background. | Use a bright, diagram-first field with quiet markings and high-contrast assignment ink. |
| Permanent left thumbnail rail consumes width but exposes little useful metadata. | Use a collapsible play-family browser or compact filmstrip that preserves swipe context. |
| Route inspector floats over the right third of the field. | Place contextual editing in a bottom sheet, slim edge inspector, or anchored popover that avoids the active route. |
| Seven large tool buttons form a second visual focal point. | Keep four primary drawing actions visible; move assignment variants into contextual controls. |
| Top bar mixes identity, metadata, offline state, view switching, presentation, overflow, and playback. | Separate play identity from mode controls; give Run one unmistakable action and demote system status. |
| Neon green is used for selection, branding, save state, active tools, and primary actions. | Reserve one restrained accent for selection and Run; use neutral states elsewhere. |
| Condensed display typography suggests a scoreboard. | Use a crisp system/UI sans with a small, repeatable hierarchy suited to an iPad productivity tool. |
| Most chrome is boxed with hard borders. | Use tonal surfaces, thin dividers, and restrained elevation only where layers overlap. |
| Controls are visually dense despite adequate raw hit sizes. | Keep 44x44 minimum touch targets while simplifying visible icon and label weight. |
| Presentation is an edited version of the same chrome-heavy screen. | Make presentation a field-first state with minimal play identity and playback controls. |

## Reference principles retained

- GoArmy EDGE: a clean end-zone field, direct manipulation, and an explicit playback timeline.
- Concepts: a canvas-first workspace with compact tools and contextual control placement.
- CHLK: football-native formation setup, fast route drawing, and iPad-specific interaction.

## Skill compatibility decisions

- **Better UI / Colors / Typography:** directly applicable to touch targets, visual hierarchy, palette, surfaces, and type scale.
- **Elaya redesign:** useful for diagnosis and preserving the existing React stack, but its marketing-page navigation patterns are not applicable.
- **Taste:** useful only as an anti-generic critic; its AIDA, long-scroll, and cinematic marketing defaults are incompatible with a play editor.
- **Evidence-gated delivery:** remains the quality gate after a direction is selected and implemented.

## Non-negotiable product constraints for the next direction

- Landscape iPad first.
- End-zone view with offense moving upward; sideline view remains available.
- Player labels X, Y, F, Z, Q, H; numbers optional.
- Related plays remain one swipe away.
- Offense and defense layers can be hidden independently.
- Automatic animation timing with optional per-player delay.
- Downloaded game-plan collections and temporary game-day variations remain visible concepts without dominating the editor.
- All primary touch controls have at least a 44x44 hit area.

## Concept review

| Direction | Strongest quality | Principal tradeoff |
| --- | --- | --- |
| Coach's Drafting Table | Best balance of calm canvas, quick family browsing, and low learning curve. | The permanent filmstrip still consumes some canvas width. |
| Field Focus | Strongest dedicated editing and animation model; timeline and inspector are explicit. | The horizontal variation strip consumes vertical field space. |
| Split Workbench | Strongest playbook navigation and structured football metadata. | The field is smallest of the three directions. |
