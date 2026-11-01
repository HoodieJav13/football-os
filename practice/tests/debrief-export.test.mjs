// Frozen producer contract for the Coaching flagship: one saved practice
// debrief as a small versioned document (practice-week-planner.practice-debrief
// v1) with what was actually practised, the disruptions, the coach's debrief,
// unfinished work, and the source ids and revisions it came from.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, applyAction } from '../src/domain/clock.js';
import { proposeRebalance, proposeStation, buildRecord, carryOver } from '../src/domain/disruption.js';
import { DEBRIEF_SCHEMA, DEBRIEF_SCHEMA_VERSION, exportPracticeDebrief, parsePracticeDebrief, validatePracticeDebrief } from '../src/domain/debrief-export.js';
import { generateFixture } from '../src/domain/fixtures.js';
import { updatePeriod } from '../src/domain/week.js';
import { env, loadLibrary, seqIds } from './helpers.mjs';

const MIN = 60_000;
const WALL = 1_800_000_000_000;
function act(s, type, mono, extra = {}) {
  const r = applyAction(s, { type, rev: s.rev, ...extra }, env(mono));
  assert.equal(r.ok, true, `${type}: ${r.error}`);
  return r.session;
}

// Wednesday (parallel stations): late warm-up, rebalance with one period
// deferred, a station run later, finished, debriefed and one item carried.
function practisedProject() {
  const p = generateFixture({ seed: 42, scenario: 'example', library: loadLibrary() });
  const d = p.week.days[2];
  let s = createSession({ id: 'clk-w', day: d });
  s = act(s, 'start', 0);
  const defer = s.steps.findIndex((x) => /Situations/.test(x.title));
  s = act(s, 'revise', 16 * MIN, { change: proposeRebalance(s, env(16 * MIN), { minutesLeft: 80, mode: 'fit', deferIndexes: [defer] }).change });
  let t = 16 * MIN;
  s = act(s, 'next', t);
  while (s.steps[s.index].periodIds.length === 1) { t += s.steps[s.index].plannedSec * 1000; s = act(s, 'next', t); }
  s = act(s, 'revise', t + MIN, { change: proposeStation(s, env(t + MIN), s.steps[s.index].periodIds[1], 'later').change });
  while (s.state !== 'completed') { t += s.steps[s.index].plannedSec * 1000; s = act(s, 'next', t); }
  const rec = buildRecord(s, d, { id: 'rec-1', notes: 'Fictional debrief: stations needed more space.', wall: WALL });
  const carried = carryOver({ ...p, records: [rec] }, 'rec-1', rec.unfinished[0].id, p.week.days[3].id, seqIds('per')).project;
  return { p: carried, d, s };
}

test('a saved debrief exports as a small versioned document that validates', () => {
  const { p } = practisedProject();
  const doc = exportPracticeDebrief(p, 'rec-1', { wall: WALL + 1 });
  assert.equal(doc.schema, DEBRIEF_SCHEMA);
  assert.equal(doc.schema, 'practice-week-planner.practice-debrief');
  assert.equal(doc.schemaVersion, DEBRIEF_SCHEMA_VERSION);
  assert.equal(doc.schemaVersion, 1);
  assert.equal(doc.fictional, true);
  assert.match(doc.notice, /no doctrine/i);
  assert.deepEqual(validatePracticeDebrief(doc), { ok: true, errors: [] });
});

test('provenance: project, week, day, clock session and record ids and revisions', () => {
  const { p, d, s } = practisedProject();
  const doc = exportPracticeDebrief(p, 'rec-1', { wall: WALL + 1 });
  assert.deepEqual(doc.source, {
    projectId: p.project.id, projectRev: p.project.rev, weekId: p.week.id, weekVersion: p.week.version,
    dayId: d.id, dayLabel: d.label, dayVersionAtPractice: s.dayVersion, dayVersionNow: d.version,
    sessionId: 'clk-w', recordId: 'rec-1', recordSavedWall: WALL, startedWall: s.startedWall, endedWall: s.endedWall, state: 'completed',
  });
  assert.equal(doc.producer.app, 'practice-week-planner');
  assert.equal(doc.producer.projectSchema, 'practice-week-planner.project');
  assert.equal(doc.producer.projectSchemaVersion, 1);
  assert.equal(doc.exportedWall, WALL + 1);
});

test('what was practised: every step with its outcome, linked to source periods, drills and card versions', () => {
  const { p, d } = practisedProject();
  const doc = exportPracticeDebrief(p, 'rec-1', { wall: WALL + 1 });
  const outcomes = new Set(doc.steps.map((x) => x.outcome));
  assert.ok(outcomes.has('shortened') && outcomes.has('completed'));
  const ids = new Set(doc.periods.map((x) => x.periodId));
  for (const st of doc.steps) for (const id of st.periodIds) assert.ok(ids.has(id), id);
  for (const u of doc.unfinished) assert.ok(ids.has(u.periodId), u.periodId);
  const withDrill = doc.periods.find((x) => x.drillId);
  const src = d.periods.find((x) => x.id === withDrill.periodId);
  assert.equal(withDrill.drillId, src.drillId);
  assert.deepEqual(withDrill.cards.map((c) => c.cardId), src.cardIds);
  for (const c of withDrill.cards) assert.equal(c.cardVersion, p.cards.find((x) => x.id === c.cardId).version);
  assert.ok(doc.periods.every((x) => x.asOf === 'export'));
});

test('disruptions, debrief notes and unfinished work (with where it was carried) are carried over exactly', () => {
  const { p } = practisedProject();
  const rec = p.records[0];
  const doc = exportPracticeDebrief(p, 'rec-1', { wall: WALL + 1 });
  assert.deepEqual(doc.disruptions, rec.changes);
  assert.equal(doc.disruptions.length, 2);
  assert.deepEqual(doc.debrief, { notes: rec.notes });
  assert.deepEqual(doc.unfinished, rec.unfinished);
  assert.ok(doc.unfinished[0].carriedTo, 'carried item keeps its destination');
});

test('round trip: the exported text parses back to the same document; export is deterministic and pure', () => {
  const { p } = practisedProject();
  const before = JSON.stringify(p);
  const doc = exportPracticeDebrief(p, 'rec-1', { wall: WALL + 1 });
  assert.equal(JSON.stringify(p), before, 'the project is not changed');
  const text = JSON.stringify(doc, null, 2);
  const back = parsePracticeDebrief(text);
  assert.equal(back.ok, true, JSON.stringify(back.errors));
  assert.deepEqual(back.doc, doc);
  assert.deepEqual(exportPracticeDebrief(p, 'rec-1', { wall: WALL + 1 }), doc);
});

test('version: newer or unknown documents are refused, never guessed', () => {
  const { p } = practisedProject();
  const doc = exportPracticeDebrief(p, 'rec-1', { wall: WALL + 1 });
  const newer = parsePracticeDebrief(JSON.stringify({ ...doc, schemaVersion: 2 }));
  assert.equal(newer.ok, false);
  assert.match(newer.errors[0].message, /version 2/);
  assert.equal(parsePracticeDebrief(JSON.stringify({ ...doc, schema: 'practice-week-planner.project' })).ok, false);
  assert.equal(parsePracticeDebrief(JSON.stringify({ ...doc, schemaVersion: '1' })).ok, false);
});

test('refusal: malformed documents name the field and are never half-read', () => {
  const { p } = practisedProject();
  const doc = exportPracticeDebrief(p, 'rec-1', { wall: WALL + 1 });
  const bad = (mutate) => { const x = structuredClone(doc); mutate(x); return validatePracticeDebrief(x); };
  const paths = (r) => r.errors.map((e) => e.path);
  assert.deepEqual(parsePracticeDebrief('{not json').ok, false);
  assert.deepEqual(validatePracticeDebrief(null).ok, false);
  assert.ok(paths(bad((x) => { x.fictional = false; })).includes('fictional'));
  assert.ok(paths(bad((x) => { delete x.source.recordId; })).includes('source.recordId'));
  assert.ok(paths(bad((x) => { x.steps[0].outcome = 'mastered'; })).includes('steps[0].outcome'));
  assert.ok(paths(bad((x) => { x.steps[0].ranMs = -1; })).includes('steps[0].ranMs'));
  assert.ok(paths(bad((x) => { x.unfinished[0].reason = 'vanished'; })).includes('unfinished[0].reason'));
  assert.ok(paths(bad((x) => { x.unfinished[0].periodId = 'nowhere'; })).includes('unfinished[0].periodId'));
  assert.ok(paths(bad((x) => { x.steps[1].periodIds = ['nowhere']; })).includes('steps[1].periodIds'));
  assert.ok(paths(bad((x) => { x.periods.push({ ...x.periods[0] }); })).some((q) => /^periods\[\d+\]\.periodId$/.test(q)));
  assert.ok(paths(bad((x) => { x.debrief.notes = 7; })).includes('debrief.notes'));
  assert.ok(paths(bad((x) => { x.rating = 5; })).includes('rating'), 'unknown top-level fields are refused (no smuggled scores)');
});

test('the export reports plan changes since practice and periods deleted since', () => {
  const { p, d } = practisedProject();
  const edited = { ...p, week: updatePeriod(p.week, d.id, d.periods[0].id, { title: 'Warm-up (renamed)' }) };
  const doc = exportPracticeDebrief(edited, 'rec-1', { wall: WALL + 1 });
  assert.equal(doc.source.dayVersionAtPractice, 1);
  assert.equal(doc.source.dayVersionNow, 2);
  assert.equal(doc.steps[0].title, 'Warm-up', 'step titles are as practised');
  assert.equal(doc.periods.find((x) => x.periodId === d.periods[0].id).title, 'Warm-up (renamed)', 'period details are as of export');
  const gone = { ...p, week: { ...p.week, days: p.week.days.map((x) => (x.id === d.id ? { ...x, periods: x.periods.slice(1) } : x)) } };
  const doc2 = exportPracticeDebrief(gone, 'rec-1', { wall: WALL + 1 });
  const missing = doc2.periods.find((x) => x.periodId === d.periods[0].id);
  assert.equal(missing.missing, true);
  assert.equal(missing.asOf, 'deleted');
  assert.deepEqual(validatePracticeDebrief(doc2).ok, true);
});

test('an unknown record is an error, not an empty document', () => {
  const { p } = practisedProject();
  assert.match(exportPracticeDebrief(p, 'nope', { wall: 1 }).error, /not saved/);
});

test('the producer never hands out a document its own validator refuses', () => {
  const { p } = practisedProject();
  for (const [what, mutate] of [
    ['disruptions[0]', (r) => { r.changes[0].kind = 'note'; }],
    ['steps[0].periodIds', (r) => { r.steps[0].periodIds = []; }],
    ['source.dayLabel', (r) => { r.dayLabel = ''; }],
    ['unfinished[0].id', (r) => { r.unfinished[0].id = ''; }],
  ]) {
    const q = structuredClone(p);
    mutate(q.records[0]);
    const out = exportPracticeDebrief(q, 'rec-1', { wall: WALL + 1 });
    assert.ok(out.error, `${what}: refused instead of exported`);
    assert.ok(out.errors.some((e) => e.path === what), `${what}: ${JSON.stringify(out.errors)}`);
  }
});

test('the validator ties asOf to missing and refuses a period named in two steps', () => {
  const { p } = practisedProject();
  const doc = exportPracticeDebrief(p, 'rec-1', { wall: WALL + 1 });
  const bad = (mutate) => { const x = structuredClone(doc); mutate(x); return validatePracticeDebrief(x).errors.map((e) => e.path); };
  assert.ok(bad((x) => { x.periods[0].missing = true; }).includes('periods[0].missing'));
  assert.ok(bad((x) => { x.periods[0].minutes = null; }).includes('periods[0].minutes'));
  assert.ok(bad((x) => { x.steps[1].periodIds = x.steps[0].periodIds.slice(); }).includes('steps[1].periodIds'));
});
