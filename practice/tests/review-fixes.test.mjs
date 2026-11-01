// Regressions for defects found in the code review (written before the fixes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, applyAction, isLikelyDoubleTap, DOUBLE_TAP_MS, clockForProject } from '../src/domain/clock.js';
import { generateRotation, assignManual, setLock } from '../src/domain/rotation.js';
import { importProject, exportProject, pruneReferences, validateProject } from '../src/domain/project.js';
import { generateFixture } from '../src/domain/fixtures.js';
import { period, day, G1, G2, person, env, slotOf, loadLibrary } from './helpers.mjs';

const lib = loadLibrary();

// --- 1. a real double tap -------------------------------------------------
test('a second advance within the double-tap window is recognised, even with a fresh revision', () => {
  let s = createSession({ id: 'c', day: day('d', [period('a', 10), period('b', 10), period('c', 10)]) });
  s = applyAction(s, { type: 'start', rev: s.rev }, env(0)).session;
  s = applyAction(s, { type: 'next', rev: s.rev }, env(60_000)).session;
  assert.equal(isLikelyDoubleTap(s, { type: 'next' }, env(60_000 + 250)), true);
  assert.equal(isLikelyDoubleTap(s, { type: 'skip' }, env(60_000 + 250)), true);
  assert.equal(isLikelyDoubleTap(s, { type: 'next' }, env(60_000 + DOUBLE_TAP_MS + 1)), false);
  assert.equal(isLikelyDoubleTap(s, { type: 'undo' }, env(60_000 + 250)), false, 'undo right after a mistaken tap is allowed');
  assert.equal(isLikelyDoubleTap(s, { type: 'next' }, env(60_000 + 250, { instanceId: 'other' })), false, 'other page instances are not compared');
});

// --- 2. a clock whose day was deleted --------------------------------------
test('clockForProject drops a clock whose day no longer exists', () => {
  const p = generateFixture({ seed: 1, scenario: 'normal', library: lib });
  const c = createSession({ id: 'c', day: p.week.days[0] });
  assert.equal(clockForProject(p, c), c);
  const without = { ...p, week: { ...p.week, days: p.week.days.slice(1) } };
  assert.equal(clockForProject(without, c), null);
  assert.equal(clockForProject(p, null), null);
});

// --- 4. locks are never lost silently ---------------------------------------
test('a lock orphaned by removing a group is re-applied when the group comes back', () => {
  const withGroup = day('d1', [period('p1', 10, { groupIds: ['g1'] })]);
  const people = [person('a', ['QB']), person('b', ['QB']), person('c', ['WR']), person('e', ['WR'])];
  const ctx = { groups: [G1], participants: people };
  let rot = generateRotation({ ...ctx, day: withGroup, seed: 1 });
  const other = slotOf(rot, 'p1', 'g1-qb').participantId === 'a' ? 'b' : 'a';
  rot = assignManual({ ...ctx, day: withGroup, rotation: rot, periodId: 'p1', groupId: 'g1', slotId: 'g1-qb', participantId: other }).rotation;
  rot = setLock({ ...ctx, day: withGroup, rotation: rot, periodId: 'p1', groupId: 'g1', slotId: 'g1-qb', locked: true }).rotation;
  const noGroup = day('d1', [period('p1', 10, { groupIds: [] })]);
  const orphaned = generateRotation({ ...ctx, day: noGroup, previous: rot, seed: 2 });
  assert.equal(orphaned.orphans.length, 1);
  for (const seed of [3, 4, 5, 6]) {
    const back = generateRotation({ ...ctx, day: withGroup, previous: orphaned, seed });
    const s = slotOf(back, 'p1', 'g1-qb');
    assert.equal(s.participantId, other, `seed ${seed}`);
    assert.equal(s.locked, true);
    assert.equal(back.orphans.length, 0);
  }
});

test('editing another slot keeps stale locked entries as orphans instead of deleting them', () => {
  const people = [person('a', ['QB']), person('c', ['WR'], ['g1', 'g2']), person('e', ['WR'], ['g1', 'g2'])];
  const both = day('d1', [period('p1', 10, { groupIds: ['g1', 'g2'] })]);
  const ctx = { groups: [G1, G2], participants: people };
  let rot = generateRotation({ ...ctx, day: both, seed: 1 });
  const wr = slotOf(rot, 'p1', 'g2-wr').participantId;
  rot = setLock({ ...ctx, day: both, rotation: rot, periodId: 'p1', groupId: 'g2', slotId: 'g2-wr', locked: true }).rotation;
  // g2 is removed from the period, then the coach edits a g1 slot.
  const onlyG1 = day('d1', [period('p1', 10, { groupIds: ['g1'] })]);
  const r = setLock({ ...ctx, day: onlyG1, rotation: rot, periodId: 'p1', groupId: 'g1', slotId: 'g1-qb', locked: true });
  assert.equal(r.ok, true);
  assert.deepEqual(r.rotation.orphans.map((o) => [o.slotId, o.participantId, o.locked]), [['g2-wr', wr, true]]);
  assert.ok(r.rotation.warnings.some((w) => w.type === 'orphan' && w.locked));
});

// --- 6. pruning bumps versions ------------------------------------------------
test('pruneReferences bumps the day and week versions when it edits periods', () => {
  const p = generateFixture({ seed: 1, scenario: 'normal', library: lib });
  const used = p.week.days[0].periods.find((x) => x.cardIds.length).cardIds[0];
  const r = pruneReferences({ ...p, cards: p.cards.filter((c) => c.id !== used) });
  const touched = r.week.days.filter((d, i) => d.version !== p.week.days[i].version);
  assert.ok(touched.length >= 1);
  for (const d of touched) assert.ok(d.periods.every((x) => !x.cardIds.includes(used)));
  assert.equal(r.week.version, p.week.version + 1);
  const untouched = pruneReferences(p);
  assert.equal(untouched.week.version, p.week.version, 'nothing to prune: no bump');
});

// --- 7. malformed shapes are errors, never exceptions -----------------------
test('malformed shapes are reported as errors instead of throwing', () => {
  const base = JSON.parse(exportProject(generateFixture({ seed: 1, scenario: 'normal', library: lib }), null));
  const cases = [
    (d) => { d.groups[0] = null; },
    (d) => { d.groups[0].roles[0] = null; },
    (d) => { d.participants[0] = null; },
    (d) => { d.week.days[0] = null; },
    (d) => { d.week.days[0].periods[0] = 7; },
    (d) => { d.cards[0] = 'x'; },
    (d) => { d.drills[0] = null; },
    (d) => { d.templates[0].periods[0] = null; },
    (d) => { d.rotations = { [d.week.days[0].id]: { dayId: d.week.days[0].id, entries: [null] } }; },
    (d) => { d.week = 'nope'; },
  ];
  for (const [i, mutate] of cases.entries()) {
    const doc = structuredClone(base);
    mutate(doc);
    let r;
    assert.doesNotThrow(() => { r = importProject(JSON.stringify(doc)); }, `case ${i}`);
    assert.equal(r.ok, false, `case ${i}`);
    assert.ok(r.errors.length > 0, `case ${i}`);
  }
  assert.doesNotThrow(() => validateProject(null));
});

test('a structurally broken clock is rejected on import', () => {
  const p = generateFixture({ seed: 1, scenario: 'normal', library: lib });
  let c = createSession({ id: 'c', day: p.week.days[0] });
  c = applyAction(c, { type: 'start', rev: c.rev }, env(0)).session;
  const good = JSON.parse(exportProject(p, c));
  const bad = (mutate) => { const d = structuredClone(good); mutate(d.clock); return importProject(JSON.stringify(d)); };
  assert.equal(importProject(JSON.stringify(good)).ok, true);
  assert.equal(bad((k) => { k.index = 99; }).ok, false);
  assert.equal(bad((k) => { k.steps[0] = null; }).ok, false);
  assert.equal(bad((k) => { k.steps[0].plannedSec = -5; }).ok, false);
  assert.equal(bad((k) => { k.steps[0].status = 'exploded'; }).ok, false);
  assert.equal(bad((k) => { k.history[0] = { type: 'start' }; }).ok, false);
});
