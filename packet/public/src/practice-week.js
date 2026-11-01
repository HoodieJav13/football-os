// Week / day / period model: immutable operations and schedule computation. Pure.
// Every change bumps the affected day's version and the week's version.
// Ids are never changed by an edit; duplicates always get new ids.

export const CATEGORIES = ['walkthrough', 'individual', 'group', 'team', 'break'];
export const PERIOD_LIMITS = { title: 120, objective: 300, callLabel: 60, notes: 2000, equipmentItem: 60, equipment: 20, minutesMin: 1, minutesMax: 240 };
export const DAY_LIMITS = { label: 60, notes: 1000, plannedMin: 10, plannedMax: 360 };

export function newPeriod(id, fields = {}) {
  return {
    id,
    title: 'New period',
    minutes: 10,
    category: 'group',
    objective: '',
    callLabel: '',
    drillId: null,
    cardIds: [],
    groupIds: [],
    equipment: [],
    notes: '',
    scheduled: true,
    parallel: false,
    fixedStart: null,
    ...copyPeriodFields(fields),
    id,
  };
}

export function newDay(id, fields = {}) {
  return { id, label: 'New day', date: '', startMin: 15 * 60 + 30, plannedMinutes: 120, version: 1, notes: '', periods: [], ...fields, id };
}

function copyPeriodFields(p) {
  const out = { ...p };
  for (const k of ['cardIds', 'groupIds', 'equipment']) if (Array.isArray(p[k])) out[k] = p[k].slice();
  if (Array.isArray(p.schemeRefs)) out.schemeRefs = p.schemeRefs.map((ref) => ({ ...ref }));
  return out;
}

const bumpWeek = (week, days) => ({ ...week, days, version: (week.version || 0) + 1 });

function mapDay(week, dayId, fn) {
  let found = false;
  let changed = false;
  const days = week.days.map((d) => {
    if (d.id !== dayId) return d;
    found = true;
    const next = fn(d);
    if (next === d) return d;
    changed = true;
    return { ...next, version: (d.version || 0) + 1 };
  });
  if (!found) throw new Error(`unknown day ${dayId}`);
  return changed ? bumpWeek(week, days) : week;
}

function findIndex(list, id, what) {
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) throw new Error(`unknown ${what} ${id}`);
  return i;
}

// ---------------------------------------------------------------- periods
export function addPeriod(week, dayId, period, index) {
  return mapDay(week, dayId, (d) => {
    const periods = d.periods.slice();
    const at = index === undefined ? periods.length : Math.max(0, Math.min(index, periods.length));
    periods.splice(at, 0, period);
    return { ...d, periods };
  });
}

export function updatePeriod(week, dayId, periodId, patch) {
  return mapDay(week, dayId, (d) => {
    const i = findIndex(d.periods, periodId, 'period');
    const { id: _ignored, ...rest } = patch;
    const periods = d.periods.slice();
    periods[i] = { ...periods[i], ...copyPeriodFields(rest), id: periodId };
    return { ...d, periods };
  });
}

export function deletePeriod(week, dayId, periodId) {
  return mapDay(week, dayId, (d) => {
    findIndex(d.periods, periodId, 'period');
    return { ...d, periods: d.periods.filter((p) => p.id !== periodId) };
  });
}

export function duplicatePeriod(week, dayId, periodId, ids) {
  const d = week.days.find((x) => x.id === dayId);
  if (!d) throw new Error(`unknown day ${dayId}`);
  const i = findIndex(d.periods, periodId, 'period');
  const src = d.periods[i];
  const id = ids('per');
  const copy = { ...copyPeriodFields(src), id, title: truncate(`${src.title} (copy)`, PERIOD_LIMITS.title) };
  return { week: addPeriod(week, dayId, copy, i + 1), id };
}

export function movePeriod(week, dayId, periodId, delta) {
  return mapDay(week, dayId, (d) => {
    const i = findIndex(d.periods, periodId, 'period');
    const j = i + delta;
    if (j < 0 || j >= d.periods.length || delta === 0) return d;
    const periods = d.periods.slice();
    const [p] = periods.splice(i, 1);
    periods.splice(j, 0, p);
    return { ...d, periods };
  });
}

export function reorderPeriods(week, dayId, orderedIds) {
  return mapDay(week, dayId, (d) => {
    const current = d.periods.map((p) => p.id);
    const same = orderedIds.length === current.length && new Set(orderedIds).size === orderedIds.length && orderedIds.every((id) => current.includes(id));
    if (!same) throw new Error('reorderPeriods needs a permutation of the day\'s period ids');
    if (orderedIds.every((id, k) => id === current[k])) return d;
    const byId = new Map(d.periods.map((p) => [p.id, p]));
    return { ...d, periods: orderedIds.map((id) => byId.get(id)) };
  });
}

// ---------------------------------------------------------------- days
export function addDay(week, day, index) {
  const days = week.days.slice();
  days.splice(index === undefined ? days.length : index, 0, day);
  return bumpWeek(week, days);
}

export function updateDay(week, dayId, patch) {
  const { id: _i, periods: _p, version: _v, ...rest } = patch;
  return mapDay(week, dayId, (d) => ({ ...d, ...rest }));
}

export function deleteDay(week, dayId) {
  findIndex(week.days, dayId, 'day');
  return bumpWeek(week, week.days.filter((d) => d.id !== dayId));
}

export function moveDay(week, dayId, delta) {
  const i = findIndex(week.days, dayId, 'day');
  const j = i + delta;
  if (j < 0 || j >= week.days.length || delta === 0) return week;
  const days = week.days.slice();
  const [d] = days.splice(i, 1);
  days.splice(j, 0, d);
  return bumpWeek(week, days);
}

export function duplicateDay(week, dayId, ids) {
  const i = findIndex(week.days, dayId, 'day');
  const src = week.days[i];
  const id = ids('day');
  const idMap = {};
  const periods = src.periods.map((p) => {
    const nid = ids('per');
    idMap[p.id] = nid;
    return { ...copyPeriodFields(p), id: nid };
  });
  const copy = { ...src, id, label: truncate(`${src.label} (copy)`, DAY_LIMITS.label), version: 1, periods };
  return { week: addDay(week, copy, i + 1), id, idMap };
}

// Replace or append a day's periods from a template, with fresh ids.
export function applyTemplate(week, dayId, template, ids, { mode = 'replace' } = {}) {
  return mapDay(week, dayId, (d) => {
    const made = template.periods.map((tp) => newPeriod(ids('per'), {
      title: tp.title, minutes: tp.minutes, category: tp.category, objective: tp.objective || '',
      callLabel: tp.callLabel || '', drillId: tp.drillId || null, cardIds: tp.cardIds || [], groupIds: tp.groupIds || [],
      equipment: tp.equipment || [], notes: tp.notes || '', parallel: !!tp.parallel,
      ...(tp.schemeRefs?.length ? { schemeRefs: tp.schemeRefs } : {}),
    }));
    return {
      ...d,
      plannedMinutes: mode === 'replace' && template.plannedMinutes ? template.plannedMinutes : d.plannedMinutes,
      periods: mode === 'replace' ? made : d.periods.concat(made),
    };
  });
}

export function dayAsTemplate(day, id, label) {
  return {
    id,
    label,
    description: `Saved from ${day.label}`,
    plannedMinutes: day.plannedMinutes,
    periods: day.periods.map((p) => ({
      title: p.title, minutes: p.minutes, category: p.category, objective: p.objective, callLabel: p.callLabel,
      drillId: p.drillId, cardIds: p.cardIds.slice(), groupIds: p.groupIds.slice(), equipment: p.equipment.slice(), notes: p.notes, parallel: p.parallel,
      ...(p.schemeRefs?.length ? { schemeRefs: p.schemeRefs.map((ref) => ({ ...ref })) } : {}),
    })),
  };
}

// ---------------------------------------------------------------- schedule
export function intervalsOverlap(a, b) {
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

export function computeSchedule(day) {
  const items = [];
  const unscheduled = [];
  const warnings = [];
  const categoryTotals = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  let blockStart = day.startMin;
  let blockEnd = day.startMin;
  let blockIndex = -1;
  let first = true;

  for (const p of day.periods) {
    if (!p.scheduled) {
      unscheduled.push(p.id);
      continue;
    }
    const minutes = Number(p.minutes) || 0;
    let startMin;
    let gapBeforeMin = 0;
    let overlapMin = 0;
    const parallel = !!p.parallel && !first;
    if (parallel) {
      startMin = blockStart;
    } else {
      blockIndex++;
      if (p.fixedStart !== null && p.fixedStart !== undefined) {
        startMin = p.fixedStart;
        if (startMin < blockEnd) overlapMin = blockEnd - startMin;
        else gapBeforeMin = startMin - blockEnd;
      } else {
        startMin = blockEnd;
      }
      blockStart = startMin;
    }
    const endMin = startMin + minutes;
    // The next sequential period starts after everything so far has ended.
    blockEnd = Math.max(blockEnd, endMin);
    items.push({ periodId: p.id, startMin, endMin, minutes, parallel, gapBeforeMin, overlapMin, block: blockIndex, category: p.category, groupIds: p.groupIds || [] });
    if (categoryTotals[p.category] !== undefined) categoryTotals[p.category] += minutes;
    if (overlapMin) {
      warnings.push({ type: 'overlap', severity: 'warning', periodId: p.id, message: `“${p.title}” is fixed at a time that overlaps the previous period by ${overlapMin} min.` });
    }
    first = false;
  }

  const endMin = items.length ? Math.max(...items.map((i) => i.endMin)) : day.startMin;
  const totalMin = endMin - day.startMin;
  const overByMin = Math.max(0, totalMin - day.plannedMinutes);
  if (overByMin > 0) {
    warnings.push({ type: 'over-duration', severity: 'warning', message: `Day runs ${totalMin} min, ${overByMin} min over the planned ${day.plannedMinutes} min. Nothing was shortened.` });
  }

  // Overlapping periods (declared stations or fixed-start overlaps) that share a group.
  for (let a = 0; a < items.length; a++) {
    for (let b = a + 1; b < items.length; b++) {
      if (!intervalsOverlap(items[a], items[b])) continue;
      for (const g of items[a].groupIds) {
        if (items[b].groupIds.includes(g)) {
          warnings.push({ type: 'group-overlap', severity: 'warning', groupId: g, periodId: items[b].periodId, otherPeriodId: items[a].periodId, message: 'The same scout group is in two periods at the same time.' });
        }
      }
    }
  }

  return { items, unscheduled, warnings, categoryTotals, startMin: day.startMin, endMin, totalMin, plannedMin: day.plannedMinutes, overByMin };
}

// ---------------------------------------------------------------- validation
const isStr = (v) => typeof v === 'string';

export function validatePeriod(p) {
  const errors = [];
  const L = PERIOD_LIMITS;
  if (!isStr(p.title) || !p.title.trim()) errors.push('Title is required.');
  else if (p.title.length > L.title) errors.push(`Title is longer than ${L.title} characters.`);
  if (!Number.isInteger(p.minutes) || p.minutes < L.minutesMin || p.minutes > L.minutesMax) errors.push(`Duration must be a whole number of minutes from ${L.minutesMin} to ${L.minutesMax}.`);
  if (!CATEGORIES.includes(p.category)) errors.push(`Category must be one of ${CATEGORIES.join(', ')}.`);
  if (!isStr(p.objective) || p.objective.length > L.objective) errors.push(`Objective must be text up to ${L.objective} characters.`);
  if (!isStr(p.callLabel) || p.callLabel.length > L.callLabel) errors.push(`Call/look label must be text up to ${L.callLabel} characters.`);
  if (!isStr(p.notes) || p.notes.length > L.notes) errors.push(`Coach notes must be text up to ${L.notes} characters.`);
  if (!Array.isArray(p.equipment) || p.equipment.length > L.equipment || p.equipment.some((e) => !isStr(e) || e.length > L.equipmentItem)) errors.push(`Equipment must be up to ${L.equipment} items of ${L.equipmentItem} characters.`);
  for (const k of ['cardIds', 'groupIds']) if (!Array.isArray(p[k]) || p[k].some((x) => !isStr(x))) errors.push(`${k} must be a list of ids.`);
  if (p.drillId !== null && !isStr(p.drillId)) errors.push('Drill must be an id or none.');
  if (typeof p.scheduled !== 'boolean' || typeof p.parallel !== 'boolean') errors.push('Scheduled and parallel must be true or false.');
  if (p.fixedStart !== null && (!Number.isInteger(p.fixedStart) || p.fixedStart < 0 || p.fixedStart >= 1440)) errors.push('Fixed start must be a time of day or none.');
  return { errors };
}

export function validateDay(d) {
  const errors = [];
  if (!isStr(d.label) || !d.label.trim() || d.label.length > DAY_LIMITS.label) errors.push(`Day label is required, up to ${DAY_LIMITS.label} characters.`);
  if (!isStr(d.date) || (d.date && !/^\d{4}-\d{2}-\d{2}$/.test(d.date))) errors.push('Date must be YYYY-MM-DD or empty.');
  if (!Number.isInteger(d.startMin) || d.startMin < 0 || d.startMin >= 1440) errors.push('Start time must be a time of day.');
  if (!Number.isInteger(d.plannedMinutes) || d.plannedMinutes < DAY_LIMITS.plannedMin || d.plannedMinutes > DAY_LIMITS.plannedMax) errors.push(`Planned duration must be ${DAY_LIMITS.plannedMin}–${DAY_LIMITS.plannedMax} minutes.`);
  if (!isStr(d.notes) || d.notes.length > DAY_LIMITS.notes) errors.push(`Day notes up to ${DAY_LIMITS.notes} characters.`);
  if (!Number.isInteger(d.version) || d.version < 1) errors.push('Day version must be a positive integer.');
  if (!Array.isArray(d.periods)) errors.push('Periods must be a list.');
  return { errors };
}

export function truncate(s, n) {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}
