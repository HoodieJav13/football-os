// F1 (independent review P2): a confirmed Reset rebuilds the session from the
// current, edited day; Undo restores the prior complete session.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, applyAction, deriveView, serializeSession, recoverSession, isLikelyDoubleTap } from '../src/domain/clock.js';
import * as W from '../src/domain/week.js';
import { generateFixture } from '../src/domain/fixtures.js';
import { exportProject, importProject } from '../src/domain/project.js';
import { period, day, env, loadLibrary } from './helpers.mjs';

const S = 1000;
const lib = loadLibrary();
const act = (s, type, mono, extra = {}, e = {}) => {
  const r = applyAction(s, { type, rev: s.rev, ...extra }, env(mono, e));
  assert.equal(r.ok, true, `${type}: ${r.error}`);
  return r.session;
};
const ids = (s) => s.steps.map((x) => x.periodIds);

test('exact review case: Warm-up/600 s, day v1 -> edited 25 min; reset gives the edited script (1,500 s, v2)', () => {
  const p = generateFixture({ seed: 42, scenario: 'example', library: lib });
  const mon = p.week.days[0];
  let s = createSession({ id: 'clk-f1', day: mon });
  s = act(s, 'start', 0);
  assert.deepEqual([s.steps[0].title, s.steps[0].plannedSec, s.dayVersion], ['Warm-up', 600, 1]);
  const week = W.updatePeriod(p.week, mon.id, mon.periods[0].id, { title: 'Independent changed drill', minutes: 25 });
  const edited = week.days[0];
  assert.equal(edited.version, 2);
  const revBefore = s.rev;
  const histBefore = s.history.length;
  s = act(s, 'reset', 5 * S, { day: edited });
  assert.equal(s.state, 'idle');
  assert.equal(s.dayVersion, 2);
  assert.equal(s.steps[0].title, 'Independent changed drill');
  assert.equal(s.steps[0].plannedSec, 1500);
  assert.equal(s.id, 'clk-f1', 'the session keeps its id');
  assert.equal(s.rev, revBefore + 1, 'one revision');
  assert.equal(s.history.length, histBefore + 1, 'one history entry');
  assert.deepEqual(ids(s), createSession({ id: 'x', day: edited }).steps.map((x) => x.periodIds), 'steps match a fresh build of the edited day');
  assert.ok(s.steps.every((x) => x.status === 'pending' && x.elapsedMs === 0 && x.extensionSec === 0));
});

test('reset rebuild follows added, reordered, deleted and parallel periods with no stale or orphan reference', () => {
  const d0 = day('d1', [period('a', 10), period('b', 10), period('c', 10)]);
  let s = act(createSession({ id: 'c', day: d0 }), 'start', 0);
  let w = { id: 'w', version: 1, opponentLabel: 'F', notes: '', days: [d0] };
  w = W.addPeriod(w, 'd1', period('n', 7), 1); // add
  w = W.movePeriod(w, 'd1', 'c', -2); // reorder: c to the top
  w = W.deletePeriod(w, 'd1', 'b'); // delete
  w = W.updatePeriod(w, 'd1', 'a', { parallel: true }); // a becomes a station with the period before it
  const d1 = w.days[0];
  s = act(s, 'reset', 1 * S, { day: d1 });
  const expected = createSession({ id: 'x', day: d1 }).steps;
  assert.deepEqual(ids(s), expected.map((x) => x.periodIds));
  assert.deepEqual(s.steps.map((x) => x.plannedSec), expected.map((x) => x.plannedSec));
  const live = new Set(d1.periods.map((x) => x.id));
  assert.ok(ids(s).flat().every((id) => live.has(id)), 'no orphan period ids');
  assert.ok(!ids(s).flat().includes('b'), 'deleted period gone');
  assert.equal(s.dayVersion, d1.version);
});

for (const [state, prep] of [
  ['idle (changed plan)', (s) => s],
  ['running', (s) => act(s, 'start', 0)],
  ['paused', (s) => act(act(s, 'start', 0), 'pause', 30 * S)],
  ['completed', (s) => act(act(act(s, 'start', 0), 'next', 10 * S), 'next', 20 * S)],
]) {
  test(`reset from ${state} rebuilds from the edited day, and undo restores the prior session`, () => {
    const d0 = day('d1', [period('a', 10), period('b', 5)]);
    const before = prep(createSession({ id: 'c', day: d0 }));
    const d1 = { ...d0, version: 2, periods: [period('a', 12, { title: 'A edited' }), period('b', 5), period('z', 3)] };
    const after = act(before, 'reset', 40 * S, { day: d1 });
    assert.equal(after.state, 'idle');
    assert.deepEqual(ids(after), [['a'], ['b'], ['z']]);
    assert.equal(after.steps[0].title, 'A edited');
    const undone = act(after, 'undo', 41 * S);
    assert.equal(undone.dayVersion, before.dayVersion, 'undo restores the old script version');
    assert.deepEqual(ids(undone), ids(before));
    assert.deepEqual(undone.steps.map((x) => [x.title, x.plannedSec, x.status]), before.steps.map((x) => [x.title, x.plannedSec, x.status]));
    assert.equal(undone.state, before.state === 'running' ? 'running' : before.state);
    assert.equal(undone.index, before.index);
    assert.equal(undone.rev, after.rev + 1);
  });
}

test('reset on an idle session with an unchanged plan is refused (nothing to reset)', () => {
  const d0 = day('d1', [period('a', 10)]);
  const r = applyAction(createSession({ id: 'c', day: d0 }), { type: 'reset', rev: 0, day: d0 }, env(0));
  assert.equal(r.ok, false);
  assert.match(r.error, /nothing to reset/i);
});

test('reset needs the current version of the same day', () => {
  const d0 = day('d1', [period('a', 10)]);
  const s = act(createSession({ id: 'c', day: d0 }), 'start', 0);
  assert.match(applyAction(s, { type: 'reset', rev: s.rev }, env(1)).error, /current version of this day/i);
  assert.match(applyAction(s, { type: 'reset', rev: s.rev, day: day('other', [period('q', 5)]) }, env(1)).error, /current version of this day/i);
});

test('undo of a reset from running counts the time that passed; elapsed is from the monotonic clock', () => {
  const d0 = day('d1', [period('a', 10), period('b', 5)]);
  let s = act(act(createSession({ id: 'c', day: d0 }), 'start', 0), 'next', 60 * S);
  s = act(s, 'reset', 90 * S, { day: { ...d0, version: 2 } });
  s = act(s, 'undo', 100 * S);
  assert.equal(s.state, 'running');
  assert.equal(deriveView(s, env(100 * S)).current.elapsedMs, 40 * S, '30 s before reset + 10 s until undo');
});

test('after a rebuild the double-tap guard still applies, and a stale revision is still refused', () => {
  const d0 = day('d1', [period('a', 10), period('b', 5)]);
  let s = act(createSession({ id: 'c', day: d0 }), 'start', 0);
  const old = s.rev;
  s = act(s, 'reset', 5 * S, { day: { ...d0, version: 2 } });
  assert.equal(applyAction(s, { type: 'next', rev: old }, env(6 * S)).ok, false, 'stale');
  s = act(s, 'start', 6 * S);
  assert.equal(isLikelyDoubleTap(s, { type: 'pause' }, env(6 * S + 200)), true);
});

test('the rebuilt version survives reload (paused recovery) and export/import', () => {
  const p = generateFixture({ seed: 1, scenario: 'normal', library: lib });
  const mon = p.week.days[0];
  let s = act(createSession({ id: 'c', day: mon }), 'start', 0);
  const week = W.updatePeriod(p.week, mon.id, mon.periods[0].id, { minutes: 25, title: 'Edited' });
  const proj = { ...p, week };
  s = act(s, 'reset', 2 * S, { day: week.days[0] });
  s = act(s, 'start', 5 * S);
  const saved = JSON.parse(JSON.stringify(serializeSession(s, env(65 * S))));
  const { session: r } = recoverSession(saved, env(1, { instanceId: 'inst-B' }));
  assert.equal(r.state, 'paused');
  assert.equal(r.dayVersion, week.days[0].version);
  assert.equal(r.steps[0].plannedSec, 1500);
  assert.equal(deriveView(r, env(1, { instanceId: 'inst-B' })).current.elapsedMs, 60 * S);
  const imp = importProject(exportProject(proj, saved));
  assert.equal(imp.ok, true, JSON.stringify(imp.errors));
  assert.equal(imp.clock.dayVersion, week.days[0].version);
  assert.equal(imp.clock.steps[0].title, 'Edited');
  const u = applyAction(imp.clock, { type: 'undo', rev: imp.clock.rev }, env(70 * S, { instanceId: 'inst-C' }));
  assert.equal(u.ok, true, 'undo works after import');
  const u2 = applyAction(u.session, { type: 'undo', rev: u.session.rev }, env(71 * S, { instanceId: 'inst-C' }));
  assert.equal(u2.ok, true);
  assert.equal(u2.session.dayVersion, 1, 'undo back across the reset restores the old script version');
  assert.equal(u2.session.steps[0].plannedSec, 600);
});
