// Builds content/library.json: fictional/generic drills, day templates, scout
// groups and scout cards. Run: node tools/build-library.mjs
// Everything here is FICTIONAL / REFERENCE content written for this prototype.
// Cues are generic reference wording, not program rules.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------- groups
const groups = [
  { id: 'grp-skill', label: 'Scout Skill A', roles: [
    { slotId: 'grp-skill-qb', roleKey: 'QB', label: 'QB' },
    { slotId: 'grp-skill-rb', roleKey: 'RB', label: 'RB' },
    { slotId: 'grp-skill-wr1', roleKey: 'WR', label: 'WR 1' },
    { slotId: 'grp-skill-wr2', roleKey: 'WR', label: 'WR 2' },
    { slotId: 'grp-skill-te', roleKey: 'TE', label: 'TE' },
  ] },
  { id: 'grp-line', label: 'Scout Line', roles: [
    { slotId: 'grp-line-lt', roleKey: 'OL', label: 'LT' },
    { slotId: 'grp-line-lg', roleKey: 'OL', label: 'LG' },
    { slotId: 'grp-line-c', roleKey: 'OL', label: 'C' },
    { slotId: 'grp-line-rg', roleKey: 'OL', label: 'RG' },
    { slotId: 'grp-line-rt', roleKey: 'OL', label: 'RT' },
  ] },
  { id: 'grp-pass', label: 'Scout Pass B', roles: [
    { slotId: 'grp-pass-qb', roleKey: 'QB', label: 'QB' },
    { slotId: 'grp-pass-rb', roleKey: 'RB', label: 'RB' },
    { slotId: 'grp-pass-wr1', roleKey: 'WR', label: 'WR 1' },
    { slotId: 'grp-pass-wr2', roleKey: 'WR', label: 'WR 2' },
    { slotId: 'grp-pass-wr3', roleKey: 'WR', label: 'WR 3' },
    { slotId: 'grp-pass-te', roleKey: 'TE', label: 'TE' },
  ] },
];

// ---------------------------------------------------------------- drills
const drill = (id, title, category, defaultMinutes, objective, setup, steps, cues, tags, equipment) =>
  ({ id, title, category, defaultMinutes, objective, setup, steps, cues: cues.map((c) => `REFERENCE / FICTIONAL cue (generic): ${c}`), tags, equipment });

const drills = [
  drill('drill-align-walk', 'Alignment & assignment walkthrough', 'walkthrough', 15,
    'Every defender can name alignment, key and first step against the shown look.',
    'Scout group sets the card at walk tempo. Defense in its base front.',
    ['Scout look sets on the coach\'s call.', 'Defense aligns and calls the formation out loud.', 'Coach checks alignment, then “go” at walk tempo.', 'Reset and show the next card.'],
    ['Eyes to the key before the snap.', 'Talk: name the strength out loud.'],
    ['walkthrough', 'install'], ['Cones (4)', 'Scout cards']),
  drill('drill-formation-flash', 'Formation recognition flash', 'walkthrough', 10,
    'Name the formation and its strength within a three-count.',
    'Coach holds up scout cards; players answer as a unit.',
    ['Show a card for a three-count.', 'Unit calls formation and strength.', 'Coach confirms or corrects, next card.'],
    ['Count receivers to each side first.'],
    ['recognition'], ['Scout card stack', 'Whiteboard']),
  drill('drill-pursuit', 'Pursuit angles (no contact)', 'individual', 10,
    'Take a leverage angle to the ball and finish to a cone landmark.',
    'Ball carrier in pinnie runs to a cone; defenders start from alignment.',
    ['Carrier breaks to a sideline cone.', 'Defenders take an angle that stays inside-out.', 'Finish through the landmark cone, no contact.'],
    ['Aim in front of the ball, not at it.'],
    ['pursuit', 'no-contact'], ['Cones (8)', 'Pinnie (1)']),
  drill('drill-zone-drops', 'Zone drop landmarks', 'individual', 10,
    'Open to the correct landmark and find the nearest threat.',
    'Landmark cones at generic depths; coach signals the drop.',
    ['Coach signals the drop.', 'Open and work to the landmark.', 'Eyes to the throw-side threat, break on the point.'],
    ['Get to depth before widening.'],
    ['coverage'], ['Landmark cones (6)', 'Footballs (2)']),
  drill('drill-shed-fits', 'Block-shed fits (fit tempo)', 'individual', 15,
    'Fit into the assigned gap with hands inside and eyes on the ball.',
    'Hand shields held by scout line; tempo set by the coach.',
    ['Shield holder shows a block angle.', 'Defender fits the gap at fit tempo.', 'Shed to the ball side on the whistle.'],
    ['Hands inside, keep the outside arm free.'],
    ['run-fit', 'tempo-controlled'], ['Hand shields (4)']),
  drill('drill-run-fit', 'Run fit vs. scout look', 'group', 20,
    'Fill assigned gaps against the scout look\'s run.',
    'Scout skill + line show the card; defense fits on the snap.',
    ['Scout group runs the card at coach tempo.', 'Defense fits gaps, coach freezes on the whistle.', 'Check every gap is owned, then reset.'],
    ['Every gap owned once, nobody twice.'],
    ['run-fit', 'scout'], ['Scout cards', 'Pinnies (scout)']),
  drill('drill-pattern-read', 'Pattern read vs. skeleton look', 'group', 15,
    'Recognize the route pattern and match the threat to the zone.',
    'Scout pass group runs card routes, no line.',
    ['Scout QB calls the card.', 'Routes run on the snap, ball thrown on time.', 'Coach reviews the read after each rep.'],
    ['Read the inside receiver\'s release first.'],
    ['coverage', 'scout'], ['Footballs (3)', 'Cones (4)', 'Scout cards']),
  drill('drill-rush-lanes', 'Rush-lane integrity', 'group', 10,
    'Keep rush lanes so the passer has no clean escape.',
    'Scout line on bags; rushers work their lanes.',
    ['Line sets on bags.', 'Rushers attack their lane on the snap.', 'Freeze on the whistle and check lanes.'],
    ['Stay in your lane; collapse together.'],
    ['pass-rush'], ['Bags (4)', 'Cone for the passer']),
  drill('drill-takeaway', 'Ball-security / takeaway circuit', 'individual', 10,
    'Finish plays by attacking the ball in a controlled circuit.',
    'Three stations, rotate on the whistle.',
    ['Station 1: scoop-and-secure.', 'Station 2: tip drill.', 'Station 3: high-point catch.'],
    ['Eyes on the ball through the catch.'],
    ['takeaway'], ['Footballs (6)', 'Cones (6)']),
  drill('drill-situations', 'Situations: call-and-check', 'team', 15,
    'Recognize down, distance and look; get the call in and check correctly.',
    'Coach announces a situation; scout group shows a card.',
    ['Coach states down, distance, field position.', 'Signal the call; scout sets the look.', 'Defense checks if needed; run the rep at coach tempo.'],
    ['Get the call, then get the look.'],
    ['situations', 'communication'], ['Down markers', 'Scout cards', 'Call board']),
  drill('drill-team-scout', 'Team vs. scout look', 'team', 20,
    'Execute the call as a unit against a sequence of scout looks.',
    'Full scout offense shows cards in script order.',
    ['Scout group huddles with the card.', 'Defense gets the call.', 'Rep at coach tempo; coach corrects between reps.'],
    ['Communicate the strength before the snap.'],
    ['team', 'scout'], ['Scout cards', 'Pinnies (scout)', 'Footballs (2)']),
];

// ---------------------------------------------------------------- cards
// Diagram space: 100 x 60 units, illustrative and not to scale. Offense below
// the line of scrimmage (y = 24), routes point up the page toward the defense.
const LOS = 24;
const T = (id, label, x, y) => ({ id, label, x, y, side: 'O' });
const A = (id, from, to, kind = 'route', label = '') => ({ id, from, to, kind, label });
const line = () => [T('lt', 'LT', 40, 26), T('lg', 'LG', 45, 26), T('c', 'C', 50, 26), T('rg', 'RG', 55, 26), T('rt', 'RT', 60, 26)];
const at = (t) => ({ x: t.x, y: t.y });

function card(id, title, lookLabel, family, tokens, arrows, notes, cues) {
  return {
    id, version: 1, title, lookLabel, family,
    diagram: { width: 100, height: 60, los: LOS, tokens: line().concat(tokens), arrows },
    notes, cues: cues.map((c) => `REFERENCE / FICTIONAL: ${c}`), fictional: true, provenance: null,
  };
}

const cards = [];
{
  const x = T('x', 'X', 8, 26), h = T('h', 'H', 68, 27), y = T('y', 'Y', 80, 27), z = T('z', 'Z', 93, 26), qb = T('qb', 'QB', 50, 34), rb = T('rb', 'RB', 45, 34);
  cards.push(card('card-trips-rt', 'Trips Right — gun', 'Trips Right (gun)', 'trips', [x, h, y, z, qb, rb],
    [A('a1', at(x), { x: 8, y: 4 }), A('a2', at(h), { x: 66, y: 8 }), A('a3', at(y), { x: 86, y: 14 }), A('a4', at(z), { x: 93, y: 16 })],
    'Sample trips look to the field. Count three receivers to the right and call strength right.',
    ['Strength is to the trips side in this sample.']));
}
{
  const x = T('x', 'X', 8, 26), h = T('h', 'H', 20, 27), y = T('y', 'Y', 65, 26), z = T('z', 'Z', 92, 26), qb = T('qb', 'QB', 50, 29), rb = T('rb', 'RB', 50, 37);
  cards.push(card('card-twins-lt', 'Twins Left — under center', 'Twins Left (under center)', 'twins', [x, h, y, z, qb, rb],
    [A('a1', at(rb), { x: 44, y: 22 }, 'run'), A('a2', at(h), { x: 26, y: 12 })],
    'Two receivers left, inline tight end right, single back. Generic run look.',
    ['Two receivers to one side, tight end to the other.']));
}
{
  const x = T('x', 'X', 6, 26), h = T('h', 'H', 18, 27), f = T('f', 'F', 30, 27), y = T('y', 'Y', 80, 27), z = T('z', 'Z', 94, 26), qb = T('qb', 'QB', 50, 34);
  cards.push(card('card-empty-32', 'Empty 3x2', 'Empty 3x2', 'empty', [x, h, f, y, z, qb],
    [A('a1', at(f), { x: 40, y: 10 }), A('a2', at(h), { x: 18, y: 6 }), A('a3', at(y), { x: 72, y: 12 })],
    'No back in the backfield. Three receivers left, two right.',
    ['Empty: five eligible receivers spread out.']));
}
{
  const x = T('x', 'X', 8, 26), y = T('y', 'Y', 70, 26.5), h = T('h', 'H', 73, 29.5), z = T('z', 'Z', 76, 26.5), qb = T('qb', 'QB', 50, 34), rb = T('rb', 'RB', 55, 34);
  cards.push(card('card-bunch-rt', 'Bunch Right — gun', 'Bunch Right (gun)', 'bunch', [x, y, h, z, qb, rb],
    [A('a1', at(y), { x: 66, y: 10 }), A('a2', at(h), { x: 90, y: 18 }), A('a3', at(z), { x: 80, y: 8 })],
    'Three receivers stacked tight to the right. Releases cross quickly.',
    ['Bunch: tight split, releases cross.']));
}
{
  const x = T('x', 'X', 8, 26), y = T('y', 'Y', 65, 26), z = T('z', 'Z', 92, 26), qb = T('qb', 'QB', 50, 29), fb = T('fb', 'FB', 53, 33), rb = T('rb', 'RB', 50, 38);
  cards.push(card('card-pro-i', 'Pro I — offset fullback', 'Pro I (offset)', 'i-form', [x, y, z, qb, fb, rb],
    [A('a1', at(rb), { x: 56, y: 20 }, 'run'), A('a2', at(fb), { x: 58, y: 22 }, 'block', 'lead')],
    'Two backs stacked, fullback offset strong. Generic downhill run look.',
    ['Two backs: count the extra blocker.']));
}
{
  const x = T('x', 'X', 8, 26), h = T('h', 'H', 22, 27), y = T('y', 'Y', 78, 27), z = T('z', 'Z', 92, 26), qb = T('qb', 'QB', 50, 34), rb = T('rb', 'RB', 45, 34);
  cards.push(card('card-doubles', 'Doubles 2x2 — gun', 'Doubles 2x2 (gun)', 'doubles', [x, h, y, z, qb, rb],
    [A('a1', at(h), { x: 22, y: 6 }), A('a2', at(y), { x: 78, y: 6 }), A('a3', at(x), { x: 14, y: 16 }), A('a4', at(z), { x: 86, y: 16 })],
    'Two receivers each side, one back. Balanced passing look.',
    ['Balanced: identify the back\'s side.']));
}
{
  const x = T('x', 'X', 10, 26), y = T('y', 'Y', 65, 26), y2 = T('y2', 'Y2', 35, 26), qb = T('qb', 'QB', 50, 29), rb = T('rb', 'RB', 50, 37), w = T('w', 'W', 68, 29);
  cards.push(card('card-heavy', 'Heavy — two tight ends', 'Heavy (2 TE)', 'heavy', [x, y2, y, w, qb, rb],
    [A('a1', at(rb), { x: 62, y: 20 }, 'run'), A('a2', at(w), { x: 70, y: 22 }, 'block')],
    'Tight ends on both sides plus a wing. Short-yardage sample look.',
    ['Heavy: extra blockers on both edges.']));
}
{
  const x = T('x', 'X', 8, 26), y = T('y', 'Y', 65, 26), w = T('w', 'W', 68, 29.5), z = T('z', 'Z', 92, 26), qb = T('qb', 'QB', 50, 31), rb = T('rb', 'RB', 50, 37);
  cards.push(card('card-pistol-wing', 'Pistol — wing right', 'Pistol Wing Right', 'pistol', [x, y, w, z, qb, rb],
    [A('a1', at(w), { x: 54, y: 30 }, 'motion', 'motion'), A('a2', at(rb), { x: 44, y: 20 }, 'run')],
    'Back directly behind the QB, wing off the tight end. Motion across is common in this sample.',
    ['Motion can change strength — re-count.']));
}
{
  const x = T('x', 'X', 8, 26), y = T('y', 'Y', 35, 26), h = T('h', 'H', 78, 27), z = T('z', 'Z', 92, 26), qb = T('qb', 'QB', 50, 29), rb = T('rb', 'RB', 50, 36);
  cards.push(card('card-ace-twins-rt', 'Ace — twins right', 'Ace Twins Right', 'ace', [x, y, h, z, qb, rb],
    [A('a1', at(h), { x: 76, y: 10 }), A('a2', at(z), { x: 92, y: 12 })],
    'Single back, tight end left, two receivers right.',
    ['Tight end and twins on opposite sides.']));
}

// ---------------------------------------------------------------- templates
const P = (title, category, minutes, extra = {}) => ({ title, category, minutes, drillId: null, objective: '', callLabel: '', cardIds: [], groupIds: [], equipment: [], notes: '', parallel: false, ...extra });
const fromDrill = (id, extra = {}) => {
  const d = drills.find((x) => x.id === id);
  return P(d.title, d.category, d.defaultMinutes, { drillId: id, objective: d.objective, equipment: d.equipment.slice(), ...extra });
};
const SL = ['grp-skill', 'grp-line'];

const templates = [
  { id: 'tpl-mon', label: 'Monday — install walkthrough', dayLabel: 'Monday', description: 'Walk-tempo install of the opponent looks.', startMin: 930, plannedMinutes: 90, periods: [
    P('Warm-up', 'individual', 10),
    fromDrill('drill-formation-flash', { cardIds: ['card-trips-rt', 'card-twins-lt', 'card-empty-32'], callLabel: 'Name it' }),
    fromDrill('drill-align-walk', { minutes: 20, cardIds: ['card-trips-rt'], groupIds: SL, callLabel: 'Base vs. Trips' }),
    P('Water break', 'break', 5),
    fromDrill('drill-zone-drops', { minutes: 15 }),
    fromDrill('drill-team-scout', { cardIds: ['card-trips-rt', 'card-bunch-rt'], groupIds: SL, callLabel: 'Walk-tempo script' }),
    P('Review & wrap', 'walkthrough', 10, { objective: 'Each position group states one key from today.' }),
  ] },
  { id: 'tpl-tue', label: 'Tuesday — run defense emphasis', dayLabel: 'Tuesday', description: 'Run fits and pursuit against the scout run looks.', startMin: 930, plannedMinutes: 120, periods: [
    P('Warm-up', 'individual', 10),
    fromDrill('drill-pursuit'),
    fromDrill('drill-shed-fits'),
    P('Water break', 'break', 5),
    fromDrill('drill-run-fit', { cardIds: ['card-pro-i', 'card-heavy'], groupIds: SL, callLabel: 'Base vs. Pro I' }),
    fromDrill('drill-rush-lanes', { groupIds: ['grp-line'] }),
    P('Water break', 'break', 5),
    fromDrill('drill-team-scout', { minutes: 25, cardIds: ['card-pro-i', 'card-doubles'], groupIds: SL, callLabel: 'Run downs script' }),
    fromDrill('drill-takeaway'),
    P('Review & wrap', 'walkthrough', 10),
  ] },
  { id: 'tpl-wed', label: 'Wednesday — pass defense emphasis', dayLabel: 'Wednesday', description: 'Pattern reads and third-down looks, with two parallel stations.', startMin: 930, plannedMinutes: 120, periods: [
    P('Warm-up', 'individual', 10),
    fromDrill('drill-zone-drops'),
    fromDrill('drill-pattern-read', { cardIds: ['card-empty-32', 'card-bunch-rt'], groupIds: ['grp-pass'] }),
    P('Water break', 'break', 5),
    fromDrill('drill-run-fit', { title: 'Station A — inside run', cardIds: ['card-twins-lt'], groupIds: SL, callLabel: 'Base vs. Twins' }),
    fromDrill('drill-pattern-read', { title: 'Station B — skeleton', minutes: 20, cardIds: ['card-trips-rt'], groupIds: ['grp-pass'], parallel: true, callLabel: 'Cover call vs. Trips' }),
    P('Water break', 'break', 5),
    fromDrill('drill-team-scout', { title: 'Third-down team', minutes: 25, cardIds: ['card-doubles', 'card-empty-32'], groupIds: SL, callLabel: '3rd & medium script' }),
    fromDrill('drill-situations', { minutes: 10, cardIds: ['card-bunch-rt'], groupIds: SL }),
    fromDrill('drill-takeaway'),
    P('Review & wrap', 'walkthrough', 10),
  ] },
  { id: 'tpl-thu', label: 'Thursday — situations & review', dayLabel: 'Thursday', description: 'Situations, red zone and two-minute at controlled tempo.', startMin: 930, plannedMinutes: 100, periods: [
    P('Warm-up', 'individual', 10),
    fromDrill('drill-formation-flash', { cardIds: ['card-pistol-wing', 'card-heavy', 'card-ace-twins-rt'] }),
    fromDrill('drill-situations', { minutes: 20, cardIds: ['card-pistol-wing', 'card-heavy'], groupIds: SL, callLabel: 'Situation script A' }),
    P('Water break', 'break', 5),
    fromDrill('drill-team-scout', { title: 'Red zone team', cardIds: ['card-bunch-rt', 'card-ace-twins-rt'], groupIds: SL, callLabel: 'Red zone script' }),
    fromDrill('drill-situations', { title: 'Two-minute call-and-check', minutes: 15, cardIds: ['card-doubles'], groupIds: ['grp-pass'] }),
    P('Review & wrap', 'walkthrough', 10),
  ] },
  { id: 'tpl-fri', label: 'Friday — pre-game walkthrough', dayLabel: 'Friday', description: 'Short walk-tempo review of every look.', startMin: 900, plannedMinutes: 60, periods: [
    fromDrill('drill-align-walk', { cardIds: ['card-trips-rt', 'card-pro-i', 'card-empty-32'], groupIds: SL, callLabel: 'Every look once' }),
    fromDrill('drill-situations', { title: 'Special situations walk', cardIds: ['card-heavy'], groupIds: SL }),
    fromDrill('drill-team-scout', { title: 'Team walkthrough', cardIds: ['card-doubles', 'card-bunch-rt'], groupIds: SL }),
    P('Wrap', 'walkthrough', 10),
  ] },
];

const library = {
  about: 'FICTIONAL / REFERENCE content for the Practice Week Planner prototype. Generic drills and looks; not program doctrine.',
  groups,
  drills,
  templates,
  cards,
};
fs.writeFileSync(path.join(ROOT, 'content/library.json'), `${JSON.stringify(library, null, 2)}\n`);
console.log(`library: ${drills.length} drills, ${templates.length} templates, ${cards.length} cards, ${groups.length} groups`);
