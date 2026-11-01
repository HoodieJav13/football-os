// Rotation: eligibility, availability, simultaneous conflicts, shortages, locks,
// determinism and hand-checked fairness counts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateRotation, validateRotation, assignManual, setLock, candidatesFor } from '../src/domain/rotation.js';
import { period, day, G1, G2, person, slotOf } from './helpers.mjs';

const seqDay = (n = 3, extra = {}) => day('d1', Array.from({ length: n }, (_, i) => period(`p${i + 1}`, 10, { groupIds: ['g1'], ...extra })));
const assigned = (rot) => rot.entries.flatMap((e) => e.slots.map((s) => s.participantId)).filter(Boolean);

test('every filled slot is eligible, in-group and available; nobody is invented', () => {
  const people = [person('a', ['QB']), person('b', ['QB', 'WR']), person('c', ['WR']), person('x', ['QB'], ['other'])];
  const rot = generateRotation({ day: seqDay(), groups: [G1], participants: people, seed: 1 });
  for (const e of rot.entries) for (const s of e.slots) {
    const p = people.find((q) => q.id === s.participantId);
    assert.ok(p, 'filled from the list');
    assert.ok(p.roleKeys.includes(s.roleKey), `${p.id} eligible for ${s.roleKey}`);
    assert.ok(p.groupIds.includes('g1'));
  }
  assert.ok(!assigned(rot).includes('x'), 'not in the group');
});

test('hand-checked fairness: two QBs over three sequential periods split 2/1 and alternate', () => {
  const people = [person('a', ['QB']), person('b', ['QB']), person('c', ['WR']), person('d', ['WR'])];
  for (const seed of [1, 2, 3, 99]) {
    const rot = generateRotation({ day: seqDay(3), groups: [G1], participants: people, seed });
    const qb = ['p1', 'p2', 'p3'].map((p) => slotOf(rot, p, 'g1-qb').participantId);
    assert.notEqual(qb[0], qb[1], 'second period goes to the QB with fewer assignments');
    assert.equal(qb[0], qb[2], 'third period ties on counts; the seeded rank repeats the first pick');
    const counts = { a: rot.counts.a.total, b: rot.counts.b.total };
    assert.deepEqual(Object.values(counts).sort(), [1, 2]);
    assert.equal(rot.counts[qb[0]].byRole.QB, 2);
    assert.match(slotOf(rot, 'p2', 'g1-qb').rationale, /fewest/i);
  }
});

test('determinism: same fixture and seed give identical output; seeds can differ', () => {
  const people = [person('a', ['QB', 'WR']), person('b', ['QB', 'WR']), person('c', ['QB', 'WR']), person('d', ['WR'])];
  const args = { day: seqDay(4), groups: [G1], participants: people };
  assert.deepEqual(generateRotation({ ...args, seed: 7 }), generateRotation({ ...args, seed: 7 }));
  const firsts = new Set();
  for (let seed = 1; seed <= 12; seed++) firsts.add(slotOf(generateRotation({ ...args, seed }), 'p1', 'g1-qb').participantId);
  assert.ok(firsts.size > 1, 'the seed changes tie-breaks');
});

test('availability: an unavailable participant is skipped for that period only', () => {
  const people = [person('a', ['QB'], ['g1'], { unavailable: [{ dayId: 'd1', periodId: 'p1' }] }), person('b', ['QB']), person('c', ['WR']), person('e', ['WR'])];
  const rot = generateRotation({ day: seqDay(2), groups: [G1], participants: people, seed: 5 });
  assert.equal(slotOf(rot, 'p1', 'g1-qb').participantId, 'b');
  assert.equal(slotOf(rot, 'p2', 'g1-qb').participantId, 'a');
});

test('whole-day unavailability (periodId null) applies to every period that day', () => {
  const people = [person('a', ['QB'], ['g1'], { unavailable: [{ dayId: 'd1', periodId: null }] }), person('c', ['WR'])];
  const rot = generateRotation({ day: seqDay(2), groups: [G1], participants: people, seed: 5 });
  assert.equal(slotOf(rot, 'p1', 'g1-qb').participantId, null);
  assert.match(slotOf(rot, 'p1', 'g1-qb').reason, /unavailable/i);
});

test('shortage: the slot stays empty with a reason; ineligible people are not used to fill it', () => {
  const people = [person('a', ['QB'], ['g1'], { unavailable: [{ dayId: 'd1', periodId: 'p2' }] }), person('c', ['WR']), person('d', ['WR'])];
  const rot = generateRotation({ day: seqDay(2), groups: [G1], participants: people, seed: 2 });
  const s = slotOf(rot, 'p2', 'g1-qb');
  assert.equal(s.participantId, null);
  assert.match(s.reason, /unavailable/i);
  const v = validateRotation({ day: seqDay(2), groups: [G1], participants: people, rotation: rot });
  assert.ok(v.warnings.some((w) => w.type === 'shortage' && w.periodId === 'p2' && w.slotId === 'g1-qb'));
});

test('nobody holds the role at all: shortage reason says so', () => {
  const rot = generateRotation({ day: seqDay(1), groups: [G1], participants: [person('c', ['WR'])], seed: 1 });
  assert.match(slotOf(rot, 'p1', 'g1-qb').reason, /no participant .*eligible.*QB/i);
});

test('zero participants: every slot empty, nothing invented', () => {
  const rot = generateRotation({ day: seqDay(2), groups: [G1], participants: [], seed: 1 });
  assert.deepEqual(assigned(rot), []);
  assert.equal(rot.entries.flatMap((e) => e.slots).length, 4);
});

test('parallel stations: one person is never in two overlapping slots', () => {
  const d = day('d1', [period('p1', 20, { groupIds: ['g1'] }), period('p2', 20, { parallel: true, groupIds: ['g1'] })]);
  const people = [person('a', ['QB']), person('b', ['QB']), person('c', ['WR']), person('d', ['WR'])];
  const rot = generateRotation({ day: d, groups: [G1], participants: people, seed: 4 });
  assert.notEqual(slotOf(rot, 'p1', 'g1-qb').participantId, slotOf(rot, 'p2', 'g1-qb').participantId);
  const only = generateRotation({ day: d, groups: [G1], participants: [person('a', ['QB']), person('c', ['WR']), person('d', ['WR'])], seed: 4 });
  const s2 = slotOf(only, 'p2', 'g1-qb');
  assert.equal(s2.participantId, null);
  assert.match(s2.reason, /same time/i);
});

test('two groups in the same period cannot share one person', () => {
  const d = day('d1', [period('p1', 10, { groupIds: ['g1', 'g2'] })]);
  const people = [person('a', ['QB']), person('b', ['WR'], ['g1', 'g2'])];
  const rot = generateRotation({ day: d, groups: [G1, G2], participants: people, seed: 1 });
  const ids = rot.entries.flatMap((e) => e.slots.map((s) => s.participantId)).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.filter((x) => x === 'b').length, 1);
});

test('sequential reuse is allowed and flagged as an unavoidable repeat when there is no alternative', () => {
  const people = [person('a', ['QB']), person('c', ['WR']), person('d', ['WR'])];
  const rot = generateRotation({ day: seqDay(2), groups: [G1], participants: people, seed: 1 });
  assert.equal(slotOf(rot, 'p1', 'g1-qb').participantId, 'a');
  assert.equal(slotOf(rot, 'p2', 'g1-qb').participantId, 'a');
  const v = validateRotation({ day: seqDay(2), groups: [G1], participants: people, rotation: rot });
  const rep = v.warnings.find((w) => w.type === 'repeat-role' && w.periodId === 'p2' && w.slotId === 'g1-qb');
  assert.ok(rep, 'repeat warning present');
  assert.equal(rep.unavoidable, true);
  assert.ok(!v.warnings.some((w) => w.type === 'conflict'), 'sequential reuse is not a conflict');
});

test('locks survive regeneration with any seed', () => {
  const people = [person('a', ['QB']), person('b', ['QB']), person('c', ['WR']), person('d', ['WR'])];
  const ctx = { day: seqDay(3), groups: [G1], participants: people };
  let rot = generateRotation({ ...ctx, seed: 1 });
  const other = slotOf(rot, 'p1', 'g1-qb').participantId === 'a' ? 'b' : 'a';
  let r = assignManual({ ...ctx, rotation: rot, periodId: 'p1', groupId: 'g1', slotId: 'g1-qb', participantId: other });
  assert.equal(r.ok, true);
  r = setLock({ ...ctx, rotation: r.rotation, periodId: 'p1', groupId: 'g1', slotId: 'g1-qb', locked: true });
  assert.equal(r.ok, true);
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const again = generateRotation({ ...ctx, previous: r.rotation, seed });
    const s = slotOf(again, 'p1', 'g1-qb');
    assert.equal(s.participantId, other);
    assert.equal(s.locked, true);
  }
});

test('a lock that became invalid is kept and reported, not silently replaced', () => {
  const people = [person('a', ['QB']), person('b', ['QB']), person('c', ['WR'])];
  const ctx = { day: seqDay(1), groups: [G1], participants: people };
  let rot = generateRotation({ ...ctx, seed: 1 });
  rot = assignManual({ ...ctx, rotation: rot, periodId: 'p1', groupId: 'g1', slotId: 'g1-qb', participantId: 'a' }).rotation;
  rot = setLock({ ...ctx, rotation: rot, periodId: 'p1', groupId: 'g1', slotId: 'g1-qb', locked: true }).rotation;
  const nowAway = [person('a', ['QB'], ['g1'], { unavailable: [{ dayId: 'd1', periodId: 'p1' }] }), people[1], people[2]];
  const again = generateRotation({ ...ctx, participants: nowAway, previous: rot, seed: 9 });
  assert.equal(slotOf(again, 'p1', 'g1-qb').participantId, 'a');
  const v = validateRotation({ ...ctx, participants: nowAway, rotation: again });
  assert.ok(v.warnings.some((w) => w.type === 'unavailable' && w.locked === true && w.severity === 'error'));
});

test('manual assignment rejects ineligible, out-of-group, unavailable and simultaneous picks', () => {
  const d = day('d1', [period('p1', 20, { groupIds: ['g1'] }), period('p2', 20, { parallel: true, groupIds: ['g1'] })]);
  const people = [person('a', ['QB']), person('b', ['QB']), person('c', ['WR']), person('d', ['WR']), person('o', ['QB'], ['zz']),
    person('u', ['QB'], ['g1'], { unavailable: [{ dayId: 'd1', periodId: 'p1' }] })];
  const ctx = { day: d, groups: [G1], participants: people };
  const rot = generateRotation({ ...ctx, seed: 3 });
  const busy = slotOf(rot, 'p2', 'g1-qb').participantId;
  const tryPick = (pid) => assignManual({ ...ctx, rotation: rot, periodId: 'p1', groupId: 'g1', slotId: 'g1-qb', participantId: pid });
  assert.match(tryPick('c').error, /not eligible.*QB/i);
  assert.match(tryPick('o').error, /not in/i);
  assert.match(tryPick('u').error, /unavailable/i);
  assert.match(tryPick(busy).error, /same time/i);
  assert.match(tryPick('nobody').error, /unknown/i);
  const cleared = tryPick(null);
  assert.equal(cleared.ok, true);
  assert.equal(slotOf(cleared.rotation, 'p1', 'g1-qb').participantId, null);
});

test('a manual change revalidates the whole day (counts and repeats update)', () => {
  const people = [person('a', ['QB']), person('b', ['QB']), person('c', ['WR']), person('d', ['WR'])];
  const ctx = { day: seqDay(2), groups: [G1], participants: people };
  const rot = generateRotation({ ...ctx, seed: 1 });
  const p1qb = slotOf(rot, 'p1', 'g1-qb').participantId;
  const r = assignManual({ ...ctx, rotation: rot, periodId: 'p2', groupId: 'g1', slotId: 'g1-qb', participantId: p1qb });
  assert.equal(r.ok, true);
  assert.equal(r.rotation.counts[p1qb].byRole.QB, 2);
  const rep = r.rotation.warnings.find((w) => w.type === 'repeat-role' && w.periodId === 'p2');
  assert.ok(rep);
  assert.equal(rep.unavoidable, false, 'another QB was free, so the repeat was a choice');
});

test('locking an empty slot is refused', () => {
  const ctx = { day: seqDay(1), groups: [G1], participants: [person('c', ['WR'])] };
  const rot = generateRotation({ ...ctx, seed: 1 });
  const r = setLock({ ...ctx, rotation: rot, periodId: 'p1', groupId: 'g1', slotId: 'g1-qb', locked: true });
  assert.equal(r.ok, false);
  assert.match(r.error, /empty/i);
});

test('candidatesFor lists valid choices and the reasons others are excluded', () => {
  const people = [person('a', ['QB']), person('c', ['WR']), person('u', ['QB'], ['g1'], { unavailable: [{ dayId: 'd1', periodId: 'p1' }] })];
  const ctx = { day: seqDay(1), groups: [G1], participants: people };
  const rot = generateRotation({ ...ctx, seed: 1 });
  const c = candidatesFor({ ...ctx, rotation: rot, periodId: 'p1', groupId: 'g1', slotId: 'g1-qb' });
  assert.deepEqual(c.valid, ['a']);
  const why = Object.fromEntries(c.invalid.map((x) => [x.participantId, x.reasons.join(' ')]));
  assert.match(why.c, /not eligible/i);
  assert.match(why.u, /unavailable/i);
});

test('an unknown participant in a rotation is reported; regeneration replaces it unless locked', () => {
  const people = [person('a', ['QB']), person('c', ['WR'])];
  const ctx = { day: seqDay(1), groups: [G1], participants: people };
  const rot = generateRotation({ ...ctx, seed: 1 });
  const tampered = structuredClone(rot);
  tampered.entries[0].slots[0].participantId = 'ghost';
  const v = validateRotation({ ...ctx, rotation: tampered });
  assert.ok(v.warnings.some((w) => w.type === 'unknown-participant' && w.participantId === 'ghost'));
  const regen = generateRotation({ ...ctx, previous: tampered, seed: 1 });
  assert.ok(!assigned(regen).includes('ghost'));
});

test('seed, fairness rule and constraints are recorded for reproducibility', () => {
  const rot = generateRotation({ day: seqDay(1), groups: [G1], participants: [person('a', ['QB']), person('c', ['WR'])], seed: 1234 });
  assert.equal(rot.seed, 1234);
  assert.equal(rot.dayId, 'd1');
  assert.equal(rot.constraints.fairnessRule, 'fewest-day-total > fewest-same-role > seeded-rank');
  assert.equal(rot.constraints.participantCount, 2);
  assert.equal(rot.constraints.lockedCount, 0);
});

test('entries for periods that no longer exist are reported as orphans', () => {
  const ctx = { day: seqDay(2), groups: [G1], participants: [person('a', ['QB']), person('c', ['WR'])] };
  const rot = generateRotation({ ...ctx, seed: 1 });
  const shorter = { ...ctx, day: seqDay(1) };
  const v = validateRotation({ ...shorter, rotation: rot });
  assert.ok(v.warnings.some((w) => w.type === 'orphan' && w.periodId === 'p2'));
});
