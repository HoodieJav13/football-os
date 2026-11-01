// Day totals, breaks, parallel station intervals and time boundaries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSchedule, intervalsOverlap, validatePeriod } from '../src/domain/week.js';
import { parseHHMM, formatHHMM, formatClock12, formatCountdown } from '../src/domain/time.js';
import { period, day } from './helpers.mjs';

const at = (s, id) => s.items.find((i) => i.periodId === id);

test('sequential periods and an explicit break recompute start/end', () => {
  const d = day('d', [period('a', 10), period('brk', 5, { category: 'break' }), period('b', 20)]);
  const s = computeSchedule(d);
  assert.equal(s.startMin, 930);
  assert.deepEqual([at(s, 'a').startMin, at(s, 'a').endMin], [930, 940]);
  assert.deepEqual([at(s, 'brk').startMin, at(s, 'brk').endMin], [940, 945]);
  assert.deepEqual([at(s, 'b').startMin, at(s, 'b').endMin], [945, 965]);
  assert.equal(s.endMin, 965);
  assert.equal(s.totalMin, 35);
  assert.equal(s.categoryTotals.break, 5);
  assert.equal(s.categoryTotals.group, 30);
});

test('exceeding the coach-selected duration warns and shortens nothing', () => {
  const d = day('d', [period('a', 30), period('b', 30)], { plannedMinutes: 45 });
  const s = computeSchedule(d);
  assert.equal(s.totalMin, 60);
  assert.equal(s.overByMin, 15);
  assert.ok(s.warnings.some((w) => w.type === 'over-duration' && /15 min/.test(w.message)));
  assert.equal(at(s, 'b').endMin - at(s, 'b').startMin, 30, 'durations unchanged');
});

test('parallel stations share the block start; the block ends at the longest station', () => {
  const d = day('d', [period('a', 20), period('b', 15, { parallel: true }), period('c', 10)]);
  const s = computeSchedule(d);
  assert.equal(at(s, 'b').startMin, at(s, 'a').startMin);
  assert.equal(at(s, 'c').startMin, at(s, 'a').startMin + 20);
  assert.equal(s.totalMin, 30);
  assert.equal(at(s, 'b').parallel, true);
  assert.ok(!s.warnings.some((w) => w.type === 'overlap'), 'declared stations are not accidental overlaps');
});

test('a fixed start that is earlier than the running clock is surfaced as an overlap', () => {
  const d = day('d', [period('a', 30), period('b', 10, { fixedStart: parseHHMM('15:50') })]);
  const s = computeSchedule(d);
  assert.equal(at(s, 'b').startMin, parseHHMM('15:50'));
  assert.equal(at(s, 'b').overlapMin, 10);
  assert.ok(s.warnings.some((w) => w.type === 'overlap' && w.periodId === 'b'));
});

test('a fixed start later than the running clock leaves a visible gap', () => {
  const d = day('d', [period('a', 10), period('b', 10, { fixedStart: parseHHMM('16:00') })]);
  const s = computeSchedule(d);
  assert.equal(at(s, 'b').gapBeforeMin, 20);
  assert.equal(s.totalMin, 40);
});

test('unscheduled periods are kept visible but excluded from times and totals', () => {
  const d = day('d', [period('a', 10), period('u', 25, { scheduled: false }), period('b', 10)]);
  const s = computeSchedule(d);
  assert.deepEqual(s.items.map((i) => i.periodId), ['a', 'b']);
  assert.deepEqual(s.unscheduled, ['u']);
  assert.equal(s.totalMin, 20);
});

test('an empty day has zero total and no warnings', () => {
  const s = computeSchedule(day('d', []));
  assert.equal(s.totalMin, 0);
  assert.equal(s.endMin, s.startMin);
  assert.deepEqual(s.items, []);
  assert.deepEqual(s.warnings, []);
});

test('two overlapping periods that share a group get a group-overlap warning', () => {
  const d = day('d', [period('a', 20, { groupIds: ['g1'] }), period('b', 20, { parallel: true, groupIds: ['g1', 'g2'] })]);
  const s = computeSchedule(d);
  assert.ok(s.warnings.some((w) => w.type === 'group-overlap' && w.groupId === 'g1'));
  assert.ok(!s.warnings.some((w) => w.type === 'group-overlap' && w.groupId === 'g2'));
});

test('sequential periods sharing a group do not conflict', () => {
  const d = day('d', [period('a', 20, { groupIds: ['g1'] }), period('b', 20, { groupIds: ['g1'] })]);
  assert.ok(!computeSchedule(d).warnings.some((w) => w.type === 'group-overlap'));
});

test('interval boundaries are half-open: touching intervals do not overlap', () => {
  assert.equal(intervalsOverlap({ startMin: 0, endMin: 10 }, { startMin: 10, endMin: 20 }), false);
  assert.equal(intervalsOverlap({ startMin: 0, endMin: 11 }, { startMin: 10, endMin: 20 }), true);
  assert.equal(intervalsOverlap({ startMin: 5, endMin: 6 }, { startMin: 0, endMin: 20 }), true);
});

test('wall-time formatting, including crossing midnight', () => {
  assert.equal(parseHHMM('15:30'), 930);
  assert.equal(parseHHMM('7:05'), 425);
  assert.equal(parseHHMM('24:00'), null);
  assert.equal(parseHHMM('ab'), null);
  assert.equal(formatHHMM(930), '15:30');
  assert.equal(formatClock12(930), '3:30 PM');
  assert.equal(formatClock12(0), '12:00 AM');
  assert.equal(formatClock12(720), '12:00 PM');
  assert.equal(formatClock12(1450), '12:10 AM +1d');
  const d = day('late', [period('a', 40)], { startMin: parseHHMM('23:40') });
  const s = computeSchedule(d);
  assert.equal(s.endMin, 1440 + 20);
  assert.equal(formatClock12(s.endMin), '12:20 AM +1d');
});

test('countdown formatting: ceil while remaining, +over when overrun', () => {
  assert.deepEqual(formatCountdown(600000), { text: '10:00', overrun: false });
  assert.deepEqual(formatCountdown(59001), { text: '01:00', overrun: false });
  assert.deepEqual(formatCountdown(0), { text: '00:00', overrun: false });
  assert.deepEqual(formatCountdown(-83000), { text: '+01:23', overrun: true });
  assert.deepEqual(formatCountdown(3_723_000), { text: '1:02:03', overrun: false });
});

test('period validation bounds duration and text lengths', () => {
  assert.deepEqual(validatePeriod(period('a', 10)).errors, []);
  for (const bad of [0, -5, 2.5, 241, NaN]) assert.ok(validatePeriod(period('a', bad)).errors.length, `minutes ${bad}`);
  assert.ok(validatePeriod(period('a', 10, { title: '' })).errors.some((e) => /title/i.test(e)));
  assert.ok(validatePeriod(period('a', 10, { title: 'x'.repeat(121) })).errors.some((e) => /title/i.test(e)));
  assert.ok(validatePeriod(period('a', 10, { notes: 'x'.repeat(2001) })).errors.some((e) => /notes/i.test(e)));
  assert.ok(validatePeriod(period('a', 10, { category: 'scrimmage' })).errors.some((e) => /category/i.test(e)));
  assert.deepEqual(validatePeriod(period('a', 10, { notes: '<img src=x onerror=alert(1)>' })).errors, [], 'markup-like text is just text');
});
