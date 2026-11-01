// Project schema: versioned JSON export/import with strict validation. Pure.
import { validatePeriod, validateDay, CATEGORIES } from './week.js';
import { validateParticipant } from './participants.js';
import { validateCard, printFitError } from './cards.js';
import { clockErrors } from './clock.js';
import { recordErrors } from './disruption.js';
import { schemeErrors, schemeWarnings } from './schemeHandoff.js';

export const SCHEMA = 'practice-week-planner.project';
export const SCHEMA_VERSION = 1;
const PROJECT_KEYS = ['schema', 'schemaVersion', 'project', 'week', 'groups', 'participants', 'drills', 'templates', 'cards', 'rotations', 'records'];
// Present only once a coach imports a scheme, so existing files keep their exact bytes.
const SCHEME_KEYS = ['schemeManifests', 'schemeObservations'];
const FILE_KEYS = PROJECT_KEYS.concat(['clock'], SCHEME_KEYS);

export function exportProject(project, clock) {
  const doc = {
    schema: SCHEMA,
    schemaVersion: SCHEMA_VERSION,
    project: project.project,
    week: project.week,
    groups: project.groups,
    participants: project.participants,
    drills: project.drills,
    templates: project.templates,
    cards: project.cards,
    rotations: project.rotations,
    records: project.records ?? [],
    ...Object.fromEntries(SCHEME_KEYS.filter((k) => project[k] !== undefined).map((k) => [k, project[k]])),
    clock: clock ?? null,
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

const err = (path, message) => ({ path, message });

export function importProject(text) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [err('', `Not valid JSON: ${e.message}`)], warnings: [] };
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { ok: false, errors: [err('', 'Not a Practice Week Planner project (expected a JSON object).')], warnings: [] };
  if (doc.schema !== SCHEMA) return { ok: false, errors: [err('schema', `Not a Practice Week Planner project (schema is ${JSON.stringify(doc.schema ?? null)}).`)], warnings: [] };
  if (!Number.isInteger(doc.schemaVersion) || doc.schemaVersion < 1) return { ok: false, errors: [err('schemaVersion', 'Malformed file: schemaVersion must be a positive whole number.')], warnings: [] };
  if (doc.schemaVersion > SCHEMA_VERSION) {
    return { ok: false, errors: [err('schemaVersion', `Unsupported schema version ${doc.schemaVersion}: this planner reads version ${SCHEMA_VERSION}. The file was made by a newer planner; nothing was imported.`)], warnings: [] };
  }
  const warnings = [];
  for (const k of Object.keys(doc)) if (!FILE_KEYS.includes(k)) warnings.push(`Ignored unknown field “${k}”.`);
  const project = {};
  for (const k of PROJECT_KEYS) project[k] = doc[k];
  for (const k of SCHEME_KEYS) if (doc[k] !== undefined) project[k] = doc[k];
  // Files from before saved debriefs existed (C1) have none.
  if (project.records === undefined) project.records = [];
  const clock = doc.clock ?? null;
  const v = validateProject(project, { clock });
  if (v.errors.length) return { ok: false, errors: v.errors, warnings };
  return { ok: true, project, clock, warnings: warnings.concat(v.warnings) };
}

const isStr = (v) => typeof v === 'string';
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

// Never throws: any unexpected shape becomes an error instead of an exception.
export function validateProject(p, opts = {}) {
  try {
    const shape = shapeErrors(p, opts.clock ?? null);
    if (shape.length) return { errors: shape, warnings: [] };
    return validateChecked(p, opts);
  } catch (e) {
    return { errors: [err('', `Malformed file: ${e && e.message ? e.message : String(e)}`)], warnings: [] };
  }
}


// Every list item must be an object before any field is read.
function shapeErrors(p, clock) {
  const out = [];
  if (!isObj(p)) return [err('', 'Project must be an object.')];
  const objs = (list, path) => {
    if (!Array.isArray(list)) return false;
    let ok = true;
    list.forEach((x, i) => { if (!isObj(x)) { out.push(err(`${path}[${i}]`, 'Expected an object.')); ok = false; } });
    return ok;
  };
  if (objs(p.groups, 'groups')) p.groups.forEach((g, i) => objs(g.roles, `groups[${i}].roles`));
  objs(p.drills, 'drills');
  objs(p.cards, 'cards');
  if (objs(p.templates, 'templates')) p.templates.forEach((t, i) => objs(t.periods, `templates[${i}].periods`));
  if (objs(p.participants, 'participants')) p.participants.forEach((x, i) => objs(x.unavailable, `participants[${i}].unavailable`));
  if (isObj(p.week) && objs(p.week.days, 'week.days')) p.week.days.forEach((d, i) => objs(d.periods, `week.days[${i}].periods`));
  if (isObj(p.rotations)) {
    for (const [k, r] of Object.entries(p.rotations)) {
      if (!isObj(r)) { out.push(err(`rotations.${k}`, 'Expected an object.')); continue; }
      if (objs(r.entries, `rotations.${k}.entries`)) r.entries.forEach((e, i) => objs(e.slots, `rotations.${k}.entries[${i}].slots`));
      objs(r.orphans, `rotations.${k}.orphans`);
    }
  }
  if (clock !== null && clock !== undefined && !isObj(clock)) out.push(err('clock', 'Clock must be an object or null.'));
  return out;
}

function validateChecked(p, { clock = null, legacyPrintFit = 'error' } = {}) {
  const errors = [];
  const warnings = [];
  const ids = new Map();
  const claim = (id, path) => {
    if (!isStr(id) || !id) {
      errors.push(err(path, 'Missing id.'));
      return;
    }
    if (ids.has(id)) errors.push(err(path, `Duplicate id “${id}” (also at ${ids.get(id)}).`));
    else ids.set(id, path);
  };
  const need = (cond, path, message) => {
    if (!cond) errors.push(err(path, message));
    return cond;
  };

  if (!isObj(p)) return { errors: [err('', 'Project must be an object.')], warnings };
  if (need(isObj(p.project), 'project', 'Missing project header.')) {
    const h = p.project;
    claim(h.id, 'project.id');
    need(isStr(h.name) && h.name.trim() && h.name.length <= 80, 'project.name', 'Project name is required (up to 80 characters).');
    need(h.fictional === true, 'project.fictional', 'This prototype only holds fictional projects (fictional must be true).');
    need(isStr(h.timezone) && h.timezone.length > 0, 'project.timezone', 'Timezone label is required.');
    need(Number.isInteger(h.rev) && h.rev >= 0, 'project.rev', 'Project revision must be a whole number.');
  }

  for (const k of ['groups', 'participants', 'drills', 'templates', 'cards']) need(Array.isArray(p[k]), k, `${k} must be a list.`);
  need(isObj(p.rotations), 'rotations', 'rotations must be an object keyed by day id.');
  if (errors.length) return { errors, warnings };

  // Groups.
  const groupSlots = new Map();
  p.groups.forEach((g, i) => {
    const path = `groups[${i}]`;
    claim(g.id, `${path}.id`);
    need(isStr(g.label) && g.label.trim(), `${path}.label`, 'Group label is required.');
    if (need(Array.isArray(g.roles), `${path}.roles`, 'Group roles must be a list.')) {
      const slots = new Set();
      g.roles.forEach((r, j) => {
        need(isStr(r.slotId) && !slots.has(r.slotId), `${path}.roles[${j}].slotId`, `Role slot id must be unique within the group (“${r.slotId}”).`);
        slots.add(r.slotId);
        need(isStr(r.roleKey) && r.roleKey.trim(), `${path}.roles[${j}].roleKey`, 'Role key is required.');
      });
      groupSlots.set(g.id, slots);
    }
  });
  const groupIds = new Set(p.groups.map((g) => g.id));

  // Drills.
  p.drills.forEach((d, i) => {
    const path = `drills[${i}]`;
    claim(d.id, `${path}.id`);
    need(isStr(d.title) && d.title.trim(), `${path}.title`, 'Drill title is required.');
    for (const k of ['objective', 'setup']) need(isStr(d[k]), `${path}.${k}`, `Drill ${k} must be text.`);
    for (const k of ['steps', 'cues', 'tags', 'equipment']) need(Array.isArray(d[k]) && d[k].every(isStr), `${path}.${k}`, `Drill ${k} must be a list of text.`);
  });
  const drillIds = new Set(p.drills.map((d) => d.id));

  // Cards. The print-fit rule (F2) gets its own path; a project saved by an
  // older version may be loaded with such cards flagged (legacyPrintFit: 'flag').
  const flaggedCards = [];
  p.cards.forEach((c, i) => {
    claim(c.id, `cards[${i}].id`);
    const fit = printFitError(c);
    for (const e of validateCard(c).errors) {
      if (e !== fit) errors.push(err(`cards[${i}]`, e));
      else if (legacyPrintFit === 'flag') {
        flaggedCards.push(c.id);
        warnings.push(`Card “${c.title}” is too long to print four to a page (saved by an older version). It is kept unchanged; shorten it to print it.`);
      } else {
        const t = typeof c.title === 'string' ? c.title : '';
        const name = t.length > 40 ? `${t.slice(0, 39)}…` : t;
        errors.push({ ...err(`cards[${i}].notes`, `Card “${name}” (id ${c.id}): ${e}`), kind: 'print-fit' });
      }
    }
  });
  const cardIds = new Set(p.cards.map((c) => c.id));

  const checkRefs = (per, path) => {
    if (per.drillId !== null && per.drillId !== undefined && !drillIds.has(per.drillId)) errors.push(err(`${path}.drillId`, `Unknown drill “${per.drillId}”.`));
    (per.cardIds || []).forEach((id, k) => { if (!cardIds.has(id)) errors.push(err(`${path}.cardIds[${k}]`, `Unknown card “${id}”.`)); });
    (per.groupIds || []).forEach((id, k) => { if (!groupIds.has(id)) errors.push(err(`${path}.groupIds[${k}]`, `Unknown group “${id}”.`)); });
  };

  // Templates.
  p.templates.forEach((t, i) => {
    const path = `templates[${i}]`;
    claim(t.id, `${path}.id`);
    need(isStr(t.label) && t.label.trim(), `${path}.label`, 'Template label is required.');
    if (need(Array.isArray(t.periods), `${path}.periods`, 'Template periods must be a list.')) {
      t.periods.forEach((tp, j) => {
        need(Number.isInteger(tp.minutes) && tp.minutes >= 1 && tp.minutes <= 240, `${path}.periods[${j}].minutes`, 'Template period minutes must be 1–240.');
        need(CATEGORIES.includes(tp.category), `${path}.periods[${j}].category`, 'Unknown category.');
        checkRefs(tp, `${path}.periods[${j}]`);
      });
    }
  });

  // Week, days, periods.
  const periodsByDay = new Map();
  if (need(isObj(p.week), 'week', 'Missing week.')) {
    const w = p.week;
    claim(w.id, 'week.id');
    need(Number.isInteger(w.version) && w.version >= 1, 'week.version', 'Week version must be a positive whole number.');
    need(isStr(w.opponentLabel) && w.opponentLabel.length <= 80, 'week.opponentLabel', 'Opponent label must be text up to 80 characters.');
    need(isStr(w.notes) && w.notes.length <= 2000, 'week.notes', 'Week notes up to 2000 characters.');
    if (need(Array.isArray(w.days), 'week.days', 'Days must be a list.')) {
      w.days.forEach((d, i) => {
        const path = `week.days[${i}]`;
        claim(d.id, `${path}.id`);
        for (const e of validateDay(d).errors) errors.push(err(path, e));
        if (!Array.isArray(d.periods)) return;
        periodsByDay.set(d.id, new Set(d.periods.map((x) => x.id)));
        d.periods.forEach((per, j) => {
          const pp = `${path}.periods[${j}]`;
          claim(per.id, `${pp}.id`);
          for (const e of validatePeriod(per).errors) errors.push(err(pp, e));
          checkRefs(per, pp);
        });
      });
    }
  }

  // Participants.
  p.participants.forEach((x, i) => {
    const path = `participants[${i}]`;
    claim(x.id, `${path}.id`);
    for (const e of validateParticipant(x).errors) errors.push(err(path, e));
    (x.groupIds || []).forEach((g, k) => { if (!groupIds.has(g)) errors.push(err(`${path}.groupIds[${k}]`, `Unknown group “${g}”.`)); });
    (Array.isArray(x.unavailable) ? x.unavailable : []).forEach((u, k) => {
      if (!u) return;
      if (!periodsByDay.has(u.dayId)) errors.push(err(`${path}.unavailable[${k}]`, `Unknown day “${u.dayId}”.`));
      else if (u.periodId !== null && !periodsByDay.get(u.dayId).has(u.periodId)) errors.push(err(`${path}.unavailable[${k}]`, `Unknown period “${u.periodId}”.`));
    });
  });
  const personIds = new Set(p.participants.map((x) => x.id));

  // Rotations.
  for (const [dayId, r] of Object.entries(p.rotations)) {
    const path = `rotations.${dayId}`;
    if (!periodsByDay.has(dayId)) { errors.push(err(path, `Rotation for unknown day “${dayId}”.`)); continue; }
    if (!isObj(r) || r.dayId !== dayId || !Array.isArray(r.entries)) { errors.push(err(path, 'Rotation must have a matching dayId and an entries list.')); continue; }
    const pers = periodsByDay.get(dayId);
    r.entries.forEach((e, i) => {
      const ep = `${path}.entries[${i}]`;
      if (!pers.has(e.periodId)) errors.push(err(ep, `Unknown period “${e.periodId}”.`));
      if (!groupIds.has(e.groupId)) { errors.push(err(ep, `Unknown group “${e.groupId}”.`)); return; }
      if (!Array.isArray(e.slots)) { errors.push(err(ep, 'Slots must be a list.')); return; }
      e.slots.forEach((s, j) => {
        if (!groupSlots.get(e.groupId).has(s.slotId)) errors.push(err(`${ep}.slots[${j}]`, `Unknown role slot “${s.slotId}”.`));
        if (s.participantId !== null && !personIds.has(s.participantId)) errors.push(err(`${ep}.slots[${j}]`, `Unknown participant “${s.participantId}”.`));
        if (typeof s.locked !== 'boolean') errors.push(err(`${ep}.slots[${j}]`, 'locked must be true or false.'));
      });
    });
    (r.orphans || []).forEach((o, i) => {
      if (o.participantId && !personIds.has(o.participantId)) errors.push(err(`${path}.orphans[${i}]`, `Unknown participant “${o.participantId}”.`));
    });
  }

  // Saved practice debriefs (C1). Optional: plans saved before C1 have none.
  errors.push(...recordErrors(p.records));

  // Scheme manifests, pins and observations. Optional: older plans have none.
  errors.push(...schemeErrors(p));
  warnings.push(...schemeWarnings(p));

  // Clock.
  if (clock !== null && clock !== undefined) {
    if (!isObj(clock)) errors.push(err('clock', 'Clock must be an object or null.'));
    else {
      if (!periodsByDay.has(clock.dayId)) errors.push(err('clock.dayId', `Clock refers to an unknown day “${clock.dayId}”.`));
      // Same rules for the current state and every undo snapshot (F3).
      const otherDayPeriods = new Set([...periodsByDay].filter(([d]) => d !== clock.dayId).flatMap(([, set]) => [...set]));
      const cErrs = clockErrors(clock, { otherDayPeriods });
      errors.push(...cErrs);
      if (!cErrs.length && periodsByDay.has(clock.dayId)) {
        const pers = periodsByDay.get(clock.dayId);
        const missing = clock.steps.flatMap((s) => s.periodIds).filter((id) => !pers.has(id));
        if (missing.length) warnings.push(`The saved clock names ${missing.length} period(s) no longer in the day; titles are kept from when practice started.`);
      }
    }
  }

  return { errors, warnings, flaggedCards };
}

// Validate a saved clock against a project (startup and reload use this).
export function validateClockFor(project, clock) {
  if (clock === null || clock === undefined) return [];
  const days = (project?.week?.days || []).filter((d) => d && Array.isArray(d.periods));
  const out = [];
  if (clock && typeof clock === 'object' && !days.some((d) => d.id === clock.dayId)) out.push(err('clock.dayId', `Clock refers to an unknown day “${clock.dayId}”.`));
  const otherDayPeriods = new Set(days.filter((d) => d.id !== clock?.dayId).flatMap((d) => d.periods.map((x) => x.id)));
  return out.concat(clockErrors(clock, { otherDayPeriods }));
}

// After deletes: drop references to things that no longer exist. Pure.
export function pruneReferences(p) {
  const days = p.week.days;
  const dayPeriods = new Map(days.map((d) => [d.id, new Set(d.periods.map((x) => x.id))]));
  const cardIds = new Set(p.cards.map((c) => c.id));
  const groupIds = new Set(p.groups.map((g) => g.id));
  const drillIds = new Set(p.drills.map((d) => d.id));
  // Returns the same object when nothing dangles, so callers can detect changes.
  const fixPeriod = (per) => {
    const cards = per.cardIds || [];
    const groups = per.groupIds || [];
    const dangling = cards.some((id) => !cardIds.has(id)) || groups.some((id) => !groupIds.has(id)) || (!!per.drillId && !drillIds.has(per.drillId));
    if (!dangling) return per;
    return { ...per, cardIds: cards.filter((id) => cardIds.has(id)), groupIds: groups.filter((id) => groupIds.has(id)), drillId: per.drillId && drillIds.has(per.drillId) ? per.drillId : null };
  };
  // A pruned day is a changed day: bump its version (and the week's) once.
  let weekChanged = false;
  const nextDays = days.map((d) => {
    const periods = d.periods.map(fixPeriod);
    if (periods.every((x, i) => x === d.periods[i])) return d;
    weekChanged = true;
    return { ...d, periods, version: d.version + 1 };
  });
  const week = weekChanged ? { ...p.week, days: nextDays, version: p.week.version + 1 } : p.week;
  const participants = p.participants.map((x) => ({
    ...x,
    groupIds: x.groupIds.filter((g) => groupIds.has(g)),
    unavailable: x.unavailable.filter((u) => dayPeriods.has(u.dayId) && (u.periodId === null || dayPeriods.get(u.dayId).has(u.periodId))),
  }));
  const personIds = new Set(participants.map((x) => x.id));
  const rotations = {};
  for (const [dayId, r] of Object.entries(p.rotations)) {
    if (!dayPeriods.has(dayId)) continue;
    const pers = dayPeriods.get(dayId);
    rotations[dayId] = {
      ...r,
      entries: r.entries
        .filter((e) => pers.has(e.periodId) && groupIds.has(e.groupId))
        .map((e) => ({ ...e, slots: e.slots.map((s) => (s.participantId && !personIds.has(s.participantId) ? { ...s, participantId: null, locked: false, reason: 'Participant was removed.' } : s)) })),
      orphans: (r.orphans || []).filter((o) => pers.has(o.periodId) && personIds.has(o.participantId)),
    };
  }
  const templates = p.templates.map((t) => {
    const periods = t.periods.map(fixPeriod);
    return periods.every((x, i) => x === t.periods[i]) ? t : { ...t, periods };
  });
  return { ...p, week, participants, rotations, templates };
}
