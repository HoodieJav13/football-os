// F2 (independent review P2): every accepted card fits a four-up printed card.
// Line structure is validated before save/import; cards saved by an older
// version are kept unchanged and flagged instead of blocking or being altered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCard, validateCard, printedLines, PRINT_FIT, LIMITS } from '../src/domain/cards.js';
import { generateFixture } from '../src/domain/fixtures.js';
import { exportProject, importProject, validateProject } from '../src/domain/project.js';
import { loadLibrary, seqIds } from './helpers.mjs';

const lib = loadLibrary();
const END80 = Array.from({ length: 80 }, (_, i) => (i === 79 ? 'END80' : 'x')).join('\n');
const card = (fields) => ({ ...createCard(seqIds('card'), { title: 'Probe' }), ...fields });
const prose = (n, word = 'cardnote') => Array.from({ length: Math.ceil(n / (word.length + 1)) }, () => word).join(' ').slice(0, n);

test('exact review case: 80 short lines (163 characters) are refused with an actionable message', () => {
  const c = card({ title: 'Multiline print probe', notes: END80 });
  assert.equal(c.notes.length, 163);
  assert.ok(c.notes.length <= LIMITS.notes, 'under the character limit');
  const v = validateCard(c);
  const msg = v.errors.find((e) => /printed lines/i.test(e));
  assert.ok(msg, JSON.stringify(v.errors));
  assert.match(msg, /80/);
  assert.match(msg, new RegExp(String(PRINT_FIT.maxLines)));
  assert.match(msg, /join|shorten/i);
  assert.equal(c.notes, END80, 'validation never changes the text');
});

test('printedLines counts explicit newlines and blank lines, and wraps long lines conservatively', () => {
  assert.equal(printedLines(card({ notes: '' })).total, 0);
  assert.equal(printedLines(card({ notes: 'a' })).notes, 1);
  assert.equal(printedLines(card({ notes: 'a\nb\nc' })).notes, 3);
  assert.equal(printedLines(card({ notes: 'a\n\n\nb' })).notes, 4, 'blank lines count');
  assert.equal(printedLines(card({ notes: 'x'.repeat(PRINT_FIT.charsPerLine) })).notes, 1);
  assert.equal(printedLines(card({ notes: 'x'.repeat(PRINT_FIT.charsPerLine + 1) })).notes, 2);
  assert.ok(printedLines(card({ notes: 'W'.repeat(100) })).notes > printedLines(card({ notes: 'x'.repeat(100) })).notes, 'wide letters weigh more');
  assert.equal(printedLines(card({ cues: ['one', 'two'] })).cues, 2);
});

test('the boundary is exact: maxLines fits, one more line is refused', () => {
  const at = card({ notes: Array.from({ length: PRINT_FIT.maxLines }, () => 'x').join('\n') });
  const over = card({ notes: Array.from({ length: PRINT_FIT.maxLines + 1 }, () => 'x').join('\n') });
  assert.deepEqual(validateCard(at).errors, []);
  assert.ok(validateCard(over).errors.some((e) => /printed lines/i.test(e)));
  const mixed = card({ notes: Array.from({ length: PRINT_FIT.maxLines - 2 }, () => 'x').join('\n'), cues: ['REFERENCE / FICTIONAL: a', 'REFERENCE / FICTIONAL: b', 'REFERENCE / FICTIONAL: c'] });
  assert.ok(validateCard(mixed).errors.some((e) => /printed lines/i.test(e)), 'cues share the same budget');
});

test('maximum wrapped prose with maximum cues, title and look label is still accepted', () => {
  const c = card({
    title: prose(LIMITS.title, 'Maxtitle'), lookLabel: prose(LIMITS.lookLabel, 'Maxlook'), notes: prose(LIMITS.notes),
    cues: Array.from({ length: LIMITS.cues }, (_, i) => `REFERENCE / FICTIONAL: ${prose(LIMITS.cue - 23, `cue${i}`)}`),
  });
  assert.equal(c.notes.length, LIMITS.notes);
  assert.deepEqual(validateCard(c).errors, []);
});

test('every library card fits', () => {
  for (const c of lib.cards) assert.deepEqual(validateCard(c).errors, [], c.id);
});

test('import refuses an over-long card with its path and leaves nothing half-applied', () => {
  const p = generateFixture({ seed: 1, scenario: 'normal', library: lib });
  const doc = JSON.parse(exportProject(p, null));
  doc.cards[2].notes = END80;
  const r = importProject(JSON.stringify(doc));
  assert.equal(r.ok, false);
  const e = r.errors.find((x) => x.path === 'cards[2].notes');
  assert.ok(e, JSON.stringify(r.errors));
  assert.match(e.message, /printed lines/i);
});

test('a project saved by an older version with an over-long card loads flagged, unchanged', () => {
  const p = generateFixture({ seed: 1, scenario: 'normal', library: lib });
  const legacy = structuredClone(p);
  legacy.cards[2].notes = END80;
  const strict = validateProject(legacy);
  assert.ok(strict.errors.length > 0, 'strict validation refuses it');
  const lenient = validateProject(legacy, { legacyPrintFit: 'flag' });
  assert.deepEqual(lenient.errors, [], 'only the print-fit rule is relaxed');
  assert.deepEqual(lenient.flaggedCards, [legacy.cards[2].id]);
  assert.ok(lenient.warnings.some((w) => /too long to print four to a page/i.test(w)));
  assert.equal(legacy.cards[2].notes, END80, 'content untouched');
  // Structural problems are never relaxed.
  const broken = structuredClone(legacy);
  broken.cards[1].diagram.tokens = [{ id: 't', label: 'QB', x: 500, y: 1, side: 'O' }];
  assert.ok(validateProject(broken, { legacyPrintFit: 'flag' }).errors.length > 0);
});
