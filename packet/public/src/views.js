// Printable and phone-readable content as plain view trees. Exactly one output is
// mounted at a time: Identify cards are built from the projection alone, so coach
// content is absent from the document rather than hidden by CSS.
import { JOB_LABELS, projectIdentifyCards, shortRevision, spatialLegend } from './cover3.js';
import { h, svg } from './dom.js';
import { JOB_COLORS, identifyField, studyField, teachingField } from './field.js';
import { formatClock12, formatMinutes } from './practice-time.js';

export const STAMP_REFERENCE = 'FICTIONAL / REFERENCE';
export const STAMP_DRAFT = 'authored DRAFT';

const stamps = () => h('p', { class: 'stamps' },
  h('span', { class: 'stamp' }, STAMP_REFERENCE),
  h('span', { class: 'stamp' }, STAMP_DRAFT));

const sheetHeader = (kicker, title, meta) => h('header', { class: 'sheet-header' },
  h('p', { class: 'kicker' }, kicker),
  title && h('h1', null, title),
  meta && h('p', { class: 'meta' }, meta),
  stamps());

const timeRange = (start, end) => `${formatClock12(start)}–${formatClock12(end)}`;

const labelled = (name, value) => value && h('p', { class: 'detail' }, h('strong', null, `${name}: `), value);

function periodFacts(period, item) {
  const facts = [formatMinutes(period.minutes), period.category];
  if (period.fixedStart !== null) facts.push(`fixed start ${formatClock12(period.fixedStart)}`);
  if (item?.gapBeforeMin) facts.push(`${item.gapBeforeMin} min gap before`);
  if (item?.overlapMin) facts.push(`overlaps previous by ${item.overlapMin} min`);
  return facts.join(' · ');
}

function periodBody(period, item, drillsById) {
  return [
    h('h4', null, period.title),
    h('p', { class: 'meta' }, periodFacts(period, item)),
    period.objective && h('p', { class: 'detail' }, period.objective),
    labelled('Call / look', period.callLabel),
    labelled('Drill', period.drillId && drillsById.get(period.drillId).title),
    labelled('Equipment', period.equipment.join(', ')),
    labelled('Notes', period.notes),
  ];
}

function scheduleSection(packet, periodsById, drillsById) {
  const blocks = new Map();
  for (const item of packet.schedule.items) {
    if (!blocks.has(item.block)) blocks.set(item.block, []);
    blocks.get(item.block).push(item);
  }
  return h('section', { class: 'section' },
    h('h2', null, 'Schedule'),
    !blocks.size && h('p', null, 'No periods are scheduled for this day.'),
    [...blocks.values()].map((items) => {
      const start = Math.min(...items.map((item) => item.startMin));
      const end = Math.max(...items.map((item) => item.endMin));
      const parallel = items.length > 1;
      return h('section', { class: parallel ? 'block block-parallel' : 'block' },
        h('h3', null, timeRange(start, end), parallel && ` · ${items.length} parallel stations`),
        h('ol', { class: 'periods' }, items.map((item) => h('li', { class: 'period' },
          h('p', { class: 'period-time' }, timeRange(item.startMin, item.endMin)),
          h('div', { class: 'period-body' }, periodBody(periodsById.get(item.periodId), item, drillsById))))));
    }));
}

function warningsSection(packet) {
  const { warnings } = packet.schedule;
  return h('section', { class: 'section' },
    h('h2', null, 'Schedule warnings'),
    warnings.length
      ? h('ul', { class: 'warnings' }, warnings.map((warning) => h('li', null, warning.message)))
      : h('p', null, 'None for this day.'));
}

function shelfSection(packet, periodsById, drillsById) {
  const { unscheduled } = packet.schedule;
  return h('section', { class: 'section' },
    h('h2', null, 'Unscheduled shelf'),
    unscheduled.length
      ? h('ul', { class: 'periods' }, unscheduled.map((id) => h('li', { class: 'period period-shelf' },
        h('div', { class: 'period-body' }, periodBody(periodsById.get(id), null, drillsById)))))
      : h('p', null, 'Nothing is on the shelf for this day.'));
}

const textList = (tag, items) => items.length > 0 && h(tag, null, items.map((item) => h('li', null, item)));

function drillsSection(packet) {
  return h('section', { class: 'section' },
    h('h2', null, 'Drill details'),
    !packet.drills.length && h('p', null, 'No drills are referenced by this day.'),
    packet.drills.map((drill) => h('article', { class: 'drill' },
      h('h3', null, drill.title),
      drill.objective && h('p', { class: 'detail' }, drill.objective),
      labelled('Setup', drill.setup),
      textList('ol', drill.steps),
      textList('ul', drill.cues),
      labelled('Equipment', drill.equipment.join(', ')),
      labelled('Tags', drill.tags.join(', ')))));
}

function provenanceSection(packet) {
  const { source, cover3, teaching } = packet;
  return h('section', { class: 'section provenance' },
    h('h2', null, 'Provenance'),
    h('p', { class: 'detail' }, `Practice ${source.projectName} (${source.projectId}, rev ${source.projectRev ?? 'not recorded'}); week ${source.weekId} v${source.weekVersion}; day ${source.dayId} v${source.dayVersion}; ${source.exportSchema} v${source.exportSchemaVersion}.`),
    teaching
      ? h('p', { class: 'detail' }, `Scheme package ${teaching.pin.packageId}, revision ${teaching.pin.revision}, digest ${teaching.pin.contentDigest}; call ${teaching.pin.callId}, digest ${teaching.pin.callDigest}.`)
      : h('p', { class: 'detail' }, `Teaching example ${cover3.pack.sourcePlayId}, ${cover3.pack.revision}, source head ${cover3.sourceHead}.`),
    h('p', { class: 'detail' }, 'These are copies made when the packet was created. They do not track later edits in either source app, and opening a packet writes to neither.'));
}

function legendView(pack) {
  return h('div', { class: 'legend' }, spatialLegend(pack).map((group) => h('section', { class: 'legend-group' },
    h('h3', null,
      svg('svg', { class: 'swatch', viewBox: '0 0 10 10', 'aria-hidden': 'true' },
        svg('circle', { cx: 5, cy: 5, r: 4.5, fill: JOB_COLORS[group.color].fill, stroke: JOB_COLORS[group.color].ink })),
      group.label),
    h('ul', null, group.entries.map((entry) => h('li', null, h('strong', null, entry.tag), ` — ${entry.areaLabel}`))))));
}

function teachingContent(pack) {
  return [
    h('figure', { class: 'figure' }, teachingField(pack)),
    legendView(pack),
    h('p', { class: 'meta' }, `${pack.diagram.family} · Revision ${shortRevision(pack.revision)} · copied snapshot`),
  ];
}

function teachingMeta(pack) {
  return `${pack.diagram.personnel} · ${pack.diagram.formation}`;
}

function coachKey(pack) {
  const unanswered = pack.unansweredDefenders.map((defender) => defender.tag).join(', ');
  return h('section', { class: 'page-start coach-key' },
    sheetHeader('Coach only', 'Coach key', `${pack.diagram.name} · Revision ${pack.revision}`),
    h('table', null,
      h('thead', null, h('tr', null, ['Card', 'Position', 'Area', 'Job'].map((title) => h('th', { scope: 'col' }, title)))),
      h('tbody', null, pack.answers.map((answer) => h('tr', null,
        h('td', null, answer.card),
        h('td', null, answer.tag),
        h('td', null, answer.areaLabel),
        h('td', null, JOB_LABELS[answer.job]))))),
    unanswered && h('p', { class: 'detail' }, `No authored area for ${unanswered}, so this key gives no answer for those positions.`));
}

// ---------------------------------------------------------------- version 2 teaching outputs
function exchangeTable(study) {
  if (!study.exchanges.length) return false;
  return h('section', { class: 'section' },
    h('h2', null, 'Read-dependent outcomes'),
    study.exchanges.map((item) => h('article', { class: 'scheme-block' },
      h('h3', null, item.condition),
      h('p', { class: 'meta' }, `Expected ${item.expectedRushCount} rush, ${item.expectedCoverageCount} coverage`),
      textList('ul', item.jobs.map((job) => `${job.positionLabel}: ${job.job}`)),
      textList('ul', item.replacements.map((entry) => `${entry.positionLabel} replaces with: ${entry.coverage}`)))));
}

/** Answers authored areas for the coach diagram. Areas stay out of every learner output. */
function coachPack(coach) {
  const { diagram, call } = coach;
  if (!diagram) return null;
  const labelOf = new Map(call.roles.map((role) => [role.roleId, role.positionLabel]));
  const answers = diagram.assignments.filter((item) => item.definition?.responsibilityArea).map((item) => {
    const area = item.definition.responsibilityArea;
    return { defenderId: item.playerId, tag: labelOf.get(item.playerId) ?? '?', color: area.color, center: area.center, radiusX: area.radiusX, radiusY: area.radiusY, areaLabel: area.label };
  });
  return { diagram, answers };
}

function schemeCoachSections(packet) {
  const { coach, study } = packet.teaching;
  const { call } = coach;
  const pack = coachPack(coach);
  const areaOf = new Map((pack?.answers ?? []).map((answer) => [answer.defenderId, answer.areaLabel]));
  const roleById = new Map(call.roles.map((role) => [role.roleId, role]));
  return [
    h('section', { class: 'page-start' },
      sheetHeader('Scheme call · coach only', call.title, `${call.rushFamily} · ${call.intendedRushCount} rush, ${call.anticipatedCoverageCount} coverage`),
      labelled('Approval claim', `${coach.approvalClaim.status}; local test action, unauthenticated, not program doctrine`),
      labelled('Default when ambiguous', call.ambiguousReadDefault),
      pack ? h('figure', { class: 'figure' }, teachingField(pack)) : h('p', { class: 'detail' }, 'The diagram for this call is held: it was not in the package.')),
    exchangeTable(study),
    h('section', { class: 'page-start coach-key scheme-key' },
      sheetHeader('Coach only', 'Coach key', `All eleven roles · revision ${packet.teaching.pin.revision}`),
      h('table', null,
        h('thead', null, h('tr', null, ['Card', 'Position', 'Unit', 'Responsibility', 'Area', 'Key'].map((title) => h('th', { scope: 'col' }, title)))),
        h('tbody', null, coach.keyEntries.map((entry) => h('tr', null,
          h('td', null, entry.card),
          h('td', null, entry.positionLabel),
          h('td', null, roleById.get(entry.roleId)?.unit ?? 'Not stated'),
          h('td', null, entry.responsibility),
          h('td', null, areaOf.get(entry.roleId) ?? 'No authored area'),
          h('td', null, entry.answer ?? 'Held: no authored key, so this question stays ungraded')))))),
    h('section', { class: 'section' },
      h('h2', null, 'Evidence (not doctrine)'),
      textList('ul', coach.sourceRefs.map((source) => `${source.locator} · ${source.reviewExtent} · ${source.url}`)),
      textList('ul', coach.interpretations.map((item) => `${item.analystClaim} ${item.coachAdaptation} ${item.uncertainty}`)),
      h('p', { class: 'detail' }, `Doctrine status: ${coach.authority.doctrineStatus}.`)),
  ];
}

/** Built from the study projection alone: it has no access to the coach record. */
export function studyView(study) {
  return h('article', { class: 'paper' },
    sheetHeader('Study sheet', study.callName, study.situation),
    h('figure', { class: 'figure' }, studyField(study.look, study.frame)),
    h('table', { class: 'scheme-study' },
      h('thead', null, h('tr', null, ['#', 'Position', 'Key', 'Decision', 'Responsibility', 'Run fit', 'Finish', 'Fallback'].map((title) => h('th', { scope: 'col' }, title)))),
      h('tbody', null, study.roles.map((role) => h('tr', null,
        h('td', null, role.ordinal), h('td', null, role.positionLabel), h('td', null, role.key), h('td', null, role.decision),
        h('td', null, role.responsibility), h('td', null, role.runFitOwnership), h('td', null, role.finish), h('td', null, role.fallback))))),
    exchangeTable(study),
    study.teachingCues.length > 0 && h('section', { class: 'section' }, h('h2', null, 'Teaching cues'), textList('ul', study.teachingCues)));
}

/** Maps strict projection cards to the shape identifyCardsView renders. */
export const projectSchemeCards = (identify) => identify.cards.map((card) => ({
  number: card.card, total: card.total, prompt: card.prompt, context: `${card.context.callName} · ${card.context.situation}`, frame: card.frame,
  diagram: { players: card.look.offense, defenders: card.look.defense, fieldSide: card.look.fieldSide },
}));

export function coachView(packet) {
  const { day, schedule, drills, cover3 } = packet;
  const periodsById = new Map(day.periods.map((period) => [period.id, period]));
  const drillsById = new Map(drills.map((drill) => [drill.id, drill]));
  const when = [
    day.date,
    timeRange(schedule.startMin, schedule.endMin),
    `${formatMinutes(schedule.totalMin)} scheduled of ${formatMinutes(schedule.plannedMin)} planned`,
    packet.source.timezone,
  ].filter(Boolean).join(' · ');
  return h('article', { class: 'paper' },
    sheetHeader('Coach packet', day.label, when),
    warningsSection(packet),
    scheduleSection(packet, periodsById, drillsById),
    shelfSection(packet, periodsById, drillsById),
    day.notes && h('section', { class: 'section' }, h('h2', null, 'Day notes'), h('p', { class: 'detail' }, day.notes)),
    drillsSection(packet),
    provenanceSection(packet),
    packet.teaching ? schemeCoachSections(packet) : [
      h('section', { class: 'page-start' },
        sheetHeader('Teaching example', cover3.pack.diagram.name, teachingMeta(cover3.pack)),
        teachingContent(cover3.pack)),
      coachKey(cover3.pack),
    ]);
}

export function assignmentView(packet) {
  const { pack } = packet.cover3;
  return h('article', { class: 'paper' },
    sheetHeader('Assignment sheet', pack.diagram.name, teachingMeta(pack)),
    teachingContent(pack));
}

/** Receives projected cards only; it has no access to the packet. */
export function identifyCardsView(cards) {
  return h('div', { class: 'paper identify-set' }, cards.map((card) => h('article', { class: 'identify-card' },
    sheetHeader(`Identify card ${card.number} of ${card.total}`),
    card.context && h('p', { class: 'meta' }, card.context),
    h('figure', { class: 'figure' }, identifyField(card.diagram, card.frame)),
    h('p', { class: 'prompt' }, card.prompt ?? 'What does the ★ defender do on this look?'),
    h('div', { class: 'write-lines', 'aria-hidden': 'true' }, h('span'), h('span')))));
}

export function viewFor(packet) {
  if (packet.teaching && packet.output === 'identify') return identifyCardsView(projectSchemeCards(packet.teaching.identify));
  if (packet.teaching && packet.output === 'assignment') return studyView(packet.teaching.study);
  if (packet.output === 'identify') return identifyCardsView(projectIdentifyCards(packet.cover3.pack));
  if (packet.output === 'assignment') return assignmentView(packet);
  return coachView(packet);
}

export const emptyView = () => h('div', { class: 'empty' },
  h('h2', null, 'No packet yet'),
  h('p', null, 'Load the sample or import a Practice JSON file, then choose a practice day. An exported packet can be opened the same way.'));
