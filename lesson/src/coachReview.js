// Coach-only event archives over the completed pure Teaching models. No SDK/network.
import {canonicalSchemeJson as canon,sha256Hex,readSchemeText,serializeSchemePackage,schemeRefFor,deriveLearnerProjection,deriveCoachKeySheet,buildRecheckProjection} from './schemePackage.js';
import {buildSchemeTeachingDraft,createSyntheticTeachingLoop} from './teaching/domain/schemeTeachingBridge.ts';
export const LOCAL_PROFILE='fictional-local-response',REVIEW_STORAGE_KEY='coaching-workspace:review:v1';
const KIND='coach-review-session',WORKSPACE='coach-review-workspace';
const clone=v=>JSON.parse(JSON.stringify(v)),fail=m=>{throw new Error(m);},object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).every(k=>keys.includes(k)),text=(v,n=2000)=>typeof v==='string'&&v.length<=n;
const preimage=s=>Object.fromEntries(Object.entries(s).filter(([k])=>k!=='contentDigest'));
const seal=async s=>({...s,contentDigest:await sha256Hex(canon(preimage(s)))});
export const createReviewSession=(sessionId=crypto.randomUUID())=>({packageKind:KIND,schemaVersion:1,fictional:true,sessionId,title:'Local coach review',packages:[],events:[],contentDigest:null});
export const serializeReviewSession=s=>JSON.stringify(s,null,2)+'\n';
export const createReviewWorkspace=s=>({packageKind:WORKSPACE,schemaVersion:1,fictional:true,activeId:s.sessionId,sessions:{[s.sessionId]:s}});
export const serializeReviewWorkspace=s=>JSON.stringify(s,null,2)+'\n';
const fields={publish:['assignmentId','pin','cards','title','scenarioId','parentAssignmentId'],submit:['assignmentId','answers'],review:['assignmentId','questions'],release:['assignmentId'],field:['assignmentId','note']};
function validateEvent(e){
 if(!exact(e,['type','eventId','at',...(fields[e?.type]??[])])||!fields[e?.type]||!id(e.eventId)||!id(e.assignmentId)||!text(e.at,40)||!Number.isFinite(Date.parse(e.at)))fail('Invalid or unsupported review event.');
 if(e.type==='publish'&&(!exact(e.pin,['packageId','revision','contentDigest','callId','callDigest'])||!Array.isArray(e.cards)||!e.cards.length||e.cards.length>10||new Set(e.cards).size!==e.cards.length||e.cards.some(n=>!Number.isInteger(n)||n<1||n>11)||!text(e.title,120)||(e.parentAssignmentId!==null&&!id(e.parentAssignmentId))||(e.scenarioId!==null&&!text(e.scenarioId,200))))fail('Invalid publication or role group.');
 if(e.type==='submit'&&(!object(e.answers)||Object.entries(e.answers).some(([k,v])=>!/^q[0-9]$/.test(k)||!text(v,5000))))fail('Invalid fictional response.');
 if(e.type==='review'){
  const keys=['questionId','reviewed','needsFollowUp','privateNote','correctionNote','practiceDate','outcome','recheckAssignmentId','playerSafeFeedback'];
  if(!Array.isArray(e.questions)||e.questions.length>10||e.questions.some(q=>!exact(q,keys)||typeof q.reviewed!=='boolean'||typeof q.needsFollowUp!=='boolean'||!text(q.privateNote,5000)||!exact(q.playerSafeFeedback,['judgment','explanation'])||!text(q.playerSafeFeedback.explanation,5000)))fail('Invalid coach review.');
 }
 if(e.type==='field'&&(!text(e.note,5000)||!e.note.trim()))fail('A field observation needs a bounded coach note.');
}
async function packagesOf(s){
 const result=[],seen=new Set();
 for(const bytes of s.packages){if(!text(bytes,2_000_000))fail('Package file is too large.');const read=await readSchemeText(bytes);if(!read.ok||read.heldAssets.length)fail('Package validation failed or referenced material is missing.');const p=read.pkg;if(p.approval.status!=='approved')fail('Held: approve the frozen package in Author before preparing teaching.');const key=`${p.packageId}:${p.revision}`;if(seen.has(key))fail('Repeated or conflicting package revision.');seen.add(key);result.push(p);}return result;
}
export async function replayReviewSession(s){
 if(!exact(s,['packageKind','schemaVersion','fictional','sessionId','title','packages','events','contentDigest'])||s.packageKind!==KIND||s.schemaVersion!==1||s.fictional!==true||!id(s.sessionId)||!text(s.title,100)||!Array.isArray(s.packages)||s.packages.length>100||!Array.isArray(s.events)||s.events.length>1000)fail('Unsupported coach-review archive. Nothing changed.');
 if(s.contentDigest===null){if(s.packages.length||s.events.length)fail('Missing archive digest.');}else if(s.contentDigest!==await sha256Hex(canon(preimage(s))))fail('Coach archive digest does not match its content.');
 const packages=await packagesOf(s);let event=null,sequence=0;
 const loop=createSyntheticTeachingLoop({now:()=>event.at,newId:()=>`${event.eventId}-${sequence++}`}),assignments=[],privateRecords=[],ids=new Set();
 const refFor=assignmentId=>({teamId:'local-coach-rehearsal',seasonId:s.sessionId,assignmentId});
 for(const e of s.events){validateEvent(e);if(ids.has(e.eventId))fail('Repeated event identity.');ids.add(e.eventId);event=e;sequence=0;
  if(e.type==='publish'){
   if(assignments.some(a=>a.ref.assignmentId===e.assignmentId))fail('Assignment identity already exists.');
   const p=packages.find(p=>p.packageId===e.pin.packageId&&p.revision===e.pin.revision&&p.contentDigest===e.pin.contentDigest),c=p?.calls.find(c=>c.callId===e.pin.callId);if(!c||p.callDigests[c.callId]!==e.pin.callDigest)fail('The exact pinned package and call are missing.');
   let projection;
   if(e.parentAssignmentId!==null){const parent=privateRecords.find(r=>r.assignment.ref.assignmentId===e.parentAssignmentId);if(!parent||parent.source.packageId!==p.packageId||parent.source.callId!==c.callId||parent.source.revision>=p.revision||canon(parent.assignment.cardNumbers)!==canon(e.cards))fail('A recheck needs its original role group and a newer matching source revision.');const scenario=p.scenarios.find(x=>x.scenarioId===e.scenarioId&&x.callId===c.callId);if(!scenario)fail('The authored changed-picture scenario is missing.');projection=await buildRecheckProjection(p,scenario);
   }else{if(e.scenarioId!==null)fail('A changed picture must link to its original assignment.');projection=await deriveLearnerProjection(p,'identify',e.pin);}
   const source={...schemeRefFor(p,c.callId),approvalStatus:p.approval.status},sheet=deriveCoachKeySheet(p,c.callId),draft=buildSchemeTeachingDraft({identifyProjection:projection,coachKeySheet:sheet,source,cardNumbers:e.cards,title:e.title});
   if(!draft.definition.questions.length)fail('Held: no questions have an approved current authored key.');
   const assignment=await loop.publish({ref:refFor(e.assignmentId),draft,expectedProfileIds:[LOCAL_PROFILE],changeNotice:e.parentAssignmentId?'Linked changed-picture recheck':'Local fictional coaching check',parentAssignmentId:e.parentAssignmentId});assignments.push(assignment);privateRecords.push({assignment,source,held:draft.held,title:e.title,scenarioId:e.scenarioId});
  }else{const ref=refFor(e.assignmentId);if(!assignments.some(a=>a.ref.assignmentId===e.assignmentId))fail('An event names an assignment that is not here.');
   if(e.type==='submit')loop.submit(ref,LOCAL_PROFILE,e.answers);
   if(e.type==='review'){if(!loop.getAttempt(ref,LOCAL_PROFILE))fail('Record a fictional response before reviewing it.');loop.saveReview(ref,LOCAL_PROFILE,{questions:e.questions});}
   if(e.type==='release')loop.release(ref,LOCAL_PROFILE);
   if(e.type==='field')loop.recordFieldObservation(ref,LOCAL_PROFILE,e.note);
  }
 }return {loop,assignments,privateRecords,packages};
}
export async function addReviewPackage(s,bytes){
 await replayReviewSession(s);const read=await readSchemeText(bytes);if(!read.ok||read.heldAssets.length)fail('Package validation failed or referenced material is missing.');const incoming=read.pkg;if(incoming.approval.status!=='approved')fail('Held: approve the frozen package in Author before preparing teaching.');
 for(const bytes of s.packages){const p=JSON.parse(bytes);if(p.packageId===incoming.packageId&&p.revision===incoming.revision){if(p.contentDigest===incoming.contentDigest)return s;fail('Conflicting package revision. Existing pinned material was kept.');}}
 const next=await seal({...clone(s),packages:[...s.packages,serializeSchemePackage(incoming)]});await replayReviewSession(next);return next;
}
export async function appendReviewEvent(s,input){
 const opened=await replayReviewSession(s);
 if(input.type==='publish'&&opened.privateRecords.some(r=>r.source.contentDigest===input.pin?.contentDigest&&r.source.callId===input.pin?.callId&&canon(r.assignment.cardNumbers)===canon(input.cards)&&r.assignment.snapshot.parentAssignmentId===(input.parentAssignmentId??null)&&r.scenarioId===(input.scenarioId??null)))return s;
 const e={...input,eventId:input.eventId??crypto.randomUUID(),at:input.at??new Date().toISOString()},next=await seal({...clone(s),events:[...s.events,e]});await replayReviewSession(next);return next;
}
const prefix=(a,b)=>a.length<=b.length&&a.every((e,i)=>canon(e)===canon(b[i]));
export async function planReviewImport(current,bytes){
 if(!text(bytes,8_000_000))fail('Coach archive is too large.');let incoming;try{incoming=JSON.parse(bytes);}catch{fail('This is not a valid coach-review archive.');}await replayReviewSession(incoming);
 let action='new-session';if(current?.sessionId===incoming.sessionId){const cp=new Set(current.packages),ip=new Set(incoming.packages);action=canon(current)===canon(incoming)?'noop':prefix(current.events,incoming.events)&&current.packages.every(p=>ip.has(p))?'descendant':prefix(incoming.events,current.events)&&incoming.packages.every(p=>cp.has(p))?'older':'conflict';}
 return {action,incoming,base:current?canon(current):null};
}
export function applyReviewImport(w,plan){const current=w.sessions[plan.incoming.sessionId]??null;if((current?canon(current):null)!==plan.base)fail('This review changed after preview. Preview the archive again.');if(plan.action==='conflict')fail('Conflicting history. Current records were kept.');if(['noop','older'].includes(plan.action))return w;return {...w,activeId:plan.incoming.sessionId,sessions:{...w.sessions,[plan.incoming.sessionId]:clone(plan.incoming)}};}
export async function readReviewWorkspace(bytes){
 if(!text(bytes,12_000_000))fail('Review storage is too large.');let w;try{w=JSON.parse(bytes);}catch{fail('Saved coach reviews are damaged. Original bytes were kept.');}
 if(!exact(w,['packageKind','schemaVersion','fictional','activeId','sessions'])||w.packageKind!==WORKSPACE||w.schemaVersion!==1||w.fictional!==true||!object(w.sessions)||Object.keys(w.sessions).length>30||!id(w.activeId)||!Object.hasOwn(w.sessions,w.activeId))fail('Unsupported saved coach reviews. Original bytes were kept.');
 for(const [key,s]of Object.entries(w.sessions)){if(!id(key)||key!==s?.sessionId)fail('Invalid review identity.');await replayReviewSession(s);}return w;
}
export async function saveReviewWorkspace(storage,expectedText,next,withLock){
 if(!withLock)return {ok:false,error:'Safe saving is unavailable in this browser. Use a browser with Web Locks; existing records are unchanged.'};
 try{await readReviewWorkspace(serializeReviewWorkspace(next));return await withLock(async()=>{if(storage.getItem(REVIEW_STORAGE_KEY)!==expectedText)return {ok:false,error:'Another tab changed these reviews. Reload before saving. Existing history was kept.'};const bytes=serializeReviewWorkspace(next);storage.setItem(REVIEW_STORAGE_KEY,bytes);if(storage.getItem(REVIEW_STORAGE_KEY)!==bytes)throw new Error('Storage did not keep the write.');return {ok:true,text:bytes};});}catch(error){return {ok:false,error:`Not saved: ${error.message}. Existing review remains available.`};}
}
