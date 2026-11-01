// Stable identity across rename, reorder and duplicate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIdFactory } from '../src/domain/ids.js';
import * as W from '../src/domain/week.js';
import { renameParticipant } from '../src/domain/participants.js';
import { generateRotation, validateRotation } from '../src/domain/rotation.js';
import { period, day, week, seqIds, G1, person } from './helpers.mjs';

const base = () => week([day('d1', [period('p1', 10), period('p2', 15), period('p3', 20)]), day('d2', [period('p4', 5)])]);

test('id factory: prefixed ids never repeat across 20k draws', () => {
  const ids = createIdFactory();
  const seen = new Set();
  for (let i = 0; i < 20000; i++) {
    const id = ids('per');
    assert.match(id, /^per-[a-z0-9]{8,}$/);
    assert.ok(!seen.has(id), `repeat ${id}`);
    seen.add(id);
  }
});

test('id factory: a seeded factory is deterministic', () => {
  const a = createIdFactory({ seed: 42 });
  const b = createIdFactory({ seed: 42 });
  const xs = Array.from({ length: 5 }, () => a('day'));
  const ys = Array.from({ length: 5 }, () => b('day'));
  assert.deepEqual(xs, ys);
});

test('renaming a period keeps its id and bumps day and week versions only', () => {
  const w0 = base();
  const w1 = W.updatePeriod(w0, 'd1', 'p2', { title: 'Inside run — renamed' });
  const d1 = w1.days.find((d) => d.id === 'd1');
  assert.deepEqual(d1.periods.map((p) => p.id), ['p1', 'p2', 'p3']);
  assert.equal(d1.periods[1].title, 'Inside run — renamed');
  assert.equal(d1.version, 2);
  assert.equal(w1.version, 2);
  assert.equal(w1.days[1].version, 1, 'other day untouched');
  assert.equal(w0.days[0].periods[1].title, 'Period p2', 'input not mutated');
});

test('updatePeriod cannot change a period id', () => {
  const w1 = W.updatePeriod(base(), 'd1', 'p2', { id: 'hijack', title: 'x' });
  assert.deepEqual(w1.days[0].periods.map((p) => p.id), ['p1', 'p2', 'p3']);
});

test('movePeriod reorders by one step and keeps every id', () => {
  let w = W.movePeriod(base(), 'd1', 'p3', -1);
  assert.deepEqual(w.days[0].periods.map((p) => p.id), ['p1', 'p3', 'p2']);
  w = W.movePeriod(w, 'd1', 'p3', -1);
  assert.deepEqual(w.days[0].periods.map((p) => p.id), ['p3', 'p1', 'p2']);
  const same = W.movePeriod(w, 'd1', 'p3', -1);
  assert.deepEqual(same.days[0].periods.map((p) => p.id), ['p3', 'p1', 'p2'], 'top boundary is a no-op');
  assert.equal(same.version, w.version, 'no-op does not bump version');
});

test('reorderPeriods accepts only a permutation of the same ids', () => {
  const w = W.reorderPeriods(base(), 'd1', ['p2', 'p3', 'p1']);
  assert.deepEqual(w.days[0].periods.map((p) => p.id), ['p2', 'p3', 'p1']);
  assert.throws(() => W.reorderPeriods(base(), 'd1', ['p2', 'p3']), /permutation/);
  assert.throws(() => W.reorderPeriods(base(), 'd1', ['p2', 'p3', 'zz']), /permutation/);
});

test('duplicatePeriod gives a new id, copies content and inserts after the original', () => {
  const ids = seqIds('per');
  const { week: w, id } = W.duplicatePeriod(base(), 'd1', 'p2', ids);
  assert.equal(id, 'per-1');
  const ps = w.days[0].periods;
  assert.deepEqual(ps.map((p) => p.id), ['p1', 'p2', 'per-1', 'p3']);
  assert.equal(ps[2].minutes, 15);
  assert.match(ps[2].title, /^Period p2/);
  assert.notStrictEqual(ps[2].cardIds, ps[1].cardIds, 'arrays are copied, not shared');
});

test('duplicateDay gives new ids to the day and every period; the original is untouched', () => {
  const ids = seqIds('x');
  const w0 = base();
  const { week: w, id, idMap } = W.duplicateDay(w0, 'd1', ids);
  assert.deepEqual(w.days.map((d) => d.id), ['d1', id, 'd2']);
  const copy = w.days[1];
  assert.equal(copy.periods.length, 3);
  for (const p of copy.periods) assert.ok(!['p1', 'p2', 'p3'].includes(p.id));
  assert.equal(idMap.p1, copy.periods[0].id);
  assert.deepEqual(w.days[0].periods.map((p) => p.id), ['p1', 'p2', 'p3']);
});

test('moveDay and deleteDay keep remaining ids', () => {
  let w = W.moveDay(base(), 'd2', -1);
  assert.deepEqual(w.days.map((d) => d.id), ['d2', 'd1']);
  w = W.deleteDay(w, 'd2');
  assert.deepEqual(w.days.map((d) => d.id), ['d1']);
});

test('deletePeriod removes only that id', () => {
  const w = W.deletePeriod(base(), 'd1', 'p2');
  assert.deepEqual(w.days[0].periods.map((p) => p.id), ['p1', 'p3']);
});

test('renaming a participant keeps the id and the rotation still resolves', () => {
  const d = day('d1', [period('p1', 10, { groupIds: ['g1'] })]);
  const people = [person('a', ['QB']), person('b', ['WR'])];
  const rot = generateRotation({ day: d, groups: [G1], participants: people, seed: 3 });
  const renamed = renameParticipant(people, 'a', 'Fict Scout Alpha (renamed)');
  assert.equal(renamed.find((p) => p.id === 'a').label, 'Fict Scout Alpha (renamed)');
  assert.equal(renamed.length, 2);
  const v = validateRotation({ day: d, groups: [G1], participants: renamed, rotation: rot });
  assert.equal(v.warnings.filter((x) => x.severity === 'error').length, 0);
  assert.equal(rot.entries[0].slots.find((s) => s.roleKey === 'QB').participantId, 'a');
});
