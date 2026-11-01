import assert from 'node:assert/strict';
import test from 'node:test';
import {createCover3Lesson} from '../src/cover3Lesson.js';
import {basePlayers,formationStatus} from '../src/playData.js';
import {createDefaultWorkspace} from '../src/workspaceData.js';
test('editable lesson has legal offense, independent geometry, stable owners and distinct W/M hooks',()=>{
 const base=structuredClone(basePlayers),defaults=createDefaultWorkspace();
 const a=createCover3Lesson('lesson-a'),b=createCover3Lesson('lesson-b');
 assert.equal(a.players.length,11);assert.equal(a.defenders.length,11);assert.equal(a.assignments.length,7);
 assert.equal(formationStatus(a.players).legal,true);
 assert.deepEqual(a.defenders.filter(d=>['W','M'].includes(d.label)).map(d=>d.label),['W','M']);
 for(const assignment of a.assignments)assert.equal(a.defenders.filter(d=>d.id===assignment.playerId).length,1);
 a.assignments[0].definition.responsibilityArea.center[0]=0;
 assert.equal(b.assignments[0].definition.responsibilityArea.center[0],-18);
 assert.deepEqual(basePlayers,base);assert.deepEqual(createDefaultWorkspace(),defaults);
 assert.ok(!defaults.playbooks.flatMap(b=>b.plays).some(p=>p.family==='Cover 3 teaching'));
});
