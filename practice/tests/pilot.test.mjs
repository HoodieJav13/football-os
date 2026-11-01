// Practice Pilot: preset proposals, honest refusals, exact time, equipment and
// participant capacity, apply-as-new-day, shorter independent copies, and
// compatibility with editing, export/import and the practice clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PILOT_PRESETS, presetById, requiredEquipment, allocateMinutes, proposePlan, applyProposal,
  proposeShortened, applyShortened, NOT_INTERPRETED, SHORTEN_FLOOR_MIN, BREAK_FROM_MIN, SCOUT_OFFENSE_PINNIES,
} from '../src/domain/pilot.js';
import { computeSchedule, updatePeriod, movePeriod, deletePeriod, addPeriod, newPeriod, validatePeriod, validateDay } from '../src/domain/week.js';
import { exportProject, importProject, validateProject, validateClockFor } from '../src/domain/project.js';
import { createSession, applyAction, buildSteps } from '../src/domain/clock.js';
import { proposeRebalance } from '../src/domain/disruption.js';
import { generateRotation, validateRotation } from '../src/domain/rotation.js';
import { generateFixture } from '../src/domain/fixtures.js';
import { loadLibrary, period, day, week, env } from './helpers.mjs';

const lib = loadLibrary();
// Id factories that never collide with each other: per-<tag>1, day-<tag>2, ...
const mk = (tag) => { let n = 0; return (kind = 'id') => `${kind}-${tag}${++n}`; };
const fresh = () => generateFixture({ seed: 42, scenario: 'example', library: lib });

const FULL_KIT = [
  { name: 'Cones', quantity: 24 }, { name: 'Pinnies', quantity: 2 }, { name: 'Scout pinnies', quantity: 10 }, { name: 'Footballs', quantity: 8 },
  { name: 'Hand shields', quantity: 0 }, { name: 'Scout cards', quantity: 1 }, { name: 'Scout card stack', quantity: 1 },
  { name: 'Whiteboard', quantity: 1 }, { name: 'Down markers', quantity: 1 }, { name: 'Call board', quantity: 1 }, { name: 'Bags', quantity: 4 },
];
const kit = (over = {}) => FULL_KIT.map((e) => ({ ...e, quantity: over[e.name] ?? e.quantity })).concat(Object.entries(over).filter(([n]) => !FULL_KIT.some((e) => e.name === n)).map(([name, quantity]) => ({ name, quantity })));
const input = (extra = {}) => ({ presetId: 'pursuit-takeaway', objectiveText: '', totalMinutes: 75, participants: 18, startMin: 930, stations: 'auto', equipment: kit(), ...extra });
// Used as an assert message, which is built even when the result is a success (no errors list).
const errorsText = (r) => (Array.isArray(r?.errors) ? r.errors.join(' | ') : '(no errors listed)');
const items = (r) => r.schedule.items;

// ---------------------------------------------------------------- catalogue
test('the offline catalogue is small, fixed and uses only library drills', () => {
  const drillIds = new Set(lib.drills.map((d) => d.id));
  assert.equal(new Set(PILOT_PRESETS.map((p) => p.id)).size, PILOT_PRESETS.length, 'unique preset ids');
  for (const p of PILOT_PRESETS) {
    for (const b of p.blocks) {
      for (const x of b.kind === 'stations' ? b.stations : [b]) if (x.drillId) assert.ok(drillIds.has(x.drillId), `${p.id}: ${x.drillId} is a library drill`);
      if (b.kind === 'stations') assert.ok(b.minStations >= 2 && b.stations.length <= 4);
    }
    for (const n of requiredEquipment(p)) assert.ok(n.name.length <= 40 && n.uses.every((u) => Number.isInteger(u.qty) && u.qty > 0));
  }
  assert.match(presetById('general').label, /does not use your objective/i, 'the generic preset says it ignores the objective');
  assert.equal(presetById('nope'), null);
});

// Library drill equipment, normalized to the catalogue's item names. A library
// item without a number counts as 1 (a deck of scout cards, one call board).
const LIB_NAME = { pinnie: 'pinnies', 'pinnies (scout)': 'scout pinnies', 'landmark cones': 'cones', 'cone for the passer': 'cones', 'scout card stack': 'scout card stack' };
function libraryNeeds(drill) {
  return drill.equipment.map((text) => {
    const m = /^(.*?)\s*\((\d+)\)\s*$/.exec(text);
    const raw = (m ? m[1] : text).trim().toLowerCase();
    return { text, name: LIB_NAME[raw] ?? LIB_NAME[text.toLowerCase()] ?? raw, qty: m ? Number(m[2]) : 1 };
  });
}

test('every period linked to a library drill requires that drill’s equipment (catalogue vs. library)', () => {
  const drills = new Map(lib.drills.map((d) => [d.id, d]));
  let linked = 0;
  for (const p of PILOT_PRESETS) {
    for (const b of p.blocks) {
      for (const x of b.kind === 'stations' ? b.stations : b.kind === 'single' ? [b] : []) {
        if (!x.drillId) continue;
        linked++;
        const have = new Map(x.equipment.map((e) => [e.name.toLowerCase(), e.qty]));
        for (const n of libraryNeeds(drills.get(x.drillId))) {
          assert.ok(have.has(n.name), `${p.id} “${x.title}”: library drill ${x.drillId} needs “${n.text}”, the preset does not require ${n.name}`);
          assert.ok(have.get(n.name) >= n.qty, `${p.id} “${x.title}”: ${n.name} ${have.get(n.name)} < library ${n.qty}`);
        }
      }
    }
  }
  assert.ok(linked >= 10, `checked ${linked} linked periods`);
});

test('regression: Situations needs scout cards (2-station coverage case) and stores them', () => {
  const needs = requiredEquipment(presetById('coverage-rush'));
  const all = (scoutCards) => needs.map((x) => ({ name: x.name, quantity: x.name === 'Scout cards' ? scoutCards : 999 }));
  const missing = proposePlan({ presetId: 'coverage-rush', totalMinutes: 60, participants: 12, stations: 2, equipment: all(0) });
  assert.equal(missing.ok, false);
  assert.match(errorsText(missing), /Missing required equipment: Scout cards \(1 needed for “Situations: call-and-check”; you have none\)/);
  const ok = proposePlan({ presetId: 'coverage-rush', totalMinutes: 60, participants: 12, stations: 2, equipment: all(1) });
  assert.equal(ok.ok, true, errorsText(ok));
  assert.ok(ok.periods.find((x) => x.title === 'Situations: call-and-check').equipment.includes('Scout cards (1)'), 'stored on the period');
  const ra = proposePlan({ presetId: 'recognize-align', totalMinutes: 60, participants: 10, equipment: kit() });
  assert.equal(ra.ok, true, errorsText(ra));
  assert.ok(ra.periods.find((x) => x.title === 'Situations: call-and-check').equipment.includes('Scout cards (1)'));
  assert.match(errorsText(proposePlan({ presetId: 'recognize-align', totalMinutes: 60, participants: 10, equipment: kit({ 'Scout cards': 0 }) })), /Scout cards \(1 needed for “Alignment & assignment walkthrough”.*Scout cards \(1 needed for “Situations: call-and-check”/);
});

test('regression: every linked team-vs-scout period requires the stated scout pinnies count', () => {
  let linked = 0;
  for (const p of PILOT_PRESETS) {
    for (const b of p.blocks.filter((x) => x.kind === 'single' && x.drillId === 'drill-team-scout')) {
      linked++;
      assert.ok(b.equipment.some((e) => e.name === 'Scout pinnies' && e.qty === SCOUT_OFFENSE_PINNIES), `${p.id}: requires ${SCOUT_OFFENSE_PINNIES} scout pinnies`);
      assert.match(b.assumption, new RegExp(`counts ${SCOUT_OFFENSE_PINNIES} scout pinnies`), `${p.id}: the count is stated`);
    }
  }
  assert.ok(linked >= 1);
  const none = proposePlan(input({ equipment: kit({ 'Scout pinnies': 0 }) }));
  assert.equal(none.ok, false);
  assert.match(errorsText(none), /Missing required equipment: Scout pinnies \(10 needed for “Team vs. scout look”; you have none\)/);
  const few = proposePlan(input({ equipment: kit({ 'Scout pinnies': 9 }) }));
  assert.match(errorsText(few), /Not enough Scout pinnies: 10 needed for “Team vs. scout look”; you have 9/);
  const ok = proposePlan(input());
  assert.equal(ok.ok, true, errorsText(ok));
  assert.ok(ok.periods.find((x) => x.title === 'Team vs. scout look').equipment.includes('Scout pinnies (10)'), 'stored on the period');
  assert.ok(ok.assumptions.some((a) => /counts 10 scout pinnies/.test(a)), 'the proposal states the count');
  // The station's single ball-carrier pinnie is a different item and is not satisfied by scout pinnies.
  assert.match(errorsText(proposePlan(input({ stations: 2, equipment: kit({ Pinnies: 0 }) }))), /Missing required equipment: Pinnies/);
});

test('allocateMinutes: minimums first, weights for the rest, exact total, units respected', () => {
  assert.deepEqual(allocateMinutes([{ weight: 1, min: 5, max: 20, mult: 1 }, { weight: 3, min: 10, max: 90, mult: 1 }], 35), [10, 25]);
  const a = allocateMinutes([{ weight: 1, min: 5, max: 20, mult: 1 }, { weight: 4, min: 12, max: 60, mult: 3 }, { weight: 2, min: 5, max: 60, mult: 1 }], 70);
  assert.equal(a.reduce((x, y) => x + y, 0), 70);
  assert.equal(a[1] % 3, 0, 'station block keeps whole equal rounds');
  assert.equal(allocateMinutes([{ weight: 1, min: 5, max: 5, mult: 1 }], 6), null, 'over every maximum: no split');
  assert.equal(allocateMinutes([{ weight: 1, min: 6, max: 9, mult: 3 }], 7), null, 'cannot be split exactly: no split');
});

// ---------------------------------------------------------------- valid proposal
test('valid supported objective: a transparent, exact, deterministic proposal', () => {
  const r = proposePlan(input({ objectiveText: 'Finish every rep at the ball (coach note)' }));
  assert.equal(r.ok, true, errorsText(r));
  assert.equal(r.interpreted, false);
  assert.equal(r.stationCount, 3, '4 stations need hand shields (0), so 3');
  assert.deepEqual(r.groupSizes, [6, 6, 6]);
  assert.equal(r.schedule.totalMin, 75);
  assert.equal(r.schedule.overByMin, 0);
  assert.deepEqual(r.schedule.warnings, []);
  // Warm-up, 3 rounds × 3 stations, water break, team period.
  assert.equal(r.periods.length, 1 + 9 + 1 + 1);
  assert.deepEqual(r.periods.map((p) => p.minutes), [11, 13, 13, 13, 13, 13, 13, 13, 13, 13, 5, 20]);
  assert.equal(new Set(items(r).map((i) => i.block)).size, 6, 'six blocks on the clock');
  assert.ok(r.periods[1].equipment.includes('Cones (8)') && r.periods[1].equipment.includes('Pinnies (1)'));
  assert.match(r.day.notes, /not interpreted/i);
  assert.ok(r.day.notes.includes('“Finish every rep at the ball (coach note)”'), 'objective kept verbatim');
  assert.ok(r.assumptions.some((a) => /4 stations not used: .*Hand shields/.test(a)), 'says why not 4 stations');
  assert.ok(r.assumptions.some((a) => /counted together/.test(a)));
  assert.ok(r.checks.some((c) => /Cones 20 of 24/.test(c)), 'busiest moment for cones: 8 + 6 + 6');
  assert.deepEqual(proposePlan(input({ objectiveText: 'Finish every rep at the ball (coach note)' })), r, 'same inputs, same proposal');
  for (const p of r.periods) assert.deepEqual(validatePeriod({ id: 'x', ...p }).errors, []);
  assert.deepEqual(validateDay({ id: 'x', version: 1, periods: [], ...r.day }).errors, []);
});

test('station rotation: every group meets every station once, rounds are equal parallel blocks', () => {
  for (const P of [6, 7, 11, 18, 19, 40]) {
    const r = proposePlan(input({ participants: P, equipment: kit({ 'Hand shields': 4, Cones: 40, Footballs: 20 }) }));
    assert.equal(r.ok, true, `${P}: ${errorsText(r)}`);
    const k = r.stationCount;
    const st = r.periods.filter((p) => p.station);
    assert.equal(st.length, k * k);
    assert.equal(r.groupSizes.reduce((a, b) => a + b, 0), P);
    assert.ok(Math.max(...r.groupSizes) - Math.min(...r.groupSizes) <= 1, 'groups differ by at most one');
    for (let round = 1; round <= k; round++) {
      const inRound = st.filter((p) => p.round === round);
      assert.deepEqual(inRound.map((p) => p.group).sort(), Array.from({ length: k }, (_, i) => i + 1), `round ${round}: each group once`);
      assert.equal(new Set(inRound.map((p) => p.minutes)).size, 1, 'stations in a round are equal');
      assert.deepEqual(inRound.map((p) => p.parallel), inRound.map((_, i) => i > 0), 'first station starts the block, the rest run beside it');
    }
    for (let g = 1; g <= k; g++) assert.equal(new Set(st.filter((p) => p.group === g).map((p) => p.station)).size, k, `group ${g} visits every station`);
  }
});

test('exact duration for every preset across its whole range of minutes', () => {
  const big = kit({ 'Hand shields': 8, Cones: 99, Footballs: 99, Bags: 9, Pinnies: 9 });
  for (const preset of PILOT_PRESETS) {
    let okCount = 0;
    for (let T = 10; T <= 360; T++) {
      const r = proposePlan({ presetId: preset.id, totalMinutes: T, participants: 30, startMin: 900, equipment: big });
      if (!r.ok) {
        assert.equal(r.status, 'rejected');
        assert.match(errorsText(r), /at least|at most|cannot be split/, `${preset.id} ${T}: ${errorsText(r)}`);
        continue;
      }
      okCount++;
      assert.equal(r.schedule.totalMin, T, `${preset.id} ${T}`);
      assert.deepEqual(r.schedule.warnings, []);
      assert.ok(r.periods.every((p) => Number.isInteger(p.minutes) && p.minutes >= 1 && p.minutes <= 240));
      assert.equal(r.periods.some((p) => p.category === 'break'), T >= BREAK_FROM_MIN);
      assert.ok(r.equipmentPeak.every((e) => e.peak <= e.have));
    }
    assert.ok(okCount > 60, `${preset.id} covers a useful range (${okCount} lengths)`);
  }
});

// ---------------------------------------------------------------- refusals
test('free text alone is unsupported: not interpreted, not matched, nothing proposed', () => {
  const r = proposePlan({ presetId: '', objectiveText: 'Pursuit angles and takeaways for the secondary', totalMinutes: 60, participants: 12, equipment: [] });
  assert.equal(r.ok, false);
  assert.equal(r.status, 'unsupported');
  assert.ok(r.errors[0].startsWith(NOT_INTERPRETED));
  assert.equal(r.periods, undefined);
  // Text that names a preset's drills still is not matched.
  assert.equal(proposePlan({ presetId: '', objectiveText: 'Pursuit angles (no contact)', totalMinutes: 60, participants: 12 }).status, 'unsupported');
  assert.equal(proposePlan({ presetId: '', objectiveText: '', totalMinutes: 60, participants: 12 }).status, 'rejected');
});

test('with a preset, different objective texts give the same periods: only the note differs', () => {
  const base = { presetId: 'general', totalMinutes: 90, participants: 14, startMin: 930 };
  const a = proposePlan({ ...base, objectiveText: 'Tighten red-zone leverage' });
  const b = proposePlan({ ...base, objectiveText: 'Special teams coverage lanes' });
  const c = proposePlan({ ...base });
  assert.deepEqual(a.periods, b.periods);
  assert.deepEqual(a.periods, c.periods);
  assert.ok(a.periods.every((p) => !/red-zone|leverage/i.test(`${p.title} ${p.objective} ${p.notes}`)), 'text never leaks into periods');
  assert.match(a.day.notes, /Tighten red-zone leverage/);
  assert.doesNotMatch(c.day.notes, /Coach objective/);
});

test('impossible or malformed durations are rejected', () => {
  for (const T of [12.5, '60', NaN, null, undefined]) assert.match(errorsText(proposePlan(input({ totalMinutes: T }))), /whole number of minutes/, String(T));
  for (const T of [0, 9, 361, 1000]) assert.match(errorsText(proposePlan(input({ totalMinutes: T }))), /10–360/, String(T));
  const short = proposePlan({ presetId: 'recognize-align', totalMinutes: 20, participants: 10, equipment: kit() });
  assert.equal(short.ok, false);
  assert.match(errorsText(short), /needs at least 25 min/);
  const long = proposePlan({ presetId: 'recognize-align', totalMinutes: 300, participants: 10, equipment: kit() });
  assert.match(errorsText(long), /at most 190 min/);
});

test('zero, negative or fractional participants are rejected', () => {
  assert.match(errorsText(proposePlan(input({ participants: 0 }))), /No participants/);
  assert.match(errorsText(proposePlan(input({ participants: -3 }))), /No participants/);
  assert.match(errorsText(proposePlan(input({ participants: 2.5 }))), /whole number/);
  assert.match(errorsText(proposePlan(input({ participants: 201 }))), /at most 200/);
});

test('stations beyond participant capacity are rejected', () => {
  const few = proposePlan(input({ participants: 5 }));
  assert.equal(few.ok, false);
  assert.match(errorsText(few), /Not even 2 stations fit/);
  assert.match(errorsText(few), /at least 3 participants in every group \(6 in total\); 5 available/);
  const four = proposePlan(input({ participants: 10, stations: 4, equipment: kit({ 'Hand shields': 4, Cones: 40 }) }));
  assert.equal(four.ok, false);
  assert.match(errorsText(four), /4 stations cannot run/);
  assert.match(errorsText(four), /groups of 2/);
  assert.match(errorsText(proposePlan(input({ stations: 5 }))), /runs 2–4 stations/);
  assert.match(errorsText(proposePlan({ presetId: 'general', totalMinutes: 60, participants: 9, stations: 2 })), /no stations/);
});

test('equipment is checked across stations that run at the same time', () => {
  // 3 stations need 8 + 6 + 6 = 20 cones at once.
  const exact = proposePlan(input({ stations: 3, equipment: kit({ Cones: 20 }) }));
  assert.equal(exact.ok, true, errorsText(exact));
  const short = proposePlan(input({ stations: 3, equipment: kit({ Cones: 19 }) }));
  assert.equal(short.ok, false);
  assert.match(errorsText(short), /Not enough Cones: 20 needed for the 3 stations running at the same time; you have 19/);
  const auto = proposePlan(input({ equipment: kit({ Cones: 19 }) }));
  assert.equal(auto.stationCount, 2, 'automatic falls back to 2 stations (14 cones)');
  assert.ok(auto.assumptions.some((a) => /3 stations not used: Not enough Cones/.test(a)));
  // Footballs: 6 + 2 at the stations, 2 in the team period (not at the same time).
  assert.equal(proposePlan(input({ equipment: kit({ Footballs: 8 }) })).ok, true);
  assert.equal(proposePlan(input({ equipment: kit({ Footballs: 7 }) })).stationCount, 2);
});

test('missing required equipment is rejected and named', () => {
  const r = proposePlan({ presetId: 'recognize-align', totalMinutes: 60, participants: 10, equipment: kit({ Whiteboard: 0 }) });
  assert.equal(r.ok, false);
  assert.match(errorsText(r), /Missing required equipment: Whiteboard \(1 needed for “Formation recognition flash”/);
  const none = proposePlan({ presetId: 'pursuit-takeaway', totalMinutes: 60, participants: 12, equipment: [] });
  assert.match(errorsText(none), /Missing required equipment: Scout cards/);
  assert.match(errorsText(none), /Missing required equipment: Cones/);
  assert.equal(proposePlan({ presetId: 'general', totalMinutes: 60, participants: 9, equipment: [] }).ok, true, 'a preset without equipment needs none');
});

test('other inputs are validated: preset, text length, start time, label, inventory', () => {
  assert.match(errorsText(proposePlan(input({ presetId: 'mystery' }))), /Unknown preset/);
  assert.match(errorsText(proposePlan(input({ objectiveText: 'x'.repeat(301) }))), /longer than 300/);
  assert.match(errorsText(proposePlan(input({ startMin: 1440 }))), /time of day/);
  assert.match(errorsText(proposePlan(input({ label: 'L'.repeat(61) }))), /at most 60/);
  assert.match(errorsText(proposePlan(input({ equipment: [{ name: 'Cones', quantity: 3 }, { name: 'cones', quantity: 4 }] }))), /listed twice/);
  assert.match(errorsText(proposePlan(input({ equipment: [{ name: 'Cones', quantity: 2.5 }] }))), /whole number from 0 to 999/);
  assert.match(errorsText(proposePlan(input({ equipment: [{ name: ' ', quantity: 1 }] }))), /needs a name/);
});

// ---------------------------------------------------------------- apply
test('apply adds a NEW day; existing days are untouched and ids stay unique', () => {
  const p = fresh();
  const before = structuredClone(p.week.days);
  const r = proposePlan(input({ objectiveText: 'Keep leverage' }));
  const a = applyProposal(p.week, r, mk('pilot'), { drills: p.drills });
  assert.equal(a.ok, true, a.errors?.join(' '));
  assert.equal(a.week.days.length, before.length + 1);
  assert.equal(a.week.days[a.week.days.length - 1].id, a.dayId, 'appended at the end');
  before.forEach((d, i) => {
    assert.equal(a.week.days[i], p.week.days[i], 'same object: never replaced');
    assert.deepEqual(a.week.days[i], d);
  });
  assert.equal(a.week.version, p.week.version + 1);
  assert.equal(a.day.version, 1);
  assert.equal(computeSchedule(a.day).totalMin, 75);
  assert.deepEqual(a.droppedDrills, []);
  assert.ok(a.day.periods.every((x) => !('station' in x) && !('round' in x)), 'only planner fields are stored');
  const v = validateProject({ ...p, week: a.week });
  assert.deepEqual(v.errors, []);
  // Applying twice gives two independent days.
  const b = applyProposal(a.week, r, mk('again'), { drills: p.drills });
  assert.equal(b.ok, true, errorsText(b));
  assert.equal(b.week.days.length, before.length + 2);
  assert.notEqual(b.dayId, a.dayId);
  assert.notEqual(b.day.periods[0].equipment, a.day.periods[0].equipment);
});

test('apply refuses colliding ids and an invalid proposal; unknown drills are dropped, not invented', () => {
  const p = fresh();
  const r = proposePlan(input());
  const reuse = () => p.week.days[0].id;
  const bad = applyProposal(p.week, r, reuse, { drills: p.drills });
  assert.equal(bad.ok, false);
  assert.match(bad.errors.join(' '), /already used/);
  assert.equal(applyProposal(p.week, { ok: false }, mk()).ok, false);
  assert.equal(r.ok, true, errorsText(r));
  const noDrills = applyProposal(p.week, r, mk('nd'), { drills: [] });
  assert.equal(noDrills.ok, true, errorsText(noDrills));
  assert.ok(noDrills.day.periods.every((x) => x.drillId === null));
  assert.ok(noDrills.droppedDrills.includes('drill-pursuit'));
  assert.deepEqual(validateProject({ ...p, drills: [], templates: [], week: { ...noDrills.week, days: [noDrills.day] }, rotations: {}, participants: p.participants.map((x) => ({ ...x, unavailable: [] })) }).errors, []);
});

test('the generated day stays editable with the existing week operations', () => {
  const p = fresh();
  const a = applyProposal(p.week, proposePlan(input()), mk('ed'), { drills: p.drills });
  assert.equal(a.ok, true, errorsText(a));
  const id = a.dayId;
  const [warm, st1] = a.day.periods;
  let w = updatePeriod(a.week, id, warm.id, { title: 'Dynamic warm-up', minutes: 8, groupIds: ['grp-skill'] });
  w = movePeriod(w, id, st1.id, 1);
  w = deletePeriod(w, id, a.day.periods[a.day.periods.length - 1].id);
  w = addPeriod(w, id, newPeriod('per-added', { title: 'Conditioning', minutes: 6, category: 'team' }));
  const d = w.days.find((x) => x.id === id);
  assert.equal(d.periods[0].title, 'Dynamic warm-up');
  assert.equal(d.version, 5, 'four edits, four versions');
  assert.deepEqual(validateProject({ ...p, week: w }).errors, []);
  p.week.days.forEach((orig, i) => assert.equal(w.days[i], orig, 'other days untouched'));
  assert.ok(computeSchedule(d).items.length > 0);
  // No scout groups or people are assigned by the Pilot; once the coach adds a
  // group, the existing rotation fills it from the existing participants only.
  assert.ok(a.day.periods.every((x) => x.groupIds.length === 0 && x.cardIds.length === 0));
  const rot = generateRotation({ day: d, groups: p.groups, participants: p.participants, seed: 3 });
  const ids = new Set(p.participants.map((x) => x.id));
  assert.ok(rot.entries.length === 1 && rot.entries[0].groupId === 'grp-skill');
  assert.ok(rot.entries[0].slots.every((s) => s.participantId === null || ids.has(s.participantId)));
  assert.equal(validateRotation({ day: d, groups: p.groups, participants: p.participants, rotation: rot }).warnings.filter((x) => x.severity === 'error').length, 0);
});

// ---------------------------------------------------------------- shorter copy
test('shorter copy preserves the original and is fully independent', () => {
  const p = fresh();
  const a = applyProposal(p.week, proposePlan(input()), mk('src'), { drills: p.drills });
  assert.equal(a.ok, true, errorsText(a));
  const src = a.day;
  const snapshot = structuredClone(src);
  const r = applyShortened(a.week, src.id, 50, mk('short'));
  assert.equal(r.ok, true, r.errors?.join(' '));
  const orig = r.week.days.find((d) => d.id === src.id);
  assert.equal(orig, src, 'original day object kept as is');
  assert.deepEqual(orig, snapshot, 'original unchanged');
  const i = r.week.days.findIndex((d) => d.id === src.id);
  assert.equal(r.week.days[i + 1].id, r.dayId, 'copy goes right after the original');
  const copy = r.day;
  assert.notEqual(copy.id, src.id);
  assert.equal(copy.version, 1);
  assert.equal(copy.plannedMinutes, 50);
  assert.equal(computeSchedule(copy).totalMin, 50);
  const srcIds = new Set(src.periods.map((x) => x.id));
  copy.periods.forEach((x, k) => {
    assert.ok(!srcIds.has(x.id), 'new period ids');
    assert.equal(r.idMap[src.periods[k].id], x.id);
    for (const key of ['equipment', 'cardIds', 'groupIds']) assert.notEqual(x[key], src.periods[k][key], `${key} is its own array`);
    assert.ok(x.minutes <= src.periods[k].minutes);
    assert.ok(x.minutes >= Math.min(SHORTEN_FLOOR_MIN, src.periods[k].minutes));
  });
  copy.periods[1].equipment.push('Extra');
  assert.deepEqual(r.week.days[i].periods[1].equipment, snapshot.periods[1].equipment, 'editing the copy cannot reach the original');
  // Stations of each round stay equal.
  const byBlock = new Map();
  for (const it of computeSchedule(copy).items) byBlock.set(it.block, (byBlock.get(it.block) || []).concat(it.minutes));
  for (const mins of byBlock.values()) assert.equal(new Set(mins).size, 1);
  assert.match(copy.notes, /original day is unchanged/);
  assert.deepEqual(validateProject({ ...p, week: r.week }).errors, []);
});

test('shorter copy of a seeded template day, with shelf periods copied', () => {
  const p = fresh();
  const tue = p.week.days[1];
  const total = computeSchedule(tue).totalMin;
  const pre = proposeShortened(tue, total - 20);
  assert.equal(pre.ok, true, pre.errors?.join(' '));
  assert.equal(pre.rows.reduce((s, x) => s + x.toMin, 0), total - 20);
  const w = { ...p.week, days: p.week.days.map((d) => (d.id === tue.id ? { ...d, periods: d.periods.concat([newPeriod('per-shelf-x', { title: 'Shelf', minutes: 9, scheduled: false })]) } : d)) };
  const r = applyShortened(w, tue.id, total - 20, mk('tue'));
  assert.equal(r.ok, true, r.errors?.join(' '));
  const shelf = r.day.periods.find((x) => !x.scheduled);
  assert.equal(shelf.minutes, 9, 'shelf period copied, not shortened');
  assert.notEqual(shelf.id, 'per-shelf-x');
  assert.equal(p.rotations[r.dayId], undefined, 'rotation stays with the original day');
});

test('shorter copy refuses what it cannot do, and changes nothing', () => {
  const d = day('d1', [period('a', 30), period('b', 30), period('c', 20)]);
  const w = week([d]);
  for (const [T, re] of [[12.5, /whole number/], [80, /already runs 80/], [90, /already runs 80/], [9, /10–360/], [14, /at least 15 min/]]) {
    const r = applyShortened(w, 'd1', T, mk());
    assert.equal(r.ok, false, String(T));
    assert.match(r.errors.join(' '), re, String(T));
  }
  assert.equal(proposeShortened(d, 15).ok, true, 'exactly the floor (5 + 5 + 5)');
  assert.deepEqual(proposeShortened(d, 15).rows.map((x) => x.toMin), [5, 5, 5]);
  const fixed = day('d2', [period('a', 30), period('b', 30, { fixedStart: 1000 })]);
  assert.match(proposeShortened(fixed, 40).errors.join(' '), /fixed start/);
  const uneven = day('d3', [period('a', 30), period('b', 20, { parallel: true }), period('c', 20)]);
  assert.match(proposeShortened(uneven, 30).errors.join(' '), /different lengths/);
  assert.match(proposeShortened(day('d4', [period('u', 20, { scheduled: false })]), 15).errors.join(' '), /no scheduled periods/);
  assert.match(applyShortened(w, 'missing', 30, mk()).errors.join(' '), /not in this week/);
  assert.deepEqual(w.days[0], day('d1', [period('a', 30), period('b', 30), period('c', 20)]), 'refusals change nothing');
});

test('shortening scales proportionally and exactly', () => {
  const d = day('d1', [period('a', 40), period('b', 20), period('c', 10, { category: 'break' }), period('d', 30)]);
  const r = proposeShortened(d, 60);
  assert.equal(r.ok, true);
  assert.equal(r.rows.reduce((s, x) => s + x.toMin, 0), 60);
  assert.ok(r.rows[0].toMin > r.rows[3].toMin && r.rows[3].toMin > r.rows[1].toMin, 'longer periods keep more time');
  assert.deepEqual(proposeShortened(d, 60), r, 'deterministic');
});

// ---------------------------------------------------------------- persistence, clock, print data
test('a project with Pilot days survives export, import and reload validation byte for byte', () => {
  const p = fresh();
  const a = applyProposal(p.week, proposePlan(input({ objectiveText: 'Kept “as written” — <b>not</b> markup' })), mk('rt'), { drills: p.drills });
  assert.equal(a.ok, true, errorsText(a));
  const s = applyShortened(a.week, a.dayId, 45, mk('rs'));
  assert.equal(s.ok, true, errorsText(s));
  const project = { ...p, week: s.week };
  const text = exportProject(project, null);
  const back = importProject(text);
  assert.equal(back.ok, true, JSON.stringify(back.errors));
  assert.deepEqual(back.project, project);
  assert.equal(exportProject(back.project, null), text, 'byte-stable');
  assert.ok(back.project.week.days.find((d) => d.id === a.dayId).notes.includes('<b>not</b>'), 'note stored as plain text');
  // A tampered export (duplicate id between the copy and its source) is refused.
  const doc = JSON.parse(text);
  const copy = doc.week.days.find((d) => d.id === s.dayId);
  copy.periods[0].id = doc.week.days.find((d) => d.id === a.dayId).periods[0].id;
  assert.equal(importProject(JSON.stringify(doc)).ok, false);
});

test('Pilot days run on the existing clock and keep the existing rebalance', () => {
  const p = fresh();
  const a = applyProposal(p.week, proposePlan(input()), mk('ck'), { drills: p.drills });
  assert.equal(a.ok, true, errorsText(a));
  const steps = buildSteps(a.day);
  assert.equal(steps.length, 6, 'parallel stations share a step');
  assert.equal(steps.reduce((t, x) => t + x.plannedSec, 0), 75 * 60);
  assert.equal(steps[1].periodIds.length, 3);
  let c = createSession({ id: 'clk-pilot', day: a.day });
  c = applyAction(c, { type: 'start', rev: c.rev }, env(0)).session;
  c = applyAction(c, { type: 'next', rev: c.rev }, env(11 * 60_000)).session;
  assert.equal(c.index, 1);
  const project = { ...p, week: a.week };
  assert.deepEqual(validateClockFor(project, c), []);
  const reb = proposeRebalance(c, env(12 * 60_000), { minutesLeft: 40, mode: 'fit' });
  assert.ok(reb.change && reb.preview.rows.length === 4, 'the live rebalance still works on a Pilot day');
  const r2 = applyAction(c, { type: 'revise', rev: c.rev, change: reb.change }, env(12 * 60_000));
  assert.equal(r2.ok, true, r2.error);
  // The shorter copy also runs.
  const s = applyShortened(a.week, a.dayId, 40, mk('cs'));
  assert.equal(s.ok, true, errorsText(s));
  assert.equal(buildSteps(s.day).reduce((t, x) => t + x.plannedSec, 0), 40 * 60);
  assert.equal(importProject(exportProject({ ...p, week: s.week }, r2.session)).ok, true, 'clock on the Pilot day exports and imports');
});
