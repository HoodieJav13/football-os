import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, readFile } from 'node:fs/promises';
import { createDefaultWorkspace, WORKSPACE_KEY } from '../../src/workspaceData.js';
import { createCover3Lesson } from '../../src/cover3Lesson.js';
import { useBrowser } from './harness.mjs';
const open = useBrowser();
function fixture() { const w=createDefaultWorkspace(); w.playbooks[0].plays=[createCover3Lesson('plain')]; return w; }
async function controls(page) {
 const layers=page.getByRole('button',{name:/^Layers/});
 if(await layers.isVisible()) await layers.click();
}
for(const viewport of [{width:1440,height:900},{width:1280,height:720},{width:834,height:1194},{width:390,height:844},{width:844,height:390}]) {
 test(`diagram background preserves alignment and restores field at ${viewport.width}x${viewport.height}`,async()=>{
  const app=await open({workspace:fixture(),viewport}),{page}=app;
  const svg=page.locator('.play-canvas').first();
  const before=await svg.getAttribute('viewBox');
  await controls(page);
  assert.equal(await page.getByLabel('Canvas background').count(),1);
  await page.getByLabel('Canvas background').selectOption('diagram');
  const control = await page.getByLabel('Canvas background').boundingBox();
  assert.ok(control.x>=0 && control.y>=0 && control.x+control.width<=viewport.width && control.y+control.height<=viewport.height);
  assert.equal(await svg.locator('.field-grid text,.yard-line,.hash,.sideline,.field-vignette').count(),0);
  assert.equal(await svg.locator('.line-of-scrimmage').count(),1);
  assert.equal(await svg.getAttribute('viewBox'),before);
  assert.equal(await svg.locator('g.defender.area-owner').count(),7);
  await page.getByLabel('Canvas background').selectOption('field');
  assert.ok(await svg.locator('.yard-line').count()>0);
  app.assertNoErrors(); await app.close();
 });
}
test('diagram PNG removes field clutter, fits full lesson, and leaves saved workspace unchanged',async()=>{
 const app=await open({workspace:fixture()}),{page}=app;
 const before=await page.evaluate(k=>localStorage.getItem(k),WORKSPACE_KEY);
 await page.getByLabel('Canvas background').selectOption('diagram');
 await page.getByRole('button',{name:'Dim offense',exact:true}).click();
 await page.locator('.playbook-trigger').click(); await page.getByRole('button',{name:/Backup and export/}).click();
 await page.evaluate(()=>{new MutationObserver(()=>{
  const svg=document.querySelector('.lesson-export svg[data-ready="true"]'); if(!svg)return;
  const box=svg.getBoundingClientRect();
  const bounds=svg.querySelector('.diagram-surface').getBoundingClientRect();
  const areas=[...svg.querySelectorAll('.responsibility-area-fill')];
  window.__diagram={width:box.width,height:box.height,clutter:svg.querySelectorAll('.yard-line,.hash,.field-grid text,radialGradient').length,legend:svg.querySelectorAll('.responsibility-legend text').length,contained:areas.length===7&&areas.every(e=>{const r=e.getBoundingClientRect();return r.left>=bounds.left&&r.right<=bounds.right&&r.top>=bounds.top&&r.bottom<=bounds.bottom;}),offense:svg.querySelectorAll('g.player').length};
 }).observe(document.body,{childList:true,subtree:true,attributes:true});});
 const download=page.waitForEvent('download'); await page.getByRole('button',{name:/Export phone PNG/}).click();
 await mkdir('/private/tmp/football-diagram-review',{recursive:true}); await (await download).saveAs('/private/tmp/football-diagram-review/test-phone.png');
 const result=await page.evaluate(()=>window.__diagram);
 assert.equal(result.width,390); assert.ok(result.height<650); assert.equal(result.clutter,0);assert.equal(result.legend,7); assert.equal(result.contained,true);assert.equal(result.offense,11);
 const bytes=await readFile('/private/tmp/football-diagram-review/test-phone.png');assert.equal(bytes.readUInt32BE(16),780);
 assert.equal(await page.evaluate(k=>localStorage.getItem(k),WORKSPACE_KEY),before);
 app.assertNoErrors();await app.close();
});
