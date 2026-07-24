# Football OS — Dark Field Focus implementation spec

## Source of truth

- Selected visual: `../football-os-redesign-audit/option-2-field-focus.png`
- Approved modification: apply the dark theme character from the original Football OS drafts while preserving the selected visual's layout and interaction model.

## Visible copy inventory

- Mesh Family
- Mesh Wheel
- 11 Personnel
- Trips Right Open
- Saved offline
- End Zone
- Sideline
- Present
- Run / Pause
- Mesh, Mesh Stick, Mesh Sit, Mesh Choice, Mesh Corner, Mesh Wheel
- Select, Route, Block, Motion, More
- Route, Z Route, Active, Assignment, Type, Route Details, Delay, Route Presets, Go, Post, Corner, Dig, Out, Advanced Options
- Motion, Snap, Routes, 1.00x

## Layout inventory

- Top command bar: 76 px desktop/tablet.
- Horizontal family filmstrip: 124 px, six equal items, swipeable at narrow widths.
- Left tool rail: 92 px desktop/tablet with five 56 px controls.
- Right inspector: 248 px desktop/tablet; collapses into a bottom sheet on phone widths.
- Bottom timeline: 76 px desktop/tablet; compact transport controls on phone widths.
- Remaining center area is the field canvas and must remain the dominant visual region.

## Color system

- Background: near-black neutral.
- Chrome: charcoal surfaces in three perceptual lightness steps.
- Canvas: deep desaturated green-black with restrained field markings.
- Text: high-contrast white, mid-gray secondary, low-gray tertiary.
- Accent: one amber family for selected routes and timing. Run uses the same amber family rather than a competing neon green.
- Semantic success: reserved muted green only for saved/offline confirmation.
- All new colors are expressed in OKLCH variables.

## Typography

- One interface family: Manrope with system sans fallbacks.
- Weights: 400, 500, 600, 700 only.
- Scale: 12, 14, 16, 20, 24 px.
- Tabular figures for delay, timeline, and playback speed.
- No condensed scoreboard display type.

## Icons

- Reuse the installed Phosphor icon set.
- Outline icons at regular weight for default state; duotone or fill only for active transport state.
- 20–22 px optical size within at least 44 px hit targets.

## Core interactions

- Choose related plays from the horizontal filmstrip.
- Switch End Zone / Sideline view.
- Toggle Present mode.
- Run, pause, restart playback and adjust playback speed.
- Select drawing tools; draw a new route with pointer or touch.
- Select a route or player; change route preset and per-player delay.
- Hide/show the route inspector without obscuring the selected route.
- Open More to access Game Day Adjust and Play details.
- Resolve a temporary game-day adjustment as discard, replace, variation, or new play.

## Responsive behavior

- Landscape iPad is the fidelity target at 1194 by 834 CSS pixels.
- Narrow tablet preserves the filmstrip and tool rail while reducing metadata.
- Phone becomes a view-first layout: filmstrip scrolls, tools move to a compact bottom row, and the inspector becomes a dismissible sheet.

## Intentional deviations from the light concept

- Dark theme requested by the user.
- Dark field rather than the concept's pale gray field.
- Amber replaces the concept's blue outline accent to retain one focused accent family.
- Existing game-day resolution flow remains available through More because it is a locked product requirement.
