// Residual F2 (correction review P2): the supported-input rule covers the
// complete printed card — look label and title wrapping, notes, cues and the
// diagram — so every accepted card fits a four-up quarter page, and anything
// that would not is refused before save or import.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCard, validateCard, printFitError, cardFit, CARD_FIT, PRINT_FIT, LIMITS } from '../src/domain/cards.js';
import { generateFixture } from '../src/domain/fixtures.js';
import { exportProject, importProject, validateProject } from '../src/domain/project.js';
import { loadLibrary, seqIds } from './helpers.mjs';

const lib = loadLibrary();
const W = (n) => 'W'.repeat(n);
const END21 = Array.from({ length: 21 }, (_, i) => (i === 20 ? 'END21' : 'x')).join('\n');
const REAL_TITLE = 'Scout card: Trips Right motion — Monday walkthrough and Wednesday team rehearsal';
const REAL_LOOK = 'Trips Right · 11 personnel · left hash · motion toward trips';
const REAL_NOTES = ['Fictional scout card.', 'Use the shown diagram.', 'Check the look label.', 'Match the shown spacing.', 'Walk through the setup.', 'Keep names generic.',
  'Review one role at a time.', 'Point to the marked spot.', 'Say the task out loud.', 'Ask for the call if needed.', 'Pause before the next rep.', 'Check the full diagram.',
  'Keep the group together.', 'Repeat at a walk.', 'Confirm the period label.', 'Use the printed card.', 'Return to the start spot.', 'Leave room for notes.',
  'Keep this as reference.', 'Discuss after the rep.', 'END21'].join('\n');
const card = (fields) => ({ ...createCard(seqIds('card'), { title: 'Probe' }), ...fields });

test('fixtures are the exact strings the continuation specifies', () => {
  assert.equal(REAL_TITLE.length, 80);
  assert.equal(REAL_LOOK.length, 60);
  assert.equal(REAL_NOTES.length, 482);
  assert.equal(REAL_NOTES.split('\n').length, 21);
  assert.equal(END21.length, 45);
});

test('exact review case: W80 title, W60 look, 21 short lines is refused, naming title and look label', () => {
  const c = card({ title: W(LIMITS.title), lookLabel: W(LIMITS.lookLabel), notes: END21, cues: [] });
  const fit = cardFit(c);
  assert.equal(fit.fits, false);
  const msg = printFitError(c);
  assert.ok(msg, 'refused');
  assert.match(msg, /title/i);
  assert.match(msg, /look label/i);
  assert.match(msg, /four-up|quarter-page|four to a page/i);
  assert.ok(validateCard(c).errors.includes(msg));
  assert.equal(c.notes, END21, 'text unchanged');
});

test('realistic maximum title and look label with 21 ordinary note lines (482 characters) is supported', () => {
  const c = card({ title: REAL_TITLE, lookLabel: REAL_LOOK, notes: REAL_NOTES, cues: [] });
  assert.equal(printFitError(c), null, JSON.stringify(cardFit(c)));
  assert.deepEqual(validateCard(c).errors, []);
});

test('W80 / W60 with wide wrapped prose (W x485 + ENDWIDE) is supported when it fits', () => {
  const c = card({ title: W(80), lookLabel: W(60), notes: `${W(485)} ENDWIDE`, cues: [] });
  assert.equal(printFitError(c), null, JSON.stringify(cardFit(c)));
});

test('the whole-card estimate reserves the measured title and look-label wrapping', () => {
  const short = cardFit(card({ title: 'T', lookLabel: 'L', notes: 'x' }));
  const wide = cardFit(card({ title: W(80), lookLabel: W(60), notes: 'x' }));
  assert.ok(wide.lookLines >= 4, `W60 look label wraps to at least 4 lines (measured 4): ${wide.lookLines}`);
  assert.ok(wide.titleLines >= 3, `W80 title wraps to at least 3 lines (measured 3): ${wide.titleLines}`);
  assert.equal(short.lookLines, 1);
  assert.equal(short.titleLines, 1);
  assert.ok(wide.usedLines > short.usedLines);
  const noLook = cardFit(card({ title: W(80), lookLabel: '', notes: 'x' }));
  assert.ok(noLook.lookLines >= 4, 'an empty look label prints the title in its place');
});

test('the estimate is never below the measured renderer for the calibrated cases', () => {
  // Needed heights measured in Chrome print media (calibration evidence), in px.
  const measured = [
    [card({ title: W(80), lookLabel: W(60), notes: END21 }), 445],
    [card({ title: REAL_TITLE, lookLabel: REAL_LOOK, notes: END21 }), 407],
    [card({ title: 'Short', lookLabel: W(60), notes: 'x' }), 19.2 + 55.2 + 3 + 10.7 + 3 + 105 + 3 + 10.7],
    [card({ title: W(80), lookLabel: 'Short', notes: 'x' }), 19.2 + 13.8 + 3 + 32.1 + 3 + 105 + 3 + 10.7],
  ];
  for (const [c, px] of measured) assert.ok(cardFit(c).neededPx >= px - 0.5, `${c.title.slice(0, 12)}: estimate ${cardFit(c).neededPx} < measured ${px}`);
});

test('notes, cues, blank lines and labels share one budget; the boundary is exact', () => {
  for (const [title, look] of [['Short', 'Short'], [REAL_TITLE, REAL_LOOK], [W(80), W(60)], ['abcdefghij'.repeat(8), 'abcdefghij'.repeat(6)]]) {
    let n = 0;
    while (n < 40 && !printFitError(card({ title, lookLabel: look, notes: Array.from({ length: n + 1 }, () => 'x').join('\n') }))) n++;
    assert.ok(n >= 1, `${title.slice(0, 8)}: at least one line fits`);
    const at = card({ title, lookLabel: look, notes: Array.from({ length: n }, () => 'x').join('\n') });
    const over = card({ title, lookLabel: look, notes: Array.from({ length: n + 1 }, () => 'x').join('\n') });
    assert.equal(printFitError(at), null);
    assert.ok(printFitError(over));
    // Blank lines cost the same as text lines.
    assert.ok(printFitError(card({ title, lookLabel: look, notes: Array.from({ length: n + 1 }, (_, i) => (i % 2 ? '' : 'x')).join('\n') })));
  }
});

test('the published 21 printed-line notes/cues rule still applies on its own', () => {
  const c = card({ title: 'T', lookLabel: 'L', notes: Array.from({ length: PRINT_FIT.maxLines + 1 }, () => 'x').join('\n') });
  assert.match(printFitError(c), /printed lines/i);
});

test('maximum wrapped prose with four maximum cues and long labels is still supported', () => {
  const long = (n, w) => Array.from({ length: Math.ceil(n / (w.length + 1)) }, () => w).join(' ').slice(0, n);
  const c = card({
    title: long(80, 'Maxtitle'), lookLabel: long(60, 'Maxlook'), notes: `${long(490, 'cardnote')} ENDSTRESS`,
    cues: [0, 1, 2].map((i) => `REFERENCE / FICTIONAL: ${long(116, `cue${i}`)}`).concat([`REFERENCE / FICTIONAL: ${long(109, 'cue3')} ENDCUE`]),
  });
  assert.equal(printFitError(c), null, JSON.stringify(cardFit(c)));
});

test('every library and fixture card stays supported', () => {
  for (const c of lib.cards) assert.equal(printFitError(c), null, c.id);
  for (const scenario of ['example', 'normal', 'thin']) assert.deepEqual(validateProject(generateFixture({ seed: 42, scenario, library: lib })).errors, []);
});

test('import refuses the four W cards with the card path and an actionable reason; nothing is returned to apply', () => {
  const p = generateFixture({ seed: 42, scenario: 'example', library: lib });
  const doc = JSON.parse(exportProject(p, null));
  const n0 = doc.cards.length;
  for (let i = 0; i < 4; i++) doc.cards.push({ ...structuredClone(doc.cards[0]), id: `review-four-${i}`, title: W(80), lookLabel: W(60), notes: END21, cues: [], provenance: null });
  const r = importProject(JSON.stringify(doc));
  assert.equal(r.ok, false);
  assert.equal(r.project, undefined);
  for (let i = 0; i < 4; i++) {
    const e = r.errors.find((x) => x.path === `cards[${n0 + i}].notes`);
    assert.ok(e, `error for card ${n0 + i}: ${JSON.stringify(r.errors.slice(0, 2))}`);
    assert.match(e.message, /title|look label/i);
    assert.ok(e.message.includes(`review-four-${i}`), `names the card: ${e.message.slice(0, 80)}`);
  }
});

test('a stored card that the new whole-card rule refuses loads unchanged and flagged (legacy path)', () => {
  const p = generateFixture({ seed: 42, scenario: 'example', library: lib });
  const legacy = structuredClone(p);
  legacy.cards.push({ ...structuredClone(p.cards[0]), id: 'legacy-w', title: W(80), lookLabel: W(60), notes: END21, cues: [], provenance: null });
  const v = validateProject(legacy, { legacyPrintFit: 'flag' });
  assert.deepEqual(v.errors, []);
  assert.deepEqual(v.flaggedCards, ['legacy-w']);
  assert.equal(legacy.cards.at(-1).notes, END21);
});

test('cardFit reports capacity and use in note-line units for the editor counter', () => {
  const f = cardFit(card({ title: REAL_TITLE, lookLabel: REAL_LOOK, notes: REAL_NOTES }));
  assert.ok(f.maxLines > 20 && f.maxLines < 40, `capacity in note lines: ${f.maxLines}`);
  assert.ok(f.usedLines <= f.maxLines);
  assert.equal(CARD_FIT.cellPx, 429);
  assert.equal(CARD_FIT.diagramMinPx, 105);
});

// Final-review findings: every path that writes a card checks the card it will
// actually store, and the wrap model never under-counts tabs or other spaces.
const DUP_TITLE = 'Bunch Stick Snag Cross Empty Cover Bunch Over Sweep Cross Monday Smash Two';
const V9_TITLE = 'WHEEL TEAM REHEARSAL COVER READ STRONG MESH WALKTHROUGH WEAK REHEARSAL POWER';
const V9_LOOK = 'DRAG TEAM DRAG SNAG MESH SWEEP DRAG WALKTHROUGH POWER SNAG';

test('Duplicate checks the copy it would add: a " (copy)" title that no longer fits is refused', async () => {
  const { duplicateCard } = await import('../src/domain/cards.js');
  const orig = card({ title: DUP_TITLE, lookLabel: '', notes: END21, cues: [] });
  assert.equal(printFitError(orig), null, 'the original fits');
  const dup = duplicateCard(orig, seqIds('dup'));
  assert.equal(dup.card.title, `${DUP_TITLE} (copy)`.slice(0, LIMITS.title));
  assert.ok(dup.errors.length > 0, 'the copy would not fit, so Duplicate is refused');
  assert.match(dup.errors.join(' '), /title/i);
  const src = { ...card({ title: 'Trips Right', lookLabel: 'Trips Right (gun)', notes: 'x' }), id: 'trips-orig', version: 4 };
  const ok = duplicateCard(src, seqIds('dup'));
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.card.version, 1);
  assert.equal(ok.card.provenance, null);
  assert.notEqual(ok.card.id, src.id);
});

test('Save checks the version it stores: v9 -> v10 widens the stamp, and a card that then no longer fits is refused', async () => {
  const { saveCard } = await import('../src/domain/cards.js');
  const fields = { title: V9_TITLE, lookLabel: V9_LOOK, notes: END21, cues: [] };
  const v9 = { ...card(fields), version: 9 };
  assert.equal(printFitError(v9), null, 'fits at v9');
  const res = saveCard(v9, { ...v9 });
  assert.equal(res.card.version, 10);
  assert.ok(res.errors.length > 0, 'the stored v10 card would not fit');
  assert.match(res.errors.join(' '), /v10/, 'the refusal says the new version number is what tipped it over');
  const v1 = { ...card(fields), version: 1 };
  const ok = saveCard(v1, { ...v1, notes: END21 });
  assert.equal(ok.card.version, 2);
  assert.deepEqual(ok.errors, []);
  const fresh = saveCard(null, { ...card(fields), version: 1 });
  assert.equal(fresh.card.version, 1);
  assert.deepEqual(fresh.errors, []);
});

test('a tab in notes counts as a full tab stop, never less than eight spaces', () => {
  const tabs = 'Name\tRole\tSpot\tTask\tCall\tNote\tReps\tTime\tCue\tSet';
  const asTab = cardFit(card({ title: 'T', lookLabel: 'L', notes: tabs }));
  const asSpaces = cardFit(card({ title: 'T', lookLabel: 'L', notes: tabs.replace(/\t/g, ' '.repeat(8)) }));
  assert.ok(asTab.notesLines >= asSpaces.notesLines, `tabs ${asTab.notesLines} vs 8 spaces ${asSpaces.notesLines}`);
  assert.ok(asTab.notesLines >= 2, `ten tab-separated words wrap: ${asTab.notesLines}`);
});

test('ideographic and other non-ASCII spaces are not collapsed into a narrow space', () => {
  const lines = (fill) => cardFit(card({ title: `W${fill}`.repeat(40), lookLabel: `W${fill}`.repeat(30), notes: END21 }));
  const ascii = lines(' ');
  for (const sp of ['　', ' ', ' ', ' ']) {
    const f = lines(sp);
    assert.ok(f.neededPx > ascii.neededPx, `U+${sp.codePointAt(0).toString(16)}: ${f.neededPx} > ${ascii.neededPx}`);
  }
  assert.ok(printFitError(card({ title: 'W　'.repeat(40), lookLabel: 'W　'.repeat(30), notes: END21 })), 'the ideographic-space case (about 448 px in Chrome) is refused');
});
