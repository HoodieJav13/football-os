// Reload recovery, delayed ticks, wall-clock changes and competing writers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, applyAction, deriveView, serializeSession, recoverSession, detectClockAnomaly } from '../src/domain/clock.js';
import { evaluateLease, makeLease, planWrite, LEASE_TTL_MS } from '../src/domain/guard.js';
import { period, day, env } from './helpers.mjs';

const S = 1000;
const d3 = () => day('d1', [period('a', 10), period('b', 5), period('c', 15)]);
const act = (s, type, e, extra) => {
  const r = applyAction(s, { type, rev: s.rev, ...extra }, e);
  assert.equal(r.ok, true, r.error);
  return r.session;
};
// A JSON round trip stands in for localStorage between page loads.
const reload = (s) => JSON.parse(JSON.stringify(s));

test('serializeSession checkpoints the live elapsed time without a new revision', () => {
  let s = act(createSession({ id: 'c', day: d3() }), 'start', env(0));
  const saved = serializeSession(s, env(42 * S));
  assert.equal(saved.rev, s.rev);
  assert.equal(saved.checkpoint.elapsedMs, 42 * S);
  assert.equal(saved.checkpoint.index, 0);
  assert.equal(saved.checkpoint.instanceId, 'inst-A');
});

test('reload while running recovers as paused at the checkpoint with an explicit resume', () => {
  let s = act(createSession({ id: 'c', day: d3() }), 'start', env(0));
  s = act(s, 'next', env(100 * S));
  const saved = reload(serializeSession(s, env(130 * S)));
  // New page: performance.now() restarts near 0, wall clock is 5 minutes later.
  const e2 = env(500, { instanceId: 'inst-B', wall: env(130 * S).wall + 300 * S });
  const { session: r, recovered } = recoverSession(saved, e2);
  assert.equal(recovered, true);
  assert.equal(r.state, 'paused');
  assert.equal(r.recovery.wasState, 'running');
  assert.equal(r.recovery.awayEstimateMs, 300 * S);
  assert.equal(deriveView(r, e2).current.elapsedMs, 30 * S, 'time away is not fabricated');
  assert.equal(r.steps[0].status, 'done');
  assert.equal(r.index, 1);
  const resumed = act(r, 'resume', e2);
  assert.equal(resumed.recovery, null);
  assert.equal(deriveView(resumed, { ...e2, mono: 500 + 10 * S }).current.elapsedMs, 40 * S);
});

test('a session saved while paused recovers paused and unchanged', () => {
  let s = act(createSession({ id: 'c', day: d3() }), 'start', env(0));
  s = act(s, 'pause', env(70 * S));
  const { session: r, recovered } = recoverSession(reload(serializeSession(s, env(80 * S))), env(10, { instanceId: 'inst-B' }));
  assert.equal(recovered, true);
  assert.equal(r.state, 'paused');
  assert.equal(r.recovery.wasState, 'paused');
  assert.equal(deriveView(r, env(10, { instanceId: 'inst-B' })).current.elapsedMs, 70 * S);
});

test('the same page instance is not treated as a recovery', () => {
  const s = act(createSession({ id: 'c', day: d3() }), 'start', env(0));
  const { session: r, recovered } = recoverSession(serializeSession(s, env(5 * S)), env(6 * S));
  assert.equal(recovered, false);
  assert.equal(r.state, 'running');
});

test('a wall clock set backwards does not change elapsed and gives no negative estimate', () => {
  let s = act(createSession({ id: 'c', day: d3() }), 'start', env(0));
  const back = { mono: 60 * S, wall: env(0).wall - 3600 * S, instanceId: 'inst-A' };
  assert.equal(deriveView(s, back).current.elapsedMs, 60 * S);
  const saved = serializeSession(s, env(60 * S));
  const { session: r } = recoverSession(reload(saved), { mono: 1, wall: env(0).wall - 7200 * S, instanceId: 'inst-B' });
  assert.equal(r.recovery.awayEstimateMs, null);
  assert.equal(deriveView(r, { mono: 1, wall: 0, instanceId: 'inst-B' }).current.elapsedMs, 60 * S);
});

test('detectClockAnomaly flags sleep or wall-clock jumps, not ordinary jitter', () => {
  const a = { mono: 1000, wall: 5_000_000 };
  assert.equal(detectClockAnomaly(a, { mono: 2000, wall: 5_001_050 }).anomaly, false);
  const slept = detectClockAnomaly(a, { mono: 2000, wall: 5_000_000 + 120 * S });
  assert.equal(slept.anomaly, true);
  assert.equal(slept.kind, 'wall-ahead');
  assert.equal(detectClockAnomaly(a, { mono: 2000, wall: 4_000_000 }).kind, 'wall-behind');
});

test('undo of an action from before the reload restores a paused state and flags it', () => {
  let s = act(createSession({ id: 'c', day: d3() }), 'start', env(0));
  s = act(s, 'next', env(100 * S));
  const { session: r } = recoverSession(reload(serializeSession(s, env(110 * S))), env(5, { instanceId: 'inst-B' }));
  const u = act(r, 'undo', env(10, { instanceId: 'inst-B' }));
  assert.equal(u.index, 0);
  assert.equal(u.state, 'paused');
  assert.equal(deriveView(u, env(20, { instanceId: 'inst-B' })).current.elapsedMs, 100 * S);
  assert.match(u.notice, /before the reload/i);
});

test('after recovery one next completes exactly one period', () => {
  let s = act(createSession({ id: 'c', day: d3() }), 'start', env(0));
  const { session: r } = recoverSession(reload(serializeSession(s, env(30 * S))), env(1, { instanceId: 'inst-B' }));
  const n = applyAction(r, { type: 'next', rev: r.rev }, env(2, { instanceId: 'inst-B' }));
  const again = applyAction(n.session, { type: 'next', rev: r.rev }, env(3, { instanceId: 'inst-B' }));
  assert.equal(again.ok, false);
  assert.deepEqual(n.session.steps.map((x) => x.status), ['done', 'active', 'pending']);
});

test('lease: free, mine, other, expired and future-dated', () => {
  const now = 10_000_000;
  assert.equal(evaluateLease(null, 'A', now), 'free');
  assert.equal(evaluateLease('garbage', 'A', now), 'free');
  assert.equal(evaluateLease(makeLease('A', now - 1000), 'A', now), 'mine');
  assert.equal(evaluateLease(makeLease('B', now - 1000), 'A', now), 'other');
  assert.equal(evaluateLease(makeLease('B', now - LEASE_TTL_MS - 1), 'A', now), 'free');
  assert.equal(evaluateLease(makeLease('B', now + LEASE_TTL_MS + 5000), 'A', now), 'free', 'a lease from the future after a clock change is stale');
});

test('planWrite: saved data removed elsewhere is not silently recreated by an old tab', () => {
  const now = 1_000_000;
  const lease = makeLease('A', now);
  assert.deepEqual(planWrite({ lease, myId: 'A', now, storedRev: null, baseRev: 12 }), { allowed: false, reason: 'conflict' });
  assert.deepEqual(planWrite({ lease, myId: 'A', now, storedRev: undefined, baseRev: 12 }), { allowed: false, reason: 'conflict' });
  assert.deepEqual(planWrite({ lease, myId: 'A', now, storedRev: null, baseRev: null }), { allowed: true, reason: 'ok' }, 'first save ever');
});

test('planWrite: two tabs never both write; takeover is explicit; stale revisions conflict', () => {
  const store = new Map();
  const now = 50_000_000;
  // Tab A opens first and takes the free lease.
  assert.equal(evaluateLease(store.get('lease'), 'A', now), 'free');
  store.set('lease', makeLease('A', now));
  let w = planWrite({ lease: store.get('lease'), myId: 'A', now, storedRev: null, baseRev: null });
  assert.deepEqual(w, { allowed: true, reason: 'ok' });
  store.set('rev', 1);
  // Tab B opens: read-only.
  assert.equal(evaluateLease(store.get('lease'), 'B', now + 100), 'other');
  w = planWrite({ lease: store.get('lease'), myId: 'B', now: now + 100, storedRev: 1, baseRev: 1 });
  assert.deepEqual(w, { allowed: false, reason: 'read-only' });
  // B takes over explicitly; A can no longer write.
  store.set('lease', makeLease('B', now + 200));
  store.set('rev', 2);
  w = planWrite({ lease: store.get('lease'), myId: 'A', now: now + 300, storedRev: 2, baseRev: 1 });
  assert.equal(w.allowed, false);
  // Even holding the lease, a stale base revision is a conflict, not an overwrite.
  w = planWrite({ lease: store.get('lease'), myId: 'B', now: now + 300, storedRev: 3, baseRev: 2 });
  assert.deepEqual(w, { allowed: false, reason: 'conflict' });
  w = planWrite({ lease: store.get('lease'), myId: 'B', now: now + 300, storedRev: 2, baseRev: 2 });
  assert.deepEqual(w, { allowed: true, reason: 'ok' });
});
