// Frozen producer contract: one saved practice debrief as a small, versioned,
// self-contained document — practice-week-planner.practice-debrief v1 — for a
// consumer (Team Hub, Coaching flagship) that should not have to read the whole
// planner project. It reports what was actually practised, the disruptions, the
// coach's own debrief and the unfinished work, with the ids and revisions it
// came from. Pure; never changes the project. The validator never throws.
import { CLOCK_STATES, REVISION_KINDS } from './clock.js';
import { OUTCOMES, WORK_REASONS, RECORD_LIMITS } from './disruption.js';
import { SCHEMA as PROJECT_SCHEMA, SCHEMA_VERSION as PROJECT_SCHEMA_VERSION } from './project.js';

export const DEBRIEF_SCHEMA = 'practice-week-planner.practice-debrief';
export const DEBRIEF_SCHEMA_VERSION = 1;
export const DEBRIEF_NOTICE = 'Fictional practice record written by the coach. It reports what was run, what changed and what was left; it contains no doctrine, ratings, adoption decisions or player evaluation.';
const TOP_KEYS = ['schema', 'schemaVersion', 'fictional', 'notice', 'exportedWall', 'producer', 'source', 'periods', 'steps', 'disruptions', 'debrief', 'unfinished'];

// Never hands out a document its own validator refuses: a hand-edited record
// that the planner accepts but v1 cannot carry is refused with the reasons.
export function exportPracticeDebrief(project, recordId, { wall }) {
  const doc = buildPracticeDebrief(project, recordId, { wall });
  if (doc.error) return doc;
  const v = validatePracticeDebrief(doc);
  return v.ok ? doc : { error: `This debrief cannot be exported as practice-debrief v1: ${v.errors.slice(0, 3).map((e) => `${e.path}: ${e.message}`).join(' ')}`, errors: v.errors };
}

function buildPracticeDebrief(project, recordId, { wall }) {
  const rec = (project.records || []).find((r) => r.id === recordId);
  if (!rec) return { error: 'That debrief is not saved in this plan.' };
  const day = project.week.days.find((d) => d.id === rec.dayId) || null;
  const allPeriods = project.week.days.flatMap((d) => d.periods);
  const titleFromRecord = new Map();
  for (const u of rec.unfinished) titleFromRecord.set(u.periodId, u.title);
  for (const st of rec.steps) if (st.periodIds.length === 1) titleFromRecord.set(st.periodIds[0], st.title);
  const order = [];
  for (const id of [...rec.steps.flatMap((s) => s.periodIds), ...rec.unfinished.map((u) => u.periodId)]) if (!order.includes(id)) order.push(id);
  const periods = order.map((id) => {
    const per = (day?.periods || []).find((x) => x.id === id) || allPeriods.find((x) => x.id === id);
    if (!per) return { periodId: id, title: titleFromRecord.get(id) || id, category: null, minutes: null, drillId: null, cards: [], objective: '', callLabel: '', asOf: 'deleted', missing: true };
    return {
      periodId: per.id, title: per.title, category: per.category, minutes: per.minutes, drillId: per.drillId ?? null,
      cards: (per.cardIds || []).map((cid) => ({ cardId: cid, cardVersion: project.cards.find((c) => c.id === cid)?.version ?? null })),
      objective: per.objective || '', callLabel: per.callLabel || '', asOf: 'export',
    };
  });
  return {
    schema: DEBRIEF_SCHEMA,
    schemaVersion: DEBRIEF_SCHEMA_VERSION,
    fictional: true,
    notice: DEBRIEF_NOTICE,
    exportedWall: wall,
    producer: { app: 'practice-week-planner', contract: `practice-debrief/${DEBRIEF_SCHEMA_VERSION}`, projectSchema: PROJECT_SCHEMA, projectSchemaVersion: PROJECT_SCHEMA_VERSION },
    source: {
      projectId: project.project.id, projectRev: project.project.rev, weekId: project.week.id, weekVersion: project.week.version,
      dayId: rec.dayId, dayLabel: rec.dayLabel, dayVersionAtPractice: rec.dayVersion, dayVersionNow: day ? day.version : null,
      sessionId: rec.sessionId, recordId: rec.id, recordSavedWall: rec.savedWall, startedWall: rec.startedWall, endedWall: rec.endedWall, state: rec.state,
    },
    periods,
    steps: rec.steps.map((st, index) => ({ index, title: st.title, periodIds: st.periodIds.slice(), originalSec: st.originalSec, plannedSec: st.plannedSec, extensionSec: st.extensionSec, ranMs: st.ranMs, outcome: st.outcome })),
    disruptions: rec.changes.map((c) => ({ at: c.at, kind: c.kind, summary: c.summary })),
    debrief: { notes: rec.notes },
    unfinished: rec.unfinished.map((u) => ({ id: u.id, periodId: u.periodId, title: u.title, plannedSec: u.plannedSec, ranMs: u.ranMs, reason: u.reason, carriedTo: u.carriedTo ? { dayId: u.carriedTo.dayId, periodId: u.carriedTo.periodId } : null })),
  };
}

export function parsePracticeDebrief(text) {
  let doc;
  try { doc = JSON.parse(text); } catch (e) { return { ok: false, errors: [{ path: '', message: `Not valid JSON: ${e.message}` }] }; }
  const v = validatePracticeDebrief(doc);
  return v.ok ? { ok: true, doc, errors: [] } : { ok: false, errors: v.errors };
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string';
const isInt = (v, min = 0) => Number.isInteger(v) && v >= min;
const isMs = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isTime = (v) => typeof v === 'number' && Number.isFinite(v);

export function validatePracticeDebrief(doc) {
  const errors = [];
  const E = (path, message) => errors.push({ path, message });
  try {
    if (!isObj(doc)) return { ok: false, errors: [{ path: '', message: 'Expected a practice-debrief JSON object.' }] };
    if (doc.schema !== DEBRIEF_SCHEMA) return { ok: false, errors: [{ path: 'schema', message: `Not a practice debrief (schema is ${JSON.stringify(doc.schema ?? null)}).` }] };
    if (!Number.isInteger(doc.schemaVersion) || doc.schemaVersion < 1) return { ok: false, errors: [{ path: 'schemaVersion', message: 'schemaVersion must be a positive whole number.' }] };
    if (doc.schemaVersion !== DEBRIEF_SCHEMA_VERSION) return { ok: false, errors: [{ path: 'schemaVersion', message: `Unsupported practice-debrief version ${doc.schemaVersion}: this reader knows version ${DEBRIEF_SCHEMA_VERSION}. Nothing was read.` }] };
    for (const k of Object.keys(doc)) if (!TOP_KEYS.includes(k)) E(k, `Unknown field “${k}” is not part of practice-debrief v1.`);
    if (doc.fictional !== true) E('fictional', 'Must be true: these documents carry fictional practice data only.');
    if (!isStr(doc.notice)) E('notice', 'Must be text.');
    if (!isTime(doc.exportedWall)) E('exportedWall', 'Must be a time (ms).');
    const pr = doc.producer;
    if (!isObj(pr) || pr.app !== 'practice-week-planner' || !isStr(pr.contract) || !isStr(pr.projectSchema) || !isInt(pr.projectSchemaVersion, 1)) E('producer', 'Must be {app: "practice-week-planner", contract, projectSchema, projectSchemaVersion}.');
    const s = doc.source;
    if (!isObj(s)) E('source', 'Must be an object.');
    else {
      for (const k of ['projectId', 'weekId', 'dayId', 'dayLabel', 'sessionId', 'recordId']) if (!isStr(s[k]) || !s[k]) E(`source.${k}`, 'Must be non-empty text.');
      if (!isInt(s.projectRev)) E('source.projectRev', 'Must be a whole number, 0 or more.');
      for (const k of ['weekVersion', 'dayVersionAtPractice']) if (!isInt(s[k], 1)) E(`source.${k}`, 'Must be a whole number, 1 or more.');
      if (s.dayVersionNow !== null && !isInt(s.dayVersionNow, 1)) E('source.dayVersionNow', 'Must be a whole number, 1 or more, or null if the day was deleted.');
      if (!isTime(s.recordSavedWall)) E('source.recordSavedWall', 'Must be a time (ms).');
      for (const k of ['startedWall', 'endedWall']) if (s[k] !== null && !isTime(s[k])) E(`source.${k}`, 'Must be a time (ms) or null.');
      if (!CLOCK_STATES.includes(s.state)) E('source.state', `Must be one of ${CLOCK_STATES.join(', ')}.`);
    }
    const known = new Set();
    if (!Array.isArray(doc.periods)) E('periods', 'Must be a list.');
    else doc.periods.forEach((p, i) => {
      const pp = `periods[${i}]`;
      if (!isObj(p)) return E(pp, 'Must be an object.');
      if (!isStr(p.periodId) || !p.periodId) E(`${pp}.periodId`, 'Must be non-empty text.');
      else if (known.has(p.periodId)) E(`${pp}.periodId`, `Period “${p.periodId}” is listed twice.`);
      else known.add(p.periodId);
      if (!isStr(p.title)) E(`${pp}.title`, 'Must be text.');
      if (p.asOf !== 'export' && p.asOf !== 'deleted') E(`${pp}.asOf`, 'Must be "export" or "deleted".');
      if (p.asOf === 'deleted' && p.missing !== true) E(`${pp}.missing`, 'A deleted period is marked missing: true.');
      if (p.asOf === 'export' && p.missing !== undefined) E(`${pp}.missing`, 'Only a deleted period is marked missing.');
      const deleted = p.asOf === 'deleted';
      if (deleted ? p.category !== null : !isStr(p.category)) E(`${pp}.category`, deleted ? 'Is null for a deleted period.' : 'Must be text.');
      if (deleted ? p.minutes !== null : !isInt(p.minutes, 1)) E(`${pp}.minutes`, deleted ? 'Is null for a deleted period.' : 'Must be whole minutes.');
      if (p.drillId !== null && !isStr(p.drillId)) E(`${pp}.drillId`, 'Must be a drill id or null.');
      if (!Array.isArray(p.cards) || !p.cards.every((c) => isObj(c) && isStr(c.cardId) && (c.cardVersion === null || isInt(c.cardVersion, 1)))) E(`${pp}.cards`, 'Must be a list of {cardId, cardVersion}.');
      for (const k of ['objective', 'callLabel']) if (!isStr(p[k])) E(`${pp}.${k}`, 'Must be text.');
    });
    const stepPeriods = new Set();
    if (!Array.isArray(doc.steps)) E('steps', 'Must be a list.');
    else doc.steps.forEach((st, i) => {
      const sp = `steps[${i}]`;
      if (!isObj(st)) return E(sp, 'Must be an object.');
      if (st.index !== i) E(`${sp}.index`, 'Must be the step’s position.');
      if (!isStr(st.title)) E(`${sp}.title`, 'Must be text.');
      if (!Array.isArray(st.periodIds) || !st.periodIds.length || !st.periodIds.every((id) => isStr(id) && known.has(id))) E(`${sp}.periodIds`, 'Must list one or more periods that appear in periods[].');
      else if (st.periodIds.some((id) => stepPeriods.has(id))) E(`${sp}.periodIds`, 'A period is practised in one step only.');
      else st.periodIds.forEach((id) => stepPeriods.add(id));
      for (const k of ['originalSec', 'plannedSec', 'extensionSec']) if (!isInt(st[k])) E(`${sp}.${k}`, 'Must be whole seconds, 0 or more.');
      if (!isMs(st.ranMs)) E(`${sp}.ranMs`, 'Must be 0 or more milliseconds.');
      if (!OUTCOMES.includes(st.outcome)) E(`${sp}.outcome`, `Must be one of ${OUTCOMES.join(', ')}.`);
    });
    if (!Array.isArray(doc.disruptions)) E('disruptions', 'Must be a list.');
    else doc.disruptions.forEach((c, i) => {
      if (!isObj(c) || !isTime(c.at) || !REVISION_KINDS.includes(c.kind) || !isStr(c.summary)) E(`disruptions[${i}]`, `Must be {at, kind: ${REVISION_KINDS.join('|')}, summary}.`);
    });
    if (!isObj(doc.debrief) || !isStr(doc.debrief.notes) || doc.debrief.notes.length > RECORD_LIMITS.notes) E('debrief.notes', `Must be text of at most ${RECORD_LIMITS.notes} characters.`);
    const itemIds = new Set();
    if (!Array.isArray(doc.unfinished)) E('unfinished', 'Must be a list.');
    else doc.unfinished.forEach((u, i) => {
      const up = `unfinished[${i}]`;
      if (!isObj(u)) return E(up, 'Must be an object.');
      if (!isStr(u.id) || !u.id) E(`${up}.id`, 'Must be non-empty text.');
      else if (itemIds.has(u.id)) E(`${up}.id`, `Item id “${u.id}” is used twice.`);
      else itemIds.add(u.id);
      if (!isStr(u.periodId) || !known.has(u.periodId)) E(`${up}.periodId`, 'Must name a period that appears in periods[].');
      if (!isStr(u.title)) E(`${up}.title`, 'Must be text.');
      if (!isInt(u.plannedSec)) E(`${up}.plannedSec`, 'Must be whole seconds, 0 or more.');
      if (!isMs(u.ranMs)) E(`${up}.ranMs`, 'Must be 0 or more milliseconds.');
      if (!WORK_REASONS.includes(u.reason)) E(`${up}.reason`, `Must be one of ${WORK_REASONS.join(', ')}.`);
      if (u.carriedTo !== null && !(isObj(u.carriedTo) && isStr(u.carriedTo.dayId) && isStr(u.carriedTo.periodId))) E(`${up}.carriedTo`, 'Must be null or {dayId, periodId}.');
    });
  } catch (e) {
    E('', `Malformed practice debrief: ${e && e.message ? e.message : String(e)}`);
  }
  return { ok: errors.length === 0, errors };
}
