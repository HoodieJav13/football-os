// Clock state machine with a fake injected monotonic clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, applyAction, deriveView } from '../src/domain/clock.js';
import { period, day, env } from './helpers.mjs';

const S = 1000;
const MIN = 60 * S;
const d3 = () => day('d1', [period('a', 10), period('b', 5), period('c', 15)]);

function run(session, steps) {
  let s = session;
  for (const [type, mono, extra] of steps) {
    const r = applyAction(s, { type, rev: s.rev, ...extra }, env(mono));
    assert.equal(r.ok, true, `${type} at ${mono}: ${r.error}`);
    s = r.session;
  }
  return s;
}

test('a new session is idle with one step per scheduled block', () => {
  const s = createSession({ id: 'clk-1', day: d3() });
  assert.equal(s.state, 'idle');
  assert.equal(s.rev, 0);
  assert.deepEqual(s.steps.map((x) => x.periodIds), [['a'], ['b'], ['c']]);
  assert.deepEqual(s.steps.map((x) => x.plannedSec), [600, 300, 900]);
  assert.ok(s.steps.every((x) => x.status === 'pending'));
});

test('parallel stations run as one step; unscheduled periods are left out', () => {
  const d = day('d1', [period('a', 20), period('b', 15, { parallel: true }), period('u', 5, { scheduled: false }), period('c', 10)]);
  const s = createSession({ id: 'clk', day: d });
  assert.deepEqual(s.steps.map((x) => x.periodIds), [['a', 'b'], ['c']]);
  assert.equal(s.steps[0].plannedSec, 1200);
});

test('start runs the first period; elapsed comes from the monotonic source, not ticks', () => {
  const s = run(createSession({ id: 'c', day: d3() }), [['start', 1000]]);
  assert.equal(s.state, 'running');
  assert.equal(s.rev, 1);
  assert.equal(s.steps[0].status, 'active');
  assert.equal(deriveView(s, env(1000 + MIN)).current.elapsedMs, MIN);
  // Irregular, delayed "ticks" do not accumulate error.
  for (const t of [1016, 1033, 9000, 45000]) deriveView(s, env(t));
  assert.equal(deriveView(s, env(1000 + 5 * MIN)).current.elapsedMs, 5 * MIN);
});

test('pause and resume exclude the paused gap', () => {
  const s = run(createSession({ id: 'c', day: d3() }), [['start', 0], ['pause', 30 * S], ['resume', 100 * S]]);
  assert.equal(deriveView(s, env(130 * S)).current.elapsedMs, 60 * S);
  const paused = run(s, [['pause', 130 * S]]);
  assert.equal(deriveView(paused, env(999 * S)).current.elapsedMs, 60 * S, 'paused time is frozen');
});

test('overrun is shown but the timer never completes a period by itself', () => {
  const s = run(createSession({ id: 'c', day: d3() }), [['start', 0]]);
  const v = deriveView(s, env(10 * MIN + 83 * S));
  assert.equal(v.current.overrun, true);
  assert.equal(v.current.remainingMs, -83 * S);
  assert.equal(v.current.status, 'active');
  assert.equal(v.state, 'running');
  assert.equal(v.index, 0);
});

test('extend adds time to the current period only', () => {
  const s = run(createSession({ id: 'c', day: d3() }), [['start', 0], ['extend', 1 * S, { sec: 60 }], ['extend', 2 * S, { sec: 120 }]]);
  assert.equal(s.steps[0].extensionSec, 180);
  assert.equal(deriveView(s, env(10 * MIN)).current.remainingMs, 3 * MIN);
  assert.equal(s.steps[1].extensionSec, 0);
  for (const sec of [0, -60, 1.5, 3601, undefined]) {
    assert.equal(applyAction(s, { type: 'extend', rev: s.rev, sec }, env(3 * S)).ok, false, `sec ${sec}`);
  }
});

test('next marks the current period done by the coach and keeps the run state', () => {
  const s = run(createSession({ id: 'c', day: d3() }), [['start', 0], ['next', 9 * MIN]]);
  assert.equal(s.steps[0].status, 'done');
  assert.equal(s.steps[0].endedBy, 'next');
  assert.equal(s.steps[0].elapsedMs, 9 * MIN);
  assert.equal(s.steps[1].status, 'active');
  assert.equal(s.state, 'running');
  assert.equal(deriveView(s, env(10 * MIN)).current.elapsedMs, MIN);
  const p = run(s, [['pause', 10 * MIN], ['next', 11 * MIN]]);
  assert.equal(p.state, 'paused');
  assert.equal(p.index, 2);
  assert.equal(deriveView(p, env(20 * MIN)).current.elapsedMs, 0);
});

test('skip marks skipped; finishing the last step completes the practice', () => {
  const s = run(createSession({ id: 'c', day: d3() }), [['start', 0], ['skip', 1 * S], ['next', 2 * S], ['next', 3 * S]]);
  assert.deepEqual(s.steps.map((x) => x.status), ['skipped', 'done', 'done']);
  assert.equal(s.state, 'completed');
  assert.equal(applyAction(s, { type: 'next', rev: s.rev }, env(4 * S)).ok, false);
  assert.equal(applyAction(s, { type: 'pause', rev: s.rev }, env(4 * S)).ok, false);
});

test('a stale revision is rejected, so a double tap cannot complete a period twice', () => {
  const s0 = run(createSession({ id: 'c', day: d3() }), [['start', 0]]);
  const first = applyAction(s0, { type: 'next', rev: s0.rev }, env(5 * S));
  const second = applyAction(first.session, { type: 'next', rev: s0.rev }, env(5 * S + 40));
  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.match(second.error, /stale/i);
  assert.deepEqual(first.session.steps.map((x) => x.status), ['done', 'active', 'pending']);
});

test('each accepted action adds exactly one revision and one history entry', () => {
  const s = run(createSession({ id: 'c', day: d3() }), [['start', 0], ['pause', 1], ['resume', 2], ['extend', 3, { sec: 60 }], ['next', 4], ['skip', 5]]);
  assert.equal(s.rev, 6);
  assert.equal(s.history.length, 6);
  assert.deepEqual(s.history.map((h) => h.type), ['start', 'pause', 'resume', 'extend', 'next', 'skip']);
});

test('undo next restores the previous period and counts the time that really passed', () => {
  const s = run(createSession({ id: 'c', day: d3() }), [['start', 0], ['next', 100 * S], ['undo', 110 * S]]);
  assert.equal(s.index, 0);
  assert.equal(s.steps[0].status, 'active');
  assert.equal(s.steps[1].status, 'pending');
  assert.equal(s.state, 'running');
  assert.equal(deriveView(s, env(110 * S)).current.elapsedMs, 110 * S);
  assert.equal(s.rev, 3, 'revision keeps increasing through undo');
  assert.equal(s.history.length, 1);
});

test('undo pause resumes as if the pause never happened; undo start returns to idle', () => {
  const s = run(createSession({ id: 'c', day: d3() }), [['start', 0], ['pause', 30 * S], ['undo', 40 * S]]);
  assert.equal(s.state, 'running');
  assert.equal(deriveView(s, env(50 * S)).current.elapsedMs, 50 * S);
  const back = run(s, [['undo', 51 * S]]);
  assert.equal(back.state, 'idle');
  assert.ok(back.steps.every((x) => x.status === 'pending' && x.elapsedMs === 0));
  const r = applyAction(back, { type: 'undo', rev: back.rev }, env(52 * S));
  assert.equal(r.ok, false);
  assert.match(r.error, /nothing to undo/i);
});

test('undo extend removes the extension; undo skip restores the skipped period', () => {
  const s = run(createSession({ id: 'c', day: d3() }), [['start', 0], ['extend', 1 * S, { sec: 60 }], ['undo', 2 * S]]);
  assert.equal(s.steps[0].extensionSec, 0);
  const k = run(s, [['skip', 3 * S], ['undo', 4 * S]]);
  assert.equal(k.steps[0].status, 'active');
  assert.equal(k.index, 0);
});

test('reset is explicit, returns to idle and can be undone', () => {
  // Reset rebuilds from the current version of the day (F1); the plan here is unchanged.
  const s = run(createSession({ id: 'c', day: d3() }), [['start', 0], ['next', 60 * S], ['pause', 90 * S], ['reset', 100 * S, { day: d3() }]]);
  assert.equal(s.state, 'idle');
  assert.ok(s.steps.every((x) => x.status === 'pending'));
  const u = run(s, [['undo', 110 * S]]);
  assert.equal(u.state, 'paused');
  assert.equal(u.index, 1);
  assert.equal(deriveView(u, env(200 * S)).current.elapsedMs, 30 * S);
  const none = applyAction(createSession({ id: 'c', day: d3() }), { type: 'reset', rev: 0, day: d3() }, env(0));
  assert.equal(none.ok, false, 'nothing to reset');
  assert.match(none.error, /nothing to reset/i);
});

test('start on a day with no scheduled periods is refused', () => {
  const r = applyAction(createSession({ id: 'c', day: day('d', []) }), { type: 'start', rev: 0 }, env(0));
  assert.equal(r.ok, false);
  assert.match(r.error, /no scheduled/i);
});

test('a full scripted practice: one transition per action and no double completion', () => {
  const d = day('d1', [period('a', 10), period('b', 5), period('c', 15), period('d', 5)]);
  let s = createSession({ id: 'c', day: d });
  const doneCount = (x) => x.steps.filter((st) => st.status === 'done' || st.status === 'skipped').length;
  const script = [
    ['start', 0, 0], ['pause', 4 * MIN, 0], ['resume', 6 * MIN, 0], ['extend', 7 * MIN, 0, { sec: 120 }],
    ['next', 12 * MIN, 1], ['skip', 13 * MIN, 2], ['undo', 13 * MIN + 5 * S, 1], ['next', 18 * MIN, 2],
    ['next', 33 * MIN, 3], ['next', 38 * MIN, 4],
  ];
  for (const [type, mono, expectDone, extra] of script) {
    const before = s.rev;
    s = applyAction(s, { type, rev: s.rev, ...extra }, env(mono)).session;
    assert.equal(s.rev, before + 1, type);
    assert.equal(doneCount(s), expectDone, `${type} done count`);
  }
  assert.equal(s.state, 'completed');
  assert.equal(s.steps[0].elapsedMs, 10 * MIN, 'first period: 12 min wall minus 2 min paused');
  assert.equal(s.steps[1].status, 'done', 'skip was undone, then the coach advanced');
});
