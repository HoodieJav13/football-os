// C1: the real run → disruption → coach choice → rebalanced continuation →
// debrief → reopen flow, through the run screen's own controls, with the
// controllable test clock. Fictional example week, Wednesday (two parallel stations).
import { fresh, go, waitFor, reload, clock, project, setValue, toastText } from './lib.mjs';

const advance = (page, ms) => page.eval((m) => window.__pwpClock.advance(m), ms);
const rev = (page) => page.eval(() => Number(document.querySelector('.run-controls')?.dataset.rev));
const settle = (page) => page.wait(450);
const MIN = 60_000;

async function clickAndRev(page, selector, label) {
  const before = await rev(page);
  await page.click(selector);
  await waitFor(page, (r) => Number(document.querySelector('.run-controls')?.dataset.rev) === r, { label: `${label} -> rev ${before + 1}` }, before + 1);
}
const script = (c) => c.steps.map((s) => ({ ids: s.periodIds.join('+'), planned: s.plannedSec, original: s.originalSec ?? null, status: s.status }));

export default async function (page, { viewport, log }) {
  const out = { viewport: viewport.name };
  await fresh(page, '#/plan');
  const p0 = await project(page);
  const wed = p0.week.days[2];
  const thu = p0.week.days[3];
  await go(page, `#/run/${wed.id}`, '[data-action="prepare"]');
  await page.click('[data-action="prepare"]');
  await waitFor(page, () => !!document.querySelector('[data-clock-action="start"]'), { label: 'start button' });
  page.assert(await page.exists('[data-disrupt]'), 'disruption tools are offered before the start');
  await clickAndRev(page, '[data-clock-action="start"]', 'start');
  const plan0 = script(await clock(page));

  // 1. A late period: the 10-minute warm-up runs 16 minutes.
  await advance(page, 16 * MIN);
  await settle(page);
  const late = await page.eval(() => { const b = document.querySelector('[data-late]'); return { shown: b && !b.hidden, text: b?.textContent || '' }; });
  page.assert(late.shown && /about 6 min behind the plan/.test(late.text), `late notice ${JSON.stringify(late)}`);
  page.assert((await clock(page)).steps[0].status === 'active', 'nothing advanced or changed on its own');
  out.late = late.text.slice(0, 160);
  await page.screenshot('c1-late-notice');

  // 2. Coach opens the rebalance choices, sees the preview, cancels: nothing changes.
  await page.click('[data-action="open-rebalance-late"]');
  await waitFor(page, () => !!document.querySelector('[data-panel="rebalance"]'), { label: 'rebalance panel' });
  const minutesDefault = await page.eval(() => document.querySelector('[data-field="minutes-left"]').value);
  page.assert(minutesDefault === '104', `minutes left to the planned end: ${minutesDefault}`);
  // The end the coach sets is a fixed point: 5 minutes of deliberating later, 5 fewer minutes are left.
  await setValue(page, '[data-field="minutes-left"]', '80');
  await waitFor(page, () => /of the 1:20:00 left/.test(document.querySelector('[data-rebalance-status]')?.textContent || ''), { label: 'status for 80 min' });
  await advance(page, 5 * MIN);
  await page.click('[data-defer="2"]');
  await waitFor(page, () => document.querySelector('[data-defer="2"]')?.checked === true, { label: 'defer toggled' });
  const anchored = await page.text('[data-rebalance-status]');
  page.assert(/of the 1:15:00 left/.test(anchored), `minutes left count down while the panel is open: ${anchored}`);
  // A preview that went stale (10 more minutes passed, so the plan that fits
  // changed) is not applied: the coach sees the update first.
  await advance(page, 10 * MIN);
  const revBefore = await rev(page);
  await page.click('[data-action="apply-rebalance"]');
  await page.wait(300);
  page.assert((await rev(page)) === revBefore && /time left changed/i.test(await toastText(page)), 'a stale preview is refreshed, not applied');
  out.anchoring = anchored;
  await page.click('[data-action="cancel-disrupt"]');
  await page.wait(150);
  page.assert(JSON.stringify(script(await clock(page))) === JSON.stringify(plan0) && !(await page.exists('[data-panel="rebalance"]')), 'cancel left the plan unchanged');

  // 3. Only 80 minutes of field time left: shorten to fit and move one period to unfinished work.
  await page.click('[data-action="open-rebalance"]');
  await waitFor(page, () => !!document.querySelector('[data-panel="rebalance"]'), { label: 'rebalance panel' });
  await setValue(page, '[data-field="minutes-left"]', '80');
  await waitFor(page, () => document.querySelector('[data-field="minutes-left"]')?.value === '80', { label: 'minutes applied' });
  const situationsIndex = (await clock(page)).steps.findIndex((s) => /Situations/.test(s.title));
  await page.click(`[data-defer="${situationsIndex}"]`);
  await waitFor(page, (i) => document.querySelector(`[data-defer="${i}"]`)?.checked === true, { label: 'defer checked' }, situationsIndex);
  const preview = await page.eval(() => ({
    rows: [...document.querySelectorAll('[data-rebalance-row]')].map((r) => ({ i: Number(r.dataset.rebalanceRow), after: r.querySelector('[data-after]').textContent, cls: r.className })),
    status: document.querySelector('[data-rebalance-status]').textContent,
  }));
  page.assert(/^Fits/.test(preview.status) && preview.rows.some((r) => r.cls === 'is-shortened') && preview.rows.some((r) => r.cls === 'is-deferred'), `preview ${JSON.stringify(preview)}`);
  await page.screenshot('c1-rebalance-preview');
  await clickAndRev(page, '[data-action="apply-rebalance"]', 'apply rebalance');
  let c = await clock(page);
  const applied = script(c);
  const toSec = (t) => { const [m, s] = t.split(':').map(Number); return m * 60 + s; };
  page.assert(preview.rows.filter((r) => r.cls !== 'is-deferred').every((r) => applied.find((_, k) => k === r.i - (r.i > situationsIndex ? 1 : 0))?.planned === toSec(r.after)), `applied durations equal the preview ${JSON.stringify({ preview: preview.rows, applied })}`);
  page.assert(c.unfinished.length === 1 && c.unfinished[0].reason === 'deferred' && /Situations/.test(c.unfinished[0].title), `deferred work kept ${JSON.stringify(c.unfinished)}`);
  page.assert(c.steps.every((s) => s.plannedSec >= 60) && c.steps[0].elapsedMs >= 16 * MIN, 'no negative periods; the running period kept its time');
  const totalAfterCurrent = c.steps.slice(1).reduce((a, s) => a + s.plannedSec, 0);
  page.assert(totalAfterCurrent <= 80 * 60, `remaining periods fit the 80 minutes left: ${totalAfterCurrent}`);
  out.rebalance = { preview: preview.status, applied: applied.map((x) => x.planned / 60), unfinished: c.unfinished.map((u) => u.title) };

  // 4. Undo restores the plan exactly; the coach then re-applies the same choice.
  await clickAndRev(page, '[data-clock-action="undo"]', 'undo rebalance');
  c = await clock(page);
  page.assert(JSON.stringify(script(c).map((x) => [x.ids, x.planned])) === JSON.stringify(plan0.map((x) => [x.ids, x.planned])) && c.unfinished.length === 0 && c.changes.length === 0, 'undo restored the previous plan');
  await page.click('[data-action="open-rebalance"]');
  await waitFor(page, () => !!document.querySelector('[data-panel="rebalance"]'), { label: 'rebalance panel again' });
  await setValue(page, '[data-field="minutes-left"]', '80');
  await waitFor(page, () => document.querySelector('[data-field="minutes-left"]')?.value === '80', { label: 'minutes applied' });
  await page.click(`[data-defer="${situationsIndex}"]`);
  await waitFor(page, (i) => document.querySelector(`[data-defer="${i}"]`)?.checked === true, { label: 'defer checked' }, situationsIndex);
  await clickAndRev(page, '[data-action="apply-rebalance"]', 're-apply rebalance');
  page.assert(JSON.stringify(script(await clock(page))) === JSON.stringify(applied), 'the same choice gives the same plan');

  // 5. Advance to the parallel stations; one of them becomes unavailable mid-period.
  await clickAndRev(page, '[data-clock-action="next"]', 'next (warm-up done)');
  for (let guard = 0; guard < 10; guard++) {
    c = await clock(page);
    if (c.steps[c.index].periodIds.length > 1) break;
    await advance(page, c.steps[c.index].plannedSec * 1000);
    await clickAndRev(page, '[data-clock-action="next"]', 'next');
  }
  c = await clock(page);
  const block = c.steps[c.index];
  page.assert(block.periodIds.length === 2, `reached the parallel stations ${JSON.stringify(block)}`);
  await advance(page, 3 * MIN);
  await page.click('[data-action="open-station"]');
  await waitFor(page, () => !!document.querySelector('[data-panel="station"]'), { label: 'station panel' });
  await setValue(page, '[data-field="station"]', block.periodIds[1]);
  await waitFor(page, () => /gets its own/.test(document.querySelector('[data-station-effect]')?.textContent || ''), { label: 'station effect (run later)' });
  await page.screenshot('c1-station-panel');
  await clickAndRev(page, '[data-action="apply-station"]', 'apply station change');
  c = await clock(page);
  const cur = c.steps[c.index];
  const moved = c.steps[c.index + 1];
  page.assert(cur.periodIds.length === 1 && cur.removed?.[0]?.periodId === block.periodIds[1] && moved.periodIds[0] === block.periodIds[1] && moved.origin === 'moved', `station runs later today ${JSON.stringify({ cur, moved })}`);
  page.assert(cur.elapsedMs >= 3 * MIN, 'the remaining station kept its time');
  out.station = { now: cur.title, later: moved.title, changes: c.changes.map((x) => x.summary) };

  // 6. Interruption: reload mid-practice. The clock recovers paused with every change.
  const beforeReload = { script: script(c), unfinished: c.unfinished, changes: c.changes };
  await reload(page, `#/run/${wed.id}`);
  await waitFor(page, () => !!document.querySelector('[data-banner="recovery"]'), { label: 'recovery banner' });
  c = await clock(page);
  page.assert(c.state === 'paused' && JSON.stringify(script(c)) === JSON.stringify(beforeReload.script) && JSON.stringify(c.unfinished) === JSON.stringify(beforeReload.unfinished) && JSON.stringify(c.changes) === JSON.stringify(beforeReload.changes), 'reload kept the revised script, unfinished work and change log');
  page.assert(await page.exists('[data-live-changes]'), 'changes and unfinished work stay visible during practice');
  await clickAndRev(page, '[data-action="recover-resume"]', 'resume after reload');

  // 7. Finish: one period ends early, the rest run their (possibly shortened) time.
  let endedEarly = false;
  for (let guard = 0; guard < 20; guard++) {
    c = await clock(page);
    if (c.state === 'completed') break;
    const st = c.steps[c.index];
    const left = st.plannedSec * 1000 + st.extensionSec * 1000 - st.elapsedMs;
    if (!endedEarly && c.index > 0 && !st.originalSec && st.periodIds.length === 1 && st.plannedSec >= 300) { await advance(page, 2 * MIN); endedEarly = true; } else await advance(page, Math.max(1000, left));
    await clickAndRev(page, '[data-clock-action="next"]', 'next');
  }
  c = await clock(page);
  page.assert(c.state === 'completed', 'practice completed');
  await waitFor(page, () => !!document.querySelector('[data-summary]'), { label: 'summary' });
  const summary = await page.eval(() => ({
    outcomes: [...document.querySelectorAll('[data-outcome]')].map((r) => r.dataset.outcome),
    unfinished: [...document.querySelectorAll('[data-unfinished] li')].map((li) => li.textContent),
    plan: document.querySelectorAll('[data-original-plan] li').length,
    changes: document.querySelectorAll('.run-summary .change-log li').length,
  }));
  page.assert(summary.outcomes.includes('shortened') && summary.outcomes.includes('ended-early') && summary.outcomes.includes('completed'), `outcomes distinguish shortening, early end and completion ${JSON.stringify(summary.outcomes)}`);
  page.assert(summary.unfinished.length === 1 && /Situations/.test(summary.unfinished[0]) && summary.plan === plan0.length && summary.changes === 2, `unfinished work, original plan and change log ${JSON.stringify(summary)}`);
  out.summary = summary;

  // 8. Debrief: the draft survives a reload, then is saved; unfinished work is carried to Thursday.
  const NOTES = 'Fictional debrief: stations needed more space; Situations carried to Thursday.';
  await setValue(page, '[data-field="debrief-notes"]', NOTES);
  await page.wait(200);
  await reload(page, `#/run/${wed.id}`);
  await waitFor(page, () => !!document.querySelector('[data-field="debrief-notes"]'), { label: 'debrief after reload' });
  page.assert((await page.eval(() => document.querySelector('[data-field="debrief-notes"]').value)) === NOTES, 'debrief draft survived the reload');
  await page.click('[data-action="save-debrief"]');
  await waitFor(page, () => !!document.querySelector('[data-saved-debriefs] [data-record-notes]'), { label: 'saved debrief' });
  let p = await project(page);
  page.assert(p.records.length === 1 && p.records[0].notes === NOTES && p.records[0].unfinished.length === 1, `debrief record ${JSON.stringify(p.records.map((r) => ({ n: r.notes, u: r.unfinished.length })))}`);
  const item = p.records[0].unfinished[0];
  await setValue(page, `[data-carry-day="${item.id}"]`, thu.id);
  await page.click(`[data-action="carry"][data-item="${item.id}"]`);
  await waitFor(page, () => !!document.querySelector('[data-carried]'), { label: 'carried' });
  p = await project(page);
  const thuAfter = p.week.days.find((d) => d.id === thu.id);
  const added = thuAfter.periods.find((x) => x.id === p.records[0].unfinished[0].carriedTo?.periodId);
  page.assert(added && added.scheduled === false && /Carried over from Wednesday/.test(added.notes) && thuAfter.version === thu.version + 1, `carried to Thursday as an unscheduled period ${JSON.stringify(added)}`);
  page.assert(/Carried/.test(await toastText(page)), 'carry is announced with Undo');
  await page.screenshot('c1-debrief-saved');

  // 9. Reopen: a fresh page load shows the saved debrief and the handoff state.
  await reload(page, `#/run/${wed.id}`);
  await waitFor(page, () => !!document.querySelector('[data-saved-debriefs]'), { label: 'saved debriefs after reload' });
  const reopened = await page.eval(() => ({ notes: document.querySelector('[data-record-notes]')?.textContent, carried: !!document.querySelector('[data-carried]') }));
  page.assert(reopened.notes === NOTES && reopened.carried, `reopened ${JSON.stringify(reopened)}`);

  // 10. Export → import keeps the record; a malformed record is refused before anything changes.
  const rt = await page.eval(async () => {
    const P = await import('/src/domain/project.js');
    const text = window.__pwpDebug.exportText();
    const back = P.importProject(text);
    const bad = JSON.parse(text);
    bad.records[0].unfinished[0].reason = 'vanished';
    return { ok: back.ok, same: JSON.stringify(back.project.records) === JSON.stringify(window.__pwpDebug.project().records), badText: JSON.stringify(bad) };
  });
  page.assert(rt.ok && rt.same, 'export/import keeps the saved debrief');
  const snapshot = () => page.eval(() => JSON.stringify({ p: localStorage.getItem('pwp:v1:project'), c: localStorage.getItem('pwp:v1:clock') }));
  await page.wait(600);
  const before = await snapshot();
  await go(page, '#/data', '[data-import-text]');
  await setValue(page, '[data-import-text]', rt.badText);
  await page.click('[data-action="import-text"]');
  await page.wait(300);
  const msg = await page.text('[data-import-result]');
  await page.wait(600);
  page.assert(/Nothing was imported/.test(msg) && /records\[0\]\.unfinished\[0\]\.reason/.test(msg) && (await snapshot()) === before, `malformed debrief refused atomically: ${msg.slice(0, 200)}`);
  out.reopenAndImport = { reopened: true, roundTrip: true, refused: msg.slice(0, 120) };
  await go(page, `#/run/${wed.id}`, '[data-saved-debriefs]');
  await page.screenshot('c1-reopened');
  log(JSON.stringify(out));
  return out;
}
