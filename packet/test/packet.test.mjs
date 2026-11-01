import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clone } from '../public/src/common.js';
import {
  PACKET_SCHEMA, PACKET_VERSION, createPacket, packetFilename, readImport, readPracticeDocument,
  serializePacket, validatePacket, withOutput,
} from '../public/src/packet.js';
import { STORAGE_KEY } from '../public/src/storage.js';
import { DAY_45, DAY_60, intake, packetFor, practiceDoc } from './helpers.mjs';

const rejects = (fn, pattern) => assert.throws(fn, (error) => error.name === 'PacketError' && pattern.test(error.message));

test('two selected days produce exactly their own schedules', () => {
  const a = packetFor(DAY_60);
  const b = packetFor(DAY_45);
  const doc = practiceDoc();
  assert.deepEqual(a.schedule.items.map((item) => item.periodId), doc.week.days[0].periods.map((period) => period.id));
  assert.deepEqual(b.schedule.items.map((item) => item.periodId), doc.week.days[1].periods.map((period) => period.id));
  assert.equal(a.source.dayId, DAY_60);
  assert.equal(b.source.dayId, DAY_45);
  const ids = new Set(a.schedule.items.map((item) => item.periodId));
  assert.ok(b.schedule.items.every((item) => !ids.has(item.periodId)));
});

test('the 60 minute station plan keeps parallel blocks and source timings', () => {
  const { schedule, day } = packetFor(DAY_60);
  assert.equal(schedule.totalMin, 60);
  assert.equal(schedule.plannedMin, 60);
  assert.equal(schedule.endMin, 990);
  assert.equal(schedule.items.length, 12);
  assert.equal(schedule.items.filter((item) => item.parallel).length, 6);
  assert.equal(new Set(schedule.items.map((item) => item.block)).size, 6);
  assert.deepEqual(schedule.warnings, []);
  const summed = day.periods.reduce((sum, period) => sum + period.minutes, 0);
  assert.equal(summed, 126, 'station minutes must not be summed into the day length');
  const at = (id) => schedule.items.find((item) => item.periodId === id);
  assert.equal(at('per-6amb1xfn7d').startMin, 939);
  assert.equal(at('per-a8ux24ruk5').startMin, 939);
  assert.equal(at('per-6insf5ltg2').endMin, 950);
  assert.equal(at('per-0l76ocujpp').startMin, 950);
});

test('the 45 minute alternative stays separate and sequential', () => {
  const { schedule, drills } = packetFor(DAY_45);
  assert.equal(schedule.totalMin, 45);
  assert.equal(schedule.items.length, 5);
  assert.equal(schedule.items.filter((item) => item.parallel).length, 0);
  assert.deepEqual(drills.map((drill) => drill.id), ['drill-formation-flash', 'drill-align-walk', 'drill-situations']);
});

test('only drills referenced by the selected day travel with it', () => {
  assert.deepEqual(packetFor(DAY_60).drills.map((drill) => drill.id),
    ['drill-zone-drops', 'drill-rush-lanes', 'drill-pattern-read', 'drill-situations']);
});

test('fixed starts, the shelf, warnings and notes are preserved', () => {
  const doc = practiceDoc();
  const day = doc.week.days[1];
  day.plannedMinutes = 20;
  day.periods[1].fixedStart = 933;
  day.periods[4].scheduled = false;
  const packet = createPacket({ intake: readPracticeDocument(doc), dayId: DAY_45 });
  assert.deepEqual(packet.schedule.unscheduled, [day.periods[4].id]);
  assert.equal(packet.schedule.items[1].overlapMin, 4);
  assert.deepEqual(packet.schedule.warnings.map((warning) => warning.type).sort(), ['over-duration', 'overlap']);
  assert.equal(packet.day.notes, day.notes);
  assert.equal(packet.day.periods[1].fixedStart, 933);
  assert.equal(validatePacket(clone(packet)).schedule.warnings.length, 2);
});

test('a shared scout group keeps its overlap warning through a roundtrip', () => {
  const doc = practiceDoc();
  const { periods } = doc.week.days[0];
  periods[1].groupIds = ['grp-a'];
  periods[2].groupIds = ['grp-a'];
  const packet = createPacket({ intake: readPracticeDocument(doc), dayId: DAY_60 });
  assert.deepEqual(packet.schedule.warnings.map((warning) => warning.type), ['group-overlap']);
  assert.deepEqual(validatePacket(clone(packet)).schedule, packet.schedule);
});

test('day selection is explicit, with no first or last day fallback', () => {
  rejects(() => createPacket({ intake: intake(), dayId: undefined }), /Choose a practice day/);
  rejects(() => createPacket({ intake: intake(), dayId: '' }), /Choose a practice day/);
  rejects(() => createPacket({ intake: intake(), dayId: 'day-unknown' }), /not in this import/);
  rejects(() => createPacket({ intake: null, dayId: DAY_60 }), /Import Practice/);
});

test('bad Practice documents fail', async (t) => {
  const cases = {
    'wrong schema': [(d) => { d.schema = 'other'; }, /neither a Practice export nor a session packet/],
    'bad version': [(d) => { d.schemaVersion = 2; }, /not supported/],
    'nonfictional': [(d) => { d.project.fictional = false; }, /marked fictional/],
    'missing fictional': [(d) => { delete d.project.fictional; }, /marked fictional/],
    'truthy fictional': [(d) => { d.project.fictional = 'true'; }, /marked fictional/],
    'no days': [(d) => { d.week.days = []; }, /no practice days/],
    'missing day id': [(d) => { delete d.week.days[0].id; }, /day id/],
    'duplicate day id': [(d) => { d.week.days[1].id = d.week.days[0].id; }, /more than once/],
    'missing period id': [(d) => { d.week.days[0].periods[0].id = ''; }, /period id/],
    'duplicate period id': [(d) => { d.week.days[1].periods[0].id = d.week.days[0].periods[0].id; }, /more than once/],
    'bad day version': [(d) => { d.week.days[0].version = 0; }, /version/],
    'bad week version': [(d) => { d.week.version = 'three'; }, /week version/],
    'bad minutes': [(d) => { d.week.days[0].periods[0].minutes = 0; }, /Duration/],
    'duplicate drill id': [(d) => { d.drills[1].id = d.drills[0].id; }, /more than once/],
    'missing drills': [(d) => { delete d.drills; }, /drill list/],
  };
  for (const [name, [change, pattern]] of Object.entries(cases)) {
    await t.test(name, () => {
      const doc = practiceDoc();
      change(doc);
      rejects(() => readImport(JSON.stringify(doc)), pattern);
    });
  }
});

test('a day with a dangling drill fails only when selected', () => {
  const doc = practiceDoc();
  doc.week.days[0].periods[1].drillId = 'drill-gone';
  const data = readPracticeDocument(doc);
  rejects(() => createPacket({ intake: data, dayId: DAY_60 }), /references a drill/);
  assert.equal(createPacket({ intake: data, dayId: DAY_45 }).source.dayId, DAY_45);
});

test('malformed text is rejected with a safe message', () => {
  rejects(() => readImport(''), /nothing to import/);
  rejects(() => readImport('{not json'), /not valid JSON/);
  rejects(() => readImport('[]'), /neither/);
  rejects(() => readImport('{"schema":"unknown"}'), /neither/);
  rejects(() => readImport('null'), /neither/);
  rejects(() => readImport(' '.repeat(10) + 'x'.repeat(2_000_001)), /too large/);
});

test('a byte order mark does not block an import', () => {
  assert.equal(readImport(`﻿${JSON.stringify(practiceDoc())}`).kind, 'practice');
});

test('packet roundtrip preserves selection, content and revision byte for byte', () => {
  for (const output of ['coach', 'assignment', 'identify']) {
    const packet = packetFor(DAY_45, output);
    const text = serializePacket(packet);
    const reopened = readImport(text);
    assert.equal(reopened.kind, 'packet');
    assert.equal(serializePacket(reopened.packet), text);
    assert.equal(reopened.packet.output, output);
    assert.equal(reopened.packet.source.dayId, DAY_45);
    assert.equal(reopened.packet.cover3.pack.revision, 'rev-3f2f578330f6335e');
  }
});

test('a packet states its schema, version, fictional flag and source versions', () => {
  const packet = packetFor(DAY_60);
  assert.equal(packet.schema, PACKET_SCHEMA);
  assert.equal(packet.schemaVersion, PACKET_VERSION);
  assert.equal(packet.fictional, true);
  assert.deepEqual(packet.source, {
    exportSchema: 'practice-week-planner.project',
    exportSchemaVersion: 1,
    projectId: 'prj-lguo6i9mvh',
    projectName: 'Practice Week Planner — FICTIONAL example',
    projectRev: 0,
    timezone: 'America/Chicago',
    weekId: 'wk-8vqb7iol0g',
    weekVersion: 3,
    dayId: DAY_60,
    dayVersion: 1,
  });
});

test('bad packets fail', async (t) => {
  const cases = {
    'bad version': [(p) => { p.schemaVersion = 2; }, /not supported/],
    'nonfictional': [(p) => { p.fictional = false; }, /marked fictional/],
    'unknown output': [(p) => { p.output = 'learner-key'; }, /output/],
    'missing source': [(p) => { delete p.source; }, /source record/],
    'other day id in source': [(p) => { p.source.dayId = DAY_45; }, /does not match/],
    'other day version in source': [(p) => { p.source.dayVersion = 9; }, /does not match/],
    'edited schedule': [(p) => { p.schedule.totalMin = 5; }, /schedule does not match/],
    'edited period length': [(p) => { p.day.periods[0].minutes += 1; }, /schedule does not match/],
    'missing referenced drill': [(p) => { p.drills.pop(); }, /references a drill/],
    'missing teaching snapshot': [(p) => { delete p.cover3; }, /bundled authored example/],
  };
  for (const [name, [change, pattern]] of Object.entries(cases)) {
    await t.test(name, () => {
      const packet = clone(packetFor(DAY_60));
      change(packet);
      rejects(() => readImport(JSON.stringify(packet)), pattern);
    });
  }
});

test('source values are not mutated and results share nothing with them', () => {
  const doc = practiceDoc();
  const before = JSON.stringify(doc);
  const data = readPracticeDocument(doc);
  const packet = createPacket({ intake: data, dayId: DAY_60 });
  assert.equal(JSON.stringify(doc), before);
  packet.day.periods[0].equipment.push('changed');
  packet.drills[0].steps.push('changed');
  doc.week.days[0].periods[1].equipment.push('changed');
  assert.equal(data.days[0].periods[0].equipment.length, 0);
  assert.equal(data.days[0].periods[1].equipment.length, 2);
  assert.equal(createPacket({ intake: data, dayId: DAY_60 }).drills[0].steps.length, 3);
});

function sentinelDoc() {
  const doc = practiceDoc();
  doc.participants = [{ id: 'p1', name: 'SENTINEL_NAME', email: 'SENTINEL_EMAIL' }];
  doc.groups = [{ id: 'g1', name: 'SENTINEL_GROUP' }];
  doc.records = [{ note: 'SENTINEL_RECORD' }];
  doc.clock = { startedAt: 'SENTINEL_CLOCK' };
  doc.rotations = { r: 'SENTINEL_ROTATION' };
  doc.cards = [{ id: 'c1', title: 'SENTINEL_CARD' }];
  doc.templates = [{ id: 't1', label: 'SENTINEL_TEMPLATE' }];
  doc.topLevelExtra = 'SENTINEL_TOP';
  doc.project.seedNote = 'SENTINEL_PROJECT';
  doc.week.notes = 'SENTINEL_WEEK_NOTE';
  doc.week.opponentLabel = 'SENTINEL_OPPONENT';
  doc.week.days[0].extra = 'SENTINEL_DAY';
  doc.week.days[1].notes = 'SENTINEL_OTHER_DAY';
  doc.week.days[0].periods[0].extra = 'SENTINEL_PERIOD';
  doc.week.days[0].periods[0].cardIds = ['SENTINEL_CARD_ID'];
  doc.drills[2].extra = 'SENTINEL_DRILL';
  doc.drills.push({ id: 'drill-unused', title: 'SENTINEL_UNUSED_DRILL', steps: [] });
  return doc;
}

test('private sentinels never reach intake output, packets or saved text', () => {
  const data = readPracticeDocument(sentinelDoc());
  const packet = createPacket({ intake: data, dayId: DAY_60 });
  assert.doesNotMatch(serializePacket(packet), /SENTINEL/);
  const intakeText = JSON.stringify({ source: data.source, day: data.days[0] });
  assert.doesNotMatch(intakeText, /SENTINEL/);
  for (const key of ['participants', 'groups', 'records', 'clock', 'rotations', 'cards', 'templates']) {
    assert.equal(Object.hasOwn(packet, key), false);
  }
});

test('extra keys smuggled into a packet are dropped on import', () => {
  const packet = clone(packetFor(DAY_60));
  packet.participants = [{ name: 'SENTINEL_NAME' }];
  packet.source.extra = 'SENTINEL_SOURCE';
  packet.day.extra = 'SENTINEL_DAY';
  packet.day.periods[0].extra = 'SENTINEL_PERIOD';
  packet.drills[0].extra = 'SENTINEL_DRILL';
  packet.drills.push({ id: 'drill-unused', title: 'SENTINEL_UNUSED' });
  packet.cover3.extra = 'SENTINEL_COVER3';
  packet.cover3.pack.diagram.players[0].extra = 'SENTINEL_PLAYER';
  const reopened = readImport(JSON.stringify(packet));
  assert.doesNotMatch(serializePacket(reopened.packet), /SENTINEL/);
});

test('hostile keys cannot pollute prototypes', () => {
  const text = JSON.stringify(practiceDoc()).replace('"schemaVersion":1', '"__proto__":{"polluted":true},"schemaVersion":1');
  assert.equal(readImport(text).kind, 'practice');
  assert.equal({}.polluted, undefined);
});

test('repeating create and serialize gives identical bytes with no duplicated content', () => {
  const data = intake();
  const first = createPacket({ intake: data, dayId: DAY_60 });
  let text = serializePacket(first);
  for (let i = 0; i < 5; i += 1) {
    const next = createPacket({ intake: data, dayId: DAY_60 });
    assert.equal(serializePacket(next), text);
    text = serializePacket(validatePacket(JSON.parse(text)));
  }
  const reread = JSON.parse(text);
  assert.equal(reread.day.periods.length, 12);
  assert.equal(reread.drills.length, 4);
  assert.equal(reread.cover3.pack.answers.length, 7);
});

test('changing output changes nothing else and leaves the original intact', () => {
  const packet = packetFor(DAY_60);
  const changed = withOutput(packet, 'identify');
  assert.equal(packet.output, 'coach');
  assert.deepEqual({ ...changed, output: 'coach' }, packet);
  rejects(() => withOutput(packet, 'nope'), /Unknown output/);
});

test('export filename marks coach material and carries no source id', () => {
  const name = packetFilename(packetFor(DAY_60));
  assert.equal(name, 'session-packet-pilot-coverage-rush-coach-material.json');
});

test('the storage key belongs to the companion, not a source app', () => {
  assert.match(STORAGE_KEY, /^coaching-session-packet:/);
  assert.equal(STORAGE_KEY.startsWith('pwp:'), false);
});
