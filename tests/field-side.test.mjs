import assert from 'node:assert/strict';
import test from 'node:test';
import {normalizePlay} from '../src/playData.js';
import {createCover3Lesson} from '../src/cover3Lesson.js';
import {createDefaultWorkspace,createWorkspaceBackup,parseWorkspaceBackup,WORKSPACE_KEY} from '../src/workspaceData.js';
import {loadWorkspaceState,loadGameDayState,GAME_DAY_KEY} from '../src/workspaceStorage.js';
const storage = entries => ({getItem:key=>entries[key]??null});
test('missing field side defaults to none while explicit sides survive save, backup and game-day restore',()=>{
 const w=createDefaultWorkspace(),p=w.playbooks[0].plays[0]; delete p.fieldSide;
 assert.equal(normalizePlay(p).fieldSide,'none');
 const oldRaw=JSON.stringify(w),old=loadWorkspaceState(storage({[WORKSPACE_KEY]:oldRaw}));
 assert.equal(old.writable,true);assert.equal(old.workspace.playbooks[0].plays[0].fieldSide,'none');
 for(const fieldSide of ['left','right','none']){
  p.fieldSide=fieldSide;
  const restored=parseWorkspaceBackup(JSON.stringify(createWorkspaceBackup(w))).workspace.playbooks[0].plays[0];
  assert.equal(restored.fieldSide,fieldSide);assert.deepEqual(restored.assignments,p.assignments);assert.deepEqual(restored.players,p.players);assert.deepEqual(restored.defenders,p.defenders);assert.equal(restored.id,p.id);
  const game=loadGameDayState(storage({[GAME_DAY_KEY]:JSON.stringify({playId:p.id,snapshot:p,workspaceVersion:w.version})}),w);
  assert.equal(game.writable,true);assert.equal(game.gameDay.snapshot.fieldSide,fieldSide);
 }
});
test('invalid explicit field side rejects import and retains corrupt storage for recovery',()=>{
 for(const bad of [null,'up','RIGHT',1,{},[]]){
  const w=createDefaultWorkspace();w.playbooks[0].plays[0].fieldSide=bad;
  assert.throws(()=>normalizePlay(w.playbooks[0].plays[0]),/field side/i);
  assert.throws(()=>parseWorkspaceBackup(JSON.stringify({format:'football-os-workspace',formatVersion:3,workspace:w})),/field side/i);
  const raw=JSON.stringify(w),state=loadWorkspaceState(storage({[WORKSPACE_KEY]:raw}));
  assert.equal(state.writable,false);assert.equal(state.raw,raw);
 }
});
test('lesson display labels leave stable owner IDs and geometry intact',()=>{
 const p=createCover3Lesson('lesson');
 assert.deepEqual(p.defenders.slice(4).map(d=>[d.id,d.label,d.x,d.y]),[
 ['lesson-cl','BC',-19,8],['lesson-fs','S',0,15],['lesson-cr','FC',19,8],['lesson-wl','B',-14,5.5],['lesson-ml','W',-5,5.5],['lesson-mr','M',5,5.5],['lesson-sr','A',14,5.5]]);
 assert.equal(p.fieldSide,'right');
 assert.deepEqual(p.assignments.slice(0,3).map(a=>[a.id,a.playerId,a.points,a.definition.responsibilityArea.center]),[
 ['lesson-zone-cl','lesson-cl',[[-19,8],[-18,26]],[-18,26]],['lesson-zone-fs','lesson-fs',[[0,15],[0,27]],[0,27]],['lesson-zone-cr','lesson-cr',[[19,8],[18,26]],[18,26]]]);
});
