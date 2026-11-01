import assert from 'node:assert/strict';
import test from 'node:test';
import { createCover3Lesson } from '../src/cover3Lesson.js';
import { fieldProjection, playBounds } from '../src/fieldView.js';
import * as lesson from '../src/lessonPack.js';

test('pack generation keeps the existing fallback when structuredClone is unavailable', () => {
  const source = createCover3Lesson('old-ipad');
  const original = globalThis.structuredClone;
  try {
    globalThis.structuredClone = undefined;
    const pack = lesson.createLessonPack(source);
    assert.equal(pack.answers.length, 7);
    assert.notEqual(pack.diagram, source);
  } finally { globalThis.structuredClone = original; }
});

test('Identify preserves neutral canonical positions and removes authored offensive job labels', () => {
  const source = createCover3Lesson('authored-words');
  const xIndex = source.players.findIndex(p => p.label === 'X');
  source.players.filter(p => p.label !== 'X').slice(0, 3).forEach((p, i) => { p.label = ['HOOK','FLAT','DEEP'][i]; });
  const projected = lesson.identifyDiagram(source);
  assert.equal(projected.players[xIndex].label, 'X');
  for (const answer of ['HOOK','FLAT','DEEP']) assert.ok(!JSON.stringify(projected).includes(answer), answer);
});

test('removing an entire assignment explicitly lists its newly unanswered defender without inventing an answer', () => {
  const source = createCover3Lesson('removed-job');
  const previous = lesson.createLessonPack(source);
  const removed = source.assignments.shift();
  const revised = lesson.createLessonPack(source);
  assert.ok(Array.isArray(previous.unansweredDefenders));
  assert.equal(revised.unansweredDefenders.length, previous.unansweredDefenders.length + 1);
  assert.ok(revised.unansweredDefenders.some(d => d.defenderId === removed.playerId));
  assert.ok(!revised.answers.some(a => a.defenderId === removed.playerId));
});

test('the assignment-sheet renderer omits invalid areas while preserving the exact snapshot and notice', () => {
  const source = createCover3Lesson('invalid-sheet'); source.assignments[0].definition.responsibilityArea = null;
  const pack = lesson.createLessonPack(source);
  assert.ok(pack.issues.some(i => i.code === 'invalid-area'));
  assert.equal(typeof lesson.lessonSheetDiagram, 'function');
  const safe = lesson.lessonSheetDiagram(pack);
  assert.doesNotThrow(() => playBounds(safe));
  assert.equal(pack.diagram.assignments[0].definition.responsibilityArea, null);
  assert.equal(safe.assignments[0].definition.responsibilityArea, undefined);
});

test('the blank Identify look retains room for the complete authored response area', () => {
  const pack=lesson.createLessonPack(createCover3Lesson('framing'));
  const bounds=playBounds(lesson.lessonSheetDiagram(pack));
  for (const view of ['end','side']) {
    const projection=fieldProjection({width:1000,height:500,view,play:lesson.identifyDiagram(pack.diagram),framePlay:true,framingBounds:bounds});
    assert.ok(projection.depthRange[1]>=bounds.maxY,'blank card clips the deep responsibility space');
    assert.ok(projection.depthRange[0]<=bounds.minY);
  }
});
