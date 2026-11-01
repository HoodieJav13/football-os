// Deterministic FICTIONAL fixture generator. Pure: same seed + scenario +
// library -> identical project (ids included). Participants are synthetic
// labels with scout roles only; no names, health or identity fields.
import { createIdFactory } from './ids.js';
import { mulberry32, shuffle } from './rng.js';
import { newPeriod, newDay } from './week.js';
import { generateRotation, setLock } from './rotation.js';
import { SCHEMA, SCHEMA_VERSION } from './project.js';

export const SCENARIOS = ['example', 'normal', 'thin', 'unavailable', 'shared-group', 'locks', 'renamed'];
export const FIXTURE_SEEDS = [1, 7, 42, 2027];

const SKILL = ['grp-skill', 'grp-pass'];
const LINE = ['grp-line'];
// Primary roles; enough people for the Wednesday parallel stations.
const ROSTER = [
  ['QB'], ['QB'], ['RB'], ['RB'], ['RB', 'WR'], ['WR'], ['WR'], ['WR'], ['WR'], ['WR', 'TE'],
  ['TE'], ['TE', 'OL'], ['OL'], ['OL'], ['OL'], ['OL'], ['OL'],
];
const FLEX = ['WR', 'RB', 'TE'];

function participantsFor(seed, ids) {
  const rand = mulberry32(seed * 7919 + 13);
  const numbers = shuffle(Array.from({ length: ROSTER.length }, (_, i) => i + 1), rand);
  const people = ROSTER.map((roles, i) => {
    const roleKeys = roles.slice();
    // Seeded variation: some skill players get one extra flex role.
    if (!roleKeys.includes('OL') && !roleKeys.includes('QB') && rand() < 0.35) {
      const extra = FLEX[Math.floor(rand() * FLEX.length)];
      if (!roleKeys.includes(extra)) roleKeys.push(extra);
    }
    const groupIds = roleKeys.includes('OL') ? (roleKeys.length > 1 ? SKILL.concat(LINE) : LINE.slice()) : SKILL.slice();
    return { id: ids('ppl'), label: `Fict Scout ${String(numbers[i]).padStart(2, '0')}`, roleKeys, groupIds, unavailable: [] };
  });
  return people.sort((a, b) => (a.label < b.label ? -1 : 1));
}

function buildDay(ids, template) {
  const id = ids('day');
  const periods = template.periods.map((tp) => newPeriod(ids('per'), {
    title: tp.title, minutes: tp.minutes, category: tp.category, objective: tp.objective || '', callLabel: tp.callLabel || '',
    drillId: tp.drillId || null, cardIds: tp.cardIds || [], groupIds: tp.groupIds || [], equipment: tp.equipment || [],
    notes: tp.notes || '', parallel: !!tp.parallel,
  }));
  return newDay(id, { label: template.dayLabel, date: '', startMin: template.startMin, plannedMinutes: template.plannedMinutes, notes: template.description || '', periods });
}

const findPeriod = (day, re) => day.periods.find((p) => re.test(p.title));

export function generateFixture({ seed, scenario = 'example', library }) {
  if (!SCENARIOS.includes(scenario)) throw new Error(`unknown scenario ${scenario}`);
  const ids = createIdFactory({ seed });
  const lib = structuredClone(library);
  const projectId = ids('prj');
  const weekId = ids('wk');
  const days = lib.templates.map((t) => buildDay(ids, t));
  let participants = participantsFor(seed, ids);
  const rotations = {};
  const [mon, tue, wed, thu] = days;

  if (scenario === 'example') {
    // One fictional scout QB is out for both Wednesday stations, which run at the
    // same time and both need a QB: an honest, unavoidable shortage.
    const qb = participants.find((p) => p.roleKeys.includes('QB'));
    for (const re of [/station a/i, /station b/i]) qb.unavailable.push({ dayId: wed.id, periodId: findPeriod(wed, re).id });
  }
  if (scenario === 'unavailable') {
    const runFit = findPeriod(tue, /run fit/i);
    const qb = participants.find((p) => p.roleKeys.includes('QB'));
    qb.unavailable.push({ dayId: tue.id, periodId: runFit.id });
  }
  if (scenario === 'thin') {
    let qbKept = false;
    let wrDropped = 0;
    participants = participants.filter((p) => {
      if (p.roleKeys.includes('QB')) {
        if (qbKept) return false;
        qbKept = true;
      }
      if (p.roleKeys.includes('WR') && wrDropped < 4) {
        wrDropped++;
        return false;
      }
      return true;
    });
  }
  if (scenario === 'shared-group') {
    // Thursday: two-minute period runs alongside red zone and both use Scout Skill A.
    const two = findPeriod(thu, /two-minute/i);
    two.parallel = true;
    two.groupIds = ['grp-skill'];
  }
  if (scenario === 'renamed') {
    const p = participants[6];
    p.label = `${p.label} (renamed)`;
  }
  if (scenario === 'locks') {
    const ctx = { day: tue, groups: lib.groups, participants };
    let rot = generateRotation({ ...ctx, seed });
    const filled = rot.entries.flatMap((e) => e.slots.filter((s) => s.participantId).map((s) => ({ periodId: e.periodId, groupId: e.groupId, slotId: s.slotId })));
    for (const ref of [filled[0], filled[filled.length - 1]]) rot = setLock({ ...ctx, rotation: rot, ...ref, locked: true }).rotation;
    rotations[tue.id] = rot;
  }

  const project = {
    schema: SCHEMA,
    schemaVersion: SCHEMA_VERSION,
    project: { id: projectId, name: 'Practice Week Planner — FICTIONAL example', fictional: true, timezone: 'America/Chicago', rev: 0, seed, scenario },
    week: { id: weekId, version: 1, opponentLabel: 'FICTIONAL — Northfield Comets (sample opponent)', notes: 'Fictional sample week. Edit freely; nothing here is a real schedule, roster or game plan.', days },
    groups: lib.groups,
    participants,
    drills: lib.drills,
    templates: lib.templates,
    cards: lib.cards,
    rotations,
    records: [],
  };
  void mon;
  // Normalise through JSON so in-memory and exported forms are identical.
  return JSON.parse(JSON.stringify(project));
}
