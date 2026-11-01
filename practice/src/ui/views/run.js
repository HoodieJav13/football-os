// Practice clock: coach view (iPad) and compact assistant view, same tab.
// The display repaints from the monotonic clock; ticks never accumulate time.
import { h } from '../dom.js';
import { deriveView, detectClockAnomaly, clockForProject, buildSteps } from '../../domain/clock.js';
import { rotationRows } from '../../domain/rotation.js';
import { formatCountdown, formatElapsed } from '../../domain/time.js';
import { renderDiagram } from '../diagram.js';
import { beep, isSoundOn, setSound } from '../sound.js';
import { fictionalBadge, daySwitcher, emptyState, byId } from './common.js';
import { lateLine, tickLate, disruptionTools, liveUnfinished, completedReport, savedDebriefs } from './disruption.js';

let live = null; // { ctx, els, lastSample, beeped }

// Run-page messages (S6): one at a time, placed in the open panel's decision
// bar, else under the clock controls (or in the debrief once practice is
// complete), so a message never covers a control. Kept across re-renders.
let runMessage = null; // { message, tone, action, until, id, anchor }
let runMessageSeq = 0;
// Where the coach last tapped or pressed (a saved debrief, the debrief, a
// panel, the controls), so a message shows next to what it is about.
let lastAnchor = null;
const anchorOf = (el) => (!el || !el.closest ? null : el.closest('[data-saved-debriefs]') ? 'saved' : el.closest('.debrief') ? 'debrief' : el.closest('[data-panel]') ? 'panel' : null);
if (typeof document !== 'undefined') document.addEventListener('click', (e) => { lastAnchor = anchorOf(e.target); }, true);

function messageSlot(anchor) {
  const view = document.getElementById('view');
  if (!view) return null;
  const own = anchor === 'saved' || anchor === 'debrief' ? view.querySelector(`[data-run-messages][data-anchor="${anchor}"]`) : null;
  return own || view.querySelector('[data-panel-messages]') || view.querySelector('[data-run-messages][data-primary]') || view.querySelector('[data-run-messages]');
}

function paintRunMessage() {
  for (const old of document.querySelectorAll('[data-inline-message]')) old.remove();
  if (!runMessage || (runMessage.until && Date.now() > runMessage.until)) return;
  const m = runMessage;
  const slot = messageSlot(m.anchor);
  if (!slot) return;
  const el = h('div', { class: `toast toast-inline toast-${m.tone}`, role: m.tone === 'error' ? 'alert' : 'status', 'data-inline-message': '' },
    h('span', { class: 'toast-text' }, m.message),
    m.action ? h('button', { type: 'button', class: 'btn btn-small', on: { click: () => { runMessage = null; paintRunMessage(); m.action.run(); } } }, m.action.label) : null,
    h('button', { type: 'button', class: 'btn btn-small btn-quiet', 'aria-label': 'Dismiss message', on: { click: () => { runMessage = null; paintRunMessage(); } } }, '✕'));
  slot.append(el);
}

export function showRunMessage({ message, action, tone = 'info', timeout = 7000 }) {
  if (!messageSlot(lastAnchor)) return false;
  const id = ++runMessageSeq;
  runMessage = { message, action, tone, until: timeout ? Date.now() + timeout : 0, id, anchor: lastAnchor };
  paintRunMessage();
  // Also announce it in the page's persistent live region (inserted regions are not always read).
  const sr = document.getElementById('sr-live');
  if (sr) { sr.textContent = ''; setTimeout(() => { sr.textContent = message; }, 30); }
  if (timeout) setTimeout(() => { if (runMessage && runMessage.id === id) { runMessage = null; paintRunMessage(); } }, timeout);
  return true;
}

const ACTION_TEXT = { start: 'start', pause: 'pause', resume: 'resume', next: 'next period', skip: 'skip', extend: 'add time', reset: 'reset', revise: 'change' };

export function renderRun(main, ctx, { compact }) {
  const { app } = ctx;
  const p = app.project;
  const day = byId(p.week.days, app.ui.runDayId);
  live = null;
  main.classList.toggle('run-compact', compact);
  if (!day) {
    main.append(h('h1', null, 'Run practice'), emptyState('No day to run', 'Add a day with scheduled periods on the Plan page.', h('a', { class: 'btn', href: '#/plan' }, 'Go to Plan')));
    return;
  }
  const session = app.clock && app.clock.dayId === day.id ? app.clock : null;
  // A clock whose day was deleted no longer blocks other days (it stays in memory for undo).
  const live2 = clockForProject(p, app.clock);
  const otherActive = live2 && live2.dayId !== day.id && live2.state !== 'idle' && live2.state !== 'completed' ? live2 : null;
  const otherDay = otherActive ? byId(p.week.days, otherActive.dayId) : null;

  const head = h('header', { class: 'run-head' },
    h('div', { class: 'page-title' }, h('h1', null, compact ? `Assistant · ${day.label}` : `Run practice · ${day.label}`), fictionalBadge()),
    h('div', { class: 'row-actions' },
      h('a', { class: 'btn', href: compact ? `#/run/${encodeURIComponent(day.id)}` : `#/assist/${encodeURIComponent(day.id)}`, 'data-action': 'toggle-view' }, compact ? 'Coach view' : 'Assistant view'),
      h('button', { type: 'button', class: 'btn', 'aria-pressed': isSoundOn() ? 'true' : 'false', 'data-action': 'sound', on: { click: () => { const on = setSound(!isSoundOn()); ctx.toast(on ? 'Sound cues on: one beep at 1:00 left, two at 0:00.' : 'Sound cues off.'); ctx.render(); } } }, isSoundOn() ? '♪ Sound on' : '♪ Sound off')));
  main.append(head);

  if (!session || session.state === 'idle') {
    main.append(daySwitcher(p.week.days, day.id, (d) => `#/${compact ? 'assist' : 'run'}/${encodeURIComponent(d.id)}`, { label: 'Practice day' }));
  }
  if (otherActive) {
    main.append(h('div', { class: 'banner banner-info', role: 'status' },
      h('p', null, `A practice is in progress for ${otherDay?.label || 'another day'}. Finish or reset it before running ${day.label}.`),
      h('div', { class: 'row-actions' }, h('a', { class: 'btn btn-primary', href: `#/${compact ? 'assist' : 'run'}/${encodeURIComponent(otherActive.dayId)}` }, `Open ${otherDay?.label || 'that day'}`))));
    return;
  }

  if (!session) {
    const scheduled = day.periods.filter((x) => x.scheduled);
    main.append(h('section', { class: 'run-ready' },
      h('h2', null, `${day.label}: ${scheduled.length} scheduled period${scheduled.length === 1 ? '' : 's'}`),
      scheduled.length ? h('p', null, `First up: ${scheduled[0].title}. The clock counts down each period; you advance it with Next. It never completes a period by itself.`) : h('p', null, 'This day has no scheduled periods to run.'),
      h('div', { class: 'row-actions' },
        h('button', { type: 'button', class: 'btn btn-primary btn-huge', 'data-action': 'prepare', disabled: !scheduled.length || !ctx.canWrite(), on: { click: () => { if (ctx.startSessionForDay(day.id)) ctx.render(); } } }, 'Set up the clock'))));
    const saved = savedDebriefs(ctx, day);
    if (saved) main.append(saved);
    paintRunMessage();
    return;
  }

  const view = deriveView(session, ctx.env());
  if (session.dayVersion !== day.version) {
    main.append(h('div', { class: 'note-line note-actions', 'data-stale-script': '' },
      h('p', null, `ℹ The plan changed since this clock was set up (clock uses day v${session.dayVersion}, the plan is day v${day.version}). The clock keeps its script until you rebuild it; nothing changes on its own.`),
      h('button', { type: 'button', class: 'btn', 'data-action': 'rebuild', disabled: !ctx.canWrite(), on: { click: () => confirmReset(ctx, session) } }, 'Rebuild from the current plan…')));
  }
  if (session.recovery) main.append(recoveryBanner(ctx, session));
  if (session.notice) main.append(h('p', { class: 'note-line', role: 'status' }, `ℹ ${session.notice}`));
  const anomaly = h('p', { class: 'note-line', role: 'status', hidden: true, 'data-anomaly': '' });
  main.append(anomaly);

  const els = { anomaly };
  main.append(lateLine(ctx, session, els));
  const ctl = controls(ctx, session, view);
  main.append(compact ? assistantLayout(ctx, day, session, view, els, ctl) : coachLayout(ctx, day, session, view, els, ctl));
  const tools = compact ? null : disruptionTools(ctx, day, session);
  if (tools) main.append(tools);
  main.append(ribbon(session, view));
  const changes = view.state === 'completed' ? null : liveUnfinished(session);
  if (changes) main.append(changes);
  if (view.state === 'completed') main.append(completedReport(ctx, day, session));
  const saved = savedDebriefs(ctx, day);
  if (saved) main.append(saved);
  paintRunMessage();
  if (ctx.app.ui.revealControls) {
    // After Apply: bring the clock, its controls and the message back into view.
    ctx.app.ui.revealControls = false;
    // Right after this render finishes (before any further input), not a frame later.
    queueMicrotask(() => main.querySelector('.run-controls')?.scrollIntoView({ block: 'center' }));
  }
  live = { ctx, els, lastSample: { mono: ctx.env().mono, wall: ctx.env().wall }, beeped: new Set() };
  tickRun();
}

function recoveryBanner(ctx, session) {
  const r = session.recovery;
  const step = session.steps[session.index];
  const savedAt = r.savedAtWall ? new Date(r.savedAtWall).toLocaleTimeString() : 'an unknown time';
  const away = r.awayEstimateMs === null ? 'The time since then could not be estimated (the device clock may have changed).' : `About ${Math.round(r.awayEstimateMs / 60000)} min passed by the device clock; that time was not counted.`;
  return h('div', { class: 'banner banner-warn', role: 'alert', 'data-banner': 'recovery' },
    h('p', null, h('strong', null, 'Recovered after reload. '),
      `The clock was ${r.wasState} on “${step?.title || '—'}” at ${formatElapsed(r.elapsedAtSaveMs)} elapsed when last saved (${savedAt}). It is paused here. ${away}`),
    h('div', { class: 'row-actions' },
      h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'recover-resume', on: { click: () => ctx.clockAction('resume', {}, session.rev) } }, 'Resume clock'),
      h('button', { type: 'button', class: 'btn', 'data-action': 'recover-keep', on: { click: () => { ctx.app.clock = { ...ctx.app.clock, recovery: null }; ctx.render(); } } }, 'Keep paused')));
}

function cardsFor(p, periodIds) {
  const ids = periodIds.flatMap((pid) => p.week.days.flatMap((d) => d.periods.filter((x) => x.id === pid)).flatMap((x) => x.cardIds));
  return [...new Set(ids)].map((id) => byId(p.cards, id)).filter(Boolean);
}

function periodsOf(day, ids) {
  return ids.map((id) => day.periods.find((x) => x.id === id)).filter(Boolean);
}

function clockFace(view, els, big) {
  els.time = h('p', { class: `clock-time${big ? ' clock-time-xl' : ''}`, 'data-clock-time': '', 'aria-live': 'off' }, '--:--');
  els.status = h('p', { class: 'clock-status', 'data-clock-status': '' }, '');
  els.meter = h('span', { class: 'meter-fill' });
  els.elapsed = h('p', { class: 'clock-sub' }, '');
  return h('div', { class: 'clock-face', 'data-state': view.state },
    els.time, els.status,
    h('div', { class: 'meter meter-lg', 'aria-hidden': 'true' }, els.meter),
    els.elapsed);
}

function stepDetails(p, day, periods) {
  return periods.map((per) => h('div', { class: 'run-period' },
    h('h3', null, per.title),
    per.objective ? h('p', { class: 'run-objective' }, h('span', { class: 'label' }, 'Objective '), per.objective) : null,
    per.callLabel ? h('p', null, h('span', { class: 'label' }, 'Call / look '), per.callLabel) : null,
    per.groupIds.length ? h('p', null, h('span', { class: 'label' }, 'Groups '), per.groupIds.map((g) => byId(p.groups, g)?.label || g).join(', ')) : null,
    per.notes ? h('p', { class: 'run-notes' }, per.notes) : null));
}

function cardFigures(cards, label) {
  if (!cards.length) return h('p', { class: 'muted' }, 'No scout card on this period.');
  const [first, ...rest] = cards;
  return h('div', { class: 'run-cards' },
    h('figure', { class: 'run-card' }, renderDiagram(first, { size: 'full' }), h('figcaption', null, h('strong', null, `${label}${first.lookLabel || first.title}`), ' · REFERENCE / FICTIONAL')),
    rest.length ? h('ul', { class: 'run-card-more' }, rest.map((c) => h('li', null, renderDiagram(c, { size: 'thumb' }), h('span', null, c.lookLabel || c.title)))) : null);
}

function coachLayout(ctx, day, session, view, els, ctl) {
  const p = ctx.app.project;
  const cur = view.current;
  const periods = cur ? periodsOf(day, cur.periodIds) : [];
  const cards = cur ? cardsFor(p, cur.periodIds) : [];
  return h('section', { class: 'run-coach', 'aria-label': 'Current period' },
    h('div', { class: 'run-main' },
      h('p', { class: 'run-step' }, cur ? `Period ${view.index + 1} of ${view.total}${periods.length > 1 ? ' · parallel stations' : ''}` : `All ${view.total} periods finished`),
      h('h2', { class: 'run-title', 'data-current-title': '' }, cur ? cur.title : 'Practice complete'),
      clockFace(view, els, true),
      ctl,
      h('div', { class: 'run-messages', 'data-run-messages': '', ...(view.state !== 'completed' ? { 'data-primary': '' } : {}) }),
      stepDetails(p, day, periods)),
    h('aside', { class: 'run-side' },
      nextBox(ctx, day, view, els),
      cardFigures(cards, 'Now: ')));
}

function unfilledCount(ctx, day, periodIds) {
  const p = ctx.app.project;
  const rot = p.rotations[day.id];
  if (!rot) return null;
  return rotationRows({ day, groups: p.groups, participants: p.participants, rotation: rot }).filter((r) => periodIds.includes(r.periodId) && !r.participantId).length;
}

function nextBox(ctx, day, view, els, { withCard = false } = {}) {
  const p = ctx.app.project;
  if (!view.next) return h('div', { class: 'run-next' }, h('h3', null, 'Next'), h('p', { class: 'muted' }, view.state === 'completed' ? '—' : 'This is the last period.'));
  const periods = periodsOf(day, view.next.periodIds);
  const gaps = unfilledCount(ctx, day, view.next.periodIds);
  els.startsIn = h('span', { class: 'run-next-when', 'data-next-when': '' }, '');
  return h('div', { class: 'run-next', 'data-next': '' },
    h('h3', null, 'Next ', els.startsIn),
    h('p', { class: 'run-next-title' }, view.next.title, h('span', { class: 'muted' }, ` · ${formatElapsed(view.next.plannedMs)}`)),
    gaps ? h('p', { class: 'warn-text small', 'data-next-gaps': '' }, `⚠ ${gaps} unfilled scout slot${gaps === 1 ? '' : 's'} next — see the rotation.`) : null,
    h('div', { class: `run-next-periods${periods.length > 1 ? ' is-stations' : ''}` }, periods.map((per) => {
      const cards = per.cardIds.map((id) => byId(p.cards, id)).filter(Boolean);
      return h('div', { class: 'run-next-period' },
        periods.length > 1 ? h('p', { class: 'run-next-station' }, per.title) : null,
        h('p', { class: 'small' }, h('span', { class: 'label' }, 'Groups'), per.groupIds.map((g) => byId(p.groups, g)?.label || g).join(', ') || 'none'),
        h('p', { class: 'small' }, h('span', { class: 'label' }, 'Cards'), cards.map((c) => c.lookLabel || c.title).join(', ') || 'none'),
        withCard && cards[0] ? h('figure', { class: 'run-card run-card-next' }, renderDiagram(cards[0], { size: 'full' }), h('figcaption', null, h('strong', null, `${periods.length > 1 ? `${per.title}: ` : 'Next card: '}${cards[0].lookLabel || cards[0].title}`), ' · REFERENCE / FICTIONAL')) : null);
    })));
}

function assignmentsFor(ctx, day, periodIds) {
  const p = ctx.app.project;
  const rot = p.rotations[day.id];
  if (!rot) return h('p', { class: 'muted small' }, 'No rotation generated for this day.');
  // Unfilled slots first: they are what the assistant must sort out.
  const rows = rotationRows({ day, groups: p.groups, participants: p.participants, rotation: rot }).filter((r) => periodIds.includes(r.periodId))
    .sort((a, b) => Number(!!a.participantId) - Number(!!b.participantId));
  if (!rows.length) return h('p', { class: 'muted small' }, 'No scout groups in this period.');
  return h('ul', { class: 'assign-list' }, rows.map((r) => h('li', { class: r.participantId ? '' : 'is-unfilled' },
    h('span', { class: 'muted' }, `${byId(p.groups, r.groupId)?.label} ${r.roleLabel || r.roleKey}: `),
    r.participantId ? byId(p.participants, r.participantId)?.label || r.participantId : '⚠ UNFILLED')));
}

function assistantLayout(ctx, day, session, view, els, ctl) {
  const p = ctx.app.project;
  const cur = view.current;
  const cards = cur ? cardsFor(p, cur.periodIds) : [];
  return h('section', { class: 'run-assist', 'aria-label': 'Assistant view' },
    h('div', { class: 'assist-now' },
      h('p', { class: 'run-step' }, cur ? `Now · ${view.index + 1} of ${view.total}` : 'Practice complete'),
      h('h2', { class: 'run-title', 'data-current-title': '' }, cur ? cur.title : 'Practice complete'),
      clockFace(view, els, false),
      ctl,
      h('div', { class: 'run-messages', 'data-run-messages': '', ...(view.state !== 'completed' ? { 'data-primary': '' } : {}) }),
      cards[0] ? h('p', { class: 'small' }, `Card now: ${cards.map((c) => c.lookLabel || c.title).join(', ')}`) : null,
      cur ? h('details', { class: 'disclosure', open: true, 'data-key': 'assign-now' }, h('summary', null, 'Scout assignments now'), assignmentsFor(ctx, day, cur.periodIds)) : null),
    h('div', { class: 'assist-next' },
      nextBox(ctx, day, view, els, { withCard: true }),
      view.next ? h('details', { class: 'disclosure', open: true, 'data-key': 'assign-next' }, h('summary', null, 'Scout assignments next'), assignmentsFor(ctx, day, view.next.periodIds)) : null));
}

function controls(ctx, session, view) {
  const rev = session.rev;
  const can = ctx.canWrite();
  const act = (type, extra) => () => ctx.clockAction(type, extra, rev);
  const btn = (label, type, opts = {}) => h('button', { type: 'button', class: `btn ${opts.cls || ''}`, 'data-clock-action': type + (opts.suffix || ''), 'data-focus': `clock-${type}${opts.suffix || ''}`, disabled: !can || opts.disabled, on: { click: opts.onClick || act(type, opts.extra) } }, label);
  const running = view.state === 'running';
  const live2 = view.state === 'running' || view.state === 'paused';
  const undoLabel = view.lastAction ? `Undo ${ACTION_TEXT[view.lastAction] || view.lastAction}` : 'Undo';
  return h('section', { class: 'run-controls', 'aria-label': 'Clock controls', 'data-rev': String(rev), 'data-state': view.state },
    view.state === 'idle' ? btn('▶ Start practice', 'start', { cls: 'btn-primary btn-huge' }) : null,
    running ? btn('❚❚ Pause', 'pause', { cls: 'btn-huge' }) : null,
    view.state === 'paused' ? btn('▶ Resume', 'resume', { cls: 'btn-primary btn-huge' }) : null,
    live2 ? btn(view.next ? 'Next period ⏭' : 'Finish practice ⏭', 'next', { cls: 'btn-primary btn-huge' }) : null,
    live2 ? btn('+1 min', 'extend', { extra: { sec: 60 }, suffix: '-60' }) : null,
    live2 ? btn('+2 min', 'extend', { extra: { sec: 120 }, suffix: '-120' }) : null,
    live2 ? btn('Skip period', 'skip') : null,
    btn(undoLabel, 'undo', { disabled: !view.canUndo }),
    view.state !== 'idle' ? btn('Reset…', 'reset', { cls: 'btn-danger-quiet', onClick: () => confirmReset(ctx, session) }) : null);
}

// Reset is confirmed and rebuilds the clock from the current version of the day
// (order, periods, durations, parallel blocks). Cancel changes nothing; Undo
// restores the previous session, script version included.
async function confirmReset(ctx, session) {
  const rev = session.rev;
  const day = byId(ctx.app.project.week.days, session.dayId);
  if (!day) return;
  const steps = buildSteps(day);
  const total = steps.reduce((a, s) => a + s.plannedSec, 0);
  const running = session.state === 'running' || session.state === 'paused';
  const ok = await ctx.confirmDialog({
    title: session.state === 'idle' ? 'Rebuild the clock from the current plan?' : 'Reset the practice clock?',
    body: `${running ? 'This stops the practice in progress. ' : ''}All periods go back to not started, and the clock is rebuilt from the current plan: ${day.label}, day v${day.version}, ${steps.length} period block${steps.length === 1 ? '' : 's'}, ${formatElapsed(total * 1000)} planned. You can undo this right after.`,
    confirmLabel: session.state === 'idle' ? 'Rebuild clock' : 'Reset clock',
    danger: true,
  });
  if (!ok) return;
  ctx.clockAction('reset', { day: byId(ctx.app.project.week.days, session.dayId) }, rev);
}

const STATUS_MARK = { pending: '○', active: '▶', done: '✓', skipped: '⤼' };

function ribbon(session, view) {
  const total = session.steps.reduce((a, s) => a + s.plannedSec + s.extensionSec, 0) || 1;
  return h('section', { class: 'ribbon', 'aria-label': 'Practice script progress' },
    h('ol', { class: 'ribbon-list' }, session.steps.map((s, i) => h('li', {
      class: `ribbon-step is-${s.status}${i === view.index && view.state !== 'completed' ? ' is-current' : ''}`,
      style: { flexGrow: String(s.plannedSec + s.extensionSec) },
      'data-step-status': s.status,
      title: `${s.title}: ${s.status}`,
    }, h('span', { class: 'ribbon-mark', 'aria-hidden': 'true' }, STATUS_MARK[s.status]), h('span', { class: 'ribbon-label' }, `${s.title}${Number.isInteger(s.originalSec) && s.plannedSec < s.originalSec ? ' ✂' : ''}${s.origin === 'moved' ? ' ↪' : ''}`), h('span', { class: 'sr-only' }, ` (${s.status}${Number.isInteger(s.originalSec) && s.plannedSec < s.originalSec ? ', shortened by coach' : ''})`)))),
    h('p', { class: 'small muted' }, `${view.doneCount} done · ${view.skippedCount} skipped · ${formatElapsed(view.totalElapsedMs)} elapsed of ${formatElapsed(total * 1000)} planned`));
}

// Called ~5 times a second by the app loop while this view is shown.
export function tickRun() {
  if (!live || !live.els.time || !live.ctx.app.clock) return;
  const { ctx, els } = live;
  const session = ctx.app.clock;
  const e = ctx.env();
  const v = deriveView(session, e);
  tickLate(session, els, e);
  const a = detectClockAnomaly(live.lastSample, { mono: e.mono, wall: e.wall });
  live.lastSample = { mono: e.mono, wall: e.wall };
  if (a.anomaly) {
    els.anomaly.hidden = false;
    els.anomaly.textContent = a.kind === 'wall-ahead'
      ? 'ℹ The device clock jumped ahead or the device slept. Elapsed time uses the steady clock and was not changed.'
      : 'ℹ The device clock was set back. Elapsed time uses the steady clock and was not changed.';
  }
  if (!v.current) {
    els.time.textContent = 'Done';
    els.status.textContent = '✓ Every period was ended by the coach.';
    els.meter.style.width = '100%';
    els.elapsed.textContent = '';
    return;
  }
  const c = formatCountdown(v.current.remainingMs);
  els.time.textContent = c.text;
  if (els.startsIn) {
    els.startsIn.textContent = v.state === 'idle' ? '' : c.overrun ? `· when the coach advances (current period is ${c.text} over)` : `· in about ${c.text}, when the coach advances`;
  }
  els.time.classList.toggle('is-over', c.overrun);
  const planned = v.current.plannedMs + v.current.extensionMs;
  const stateWord = v.state === 'idle' ? 'Ready' : v.state === 'paused' ? '❚❚ Paused' : '▶ Running';
  els.status.textContent = c.overrun ? `${stateWord} · ⚠ OVER planned time — advance when ready` : `${stateWord} · ${v.state === 'idle' ? 'planned' : 'remaining'}`;
  els.status.classList.toggle('is-over', c.overrun);
  els.meter.style.width = `${Math.min(100, (v.current.elapsedMs / Math.max(1, planned)) * 100)}%`;
  els.meter.parentElement.classList.toggle('is-over', c.overrun);
  els.elapsed.textContent = `${formatElapsed(v.current.elapsedMs)} elapsed of ${formatElapsed(v.current.plannedMs)} planned${v.current.extensionMs ? ` +${formatElapsed(v.current.extensionMs)} added` : ''}`;
  if (v.state === 'running') {
    const key = `${session.id}:${v.index}`;
    if (v.current.remainingMs <= 60000 && v.current.remainingMs > 0 && !live.beeped.has(`${key}:60`)) { live.beeped.add(`${key}:60`); beep({ times: 1 }); }
    if (v.current.remainingMs <= 0 && !live.beeped.has(`${key}:0`)) { live.beeped.add(`${key}:0`); beep({ times: 2, freq: 660 }); }
  }
}

