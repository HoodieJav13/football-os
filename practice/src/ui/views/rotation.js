// Scout rotation builder: generate, change, lock, regenerate; honest warnings.
import { h } from '../dom.js';
import { computeSchedule } from '../../domain/week.js';
import { generateRotation, validateRotation, assignManual, setLock, candidatesFor, rotationRows, FAIRNESS_RULE } from '../../domain/rotation.js';
import { renameParticipant, setRoleKeys, setGroupIds, setUnavailable, addParticipant, removeParticipant, isUnavailable, validateParticipant } from '../../domain/participants.js';
import { pruneReferences } from '../../domain/project.js';
import { formatClock12 } from '../../domain/time.js';
import { fictionalBadge, daySwitcher, emptyState, warningItem, byId, chip } from './common.js';

export function renderRotation(main, ctx) {
  const { app } = ctx;
  const p = app.project;
  const day = byId(p.week.days, app.ui.rotationDayId);
  main.append(h('header', { class: 'page-head' },
    h('div', { class: 'page-title' }, h('h1', null, 'Scout rotation'), fictionalBadge()),
    h('p', { class: 'page-sub' }, 'Assign fictional scout participants to each period’s scout groups. Only eligible, available people are used; gaps stay visible.')));
  if (!day) {
    main.append(emptyState('No days to rotate', 'Add a day on the Plan page first.', h('a', { class: 'btn', href: '#/plan' }, 'Go to Plan')));
    return;
  }
  main.append(daySwitcher(p.week.days, day.id, (d) => `#/rotation/${encodeURIComponent(d.id)}`));

  const groups = p.groups;
  const participants = p.participants;
  const rotation = p.rotations[day.id] || null;
  const base = { day, groups, participants };
  const v = rotation ? validateRotation({ ...base, rotation }) : null;
  const hasSlots = computeSchedule(day).items.some((it) => (day.periods.find((x) => x.id === it.periodId)?.groupIds || []).length);

  // Controls.
  const seed = h('input', { type: 'number', min: 0, max: 999999, step: 1, value: rotation?.seed ?? 1, name: 'seed', 'aria-label': 'Seed', inputmode: 'numeric', class: 'input-seed' });
  const lockedCount = rotation ? rotation.entries.flatMap((e) => e.slots).filter((s) => s.locked).length : 0;
  const controls = h('section', { class: 'rot-controls', 'aria-label': 'Generate' },
    h('div', { class: 'row-actions' },
      h('label', { class: 'inline-label' }, 'Seed ', seed),
      h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'generate', disabled: !hasSlots, on: { click: () => {
        const s = Math.max(0, Math.floor(Number(seed.value) || 0));
        const next = generateRotation({ ...base, previous: rotation, seed: s });
        ctx.commit({ ...app.project, rotations: { ...app.project.rotations, [day.id]: next } }, { label: rotation ? `Regenerated rotation (seed ${s}, ${lockedCount} locked kept)` : `Generated rotation (seed ${s})`, undoable: true });
      } } }, rotation ? 'Regenerate (keeps locks)' : 'Generate rotation'),
      h('a', { class: 'btn', href: `#/print/rotation/${encodeURIComponent(day.id)}` }, 'Print rotation sheet')),
    h('p', { class: 'muted small' }, `Fairness rule: ${FAIRNESS_RULE.replaceAll('>', '→')}. It counts assignments in this fictional plan; it is not a workload or health measure.`),
    rotation ? h('p', { class: 'small', 'data-rotation-meta': '' }, `Last generated with seed ${rotation.seed ?? '—'} · ${rotation.constraints?.participantCount ?? participants.length} participants · ${lockedCount} locked slot${lockedCount === 1 ? '' : 's'}${rotation.constraints?.dayVersion && rotation.constraints.dayVersion !== day.version ? ` · the day changed since (v${rotation.constraints.dayVersion} → v${day.version}); regenerate to refresh` : ''}`) : null);
  main.append(controls);

  if (!hasSlots) {
    main.append(emptyState('No scout groups on this day', 'Give a period one or more scout groups in the period editor, then generate.', h('a', { class: 'btn', href: `#/plan/${encodeURIComponent(day.id)}` }, 'Open the day plan')));
  } else if (!rotation) {
    main.append(emptyState(`No rotation yet for ${day.label}`, 'Generate one. Locked choices are kept on every regeneration, and anything that cannot be filled stays empty with the reason.', null));
  } else {
    main.append(summary(v), assignmentTables(ctx, day, rotation, v), countsTable(app, day, v));
  }
  main.append(participantManager(ctx, day));
}

function summary(v) {
  const count = (t) => v.warnings.filter((w) => w.type === t).length;
  const shortages = count('shortage') + count('not-generated');
  const errors = v.warnings.filter((w) => w.severity === 'error').length;
  const repeats = v.warnings.filter((w) => w.type === 'repeat-role');
  const unavoidable = repeats.filter((w) => w.unavoidable).length;
  const other = v.warnings.filter((w) => !['repeat-role'].includes(w.type));
  return h('section', { class: 'rot-summary', 'aria-label': 'Rotation check' },
    h('div', { class: 'chip-row' },
      chip(`${shortages} unfilled`, { tone: shortages ? 'warn' : 'ok', symbol: shortages ? '⚠' : '✓' }),
      chip(`${errors} problem${errors === 1 ? '' : 's'}`, { tone: errors ? 'error' : 'ok', symbol: errors ? '✕' : '✓' }),
      chip(`${repeats.length} repeated role${repeats.length === 1 ? '' : 's'} (${unavoidable} unavoidable)`, { tone: 'info', symbol: '↻' })),
    other.length ? h('ul', { class: 'warn-list', 'data-warnings': '' }, other.map(warningItem)) : h('p', { class: 'ok-line' }, '✓ Every slot is filled with an eligible, available participant and nobody is in two places at once.'),
    repeats.length ? h('details', { class: 'disclosure', 'data-key': 'repeats' }, h('summary', null, `Repeated roles (${repeats.length})`), h('ul', { class: 'warn-list' }, repeats.map(warningItem))) : null);
}

function assignmentTables(ctx, day, rotation, v) {
  const { app } = ctx;
  const p = app.project;
  const base = { day, groups: p.groups, participants: p.participants };
  const rows = rotationRows({ ...base, rotation });
  const byPeriod = new Map();
  for (const r of rows) {
    if (!byPeriod.has(r.periodId)) byPeriod.set(r.periodId, []);
    byPeriod.get(r.periodId).push(r);
  }
  const problemsFor = (r) => v.warnings.filter((w) => w.periodId === r.periodId && w.slotId === r.slotId && w.groupId === r.groupId && w.severity === 'error');
  const sections = [];
  for (const [periodId, list] of byPeriod) {
    const per = day.periods.find((x) => x.id === periodId);
    const first = list[0];
    const byGroup = new Map();
    for (const r of list) {
      if (!byGroup.has(r.groupId)) byGroup.set(r.groupId, []);
      byGroup.get(r.groupId).push(r);
    }
    sections.push(h('section', { class: 'rot-period', 'data-period-id': periodId },
      h('h3', null, h('span', { class: 'rot-time' }, `${formatClock12(first.startMin)}–${formatClock12(first.endMin)}`), ' ', per.title, per.parallel ? h('span', { class: 'pr-parallel' }, ' ‖ parallel station') : null),
      [...byGroup.entries()].map(([gid, grows]) => {
        const g = byId(p.groups, gid);
        return h('div', { class: 'table-wrap' }, h('table', { class: 'rot-table' },
          h('caption', null, g.label),
          h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Role'), h('th', { scope: 'col' }, 'Assigned'), h('th', { scope: 'col' }, 'Lock'), h('th', { scope: 'col' }, 'Why'))),
          h('tbody', null, grows.map((r) => slotRow(ctx, day, rotation, r, problemsFor(r))))));
      })));
  }
  return h('section', { class: 'rot-tables', 'aria-label': 'Assignments' }, sections);
}

function slotRow(ctx, day, rotation, r, problems) {
  const { app } = ctx;
  const p = app.project;
  const base = { day, groups: p.groups, participants: p.participants };
  const key = `${r.periodId}|${r.groupId}|${r.slotId}`;
  const cands = candidatesFor({ ...base, rotation, periodId: r.periodId, groupId: r.groupId, slotId: r.slotId });
  const label = (id) => byId(p.participants, id)?.label || `Unknown (${id})`;
  const counts = rotation.counts || {};
  const select = h('select', { 'aria-label': `${r.roleLabel || r.roleKey} in ${byId(p.groups, r.groupId).label}`, 'data-slot': key, 'data-focus': `slot-${key}`, disabled: r.locked || !ctx.canWrite(), on: { change: () => {
    const res = assignManual({ ...base, rotation, periodId: r.periodId, groupId: r.groupId, slotId: r.slotId, participantId: select.value || null });
    if (!res.ok) {
      ctx.toast(res.error, { tone: 'warn' });
      ctx.render();
      return;
    }
    ctx.commit({ ...app.project, rotations: { ...app.project.rotations, [day.id]: res.rotation } }, { label: 'Changed assignment' });
  } } },
  h('option', { value: '', selected: !r.participantId }, '— Unfilled —'),
  r.participantId && !cands.valid.includes(r.participantId) ? h('option', { value: r.participantId, selected: true }, `${label(r.participantId)} (has a problem)`) : null,
  cands.valid.map((id) => h('option', { value: id, selected: id === r.participantId }, `${label(id)} · ${counts[id]?.total ?? 0} today`)),
  cands.invalid.length ? h('optgroup', { label: 'Not possible here' }, cands.invalid.filter((x) => x.participantId !== r.participantId && byId(p.participants, x.participantId).roleKeys.includes(r.roleKey)).map((x) => h('option', { value: x.participantId, disabled: true }, `${label(x.participantId)} — ${x.reasons.join('; ')}`))) : null);

  const lockBtn = h('button', { type: 'button', class: `btn btn-small btn-lock${r.locked ? ' is-locked' : ''}`, 'aria-pressed': r.locked ? 'true' : 'false', 'data-lock': key, 'data-focus': `lock-${key}`, disabled: !r.participantId && !r.locked, on: { click: () => {
    const res = setLock({ ...base, rotation, periodId: r.periodId, groupId: r.groupId, slotId: r.slotId, locked: !r.locked });
    if (!res.ok) return ctx.toast(res.error, { tone: 'warn' });
    ctx.commit({ ...app.project, rotations: { ...app.project.rotations, [day.id]: res.rotation } }, { label: r.locked ? 'Unlocked slot' : 'Locked slot' });
  } } }, r.locked ? h('span', { 'aria-hidden': 'true' }, '🔒 ') : null, r.locked ? 'Locked' : 'Lock');

  const why = !r.generated
    ? h('span', { class: 'warn-text' }, '⚠ Not generated yet — regenerate to fill.')
    : !r.participantId
      ? h('span', { class: 'warn-text', 'data-shortage': key }, `⚠ Unfilled. ${r.reason}`)
      : problems.length
        ? h('span', { class: 'error-text' }, problems.map((w) => `✕ ${w.message}`).join(' '))
        : h('span', { class: 'muted' }, r.locked ? 'Locked by coach. Regeneration keeps it.' : r.rationale);
  return h('tr', { class: `${!r.participantId ? 'is-unfilled' : ''}${problems.length ? ' has-problem' : ''}`, 'data-row': key },
    h('th', { scope: 'row' }, r.roleLabel || r.roleKey),
    h('td', null, select, r.locked ? h('span', { class: 'small muted block' }, 'Unlock to change') : null),
    h('td', null, lockBtn),
    h('td', { class: 'why' }, why));
}

function countsTable(app, day, v) {
  const p = app.project;
  const repeats = new Map();
  for (const w of v.warnings) if (w.type === 'repeat-role') repeats.set(w.participantId, (repeats.get(w.participantId) || 0) + 1);
  const rows = p.participants.map((x) => ({ x, c: v.counts[x.id] || { total: 0, byRole: {} } })).sort((a, b) => b.c.total - a.c.total || (a.x.label < b.x.label ? -1 : 1));
  return h('section', { class: 'rot-counts', 'aria-label': 'Assignment counts' },
    h('h2', null, `Counts for ${day.label}`),
    h('p', { class: 'muted small' }, 'How many slots each fictional participant fills today. Use it to judge the spread; it is not a workload limit.'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'counts-table' },
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Participant'), h('th', { scope: 'col' }, 'Slots today'), h('th', { scope: 'col' }, 'By role'), h('th', { scope: 'col' }, 'Repeats'), h('th', { scope: 'col' }, 'Out today'))),
      h('tbody', null, rows.map(({ x, c }) => h('tr', { 'data-participant': x.id },
        h('th', { scope: 'row' }, x.label),
        h('td', { class: 'num' }, String(c.total)),
        h('td', null, Object.entries(c.byRole).map(([k, n]) => `${k} ×${n}`).join(', ') || '—'),
        h('td', { class: 'num' }, String(repeats.get(x.id) || 0)),
        h('td', null, x.unavailable.filter((u) => u.dayId === day.id).length ? `⊘ ${x.unavailable.filter((u) => u.dayId === day.id).length} marked` : '—')))))));
}

// ---------------------------------------------------------------- participants
function participantManager(ctx, day) {
  const { app } = ctx;
  const p = app.project;
  const roleKeys = [...new Set(p.groups.flatMap((g) => g.roles.map((r) => r.roleKey)))];
  const periods = day.periods.filter((x) => x.scheduled && x.groupIds.length);
  const update = (participants, label) => ctx.commit(pruneReferences({ ...app.project, participants }), { label });

  const rows = p.participants.map((x) => {
    const name = h('input', { type: 'text', value: x.label, maxlength: 40, 'aria-label': `Label for ${x.label}`, 'data-rename': x.id, 'data-focus': `rename-${x.id}`, on: { change: () => {
      const label = name.value.trim();
      const errs = validateParticipant({ ...x, label }).errors;
      if (errs.length) {
        ctx.toast(errs[0], { tone: 'warn' });
        name.value = x.label;
        return;
      }
      update(renameParticipant(app.project.participants, x.id, label), 'Renamed participant');
    } } });
    const roles = roleKeys.map((k) => h('label', { class: 'check-pill' }, h('input', { type: 'checkbox', checked: x.roleKeys.includes(k), 'data-focus': `role-${x.id}-${k}`, on: { change: (e) => {
      const next = e.target.checked ? x.roleKeys.concat([k]) : x.roleKeys.filter((r) => r !== k);
      update(setRoleKeys(app.project.participants, x.id, next), 'Changed eligible roles');
    } } }), h('span', null, k)));
    const groups = p.groups.map((g) => h('label', { class: 'check-pill' }, h('input', { type: 'checkbox', checked: x.groupIds.includes(g.id), 'data-focus': `grp-${x.id}-${g.id}`, on: { change: (e) => {
      const next = e.target.checked ? x.groupIds.concat([g.id]) : x.groupIds.filter((r) => r !== g.id);
      update(setGroupIds(app.project.participants, x.id, next), 'Changed groups');
    } } }), h('span', null, g.label)));
    const wholeDay = isUnavailable({ unavailable: x.unavailable.filter((u) => u.periodId === null) }, day.id, null);
    const avail = h('div', { class: 'avail' },
      h('label', { class: 'check-pill' }, h('input', { type: 'checkbox', checked: wholeDay, 'data-out-day': x.id, 'data-focus': `out-day-${x.id}`, on: { change: (e) => update(setUnavailable(app.project.participants, x.id, day.id, null, e.target.checked), e.target.checked ? 'Marked out for the day' : 'Marked available') } }), h('span', null, `Out all of ${day.label}`)),
      periods.map((per) => h('label', { class: 'check-pill' }, h('input', { type: 'checkbox', disabled: wholeDay, checked: x.unavailable.some((u) => u.dayId === day.id && u.periodId === per.id), 'data-out-period': `${x.id}|${per.id}`, 'data-focus': `out-${x.id}|${per.id}`, on: { change: (e) => update(setUnavailable(app.project.participants, x.id, day.id, per.id, e.target.checked), e.target.checked ? 'Marked out for a period' : 'Marked available') } }), h('span', null, `Out: ${per.title}`))));
    return h('li', { class: 'person', 'data-participant': x.id },
      h('div', { class: 'person-head' }, name,
        h('button', { type: 'button', class: 'btn btn-small btn-danger-quiet', on: { click: () => update(removeParticipant(app.project.participants, x.id), `Removed ${x.label}`) } }, 'Remove')),
      h('div', { class: 'person-line' }, h('span', { class: 'muted small' }, 'Roles'), roles),
      h('div', { class: 'person-line' }, h('span', { class: 'muted small' }, 'Groups'), groups),
      h('div', { class: 'person-line' }, h('span', { class: 'muted small' }, `Availability, ${day.label}`), avail));
  });

  return h('details', { class: 'disclosure participants', 'data-key': 'participants' },
    h('summary', null, `Fictional participants (${p.participants.length})`),
    h('p', { class: 'muted small' }, 'Synthetic labels only — no real names, health or personal details. Changes revalidate the whole day.'),
    h('ul', { class: 'person-list' }, rows),
    h('button', { type: 'button', class: 'btn', on: { click: () => {
      const n = String(app.project.participants.length + 1).padStart(2, '0');
      ctx.commit({ ...app.project, participants: addParticipant(app.project.participants, app.ids('ppl'), { label: `Fict Scout ${n} (new)` }) }, { label: 'Added participant' });
    } } }, '+ Add fictional participant'));
}
