import {normalizePlay} from "../src/playData.js";
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {normalizeWorkspace,createDefaultWorkspace} from '../src/workspaceData.js';
const fixture=n=>JSON.parse(readFileSync(new URL('./fixtures/workspace-v'+n+'.json',import.meta.url),'utf8'));
test('v9 and v10 custom contents survive catalog upgrades',()=>{
 for(const v of [9,10]){
  const before=fixture(v), after=normalizeWorkspace(before);
  assert.ok(after, 'supported lineage v'+v);
  const book=before.playbooks[0], saved=after.playbooks.find(b=>b.id===book.id);
  for(const p of book.plays){
   const q=saved.plays.find(x=>x.id===p.id);
   assert.equal(q.name,p.name); assert.deepEqual(q.players,p.players);
   assert.deepEqual(q.assignments.map(a=>a.points),p.assignments.map(a=>a.points));
   assert.deepEqual(q.importedFrom,p.importedFrom); assert.equal(q.variantOf,p.variantOf);
  }
  assert.deepEqual(saved.formations,book.formations); assert.deepEqual(saved.concepts,book.concepts);
 }
});
test('verified catalogs coexist with all 48 independent imported Air Raid plays',()=>{
 for(const w of [normalizeWorkspace(fixture(9)),createDefaultWorkspace()]){
  for(const [id,count] of [['air-raid-reference',4],['lsu-2019-reference',7],['texas-tech-reference',4]]){
   const b=w.playbooks.find(b=>b.id===id); assert.equal(b?.readOnly,true);assert.equal(b.plays.length,count);
  }
  const b=w.playbooks.find(b=>b.id==='air-raid-sample');assert.equal(b.plays.length,48);assert.notEqual(b.readOnly,true);
 }
});
test('old sample content is archived, not erased',()=>{
 const before=fixture(9), after=normalizeWorkspace(before);
 for(const id of ['lsu-2019-sample','texas-tech-sample']){
  const old=before.playbooks.find(b=>b.id===id), saved=after.playbooks.find(b=>b.id===id);
  assert.equal(saved.archived,true);assert.deepEqual(saved.plays.map(p=>p.name),old.plays.map(p=>p.name));
 }
});
test('backup normalization retains the current catalog order and complete book data',()=>{
 const w=createDefaultWorkspace();assert.deepEqual(normalizeWorkspace(w),w);
});
test('personal books colliding with governed IDs retain content, selection, and provenance',()=>{
 for(const id of ['air-raid-reference','lsu-2019-reference','texas-tech-reference']){
  const w=fixture(9),custom=structuredClone(w.playbooks[0]);
  custom.id=id;custom.name='My custom book';custom.source='personal';custom.isMain=false;
  custom.plays[0].name='My custom call';
  w.playbooks.push(custom);w.mainPlaybookId=id;w.activePlaybookId=id;
  w.playbooks[0].plays[0].importedFrom={playbookId:id,playId:custom.plays[0].id};
  const out=normalizeWorkspace(w),saved=out.playbooks.find(b=>b.name==='My custom book');
  assert.ok(saved);assert.notEqual(saved.id,id);assert.deepEqual(saved.plays,custom.plays.map(normalizePlay));
  assert.equal(out.mainPlaybookId,saved.id);assert.equal(out.activePlaybookId,saved.id);
  assert.equal(out.playbooks[0].plays[0].importedFrom.playbookId,saved.id);
  assert.equal(out.playbooks.find(b=>b.id===id).readOnly,true);
  assert.deepEqual(normalizeWorkspace(out),out);
 }
});
test('a new personal book named after a retired catalog is not archived on reload',()=>{
 for(const id of ['texas-tech-sample','lsu-2019-sample']){
  const w=createDefaultWorkspace(),custom={...structuredClone(w.playbooks[0]),id,name:'My personal sample',source:'personal',isMain:false};w.playbooks.push(custom);w.activePlaybookId=id;
  const out=normalizeWorkspace(w),saved=out.playbooks.find(b=>b.name===custom.name);
  assert.notEqual(saved.archived,true);assert.equal(out.activePlaybookId,saved.id);assert.deepEqual(saved.plays,custom.plays.map(normalizePlay));
 }
});
