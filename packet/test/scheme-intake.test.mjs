// Packet version 2 intake and output boundaries, with version 1 unchanged.
// Needs test/fixtures/schemeFixture.mjs, a byte-identical copy of the lesson fixture.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clone } from '../public/src/common.js';
import { viewText } from '../public/src/dom.js';
import {
  PACKET_VERSION, PACKET_VERSION_V2, createSchemePacket, packetFilename, printDocumentTitle, readImport, readPracticeDocument, serializePacket, validatePacket, verifyPacketTeaching,
} from '../public/src/packet.js';
import * as scheme from '../public/src/schemePackage.js';
import { viewFor } from '../public/src/views.js';
import { DAY_60, STORAGE_KEY, controllerWith, deferredFile, fileWith, memoryStorage, named, packetFor, practiceDoc } from './helpers.mjs';
import { CALL, approvedPackage, findCall, findRole, frozenPackage, identifyLeaks, nextApproved, smuggle, syntheticDraftPackage } from './fixtures/schemeFixture.mjs';

const text = scheme.serializeSchemePackage;
const editSim = (draft) => { findRole(findCall(draft, CALL.sim4), 'syn-r08').decision += ' revised'; };

function setup(pkg, callId = CALL.sim4) {
  const doc = practiceDoc();
  const period = doc.week.days[0].periods[1];
  period.schemeRefs = [scheme.schemeRefFor(pkg, callId)];
  return { doc, periodId: period.id, intake: readPracticeDocument(doc) };
}

async function built(output = 'coach', draft = syntheticDraftPackage()) {
  const pkg = await approvedPackage(scheme, draft);
  const { intake, periodId } = setup(pkg);
  return { pkg, packet: await createSchemePacket({ intake, dayId: DAY_60, periodId, callId: CALL.sim4, schemes: [pkg], output }), intake, periodId };
}

const rejects = (fn, pattern) => assert.rejects(fn, (error) => error.name === 'PacketError' && pattern.test(error.message));

test('version 1 packets keep their bytes, Cover 3 outputs and version number', () => {
  const packet = packetFor(DAY_60);
  assert.equal(packet.schemaVersion, PACKET_VERSION);
  assert.ok(packet.cover3);
  assert.equal(Object.hasOwn(packet, 'teaching'), false);
  assert.doesNotMatch(serializePacket(packet), /schemeRefs/);
  assert.equal(serializePacket(readImport(serializePacket(packet)).packet), serializePacket(packet));
});

test('a version 1 document relabelled as version 2 stays unsupported', () => {
  const packet = clone(packetFor(DAY_60));
  packet.schemaVersion = PACKET_VERSION_V2;
  assert.throws(() => readImport(JSON.stringify(packet)), /not supported/);
});

test('imports are classified, and learner projections are never a teaching source', async () => {
  const pkg = await approvedPackage(scheme);
  assert.equal(readImport(text(pkg)).kind, 'scheme-package');
  const identify = await scheme.deriveLearnerProjection(pkg, 'identify', scheme.schemeRefFor(pkg, CALL.sim4));
  assert.throws(() => readImport(JSON.stringify(identify)), /learner projection/i);
});

test('period pins survive Practice intake', async () => {
  const pkg = await approvedPackage(scheme);
  const { intake, periodId } = setup(pkg);
  assert.deepEqual(intake.days[0].periods.find((p) => p.id === periodId).schemeRefs, [scheme.schemeRefFor(pkg, CALL.sim4)]);
});

test('version 2 needs the exact pinned revision, approval and an explicit selection', async () => {
  const pkg = await approvedPackage(scheme);
  const { intake, periodId } = setup(pkg);
  const args = { intake, dayId: DAY_60, periodId, callId: CALL.sim4 };
  const newer = await nextApproved(scheme, pkg, editSim);
  await rejects(() => createSchemePacket({ ...args, schemes: [newer] }), /Held: this period pins revision 1/);
  await rejects(() => createSchemePacket({ ...args, schemes: [] }), /Held/);
  await rejects(() => createSchemePacket({ ...args, callId: CALL.p5, schemes: [pkg] }), /no pin for this call/);
  await rejects(() => createSchemePacket({ ...args, periodId: 'per-none', schemes: [pkg] }), /not on this practice day/);
  await rejects(() => createSchemePacket({ ...args, dayId: 'day-none', schemes: [pkg] }), /not in this import/);
  const frozen = await frozenPackage(scheme);
  const unapproved = setup(frozen);
  await rejects(() => createSchemePacket({ intake: unapproved.intake, dayId: DAY_60, periodId: unapproved.periodId, callId: CALL.sim4, schemes: [frozen] }), /Held: package-not-approved/);
});

test('a version 2 packet round-trips byte for byte and verifies its digests', async () => {
  const { packet, pkg } = await built();
  assert.equal(packet.schemaVersion, PACKET_VERSION_V2);
  assert.deepEqual(packet.teaching.pin, scheme.schemeRefFor(pkg, CALL.sim4));
  const output = serializePacket(packet);
  const reopened = readImport(output).packet;
  assert.equal(serializePacket(reopened), output);
  assert.deepEqual(await verifyPacketTeaching(reopened), { ok: true, reason: null });
});

test('tampered and smuggled content is caught or dropped on opening', async () => {
  const { packet } = await built();
  const tampered = clone(packet);
  tampered.teaching.coach.keyRecord.answers[0].answer = 'changed';
  assert.equal((await verifyPacketTeaching(validatePacket(tampered))).ok, false);
  const cards = clone(packet);
  cards.teaching.identify.cards[0].prompt = 'changed';
  assert.equal((await verifyPacketTeaching(validatePacket(cards))).ok, false);
  const smuggled = clone(packet);
  smuggled.teaching.identify.cards[0].answer = 'SMUGGLED';
  smuggled.teaching.study.roles[0].rubric = 'SMUGGLED';
  smuggled.teaching.extra = 'SMUGGLED';
  assert.doesNotMatch(serializePacket(validatePacket(smuggled)), /SMUGGLED/);
});

test('Identify holds all eleven neutral cards with authored context and no leak', async () => {
  const { packet } = await built('identify', smuggle(syntheticDraftPackage()));
  const view = viewFor(packet);
  const serialized = JSON.stringify(view);
  assert.deepEqual(identifyLeaks(serialized), []);
  assert.doesNotMatch(serialized, /coach|Revision|revision/);
  const output = viewText(view);
  for (let card = 1; card <= 11; card += 1) assert.ok(output.includes(`Identify card ${card} of 11`));
  assert.ok(output.includes('Sample Swap · 2nd and 7, left hash'));
  assert.ok(output.includes('On this call and this look, what do you do?'));
});

test('the study sheet teaches eleven roles and holds no key, evidence or area', async () => {
  const { packet } = await built('assignment');
  const output = JSON.stringify(viewFor(packet));
  assert.match(output, /SYN-JOB/);
  assert.equal((viewText(viewFor(packet)).match(/SYN-JOB key/g) ?? []).length, 11);
  assert.doesNotMatch(output, /COACH-ONLY|AREA-SENTINEL|ellipse|syn-key-|syn-src-/);
});

test('the coach view lists eleven roles and shows a missing key as held', async () => {
  const draft = syntheticDraftPackage();
  draft.coachKeys.find((key) => key.callId === CALL.sim4).answers[0].answer = null;
  const { packet } = await built('coach', draft);
  const output = viewText(viewFor(packet));
  assert.ok(output.includes('All eleven roles'));
  assert.ok(output.includes('Held: no authored key'));
  assert.ok(output.includes('COACH-ONLY rubric'));
  assert.ok(output.includes('Doctrine status: not-adopted'));
  assert.ok(output.includes('No authored area'), 'rush roles stay visible without an area');
});

test('an unknown area color keeps the area on the coach diagram', async () => {
  const draft = syntheticDraftPackage();
  draft.diagrams.find((d) => d.diagramId === 'syn-diagram-sim4').play.assignments[0].definition.responsibilityArea.color = 'plaid';
  const { packet } = await built('coach', draft);
  assert.match(JSON.stringify(viewFor(packet)), /ellipse/);
});

test('titles and filenames carry no call, revision or answer text', async () => {
  const { packet } = await built('identify');
  assert.equal(printDocumentTitle(packet), 'Identify cards');
  assert.equal(printDocumentTitle({ ...packet, output: 'assignment' }), 'Study sheet');
  assert.doesNotMatch(packetFilename(packet), /Sample|SYN|syn-|\d+-\d+/);
  assert.match(packetFilename(packet), /coach-material\.json$/);
});

function ready(options) {
  const setupResult = controllerWith(options);
  setupResult.controller.init();
  return setupResult;
}

async function loadScheme(controller, pkg) {
  await controller.importFile(fileWith(text(pkg)));
  assert.ok(controller.state.schemePreview, controller.state.notice?.text);
  controller.confirmScheme();
}

test('the controller previews, confirms, builds, saves and reopens version 2', async () => {
  const pkg = await approvedPackage(scheme);
  const { doc, periodId } = setup(pkg);
  const storage = memoryStorage();
  const { controller } = ready({ storage });
  await controller.importFile(fileWith(JSON.stringify(doc)));
  await controller.importFile(fileWith(text(pkg)));
  assert.equal(controller.state.schemes.length, 0, 'preview loads nothing');
  assert.equal(controller.state.schemePreview.action, 'create');
  controller.confirmScheme();
  assert.equal(controller.state.schemes.length, 1);
  await controller.chooseSchemeCall({ dayId: DAY_60, periodId, callId: CALL.sim4 });
  assert.equal(controller.state.packet.schemaVersion, PACKET_VERSION_V2);
  assert.equal(controller.state.local, 'unsaved');
  assert.equal(controller.state.teachingStatus, 'current');
  controller.save();
  assert.equal(controller.state.local, 'saved');
  const again = controllerWith({ storage });
  await again.controller.init();
  assert.equal(serializePacket(again.controller.state.packet), storage.entries.get(STORAGE_KEY));
  await again.controller.verifyTeaching();
  assert.equal(again.controller.state.teachingIntegrity, 'verified');
});

test('a newer loaded revision marks the packet stale and leaves its bytes alone', async () => {
  const pkg = await approvedPackage(scheme);
  const { doc, periodId } = setup(pkg);
  const { controller } = ready();
  await controller.importFile(fileWith(JSON.stringify(doc)));
  await loadScheme(controller, pkg);
  await controller.chooseSchemeCall({ dayId: DAY_60, periodId, callId: CALL.sim4 });
  const bytes = serializePacket(controller.state.packet);
  await loadScheme(controller, await nextApproved(scheme, pkg, editSim));
  assert.equal(controller.state.teachingStatus, 'stale');
  assert.equal(serializePacket(controller.state.packet), bytes);
});

test('failures keep the current packet and report honestly', async () => {
  const pkg = await approvedPackage(scheme);
  const { doc, periodId } = setup(pkg);
  const { controller, storage } = ready();
  await controller.importFile(fileWith(JSON.stringify(doc)));
  await loadScheme(controller, pkg);
  await controller.chooseSchemeCall({ dayId: DAY_60, periodId, callId: CALL.sim4 });
  const { packet } = controller.state;
  const tampered = structuredClone(pkg);
  tampered.calls[0].roles[0].decision += ' x';
  await controller.importFile(fileWith(text(tampered)));
  assert.equal(controller.state.schemePreview, null);
  assert.equal(controller.state.notice.kind, 'error');
  assert.equal(controller.state.packet, packet);
  await controller.chooseSchemeCall({ dayId: DAY_60, periodId, callId: CALL.p5 });
  assert.match(controller.state.notice.text, /current packet is unchanged/);
  assert.equal(controller.state.packet, packet);
  storage.failWrite = named('QuotaExceededError');
  controller.save();
  assert.equal(controller.state.local, 'unavailable');
});

test('a held package cannot be loaded', async () => {
  const draft = syntheticDraftPackage();
  draft.diagrams.shift();
  const { controller } = ready();
  await controller.importFile(fileWith(text(await frozenPackage(scheme, draft))));
  assert.equal(controller.state.schemePreview.action, 'held');
  controller.confirmScheme();
  assert.equal(controller.state.schemes.length, 0);
});

test('a slow package read cannot replace newer work', async () => {
  const pkg = await approvedPackage(scheme);
  const { controller } = ready();
  const slow = deferredFile();
  const reading = controller.importFile(slow);
  controller.loadSample();
  slow.resolve(text(pkg));
  await reading;
  assert.equal(controller.state.schemePreview, null);
});
