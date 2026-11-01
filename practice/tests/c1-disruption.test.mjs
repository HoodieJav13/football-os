// C1: practice disruption and recovery — a late period, an unavailable
// station, coach-chosen rebalancing of the remaining time, the debrief and the
// unfinished-work handoff. Built on the accepted clock (845467f); every change
// is a coach action with an undo snapshot, and no work is dropped silently.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, applyAction, deriveView, serializeSession, recoverSession, clockErrors } from '../src/domain/clock.js';
import { projection, proposeRebalance, proposeStation, stepOutcomes, unfinishedWork, buildRecord, updateRecord, carryOver, MIN_STEP_SEC } from '../src/domain/disruption.js';
import { exportProject, importProject, validateProject } from '../src/domain/project.js';
import { generateFixture } from '../src/domain/fixtures.js';
import { period, day, env, loadLibrary, seqIds } from './helpers.mjs';

const S = 1000;
const MIN = 60 * S;
// a 10 | b 10 | s1 + s2 (parallel stations, 20) | c 15 | d 15 = 70 min
const dayD = () => day('d1', [period('a', 10), period('b', 10), period('s1', 20, { title: 'Station 1' }), period('s2', 20, { title: 'Station 2', parallel: true }), period('c', 15), period('d', 15)]);

function act(s, type, mono, extra = {}) {
  const r = applyAction(s, { type, rev: s.rev, ...extra }, env(mono));
  assert.equal(r.ok, true, `${type} at ${mono}: ${r.error}`);
  return r.session;
}
const ids = (s) => s.steps.map((x) => x.periodIds.join('+'));
const allIds = (s) => [...s.steps.flatMap((x) => x.periodIds), ...s.unfinished.map((u) => u.periodId)].sort();

// Running, period a is 6 minutes over (16 min elapsed on a 10 min period).
function lateSession() {
  let s = createSession({ id: 'clk-1', day: dayD() });
  s = act(s, 'start', 0);
  return { s, now: 16 * MIN };
}

test('a new session keeps the original plan and starts with no unfinished work or changes', () => {
  const s = createSession({ id: 'clk-1', day: dayD() });
  assert.deepEqual(s.plan.steps.map((x) => x.periodIds.join('+')), ['a', 'b', 's1+s2', 'c', 'd']);
  assert.equal(s.plan.dayVersion, 1);
  assert.deepEqual(s.plan.periods.map((x) => [x.id, x.title, x.minutes]), [['a', 'Period a', 10], ['b', 'Period b', 10], ['s1', 'Station 1', 20], ['s2', 'Station 2', 20], ['c', 'Period c', 15], ['d', 'Period d', 15]]);
  assert.deepEqual(s.unfinished, []);
  assert.deepEqual(s.changes, []);
  assert.deepEqual(clockErrors(s), []);
});

test('a late period shows how far behind the plan the practice is', () => {
  const { s, now } = lateSession();
  const p = projection(s, env(now));
  assert.equal(p.planSec, 70 * 60);
  assert.equal(p.elapsedSec, 16 * 60);
  assert.equal(p.currentRemainingSec, 0);
  assert.equal(p.lateBySec, 6 * 60);
  assert.equal(p.minutesLeft, 54, 'minutes left to the planned end');
  const onTime = projection(s, env(4 * MIN));
  assert.equal(onTime.lateBySec, 0);
});

test('rebalance "fit": remaining periods shrink in whole minutes, never below the floor, never negative, and fit the time left', () => {
  const { s, now } = lateSession();
  const r = proposeRebalance(s, env(now), { minutesLeft: 54, mode: 'fit' });
  assert.equal(r.fits, true);
  const rows = r.preview.rows;
  assert.deepEqual(rows.map((x) => x.title), ['Period b', 'Station 1 + Station 2', 'Period c', 'Period d']);
  for (const row of rows) {
    assert.ok(row.toSec % 60 === 0 && row.toSec >= Math.min(MIN_STEP_SEC, row.fromSec) && row.toSec <= row.fromSec, JSON.stringify(row));
  }
  assert.ok(rows.reduce((a, x) => a + x.toSec, 0) <= 54 * 60);
  assert.ok(rows.some((x) => x.toSec < x.fromSec), 'something was shortened');
  assert.deepEqual(r.change.unfinished, []);
});

test('rebalance "keep": durations stay and the preview says how late it will finish', () => {
  const { s, now } = lateSession();
  const r = proposeRebalance(s, env(now), { minutesLeft: 54, mode: 'keep' });
  assert.equal(r.fits, false);
  assert.equal(r.overBySec, 6 * 60);
  assert.ok(r.preview.rows.every((x) => x.toSec === x.fromSec));
});

test('rebalance with a period moved to unfinished work: nothing is dropped silently', () => {
  const { s, now } = lateSession();
  const r = proposeRebalance(s, env(now), { minutesLeft: 54, mode: 'fit', deferIndexes: [4] });
  assert.equal(r.fits, true);
  assert.deepEqual(r.change.unfinished.map((u) => [u.periodId, u.reason, u.plannedSec]), [['d', 'deferred', 900]]);
  assert.equal(r.preview.rows.find((x) => x.index === 4).deferred, true);
  const after = act(s, 'revise', now, { change: r.change });
  assert.deepEqual(ids(after), ['a', 'b', 's1+s2', 'c']);
  assert.deepEqual(allIds(after), ['a', 'b', 'c', 'd', 's1', 's2']);
  assert.equal(after.steps[0].elapsedMs, 16 * MIN, 'the running period keeps its time');
  assert.equal(after.changes.length, 1);
  assert.match(after.changes[0].summary, /Period d/);
});

test('when even the floors do not fit, the proposal says so instead of making periods vanish', () => {
  const { s, now } = lateSession();
  const r = proposeRebalance(s, env(now), { minutesLeft: 6, mode: 'fit' }); // four 2-minute floors need 8
  assert.equal(r.fits, false);
  assert.ok(r.overBySec > 0);
  assert.ok(r.preview.rows.every((x) => x.toSec >= Math.min(MIN_STEP_SEC, x.fromSec)));
});

test('applying a revision is refused when stale, or when it would lose or invent work', () => {
  const { s, now } = lateSession();
  const r = proposeRebalance(s, env(now), { minutesLeft: 54, mode: 'fit' });
  assert.match(applyAction(s, { type: 'revise', rev: s.rev - 1, change: r.change }, env(now)).error, /Stale/);
  const lost = structuredClone(r.change);
  lost.pending.pop();
  assert.match(applyAction(s, { type: 'revise', rev: s.rev, change: lost }, env(now)).error, /accounted|missing/i);
  const negative = structuredClone(r.change);
  negative.pending[0].plannedSec = -60;
  assert.match(applyAction(s, { type: 'revise', rev: s.rev, change: negative }, env(now)).error, /seconds/i);
  const invented = structuredClone(r.change);
  invented.pending.push({ periodIds: ['zz'], plannedSec: 600 });
  assert.match(applyAction(s, { type: 'revise', rev: s.rev, change: invented }, env(now)).error, /accounted|unknown|not in/i);
});

test('undo restores the plan exactly as it was before the revision', () => {
  const { s, now } = lateSession();
  const before = s;
  const after = act(s, 'revise', now, { change: proposeRebalance(s, env(now), { minutesLeft: 54, mode: 'fit', deferIndexes: [4] }).change });
  const undone = act(after, 'undo', now + 1000);
  assert.deepEqual(ids(undone), ids(before));
  assert.deepEqual(undone.steps.map((x) => x.plannedSec), before.steps.map((x) => x.plannedSec));
  assert.deepEqual(undone.unfinished, []);
  assert.deepEqual(undone.changes, []);
  assert.equal(undone.state, 'running');
});

test('an unavailable parallel station can run later today or move to unfinished work', () => {
  let s = createSession({ id: 'clk-1', day: dayD() });
  s = act(s, 'start', 0);
  s = act(s, 'next', 10 * MIN);
  s = act(s, 'next', 20 * MIN); // now on the stations block
  const later = proposeStation(s, env(21 * MIN), 's2', 'later');
  assert.equal(later.error, undefined);
  const a = act(s, 'revise', 21 * MIN, { change: later.change });
  assert.deepEqual(ids(a), ['a', 'b', 's1', 's2', 'c', 'd']);
  assert.equal(a.steps[2].title, 'Station 1');
  assert.equal(a.steps[3].plannedSec, 20 * 60);
  assert.equal(a.steps[3].origin, 'moved');
  assert.deepEqual(a.steps[2].removed.map((x) => [x.periodId, x.reason]), [['s2', 'station-unavailable']]);
  const defer = act(s, 'revise', 21 * MIN, { change: proposeStation(s, env(21 * MIN), 's2', 'defer').change });
  assert.deepEqual(ids(defer), ['a', 'b', 's1', 'c', 'd']);
  assert.deepEqual(defer.unfinished.map((u) => [u.periodId, u.reason]), [['s2', 'station-unavailable']]);
  assert.ok(proposeStation(s, env(21 * MIN), 'a', 'defer').error, 'a finished period cannot be changed');
  // The only station of the current period is ended with Skip, not removed.
  const single = act(createSession({ id: 'c2', day: dayD() }), 'start', 0);
  assert.match(proposeStation(single, env(MIN), 'a', 'defer').error, /only station|Skip/i);
  // A station of a later period can be handled before it starts.
  const early = act(single, 'revise', MIN, { change: proposeStation(single, env(MIN), 's1', 'defer').change });
  assert.deepEqual(ids(early), ['a', 'b', 's2', 'c', 'd']);
});

test('after a revision the clock still advances, completes, and reports what really happened', () => {
  const { s, now } = lateSession();
  let x = act(s, 'revise', now, { change: proposeRebalance(s, env(now), { minutesLeft: 54, mode: 'fit', deferIndexes: [4] }).change });
  const shortenedPlanned = x.steps[1].plannedSec;
  x = act(x, 'next', now);                                         // a: ran 16 min of 10 (late)
  x = act(x, 'next', now + 3 * MIN);                               // b: ended early
  x = act(x, 'skip', now + 4 * MIN);                               // stations: skipped
  x = act(x, 'next', now + 4 * MIN + x.steps[3].plannedSec * S);   // c: ran its (possibly shortened) time
  assert.equal(x.state, 'completed');
  const out = stepOutcomes(x);
  assert.deepEqual(out.map((o) => o.outcome), ['completed', shortenedPlanned < 600 ? 'shortened' : 'ended-early', 'skipped', x.steps[3].originalSec ? 'shortened' : 'completed']);
  assert.match(out[1].text, /early|Shortened/);
  for (const o of out.filter((y) => y.outcome === 'shortened')) assert.match(o.text, /Shortened by coach .* → /);
  const work = unfinishedWork(x);
  assert.deepEqual(work.map((w) => [w.periodId, w.reason]).sort(), [['d', 'deferred'], ['s1', 'skipped'], ['s2', 'skipped']]);
});

test('save and reopen: the revised script, unfinished work and change log survive a reload', () => {
  const { s, now } = lateSession();
  const x = act(s, 'revise', now, { change: proposeRebalance(s, env(now), { minutesLeft: 54, mode: 'fit', deferIndexes: [4] }).change });
  const saved = JSON.parse(JSON.stringify(serializeSession(x, env(now + 5 * S))));
  const { session: back, recovered } = recoverSession(saved, env(1000, { instanceId: 'inst-B' }));
  assert.equal(recovered, true);
  assert.equal(back.state, 'paused');
  assert.deepEqual(ids(back), ids(x));
  assert.deepEqual(back.unfinished, x.unfinished);
  assert.deepEqual(back.changes, x.changes);
  assert.deepEqual(clockErrors(back), []);
});

test('saved clocks are validated, including the new fields; older clocks without them stay valid', () => {
  const { s, now } = lateSession();
  const x = act(s, 'revise', now, { change: proposeRebalance(s, env(now), { minutesLeft: 54, mode: 'fit', deferIndexes: [4] }).change });
  const bad = structuredClone(x);
  bad.unfinished[0].plannedSec = -5;
  assert.ok(clockErrors(bad).some((e) => e.path === 'clock.unfinished[0].plannedSec'));
  const dup = structuredClone(x);
  dup.unfinished.push({ ...dup.unfinished[0], periodId: 'a' });
  assert.ok(clockErrors(dup).some((e) => /more than once/.test(e.message)));
  const old = structuredClone(s);
  delete old.plan; delete old.unfinished; delete old.changes;
  assert.deepEqual(clockErrors(old), []);
  assert.equal(deriveView(old, env(now)).state, 'running');
});

test('reset clears revisions and unfinished work and rebuilds the plan; undo brings them back', () => {
  const { s, now } = lateSession();
  const x = act(s, 'revise', now, { change: proposeRebalance(s, env(now), { minutesLeft: 54, mode: 'fit', deferIndexes: [4] }).change });
  const r = act(x, 'reset', now, { day: dayD() });
  assert.deepEqual(r.unfinished, []);
  assert.deepEqual(r.changes, []);
  assert.equal(r.steps.length, 5);
  const u = act(r, 'undo', now);
  assert.deepEqual(u.unfinished, x.unfinished);
});

// ---------------------------------------------------------------- debrief and handoff
function completedFixtureRun() {
  const lib = loadLibrary();
  const p = generateFixture({ seed: 42, scenario: 'example', library: lib });
  const d = p.week.days[2]; // Wednesday: has two parallel stations
  let s = createSession({ id: 'clk-w', day: d });
  s = act(s, 'start', 0);
  const stationsIndex = s.steps.findIndex((x) => x.periodIds.length > 1);
  let t = 0;
  for (let i = 0; i < stationsIndex; i++) { t += s.steps[s.index].plannedSec * S; s = act(s, 'next', t); }
  const unavailable = s.steps[stationsIndex].periodIds[1];
  s = act(s, 'revise', t + MIN, { change: proposeStation(s, env(t + MIN), unavailable, 'defer').change });
  while (s.state !== 'completed') { t += s.steps[s.index].plannedSec * S; s = act(s, 'next', t); }
  return { p, d, s, unavailable };
}

test('a debrief record keeps notes, outcomes and unfinished work; it validates and survives export and import', () => {
  const { p, d, s, unavailable } = completedFixtureRun();
  const rec = buildRecord(s, d, { id: 'rec-1', notes: 'Fictional debrief: stations ran short on space.', wall: 1_800_000_000_000 });
  assert.equal(rec.dayId, d.id);
  assert.equal(rec.unfinished.length, 1);
  assert.equal(rec.unfinished[0].periodId, unavailable);
  assert.equal(rec.unfinished[0].carriedTo, null);
  const proj = { ...p, records: [rec] };
  assert.deepEqual(validateProject(proj).errors, []);
  const back = importProject(exportProject(proj, null));
  assert.equal(back.ok, true, JSON.stringify(back.errors));
  assert.deepEqual(back.project.records, [rec]);
  const older = importProject(exportProject(p, null));
  assert.deepEqual(older.project.records, [], 'an export without records imports with none');
  const bad = structuredClone(proj);
  bad.records[0].unfinished[0].reason = 'vanished';
  assert.ok(validateProject(bad).errors.some((e) => /records\[0\]\.unfinished\[0\]\.reason/.test(e.path)));
});

test('carrying unfinished work to a later day adds an unscheduled period there and marks the item carried', () => {
  const { p, d, s, unavailable } = completedFixtureRun();
  const rec = buildRecord(s, d, { id: 'rec-1', notes: '', wall: 1 });
  const proj = { ...p, records: [rec] };
  const to = p.week.days[3];
  const r = carryOver(proj, 'rec-1', rec.unfinished[0].id, to.id, seqIds('per'));
  assert.equal(r.error, undefined);
  const toAfter = r.project.week.days.find((x) => x.id === to.id);
  const added = toAfter.periods[toAfter.periods.length - 1];
  assert.equal(added.scheduled, false, 'added unscheduled: the coach places it');
  assert.match(added.notes, /Carried over from Wednesday/);
  assert.equal(added.minutes, d.periods.find((x) => x.id === unavailable).minutes);
  assert.equal(toAfter.version, to.version + 1);
  assert.deepEqual(r.project.records[0].unfinished[0].carriedTo, { dayId: to.id, periodId: added.id });
  assert.deepEqual(validateProject(r.project).errors, []);
  assert.ok(carryOver(r.project, 'rec-1', rec.unfinished[0].id, to.id, seqIds('per')).error, 'cannot carry the same item twice');
});

test('each change-log entry describes only what that change did', () => {
  let s = createSession({ id: 'clk-1', day: dayD() });
  s = act(s, 'start', 0);
  s = act(s, 'revise', 16 * MIN, { change: proposeRebalance(s, env(16 * MIN), { minutesLeft: 54, mode: 'fit' }).change });
  assert.match(s.changes[0].summary, /→/);
  s = act(s, 'revise', 17 * MIN, { change: proposeStation(s, env(17 * MIN), 's2', 'defer').change });
  assert.equal(s.changes.length, 2);
  assert.doesNotMatch(s.changes[1].summary, /Period c|Period d|Period b/, s.changes[1].summary);
  assert.match(s.changes[1].summary, /Station 2/);
  assert.ok(s.steps.some((x) => Number.isInteger(x.originalSec) && x.plannedSec < x.originalSec), 'earlier shortening is still recorded on the steps');
});

// ---------------------------------------------------------------- focused review fixes
test('updating a saved debrief recomputes unfinished work and keeps where items were carried', () => {
  const { p, d, s } = completedFixtureRun();
  const rec = buildRecord(s, d, { id: 'rec-1', notes: 'first', wall: 1 });
  const carried = carryOver({ ...p, records: [rec] }, 'rec-1', rec.unfinished[0].id, p.week.days[3].id, seqIds('per')).project.records[0];
  // Undo the last Next and skip that period instead: one more unfinished item.
  let x = act(s, 'undo', 10_000 * MIN);
  x = act(x, 'skip', 10_001 * MIN);
  const up = updateRecord(carried, x, d, { notes: 'second', wall: 2 });
  assert.equal(up.id, 'rec-1');
  assert.equal(up.notes, 'second');
  assert.equal(up.unfinished.length, 2, JSON.stringify(up.unfinished));
  const kept = up.unfinished.find((u) => u.periodId === carried.unfinished[0].periodId);
  assert.deepEqual(kept.carriedTo, carried.unfinished[0].carriedTo, 'carried state kept by period');
  assert.equal(up.unfinished.find((u) => u.reason === 'skipped').carriedTo, null);
});

test('a debrief belongs to one run: after Reset a new run gets its own record and no old draft', () => {
  const { s } = completedFixtureRun();
  const withDraft = { ...s, debriefDraft: 'old run notes' };
  const r = act(withDraft, 'reset', 20_000 * MIN, { day: generateFixture({ seed: 42, scenario: 'example', library: loadLibrary() }).week.days[2] });
  assert.equal(r.debriefDraft, undefined, 'the new run starts with an empty draft');
  assert.equal(act(r, 'undo', 20_000 * MIN).debriefDraft, 'old run notes', 'undo brings the draft back');
  const again = act(r, 'start', 20_001 * MIN);
  assert.notEqual(again.startedWall, s.startedWall, 'runs are told apart by their start');
});

test('rebalance can be anchored to an end time: seconds left count down as time passes', () => {
  const { s } = lateSession();
  const a = proposeRebalance(s, env(16 * MIN), { secondsLeft: 54 * 60, mode: 'fit' });
  const b = proposeRebalance(s, env(16 * MIN), { secondsLeft: 49 * 60, mode: 'fit' });
  assert.equal(a.preview.availableSec - b.preview.availableSec, 5 * 60);
  assert.ok(b.preview.keptSec <= 49 * 60);
});

test('carry-over refuses the debrief\'s own day and a period already carried to that day by another debrief', () => {
  const { p, d, s } = completedFixtureRun();
  const r1 = buildRecord(s, d, { id: 'rec-1', notes: '', wall: 1 });
  const r2 = buildRecord(s, d, { id: 'rec-2', notes: '', wall: 2 });
  const proj = { ...p, records: [r1, r2] };
  assert.ok(carryOver(proj, 'rec-1', r1.unfinished[0].id, d.id, seqIds('per')).error, 'not to its own day');
  const once = carryOver(proj, 'rec-1', r1.unfinished[0].id, p.week.days[3].id, seqIds('per')).project;
  assert.match(carryOver(once, 'rec-2', r2.unfinished[0].id, p.week.days[3].id, seqIds('per')).error, /already carried/i);
});

test('a malformed debrief draft inside undo history is refused on import, before anything is replaced', () => {
  const { p, s } = completedFixtureRun();
  const r = act({ ...s, debriefDraft: 'notes' }, 'reset', 30_000 * MIN, { day: p.week.days[2] });
  const bad = structuredClone(r);
  bad.history[bad.history.length - 1].before.debriefDraft = 12345;
  const res = importProject(exportProject(p, bad));
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => /clock\.history\[\d+\]\.before\.debriefDraft/.test(e.path)), JSON.stringify(res.errors.slice(0, 3)));
  const good = importProject(exportProject(p, r));
  assert.equal(good.ok, true, JSON.stringify(good.errors));
});

test('handoff item ids stay unique when a debrief is updated after a carried item stopped being unfinished', () => {
  let s = createSession({ id: 'clk-u', day: dayD() });
  s = act(s, 'start', 0);
  s = act(s, 'next', 10 * MIN);
  s = act(s, 'skip', 11 * MIN); // b skipped
  while (s.state !== 'completed') s = act(s, 'next', 60 * MIN + s.index * MIN);
  const d = dayD();
  const proj = { week: { id: 'wk', version: 1, days: [d, day('d2', [period('z', 10)])] }, records: [buildRecord(s, d, { id: 'rec', wall: 1 })] };
  const carried = carryOver(proj, 'rec', proj.records[0].unfinished[0].id, 'd2', seqIds('per')).project.records[0];
  // Back in time: b now completes, a is skipped instead.
  let x = s;
  while (x.index > 0 || x.state === 'completed') { x = act(x, 'undo', 90 * MIN); if (x.index === 0 && x.state !== 'completed') break; }
  x = act(x, 'skip', 91 * MIN);
  while (x.state !== 'completed') x = act(x, 'next', 92 * MIN + x.index * MIN);
  const up = updateRecord(carried, x, d, { wall: 2 });
  const ids = up.unfinished.map((u) => u.id);
  assert.equal(new Set(ids).size, ids.length, JSON.stringify(up.unfinished));
  assert.ok(up.unfinished.some((u) => u.periodId === 'b' && u.carriedTo), 'the carried item is still listed');
  const dupRec = structuredClone(up);
  dupRec.unfinished[1].id = dupRec.unfinished[0].id;
  assert.ok(validateProject({ ...generateFixture({ seed: 42, scenario: 'example', library: loadLibrary() }), records: [dupRec] }).errors.some((e) => /unfinished\[1\]\.id/.test(e.path)));
});
