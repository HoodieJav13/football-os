// S6 (coaching-usability audit): on phones the rebalance result and the
// Apply/Cancel decision stay in view while the coach adjusts, and notices never
// cover controls. Ordinary flow on the fictional example Wednesday:
// late → open rebalance → adjust minutes → defer the last period → preview →
// stale refresh → Apply → Undo → Cancel → stale tap → reload/reopen.
// PROBE=1 only measures (baseline evidence); otherwise the expectations are asserted.
import { fresh, go, waitFor, reload, clock, setValue } from './lib.mjs';

const advance = (page, ms) => page.eval((m) => window.__pwpClock.advance(m), ms);
const rev = (page) => page.eval(() => Number(document.querySelector('.run-controls')?.dataset.rev));
const MIN = 60_000;

// Geometry of what the coach sees: which decision parts are fully visible, and
// which visible controls any notice covers (by hit-testing their centres).
const look = (page, label) => page.eval((lbl) => {
  const vh = window.innerHeight;
  const nav = document.querySelector('.nav');
  const navFixed = nav && getComputedStyle(nav).position === 'fixed';
  const bottomLimit = navFixed ? nav.getBoundingClientRect().top : vh;
  const chrome = document.querySelector('.chrome');
  const topLimit = chrome ? chrome.getBoundingClientRect().bottom : 0;
  const toasts = [...document.querySelectorAll('#toasts .toast, [data-run-messages] .toast')];
  const inToast = (el) => toasts.some((t) => t.contains(el));
  const coveredByToast = (el) => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    if (r.width === 0 || y < topLimit || y > bottomLimit || x < 0 || x > window.innerWidth) return false;
    const hit = document.elementFromPoint(x, y);
    return !!hit && toasts.some((t) => t.contains(hit)) && !inToast(el);
  };
  const visible = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const hit = r.width && y >= 0 && y <= vh ? document.elementFromPoint(x, y) : null;
    return { fully: r.top >= topLimit - 1 && r.bottom <= bottomLimit + 1 && r.height > 0, top: Math.round(r.top), bottom: Math.round(r.bottom), notCovered: !!hit && (el === hit || el.contains(hit) || hit.contains(el)) };
  };
  const controls = [...document.querySelectorAll('#view button, #view input, #view select, #view textarea, #view a[href], .nav a, .nav button')].filter((el) => !el.disabled && el.getClientRects().length);
  const covered = controls.filter(coveredByToast).map((el) => (el.dataset.action || el.dataset.clockAction || el.dataset.field || el.getAttribute('aria-label') || el.textContent.trim()).slice(0, 40));
  const active = document.activeElement;
  return {
    label: lbl, vh, bottomLimit: Math.round(bottomLimit), topLimit: Math.round(topLimit), scrollY: Math.round(window.scrollY),
    minutes: visible('[data-field="minutes-left"]'), status: visible('[data-rebalance-status]'), apply: visible('[data-action="apply-rebalance"]'), cancel: visible('[data-panel="rebalance"] [data-action="cancel-disrupt"]'),
    toasts: toasts.map((t) => ({ text: t.textContent.replace('✕', '').trim().slice(0, 120), top: Math.round(t.getBoundingClientRect().top), bottom: Math.round(t.getBoundingClientRect().bottom) })),
    coveredByToast: covered,
    focus: active ? (active.dataset.field || (active.dataset.defer !== undefined ? `defer-${active.dataset.defer}` : null) || active.dataset.action || active.dataset.clockAction || active.tagName) : null,
    focusVisible: active && active !== document.body ? (() => { const r = active.getBoundingClientRect(); return r.top >= topLimit - 1 && r.bottom <= bottomLimit + 1; })() : null,
  };
}, label);

export default async function (page, { viewport, log }) {
  const probe = process.env.PROBE === '1';
  const out = { viewport: viewport.name, probe, looks: [] };
  const fails = [];
  const expect = (ok, msg) => { if (!ok) fails.push(msg); };
  const snap = async (label) => { const l = await look(page, label); out.looks.push(l); return l; };

  await fresh(page, '#/plan');
  const wed = (await page.eval(() => window.__pwpDebug.project())).week.days[2];
  await go(page, `#/run/${wed.id}`, '[data-action="prepare"]');
  await page.click('[data-action="prepare"]');
  await waitFor(page, () => !!document.querySelector('[data-clock-action="start"]'), { label: 'start' });
  await page.click('[data-clock-action="start"]');
  await waitFor(page, () => Number(document.querySelector('.run-controls')?.dataset.rev) === 1, { label: 'started' });
  await advance(page, 16 * MIN);
  await page.wait(450);

  // 1. Open the rebalance choices; the coach looks at the minutes field.
  await page.click('[data-action="open-rebalance"]');
  await waitFor(page, () => !!document.querySelector('[data-panel="rebalance"]'), { label: 'panel' });
  await page.eval(() => document.querySelector('[data-field="minutes-left"]').scrollIntoView({ block: 'center' }));
  await page.wait(100);
  let l = await snap('opened, minutes field in view');
  expect(l.minutes.fully && l.status.fully && l.apply.fully && l.cancel.fully, `minutes, result and Apply/Cancel visible together when adjusting: ${JSON.stringify({ m: l.minutes, s: l.status, a: l.apply, c: l.cancel })}`);

  // 2. Adjust the minutes by keyboard: the field keeps focus and the result stays in view.
  await page.eval(() => document.querySelector('[data-field="minutes-left"]').focus());
  await setValue(page, '[data-field="minutes-left"]', '80');
  await waitFor(page, () => /of the 1:20:00 left/.test(document.querySelector('[data-rebalance-status]')?.textContent || ''), { label: 'status 80' });
  l = await snap('minutes changed to 80');
  expect(l.focus === 'minutes-left', `focus stays on the minutes field after adjusting: ${l.focus}`);
  expect(l.status.fully && l.apply.fully, `result and Apply still in view after adjusting: ${JSON.stringify({ s: l.status, a: l.apply })}`);

  // 3. Defer the last period (bottom of the list): result and actions still in view, focus kept.
  const lastIndex = await page.eval(() => { const b = [...document.querySelectorAll('[data-defer]')].pop(); b.scrollIntoView({ block: 'center' }); return b.dataset.defer; });
  await page.click(`[data-defer="${lastIndex}"]`);
  await waitFor(page, (i) => document.querySelector(`[data-defer="${i}"]`)?.checked === true, { label: 'defer last' }, lastIndex);
  l = await snap('last period moved to unfinished work');
  expect(l.status.fully && l.apply.fully && l.cancel.fully, `result and Apply/Cancel in view after deferring the last row: ${JSON.stringify({ s: l.status, a: l.apply, c: l.cancel })}`);
  expect(l.focus === `defer-${lastIndex}`, `focus stays on the checkbox that was toggled: ${l.focus}`);

  // 3b. Keyboard: Tab from the second-to-last box onto the last one; it is not hidden under the bar.
  const boxes = await page.eval(() => [...document.querySelectorAll('[data-defer]')].map((b) => b.dataset.defer));
  await page.eval(() => window.scrollTo(0, 0));
  await page.key('Tab', `[data-defer="${boxes[boxes.length - 2]}"]`);
  await page.wait(150);
  const tabbed = await page.eval(() => {
    const a = document.activeElement;
    const bar = document.querySelector('[data-decision]').getBoundingClientRect();
    const r = a.getBoundingClientRect();
    return { defer: a.dataset.defer ?? null, bottom: Math.round(r.bottom), barTop: Math.round(bar.top) };
  });
  out.tabbed = tabbed;
  expect(tabbed.defer === boxes[boxes.length - 1] && tabbed.bottom <= tabbed.barTop, `a Tab-focused box is not hidden under the decision bar: ${JSON.stringify(tabbed)}`);

  // 4. A stale preview (time passed): the warning must not cover the decision.
  await advance(page, 10 * MIN);
  const r0 = await rev(page);
  await page.click('[data-action="apply-rebalance"]');
  await page.wait(300);
  l = await snap('stale preview refreshed');
  expect((await rev(page)) === r0, 'stale preview not applied');
  expect(l.coveredByToast.length === 0, `no notice covers a control: ${l.coveredByToast.join(', ')}`);
  expect(l.status.notCovered && l.apply.notCovered, `result and Apply not covered after the refresh: ${JSON.stringify({ s: l.status, a: l.apply })}`);
  out.staleRefreshText = l.toasts.map((t) => t.text).concat([await page.text('[data-rebalance-status]')]).join(' | ');

  // 5. Apply: notices do not cover the clock controls or anything else.
  await page.click('[data-action="apply-rebalance"]');
  await waitFor(page, (r) => Number(document.querySelector('.run-controls')?.dataset.rev) === r + 1, { label: 'applied' }, r0);
  await page.wait(150);
  l = await snap('applied');
  expect(l.coveredByToast.length === 0, `no notice covers a control after Apply: ${l.coveredByToast.join(', ')}`);
  out.applyFocus = l.focus;

  // 6. Undo, then open again and Cancel: nothing changed, nothing covered.
  await page.click('[data-clock-action="undo"]');
  await waitFor(page, (r) => Number(document.querySelector('.run-controls')?.dataset.rev) === r + 2, { label: 'undone' }, r0);
  await page.click('[data-action="open-rebalance"]');
  await waitFor(page, () => !!document.querySelector('[data-panel="rebalance"]'), { label: 'panel again' });
  const before = JSON.stringify((await clock(page)).steps.map((s) => s.plannedSec));
  await page.click('[data-panel="rebalance"] [data-action="cancel-disrupt"]');
  await page.wait(150);
  l = await snap('cancelled');
  expect(JSON.stringify((await clock(page)).steps.map((s) => s.plannedSec)) === before, 'cancel changed nothing');
  expect(l.coveredByToast.length === 0, `no notice covers a control after Cancel: ${l.coveredByToast.join(', ')}`);

  // 7. A stale tap (old button): plain wording, nothing covered.
  await page.eval(() => document.querySelector('.run-controls').scrollIntoView({ block: 'center' }));
  await page.eval(() => {
    const b = document.querySelector('[data-clock-action="pause"]');
    b.click();
    window.__pwpClock.advance(1_000);
    b.click();
  });
  await page.wait(200);
  l = await snap('stale tap');
  out.staleTapText = l.toasts.map((t) => t.text).join(' | ');
  out.srLive = await page.eval(() => document.getElementById('sr-live')?.textContent || '');
  expect(/older version of the clock/.test(out.srLive), `the message is also announced to screen readers: ${out.srLive}`);
  expect(/older version of the clock/.test(out.staleTapText) && !/revision \d/.test(out.staleTapText), `stale tap explained plainly: ${out.staleTapText}`);
  expect(l.coveredByToast.length === 0, `no notice covers a control after a stale tap: ${l.coveredByToast.join(', ')}`);
  await page.screenshot('s6-after-stale-tap');

  // 8. Reopen after reload: recovered paused; the panel opens with the decision in view.
  await reload(page, `#/run/${wed.id}`);
  await waitFor(page, () => !!document.querySelector('[data-banner="recovery"]'), { label: 'recovered' });
  await page.click('[data-action="open-rebalance"]');
  await waitFor(page, () => !!document.querySelector('[data-panel="rebalance"]'), { label: 'panel after reload' });
  await page.eval(() => document.querySelector('[data-field="minutes-left"]').scrollIntoView({ block: 'center' }));
  await page.wait(100);
  l = await snap('reopened after reload');
  expect(l.minutes.fully && l.status.fully && l.apply.fully, `after reopen the decision is in view: ${JSON.stringify({ m: l.minutes, s: l.status, a: l.apply })}`);
  await page.screenshot('s6-reopened-panel');

  // 9. During a live practice, a message from a saved debrief (Carry, with Undo) shows where it was tapped.
  await page.eval(() => {
    const proj = JSON.parse(localStorage.getItem('pwp:v1:project'));
    const d = proj.week.days[2];
    proj.records = [{ id: 'rec-s6', dayId: d.id, dayLabel: d.label, dayVersion: d.version, sessionId: 'clk-old', savedWall: 1_800_000_000_000, startedWall: 1_799_999_000_000, endedWall: 1_800_000_000_000, state: 'completed', notes: 'Fictional earlier debrief.',
      steps: [{ title: d.periods[0].title, periodIds: [d.periods[0].id], originalSec: 600, plannedSec: 600, extensionSec: 0, ranMs: 600000, outcome: 'completed' }], changes: [],
      unfinished: [{ id: 'rec-s6-u1', periodId: d.periods[1].id, title: d.periods[1].title, plannedSec: 600, ranMs: 0, reason: 'deferred', carriedTo: null }] }];
    localStorage.setItem('pwp:v1:project', JSON.stringify(proj));
  });
  await reload(page, `#/run/${wed.id}`);
  await waitFor(page, () => !!document.querySelector('[data-action="carry"][data-item="rec-s6-u1"]'), { label: 'saved debrief while running' });
  await page.click('[data-action="carry"][data-item="rec-s6-u1"]');
  await waitFor(page, () => /Carried/.test([...document.querySelectorAll('.toast-text')].map((e) => e.textContent).join(' ')), { label: 'carry message' });
  await page.wait(150);
  const carryMsg = await page.eval(() => {
    const t = [...document.querySelectorAll('.toast')].find((e) => /Carried/.test(e.textContent));
    const r = t.getBoundingClientRect();
    const nav = document.querySelector('.nav');
    const navTop = nav && getComputedStyle(nav).position === 'fixed' ? nav.getBoundingClientRect().top : innerHeight;
    const top = document.querySelector('.chrome').getBoundingClientRect().bottom;
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), visible: r.top >= top - 1 && r.bottom <= navTop + 1, inSaved: !!t.closest('[data-saved-debriefs]'), undo: [...t.querySelectorAll('button')].some((b) => b.textContent === 'Undo') };
  });
  out.carryMessage = carryMsg;
  expect(carryMsg.visible && carryMsg.inSaved && carryMsg.undo, `the Carry message (with Undo) shows by the saved debrief, in view: ${JSON.stringify(carryMsg)}`);
  await page.screenshot('s6-carry-message-live');

  out.fails = fails;
  log(JSON.stringify(out));
  if (!probe) page.assert(fails.length === 0, fails.join(' || '));
  return out;
}
