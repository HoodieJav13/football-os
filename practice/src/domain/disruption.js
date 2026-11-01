// C1 — practice disruption and recovery. Pure helpers around the accepted clock:
// how late the practice is, coach-chosen proposals for the remaining time and
// for an unavailable station (applied with the clock's undoable `revise`
// action), what really happened to each period, and the saved debrief with its
// unfinished-work handoff to a later day.
import { deriveView, CLOCK_STATES } from './clock.js';
import { addPeriod, newPeriod } from './week.js';
import { formatElapsed } from './time.js';

export const MIN_STEP_SEC = 120; // rebalancing never shortens a period below 2 minutes (or below its own length)
export const OUTCOMES = ['completed', 'ended-early', 'shortened', 'skipped', 'not-reached', 'in-progress'];
export const WORK_REASONS = ['deferred', 'station-unavailable', 'skipped', 'not-reached'];
export const RECORD_LIMITS = { notes: 4000, records: 200 };
const EARLY_TOLERANCE_MS = 30_000;

const sum = (xs) => xs.reduce((a, x) => a + x, 0);
const planTotalSec = (s) => (s.plan ? sum(s.plan.steps.map((x) => x.plannedSec)) : sum(s.steps.map((x) => x.originalSec ?? x.plannedSec)));
const periodSec = (s, id, fallback) => {
  const m = (s.plan?.periods || []).find((x) => x.id === id)?.minutes;
  return m !== undefined ? m * 60 : fallback;
};

// How the practice stands against its original plan, right now.
export function projection(s, env) {
  const v = deriveView(s, env);
  const planSec = planTotalSec(s);
  const done = s.state === 'completed' ? s.steps.length : s.index;
  const elapsedMs = sum(s.steps.slice(0, done).map((x) => x.elapsedMs)) + (s.state !== 'idle' && v.current ? v.current.elapsedMs : 0);
  const elapsedSec = Math.floor(elapsedMs / 1000);
  const currentRemainingSec = v.current ? Math.max(0, Math.ceil(v.current.remainingMs / 1000)) : 0;
  const pendingSec = s.state === 'completed' ? 0 : sum(s.steps.slice(s.index + 1).map((x) => x.plannedSec + x.extensionSec));
  const projectedSec = elapsedSec + currentRemainingSec + pendingSec;
  return {
    planSec, elapsedSec, currentRemainingSec, pendingSec, projectedSec,
    lateBySec: Math.max(0, projectedSec - planSec),
    minutesLeft: Math.max(0, Math.floor((planSec - elapsedSec) / 60)),
  };
}

// Water-fill: scale the kept periods down to `available`, none below its floor,
// in whole minutes. Returns null when even the floors do not fit.
function fitDurations(froms, available) {
  const floors = froms.map((f) => Math.min(MIN_STEP_SEC, f));
  if (sum(floors) > available) return null;
  const fixed = new Set();
  let scaled = froms.slice();
  for (let round = 0; round < froms.length + 1; round++) {
    const budget = available - sum([...fixed].map((i) => floors[i]));
    const flex = froms.map((f, i) => (fixed.has(i) ? 0 : f));
    const scale = sum(flex) ? budget / sum(flex) : 0;
    let changed = false;
    scaled = froms.map((f, i) => {
      if (fixed.has(i)) return floors[i];
      const t = f * scale;
      if (t < floors[i]) { fixed.add(i); changed = true; return floors[i]; }
      return t;
    });
    if (!changed) break;
  }
  return scaled.map((t, i) => Math.max(floors[i], Math.min(froms[i], Math.floor(t / 60) * 60)));
}

// opts: { minutesLeft | secondsLeft, mode: 'fit' | 'keep', deferIndexes: [step index, ...] }
// secondsLeft lets the run screen anchor the end time so it counts down while
// the coach decides; minutesLeft is a plain number of minutes from now.
export function proposeRebalance(s, env, { minutesLeft, secondsLeft, mode = 'fit', deferIndexes = [] } = {}) {
  if (s.state === 'completed') return { error: 'The practice is complete; there is no remaining time to rebalance.' };
  const p = projection(s, env);
  const leftSec = Number.isFinite(secondsLeft) ? Math.max(0, Math.floor(secondsLeft)) : (Number.isFinite(minutesLeft) ? Math.max(0, Math.floor(minutesLeft)) : p.minutesLeft) * 60;
  const left = Math.floor(leftSec / 60);
  const first = s.state === 'idle' ? 0 : s.index + 1;
  const curRemaining = s.state === 'idle' ? 0 : p.currentRemainingSec;
  const availableSec = Math.max(0, leftSec - curRemaining);
  const defer = new Set(deferIndexes.filter((i) => Number.isInteger(i) && i >= first && i < s.steps.length));
  const rows = s.steps.slice(first).map((st, k) => ({ index: first + k, title: st.title, periodIds: st.periodIds.slice(), fromSec: st.plannedSec, toSec: st.plannedSec, deferred: defer.has(first + k), originalSec: st.originalSec ?? null }));
  const kept = rows.filter((r) => !r.deferred);
  const keptFrom = sum(kept.map((r) => r.fromSec));
  let fits = keptFrom <= availableSec;
  let overBySec = Math.max(0, keptFrom - availableSec);
  if (mode === 'fit' && !fits) {
    const to = fitDurations(kept.map((r) => r.fromSec), availableSec);
    const durations = to || kept.map((r) => Math.min(MIN_STEP_SEC, r.fromSec));
    kept.forEach((r, i) => { r.toSec = durations[i]; });
    fits = !!to;
    overBySec = Math.max(0, sum(durations) - availableSec);
  }
  for (const r of rows.filter((x) => x.deferred)) r.toSec = 0;
  const change = {
    kind: 'rebalance',
    current: null,
    pending: kept.map((r) => ({ periodIds: r.periodIds, plannedSec: r.toSec })),
    unfinished: rows.filter((r) => r.deferred).flatMap((r) => r.periodIds.map((id) => ({ periodId: id, plannedSec: periodSec(s, id, Math.round(r.fromSec / r.periodIds.length)), ranMs: 0, reason: 'deferred' }))),
  };
  return { change, fits, overBySec, preview: { rows, minutesLeft: left, availableSec, currentRemainingSec: curRemaining, keptSec: sum(kept.map((r) => r.toSec)), fits, overBySec, mode } };
}

// choice: 'later' (its own period right after the block it was in) or 'defer'
// (to the unfinished-work list). Finished periods cannot be changed.
export function proposeStation(s, env, periodId, choice) {
  if (s.state === 'completed') return { error: 'The practice is complete.' };
  if (choice !== 'later' && choice !== 'defer') return { error: 'Choose to run it later today or move it to unfinished work.' };
  const k = s.steps.findIndex((x) => x.periodIds.includes(periodId));
  const first = s.state === 'idle' ? 0 : s.index;
  if (k < 0) return { error: 'That station is not in the remaining practice.' };
  if (k < first) return { error: 'That period has already finished; it cannot be changed.' };
  const isCurrent = s.state !== 'idle' && k === s.index;
  const step = s.steps[k];
  if (step.periodIds.length === 1) {
    if (isCurrent) return { error: 'This is the only station of the current period. Use Skip period to end it, or rebalance to move later periods.' };
    if (choice === 'later') return { error: 'This period already runs later; move it to unfinished work or rebalance instead.' };
  }
  const rest = step.periodIds.filter((id) => id !== periodId);
  const ownSec = periodSec(s, periodId, step.plannedSec);
  const v = deriveView(s, env);
  const pending = [];
  const pendFirst = s.state === 'idle' ? 0 : s.index + 1;
  for (let i = pendFirst; i < s.steps.length; i++) {
    const st = s.steps[i];
    if (i === k) { if (rest.length) pending.push({ periodIds: rest, plannedSec: st.plannedSec }); } else pending.push({ periodIds: st.periodIds.slice(), plannedSec: st.plannedSec });
    if (choice === 'later' && i === k && !isCurrent) pending.push({ periodIds: [periodId], plannedSec: ownSec });
  }
  if (choice === 'later' && isCurrent) pending.unshift({ periodIds: [periodId], plannedSec: ownSec });
  const ranMs = isCurrent && v.current ? Math.floor(v.current.elapsedMs) : 0;
  const change = {
    kind: 'station',
    current: isCurrent ? { periodIds: rest } : null,
    pending,
    unfinished: choice === 'defer' ? [{ periodId, plannedSec: ownSec, ranMs, reason: 'station-unavailable' }] : [],
  };
  const name = (s.plan?.periods || []).find((x) => x.id === periodId)?.title || periodId;
  return { change, preview: { periodId, title: name, choice, isCurrent, addedSec: choice === 'later' ? ownSec : 0, ranMs } };
}

// What really happened to each step — an intentional shortening is never
// reported as a full completion, and an early end is not called shortening.
export function stepOutcomes(s) {
  return s.steps.map((st, i) => {
    const plannedTotal = st.plannedSec + st.extensionSec;
    const shortened = Number.isInteger(st.originalSec) && st.plannedSec < st.originalSec;
    const moved = st.origin === 'moved' ? ' Moved: its station was unavailable earlier.' : '';
    let outcome;
    let text;
    if (st.status === 'done') {
      if (shortened) { outcome = 'shortened'; text = `Shortened by coach ${formatElapsed(st.originalSec * 1000)} → ${formatElapsed(st.plannedSec * 1000)}; ran ${formatElapsed(st.elapsedMs)}.`; }
      else if (st.elapsedMs < plannedTotal * 1000 - EARLY_TOLERANCE_MS) { outcome = 'ended-early'; text = `Ended early by coach at ${formatElapsed(st.elapsedMs)} of ${formatElapsed(plannedTotal * 1000)}.`; }
      else { outcome = 'completed'; text = `Completed: ran ${formatElapsed(st.elapsedMs)} of ${formatElapsed(plannedTotal * 1000)}.`; }
    } else if (st.status === 'skipped') { outcome = 'skipped'; text = `Skipped by coach after ${formatElapsed(st.elapsedMs)}.`; }
    else if (st.status === 'active' || (s.state !== 'idle' && s.state !== 'completed' && i === s.index)) { outcome = 'in-progress'; text = 'In progress.'; }
    else { outcome = 'not-reached'; text = shortened ? `Not reached (shortened to ${formatElapsed(st.plannedSec * 1000)}).` : 'Not reached.'; }
    const removed = (st.removed || []).length ? ` Station${st.removed.length === 1 ? '' : 's'} unavailable: ${st.removed.map((r) => r.title).join(', ')}.` : '';
    return { index: i, title: st.title, periodIds: st.periodIds.slice(), originalSec: Number.isInteger(st.originalSec) ? st.originalSec : st.plannedSec, plannedSec: st.plannedSec, extensionSec: st.extensionSec, ranMs: Math.round(st.elapsedMs), outcome, text: text + moved + removed };
  });
}

// Work the practice did not finish: deferred or unavailable stations, skipped
// periods, and anything not reached. Each period appears once.
export function unfinishedWork(s) {
  const out = (s.unfinished || []).map((u) => ({ periodId: u.periodId, title: u.title, plannedSec: u.plannedSec, ranMs: u.ranMs, reason: u.reason }));
  s.steps.forEach((st, i) => {
    const notReached = st.status === 'pending' && s.state !== 'idle';
    if (st.status !== 'skipped' && !notReached) return;
    const titles = st.periodIds.length === 1 ? [st.title] : st.title.split(' + ');
    st.periodIds.forEach((id, k) => out.push({ periodId: id, title: (s.plan?.periods || []).find((x) => x.id === id)?.title || titles[k] || id, plannedSec: periodSec(s, id, Math.round(st.plannedSec / st.periodIds.length)), ranMs: Math.round(st.elapsedMs), reason: st.status === 'skipped' ? 'skipped' : 'not-reached' }));
  });
  return out;
}

export function buildRecord(s, day, { id, notes = '', wall }) {
  return {
    id,
    dayId: day.id,
    dayLabel: day.label,
    dayVersion: s.dayVersion,
    sessionId: s.id,
    savedWall: wall,
    startedWall: s.startedWall ?? null,
    endedWall: s.endedWall ?? null,
    state: s.state,
    notes: String(notes).slice(0, RECORD_LIMITS.notes),
    steps: stepOutcomes(s).map(({ title, periodIds, originalSec, plannedSec, extensionSec, ranMs, outcome }) => ({ title, periodIds, originalSec, plannedSec, extensionSec, ranMs, outcome })),
    changes: (s.changes || []).map((c) => ({ at: c.at, kind: c.kind, summary: c.summary })),
    unfinished: unfinishedWork(s).map((u, i) => ({ id: `${id}-u${i + 1}`, ...u, carriedTo: null })),
  };
}

// Re-save a debrief for the same run: everything is recomputed from the clock,
// and items already carried to a later day keep where they went (by period).
export function updateRecord(existing, s, day, { notes = '', wall }) {
  const fresh = buildRecord(s, day, { id: existing.id, notes, wall });
  const carried = new Map(existing.unfinished.filter((u) => u.carriedTo).map((u) => [u.periodId, u]));
  const unfinished = fresh.unfinished.map((u) => (carried.has(u.periodId) ? { ...u, carriedTo: carried.get(u.periodId).carriedTo } : u));
  // A carried item whose period is no longer unfinished stays listed: the copy exists on the later day.
  for (const [pid, u] of carried) if (!unfinished.some((x) => x.periodId === pid)) unfinished.push({ ...u });
  // Ids are renumbered so every item keeps a unique id.
  return { ...fresh, unfinished: unfinished.map((u, i) => ({ ...u, id: `${existing.id}-u${i + 1}` })) };
}

// The record of a given run of a session (Reset starts a new run: new start time).
export const recordForRun = (records, s) => (records || []).find((r) => r.sessionId === s.id && r.startedWall === (s.startedWall ?? null)) || null;

const REASON_TEXT = { deferred: 'moved to unfinished work by the coach', 'station-unavailable': 'station unavailable', skipped: 'skipped', 'not-reached': 'not reached' };
export const reasonText = (r) => REASON_TEXT[r] || r;

// Hand an unfinished item to a later day as an unscheduled period (the coach
// places it); the record remembers where it went.
export function carryOver(project, recordId, itemId, toDayId, ids) {
  const records = project.records || [];
  const ri = records.findIndex((r) => r.id === recordId);
  if (ri < 0) return { error: 'That debrief is not saved in this plan.' };
  const rec = records[ri];
  const ii = rec.unfinished.findIndex((u) => u.id === itemId);
  if (ii < 0) return { error: 'That unfinished item is not in the debrief.' };
  const item = rec.unfinished[ii];
  if (item.carriedTo) return { error: 'This item was already carried to a later day.' };
  const toDay = project.week.days.find((d) => d.id === toDayId);
  if (!toDay) return { error: 'Choose a day to carry it to.' };
  if (toDayId === rec.dayId) return { error: 'Carry it to a different day than the one it came from.' };
  const twin = records.find((r) => r.unfinished.some((u) => u.periodId === item.periodId && u.carriedTo?.dayId === toDayId));
  if (twin) return { error: `This period was already carried to ${toDay.label} from another debrief.` };
  const src = project.week.days.flatMap((d) => d.periods).find((x) => x.id === item.periodId);
  const { id: _id, ...fields } = src || { title: item.title, category: 'group' };
  const note = `Carried over from ${rec.dayLabel} (${reasonText(item.reason)}).`;
  const per = newPeriod(ids('per'), {
    ...fields,
    title: item.title.slice(0, 120),
    minutes: Math.max(1, Math.min(240, Math.round(item.plannedSec / 60) || 1)),
    scheduled: false,
    parallel: false,
    fixedStart: null,
    notes: `${note}${fields.notes ? ` ${fields.notes}` : ''}`.slice(0, 2000),
  });
  const week = addPeriod(project.week, toDayId, per);
  const unfinished = rec.unfinished.map((u, k) => (k === ii ? { ...u, carriedTo: { dayId: toDayId, periodId: per.id } } : u));
  return { project: { ...project, week, records: records.map((r, k) => (k === ri ? { ...rec, unfinished } : r)) }, period: per };
}

// ---------------------------------------------------------------- validation
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string';
const isInt0 = (v) => Number.isInteger(v) && v >= 0;
const isMs = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isWall = (v) => typeof v === 'number' && Number.isFinite(v);

export function recordErrors(records) {
  const out = [];
  const E = (path, message) => out.push({ path, message });
  if (records === undefined) return out;
  if (!Array.isArray(records)) return [{ path: 'records', message: 'Records must be a list.' }];
  if (records.length > RECORD_LIMITS.records) E('records', `At most ${RECORD_LIMITS.records} saved debriefs.`);
  const seen = new Set();
  records.forEach((r, i) => {
    const p = `records[${i}]`;
    if (!isObj(r)) return E(p, 'Each debrief must be an object.');
    if (!isStr(r.id) || !r.id) E(`${p}.id`, 'Missing id.');
    else if (seen.has(r.id)) E(`${p}.id`, `Duplicate debrief id “${r.id}”.`);
    else seen.add(r.id);
    for (const k of ['dayId', 'dayLabel', 'sessionId']) if (!isStr(r[k])) E(`${p}.${k}`, 'Must be text.');
    if (!Number.isInteger(r.dayVersion) || r.dayVersion < 1) E(`${p}.dayVersion`, 'Must be a whole number, 1 or more.');
    if (!isWall(r.savedWall)) E(`${p}.savedWall`, 'Must be a time.');
    for (const k of ['startedWall', 'endedWall']) if (r[k] !== null && !isWall(r[k])) E(`${p}.${k}`, 'Must be a time or empty.');
    if (!CLOCK_STATES.includes(r.state)) E(`${p}.state`, `Must be one of ${CLOCK_STATES.join(', ')}.`);
    if (!isStr(r.notes) || r.notes.length > RECORD_LIMITS.notes) E(`${p}.notes`, `Notes must be text of at most ${RECORD_LIMITS.notes} characters.`);
    if (!Array.isArray(r.steps)) E(`${p}.steps`, 'Must be a list.');
    else r.steps.forEach((st, j) => {
      const sp = `${p}.steps[${j}]`;
      if (!isObj(st)) return E(sp, 'Must be an object.');
      if (!isStr(st.title)) E(`${sp}.title`, 'Must be text.');
      if (!Array.isArray(st.periodIds) || !st.periodIds.every(isStr)) E(`${sp}.periodIds`, 'Must be a list of period ids.');
      for (const k of ['originalSec', 'plannedSec', 'extensionSec']) if (!isInt0(st[k])) E(`${sp}.${k}`, 'Must be a whole number of seconds, 0 or more.');
      if (!isMs(st.ranMs)) E(`${sp}.ranMs`, 'Must be 0 or more milliseconds.');
      if (!OUTCOMES.includes(st.outcome)) E(`${sp}.outcome`, `Must be one of ${OUTCOMES.join(', ')}.`);
    });
    if (!Array.isArray(r.changes) || !r.changes.every((c) => isObj(c) && isWall(c.at) && isStr(c.kind) && isStr(c.summary))) E(`${p}.changes`, 'Must be a list of {at, kind, summary}.');
    if (!Array.isArray(r.unfinished)) E(`${p}.unfinished`, 'Must be a list.');
    else r.unfinished.forEach((u, j) => {
      const up = `${p}.unfinished[${j}]`;
      if (!isObj(u)) return E(up, 'Must be an object.');
      for (const k of ['id', 'periodId', 'title']) if (!isStr(u[k])) E(`${up}.${k}`, 'Must be text.');
      if (isStr(u.id) && r.unfinished.findIndex((x) => isObj(x) && x.id === u.id) !== j) E(`${up}.id`, `Duplicate item id “${u.id}”.`);
      if (!isInt0(u.plannedSec)) E(`${up}.plannedSec`, 'Must be a whole number of seconds, 0 or more.');
      if (!isMs(u.ranMs)) E(`${up}.ranMs`, 'Must be 0 or more milliseconds.');
      if (!WORK_REASONS.includes(u.reason)) E(`${up}.reason`, `Must be one of ${WORK_REASONS.join(', ')}.`);
      if (u.carriedTo !== null && !(isObj(u.carriedTo) && isStr(u.carriedTo.dayId) && isStr(u.carriedTo.periodId))) E(`${up}.carriedTo`, 'Must be empty or {dayId, periodId}.');
    });
  });
  return out;
}
