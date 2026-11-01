// J4: run a full scripted practice with controlled (fake) time: start, pause,
// resume, extend, next, a double tap, skip, undo, reload + recovery, a wall
// clock jump, the assistant view, and completion. One transition per action.
import { fresh, go, waitFor, reload, clock, toastText, overflow, smallTargets } from './lib.mjs';

const advance = (page, ms) => page.eval((m) => window.__pwpClock.advance(m), ms);
const rev = (page) => page.eval(() => Number(document.querySelector('.run-controls')?.dataset.rev));
const timeText = (page) => page.eval(() => document.querySelector('[data-clock-time]')?.textContent);
const settle = (page) => page.wait(450); // > two repaint ticks

async function act(page, action, expectRev) {
  const before = await rev(page);
  await page.click(`[data-clock-action="${action}"]`);
  await waitFor(page, (r) => Number(document.querySelector('.run-controls')?.dataset.rev) === r, { label: `${action} -> rev ${expectRev ?? before + 1}` }, expectRev ?? before + 1);
}

export default async function (page, { viewport, log }) {
  await fresh(page, '#/plan');
  const out = { viewport: viewport.name, transitions: [] };
  const p = await page.eval(() => window.__pwpDebug.project());
  const mon = p.week.days[0];
  const steps = mon.periods.filter((x) => x.scheduled).length;
  await go(page, `#/run/${mon.id}`, '[data-action="prepare"]');
  await page.click('[data-action="prepare"]');
  await waitFor(page, () => !!document.querySelector('[data-clock-action="start"]'), { label: 'start button' });
  page.assert((await timeText(page)) === '10:00', 'idle shows the first planned duration');

  await act(page, 'start', 1);
  await page.wait(300);
  const when = await page.text('[data-next-when]');
  page.assert(/in about 10:00/.test(when || ''), `next period shows when it starts: ${when}`);
  await advance(page, 4 * 60_000);
  await settle(page);
  page.assert((await timeText(page)) === '06:00', `4 min in: ${await timeText(page)}`);
  await act(page, 'pause', 2);
  await advance(page, 2 * 60_000);
  await settle(page);
  page.assert((await timeText(page)) === '06:00', 'paused time is frozen');
  await act(page, 'resume', 3);
  await act(page, 'extend-60', 4);
  await settle(page);
  page.assert((await timeText(page)) === '07:00', `after +1 min: ${await timeText(page)}`);
  // Overrun shows but does not advance.
  await advance(page, 8 * 60_000);
  await settle(page);
  const over = await page.eval(() => ({ t: document.querySelector('[data-clock-time]').textContent, s: document.querySelector('[data-clock-status]').textContent }));
  page.assert(over.t === '+01:00' && /OVER/.test(over.s), `overrun ${JSON.stringify(over)}`);
  page.assert((await clock(page)).index === 0, 'timer did not advance by itself');

  // A real double tap: two quick taps on Next. The second lands on the freshly
  // rendered button (fresh revision) and is ignored by the double-tap guard.
  await page.click('[data-clock-action="next"]');
  await page.click('[data-clock-action="next"]');
  let dbl = await page.eval(() => { const c = window.__pwpDebug.clock(); return { rev: c.rev, done: c.steps.filter((s) => s.status === 'done').length, index: c.index }; });
  page.assert(dbl.rev === 5 && dbl.done === 1 && dbl.index === 1, `double tap made one transition ${JSON.stringify(dbl)}`);
  page.assert(/Ignored a second tap/.test(await toastText(page)), 'second tap is reported as ignored');
  out.transitions.push('real double tap on Next: 1 transition');

  // A stale button (rendered before the last action) is refused by revision.
  await advance(page, 1_000);
  dbl = await page.eval(() => {
    const b = document.querySelector('[data-clock-action="pause"]');
    b.click(); // accepted: pause
    window.__pwpClock.advance(1_000); // past the double-tap window, so the revision check decides
    b.click(); // same detached button, old revision: rejected
    const c = window.__pwpDebug.clock();
    return { rev: c.rev, state: c.state };
  });
  page.assert(dbl.rev === 6 && dbl.state === 'paused', `stale tap refused ${JSON.stringify(dbl)}`);
  page.assert(/older version of the clock/.test(await toastText(page)), 'stale tap is reported in plain words');
  out.transitions.push('stale button: refused by revision');
  await advance(page, 1_000);
  await act(page, 'resume', 7);

  // Skip then undo. Running time on this period so far: 1 s before the pause + 29 s = 30 s.
  await advance(page, 29_000);
  await act(page, 'skip', 8);
  let c = await clock(page);
  page.assert(c.steps[1].status === 'skipped' && c.index === 2, 'skip');
  await act(page, 'undo', 9);
  c = await clock(page);
  page.assert(c.steps[1].status === 'active' && c.index === 1 && c.history.length === 7, `undo skip ${JSON.stringify(c.steps.map((s) => s.status))} history ${c.history.length}`);
  await settle(page);
  page.assert((await timeText(page)) === '09:30', `undo kept the real elapsed time: ${await timeText(page)}`);

  // Wall clock jumps back an hour: elapsed is unchanged, a notice explains.
  await page.eval(() => window.__pwpClock.shiftWall(-3_600_000));
  await settle(page);
  page.assert((await timeText(page)) === '09:30', 'wall clock change did not change elapsed');
  page.assert(await page.eval(() => !document.querySelector('[data-anomaly]').hidden), 'anomaly notice shown');

  // Run a little, let the 5 s checkpoint land, then reload mid-period.
  await advance(page, 75_000);
  await settle(page);
  await advance(page, 5_000);
  await settle(page);
  const beforeReload = await timeText(page);
  const revBefore = (await clock(page)).rev;
  await page.screenshot('j4-clock-running');
  await reload(page, `#/run/${mon.id}`);
  await waitFor(page, () => !!document.querySelector('[data-banner="recovery"]'), { label: 'recovery banner' });
  c = await clock(page);
  page.assert(c.state === 'paused' && c.recovery && c.recovery.wasState === 'running', `recovered paused ${c.state}`);
  page.assert(c.steps[0].status === 'done' && c.steps.filter((s) => s.status === 'done').length === 1, 'no period completed twice after reload');
  await settle(page);
  const afterReload = await timeText(page);
  page.assert(afterReload === beforeReload, `recovered at the checkpoint: before ${beforeReload}, after ${afterReload}`);
  await page.screenshot('j4-clock-recovered');
  out.recovery = { beforeReload, afterReload, revBefore, revAfter: c.rev };
  await page.click('[data-action="recover-resume"]');
  await waitFor(page, () => window.__pwpDebug.clock().state === 'running', { label: 'resumed' });
  page.assert(!(await page.exists('[data-banner="recovery"]')), 'banner cleared after resume');

  // Assistant view in the same tab: next card visible.
  await go(page, `#/assist/${mon.id}`, '.run-assist');
  page.assert(await page.exists('[data-next]'), 'next period shown');
  out.assistNextCard = await page.exists('.run-card-next');
  await page.screenshot('j4-assistant');
  out.assistOverflow = await overflow(page);
  page.assert(out.assistOverflow.ok, `assistant overflow ${JSON.stringify(out.assistOverflow)}`);

  // Finish the practice from the assistant view: one transition per Next.
  await go(page, `#/run/${mon.id}`, '.run-controls');
  out.smallTargets = await smallTargets(page);
  page.assert(out.smallTargets.length === 0, `small targets: ${out.smallTargets.join('; ')}`);
  for (let i = 0; i < steps; i++) {
    const cc = await clock(page);
    if (cc.state === 'completed') break;
    await advance(page, 60_000);
    await act(page, 'next', cc.rev + 1);
  }
  c = await clock(page);
  page.assert(c.state === 'completed', `completed ${c.state}`);
  page.assert(c.steps.every((s) => s.status === 'done' || s.status === 'skipped'), 'every step ended');
  page.assert(c.steps.filter((s) => s.status === 'done').length === steps, 'each step completed exactly once');
  page.assert(await page.exists('.run-summary'), 'summary table');
  out.final = { rev: c.rev, history: c.history.length, steps };
  out.overflow = await overflow(page);
  page.assert(out.overflow.ok, `overflow ${JSON.stringify(out.overflow)}`);
  await page.screenshot('j4-completed');

  // Reset is explicit (confirm) and undoable.
  await page.click('[data-clock-action="reset"]');
  await waitFor(page, () => document.getElementById('confirm').open, { label: 'reset confirm' });
  await page.click('#confirm [data-confirm="ok"]');
  await waitFor(page, () => window.__pwpDebug.clock().state === 'idle', { label: 'reset' });
  await act(page, 'undo');
  page.assert((await clock(page)).state === 'completed', 'undo reset');
  log(JSON.stringify(out));
  return out;
}
