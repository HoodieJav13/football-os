// Integration: fixture -> plan edits -> rotation -> clock run -> export/import.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateFixture } from '../src/domain/fixtures.js';
import * as W from '../src/domain/week.js';
import { generateRotation, assignManual, setLock, validateRotation } from '../src/domain/rotation.js';
import { createSession, applyAction, deriveView, serializeSession, recoverSession } from '../src/domain/clock.js';
import { exportProject, importProject, validateProject } from '../src/domain/project.js';
import { createHistory, pushHistory, undoHistory } from '../src/domain/history.js';
import { createIdFactory } from '../src/domain/ids.js';
import { loadLibrary, env } from './helpers.mjs';

const lib = loadLibrary();

test('coach journey end to end on the example week', () => {
  const ids = createIdFactory({ seed: 5 });
  let p = generateFixture({ seed: 42, scenario: 'example', library: lib });
  const tue = p.week.days[1];

  // Plan: duplicate, rename, reorder.
  const dup = W.duplicatePeriod(p.week, tue.id, tue.periods[2].id, ids);
  p = { ...p, week: W.updatePeriod(dup.week, tue.id, dup.id, { title: 'Second look — copy edited' }) };
  p = { ...p, week: W.movePeriod(p.week, tue.id, dup.id, -1) };
  const day = p.week.days[1];
  assert.equal(day.periods[2].id, dup.id);
  assert.deepEqual(validateProject(p).errors, []);

  // Rotation: generate, manual change, lock, regenerate.
  const ctx = { day, groups: p.groups, participants: p.participants };
  let rot = generateRotation({ ...ctx, seed: 21 });
  const entry = rot.entries.find((e) => e.slots.some((s) => s.participantId));
  const slot = entry.slots.find((s) => s.participantId);
  rot = setLock({ ...ctx, rotation: rot, periodId: entry.periodId, groupId: entry.groupId, slotId: slot.slotId, locked: true }).rotation;
  rot = generateRotation({ ...ctx, previous: rot, seed: 22 });
  const kept = rot.entries.find((e) => e.periodId === entry.periodId && e.groupId === entry.groupId).slots.find((s) => s.slotId === slot.slotId);
  assert.equal(kept.participantId, slot.participantId);
  assert.equal(kept.locked, true);
  p = { ...p, rotations: { ...p.rotations, [day.id]: rot } };
  const v = validateRotation({ ...ctx, rotation: rot });
  assert.equal(v.warnings.filter((w) => w.type === 'conflict').length, 0);

  // Clock: run the whole day with a fake clock.
  let c = createSession({ id: 'clk-int', day });
  let mono = 0;
  const go = (type, extra) => {
    const r = applyAction(c, { type, rev: c.rev, ...extra }, env(mono));
    assert.equal(r.ok, true, `${type}: ${r.error}`);
    c = r.session;
  };
  go('start');
  for (let i = 0; i < c.steps.length; i++) {
    mono += c.steps[i].plannedSec * 1000;
    if (i === 1) go('extend', { sec: 60 });
    if (i === 2) { go('pause'); mono += 30_000; go('resume'); }
    if (c.state !== 'completed') go(i === 3 ? 'skip' : 'next');
  }
  assert.equal(c.state, 'completed');
  assert.equal(c.steps.filter((s) => s.status === 'skipped').length, 1);
  assert.equal(c.rev, c.history.length);

  // Export / import round trip keeps everything.
  const text = exportProject(p, c);
  const r = importProject(text);
  assert.equal(r.ok, true);
  assert.deepEqual(r.project, p);
  assert.deepEqual(deriveView(r.clock, env(mono)), deriveView(c, env(mono)));
});

test('mid-practice reload and import restore the same clock state', () => {
  const p = generateFixture({ seed: 1, scenario: 'normal', library: lib });
  let c = createSession({ id: 'clk-2', day: p.week.days[0] });
  c = applyAction(c, { type: 'start', rev: c.rev }, env(0)).session;
  c = applyAction(c, { type: 'next', rev: c.rev }, env(120_000)).session;
  const text = exportProject(p, serializeSession(c, env(150_000)));
  const r = importProject(text);
  const { session } = recoverSession(r.clock, env(10, { instanceId: 'inst-Z' }));
  assert.equal(session.state, 'paused');
  assert.equal(session.index, 1);
  assert.equal(deriveView(session, env(10, { instanceId: 'inst-Z' })).current.elapsedMs, 30_000);
});

test('undo history restores a destructive edit and is bounded', () => {
  const p = generateFixture({ seed: 1, scenario: 'normal', library: lib });
  let h = createHistory(3);
  const d = p.week.days[0];
  h = pushHistory(h, p, 'Delete period');
  const after = { ...p, week: W.deletePeriod(p.week, d.id, d.periods[0].id) };
  const u = undoHistory(h);
  assert.equal(u.label, 'Delete period');
  assert.deepEqual(u.snapshot, p);
  assert.notDeepEqual(u.snapshot, after);
  for (let i = 0; i < 5; i++) h = pushHistory(h, { n: i }, `e${i}`);
  assert.equal(h.entries.length, 3);
  assert.equal(undoHistory(createHistory(3)), null);
});
