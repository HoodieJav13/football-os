# Responsibility-area visual follow-up

September 22, 2026. Approved bounded visual change; local only. No geometry or
storage-schema changes, KB edits, print checks, push or deployment.

Area-owning defenders use their palette color for fill/outline and their drop
path/arrowhead. Unowned defenders keep the flat style. Selected area paths retain
the ownership color with heavier stroke. Existing bubble tags and C·1/C·2 keys
are unchanged. Offense dimming now also dims the separately rendered player text.

**Export phone PNG** adds a separate 390×726 CSS-pixel portrait layout for this
seven-area lesson, rasterized at 780×1452. Its field is 480px tall; the legend
height is measured from its content. Area-owner tokens use readable bounded sizes
and the legend is one column at 14px. Wide export remains available unchanged in
size. Both use the selected orientation and layers; format and dimming stay
outside saved play data. The review uses the existing Dim offense control.

Verification: 143 unit tests pass, production/Sites build passes, six affected
browser tests pass. New regressions first failed on gray ownership and the absent
phone option, then passed. Checks cover color/arrowhead matching, live palette
changes, removal fallback, selection, drag history/cancellation, actual phone PNG,
legend size and exact unchanged saved play. No print checks run. Vite's existing
large-chunk advisory remains (510.11 kB minified / 146.94 kB gzip).

Actual downloaded PNG inspected at 390px portrait width: blue C·1 and teal B are
visually distinct, ownership tags remain, and all seven legend entries are
readable without zoom. This is Chrome viewport emulation, not physical-phone or
coach acceptance. The remaining owner check is whether B still seems to label C·1.
No tag restyling was introduced.

- [Phone review PNG](/Users/jav/Projects/coaching/responsibility-area-review-2026-09-22/visual-phone/cover3-review.png)
- [Wide review PNG](/Users/jav/Projects/coaching/responsibility-area-review-2026-09-22/visual-phone/cover3-wide.png)
- [Editable backup](/Users/jav/Projects/coaching/responsibility-area-review-2026-09-22/visual-phone/cover3-review.footballos)
- [390px view capture](/Users/jav/Projects/coaching/responsibility-area-review-2026-09-22/visual-phone/phone-fit.png)

Saved play: `cover3-462e344f-a3d9-476b-9447-b04797fba80f`.
Backup SHA-256: `9eb1f9f9de5ea751fe53e0a9aef45b15f163e4ec2f20f08baba1771f03e5630e`.
The exported workspace exactly equals the B/A review workspace, including every
coordinate. Backup timestamp/hash changed during regeneration; no view settings
were persisted. Raw checks are saved beside the artifacts.
