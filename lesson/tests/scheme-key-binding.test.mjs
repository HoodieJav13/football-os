import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as api from '../src/schemePackage.js';
import {CALL,approvedPackage,findCall,findRole,localApproval} from './fixtures/schemeFixture.mjs';
const edited=base=>{const next=api.createDraftRevision(base);findRole(findCall(next,CALL.sim4),'syn-r01').decision+=' authored correction';return next;};
const approve=async draft=>{const frozen=await api.freezeSchemePackage(draft);return api.approveSchemePackage(frozen,localApproval(frozen));};
test('a changed role holds its old key while unrelated calls keep their reviewed keys',async()=>{
 const base=await approvedPackage(api);const next=await approve(edited(base));
 assert(api.deriveCoachKeySheet(next,CALL.sim4).entries.every(e=>e.answer===null&&e.heldReason==='stale-key'));
 assert(api.deriveCoachKeySheet(next,CALL.quarters).entries.every(e=>e.status==='keyed'));
 assert(api.deriveCoachKeySheet(base,CALL.sim4).entries.every(e=>e.status==='keyed'),'old approved snapshot stays unchanged');
});
test('explicit key regeneration preserves authored answers and binds only the selected call',async()=>{
 assert.equal(typeof api.regenerateCoachKey,'function');
 const base=await approvedPackage(api);let next=edited(base);const untouched=JSON.stringify(findCall(next,CALL.quarters));
 const before=next.coachKeys.find(k=>k.callId===CALL.sim4).answers;
 next=await api.regenerateCoachKey(next,CALL.sim4);
 assert.deepEqual(next.coachKeys.find(k=>k.callId===CALL.sim4).answers,before);
 assert.equal(JSON.stringify(findCall(next,CALL.quarters)),untouched);
 next=await approve(next);assert(api.deriveCoachKeySheet(next,CALL.sim4).entries.every(e=>e.status==='keyed'));
});
test('an edited rubric requires review and a missing authored answer is never invented',async()=>{
 assert.equal(typeof api.regenerateCoachKey,'function');
 const base=await approvedPackage(api);let next=api.createDraftRevision(base);const key=next.coachKeys.find(k=>k.callId===CALL.sim4);key.answers[0].answer=null;
 assert.equal(api.keyBindingStatus(next,CALL.sim4),'stale');
 next=await api.regenerateCoachKey(next,CALL.sim4);next=await approve(next);
 assert.equal(api.deriveCoachKeySheet(next,CALL.sim4).entries.find(e=>e.roleId===key.answers[0].roleId).heldReason,'missing-key');
});
test('frozen keys cannot be regenerated in place',async()=>{
 assert.equal(typeof api.regenerateCoachKey,'function');const base=await approvedPackage(api);
 await assert.rejects(()=>api.regenerateCoachKey(base,CALL.sim4),e=>e.code==='frozen-revision');
});
