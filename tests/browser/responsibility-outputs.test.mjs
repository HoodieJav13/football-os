import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir,readFile} from 'node:fs/promises';
import {createDefaultWorkspace,WORKSPACE_KEY} from '../../src/workspaceData.js';
import {useBrowser} from './harness.mjs';
const open=useBrowser();
const out='/private/tmp/football-qa';
function fixture(){const w=createDefaultWorkspace(),p=w.playbooks[0].plays[0];w.playbooks[0].plays=[p];p.name='Responsibility output stress';p.assignments=p.defenders.filter(d=>d.label==='C').map((d,i)=>({id:`area-${i}`,playerId:d.id,unit:'defense',type:'Zone',phase:'post',templateOverride:false,pace:1,delay:0,points:[[d.x,d.y],[0,20]],definition:{area:'deep-third',landmark:'',responsibilityArea:{version:1,shape:'ellipse',center:[0,45],radiusX:12,radiusY:10,label:i?'Deep right and overlap — coach editable label':'Deep left and overlap — coach editable label',color:i?'rose':'blue'}}}));return{w,p};}
async function dataTools(page){await page.locator('.playbook-trigger').click();await page.getByRole('button',{name:/Backup and export/}).click();}
for(const view of ['end','side'])test(`clean ${view} output retains complete areas, keyed legends, and actual PNG/PDF`,async()=>{
 await mkdir(out,{recursive:true});const{w,p}=fixture(),app=await open({workspace:w}),{page}=app;
 if(view==='side')await page.getByRole('button',{name:'Sideline',exact:true}).filter({visible:true}).click();
 await page.locator(`g.defender[data-player="${p.assignments[0].playerId}"]`).click();
 await page.getByRole('button',{name:'Edit area',exact:true}).click();
 await page.locator('.play-canvas').hover();await page.mouse.wheel(0,-400);
 await page.getByRole('button',{name:'Run',exact:true}).click();
 await dataTools(page);
 // Capture the real transient export canvas before the download removes it.
 await page.evaluate(()=>{window.__clean=null;new MutationObserver(()=>{const s=document.querySelector('.lesson-export svg[data-ready="true"]');if(s)window.__clean=s.outerHTML;}).observe(document.body,{childList:true,subtree:true,attributes:true});});
 const download=page.waitForEvent('download');await page.getByRole('button',{name:/Export current play as PNG/}).click();const dl=await download;await dl.saveAs(`${out}/areas-${view}.png`);
 const markup=await page.evaluate(()=>window.__clean);assert.ok(markup?.includes('responsibility-legend'));assert.ok(!/route-arrow-active|region-handle|animateMotion|<animate|class="[^"]*selected/.test(markup));assert.ok(markup.includes('C·1'));assert.ok(markup.includes('C·2'));
 const png=await readFile(`${out}/areas-${view}.png`);assert.equal(png.readUInt32BE(16),2400);assert.ok(png.readUInt32BE(20)>1600);
 await page.getByRole('button',{name:/Open PDF collection preview/}).click();
 const canvas=page.locator('.print-field svg');await canvas.locator('.responsibility-area-fill').first().waitFor();
 assert.equal(await canvas.locator('.responsibility-area-fill').count(),2);assert.equal(await canvas.locator('.responsibility-legend text').count(),2);
 assert.equal(await canvas.locator('[tabindex="0"],animateMotion,animate,.route-arrow-active,.token-hit').count(),0);
 const fits=await canvas.evaluate(svg=>{const v=svg.viewBox.baseVal;return [...svg.querySelectorAll('ellipse.responsibility-area-fill')].every(e=>{const b=e.getBBox();return b.x>=v.x&&b.y>=v.y&&b.x+b.width<=v.x+v.width&&b.y+b.height<=v.y+v.height;});});assert.ok(fits);
 await page.screenshot({path:`${out}/print-${view}.png`,fullPage:true});await page.pdf({path:`${out}/areas-${view}.pdf`,printBackground:true,preferCSSPageSize:true});
 const saved=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).playbooks[0].plays[0],WORKSPACE_KEY);assert.deepEqual(saved.assignments,p.assignments);
 app.assertNoErrors();await app.close();
});
