import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, readFile } from 'node:fs/promises';
import { createDefaultWorkspace, WORKSPACE_KEY } from '../../src/workspaceData.js';
import { createCover3Lesson } from '../../src/cover3Lesson.js';
import { useBrowser } from './harness.mjs';
const open = useBrowser();
const out = join(tmpdir(), 'football-diagram-review');
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
  window.__diagram={width:box.width,height:box.height,clutter:svg.querySelectorAll('.yard-line,.hash,.field-grid text,radialGradient').length,legend:svg.querySelectorAll('.responsibility-legend text').length,contained:areas.length===7&&areas.every(e=>{const r=e.getBoundingClientRect();return r.left>=bounds.left&&r.right<=bounds.right&&r.top>=bounds.top&&r.bottom<=bounds.bottom;}),offense:svg.querySelectorAll('g.player').length,
   legendEntries:[...svg.querySelectorAll('.responsibility-legend text')].map(e=>({text:e.textContent,x:Number(e.getAttribute('x')),y:Number(e.getAttribute('y'))})),
   fieldSide:svg.querySelector('.field-side-indicator')?.textContent,
   fieldOnRight:svg.querySelector('.field-side-indicator').getBoundingClientRect().left>bounds.left+bounds.width/2,
   unbrokenLegend:[...svg.querySelectorAll('.responsibility-legend text')].every(e=>e.querySelectorAll('tspan').length===1),
   tagClearance:[...svg.querySelectorAll('.region-owner-key rect')].every(tag=>{
    const a=tag.getBoundingClientRect();return [...svg.querySelectorAll('g.defender circle')].every(token=>{
     const b=token.getBoundingClientRect(),cx=b.x+b.width/2,cy=b.y+b.height/2;
     return Math.hypot(Math.max(a.left-cx,0,cx-a.right),Math.max(a.top-cy,0,cy-a.bottom))>b.width/2;
    });
   }),
   legendFont:parseFloat(getComputedStyle(svg.querySelector('.responsibility-legend text')).fontSize),
   tagFont:parseFloat(getComputedStyle(svg.querySelector('.region-owner-key text')).fontSize),
   offenseLabels:[...svg.querySelectorAll('.player-label')].map(e=>e.textContent.trim()),
   sameBackground:getComputedStyle(svg.querySelector('.diagram-surface')).fill===getComputedStyle(svg.querySelector('.responsibility-legend rect')).fill,
   offenseOpacity:Number(getComputedStyle(svg.querySelector('g.player')).opacity),
   labelsFit:[...svg.querySelectorAll('.responsibility-legend text')].every(e=>e.getBoundingClientRect().width<box.width/2-20)};
 }).observe(document.body,{childList:true,subtree:true,attributes:true});});
 const download=page.waitForEvent('download'); await page.getByRole('button',{name:/Export phone PNG/}).click();
 await mkdir(out,{recursive:true}); await (await download).saveAs(join(out, 'test-phone.png'));
 const result=await page.evaluate(()=>window.__diagram);
 assert.equal(result.width,390); assert.ok(result.height<500); assert.equal(result.clutter,0);assert.equal(result.legend,7); assert.equal(result.contained,true);assert.equal(result.offense,11);
 assert.deepEqual(result.legendEntries.map(e=>e.text),['BC — Deep left','S — Deep middle','FC — Deep right','W — Left hook','M — Right hook','B — Left flat','A — Right flat']);
 assert.ok(result.legendEntries.slice(0,3).every(e=>e.y===result.legendEntries[0].y));
 assert.ok(result.legendEntries.slice(3).every(e=>e.y>result.legendEntries[2].y));
 assert.equal(result.legendEntries[3].y,result.legendEntries[4].y);
 assert.equal(result.legendEntries[5].y,result.legendEntries[6].y);
 assert.ok(result.legendEntries[5].y>result.legendEntries[3].y);
 assert.ok(result.legendEntries.slice(1,3).every((e,i)=>e.x>result.legendEntries[i].x));
 assert.equal(result.fieldOnRight,true); assert.equal(result.unbrokenLegend,true); assert.equal(result.tagClearance,true);
 assert.ok(result.legendFont>=result.tagFont);
 assert.deepEqual(result.offenseLabels.sort(),['F','H','Q','X','Y','Z']);
 assert.equal(result.fieldSide,'FIELD →'); assert.equal(result.sameBackground,true); assert.equal(result.labelsFit,true); assert.ok(result.offenseOpacity>=0.5 && result.offenseOpacity<0.7);
 const bytes=await readFile(join(out, 'test-phone.png'));assert.equal(bytes.readUInt32BE(16),780);
 assert.equal(await page.evaluate(k=>localStorage.getItem(k),WORKSPACE_KEY),before);
 app.assertNoErrors();await app.close();
});

test('field side is editable play metadata, undoable, and survives reload without moving any geometry',async()=>{
 const workspace=fixture();workspace.playbooks[0].plays[0].fieldSide='none';
 const original=structuredClone(workspace.playbooks[0].plays[0]);
 const app=await open({workspace}),{page}=app;
 assert.equal(await page.locator('.field-side-indicator').count(),0);
 const setSide=async side=>{
  await page.getByRole('button',{name:'More',exact:true}).click();
  await page.getByRole('menuitem',{name:'Play details',exact:true}).click();
  await page.getByLabel('Field side',{exact:true}).selectOption(side);
  await page.getByRole('button',{name:'Save details',exact:true}).click();
 };
 await setSide('right');
 assert.equal(await page.locator('.field-side-indicator').textContent(),'FIELD →');
 await page.locator('.tool-history').getByRole('button',{name:'Undo',exact:true}).click();
 assert.equal(await page.locator('.field-side-indicator').count(),0);
 await page.locator('.tool-history').getByRole('button',{name:'Redo',exact:true}).click();
 assert.equal(await page.locator('.field-side-indicator').textContent(),'FIELD →');
 await page.getByLabel('Canvas background').selectOption('diagram');
 assert.equal(await page.locator('.field-side-indicator').textContent(),'FIELD →');
 await setSide('left');
 const leftIndicator=await page.locator('.field-side-indicator').boundingBox();
 const stage=await page.locator('.play-canvas').first().boundingBox();
 assert.ok(leftIndicator.x+leftIndicator.width<stage.x+stage.width/2);
 assert.equal(await page.locator('.field-side-indicator').textContent(),'← FIELD');
 await page.waitForTimeout(650);await page.reload({waitUntil:'networkidle'});
 assert.equal(await page.locator('.field-side-indicator').textContent(),'← FIELD');
 const saved=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).playbooks[0].plays[0],WORKSPACE_KEY);
 assert.deepEqual(saved,{...original,fieldSide:'left'});
 await page.getByRole('button',{name:'Sideline',exact:true}).click();
 assert.equal(await page.locator('.field-side-indicator').textContent(),'FIELD ↑');
 app.assertNoErrors();await app.close();
});

test('field side control is reachable on phone landscape',async()=>{
 const app=await open({workspace:fixture(),viewport:{width:844,height:390}}),{page}=app;
 await page.getByRole('button',{name:'More',exact:true}).click();
 await page.getByRole('menuitem',{name:'Play details',exact:true}).click();
 await page.getByLabel('Field side',{exact:true}).scrollIntoViewIfNeeded();
 await page.getByLabel('Field side',{exact:true}).selectOption('left');
 const box=await page.getByLabel('Field side',{exact:true}).boundingBox();
 assert.ok(box.y>=0 && box.y+box.height<=390);
 await page.getByRole('button',{name:'Save details',exact:true}).click();
 assert.equal(await page.locator('.field-side-indicator').textContent(),'← FIELD');
 app.assertNoErrors();await app.close();
});


test('exceptional long labels remain complete and tiny-area tags avoid their owner',async()=>{
 const workspace=fixture(),play=workspace.playbooks[0].plays[0];
 const assignment=play.assignments.find(a=>a.definition?.responsibilityArea);
 const owner=play.defenders.find(p=>p.id===assignment.playerId);
 Object.assign(assignment.definition.responsibilityArea,{center:[owner.x,owner.y],radiusX:.5,radiusY:.5,label:'W'.repeat(48)});
 const app=await open({workspace}),{page}=app;
 await page.getByLabel('Canvas background').selectOption('diagram');
 await page.locator('.playbook-trigger').click();await page.getByRole('button',{name:/Backup and export/}).click();
 await page.evaluate(id=>{new MutationObserver(()=>{
  const svg=document.querySelector('.lesson-export svg[data-ready="true"]');if(!svg)return;
  const box=svg.getBoundingClientRect();
  const legend=svg.querySelector(`[data-legend-owner="${id}"]`);
  const tag=svg.querySelector(`[data-region-owner="${id}"] .region-owner-key rect`).getBoundingClientRect();
  const token=svg.querySelector(`g.defender[data-player="${id}"] circle`).getBoundingClientRect();
  window.__edge={text:legend.textContent.replace(/\s/g,''),inside:[...legend.querySelectorAll('tspan')].every(e=>{
    const b=e.getBoundingClientRect();return b.left>=box.left&&b.right<=box.right;
  }),clear:tag.right<token.left||tag.left>token.right||tag.bottom<token.top||tag.top>token.bottom};
 }).observe(document.body,{childList:true,subtree:true,attributes:true});},owner.id);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:/Export phone PNG/}).click();await download;
 const result=await page.evaluate(()=>window.__edge);
 assert.equal(result.text,'BC—'+'W'.repeat(48));assert.equal(result.inside,true);assert.equal(result.clear,true);
 app.assertNoErrors();await app.close();
});
