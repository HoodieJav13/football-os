// Plan view: week overview, the selected day's script, totals and the period editor.
import { h, clear } from '../dom.js';
import * as W from '../../domain/week.js';
import { formatClock12, formatHHMM, parseHHMM, formatMinutes } from '../../domain/time.js';
import { renderDiagram } from '../diagram.js';
import { pruneReferences as pruneAfter } from '../../domain/project.js';
import { validateRotation } from '../../domain/rotation.js';
import { CATEGORY_LABEL, CATEGORY_MARK, fictionalBadge, chip, warningItem, timeRange, field, emptyState, byId } from './common.js';
import { pilotPanel } from './pilot.js';
import { schemePeriodPanel } from './scheme.js';

export function renderPlan(main, ctx) {
  const { app } = ctx;
  const p = app.project;
  const days = p.week.days;
  const day = byId(days, app.ui.selectedDayId);

  main.append(
    h('header', { class: 'page-head' },
      h('div', { class: 'page-title' }, h('h1', null, 'Practice week'), fictionalBadge()),
      h('p', { class: 'page-sub' }, h('span', { class: 'opponent' }, p.week.opponentLabel), h('span', { class: 'muted' }, ` · week v${p.week.version}`)),
      weekSettings(ctx)),
    weekStrip(ctx),
    pilotPanel(ctx, day),
    ...[schemePeriodPanel(ctx, day)].filter(Boolean),
    day ? dayPlan(ctx, day) : emptyState('No days in this week', 'Add a day to start planning. You can start empty or from one of the five day templates.', null));
}

// ---------------------------------------------------------------- week settings
function weekSettings(ctx) {
  const { app } = ctx;
  const w = app.project.week;
  const opp = h('input', { type: 'text', value: w.opponentLabel, maxlength: 80, name: 'opponent' });
  const notes = h('textarea', { rows: 3, maxlength: 2000, name: 'weekNotes' }, w.notes);
  const err = h('p', { class: 'field-error', hidden: true });
  const form = h('form', { class: 'inline-form', novalidate: true, on: { submit: (e) => {
    e.preventDefault();
    const label = opp.value.trim();
    if (!label) { err.hidden = false; err.textContent = 'Opponent label is required.'; opp.focus(); return; }
    ctx.commit({ ...app.project, week: { ...w, opponentLabel: label, notes: notes.value, version: w.version + 1 } }, { label: 'Week details saved' });
  } } },
  field('Opponent label (fictional)', opp, { hint: 'Shown on every page and printout.' }),
  field('Week notes', notes, { wide: true }),
  err,
  h('div', { class: 'row-actions' }, h('button', { type: 'submit', class: 'btn' }, 'Save week details')));
  return h('details', { class: 'disclosure', 'data-key': 'week-details' }, h('summary', null, 'Week details'), form);
}

// ---------------------------------------------------------------- week strip
function weekStrip(ctx) {
  const { app } = ctx;
  const days = app.project.week.days;
  const tiles = days.map((d, i) => {
    const s = W.computeSchedule(d);
    const warn = s.warnings.length;
    const pct = Math.min(100, Math.round((s.totalMin / Math.max(1, d.plannedMinutes)) * 100));
    const sel = d.id === app.ui.selectedDayId;
    return h('li', { class: `day-tile${sel ? ' is-selected' : ''}${s.overByMin ? ' is-over' : ''}`, 'data-day-id': d.id },
      h('a', { href: `#/plan/${encodeURIComponent(d.id)}`, class: 'day-tile-link', 'aria-current': sel ? 'true' : null },
        h('span', { class: 'day-tile-label' }, d.label),
        h('span', { class: 'day-tile-date' }, d.date || 'No date set'),
        h('span', { class: 'day-tile-time' }, `${formatClock12(d.startMin)} · ${d.periods.length} period${d.periods.length === 1 ? '' : 's'}`),
        h('span', { class: 'meter', 'aria-hidden': 'true' }, h('span', { class: 'meter-fill', style: { width: `${pct}%` } })),
        h('span', { class: 'day-tile-total' }, `${formatMinutes(s.totalMin)} of ${formatMinutes(d.plannedMinutes)}`,
          s.overByMin ? h('span', { class: 'over' }, ` · ⚠ ${s.overByMin} min over`) : null),
        warn && !s.overByMin ? h('span', { class: 'day-tile-warn' }, `⚠ ${warn} warning${warn === 1 ? '' : 's'}`) : null,
        rotationLine(app, d)),
      h('div', { class: 'day-tile-actions' },
        h('button', { type: 'button', class: 'btn btn-icon', 'aria-label': `Move ${d.label} earlier`, title: 'Move earlier', disabled: i === 0, 'data-focus': `day-up-${d.id}`, on: { click: () => moveDay(ctx, d, -1) } }, h('span', { 'aria-hidden': 'true' }, '←')),
        h('button', { type: 'button', class: 'btn btn-icon', 'aria-label': `Move ${d.label} later`, title: 'Move later', disabled: i === days.length - 1, 'data-focus': `day-down-${d.id}`, on: { click: () => moveDay(ctx, d, 1) } }, h('span', { 'aria-hidden': 'true' }, '→')),
        h('button', { type: 'button', class: 'btn btn-icon', 'aria-label': `Duplicate ${d.label}`, title: 'Duplicate day', on: { click: () => {
          const r = W.duplicateDay(app.project.week, d.id, app.ids);
          if (ctx.commit({ ...app.project, week: r.week }, { label: `Duplicated ${d.label}` })) ctx.navigate(`#/plan/${encodeURIComponent(r.id)}`);
        } } }, h('span', { 'aria-hidden': 'true' }, '⧉')),
        h('button', { type: 'button', class: 'btn btn-icon btn-danger-quiet', 'aria-label': `Delete ${d.label}`, title: 'Delete day', on: { click: () => {
          const next = ctx.app.project;
          const pruned = pruneAfter({ ...next, week: W.deleteDay(next.week, d.id) });
          if (ctx.commit(pruned, { label: `Deleted ${d.label}`, undoable: true })) ctx.navigate('#/plan');
        } } }, h('span', { 'aria-hidden': 'true' }, '✕'))));
  });

  const tplSelect = h('select', { 'aria-label': 'New day starts from', name: 'newDayTemplate' },
    h('option', { value: '' }, 'Empty day'),
    app.project.templates.map((t) => h('option', { value: t.id }, t.label)));
  const add = h('div', { class: 'add-day' },
    tplSelect,
    h('button', { type: 'button', class: 'btn', on: { click: () => {
      const id = app.ids('day');
      const t = byId(app.project.templates, tplSelect.value);
      let week = W.addDay(app.project.week, W.newDay(id, { label: t ? t.dayLabel || t.label : `Day ${days.length + 1}`, startMin: t?.startMin ?? 930, plannedMinutes: t?.plannedMinutes ?? 120 }));
      if (t) week = W.applyTemplate(week, id, t, app.ids);
      if (ctx.commit({ ...app.project, week }, { label: 'Added a day' })) ctx.navigate(`#/plan/${encodeURIComponent(id)}`);
    } } }, '+ Add day'));

  return h('section', { class: 'week', 'aria-label': 'Week overview' },
    h('ol', { class: 'week-strip' }, tiles),
    add);
}

function rotationLine(app, d) {
  const rot = app.project.rotations[d.id];
  if (!d.periods.some((x) => x.scheduled && x.groupIds.length)) return h('span', { class: 'day-tile-rot muted' }, '⇄ No scout groups');
  if (!rot) return h('span', { class: 'day-tile-rot muted' }, '⇄ Rotation not generated');
  const v = validateRotation({ day: d, groups: app.project.groups, participants: app.project.participants, rotation: rot });
  const gaps = v.warnings.filter((w) => w.type === 'shortage' || w.type === 'not-generated').length;
  const errs = v.warnings.filter((w) => w.severity === 'error').length;
  if (errs) return h('span', { class: 'day-tile-rot error-text' }, `✕ Rotation: ${errs} problem${errs === 1 ? '' : 's'}`);
  if (gaps) return h('span', { class: 'day-tile-rot warn-text' }, `⚠ Rotation: ${gaps} unfilled`);
  return h('span', { class: 'day-tile-rot' }, '✓ Rotation filled');
}

function moveDay(ctx, d, delta) {
  const days = ctx.app.project.week.days;
  const i = days.findIndex((x) => x.id === d.id);
  const j = i + delta;
  ctx.app.ui.pendingFocus = (j === 0 ? `day-down-${d.id}` : j === days.length - 1 ? `day-up-${d.id}` : `day-${delta < 0 ? 'up' : 'down'}-${d.id}`);
  ctx.commit({ ...ctx.app.project, week: W.moveDay(ctx.app.project.week, d.id, delta) }, { label: `Moved ${d.label}` });
}

// ---------------------------------------------------------------- day plan
function dayPlan(ctx, day) {
  const { app } = ctx;
  const s = W.computeSchedule(day);
  const itemById = new Map(s.items.map((i) => [i.periodId, i]));
  const scheduled = day.periods.filter((x) => x.scheduled);
  const shelf = day.periods.filter((x) => !x.scheduled);

  const head = h('header', { class: 'day-head' },
    h('div', null,
      h('h2', { class: 'day-title' }, day.label),
      h('p', { class: 'day-sub' }, `${day.date || 'No date set'} · starts ${formatClock12(day.startMin)} (${app.project.project.timezone}) · day v${day.version}`)),
    h('div', { class: 'row-actions day-actions' },
      h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'add-period', on: { click: () => openEditor(ctx, day, null) } }, '+ Add period'),
      h('a', { class: 'btn', href: `#/rotation/${encodeURIComponent(day.id)}` }, 'Scout rotation'),
      h('a', { class: 'btn', href: `#/print/day/${encodeURIComponent(day.id)}` }, 'Print script'),
      h('a', { class: 'btn', href: `#/run/${encodeURIComponent(day.id)}` }, 'Run practice')));

  const list = scheduled.length
    ? h('ol', { class: 'script', 'aria-label': `${day.label} script, in order` }, scheduled.map((per, i) => periodRow(ctx, day, per, itemById.get(per.id), i, scheduled.length)))
    : emptyState('This day has no scheduled periods yet', 'Add a period, or apply one of the day templates under “Day settings”. Unscheduled periods wait on the shelf below.',
      h('button', { type: 'button', class: 'btn btn-primary', on: { click: () => openEditor(ctx, day, null) } }, '+ Add the first period'));

  const shelfBox = h('section', { class: 'shelf', 'aria-label': 'Unscheduled periods' },
    h('h3', null, `Unscheduled shelf (${shelf.length})`),
    shelf.length ? h('ul', { class: 'shelf-list' }, shelf.map((per) => h('li', { class: 'shelf-item', 'data-period-id': per.id },
      h('span', { class: 'shelf-title' }, per.title),
      h('span', { class: 'muted' }, ` · ${per.minutes} min · not on the clock`),
      h('div', { class: 'row-actions' },
        h('button', { type: 'button', class: 'btn btn-small', on: { click: () => ctx.commit({ ...app.project, week: W.updatePeriod(app.project.week, day.id, per.id, { scheduled: true }) }, { label: 'Scheduled period' }) } }, 'Schedule'),
        h('button', { type: 'button', class: 'btn btn-small', on: { click: () => openEditor(ctx, day, per) } }, 'Edit'),
        h('button', { type: 'button', class: 'btn btn-small btn-danger-quiet', on: { click: () => deletePeriod(ctx, day, per) } }, 'Delete')))))
      : h('p', { class: 'muted' }, 'Nothing on the shelf. Mark a period “Keep on the shelf” to hold it here without times.'));

  return h('section', { class: 'day-plan', 'aria-label': `${day.label} plan`, 'data-day-id': day.id },
    head,
    daySettings(ctx, day),
    h('div', { class: 'day-columns' },
      h('div', { class: 'day-main' }, list, shelfBox),
      totalsPanel(ctx, day, s)));
}

function periodRow(ctx, day, per, it, i, n) {
  const { app } = ctx;
  const drill = per.drillId ? byId(app.project.drills, per.drillId) : null;
  const cards = per.cardIds.map((id) => byId(app.project.cards, id)).filter(Boolean);
  const groups = per.groupIds.map((id) => byId(app.project.groups, id)).filter(Boolean);
  const overlap = it?.overlapMin;
  const row = h('li', { class: `period-row cat-${per.category}${per.parallel ? ' is-parallel' : ''}`, 'data-period-id': per.id },
    h('div', { class: 'pr-time' },
      h('span', { class: 'pr-start' }, it ? formatClock12(it.startMin) : '—'),
      h('span', { class: 'pr-end' }, it ? `to ${formatClock12(it.endMin)}` : ''),
      per.parallel ? h('span', { class: 'pr-parallel' }, '‖ station, same time') : null,
      per.fixedStart !== null ? h('span', { class: 'pr-fixed' }, `fixed ${formatClock12(per.fixedStart)}`) : null,
      it?.gapBeforeMin ? h('span', { class: 'pr-gap' }, `gap ${it.gapBeforeMin} min before`) : null),
    h('div', { class: 'pr-main' },
      h('div', { class: 'pr-title-line' },
        h('span', { class: `cat-mark cat-${per.category}`, title: CATEGORY_LABEL[per.category] }, CATEGORY_MARK[per.category]),
        h('h3', { class: 'pr-title' }, per.title),
        h('span', { class: 'pr-dur' }, `${per.minutes} min`)),
      h('p', { class: 'pr-cat' }, CATEGORY_LABEL[per.category], per.callLabel ? ` · ${per.callLabel}` : ''),
      per.objective ? h('p', { class: 'pr-objective' }, per.objective) : null,
      h('div', { class: 'pr-meta' },
        drill ? chip(drill.title, { tone: 'neutral', symbol: '▸', title: 'Drill' }) : null,
        cards.map((c) => chip(c.lookLabel || c.title, { tone: 'lav', symbol: '◫', title: 'Scout card' })),
        groups.map((g) => chip(g.label, { tone: 'rose', symbol: '⇄', title: 'Scout group' })),
        per.equipment.length ? chip(`${per.equipment.length} equipment item${per.equipment.length === 1 ? '' : 's'}`, { tone: 'neutral', symbol: '⚑', title: per.equipment.join(', ') }) : null),
      per.notes ? h('p', { class: 'pr-notes' }, per.notes) : null,
      overlap ? h('p', { class: 'pr-warn' }, `⚠ Overlaps the previous period by ${overlap} min (fixed start).`) : null),
    h('div', { class: 'pr-actions' },
      h('button', { type: 'button', class: 'btn btn-icon drag-handle', 'aria-label': `Drag to reorder ${per.title}`, title: 'Drag to reorder (or use Move up / Move down)', 'data-drag': per.id }, h('span', { 'aria-hidden': 'true' }, '⠿')),
      h('button', { type: 'button', class: 'btn btn-icon', 'aria-label': `Move ${per.title} up`, title: 'Move up', disabled: i === 0, 'data-focus': `up-${per.id}`, 'data-action': 'move-up', on: { click: () => moveVisible(ctx, day, per, -1) } }, h('span', { 'aria-hidden': 'true' }, '↑')),
      h('button', { type: 'button', class: 'btn btn-icon', 'aria-label': `Move ${per.title} down`, title: 'Move down', disabled: i === n - 1, 'data-focus': `down-${per.id}`, 'data-action': 'move-down', on: { click: () => moveVisible(ctx, day, per, 1) } }, h('span', { 'aria-hidden': 'true' }, '↓')),
      h('button', { type: 'button', class: 'btn btn-small', 'data-focus': `edit-${per.id}`, 'data-action': 'edit', on: { click: () => openEditor(ctx, day, per) } }, 'Edit'),
      rowMore(ctx, day, per)));
  attachDrag(ctx, day, row);
  return row;
}

function rowMore(ctx, day, per) {
  const { app } = ctx;
  const menu = h('details', { class: 'row-more', 'data-key': `more-${per.id}` });
  const closeThen = (fn) => () => { menu.open = false; fn(); };
  menu.append(
    h('summary', { class: 'btn btn-small', 'data-action': 'more', 'aria-label': `More actions for ${per.title}` }, 'More ▾'),
    h('div', { class: 'row-more-menu', role: 'group', 'aria-label': `More actions for ${per.title}` },
      h('button', { type: 'button', class: 'btn btn-small', 'data-action': 'duplicate', on: { click: closeThen(() => {
        const r = W.duplicatePeriod(app.project.week, day.id, per.id, app.ids);
        app.ui.pendingFocus = `edit-${r.id}`;
        ctx.commit({ ...app.project, week: r.week }, { label: 'Duplicated period' });
      }) } }, 'Duplicate'),
      h('button', { type: 'button', class: 'btn btn-small', 'data-action': 'to-shelf', on: { click: closeThen(() => ctx.commit({ ...app.project, week: W.updatePeriod(app.project.week, day.id, per.id, { scheduled: false }) }, { label: 'Moved to the shelf', undoable: true })) } }, 'Move to shelf'),
      h('button', { type: 'button', class: 'btn btn-small btn-danger-quiet', 'data-action': 'delete', on: { click: closeThen(() => deletePeriod(ctx, day, per)) } }, 'Delete')));
  return menu;
}

function deletePeriod(ctx, day, per) {
  const p = ctx.app.project;
  ctx.commit(pruneAfter({ ...p, week: W.deletePeriod(p.week, day.id, per.id) }), { label: `Deleted “${per.title.length > 40 ? `${per.title.slice(0, 39)}…` : per.title}”`, undoable: true });
}

// Move among scheduled periods only (the shelf is not part of the order you see).
function reorderedVisible(day, periodId, toVisibleIndex) {
  const all = day.periods.map((x) => x.id);
  const vis = day.periods.filter((x) => x.scheduled).map((x) => x.id);
  const from = vis.indexOf(periodId);
  if (from < 0 || toVisibleIndex === from) return null;
  const nextVis = vis.slice();
  nextVis.splice(from, 1);
  nextVis.splice(toVisibleIndex, 0, periodId);
  let k = 0;
  return all.map((id) => (vis.includes(id) ? nextVis[k++] : id));
}

function moveVisible(ctx, day, per, delta) {
  const vis = day.periods.filter((x) => x.scheduled);
  const from = vis.findIndex((x) => x.id === per.id);
  const to = from + delta;
  if (to < 0 || to >= vis.length) return;
  const order = reorderedVisible(day, per.id, to);
  ctx.app.ui.pendingFocus = delta < 0 ? (to === 0 ? `down-${per.id}` : `up-${per.id}`) : (to === vis.length - 1 ? `up-${per.id}` : `down-${per.id}`);
  ctx.commit({ ...ctx.app.project, week: W.reorderPeriods(ctx.app.project.week, day.id, order) }, { label: `Moved “${per.title}”` });
  const live = document.getElementById('sr-live');
  if (live) live.textContent = `${per.title} moved to position ${to + 1} of ${vis.length}.`;
}

function attachDrag(ctx, day, row) {
  const handle = row.querySelector('.drag-handle');
  handle.addEventListener('pointerdown', (e) => {
    if (!ctx.canWrite() || e.button > 0) return;
    e.preventDefault();
    const list = row.parentElement;
    const rows = [...list.children];
    const from = rows.indexOf(row);
    const startY = e.clientY;
    let to = from;
    handle.setPointerCapture(e.pointerId);
    row.classList.add('is-dragging');
    const onMove = (ev) => {
      row.style.transform = `translateY(${ev.clientY - startY}px)`;
      to = from;
      rows.forEach((r, k) => {
        if (r === row) return;
        const rect = r.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        if (k < from && ev.clientY < mid) to = Math.min(to, k);
        if (k > from && ev.clientY > mid) to = Math.max(to, k);
      });
      rows.forEach((r, k) => r.classList.toggle('drop-before', k === to && to < from));
      rows.forEach((r, k) => r.classList.toggle('drop-after', k === to && to > from));
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      row.classList.remove('is-dragging');
      row.style.transform = '';
      rows.forEach((r) => r.classList.remove('drop-before', 'drop-after'));
      if (to !== from) {
        const per = day.periods.find((x) => x.id === row.dataset.periodId);
        const order = reorderedVisible(day, per.id, to);
        ctx.commit({ ...ctx.app.project, week: W.reorderPeriods(ctx.app.project.week, day.id, order) }, { label: `Moved “${per.title}”` });
      }
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  });
}

// ---------------------------------------------------------------- day settings
function daySettings(ctx, day) {
  const { app } = ctx;
  const label = h('input', { type: 'text', value: day.label, maxlength: W.DAY_LIMITS.label, required: true, name: 'dayLabel' });
  const date = h('input', { type: 'date', value: day.date, name: 'dayDate' });
  const start = h('input', { type: 'time', value: formatHHMM(day.startMin), required: true, name: 'dayStart' });
  const planned = h('input', { type: 'number', min: W.DAY_LIMITS.plannedMin, max: W.DAY_LIMITS.plannedMax, step: 5, value: day.plannedMinutes, required: true, name: 'dayPlanned', inputmode: 'numeric' });
  const notes = h('textarea', { rows: 2, maxlength: W.DAY_LIMITS.notes, name: 'dayNotes' }, day.notes);
  const errors = h('ul', { class: 'form-errors', role: 'alert' });
  const form = h('form', { class: 'grid-form', 'aria-label': 'Day settings', novalidate: true, on: { submit: (e) => {
    e.preventDefault();
    clear(errors);
    const patch = { label: label.value.trim(), date: date.value, startMin: parseHHMM(start.value), plannedMinutes: Number(planned.value), notes: notes.value };
    const v = W.validateDay({ ...day, ...patch, startMin: patch.startMin ?? -1 });
    if (v.errors.length) {
      for (const m of v.errors) errors.append(h('li', null, `✕ ${m}`));
      return;
    }
    ctx.commit({ ...app.project, week: W.updateDay(app.project.week, day.id, patch) }, { label: 'Day settings saved' });
  } } },
  field('Day label', label),
  field('Date (optional)', date, { hint: 'Leave empty if the real schedule is not set.' }),
  field(`Planned start (${app.project.project.timezone})`, start),
  field('Planned length (minutes)', planned, { hint: 'The day warns when the script runs longer. Nothing is shortened.' }),
  field('Day notes', notes, { wide: true }),
  errors,
  h('div', { class: 'row-actions field-wide' }, h('button', { type: 'submit', class: 'btn btn-primary' }, 'Save day settings')));

  const tpl = h('select', { 'aria-label': 'Day template', name: 'template' }, app.project.templates.map((t) => h('option', { value: t.id }, `${t.label} (${t.periods.length} periods)`)));
  const apply = (mode) => {
    const t = byId(app.project.templates, tpl.value);
    if (!t) return;
    ctx.commit(pruneAfter({ ...app.project, week: W.applyTemplate(app.project.week, day.id, t, app.ids, { mode }) }), { label: mode === 'replace' ? `Replaced periods with “${t.label}”` : `Added “${t.label}” periods`, undoable: true });
  };
  const tplName = h('input', { type: 'text', maxlength: 60, value: `${day.label} (saved)`, name: 'templateName', id: `tpl-name-${day.id}` });
  const templates = h('div', { class: 'template-tools' },
    h('h3', null, 'Templates'),
    h('div', { class: 'row-actions' }, tpl,
      h('button', { type: 'button', class: 'btn', on: { click: () => apply('replace') } }, 'Replace periods'),
      h('button', { type: 'button', class: 'btn', on: { click: () => apply('append') } }, 'Add to end')),
    h('label', { for: `tpl-name-${day.id}`, class: 'small' }, 'New template name'),
    h('div', { class: 'row-actions' }, tplName,
      h('button', { type: 'button', class: 'btn', on: { click: () => {
        const name = tplName.value.trim() || `${day.label} (saved)`;
        const t = W.dayAsTemplate(day, app.ids('tpl'), name);
        ctx.commit({ ...app.project, templates: app.project.templates.concat([{ ...t, dayLabel: day.label, startMin: day.startMin }]) }, { label: `Saved template “${name}”` });
      } } }, 'Save this day as a template')));

  return h('details', { class: 'disclosure day-settings', 'data-key': `day-settings-${day.id}` }, h('summary', null, 'Day settings and templates'), form, templates);
}

// ---------------------------------------------------------------- totals
function totalsPanel(ctx, day, s) {
  const { app } = ctx;
  const pct = Math.min(100, Math.round((s.totalMin / Math.max(1, day.plannedMinutes)) * 100));
  const equipment = new Map();
  for (const per of day.periods.filter((x) => x.scheduled)) for (const e of per.equipment) equipment.set(e, (equipment.get(e) || []).concat([per.title]));
  const groupsUsed = new Set(day.periods.filter((x) => x.scheduled).flatMap((x) => x.groupIds));
  return h('aside', { class: 'totals', 'aria-label': 'Day totals' },
    h('h3', null, 'Totals'),
    h('p', { class: `total-big${s.overByMin ? ' is-over' : ''}`, 'data-total': s.totalMin },
      h('span', { class: 'total-num' }, formatMinutes(s.totalMin)), h('span', { class: 'total-of' }, ` of ${formatMinutes(day.plannedMinutes)} planned`)),
    h('div', { class: `meter meter-lg${s.overByMin ? ' is-over' : ''}`, role: 'img', 'aria-label': `${pct}% of planned time` }, h('span', { class: 'meter-fill', style: { width: `${pct}%` } })),
    h('p', { class: 'muted' }, s.items.length ? `${formatClock12(s.startMin)} to ${formatClock12(s.endMin)}` : 'No scheduled periods'),
    h('ul', { class: 'cat-totals' }, Object.entries(s.categoryTotals).filter(([, m]) => m > 0).map(([c, m]) => h('li', null, h('span', { class: `cat-mark cat-${c}`, 'aria-hidden': 'true' }, CATEGORY_MARK[c]), h('span', null, CATEGORY_LABEL[c]), h('span', { class: 'num' }, `${m} min`)))),
    s.warnings.length ? h('div', { class: 'warn-box' }, h('h4', null, `Warnings (${s.warnings.length})`), h('ul', { class: 'warn-list' }, s.warnings.map((w) => warningItem({ ...w, message: describeScheduleWarning(app, day, w) })))) : h('p', { class: 'ok-line' }, '✓ No schedule warnings'),
    h('h4', null, 'Equipment for the day'),
    equipment.size ? h('ul', { class: 'equip-list' }, [...equipment.entries()].map(([e, who]) => h('li', null, h('span', null, e), h('span', { class: 'muted' }, ` · ${who.length} period${who.length === 1 ? '' : 's'}`)))) : h('p', { class: 'muted' }, 'No equipment listed.'),
    h('h4', null, 'Scout groups used'),
    groupsUsed.size ? h('p', null, [...groupsUsed].map((g) => byId(app.project.groups, g)?.label || g).join(', ')) : h('p', { class: 'muted' }, 'None.'));
}

function describeScheduleWarning(app, day, w) {
  if (w.type !== 'group-overlap') return w.message;
  const t = (id) => day.periods.find((x) => x.id === id)?.title || id;
  return `${byId(app.project.groups, w.groupId)?.label || w.groupId} is in “${t(w.otherPeriodId)}” and “${t(w.periodId)}” at the same time.`;
}

// ---------------------------------------------------------------- period editor
export function openEditor(ctx, day, existing) {
  const { app } = ctx;
  if (!ctx.canWrite()) return ctx.commit(app.project); // shows the read-only message
  const dlg = document.getElementById('editor');
  clear(dlg);
  const isNew = !existing;
  const base = existing ? structuredClone(existing) : W.newPeriod('pending', { title: '' });
  const L = W.PERIOD_LIMITS;

  const title = h('input', { type: 'text', name: 'title', value: base.title, maxlength: L.title, required: true, autocomplete: 'off', 'data-field': 'title' });
  const minutes = h('input', { type: 'number', name: 'minutes', min: L.minutesMin, max: L.minutesMax, step: 1, value: base.minutes, required: true, inputmode: 'numeric', 'data-field': 'minutes' });
  const category = h('select', { name: 'category', 'data-field': 'category' }, W.CATEGORIES.map((c) => h('option', { value: c, selected: c === base.category }, CATEGORY_LABEL[c])));
  const objective = h('textarea', { name: 'objective', rows: 2, maxlength: L.objective, 'data-field': 'objective' }, base.objective);
  const callLabel = h('input', { type: 'text', name: 'callLabel', value: base.callLabel, maxlength: L.callLabel, 'data-field': 'callLabel' });
  const drill = h('select', { name: 'drill', 'data-field': 'drill' }, h('option', { value: '' }, 'No drill'), app.project.drills.map((d) => h('option', { value: d.id, selected: d.id === base.drillId }, d.title)));
  const drillInfo = h('div', { class: 'drill-info', 'aria-live': 'polite' });
  const equipment = h('textarea', { name: 'equipment', rows: 3, 'data-field': 'equipment' }, base.equipment.join('\n'));
  const notes = h('textarea', { name: 'notes', rows: 4, maxlength: L.notes, 'data-field': 'notes' }, base.notes);
  const notesCount = h('span', { class: 'counter' }, `${base.notes.length}/${L.notes}`);
  notes.addEventListener('input', () => { notesCount.textContent = `${notes.value.length}/${L.notes}`; });
  const shelf = h('input', { type: 'checkbox', name: 'shelf', checked: !base.scheduled, 'data-field': 'shelf' });
  const parallel = h('input', { type: 'checkbox', name: 'parallel', checked: base.parallel, 'data-field': 'parallel' });
  const fixed = h('input', { type: 'time', name: 'fixedStart', value: base.fixedStart === null ? '' : formatHHMM(base.fixedStart), 'data-field': 'fixedStart' });

  const cardBoxes = app.project.cards.map((c) => h('label', { class: 'check-card' },
    h('input', { type: 'checkbox', value: c.id, checked: base.cardIds.includes(c.id), name: 'cards' }),
    renderDiagram(c, { size: 'thumb' }),
    h('span', null, h('strong', null, c.lookLabel || c.title), h('br'), h('span', { class: 'muted' }, c.title))));
  const groupBoxes = app.project.groups.map((g) => h('label', { class: 'check-line' },
    h('input', { type: 'checkbox', value: g.id, checked: base.groupIds.includes(g.id), name: 'groups' }),
    h('span', null, `${g.label} (${g.roles.map((r) => r.label).join(', ')})`)));

  const showDrill = () => {
    clear(drillInfo);
    const d = byId(app.project.drills, drill.value);
    if (!d) return;
    drillInfo.append(
      h('p', null, h('strong', null, 'Setup: '), d.setup),
      h('ol', null, d.steps.map((s) => h('li', null, s))),
      h('p', { class: 'muted' }, d.cues.join(' ')),
      h('button', { type: 'button', class: 'btn btn-small', on: { click: () => {
        if (!title.value.trim()) title.value = d.title;
        objective.value = d.objective;
        equipment.value = d.equipment.join('\n');
        if (d.category) category.value = d.category;
      } } }, 'Use this drill’s objective and equipment'));
  };
  drill.addEventListener('change', showDrill);
  showDrill();

  const errors = h('ul', { class: 'form-errors', role: 'alert', 'data-errors': '' });
  const read = () => ({
    ...base,
    title: title.value.trim(),
    minutes: Number(minutes.value),
    category: category.value,
    objective: objective.value,
    callLabel: callLabel.value,
    drillId: drill.value || null,
    cardIds: cardBoxes.map((l) => l.querySelector('input')).filter((i) => i.checked).map((i) => i.value),
    groupIds: groupBoxes.map((l) => l.querySelector('input')).filter((i) => i.checked).map((i) => i.value),
    equipment: equipment.value.split('\n').map((x) => x.trim()).filter(Boolean),
    notes: notes.value,
    scheduled: !shelf.checked,
    parallel: parallel.checked,
    fixedStart: fixed.value ? parseHHMM(fixed.value) : null,
  });
  const initial = JSON.stringify(read());

  const close = () => { dlg.close(); clear(dlg); };
  const save = () => {
    clear(errors);
    const draft = read();
    const v = W.validatePeriod(draft);
    if (v.errors.length) {
      for (const m of v.errors) errors.append(h('li', null, `✕ ${m}`));
      errors.scrollIntoView({ block: 'nearest' });
      return;
    }
    let week;
    let focusId;
    if (isNew) {
      const id = app.ids('per');
      week = W.addPeriod(app.project.week, day.id, { ...draft, id });
      focusId = id;
    } else {
      week = W.updatePeriod(app.project.week, day.id, existing.id, draft);
      focusId = existing.id;
    }
    close();
    app.ui.pendingFocus = `edit-${focusId}`;
    ctx.commit({ ...app.project, week }, { label: isNew ? 'Added period' : 'Saved period' });
  };
  const cancel = async () => {
    if (JSON.stringify(read()) !== initial) {
      const discard = await ctx.confirmDialog({ title: 'Discard changes to this period?', body: 'Your edits in the period editor have not been saved.', confirmLabel: 'Discard changes', cancelLabel: 'Keep editing', danger: true });
      if (!discard) return;
    }
    close();
  };

  dlg.append(h('form', { class: 'editor-form', novalidate: true, on: { submit: (e) => { e.preventDefault(); save(); } } },
    h('header', { class: 'editor-head' },
      h('h2', { id: 'editor-title' }, isNew ? `New period · ${day.label}` : 'Edit period'),
      h('p', { class: 'muted' }, 'Changes are kept only when you choose Save period.')),
    errors,
    h('div', { class: 'editor-grid' },
      field('Title', title, { wide: true }),
      field('Duration (minutes)', minutes, { hint: `${L.minutesMin}–${L.minutesMax} minutes.` }),
      field('Category', category),
      field('Teaching objective', objective, { wide: true, hint: 'What the defense should be able to do by the end of the period.' }),
      field('Drill', drill),
      field('Call / look label (fictional)', callLabel),
      h('div', { class: 'field field-wide' }, drillInfo),
      h('fieldset', { class: 'field-wide' }, h('legend', null, 'Scout cards'), h('div', { class: 'check-grid' }, cardBoxes)),
      h('fieldset', { class: 'field-wide' }, h('legend', null, 'Scout groups'), groupBoxes),
      field('Equipment (one item per line)', equipment, { wide: true }),
      h('div', { class: 'field field-wide' }, h('label', { for: 'pe-notes' }, 'Coach notes ', notesCount), Object.assign(notes, { id: 'pe-notes' })),
      h('fieldset', { class: 'field-wide' }, h('legend', null, 'Scheduling'),
        h('label', { class: 'check-line' }, parallel, h('span', null, 'Parallel station: runs at the same time as the period before it')),
        h('label', { class: 'check-line' }, shelf, h('span', null, 'Keep on the shelf (unscheduled, no times, not on the clock)')),
        field('Fixed start time (optional)', fixed, { hint: 'Leave empty to follow the period before. A fixed time that collides is shown as an overlap, never shortened.' }))),
    h('footer', { class: 'editor-foot' },
      h('button', { type: 'button', class: 'btn', 'data-action': 'cancel', on: { click: cancel } }, 'Cancel'),
      h('button', { type: 'submit', class: 'btn btn-primary', 'data-action': 'save' }, 'Save period'))));
  dlg.setAttribute('aria-labelledby', 'editor-title');
  dlg.oncancel = (e) => { e.preventDefault(); cancel(); };
  dlg.showModal();
  title.focus();
}
