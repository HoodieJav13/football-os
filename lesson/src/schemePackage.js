// coach-scheme-package: one versioned contract for the isolated, synthetic-only handoff.
// Pure, import-free and byte-identical in lesson/src, practice/src/domain and
// packet/public/src (the same vendoring convention as packet/public/src/practice-week.js).
//
// Identity: SHA-256 over canonical UTF-8 bytes through platform crypto.subtle.
// Approval: a local test action on one complete frozen revision. Unsigned JSON cannot
// authenticate a person, so every approval is reported as an unauthenticated claim.
// Software detects missing or conflicting declared data. It never proves football.

export const SCHEME_PACKAGE_KIND = 'coach-scheme-package';
export const SCHEME_CORRECTION_KIND = 'coach-scheme-correction';
export const SCHEME_SCHEMA_VERSION = 1;
export const PACKAGE_KINDS = Object.freeze(['coach-scheme-package', 'player-study-projection', 'identify-projection']);
export const ROLE_COUNT = 11;
export const MAX_SCHEME_IMPORT_CHARS = 2_000_000;
export const LOCAL_TEST_ACTION = 'synthetic-local-test';
export const LOCAL_TEST_LABEL = 'Local test action (synthetic example, unauthenticated)';
export const REVIEW_EXTENTS = Object.freeze(['metadata', 'transcript-only', 'selected-visual-samples', 'continuous-viewing']);
export const OBSERVATION_TYPES = Object.freeze(['coach-observation', 'synthetic-fixture']);
export const RECHECK_STATUSES = Object.freeze(['planned', 'explained', 'field-observed', 'needs-correction']);
export const JOB_TEXT_FIELDS = Object.freeze(['key', 'decision', 'responsibility', 'finish', 'fallback', 'runFitOwnership']);
export const IDENTIFY_MARKER = '★';

const ASSIGNMENT_FIELDS = ['unit', 'responsibility', 'runFitOwnership', 'exchangePartnerRoleId'];
const WORDING_FIELDS = ['key', 'decision', 'finish', 'fallback'];
const PRESENTATION_FIELDS = [...JOB_TEXT_FIELDS, 'unit', 'exchangePartnerRoleId'];
const FAMILY_COUNTS = { sim4: [4, 7], p5: [5, 6] };
const NEUTRAL_OFFENSE_LABELS = new Set(['LT', 'LG', 'C', 'RG', 'RT', 'X', 'Y', 'F', 'Z', 'H', 'Q']);
const BASE_FRAME = Object.freeze({ minX: -28.5, maxX: 28.5, minY: -9, maxY: 40 });
const DIGEST_EXCLUDED = new Set(['contentDigest', 'callDigests', 'frozen', 'approval', 'createdAt', 'updatedAt']);
const PLAY_TEACHABLE_FIELDS = ['id', 'name', 'family', 'formation', 'personnel', 'fieldSide', 'players', 'defenders', 'assignments'];
const ENVELOPE_FIELDS = new Set(['packageKind', 'schemaVersion', 'packageId', 'familyId', 'revision', 'parentRevision', 'parentDigest', 'contentDigest', 'callDigests', 'frozen', 'createdAt', 'updatedAt', 'provenance', 'authority', 'sourceRefs', 'interpretations', 'approval', 'calls', 'diagrams', 'coachKeys', 'lessonRefs', 'practiceRefs', 'correctionRefs', 'scenarios']);
const CALL_FIELDS = new Set(['callId', 'title', 'familyId', 'variantOf', 'status', 'front', 'presentation', 'rushFamily', 'coverage', 'checks', 'intendedRushCount', 'anticipatedCoverageCount', 'formationCases', 'eligibleReceiverNumbering', 'roles', 'exchangeOutcomes', 'ambiguousReadDefault', 'compatibleCombinationIds', 'counters', 'teachingCues', 'uncertainties', 'learnerContext', 'diagramRef', 'coachKeyRef']);
const ROLE_FIELDS = new Set(['roleId', 'positionLabel', 'alignment', 'unit', ...JOB_TEXT_FIELDS, 'exchangePartnerRoleId', 'ruleBasis']);

export class SchemePackageError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SchemePackageError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new SchemePackageError(code, message); };
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = (value) => typeof value === 'string' && value.trim() !== '';
const isDigest = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const isId = (value) => isText(value) && value.length <= 200 && !value.includes('/');
const isCount = (value) => Number.isInteger(value) && value >= 0;
const clone = (value) => JSON.parse(JSON.stringify(value));
const nowIso = () => new Date().toISOString();

// ---------------------------------------------------------------- canonical bytes
function canonicalText(value) {
  if (value === null) return 'null';
  const type = typeof value;
  if (type === 'string' || type === 'boolean') return JSON.stringify(value);
  if (type === 'number') {
    if (!Number.isFinite(value)) fail('non-canonical-value', 'Numbers must be finite.');
    return JSON.stringify(value);
  }
  if (type !== 'object') fail('non-canonical-value', `A ${type} has no canonical JSON form.`);
  if (Array.isArray(value)) {
    return `[${Array.from(value, (item) => {
      if (item === undefined) fail('non-canonical-value', 'Lists cannot hold undefined.');
      return canonicalText(item);
    }).join(',')}]`;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) fail('non-canonical-value', 'Only plain data has a canonical form.');
  // Default sort is UTF-16 code unit order: independent of locale, unlike localeCompare.
  const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalText(value[key])}`).join(',')}}`;
}

export const canonicalSchemeJson = (value) => canonicalText(value);
export const canonicalSchemeBytes = (value) => new TextEncoder().encode(canonicalText(value));

export async function sha256Hex(input) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) fail('crypto-unavailable', 'This browser context has no SHA-256. Open the app from localhost or https.');
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const hash = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const digestOf = (value) => sha256Hex(canonicalSchemeBytes(value));

export function schemeDigestPreimage(pkg) {
  const preimage = Object.fromEntries(Object.entries(pkg).filter(([key]) => !DIGEST_EXCLUDED.has(key)));
  if (Array.isArray(pkg.diagrams)) {
    preimage.diagrams = pkg.diagrams.map((diagram) => (isObject(diagram?.play) ? {
      ...diagram,
      // Camera, focus and selection can never reach content identity.
      play: Object.fromEntries(PLAY_TEACHABLE_FIELDS.filter((field) => diagram.play[field] !== undefined).map((field) => [field, diagram.play[field]])),
    } : diagram));
  }
  return preimage;
}

export const computeContentDigest = (pkg) => digestOf(schemeDigestPreimage(pkg));
export const computeCallDigest = (pkg, call) => digestOf({ packageId: pkg.packageId, familyId: pkg.familyId, call });
export const computeKeyDigest = (record) => digestOf(record);

export const serializeSchemePackage = (pkg) => `${JSON.stringify(pkg, null, 2)}\n`;

// ---------------------------------------------------------------- freeze and approve
const calls = (pkg) => (Array.isArray(pkg?.calls) ? pkg.calls : []);
const keyRecords = (pkg) => (Array.isArray(pkg?.coachKeys) ? pkg.coachKeys : []);
const diagrams = (pkg) => (Array.isArray(pkg?.diagrams) ? pkg.diagrams : []);
const callOf = (pkg, callId) => calls(pkg).find((call) => call?.callId === callId) ?? null;
const keyRecordOf = (pkg, ref) => keyRecords(pkg).find((record) => record?.keyId === ref?.keyId) ?? null;
const diagramOf = (pkg, ref) => diagrams(pkg).find((diagram) => diagram?.diagramId === ref?.diagramId) ?? null;

const keySourceContent = (call) => canonicalSchemeJson(Object.fromEntries(Object.entries(call).filter(([field]) => !['coachKeyRef', 'status'].includes(field))));

/** A key is usable only for the exact teaching content explicitly reviewed with it. */
export function keyBindingStatus(pkg, callId) {
  const call = callOf(pkg, callId);
  const record = call?.coachKeyRef ? keyRecordOf(pkg, call.coachKeyRef) : null;
  if (!record) return 'missing';
  const binding = record.binding;
  return binding?.callContent === keySourceContent(call) && binding?.answersContent === canonicalSchemeJson(record.answers ?? []) && isDigest(binding?.sourceDigest) ? 'current' : 'stale';
}

/** Explicit review/regeneration preserves authored rubrics; it never invents an answer. */
export async function regenerateCoachKey(pkg, callId) {
  if (pkg?.frozen) fail('frozen-revision', 'Start a draft before regenerating a coach key.');
  const next = clone(pkg);
  const call = callOf(next, callId);
  const record = call?.coachKeyRef ? keyRecordOf(next, call.coachKeyRef) : null;
  if (!record) fail('missing-key', 'No authored key record is available to review.');
  const callContent = keySourceContent(call);
  record.revision = (record.revision ?? 0) + 1;
  record.binding = { callContent, answersContent: canonicalSchemeJson(record.answers ?? []), sourceDigest: await sha256Hex(callContent), sourceRevision: next.revision };
  call.coachKeyRef = { ...call.coachKeyRef, revision: record.revision, digest: null };
  return next;
}

/** Explicit freeze: fixes digests for this revision. Freezing is not approval. */
export async function freezeSchemePackage(draft, { now = nowIso() } = {}) {
  if (!isObject(draft)) fail('not-an-object', 'There is no package to freeze.');
  if (draft.frozen === true) fail('frozen-revision', 'This revision is already frozen. Start a new draft revision to change it.');
  const frozen = clone(draft);
  for (const call of calls(frozen)) {
    const record = isObject(call?.coachKeyRef) ? keyRecordOf(frozen, call.coachKeyRef) : null;
    if (record) call.coachKeyRef.digest = await computeKeyDigest(record);
  }
  const callDigests = {};
  for (const call of calls(frozen)) if (isObject(call) && isText(call.callId)) callDigests[call.callId] = await computeCallDigest(frozen, call);
  frozen.callDigests = callDigests;
  frozen.contentDigest = await computeContentDigest(frozen);
  frozen.frozen = true;
  frozen.updatedAt = now;
  return frozen;
}

export async function approveSchemePackage(frozen, { actionKind, actorLabel, confirmedDigest, now = nowIso() } = {}) {
  if (frozen?.frozen !== true || !isDigest(frozen.contentDigest)) fail('not-frozen', 'Freeze this revision before approving it.');
  if (actionKind !== LOCAL_TEST_ACTION || !isText(actorLabel)) {
    fail('approval-action-refused', 'Approval needs the explicit local test action and an actor label. Import, recommendations and passing tests are not approval.');
  }
  if (confirmedDigest !== frozen.contentDigest) fail('digest-not-confirmed', 'The confirmed digest does not match this exact revision.');
  if (await computeContentDigest(frozen) !== frozen.contentDigest) fail('digest-mismatch', 'This revision changed after it was frozen.');
  if (frozen.approval?.status === 'approved') fail('already-approved', 'This exact revision already holds a local test approval.');
  const check = validateSchemePackage(frozen);
  if (!check.valid || check.heldAssets.length || check.callStatus.some((call) => call.readiness !== 'ready')) {
    fail('incomplete-package', 'Every call must be ready, complete and hold its referenced assets before this revision can be approved.');
  }
  return {
    ...clone(frozen),
    approval: {
      status: 'approved', actorLabel, timestamp: now, approvedDigest: frozen.contentDigest,
      actionKind: LOCAL_TEST_ACTION, authenticated: false, displayLabel: LOCAL_TEST_LABEL,
    },
  };
}

const draftApproval = () => ({ status: 'draft', actorLabel: null, timestamp: null, approvedDigest: null, actionKind: null, authenticated: false });

/** Opens the next revision. The frozen parent and its bytes are never touched. */
export function createDraftRevision(pkg, { now = nowIso() } = {}) {
  if (pkg?.frozen !== true || !isDigest(pkg.contentDigest)) fail('not-frozen', 'Only a frozen revision can have a descendant.');
  return {
    ...clone(pkg),
    revision: pkg.revision + 1,
    parentRevision: pkg.revision,
    parentDigest: pkg.contentDigest,
    contentDigest: null,
    callDigests: {},
    frozen: false,
    updatedAt: now,
    approval: draftApproval(),
  };
}

// ---------------------------------------------------------------- validation
function checkEnvelope(pkg, errors, warnings) {
  const error = (code, path, message) => errors.push({ code, path, message });
  for (const [field, value] of [['packageId', pkg.packageId], ['familyId', pkg.familyId]]) {
    if (!isId(value)) error('invalid-id', field, `${field} must be a stable opaque id.`);
  }
  const revisionOk = Number.isInteger(pkg.revision) && pkg.revision >= 1;
  if (!revisionOk) error('invalid-revision', 'revision', 'Revision must be a positive whole number.');
  const parentRevision = pkg.parentRevision ?? null;
  const parentDigest = pkg.parentDigest ?? null;
  if (parentRevision === null ? parentDigest !== null : !Number.isInteger(parentRevision) || parentRevision < 1 || (revisionOk && parentRevision >= pkg.revision) || !isDigest(parentDigest)) {
    error('invalid-ancestry', 'parentRevision', 'A parent needs a lower revision and its exact digest; no parent means neither.');
  }
  if (pkg.provenance?.synthetic !== true) error('non-synthetic-package', 'provenance.synthetic', 'This isolated slice only holds packages marked synthetic.');
  if (pkg.authority?.doctrineStatus !== 'not-adopted' || (pkg.authority?.kbRelease ?? null) !== null) {
    error('doctrine-claim', 'authority', 'Package approval is not governed doctrine. Authority stays not-adopted with no KB release.');
  }

  const sourceRefs = Array.isArray(pkg.sourceRefs) ? pkg.sourceRefs : [];
  if (!Array.isArray(pkg.sourceRefs)) error('missing-source-id', 'sourceRefs', 'Source references must be a list.');
  const sourceIds = new Set();
  let partial = false;
  sourceRefs.forEach((source, i) => {
    if (!isId(source?.sourceId)) { error('missing-source-id', `sourceRefs[${i}].sourceId`, 'A source reference has no id.'); return; }
    if (sourceIds.has(source.sourceId)) error('duplicate-source-id', `sourceRefs[${i}].sourceId`, `Source id ${source.sourceId} appears twice.`);
    sourceIds.add(source.sourceId);
    if (!REVIEW_EXTENTS.includes(source.reviewExtent)) error('invalid-review-extent', `sourceRefs[${i}].reviewExtent`, 'Review extent must be metadata, transcript-only, selected-visual-samples or continuous-viewing.');
    else if (source.reviewExtent !== 'continuous-viewing') partial = true;
  });
  if (partial) warnings.push({ code: 'partial-source-review', path: 'sourceRefs', message: 'Some sources were only partly reviewed. Coach adaptation is shown separately from evidence.' });
  (Array.isArray(pkg.interpretations) ? pkg.interpretations : []).forEach((item, i) => {
    for (const id of Array.isArray(item?.sourceRefIds) ? item.sourceRefIds : [null]) {
      if (!sourceIds.has(id)) error('unknown-source-ref', `interpretations[${i}].sourceRefIds`, `Interpretation names unknown source ${id}.`);
    }
  });

  for (const field of ['lessonRefs', 'practiceRefs', 'correctionRefs']) {
    const refs = pkg[field] ?? [];
    if (!Array.isArray(refs)) { error('invalid-ref', field, `${field} must be a list.`); continue; }
    refs.forEach((ref, i) => {
      if (!isId(ref?.id) || !Number.isInteger(ref?.revision) || ref.revision < 1 || !isDigest(ref?.digest)) error('invalid-ref', `${field}[${i}]`, 'A reference needs an id, pinned revision and digest.');
    });
  }

  const { approval } = pkg;
  if (!isObject(approval) || !['draft', 'approved', 'superseded'].includes(approval.status)) {
    error('invalid-approval', 'approval.status', 'Approval status must be draft, approved or superseded.');
  } else if (approval.status === 'draft') {
    if ((approval.approvedDigest ?? null) !== null) error('invalid-approval', 'approval.approvedDigest', 'A draft cannot name an approved digest.');
  } else if (!isText(approval.actorLabel) || !isText(approval.timestamp) || !isDigest(approval.approvedDigest) || approval.actionKind !== LOCAL_TEST_ACTION || approval.authenticated !== false) {
    error('invalid-approval', 'approval', 'Approval needs an actor, time, exact digest and the unauthenticated local test action.');
  }
  for (const key of Object.keys(pkg)) if (!ENVELOPE_FIELDS.has(key)) warnings.push({ code: 'unknown-field', path: key, message: `Ignored unknown field “${key}”.` });
}

function checkRoles(call, path, issue, warnings) {
  if (!Array.isArray(call.roles)) { issue('missing-role', `${path}.roles`, 'This call has no role list.'); return []; }
  const roles = call.roles.filter(isObject);
  const ids = roles.map((role) => role.roleId);
  const unique = new Set(ids);
  if (unique.size !== ids.length) issue('duplicate-role', `${path}.roles`, 'A stable role id appears more than once.');
  if (unique.size < ROLE_COUNT) issue('missing-role', `${path}.roles`, `Expected ${ROLE_COUNT} roles, found ${unique.size}.`);
  if (unique.size > ROLE_COUNT) issue('extra-role', `${path}.roles`, `Expected ${ROLE_COUNT} roles, found ${unique.size}.`);
  roles.forEach((role, i) => {
    const rolePath = `${path}.roles[${i}]`;
    for (const field of ['positionLabel', ...JOB_TEXT_FIELDS]) if (!isText(role[field])) issue('invalid-role-field', `${rolePath}.${field}`, `This role needs ${field}.`);
    if (!isId(role.roleId)) issue('invalid-role-field', `${rolePath}.roleId`, 'This role needs a stable id.');
    if (!['rush', 'coverage'].includes(role.unit)) issue('invalid-role-field', `${rolePath}.unit`, 'A role is a rush or coverage job in this call.');
    if (!isObject(role.alignment) || !Number.isFinite(role.alignment.x) || !Number.isFinite(role.alignment.y)) issue('invalid-role-field', `${rolePath}.alignment`, 'This role needs a finite alignment.');
    if (!isText(role.ruleBasis)) issue('missing-rule-basis', `${rolePath}.ruleBasis`, 'Every rule must state its basis, such as synthetic_example.');
    for (const key of Object.keys(role)) if (!ROLE_FIELDS.has(key)) warnings.push({ code: 'unknown-field', path: `${rolePath}.${key}`, message: `Ignored unknown field “${key}”.` });
    const partner = role.exchangePartnerRoleId ?? null;
    if (partner === null) return;
    const other = roles.find((item) => item.roleId === partner);
    if (!other) issue('exchange-partner-unknown', `${rolePath}.exchangePartnerRoleId`, `Exchange partner ${partner} is not a role in this call.`);
    else if (other.exchangePartnerRoleId !== role.roleId || other === role) issue('exchange-partner-conflict', `${rolePath}.exchangePartnerRoleId`, 'Exchange partners must name each other.');
  });
  return roles;
}

function checkCounts(call, path, roles, issue) {
  const rush = call.intendedRushCount;
  const coverage = call.anticipatedCoverageCount;
  if (!isCount(rush) || !isCount(coverage) || rush + coverage !== ROLE_COUNT) {
    issue('invalid-count', `${path}.intendedRushCount`, `Intended rush and coverage counts must be whole numbers totalling ${ROLE_COUNT}.`);
    return;
  }
  const expected = FAMILY_COUNTS[call.rushFamily];
  if (expected && (rush !== expected[0] || coverage !== expected[1])) issue('family-count-mismatch', `${path}.intendedRushCount`, `${call.rushFamily} declares ${expected[0]} rushers and ${expected[1]} coverage players.`);
  if (roles.length && roles.filter((role) => role.unit === 'rush').length !== rush) issue('rush-count-mismatch', `${path}.roles`, 'The rush roles do not match the intended rush count.');
}

function checkOutcomes(call, path, roles, issue) {
  const roleIds = new Set(roles.map((role) => role.roleId));
  const outcomes = Array.isArray(call.exchangeOutcomes) ? call.exchangeOutcomes : null;
  if (!outcomes) issue('missing-outcome-record', `${path}.exchangeOutcomes`, 'exchangeOutcomes must be a list.');
  if (roles.some((role) => (role.exchangePartnerRoleId ?? null) !== null) && !outcomes?.length) issue('missing-outcome-record', `${path}.exchangeOutcomes`, 'Exchange partners need declared outcomes.');
  const ids = new Set();
  (outcomes ?? []).forEach((outcome, i) => {
    const outcomePath = `${path}.exchangeOutcomes[${i}]`;
    if (ids.has(outcome?.outcomeId)) issue('duplicate-outcome', outcomePath, `Outcome ${outcome.outcomeId} appears twice.`);
    ids.add(outcome?.outcomeId);
    if (!isId(outcome?.outcomeId) || !isText(outcome?.condition) || !Array.isArray(outcome?.pairedJobs) || !outcome.pairedJobs.length || !Array.isArray(outcome?.replacementCoverage) || !Array.isArray(outcome?.rushLanes)) {
      issue('missing-outcome-record', outcomePath, 'An outcome needs a condition, paired jobs, replacement coverage and rush lanes.');
    }
    if (!isCount(outcome?.expectedRushCount) || !isCount(outcome?.expectedCoverageCount) || outcome.expectedRushCount + outcome.expectedCoverageCount !== ROLE_COUNT) {
      issue('outcome-count-invalid', outcomePath, `Each outcome needs its own counts totalling ${ROLE_COUNT}.`);
    }
    const named = [...(outcome?.pairedJobs ?? []), ...(outcome?.replacementCoverage ?? []), ...(outcome?.rushLanes ?? [])]
      .flatMap((entry) => [entry?.roleId, entry?.replaces]).filter((id) => id !== undefined);
    if (named.some((id) => !roleIds.has(id))) issue('unknown-outcome-role', outcomePath, 'An outcome names a role outside this call.');
  });
  const fallback = call.ambiguousReadDefault;
  if (!isText(fallback)) issue('missing-ambiguous-default', `${path}.ambiguousReadDefault`, 'State an explicit outcome or not-applicable.');
  else if (fallback !== 'not-applicable' && !ids.has(fallback)) issue('unknown-outcome-default', `${path}.ambiguousReadDefault`, `Default ${fallback} is not a declared outcome.`);
}

function checkVariant(pkg, call, path, roles, issue) {
  const variantOf = call.variantOf ?? null;
  const base = variantOf === null ? null : callOf(pkg, variantOf);
  if (variantOf !== null && (!base || base === call)) issue('variant-base-missing', `${path}.variantOf`, 'A variant must name another call in this package.');
  if (call.rushFamily !== 'presentation-only') return;
  if (!base || base === call) {
    if (variantOf === null) issue('variant-base-missing', `${path}.variantOf`, 'A presentation-only call must name its base call.');
    return;
  }
  const changed = roles.some((role) => {
    const other = (base.roles ?? []).find((item) => item?.roleId === role.roleId);
    return !other || PRESENTATION_FIELDS.some((field) => (role[field] ?? null) !== (other[field] ?? null));
  });
  if (changed || call.intendedRushCount !== base.intendedRushCount) issue('presentation-changed-jobs', `${path}.roles`, 'A presentation-only call preserves every base job.');
}

function checkLearnerContext(call, path, roles, issue) {
  const context = call.learnerContext;
  if (!isObject(context) || !isText(context.callName) || !isText(context.situation) || !isText(context.question)) {
    issue('missing-question-context', `${path}.learnerContext`, 'Identify needs an authored call name, situation and question.');
    return;
  }
  const said = `${context.callName}\n${context.situation}\n${context.question}`.toLowerCase();
  const answers = roles.flatMap((role) => JOB_TEXT_FIELDS.map((field) => role[field])).filter((text) => isText(text) && text.trim().length >= 3);
  if (answers.some((text) => said.includes(text.trim().toLowerCase()))) issue('learner-context-leak', `${path}.learnerContext`, 'Learner context must not repeat a job.');
}

function checkCall(pkg, call, index, seen, shared) {
  const path = `calls[${index}]`;
  const { errors, warnings, heldAssets } = shared;
  if (!isObject(call)) { errors.push({ code: 'invalid-call-list', path, message: 'A call is malformed.' }); return null; }
  if (!isId(call.callId)) errors.push({ code: 'invalid-id', path: `${path}.callId`, message: 'A call needs a stable id.' });
  if (seen.has(call.callId)) errors.push({ code: 'duplicate-call-id', path: `${path}.callId`, message: `Call id ${call.callId} appears twice.` });
  seen.add(call.callId);
  const issues = [];
  const issue = (code, issuePath, message) => issues.push({ code, path: issuePath, message });
  if (!['draft', 'ready'].includes(call.status)) issue('invalid-call-field', `${path}.status`, 'Call status is draft or ready.');
  if (call.familyId !== pkg.familyId) issue('foreign-family-call', `${path}.familyId`, 'This call belongs to another family.');
  for (const field of ['title', 'front', 'presentation', 'rushFamily', 'coverage']) if (!isText(call[field])) issue('invalid-call-field', `${path}.${field}`, `This call needs ${field}.`);
  for (const field of ['checks', 'compatibleCombinationIds', 'counters', 'teachingCues', 'uncertainties']) if (!Array.isArray(call[field])) issue('invalid-call-field', `${path}.${field}`, `${field} must be a list.`);
  if (!isObject(call.eligibleReceiverNumbering)) issue('invalid-call-field', `${path}.eligibleReceiverNumbering`, 'This call needs eligible receiver numbering.');
  const cases = Array.isArray(call.formationCases) ? call.formationCases : [];
  if (!cases.length) issue('missing-formation-case', `${path}.formationCases`, 'This call needs at least one formation case.');
  cases.forEach((item, i) => {
    if (!isId(item?.formationCaseId) || !Array.isArray(item?.offense) || item.offense.length !== ROLE_COUNT || item.offense.some((p) => !Number.isFinite(p?.x) || !Number.isFinite(p?.y))) {
      issue('invalid-formation-case', `${path}.formationCases[${i}]`, `A formation case needs an id and ${ROLE_COUNT} placed offensive players.`);
    }
  });
  const roles = checkRoles(call, path, issue, warnings);
  checkCounts(call, path, roles, issue);
  checkOutcomes(call, path, roles, issue);
  checkVariant(pkg, call, path, roles, issue);
  checkLearnerContext(call, path, roles, issue);
  for (const key of Object.keys(call)) if (!CALL_FIELDS.has(key)) warnings.push({ code: 'unknown-field', path: `${path}.${key}`, message: `Ignored unknown field “${key}”.` });

  if (!isObject(call.diagramRef) || !isId(call.diagramRef.diagramId) || !isText(call.diagramRef.teachableRevision)) issue('invalid-call-field', `${path}.diagramRef`, 'This call needs a diagram identity and teachable revision.');
  else if (!diagramOf(pkg, call.diagramRef)) heldAssets.push({ kind: 'diagram', callId: call.callId, ref: call.diagramRef.diagramId });
  if ((call.coachKeyRef ?? null) !== null) {
    if (!isObject(call.coachKeyRef) || !isId(call.coachKeyRef.keyId)) issue('invalid-call-field', `${path}.coachKeyRef`, 'A coach key reference needs an id.');
    else {
      const record = keyRecordOf(pkg, call.coachKeyRef);
      if (!record) heldAssets.push({ kind: 'coach-key', callId: call.callId, ref: call.coachKeyRef.keyId });
      else if ((record.answers ?? []).some((answer) => !isText(answer?.answer))) warnings.push({ code: 'missing-key-answer', path: `${path}.coachKeyRef`, message: 'Questions without an authored key stay held and ungraded.' });
    }
  }

  // A draft call may be unfinished. A call claimed ready, or inside an approved revision, may not.
  const hard = call.status === 'ready' || pkg.approval?.status === 'approved';
  (hard ? errors : warnings).push(...issues);
  if (pkg.approval?.status === 'approved' && call.status !== 'ready') errors.push({ code: 'invalid-approval', path: `${path}.status`, message: 'An approved revision cannot hold a draft call.' });
  return { callId: call.callId, status: call.status, readiness: issues.length ? 'incomplete' : call.status === 'ready' ? 'ready' : 'draft', issues: issues.map((item) => item.code) };
}

/** Synchronous structural check. Digests need verifySchemePackage. */
export function validateSchemePackage(value) {
  const result = { valid: false, errors: [], warnings: [], callStatus: [], heldAssets: [] };
  const stop = (code, path, message) => { result.errors.push({ code, path, message }); return result; };
  if (!isObject(value)) return stop('not-an-object', '', 'A scheme package must be a JSON object.');
  if (value.packageKind === 'identify-projection' || value.packageKind === 'player-study-projection') return stop('not-a-coach-package', 'packageKind', 'This is a learner projection, not a coach package.');
  if (value.packageKind !== SCHEME_PACKAGE_KIND) return stop('unknown-package-kind', 'packageKind', 'This is not a coach-scheme-package.');
  if (value.schemaVersion !== SCHEME_SCHEMA_VERSION) return stop('unsupported-schema-version', 'schemaVersion', `Schema version ${JSON.stringify(value.schemaVersion ?? null)} is not supported (expected ${SCHEME_SCHEMA_VERSION}).`);
  checkEnvelope(value, result.errors, result.warnings);
  if (!Array.isArray(value.calls)) result.errors.push({ code: 'invalid-call-list', path: 'calls', message: 'Calls must be a list.' });
  if (!Array.isArray(value.diagrams ?? [])) result.errors.push({ code: 'invalid-call-list', path: 'diagrams', message: 'Diagrams must be a list.' });
  if (!Array.isArray(value.coachKeys ?? [])) result.errors.push({ code: 'invalid-call-list', path: 'coachKeys', message: 'Coach keys must be a list.' });
  const seen = new Set();
  calls(value).forEach((call, index) => {
    const status = checkCall(value, call, index, seen, result);
    if (status) result.callStatus.push(status);
  });
  result.valid = result.errors.length === 0;
  return result;
}

const approvalClaimOf = (pkg) => ({
  status: pkg?.approval?.status ?? 'draft',
  actionKind: pkg?.approval?.actionKind ?? null,
  actorLabel: pkg?.approval?.actorLabel ?? null,
  approvedDigest: pkg?.approval?.approvedDigest ?? null,
  authenticated: false,
});

/** Structure plus every digest. Valid bytes still authenticate nobody. */
export async function verifySchemePackage(value) {
  const result = { ...validateSchemePackage(value), approvalClaim: approvalClaimOf(value) };
  const blocked = result.errors.some((item) => ['not-an-object', 'not-a-coach-package', 'unknown-package-kind', 'unsupported-schema-version'].includes(item.code));
  if (blocked) return result;
  const error = (code, path, message) => result.errors.push({ code, path, message });
  if (value.frozen !== true || !isDigest(value.contentDigest)) {
    error('not-frozen', 'contentDigest', 'This revision was never frozen, so it has no digest to verify.');
  } else {
    try {
      if (await computeContentDigest(value) !== value.contentDigest) error('digest-mismatch', 'contentDigest', 'These bytes do not match their content digest.');
      for (const call of calls(value)) {
        if (!isObject(call)) continue;
        if (value.callDigests?.[call.callId] !== await computeCallDigest(value, call)) error('call-digest-mismatch', `callDigests.${call.callId}`, 'A call does not match its digest.');
        const record = isObject(call.coachKeyRef) ? keyRecordOf(value, call.coachKeyRef) : null;
        if (record && await computeKeyDigest(record) !== call.coachKeyRef.digest) error('key-digest-mismatch', `callDigests.${call.callId}`, 'A coach key does not match its reference.');
        if (record?.binding && await sha256Hex(record.binding.callContent) !== record.binding.sourceDigest) error('key-source-mismatch', `callDigests.${call.callId}`, 'A coach key binding does not match its source digest.');
      }
    } catch (failure) {
      error('digest-mismatch', 'contentDigest', failure.message);
    }
    if (['approved', 'superseded'].includes(value.approval?.status) && value.approval.approvedDigest !== value.contentDigest) {
      error('approval-digest-mismatch', 'approval.approvedDigest', 'This approval names a different digest.');
    }
  }
  result.valid = result.errors.length === 0;
  return result;
}

/** Assignment changes are explicit, so a shared label never implies a shared job. */
export function diffCallRoles(base, variant) {
  const changedRoles = [];
  const unchangedRoleIds = [];
  const changedWording = [];
  for (const role of variant?.roles ?? []) {
    const other = (base?.roles ?? []).find((item) => item.roleId === role.roleId);
    const compare = (list) => list.filter((field) => (role[field] ?? null) !== (other?.[field] ?? null));
    const fields = compare(ASSIGNMENT_FIELDS);
    if (fields.length) changedRoles.push({ roleId: role.roleId, positionLabel: role.positionLabel, fields });
    else unchangedRoleIds.push(role.roleId);
    const wording = compare(WORDING_FIELDS);
    if (wording.length) changedWording.push({ roleId: role.roleId, positionLabel: role.positionLabel, fields: wording });
  }
  return { changedRoles, unchangedRoleIds, changedWording };
}

// ---------------------------------------------------------------- import
export const emptySchemeStore = () => ({ version: 1, packages: {}, held: [] });

const entryOf = (store, packageId) => (Object.hasOwn(store?.packages ?? {}, packageId) ? store.packages[packageId] : null);
const packageRef = (record, packageId) => ({ packageId, revision: record.revision, contentDigest: record.contentDigest });
const fingerprint = (store) => JSON.stringify([
  Object.keys(store.packages).sort().map((id) => [id, store.packages[id].current, store.packages[id].revisions.map((record) => record.contentDigest)]),
  store.held.length,
]);

/** Also used by the Practice manifest store, which keeps refs rather than bytes. */
export function classifyRevision(entry, incoming) {
  if (!entry) return { action: 'create', conflicts: [] };
  if (entry.familyId !== incoming.familyId) {
    return { action: 'conflict', conflicts: [{ code: 'foreign-family', existingFamilyId: entry.familyId, incomingFamilyId: incoming.familyId }] };
  }
  if (entry.revisions.some((record) => record.contentDigest === incoming.contentDigest)) return { action: 'noop', conflicts: [] };
  const sameNumber = entry.revisions.find((record) => record.revision === incoming.revision);
  if (sameNumber) {
    return { action: 'conflict', conflicts: [{ code: 'same-revision-different-digest', revision: incoming.revision, existingDigest: sameNumber.contentDigest, incomingDigest: incoming.contentDigest }] };
  }
  if (incoming.revision < entry.current.revision) return { action: 'history', conflicts: [] };
  if (incoming.parentRevision === entry.current.revision && incoming.parentDigest === entry.current.contentDigest) return { action: 'descendant', conflicts: [] };
  const parentHeld = entry.revisions.some((record) => record.revision === incoming.parentRevision);
  return {
    action: 'conflict',
    conflicts: [{
      code: parentHeld ? 'non-descendant-branch' : 'unverifiable-ancestry',
      revision: incoming.revision, parentRevision: incoming.parentRevision ?? null, currentRevision: entry.current.revision,
      existingDigest: entry.current.contentDigest, incomingDigest: incoming.contentDigest,
    }],
  };
}

/** Parses text and verifies every digest. Shared by Playmaker, Practice and Packet intake. */
export async function readSchemeText(text) {
  const reject = (code, message) => ({ ok: false, text: null, pkg: null, errors: [{ code, path: '', message }], warnings: [], heldAssets: [], approvalClaim: null });
  if (typeof text !== 'string' || !text.trim()) return reject('nothing-to-import', 'There is nothing to import.');
  if (text.length > MAX_SCHEME_IMPORT_CHARS) return reject('too-large', 'This input is too large to be a scheme package.');
  const clean = text.replace(/^﻿/, '');
  let parsed;
  try { parsed = JSON.parse(clean); } catch { return reject('invalid-json', 'This is not valid JSON.'); }
  const verified = await verifySchemePackage(parsed);
  return { ok: verified.valid, text: clean, pkg: parsed, errors: verified.errors, warnings: verified.warnings, heldAssets: verified.heldAssets, approvalClaim: verified.approvalClaim };
}

export function schemeManifest(pkg) {
  return {
    packageId: pkg.packageId, familyId: pkg.familyId, revision: pkg.revision,
    parentRevision: pkg.parentRevision ?? null, parentDigest: pkg.parentDigest ?? null, contentDigest: pkg.contentDigest,
    approvalClaim: approvalClaimOf(pkg),
    calls: calls(pkg).map((call) => ({ callId: call.callId, callName: call.learnerContext?.callName ?? call.callId, status: call.status, roleCount: Array.isArray(call.roles) ? call.roles.length : 0, callDigest: pkg.callDigests?.[call.callId] ?? null })),
  };
}

const incomingSummary = (pkg) => ({
  ...schemeManifest(pkg),
  calls: calls(pkg).map((call) => ({ callId: call.callId, title: call.title, status: call.status, roleCount: call.roles?.length ?? 0, callDigest: pkg.callDigests?.[call.callId] ?? null })),
});

export function changedCallIds(previousDigests, nextDigests) {
  return Object.keys(nextDigests ?? {}).filter((callId) => previousDigests?.[callId] !== nextDigests[callId]);
}

/** Preview only. Nothing changes until applySchemeImport receives a confirmed plan. */
export async function planSchemeImport(store, text, { pins = [] } = {}) {
  const preservedRefs = [
    ...Object.values(store?.packages ?? {}).flatMap((entry) => entry.revisions.map((record) => packageRef(record, entry.packageId))),
    ...pins.map((pin) => ({ ...pin })),
  ];
  const base = { conflicts: [], errors: [], warnings: [], heldAssets: [], preservedRefs, incoming: null, incomingText: null, approvalClaim: null, baseFingerprint: fingerprint(store) };
  const read = await readSchemeText(text);
  if (!read.ok) return { ...base, action: 'rejected', errors: read.errors, warnings: read.warnings };
  const entry = entryOf(store, read.pkg.packageId);
  const { action: classified, conflicts } = classifyRevision(entry, read.pkg);
  const action = read.heldAssets.length && ['create', 'descendant', 'history'].includes(classified) ? 'held' : classified;
  const previous = entry ? JSON.parse(entry.revisions.find((record) => record.contentDigest === entry.current.contentDigest).text) : null;
  return {
    ...base, action, conflicts, warnings: read.warnings, heldAssets: read.heldAssets, approvalClaim: read.approvalClaim, incomingText: read.text,
    incoming: { ...incomingSummary(read.pkg), changedCallIds: changedCallIds(previous?.callDigests, read.pkg.callDigests) },
  };
}

function addRevision(store, plan, { makeCurrent }) {
  const { incoming, incomingText } = plan;
  const record = {
    revision: incoming.revision, contentDigest: incoming.contentDigest, parentRevision: incoming.parentRevision, parentDigest: incoming.parentDigest,
    approvalStatus: incoming.approvalClaim.status, text: incomingText,
  };
  const existing = entryOf(store, incoming.packageId);
  const entry = existing
    ? { ...existing, revisions: [...existing.revisions, record] }
    : { packageId: incoming.packageId, familyId: incoming.familyId, current: null, revisions: [record] };
  if (makeCurrent || !entry.current) entry.current = { revision: record.revision, contentDigest: record.contentDigest };
  return { ...store, packages: { ...store.packages, [incoming.packageId]: entry } };
}

const refuseImport = (store, plan, reason, message) => ({
  receipt: { status: 'refused', reason, action: plan?.action ?? null, message }, resultingRefs: [], store,
});

/** Pure commit: returns a new store, or the same store with an honest receipt. */
export function applySchemeImport(store, { plan, confirmedDigest, resolution } = {}) {
  if (!plan || plan.action === 'rejected' || !plan.incoming) return refuseImport(store, plan, 'rejected', 'This file was rejected. Nothing changed.');
  const { incoming } = plan;
  if (confirmedDigest !== incoming.contentDigest) return refuseImport(store, plan, 'not-confirmed', 'The confirmation does not match the previewed revision. Nothing changed.');
  const shared = { action: plan.action, packageId: incoming.packageId, revision: incoming.revision, contentDigest: incoming.contentDigest, approvalClaim: incoming.approvalClaim };
  const ref = { packageId: incoming.packageId, revision: incoming.revision, contentDigest: incoming.contentDigest };
  const entry = entryOf(store, incoming.packageId);
  if (entry?.revisions.some((record) => record.contentDigest === incoming.contentDigest)) {
    return { receipt: { ...shared, status: 'noop', message: 'This exact revision is already here. Nothing changed.' }, resultingRefs: [ref], store };
  }
  if (plan.baseFingerprint !== fingerprint(store)) return refuseImport(store, plan, 'stale-plan', 'The saved packages changed after this preview. Preview the file again.');
  const currentRefs = (next) => [{ packageId: incoming.packageId, ...next.packages[incoming.packageId].current }];

  if (plan.action === 'held') {
    const next = { ...store, held: [...store.held, { ...ref, heldAssets: plan.heldAssets, text: plan.incomingText }] };
    return { receipt: { ...shared, status: 'held', message: 'Referenced material is missing, so this revision is held and cannot be used.' }, resultingRefs: [], store: next };
  }
  if (plan.action === 'conflict') {
    if (!resolution) return refuseImport(store, plan, 'resolution-required', 'This conflict needs an explicit choice. Nothing changed.');
    const foreign = plan.conflicts.some((conflict) => conflict.code === 'foreign-family');
    if (!['keep-current', 'adopt-incoming'].includes(resolution) || (foreign && resolution !== 'keep-current')) return refuseImport(store, plan, 'unsupported-resolution', 'That resolution is not available for this conflict.');
    if (foreign) {
      const next = { ...store, held: [...store.held, { ...ref, heldAssets: [], conflict: 'foreign-family', text: plan.incomingText }] };
      return { receipt: { ...shared, status: 'resolved', resolution, message: 'Current package kept. The foreign file is retained unused.' }, resultingRefs: [], store: next };
    }
    const next = addRevision(store, plan, { makeCurrent: resolution === 'adopt-incoming' });
    return { receipt: { ...shared, status: 'resolved', resolution, message: 'Both byte streams are retained.' }, resultingRefs: currentRefs(next), store: next };
  }
  if (plan.action === 'history') {
    return { receipt: { ...shared, status: 'retained-as-history', message: 'Kept as history. The current revision did not change.' }, resultingRefs: [ref], store: addRevision(store, plan, { makeCurrent: false }) };
  }
  const next = addRevision(store, plan, { makeCurrent: true });
  return { receipt: { ...shared, status: 'imported', message: `Revision ${incoming.revision} imported.` }, resultingRefs: currentRefs(next), store: next };
}

export function getSchemePackage(store, packageId, revision, contentDigest) {
  const entry = entryOf(store, packageId);
  if (!entry) return null;
  const wanted = revision === undefined ? entry.current : { revision, contentDigest };
  const record = entry.revisions.find((item) => item.revision === wanted.revision && (wanted.contentDigest === undefined || item.contentDigest === wanted.contentDigest));
  return record ? JSON.parse(record.text) : null;
}

export function currentSchemeRef(store, packageId) {
  const entry = entryOf(store, packageId);
  return entry ? { packageId, ...entry.current } : null;
}

export function listSchemeRevisions(store, packageId) {
  const entry = entryOf(store, packageId);
  if (!entry) return [];
  return [...entry.revisions].sort((a, b) => a.revision - b.revision).map((record) => ({
    ...record,
    current: record.contentDigest === entry.current.contentDigest,
    lifecycle: record.approvalStatus === 'approved' && record.revision < entry.current.revision ? 'superseded' : record.approvalStatus,
  }));
}

// ---------------------------------------------------------------- references and status
export function schemeRefFor(pkg, callId) {
  if (pkg?.frozen !== true || !isDigest(pkg.contentDigest)) fail('not-frozen', 'Only a frozen revision can be referenced.');
  if (!callOf(pkg, callId)) fail('unknown-call', `Call ${callId} is not in this revision.`);
  return { packageId: pkg.packageId, revision: pkg.revision, contentDigest: pkg.contentDigest, callId, callDigest: pkg.callDigests[callId] };
}

export function deriveRevisionStatus(pkg, snapshot) {
  if (!pkg || !snapshot) return 'missing';
  if (snapshot.packageId !== pkg.packageId || snapshot.revision > pkg.revision) return 'conflict';
  if (snapshot.revision === pkg.revision && snapshot.contentDigest !== pkg.contentDigest) return 'conflict';
  if (!callOf(pkg, snapshot.callId)) return 'missing';
  if (pkg.callDigests?.[snapshot.callId] === snapshot.callDigest) return 'current';
  return snapshot.revision === pkg.revision ? 'conflict' : 'stale';
}

// ---------------------------------------------------------------- learner projections
const byAlignment = (a, b) => (a.alignment.x - b.alignment.x) || (a.alignment.y - b.alignment.y) || String(a.roleId).localeCompare(String(b.roleId), 'en');
const sortedRoles = (call) => [...call.roles].sort(byAlignment);
const neutralOffense = (offense) => offense.map((player, i) => ({ id: `o${i + 1}`, label: NEUTRAL_OFFENSE_LABELS.has(player.label) ? player.label : `O${i + 1}`, x: player.x, y: player.y }));

function fieldSideOf(pkg, call) {
  const side = diagramOf(pkg, call.diagramRef)?.play?.fieldSide;
  return ['left', 'right'].includes(side) ? side : 'none';
}

/** Depends on the visible look alone, so answers cannot change the frame. */
function frameFor(players) {
  const frame = { ...BASE_FRAME };
  for (const { x, y } of players) {
    frame.minX = Math.min(frame.minX, x - 1);
    frame.maxX = Math.max(frame.maxX, x + 1);
    frame.minY = Math.min(frame.minY, y - 1);
    frame.maxY = Math.max(frame.maxY, y + 1);
  }
  return frame;
}

// Learner context is authored, but must not repeat private answers, jobs or source identities.
function answerBearingContext(pkg, call, context) {
  const normalize = value => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  const parts=[context?.callName, context?.situation, context?.question].map(normalize);
  const visible = parts.join(' ');
  const privateValues = [pkg.packageId, pkg.familyId, call.callId, call.diagramRef?.diagramId, call.coachKeyRef?.keyId,
    ...(call.roles ?? []).flatMap(role => [role.roleId, ...JOB_TEXT_FIELDS.map(field => role[field])]),
    ...(pkg.coachKeys ?? []).flatMap(key => (key.answers ?? []).map(item => item.answer)),
    ...(pkg.sourceRefs ?? []).map(source => source.sourceId)];
  return privateValues.some(value => isText(value) && (parts.includes(normalize(value)) || (normalize(value).length >= 4 && visible.includes(normalize(value)))));
}

function identifyCards(call, offenseSource, fieldSide, context) {
  const roles = sortedRoles(call);
  const offense = neutralOffense(offenseSource);
  const frame = frameFor([...offense, ...roles.map((role) => role.alignment)]);
  return roles.map((focus, index) => ({
    card: index + 1,
    total: roles.length,
    context: { callName: context.callName, situation: context.situation },
    prompt: context.question,
    look: {
      offense: offense.map((player) => ({ ...player })),
      defense: roles.map((role, i) => ({ id: `d${i + 1}`, label: role === focus ? IDENTIFY_MARKER : '', x: role.alignment.x, y: role.alignment.y })),
      fieldSide,
    },
    frame: { ...frame },
  }));
}

function studyProjection(pkg, call, offenseSource) {
  const roles = sortedRoles(call);
  const ordinalOf = new Map(roles.map((role, i) => [role.roleId, i + 1]));
  const labelOf = new Map(roles.map((role) => [role.roleId, role.positionLabel]));
  const offense = neutralOffense(offenseSource);
  return {
    callName: call.learnerContext.callName,
    situation: call.learnerContext.situation,
    teachingCues: [...call.teachingCues],
    roles: roles.map((role, i) => ({
      ordinal: i + 1, positionLabel: role.positionLabel, key: role.key, decision: role.decision, responsibility: role.responsibility,
      finish: role.finish, fallback: role.fallback, runFitOwnership: role.runFitOwnership,
    })),
    exchanges: (call.exchangeOutcomes ?? []).map((outcome) => ({
      condition: outcome.condition,
      jobs: outcome.pairedJobs.map((item) => ({ ordinal: ordinalOf.get(item.roleId), positionLabel: labelOf.get(item.roleId), job: item.job })),
      replacements: outcome.replacementCoverage.map((item) => ({ ordinal: ordinalOf.get(item.roleId), positionLabel: labelOf.get(item.roleId), coverage: item.coverage })),
      expectedRushCount: outcome.expectedRushCount,
      expectedCoverageCount: outcome.expectedCoverageCount,
    })),
    look: {
      offense,
      defense: roles.map((role, i) => ({ id: `d${i + 1}`, label: role.positionLabel, x: role.alignment.x, y: role.alignment.y })),
      fieldSide: fieldSideOf(pkg, call),
    },
    frame: frameFor([...offense, ...roles.map((role) => role.alignment)]),
  };
}

const MODE_KINDS = { identify: 'identify-projection', 'player-study': 'player-study-projection' };
const projectionBase = (kind) => ({ packageKind: kind, schemaVersion: SCHEME_SCHEMA_VERSION, synthetic: true });
const heldProjection = (kind, reason) => ({ ...projectionBase(kind), held: true, reason });

const usableApproval = async (pkg) => pkg?.frozen === true && pkg.approval?.status === 'approved'
  && pkg.approval.approvedDigest === pkg.contentDigest && await computeContentDigest(pkg) === pkg.contentDigest;

async function sealProjection(body) {
  return { ...body, projectionDigest: await digestOf(body) };
}

/** Compatibility identity of the existing authored diagram, never an approval/security hash. */
function nativeDiagramRevision(play) {
  const fields = ['name', 'family', 'formation', 'personnel', 'fieldSide', 'players', 'defenders', 'assignments'];
  const content = Object.fromEntries(fields.map(field => [field, play?.[field]]));
  content.fieldSide = play?.fieldSide ?? 'none';
  let hash = 0xcbf29ce484222325n;
  const text = canonicalSchemeJson(content);
  for (let i = 0; i < text.length; i++) hash = ((hash ^ BigInt(text.charCodeAt(i))) * 0x100000001b3n) & 0xffffffffffffffffn;
  return `rev-${hash.toString(16).padStart(16, '0')}`;
}

/** Re-derive a saved snapshot from its pinned call. This does not grant package approval. */
export async function deriveSnapshotProjections({ pin, call, diagram, keyRecord = null }) {
  if (!call || call.callId !== pin.callId || await computeCallDigest({ packageId: pin.packageId, familyId: call.familyId }, call) !== pin.callDigest) fail('call-digest-mismatch', 'The call does not match its pin.');
  if (!diagram || nativeDiagramRevision(diagram) !== call.diagramRef?.teachableRevision) fail('diagram-revision-mismatch', 'The diagram does not match its call revision.');
  const formation = call.formationCases[0];
  if (!formation) fail('missing-formation', 'The call has no authored formation case.');
  const pkg = { packageId: pin.packageId, familyId: call.familyId, coachKeys: keyRecord ? [keyRecord] : [], diagrams: [{ diagramId: call.diagramRef.diagramId, play: diagram }] };
  if (answerBearingContext(pkg, call, call.learnerContext)) fail('answer-bearing-context', 'The authored learner context contains private answers or jobs.');
  const publicPin = { packageId: pin.packageId, revision: pin.revision, callId: call.callId };
  return {
    study: await sealProjection({ ...projectionBase(MODE_KINDS['player-study']), held: false, pin: publicPin, ...studyProjection(pkg, call, formation.offense) }),
    identify: await sealProjection({ ...projectionBase(MODE_KINDS.identify), held: false, pin: publicPin, cards: identifyCards(call, formation.offense, fieldSideOf(pkg, call), call.learnerContext) }),
  };
}

/** Strict allowlist construction. No coach object is copied and then trimmed. */
export async function deriveLearnerProjection(pkg, mode, revisionRef) {
  const kind = MODE_KINDS[mode];
  if (!kind) fail('unknown-projection-mode', 'Learner projections are identify or player-study.');
  if (!await usableApproval(pkg)) return heldProjection(kind, 'package-not-approved');
  if (revisionRef?.packageId !== pkg.packageId || revisionRef?.revision !== pkg.revision || revisionRef?.contentDigest !== pkg.contentDigest) return heldProjection(kind, 'revision-mismatch');
  const call = callOf(pkg, revisionRef.callId);
  if (!call) return heldProjection(kind, 'unknown-call');
  const formationCase = revisionRef.formationCaseId === undefined ? call.formationCases[0] : call.formationCases.find((item) => item.formationCaseId === revisionRef.formationCaseId);
  if (!formationCase) return heldProjection(kind, 'unknown-formation-case');
  const pin = { packageId: pkg.packageId, revision: pkg.revision, callId: call.callId };
  const header = { ...projectionBase(kind), held: false, pin };
  if (mode === 'identify' && answerBearingContext(pkg, call, call.learnerContext)) return heldProjection(kind, 'answer-bearing-context');
  if (mode === 'identify') return sealProjection({ ...header, cards: identifyCards(call, formationCase.offense, fieldSideOf(pkg, call), call.learnerContext) });
  return sealProjection({ ...header, ...studyProjection(pkg, call, formationCase.offense) });
}

/** Coach-only. Maps each neutral card to its role and authored answer, never invented. */
export function deriveCoachKeySheet(pkg, callId) {
  const call = callOf(pkg, callId);
  if (!call) fail('unknown-call', `Call ${callId} is not in this revision.`);
  const record = isObject(call.coachKeyRef) ? keyRecordOf(pkg, call.coachKeyRef) : null;
  const bindingStatus = keyBindingStatus(pkg, callId);
  return {
    audience: 'coach-only',
    packageId: pkg.packageId,
    revision: pkg.revision,
    callId,
    callDigest: pkg.callDigests?.[callId] ?? null,
    keyDigest: call.coachKeyRef?.digest ?? null,
    entries: sortedRoles(call).map((role, index) => {
      const authored = (record?.answers ?? []).find((item) => item.roleId === role.roleId);
      const answer = bindingStatus === 'current' && isText(authored?.answer) ? authored.answer : null;
      return {
        card: index + 1, roleId: role.roleId, positionLabel: role.positionLabel, questionId: `identify-card-${index + 1}`,
        questionKind: authored?.questionKind ?? 'teachBack', responsibility: role.responsibility, answer,
        status: answer === null ? 'held' : 'keyed', heldReason: bindingStatus === 'stale' ? 'stale-key' : answer === null ? 'missing-key' : null,
      };
    }),
  };
}

// ---------------------------------------------------------------- corrections and rechecks
export function correctionErrors(correction) {
  const errors = [];
  const need = (ok, code, path, message) => { if (!ok) errors.push({ code, path, message }); };
  need(isObject(correction), 'not-an-object', '', 'A correction must be an object.');
  if (!isObject(correction)) return errors;
  need(isId(correction.correctionId), 'invalid-id', 'correctionId', 'A correction needs a stable id.');
  need(isId(correction.originatingPackageId) && Number.isInteger(correction.originatingRevision) && isDigest(correction.originatingDigest), 'correction-origin-mismatch', 'originatingPackageId', 'A correction names its exact package, revision and digest.');
  need(isId(correction.callId), 'unknown-call', 'callId', 'A correction names its call.');
  need(isText(correction.observedIssue), 'invalid-correction', 'observedIssue', 'Record what was observed.');
  need(OBSERVATION_TYPES.includes(correction.observationType), 'invalid-observation-type', 'observationType', 'Observations come from a coach or a synthetic fixture. Quiz and film results are not observations.');
  need(isObject(correction.practicePeriodRef), 'invalid-correction', 'practicePeriodRef', 'A correction names its practice period.');
  need(RECHECK_STATUSES.includes(correction.recheckStatus), 'invalid-correction', 'recheckStatus', 'Unknown recheck status.');
  return errors;
}

export const serializeSchemeCorrection = (correction) => `${JSON.stringify({ packageKind: SCHEME_CORRECTION_KIND, schemaVersion: SCHEME_SCHEMA_VERSION, correction }, null, 2)}\n`;

export function readSchemeCorrection(text) {
  const reject = (code, message) => ({ ok: false, correction: null, errors: [{ code, path: '', message }] });
  if (typeof text !== 'string' || !text.trim()) return reject('nothing-to-import', 'There is nothing to import.');
  if (text.length > MAX_SCHEME_IMPORT_CHARS) return reject('too-large', 'This input is too large to be a correction.');
  let doc;
  try { doc = JSON.parse(text.replace(/^﻿/, '')); } catch { return reject('invalid-json', 'This is not valid JSON.'); }
  if (!isObject(doc) || doc.packageKind !== SCHEME_CORRECTION_KIND) return reject('unknown-package-kind', 'This is not a correction export.');
  if (doc.schemaVersion !== SCHEME_SCHEMA_VERSION) return reject('unsupported-schema-version', 'This correction version is not supported.');
  const errors = correctionErrors(doc.correction);
  return errors.length ? { ok: false, correction: null, errors } : { ok: true, correction: doc.correction, errors: [] };
}

/** Practice exports observations; only this Playmaker action opens a new draft revision. */
export function createCorrectionDraft(pkg, correction, { now = nowIso() } = {}) {
  if (correction?.originatingPackageId !== pkg?.packageId || correction?.originatingRevision !== pkg?.revision || correction?.originatingDigest !== pkg?.contentDigest) {
    fail('correction-origin-mismatch', 'This correction does not belong to this exact revision.');
  }
  if (!callOf(pkg, correction.callId)) fail('unknown-call', 'This correction names a call outside this revision.');
  const problem = correctionErrors(correction)[0];
  if (problem) fail(problem.code, problem.message);
  const draft = createDraftRevision(pkg, { now });
  const call = callOf(draft, correction.callId);
  const change = correction.proposedRuleChange ?? null;
  if (change !== null) {
    const role = call.roles.find((item) => item.roleId === change?.roleId);
    if (!role || !JOB_TEXT_FIELDS.includes(change?.field) || !isText(change?.value)) fail('invalid-rule-change', 'A proposed change names one role and one contract field.');
    role[change.field] = change.value;
  }
  call.status = 'draft';
  draft.correctionRefs = [...(draft.correctionRefs ?? []), { id: correction.correctionId, revision: pkg.revision, digest: pkg.contentDigest }];
  return draft;
}

const samePicture = (a, b) => a.length === b.length && a.every((player, i) => player.label === b[i].label && player.x === b[i].x && player.y === b[i].y);

/** Same strict card builder, with an authored changed offense. Never graded. */
export async function buildRecheckProjection(pkg, scenario) {
  const kind = MODE_KINDS.identify;
  if (!await usableApproval(pkg)) return heldProjection(kind, 'package-not-approved');
  const call = callOf(pkg, scenario?.callId);
  if (!call) fail('unknown-call', 'This scenario names a call outside this revision.');
  const context = scenario.learnerContext;
  const offense = Array.isArray(scenario.offense) ? scenario.offense : [];
  if (answerBearingContext(pkg, call, context)) return heldProjection(kind, 'answer-bearing-context');
  if (offense.length !== ROLE_COUNT || offense.some((p) => !Number.isFinite(p?.x) || !Number.isFinite(p?.y)) || !isId(scenario.scenarioId) || !isText(context?.callName) || !isText(context?.situation) || !isText(context?.question)) {
    fail('invalid-scenario', `A changed picture needs an id, authored context and ${ROLE_COUNT} placed offensive players.`);
  }
  if (call.formationCases.some((item) => samePicture(item.offense, offense))) fail('picture-unchanged', 'This picture matches an existing formation case, so it is not a changed picture.');
  return sealProjection({
    ...projectionBase(kind), held: false, gradingStatus: 'ungraded',
    pin: { packageId: pkg.packageId, revision: pkg.revision, callId: call.callId },
    recheck: { scenarioId: scenario.scenarioId, linkedRevision: { packageId: pkg.packageId, revision: pkg.revision } },
    cards: identifyCards(call, offense, fieldSideOf(pkg, call), context),
  });
}
