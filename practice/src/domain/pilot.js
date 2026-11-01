// Practice Pilot: an offline preset + the coach's available time, participant
// count and equipment -> a transparent, deterministic draft day; and a shorter,
// independent copy of an existing day. Pure.
//
// - Nothing here reads free text for meaning. A typed objective is kept as
//   written (a note on the new day) and is never matched to a preset.
// - Applying a draft or a shortened copy always ADDS a day (week.js addDay)
//   with fresh ids. No existing day is replaced or edited.
// - Times are checked with computeSchedule; the live-run rebalance stays in
//   disruption.js and is not used or changed here.
// - Participants are a count only. Groups are numbered; nobody is named.
import { newDay, newPeriod, addDay, computeSchedule, validateDay, validatePeriod, truncate, DAY_LIMITS, PERIOD_LIMITS } from './week.js';
import { formatClock12 } from './time.js';

export const PILOT_LIMITS = { objectiveText: PERIOD_LIMITS.objective, participantsMax: 200, quantityMax: 999, label: DAY_LIMITS.label };
export const BREAK_FROM_MIN = 45; // a 5-minute water break is added from 45 minutes up
export const BREAK_MIN = 5;
export const SHORTEN_FLOOR_MIN = 5; // a shortened block keeps at least 5 min (or its own length if shorter)
export const NOT_INTERPRETED = 'Practice Pilot does not read or interpret free-text objectives, and your text was not matched to any preset.';

const STATION_LETTERS = 'ABCD';
// The library's team-vs-scout drill needs "Pinnies (scout)" without a number.
// The preset counts one per role of the scout offense the library's templates
// use for it (grp-skill 5 + grp-line 5) and says so in its assumptions.
export const SCOUT_OFFENSE_PINNIES = 10;
const sum = (xs) => xs.reduce((a, x) => a + x, 0);
const item = (name, qty) => ({ name, qty });

// ---------------------------------------------------------------- catalogue
// A small, fixed, offline catalogue. Each preset is a structure the coach
// chooses; weights split the time, min/max bound each period (per round for
// stations). Stations are listed in the order they are added; the first
// `minStations` are required.
export const PILOT_PRESETS = [
  {
    id: 'recognize-align',
    label: 'Recognize formations and align (walkthrough install)',
    short: 'Recognize & align',
    summary: 'Walk-tempo recognition and alignment against scout cards, then a call-and-check team period. No stations.',
    minParticipants: 1,
    blocks: [
      { kind: 'single', title: 'Warm-up', category: 'individual', objective: 'Movement prep at coach tempo.', weight: 1, min: 5, max: 20, equipment: [] },
      { kind: 'single', title: 'Formation recognition flash', category: 'walkthrough', drillId: 'drill-formation-flash', objective: 'Name the formation and its strength within a three-count.', weight: 1, min: 5, max: 30, equipment: [item('Scout card stack', 1), item('Whiteboard', 1)] },
      { kind: 'break' },
      { kind: 'single', title: 'Alignment & assignment walkthrough', category: 'walkthrough', drillId: 'drill-align-walk', objective: 'Every defender can name alignment, key and first step against the shown look.', weight: 3, min: 10, max: 90, equipment: [item('Cones', 4), item('Scout cards', 1)] },
      { kind: 'single', title: 'Situations: call-and-check', category: 'team', drillId: 'drill-situations', objective: 'Get the call in and check correctly against the shown look.', weight: 1, min: 5, max: 45, equipment: [item('Down markers', 1), item('Scout cards', 1), item('Call board', 1)] },
    ],
  },
  {
    id: 'pursuit-takeaway',
    label: 'Pursuit and ball skills (station rotation)',
    short: 'Pursuit & ball skills',
    summary: 'Warm-up, then 2–4 individual stations that every group rotates through, then a team period.',
    minParticipants: 1,
    blocks: [
      { kind: 'single', title: 'Warm-up', category: 'individual', objective: 'Movement prep at coach tempo.', weight: 1, min: 5, max: 20, equipment: [] },
      {
        kind: 'stations', weight: 4, min: 4, max: 20, minStations: 2,
        stations: [
          { title: 'Pursuit angles (no contact)', category: 'individual', drillId: 'drill-pursuit', objective: 'Take a leverage angle to the ball and finish to a cone landmark.', minPerStation: 3, equipment: [item('Cones', 8), item('Pinnies', 1)] },
          { title: 'Ball-security / takeaway circuit', category: 'individual', drillId: 'drill-takeaway', objective: 'Finish plays by attacking the ball in a controlled circuit.', minPerStation: 3, equipment: [item('Footballs', 6), item('Cones', 6)] },
          { title: 'Zone drop landmarks', category: 'individual', drillId: 'drill-zone-drops', objective: 'Open to the correct landmark and find the nearest threat.', minPerStation: 2, equipment: [item('Cones', 6), item('Footballs', 2)] },
          { title: 'Block-shed fits (fit tempo)', category: 'individual', drillId: 'drill-shed-fits', objective: 'Fit into the assigned gap with hands inside and eyes on the ball.', minPerStation: 4, equipment: [item('Hand shields', 4)] },
        ],
      },
      { kind: 'break' },
      { kind: 'single', title: 'Team vs. scout look', category: 'team', drillId: 'drill-team-scout', objective: 'Execute the call as a unit against a sequence of scout looks.', weight: 2, min: 5, max: 60, equipment: [item('Scout cards', 1), item('Scout pinnies', SCOUT_OFFENSE_PINNIES), item('Footballs', 2)],
        assumption: `“Team vs. scout look” counts ${SCOUT_OFFENSE_PINNIES} scout pinnies: one per role of the library's scout offense (Scout Skill A and Scout Line, 5 roles each). This is a fixed count of the preset; who wears them is not assigned.` },
    ],
  },
  {
    id: 'coverage-rush',
    label: 'Coverage landmarks and rush lanes (station rotation)',
    short: 'Coverage & rush',
    summary: 'Warm-up, then 2–3 stations (zone drops, rush lanes, pattern read) that every group rotates through, then situations.',
    minParticipants: 1,
    blocks: [
      { kind: 'single', title: 'Warm-up', category: 'individual', objective: 'Movement prep at coach tempo.', weight: 1, min: 5, max: 20, equipment: [] },
      {
        kind: 'stations', weight: 4, min: 5, max: 20, minStations: 2,
        stations: [
          { title: 'Zone drop landmarks', category: 'individual', drillId: 'drill-zone-drops', objective: 'Open to the correct landmark and find the nearest threat.', minPerStation: 2, equipment: [item('Cones', 6), item('Footballs', 2)] },
          { title: 'Rush-lane integrity', category: 'group', drillId: 'drill-rush-lanes', objective: 'Keep rush lanes so the passer has no clean escape.', minPerStation: 4, equipment: [item('Bags', 4), item('Cones', 1)] },
          { title: 'Pattern read vs. skeleton look', category: 'group', drillId: 'drill-pattern-read', objective: 'Recognize the route pattern and match the threat to the zone.', minPerStation: 4, equipment: [item('Footballs', 3), item('Cones', 4), item('Scout cards', 1)] },
        ],
      },
      { kind: 'break' },
      { kind: 'single', title: 'Situations: call-and-check', category: 'team', drillId: 'drill-situations', objective: 'Get the call in and check correctly against the shown look.', weight: 2, min: 5, max: 60, equipment: [item('Down markers', 1), item('Scout cards', 1), item('Call board', 1)] },
    ],
  },
  {
    id: 'general',
    label: 'General structure (does not use your objective)',
    short: 'General structure',
    summary: 'A neutral warm-up → individual → group → team order with generic titles and no drills. It does not read your objective; edit the periods yourself.',
    minParticipants: 1,
    blocks: [
      { kind: 'single', title: 'Warm-up', category: 'individual', objective: '', weight: 1, min: 5, max: 20, equipment: [] },
      { kind: 'single', title: 'Individual work', category: 'individual', objective: '', weight: 2, min: 5, max: 90, equipment: [] },
      { kind: 'break' },
      { kind: 'single', title: 'Group work', category: 'group', objective: '', weight: 2, min: 5, max: 90, equipment: [] },
      { kind: 'single', title: 'Team period', category: 'team', objective: '', weight: 2, min: 5, max: 90, equipment: [] },
    ],
  },
];

export const presetById = (id) => PILOT_PRESETS.find((p) => p.id === id) || null;

// Every equipment item a preset can use, with what each use needs (for the form).
export function requiredEquipment(preset) {
  const out = new Map();
  const add = (name, qty, where) => {
    const k = name.toLowerCase();
    if (!out.has(k)) out.set(k, { name, uses: [] });
    out.get(k).uses.push({ where, qty });
  };
  for (const b of preset?.blocks || []) {
    if (b.kind === 'single') for (const e of b.equipment) add(e.name, e.qty, b.title);
    if (b.kind === 'stations') b.stations.forEach((s, i) => { for (const e of s.equipment) add(e.name, e.qty, `Station ${STATION_LETTERS[i]}${i >= b.minStations ? ' (optional)' : ''}`); });
  }
  return [...out.values()];
}

// ---------------------------------------------------------------- allocation
// Each part gets its minimum; the minutes left are shared in proportion to the
// weights (in whole units of `mult` minutes, never above `max`), rounded down;
// a leftover unit goes to the part with the largest share (ties: earlier part).
// Returns null when the total cannot be split exactly.
export function allocateMinutes(parts, total) {
  const out = parts.map((x) => x.min);
  let left = total - sum(out);
  if (left < 0) return null;
  while (left > 0) {
    const open = parts.map((_, i) => i).filter((i) => out[i] + parts[i].mult <= parts[i].max && parts[i].mult <= left);
    if (!open.length) return null;
    const wsum = sum(open.map((i) => parts[i].weight));
    const want = open.map((i) => ({ i, m: wsum ? (left * parts[i].weight) / wsum : left / open.length }));
    let given = 0;
    for (const { i, m } of want) {
      const units = Math.min(Math.floor(m / parts[i].mult), Math.floor((parts[i].max - out[i]) / parts[i].mult), Math.floor((left - given) / parts[i].mult));
      out[i] += units * parts[i].mult;
      given += units * parts[i].mult;
    }
    if (!given) {
      const best = want.slice().sort((a, b) => b.m - a.m || a.i - b.i)[0];
      out[best.i] += parts[best.i].mult;
      given = parts[best.i].mult;
    }
    left -= given;
  }
  return out;
}

// ---------------------------------------------------------------- inputs
const isInt = (v) => typeof v === 'number' && Number.isInteger(v);

function readInventory(list, errors) {
  const inv = new Map();
  if (!Array.isArray(list)) {
    errors.push('Equipment must be a list of { name, quantity }.');
    return inv;
  }
  for (const e of list) {
    const name = typeof e?.name === 'string' ? e.name.trim() : '';
    if (!name) { errors.push('Every equipment line needs a name.'); continue; }
    const k = name.toLowerCase();
    if (inv.has(k)) { errors.push(`Equipment “${name}” is listed twice.`); continue; }
    if (!isInt(e.quantity) || e.quantity < 0 || e.quantity > PILOT_LIMITS.quantityMax) { errors.push(`Equipment “${name}”: quantity must be a whole number from 0 to ${PILOT_LIMITS.quantityMax}.`); continue; }
    inv.set(k, { name, quantity: e.quantity });
  }
  return inv;
}

const have = (inv, name) => inv.get(name.toLowerCase())?.quantity ?? 0;

// Needs of things that run at the same time, summed by item.
function concurrentNeeds(lists) {
  const m = new Map();
  for (const l of lists) for (const e of l) {
    const k = e.name.toLowerCase();
    m.set(k, { name: e.name, qty: (m.get(k)?.qty || 0) + e.qty });
  }
  return [...m.values()];
}

function equipmentProblems(needs, inv, where) {
  const out = [];
  for (const n of needs) {
    const h = have(inv, n.name);
    if (h === 0) out.push(`Missing required equipment: ${n.name} (${n.qty} needed for ${where}; you have none).`);
    else if (h < n.qty) out.push(`Not enough ${n.name}: ${n.qty} needed for ${where}; you have ${h}.`);
  }
  return out;
}

const groupSizes = (n, k) => Array.from({ length: k }, (_, i) => Math.floor(n / k) + (i < n % k ? 1 : 0));

function stationReasons(block, k, participants, inv) {
  const chosen = block.stations.slice(0, k);
  const reasons = [];
  const need = Math.max(...chosen.map((s) => s.minPerStation));
  const smallest = Math.floor(participants / k);
  if (smallest < need) reasons.push(`${k} stations need at least ${need} participants in every group (${need * k} in total); ${participants} available makes groups of ${smallest}.`);
  reasons.push(...equipmentProblems(concurrentNeeds(chosen.map((s) => s.equipment)), inv, `the ${k} stations running at the same time`));
  return reasons;
}

// ---------------------------------------------------------------- propose
// input: { presetId, objectiveText, totalMinutes, participants, startMin,
//          stations: 'auto' | whole number, equipment: [{ name, quantity }], label }
export function proposePlan(input = {}) {
  const errors = [];
  const text = input.objectiveText ?? '';
  if (typeof text !== 'string') errors.push('Coach objective must be text.');
  else if (text.length > PILOT_LIMITS.objectiveText) errors.push(`Coach objective is longer than ${PILOT_LIMITS.objectiveText} characters.`);
  const objectiveText = typeof text === 'string' ? text.trim() : '';

  if (!input.presetId) {
    if (objectiveText) {
      return { ok: false, status: 'unsupported', objectiveText, errors: [`${NOT_INTERPRETED} Choose one of the offline presets (or “General structure”, which ignores the objective); your text is then kept as a note on the new day.`] };
    }
    return { ok: false, status: 'rejected', errors: ['Choose a preset from the offline catalogue.'] };
  }
  const preset = presetById(input.presetId);
  if (!preset) return { ok: false, status: 'rejected', errors: [`Unknown preset “${String(input.presetId)}”.`] };

  const T = input.totalMinutes;
  if (!isInt(T)) errors.push('Available time must be a whole number of minutes.');
  else if (T < DAY_LIMITS.plannedMin || T > DAY_LIMITS.plannedMax) errors.push(`Available time must be ${DAY_LIMITS.plannedMin}–${DAY_LIMITS.plannedMax} minutes.`);
  const P = input.participants;
  if (!isInt(P)) errors.push('Participants available must be a whole number.');
  else if (P < 1) errors.push('No participants: at least 1 participant must be available to plan a practice.');
  else if (P > PILOT_LIMITS.participantsMax) errors.push(`Participants available must be at most ${PILOT_LIMITS.participantsMax}.`);
  else if (P < preset.minParticipants) errors.push(`This preset needs at least ${preset.minParticipants} participants.`);
  const startMin = input.startMin ?? 15 * 60 + 30;
  if (!isInt(startMin) || startMin < 0 || startMin >= 1440) errors.push('Start time must be a time of day.');
  const label = typeof input.label === 'string' ? input.label.trim() : '';
  if (label.length > PILOT_LIMITS.label) errors.push(`Day label must be at most ${PILOT_LIMITS.label} characters.`);
  const inv = readInventory(input.equipment ?? [], errors);
  const stationBlock = preset.blocks.find((b) => b.kind === 'stations') || null;
  const reqStations = input.stations ?? 'auto';
  if (reqStations !== 'auto') {
    if (!stationBlock) errors.push('This preset has no stations; leave the station count on automatic.');
    else if (!isInt(reqStations) || reqStations < stationBlock.minStations || reqStations > stationBlock.stations.length) errors.push(`This preset runs ${stationBlock.minStations}–${stationBlock.stations.length} stations.`);
  }
  if (errors.length) return { ok: false, status: 'rejected', errors };

  const assumptions = [];
  const withBreak = T >= BREAK_FROM_MIN;
  const blocks = preset.blocks.filter((b) => b.kind !== 'break' || withBreak);
  const fixedMin = sum(blocks.filter((b) => b.kind !== 'stations').map((b) => (b.kind === 'break' ? BREAK_MIN : b.min)));

  // Sequential periods: each must have its own equipment.
  for (const b of blocks.filter((x) => x.kind === 'single')) errors.push(...equipmentProblems(b.equipment, inv, `“${b.title}”`));

  // Stations: the requested count, or the largest count participants, equipment and time allow.
  let k = 0;
  const notChosen = [];
  if (stationBlock) {
    const timeReason = (n) => (fixedMin + n * stationBlock.min > T ? [`${n} stations rotating need ${n} rounds of at least ${stationBlock.min} min (${n * stationBlock.min} min) plus ${fixedMin} min for the other periods; you have ${T}.`] : []);
    const reasonsFor = (n) => stationReasons(stationBlock, n, P, inv).concat(timeReason(n));
    if (reqStations !== 'auto') {
      const r = reasonsFor(reqStations);
      if (r.length) errors.push(`${reqStations} stations cannot run:`, ...r);
      else k = reqStations;
    } else {
      for (let n = stationBlock.stations.length; n >= stationBlock.minStations; n--) {
        const r = reasonsFor(n);
        if (!r.length) { k = n; break; }
        notChosen.push({ n, reasons: r });
      }
      if (!k) errors.push(`Not even ${stationBlock.minStations} stations fit:`, ...notChosen[notChosen.length - 1].reasons);
    }
  }
  if (errors.length) return { ok: false, status: 'rejected', errors };

  // Split the time.
  const parts = blocks.map((b) => {
    if (b.kind === 'break') return { weight: 0, min: BREAK_MIN, max: BREAK_MIN, mult: 1 };
    // k rounds of equal length: the block's wall time is a multiple of k.
    if (b.kind === 'stations') return { weight: b.weight, min: k * b.min, max: k * b.max, mult: k };
    return { weight: b.weight, min: b.min, max: b.max, mult: 1 };
  });
  const minTotal = sum(parts.map((x) => x.min));
  const maxTotal = sum(parts.map((x) => x.max));
  if (T < minTotal) return { ok: false, status: 'rejected', errors: [`This preset needs at least ${minTotal} min${k ? ` with ${k} stations` : ''}; you have ${T}.`] };
  if (T > maxTotal) return { ok: false, status: 'rejected', errors: [`This preset is built for at most ${maxTotal} min${k ? ` with ${k} stations` : ''}; you have ${T}. Choose fewer minutes or another preset.`] };
  const alloc = allocateMinutes(parts, T);
  if (!alloc) return { ok: false, status: 'rejected', errors: [`${T} min cannot be split into whole-minute periods for this structure${k ? ` (${k} stations need ${k} equal rounds)` : ''}. Try a minute more or less.`] };

  // Build the periods (template form, no ids yet).
  const periods = [];
  const blockRows = [];
  const sizes = k ? groupSizes(P, k) : [];
  blocks.forEach((b, bi) => {
    const minutes = alloc[bi];
    if (b.kind === 'break') {
      periods.push(templatePeriod({ title: 'Water break', minutes, category: 'break', notes: 'Practice Pilot: fixed 5-minute break (sessions of 45 min or longer).' }));
      blockRows.push({ kind: 'break', titles: ['Water break'], minutes, periodCount: 1, equipment: [] });
      return;
    }
    if (b.kind === 'single') {
      periods.push(templatePeriod({ title: b.title, minutes, category: b.category, objective: b.objective, drillId: b.drillId || null, equipment: b.equipment.map(eqText), notes: 'Practice Pilot draft period.' }));
      blockRows.push({ kind: 'single', titles: [b.title], minutes, periodCount: 1, equipment: b.equipment.slice() });
      return;
    }
    const round = minutes / k;
    const chosen = b.stations.slice(0, k);
    for (let r = 0; r < k; r++) {
      chosen.forEach((s, si) => {
        const g = ((si - r) % k + k) % k; // round r: station si hosts group g; every group meets every station once
        periods.push(templatePeriod({
          title: `Station ${STATION_LETTERS[si]} · round ${r + 1}/${k}: ${s.title}`,
          minutes: round, category: s.category, objective: s.objective, drillId: s.drillId || null, equipment: s.equipment.map(eqText),
          notes: `Practice Pilot station rotation: group ${g + 1} of ${k} (${sizes[g]} participants) at station ${STATION_LETTERS[si]} in round ${r + 1} of ${k}.`,
          parallel: si > 0,
          station: STATION_LETTERS[si], round: r + 1, group: g + 1,
        }));
      });
      blockRows.push({ kind: 'stations', round: r + 1, rounds: k, titles: chosen.map((s, si) => `Station ${STATION_LETTERS[si]}: ${s.title}`), minutes: round, periodCount: k, equipment: concurrentNeeds(chosen.map((s) => s.equipment)) });
    }
  });

  // Prove it with the planner's own schedule.
  const day = {
    label: truncate(label || `Pilot: ${preset.short}`, DAY_LIMITS.label),
    date: '',
    startMin,
    plannedMinutes: T,
    notes: dayNotes(preset, objectiveText, k, sizes),
  };
  const preview = previewDay(day, periods);
  const schedule = computeSchedule(preview);
  if (schedule.totalMin !== T || schedule.warnings.length) {
    return { ok: false, status: 'rejected', errors: [`Internal check failed: the draft runs ${schedule.totalMin} min with ${schedule.warnings.length} warning(s); nothing was proposed.`] };
  }
  const blockTimes = [];
  for (const it of schedule.items) if (!blockTimes[it.block]) blockTimes[it.block] = { startMin: it.startMin, endMin: it.endMin };
  blockRows.forEach((r, i) => Object.assign(r, blockTimes[i]));

  // Equipment at the busiest moment, item by item.
  const peak = new Map();
  for (const r of blockRows) for (const e of r.equipment) {
    const kx = e.name.toLowerCase();
    if (!peak.has(kx) || peak.get(kx).peak < e.qty) peak.set(kx, { name: e.name, peak: e.qty, have: have(inv, e.name) });
  }
  const equipmentPeak = [...peak.values()];

  // Say how it was decided.
  assumptions.push(`Preset “${preset.label}” from the offline catalogue: a fixed structure you chose. ${objectiveText ? 'Your objective text is kept as a note on the day; it was not read or interpreted.' : 'No objective text was given.'}`);
  const weights = blocks.filter((b) => b.kind !== 'break').map((b) => `${b.kind === 'stations' ? 'stations' : b.title.toLowerCase()} ${b.weight}`).join(', ');
  assumptions.push(`Time: ${T} min from ${formatClock12(startMin)} to ${formatClock12(startMin + T)}. Each period gets its minimum, the rest is shared by fixed weights (${weights}) in whole minutes, leftovers to the largest share.`);
  assumptions.push(withBreak ? `A ${BREAK_MIN}-minute water break is included because the session is ${BREAK_FROM_MIN} min or longer.` : `No water break: the session is under ${BREAK_FROM_MIN} min.`);
  if (stationBlock) {
    assumptions.push(`${k} stations run at the same time, in ${k} rounds of ${alloc[blocks.indexOf(stationBlock)] / k} min. ${P} participants are split into ${k} numbered groups of ${sizes.join(', ')}; each group visits every station once.`);
    if (reqStations === 'auto') {
      assumptions.push(`Station count chosen automatically: the most stations (of ${stationBlock.stations.length}, added in the catalogue's order) that your participants, equipment and time allow.`);
      for (const nc of notChosen) assumptions.push(`${nc.n} stations not used: ${nc.reasons.join(' ')}`);
    } else assumptions.push(`${k} stations, as you asked.`);
    assumptions.push('Equipment for stations that run at the same time is counted together.');
  }
  for (const b of blocks) if (b.assumption) assumptions.push(b.assumption);
  assumptions.push('Equipment needs follow each linked library drill’s equipment list (numbered where the library gives a number).');
  assumptions.push('Scout groups, linked scout cards (which looks to show) and participant names are not assigned. Add them with Edit on each period after the day is added.');

  const checks = [
    `Fits exactly: ${schedule.totalMin} of ${T} min (computed by the planner's schedule).`,
    'No schedule warnings (no overlaps, nothing over the planned length).',
    equipmentPeak.length ? `Equipment within what you have at the busiest moment: ${equipmentPeak.map((e) => `${e.name} ${e.peak} of ${e.have}`).join(', ')}.` : 'No equipment needed.',
  ];
  if (k) checks.push(`Every group has at least ${Math.max(...stationBlock.stations.slice(0, k).map((s) => s.minPerStation))} participants for every station.`);

  return {
    ok: true,
    status: 'proposed',
    preset: { id: preset.id, label: preset.label },
    objectiveText,
    interpreted: false,
    totalMinutes: T,
    startMin,
    participants: P,
    stationCount: k,
    groupSizes: sizes,
    day,
    periods,
    blocks: blockRows,
    schedule,
    equipmentPeak,
    assumptions,
    checks,
  };
}

const eqText = (e) => `${e.name} (${e.qty})`;

function templatePeriod(f) {
  return {
    title: f.title, minutes: f.minutes, category: f.category, objective: f.objective || '', callLabel: '',
    drillId: f.drillId || null, cardIds: [], groupIds: [], equipment: f.equipment || [], notes: f.notes || '',
    scheduled: true, parallel: !!f.parallel, fixedStart: null,
    ...(f.station ? { station: f.station, round: f.round, group: f.group } : {}),
  };
}

function dayNotes(preset, objectiveText, k, sizes) {
  const parts = [`Practice Pilot draft from the offline preset “${preset.label}”.`];
  if (objectiveText) parts.push(`Coach objective (kept as written, not interpreted): “${objectiveText}”`);
  if (k) parts.push(`${k} numbered groups of ${sizes.join(', ')} rotate through ${k} stations.`);
  return truncate(parts.join('\n'), DAY_LIMITS.notes);
}

// Station/round/group are proposal details only; the stored period has the planner's fields.
const PERIOD_FIELDS = ['title', 'minutes', 'category', 'objective', 'callLabel', 'drillId', 'cardIds', 'groupIds', 'equipment', 'notes', 'scheduled', 'parallel', 'fixedStart'];
const periodFields = (tp) => Object.fromEntries(PERIOD_FIELDS.map((k) => [k, tp[k]]));

function previewDay(day, periods) {
  return newDay('pilot-preview', { ...day, periods: periods.map((tp, i) => newPeriod(`pilot-preview-${i + 1}`, periodFields(tp))) });
}

// ---------------------------------------------------------------- apply
// Adds the proposal as a NEW day (at the end, or at `index`). Drills the
// project does not have are left out (listed in droppedDrills).
export function applyProposal(week, proposal, ids, { drills = null, index } = {}) {
  if (!proposal || !proposal.ok || !Array.isArray(proposal.periods)) return { ok: false, errors: ['There is no valid proposal to add.'] };
  const drillIds = drills ? new Set(drills.map((d) => d.id)) : null;
  const droppedDrills = [];
  const periods = proposal.periods.map((tp) => {
    const f = periodFields(tp);
    if (f.drillId && drillIds && !drillIds.has(f.drillId)) {
      droppedDrills.push(f.drillId);
      f.drillId = null;
    }
    return newPeriod(ids('per'), f);
  });
  const day = newDay(ids('day'), { ...proposal.day, periods });
  const errors = dayErrors(week, day);
  if (computeSchedule(day).totalMin !== proposal.totalMinutes) errors.push('The new day would not match the proposal’s length.');
  if (errors.length) return { ok: false, errors };
  return { ok: true, week: addDay(week, day, index), dayId: day.id, day, droppedDrills: [...new Set(droppedDrills)] };
}

function dayErrors(week, day) {
  const errors = validateDay(day).errors.slice();
  for (const p of day.periods) for (const e of validatePeriod(p).errors) errors.push(`“${p.title}”: ${e}`);
  const taken = new Set(week.days.flatMap((d) => [d.id, ...d.periods.map((p) => p.id)]).concat([week.id]));
  for (const id of [day.id, ...day.periods.map((p) => p.id)]) if (taken.has(id)) errors.push(`Id “${id}” is already used in this week.`);
  if (new Set(day.periods.map((p) => p.id)).size !== day.periods.length) errors.push('Period ids must be unique.');
  return errors;
}

// ---------------------------------------------------------------- shorten
// Supported: scheduled periods back to back, and parallel stations of equal
// length. Each block is scaled down (whole minutes, none below
// SHORTEN_FLOOR_MIN or its own length) so the copy runs exactly `target` min.
export function proposeShortened(day, targetMinutes) {
  const errors = [];
  const T = targetMinutes;
  if (!isInt(T)) errors.push('Shorter length must be a whole number of minutes.');
  else if (T < DAY_LIMITS.plannedMin || T > DAY_LIMITS.plannedMax) errors.push(`Shorter length must be ${DAY_LIMITS.plannedMin}–${DAY_LIMITS.plannedMax} minutes.`);
  const s = computeSchedule(day);
  if (!s.items.length) errors.push('This day has no scheduled periods to shorten.');
  const fixed = day.periods.filter((p) => p.scheduled && p.fixedStart !== null && p.fixedStart !== undefined);
  if (fixed.length) errors.push(`Not supported: ${fixed.map((p) => `“${p.title}”`).join(', ')} ${fixed.length === 1 ? 'has a fixed start time' : 'have fixed start times'}. Shortening only handles back-to-back periods and equal-length parallel stations; clear the fixed start first.`);
  const title = new Map(day.periods.map((p) => [p.id, p.title]));
  const blocks = [];
  for (const it of s.items) {
    let b = blocks[blocks.length - 1];
    if (!b || b.block !== it.block) { b = { block: it.block, periodIds: [], minutes: [] }; blocks.push(b); }
    b.periodIds.push(it.periodId);
    b.minutes.push(it.minutes);
  }
  for (const b of blocks) {
    if (new Set(b.minutes).size > 1) errors.push(`Not supported: parallel stations ${b.periodIds.map((id, i) => `“${title.get(id)}” (${b.minutes[i]} min)`).join(', ')} have different lengths. Make them equal first.`);
  }
  if (errors.length) return { ok: false, errors };
  if (T >= s.totalMin) return { ok: false, errors: [`The day already runs ${s.totalMin} min; choose fewer than ${s.totalMin} minutes.`] };
  const parts = blocks.map((b) => ({ weight: b.minutes[0], min: Math.min(b.minutes[0], SHORTEN_FLOOR_MIN), max: b.minutes[0], mult: 1 }));
  const floor = sum(parts.map((x) => x.min));
  if (floor > T) return { ok: false, errors: [`Too short: with every block kept at ${SHORTEN_FLOOR_MIN} min or more (or its own length if shorter), this day needs at least ${floor} min.`] };
  const alloc = allocateMinutes(parts, T);
  if (!alloc) return { ok: false, errors: [`${T} min cannot be split into whole minutes for this day.`] };
  return {
    ok: true,
    dayId: day.id,
    dayVersion: day.version,
    fromMin: s.totalMin,
    toMin: T,
    floorMin: floor,
    rows: blocks.map((b, i) => ({ periodIds: b.periodIds.slice(), title: b.periodIds.map((id) => title.get(id)).join(' + '), fromMin: b.minutes[0], toMin: alloc[i] })),
  };
}

// Adds the shortened copy right after the original. The original day object is
// returned untouched in the new week; the copy has new day and period ids and
// its own arrays. Rotations and availability stay with the original day.
export function applyShortened(week, dayId, targetMinutes, ids, { label } = {}) {
  const i = week.days.findIndex((d) => d.id === dayId);
  if (i < 0) return { ok: false, errors: ['That day is not in this week.'] };
  const src = week.days[i];
  const r = proposeShortened(src, targetMinutes);
  if (!r.ok) return r;
  const toById = new Map(r.rows.flatMap((row) => row.periodIds.map((id) => [id, row.toMin])));
  const idMap = {};
  const periods = src.periods.map((p) => {
    const nid = ids('per');
    idMap[p.id] = nid;
    const { id: _id, ...fields } = p;
    return newPeriod(nid, { ...fields, minutes: toById.get(p.id) ?? p.minutes });
  });
  const notes = truncate(`Shorter alternative of “${src.label}” (day v${src.version}): ${r.fromMin} → ${r.toMin} min. The original day is unchanged.${src.notes ? `\n${src.notes}` : ''}`, DAY_LIMITS.notes);
  const day = newDay(ids('day'), { label: truncate(label || `${src.label} · ${r.toMin} min`, DAY_LIMITS.label), date: src.date, startMin: src.startMin, plannedMinutes: r.toMin, notes, periods });
  const errors = dayErrors(week, day);
  if (computeSchedule(day).totalMin !== r.toMin) errors.push('The shortened copy would not run the chosen length.');
  if (errors.length) return { ok: false, errors };
  return { ok: true, week: addDay(week, day, i + 1), dayId: day.id, day, idMap, preview: r };
}
