// Packet domain: validate → normalize allowlist → explicit day selection → snapshot.
// Pure. Nothing here keeps a reference to its input, and every failure throws
// before any caller state could change. Packets carry no timestamps or random ids,
// so the same selection always produces the same bytes.
import { PacketError, canonical, clone, isPlainObject } from './common.js';
import { bundledCover3, verifyCover3 } from './cover3.js';
import { computeSchedule, validateDay, validatePeriod } from './practice-week.js';
import {
  canonicalSchemeBytes, computeCallDigest, computeKeyDigest, deriveCoachKeySheet, deriveLearnerProjection, deriveSnapshotProjections, readSchemeText, sha256Hex,
} from './schemePackage.js';

export const PACKET_SCHEMA = 'coaching-session-packet.companion';
export const PACKET_VERSION = 1;
export const PACKET_VERSION_V2 = 2;
export const PRACTICE_SCHEMA = 'practice-week-planner.project';
export const PRACTICE_VERSION = 1;
export const OUTPUTS = Object.freeze(['coach', 'assignment', 'identify']);
export const MAX_IMPORT_CHARS = 2_000_000;

const fail = (message) => { throw new PacketError(message); };

function requireId(value, what) {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) fail(`A ${what} id is missing or invalid.`);
  return value;
}

function claimId(seen, id, what) {
  requireId(id, what);
  if (seen.has(id)) fail(`A ${what} id appears more than once.`);
  seen.add(id);
  return id;
}

const requireVersion = (value, what) => (Number.isInteger(value) && value >= 1 ? value : fail(`The ${what} version is invalid.`));

function optionalText(value, what) {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value : fail(`The ${what} must be text.`);
}

function optionalList(value, what) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) fail(`The ${what} must be a list of text.`);
  return value.slice();
}

const isDigest = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

function readSchemeRef(raw) {
  if (!isPlainObject(raw) || !isDigest(raw.contentDigest) || !isDigest(raw.callDigest) || !Number.isInteger(raw.revision)) fail('A scheme pin is malformed.');
  return { packageId: requireId(raw.packageId, 'scheme package'), revision: raw.revision, contentDigest: raw.contentDigest, callId: requireId(raw.callId, 'scheme call'), callDigest: raw.callDigest };
}

function readPeriod(raw, seenIds) {
  if (!isPlainObject(raw)) fail('A period is malformed.');
  claimId(seenIds, raw.id, 'period');
  const { errors } = validatePeriod({ ...raw, cardIds: raw.cardIds ?? [] });
  if (errors.length) fail(`A period is invalid: ${errors[0]}`);
  if (raw.schemeRefs !== undefined && !Array.isArray(raw.schemeRefs)) fail('A scheme pin is malformed.');
  return {
    id: raw.id,
    title: raw.title,
    minutes: raw.minutes,
    category: raw.category,
    objective: raw.objective,
    callLabel: raw.callLabel,
    drillId: raw.drillId,
    groupIds: raw.groupIds.slice(),
    equipment: raw.equipment.slice(),
    notes: raw.notes,
    parallel: raw.parallel,
    scheduled: raw.scheduled,
    fixedStart: raw.fixedStart,
    ...(raw.schemeRefs?.length ? { schemeRefs: raw.schemeRefs.map(readSchemeRef) } : {}),
  };
}

function readDay(raw, seenDayIds, seenPeriodIds) {
  if (!isPlainObject(raw)) fail('A practice day is malformed.');
  claimId(seenDayIds, raw.id, 'day');
  const { errors } = validateDay(raw);
  if (errors.length) fail(`A practice day is invalid: ${errors[0]}`);
  return {
    id: raw.id,
    label: raw.label,
    date: raw.date,
    startMin: raw.startMin,
    plannedMinutes: raw.plannedMinutes,
    version: raw.version,
    notes: raw.notes,
    periods: raw.periods.map((period) => readPeriod(period, seenPeriodIds)),
  };
}

function readDrill(raw, seenIds) {
  if (!isPlainObject(raw)) fail('A drill is malformed.');
  claimId(seenIds, raw.id, 'drill');
  if (typeof raw.title !== 'string' || !raw.title.trim()) fail('A drill has no title.');
  return {
    id: raw.id,
    title: raw.title,
    objective: optionalText(raw.objective, 'drill objective'),
    setup: optionalText(raw.setup, 'drill setup'),
    steps: optionalList(raw.steps, 'drill steps'),
    cues: optionalList(raw.cues, 'drill cues'),
    tags: optionalList(raw.tags, 'drill tags'),
    equipment: optionalList(raw.equipment, 'drill equipment'),
  };
}

function readDrills(raw) {
  if (!Array.isArray(raw)) fail('The drill list is missing.');
  const seen = new Set();
  return raw.map((drill) => readDrill(drill, seen));
}

/**
 * Allowlisted, detached copy of a Practice export. Everything else in the
 * document (participants, records, clock, rotations, cards, ...) is never read.
 */
export function readPracticeDocument(doc) {
  if (!isPlainObject(doc)) fail('This is not a Practice export.');
  if (doc.schema !== PRACTICE_SCHEMA) fail('This is not a Practice export.');
  if (doc.schemaVersion !== PRACTICE_VERSION) fail(`This Practice export version is not supported (expected ${PRACTICE_VERSION}).`);
  const { project, week } = doc;
  if (!isPlainObject(project) || project.fictional !== true) fail('Only exports marked fictional can be imported.');
  if (!isPlainObject(week) || !Array.isArray(week.days)) fail('This export has no practice days.');
  if (!week.days.length) fail('This export has no practice days.');
  const seenDayIds = new Set();
  const seenPeriodIds = new Set();
  return {
    source: {
      exportSchema: PRACTICE_SCHEMA,
      exportSchemaVersion: PRACTICE_VERSION,
      projectId: requireId(project.id, 'project'),
      projectName: optionalText(project.name, 'project name'),
      projectRev: Number.isInteger(project.rev) ? project.rev : null,
      timezone: optionalText(project.timezone, 'project timezone'),
      weekId: requireId(week.id, 'week'),
      weekVersion: requireVersion(week.version, 'week'),
    },
    days: week.days.map((day) => readDay(day, seenDayIds, seenPeriodIds)),
    drills: readDrills(doc.drills),
  };
}

/** Exactly the drills this day's periods reference, in first-use order. */
function referencedDrills(day, drills) {
  const ids = [...new Set(day.periods.map((period) => period.drillId).filter((id) => id !== null))];
  return ids.map((id) => drills.find((drill) => drill.id === id) ?? fail('A period references a drill that is not in this data.'));
}

function assemble({ source, day, drills, cover3, teaching, output }) {
  const dayCopy = clone(day);
  return {
    schema: PACKET_SCHEMA,
    schemaVersion: teaching ? PACKET_VERSION_V2 : PACKET_VERSION,
    fictional: true,
    output,
    source: { ...source, dayId: day.id, dayVersion: day.version },
    day: dayCopy,
    schedule: clone(computeSchedule(dayCopy)),
    drills: clone(drills),
    ...(teaching ? { teaching } : { cover3 }),
  };
}

/** Snapshots one explicitly chosen day. There is no default day. */
export function createPacket({ intake, dayId, cover3 = bundledCover3(), output = 'coach' }) {
  if (!intake) fail('Import Practice data first.');
  if (!OUTPUTS.includes(output)) fail('Unknown output choice.');
  if (typeof dayId !== 'string' || !dayId) fail('Choose a practice day first.');
  const matches = intake.days.filter((day) => day.id === dayId);
  if (matches.length !== 1) fail('That practice day is not in this import.');
  const [day] = matches;
  return assemble({ source: intake.source, day, drills: referencedDrills(day, intake.drills), cover3: verifyCover3(cover3), output });
}

// ---------------------------------------------------------------- version 2 teaching source
const pick = (source, keys) => Object.fromEntries(keys.map((key) => [key, clone(source[key] ?? null)]));
const pickEach = (list, keys, what) => (Array.isArray(list) ? list.map((item) => pick(item, keys)) : fail(`The ${what} is malformed.`));
const PLAYER_KEYS = ['id', 'label', 'x', 'y'];

function readLook(raw) {
  if (!isPlainObject(raw)) fail('A teaching look is malformed.');
  return { offense: pickEach(raw.offense, PLAYER_KEYS, 'offense look'), defense: pickEach(raw.defense, PLAYER_KEYS, 'defense look'), fieldSide: ['left', 'right'].includes(raw.fieldSide) ? raw.fieldSide : 'none' };
}

const readFrame = (raw) => {
  if (!isPlainObject(raw) || !['minX', 'maxX', 'minY', 'maxY'].every((key) => Number.isFinite(raw[key]))) fail('A teaching frame is malformed.');
  return pick(raw, ['minX', 'maxX', 'minY', 'maxY']);
};

/** Rebuilt field by field: nothing unknown survives into a learner payload. */
function readIdentify(raw) {
  if (!isPlainObject(raw) || raw.packageKind !== 'identify-projection' || !Array.isArray(raw.cards) || raw.cards.length !== 11) fail('This packet does not hold all eleven Identify cards.');
  return {
    packageKind: raw.packageKind, schemaVersion: raw.schemaVersion, synthetic: true, held: false, pin: pick(raw.pin ?? {}, ['packageId', 'revision', 'callId']),
    cards: raw.cards.map((card) => ({
      card: card.card, total: card.total, context: pick(card.context ?? {}, ['callName', 'situation']), prompt: card.prompt, look: readLook(card.look), frame: readFrame(card.frame),
    })),
    projectionDigest: raw.projectionDigest,
  };
}

const STUDY_ROLE_KEYS = ['ordinal', 'positionLabel', 'key', 'decision', 'responsibility', 'finish', 'fallback', 'runFitOwnership'];

function readStudy(raw) {
  if (!isPlainObject(raw) || raw.packageKind !== 'player-study-projection' || !Array.isArray(raw.roles) || raw.roles.length !== 11) fail('This packet does not hold all eleven study roles.');
  return {
    packageKind: raw.packageKind, schemaVersion: raw.schemaVersion, synthetic: true, held: false, pin: pick(raw.pin ?? {}, ['packageId', 'revision', 'callId']),
    callName: raw.callName, situation: raw.situation, teachingCues: clone(raw.teachingCues ?? []),
    roles: pickEach(raw.roles, STUDY_ROLE_KEYS, 'study role'),
    exchanges: (raw.exchanges ?? []).map((item) => ({
      condition: item.condition,
      jobs: pickEach(item.jobs, ['ordinal', 'positionLabel', 'job'], 'exchange job'),
      replacements: pickEach(item.replacements, ['ordinal', 'positionLabel', 'coverage'], 'exchange replacement'),
      expectedRushCount: item.expectedRushCount, expectedCoverageCount: item.expectedCoverageCount,
    })),
    look: readLook(raw.look), frame: readFrame(raw.frame),
    projectionDigest: raw.projectionDigest,
  };
}

function readCoach(raw) {
  if (!isPlainObject(raw) || !isPlainObject(raw.call) || !Array.isArray(raw.keyEntries) || raw.keyEntries.length !== 11) fail('This packet has no complete coach record.');
  return pick(raw, ['call', 'keyRecord', 'keyEntries', 'diagram', 'sourceRefs', 'interpretations', 'authority', 'approvalClaim']);
}

function readTeaching(raw) {
  const pin = readSchemeRef(raw.pin);
  const periodId = requireId(raw.periodId, 'pinned period');
  return { pin, periodId, coach: readCoach(raw.coach), study: readStudy(raw.study), identify: readIdentify(raw.identify) };
}

const approvalClaimOf = (pkg) => ({ status: pkg.approval?.status ?? 'draft', actionKind: pkg.approval?.actionKind ?? null, actorLabel: pkg.approval?.actorLabel ?? null, approvedDigest: pkg.approval?.approvedDigest ?? null, authenticated: false });

/** Reads and verifies a coach package file. Returns its problems rather than throwing. */
export const readSchemePackageText = (text) => readSchemeText(text);

/**
 * Builds version 2 from one explicit day, period and call. The pin must match a loaded
 * package exactly: there is no fallback to a newer revision, and anything else is held.
 */
export async function createSchemePacket({ intake, dayId, periodId, callId, schemes, output = 'coach' }) {
  if (!intake) fail('Import Practice data first.');
  if (!OUTPUTS.includes(output)) fail('Unknown output choice.');
  const day = intake.days.find((item) => item.id === dayId) ?? fail('That practice day is not in this import.');
  const period = day.periods.find((item) => item.id === periodId) ?? fail('That period is not on this practice day.');
  const ref = (period.schemeRefs ?? []).find((item) => item.callId === callId) ?? fail('Held: that period has no pin for this call.');
  const pkg = schemes.find((item) => item.packageId === ref.packageId && item.revision === ref.revision && item.contentDigest === ref.contentDigest);
  if (!pkg) fail(`Held: this period pins revision ${ref.revision}, and that exact revision is not loaded.`);
  if (pkg.callDigests?.[callId] !== ref.callDigest) fail('Conflict: this pin does not match the loaded call.');
  const study = await deriveLearnerProjection(pkg, 'player-study', ref);
  const identify = await deriveLearnerProjection(pkg, 'identify', ref);
  if (study.held || identify.held) fail(`Held: ${identify.reason ?? study.reason}. Nothing was built.`);
  const call = pkg.calls.find((item) => item.callId === callId);
  const diagram = pkg.diagrams.find((item) => item.diagramId === call.diagramRef.diagramId)?.play ?? null;
  const keyRecord = pkg.coachKeys.find((item) => item.keyId === call.coachKeyRef?.keyId) ?? null;
  const teaching = readTeaching({
    pin: ref, periodId,
    coach: {
      call, keyRecord, keyEntries: deriveCoachKeySheet(pkg, callId).entries, diagram,
      sourceRefs: pkg.sourceRefs, interpretations: pkg.interpretations, authority: pkg.authority, approvalClaim: approvalClaimOf(pkg),
    },
    study, identify,
  });
  return assemble({ source: intake.source, day, drills: referencedDrills(day, intake.drills), teaching, output });
}

async function projectionMatches(projection) {
  const { projectionDigest, ...body } = projection;
  return await sha256Hex(canonicalSchemeBytes(body)) === projectionDigest;
}

/** Checks source links and re-derived projections before any reopened material is mounted. */
export async function verifyPacketTeaching(packet) {
  try {
  const { pin, coach, study, identify } = packet.teaching;
  const period = packet.day.periods.find(item => item.id === packet.teaching.periodId);
  if (!period?.schemeRefs?.some(ref => canonical(ref) === canonical(pin))) return { ok: false, reason: 'The selected period does not carry this exact pin.' };
  if (coach.approvalClaim?.status !== 'approved' || coach.approvalClaim?.approvedDigest !== pin.contentDigest || coach.approvalClaim?.actionKind !== 'synthetic-local-test') return { ok: false, reason: 'The source revision has no matching local test approval claim.' };
  if (!await projectionMatches(study) || !await projectionMatches(identify)) return { ok: false, reason: 'A learner projection does not match its digest.' };
  if (await computeCallDigest({ packageId: pin.packageId, familyId: coach.call.familyId }, coach.call) !== pin.callDigest) return { ok: false, reason: 'The call does not match its pinned digest.' };
  if (coach.keyRecord && await computeKeyDigest(coach.keyRecord) !== coach.call.coachKeyRef?.digest) return { ok: false, reason: 'The coach key does not match its reference.' };
  const expected = await deriveSnapshotProjections({ pin, call: coach.call, diagram: coach.diagram, keyRecord: coach.keyRecord });
  if (canonical(expected.study) !== canonical(study) || canonical(expected.identify) !== canonical(identify)) return { ok: false, reason: 'The learner material differs from the pinned authored call.' };
  const keys = deriveCoachKeySheet({ packageId: pin.packageId, revision: pin.revision, callDigests: { [pin.callId]: pin.callDigest }, calls: [coach.call], coachKeys: coach.keyRecord ? [coach.keyRecord] : [] }, pin.callId);
  if (canonical(keys.entries) !== canonical(coach.keyEntries)) return { ok: false, reason: 'The displayed key differs from its pinned private record.' };
  return { ok: true, reason: null };
  } catch (error) { return { ok: false, reason: `The teaching snapshot could not be verified: ${error.message}` }; }
}

function readPacketSource(raw) {
  if (!isPlainObject(raw)) fail('This packet has no source record.');
  if (raw.exportSchema !== PRACTICE_SCHEMA || raw.exportSchemaVersion !== PRACTICE_VERSION) fail('This packet names an unsupported Practice source.');
  return {
    exportSchema: PRACTICE_SCHEMA,
    exportSchemaVersion: PRACTICE_VERSION,
    projectId: requireId(raw.projectId, 'project'),
    projectName: optionalText(raw.projectName, 'project name'),
    projectRev: Number.isInteger(raw.projectRev) ? raw.projectRev : null,
    timezone: optionalText(raw.timezone, 'project timezone'),
    weekId: requireId(raw.weekId, 'week'),
    weekVersion: requireVersion(raw.weekVersion, 'week'),
  };
}

/** Validates a whole packet and rebuilds it from the allowlist. */
export function validatePacket(doc) {
  if (!isPlainObject(doc) || doc.schema !== PACKET_SCHEMA) fail('This is not a session packet.');
  // Version 2 is recognized by its teaching source; a relabelled version 1 stays unsupported.
  const v2 = doc.schemaVersion === PACKET_VERSION_V2 && isPlainObject(doc.teaching);
  if (doc.schemaVersion !== PACKET_VERSION && !v2) fail(`This packet version is not supported (expected ${PACKET_VERSION}).`);
  if (doc.fictional !== true) fail('Only packets marked fictional can be opened.');
  if (!OUTPUTS.includes(doc.output)) fail('This packet has an unknown output choice.');
  const source = readPacketSource(doc.source);
  const day = readDay(doc.day, new Set(), new Set());
  if (doc.source.dayId !== day.id || doc.source.dayVersion !== day.version) fail('This packet’s source record does not match its practice day.');
  const packet = assemble({
    source,
    day,
    drills: referencedDrills(day, readDrills(doc.drills)),
    ...(v2 ? { teaching: readTeaching(doc.teaching) } : { cover3: verifyCover3(doc.cover3) }),
    output: doc.output,
  });
  if (v2 && !day.periods.some((period) => period.id === doc.teaching.periodId)) fail('This packet’s teaching source names a period outside its practice day.');
  if (canonical(doc.schedule) !== canonical(packet.schedule)) fail('This packet’s schedule does not match its periods.');
  return packet;
}

export const withOutput = (packet, output) => {
  if (!OUTPUTS.includes(output)) fail('Unknown output choice.');
  return { ...packet, output };
};

export const serializePacket = (packet) => `${JSON.stringify(packet, null, 2)}\n`;

/** Classifies and validates imported text. Throws PacketError on anything unusable. */
export function readImport(text) {
  if (typeof text !== 'string' || !text.trim()) fail('There is nothing to import.');
  if (text.length > MAX_IMPORT_CHARS) fail('This input is too large to be a packet or Practice export.');
  let doc;
  try {
    doc = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    fail('This is not valid JSON.');
  }
  if (isPlainObject(doc) && doc.schema === PACKET_SCHEMA) return { kind: 'packet', packet: validatePacket(doc) };
  if (isPlainObject(doc) && doc.schema === PRACTICE_SCHEMA) return { kind: 'practice', intake: readPracticeDocument(doc) };
  if (isPlainObject(doc) && doc.packageKind === 'coach-scheme-package') return { kind: 'scheme-package', text };
  if (isPlainObject(doc) && ['identify-projection', 'player-study-projection'].includes(doc.packageKind)) fail('A learner projection cannot be a teaching source.');
  return fail('This is neither a Practice export nor a session packet.');
}

const OUTPUT_TITLES = { coach: 'Coach packet', assignment: 'Study sheet', identify: 'Identify cards' };

/** Browser print and PDF title. Generic by design: no call, day or revision text. */
export const printDocumentTitle = (packet) => OUTPUT_TITLES[packet?.output] ?? 'Session packet';

export function packetFilename(packet) {
  const slug = packet.day.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'session';
  return `session-packet-${slug}-coach-material.json`;
}
