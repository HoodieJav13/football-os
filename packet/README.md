# Coaching session packet companion

FICTIONAL / REFERENCE. Authored DRAFT. This is next-season preparation with fictional data only, not a real-player tool.

A local, zero-dependency companion. It turns one selected fictional Practice day and the bundled authored Cover 3 teaching example into a phone-readable session packet and browser Print / Save PDF output. It connects to no source app and no source store: a portable packet JSON file is the only integration boundary.

## Run it

Requires Node 20 or later. There is nothing to install.

```sh
cd app
node server.mjs
```

Open <http://127.0.0.1:4873/>. For another port, run `node server.mjs --port 4900`. The server binds to loopback and serves only `public/`.

## Check it

```sh
cd app
node --test test/*.test.mjs
```

`npm test` runs the same thing. The tests have not been run by the author of this code; a separate executor runs them along with the rendered and PDF checks.

Two tests compare the app against `../fixtures` and `../reference`, and they skip if those frozen folders are absent.

## Flow

1. **Source.** Choose Load sample, Import JSON file, or paste JSON. The import is detected as a Practice export or a session packet.
2. **Session.** Choose a practice day. No day is picked for you. The bundled teaching example is attached.
3. **Output.** Choose Coach packet, Assignment sheet, or Identify cards. The preview shows only that output.
4. **Keep or print.** Choose Save in this browser, Download packet JSON, or Print / Save PDF.

To reopen a packet, reload the page in the same browser (the saved packet is restored), or import the downloaded file anywhere.

| Output | Contents |
| --- | --- |
| Coach packet | Selected day only: warnings, full schedule, unscheduled shelf, notes, referenced drills, provenance. Then the diagram and legend on a new page, then the coach key on its own page. |
| Assignment sheet | Diagram with areas and spatial legend. No schedule, no coach key. |
| Identify cards | Seven answer-free cards, one per page in print. Neutral offense labels, anonymous defenders, one star. |

## Status wording

| Label | Meaning |
| --- | --- |
| Unsaved | The current packet differs from what is saved in this browser. |
| Saved locally | The write was read back and matched. |
| Storage unavailable | Storage refused or lost the write, or could not be reached. The preview stays usable. |
| Export requested | The browser was asked to download. This does not confirm that a file exists. |

## Packet v1

```
schema         "coaching-session-packet.companion"
schemaVersion  1
fictional      true
output         "coach" | "assignment" | "identify"
source         Practice export schema/version, project id/name/rev, timezone, week id/version, day id/version
day            selected day and allowlisted period fields
schedule       computeSchedule(day): must match day on import
drills         only drills referenced by the day
cover3         { status, sourceHead, pack } authored snapshot and revision
```

- **Allowlisted.** Participants, groups, rotations, records, clock, cards, templates, week notes, opponent label, other days and unrelated drills are never copied. Keys not on the allowlist are dropped.
- **Coach material.** Packet JSON includes the diagram and key, whichever output is selected. Do not give it to learners. The filename ends in `coach-material.json`.
- **Validated before replacing.** Any failed import leaves the current packet unchanged.
- **Deterministic.** There are no timestamps or random ids, so the same selection gives the same bytes.
- **Bundled example only.** A packet's Cover 3 snapshot must match the bundled authored example exactly. This stops a packet from carrying another playbook. It also means a packet made against a different bundle would be refused.

## Safety behavior

- **Rendering.** Views are plain trees mounted with `createElement` and text nodes only, under a strict CSP.
- **Learner output.** Identify cards are built from a projection holding only alignment and neutral labels, so answers are absent from the document rather than hidden by CSS. In Identify mode the page shell also contains no source ids.
- **Slow or interrupted imports.** Any newer user action cancels a pending file read, so its result is dropped. A failed read reports the failure, and the same file can be chosen again. The file is read with `Blob.prototype.text`.
- **Double actions.** Repeat download and print within 800 ms are ignored. Save and day choice are idempotent.
- **Storage.** The only key written is `coaching-session-packet:v1:saved`. Damaged or unsupported saved data is reported, not opened, and left in place until the next explicit save.

## Layout

```
server.mjs              loopback static server (public/ only)
public/index.html       page shell
public/styles.css       controls, paper, print rules
public/src/
  packet.js             validate, allowlist, select day, snapshot, serialize
  cover3.js             snapshot check, legend, answer-free projection
  controller.js         state and actions; browser effects are injected
  storage.js            guarded localStorage adapter
  views.js, field.js    printable content and SVG as plain trees
  dom.js                tree helpers and safe mount
  main.js               DOM wiring
  practice-week.js      reused byte-for-byte from Practice
  practice-time.js      reused byte-for-byte from Practice
  sample-*.js           bundled sanitized fixtures
test/                   node:test suites
```

Element ids for automation: `load-sample`, `import-file`, `import-text`, `import-text-button`, `day-select`, `example-select`, `save-local`, `export-packet`, `print-packet`, `status-local`, `status-export`, `notice`, `preview`. Output radios are `input[name="output"]` with values `coach`, `assignment`, `identify`.

## Known limits

- Scout cards are not carried. A period's `cardIds` are dropped because the card records are out of scope, and the packet does not show that a period had any.
- Period `groupIds` are kept as opaque ids because the group-overlap warning depends on them. Group records and names are not.
- Saved state is one packet per browser origin. Saved data is tied to `127.0.0.1` and the port, so a different port has separate storage. Two open tabs do not sync.
- A packet is a copy. It does not track later edits in Practice or Cover 3, and it writes to neither.
- The `@page` footer with the stamps and page numbers needs a browser that supports page-margin boxes. Elsewhere the stamps appear at the start of each section and card instead.
- The browser's own Print dialog decides whether a PDF is actually saved. The companion cannot detect that.
