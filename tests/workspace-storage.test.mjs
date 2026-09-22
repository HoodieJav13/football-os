import assert from 'node:assert/strict';
import test from 'node:test';
import { loadWorkspaceState, loadGameDayState, restoreWorkspace } from '../src/workspaceStorage.js';
import { WORKSPACE_KEY, RECOVERY_WORKSPACE_KEY, createDefaultWorkspace } from '../src/workspaceData.js';
const storage=(initial={})=>{const values=new Map(Object.entries(initial));return {values,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}};
test('missing storage starts writable; newest corrupt key never falls back or writes',()=>{
 assert.equal(loadWorkspaceState(storage()).writable,true);
 for(const raw of ['{broken','null',JSON.stringify({version:100})]){
  const s=storage({[WORKSPACE_KEY]:raw,'football-os.playbooks.v9':JSON.stringify(createDefaultWorkspace())});
  const before=[...s.values]; const state=loadWorkspaceState(s);
  assert.equal(state.writable,false);assert.equal(state.sourceKey,WORKSPACE_KEY);assert.ok(state.error);assert.deepEqual([...s.values],before);
 }
});
test('blocked storage returns a read-only recovery state',()=>{
 const s={getItem(){throw new Error('blocked')}};assert.equal(loadWorkspaceState(s).writable,false);
});
test('restore preserves raw corrupt workspace before replacing it and aborts on recovery failure',()=>{
 const s=storage({[WORKSPACE_KEY]:'{broken'}),w=createDefaultWorkspace();
 restoreWorkspace(s,w,loadWorkspaceState(s));
 assert.equal(JSON.parse(s.getItem(RECOVERY_WORKSPACE_KEY)).raw,'{broken');
 assert.equal(JSON.parse(s.getItem(WORKSPACE_KEY)).version,11);
 const failed=storage({[WORKSPACE_KEY]:'{broken'});failed.setItem=()=>{throw new Error('quota')};
 assert.throws(()=>restoreWorkspace(failed,w,loadWorkspaceState(failed)),/quota/);assert.equal(failed.getItem(WORKSPACE_KEY),'{broken');
});
test('game-day corrupt and future data suppress writes/deletes; old keys remain intact',()=>{
 for(const key of ['football-os.game-day.v7','football-os.game-day.v6']){
  const s=storage({[key]:'{broken'}),state=loadGameDayState(s);assert.equal(state.writable,false);assert.ok(state.error);assert.equal(s.getItem(key),'{broken');
 }
 const p=createDefaultWorkspace().playbooks[0].plays[0],raw=JSON.stringify({playId:p.id,snapshot:p});
 const s=storage({'football-os.game-day.v6':raw});assert.equal(loadGameDayState(s).writable,true);assert.equal(s.getItem('football-os.game-day.v6'),raw);
});
test('a resolved current marker prevents an old adjustment from reviving',()=>{
 const p=createDefaultWorkspace().playbooks[0].plays[0];
 const s=storage({'football-os.game-day.v7':JSON.stringify({resolved:true,workspaceVersion:11}),'football-os.game-day.v6':JSON.stringify({playId:p.id,snapshot:p})});
 const state=loadGameDayState(s);assert.equal(state.gameDay,null);assert.equal(state.writable,true);
});
test('corrupt defender data cannot be replaced with a default defense on load',()=>{
 const w=createDefaultWorkspace();w.playbooks[0].plays[0].defenders='damaged';
 assert.equal(loadWorkspaceState(storage({[WORKSPACE_KEY]:JSON.stringify(w)})).writable,false);
});
test('a legacy library cannot smuggle an authored area into an old envelope',()=>{
 const p=createDefaultWorkspace().playbooks[0].plays[0],d=p.defenders[0];
 p.assignments.push({id:'old-area',playerId:d.id,unit:'defense',type:'Zone',phase:'post',points:[[d.x,d.y],[0,20]],definition:{responsibilityArea:{version:1,shape:'ellipse',center:[0,20],radiusX:5,radiusY:5,label:'Area',color:'blue'}}});
 assert.equal(loadWorkspaceState(storage({'football-os.library.v4':JSON.stringify([p])})).writable,false);
});
