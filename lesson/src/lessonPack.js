import { hasResponsibilityArea, responsibilityAreaError, responsibilityOwnerKeys } from './responsibilityArea.js';
import { clonePlaybook } from './playData.js';

/*
 * Author-once lesson pack: one diagram yields an assignment sheet, answer-free
 * Identify cards, and a coach key bound to the diagram's content revision.
 * Pure and synchronous; packs are session snapshots, never workspace data.
 */

/** Teachable content only. Camera, selection and view state can never stale a key. */
const REVISION_FIELDS = ['name', 'family', 'formation', 'personnel', 'fieldSide', 'players', 'defenders', 'assignments'];

/** Sorted keys, undefined dropped, arrays in order: property order cannot change the result. */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(item => item === undefined ? 'null' : canonical(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).filter(key => value[key] !== undefined).sort()
      .map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** FNV-1a, 64-bit. Deterministic and dependency-free; not a security hash. */
function fnv1a64(text) {
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i++) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
}

/**
 * The diagram's content revision. Distinct from `responsibilityArea.version`,
 * which is only a schema marker. The play id is checked separately for staleness.
 */
export function lessonRevision(play) {
  const content = {};
  for (const field of REVISION_FIELDS) content[field] = play?.[field];
  content.fieldSide = play?.fieldSide ?? 'none';
  return `rev-${fnv1a64(canonical(content))}`;
}

export const shortRevision = revision => String(revision ?? '').replace(/^rev-/, '').slice(0, 8);

const byAlignment = (a, b) => (a.x - b.x) || (a.y - b.y) || String(a.id).localeCompare(String(b.id));

/**
 * Snapshots the play and derives the coach's answers from authored areas only.
 * Anything that cannot be answered honestly becomes an issue, never a guess.
 */
export function createLessonPack(play) {
  const diagram = clonePlaybook(play);
  const defenders = diagram.defenders ?? [];
  const tags = responsibilityOwnerKeys(diagram);
  const tagOf = id => tags.get(id) ?? null;
  const zones = (diagram.assignments ?? []).filter(a => a.unit === 'defense' && a.type === 'Zone');
  const issues = [];
  const owned = [];

  for (const assignment of zones) {
    const defender = defenders.find(d => d.id === assignment.playerId);
    if (!defender) {
      if (hasResponsibilityArea(assignment)) issues.push({ code: 'dangling-owner', assignmentId: assignment.id, defenderId: assignment.playerId ?? null, tag: null,
        message: 'A responsibility area belongs to a defender who is no longer on this diagram. It is left out of the key.' });
      continue;
    }
    const tag = tagOf(defender.id);
    if (!hasResponsibilityArea(assignment)) {
      issues.push({ code: 'missing-area', assignmentId: assignment.id, defenderId: defender.id, tag,
        message: `${tag} has a zone assignment but no authored responsibility area, so there is no card or answer for this position.` });
      continue;
    }
    const area = assignment.definition.responsibilityArea;
    const error = responsibilityAreaError(area);
    if (error) {
      issues.push({ code: 'invalid-area', assignmentId: assignment.id, defenderId: defender.id, tag,
        message: `${tag}'s responsibility area cannot be used (${error}), so there is no card or answer for this position.` });
      continue;
    }
    owned.push({ assignment, defender, area, tag });
  }

  // Cards follow alignment, not job grouping, so a card number cannot hint at the answer.
  const cardDefenders = [...new Map(owned.map(item => [item.defender.id, item.defender])).values()].sort(byAlignment);
  const cardOf = new Map(cardDefenders.map((d, i) => [d.id, i + 1]));
  for (const defender of cardDefenders) {
    const count = owned.filter(item => item.defender.id === defender.id).length;
    if (count > 1) issues.push({ code: 'multiple-areas', defenderId: defender.id, tag: tagOf(defender.id), assignmentId: null,
      message: `${tagOf(defender.id)} owns ${count} responsibility areas; the key lists each one on card ${cardOf.get(defender.id)}.` });
  }

  const answers = owned
    .sort((a, b) => (cardOf.get(a.defender.id) - cardOf.get(b.defender.id)) || String(a.assignment.id).localeCompare(String(b.assignment.id)))
    .map(({ assignment, defender, area, tag }) => ({
      card: cardOf.get(defender.id),
      defenderId: defender.id,
      assignmentId: assignment.id,
      tag,
      defenderLabel: defender.label,
      areaLabel: area.label,
      job: assignment.definition.area ?? null,
      color: area.color,
      center: [...area.center],
      radiusX: area.radiusX,
      radiusY: area.radiusY,
    }));

  if (!answers.length) issues.unshift({ code: 'no-areas', defenderId: null, assignmentId: null, tag: null,
    message: 'This diagram has no authored responsibility areas, so there are no Identify cards or answers yet.' });

  const answered = new Set(answers.map(answer => answer.defenderId));
  // Uncovered positions are information, not invented coverage requirements:
  // a generic lesson deliberately leaves its front without authored areas.
  const unansweredDefenders = defenders.flatMap((defender, index) => answered.has(defender.id) ? [] : [{
    defenderId: defender.id, tag: tagOf(defender.id), ordinal: index + 1,
  }]);
  return { sourcePlayId: play.id, revision: lessonRevision(play), diagram, answers, issues, unansweredDefenders };
}

/** Invalid authored areas stay in the snapshot/key notices but cannot crash a sheet. */
export function lessonSheetDiagram(pack) {
  const diagram = clonePlaybook(pack.diagram);
  for (const assignment of diagram.assignments ?? []) {
    if (hasResponsibilityArea(assignment) && responsibilityAreaError(assignment.definition.responsibilityArea)) {
      delete assignment.definition.responsibilityArea;
    }
  }
  return diagram;
}

/** One card per answered defender, in card order. */
export function lessonPackCards(pack) {
  const seen = new Set();
  return (pack?.answers ?? []).filter(a => !seen.has(a.defenderId) && seen.add(a.defenderId))
    .map(a => ({ card: a.card, defenderId: a.defenderId }));
}

export function isLessonPackStale(pack, play) {
  if (!pack || !play) return true;
  return pack.sourcePlayId !== play.id || pack.revision !== lessonRevision(play);
}

export const IDENTIFY_MARKER = '★';
const NEUTRAL_OFFENSE_LABELS = new Set(['LT', 'LG', 'C', 'RG', 'RT', 'X', 'Y', 'F', 'Z', 'H', 'Q']);

/**
 * A new, renderer-compatible play holding only the look: alignment and offense
 * labels. No source ids, names, metadata, defender labels or assignments, so
 * nothing answer-bearing can reach any attribute, title, ARIA name or style.
 */
export function identifyDiagram(play, focusDefenderId = null) {
  const players = (play.players ?? []).map((p, i) => ({
    id: `o${i + 1}`, label: NEUTRAL_OFFENSE_LABELS.has(p.label) ? p.label : `O${i + 1}`, x: p.x, y: p.y,
  }));
  const defenders = [...(play.defenders ?? [])].sort(byAlignment).map((d, i) => ({
    id: `d${i + 1}`, label: d.id === focusDefenderId ? IDENTIFY_MARKER : '', x: d.x, y: d.y,
  }));
  return {
    id: 'identify', name: 'Identify card', family: 'Identify', formation: 'this look', personnel: 'positions only',
    folder: 'Identify', fieldSide: ['left', 'right'].includes(play.fieldSide) ? play.fieldSide : 'none',
    players, defenders, assignments: [],
  };
}
