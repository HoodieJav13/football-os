// C1 run-screen pieces: behind-the-plan notice, coach-chosen rebalance and
// unavailable-station panels, what really happened, and the debrief with its
// unfinished-work handoff. Every change goes through the clock's undoable
// `revise` action or an undoable project commit; nothing changes on its own.
import { h } from '../dom.js';
import { projection, proposeRebalance, proposeStation, stepOutcomes, unfinishedWork, buildRecord, updateRecord, recordForRun, carryOver, reasonText } from '../../domain/disruption.js';
import { formatElapsed } from '../../domain/time.js';
import { byId } from './common.js';
import { exportPracticeDebrief } from '../../domain/debrief-export.js';

const fmt = (sec) => formatElapsed(sec * 1000);
const OUTCOME_TEXT = { completed: '✓ Completed', 'ended-early': '✓ Ended early', shortened: '✂ Shortened by coach', skipped: '⤼ Skipped', 'not-reached': '○ Not reached', 'in-progress': '▶ In progress' };
const ui = (ctx) => ctx.app.ui;
const panel = (ctx) => ui(ctx).disrupt || null;
const setPanel = (ctx, value) => { ui(ctx).disrupt = value; ctx.render(); };

// Live line, shown and filled by tickLate() from the steady clock.
export function lateLine(ctx, session, els) {
  els.lateText = h('p', null, '');
  const open = panel(ctx)?.kind === 'rebalance';
  els.late = h('div', { class: 'banner banner-warn late-banner', role: 'status', 'data-late': '', hidden: true },
    els.lateText,
    open ? null : h('div', { class: 'row-actions' },
      h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'open-rebalance-late', disabled: !ctx.canWrite(), on: { click: () => openRebalance(ctx, session) } }, 'Rebalance remaining time…')));
  return els.late;
}

export function tickLate(session, els, env) {
  if (!els.late) return;
  const live = session.state === 'running' || session.state === 'paused';
  const p = live ? projection(session, env) : null;
  const late = !!p && p.lateBySec >= 60;
  els.late.hidden = !late;
  if (!late) return;
  const text = `⚠ Running about ${Math.round(p.lateBySec / 60)} min behind the plan: about ${fmt(p.projectedSec)} in total against ${fmt(p.planSec)} planned. You choose what to change; nothing is shortened on its own.`;
  if (els.lateText.textContent !== text) els.lateText.textContent = text;
}

// The coach sets an end point ("N minutes from now"); it stays fixed on the
// steady clock while the panel is open, so the time left counts down.
function openRebalance(ctx, session) {
  const e = ctx.env();
  const p = projection(session, e);
  setPanel(ctx, { kind: 'rebalance', sessionId: session.id, endAtMono: e.mono + p.minutesLeft * 60_000, mode: 'fit', defer: [] });
}
const secondsLeft = (st, env) => Math.max(0, Math.floor((st.endAtMono - env.mono) / 1000));
const sameChange = (a, b) => JSON.stringify([a.pending, a.unfinished.map((u) => u.periodId)]) === JSON.stringify([b.pending, b.unfinished.map((u) => u.periodId)]);

// ---------------------------------------------------------------- tools
export function disruptionTools(ctx, day, session) {
  if (!['idle', 'running', 'paused'].includes(session.state)) return null;
  const open = panel(ctx);
  const can = ctx.canWrite();
  const section = h('section', { class: 'panel disrupt', 'aria-label': 'Disruptions', 'data-disrupt': '' },
    h('div', { class: 'note-actions' },
      h('p', null, h('strong', null, 'Disruption? '), 'Rebalance the time that is left, or handle a station that is not available. You see the result before anything changes, and Undo puts it back.'),
      h('div', { class: 'row-actions' },
        h('button', { type: 'button', class: 'btn', 'data-action': 'open-rebalance', 'data-focus': 'open-rebalance', 'aria-expanded': open?.kind === 'rebalance' ? 'true' : 'false', disabled: !can, on: { click: () => (open?.kind === 'rebalance' ? setPanel(ctx, null) : openRebalance(ctx, session)) } }, 'Rebalance remaining time…'),
        h('button', { type: 'button', class: 'btn', 'data-action': 'open-station', 'data-focus': 'open-station', 'aria-expanded': open?.kind === 'station' ? 'true' : 'false', disabled: !can, on: { click: () => setPanel(ctx, open?.kind === 'station' ? null : { kind: 'station', sessionId: session.id, periodId: null, choice: 'later' }) } }, 'Station unavailable…'))));
  if (open && open.sessionId === session.id && open.kind === 'rebalance') section.append(rebalancePanel(ctx, session));
  if (open && open.sessionId === session.id && open.kind === 'station') section.append(stationPanel(ctx, session));
  return section;
}

function rebalancePanel(ctx, session) {
  const st = panel(ctx);
  const opts = () => ({ secondsLeft: secondsLeft(st, ctx.env()), mode: st.mode, deferIndexes: st.defer });
  const r = proposeRebalance(session, ctx.env(), opts());
  if (r.error) return h('p', { class: 'error-text' }, r.error);
  const pv = r.preview;
  const update = (patch) => setPanel(ctx, { ...st, ...patch });
  const minutes = h('input', { id: 'minutes-left', 'data-focus': 'minutes-left', type: 'number', min: 0, max: 600, step: 1, value: String(Math.round(secondsLeft(st, ctx.env()) / 60)), name: 'minutesLeft', 'data-field': 'minutes-left', inputmode: 'numeric', on: { change: (e) => update({ endAtMono: ctx.env().mono + Math.max(0, Math.min(600, Math.floor(Number(e.target.value) || 0))) * 60_000 }) } });
  const radio = (value, label) => h('label', { class: 'choice' }, h('input', { type: 'radio', name: 'rebalanceMode', value, checked: st.mode === value, 'data-mode': value, 'data-focus': `mode-${value}`, on: { change: () => update({ mode: value }) } }), ` ${label}`);
  const changeText = (row) => {
    if (row.deferred) return '→ unfinished work';
    if (row.toSec < row.fromSec) return `✂ shortened by ${fmt(row.fromSec - row.toSec)}`;
    return 'unchanged';
  };
  const status = pv.fits
    ? `Fits: ${fmt(pv.keptSec)} of the ${fmt(pv.availableSec)} left after the current period${pv.currentRemainingSec ? ` (${fmt(pv.currentRemainingSec)} still to run)` : ''}.`
    : `Still about ${fmt(pv.overBySec)} over the time left${st.mode === 'keep' ? ': practice would finish late' : ' even at 2 minutes a period'}. Move a period to unfinished work, allow more minutes, or keep the plan.`;
  return h('div', { class: 'disrupt-panel', 'data-panel': 'rebalance' },
    h('h3', null, 'Rebalance the remaining time'),
    h('div', { class: 'disrupt-options' },
      h('div', { class: 'field' }, h('label', { for: 'minutes-left' }, 'Minutes left in practice'), minutes,
        h('p', { class: 'field-hint' }, `Running time left in the plan: ${projection(session, ctx.env()).minutesLeft} min (pauses and a late start are not counted). Set the real minutes left if the field or bus time is shorter; it counts down while you decide.`)),
      h('fieldset', { class: 'field' }, h('legend', null, 'Remaining periods'),
        radio('fit', 'Shorten them to fit (whole minutes, none under 2 min)'),
        radio('keep', 'Keep their lengths and finish late'))),
    h('div', { class: 'table-wrap' }, h('table', { class: 'counts-table rebalance-table' },
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Period'), h('th', { scope: 'col' }, 'Now'), h('th', { scope: 'col' }, 'After'), h('th', { scope: 'col' }, 'Change'), h('th', { scope: 'col' }, 'Move to unfinished work'))),
      h('tbody', null, pv.rows.map((row) => h('tr', { 'data-rebalance-row': String(row.index), class: row.deferred ? 'is-deferred' : row.toSec < row.fromSec ? 'is-shortened' : '' },
        h('th', { scope: 'row' }, row.title),
        h('td', { 'data-label': 'Now' }, fmt(row.fromSec)),
        h('td', { 'data-after': '', 'data-label': 'After' }, row.deferred ? '—' : fmt(row.toSec)),
        h('td', { 'data-label': 'Change' }, changeText(row)),
        h('td', { class: 'defer-cell' }, h('label', { class: 'choice' }, h('input', { type: 'checkbox', 'data-defer': String(row.index), 'data-focus': `defer-${row.index}`, checked: row.deferred, on: { change: (e) => update({ defer: e.target.checked ? st.defer.concat([row.index]) : st.defer.filter((i) => i !== row.index) }) } }), h('span', { class: 'defer-label' }, 'Unfinished'), h('span', { class: 'sr-only' }, ` — move ${row.title} to unfinished work`)))))))),
    // The result and the decision stay pinned in view while the coach adjusts.
    h('div', { class: 'disrupt-decision', 'data-decision': '' },
    h('div', { 'data-panel-messages': '' }),
    h('p', { class: pv.fits ? 'ok-text' : 'warn-text', 'data-rebalance-status': '' }, status),
    h('div', { class: 'row-actions' },
      h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'apply-rebalance', disabled: !ctx.canWrite() || !pv.rows.length, on: { click: () => {
        // Apply only what is on screen: if the time left changed what fits, show the update first.
        const now = proposeRebalance(ctx.app.clock, ctx.env(), opts());
        if (now.error || !sameChange(now.change, r.change)) { ctx.toast('The time left changed while this was open. Check the updated preview, then apply.', { tone: 'warn' }); ctx.render(); return; }
        if (ctx.clockAction('revise', { change: now.change }, session.rev)) { ui(ctx).disrupt = null; ui(ctx).pendingFocus = 'clock-undo'; ui(ctx).revealControls = true; ctx.toast('Remaining time rebalanced. Undo puts the previous plan back.'); ctx.render(); }
      } } }, 'Apply this plan'),
      h('button', { type: 'button', class: 'btn', 'data-action': 'cancel-disrupt', on: { click: () => { ui(ctx).pendingFocus = 'open-rebalance'; setPanel(ctx, null); } } }, 'Cancel — keep the plan'))));
}

function stationPanel(ctx, session) {
  const st = panel(ctx);
  const first = session.state === 'idle' ? 0 : session.index;
  const options = session.steps.slice(first).flatMap((step, k) => step.periodIds.map((id) => ({ id, label: `${(session.plan?.periods || []).find((x) => x.id === id)?.title || id}${first + k === session.index && session.state !== 'idle' ? ' (now)' : ''}`, parallel: step.periodIds.length > 1 })));
  const chosen = st.periodId && options.some((o) => o.id === st.periodId) ? st.periodId : null;
  const update = (patch) => setPanel(ctx, { ...st, ...patch });
  const r = chosen ? proposeStation(session, ctx.env(), chosen, st.choice) : null;
  const radio = (value, label) => h('label', { class: 'choice' }, h('input', { type: 'radio', name: 'stationChoice', value, checked: st.choice === value, 'data-choice': value, 'data-focus': `choice-${value}`, on: { change: () => update({ choice: value }) } }), ` ${label}`);
  let effect = 'Choose the station that is not available.';
  if (r?.error) effect = `✕ ${r.error}`;
  else if (r) effect = st.choice === 'later'
    ? `${r.preview.title} gets its own ${fmt(r.preview.addedSec)} period right after ${r.preview.isCurrent ? 'the current one' : 'its block'}. Practice gets ${fmt(r.preview.addedSec)} longer unless you rebalance.`
    : `${r.preview.title} moves to unfinished work${r.preview.ranMs ? ` (it ran ${formatElapsed(r.preview.ranMs)} so far)` : ''}. You can carry it to a later day in the debrief.`;
  return h('div', { class: 'disrupt-panel', 'data-panel': 'station' },
    h('h3', null, 'A station is not available'),
    h('div', { class: 'disrupt-options' },
      h('div', { class: 'field' }, h('label', { for: 'station-select' }, 'Station'),
        h('select', { id: 'station-select', name: 'station', 'data-field': 'station', 'data-focus': 'station', on: { change: (e) => update({ periodId: e.target.value || null }) } },
          h('option', { value: '' }, 'Choose…'),
          options.map((o) => h('option', { value: o.id, selected: o.id === chosen }, `${o.label}${o.parallel ? ' · parallel' : ''}`)))),
      h('fieldset', { class: 'field' }, h('legend', null, 'What to do with its work'),
        radio('later', 'Run it later today, on its own'),
        radio('defer', 'Move it to unfinished work'))),
    h('div', { class: 'disrupt-decision', 'data-decision': '' },
    h('div', { 'data-panel-messages': '' }),
    h('p', { class: r?.error ? 'warn-text' : 'muted', 'data-station-effect': '' }, effect),
    h('div', { class: 'row-actions' },
      h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'apply-station', disabled: !ctx.canWrite() || !r || !!r.error, on: { click: () => {
        // Re-propose at the moment of Apply so "ran so far" is current.
        const now = proposeStation(ctx.app.clock, ctx.env(), chosen, st.choice);
        if (now.error) { ctx.toast(now.error, { tone: 'warn' }); ctx.render(); return; }
        if (ctx.clockAction('revise', { change: now.change }, session.rev)) { ui(ctx).disrupt = null; ui(ctx).pendingFocus = 'clock-undo'; ui(ctx).revealControls = true; ctx.toast('Station change applied. Undo puts the previous plan back.'); ctx.render(); }
      } } }, 'Apply'),
      h('button', { type: 'button', class: 'btn', 'data-action': 'cancel-disrupt', on: { click: () => { ui(ctx).pendingFocus = 'open-station'; setPanel(ctx, null); } } }, 'Cancel'))));
}

// ---------------------------------------------------------------- during and after
export function liveUnfinished(session) {
  const changes = session.changes || [];
  const work = unfinishedWork(session).filter((w) => w.reason !== 'not-reached');
  if (!changes.length && !work.length) return null;
  return h('section', { class: 'panel live-changes', 'data-live-changes': '' },
    changes.length ? h('div', null, h('h3', null, 'Changes during practice'), h('ol', { class: 'change-log' }, changes.map((c) => h('li', null, h('span', { class: 'muted' }, `${new Date(c.at).toLocaleTimeString()} · `), c.summary)))) : null,
    work.length ? h('div', null, h('h3', null, 'Unfinished work so far'), h('ul', { 'data-unfinished-live': '' }, work.map((w) => h('li', null, `${w.title} — ${reasonText(w.reason)}${w.ranMs ? `, ran ${formatElapsed(w.ranMs)}` : ''}`)))) : null);
}

export function completedReport(ctx, day, session) {
  const outcomes = stepOutcomes(session);
  const work = unfinishedWork(session);
  const plan = session.plan;
  return h('section', { class: 'run-summary', 'data-summary': '' },
    h('h2', null, 'Practice complete'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'counts-table' },
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Period'), h('th', { scope: 'col' }, 'Planned'), h('th', { scope: 'col' }, 'Ran'), h('th', { scope: 'col' }, 'What happened'))),
      h('tbody', null, outcomes.map((o) => h('tr', { 'data-outcome': o.outcome },
        h('th', { scope: 'row' }, o.title),
        h('td', null, o.originalSec !== o.plannedSec ? `${fmt(o.originalSec)} → ${fmt(o.plannedSec)}${o.extensionSec ? ` +${fmt(o.extensionSec)}` : ''}` : `${fmt(o.plannedSec)}${o.extensionSec ? ` +${fmt(o.extensionSec)}` : ''}`),
        h('td', null, formatElapsed(o.ranMs)),
        h('td', null, h('strong', null, OUTCOME_TEXT[o.outcome]), ' ', h('span', { class: 'small' }, o.text))))))),
    session.startedWall ? h('p', { class: 'muted small' }, `Started ${new Date(session.startedWall).toLocaleTimeString()}, ended ${session.endedWall ? new Date(session.endedWall).toLocaleTimeString() : '—'} (device clock).`) : null,
    work.length ? h('div', null, h('h3', null, 'Unfinished work'), h('ul', { 'data-unfinished': '' }, work.map((w) => h('li', null, `${w.title} — ${reasonText(w.reason)} (${fmt(w.plannedSec)} planned${w.ranMs ? `, ran ${formatElapsed(w.ranMs)}` : ''})`)))) : h('p', { class: 'muted' }, 'No unfinished work.'),
    (session.changes || []).length ? h('div', null, h('h3', null, 'Changes during practice'), h('ol', { class: 'change-log' }, session.changes.map((c) => h('li', null, c.summary)))) : null,
    plan ? h('details', { class: 'disclosure', 'data-key': 'original-plan' }, h('summary', null, `Original plan (day v${plan.dayVersion}): ${plan.steps.length} periods, ${fmt(plan.steps.reduce((a, x) => a + x.plannedSec, 0))}`),
      h('ol', { 'data-original-plan': '' }, plan.steps.map((x) => h('li', null, `${x.title} · ${fmt(x.plannedSec)}`)))) : null,
    debriefForm(ctx, day, session));
}

function debriefForm(ctx, day, session) {
  const existing = recordForRun(ctx.app.project.records, session);
  const notes = h('textarea', { rows: 4, maxlength: 4000, name: 'debriefNotes', id: 'debrief-notes', 'data-field': 'debrief-notes', on: { input: (e) => {
    // The draft is kept with the clock, so a reload does not lose it.
    ctx.app.clock = { ...ctx.app.clock, debriefDraft: e.target.value };
    ctx.saveClockNow();
  } } }, session.debriefDraft ?? existing?.notes ?? '');
  const save = () => {
    const text = notes.value;
    const rec = existing
      ? updateRecord(existing, session, day, { notes: text, wall: ctx.env().wall })
      : buildRecord(session, day, { id: ctx.ids('rec'), notes: text, wall: ctx.env().wall });
    const records = (ctx.app.project.records || []).filter((r) => r.id !== rec.id).concat([rec]);
    ctx.commit({ ...ctx.app.project, records }, { label: existing ? 'Updated the debrief' : 'Saved the debrief', undoable: true });
  };
  return h('section', { class: 'panel debrief', 'aria-label': 'Debrief' },
    h('h3', null, 'Debrief'),
    h('div', { class: 'field' }, h('label', { for: 'debrief-notes' }, 'What to keep, fix or carry forward (fictional notes only)'), notes),
    h('div', { class: 'row-actions' },
      h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'save-debrief', disabled: !ctx.canWrite(), on: { click: save } }, existing ? 'Update debrief' : 'Save debrief'),
      existing ? h('span', { class: 'muted small', 'data-debrief-saved': '' }, `Saved ${new Date(existing.savedWall).toLocaleString()}`) : null),
    h('div', { class: 'run-messages', 'data-run-messages': '', 'data-primary': '', 'data-anchor': 'debrief' }));
}

// Saved debriefs for a day, with the unfinished-work handoff. Shown whatever the
// clock is doing, so they can be reopened after a reload or a new practice.
export function savedDebriefs(ctx, day) {
  const p = ctx.app.project;
  const recs = (p.records || []).filter((r) => r.dayId === day.id).slice().reverse();
  if (!recs.length) return null;
  const others = p.week.days.filter((d) => d.id !== day.id);
  return h('section', { class: 'panel saved-debriefs', 'aria-label': 'Saved debriefs', 'data-saved-debriefs': '' },
    h('h2', null, `Saved debriefs · ${day.label}`),
    h('div', { class: 'run-messages', 'data-run-messages': '', 'data-anchor': 'saved' }),
    recs.map((rec) => h('article', { class: 'debrief-record', 'data-record': rec.id },
      h('p', { class: 'muted small' }, `Saved ${new Date(rec.savedWall).toLocaleString()} · day v${rec.dayVersion} · ${countText(rec.steps)}`),
      rec.notes ? h('p', { class: 'debrief-notes', 'data-record-notes': '' }, rec.notes) : h('p', { class: 'muted' }, 'No notes.'),
      h('div', { class: 'row-actions' },
        h('button', { type: 'button', class: 'btn btn-small', 'data-action': 'export-debrief', 'data-record-id': rec.id, on: { click: (e) => {
          const doc = exportPracticeDebrief(ctx.app.project, rec.id, { wall: ctx.env().wall });
          if (doc.error) return ctx.toast(doc.error, { tone: 'warn', timeout: 15000 });
          ctx.downloadExport(`${JSON.stringify(doc, null, 2)}\n`, `practice-debrief-FICTIONAL-${rec.dayLabel.replace(/[^A-Za-z0-9]+/g, '-')}-${rec.id}.json`);
          const note = e.currentTarget.parentElement.querySelector('[data-export-note]');
          if (note) note.textContent = `Export requested at ${new Date().toLocaleTimeString()}. Check your downloads — a download request is not proof the file was saved.`;
        } } }, 'Export debrief (JSON)'),
        h('span', { class: 'muted small', 'data-export-note': '', role: 'status' }, '')),
      rec.unfinished.length ? h('div', null, h('h3', null, 'Unfinished work handoff'),
        h('ul', { class: 'handoff-list' }, rec.unfinished.map((u) => h('li', { 'data-handoff': u.id },
          h('span', null, `${u.title} — ${reasonText(u.reason)} (${fmt(u.plannedSec)})`),
          u.carriedTo ? h('span', { class: 'ok-text', 'data-carried': '' }, ` ✓ Carried to ${byId(p.week.days, u.carriedTo.dayId)?.label || 'a later day'} as an unscheduled period — place it on the Plan page.`) : carryControl(ctx, rec, u, others))))) : h('p', { class: 'muted' }, 'No unfinished work.'))));
}

const COUNT_WORDS = [['completed', 'completed'], ['ended-early', 'ended early'], ['shortened', 'shortened by coach'], ['skipped', 'skipped'], ['not-reached', 'not reached'], ['in-progress', 'in progress']];
function countText(steps) {
  return COUNT_WORDS.map(([k, w]) => [steps.filter((x) => x.outcome === k).length, w]).filter(([n]) => n).map(([n, w]) => `${n} ${w}`).join(', ');
}

function carryControl(ctx, rec, u, others) {
  if (!others.length) return h('span', { class: 'muted' }, ' (no other day to carry it to)');
  const sel = h('select', { 'aria-label': `Day to carry ${u.title} to`, 'data-carry-day': u.id }, others.map((d) => h('option', { value: d.id }, d.label)));
  return h('span', { class: 'carry' }, ' ', sel, ' ',
    h('button', { type: 'button', class: 'btn btn-small', 'data-action': 'carry', 'data-item': u.id, disabled: !ctx.canWrite(), on: { click: () => {
      const r = carryOver(ctx.app.project, rec.id, u.id, sel.value, ctx.ids);
      if (r.error) return ctx.toast(r.error, { tone: 'warn' });
      ctx.commit(r.project, { label: `Carried ${u.title} to ${byId(r.project.week.days, sel.value)?.label}`, undoable: true });
    } } }, 'Add to that day'));
}
