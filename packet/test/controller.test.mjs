import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EXPORT_LABEL, LOCAL_LABELS } from '../public/src/controller.js';
import { serializePacket } from '../public/src/packet.js';
import {
  DAY_45, DAY_60, STORAGE_KEY, controllerWith, deferredFile, fileWith, memoryStorage, named, packetFor, practiceDoc,
} from './helpers.mjs';

function ready(options) {
  const setup = controllerWith(options);
  setup.controller.init();
  setup.controller.loadSample();
  return setup;
}

test('status labels are the contract’s words', () => {
  assert.deepEqual(Object.values(LOCAL_LABELS), ['Unsaved', 'Saved locally', 'Storage unavailable']);
  assert.equal(EXPORT_LABEL, 'Export requested');
});

test('importing Practice data picks no day and builds no packet', () => {
  const { controller } = ready();
  assert.equal(controller.state.dayId, null);
  assert.equal(controller.state.packet, null);
  assert.equal(controller.state.intake.days.length, 2);
  assert.equal(controller.state.local, 'unsaved');
});

test('a chosen day builds an unsaved packet; save writes one companion key', () => {
  const { controller, storage } = ready();
  controller.chooseDay(DAY_45);
  assert.equal(controller.state.packet.source.dayId, DAY_45);
  assert.equal(controller.state.local, 'unsaved');
  assert.equal(storage.entries.size, 0, 'nothing saves until asked');
  controller.save();
  assert.equal(controller.state.local, 'saved');
  assert.deepEqual([...storage.entries.keys()], [STORAGE_KEY]);
});

test('a saved packet reopens with its selection and output', () => {
  const storage = memoryStorage();
  const first = ready({ storage });
  first.controller.chooseDay(DAY_45);
  first.controller.chooseOutput('identify');
  first.controller.save();
  const second = controllerWith({ storage });
  second.controller.init();
  assert.equal(second.controller.state.local, 'saved');
  assert.equal(second.controller.state.dayId, DAY_45);
  assert.equal(second.controller.state.output, 'identify');
  assert.equal(serializePacket(second.controller.state.packet), storage.entries.get(STORAGE_KEY));
});

test('a change after saving returns to Unsaved, and undoing it returns to Saved locally', () => {
  const { controller } = ready();
  controller.chooseDay(DAY_60);
  controller.save();
  controller.chooseOutput('assignment');
  assert.equal(controller.state.local, 'unsaved');
  assert.doesNotMatch(controller.state.notice.text, /Saved in this browser/);
  controller.chooseOutput('coach');
  assert.equal(controller.state.local, 'saved');
  assert.match(controller.state.notice.text, /saved in this browser/);
});

test('reselecting the saved day keeps the notice consistent with saved status', () => {
  const { controller } = ready();
  controller.chooseDay(DAY_60);
  controller.save();
  controller.chooseDay(DAY_60);
  assert.equal(controller.state.local, 'saved');
  assert.doesNotMatch(controller.state.notice.text, /not saved/);
});

for (const [name, setUp, pattern] of [
  ['quota', (s) => { s.failWrite = named('QuotaExceededError'); }, /storage is full/],
  ['security', (s) => { s.failWrite = named('SecurityError'); }, /blocking local storage/],
  ['silent loss', (s) => { s.dropWrites = true; }, /did not keep/],
]) {
  test(`a ${name} save failure stays honest and keeps the packet usable`, () => {
    const { controller, storage } = ready();
    controller.chooseDay(DAY_60);
    const before = controller.state.packet;
    setUp(storage);
    controller.save();
    assert.equal(controller.state.local, 'unavailable');
    assert.equal(LOCAL_LABELS[controller.state.local], 'Storage unavailable');
    assert.match(controller.state.notice.text, pattern);
    assert.match(controller.state.notice.text, /not saved/);
    assert.equal(controller.state.packet, before);
    controller.exportPacket();
    assert.equal(controller.state.exportRequested, true);
  });
}

test('save works again after storage recovers', () => {
  const { controller, storage } = ready();
  controller.chooseDay(DAY_60);
  storage.failWrite = named('QuotaExceededError');
  controller.save();
  storage.failWrite = null;
  controller.save();
  assert.equal(controller.state.local, 'saved');
});

test('storage that refuses access at startup is reported and the app still works', () => {
  const { controller } = controllerWith({ getStorage: () => { throw named('SecurityError'); } });
  controller.init();
  assert.equal(controller.state.local, 'unavailable');
  assert.match(controller.state.notice.text, /blocking local storage/);
  controller.loadSample();
  controller.chooseDay(DAY_60);
  assert.equal(controller.state.packet.source.dayId, DAY_60);
  controller.save();
  assert.equal(controller.state.local, 'unavailable');
});

test('a missing storage object counts as unavailable', () => {
  const { controller } = controllerWith({ getStorage: () => null });
  controller.init();
  assert.equal(controller.state.local, 'unavailable');
});

for (const [name, text, pattern] of [
  ['corrupt', '{broken', /not valid JSON/],
  ['future version', JSON.stringify({ ...JSON.parse(serializePacket(packetFor())), schemaVersion: 2 }), /not supported/],
  ['wrong kind', JSON.stringify(practiceDoc()), /not a session packet/],
]) {
  test(`${name} saved data is reported, left in place, and opens nothing`, () => {
    const storage = memoryStorage({ [STORAGE_KEY]: text });
    const { controller } = controllerWith({ storage });
    controller.init();
    assert.equal(controller.state.packet, null);
    assert.equal(controller.state.notice.kind, 'error');
    assert.match(controller.state.notice.text, pattern);
    assert.equal(storage.entries.get(STORAGE_KEY), text);
    controller.loadSample();
    controller.chooseDay(DAY_60);
    controller.save();
    assert.equal(controller.state.local, 'saved');
  });
}

test('download is only ever reported as requested, never as saved', () => {
  const { controller, downloads } = ready();
  controller.chooseDay(DAY_60);
  controller.exportPacket();
  assert.equal(downloads.length, 1);
  assert.equal(controller.state.exportRequested, true);
  assert.equal(controller.state.local, 'unsaved');
  assert.match(controller.state.notice.text, /Export requested/);
  assert.doesNotMatch(controller.state.notice.text, /saved|Saved/);
  assert.equal(downloads[0].text, serializePacket(controller.state.packet));
});

test('a refused download is reported and not marked requested', () => {
  const { controller } = ready({ download: () => { throw new Error('blocked'); } });
  controller.chooseDay(DAY_60);
  controller.exportPacket();
  assert.equal(controller.state.exportRequested, false);
  assert.equal(controller.state.notice.kind, 'error');
});

test('export requested clears when the packet changes', () => {
  const { controller } = ready();
  controller.chooseDay(DAY_60);
  controller.exportPacket();
  controller.chooseOutput('identify');
  assert.equal(controller.state.exportRequested, false);
});

test('rapid double actions stay stable', () => {
  let time = 0;
  const { controller, storage, downloads, prints } = ready({ now: () => time });
  controller.chooseDay(DAY_60);
  controller.chooseDay(DAY_60);
  controller.save();
  controller.save();
  const saved = storage.entries.get(STORAGE_KEY);
  controller.exportPacket();
  controller.exportPacket();
  controller.printPacket();
  controller.printPacket();
  assert.equal(downloads.length, 1);
  assert.equal(prints.length, 1);
  assert.equal(storage.entries.size, 1);
  assert.equal(storage.entries.get(STORAGE_KEY), saved);
  assert.equal(JSON.parse(saved).day.periods.length, 12);
  time = 5000;
  controller.exportPacket();
  controller.printPacket();
  assert.equal(downloads.length, 2);
  assert.equal(prints.length, 2);
});

test('actions with no packet explain themselves', () => {
  const { controller, downloads, prints, storage } = ready();
  controller.save();
  controller.exportPacket();
  controller.printPacket();
  assert.equal(storage.entries.size, 0);
  assert.equal(downloads.length, 0);
  assert.equal(prints.length, 0);
  assert.equal(controller.state.notice.kind, 'error');
});

test('malformed import preserves the last good state, and a retry succeeds', async () => {
  const { controller } = ready();
  controller.chooseDay(DAY_60);
  const packet = controller.state.packet;
  const { intake } = controller.state;
  for (const bad of ['{oops', '[]', JSON.stringify({ ...practiceDoc(), schemaVersion: 9 })]) {
    assert.equal(controller.importText(bad), false);
    assert.equal(controller.state.packet, packet);
    assert.equal(controller.state.intake, intake);
    assert.equal(controller.state.dayId, DAY_60);
    assert.match(controller.state.notice.text, /current packet is unchanged/);
  }
  await controller.importFile(fileWith('{oops'));
  assert.equal(controller.state.packet, packet);
  await controller.importFile(fileWith(JSON.stringify(practiceDoc())));
  assert.equal(controller.state.notice.kind, 'ok');
  assert.equal(controller.state.dayId, null);
  assert.equal(controller.state.packet, packet, 'a new Practice import waits for a day choice');
});

test('a bad day choice preserves the current packet', () => {
  const { controller } = ready();
  controller.chooseDay(DAY_60);
  const { packet } = controller.state;
  controller.chooseDay('day-unknown');
  assert.equal(controller.state.packet, packet);
  assert.equal(controller.state.dayId, DAY_60);
  assert.equal(controller.state.notice.kind, 'error');
});

test('an unknown output choice changes nothing', () => {
  const { controller } = ready();
  controller.chooseDay(DAY_60);
  controller.chooseOutput('answers');
  assert.equal(controller.state.output, 'coach');
  assert.equal(controller.state.packet.output, 'coach');
});

test('opening a packet replaces the current one and detaches old Practice data', async () => {
  const { controller } = ready();
  controller.chooseDay(DAY_60);
  await controller.importFile(fileWith(serializePacket(packetFor(DAY_45, 'assignment'))));
  assert.equal(controller.state.packet.source.dayId, DAY_45);
  assert.equal(controller.state.output, 'assignment');
  assert.equal(controller.state.intake, null);
  assert.equal(controller.state.local, 'unsaved');
});

test('an older slow import cannot replace a newer day choice', async () => {
  const { controller } = ready();
  const slow = deferredFile();
  const reading = controller.importFile(slow);
  assert.equal(controller.state.reading, true);
  controller.chooseDay(DAY_60);
  assert.equal(controller.state.reading, false);
  slow.resolve(serializePacket(packetFor(DAY_45, 'identify')));
  await reading;
  assert.equal(controller.state.packet.source.dayId, DAY_60);
  assert.equal(controller.state.output, 'coach');
});

test('between two file reads only the newest wins, whatever order they finish in', async () => {
  const { controller } = ready();
  const older = deferredFile();
  const newer = deferredFile();
  const first = controller.importFile(older);
  const second = controller.importFile(newer);
  newer.resolve(serializePacket(packetFor(DAY_45)));
  await second;
  older.resolve(serializePacket(packetFor(DAY_60)));
  await first;
  assert.equal(controller.state.packet.source.dayId, DAY_45);
  assert.equal(controller.state.reading, false);
});

test('a newer sample load, paste, output change or save beats a pending read', async (t) => {
  const actions = {
    sample: (c) => c.loadSample(),
    paste: (c) => c.importText(JSON.stringify(practiceDoc())),
    output: (c) => c.chooseOutput('assignment'),
    save: (c) => c.save(),
  };
  for (const [name, action] of Object.entries(actions)) {
    await t.test(name, async () => {
      const { controller } = ready();
      controller.chooseDay(DAY_60);
      const slow = deferredFile();
      const reading = controller.importFile(slow);
      action(controller);
      const packet = controller.state.packet;
      slow.resolve(serializePacket(packetFor(DAY_45)));
      await reading;
      assert.equal(controller.state.packet, packet);
    });
  }
});

test('an interrupted read reports honestly and allows a retry', async () => {
  const { controller } = ready();
  controller.chooseDay(DAY_60);
  const { packet } = controller.state;
  const broken = deferredFile();
  const reading = controller.importFile(broken);
  broken.reject(named('NotReadableError'));
  await reading;
  assert.equal(controller.state.reading, false);
  assert.equal(controller.state.packet, packet);
  assert.equal(controller.state.notice.kind, 'error');
  assert.match(controller.state.notice.text, /could not be read/);
  await controller.importFile(fileWith(serializePacket(packetFor(DAY_45))));
  assert.equal(controller.state.packet.source.dayId, DAY_45);
});

test('a superseded read that later fails stays silent', async () => {
  const { controller } = ready();
  const broken = deferredFile();
  const reading = controller.importFile(broken);
  controller.chooseDay(DAY_60);
  const { notice } = controller.state;
  broken.reject(named('NotReadableError'));
  await reading;
  assert.equal(controller.state.notice, notice);
});

test('an oversized file is refused before reading', async () => {
  const { controller } = ready();
  let read = false;
  await controller.importFile({ size: 2_000_001, text: async () => { read = true; return ''; } });
  assert.equal(read, false);
  assert.equal(controller.state.notice.kind, 'error');
  assert.equal(controller.state.reading, false);
});

test('private sentinels in an import never reach stored or downloaded text', () => {
  const doc = practiceDoc();
  doc.participants = [{ name: 'SENTINEL_NAME' }];
  doc.records = [{ note: 'SENTINEL_RECORD' }];
  doc.clock = { note: 'SENTINEL_CLOCK' };
  const { controller, storage, downloads } = ready();
  controller.importText(JSON.stringify(doc));
  controller.chooseDay(DAY_60);
  controller.save();
  controller.exportPacket();
  assert.doesNotMatch(storage.entries.get(STORAGE_KEY), /SENTINEL/);
  assert.doesNotMatch(downloads[0].text, /SENTINEL/);
});
