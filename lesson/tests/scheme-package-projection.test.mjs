// Strict learner projections, revision status, correction drafts and rechecks.
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import {
  CALL, FORMATION_CASE_ID, PACKAGE_ID, ROLE_IDS, T3, approvedPackage, changedPictureScenario, deepFreeze, findCall, findRole,
  frozenPackage, identifyLeaks, nextApproved, smuggle, syntheticCorrection, syntheticDraftPackage,
} from './fixtures/schemeFixture.mjs';

const modulePath = new URL('../src/schemePackage.js', import.meta.url);
const api = existsSync(modulePath) ? await import(modulePath) : {};
const REQUIRED = ['freezeSchemePackage', 'approveSchemePackage', 'createDraftRevision', 'schemeRefFor', 'deriveLearnerProjection'];
const ready = (...names) => {
  for (const name of [...REQUIRED, ...names]) assert.equal(typeof api[name], 'function', `schemePackage.${name} is required (SCHEME-PACKAGE-API.md)`);
};
const project = (pkg, mode, callId = CALL.sim4) => api.deriveLearnerProjection(pkg, mode, api.schemeRefFor(pkg, callId));
const identify = (pkg, callId) => project(pkg, 'identify', callId);
const study = (pkg, callId) => project(pkg, 'player-study', callId);

/** Approves a variation of the fixture without changing its package id or ancestry. */
async function approvedVariant(edit) {
  const draft = syntheticDraftPackage();
  edit(draft);
  return approvedPackage(api, draft);
}

// ---------------------------------------------------------------- Identify
test('Identify yields all eleven cards for every proof variant, rushers included', async () => {
  ready();
  const pkg = await approvedPackage(api);
  for (const callId of Object.values(CALL)) {
    const projection = await identify(pkg, callId);
    assert.equal(projection.packageKind, 'identify-projection');
    assert.equal(projection.schemaVersion, 1);
    assert.equal(projection.synthetic, true);
    assert.equal(projection.held, false);
    assert.deepEqual(projection.cards.map((card) => card.card), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    assert.equal(projection.cards.every((card) => card.total === 11), true);
  }
});

test('Identify objects hold exactly the allowlisted keys', async () => {
  ready();
  const pkg = await approvedPackage(api);
  const projection = await identify(pkg);
  assert.deepEqual(Object.keys(projection).sort(), ['cards', 'held', 'packageKind', 'pin', 'projectionDigest', 'schemaVersion', 'synthetic']);
  assert.deepEqual(Object.keys(projection.pin).sort(), ['callId', 'packageId', 'revision']);
  for (const card of projection.cards) {
    assert.deepEqual(Object.keys(card).sort(), ['card', 'context', 'frame', 'look', 'prompt', 'total']);
    assert.deepEqual(Object.keys(card.context).sort(), ['callName', 'situation']);
    assert.deepEqual(Object.keys(card.look).sort(), ['defense', 'fieldSide', 'offense']);
    assert.deepEqual(Object.keys(card.frame).sort(), ['maxX', 'maxY', 'minX', 'minY']);
    assert.equal(card.look.defense.length, 11);
    assert.equal(card.look.offense.length, 11);
    for (const player of [...card.look.defense, ...card.look.offense]) assert.deepEqual(Object.keys(player).sort(), ['id', 'label', 'x', 'y']);
  }
});

test('each card marks one defender with the star and leaves the other ten unlabelled', async () => {
  ready();
  const pkg = await approvedPackage(api);
  const { cards } = await identify(pkg);
  const marked = new Set();
  for (const card of cards) {
    const stars = card.look.defense.filter((d) => d.label === '★');
    assert.equal(stars.length, 1);
    assert.equal(card.look.defense.filter((d) => d.label === '').length, 10);
    marked.add(`${stars[0].x},${stars[0].y}`);
  }
  assert.equal(marked.size, 11, 'every role is asked once');
});

test('cards follow alignment order, so numbering cannot reveal a job grouping', async () => {
  ready();
  const pkg = await approvedPackage(api);
  const { cards } = await identify(pkg);
  const stars = cards.map((card) => card.look.defense.find((d) => d.label === '★'));
  for (let i = 1; i < stars.length; i += 1) assert.ok(stars[i - 1].x < stars[i].x || (stars[i - 1].x === stars[i].x && stars[i - 1].y <= stars[i].y));
});

test('offense labels stay neutral: authored words become ordinals', async () => {
  ready();
  const pkg = await approvedVariant((draft) => { findCall(draft, CALL.sim4).formationCases[0].offense[5].label = 'HOOK'; });
  const text = JSON.stringify((await identify(pkg)).cards);
  assert.doesNotMatch(text, /HOOK/);
  assert.match(text, /"label":"O6"/);
});

test('sufficient authored context reaches every card, identically', async () => {
  ready();
  const pkg = await approvedPackage(api);
  const context = findCall(pkg, CALL.sim4).learnerContext;
  const { cards } = await identify(pkg);
  for (const card of cards) {
    assert.deepEqual(card.context, { callName: context.callName, situation: context.situation });
    assert.equal(card.prompt, context.question);
  }
});

test('Identify payloads leak no keys, jobs, geometry, ids, digests or planted fields', async () => {
  ready();
  const pkg = await approvedPackage(api, smuggle(syntheticDraftPackage()));
  for (const callId of Object.values(CALL)) {
    const projection = await identify(pkg, callId);
    const text = JSON.stringify(projection);
    assert.deepEqual(identifyLeaks(text), []);
    assert.equal(text.includes(pkg.contentDigest), false);
    for (const digest of Object.values(pkg.callDigests)) assert.equal(text.includes(digest), false);
    for (const call of pkg.calls) assert.equal(text.includes(call.coachKeyRef.digest), false);
  }
});

const ANSWER_EDITS = {
  'role jobs': (call) => { for (const role of call.roles) { role.key += ' x'; role.decision += ' x'; role.responsibility += ' x'; role.finish += ' x'; role.fallback += ' x'; role.runFitOwnership += ' x'; } },
  'who rushes': (call) => {
    findRole(call, 'syn-r04').exchangePartnerRoleId = null;
    findRole(call, 'syn-r06').exchangePartnerRoleId = null;
    findRole(call, 'syn-r04').unit = 'rush';
    findRole(call, 'syn-r06').unit = 'coverage';
    call.exchangeOutcomes = [];
    call.ambiguousReadDefault = 'not-applicable';
  },
  'outcome records': (call) => { call.exchangeOutcomes[0].condition += ' x'; call.exchangeOutcomes[0].replacementCoverage[0].coverage += ' x'; },
  'coach-only notes': (call) => { call.counters = ['COACH-ONLY other']; call.uncertainties = ['COACH-ONLY other']; },
};

for (const [name, edit] of Object.entries(ANSWER_EDITS)) {
  test(`cards are invariant when ${name} change`, async () => {
    ready();
    const base = await approvedPackage(api);
    const edited = await approvedVariant((draft) => edit(findCall(draft, CALL.sim4)));
    assert.deepEqual((await identify(edited)).cards, (await identify(base)).cards);
  });
}

test('cards and frame are invariant to answer geometry, however large', async () => {
  ready();
  const base = await approvedPackage(api);
  const edited = await approvedVariant((draft) => {
    const diagram = draft.diagrams.find((d) => d.diagramId === findCall(draft, CALL.sim4).diagramRef.diagramId);
    for (const assignment of diagram.play.assignments) {
      assignment.points = [[0, 0], [90, 90]];
      Object.assign(assignment.definition.responsibilityArea, { center: [90, 90], radiusX: 40, radiusY: 40 });
    }
  });
  assert.deepEqual((await identify(edited)).cards, (await identify(base)).cards);
});

test('card membership is invariant to which roles have authored areas or keys', async () => {
  ready();
  const base = await approvedPackage(api);
  const edited = await approvedVariant((draft) => {
    const call = findCall(draft, CALL.sim4);
    draft.diagrams.find((d) => d.diagramId === call.diagramRef.diagramId).play.assignments = [];
    draft.coachKeys.find((k) => k.callId === CALL.sim4).answers.forEach((answer, i) => { if (i % 2) answer.answer = null; });
  });
  assert.deepEqual((await identify(edited)).cards, (await identify(base)).cards);
});

test('two calls showing one picture differ only in authored call context', async () => {
  ready();
  const pkg = await approvedPackage(api);
  const quarters = await identify(pkg, CALL.quarters);
  const sim4 = await identify(pkg, CALL.sim4);
  assert.deepEqual(quarters.cards.map((c) => [c.look, c.frame]), sim4.cards.map((c) => [c.look, c.frame]), 'SIM4 disguises as the base picture');
  assert.notDeepEqual(quarters.cards.map((c) => c.context), sim4.cards.map((c) => c.context));
});

test('one frame holds every player on all eleven cards', async () => {
  ready();
  const pkg = await approvedPackage(api);
  const { cards } = await identify(pkg);
  assert.equal(new Set(cards.map((card) => JSON.stringify(card.frame))).size, 1);
  for (const { frame, look } of cards) {
    for (const player of [...look.offense, ...look.defense]) {
      assert.ok(player.x >= frame.minX && player.x <= frame.maxX && player.y >= frame.minY && player.y <= frame.maxY);
    }
  }
});

test('a real alignment change does change the look', async () => {
  ready();
  const base = await approvedPackage(api);
  const edited = await approvedVariant((draft) => { findRole(findCall(draft, CALL.sim4), 'syn-r05').alignment.x -= 2; });
  assert.notDeepEqual((await identify(edited)).cards.map((c) => c.look), (await identify(base)).cards.map((c) => c.look));
});

test('derivation is repeatable and never mutates a frozen package', async () => {
  ready();
  const pkg = deepFreeze(await approvedPackage(api));
  const first = await identify(pkg);
  const second = await identify(pkg);
  assert.deepEqual(first, second);
  assert.match(first.projectionDigest, /^[0-9a-f]{64}$/);
  first.cards[0].look.defense[0].x = 999;
  assert.notEqual((await identify(pkg)).cards[0].look.defense[0].x, 999);
});

test('an authored formation case can be chosen, and an unknown one is held', async () => {
  ready();
  const pkg = await approvedPackage(api);
  const ref = { ...api.schemeRefFor(pkg, CALL.sim4), formationCaseId: FORMATION_CASE_ID };
  assert.equal((await api.deriveLearnerProjection(pkg, 'identify', ref)).held, false);
  const held = await api.deriveLearnerProjection(pkg, 'identify', { ...ref, formationCaseId: 'syn-form-404' });
  assert.equal(held.held, true);
  assert.equal(held.reason, 'unknown-formation-case');
});

// ---------------------------------------------------------------- held results
test('an unapproved package yields a held projection with no cards', async () => {
  ready();
  const frozen = await frozenPackage(api);
  for (const mode of ['identify', 'player-study']) {
    const projection = await api.deriveLearnerProjection(frozen, mode, api.schemeRefFor(frozen, CALL.sim4));
    assert.equal(projection.held, true);
    assert.equal(projection.reason, 'package-not-approved');
    assert.equal(projection.cards, undefined);
    assert.equal(projection.roles, undefined);
    assert.deepEqual(identifyLeaks(JSON.stringify(projection)), []);
  }
});

test('a reference to another revision or digest is held, never answered from current content', async () => {
  ready();
  const first = await approvedPackage(api);
  const second = await nextApproved(api, first, (draft) => { findRole(findCall(draft, CALL.sim4), 'syn-r08').decision += ' revised'; });
  const oldRef = api.schemeRefFor(first, CALL.sim4);
  const held = await api.deriveLearnerProjection(second, 'identify', oldRef);
  assert.equal(held.held, true);
  assert.equal(held.reason, 'revision-mismatch');
  const wrong = await api.deriveLearnerProjection(first, 'identify', { ...oldRef, contentDigest: 'b'.repeat(64) });
  assert.equal(wrong.reason, 'revision-mismatch');
});

test('an unknown mode or call is refused', async () => {
  ready();
  const pkg = await approvedPackage(api);
  const ref = api.schemeRefFor(pkg, CALL.sim4);
  assert.equal((await api.deriveLearnerProjection(pkg, 'identify', { ...ref, callId: 'syn-call-404' })).reason, 'unknown-call');
  await assert.rejects(() => api.deriveLearnerProjection(pkg, 'coach', ref), (error) => error.code === 'unknown-projection-mode');
});

// ---------------------------------------------------------------- player study
test('player study teaches all eleven responsibilities through a strict allowlist', async () => {
  ready();
  const pkg = await approvedPackage(api, smuggle(syntheticDraftPackage()));
  const projection = await study(pkg);
  assert.equal(projection.packageKind, 'player-study-projection');
  assert.equal(projection.roles.length, 11);
  const expected = new Set(findCall(pkg, CALL.sim4).roles.map((role) => role.responsibility));
  assert.deepEqual(new Set(projection.roles.map((role) => role.responsibility)), expected);
  for (const role of projection.roles) {
    assert.deepEqual(Object.keys(role).sort(), ['decision', 'fallback', 'finish', 'key', 'ordinal', 'positionLabel', 'responsibility', 'runFitOwnership']);
  }
  assert.deepEqual(projection.teachingCues, findCall(pkg, CALL.sim4).teachingCues);
});

test('player study keeps out coach keys, evidence, uncertainty and planted fields', async () => {
  ready();
  const pkg = await approvedPackage(api, smuggle(syntheticDraftPackage()));
  const text = JSON.stringify(await study(pkg));
  for (const pattern of [/COACH-ONLY/, /SMUGGLED/, /AREA-SENTINEL/, /syn-key-/, /syn-src-/, /syn-int-/, /coachKey/i, /rubric/i, /approval/i, /interpretation/i, /sourceRef/]) {
    assert.doesNotMatch(text, pattern);
  }
  assert.equal(text.includes(pkg.contentDigest), false);
});

test('a player-study file is a different product from an Identify file', async () => {
  ready();
  const pkg = await approvedPackage(api);
  const studyProjection = await study(pkg);
  const identifyProjection = await identify(pkg);
  assert.notEqual(studyProjection.projectionDigest, identifyProjection.projectionDigest);
  assert.match(JSON.stringify(studyProjection), /SYN-JOB/, 'study intentionally teaches');
  assert.doesNotMatch(JSON.stringify(identifyProjection), /SYN-JOB/, 'Identify never does');
});

test('neither projection can be mistaken for a coach package on import', async () => {
  ready('planSchemeImport', 'emptySchemeStore');
  const pkg = await approvedPackage(api);
  for (const projection of [await identify(pkg), await study(pkg)]) {
    const plan = await api.planSchemeImport(api.emptySchemeStore(), JSON.stringify(projection));
    assert.equal(plan.action, 'rejected');
  }
});

// ---------------------------------------------------------------- coach key sheet
test('the coach key sheet is separate, coach-labelled and covers eleven cards in card order', async () => {
  ready('deriveCoachKeySheet');
  const pkg = await approvedPackage(api);
  const sheet = api.deriveCoachKeySheet(pkg, CALL.sim4);
  assert.equal(sheet.audience, 'coach-only');
  assert.deepEqual(sheet.entries.map((e) => e.card), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.deepEqual(new Set(sheet.entries.map((e) => e.roleId)), new Set(ROLE_IDS));
  assert.equal(sheet.entries.every((e) => e.status === 'keyed' && /^COACH-ONLY/.test(e.answer)), true);
  assert.deepEqual(sheet.entries.map((e) => e.questionId), Array.from({ length: 11 }, (_, i) => `identify-card-${i + 1}`));
});

test('sheet cards line up with the card shown to the learner', async () => {
  ready('deriveCoachKeySheet');
  const pkg = await approvedPackage(api);
  const call = findCall(pkg, CALL.sim4);
  const { cards } = await identify(pkg);
  for (const entry of api.deriveCoachKeySheet(pkg, CALL.sim4).entries) {
    const star = cards[entry.card - 1].look.defense.find((d) => d.label === '★');
    const { alignment } = findRole(call, entry.roleId);
    assert.deepEqual([star.x, star.y], [alignment.x, alignment.y]);
  }
});

test('a missing authored answer is held without invention, and approval is not blocked', async () => {
  ready('deriveCoachKeySheet');
  const pkg = await approvedVariant((draft) => { draft.coachKeys.find((k) => k.callId === CALL.sim4).answers[3].answer = null; });
  const entry = api.deriveCoachKeySheet(pkg, CALL.sim4).entries.find((e) => e.roleId === ROLE_IDS[3]);
  assert.equal(entry.status, 'held');
  assert.equal(entry.answer, null);
  assert.equal(entry.heldReason, 'missing-key');
});

test('a call with no key record holds all eleven questions', async () => {
  ready('deriveCoachKeySheet');
  const pkg = await approvedVariant((draft) => {
    findCall(draft, CALL.sim4).coachKeyRef = null;
    draft.coachKeys = draft.coachKeys.filter((key) => key.callId !== CALL.sim4);
  });
  const { entries } = api.deriveCoachKeySheet(pkg, CALL.sim4);
  assert.equal(entries.length, 11);
  assert.equal(entries.every((e) => e.status === 'held' && e.answer === null), true);
  assert.equal((await identify(pkg)).cards.length, 11, 'cards still print; grading is what is held');
});

// ---------------------------------------------------------------- revision status
test('deriveRevisionStatus reports current, stale, missing and conflict', async () => {
  ready('deriveRevisionStatus');
  const first = await approvedPackage(api);
  const second = await nextApproved(api, first, (draft) => { findRole(findCall(draft, CALL.sim4), 'syn-r08').decision += ' revised'; });
  const pin = api.schemeRefFor(first, CALL.sim4);
  assert.equal(api.deriveRevisionStatus(first, pin), 'current');
  assert.equal(api.deriveRevisionStatus(second, pin), 'stale');
  assert.equal(api.deriveRevisionStatus(first, null), 'missing');
  assert.equal(api.deriveRevisionStatus(null, pin), 'missing');
  assert.equal(api.deriveRevisionStatus(first, { ...pin, callId: 'syn-call-404' }), 'missing');
  assert.equal(api.deriveRevisionStatus(first, { ...pin, packageId: 'syn-pkg-other' }), 'conflict');
  assert.equal(api.deriveRevisionStatus(first, { ...pin, contentDigest: 'b'.repeat(64) }), 'conflict');
  assert.equal(api.deriveRevisionStatus(first, { ...pin, revision: 9 }), 'conflict');
});

test('staleness is per call: an unchanged call stays current on a new revision', async () => {
  ready('deriveRevisionStatus');
  const first = await approvedPackage(api);
  const second = await nextApproved(api, first, (draft) => { findRole(findCall(draft, CALL.sim4), 'syn-r08').decision += ' revised'; });
  assert.equal(api.deriveRevisionStatus(second, api.schemeRefFor(first, CALL.sim4)), 'stale');
  for (const callId of [CALL.quarters, CALL.show, CALL.p5]) assert.equal(api.deriveRevisionStatus(second, api.schemeRefFor(first, callId)), 'current', callId);
});

test('a call removed in a later revision reports missing, not current', async () => {
  ready('deriveRevisionStatus');
  const first = await approvedPackage(api);
  const second = await nextApproved(api, first, (draft) => {
    draft.calls = draft.calls.filter((call) => call.callId !== CALL.p5);
    draft.diagrams = draft.diagrams.filter((d) => d.diagramId !== 'syn-diagram-p5');
    draft.coachKeys = draft.coachKeys.filter((k) => k.callId !== CALL.p5);
  });
  assert.equal(api.deriveRevisionStatus(second, api.schemeRefFor(first, CALL.p5)), 'missing');
});

test('regeneration is explicit, tied to the new revision, and leaves the old snapshot untouched', async () => {
  ready('deriveRevisionStatus');
  const first = await approvedPackage(api);
  const oldProjection = deepFreeze(await identify(first));
  const oldBytes = JSON.stringify(oldProjection);
  const oldPin = api.schemeRefFor(first, CALL.sim4);
  const second = await nextApproved(api, first, (draft) => { findRole(findCall(draft, CALL.sim4), 'syn-r05').alignment.x -= 2; });
  assert.equal(api.deriveRevisionStatus(second, oldPin), 'stale');
  const regenerated = await identify(second);
  assert.equal(regenerated.pin.revision, 2);
  assert.notEqual(regenerated.projectionDigest, oldProjection.projectionDigest);
  assert.equal(JSON.stringify(oldProjection), oldBytes);
  assert.equal(api.deriveRevisionStatus(second, api.schemeRefFor(second, CALL.sim4)), 'current');
});

test('regeneration on an unapproved revision does not manufacture approval', async () => {
  ready();
  const first = await approvedPackage(api);
  const draft = api.createDraftRevision(first, { now: T3 });
  findRole(findCall(draft, CALL.sim4), 'syn-r08').decision += ' revised';
  const frozen = await api.freezeSchemePackage(draft, { now: T3 });
  const held = await api.deriveLearnerProjection(frozen, 'identify', api.schemeRefFor(frozen, CALL.sim4));
  assert.equal(held.held, true);
  assert.equal(frozen.approval.status, 'draft');
});

test('schemeRefFor refuses an unfrozen package or unknown call', async () => {
  ready();
  assert.throws(() => api.schemeRefFor(syntheticDraftPackage(), CALL.sim4), (error) => error.code === 'not-frozen');
  const pkg = await approvedPackage(api);
  assert.throws(() => api.schemeRefFor(pkg, 'syn-call-404'), (error) => error.code === 'unknown-call');
  assert.deepEqual(api.schemeRefFor(pkg, CALL.sim4), { packageId: PACKAGE_ID, revision: 1, contentDigest: pkg.contentDigest, callId: CALL.sim4, callDigest: pkg.callDigests[CALL.sim4] });
});

// ---------------------------------------------------------------- corrections
test('a correction creates a new unapproved revision and leaves its source frozen', async () => {
  ready('createCorrectionDraft');
  const source = deepFreeze(await approvedPackage(api));
  const before = JSON.stringify(source);
  const pin = api.schemeRefFor(source, CALL.sim4);
  const draft = await api.createCorrectionDraft(source, syntheticCorrection(pin));
  assert.equal(JSON.stringify(source), before);
  assert.equal(draft.revision, 2);
  assert.equal(draft.parentRevision, 1);
  assert.equal(draft.parentDigest, source.contentDigest);
  assert.equal(draft.approval.status, 'draft');
  assert.equal(draft.frozen, false);
  assert.equal(findCall(draft, CALL.sim4).status, 'draft', 'the corrected call needs review again');
  assert.equal(findRole(findCall(draft, CALL.sim4), 'syn-r04').decision, 'SYN-JOB decision revised after the synthetic correction');
  assert.deepEqual(draft.correctionRefs, [{ id: 'syn-cor-01', revision: 1, digest: source.contentDigest }]);
});

test('a correction draft must be re-frozen and explicitly approved before it can teach', async () => {
  ready('createCorrectionDraft');
  const source = await approvedPackage(api);
  const draft = await api.createCorrectionDraft(source, syntheticCorrection(api.schemeRefFor(source, CALL.sim4)));
  const frozen = await api.freezeSchemePackage(draft, { now: T3 });
  assert.equal((await api.deriveLearnerProjection(frozen, 'identify', api.schemeRefFor(frozen, CALL.sim4))).reason, 'package-not-approved');
  await assert.rejects(() => api.approveSchemePackage(frozen, { actionKind: 'synthetic-local-test', actorLabel: 'x', confirmedDigest: frozen.contentDigest, now: T3 }), (error) => error.code === 'incomplete-package');
  findCall(draft, CALL.sim4).status = 'ready';
  const reviewed = await approvedPackage(api, draft);
  assert.equal(reviewed.revision, 2);
});

test('a correction with no proposed rule change still opens a draft without inventing one', async () => {
  ready('createCorrectionDraft');
  const source = await approvedPackage(api);
  const draft = await api.createCorrectionDraft(source, syntheticCorrection(api.schemeRefFor(source, CALL.sim4), { proposedRuleChange: null }));
  assert.deepEqual(findCall(draft, CALL.sim4).roles, findCall(source, CALL.sim4).roles);
});

for (const [name, overrides, code] of [
  ['another digest', { originatingDigest: 'b'.repeat(64) }, 'correction-origin-mismatch'],
  ['another revision', { originatingRevision: 9 }, 'correction-origin-mismatch'],
  ['another package', { originatingPackageId: 'syn-pkg-other' }, 'correction-origin-mismatch'],
  ['an unknown call', { callId: 'syn-call-404' }, 'unknown-call'],
  ['a quiz result as the observation', { observationType: 'quiz-result' }, 'invalid-observation-type'],
  ['a film grade as the observation', { observationType: 'film-grade' }, 'invalid-observation-type'],
  ['a change to a field outside the role contract', { proposedRuleChange: { roleId: 'syn-r04', field: 'approval', value: 'approved' } }, 'invalid-rule-change'],
  ['a change to an unknown role', { proposedRuleChange: { roleId: 'syn-r99', field: 'decision', value: 'x' } }, 'invalid-rule-change'],
]) {
  test(`a correction with ${name} is refused: ${code}`, async () => {
    ready('createCorrectionDraft');
    const source = await approvedPackage(api);
    const correction = syntheticCorrection(api.schemeRefFor(source, CALL.sim4), overrides);
    await assert.rejects(async () => api.createCorrectionDraft(source, correction), (error) => error.name === 'SchemePackageError' && error.code === code);
  });
}

// ---------------------------------------------------------------- rechecks
test('a changed-picture recheck is ungraded, linked to its revision and shows all eleven cards', async () => {
  ready('buildRecheckProjection');
  const pkg = await approvedPackage(api);
  const projection = await api.buildRecheckProjection(pkg, changedPictureScenario());
  assert.equal(projection.packageKind, 'identify-projection');
  assert.equal(projection.held, false);
  assert.equal(projection.gradingStatus, 'ungraded');
  assert.deepEqual(projection.recheck, { scenarioId: 'syn-scn-01', linkedRevision: { packageId: PACKAGE_ID, revision: 1 } });
  assert.equal(projection.cards.length, 11);
  assert.equal(projection.cards[0].prompt, changedPictureScenario().learnerContext.question);
});

test('the recheck picture actually differs from the original', async () => {
  ready('buildRecheckProjection');
  const pkg = await approvedPackage(api);
  const original = await identify(pkg);
  const recheck = await api.buildRecheckProjection(pkg, changedPictureScenario());
  assert.notDeepEqual(recheck.cards[0].look.offense, original.cards[0].look.offense);
  assert.deepEqual(recheck.cards.map((c) => c.look.defense), original.cards.map((c) => c.look.defense), 'alignment is authored, only the offense changed here');
});

test('an unchanged picture is refused rather than labelled a changed-picture recheck', async () => {
  ready('buildRecheckProjection');
  const pkg = await approvedPackage(api);
  const scenario = { ...changedPictureScenario(), offense: findCall(pkg, CALL.sim4).formationCases[0].offense };
  await assert.rejects(async () => api.buildRecheckProjection(pkg, scenario), (error) => error.code === 'picture-unchanged');
});

test('a recheck with no authored offense or an unknown call is refused', async () => {
  ready('buildRecheckProjection');
  const pkg = await approvedPackage(api);
  await assert.rejects(async () => api.buildRecheckProjection(pkg, { ...changedPictureScenario(), offense: [] }), (error) => error.code === 'invalid-scenario');
  await assert.rejects(async () => api.buildRecheckProjection(pkg, changedPictureScenario('syn-call-404')), (error) => error.code === 'unknown-call');
});

test('recheck output leaks no key, job or coach note', async () => {
  ready('buildRecheckProjection');
  const pkg = await approvedPackage(api, smuggle(syntheticDraftPackage()));
  const scenario = { ...changedPictureScenario(), future_private: 'SMUGGLED scenario' };
  const text = JSON.stringify(await api.buildRecheckProjection(pkg, scenario));
  assert.deepEqual(identifyLeaks(text), []);
  const { gradingStatus, ...learnerContent } = JSON.parse(text);
  assert.equal(gradingStatus, 'ungraded', 'the declared status must explicitly prohibit grading');
  assert.doesNotMatch(JSON.stringify(learnerContent), /score|correct|judgment|grade[^r]/i);
});

test('a recheck on an unapproved correction draft is held until a new approval', async () => {
  ready('buildRecheckProjection', 'createCorrectionDraft');
  const source = await approvedPackage(api);
  const draft = await api.createCorrectionDraft(source, syntheticCorrection(api.schemeRefFor(source, CALL.sim4)));
  const frozen = await api.freezeSchemePackage(draft, { now: T3 });
  const held = await api.buildRecheckProjection(frozen, changedPictureScenario());
  assert.equal(held.held, true);
  assert.equal(held.reason, 'package-not-approved');
  assert.equal(held.cards, undefined);
});

test('a recheck stays linked to its source revision after later revisions appear', async () => {
  ready('buildRecheckProjection');
  const first = await approvedPackage(api);
  const recheck = deepFreeze(await api.buildRecheckProjection(first, changedPictureScenario()));
  const bytes = JSON.stringify(recheck);
  await nextApproved(api, first, (draft) => { findRole(findCall(draft, CALL.sim4), 'syn-r08').decision += ' revised'; });
  assert.equal(JSON.stringify(recheck), bytes);
  assert.equal(recheck.recheck.linkedRevision.revision, 1);
});

// ---------------------------------------------------------------- whole pure chain
test('author, approve, project, correct, re-approve and recheck keep the original snapshot', async () => {
  ready('createCorrectionDraft', 'buildRecheckProjection', 'deriveRevisionStatus');
  const first = await approvedPackage(api);
  const pin = api.schemeRefFor(first, CALL.sim4);
  const assigned = deepFreeze(await identify(first));
  const assignedBytes = JSON.stringify(assigned);
  const draft = await api.createCorrectionDraft(first, syntheticCorrection(pin));
  findCall(draft, CALL.sim4).status = 'ready';
  const second = await approvedPackage(api, draft);
  const recheck = await api.buildRecheckProjection(second, changedPictureScenario());
  assert.equal(api.deriveRevisionStatus(second, pin), 'stale');
  assert.equal(recheck.recheck.linkedRevision.revision, 2);
  assert.equal(JSON.stringify(assigned), assignedBytes);
  assert.equal(first.approval.status, 'approved', 'the earlier approval is not rewritten');
});
