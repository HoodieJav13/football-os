// The Playmaker side: diagram binding, lesson pack reuse and honest workspace persistence.
// Run from the full lesson copy; lessonPack.js needs the omitted playData.js.
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { createCover3Lesson } from '../src/cover3Lesson.js';
import { createLessonPack, isLessonPackStale, lessonPackCards, lessonRevision } from '../src/lessonPack.js';
import { WORKSPACE_KEY, createDefaultWorkspace, createWorkspaceBackup, parseWorkspaceBackup } from '../src/workspaceData.js';
import { CALL, approvedPackage, deepFreeze, findCall, frozenPackage, syntheticDraftPackage, teachableRevisionOf } from './fixtures/schemeFixture.mjs';

const schemePath = new URL('../src/schemePackage.js', import.meta.url);
const bridgePath = new URL('../src/schemeLesson.js', import.meta.url);
const scheme = existsSync(schemePath) ? await import(schemePath) : {};
const bridge = existsSync(bridgePath) ? await import(bridgePath) : {};
const ready = (...names) => {
  for (const name of ['freezeSchemePackage', 'approveSchemePackage', 'schemeRefFor', 'deriveRevisionStatus', 'emptySchemeStore']) assert.equal(typeof scheme[name], 'function', `schemePackage.${name} is required`);
  for (const name of names) assert.equal(typeof bridge[name], 'function', `schemeLesson.${name} is required`);
};
const diagramOf = (pkg, callId) => {
  const { diagramId } = findCall(pkg, callId).diagramRef;
  return pkg.diagrams.find((diagram) => diagram.diagramId === diagramId).play;
};
const memoryStorage = () => {
  const entries = new Map();
  return { entries, failWrite: null, getItem: (key) => (entries.has(key) ? entries.get(key) : null), setItem(key, value) { if (this.failWrite) throw this.failWrite; entries.set(key, value); }, removeItem: (key) => entries.delete(key) };
};

test('the Playmaker bridge module exists', () => assert.ok(existsSync(bridgePath), 'lesson/src/schemeLesson.js is not implemented yet'));

test('the fixture revision oracle agrees with the real lessonRevision', () => {
  for (const { play } of syntheticDraftPackage().diagrams) assert.equal(teachableRevisionOf(play), lessonRevision(play));
});

test('diagramRefFor uses the existing lesson revision and the play id', () => {
  ready('diagramRefFor');
  const play = createCover3Lesson('syn-bridge');
  assert.deepEqual(bridge.diagramRefFor(play), { diagramId: play.id, teachableRevision: lessonRevision(play) });
});

test('binding a teachable diagram edit changes that call only and follows the new alignment', async () => {
  ready('bindDiagramToCall');
  const draft = deepFreeze(syntheticDraftPackage());
  const play = structuredClone(diagramOf(draft, CALL.sim4));
  play.defenders.find((d) => d.id === 'syn-r05').x -= 2;
  const bound = bridge.bindDiagramToCall(draft, CALL.sim4, play);
  assert.equal(findCall(bound, CALL.sim4).diagramRef.teachableRevision, lessonRevision(play));
  assert.equal(findCall(bound, CALL.sim4).roles.find((r) => r.roleId === 'syn-r05').alignment.x, -6);
  const before = await frozenPackage(scheme, syntheticDraftPackage());
  const after = await frozenPackage(scheme, bound);
  assert.notEqual(after.contentDigest, before.contentDigest);
  assert.notEqual(after.callDigests[CALL.sim4], before.callDigests[CALL.sim4]);
  assert.equal(after.callDigests[CALL.quarters], before.callDigests[CALL.quarters]);
});

test('a camera, focus or selection change on the diagram changes nothing', async () => {
  ready('bindDiagramToCall');
  const draft = syntheticDraftPackage();
  const play = { ...structuredClone(diagramOf(draft, CALL.sim4)), camera: { factor: 3 }, selectedPlayerId: 'syn-r05', zoom: { factor: 2 }, view: 'side' };
  const bound = bridge.bindDiagramToCall(draft, CALL.sim4, play);
  assert.deepEqual(findCall(bound, CALL.sim4).diagramRef, findCall(draft, CALL.sim4).diagramRef);
  assert.equal((await frozenPackage(scheme, bound)).contentDigest, (await frozenPackage(scheme, syntheticDraftPackage())).contentDigest);
});

test('binding refuses a diagram that does not hold the same eleven role ids', () => {
  ready('bindDiagramToCall');
  const draft = syntheticDraftPackage();
  const play = structuredClone(diagramOf(draft, CALL.sim4));
  play.defenders.pop();
  assert.throws(() => bridge.bindDiagramToCall(draft, CALL.sim4, play), (error) => error.code === 'diagram-role-mismatch');
});

test('a frozen revision cannot be edited in place', async () => {
  ready('bindDiagramToCall');
  const frozen = await frozenPackage(scheme);
  assert.throws(() => bridge.bindDiagramToCall(frozen, CALL.sim4, diagramOf(frozen, CALL.sim4)), (error) => error.code === 'frozen-revision');
});

test('a lesson pack built from a package reuses createLessonPack and its stale check', async () => {
  ready('lessonPackForCall');
  const pkg = await approvedPackage(scheme);
  const play = diagramOf(pkg, CALL.quarters);
  const pack = bridge.lessonPackForCall(pkg, CALL.quarters);
  assert.deepEqual(pack, createLessonPack(play));
  assert.equal(pack.revision, findCall(pkg, CALL.quarters).diagramRef.teachableRevision);
  assert.equal(isLessonPackStale(pack, play), false);
  const edited = structuredClone(play);
  edited.defenders[5].x += 1;
  assert.equal(isLessonPackStale(pack, edited), true);
  assert.equal(isLessonPackStale(pack, { ...play, camera: { factor: 2 } }), false);
});

test('existing lesson pack output is unchanged: seven answered cards for the Cover 3 example', () => {
  assert.equal(lessonPackCards(createLessonPack(createCover3Lesson('syn-regression'))).length, 7);
});

test('the scheme library survives the existing workspace backup route', async () => {
  ready('withSchemeLibrary', 'readSchemeLibrary');
  const workspace = createDefaultWorkspace();
  const bookId = workspace.mainPlaybookId;
  const library = scheme.emptySchemeStore();
  const next = bridge.withSchemeLibrary(workspace, bookId, library);
  const parsed = parseWorkspaceBackup(JSON.stringify(createWorkspaceBackup(next)));
  assert.deepEqual(bridge.readSchemeLibrary(parsed.workspace, bookId), library);
});

test('another book cannot read or replace this library', () => {
  ready('withSchemeLibrary', 'readSchemeLibrary');
  const workspace = createDefaultWorkspace();
  const next = bridge.withSchemeLibrary(workspace, workspace.mainPlaybookId, scheme.emptySchemeStore());
  const other = next.playbooks.find((book) => book.id !== next.mainPlaybookId);
  assert.equal(bridge.readSchemeLibrary(next, other.id), null);
});

test('a saved library reports saved only after the existing storage route accepted it', () => {
  ready('commitSchemeLibrary');
  const storage = memoryStorage();
  const workspace = createDefaultWorkspace();
  const result = bridge.commitSchemeLibrary(storage, workspace, workspace.mainPlaybookId, scheme.emptySchemeStore());
  assert.equal(result.ok, true);
  assert.equal(result.saved, true);
  assert.ok(storage.entries.has(WORKSPACE_KEY));
});

test('a storage failure shows no false saved state and keeps the prior workspace', () => {
  ready('commitSchemeLibrary');
  const storage = memoryStorage();
  storage.failWrite = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
  const workspace = createDefaultWorkspace();
  const result = bridge.commitSchemeLibrary(storage, workspace, workspace.mainPlaybookId, scheme.emptySchemeStore());
  assert.equal(result.ok, false);
  assert.equal(result.saved, false);
  assert.equal(result.workspace, workspace);
  assert.match(result.error, /storage|full/i);
});
