# How to use the Practice Week Planner (FICTIONAL prototype)

Everything in this planner is fictional sample data. It runs locally, needs
no install, sends nothing over the network and keeps its data in this
browser's local storage.

## Run it

```bash
cd /Users/jav/Projects/coaching/practice-week-planner-20261015-e2a7a1
node server.mjs
```

Then open http://127.0.0.1:4867/ in a browser. The server binds 127.0.0.1
only and serves just `index.html`, `styles.css`, `favicon.svg`, `src/` and
`content/` with a strict Content-Security-Policy.

- Port **4867** was looked up as free on 2026-10-15; it is not reserved or
  registered. If it is busy: `PORT=4999 node server.mjs`. Never use 4317.
- Stop cleanly with **Ctrl+C** (or `kill <pid>`; SIGTERM closes the server).
  Check nothing is left: `lsof -nP -iTCP:4867 -sTCP:LISTEN` prints nothing.
- Requirements: Node 22+ (built with Node 26.7). No `npm install`.

## Tests and checks

```bash
npm test                      # domain/integration tests (node:test), incl. tests/pilot.test.mjs
node tools/run-checks.mjs     # starts its own server on a free port, runs every
                              # headless journey + print check at 1440x900,
                              # 1194x834 and 390x844, saves logs/screenshots/PDFs
                              # under evidence/, stops the server
node tools/run-checks.mjs --evidence evidence/correction-fourup-20261015
                              # same, written to a separate evidence folder
                              # (includes the fourup-fit print group)
node tools/run-checks.mjs calibrate-fourup --evidence <dir>
                              # opt-in: re-measure the print card heights and
                              # glyph widths behind src/domain/printmetrics.js
node tools/export-fixtures.mjs   # regenerate fixtures/ and fixtures/FIXTURES.md
node tools/build-library.mjs     # regenerate content/library.json
```

Headless checks use `~/.claude/skills/headless-check` (headless only, fresh
temporary profiles). The `?test` URL flag swaps in a controllable fake clock
and a read-only debug hook for those checks; it is not part of the coach
workflow and has no visible control.

## The coach workflow

1. **Plan** (▤) — the fictional week opens immediately. Day tiles show each
   day's total against its planned length, warnings and rotation status.
   Move days with ← →, duplicate ⧉, delete ✕ (undo from the message).
   Open a day to see its script: start–end times are recomputed from
   durations, breaks, parallel stations (‖) and fixed starts.
   - **+ Add period** or **Edit** opens the focused editor: title, duration,
     category, teaching objective, drill (with "use this drill's objective
     and equipment"), call/look, scout cards, scout groups, equipment, notes,
     parallel station, shelf, fixed start. **Save period** / **Cancel**
     (asks before discarding changes).
   - Reorder with **↑ / ↓** (keyboard friendly: focus stays on the moved
     row) or drag the **⠿** handle. **More ▾** holds Duplicate, Move to
     shelf and Delete (undoable).
   - **Day settings and templates**: label, optional date, start time (in the
     project's timezone), planned length, notes; apply one of five templates
     (replace or add to end, undoable) or save the day as a template.
   - Totals show time by category, warnings (over length, overlaps, a group
     in two places), the day's equipment list and groups used.
   - **Practice Pilot** (collapsed panel under the day tiles) drafts a new
     day from an objective. It is offline and rule-based: a small built-in
     catalogue of four structures (recognize & align; pursuit & ball-skill
     stations; coverage & rush-lane stations; a general structure that
     ignores the objective). No AI, no network.
     1. Pick a **preset**, enter **available time** (whole minutes, 10–360),
        **participants available** (a count) and how many of each listed
        **equipment** item you have. Optionally type your objective in your
        own words and a day label; station presets also take a station count
        (automatic = the most that fit).
     2. **Propose plan** shows every block with its times, stations, equipment
        and group split, plus "How this was decided" and "Checks". Nothing
        changes yet; editing any input marks the proposal out of date.
     3. **Add as a new day** appends it to the week (undoable). No existing day
        is replaced. Edit it with the usual controls, then rotate, print and
        run it like any day.
     4. **Shorter copy of "<selected day>"**: enter fewer minutes, **Preview
        shorter copy**, then **Add shorter copy as a new day**. It goes right
        after the original, with new ids; the original is untouched.
   - Practice Pilot limits, on purpose:
     - Typed objective text is **never interpreted or matched**. Without a
       preset it is refused ("not supported"); with a preset it is kept as a
       note on the new day, exactly as written. Period titles and drills come
       from the preset only.
     - Refused with the reason: non-whole or out-of-range minutes, 0
       participants, a session shorter or longer than the preset allows, more
       stations than participants allow (every group needs the station's
       minimum), and missing or too little equipment. Stations that run at
       the same time are counted together (3 stations needing 8 + 6 + 6 cones
       need 20). A period linked to a library drill requires that drill's
       equipment; where the library gives no number it counts 1 (a deck of
       scout cards), except **Team vs. scout look**, which counts 10 scout
       pinnies (one per role of the library's scout offense, Scout Skill A +
       Scout Line) and says so in the proposal.
     - Stations rotate: k stations run as k equal rounds, and each numbered
       group visits every station once. A 5-minute water break is added from
       45 minutes. Time is split by fixed weights and fills the available
       minutes exactly.
     - Nobody is named or assigned: scout groups, cards and participants are
       added by you with Edit. Drills the plan's library lacks are left out.
     - Shorter copies scale each block down in whole minutes, none below
       5 min (or its own length if shorter); parallel stations stay equal.
       A day with fixed start times or unequal parallel stations is refused.
       The rotation and availability marks stay with the original day.
       During a live practice use **Rebalance** on the Run page instead.
2. **Rotation** (⇄) — pick a day, choose a seed, **Generate rotation**.
   Only eligible, available fictional participants are used; anyone needed
   in two places at once is refused; gaps stay **Unfilled** with the reason.
   Change an assignment from the list (impossible choices are shown
   disabled with why), **Lock** it, **Regenerate (keeps locks)**. Counts and
   repeated roles help judge the spread. Manage fictional participants
   (labels must include "Fict"; roles, groups, availability per period).
3. **Cards** (◫) — nine fictional looks plus **New card from scratch**. The
   diagram editor: tap/drag a player or an arrow end, or select it from the
   list; move it with the arrow keys (Shift = 5), the ←↑↓→ buttons or exact
   x/y numbers. Save bumps the card version. Attach a card to any period.
   Under the notes, **Printed lines: N of 21** and **Whole card: X of Y
   lines** show whether the card still fits a quarter-page printed card
   (blank lines count, and a long title or look label — wide letters such
   as W most of all — uses room too). A card that does not fit cannot be
   saved until the title or look label is shortened or note lines are
   joined or shortened; the ⚠ line says which, and the text stays in the
   fields. **Duplicate** does not add a copy that would not fit (its title
   gains " (copy)"); it says why instead.
4. **Run** (◷) — pick the day, **Set up the clock**, **Start practice**. Big
   countdown, objective, groups, current scout card, and the next period
   with its cards and a live "in about mm:ss". Pause / Resume, **Next
   period**, +1 / +2 min, Skip, Undo (names what it undoes), Reset (asks;
   undoable). Overrun shows **+mm:ss OVER**; only the coach advances.
   Reset rebuilds the clock from the **current** plan. If you edit the day
   while a clock is set up, nothing changes on its own: the run view shows
   "The plan changed…" with **Rebuild from the current plan…** (asks;
   undoable — Undo brings back the previous clock and script).
   **Assistant view** is a compact layout in the same tab showing current
   and next scout assignments and the next card large. Sound cues are off
   until you turn them on.
   - After a reload the clock comes back **paused** at its last checkpoint
     with "Recovered after reload" and an explicit **Resume clock**; time
     away is reported, not added.
   - A second tab opens read-only and follows; **Take over here** moves
     editing to it explicitly.
   - **Disruptions (C1).** If practice runs 1 min or more behind the plan, a
     notice says how far. **Rebalance remaining time…** shows the minutes
     left (change them if the field time changed), *shorten to fit* or *keep
     lengths and finish late*, and a box per period to move it to
     unfinished work. The minutes left count down while you decide; if the
     plan that fits changed, Apply shows the update before applying.
     Pauses and a late start are not counted as "behind": set the real
     minutes left yourself. **Station
     unavailable…** runs a station later today on its own or moves it to
     unfinished work. Undo puts the previous plan back. Nothing changes on
     its own, and the clock never shortens the period that is running.
   - When practice is complete the summary says what really happened to each
     period (completed, ended early, shortened by coach, skipped), lists the
     unfinished work and the changes, and keeps the original plan. Write the
     **Debrief** (the draft survives a reload) and **Save debrief**. Under
     **Saved debriefs**, **Add to that day** carries an unfinished item to
     another day as an unscheduled period for you to place on the Plan page.
     Saved debriefs reopen on the Run page for that day and travel in the
     export.
5. **Save** (⤓) — save status, **Export JSON file** ("Export requested":
   check your downloads), show export text, import from a file or pasted
   text (checked first; undoable), reset to the fictional example or start
   an empty week (both ask first, both undoable), project name/timezone,
   template names, and fictional stress scenarios.
6. **Print** — from a day ("Print script"), the rotation page, the card
   pages, or `#/print/week`. Weekly summary, coach script per day, rotation
   sheet (unfilled slots listed at the top) and scout cards four per page.
   US Letter, white, grayscale-safe; every page says FICTIONAL / REFERENCE
   with project rev, week and day versions.

## Clean shutdown checklist

1. Ctrl+C in the server terminal (or `kill $(lsof -tiTCP:4867 -sTCP:LISTEN)`).
2. `lsof -nP -iTCP:4867 -sTCP:LISTEN` shows nothing.
3. Browser data stays in that browser profile until you clear it (or use
   Save → Reset).
