import assert from 'node:assert/strict';
import test from 'node:test';
import {basePlayers,copyAssignmentForPlayer,mirrorAssignmentPath,createConceptTemplate,applyConceptTemplateToPlay,applyFormationToPlay,normalizePlay} from '../src/playData.js';
const fixture=()=>({id:'operations',name:'Area operations',players:structuredClone(basePlayers),defenders:[{id:'left-c',label:'C',x:-19,y:8},{id:'right-c',label:'C',x:19,y:8}],assignments:[{id:'source-zone',playerId:'left-c',unit:'defense',phase:'post',type:'Zone',points:[[-19,8],[-18,26]],pace:1,delay:0,definition:{area:'deep-third',landmark:'',responsibilityArea:{version:1,shape:'ellipse',center:[-18,26],radiusX:8,radiusY:11,label:'Deep left',color:'blue'}}}]});
test('copy keeps independent region coordinates while translating only path points',()=>{
 const p=fixture(),before=structuredClone(p),a=p.assignments[0];
 const copy=copyAssignmentForPlayer(p,a.id,'right-c','copied-zone');
 assert.equal(copy.playerId,'right-c');assert.equal(copy.id,'copied-zone');assert.deepEqual(copy.points,[[19,8],[20,26]]);
 assert.deepEqual(copy.definition.responsibilityArea,a.definition.responsibilityArea);
 copy.definition.responsibilityArea.center[0]++;assert.notDeepEqual(copy.definition.responsibilityArea,a.definition.responsibilityArea);assert.deepEqual(p,before);
});
test('copy refuses missing, other-unit, occupied-stage, duplicate-id targets without changes',()=>{
 for(const setup of [p=>['none','new'],p=>[p.players[0].id,'new'],p=>['left-c','new'],p=>['right-c','source-zone']]){
  const p=fixture(),before=structuredClone(p),args=setup(p);assert.throws(()=>copyAssignmentForPlayer(p,'source-zone',...args));assert.deepEqual(p,before);
 }
});
test('mirror transforms only the path and keeps independent area geometry',()=>{
 const p=fixture(),before=structuredClone(p),a=mirrorAssignmentPath(p,'source-zone');
 assert.deepEqual(a.points,[[-19,8],[-20,26]]);assert.deepEqual(a.definition.responsibilityArea,p.assignments[0].definition.responsibilityArea);
 assert.notEqual(a.definition.responsibilityArea.center,p.assignments[0].definition.responsibilityArea.center);assert.deepEqual(p,before);
});
test('region concepts refuse ambiguous labels, missing owners, and colliding target slots atomically',()=>{
 for(const mode of ['duplicate-source','duplicate-target','missing-source','missing-target','collision','mismatched-label']){
  const p=fixture();p.defenders[0].label='LC';p.defenders[1].label='RC';
  const c=createConceptTemplate(p,{id:'coverage',name:'Coverage'});
  if(mode==='duplicate-source')c.defenders[1].label='LC';
  if(mode==='duplicate-target')p.defenders[1].label='LC';
  if(mode==='missing-source')c.assignments[0].playerId='gone';
  if(mode==='missing-target')p.defenders.shift();
  if(mode==='collision')c.assignments.push({...structuredClone(c.assignments[0]),id:'other-area'});
  if(mode==='mismatched-label')c.assignments[0].positionLabel='RC';
  const before=structuredClone(p),template=structuredClone(c);
  assert.throws(()=>applyConceptTemplateToPlay(p,c),/Responsibility area|unique labels/i,mode);
  assert.deepEqual(p,before);assert.deepEqual(c,template);
 }
});
test('unique concept mapping retains field geometry and respects explicit overrides',()=>{
 const p=fixture();p.defenders[0].label='LC';p.defenders[1].label='RC';
 const c=createConceptTemplate(p,{id:'coverage',name:'Coverage'});
 const target={...structuredClone(p),id:'target',defenders:p.defenders.map(d=>({...d,id:'new-'+d.id,x:d.x+1})),assignments:[]};
 const applied=applyConceptTemplateToPlay(target,c),a=applied.assignments[0];
 assert.equal(a.playerId,'new-left-c');assert.deepEqual(a.points,[[-18,8],[-17,26]]);
 assert.deepEqual(a.definition.responsibilityArea,p.assignments[0].definition.responsibilityArea);
 assert.match(a.id,/defense.*new-left-c.*post/);
 a.templateOverride=true;a.definition.responsibilityArea.label='Coach edit';
 const reapplied=applyConceptTemplateToPlay(applied,c);assert.equal(reapplied.assignments[0].definition.responsibilityArea.label,'Coach edit');
 assert.equal(c.assignments[0].definition.responsibilityArea.label,'Deep left');
});
test('formation changes and normalization preserve authored defensive areas',()=>{
 const p=fixture(),before=structuredClone(p.assignments[0].definition.responsibilityArea);
 const changed=applyFormationToPlay(p,{name:'Shifted',players:p.players.map(d=>({...d,x:d.x+1}))});
 assert.deepEqual(changed.assignments[0].definition.responsibilityArea,before);
 const moved={...p,defenders:p.defenders.map(d=>({...d,x:d.x+2}))};
 assert.deepEqual(normalizePlay(moved).assignments[0].definition.responsibilityArea,before);
});
