// Practice Pilot panel on the Plan page: an offline preset plus the coach's
// time, participants and equipment -> a draft that is shown in full and only
// added as a NEW day when the coach says so; and a shorter, independent copy
// of the selected day. Rules live in src/domain/pilot.js.
import { h, clear } from '../dom.js';
import { PILOT_PRESETS, PILOT_LIMITS, presetById, requiredEquipment, proposePlan, applyProposal, proposeShortened, applyShortened, SHORTEN_FLOOR_MIN } from '../../domain/pilot.js';
import { DAY_LIMITS } from '../../domain/week.js';
import { formatClock12, formatHHMM, parseHHMM, formatMinutes } from '../../domain/time.js';
import { field } from './common.js';

// Form state survives re-renders (every commit redraws the page).
function pilotState(app) {
  if (!app.ui.pilot) {
    app.ui.pilot = { open: false, presetId: '', objectiveText: '', minutes: '', start: '', participants: '', stations: 'auto', equipment: {}, label: '', result: null, shortMinutes: '', shortResult: null };
  }
  return app.ui.pilot;
}

const num = (v) => (String(v).trim() === '' ? NaN : Number(v));

export function pilotPanel(ctx, day) {
  const { app } = ctx;
  const st = pilotState(app);
  if (!st.start) st.start = formatHHMM(day ? day.startMin : 15 * 60 + 30);
  const preset = presetById(st.presetId);

  const presetSel = h('select', { name: 'pilotPreset', 'data-focus': 'pilot-preset' },
    h('option', { value: '' }, 'No preset (free text only)'),
    PILOT_PRESETS.map((p) => h('option', { value: p.id, selected: p.id === st.presetId }, p.label)));
  const objective = h('textarea', { name: 'pilotObjective', rows: 2, maxlength: PILOT_LIMITS.objectiveText }, st.objectiveText);
  const minutes = h('input', { type: 'number', name: 'pilotMinutes', min: DAY_LIMITS.plannedMin, max: DAY_LIMITS.plannedMax, step: 1, inputmode: 'numeric', value: st.minutes });
  const start = h('input', { type: 'time', name: 'pilotStart', value: st.start });
  const people = h('input', { type: 'number', name: 'pilotParticipants', min: 0, max: PILOT_LIMITS.participantsMax, step: 1, inputmode: 'numeric', value: st.participants });
  const label = h('input', { type: 'text', name: 'pilotLabel', maxlength: PILOT_LIMITS.label, value: st.label, placeholder: preset ? `Pilot: ${preset.short}` : 'Pilot: …' });
  const stationBlock = preset?.blocks.find((b) => b.kind === 'stations') || null;
  if (!stationBlock) st.stations = 'auto';
  const stations = stationBlock ? h('select', { name: 'pilotStations' },
    h('option', { value: 'auto' }, 'Automatic (most that fit)'),
    Array.from({ length: stationBlock.stations.length - stationBlock.minStations + 1 }, (_, i) => stationBlock.minStations + i)
      .map((n) => h('option', { value: String(n), selected: String(n) === String(st.stations) }, `${n} stations`))) : null;

  const needs = requiredEquipment(preset);
  const equipInputs = needs.map((n) => {
    const input = h('input', { type: 'number', name: 'pilotEquip', 'data-equip': n.name, min: 0, max: PILOT_LIMITS.quantityMax, step: 1, inputmode: 'numeric', value: st.equipment[n.name] ?? '' });
    return field(`${n.name} available`, input, { hint: `Used by ${n.uses.map((u) => `${u.where}: ${u.qty}`).join('; ')}.` });
  });

  const resultBox = h('div', { class: 'pilot-result', 'aria-live': 'polite' });
  const sync = () => {
    st.objectiveText = objective.value;
    st.minutes = minutes.value;
    st.start = start.value;
    st.participants = people.value;
    st.label = label.value;
    if (stations) st.stations = stations.value;
    for (const wrap of equipInputs) {
      const i = wrap.querySelector('input');
      st.equipment[i.dataset.equip] = i.value;
    }
    if (st.result) {
      st.result = null;
      clear(resultBox).append(h('p', { class: 'note-line' }, 'Inputs changed. Choose “Propose plan” to see an updated draft.'));
    }
  };

  presetSel.addEventListener('change', () => {
    sync();
    st.presetId = presetSel.value;
    st.result = null;
    app.ui.pendingFocus = 'pilot-preset';
    ctx.render();
  });

  const propose = () => {
    sync();
    st.result = proposePlan({
      presetId: st.presetId,
      objectiveText: st.objectiveText,
      totalMinutes: num(st.minutes),
      participants: num(st.participants),
      startMin: parseHHMM(st.start) ?? -1,
      stations: st.stations === 'auto' ? 'auto' : Number(st.stations),
      label: st.label,
      // An empty quantity means none available.
      equipment: needs.map((n) => ({ name: n.name, quantity: String(st.equipment[n.name] ?? '').trim() === '' ? 0 : Number(st.equipment[n.name]) })),
    });
    app.ui.pendingFocus = 'pilot-result';
    ctx.render();
  };

  const form = h('form', { class: 'pilot-form', 'aria-label': 'Practice Pilot inputs', novalidate: true, on: { input: sync, submit: (e) => { e.preventDefault(); propose(); } } },
    h('div', { class: 'grid-form' },
      field('Objective preset (offline catalogue)', presetSel, { wide: true, hint: preset ? preset.summary : 'Pick the structure that matches what you want to work on. Free text alone is kept as a note but cannot be planned from.' }),
      field('Your objective, in your words (optional)', objective, { wide: true, hint: `Kept as a note on the new day exactly as written (up to ${PILOT_LIMITS.objectiveText} characters). It is not read, interpreted or matched to a preset.` }),
      field('Available time (minutes)', minutes, { hint: `Whole minutes, ${DAY_LIMITS.plannedMin}–${DAY_LIMITS.plannedMax}. The draft fills it exactly.` }),
      field('Start time', start),
      field('Participants available', people, { hint: 'A count only; nobody is named or assigned.' }),
      stations ? field('Stations', stations, { hint: `${stationBlock.minStations}–${stationBlock.stations.length}. Groups rotate so each visits every station.` }) : null,
      field('New day label (optional)', label)),
    preset ? h('fieldset', { class: 'pilot-equip' },
      h('legend', null, 'Equipment you have'),
      needs.length
        ? [h('p', { class: 'field-hint' }, 'Leave empty or 0 for none. Stations that run at the same time are counted together.'), h('div', { class: 'grid-form' }, equipInputs)]
        : h('p', { class: 'muted' }, 'This preset needs no equipment.')) : null,
    h('div', { class: 'row-actions' },
      h('button', { type: 'submit', class: 'btn btn-primary', 'data-action': 'pilot-propose' }, 'Propose plan')));

  renderResult(ctx, st, resultBox);

  const panel = h('details', { class: 'disclosure pilot', 'data-key': 'pilot', open: st.open, on: { toggle: () => { st.open = panel.open; } } },
    h('summary', null, 'Practice Pilot · draft a new day from an objective'),
    h('div', { class: 'pilot-body' },
      h('p', { class: 'pilot-intro' }, 'Rule-based and offline: a small built-in catalogue of practice structures. Choose one, say how much time, how many participants and what equipment you have, and it proposes a day you can read in full before anything changes. ',
        h('strong', null, 'Nothing is added until you choose “Add as a new day”'), ', and no existing day is ever replaced.'),
      form,
      resultBox,
      day ? shortenSection(ctx, st, day) : null));
  return panel;
}

// ---------------------------------------------------------------- proposal
function renderResult(ctx, st, box) {
  const { app } = ctx;
  const r = st.result;
  clear(box);
  if (!r) return;
  if (!r.ok) {
    box.append(h('div', { class: `pilot-outcome ${r.status === 'unsupported' ? 'banner-warn' : 'banner-error'}`, 'data-pilot-status': r.status },
      h('h3', { tabindex: '-1', 'data-focus': 'pilot-result' }, r.status === 'unsupported' ? 'Free-text objective not supported' : 'No plan proposed'),
      r.status === 'unsupported' ? h('p', null, h('span', { class: 'muted' }, 'Your text: '), `“${r.objectiveText}”`) : null,
      h('ul', { class: 'form-errors', role: 'alert' }, r.errors.map((e) => h('li', null, `✕ ${e}`)))));
    return;
  }
  const s = r.schedule;
  box.append(h('div', { class: 'pilot-outcome banner-info', 'data-pilot-status': 'proposed' },
    h('h3', { tabindex: '-1', 'data-focus': 'pilot-result' }, `Proposal: ${r.day.label} (not added yet)`),
    h('p', null, `${formatMinutes(r.totalMinutes)} · ${formatClock12(s.startMin)}–${formatClock12(s.endMin)} · ${r.participants} participant${r.participants === 1 ? '' : 's'}${r.stationCount ? ` · ${r.stationCount} stations, groups of ${r.groupSizes.join('/')}` : ''}`),
    h('p', { class: 'muted' }, `Preset: ${r.preset.label}.`),
    r.objectiveText ? h('p', { class: 'pilot-quote' }, h('span', { class: 'muted' }, 'Your objective (kept as a note, not interpreted): '), `“${r.objectiveText}”`) : null,
    h('ol', { class: 'pilot-script', 'aria-label': 'Proposed periods in order' }, r.blocks.map((b) => h('li', { class: `pilot-block pilot-${b.kind}` },
      h('span', { class: 'pilot-time' }, `${formatClock12(b.startMin)}–${formatClock12(b.endMin)}`),
      h('span', { class: 'pilot-what' },
        b.kind === 'stations'
          ? [h('strong', null, `Round ${b.round} of ${b.rounds} · ${b.minutes} min, at the same time:`), h('ul', null, b.titles.map((t) => h('li', null, t)))]
          : h('strong', null, `${b.titles[0]} · ${b.minutes} min`),
        b.equipment.length ? h('span', { class: 'muted pilot-eq' }, `Equipment: ${b.equipment.map((e) => `${e.name} ${e.qty}`).join(', ')}`) : null)))),
    h('h4', null, 'How this was decided'),
    h('ul', { class: 'pilot-notes' }, r.assumptions.map((a) => h('li', null, a))),
    h('h4', null, 'Checks'),
    h('ul', { class: 'pilot-notes' }, r.checks.map((c) => h('li', null, `✓ ${c}`))),
    h('p', { class: 'muted' }, 'Adds a new day at the end of the week. Your other days are not changed. After adding, edit any period with the usual controls.'),
    h('div', { class: 'row-actions' },
      h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'pilot-apply', on: { click: () => {
        if (!ctx.canWrite()) return ctx.commit(app.project); // shows the read-only message
        const a = applyProposal(app.project.week, st.result, app.ids, { drills: app.project.drills });
        if (!a.ok) { st.result = { ok: false, status: 'rejected', errors: a.errors }; ctx.render(); return; }
        st.result = null;
        const dropped = a.droppedDrills.length ? ` (${a.droppedDrills.length} drill link${a.droppedDrills.length === 1 ? '' : 's'} left out: not in this plan's drill library)` : '';
        if (ctx.commit({ ...app.project, week: a.week }, { label: `Added “${a.day.label}” as a new day${dropped}`, undoable: true })) showNewDay(ctx, a.dayId);
      } } }, 'Add as a new day'),
      h('button', { type: 'button', class: 'btn', 'data-action': 'pilot-discard', on: { click: () => { st.result = null; app.ui.pendingFocus = 'pilot-preset'; ctx.render(); } } }, 'Discard proposal'))));
}

// Collapse the panel so the new day's script is in view (the same-route
// re-render after a commit would otherwise restore it open).
function showNewDay(ctx, dayId) {
  pilotState(ctx.app).open = false;
  const el = document.querySelector('details[data-key="pilot"]');
  if (el) el.open = false;
  ctx.navigate(`#/plan/${encodeURIComponent(dayId)}`);
}

// ---------------------------------------------------------------- shorter copy
function shortenSection(ctx, st, day) {
  const { app } = ctx;
  const target = h('input', { type: 'number', name: 'pilotShortMinutes', min: DAY_LIMITS.plannedMin, max: DAY_LIMITS.plannedMax, step: 1, inputmode: 'numeric', value: st.shortMinutes });
  const out = h('div', { class: 'pilot-short-result', 'aria-live': 'polite' });
  // A preview belongs to one version of one day.
  const r = st.shortResult && st.shortResult.dayId === day.id && st.shortResult.dayVersion === day.version ? st.shortResult : null;
  target.addEventListener('input', () => {
    st.shortMinutes = target.value;
    if (st.shortResult) { st.shortResult = null; clear(out).append(h('p', { class: 'note-line' }, 'Length changed. Choose “Preview shorter copy” again.')); }
  });
  const preview = () => {
    st.shortMinutes = target.value;
    st.shortResult = { ...proposeShortened(day, num(target.value)), dayId: day.id, dayVersion: day.version };
    app.ui.pendingFocus = 'pilot-short-result';
    ctx.render();
  };
  if (r && !r.ok) {
    out.append(h('div', { class: 'pilot-outcome banner-error', 'data-short-status': 'rejected' },
      h('h4', { tabindex: '-1', 'data-focus': 'pilot-short-result' }, 'No shorter copy'),
      h('ul', { class: 'form-errors', role: 'alert' }, r.errors.map((e) => h('li', null, `✕ ${e}`)))));
  } else if (r) {
    out.append(h('div', { class: 'pilot-outcome banner-info', 'data-short-status': 'proposed' },
      h('h4', { tabindex: '-1', 'data-focus': 'pilot-short-result' }, `Shorter copy: ${r.fromMin} → ${r.toMin} min (not added yet)`),
      h('ul', { class: 'pilot-notes' }, r.rows.map((row) => h('li', null, `${row.title}: ${row.fromMin === row.toMin ? `${row.toMin} min (unchanged)` : `${row.fromMin} → ${row.toMin} min`}`))),
      h('p', { class: 'muted' }, `Every block is scaled down in whole minutes, none below ${SHORTEN_FLOOR_MIN} min (or its own length if shorter); parallel stations stay equal. The copy gets new ids and goes right after “${day.label}”, which stays exactly as it is. The scout rotation and availability marks stay with the original day.`),
      h('div', { class: 'row-actions' },
        h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'pilot-short-apply', on: { click: () => {
          if (!ctx.canWrite()) return ctx.commit(app.project);
          const cur = app.project.week.days.find((d) => d.id === day.id);
          if (!cur || cur.version !== r.dayVersion) { st.shortResult = null; ctx.render(); return; }
          const a = applyShortened(app.project.week, day.id, r.toMin, app.ids);
          if (!a.ok) { st.shortResult = { ...a, dayId: day.id, dayVersion: day.version }; ctx.render(); return; }
          st.shortResult = null;
          if (ctx.commit({ ...app.project, week: a.week }, { label: `Added “${a.day.label}” as a shorter copy`, undoable: true })) showNewDay(ctx, a.dayId);
        } } }, 'Add shorter copy as a new day'))));
  }
  return h('section', { class: 'pilot-short', 'aria-label': `Shorter copy of ${day.label}` },
    h('h3', null, `Shorter copy of “${day.label}”`),
    h('p', { class: 'muted' }, 'For a day with less time than planned: adds a scaled-down copy and leaves this day as it is. Supports back-to-back periods and equal-length parallel stations; a day with fixed start times or unequal stations is refused with the reason. During a live practice, use Rebalance on the Run page instead.'),
    h('form', { class: 'row-actions pilot-short-form', novalidate: true, 'aria-label': 'Shorter copy', on: { submit: (e) => { e.preventDefault(); preview(); } } },
      field('Shorter length (minutes)', target),
      h('button', { type: 'submit', class: 'btn', 'data-action': 'pilot-short-preview' }, 'Preview shorter copy')),
    out);
}
