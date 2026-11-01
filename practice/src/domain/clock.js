// Practice clock state machine. Pure: every call receives env = { mono, wall, instanceId }.
//   mono       monotonic milliseconds (performance.now() in the browser) — the only
//              source used to measure elapsed time;
//   wall       Date.now() — used only for "saved at" labels and recovery estimates;
//   instanceId the page load that owns `mono` (mono values from another page load
//              are meaningless after a reload).
// States: idle -> running <-> paused -> completed. Only coach actions advance.
import { computeSchedule } from './week.js';

export const HISTORY_LIMIT = 200;
export const CLOCK_STATES = ['idle', 'running', 'paused', 'completed'];
export const STEP_STATUS = ['pending', 'active', 'done', 'skipped'];
export const ACTION_TYPES = ['start', 'pause', 'resume', 'next', 'skip', 'extend', 'reset', 'revise'];
// C1: coach-made changes to the remaining script (rebalance, unavailable station).
export const REVISION_KINDS = ['rebalance', 'station'];
export const UNFINISHED_REASONS = ['deferred', 'station-unavailable'];
export const STEP_ORIGINS = ['plan', 'moved'];
export const REVISE_MAX_SEC = 4 * 3600;
export const EXTEND_MAX_SEC = 3600;
export const ANOMALY_THRESHOLD_MS = 5000;

const ALLOWED = {
  start: ['idle'],
  pause: ['running'],
  resume: ['paused'],
  next: ['running', 'paused'],
  skip: ['running', 'paused'],
  extend: ['running', 'paused'],
  revise: ['idle', 'running', 'paused'],
};

// One step per scheduled block of the day (parallel stations share a step).
export function buildSteps(day) {
  const sched = computeSchedule(day);
  const titleOf = new Map(day.periods.map((p) => [p.id, p.title]));
  const blocks = [];
  for (const it of sched.items) {
    let b = blocks[blocks.length - 1];
    if (!b || b.block !== it.block) {
      b = { block: it.block, start: it.startMin, end: it.endMin, periodIds: [] };
      blocks.push(b);
    }
    b.periodIds.push(it.periodId);
    b.end = Math.max(b.end, it.endMin);
  }
  return blocks.map((b) => ({
    periodIds: b.periodIds,
    title: b.periodIds.map((pid) => titleOf.get(pid)).join(' + '),
    plannedSec: (b.end - b.start) * 60,
    extensionSec: 0,
    elapsedMs: 0,
    status: 'pending',
    endedBy: null,
  }));
}

// The plan as set up: kept unchanged so the original script stays traceable
// whatever the coach changes during practice.
export function planOf(day, steps = buildSteps(day)) {
  const ids = new Set(steps.flatMap((s) => s.periodIds));
  return {
    dayVersion: day.version,
    steps: steps.map((s) => ({ periodIds: s.periodIds.slice(), title: s.title, plannedSec: s.plannedSec })),
    periods: day.periods.filter((x) => ids.has(x.id)).map((x) => ({ id: x.id, title: x.title, minutes: x.minutes })),
  };
}

const sameScript = (a, b) => a.length === b.length && a.every((s, i) => s.title === b[i].title && s.plannedSec === b[i].plannedSec && s.periodIds.join('|') === b[i].periodIds.join('|'));

export function createSession({ id, day }) {
  const s = baseSession({ id, day });
  return { ...s, plan: planOf(day, s.steps) };
}

function baseSession({ id, day }) {
  return {
    id,
    dayId: day.id,
    dayVersion: day.version,
    state: 'idle',
    index: 0,
    steps: buildSteps(day),
    plan: null,
    unfinished: [],
    changes: [],
    run: null,
    rev: 0,
    history: [],
    recovery: null,
    notice: null,
    checkpoint: null,
    lastInstanceId: null,
    startedWall: null,
    endedWall: null,
  };
}

const cloneSteps = (steps) => steps.map((s) => ({ ...s, periodIds: s.periodIds.slice(), ...(s.removed ? { removed: s.removed.map((r) => ({ ...r })) } : {}) }));
const cloneList = (list) => (Array.isArray(list) ? list.map((x) => ({ ...x })) : []);

function liveElapsed(session, env) {
  const step = session.steps[session.index];
  if (!step) return 0;
  let ms = step.elapsedMs;
  if (session.state === 'running' && session.run && session.run.instanceId === env.instanceId) {
    ms += Math.max(0, env.mono - session.run.mono);
  }
  return ms;
}

// Fold the running segment into the current step; re-base the run at `env`.
function fold(session, env) {
  const steps = cloneSteps(session.steps);
  if (steps[session.index]) steps[session.index].elapsedMs = liveElapsed(session, env);
  const run = session.state === 'running' ? { mono: env.mono, wall: env.wall, instanceId: env.instanceId } : null;
  return { ...session, steps, run };
}

// The complete state an undo can return to, including which script version it ran.
const pickState = (s) => ({
  state: s.state, index: s.index, steps: cloneSteps(s.steps), dayVersion: s.dayVersion, startedWall: s.startedWall, endedWall: s.endedWall,
  plan: s.plan ? structuredClone(s.plan) : null, unfinished: cloneList(s.unfinished), changes: cloneList(s.changes),
  ...(s.debriefDraft !== undefined ? { debriefDraft: s.debriefDraft } : {}),
});

function fail(error) {
  return { ok: false, error };
}

export function applyAction(session, action, env) {
  if (!session) return fail('No practice session.');
  if (action.rev !== session.rev) return fail(`Stale action: it was made for revision ${action.rev}, the clock is at ${session.rev}.`);
  const type = action.type;

  if (type === 'undo') return undo(session, env);
  let rebuilt = null;
  if (type === 'reset') {
    // Reset always rebuilds from the current version of the same day.
    if (!action.day || action.day.id !== session.dayId) return fail('Reset needs the current version of this day.');
    rebuilt = buildSteps(action.day);
    if (session.state === 'idle' && session.dayVersion === action.day.version && sameScript(session.steps, rebuilt)) {
      return fail('Nothing to reset: the practice has not started and the plan has not changed.');
    }
  } else {
    const ok = ALLOWED[type];
    if (!ok) return fail(`Unknown action ${type}.`);
    if (!ok.includes(session.state)) return fail(`Cannot ${type} while ${session.state}.`);
  }
  if (type === 'start' && session.steps.length === 0) return fail('No scheduled periods to run on this day.');
  let revised = null;
  if (type === 'revise') {
    revised = reviseScript(fold(session, env), action.change, env);
    if (revised.error) return fail(revised.error);
  }
  if (type === 'extend' && !(Number.isInteger(action.sec) && action.sec > 0 && action.sec <= EXTEND_MAX_SEC)) {
    return fail(`Add time must be 1–${EXTEND_MAX_SEC} whole seconds.`);
  }

  const folded = fold(session, env);
  const entry = { type, at: { mono: env.mono, wall: env.wall, instanceId: env.instanceId }, wasRunning: session.state === 'running', before: pickState(folded) };
  let steps = cloneSteps(folded.steps);
  let { state, index, run, startedWall, endedWall, dayVersion } = folded;
  let plan = folded.plan ?? null;
  let unfinished = cloneList(folded.unfinished);
  let changes = cloneList(folded.changes);
  const now = { mono: env.mono, wall: env.wall, instanceId: env.instanceId };

  switch (type) {
    case 'start':
      index = 0;
      steps[0].status = 'active';
      state = 'running';
      run = now;
      startedWall = env.wall;
      break;
    case 'pause':
      state = 'paused';
      run = null;
      break;
    case 'resume':
      state = 'running';
      run = now;
      break;
    case 'next':
    case 'skip': {
      const cur = steps[index];
      cur.status = type === 'next' ? 'done' : 'skipped';
      cur.endedBy = type;
      if (index + 1 < steps.length) {
        index += 1;
        steps[index].status = 'active';
        run = state === 'running' ? now : null;
      } else {
        state = 'completed';
        run = null;
        endedWall = env.wall;
      }
      break;
    }
    case 'extend':
      steps[index].extensionSec += action.sec;
      break;
    case 'revise':
      ({ steps, unfinished } = revised);
      changes = changes.concat([{ at: env.wall, kind: action.change.kind, summary: revised.summary }]);
      break;
    case 'reset':
      steps = rebuilt;
      plan = planOf(action.day, rebuilt);
      unfinished = [];
      changes = [];
      dayVersion = action.day.version;
      state = 'idle';
      index = 0;
      run = null;
      startedWall = null;
      endedWall = null;
      break;
    default:
      return fail(`Unknown action ${type}.`);
  }

  const history = session.history.concat([entry]).slice(-HISTORY_LIMIT);
  return {
    ok: true,
    session: dropDraft({ ...session, state, index, steps, dayVersion, plan, unfinished, changes, run, startedWall, endedWall, history, rev: session.rev + 1, recovery: null, notice: null, lastInstanceId: env.instanceId }, type === 'reset'),
  };
}

// Reset starts a new run: its debrief starts empty (Undo brings the draft back).
function dropDraft(s, drop) {
  if (!drop) return s;
  const { debriefDraft: _d, ...rest } = s;
  return rest;
}

// ---------------------------------------------------------------- revise (C1)
// change = { kind, current: { periodIds } | null, pending: [{ periodIds, plannedSec }],
//            unfinished: [{ periodId, plannedSec, ranMs, reason }] }
// Finished steps never change. The current step keeps its time and may only lose
// stations. Every period of the current and remaining steps must reappear exactly
// once: in the current step, in a remaining step, or in the unfinished list.
const fmtMin = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

function periodTitles(s) {
  const m = new Map();
  for (const st of s.steps) if (st.periodIds.length === 1) m.set(st.periodIds[0], st.title);
  for (const x of s.plan?.periods || []) m.set(x.id, x.title);
  return m;
}

function reviseScript(s, change, env) {
  const bad = (error) => ({ error });
  if (!isObj(change) || !REVISION_KINDS.includes(change.kind)) return bad('Unknown kind of change.');
  if (!Array.isArray(change.pending) || !Array.isArray(change.unfinished)) return bad('A change lists the remaining periods and the unfinished work.');
  const first = s.state === 'idle' ? 0 : s.index + 1;
  const cur = s.state === 'idle' ? null : s.steps[s.index];
  const title = periodTitles(s);
  const name = (id) => title.get(id) || id;
  let curIds = cur ? cur.periodIds : [];
  if (change.current !== null && change.current !== undefined) {
    const ids = change.current.periodIds;
    if (!cur) return bad('There is no current period to change.');
    if (!Array.isArray(ids) || !ids.length || !ids.every((id) => cur.periodIds.includes(id)) || new Set(ids).size !== ids.length) return bad('The current period keeps at least one of its own stations and gains none.');
    curIds = ids;
  }
  for (const p of change.pending) {
    if (!isObj(p) || !Array.isArray(p.periodIds) || !p.periodIds.length || !p.periodIds.every((x) => isStr(x) && x)) return bad('Each remaining period needs its period ids.');
    if (!Number.isInteger(p.plannedSec) || p.plannedSec < 60 || p.plannedSec > REVISE_MAX_SEC) return bad(`Each remaining period needs a whole number of seconds from 60 to ${REVISE_MAX_SEC}.`);
  }
  for (const u of change.unfinished) {
    if (!isObj(u) || !isStr(u.periodId) || !UNFINISHED_REASONS.includes(u.reason)) return bad('Each unfinished item needs its period and a reason.');
    if (!Number.isInteger(u.plannedSec) || u.plannedSec < 0 || typeof u.ranMs !== 'number' || !Number.isFinite(u.ranMs) || u.ranMs < 0) return bad('Each unfinished item needs its planned seconds and the time it ran.');
  }
  const before = [...(cur ? cur.periodIds : []), ...s.steps.slice(first).flatMap((x) => x.periodIds)].sort();
  const after = [...(cur ? curIds : []), ...change.pending.flatMap((p) => p.periodIds), ...change.unfinished.map((u) => u.periodId)].sort();
  if (before.join('|') !== after.join('|')) {
    const missing = before.filter((id) => !after.includes(id));
    const extra = after.filter((id) => !before.includes(id));
    const dup = after.filter((id, i) => after.indexOf(id) !== i);
    return bad(`Every remaining period must be accounted for exactly once.${missing.length ? ` Missing: ${missing.map(name).join(', ')}.` : ''}${extra.length ? ` Not in the remaining practice: ${extra.map(name).join(', ')}.` : ''}${dup.length ? ` Listed twice: ${dup.map(name).join(', ')}.` : ''}`);
  }
  const minutesOf = (id) => (s.plan?.periods || []).find((x) => x.id === id)?.minutes;
  const steps = cloneSteps(s.steps.slice(0, first));
  const notes = [];
  if (cur) {
    const removedIds = cur.periodIds.filter((id) => !curIds.includes(id));
    if (removedIds.length) {
      steps[s.index] = { ...steps[s.index], periodIds: curIds.slice(), title: curIds.map(name).join(' + '), removed: (steps[s.index].removed || []).concat(removedIds.map((id) => ({ periodId: id, title: name(id), reason: 'station-unavailable' }))) };
    }
  }
  const oldPending = s.steps.slice(first);
  const used = new Set();
  for (const p of change.pending) {
    const key = p.periodIds.join('|');
    let i = oldPending.findIndex((o, k) => !used.has(k) && o.periodIds.join('|') === key);
    if (i < 0) i = oldPending.findIndex((o, k) => !used.has(k) && p.periodIds.every((id) => o.periodIds.includes(id)));
    let st;
    if (i >= 0) {
      used.add(i);
      const o = oldPending[i];
      const lost = o.periodIds.filter((id) => !p.periodIds.includes(id));
      st = { ...cloneSteps([o])[0], periodIds: p.periodIds.slice(), title: p.periodIds.map(name).join(' + ') };
      if (lost.length) st.removed = (st.removed || []).concat(lost.map((id) => ({ periodId: id, title: name(id), reason: 'station-unavailable' })));
      const original = o.originalSec ?? o.plannedSec;
      if (p.plannedSec !== original) st.originalSec = original;
      else delete st.originalSec;
      // The log describes this change only; earlier changes stay on the steps.
      if (p.plannedSec !== o.plannedSec) notes.push(`${st.title} ${fmtMin(o.plannedSec)} → ${fmtMin(p.plannedSec)}`);
      st.plannedSec = p.plannedSec;
    } else {
      const planned = p.periodIds.reduce((a, id) => a + (minutesOf(id) ?? 0) * 60, 0);
      st = { periodIds: p.periodIds.slice(), title: p.periodIds.map(name).join(' + '), plannedSec: p.plannedSec, extensionSec: 0, elapsedMs: 0, status: 'pending', endedBy: null, origin: 'moved' };
      if (planned && planned !== p.plannedSec) st.originalSec = planned;
      notes.push(`${st.title} moved to run later today (${fmtMin(p.plannedSec)})`);
    }
    steps.push(st);
  }
  const unfinished = cloneList(s.unfinished).concat(change.unfinished.map((u) => ({ periodId: u.periodId, title: name(u.periodId), plannedSec: u.plannedSec, ranMs: Math.round(u.ranMs), reason: u.reason })));
  if (change.unfinished.length) notes.push(`moved to unfinished work: ${change.unfinished.map((u) => name(u.periodId)).join(', ')}`);
  const summary = `${change.kind === 'rebalance' ? 'Rebalanced the remaining time' : 'Station unavailable'}: ${notes.length ? notes.join('; ') : 'no period changed'}.`;
  return { steps, unfinished, summary };
}

function undo(session, env) {
  if (!session.history.length) return fail('Nothing to undo.');
  const history = session.history.slice(0, -1);
  const entry = session.history[session.history.length - 1];
  // Imports are validated before they replace anything; this only guards
  // against a snapshot damaged in memory, and refuses rather than throwing.
  if (historyEntryErrors(entry, 'history').length) return fail('This undo step is damaged and was not applied. Nothing changed; export a copy, then reset the clock.');
  const before = pickState(entry.before);
  // History saved before these fields existed did not change them.
  if (before.dayVersion === undefined) before.dayVersion = session.dayVersion;
  if (entry.before.plan === undefined) before.plan = session.plan ?? null;
  if (entry.before.unfinished === undefined) before.unfinished = [];
  if (entry.before.changes === undefined) before.changes = [];
  // Only undoing a Reset brings an earlier draft back; otherwise keep what was typed since.
  if (before.debriefDraft === undefined || entry.type !== 'reset') delete before.debriefDraft;
  let run = null;
  let notice = null;
  if (entry.wasRunning) {
    if (entry.at.instanceId === env.instanceId) {
      // The clock really kept running between the action and this undo.
      if (before.steps[before.index]) before.steps[before.index].elapsedMs += Math.max(0, env.mono - entry.at.mono);
      run = { mono: env.mono, wall: env.wall, instanceId: env.instanceId };
    } else {
      before.state = 'paused';
      notice = 'Undid an action from before the reload. The clock is paused because the time since then was not observed.';
    }
  }
  return {
    ok: true,
    session: { ...session, ...before, run, history, rev: session.rev + 1, recovery: null, notice, lastInstanceId: env.instanceId },
  };
}

export function deriveView(session, env) {
  const steps = session.steps;
  const cur = session.state === 'completed' ? null : steps[session.index] || null;
  let current = null;
  if (cur) {
    const elapsedMs = session.state === 'idle' ? 0 : liveElapsed(session, env);
    const plannedMs = cur.plannedSec * 1000;
    const extensionMs = cur.extensionSec * 1000;
    const remainingMs = plannedMs + extensionMs - elapsedMs;
    current = { index: session.index, periodIds: cur.periodIds, title: cur.title, status: cur.status, elapsedMs, plannedMs, extensionMs, remainingMs, overrun: remainingMs < 0 };
  }
  const nextStep = session.state === 'completed' ? null : steps[session.state === 'idle' ? 1 : session.index + 1] || null;
  const doneCount = steps.filter((s) => s.status === 'done').length;
  const skippedCount = steps.filter((s) => s.status === 'skipped').length;
  const totalPlannedMs = steps.reduce((a, s) => a + (s.plannedSec + s.extensionSec) * 1000, 0);
  const totalElapsedMs = steps.reduce((a, s, i) => a + (i === session.index && session.state !== 'completed' ? (current ? current.elapsedMs : 0) : s.elapsedMs), 0);
  return {
    state: session.state,
    rev: session.rev,
    index: session.index,
    total: steps.length,
    current,
    next: nextStep ? { periodIds: nextStep.periodIds, title: nextStep.title, plannedMs: nextStep.plannedSec * 1000 } : null,
    doneCount,
    skippedCount,
    totalPlannedMs,
    totalElapsedMs,
    canUndo: session.history.length > 0,
    lastAction: session.history.length ? session.history[session.history.length - 1].type : null,
    recovery: session.recovery,
    notice: session.notice,
  };
}

// Persistable form: checkpoints the live elapsed time. Not an action: rev unchanged.
export function serializeSession(session, env) {
  if (!session) return null;
  return {
    ...session,
    checkpoint: { index: session.index, elapsedMs: liveElapsed(session, env), wall: env.wall, instanceId: env.instanceId },
    lastInstanceId: env.instanceId,
  };
}

// After a reload: never pretend the clock watched the time away.
export function recoverSession(saved, env) {
  if (!saved) return { session: null, recovered: false };
  const owner = saved.lastInstanceId ?? saved.run?.instanceId ?? saved.checkpoint?.instanceId ?? null;
  if (owner === env.instanceId) return { session: saved, recovered: false };
  if (saved.state !== 'running' && saved.state !== 'paused') {
    return { session: { ...saved, run: null, lastInstanceId: env.instanceId }, recovered: false };
  }
  const steps = cloneSteps(saved.steps);
  const step = steps[saved.index];
  const cp = saved.checkpoint;
  if (saved.state === 'running' && step && cp && cp.index === saved.index && cp.elapsedMs > step.elapsedMs) step.elapsedMs = cp.elapsedMs;
  const savedAtWall = cp?.wall ?? saved.run?.wall ?? null;
  const away = savedAtWall === null ? null : env.wall - savedAtWall;
  return {
    session: {
      ...saved,
      steps,
      state: 'paused',
      run: null,
      rev: saved.rev + 1,
      recovery: { wasState: saved.state, savedAtWall, awayEstimateMs: away !== null && away >= 0 ? away : null, elapsedAtSaveMs: step ? step.elapsedMs : 0 },
      lastInstanceId: env.instanceId,
    },
    recovered: true,
  };
}

// Compare two {mono, wall} samples: device sleep or a wall-clock change shows
// up as wall time and monotonic time disagreeing.
export function detectClockAnomaly(prev, cur) {
  const monoDeltaMs = cur.mono - prev.mono;
  const wallDeltaMs = cur.wall - prev.wall;
  const diff = wallDeltaMs - monoDeltaMs;
  if (Math.abs(diff) <= ANOMALY_THRESHOLD_MS) return { anomaly: false, kind: null, monoDeltaMs, wallDeltaMs };
  return { anomaly: true, kind: diff > 0 ? 'wall-ahead' : 'wall-behind', monoDeltaMs, wallDeltaMs };
}

// A real double tap lands on the re-rendered button (Start -> Pause -> Resume,
// Next -> Next) and so carries a fresh revision. Treat a second tap on those
// buttons within DOUBLE_TAP_MS of the last one in this page as the same tap.
// Undo, add time and reset are not guarded: each tap of those is deliberate.
export const DOUBLE_TAP_MS = 700;
const TAP_GUARDED = new Set(['start', 'pause', 'resume', 'next', 'skip']);
export function isLikelyDoubleTap(session, action, env, windowMs = DOUBLE_TAP_MS) {
  if (!session || !TAP_GUARDED.has(action.type)) return false;
  const last = session.history[session.history.length - 1];
  if (!last || !TAP_GUARDED.has(last.type) || last.at.instanceId !== env.instanceId) return false;
  return env.mono - last.at.mono < windowMs;
}

// A clock belongs to a day of the project; a clock whose day was deleted is
// set aside (kept in memory for undo) rather than exported or shown as active.
export function clockForProject(project, clock) {
  if (!clock || !project) return null;
  return project.week.days.some((d) => d.id === clock.dayId) ? clock : null;
}

// ---------------------------------------------------------------- validation
// One set of structural and state rules for the current clock and for every
// snapshot kept in its undo history. Returns [{ path, message }]; never throws.
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string';
const E = (path, message) => ({ path, message });
const ENDED_BY = { done: 'next', skipped: 'skip', pending: null, active: null };

// opts.historical: an undo snapshot (dayVersion optional, for history saved
// before it was recorded). opts.otherDayPeriods: period ids that belong to a
// different day of the project — a clock may never name those. Period ids not
// found anywhere are allowed: an older script may name periods deleted since.
export function clockStateErrors(snap, path, opts = {}) {
  if (!isObj(snap)) return [E(path, 'Expected an object with the clock state.')];
  const out = [];
  if (!CLOCK_STATES.includes(snap.state)) out.push(E(`${path}.state`, `State must be one of ${CLOCK_STATES.join(', ')}.`));
  if (!Array.isArray(snap.steps)) return out.concat([E(`${path}.steps`, 'Steps must be a list.')]);
  const seen = new Map();
  let stepsOk = true;
  snap.steps.forEach((st, i) => {
    const sp = `${path}.steps[${i}]`;
    if (!isObj(st)) {
      out.push(E(sp, 'Each step must be an object.'));
      stepsOk = false;
      return;
    }
    const ids = st.periodIds;
    if (!Array.isArray(ids) || !ids.length || !ids.every((x) => isStr(x) && x.length > 0)) {
      out.push(E(`${sp}.periodIds`, 'Each step needs a list of one or more period ids.'));
      stepsOk = false;
    } else {
      for (const id of ids) {
        if (seen.has(id)) out.push(E(`${sp}.periodIds`, `Period “${id}” is named more than once (also in step ${seen.get(id) + 1}).`));
        else seen.set(id, i);
        if (opts.otherDayPeriods && opts.otherDayPeriods.has(id)) out.push(E(`${sp}.periodIds`, `Period “${id}” belongs to another day.`));
      }
    }
    if (!isStr(st.title)) out.push(E(`${sp}.title`, 'Step title must be text.'));
    if (st.originalSec !== undefined && (!Number.isInteger(st.originalSec) || st.originalSec < 0)) out.push(E(`${sp}.originalSec`, 'Must be a whole number of seconds, 0 or more.'));
    if (st.origin !== undefined && !STEP_ORIGINS.includes(st.origin)) out.push(E(`${sp}.origin`, `Must be one of ${STEP_ORIGINS.join(', ')}.`));
    if (st.removed !== undefined && (!Array.isArray(st.removed) || !st.removed.every((r) => isObj(r) && isStr(r.periodId) && isStr(r.title) && UNFINISHED_REASONS.includes(r.reason)))) out.push(E(`${sp}.removed`, 'Removed stations must be a list of {periodId, title, reason}.'));
    for (const k of ['plannedSec', 'extensionSec']) if (!Number.isInteger(st[k]) || st[k] < 0) out.push(E(`${sp}.${k}`, 'Must be a whole number of seconds, 0 or more.'));
    if (typeof st.elapsedMs !== 'number' || !Number.isFinite(st.elapsedMs) || st.elapsedMs < 0) out.push(E(`${sp}.elapsedMs`, 'Must be 0 or more milliseconds.'));
    if (!STEP_STATUS.includes(st.status)) {
      out.push(E(`${sp}.status`, `Must be one of ${STEP_STATUS.join(', ')}.`));
      stepsOk = false;
    } else if ((st.endedBy ?? null) !== ENDED_BY[st.status]) {
      out.push(E(`${sp}.endedBy`, 'Must be “next” for a done step, “skip” for a skipped step, and empty otherwise.'));
    }
  });
  if (snap.unfinished !== undefined) {
    if (!Array.isArray(snap.unfinished)) out.push(E(`${path}.unfinished`, 'Unfinished work must be a list.'));
    else snap.unfinished.forEach((u, i) => {
      const up = `${path}.unfinished[${i}]`;
      if (!isObj(u)) return out.push(E(up, 'Each unfinished item must be an object.'));
      if (!isStr(u.periodId) || !u.periodId) out.push(E(`${up}.periodId`, 'Needs a period id.'));
      else if (seen.has(u.periodId)) out.push(E(`${up}.periodId`, `Period “${u.periodId}” is named more than once.`));
      else seen.set(u.periodId, -1);
      if (!isStr(u.title)) out.push(E(`${up}.title`, 'Title must be text.'));
      if (!Number.isInteger(u.plannedSec) || u.plannedSec < 0) out.push(E(`${up}.plannedSec`, 'Must be a whole number of seconds, 0 or more.'));
      if (typeof u.ranMs !== 'number' || !Number.isFinite(u.ranMs) || u.ranMs < 0) out.push(E(`${up}.ranMs`, 'Must be 0 or more milliseconds.'));
      if (!UNFINISHED_REASONS.includes(u.reason)) out.push(E(`${up}.reason`, `Must be one of ${UNFINISHED_REASONS.join(', ')}.`));
    });
  }
  // The debrief draft: on the clock and in every undo snapshot (Undo of a Reset restores it).
  if (snap.debriefDraft !== undefined && (!isStr(snap.debriefDraft) || snap.debriefDraft.length > 4000)) out.push(E(`${path}.debriefDraft`, 'The debrief draft must be text of at most 4000 characters.'));
  if (snap.changes !== undefined && (!Array.isArray(snap.changes) || !snap.changes.every((c) => isObj(c) && Number.isFinite(c.at) && REVISION_KINDS.includes(c.kind) && isStr(c.summary)))) {
    out.push(E(`${path}.changes`, 'Changes must be a list of {at, kind, summary}.'));
  }
  if (snap.plan !== undefined && snap.plan !== null) {
    const pl = snap.plan;
    const okPlan = isObj(pl) && Number.isInteger(pl.dayVersion) && pl.dayVersion >= 1
      && Array.isArray(pl.steps) && pl.steps.every((x) => isObj(x) && Array.isArray(x.periodIds) && x.periodIds.every(isStr) && isStr(x.title) && Number.isInteger(x.plannedSec) && x.plannedSec >= 0)
      && Array.isArray(pl.periods) && pl.periods.every((x) => isObj(x) && isStr(x.id) && isStr(x.title) && Number.isFinite(x.minutes) && x.minutes >= 0);
    if (!okPlan) out.push(E(`${path}.plan`, 'The original plan must be {dayVersion, steps, periods}.'));
  }
  if (!opts.historical || snap.dayVersion !== undefined) {
    if (!Number.isInteger(snap.dayVersion) || snap.dayVersion < 1) out.push(E(`${path}.dayVersion`, 'Day version must be a whole number, 1 or more.'));
  }
  const n = snap.steps.length;
  if (!Number.isInteger(snap.index) || snap.index < 0 || (n ? snap.index >= n : snap.index !== 0)) {
    out.push(E(`${path}.index`, 'Index must point at one of the steps.'));
    return out;
  }
  if (!stepsOk || !CLOCK_STATES.includes(snap.state)) return out;
  if (!n && snap.state !== 'idle') return out.concat([E(`${path}.state`, 'A clock with no steps can only be idle.')]);
  const st = snap.steps.map((x) => x.status);
  if (snap.state === 'idle') {
    if (snap.index !== 0 || st.some((x) => x !== 'pending')) out.push(E(path, 'An idle clock has every step pending, at index 0.'));
  } else if (snap.state === 'completed') {
    if (st.some((x) => x !== 'done' && x !== 'skipped')) out.push(E(path, 'A completed clock has no pending or active step.'));
  } else {
    if (st[snap.index] !== 'active') out.push(E(path, `A ${snap.state} clock has its current step active.`));
    if (st.slice(0, snap.index).some((x) => x !== 'done' && x !== 'skipped')) out.push(E(path, 'Steps before the current one must be done or skipped.'));
    if (st.slice(snap.index + 1).some((x) => x !== 'pending')) out.push(E(path, 'Steps after the current one must still be pending.'));
  }
  return out;
}

export function historyEntryErrors(h, path, opts = {}) {
  if (!isObj(h)) return [E(path, 'Each history entry must be an object.')];
  const out = [];
  if (!ACTION_TYPES.includes(h.type)) out.push(E(`${path}.type`, `Action must be one of ${ACTION_TYPES.join(', ')}.`));
  if (!isObj(h.at) || !Number.isFinite(h.at.mono) || !Number.isFinite(h.at.wall) || !isStr(h.at.instanceId)) out.push(E(`${path}.at`, 'Each history entry needs the time {mono, wall, instanceId} of its action.'));
  if (typeof h.wasRunning !== 'boolean') out.push(E(`${path}.wasRunning`, 'Must be true or false.'));
  if (!isObj(h.before)) return out.concat([E(`${path}.before`, 'The state before the action is missing.')]);
  out.push(...clockStateErrors(h.before, `${path}.before`, { ...opts, historical: true }));
  if (typeof h.wasRunning === 'boolean' && CLOCK_STATES.includes(h.before.state) && h.wasRunning !== (h.before.state === 'running')) {
    out.push(E(`${path}.wasRunning`, 'Must match whether the clock was running before the action.'));
  }
  return out;
}

// The whole saved clock: current state, run/checkpoint bookkeeping and history.
export function clockErrors(clock, opts = {}) {
  if (!isObj(clock)) return [E('clock', 'Clock must be an object or null.')];
  const out = [];
  if (!isStr(clock.id) || !clock.id) out.push(E('clock.id', 'Clock id is required.'));
  if (!isStr(clock.dayId) || !clock.dayId) out.push(E('clock.dayId', 'Clock day id is required.'));
  if (!Number.isInteger(clock.rev) || clock.rev < 0) out.push(E('clock.rev', 'Clock revision must be a whole number.'));
  out.push(...clockStateErrors(clock, 'clock', { ...opts, historical: false }));
  if (clock.state === 'running') {
    if (!isObj(clock.run) || !Number.isFinite(clock.run.mono) || !isStr(clock.run.instanceId)) out.push(E('clock.run', 'A running clock needs its run start {mono, wall, instanceId}.'));
  } else if (clock.run !== null && clock.run !== undefined) {
    out.push(E('clock.run', 'Only a running clock has a run start.'));
  }
  const cp = clock.checkpoint;
  if (cp !== null && cp !== undefined && (!isObj(cp) || !Number.isInteger(cp.index) || !Number.isFinite(cp.elapsedMs) || cp.elapsedMs < 0 || !Number.isFinite(cp.wall) || !isStr(cp.instanceId))) {
    out.push(E('clock.checkpoint', 'Checkpoint must be null or {index, elapsedMs, wall, instanceId}.'));
  }
  if (!Array.isArray(clock.history)) out.push(E('clock.history', 'History must be a list.'));
  else clock.history.forEach((h, i) => out.push(...historyEntryErrors(h, `clock.history[${i}]`, opts)));
  return out;
}
