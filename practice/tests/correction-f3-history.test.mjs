// F3 (independent review P2): malformed nested undo history is refused on
// import with a clear path, before anything is replaced; valid history keeps
// working through Undo, including older plan versions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, applyAction } from '../src/domain/clock.js';
import * as W from '../src/domain/week.js';
import { generateFixture } from '../src/domain/fixtures.js';
import { exportProject, importProject } from '../src/domain/project.js';
import { env, loadLibrary } from './helpers.mjs';

const S = 1000;
const lib = loadLibrary();

// A started practice with a varied history: start, pause, resume, extend, next, skip.
function practice() {
  const p = generateFixture({ seed: 42, scenario: 'example', library: lib });
  const mon = p.week.days[0];
  let c = createSession({ id: 'clk-f3', day: mon });
  for (const [type, mono, extra] of [['start', 0], ['pause', 10 * S], ['resume', 20 * S], ['extend', 21 * S, { sec: 60 }], ['next', 600 * S], ['skip', 700 * S]]) {
    const r = applyAction(c, { type, rev: c.rev, ...extra }, env(mono));
    assert.equal(r.ok, true, r.error);
    c = r.session;
  }
  return { p, c, doc: JSON.parse(exportProject(p, c)) };
}

const refuse = (doc, pathRe, msgRe) => {
  const text = JSON.stringify(doc);
  let r;
  assert.doesNotThrow(() => { r = importProject(text); });
  assert.equal(r.ok, false, `accepted: ${pathRe}`);
  assert.ok(r.errors.some((e) => pathRe.test(e.path) && (!msgRe || msgRe.test(e.message))), `no error at ${pathRe} ${msgRe || ''}: ${JSON.stringify(r.errors.slice(0, 4))}`);
  return r;
};

test('exact review case: history[0].before.steps = [null] is refused with a path', () => {
  const { doc } = practice();
  doc.clock.history[0].before.steps = [null];
  refuse(doc, /^clock\.history\[0\]\.before\.steps\[0\]$/, /object/i);
});

test('non-object steps and malformed period-id arrays in history are refused', () => {
  const cases = [
    [(h) => { h.before.steps[0] = 7; }, /before\.steps\[0\]$/],
    [(h) => { h.before.steps[0] = 'x'; }, /before\.steps\[0\]$/],
    [(h) => { delete h.before.steps[0].periodIds; }, /before\.steps\[0\]\.periodIds$/],
    [(h) => { h.before.steps[0].periodIds = 'per-a'; }, /before\.steps\[0\]\.periodIds$/],
    [(h) => { h.before.steps[0].periodIds = []; }, /before\.steps\[0\]\.periodIds$/],
    [(h) => { h.before.steps[0].periodIds = [null]; }, /before\.steps\[0\]\.periodIds$/],
    [(h) => { h.before.steps[0].periodIds = ['']; }, /before\.steps\[0\]\.periodIds$/],
  ];
  for (const [mutate, re] of cases) {
    const { doc } = practice();
    mutate(doc.clock.history[1]);
    refuse(doc, re);
  }
});

test('duplicate and cross-day period references in history are refused', () => {
  let { doc } = practice();
  doc.clock.history[1].before.steps[1].periodIds = doc.clock.history[1].before.steps[0].periodIds.slice();
  refuse(doc, /history\[1\]\.before\.steps\[1\]\.periodIds$/, /more than once/i);
  ({ doc } = practice());
  doc.clock.history[1].before.steps[0].periodIds = [doc.week.days[3].periods[0].id];
  refuse(doc, /history\[1\]\.before\.steps\[0\]\.periodIds$/, /another day/i);
});

test('invalid step fields, status, duration and index in history are refused', () => {
  const cases = [
    [(b) => { b.steps[0].plannedSec = -60; }, /plannedSec$/],
    [(b) => { b.steps[0].plannedSec = 1.5; }, /plannedSec$/],
    [(b) => { b.steps[0].extensionSec = 'x'; }, /extensionSec$/],
    [(b) => { b.steps[0].elapsedMs = -1; }, /elapsedMs$/],
    [(b) => { b.steps[0].elapsedMs = null; }, /elapsedMs$/],
    [(b) => { b.steps[0].title = 5; }, /title$/],
    [(b) => { b.steps[0].status = 'exploded'; }, /status$/],
    [(b) => { b.steps[0].endedBy = 'teleport'; }, /endedBy$/],
    [(b) => { b.index = 99; }, /before\.index$/],
    [(b) => { b.index = -1; }, /before\.index$/],
    [(b) => { b.index = 0.5; }, /before\.index$/],
    [(b) => { b.dayVersion = 0; }, /before\.dayVersion$/],
  ];
  for (const [mutate, re] of cases) {
    const { doc } = practice();
    mutate(doc.clock.history[2].before);
    refuse(doc, re);
  }
});

test('invalid nested history state is refused (state, and state vs. step statuses)', () => {
  const cases = [
    [(b) => { b.state = 'flying'; }, /before\.state$/],
    [(b) => { b.state = 'idle'; }, /before/, /idle/i], // running snapshot relabelled idle: an active step contradicts it
    [(b) => { b.steps[b.index].status = 'pending'; }, /before/, /active/i],
    [(b) => { b.steps[b.steps.length - 1].status = 'done'; b.steps[b.steps.length - 1].endedBy = 'next'; }, /before/, /pending/i],
  ];
  for (const [mutate, re, msg] of cases) {
    const { doc } = practice();
    mutate(doc.clock.history[3].before);
    refuse(doc, re, msg);
  }
});

test('malformed history entry wrappers are refused', () => {
  const cases = [
    [(h) => { h.type = 'teleport'; }, /history\[0\]\.type$/],
    [(h) => { delete h.at; }, /history\[0\]\.at$/],
    [(h) => { h.at.mono = 'soon'; }, /history\[0\]\.at$/],
    [(h) => { h.wasRunning = 'yes'; }, /history\[0\]\.wasRunning$/],
    [(h) => { h.wasRunning = !h.wasRunning; }, /history\[0\]\.wasRunning$/],
    [(h) => { h.before = null; }, /history\[0\]\.before$/],
  ];
  for (const [mutate, re] of cases) {
    const { doc } = practice();
    mutate(doc.clock.history[0]);
    refuse(doc, re);
  }
});

test('the current clock state follows the same invariants', () => {
  let { doc } = practice();
  doc.clock.steps[0] = null;
  refuse(doc, /^clock\.steps\[0\]$/);
  ({ doc } = practice());
  doc.clock.steps[1].periodIds = doc.clock.steps[0].periodIds.slice();
  refuse(doc, /^clock\.steps\[1\]\.periodIds$/, /more than once/i);
  ({ doc } = practice());
  doc.clock.steps[doc.clock.index].status = 'done';
  doc.clock.steps[doc.clock.index].endedBy = 'next';
  refuse(doc, /^clock/, /active/i);
});

test('refusal is pure: the import input is not mutated', () => {
  const { doc } = practice();
  doc.clock.history[0].before.steps = [null];
  const text = JSON.stringify(doc);
  const copy = text.slice();
  importProject(text);
  assert.equal(text, copy);
});

test('valid exports keep round-tripping, and every undo step works after import', () => {
  const { p, c } = practice();
  const r = importProject(exportProject(p, c));
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  let s = r.clock;
  const n = s.history.length;
  for (let i = 0; i < n; i++) {
    const u = applyAction(s, { type: 'undo', rev: s.rev }, env(800 * S + i, { instanceId: 'inst-Z' }));
    assert.equal(u.ok, true, u.error);
    s = u.session;
  }
  assert.equal(s.state, 'idle');
});

test('an older plan snapshot naming a since-deleted period stays importable and undoable', () => {
  const { p, c } = practice();
  const mon = p.week.days[0];
  // Reset rebuilds from a day where the first period was deleted; history keeps the old script.
  const week = W.deletePeriod(p.week, mon.id, mon.periods[0].id);
  const reset = applyAction(c, { type: 'reset', rev: c.rev, day: week.days[0] }, env(800 * S));
  assert.equal(reset.ok, true, reset.error);
  const proj = { ...p, week };
  const r = importProject(exportProject(proj, reset.session));
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const u = applyAction(r.clock, { type: 'undo', rev: r.clock.rev }, env(801 * S, { instanceId: 'inst-Z' }));
  assert.equal(u.ok, true, u.error);
  assert.equal(u.session.steps[0].periodIds[0], mon.periods[0].id, 'the restored older script still names the deleted period');
});

test('history saved before dayVersion was recorded in snapshots still imports and undoes', () => {
  const { doc } = practice();
  for (const h of doc.clock.history) delete h.before.dayVersion;
  const r = importProject(JSON.stringify(doc));
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const u = applyAction(r.clock, { type: 'undo', rev: r.clock.rev }, env(900 * S, { instanceId: 'inst-Z' }));
  assert.equal(u.ok, true);
  assert.equal(u.session.dayVersion, r.clock.dayVersion);
});

test('undo never throws on a damaged in-memory snapshot; it refuses and changes nothing', () => {
  const { c } = practice();
  const damaged = structuredClone(c);
  damaged.history[damaged.history.length - 1].before.steps = [null];
  let r;
  assert.doesNotThrow(() => { r = applyAction(damaged, { type: 'undo', rev: damaged.rev }, env(900 * S)); });
  assert.equal(r.ok, false);
  assert.match(r.error, /damaged/i);
});
