import assert from 'node:assert/strict';
import test from 'node:test';
import {createDefaultWorkspace} from '../../src/workspaceData.js';
import {createCover3Lesson} from '../../src/cover3Lesson.js';
import {REGION_COLORS} from '../../src/responsibilityArea.js';
import {PHONE_PORTRAIT,useBrowser} from './harness.mjs';
const open=useBrowser();

// Distinctive authored text, so a leak cannot hide behind ordinary words.
function fixture(){
 const w=createDefaultWorkspace(),p=createCover3Lesson('pkfix9');
 p.assignments.forEach((a,i)=>{p.defenders.find(d=>d.id===a.playerId).label=`Kq${i+1}`;a.definition.responsibilityArea.label=`Wv zone ${i+1}`;});
 w.playbooks[0].plays=[p];return{w,p};
}
const openPack=async page=>{await page.getByRole('button',{name:'More',exact:true}).click();await page.getByRole('menuitem',{name:'Lesson pack',exact:true}).click();await page.locator('.lesson-pack').waitFor();};
const output=(page,name)=>page.locator('.lesson-pack-outputs').getByRole('button',{name,exact:true}).click();
const status=page=>page.locator('.lesson-pack-status').textContent();

test('player cards mount an answer-free projection; the coach key is separate and verbatim',async()=>{
 const{w,p}=fixture(),app=await open({workspace:w}),{page}=app;
 // Every area arrow the editor references must still be defined after the defs filter.
 const dangling=await page.evaluate(()=>[...document.querySelectorAll('.play-canvas [marker-end]')].map(e=>e.getAttribute('marker-end').slice(5,-1)).filter(id=>!document.getElementById(id)));
 assert.deepEqual(dangling,[]);
 await openPack(page);
 const sheet=page.locator('.lesson-sheet svg');await sheet.locator('.responsibility-area-fill').first().waitFor();
 assert.equal(await sheet.locator('.responsibility-area-fill').count(),7);
 await output(page,'Player cards');
 const cards=page.locator('.identify-card');await cards.first().locator('svg[data-ready="true"]').waitFor();
 assert.equal(await cards.count(),7);
 const html=await page.locator('.lesson-pack').evaluate(e=>e.outerHTML);
 const banned=[p.id,p.name,p.formation,p.family,'Kq','Wv zone','Illustrative','deep-third','responsibility-area-fill','responsibility-legend','data-region','area-owner','--area-color','area-arrow','coach-key',...Object.values(REGION_COLORS)];
 for(const token of banned)assert.ok(!html.toLowerCase().includes(token.toLowerCase()),`player output leaks ${token}`);
 assert.ok(!/\b(blue|teal|amber|hook|flat)\b/i.test(html),'player output names a job or color');
 for(let i=0;i<7;i++)assert.equal(await cards.nth(i).locator('g.defender text',{hasText:'★'}).count(),1);
 const names=await page.locator('.identify-card [aria-label], .identify-card title').evaluateAll(es=>es.map(e=>e.getAttribute('aria-label')??e.textContent).join(' '));
 assert.ok(!/Kq|Wv|Zone/.test(names),names);
 await page.emulateMedia({media:'print'});
 assert.equal(await page.locator('.identify-card').first().isVisible(),true);assert.equal(await page.locator('.lesson-pack-toolbar').isVisible(),false);
 await page.emulateMedia({media:'screen'});
 await output(page,'Coach key');
 assert.equal(await page.locator('.identify-card').count(),0);
 const rows=page.locator('.coach-key tbody tr');assert.equal(await rows.count(),7);
 for(let i=1;i<=7;i++)assert.equal(await page.locator('.coach-key td',{hasText:new RegExp(`^Wv zone ${i}$`)}).count(),1);
 assert.match(await status(page),/Current/);
 app.assertNoErrors();await app.close();
});

test('camera and selection keep the pack current; a meaningful edit stales it until regenerated',async()=>{
 const{w,p}=fixture(),app=await open({workspace:w}),{page}=app;
 await openPack(page);assert.match(await status(page),/Current/);await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.locator('.play-canvas').first().hover();await page.mouse.wheel(0,-400);
 const token=page.locator(`.canvas-workspace g.defender[data-player="${p.id}-ml"]`);await token.click();
 await openPack(page);assert.match(await status(page),/Current/);await page.getByRole('button',{name:'Close',exact:true}).click();
 const before=await token.boundingBox();await token.focus();await page.keyboard.press('ArrowRight');
 assert.notDeepEqual(await token.boundingBox(),before,'nudge did not move the defender');
 await openPack(page);assert.match(await status(page),/Stale/);
 await output(page,'Coach key');assert.equal(await page.locator('.coach-key-stale').count(),1);
 await page.getByRole('button',{name:'Regenerate',exact:true}).click();
 assert.match(await status(page),/Current/);assert.equal(await page.locator('.coach-key-stale').count(),0);
 app.assertNoErrors();await app.close();
});

test('phone portrait reaches every output with full-size controls',async()=>{
 const{w}=fixture(),app=await open({workspace:w,viewport:PHONE_PORTRAIT,touch:true}),{page}=app;
 await openPack(page);
 await page.locator('.lesson-pack').evaluate(element=>Promise.all(element.getAnimations().map(animation=>animation.finished.catch(()=>{}))));
 for(const name of ['Assignment sheet','Player cards','Coach key']){
  const button=page.locator('.lesson-pack-outputs').getByRole('button',{name,exact:true});
  const box=await button.boundingBox();assert.ok(box&&box.height>=44&&box.x>=0&&box.x+box.width<=PHONE_PORTRAIT.width,name);
 }
 await output(page,'Player cards');assert.equal(await page.locator('.identify-card').count(),7);
 const field=await page.locator('.identify-card .print-field').first().boundingBox();
 assert.ok(field && field.height>=300,'phone Identify diagram is compressed below a useful reading height');
 app.assertNoErrors();await app.close();
});
