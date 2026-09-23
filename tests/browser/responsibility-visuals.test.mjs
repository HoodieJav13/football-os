import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir,readFile} from 'node:fs/promises';
import {createDefaultWorkspace,WORKSPACE_KEY} from '../../src/workspaceData.js';
import {createCover3Lesson} from '../../src/cover3Lesson.js';
import {useBrowser} from './harness.mjs';
const open=useBrowser();
function fixture(){const w=createDefaultWorkspace(),p=createCover3Lesson('colors');w.playbooks[0].plays=[p];return{w,p};}
const style=async(loc,prop)=>loc.evaluate((e,p)=>getComputedStyle(e)[p],prop);
test('area owners and drops share palette color; ordinary defenders stay flat and selection keeps ownership',async()=>{
 const {w}=fixture(),app=await open({workspace:w}),{page}=app;
 const circle=page.locator('g.defender[data-player="colors-cl"] circle:not(.token-hit)');
 const path=page.locator('.play-canvas [data-assignment-id="colors-zone-cl"]');
 assert.equal(await style(circle,'fill'),'rgb(124, 183, 255)');assert.equal(await style(circle,'stroke'),'rgb(124, 183, 255)');assert.equal(await style(path,'stroke'),'rgb(124, 183, 255)');
 const marker=await path.getAttribute('marker-end');const id=marker.slice(marker.indexOf('#')+1,-1);assert.equal(await style(page.locator(`[id="${id}"] path`),'fill'),'rgb(124, 183, 255)');
 assert.notEqual(await style(page.locator('g.defender[data-player="colors-front-0"] circle:not(.token-hit)'),'fill'),'rgb(124, 183, 255)');
 await page.locator('g.defender[data-player="colors-cl"]').click();assert.equal(await style(path,'stroke'),'rgb(124, 183, 255)');
 await page.getByLabel('Area color').selectOption('rose');assert.equal(await style(circle,'fill'),'rgb(244, 157, 175)');assert.equal(await style(path,'stroke'),'rgb(244, 157, 175)');
 await page.getByRole('button',{name:'Remove area',exact:true}).click();assert.notEqual(await style(circle,'fill'),'rgb(244, 157, 175)');app.assertNoErrors();await app.close();
});
test('phone PNG keeps readable legend and keyed owners without saving export or dimming state',async()=>{
 const {w,p}=fixture(),app=await open({workspace:w}),{page}=app;
 await page.getByRole('button',{name:'Dim offense',exact:true}).click();
 await page.locator('.playbook-trigger').click();await page.getByRole('button',{name:/Backup and export/}).click();
 assert.equal(await page.getByRole('button',{name:/Export phone PNG/}).count(),1);
 await page.evaluate(()=>{new MutationObserver(()=>{const svg=document.querySelector('.lesson-export svg[data-ready="true"]');if(!svg)return;const texts=[...svg.querySelectorAll('.responsibility-legend text')];window.__phoneExport={width:svg.getBoundingClientRect().width,legend: texts.map(e=>({text:e.textContent,x:e.getAttribute('x'),font:parseFloat(getComputedStyle(e).fontSize)*svg.getBoundingClientRect().width/svg.viewBox.baseVal.width})),offense:getComputedStyle(svg.querySelector('g.player')).opacity,defense:getComputedStyle(svg.querySelector('g.defender[data-player="colors-cl"] circle')).fill,controls:svg.querySelectorAll('animateMotion,[data-region-handle],.route-arrow-active').length};}).observe(document.body,{childList:true,subtree:true,attributes:true});});
 const download=page.waitForEvent('download');await page.getByRole('button',{name:/Export phone PNG/}).click();const dl=await download;await mkdir('/private/tmp/football-qa',{recursive:true});await dl.saveAs('/private/tmp/football-qa/phone-visuals.png');
 const capture=await page.evaluate(()=>window.__phoneExport);assert.equal(capture.width,390);assert.equal(capture.legend.length,7);assert.equal(new Set(capture.legend.map(t=>t.x)).size,1);assert.ok(capture.legend.every(t=>t.font>=13.9));assert.ok(capture.legend.some(t=>t.text==='B — Left flat'));assert.ok(capture.legend.some(t=>t.text==='A — Right flat'));assert.equal(capture.offense,'0.3');assert.equal(capture.defense,'rgb(124, 183, 255)');assert.equal(capture.controls,0);
 const bytes=await readFile('/private/tmp/football-qa/phone-visuals.png');assert.equal(bytes.readUInt32BE(16),780);assert.ok(bytes.readUInt32BE(20)>bytes.readUInt32BE(16));
 const saved=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).playbooks[0].plays[0],WORKSPACE_KEY);assert.deepEqual(saved,p);
 app.assertNoErrors();await app.close();
});
