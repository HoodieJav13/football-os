import assert from 'node:assert/strict';
import test from 'node:test';
import { createCover3Lesson } from '../src/cover3Lesson.js';
import { existsSync } from 'node:fs';

const modulePath = new URL('../src/lessonPack.js', import.meta.url);
test('lesson pack module exists for the approved author-once workflow', () => assert.ok(existsSync(modulePath), 'lessonPack.js is not implemented yet'));
const api = existsSync(modulePath) ? await import(modulePath) : {};
const ready = () => { for (const name of ['lessonRevision','createLessonPack','isLessonPackStale','identifyDiagram']) assert.equal(typeof api[name], 'function', `${name} is required`); };

test('one source yields an independent pack and answers linked by stable defender identity', () => {
  ready(); const source = createCover3Lesson('pack-source'); const before = structuredClone(source);
  const pack = api.createLessonPack(source);
  assert.equal(pack.sourcePlayId, source.id); assert.equal(pack.revision, api.lessonRevision(source));
  assert.deepEqual(pack.diagram, source); assert.notEqual(pack.diagram, source);
  assert.equal(pack.answers.length, 7); assert.equal(new Set(pack.answers.map(a => a.defenderId)).size, 7);
  for (const answer of pack.answers) assert.ok(source.defenders.some(d => d.id === answer.defenderId));
  source.assignments[0].definition.responsibilityArea.label = 'Revised authored label';
  assert.deepEqual(pack.diagram, before); assert.equal(api.isLessonPackStale(pack, source), true);
  assert.equal(api.isLessonPackStale(pack, before), false);
});

test('revision is canonical and covers each teachable change while ignoring camera and selection', () => {
  ready(); const source = createCover3Lesson('revision-source'); const revision = api.lessonRevision(source);
  const reordered = Object.fromEntries(Object.entries(source).reverse()); assert.equal(api.lessonRevision(reordered), revision);
  assert.equal(api.lessonRevision({...source,camera:{factor:2},selectedPlayerId:'other'}), revision);
  for (const edit of [p=>p.name+=' edit',p=>p.formation+=' edit',p=>p.fieldSide='left',p=>p.defenders[4].x+=1,p=>p.defenders[4].label='NEW',p=>p.assignments[0].points[1][0]+=1,p=>p.assignments[0].definition.area='deep-half',p=>p.assignments[0].definition.responsibilityArea.radiusX+=1,p=>p.assignments[0].definition.responsibilityArea.label+=' edit',p=>p.assignments[0].definition.responsibilityArea.color='teal']) {
    const changed=structuredClone(source);edit(changed);assert.notEqual(api.lessonRevision(changed),revision);
  }
});

test('Identify is an answer-free data projection including names, labels, ids and metadata', () => {
  ready(); const source=createCover3Lesson('ANSWER_SENTINEL');source.name='ANSWER_SENTINEL';source.formation='ANSWER_SENTINEL';source.family='ANSWER_SENTINEL';
  source.defenders[4].label='ANSWER_SENTINEL';source.assignments[0].definition.responsibilityArea.label='ANSWER_SENTINEL';
  const before=structuredClone(source);const identify=api.identifyDiagram(source);
  assert.deepEqual(identify.assignments,[]);assert.equal(identify.defenders.length,11);assert.equal(identify.players.length,11);
  assert.ok(!JSON.stringify(identify).includes('ANSWER_SENTINEL'));assert.ok(!JSON.stringify(identify).includes('responsibilityArea'));
  assert.deepEqual(source,before);
});

test('missing areas are reported without invented answers and duplicate labels retain distinct owners', () => {
  ready();const source=createCover3Lesson('missing-source');delete source.assignments[0].definition.responsibilityArea;
  const pack=api.createLessonPack(source);assert.ok(pack.issues.length>0);assert.equal(pack.answers.length,6);
  const duplicate=createCover3Lesson('duplicate-source');duplicate.defenders[4].label='C';duplicate.defenders[5].label='C';
  const answers=api.createLessonPack(duplicate).answers;assert.equal(answers.length,7);assert.equal(new Set(answers.map(a=>a.defenderId)).size,7);
  const changedId={...duplicate,id:'other-play'};assert.equal(api.isLessonPackStale(api.createLessonPack(duplicate),changedId),true);
});
