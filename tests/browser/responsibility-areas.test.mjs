import assert from 'node:assert/strict';
import test from 'node:test';
import {createDefaultWorkspace,WORKSPACE_KEY} from '../../src/workspaceData.js';
import {useBrowser} from './harness.mjs';
const open=useBrowser();
function fixture(){
 const w=createDefaultWorkspace(),p=w.playbooks[0].plays[0],corners=p.defenders.filter(d=>d.label==='C');
 p.assignments=corners.map((d,i)=>({id:'zone-'+i,playerId:d.id,unit:'defense',phase:'post',type:'Zone',points:[[d.x,d.y],[i?18:-18,26]],pace:1,delay:0,definition:{area:'deep-third',landmark:''}}));
 return {w,p,corners};
}
const stored=page=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)).playbooks[0].plays[0],WORKSPACE_KEY);
test('author two independently owned areas, edit without changing drops, undo, persist and remove',async()=>{
 const {w,p,corners}=fixture();const app=await open({workspace:w}),{page}=app;
 await page.locator(`g.defender[data-player="${corners[0].id}"]`).click();
 assert.equal(await page.getByRole('button',{name:'Add responsibility area',exact:true}).count(),1);
 await page.getByRole('button',{name:'Add responsibility area',exact:true}).click();
 await page.getByLabel('Area label',{exact:true}).fill('Deep left');await page.getByLabel('Area label',{exact:true}).press('Tab');
 await page.getByLabel('Area width (yards)',{exact:true}).fill('16');await page.getByLabel('Area width (yards)',{exact:true}).press('Tab');
 await page.getByRole('button',{name:'Edit area',exact:true}).click();await page.keyboard.press('ArrowRight');
 await page.waitForTimeout(650);const first=await stored(page);
 assert.deepEqual(first.assignments.map(a=>a.points),p.assignments.map(a=>a.points));
 assert.equal(first.assignments[0].definition.responsibilityArea.radiusX,8);
 assert.equal(first.assignments[0].definition.responsibilityArea.center[0],-17.75);
 await page.locator('.tool-history').getByRole('button',{name:'Undo',exact:true}).click();await page.waitForTimeout(650);
 assert.equal((await stored(page)).assignments[0].definition.responsibilityArea.center[0],-18);
 await page.locator(`g.defender[data-player="${corners[1].id}"]`).click();
 await page.getByRole('button',{name:'Add responsibility area',exact:true}).click();
 await page.getByLabel('Area label',{exact:true}).fill('Deep right');await page.getByLabel('Area label',{exact:true}).press('Tab');
 await page.waitForTimeout(650);const both=await stored(page);assert.equal(both.assignments[0].definition.responsibilityArea.label,'Deep left');assert.equal(both.assignments[1].definition.responsibilityArea.label,'Deep right');
 assert.equal(await page.locator('.play-canvas .responsibility-area-fill').count(),2);
 assert.equal(await page.locator('.region-owner-key').filter({hasText:'C·1'}).count(),1);
 assert.equal(await page.locator('.region-owner-key').filter({hasText:'C·2'}).count(),1);
 await page.reload({waitUntil:'networkidle'});await page.waitForTimeout(700);assert.deepEqual((await stored(page)).assignments,both.assignments);
 await page.locator(`g.defender[data-player="${corners[1].id}"]`).click();await page.getByRole('button',{name:'Remove area',exact:true}).click();await page.waitForTimeout(650);
 const removed=await stored(page);assert.equal(removed.assignments[1].definition.responsibilityArea,undefined);assert.deepEqual(removed.assignments[1].points,p.assignments[1].points);
 app.assertNoErrors();await app.close();
});

test('handle drag is one undo step; Escape and pointer cancellation discard preview; layers lock editing',async()=>{
 const {w,corners}=fixture();const app=await open({workspace:w}),{page}=app;
 await page.locator(`g.defender[data-player="${corners[0].id}"]`).click();
 await page.getByRole('button',{name:'Add responsibility area',exact:true}).click();
 await page.getByRole('button',{name:'Edit area',exact:true}).click();
 await page.waitForTimeout(650);
 const before=(await stored(page)).assignments[0].definition.responsibilityArea;
 const handle=page.locator('[data-region-handle="center"]');
 const drag=async()=>{const b=await handle.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+25,b.y+b.height/2-15,{steps:6});};
 await drag();await page.mouse.up();await page.waitForTimeout(650);
 assert.notDeepEqual((await stored(page)).assignments[0].definition.responsibilityArea.center,before.center);
 await page.locator('.tool-history').getByRole('button',{name:'Undo',exact:true}).click();await page.waitForTimeout(650);
 assert.deepEqual((await stored(page)).assignments[0].definition.responsibilityArea,before);
 await drag();await page.keyboard.press('Escape');await page.mouse.up();await page.waitForTimeout(650);
 assert.deepEqual((await stored(page)).assignments[0].definition.responsibilityArea,before);
 await page.getByRole('button',{name:'Edit area',exact:true}).click();await drag();
 await page.locator('.canvas-workspace .field-stage').dispatchEvent('pointercancel');await page.mouse.up();await page.waitForTimeout(650);
 assert.deepEqual((await stored(page)).assignments[0].definition.responsibilityArea,before);
 await page.getByRole('button',{name:'Lock defense',exact:true}).click();assert.equal(await handle.count(),0);assert.equal(await page.locator('.play-canvas .region-owner-key[tabindex="0"]').count(),0);assert.ok(await page.getByLabel('Area width (yards)').isDisabled());
 await page.getByRole('button',{name:'Unlock defense',exact:true}).click();
 await page.getByRole('button',{name:'Hide assignments',exact:true}).click();assert.equal(await page.locator('.play-canvas .responsibility-area-fill').count(),0);assert.ok(await page.getByLabel('Area label',{exact:true}).isDisabled());
 await page.getByRole('button',{name:'Show assignments',exact:true}).click();
 await page.getByLabel('Area width (yards)').fill('');await page.getByLabel('Area width (yards)').press('Tab');assert.match(await page.getByRole('alert').last().textContent(),/positive size/);
 assert.deepEqual((await stored(page)).assignments[0].definition.responsibilityArea,before);
 await page.getByLabel('Area width (yards)').fill('14');await page.getByLabel('Area width (yards)').press('Tab');await page.waitForTimeout(650);
 assert.equal((await stored(page)).assignments[0].definition.responsibilityArea.radiusX,7);
 app.assertNoErrors();await app.close();
});

test('relabel, duplicate, remove defender and change assignment type retain independent undoable areas',async()=>{
 const {w,corners}=fixture(),app=await open({workspace:w}),{page}=app;
 await page.locator(`g.defender[data-player="${corners[0].id}"]`).click();await page.getByRole('button',{name:'Add responsibility area',exact:true}).click();await page.waitForTimeout(650);
 const original=await stored(page);
 await page.getByLabel('Position label',{exact:true}).fill('LC');await page.getByLabel('Position label',{exact:true}).press('Tab');
 assert.match(await page.locator('.play-canvas .region-owner-key').textContent(),/LC/);
 await page.getByRole('button',{name:'More',exact:true}).click();await page.getByRole('menuitem',{name:'Duplicate as variation',exact:true}).click();await page.waitForTimeout(650);
 await page.locator(`g.defender[data-player="${corners[0].id}"]`).click();await page.getByLabel('Area label',{exact:true}).fill('Independent copy');await page.getByLabel('Area label',{exact:true}).press('Tab');await page.waitForTimeout(650);
 const plays=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).playbooks[0].plays,WORKSPACE_KEY);assert.equal(plays[0].assignments[0].definition.responsibilityArea.label,'Responsibility');assert.equal(plays.at(-1).assignments[0].definition.responsibilityArea.label,'Independent copy');
 await page.getByRole('button',{name:'Man',exact:true}).click();await page.waitForTimeout(650);assert.equal(await page.locator('.play-canvas .responsibility-area-fill').count(),0);
 await page.locator('.tool-history').getByRole('button',{name:'Undo',exact:true}).click();assert.equal(await page.locator('.play-canvas .responsibility-area-fill').count(),1);
 await page.locator('summary').filter({hasText:'Player actions'}).click();await page.getByRole('button',{name:'Remove defender',exact:true}).click();await page.waitForTimeout(650);assert.equal(await page.locator('.play-canvas .responsibility-area-fill').count(),0);
 await page.locator('.tool-history').getByRole('button',{name:'Undo',exact:true}).click();assert.equal(await page.locator('.play-canvas .responsibility-area-fill').count(),1);
 assert.deepEqual((await stored(page)).assignments[0].definition.responsibilityArea,original.assignments[0].definition.responsibilityArea);
 app.assertNoErrors();await app.close();
});

test('undo and redo during a held area drag cannot reapply its stale snapshot',async()=>{
 const {w,corners}=fixture(),app=await open({workspace:w}),{page}=app;
 await page.locator(`g.defender[data-player="${corners[0].id}"]`).click();await page.getByRole('button',{name:'Add responsibility area',exact:true}).click();
 await page.getByLabel('Area width (yards)').fill('18');await page.getByLabel('Area width (yards)').press('Tab');
 await page.getByRole('button',{name:'Edit area',exact:true}).click();
 const hold=async()=>{const b=await page.locator('[data-region-handle="center"]').boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+30,b.y+b.height/2,{steps:5});};
 await hold();await page.keyboard.press('Control+z');await page.mouse.up();await page.waitForTimeout(650);
 let area=(await stored(page)).assignments[0].definition.responsibilityArea;assert.equal(area.radiusX,6);assert.deepEqual(area.center,[-18,26]);
 await hold();await page.keyboard.press('Control+Shift+z');await page.mouse.up();await page.waitForTimeout(650);
 area=(await stored(page)).assignments[0].definition.responsibilityArea;assert.equal(area.radiusX,9);assert.deepEqual(area.center,[-18,26]);
 app.assertNoErrors();await app.close();
});
