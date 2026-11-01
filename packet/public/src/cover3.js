// Authored Cover 3 snapshot: allowlisted copy, integrity check, spatial legend and
// the answer-free projection. No answers are ever derived or invented here.
import { PacketError, clone, isPlainObject } from './common.js';
import { sampleCover3 } from './sample-cover3.js';

export const IDENTIFY_MARKER = '★';
const NEUTRAL_OFFENSE_LABELS = new Set(['LT', 'LG', 'C', 'RG', 'RT', 'X', 'Y', 'F', 'Z', 'H', 'Q']);

export const JOB_LABELS = Object.freeze({ 'deep-third': 'Deep third', hook: 'Hook', flat: 'Flat' });
const JOB_ORDER = ['deep-third', 'hook', 'flat'];

const pick = (source, keys) => Object.fromEntries(keys.map((key) => [key, clone(source[key] ?? null)]));

const DIAGRAM_KEYS = ['id', 'name', 'fieldSide', 'family', 'formation', 'personnel'];
const PLAYER_KEYS = ['id', 'label', 'sourceLabel', 'x', 'y'];
const DEFENDER_KEYS = ['id', 'label', 'x', 'y'];
const ASSIGNMENT_KEYS = ['id', 'playerId', 'unit', 'phase', 'type', 'pace', 'delay', 'geometryMode', 'preset', 'points', 'definition', 'templateOverride'];
const ANSWER_KEYS = ['card', 'defenderId', 'assignmentId', 'tag', 'defenderLabel', 'areaLabel', 'job', 'color', 'center', 'radiusX', 'radiusY'];

/** Allowlisted snapshot of the authored example document. */
export function cover3SnapshotFrom(doc) {
  if (!isPlainObject(doc) || doc.fictional !== true) throw new PacketError('The teaching example must be marked fictional.');
  if (doc.status !== 'authored-draft') throw new PacketError('The teaching example must be an authored draft.');
  const pack = doc.pack;
  if (!isPlainObject(pack) || !isPlainObject(pack.diagram) || !Array.isArray(pack.answers) || !pack.answers.length) {
    throw new PacketError('The teaching example has no authored answers.');
  }
  const { diagram } = pack;
  return {
    status: doc.status,
    sourceHead: doc.sourceHead,
    pack: {
      sourcePlayId: pack.sourcePlayId,
      revision: pack.revision,
      diagram: {
        ...pick(diagram, DIAGRAM_KEYS),
        players: diagram.players.map((player) => pick(player, PLAYER_KEYS)),
        defenders: diagram.defenders.map((defender) => pick(defender, DEFENDER_KEYS)),
        assignments: diagram.assignments.map((assignment) => pick(assignment, ASSIGNMENT_KEYS)),
      },
      answers: pack.answers.map((answer) => pick(answer, ANSWER_KEYS)),
      issues: clone(pack.issues),
      unansweredDefenders: clone(pack.unansweredDefenders),
    },
  };
}

const BUNDLED = cover3SnapshotFrom(sampleCover3);

export const bundledCover3 = () => clone(BUNDLED);

function contains(expected, actual) {
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && actual.length === expected.length && expected.every((value, i) => contains(value, actual[i]));
  }
  if (isPlainObject(expected)) {
    return isPlainObject(actual) && Object.keys(expected).every((key) => contains(expected[key], actual[key]));
  }
  return expected === actual;
}

/**
 * Only the bundled example may enter a packet, so a packet can never carry another
 * playbook. Returns the trusted copy, which also drops any extra keys in the input.
 */
export function verifyCover3(input) {
  if (!contains(BUNDLED, input)) {
    throw new PacketError('The teaching snapshot does not match the bundled authored example.');
  }
  return bundledCover3();
}

export const shortRevision = (revision) => String(revision ?? '').replace(/^rev-/, '').slice(0, 8);

/** Job groups in teaching order, each read left to right across the field. */
export function spatialLegend(pack) {
  return JOB_ORDER.map((job) => {
    const answers = pack.answers.filter((answer) => answer.job === job).sort((a, b) => a.center[0] - b.center[0]);
    return {
      job,
      label: JOB_LABELS[job],
      color: answers[0]?.color ?? null,
      entries: answers.map((answer) => ({ tag: answer.tag, areaLabel: answer.areaLabel })),
    };
  }).filter((group) => group.entries.length);
}

const byAlignment = (a, b) => (a.x - b.x) || (a.y - b.y) || String(a.id).localeCompare(String(b.id));

/**
 * A new object holding only the look: alignment and neutral offense labels.
 * Same semantics as the source helper: no source ids, names, defender labels or
 * assignments exist here, so nothing answer-bearing can reach the rendered card.
 */
export function identifyDiagram(play, focusDefenderId = null) {
  const players = (play.players ?? []).map((player, i) => ({
    id: `o${i + 1}`,
    label: NEUTRAL_OFFENSE_LABELS.has(player.label) ? player.label : `O${i + 1}`,
    x: player.x,
    y: player.y,
  }));
  const defenders = [...(play.defenders ?? [])].sort(byAlignment).map((defender, i) => ({
    id: `d${i + 1}`,
    label: defender.id === focusDefenderId ? IDENTIFY_MARKER : '',
    x: defender.x,
    y: defender.y,
  }));
  return {
    id: 'identify',
    name: 'Identify card',
    family: 'Identify',
    formation: 'this look',
    personnel: 'positions only',
    folder: 'Identify',
    fieldSide: ['left', 'right'].includes(play.fieldSide) ? play.fieldSide : 'none',
    players,
    defenders,
    assignments: [],
  };
}

/** One answer-free card per answered defender, in card order. */
export function projectIdentifyCards(pack) {
  const focusIds = [...new Set(pack.answers.map((answer) => answer.defenderId))];
  return focusIds.map((focusId, i) => ({
    number: i + 1,
    total: focusIds.length,
    diagram: identifyDiagram(pack.diagram, focusId),
  }));
}
