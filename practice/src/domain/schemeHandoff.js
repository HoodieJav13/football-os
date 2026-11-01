// Practice side of the scheme package. Pure.
// Practice keeps manifests (ids, revisions, digests, call names) plus its own observations:
// never package prose, diagrams or coach keys. The Playmaker file stays the source of content.
// Practice exports corrections; it cannot create, freeze or approve a rule revision.
import {
  JOB_TEXT_FIELDS, OBSERVATION_TYPES, RECHECK_STATUSES, changedCallIds, classifyRevision, correctionErrors, deriveRevisionStatus,
  readSchemeText, schemeManifest, serializeSchemeCorrection,
} from './schemePackage.js';
import { updatePeriod } from './week.js';

const isDigest = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const isText = (value) => typeof value === 'string' && value.trim() !== '';
const REF_KEYS = ['packageId', 'revision', 'contentDigest', 'callId', 'callDigest'];

export const STATUS_TEXT = Object.freeze({
  current: 'Current',
  stale: 'Stale: a newer revision changed this call',
  missing: 'Held: this revision or call is not in this project',
  conflict: 'Conflict: this pin disagrees with the imported revision',
});

const packagesOf = (project) => project.schemeManifests?.packages ?? {};
const entryOf = (project, packageId) => (Object.hasOwn(packagesOf(project), packageId) ? packagesOf(project)[packageId] : null);
const fingerprintOf = (project) => JSON.stringify(Object.keys(packagesOf(project)).sort().map((id) => [id, packagesOf(project)[id].current, packagesOf(project)[id].revisions.map((m) => m.contentDigest)]));

/** Ids and labels only. Role jobs, keys and diagrams never enter Practice storage. */
function manifestFrom(pkg) {
  const base = schemeManifest(pkg);
  const roleSets = new Map(pkg.calls.map((call) => [call.callId, call.roles.map((role) => ({ roleId: role.roleId, positionLabel: role.positionLabel }))]));
  return {
    ...base,
    calls: base.calls.map((call) => ({ ...call, roles: roleSets.get(call.callId) })),
    scenarios: (pkg.scenarios ?? []).map((scenario) => ({ scenarioId: scenario.scenarioId, callId: scenario.callId })),
  };
}

export function schemePins(project) {
  return project.week.days.flatMap((day) => day.periods.flatMap((period) => (period.schemeRefs ?? []).map((ref) => ({ ...ref, dayId: day.id, periodId: period.id }))));
}

/** Preview only: reads and verifies the file, stores nothing. */
export async function previewSchemeImport(project, text) {
  const preservedPins = schemePins(project);
  const base = { conflicts: [], errors: [], warnings: [], heldAssets: [], manifest: null, changedCallIds: [], preservedPins, approvalClaim: null, baseFingerprint: fingerprintOf(project) };
  const read = await readSchemeText(text);
  if (!read.ok) return { ...base, action: 'rejected', errors: read.errors, warnings: read.warnings };
  const entry = entryOf(project, read.pkg.packageId);
  const { action: classified, conflicts } = classifyRevision(entry, read.pkg);
  const action = read.heldAssets.length && ['create', 'descendant', 'history'].includes(classified) ? 'held' : classified;
  const current = entry?.revisions.find((manifest) => manifest.contentDigest === entry.current.contentDigest);
  const digestsOf = (calls) => Object.fromEntries((calls ?? []).map((call) => [call.callId, call.callDigest]));
  const manifest = manifestFrom(read.pkg);
  return { ...base, action, conflicts, warnings: read.warnings, heldAssets: read.heldAssets, approvalClaim: read.approvalClaim, manifest, changedCallIds: changedCallIds(digestsOf(current?.calls), digestsOf(manifest.calls)) };
}

const refused = (project, reason, message, action = null) => ({ ok: false, changed: false, project, receipt: { status: 'refused', reason, action, message } });

function withManifest(project, manifest, { makeCurrent }) {
  const existing = entryOf(project, manifest.packageId);
  const entry = existing ? { ...existing, revisions: [...existing.revisions, manifest] } : { packageId: manifest.packageId, familyId: manifest.familyId, current: null, revisions: [manifest] };
  if (makeCurrent || !entry.current) entry.current = { revision: manifest.revision, contentDigest: manifest.contentDigest };
  return { ...project, schemeManifests: { packages: { ...packagesOf(project), [manifest.packageId]: entry } } };
}

/** Never touches the week: pins, schedule and every other record stay exactly as they were. */
export function confirmSchemeImport(project, plan, { confirmedDigest, resolution } = {}) {
  if (!plan || plan.action === 'rejected' || !plan.manifest) return refused(project, 'rejected', 'This file was rejected. Nothing changed.');
  const { manifest } = plan;
  if (confirmedDigest !== manifest.contentDigest) return refused(project, 'not-confirmed', 'The confirmation does not match the previewed revision. Nothing changed.', plan.action);
  const entry = entryOf(project, manifest.packageId);
  const receipt = { action: plan.action, packageId: manifest.packageId, revision: manifest.revision, contentDigest: manifest.contentDigest, approvalClaim: manifest.approvalClaim };
  if (entry?.revisions.some((item) => item.contentDigest === manifest.contentDigest)) {
    return { ok: true, changed: false, project, receipt: { ...receipt, status: 'noop', message: 'This exact revision is already here. Nothing changed.' } };
  }
  if (plan.baseFingerprint !== fingerprintOf(project)) return refused(project, 'stale-plan', 'The plan’s package list changed after this preview. Preview the file again.', plan.action);
  if (plan.action === 'held') return { ok: false, changed: false, project, receipt: { ...receipt, status: 'held', message: 'Referenced material is missing, so this revision is held and was not added.' } };
  if (plan.action === 'conflict') {
    if (!resolution) return refused(project, 'resolution-required', 'This conflict needs an explicit choice. Nothing changed.', plan.action);
    const foreign = plan.conflicts.some((conflict) => conflict.code === 'foreign-family');
    if (!['keep-current', 'adopt-incoming'].includes(resolution) || (foreign && resolution !== 'keep-current')) return refused(project, 'unsupported-resolution', 'That resolution is not available for this conflict.', plan.action);
    if (resolution === 'keep-current') return { ok: true, changed: false, project, receipt: { ...receipt, status: 'resolved', resolution, message: 'Current revision kept. Practice stores no package bytes; keep this file if you need it.' } };
    return { ok: true, changed: true, project: withManifest(project, manifest, { makeCurrent: true }), receipt: { ...receipt, status: 'resolved', resolution, message: `Revision ${manifest.revision} is now current here. Existing pins are unchanged.` } };
  }
  if (plan.action === 'history') {
    return { ok: true, changed: true, project: withManifest(project, manifest, { makeCurrent: false }), receipt: { ...receipt, status: 'retained-as-history', message: 'Kept as history. The current revision did not change.' } };
  }
  return { ok: true, changed: true, project: withManifest(project, manifest, { makeCurrent: true }), receipt: { ...receipt, status: 'imported', message: `Revision ${manifest.revision} imported. Existing pins are unchanged.` } };
}

export function schemeCallChoices(project) {
  return Object.values(packagesOf(project)).flatMap((entry) => entry.revisions.filter((manifest) => manifest.approvalClaim.status === 'approved').flatMap((manifest) => manifest.calls.map((call) => ({
    label: `${call.callName} · revision ${manifest.revision}${manifest.contentDigest === entry.current.contentDigest ? ' (current)' : ''}`,
    ref: { packageId: manifest.packageId, revision: manifest.revision, contentDigest: manifest.contentDigest, callId: call.callId, callDigest: call.callDigest },
  }))));
}

const sameRef = (a, b) => REF_KEYS.every((key) => a[key] === b[key]);

function manifestFor(project, ref) {
  return entryOf(project, ref.packageId)?.revisions.find((manifest) => manifest.revision === ref.revision && manifest.contentDigest === ref.contentDigest) ?? null;
}

const exactRef = (ref) => Object.fromEntries(REF_KEYS.map((key) => [key, ref[key]]));

/** Binds one exact approved revision to a period. There is no latest fallback. */
export function pinSchemeCall(project, dayId, periodId, ref) {
  const manifest = manifestFor(project, ref);
  const call = manifest?.calls.find((item) => item.callId === ref.callId && item.callDigest === ref.callDigest);
  if (!call) throw new Error('That exact revision and call are not in this project.');
  if (manifest.approvalClaim.status !== 'approved') throw new Error('Only a revision carrying a local approval claim can be pinned.');
  const period = project.week.days.find((day) => day.id === dayId)?.periods.find((item) => item.id === periodId);
  if (!period) throw new Error('That period is not in this week.');
  const refs = period.schemeRefs ?? [];
  if (refs.some((item) => sameRef(item, ref))) return project;
  return { ...project, week: updatePeriod(project.week, dayId, periodId, { schemeRefs: [...refs, exactRef(ref)] }) };
}

export function unpinSchemeCall(project, dayId, periodId, ref) {
  const period = project.week.days.find((day) => day.id === dayId)?.periods.find((item) => item.id === periodId);
  const refs = period?.schemeRefs ?? [];
  if (!refs.some((item) => sameRef(item, ref))) return project;
  return { ...project, week: updatePeriod(project.week, dayId, periodId, { schemeRefs: refs.filter((item) => !sameRef(item, ref)) }) };
}

/** Explicit replacement only. Imports never move an existing pin. */
export function replaceSchemeCall(project, dayId, periodId, oldRef, newRef) {
  return pinSchemeCall(unpinSchemeCall(project, dayId, periodId, oldRef), dayId, periodId, newRef);
}

export function schemeRefStatus(project, ref) {
  const entry = entryOf(project, ref.packageId);
  if (!entry || !manifestFor(project, ref)) return 'missing';
  const current = entry.revisions.find((manifest) => manifest.contentDigest === entry.current.contentDigest);
  const shape = { packageId: current.packageId, revision: current.revision, contentDigest: current.contentDigest, calls: current.calls, callDigests: Object.fromEntries(current.calls.map((call) => [call.callId, call.callDigest])) };
  return deriveRevisionStatus(shape, ref);
}

export const schemeCallName = (project, ref) => manifestFor(project, ref)?.calls.find((call) => call.callId === ref.callId)?.callName ?? ref.callId;

export function schemePrintLines(project, period) {
  return (period.schemeRefs ?? []).map((ref) => `${schemeCallName(project, ref)} · revision ${ref.revision} · ${ref.callDigest.slice(0, 8)} · ${STATUS_TEXT[schemeRefStatus(project, ref)]}`);
}

export const schemeCallRoles = (project, ref) => manifestFor(project, ref)?.calls.find((call) => call.callId === ref.callId)?.roles ?? [];
export const schemeCallScenarios = (project, ref) => (manifestFor(project, ref)?.scenarios ?? []).filter((scenario) => scenario.callId === ref.callId);

/** An observation is Practice-owned. It proposes; only Playmaker can open a new revision. */
export function recordSchemeObservation(project, input, newId) {
  const { ref, dayId, periodId, observedIssue, observationType, proposedRuleChange = null, changedPictureScenarioRef = null } = input;
  const correction = {
    correctionId: newId('cor'),
    originatingPackageId: ref.packageId, originatingRevision: ref.revision, originatingDigest: ref.contentDigest,
    callId: ref.callId, observedIssue, observationType,
    practicePeriodRef: { dayId, periodId },
    evidenceRef: null, proposedRuleChange, newDraftRevisionRef: null, changedPictureScenarioRef,
    recheckStatus: 'planned',
  };
  const problem = correctionErrors(correction)[0];
  if (problem) throw new Error(problem.message);
  if (proposedRuleChange !== null && (!JOB_TEXT_FIELDS.includes(proposedRuleChange.field) || !isText(proposedRuleChange.roleId) || !isText(proposedRuleChange.value))) {
    throw new Error('A proposed change names one role, one contract field and the new wording.');
  }
  return { project: { ...project, schemeObservations: [...(project.schemeObservations ?? []), { ...correction, fieldNote: null }] }, correctionId: correction.correctionId };
}

/** Field-observed is a coach's note from practice. No digital response can set it. */
export function setRecheckStatus(project, correctionId, status, { fieldNote = null } = {}) {
  if (!RECHECK_STATUSES.includes(status)) throw new Error('Unknown recheck status.');
  if (status === 'field-observed' && !isText(fieldNote)) throw new Error('Field-observed needs a coach note from practice.');
  const list = project.schemeObservations ?? [];
  if (!list.some((item) => item.correctionId === correctionId)) throw new Error('That observation is not in this project.');
  return { ...project, schemeObservations: list.map((item) => (item.correctionId === correctionId ? { ...item, recheckStatus: status, fieldNote: status === 'field-observed' ? fieldNote : item.fieldNote } : item)) };
}

export function correctionExportText(project, correctionId) {
  const record = (project.schemeObservations ?? []).find((item) => item.correctionId === correctionId);
  if (!record) throw new Error('That observation is not in this project.');
  const { fieldNote: _fieldNote, ...correction } = record;
  return serializeSchemeCorrection(correction);
}

// ---------------------------------------------------------------- project validation
const err = (path, message) => ({ path, message });

function refErrors(refs, path) {
  if (refs === undefined) return [];
  if (!Array.isArray(refs)) return [err(path, 'Scheme references must be a list.')];
  return refs.flatMap((ref, i) => {
    const ok = ref && isText(ref.packageId) && Number.isInteger(ref.revision) && ref.revision >= 1 && isDigest(ref.contentDigest) && isText(ref.callId) && isDigest(ref.callDigest);
    return ok ? [] : [err(`${path}[${i}]`, 'A scheme reference needs its exact package, revision, digest, call and call digest.')];
  });
}

export function schemeErrors(p) {
  const errors = [];
  const { schemeManifests: manifests, schemeObservations: observations } = p;
  if (manifests !== undefined) {
    if (!manifests || typeof manifests !== 'object' || typeof manifests.packages !== 'object' || manifests.packages === null) errors.push(err('schemeManifests', 'Scheme manifests must hold a packages map.'));
    else {
      for (const [id, entry] of Object.entries(manifests.packages)) {
        const path = `schemeManifests.packages.${id}`;
        if (!entry?.current || !Array.isArray(entry.revisions) || !entry.revisions.some((m) => m?.contentDigest === entry.current.contentDigest)) { errors.push(err(path, 'A scheme entry needs its revisions and current digest.')); continue; }
        // Practice storage is manifests only, so a package body here is refused outright.
        for (const manifest of entry.revisions) if (!Array.isArray(manifest?.calls) || ['coachKeys', 'diagrams', 'interpretations', 'sourceRefs'].some((key) => Object.hasOwn(manifest, key)) || manifest.calls.some((call) => Object.hasOwn(call, 'answers') || (call.roles ?? []).some((role) => Object.keys(role).some((key) => !['roleId', 'positionLabel'].includes(key))))) errors.push(err(path, 'Practice stores scheme manifests only, not package content.'));
      }
    }
  }
  if (observations !== undefined) {
    if (!Array.isArray(observations)) errors.push(err('schemeObservations', 'Scheme observations must be a list.'));
    else observations.forEach((item, i) => {
      for (const problem of correctionErrors(item)) errors.push(err(`schemeObservations[${i}].${problem.path}`, problem.message));
    });
  }
  (p.week?.days ?? []).forEach((day, i) => (day.periods ?? []).forEach((period, j) => errors.push(...refErrors(period.schemeRefs, `week.days[${i}].periods[${j}].schemeRefs`))));
  (p.templates ?? []).forEach((template, i) => (template.periods ?? []).forEach((period, j) => errors.push(...refErrors(period.schemeRefs, `templates[${i}].periods[${j}].schemeRefs`))));
  return errors;
}

export function schemeWarnings(p) {
  const missing = schemePins(p).filter((ref) => !manifestFor(p, ref));
  return missing.length ? [`${missing.length} scheme reference${missing.length === 1 ? ' names' : 's name'} a revision not in this project; those periods are held until it is imported.`] : [];
}

export { OBSERVATION_TYPES, RECHECK_STATUSES, JOB_TEXT_FIELDS };
