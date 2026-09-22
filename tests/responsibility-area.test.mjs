import assert from 'node:assert/strict';
import test from 'node:test';
import { responsibilityAreaError, copyResponsibilityArea } from '../src/responsibilityArea.js';
import { sanitizeDefensiveDefinition } from '../src/playData.js';
import { createDefaultWorkspace, normalizeWorkspace, createWorkspaceBackup, parseWorkspaceBackup } from '../src/workspaceData.js';
const area=()=>({version:1,shape:'ellipse',center:[0,22],radiusX:8,radiusY:10,label:'Deep middle',color:'blue'});
function workspace(){
 const w=createDefaultWorkspace(), p=w.playbooks[0].plays[0], d=p.defenders[0];
 p.assignments=p.assignments.filter(a=>a.playerId!==d.id);
 p.assignments.push({id:'area-zone',playerId:d.id,unit:'defense',phase:'post',type:'Zone',points:[[d.x,d.y],[0,22]],definition:{area:'hook',landmark:'',responsibilityArea:area()}});
 return w;
}
test('valid authored regions clone independently and never clip to the editor',()=>{
 const a={...area(),center:[-200,300],radiusX:.01};
 assert.equal(responsibilityAreaError(a),null);
 const b=copyResponsibilityArea(a);assert.deepEqual(b,a);b.center[0]++;
 assert.notDeepEqual(b,a);
 assert.deepEqual(sanitizeDefensiveDefinition('Zone',{responsibilityArea:a}).responsibilityArea,a);
 assert.equal(Object.hasOwn(sanitizeDefensiveDefinition('Zone',{}),'responsibilityArea'),false);
 assert.equal(Object.hasOwn(sanitizeDefensiveDefinition('Man',{responsibilityArea:a}),'responsibilityArea'),false);
});
test('malformed region values reject without repair',()=>{
 const invalid=[null,[],{}, {...area(),version:2},{...area(),center:[0,'3']},{...area(),center:[NaN,0]}, {...area(),radiusX:0},{...area(),radiusX:-1},{...area(),radiusY:Infinity},{...area(),radiusY:'2'},{...area(),color:'url(x)'},{...area(),label:''},{...area(),label:'x'.repeat(49)},{...area(),label:'bad\u0000'},{...area(),center:[Number.MAX_VALUE,0],radiusX:Number.MAX_VALUE}];
 for(const a of invalid){assert.ok(responsibilityAreaError(a));assert.throws(()=>copyResponsibilityArea(a),/Responsibility area/);}
});
test('workspace v11 and backup v3 round trip plays and concepts without adding regions',()=>{
 const w=workspace(),p=w.playbooks[0].plays[0];
 w.playbooks[0].concepts=[{id:'concept',name:'Area concept',players:p.players,defenders:p.defenders,assignments:p.assignments}];
 const backup=createWorkspaceBackup(w);assert.equal(backup.formatVersion,3);assert.equal(backup.workspace.version,11);
 const restored=parseWorkspaceBackup(JSON.stringify(backup)).workspace;
 assert.deepEqual(restored.playbooks[0].plays[0].assignments.at(-1).definition,p.assignments.at(-1).definition);
 assert.deepEqual(restored.playbooks[0].concepts,w.playbooks[0].concepts);
 assert.deepEqual(normalizeWorkspace(restored),restored);
 assert.equal(JSON.stringify(createDefaultWorkspace()).includes('responsibilityArea'),false);
});
test('invalid geometry and ambiguous ownership reject before normalization can drop it',()=>{
 for(const concept of [false,true])for(const mutate of [
  (p,a)=>{a.definition.responsibilityArea=null;},(p,a)=>{a.playerId='missing';},
  (p,a)=>{p.defenders.push({...p.defenders.find(d=>d.id===a.playerId)});},
  (p,a)=>{p.assignments.push({...a});},(p,a)=>{a.unit='offense';},(p,a)=>{a.type='Rush';}
 ]){
  const w=workspace(),p=w.playbooks[0].plays[0];
  if(concept){w.playbooks[0].concepts=[{...structuredClone(p),id:'bad-concept'}];}
  const target=concept?w.playbooks[0].concepts[0]:p;mutate(target,target.assignments.at(-1));
  assert.throws(()=>normalizeWorkspace(w),/Responsibility area.*(play|concept).*assignment/i);
 }
});
test('older workspace or backup envelopes cannot carry new region data',()=>{
 const w=workspace(); w.version=10; assert.throws(()=>normalizeWorkspace(w),/Responsibility area/);
 for(const formatVersion of [1,2])assert.throws(()=>parseWorkspaceBackup(JSON.stringify({format:'football-os-workspace',formatVersion,workspace:workspace()})),/Responsibility area/);
});
