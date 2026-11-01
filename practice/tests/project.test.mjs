// Project export/import, validation errors and storage failure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportProject, importProject, validateProject, pruneReferences, SCHEMA, SCHEMA_VERSION } from '../src/domain/project.js';
import { generateFixture } from '../src/domain/fixtures.js';
import { generateRotation } from '../src/domain/rotation.js';
import { createSession, applyAction } from '../src/domain/clock.js';
import { createStorage } from '../src/persist/storage.js';
import { loadLibrary, env } from './helpers.mjs';

const lib = loadLibrary();
const fresh = () => generateFixture({ seed: 42, scenario: 'example', library: lib });

function withRotationAndClock() {
  const p = fresh();
  const d = p.week.days[1];
  p.rotations[d.id] = generateRotation({ day: d, groups: p.groups, participants: p.participants, seed: 11 });
  let c = createSession({ id: 'clk-test', day: d });
  c = applyAction(c, { type: 'start', rev: c.rev }, env(0)).session;
  c = applyAction(c, { type: 'next', rev: c.rev }, env(60_000)).session;
  return { project: p, clock: c };
}

test('round trip: export then import gives the same project, ids, rotation and clock', () => {
  const { project, clock } = withRotationAndClock();
  const text = exportProject(project, clock);
  const parsed = JSON.parse(text);
  assert.equal(parsed.schema, SCHEMA);
  assert.equal(parsed.schemaVersion, SCHEMA_VERSION);
  const r = importProject(text);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.project, project);
  assert.deepEqual(r.clock, clock);
  assert.equal(exportProject(r.project, r.clock), text, 'export is byte-stable');
});

test('invalid JSON gives a clear error', () => {
  const r = importProject('{"schema": "practice-week-planner.project", ');
  assert.equal(r.ok, false);
  assert.match(r.errors[0].message, /not valid JSON/i);
});

test('a file from another app is rejected', () => {
  const r = importProject(JSON.stringify({ schema: 'something-else', schemaVersion: 1 }));
  assert.equal(r.ok, false);
  assert.match(r.errors[0].message, /not a Practice Week Planner project/i);
});

test('a newer schema version is unsupported, not guessed at', () => {
  const doc = JSON.parse(exportProject(fresh(), null));
  doc.schemaVersion = 2;
  const r = importProject(JSON.stringify(doc));
  assert.equal(r.ok, false);
  assert.match(r.errors[0].message, /unsupported schema version 2/i);
});

test('a missing or non-integer schema version is malformed', () => {
  const doc = JSON.parse(exportProject(fresh(), null));
  delete doc.schemaVersion;
  assert.match(importProject(JSON.stringify(doc)).errors[0].message, /schemaVersion/);
  doc.schemaVersion = '1';
  assert.match(importProject(JSON.stringify(doc)).errors[0].message, /schemaVersion/);
});

test('duplicate ids are rejected and named', () => {
  const doc = JSON.parse(exportProject(fresh(), null));
  doc.week.days[1].periods[0].id = doc.week.days[0].periods[0].id;
  const r = importProject(JSON.stringify(doc));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /duplicate id/i.test(e.message) && e.message.includes(doc.week.days[0].periods[0].id)));
});

test('unknown references are rejected with their path', () => {
  const doc = JSON.parse(exportProject(fresh(), null));
  doc.week.days[0].periods[0].cardIds = ['card-does-not-exist'];
  doc.participants[0].groupIds = ['grp-missing'];
  const r = importProject(JSON.stringify(doc));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.path === 'week.days[0].periods[0].cardIds[0]' && /unknown card/i.test(e.message)));
  assert.ok(r.errors.some((e) => /unknown group/i.test(e.message)));
});

test('a rotation naming an unknown participant is rejected', () => {
  const { project, clock } = withRotationAndClock();
  const doc = JSON.parse(exportProject(project, clock));
  const dayId = Object.keys(doc.rotations)[0];
  const slot = doc.rotations[dayId].entries.flatMap((e) => e.slots).find((s) => s.participantId);
  slot.participantId = 'ppl-ghost';
  const r = importProject(JSON.stringify(doc));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /unknown participant/i.test(e.message)));
});

test('a clock for an unknown day is rejected', () => {
  const { project, clock } = withRotationAndClock();
  const doc = JSON.parse(exportProject(project, clock));
  doc.clock.dayId = 'day-nope';
  assert.ok(importProject(JSON.stringify(doc)).errors.some((e) => /clock.*unknown day/i.test(e.message)));
});

test('participants may not carry health or real-identity fields', () => {
  const doc = JSON.parse(exportProject(fresh(), null));
  doc.participants[0].injury = 'x';
  const r = importProject(JSON.stringify(doc));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /participants\[0\]/.test(e.path) && /not allowed/i.test(e.message)));
});

test('participant labels must stay obviously fictional', () => {
  const doc = JSON.parse(exportProject(fresh(), null));
  doc.participants[0].label = 'Jordan Smith';
  const r = importProject(JSON.stringify(doc));
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /participants\[0\]/.test(e.path) && /fict/i.test(e.message)));
});

test('unknown top-level fields are reported as warnings and dropped', () => {
  const doc = JSON.parse(exportProject(fresh(), null));
  doc.futureThing = { a: 1 };
  const r = importProject(JSON.stringify(doc));
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => /futureThing/.test(w)));
  assert.equal('futureThing' in r.project, false);
});

test('every fixture scenario validates', () => {
  for (const scenario of ['example', 'normal', 'thin', 'unavailable', 'shared-group', 'locks', 'renamed']) {
    for (const seed of [1, 7, 42, 2027]) {
      const v = validateProject(generateFixture({ seed, scenario, library: lib }));
      assert.deepEqual(v.errors, [], `${scenario}/${seed}`);
    }
  }
});

test('pruneReferences removes dangling references left by deletes and keeps the rest', () => {
  const { project } = withRotationAndClock();
  const d0 = project.week.days[0];
  const d1 = project.week.days[1];
  const card = project.cards[0];
  const p = structuredClone(project);
  p.participants[0].unavailable = [{ dayId: 'day-gone', periodId: null }, { dayId: d1.id, periodId: d1.periods[0].id }, { dayId: d1.id, periodId: 'per-gone' }];
  p.cards = p.cards.filter((c) => c.id !== card.id);
  p.week.days = p.week.days.filter((d) => d.id !== d0.id);
  p.rotations[d0.id] = { ...p.rotations[d1.id], dayId: d0.id };
  p.rotations[d1.id].entries[0].periodId = 'per-gone';
  const r = pruneReferences(p);
  assert.deepEqual(r.participants[0].unavailable, [{ dayId: d1.id, periodId: d1.periods[0].id }]);
  assert.ok(r.week.days.every((d) => d.periods.every((x) => !x.cardIds.includes(card.id))));
  assert.equal(d0.id in r.rotations, false);
  assert.ok(r.rotations[d1.id].entries.every((e) => e.periodId !== 'per-gone'));
  assert.deepEqual(validateProject(r).errors, []);
});

// --- storage adapter -------------------------------------------------------
function memoryBackend() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}

test('storage: write and read back', () => {
  const b = memoryBackend();
  const st = createStorage(() => b);
  assert.deepEqual(st.write('k', { a: 1 }), { ok: true });
  assert.deepEqual(st.read('k'), { ok: true, value: { a: 1 } });
  assert.deepEqual(st.read('missing'), { ok: true, value: null });
});

test('storage: a quota error is reported and nothing throws', () => {
  const b = memoryBackend();
  b.setItem = () => { const e = new Error('The quota has been exceeded.'); e.name = 'QuotaExceededError'; throw e; };
  const st = createStorage(() => b);
  const r = st.write('k', { big: 'x' });
  assert.equal(r.ok, false);
  assert.match(r.error, /quota/i);
});

test('storage: a blocked backend (SecurityError on access) is reported', () => {
  const st = createStorage(() => { const e = new Error('denied'); e.name = 'SecurityError'; throw e; });
  assert.equal(st.read('k').ok, false);
  assert.match(st.write('k', 1).error, /unavailable|denied/i);
});

test('storage: corrupt saved JSON is reported, not thrown', () => {
  const b = memoryBackend();
  b.setItem('k', '{oops');
  const r = createStorage(() => b).read('k');
  assert.equal(r.ok, false);
  assert.match(r.error, /corrupt/i);
});
