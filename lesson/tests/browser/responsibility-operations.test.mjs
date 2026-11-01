import assert from 'node:assert/strict';
import test from 'node:test';
import {createDefaultWorkspace,WORKSPACE_KEY} from '../../src/workspaceData.js';
import {createConceptTemplate} from '../../src/playData.js';
import {useBrowser} from './harness.mjs';
const open=useBrowser();
function fixture(){
 const w=createDefaultWorkspace(),p=w.playbooks[0].plays[0],corners=p.defenders.filter(d=>d.label==='C'),d=corners[0];
 p.assignments=[{id:'test-area',playerId:d.id,unit:'defense',phase:'post',type:'Zone',points:[[d.x,d.y],[-18,26]],pace:1,delay:0,definition:{area:'deep-third',landmark:'',responsibilityArea:{version:1,shape:'ellipse',center:[-18,26],radiusX:8,radiusY:11,label:'Deep left',color:'blue'}}}];
 w.playbooks[0].concepts=[createConceptTemplate(p,{id:'ambiguous',name:'Duplicate corners'})];
 return {w,p,corners};
}
const stored=page=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)).playbooks[0].plays[0],WORKSPACE_KEY);
test('unsafe concept apply keeps the dialog, play, and undo history unchanged',async()=>{
 const {w}=fixture();const app=await open({workspace:w}),{page}=app;
 const before=await stored(page);assert.equal(await page.getByRole('button',{name:'Undo',exact:true}).isDisabled(),true);
 await page.getByRole('button',{name:'More',exact:true}).click();await page.getByRole('menuitem',{name:'Apply concept',exact:true}).click();
 await page.getByRole('button',{name:'Apply concept',exact:true}).click();
 assert.match(await page.getByRole('dialog').getByRole('alert').innerText(),/C.*unique labels/);
 await page.waitForTimeout(600);assert.deepEqual(await stored(page),before);
 assert.equal(await page.getByRole('button',{name:'Undo',exact:true,includeHidden:true}).isDisabled(),true);
 app.assertNoErrors();await app.close();
});
test('copy notice, path mirror, player movement and undo retain independent region data',async()=>{
 const {w,corners}=fixture();const app=await open({workspace:w}),{page}=app;
 await page.locator(`g.defender[data-player="${corners[0].id}"]`).click();
 await page.locator('.inspector-actions summary').click();
 const before=await stored(page),original=before.assignments[0].definition.responsibilityArea;
 await page.getByRole('button',{name:'Mirror path',exact:true}).click();await page.waitForTimeout(650);
 const mirrored=await stored(page);assert.notDeepEqual(mirrored.assignments[0].points,before.assignments[0].points);assert.deepEqual(mirrored.assignments[0].definition.responsibilityArea,original);
 await page.getByLabel('Copy assignment to player').selectOption(corners[1].id);
 await page.getByRole('button',{name:'Copy assignment',exact:true}).click();
 assert.match(await page.locator('.toast').innerText(),/responsibility area copied.*Adjust the area for C/);
 await page.waitForTimeout(650);const copied=await stored(page);assert.equal(copied.assignments.length,2);assert.deepEqual(copied.assignments[1].definition.responsibilityArea,original);
 await page.locator(`g.defender[data-player="${corners[1].id}"]`).click();await page.keyboard.press('ArrowRight');await page.waitForTimeout(650);
 assert.deepEqual((await stored(page)).assignments.map(a=>a.definition.responsibilityArea),[original,original]);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await page.waitForTimeout(650);
 assert.deepEqual((await stored(page)).defenders,copied.defenders);
 app.assertNoErrors();await app.close();
});
