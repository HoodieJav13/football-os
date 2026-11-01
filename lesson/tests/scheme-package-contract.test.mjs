// Contract, validation, canonical digest, freeze and approval. Synthetic data only.
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import {
  CALL, FAMILY_ID, LOCAL_TEST_ACTION, ROLE_IDS, T1, T2, T3,
  approvedPackage, deepFreeze, findCall, findRole, frozenPackage, localApproval, nextApproved, oracleCallDigest,
  oracleContentDigest, oracleSha256, syntheticDraftPackage,
} from './fixtures/schemeFixture.mjs';

const modulePath = new URL('../src/schemePackage.js', import.meta.url);
const api = existsSync(modulePath) ? await import(modulePath) : {};
const need = (...names) => {
  for (const name of names) assert.equal(typeof api[name], 'function', `schemePackage.${name} is required (SCHEME-PACKAGE-API.md)`);
};
const codes = (issues) => issues.map((issue) => issue.code);
const rejectsCode = (promiseFactory, code) => assert.rejects(promiseFactory, (error) => {
  assert.equal(error.name, 'SchemePackageError');
  assert.equal(error.code, code);
  return true;
});

test('the scheme package module exists', () => assert.ok(existsSync(modulePath), 'lesson/src/schemePackage.js is not implemented yet'));

test('the module declares the transport name, version and three package kinds', () => {
  assert.equal(api.SCHEME_PACKAGE_KIND, 'coach-scheme-package');
  assert.equal(api.SCHEME_SCHEMA_VERSION, 1);
  assert.deepEqual([...(api.PACKAGE_KINDS ?? [])].sort(), ['coach-scheme-package', 'identify-projection', 'player-study-projection']);
  assert.equal(api.ROLE_COUNT, 11);
});

test('fixture oracle is sound against published SHA-256 vectors', () => {
  assert.equal(oracleSha256(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(oracleSha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

// ---------------------------------------------------------------- canonical bytes
test('sha256Hex is asynchronous and matches published vectors', async () => {
  need('sha256Hex');
  const pending = api.sha256Hex('abc');
  assert.ok(pending instanceof Promise, 'digest uses platform async crypto');
  assert.equal(await pending, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(await api.sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(await api.sha256Hex('é🏈'), oracleSha256('é🏈'), 'text hashes as UTF-8');
});

for (const [name, value, expected] of [
  ['sorted keys and nested arrays', { b: 1, a: [true, null, 'x'], c: { z: 1.5, y: 2 } }, '{"a":[true,null,"x"],"b":1,"c":{"y":2,"z":1.5}}'],
  ['UTF-16 code unit order, not locale order', { a: 1, B: 2, _: 3 }, '{"B":2,"_":3,"a":1}'],
  ['UTF-16 code unit order, not code point order', { '～': 2, '\u{1F600}': 1 }, '{"\u{1F600}":1,"～":2}'],
  ['numbers use the JSON form', { a: 1.0, b: 0.1, c: 1e21, d: -0 }, '{"a":1,"b":0.1,"c":1e+21,"d":0}'],
  ['string escapes use the JSON form', { a: 'q"b\\c\nd' }, '{"a":"q\\"b\\\\c\\nd"}'],
  ['undefined object members are absent', { a: undefined, b: 1 }, '{"b":1}'],
  ['empty containers', { a: {}, b: [] }, '{"a":{},"b":[]}'],
  ['bare scalar', 'text', '"text"'],
  ['bare null', null, 'null'],
]) {
  test(`canonical vector: ${name}`, async () => {
    need('canonicalSchemeJson', 'canonicalSchemeBytes', 'sha256Hex');
    assert.equal(api.canonicalSchemeJson(value), expected);
    assert.deepEqual([...api.canonicalSchemeBytes(value)], [...Buffer.from(expected, 'utf8')]);
    assert.equal(await api.sha256Hex(api.canonicalSchemeBytes(value)), oracleSha256(expected));
  });
}

test('canonical form does not normalize Unicode: NFC and NFD differ', () => {
  need('canonicalSchemeJson');
  assert.notEqual(api.canonicalSchemeJson('é'), api.canonicalSchemeJson('é'));
});

test('canonical form refuses values JSON bytes cannot represent', () => {
  need('canonicalSchemeJson');
  for (const value of [NaN, Infinity, -Infinity, [undefined], { a: [undefined] }, 1n, new Date(0), new Map(), () => 1, Symbol('x')]) {
    assert.throws(() => api.canonicalSchemeJson(value), (error) => error.name === 'SchemePackageError' && error.code === 'non-canonical-value');
  }
});

// ---------------------------------------------------------------- digest identity
test('the digest preimage is a literal, documented byte sequence', async () => {
  need('schemeDigestPreimage', 'canonicalSchemeJson', 'computeContentDigest');
  const parent = 'a'.repeat(64);
  const pkg = {
    packageKind: 'coach-scheme-package', schemaVersion: 1, packageId: 'p', familyId: 'f', revision: 2, parentRevision: 1, parentDigest: parent,
    contentDigest: 'ignored', callDigests: { c: 'ignored' }, frozen: true, createdAt: T1, updatedAt: T2,
    approval: { status: 'draft' }, calls: [],
  };
  const expected = `{"calls":[],"familyId":"f","packageId":"p","packageKind":"coach-scheme-package","parentDigest":"${parent}","parentRevision":1,"revision":2,"schemaVersion":1}`;
  assert.equal(api.canonicalSchemeJson(api.schemeDigestPreimage(pkg)), expected);
  assert.equal(await api.computeContentDigest(pkg), oracleSha256(expected));
});

test('freeze writes digests equal to an independent oracle and marks only the frozen copy', async () => {
  need('freezeSchemePackage');
  const draft = deepFreeze(syntheticDraftPackage());
  const before = JSON.stringify(draft);
  const frozen = await frozenPackage(api, draft);
  assert.equal(JSON.stringify(draft), before, 'freeze never mutates its input');
  assert.equal(frozen.frozen, true);
  assert.equal(frozen.contentDigest, oracleContentDigest(frozen));
  assert.match(frozen.contentDigest, /^[0-9a-f]{64}$/);
  assert.deepEqual(Object.keys(frozen.callDigests).sort(), Object.values(CALL).sort());
  for (const callId of Object.values(CALL)) assert.equal(frozen.callDigests[callId], oracleCallDigest(frozen, callId));
  for (const call of frozen.calls) assert.match(call.coachKeyRef.digest, /^[0-9a-f]{64}$/);
  assert.equal(frozen.approval.status, 'draft', 'freezing is not approval');
});

test('digest covers schema, version, parent digest, revision and content', async () => {
  need('computeContentDigest', 'freezeSchemePackage');
  const frozen = await frozenPackage(api);
  const base = frozen.contentDigest;
  const edits = {
    schemaVersion: (p) => { p.schemaVersion = 2; },
    packageKind: (p) => { p.packageKind = 'other'; },
    packageId: (p) => { p.packageId = 'syn-pkg-other'; },
    familyId: (p) => { p.familyId = 'syn-fam-other'; },
    revision: (p) => { p.revision = 7; },
    parentRevision: (p) => { p.parentRevision = 6; },
    parentDigest: (p) => { p.parentDigest = 'b'.repeat(64); },
    'role text': (p) => { p.calls[0].roles[0].decision += ' edit'; },
    'source ref': (p) => { p.sourceRefs[0].locator = 'other'; },
    interpretation: (p) => { p.interpretations[0].uncertainty += ' edit'; },
    'coach key': (p) => { p.coachKeys[0].answers[0].answer += ' edit'; },
    'teachable diagram': (p) => { p.diagrams[0].play.defenders[0].x += 1; },
    'authority record': (p) => { p.authority.kbIds = ['rule.synthetic']; },
  };
  for (const [name, edit] of Object.entries(edits)) {
    const changed = structuredClone(frozen);
    edit(changed);
    assert.notEqual(await api.computeContentDigest(changed), base, name);
  }
});

test('digest ignores key order, JSON round trips and observation metadata', async () => {
  need('computeContentDigest', 'freezeSchemePackage');
  const frozen = await frozenPackage(api);
  const reverse = (v) => (Array.isArray(v) ? v.map(reverse) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reverse(x)])) : v);
  assert.equal(await api.computeContentDigest(reverse(frozen)), frozen.contentDigest);
  assert.equal(await api.computeContentDigest(JSON.parse(JSON.stringify(frozen))), frozen.contentDigest);
  const metadata = structuredClone(frozen);
  metadata.createdAt = T3;
  metadata.updatedAt = T3;
  metadata.approval = { status: 'approved', actorLabel: 'x', timestamp: T3, approvedDigest: 'c'.repeat(64), actionKind: LOCAL_TEST_ACTION, authenticated: false };
  metadata.frozen = false;
  assert.equal(await api.computeContentDigest(metadata), frozen.contentDigest);
});

test('camera, focus and selection on a diagram never change the digest', async () => {
  need('computeContentDigest', 'freezeSchemePackage');
  const frozen = await frozenPackage(api);
  const viewed = structuredClone(frozen);
  Object.assign(viewed.diagrams[0].play, { camera: { factor: 2 }, selectedPlayerId: 'syn-r01', layers: {}, view: 'side' });
  assert.equal(await api.computeContentDigest(viewed), frozen.contentDigest);
});

test('per-call digest ignores revision and parent, and changes only for that call', async () => {
  need('freezeSchemePackage', 'createDraftRevision', 'approveSchemePackage');
  const first = await approvedPackage(api);
  const second = await nextApproved(api, first, (draft) => { findRole(findCall(draft, CALL.sim4), 'syn-r08').decision += ' revised'; });
  assert.notEqual(second.contentDigest, first.contentDigest);
  assert.notEqual(second.callDigests[CALL.sim4], first.callDigests[CALL.sim4]);
  for (const callId of [CALL.quarters, CALL.show, CALL.p5]) assert.equal(second.callDigests[callId], first.callDigests[callId], callId);
});

test('a changed coach key changes that call digest through its key reference', async () => {
  need('freezeSchemePackage', 'createDraftRevision', 'approveSchemePackage');
  const first = await approvedPackage(api);
  const second = await nextApproved(api, first, (draft) => { draft.coachKeys[3].answers[0].answer += ' revised'; });
  assert.notEqual(second.callDigests[CALL.p5], first.callDigests[CALL.p5]);
  assert.equal(second.callDigests[CALL.quarters], first.callDigests[CALL.quarters]);
});

// ---------------------------------------------------------------- positive validation
test('the four-variant fixture validates with eleven unique roles on every call', () => {
  need('validateSchemePackage');
  const result = api.validateSchemePackage(syntheticDraftPackage());
  assert.ok(!(result instanceof Promise), 'structural validation stays synchronous');
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
  assert.deepEqual(result.callStatus.map((c) => [c.callId, c.readiness]), Object.values(CALL).map((id) => [id, 'ready']));
  for (const call of syntheticDraftPackage().calls) {
    assert.deepEqual(call.roles.map((r) => r.roleId), [...ROLE_IDS]);
    assert.equal(call.roles.every((r) => r.ruleBasis === 'synthetic_example'), true);
  }
});

test('partial source review is shown as a warning and does not block coach authoring', async () => {
  need('validateSchemePackage', 'approveSchemePackage', 'freezeSchemePackage');
  const draft = syntheticDraftPackage();
  draft.sourceRefs[0].reviewExtent = 'metadata';
  const result = api.validateSchemePackage(draft);
  assert.equal(result.valid, true);
  assert.ok(codes(result.warnings).includes('partial-source-review'));
  assert.equal((await approvedPackage(api, draft)).approval.status, 'approved');
});

for (const extent of ['metadata', 'transcript-only', 'selected-visual-samples', 'continuous-viewing']) {
  test(`review extent ${extent} is accepted`, () => {
    need('validateSchemePackage');
    const draft = syntheticDraftPackage();
    draft.sourceRefs[0].reviewExtent = extent;
    assert.equal(api.validateSchemePackage(draft).valid, true);
  });
}

test('the contract is not limited to the four proof variants or one pressure', () => {
  need('validateSchemePackage');
  const draft = syntheticDraftPackage();
  const sim = findCall(draft, CALL.sim4);
  const five = findCall(draft, CALL.p5);
  const extra = (source, callId, rushFamily) => ({ ...structuredClone(source), callId, rushFamily, coachKeyRef: null });
  draft.calls.push(extra(sim, 'syn-call-e5', 'sim4'), extra(sim, 'syn-call-e6', 'sim4'), extra(five, 'syn-call-f7', 'p5'), extra(five, 'syn-call-f8', 'p5'), extra(five, 'syn-call-f9', 'p5'));
  const six = extra(five, 'syn-call-g1', 'synthetic-six-man');
  six.intendedRushCount = 6;
  six.anticipatedCoverageCount = 5;
  findRole(six, 'syn-r05').unit = 'rush';
  draft.calls.push(six);
  const result = api.validateSchemePackage(draft);
  assert.deepEqual(result.errors, []);
  assert.equal(result.callStatus.length, 10);
});

test('shared position labels are not shared assignments: changed jobs are explicit', () => {
  need('diffCallRoles');
  const draft = syntheticDraftPackage();
  const base = findCall(draft, CALL.quarters);
  const sim = api.diffCallRoles(base, findCall(draft, CALL.sim4));
  assert.deepEqual(sim.changedRoles.map((r) => r.roleId).sort(), ['syn-r04', 'syn-r06']);
  const edge = sim.changedRoles.find((r) => r.roleId === 'syn-r04');
  assert.equal(edge.positionLabel, 'E');
  assert.ok(edge.fields.includes('responsibility') && edge.fields.includes('unit'));
  assert.ok(sim.unchangedRoleIds.includes('syn-r01'), 'the other E keeps its job');
  assert.deepEqual(api.diffCallRoles(base, findCall(draft, CALL.show)).changedRoles, [], 'presentation only preserves base jobs');
  assert.deepEqual(api.diffCallRoles(base, findCall(draft, CALL.p5)).changedRoles.map((r) => r.roleId).sort(), ['syn-r07', 'syn-r10']);
});

// ---------------------------------------------------------------- football contract issues
const sim = (draft) => findCall(draft, CALL.sim4);
const p5 = (draft) => findCall(draft, CALL.p5);
const show = (draft) => findCall(draft, CALL.show);
const CONTRACT_CASES = [
  ['missing role', CALL.sim4, (d) => { sim(d).roles.pop(); }, 'missing-role'],
  ['twelve roles', CALL.sim4, (d) => { sim(d).roles.push({ ...sim(d).roles[0], roleId: 'syn-r12' }); }, 'extra-role'],
  ['duplicate role id', CALL.sim4, (d) => { sim(d).roles[10].roleId = sim(d).roles[0].roleId; }, 'duplicate-role'],
  ['blank responsibility', CALL.sim4, (d) => { sim(d).roles[3].responsibility = '  '; }, 'invalid-role-field'],
  ['missing fallback', CALL.sim4, (d) => { delete sim(d).roles[3].fallback; }, 'invalid-role-field'],
  ['missing run-fit ownership', CALL.sim4, (d) => { delete sim(d).roles[3].runFitOwnership; }, 'invalid-role-field'],
  ['unknown role unit', CALL.sim4, (d) => { sim(d).roles[3].unit = 'spy'; }, 'invalid-role-field'],
  ['non-finite alignment', CALL.sim4, (d) => { sim(d).roles[3].alignment.x = null; }, 'invalid-role-field'],
  ['rule not marked synthetic', CALL.sim4, (d) => { delete sim(d).roles[3].ruleBasis; }, 'missing-rule-basis'],
  ['counts do not total eleven', CALL.sim4, (d) => { sim(d).anticipatedCoverageCount = 8; }, 'invalid-count'],
  ['fractional count', CALL.sim4, (d) => { sim(d).intendedRushCount = 4.5; sim(d).anticipatedCoverageCount = 6.5; }, 'invalid-count'],
  ['SIM4 with five rushers', CALL.sim4, (d) => { sim(d).intendedRushCount = 5; sim(d).anticipatedCoverageCount = 6; }, 'family-count-mismatch'],
  ['P5 with four rushers', CALL.p5, (d) => { p5(d).intendedRushCount = 4; p5(d).anticipatedCoverageCount = 7; }, 'family-count-mismatch'],
  ['role units disagree with intended count', CALL.sim4, (d) => { sim(d).roles[7].unit = 'rush'; }, 'rush-count-mismatch'],
  ['outcome without replacement coverage', CALL.sim4, (d) => { delete sim(d).exchangeOutcomes[0].replacementCoverage; }, 'missing-outcome-record'],
  ['outcome without rush lanes', CALL.sim4, (d) => { delete sim(d).exchangeOutcomes[0].rushLanes; }, 'missing-outcome-record'],
  ['outcome without paired jobs', CALL.sim4, (d) => { sim(d).exchangeOutcomes[0].pairedJobs = []; }, 'missing-outcome-record'],
  ['partners with no outcomes', CALL.sim4, (d) => { sim(d).exchangeOutcomes = []; sim(d).ambiguousReadDefault = 'not-applicable'; }, 'missing-outcome-record'],
  ['outcome missing its count', CALL.p5, (d) => { delete p5(d).exchangeOutcomes[0].expectedRushCount; }, 'outcome-count-invalid'],
  ['outcome count not eleven', CALL.p5, (d) => { p5(d).exchangeOutcomes[0].expectedCoverageCount = 6; }, 'outcome-count-invalid'],
  ['duplicate outcome id', CALL.sim4, (d) => { sim(d).exchangeOutcomes[1].outcomeId = 'syn-out-c1'; }, 'duplicate-outcome'],
  ['outcome names an unknown role', CALL.sim4, (d) => { sim(d).exchangeOutcomes[0].pairedJobs[0].roleId = 'syn-r99'; }, 'unknown-outcome-role'],
  ['ambiguous default absent', CALL.sim4, (d) => { delete sim(d).ambiguousReadDefault; }, 'missing-ambiguous-default'],
  ['ambiguous default unknown', CALL.sim4, (d) => { sim(d).ambiguousReadDefault = 'syn-out-zz'; }, 'unknown-outcome-default'],
  ['exchange partner is not a role', CALL.sim4, (d) => { findRole(sim(d), 'syn-r04').exchangePartnerRoleId = 'syn-r99'; }, 'exchange-partner-unknown'],
  ['exchange partner is not reciprocal', CALL.sim4, (d) => { findRole(sim(d), 'syn-r06').exchangePartnerRoleId = 'syn-r05'; }, 'exchange-partner-conflict'],
  ['presentation-only changes a job', CALL.show, (d) => { show(d).roles[0].responsibility = 'SYN-JOB different job'; }, 'presentation-changed-jobs'],
  ['presentation-only changes a rusher', CALL.show, (d) => { show(d).roles[0].unit = 'coverage'; show(d).roles[5].unit = 'rush'; }, 'presentation-changed-jobs'],
  ['variant base missing', CALL.sim4, (d) => { sim(d).variantOf = 'syn-call-zz'; }, 'variant-base-missing'],
  ['variant of itself', CALL.sim4, (d) => { sim(d).variantOf = CALL.sim4; }, 'variant-base-missing'],
  ['call from another family', CALL.sim4, (d) => { sim(d).familyId = 'syn-fam-other'; }, 'foreign-family-call'],
  ['no formation case', CALL.sim4, (d) => { sim(d).formationCases = []; }, 'missing-formation-case'],
  ['no learner context', CALL.sim4, (d) => { delete sim(d).learnerContext; }, 'missing-question-context'],
  ['blank question', CALL.sim4, (d) => { sim(d).learnerContext.question = ' '; }, 'missing-question-context'],
  ['no situation', CALL.sim4, (d) => { sim(d).learnerContext.situation = ''; }, 'missing-question-context'],
  ['question repeats a job', CALL.sim4, (d) => { sim(d).learnerContext.question = `Do you ${sim(d).roles[3].responsibility}?`; }, 'learner-context-leak'],
  ['call name repeats a job', CALL.sim4, (d) => { sim(d).learnerContext.callName = sim(d).roles[3].responsibility; }, 'learner-context-leak'],
];

for (const [name, callId, mutate, code] of CONTRACT_CASES) {
  test(`a ready call with ${name} is an error: ${code}`, () => {
    need('validateSchemePackage');
    const draft = syntheticDraftPackage();
    mutate(draft);
    const result = api.validateSchemePackage(draft);
    assert.equal(result.valid, false, `${name} must not validate`);
    assert.ok(codes(result.errors).includes(code), `expected ${code}, saw ${codes(result.errors)}`);
    assert.ok(result.errors.every((issue) => typeof issue.path === 'string' && typeof issue.message === 'string'));
    assert.equal(result.callStatus.find((c) => c.callId === callId).readiness, 'incomplete');
  });

  test(`a draft call with ${name} stays editable, visibly incomplete and unapprovable`, async () => {
    need('validateSchemePackage', 'freezeSchemePackage', 'approveSchemePackage');
    const draft = syntheticDraftPackage();
    mutate(draft);
    findCall(draft, callId).status = 'draft';
    const result = api.validateSchemePackage(draft);
    assert.equal(result.valid, true, `${name} remains an editable draft: ${codes(result.errors)}`);
    assert.ok(codes(result.warnings).includes(code), `expected warning ${code}, saw ${codes(result.warnings)}`);
    assert.equal(result.callStatus.find((c) => c.callId === callId).readiness, 'incomplete');
    const frozen = await frozenPackage(api, draft);
    await rejectsCode(() => api.approveSchemePackage(frozen, localApproval(frozen)), 'incomplete-package');
  });
}

test('software reports declared conflicts without claiming football soundness', () => {
  need('validateSchemePackage');
  const result = api.validateSchemePackage(syntheticDraftPackage());
  assert.deepEqual(Object.keys(result).sort(), ['callStatus', 'errors', 'heldAssets', 'valid', 'warnings']);
  assert.deepEqual([...new Set(result.callStatus.map((c) => c.readiness))], ['ready'], 'readiness means declared data is complete, nothing more');
});

// ---------------------------------------------------------------- envelope errors
const ENVELOPE_CASES = [
  ['unknown package kind', (d) => { d.packageKind = 'scheme'; }, 'unknown-package-kind'],
  ['learner projection in a coach slot', (d) => { d.packageKind = 'identify-projection'; }, 'not-a-coach-package'],
  ['future schema version', (d) => { d.schemaVersion = 2; }, 'unsupported-schema-version'],
  ['string schema version', (d) => { d.schemaVersion = '1'; }, 'unsupported-schema-version'],
  ['missing schema version', (d) => { delete d.schemaVersion; }, 'unsupported-schema-version'],
  ['missing package id', (d) => { delete d.packageId; }, 'invalid-id'],
  ['path-like package id', (d) => { d.packageId = 'a/b'; }, 'invalid-id'],
  ['missing family id', (d) => { d.familyId = ''; }, 'invalid-id'],
  ['revision zero', (d) => { d.revision = 0; }, 'invalid-revision'],
  ['fractional revision', (d) => { d.revision = 1.5; }, 'invalid-revision'],
  ['parent revision not lower', (d) => { d.parentRevision = 1; d.parentDigest = 'a'.repeat(64); }, 'invalid-ancestry'],
  ['parent revision without parent digest', (d) => { d.revision = 2; d.parentRevision = 1; }, 'invalid-ancestry'],
  ['parent digest without parent revision', (d) => { d.parentDigest = 'a'.repeat(64); }, 'invalid-ancestry'],
  ['malformed parent digest', (d) => { d.revision = 2; d.parentRevision = 1; d.parentDigest = 'xyz'; }, 'invalid-ancestry'],
  ['package not marked synthetic', (d) => { d.provenance.synthetic = false; }, 'non-synthetic-package'],
  ['missing provenance', (d) => { delete d.provenance; }, 'non-synthetic-package'],
  ['claim of adopted doctrine', (d) => { d.authority.doctrineStatus = 'adopted'; }, 'doctrine-claim'],
  ['claim of a KB release', (d) => { d.authority.kbRelease = 'kb-2026-10'; }, 'doctrine-claim'],
  ['missing source id', (d) => { delete d.sourceRefs[0].sourceId; }, 'missing-source-id'],
  ['duplicate source id', (d) => { d.sourceRefs[1].sourceId = d.sourceRefs[0].sourceId; }, 'duplicate-source-id'],
  ['unsupported review extent', (d) => { d.sourceRefs[0].reviewExtent = 'watched'; }, 'invalid-review-extent'],
  ['interpretation with an unknown source', (d) => { d.interpretations[0].sourceRefIds = ['syn-src-404']; }, 'unknown-source-ref'],
  ['duplicate call id', (d) => { d.calls[1].callId = d.calls[0].callId; }, 'duplicate-call-id'],
  ['calls not a list', (d) => { d.calls = {}; }, 'invalid-call-list'],
  ['lesson ref without pinned digest', (d) => { d.lessonRefs = [{ id: 'syn-lesson', revision: 1 }]; }, 'invalid-ref'],
  ['practice ref without pinned revision', (d) => { d.practiceRefs = [{ id: 'syn-practice', digest: 'a'.repeat(64) }]; }, 'invalid-ref'],
  ['unknown approval status', (d) => { d.approval.status = 'published'; }, 'invalid-approval'],
  ['approved with no actor', (d) => { d.approval = { status: 'approved', actorLabel: null, timestamp: T2, approvedDigest: 'a'.repeat(64), actionKind: LOCAL_TEST_ACTION, authenticated: false }; }, 'invalid-approval'],
  ['approved with no exact digest', (d) => { d.approval = { status: 'approved', actorLabel: 'x', timestamp: T2, approvedDigest: null, actionKind: LOCAL_TEST_ACTION, authenticated: false }; }, 'invalid-approval'],
  ['approved with a claim of authentication', (d) => { d.approval = { status: 'approved', actorLabel: 'x', timestamp: T2, approvedDigest: 'a'.repeat(64), actionKind: LOCAL_TEST_ACTION, authenticated: true }; }, 'invalid-approval'],
];

for (const [name, mutate, code] of ENVELOPE_CASES) {
  test(`envelope with ${name} fails: ${code}`, () => {
    need('validateSchemePackage');
    const draft = syntheticDraftPackage();
    mutate(draft);
    const result = api.validateSchemePackage(draft);
    assert.equal(result.valid, false);
    assert.ok(codes(result.errors).includes(code), `expected ${code}, saw ${codes(result.errors)}`);
  });
}

test('garbage values fail without throwing', () => {
  need('validateSchemePackage');
  for (const value of [null, undefined, 1, 'x', [], {}]) {
    const result = api.validateSchemePackage(value);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  }
});

test('unknown fields are reported as ignored, following the Practice convention', () => {
  need('validateSchemePackage');
  const draft = syntheticDraftPackage();
  draft.futureThing = 1;
  const result = api.validateSchemePackage(draft);
  assert.equal(result.valid, true);
  assert.ok(codes(result.warnings).includes('unknown-field'));
});

// ---------------------------------------------------------------- freeze and approve
test('verifySchemePackage rejects bytes that no longer match their digests', async () => {
  need('verifySchemePackage', 'freezeSchemePackage');
  const approved = await approvedPackage(api);
  assert.deepEqual((await api.verifySchemePackage(approved)).errors, []);
  const cases = [
    ['digest-mismatch', (p) => { p.calls[0].roles[0].decision += ' tampered'; }],
    ['digest-mismatch', (p) => { p.contentDigest = 'b'.repeat(64); }],
    ['call-digest-mismatch', (p) => { p.callDigests[CALL.quarters] = 'b'.repeat(64); }],
    ['key-digest-mismatch', (p) => { p.coachKeys[0].answers[0].answer += ' tampered'; }],
    ['approval-digest-mismatch', (p) => { p.approval.approvedDigest = 'b'.repeat(64); }],
  ];
  for (const [code, tamper] of cases) {
    const changed = structuredClone(approved);
    tamper(changed);
    const result = await api.verifySchemePackage(changed);
    assert.equal(result.valid, false);
    assert.ok(codes(result.errors).includes(code), `expected ${code}, saw ${codes(result.errors)}`);
  }
});

test('an unfrozen package has no digest to verify', async () => {
  need('verifySchemePackage');
  const result = await api.verifySchemePackage(syntheticDraftPackage());
  assert.equal(result.valid, false);
  assert.ok(codes(result.errors).includes('not-frozen'));
});

test('unsigned JSON never authenticates approval: the claim is always reported as unauthenticated', async () => {
  need('verifySchemePackage', 'freezeSchemePackage');
  const approved = await approvedPackage(api);
  const { approvalClaim } = await api.verifySchemePackage(JSON.parse(JSON.stringify(approved)));
  assert.equal(approvalClaim.status, 'approved');
  assert.equal(approvalClaim.authenticated, false);
  assert.equal(approvalClaim.actionKind, LOCAL_TEST_ACTION);
});

test('approval binds to the exact frozen digest and identifies itself as a local test action', async () => {
  need('freezeSchemePackage', 'approveSchemePackage');
  const frozen = deepFreeze(await frozenPackage(api));
  const before = JSON.stringify(frozen);
  const approved = await api.approveSchemePackage(frozen, localApproval(frozen));
  assert.equal(JSON.stringify(frozen), before);
  assert.equal(approved.approval.status, 'approved');
  assert.equal(approved.approval.approvedDigest, frozen.contentDigest);
  assert.equal(approved.approval.timestamp, T2);
  assert.equal(approved.approval.actorLabel, 'Local test action');
  assert.equal(approved.approval.authenticated, false);
  assert.match(approved.approval.displayLabel, /local test/i);
  assert.doesNotMatch(approved.approval.displayLabel, /owner|doctrine|official/i);
  assert.equal(approved.contentDigest, frozen.contentDigest, 'approval does not change content identity');
});

test('package approval never promotes evidence or doctrine', async () => {
  need('freezeSchemePackage', 'approveSchemePackage');
  const draft = syntheticDraftPackage();
  const approved = await approvedPackage(api, draft);
  assert.deepEqual(approved.authority, draft.authority);
  assert.deepEqual(approved.sourceRefs, draft.sourceRefs);
  assert.deepEqual(approved.interpretations, draft.interpretations);
});

for (const [name, edit, code] of [
  ['import', (o) => { o.actionKind = 'import'; }, 'approval-action-refused'],
  ['an assistant recommendation', (o) => { o.actionKind = 'assistant-recommendation'; }, 'approval-action-refused'],
  ['a passing test', (o) => { o.actionKind = 'passing-test'; }, 'approval-action-refused'],
  ['a source author reputation', (o) => { o.actionKind = 'source-author-reputation'; }, 'approval-action-refused'],
  ['an omitted action', (o) => { delete o.actionKind; }, 'approval-action-refused'],
  ['a blank actor', (o) => { o.actorLabel = ' '; }, 'approval-action-refused'],
  ['an unconfirmed digest', (o) => { delete o.confirmedDigest; }, 'digest-not-confirmed'],
  ['a different digest', (o) => { o.confirmedDigest = 'b'.repeat(64); }, 'digest-not-confirmed'],
]) {
  test(`approval cannot come from ${name}`, async () => {
    need('freezeSchemePackage', 'approveSchemePackage');
    const frozen = await frozenPackage(api);
    const options = localApproval(frozen);
    edit(options);
    await rejectsCode(() => api.approveSchemePackage(frozen, options), code);
  });
}

test('an unfrozen revision cannot be approved', async () => {
  need('approveSchemePackage');
  await rejectsCode(() => api.approveSchemePackage(syntheticDraftPackage(), { actionKind: LOCAL_TEST_ACTION, actorLabel: 'x', confirmedDigest: 'a'.repeat(64), now: T2 }), 'not-frozen');
});

test('a package changed after freeze cannot be approved', async () => {
  need('freezeSchemePackage', 'approveSchemePackage');
  const frozen = await frozenPackage(api);
  const changed = structuredClone(frozen);
  changed.calls[0].roles[0].decision += ' after freeze';
  await rejectsCode(() => api.approveSchemePackage(changed, localApproval(frozen)), 'digest-mismatch');
});

test('a package with any draft call is not a complete approvable revision', async () => {
  need('freezeSchemePackage', 'approveSchemePackage');
  const draft = syntheticDraftPackage();
  findCall(draft, CALL.p5).status = 'draft';
  const frozen = await frozenPackage(api, draft);
  await rejectsCode(() => api.approveSchemePackage(frozen, localApproval(frozen)), 'incomplete-package');
});

test('a dangling key or diagram reference is not approvable', async () => {
  need('freezeSchemePackage', 'approveSchemePackage');
  for (const remove of [(d) => { d.coachKeys.shift(); }, (d) => { d.diagrams.shift(); }]) {
    const draft = syntheticDraftPackage();
    remove(draft);
    const frozen = await frozenPackage(api, draft);
    await rejectsCode(() => api.approveSchemePackage(frozen, localApproval(frozen)), 'incomplete-package');
  }
});

test('createDraftRevision opens a new unapproved revision linked to its exact parent', async () => {
  need('createDraftRevision', 'freezeSchemePackage', 'approveSchemePackage');
  const approved = deepFreeze(await approvedPackage(api));
  const before = JSON.stringify(approved);
  const next = api.createDraftRevision(approved, { now: T3 });
  assert.equal(JSON.stringify(approved), before);
  assert.equal(next.revision, approved.revision + 1);
  assert.equal(next.parentRevision, approved.revision);
  assert.equal(next.parentDigest, approved.contentDigest);
  assert.equal(next.frozen, false);
  assert.equal(next.contentDigest, null);
  assert.deepEqual(next.callDigests, {});
  assert.equal(next.approval.status, 'draft');
  assert.equal(next.approval.approvedDigest, null);
  assert.equal(next.updatedAt, T3);
  assert.equal(next.familyId, FAMILY_ID);
  next.calls[0].roles[0].decision = 'edited';
  assert.notEqual(approved.calls[0].roles[0].decision, 'edited', 'nothing is shared with the parent');
});

test('a revision cannot descend from an unfrozen parent', () => {
  need('createDraftRevision');
  assert.throws(() => api.createDraftRevision(syntheticDraftPackage(), { now: T3 }), (error) => error.code === 'not-frozen');
});
