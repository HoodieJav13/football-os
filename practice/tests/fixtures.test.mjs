// Deterministic fictional generator and its stress scenarios.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateFixture, SCENARIOS, FIXTURE_SEEDS } from '../src/domain/fixtures.js';
import { computeSchedule } from '../src/domain/week.js';
import { generateRotation, validateRotation } from '../src/domain/rotation.js';
import { loadLibrary } from './helpers.mjs';

const lib = loadLibrary();
const gen = (seed, scenario) => generateFixture({ seed, scenario, library: lib });
const ALLOWED_PARTICIPANT_KEYS = ['id', 'label', 'roleKeys', 'groupIds', 'unavailable'];

test('the library has at least eight drills and five editable day templates', () => {
  assert.ok(lib.drills.length >= 8);
  assert.equal(lib.templates.length, 5);
  for (const d of lib.drills) {
    for (const k of ['id', 'title', 'objective', 'setup', 'steps', 'cues', 'tags', 'equipment']) assert.ok(k in d, `${d.id} has ${k}`);
    assert.ok(d.cues.every((c) => /reference/i.test(c)), `${d.id} cues are labelled reference`);
  }
});

test('same seed and scenario give identical projects; different seeds differ', () => {
  for (const scenario of SCENARIOS) assert.deepEqual(gen(7, scenario), gen(7, scenario), scenario);
  assert.notDeepEqual(gen(1, 'normal').participants, gen(2027, 'normal').participants);
  assert.deepEqual(FIXTURE_SEEDS, [1, 7, 42, 2027]);
});

test('the example week is fictional, Monday to Friday, and every day has periods', () => {
  const p = gen(42, 'example');
  assert.equal(p.project.fictional, true);
  assert.match(p.week.opponentLabel, /fictional/i);
  assert.equal(p.week.days.length, 5);
  assert.match(p.week.days[0].label, /mon/i);
  assert.match(p.week.days[4].label, /fri/i);
  for (const d of p.week.days) assert.ok(d.periods.length > 0, d.label);
  assert.ok(p.cards.length >= 8);
  assert.ok(p.week.days.some((d) => d.periods.some((x) => x.cardIds.length && x.groupIds.length && x.drillId)));
});

test('participants are obviously synthetic and carry no health or identity fields', () => {
  for (const scenario of SCENARIOS) {
    for (const p of gen(42, scenario).participants) {
      assert.match(p.label, /fict/i);
      for (const k of Object.keys(p)) assert.ok(ALLOWED_PARTICIPANT_KEYS.includes(k), `${scenario}: unexpected key ${k}`);
    }
  }
});

test('stress: "thin" produces at least one honest shortage', () => {
  const p = gen(7, 'thin');
  let shortages = 0;
  for (const d of p.week.days) {
    const r = generateRotation({ day: d, groups: p.groups, participants: p.participants, seed: 7 });
    shortages += r.warnings.filter((w) => w.type === 'shortage').length;
  }
  assert.ok(shortages > 0);
});

test('stress: "unavailable" marks one person out for one period and generation honours it', () => {
  const p = gen(7, 'unavailable');
  const out = p.participants.filter((x) => x.unavailable.length);
  assert.equal(out.length, 1);
  assert.equal(out[0].unavailable.length, 1);
  const { dayId, periodId } = out[0].unavailable[0];
  assert.ok(periodId);
  const d = p.week.days.find((x) => x.id === dayId);
  const r = generateRotation({ day: d, groups: p.groups, participants: p.participants, seed: 3 });
  const inThat = r.entries.filter((e) => e.periodId === periodId).flatMap((e) => e.slots.map((s) => s.participantId));
  assert.ok(!inThat.includes(out[0].id));
});

test('stress: "shared-group" has two overlapping periods sharing a group', () => {
  const p = gen(7, 'shared-group');
  assert.ok(p.week.days.some((d) => computeSchedule(d).warnings.some((w) => w.type === 'group-overlap')));
});

test('stress: "locks" ships locked slots that survive regeneration', () => {
  const p = gen(7, 'locks');
  const [dayId, rot] = Object.entries(p.rotations)[0];
  const locked = rot.entries.flatMap((e) => e.slots.map((s) => ({ ...s, periodId: e.periodId }))).filter((s) => s.locked);
  assert.ok(locked.length >= 2);
  const d = p.week.days.find((x) => x.id === dayId);
  const again = generateRotation({ day: d, groups: p.groups, participants: p.participants, previous: rot, seed: 999 });
  for (const s of locked) {
    const e = again.entries.find((x) => x.periodId === s.periodId && x.slots.some((y) => y.slotId === s.slotId));
    assert.equal(e.slots.find((y) => y.slotId === s.slotId).participantId, s.participantId);
  }
});

test('stress: "renamed" changes a label only; ids and assignments match "normal"', () => {
  const a = gen(7, 'normal');
  const b = gen(7, 'renamed');
  assert.deepEqual(a.participants.map((x) => x.id), b.participants.map((x) => x.id));
  const changed = b.participants.filter((x, i) => x.label !== a.participants[i].label);
  assert.equal(changed.length, 1);
  assert.match(changed[0].label, /renamed/i);
  const d = a.week.days[1];
  const ra = generateRotation({ day: d, groups: a.groups, participants: a.participants, seed: 5 });
  const rb = generateRotation({ day: d, groups: b.groups, participants: b.participants, seed: 5 });
  assert.deepEqual(ra.entries, rb.entries);
  assert.equal(validateRotation({ day: d, groups: b.groups, participants: b.participants, rotation: ra }).warnings.filter((w) => w.severity === 'error').length, 0);
});
