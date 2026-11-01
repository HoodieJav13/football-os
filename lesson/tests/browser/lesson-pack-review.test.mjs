import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultWorkspace } from '../../src/workspaceData.js';
import { createCover3Lesson } from '../../src/cover3Lesson.js';
import { useBrowser } from './harness.mjs';
const open = useBrowser();
const openPack = async page => {
  await page.getByRole('button', {name:'More',exact:true}).click();
  await page.getByRole('menuitem', {name:'Lesson pack',exact:true}).click();
  await page.locator('.lesson-pack').waitFor();
};
const closePack = async page => {
  await page.getByRole('button', {name:'Close',exact:true}).click();
  await page.locator('.lesson-pack').waitFor({state:'detached'});
};

test('a phone swipe over the static Identify field scrolls to the next learner card', async () => {
  const workspace=createDefaultWorkspace();workspace.playbooks[0].plays=[createCover3Lesson('phone-swipe')];
  const app=await open({workspace,viewport:{width:390,height:844},touch:true}),{page}=app;
  await openPack(page);
  await page.getByRole('button',{name:'Player cards',exact:true}).click();
  await page.locator('.lesson-pack').evaluate(async element => {
    await Promise.all(element.getAnimations().map(animation=>animation.finished.catch(()=>{})));
    element.scrollTop=0;
  });
  const field=await page.locator('.identify-card .field-stage').first().boundingBox();
  const x=field.x+field.width/2, y=Math.min(740,field.y+field.height-20);
  const session=await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
  for(let step=1;step<=10;step++) {
    await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-step*30,id:1}]});
    await page.waitForTimeout(20);
  }
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForTimeout(200);
  assert.ok(await page.locator('.lesson-pack').evaluate(element=>element.scrollTop)>150,'swiping the field reaches more cards');
  app.assertNoErrors();await app.close();
});

test('preview has a scoped print root, cleans it up and never persists its snapshot', async () => {
  const workspace=createDefaultWorkspace();workspace.playbooks[0].plays=[createCover3Lesson('body-scope')];
  const app=await open({workspace}),{page}=app;
  const storage=()=>page.evaluate(()=>JSON.stringify(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)])));
  const before=await storage();await openPack(page);
  assert.equal(await page.locator('body.lesson-pack-open').count(),1);
  await closePack(page);
  assert.equal(await page.locator('body.lesson-pack-open').count(),0);
  assert.equal(await storage(),before);
  app.assertNoErrors();await app.close();
});

test('identical play ids in different playbooks never reuse another book’s answer snapshot', async () => {
  const workspace=createDefaultWorkspace(),first=createCover3Lesson('same-id','First diagram');
  workspace.playbooks[0].plays=[first];
  const second=createCover3Lesson('same-id','Second diagram');
  second.assignments[0].definition.responsibilityArea.label='Second authored area';
  workspace.playbooks.push({...workspace.playbooks[0],id:'second-lesson-book',name:'Second lesson book',isMain:false,readOnly:false,plays:[second]});
  const app=await open({workspace}),{page}=app;
  await openPack(page);assert.equal(await page.locator('.lesson-sheet header strong').textContent(),'First diagram');
  await closePack(page);
  await page.getByRole('button',{name:/^Playbook /}).click();
  await page.getByRole('menuitem',{name:/Second lesson book/}).click();
  await openPack(page);
  assert.equal(await page.locator('.lesson-sheet header strong').textContent(),'Second diagram');
  assert.match(await page.locator('.lesson-pack-status').textContent(),/Current/);
  app.assertNoErrors();await app.close();
});

test('removing every authored assignment keeps the old key reachable and stale, then regenerates an honest empty key', async () => {
  const workspace=createDefaultWorkspace(),source=createCover3Lesson('removed-all');workspace.playbooks[0].plays=[source];
  const app=await open({workspace}),{page}=app;
  await openPack(page);await closePack(page);
  for (const assignment of source.assignments) {
    await page.locator(`.canvas-workspace g.defender[data-player="${assignment.playerId}"]`).click();
    const actions=page.locator('.inspector details').filter({has:page.getByText('Player actions',{exact:true})});
    if (!await actions.evaluate(element=>element.open)) await actions.locator('summary').click();
    await page.getByRole('button',{name:'Delete assignment',exact:true}).click();
  }
  await openPack(page);
  assert.match(await page.locator('.lesson-pack-status').textContent(),/Stale/);
  await page.getByRole('button',{name:'Coach key',exact:true}).click();
  assert.equal(await page.locator('.coach-key tbody tr').count(),7);
  await page.getByRole('button',{name:'Regenerate',exact:true}).click();
  assert.match(await page.locator('.lesson-pack-status').textContent(),/Current/);
  assert.equal(await page.locator('.coach-key tbody tr').count(),0);
  assert.match(await page.locator('.coach-key-issues').textContent(),/no authored responsibility areas/);
  assert.match(await page.locator('.coach-key-coverage').textContent(),/No responsibility is inferred/);
  app.assertNoErrors();await app.close();
});
