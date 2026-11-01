// Local scout cards: validation, diagram edits, provenance that never binds by title.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCard, createCard, moveToken, nudge, addToken, removeToken, addArrow, moveArrowEnd, updateCard, resolveProvenance, DIAGRAM, LIMITS } from '../src/domain/cards.js';
import { loadLibrary, seqIds } from './helpers.mjs';

const lib = loadLibrary();

test('the library has at least eight valid fictional cards across different looks', () => {
  assert.ok(lib.cards.length >= 8);
  assert.ok(new Set(lib.cards.map((c) => c.lookLabel)).size >= 8);
  for (const c of lib.cards) {
    const v = validateCard(c);
    assert.deepEqual(v.errors, [], c.id);
    assert.equal(c.fictional, true);
  }
});

test('a card from scratch is valid, fictional and has an empty diagram', () => {
  const c = createCard(seqIds('card'), { title: 'My new look' });
  assert.equal(c.id, 'card-1');
  assert.equal(c.version, 1);
  assert.equal(c.fictional, true);
  assert.deepEqual(c.diagram.tokens, []);
  assert.deepEqual(validateCard(c).errors, []);
});

test('validation rejects bad content with readable messages', () => {
  const base = createCard(seqIds('card'), { title: 'ok' });
  const bad = (patch, re) => {
    const v = validateCard({ ...base, ...patch });
    assert.ok(v.errors.some((e) => re.test(e)), `${JSON.stringify(patch).slice(0, 60)} -> ${v.errors}`);
  };
  bad({ title: '' }, /title/i);
  bad({ title: 'x'.repeat(LIMITS.title + 1) }, /title/i);
  bad({ notes: 'x'.repeat(LIMITS.notes + 1) }, /notes/i);
  bad({ fictional: false }, /fictional/i);
  bad({ diagram: { ...base.diagram, tokens: [{ id: 't1', label: 'QB', x: 500, y: 10, side: 'O' }] } }, /outside/i);
  bad({ diagram: { ...base.diagram, tokens: [{ id: 't1', label: 'QB', x: 5, y: 10, side: 'O' }, { id: 't1', label: 'X', x: 6, y: 10, side: 'O' }] } }, /duplicate/i);
  bad({ diagram: { ...base.diagram, tokens: [{ id: 't1', label: 'TOOLONG', x: 5, y: 10, side: 'O' }] } }, /label/i);
  bad({ diagram: { ...base.diagram, tokens: Array.from({ length: LIMITS.tokens + 1 }, (_, i) => ({ id: `t${i}`, label: 'X', x: 1, y: 1, side: 'O' })) } }, /too many/i);
  bad({ diagram: { ...base.diagram, arrows: [{ id: 'a1', from: { x: 1, y: 1 }, to: { x: NaN, y: 2 }, kind: 'route' }] } }, /arrow/i);
  bad({ diagram: { ...base.diagram, arrows: [{ id: 'a1', from: { x: 1, y: 1 }, to: { x: 2, y: 2 }, kind: 'laser' }] } }, /kind/i);
});

test('markup-like text is valid content (it is rendered as text elsewhere)', () => {
  const c = createCard(seqIds('card'), { title: '<script>alert(1)</script>', notes: '"><img src=x onerror=alert(1)>' });
  assert.deepEqual(validateCard(c).errors, []);
});

test('moveToken clamps into the illustrative bounds; nudge moves by steps', () => {
  let c = createCard(seqIds('card'), { title: 't' });
  c = addToken(c, { id: 'tk1', label: 'QB', x: 50, y: 30, side: 'O' });
  c = moveToken(c, 'tk1', 140, -20);
  const t = c.diagram.tokens[0];
  assert.deepEqual([t.x, t.y], [DIAGRAM.width, 0]);
  c = nudge(c, { kind: 'token', id: 'tk1' }, -3, 2);
  assert.deepEqual([c.diagram.tokens[0].x, c.diagram.tokens[0].y], [DIAGRAM.width - 3, 2]);
  c = removeToken(c, 'tk1');
  assert.equal(c.diagram.tokens.length, 0);
});

test('arrow endpoints move independently and stay in bounds', () => {
  let c = createCard(seqIds('card'), { title: 't' });
  c = addArrow(c, { id: 'ar1', from: { x: 10, y: 10 }, to: { x: 20, y: 20 }, kind: 'route' });
  c = moveArrowEnd(c, 'ar1', 'to', 30, 99);
  assert.deepEqual(c.diagram.arrows[0].from, { x: 10, y: 10 });
  assert.deepEqual(c.diagram.arrows[0].to, { x: 30, y: DIAGRAM.height });
  c = nudge(c, { kind: 'arrow-end', id: 'ar1', end: 'from' }, 1, 0);
  assert.deepEqual(c.diagram.arrows[0].from, { x: 11, y: 10 });
});

test('updateCard keeps the id and bumps the version', () => {
  const c = createCard(seqIds('card'), { title: 't' });
  const u = updateCard(c, { title: 'renamed', id: 'nope' });
  assert.equal(u.id, c.id);
  assert.equal(u.version, 2);
  assert.equal(u.title, 'renamed');
});

test('provenance: an unknown source id stays unresolved and never binds by title', () => {
  const known = [{ sourceProject: 'other-app', sourceCardId: 'src-1', title: 'Trips Right' }];
  const c = { ...lib.cards[0], title: 'Trips Right', provenance: { sourceProject: 'other-app', sourceCardId: 'src-999', sourceVersion: 3 } };
  const r = resolveProvenance(c, known);
  assert.equal(r.status, 'unresolved');
  assert.equal(r.boundTo, null);
  const none = resolveProvenance({ ...lib.cards[0], provenance: null }, known);
  assert.equal(none.status, 'local');
  const hit = resolveProvenance({ ...c, provenance: { sourceProject: 'other-app', sourceCardId: 'src-1', sourceVersion: 1 } }, known);
  assert.equal(hit.status, 'matched-id');
});
