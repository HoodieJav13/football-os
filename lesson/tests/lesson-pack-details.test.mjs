import assert from 'node:assert/strict';
import test from 'node:test';
import {createCover3Lesson} from '../src/cover3Lesson.js';
import {normalizePlay} from '../src/playData.js';
import {REGION_COLORS} from '../src/responsibilityArea.js';
import {createLessonPack,identifyDiagram,isLessonPackStale,lessonPackCards,lessonRevision,IDENTIFY_MARKER} from '../src/lessonPack.js';

const deepFreeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);Object.values(v).forEach(deepFreeze);}return v;};
const reverseKeys=v=>Array.isArray(v)?v.map(reverseKeys):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).reverse().map(([k,x])=>[k,reverseKeys(x)])):v;

test('derivation never mutates a deep-frozen source and repeated packs are equal',()=>{
 const source=deepFreeze(createCover3Lesson('frozen'));const before=structuredClone(source);
 const a=createLessonPack(source),b=createLessonPack(source);identifyDiagram(source,source.defenders[4].id);lessonRevision(source);isLessonPackStale(a,source);
 assert.deepEqual(a,b);assert.deepEqual(source,before);
 a.diagram.defenders[0].x=99;a.answers[0].center[0]=99;assert.deepEqual(source,before);
});

test('revision is invariant to nested key order, round trips and undefined values, and is not the schema marker',()=>{
 const source=createCover3Lesson('canon'),revision=lessonRevision(source);
 assert.equal(lessonRevision(reverseKeys(source)),revision);assert.equal(lessonRevision(JSON.parse(JSON.stringify(source))),revision);
 const extra=structuredClone(source);extra.assignments[0].definition.unused=undefined;assert.equal(lessonRevision(extra),revision);
 assert.equal(lessonRevision({...source,zoom:{factor:3},selectedAssignmentId:'x',layers:{},view:'side'}),revision);
 assert.match(revision,/^rev-[0-9a-f]{16}$/);assert.notEqual(revision,String(source.assignments[0].definition.responsibilityArea.version));
 const edits=[p=>p.personnel='11 Personnel',p=>p.family='Other',p=>p.players[0].x+=1,p=>p.players[0].label='Q2',p=>p.defenders[0].y+=1,p=>p.defenders.push({id:'extra',label:'N',x:0,y:4}),
  p=>p.assignments.pop(),p=>delete p.assignments[1].definition.responsibilityArea,p=>p.assignments[1].definition.responsibilityArea.center[1]+=1,p=>p.assignments[1].definition.responsibilityArea.radiusY+=1,
  p=>p.assignments[1].definition.landmark='Changed',p=>p.assignments[1].playerId=p.defenders[0].id,p=>{p.fieldSide=undefined;}];
 const seen=new Set([revision]);
 for(const edit of edits){const changed=structuredClone(source);edit(changed);const r=lessonRevision(changed);assert.notEqual(r,revision);seen.add(r);}
 assert.equal(seen.size,edits.length+1);
});

test('answers are verbatim, card-numbered by alignment, and every card is answered',()=>{
 const source=createCover3Lesson('order'),pack=createLessonPack(source);
 assert.deepEqual(pack.issues,[]);assert.deepEqual(pack.answers.map(a=>a.card),[1,2,3,4,5,6,7]);
 const xs=pack.answers.map(a=>source.defenders.find(d=>d.id===a.defenderId).x);assert.deepEqual(xs,[...xs].sort((a,b)=>a-b));
 for(const answer of pack.answers){
  const assignment=source.assignments.find(a=>a.id===answer.assignmentId),area=assignment.definition.responsibilityArea;
  assert.equal(assignment.playerId,answer.defenderId);assert.equal(answer.areaLabel,area.label);assert.equal(answer.color,area.color);assert.equal(answer.job,assignment.definition.area);
  assert.deepEqual([answer.center,answer.radiusX,answer.radiusY],[area.center,area.radiusX,area.radiusY]);assert.notEqual(answer.center,area.center);
 }
 assert.deepEqual(lessonPackCards(pack).map(c=>c.card),[1,2,3,4,5,6,7]);
});

test('honest issues: missing, no areas, dangling owner, multiple areas, duplicate labels',()=>{
 const missing=createCover3Lesson('m');delete missing.assignments[2].definition.responsibilityArea;
 const m=createLessonPack(missing);assert.deepEqual(m.issues.map(i=>i.code),['missing-area']);
 assert.equal(m.issues[0].defenderId,missing.assignments[2].playerId);assert.ok(!m.answers.some(a=>a.defenderId===missing.assignments[2].playerId));
 const none=createCover3Lesson('n');none.assignments.forEach(a=>delete a.definition.responsibilityArea);
 const n=createLessonPack(none);assert.equal(n.answers.length,0);assert.equal(n.issues[0].code,'no-areas');assert.equal(n.issues.filter(i=>i.code==='missing-area').length,7);
 const offense=createLessonPack({...createCover3Lesson('o'),assignments:[]});assert.deepEqual(offense.issues.map(i=>i.code),['no-areas']);
 const dangling=createCover3Lesson('d');dangling.defenders=dangling.defenders.filter(d=>d.id!==dangling.assignments[0].playerId);
 const d=createLessonPack(dangling);assert.equal(d.answers.length,6);assert.equal(d.issues[0].code,'dangling-owner');
 const multi=createCover3Lesson('x');multi.assignments[1].playerId=multi.assignments[0].playerId;
 const x=createLessonPack(multi);assert.equal(x.answers.length,7);assert.equal(lessonPackCards(x).length,6);assert.equal(x.issues[0].code,'multiple-areas');
 assert.equal(new Set(x.answers.filter(a=>a.defenderId===multi.assignments[0].playerId).map(a=>a.card)).size,1);
 const dup=createCover3Lesson('dup');dup.defenders[4].label='C';dup.defenders[5].label='C';dup.assignments[0].definition.responsibilityArea.label=dup.assignments[1].definition.responsibilityArea.label;
 const answers=createLessonPack(dup).answers;const cs=answers.filter(a=>a.defenderLabel==='C');
 assert.deepEqual(cs.map(a=>a.tag).sort(),['C·1','C·2']);assert.equal(new Set(cs.map(a=>a.assignmentId)).size,2);
 assert.equal(answers.find(a=>a.tag==='C·1').defenderId,dup.defenders[4].id);
});

test('Identify projection renders through normalizePlay with only the focus marker and no answer data',()=>{
 const source=createCover3Lesson('qsrc'),focus=source.assignments[3].playerId,identify=identifyDiagram(source,focus);
 const normalized=normalizePlay(structuredClone(identify));
 assert.equal(normalized.defenders.length,11);assert.equal(normalized.players.length,11);assert.deepEqual(normalized.assignments,[]);
 assert.deepEqual(identify.defenders.filter(d=>d.label).map(d=>d.label),[IDENTIFY_MARKER]);
 const marked=identify.defenders.find(d=>d.label===IDENTIFY_MARKER),owner=source.defenders.find(d=>d.id===focus);assert.deepEqual([marked.x,marked.y],[owner.x,owner.y]);
 for(const d of identify.defenders)assert.deepEqual(Object.keys(d).sort(),['id','label','x','y']);
 const json=JSON.stringify(identify).toLowerCase();
 const banned=[source.id,...source.defenders.map(d=>d.id),...source.assignments.flatMap(a=>[a.definition.area,a.definition.landmark,a.preset,a.definition.responsibilityArea.label,a.definition.responsibilityArea.color,REGION_COLORS[a.definition.responsibilityArea.color]]),'responsibility','cover 3','trips'];
 for(const token of banned)assert.ok(!json.includes(String(token).toLowerCase()),token);
 assert.deepEqual(identifyDiagram(source),identifyDiagram(reverseKeys(source)));
});

test('stale status follows content and identity, and explicit regeneration is current',()=>{
 const source=createCover3Lesson('stale'),pack=createLessonPack(source);
 assert.equal(isLessonPackStale(null,source),true);assert.equal(isLessonPackStale(pack,reverseKeys(source)),false);
 const edited=structuredClone(source);edited.defenders[5].x+=0.1;assert.equal(isLessonPackStale(pack,edited),true);
 assert.equal(isLessonPackStale(createLessonPack(edited),edited),false);
});
