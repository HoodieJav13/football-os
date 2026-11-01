// Validate, preview, confirm, commit. No-op, conflict, history, ancestry and held cases.
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import {
  CALL, FAMILY_ID, PACKAGE_ID, T3, approvedPackage, deepFreeze, findCall, findRole, frozenPackage, nextApproved,
  syntheticDraftPackage,
} from './fixtures/schemeFixture.mjs';

const modulePath = new URL('../src/schemePackage.js', import.meta.url);
const api = existsSync(modulePath) ? await import(modulePath) : {};
const REQUIRED = ['emptySchemeStore', 'planSchemeImport', 'applySchemeImport', 'serializeSchemePackage', 'freezeSchemePackage', 'approveSchemePackage', 'createDraftRevision'];
const ready = (...names) => {
  for (const name of [...REQUIRED, ...names]) assert.equal(typeof api[name], 'function', `schemePackage.${name} is required (SCHEME-PACKAGE-API.md)`);
};
const conflictCodes = (plan) => plan.conflicts.map((conflict) => conflict.code);
const editRole = (draft) => { findRole(findCall(draft, CALL.sim4), 'syn-r08').decision += ' revised'; };

async function plannedApply(store, text, extra = {}) {
  const plan = await api.planSchemeImport(store, text);
  const result = await api.applySchemeImport(store, { plan, confirmedDigest: plan.incoming?.contentDigest, ...extra });
  return { plan, ...result };
}

async function seeded() {
  const pkg = await approvedPackage(api);
  const text = api.serializeSchemePackage(pkg);
  const { store } = await plannedApply(api.emptySchemeStore(), text);
  return { pkg, text, store };
}

test('preview changes nothing and describes the incoming revision', async () => {
  ready();
  const pkg = await approvedPackage(api);
  const store = deepFreeze(api.emptySchemeStore());
  const before = JSON.stringify(store);
  const plan = await api.planSchemeImport(store, api.serializeSchemePackage(pkg));
  assert.equal(JSON.stringify(store), before);
  assert.equal(plan.action, 'create');
  assert.deepEqual(plan.conflicts, []);
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.incoming.packageId, PACKAGE_ID);
  assert.equal(plan.incoming.familyId, FAMILY_ID);
  assert.equal(plan.incoming.revision, 1);
  assert.equal(plan.incoming.contentDigest, pkg.contentDigest);
  assert.deepEqual(plan.incoming.calls.map((c) => c.callId), Object.values(CALL));
  assert.equal(plan.incoming.calls.every((c) => c.roleCount === 11), true);
});

test('import never upgrades a claim: approval remains unauthenticated and draft stays draft', async () => {
  ready();
  const approved = await approvedPackage(api);
  const claim = (await api.planSchemeImport(api.emptySchemeStore(), api.serializeSchemePackage(approved))).approvalClaim;
  assert.equal(claim.status, 'approved');
  assert.equal(claim.authenticated, false);
  const draft = await frozenPackage(api);
  const { plan, store, receipt } = await plannedApply(api.emptySchemeStore(), api.serializeSchemePackage(draft));
  assert.equal(plan.approvalClaim.status, 'draft');
  assert.equal(receipt.approvalClaim.status, 'draft');
  assert.equal(api.getSchemePackage(store, PACKAGE_ID).approval.status, 'draft', 'import is not approval');
});

test('confirmed import stores exact bytes, reports the ref and leaves the input store alone', async () => {
  ready('getSchemePackage', 'currentSchemeRef');
  const pkg = await approvedPackage(api);
  const text = api.serializeSchemePackage(pkg);
  const original = deepFreeze(api.emptySchemeStore());
  const { receipt, resultingRefs, store } = await plannedApply(original, text);
  assert.equal(receipt.status, 'imported');
  assert.equal(receipt.action, 'create');
  assert.equal(receipt.contentDigest, pkg.contentDigest);
  assert.deepEqual(resultingRefs, [{ packageId: PACKAGE_ID, revision: 1, contentDigest: pkg.contentDigest }]);
  assert.deepEqual(api.currentSchemeRef(store, PACKAGE_ID), resultingRefs[0]);
  assert.equal(api.serializeSchemePackage(api.getSchemePackage(store, PACKAGE_ID)), text);
  assert.deepEqual(store.packages[PACKAGE_ID].revisions[0].text, text);
  assert.deepEqual(original, api.emptySchemeStore());
});

for (const [name, confirmation] of [
  ['missing', {}],
  ['for another digest', { confirmedDigest: 'b'.repeat(64) }],
]) {
  test(`a commit with a confirmation ${name} is refused and changes nothing`, async () => {
    ready();
    const pkg = await approvedPackage(api);
    const store = deepFreeze(api.emptySchemeStore());
    const plan = await api.planSchemeImport(store, api.serializeSchemePackage(pkg));
    const result = await api.applySchemeImport(store, { plan, ...confirmation });
    assert.equal(result.receipt.status, 'refused');
    assert.equal(result.receipt.reason, 'not-confirmed');
    assert.deepEqual(result.resultingRefs, []);
    assert.equal(result.store, store);
  });
}

test('same package, revision and digest is an idempotent no-op with an honest receipt', async () => {
  ready();
  const { pkg, text, store } = await seeded();
  const frozenStore = deepFreeze(store);
  const plan = await api.planSchemeImport(frozenStore, text);
  assert.equal(plan.action, 'noop');
  const { receipt, store: after } = await api.applySchemeImport(frozenStore, { plan, confirmedDigest: pkg.contentDigest });
  assert.equal(receipt.status, 'noop');
  assert.match(receipt.message, /already/i);
  assert.equal(after, frozenStore, 'a no-op returns the same store');
});

test('a no-op still applies when the bytes differ only in key order or whitespace', async () => {
  ready();
  const { pkg, store } = await seeded();
  const rewritten = JSON.stringify(Object.fromEntries(Object.entries(pkg).reverse()));
  assert.equal((await api.planSchemeImport(store, rewritten)).action, 'noop');
});

test('a repeated confirm click cannot duplicate a revision', async () => {
  ready();
  const pkg = await approvedPackage(api);
  const text = api.serializeSchemePackage(pkg);
  const empty = api.emptySchemeStore();
  const plan = await api.planSchemeImport(empty, text);
  const first = await api.applySchemeImport(empty, { plan, confirmedDigest: pkg.contentDigest });
  const second = await api.applySchemeImport(first.store, { plan, confirmedDigest: pkg.contentDigest });
  assert.equal(second.receipt.status, 'noop');
  assert.equal(second.store.packages[PACKAGE_ID].revisions.length, 1);
});

test('a plan made before the store changed is stale and refused', async () => {
  ready();
  const { pkg, store } = await seeded();
  const second = await nextApproved(api, pkg, editRole);
  const third = await nextApproved(api, second, (draft) => { editRole(draft); });
  const stalePlan = await api.planSchemeImport(store, api.serializeSchemePackage(second));
  const moved = await plannedApply(store, api.serializeSchemePackage(second));
  const later = await plannedApply(moved.store, api.serializeSchemePackage(third));
  const result = await api.applySchemeImport(later.store, { plan: { ...stalePlan, incoming: { ...stalePlan.incoming, contentDigest: 'c'.repeat(64) } }, confirmedDigest: 'c'.repeat(64) });
  assert.equal(result.receipt.status, 'refused');
  assert.equal(result.receipt.reason, 'stale-plan');
  assert.equal(result.store, later.store);
});

test('same id and revision with different bytes is a conflict with no last-write-wins', async () => {
  ready();
  const { text, store } = await seeded();
  const rival = await frozenPackage(api, (() => { const d = syntheticDraftPackage(); editRole(d); return d; })());
  const rivalText = api.serializeSchemePackage(rival);
  const plan = await api.planSchemeImport(store, rivalText);
  assert.equal(plan.action, 'conflict');
  assert.deepEqual(conflictCodes(plan), ['same-revision-different-digest']);
  assert.ok(plan.conflicts[0].existingDigest && plan.conflicts[0].incomingDigest);
  const refused = await api.applySchemeImport(store, { plan, confirmedDigest: rival.contentDigest });
  assert.equal(refused.receipt.status, 'refused');
  assert.equal(refused.receipt.reason, 'resolution-required');
  assert.equal(refused.store, store);
  assert.equal(api.serializeSchemePackage(api.getSchemePackage(refused.store, PACKAGE_ID)), text);
});

for (const [resolution, currentIsIncoming] of [['keep-current', false], ['adopt-incoming', true]]) {
  test(`explicit ${resolution} preserves both byte streams`, async () => {
    ready('listSchemeRevisions');
    const { pkg, text, store } = await seeded();
    const rival = await frozenPackage(api, (() => { const d = syntheticDraftPackage(); editRole(d); return d; })());
    const rivalText = api.serializeSchemePackage(rival);
    const plan = await api.planSchemeImport(store, rivalText);
    const { receipt, store: after } = await api.applySchemeImport(store, { plan, confirmedDigest: rival.contentDigest, resolution });
    assert.equal(receipt.status, 'resolved');
    assert.equal(receipt.resolution, resolution);
    const texts = api.listSchemeRevisions(after, PACKAGE_ID).map((record) => record.text);
    assert.ok(texts.includes(text) && texts.includes(rivalText), 'both exact byte streams stay retained');
    assert.equal(api.currentSchemeRef(after, PACKAGE_ID).contentDigest, currentIsIncoming ? rival.contentDigest : pkg.contentDigest);
  });
}

test('an unsupported conflict resolution changes nothing', async () => {
  ready();
  const { store } = await seeded();
  const rival = await frozenPackage(api, (() => { const d = syntheticDraftPackage(); editRole(d); return d; })());
  const plan = await api.planSchemeImport(store, api.serializeSchemePackage(rival));
  const result = await api.applySchemeImport(store, { plan, confirmedDigest: rival.contentDigest, resolution: 'last-write-wins' });
  assert.equal(result.receipt.status, 'refused');
  assert.equal(result.store, store);
});

test('a supported descendant needs confirmation, then becomes current while the parent stays retained', async () => {
  ready('listSchemeRevisions');
  const { pkg, text, store } = await seeded();
  const next = await nextApproved(api, pkg, editRole);
  const nextText = api.serializeSchemePackage(next);
  const plan = await api.planSchemeImport(store, nextText);
  assert.equal(plan.action, 'descendant');
  assert.deepEqual(plan.incoming.changedCallIds, [CALL.sim4]);
  assert.equal(api.currentSchemeRef(store, PACKAGE_ID).revision, 1, 'preview moves nothing');
  const { receipt, store: after } = await api.applySchemeImport(store, { plan, confirmedDigest: next.contentDigest });
  assert.equal(receipt.status, 'imported');
  assert.equal(api.currentSchemeRef(after, PACKAGE_ID).revision, 2);
  const records = api.listSchemeRevisions(after, PACKAGE_ID);
  assert.deepEqual(records.map((r) => [r.revision, r.lifecycle]), [[1, 'superseded'], [2, 'approved']]);
  assert.equal(records[0].text, text, 'superseding never rewrites the older bytes');
});

test('an older unseen revision is retained as history and never replaces current', async () => {
  ready('listSchemeRevisions');
  const first = await approvedPackage(api);
  const second = await nextApproved(api, first, editRole);
  const { store } = await plannedApply(api.emptySchemeStore(), api.serializeSchemePackage(second));
  const firstText = api.serializeSchemePackage(first);
  const plan = await api.planSchemeImport(store, firstText);
  assert.equal(plan.action, 'history');
  const { receipt, store: after } = await api.applySchemeImport(store, { plan, confirmedDigest: first.contentDigest });
  assert.equal(receipt.status, 'retained-as-history');
  assert.equal(api.currentSchemeRef(after, PACKAGE_ID).revision, 2);
  assert.ok(api.listSchemeRevisions(after, PACKAGE_ID).some((r) => r.text === firstText));
});

test('a newer branch from an older parent is an explicit conflict', async () => {
  ready();
  const first = await approvedPackage(api);
  const second = await nextApproved(api, first, editRole);
  const third = await nextApproved(api, second, editRole);
  const branch = await nextApproved(api, first, (draft) => { draft.revision = 3; findRole(findCall(draft, CALL.p5), 'syn-r08').decision += ' branch'; });
  let store = api.emptySchemeStore();
  for (const pkg of [first, second]) ({ store } = await plannedApply(store, api.serializeSchemePackage(pkg)));
  const plan = await api.planSchemeImport(store, api.serializeSchemePackage(branch));
  assert.equal(plan.action, 'conflict');
  assert.deepEqual(conflictCodes(plan), ['non-descendant-branch']);
  assert.equal(api.currentSchemeRef(store, PACKAGE_ID).revision, 2);
  assert.equal(third.parentRevision, 2);
});

test('a newer revision naming the current number with the wrong parent digest is not a descendant', async () => {
  ready();
  const { pkg, store } = await seeded();
  const draft = api.createDraftRevision(pkg, { now: T3 });
  draft.parentDigest = 'd'.repeat(64);
  const forged = await approvedPackage(api, draft);
  const plan = await api.planSchemeImport(store, api.serializeSchemePackage(forged));
  assert.equal(plan.action, 'conflict');
  assert.deepEqual(conflictCodes(plan), ['non-descendant-branch']);
});

test('a skipped ancestor cannot be proven and is held as a conflict, not adopted', async () => {
  ready();
  const first = await approvedPackage(api);
  const second = await nextApproved(api, first, editRole);
  const third = await nextApproved(api, second, editRole);
  const { store } = await plannedApply(api.emptySchemeStore(), api.serializeSchemePackage(first));
  const plan = await api.planSchemeImport(store, api.serializeSchemePackage(third));
  assert.equal(plan.action, 'conflict');
  assert.deepEqual(conflictCodes(plan), ['unverifiable-ancestry']);
});

test('a foreign family reusing a package id cannot overwrite it', async () => {
  ready();
  const { store } = await seeded();
  const draft = syntheticDraftPackage();
  draft.familyId = 'syn-fam-foreign';
  for (const call of draft.calls) call.familyId = 'syn-fam-foreign';
  const foreign = await approvedPackage(api, draft);
  const plan = await api.planSchemeImport(store, api.serializeSchemePackage(foreign));
  assert.equal(plan.action, 'conflict');
  assert.deepEqual(conflictCodes(plan), ['foreign-family']);
});

test('identical call, role and diagram ids in another package stay namespaced', async () => {
  ready('getSchemePackage');
  const { pkg, store } = await seeded();
  const draft = syntheticDraftPackage();
  draft.packageId = 'syn-pkg-other';
  editRole(draft);
  const other = await approvedPackage(api, draft);
  const { plan, store: after } = await plannedApply(store, api.serializeSchemePackage(other));
  assert.equal(plan.action, 'create');
  assert.deepEqual(api.getSchemePackage(after, PACKAGE_ID), pkg);
  assert.deepEqual(api.getSchemePackage(after, 'syn-pkg-other'), other);
});

test('several families and revisions coexist in one store', async () => {
  ready('getSchemePackage');
  let { store } = await seeded();
  for (const familyId of ['syn-fam-two', 'syn-fam-three']) {
    const draft = syntheticDraftPackage();
    draft.packageId = `syn-pkg-${familyId}`;
    draft.familyId = familyId;
    for (const call of draft.calls) call.familyId = familyId;
    ({ store } = await plannedApply(store, api.serializeSchemePackage(await approvedPackage(api, draft))));
  }
  assert.equal(Object.keys(store.packages).length, 3);
});

for (const [name, remove, kind] of [
  ['coach key', (draft) => { draft.coachKeys.shift(); }, 'coach-key'],
  ['diagram', (draft) => { draft.diagrams.shift(); }, 'diagram'],
]) {
  test(`a missing ${name} is an explicit held result, not invented content`, async () => {
    ready('getSchemePackage');
    const { text, store } = await seeded();
    const draft = syntheticDraftPackage();
    draft.packageId = 'syn-pkg-held';
    remove(draft);
    const held = await frozenPackage(api, draft);
    const heldText = api.serializeSchemePackage(held);
    const plan = await api.planSchemeImport(store, heldText);
    assert.equal(plan.action, 'held');
    assert.equal(plan.heldAssets[0].kind, kind);
    const result = await api.applySchemeImport(store, { plan, confirmedDigest: held.contentDigest });
    assert.equal(result.receipt.status, 'held');
    assert.deepEqual(result.resultingRefs, []);
    assert.equal(result.store.held.at(-1).text, heldText, 'held bytes are retained for repair');
    assert.equal(api.getSchemePackage(result.store, 'syn-pkg-held'), null, 'held material is not a usable package');
    assert.equal(api.serializeSchemePackage(api.getSchemePackage(result.store, 'syn-pkg-c41d')), text);
  });
}

for (const [name, text, code] of [
  ['empty text', '', 'nothing-to-import'],
  ['malformed JSON', '{not json', 'invalid-json'],
  ['a JSON array', '[]', 'not-an-object'],
  ['another app document', '{"schema":"practice-week-planner.project","schemaVersion":1}', 'unknown-package-kind'],
  ['a future schema', '{"packageKind":"coach-scheme-package","schemaVersion":2}', 'unsupported-schema-version'],
  ['a learner projection', '{"packageKind":"identify-projection","schemaVersion":1}', 'not-a-coach-package'],
]) {
  test(`${name} is rejected with the store unchanged`, async () => {
    ready();
    const { store } = await seeded();
    const plan = await api.planSchemeImport(store, text);
    assert.equal(plan.action, 'rejected');
    assert.ok(plan.errors.some((issue) => issue.code === code), `expected ${code}, saw ${plan.errors.map((e) => e.code)}`);
    const result = await api.applySchemeImport(store, { plan, confirmedDigest: 'a'.repeat(64) });
    assert.equal(result.receipt.status, 'refused');
    assert.equal(result.store, store);
  });
}

test('tampered bytes are rejected before they can be planned', async () => {
  ready();
  const { pkg, store } = await seeded();
  const tampered = structuredClone(pkg);
  tampered.calls[0].roles[0].decision += ' tampered';
  const plan = await api.planSchemeImport(store, api.serializeSchemePackage(tampered));
  assert.equal(plan.action, 'rejected');
  assert.ok(plan.errors.some((issue) => issue.code === 'digest-mismatch'));
});

test('an unfrozen draft is not a transport file', async () => {
  ready();
  const plan = await api.planSchemeImport(api.emptySchemeStore(), api.serializeSchemePackage(syntheticDraftPackage()));
  assert.equal(plan.action, 'rejected');
  assert.ok(plan.errors.some((issue) => issue.code === 'not-frozen'));
});

test('a byte order mark does not block import, and oversize text is refused', async () => {
  ready();
  const pkg = await approvedPackage(api);
  const plan = await api.planSchemeImport(api.emptySchemeStore(), `﻿${api.serializeSchemePackage(pkg)}`);
  assert.equal(plan.action, 'create');
  const big = await api.planSchemeImport(api.emptySchemeStore(), 'x'.repeat(api.MAX_SCHEME_IMPORT_CHARS + 1));
  assert.equal(big.action, 'rejected');
  assert.ok(big.errors.some((issue) => issue.code === 'too-large'));
});

test('every existing revision and supplied pin is listed as preserved, through every action', async () => {
  ready();
  const { pkg, store } = await seeded();
  const pin = { packageId: PACKAGE_ID, revision: 1, contentDigest: pkg.contentDigest, callId: CALL.sim4, callDigest: pkg.callDigests[CALL.sim4] };
  const next = await nextApproved(api, pkg, editRole);
  const rival = await frozenPackage(api, (() => { const d = syntheticDraftPackage(); editRole(d); return d; })());
  for (const incoming of [pkg, next, rival]) {
    const plan = await api.planSchemeImport(store, api.serializeSchemePackage(incoming), { pins: [pin] });
    assert.ok(plan.preservedRefs.some((ref) => ref.revision === 1 && ref.contentDigest === pkg.contentDigest && ref.callId === undefined), 'stored revision');
    assert.ok(plan.preservedRefs.some((ref) => ref.callId === CALL.sim4 && ref.callDigest === pin.callDigest), 'external pin');
  }
});

test('a hostile __proto__ key cannot pollute prototypes through import', async () => {
  ready();
  const pkg = await approvedPackage(api);
  const text = api.serializeSchemePackage(pkg).replace('"packageKind"', '"__proto__":{"polluted":true},"packageKind"');
  await api.planSchemeImport(api.emptySchemeStore(), text);
  assert.equal({}.polluted, undefined);
});

test('store text round-trips through JSON without changing any byte stream', async () => {
  ready('getSchemePackage');
  const { pkg, store } = await seeded();
  const reopened = JSON.parse(JSON.stringify(store));
  assert.equal(api.serializeSchemePackage(api.getSchemePackage(reopened, PACKAGE_ID)), api.serializeSchemePackage(pkg));
  assert.equal((await api.planSchemeImport(reopened, api.serializeSchemePackage(pkg))).action, 'noop');
});
