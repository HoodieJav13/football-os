// Practice adapter: manifest-only intake, exact pins, observations and correction export.
// Needs tests/fixtures/schemeFixture.mjs, a byte-identical copy of the lesson fixture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as scheme from '../src/domain/schemePackage.js';
import * as H from '../src/domain/schemeHandoff.js';
import { exportProject, importProject, pruneReferences, validateProject } from '../src/domain/project.js';
import { dayAsTemplate, applyTemplate, duplicateDay, duplicatePeriod, updatePeriod } from '../src/domain/week.js';
import { applyShortened } from '../src/domain/pilot.js';
import { generateFixture } from '../src/domain/fixtures.js';
import { createIdFactory } from '../src/domain/ids.js';
import { loadLibrary } from './helpers.mjs';
import { CALL, approvedPackage, findCall, findRole, frozenPackage, nextApproved, syntheticDraftPackage } from './fixtures/schemeFixture.mjs';

const lib = loadLibrary();
const fresh = () => generateFixture({ seed: 42, scenario: 'example', library: lib });
const ids = () => createIdFactory({ seed: 7 });
const editSim = (draft) => { findRole(findCall(draft, CALL.sim4), 'syn-r08').decision += ' revised'; };
const text = scheme.serializeSchemePackage;

async function imported(project, pkg) {
  const plan = await H.previewSchemeImport(project, text(pkg));
  return { plan, ...H.confirmSchemeImport(project, plan, { confirmedDigest: pkg.contentDigest }) };
}

async function pinned() {
  const pkg = await approvedPackage(scheme);
  const { project: withManifest } = await imported(fresh(), pkg);
  const { id: dayId, periods: [{ id: periodId }] } = withManifest.week.days[0];
  const ref = scheme.schemeRefFor(pkg, CALL.sim4);
  const project = H.pinSchemeCall(withManifest, dayId, periodId, ref);
  const day = project.week.days[0];
  return { pkg, ref, day, period: day.periods[0], project };
}

test('preview changes nothing; confirm stores a manifest and leaves the schedule alone', async () => {
  const pkg = await approvedPackage(scheme);
  const project = fresh();
  const before = JSON.stringify(project);
  const plan = await H.previewSchemeImport(project, text(pkg));
  assert.equal(plan.action, 'create');
  assert.equal(JSON.stringify(project), before);
  const result = H.confirmSchemeImport(project, plan, { confirmedDigest: pkg.contentDigest });
  assert.equal(result.receipt.status, 'imported');
  assert.deepEqual(result.project.week, project.week);
  assert.deepEqual(result.project.groups, project.groups);
});

test('Practice storage holds no package prose or answer keys', async () => {
  const { project } = await pinned();
  assert.doesNotMatch(JSON.stringify(project), /SYN-JOB|SYN-CUE|COACH-ONLY|AREA-SENTINEL|responsibilityArea/);
  const leaked = structuredClone(project);
  leaked.schemeManifests.packages[Object.keys(leaked.schemeManifests.packages)[0]].revisions[0].coachKeys = [];
  assert.ok(validateProject(leaked).errors.some((e) => /manifests only/.test(e.message)));
});

test('a coach package can never replace the plan through the ordinary project import', async () => {
  const result = importProject(text(await approvedPackage(scheme)));
  assert.equal(result.ok, false);
});

test('no-op, conflict, history, held and rejected imports are honest and keep pins', async () => {
  const { pkg, project } = await pinned();
  const noop = await imported(project, pkg);
  assert.equal(noop.plan.action, 'noop');
  assert.equal(noop.changed, false);
  const rival = await frozenPackage(scheme, (() => { const d = syntheticDraftPackage(); editSim(d); return d; })());
  const conflict = await H.previewSchemeImport(project, text(rival));
  assert.deepEqual(conflict.conflicts.map((c) => c.code), ['same-revision-different-digest']);
  assert.equal(conflict.preservedPins.length, 1);
  assert.equal(H.confirmSchemeImport(project, conflict, { confirmedDigest: rival.contentDigest }).receipt.reason, 'resolution-required');
  const heldDraft = syntheticDraftPackage();
  heldDraft.packageId = 'syn-pkg-held';
  heldDraft.coachKeys.shift();
  const held = await imported(project, await frozenPackage(scheme, heldDraft));
  assert.equal(held.receipt.status, 'held');
  assert.equal(held.changed, false);
  const tampered = structuredClone(pkg);
  tampered.calls[0].roles[0].decision += ' x';
  assert.equal((await H.previewSchemeImport(project, text(tampered))).action, 'rejected');
  assert.equal((await H.previewSchemeImport(project, '{bad')).action, 'rejected');
});

test('a plan previewed before the list changed is refused', async () => {
  const pkg = await approvedPackage(scheme);
  const next = await nextApproved(scheme, pkg, editSim);
  const empty = fresh();
  const stale = await H.previewSchemeImport(empty, text(next));
  const { project } = await imported(empty, pkg);
  assert.equal(H.confirmSchemeImport(project, stale, { confirmedDigest: next.contentDigest }).receipt.reason, 'stale-plan');
});

test('a descendant never moves a pin, and staleness is per call', async () => {
  const { pkg, ref, day, period, project } = await pinned();
  const quarters = scheme.schemeRefFor(pkg, CALL.quarters);
  const both = H.pinSchemeCall(project, day.id, period.id, quarters);
  const next = await nextApproved(scheme, pkg, editSim);
  const { project: after } = await imported(both, next);
  assert.deepEqual(after.week, both.week);
  assert.equal(H.schemeRefStatus(after, ref), 'stale');
  assert.equal(H.schemeRefStatus(after, quarters), 'current');
  const replaced = H.replaceSchemeCall(after, day.id, period.id, ref, scheme.schemeRefFor(next, CALL.sim4));
  assert.equal(H.schemeRefStatus(replaced, scheme.schemeRefFor(next, CALL.sim4)), 'current');
});

test('pins need an exact held, approved revision, with no latest fallback', async () => {
  const pkg = await frozenPackage(scheme);
  const { project } = await imported(fresh(), pkg);
  const day = project.week.days[0];
  assert.throws(() => H.pinSchemeCall(project, day.id, day.periods[0].id, scheme.schemeRefFor(pkg, CALL.sim4)), /approval claim/);
  const approved = await approvedPackage(scheme);
  assert.throws(() => H.pinSchemeCall(project, day.id, day.periods[0].id, { ...scheme.schemeRefFor(approved, CALL.sim4), revision: 9 }), /exact revision/);
});

test('pins survive export, import, edit, duplication, templates, Pilot copies and pruning', async () => {
  const { ref, day, period, project } = await pinned();
  const exported = exportProject(project, null);
  const reopened = importProject(exported);
  assert.equal(reopened.ok, true, JSON.stringify(reopened.errors));
  assert.equal(exportProject(reopened.project, null), exported, 'byte-stable');
  const pin = (p) => p.schemeRefs?.[0];
  const week = project.week;
  assert.deepEqual(pin(updatePeriod(week, day.id, period.id, { title: 'Renamed' }).days[0].periods[0]), ref);
  const dup = duplicatePeriod(week, day.id, period.id, ids());
  assert.deepEqual(pin(dup.week.days[0].periods.find((p) => p.id === dup.id)), ref);
  assert.notEqual(pin(dup.week.days[0].periods.find((p) => p.id === dup.id)), pin(period));
  const copy = duplicateDay(week, day.id, ids());
  assert.deepEqual(pin(copy.week.days.find((d) => d.id === copy.id).periods[0]), ref);
  const template = dayAsTemplate(day, 'tpl-1', 'Template');
  template.periods[0].cardIds = [];
  assert.deepEqual(template.periods[0].schemeRefs[0], ref);
  const applied = applyTemplate(week, week.days[1].id, template, ids());
  assert.deepEqual(applied.days[1].periods[0].schemeRefs[0], ref);
  const scheduled = day.periods.filter((p) => p.scheduled);
  if (scheduled.length) {
    const shortened = applyShortened(week, day.id, Math.max(10, Math.floor(scheduled.reduce((sum, p) => sum + p.minutes, 0) / 2)), ids());
    if (shortened.ok) assert.deepEqual(pin(shortened.day.periods[0]), ref);
  }
  assert.deepEqual(pin(pruneReferences(project).week.days[0].periods[0]), ref);
});

test('older projects keep their exact bytes and shape', () => {
  const project = fresh();
  const textOut = exportProject(project, null);
  const doc = JSON.parse(textOut);
  for (const key of ['schemeManifests', 'schemeObservations']) assert.equal(Object.hasOwn(doc, key), false);
  const reopened = importProject(textOut);
  assert.deepEqual(reopened.project, project);
});

test('malformed pins are errors, and an unknown revision is held as a warning', async () => {
  const { project, ref } = await pinned();
  const bad = structuredClone(project);
  bad.week.days[0].periods[0].schemeRefs = [{ ...ref, callDigest: 'short' }];
  assert.ok(validateProject(bad).errors.some((e) => e.path.endsWith('schemeRefs[0]')));
  const missing = structuredClone(project);
  delete missing.schemeManifests;
  const checked = validateProject(missing);
  assert.deepEqual(checked.errors, []);
  assert.ok(checked.warnings.some((w) => /not in this project/.test(w)));
  assert.equal(H.schemeRefStatus(missing, ref), 'missing');
});

test('Practice exports a correction but cannot create a rule revision', async () => {
  const { pkg, ref, day, period, project } = await pinned();
  assert.equal(H.createCorrectionDraft, undefined);
  const before = JSON.stringify(project.schemeManifests);
  const { project: observed, correctionId } = H.recordSchemeObservation(project, {
    ref, dayId: day.id, periodId: period.id, observedIssue: 'Synthetic note: the replacement arrived late.', observationType: 'synthetic-fixture',
    proposedRuleChange: { roleId: 'syn-r04', field: 'decision', value: 'Revised synthetic decision' }, changedPictureScenarioRef: 'syn-scn-01',
  }, ids());
  assert.equal(JSON.stringify(observed.schemeManifests), before);
  const output = H.correctionExportText(observed, correctionId);
  assert.doesNotMatch(output, /SYN-JOB|COACH-ONLY|fieldNote/);
  const read = scheme.readSchemeCorrection(output);
  assert.equal(read.ok, true);
  const draft = scheme.createCorrectionDraft(pkg, read.correction);
  assert.equal(draft.revision, 2);
  assert.equal(draft.approval.status, 'draft');
});

test('quiz results are not observations, and field-observed needs a coach note', async () => {
  const { ref, day, period, project } = await pinned();
  const base = { ref, dayId: day.id, periodId: period.id, observedIssue: 'x' };
  assert.throws(() => H.recordSchemeObservation(project, { ...base, observationType: 'quiz-result' }, ids()));
  const { project: observed, correctionId } = H.recordSchemeObservation(project, { ...base, observationType: 'coach-observation' }, ids());
  assert.throws(() => H.setRecheckStatus(observed, correctionId, 'field-observed'), /coach note/);
  const done = H.setRecheckStatus(observed, correctionId, 'field-observed', { fieldNote: 'Seen in team period' });
  assert.equal(done.schemeObservations[0].recheckStatus, 'field-observed');
  assert.deepEqual(validateProject(done).errors, []);
});
