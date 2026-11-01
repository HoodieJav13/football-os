import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createController } from '../public/src/controller.js';
import { createPacketStore } from '../public/src/storage.js';
import { createSchemePacket, readPracticeDocument, serializePacket, verifyPacketTeaching } from '../public/src/packet.js';
import * as scheme from '../public/src/schemePackage.js';
import { DAY_60, STORAGE_KEY, controllerWith, fileWith, memoryStorage, packetFor, practiceDoc } from './helpers.mjs';
import { CALL, approvedPackage } from './fixtures/schemeFixture.mjs';

async function built(){const pkg=await approvedPackage(scheme);const doc=practiceDoc();const period=doc.week.days[0].periods[1];period.schemeRefs=[scheme.schemeRefFor(pkg,CALL.sim4)];return createSchemePacket({intake:readPracticeDocument(doc),dayId:DAY_60,periodId:period.id,callId:CALL.sim4,schemes:[pkg]});}
const corrupt=packet=>{const p=structuredClone(packet);p.teaching.identify.cards[0].prompt='Changed after export';return p;};

test('tampered v2 import never exposes a packet and preserves the previous usable packet',async()=>{
 const old=packetFor();const seen=[];const controller=createController({store:createPacketStore(()=>memoryStorage()),samplePractice:practiceDoc(),download(){},print(){},onChange:s=>seen.push(s.packet)});
 controller.importText(serializePacket(old));const previous=controller.state.packet;seen.length=0;
 await controller.importFile(fileWith(serializePacket(corrupt(await built()))));
 assert.equal(controller.state.packet,previous);assert(seen.every(p=>p===previous));assert.equal(controller.state.notice.kind,'error');
});

test('invalid saved v2 stays held and is never Saved, printable or downloadable',async()=>{
 const storage=memoryStorage({[STORAGE_KEY]:serializePacket(corrupt(await built()))});const {controller,downloads,prints}=controllerWith({storage});
 const pending=controller.init();assert.equal(controller.state.packet,null);await pending;
 assert.equal(controller.state.packet,null);assert.notEqual(controller.state.local,'saved');controller.printPacket();controller.exportPacket();assert.deepEqual(downloads,[]);assert.deepEqual(prints,[]);
});

test('valid saved v2 becomes available only after verification',async()=>{
 const packet=await built();const storage=memoryStorage({[STORAGE_KEY]:serializePacket(packet)});const {controller}=controllerWith({storage});
 const pending=controller.init();assert.equal(controller.state.packet,null);await pending;
 assert.equal(controller.state.teachingIntegrity,'verified');assert.equal(serializePacket(controller.state.packet),serializePacket(packet));assert.equal(controller.state.local,'saved');
});

test('a newer user action supersedes a pending v2 restore',async()=>{
 const storage=memoryStorage({[STORAGE_KEY]:serializePacket(await built())});const {controller}=controllerWith({storage});const pending=controller.init();
 controller.loadSample();controller.chooseDay(DAY_60);const chosen=controller.state.packet;await pending;assert.equal(controller.state.packet,chosen);assert.equal(chosen.schemaVersion,1);
});

test('recomputing a changed learner payload hash cannot change the pinned call teaching',async()=>{
 const packet=await built();packet.teaching.identify.cards[0].prompt='Answer: rush';
 const {projectionDigest,...body}=packet.teaching.identify;packet.teaching.identify.projectionDigest=await scheme.sha256Hex(scheme.canonicalSchemeBytes(body));
 assert.equal((await verifyPacketTeaching(packet)).ok,false);
});

test('approval and period pins must match the selected source revision',async()=>{
 for(const change of [p=>p.teaching.coach.approvalClaim.status='draft',p=>p.teaching.coach.approvalClaim.approvedDigest='0'.repeat(64),p=>p.day.periods.find(x=>x.id===p.teaching.periodId).schemeRefs=[]]){
  const packet=await built();change(packet);assert.equal((await verifyPacketTeaching(packet)).ok,false);
 }
});
