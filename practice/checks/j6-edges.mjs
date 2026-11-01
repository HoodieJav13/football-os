// J6: validation errors, hostile/long text, empty states, a storage failure,
// a competing browsing context (same-origin iframe = second tab stand-in) with
// read-only follow, takeover and a revision conflict, and unavailable groups.
import { fresh, go, waitFor, setValue, clickText, project, overflow, toastText } from './lib.mjs';

const HOSTILE_TITLE = `<img src=x onerror="window.__pwned=1">${'W'.repeat(80)}`;
const HOSTILE_NOTES = `<script>window.__pwned=2</script> ${'N'.repeat(1900)} </textarea><b>end</b>`;
const HOSTILE_OPP = 'FICTIONAL "><svg onload=window.__pwned=3> Opp';

export default async function (page, { viewport, log }) {
  await page.raw('Page.setDownloadBehavior', { behavior: 'deny' }).catch(() => {});
  await fresh(page, '#/plan');
  const out = { viewport: viewport.name };
  const p0 = await project(page);
  const mon = p0.week.days[0];

  // 1. Validation errors keep the editor open; cancel with changes asks first.
  await page.click('[data-action="add-period"]');
  await waitFor(page, () => document.getElementById('editor').open, { label: 'editor' });
  await setValue(page, '#editor [data-field="minutes"]', '0');
  await page.click('#editor [data-action="save"]');
  const errs = await page.eval(() => document.querySelector('#editor [data-errors]').textContent);
  page.assert(/Title is required/.test(errs) && /Duration must be/.test(errs), `validation ${errs}`);
  page.assert(await page.eval(() => document.getElementById('editor').open), 'editor stays open on errors');
  await page.click('#editor [data-action="cancel"]');
  await waitFor(page, () => document.getElementById('confirm').open, { label: 'discard confirm' });
  await page.click('#confirm [data-confirm="ok"]');
  await waitFor(page, () => !document.getElementById('editor').open, { label: 'editor closed' });
  page.assert((await project(page)).week.days[0].periods.length === mon.periods.length, 'cancel added nothing');

  // 2. Hostile and long text renders as text, with no layout escape.
  await page.click('[data-action="add-period"]');
  await waitFor(page, () => document.getElementById('editor').open, { label: 'editor' });
  await setValue(page, '#editor [data-field="title"]', HOSTILE_TITLE);
  await setValue(page, '#editor [data-field="notes"]', HOSTILE_NOTES);
  await page.click('#editor [data-action="save"]');
  await waitFor(page, () => !document.getElementById('editor').open, { label: 'saved hostile period' });
  await page.eval(() => { document.querySelector('[data-key="week-details"]').open = true; });
  await setValue(page, 'input[name="opponent"]', HOSTILE_OPP);
  await clickText(page, '[data-key="week-details"] button', 'Save week details');
  await page.wait(300);
  const safe = await page.eval((t) => ({
    pwned: window.__pwned ?? null,
    titleShown: [...document.querySelectorAll('.pr-title')].some((e) => e.textContent === t),
    injectedImg: !!document.querySelector('#view img, #app img'),
    injectedSvgOnload: [...document.querySelectorAll('svg')].some((s) => s.hasAttribute('onload')),
    oppShown: document.querySelector('.meta-opponent')?.textContent,
  }), HOSTILE_TITLE);
  page.assert(safe.pwned === null && safe.titleShown && !safe.injectedImg && !safe.injectedSvgOnload && safe.oppShown === HOSTILE_OPP, `hostile text ${JSON.stringify(safe)}`);
  out.hostile = safe;
  out.overflowHostile = await overflow(page);
  page.assert(out.overflowHostile.ok, `overflow with long text ${JSON.stringify(out.overflowHostile)}`);
  await page.eval(() => [...document.querySelectorAll('.pr-title')].pop().scrollIntoView({ block: 'center' }));
  await page.screenshot('j6-hostile-long-text');
  await go(page, `#/print/day/${mon.id}`, '.print-root .sheet');
  const sheetFit = await page.eval(() => [...document.querySelectorAll('.print-root .sheet-body')].every((b) => b.scrollHeight <= b.clientHeight + 1));
  page.assert(sheetFit, 'printed script with long notes fits its pages');
  page.assert((await page.eval(() => window.__pwned ?? null)) === null, 'print view stays safe');

  // 3. Storage failure: the plan stays usable and the error is visible.
  await go(page, `#/plan/${mon.id}`, '.day-plan');
  await page.eval(() => {
    window.__realSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function () { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); };
  });
  const first = await page.eval(() => document.querySelector('.script > .period-row').dataset.periodId);
  await page.click(`[data-focus="down-${first}"]`);
  await waitFor(page, () => document.querySelector('#save-state')?.dataset.state === 'error', { label: 'save error state', timeout: 4000 });
  page.assert(await page.exists('[data-banner="storage-error"]'), 'storage error banner');
  page.assert(await page.eval((id) => document.querySelectorAll('.script > .period-row')[1].dataset.periodId === id, first), 'edit kept in memory');
  await page.screenshot('j6-storage-error');
  await page.eval(() => { Storage.prototype.setItem = window.__realSetItem; });
  await clickText(page, '[data-banner="storage-error"] button', 'Try saving again');
  await waitFor(page, () => document.querySelector('#save-state')?.dataset.state === 'saved', { label: 'saved after recovery' });
  out.storageError = 'shown, plan usable, recovered';

  // 3b. Only the plan write fails; a later successful clock write must not hide it.
  await page.eval(() => {
    window.__realSetItem2 = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'pwp:v1:project') throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      return window.__realSetItem2.call(this, k, v);
    };
  });
  const firstNow2 = await page.eval(() => document.querySelector('.script > .period-row').dataset.periodId);
  await page.click(`[data-focus="down-${firstNow2}"]`);
  await waitFor(page, () => document.querySelector('#save-state')?.dataset.state === 'error', { label: 'plan save error' });
  await go(page, `#/run/${mon.id}`, '[data-action="prepare"]');
  await page.click('[data-action="prepare"]'); // writes the clock successfully
  await waitFor(page, () => !!document.querySelector('[data-clock-action="start"]'), { label: 'clock set up' });
  page.assert(await page.eval(() => document.querySelector('#save-state').dataset.state === 'error' && !!document.querySelector('[data-banner="storage-error"]')), 'plan error still shown after a successful clock write');
  await page.eval(() => { Storage.prototype.setItem = window.__realSetItem2; });
  await clickText(page, '[data-banner="storage-error"] button', 'Try saving again');
  await waitFor(page, () => document.querySelector('#save-state')?.dataset.state === 'saved', { label: 'saved after retry' });
  out.saveErrorsSeparate = true;

  // 3c. Deleting the day that owns the clock: other days are not blocked, export stays importable, undo brings it back.
  await page.click('[data-clock-action="start"]');
  await go(page, '#/plan', '.week-strip');
  await page.click(`.day-tile[data-day-id="${mon.id}"] button[aria-label^="Delete"]`);
  await waitFor(page, (id) => !window.__pwpDebug.project().week.days.some((d) => d.id === id), { label: 'day deleted' }, mon.id);
  const tue2 = (await project(page)).week.days[0];
  await go(page, `#/run/${tue2.id}`, '.run-head');
  page.assert(!(await page.eval(() => /in progress for/.test(document.querySelector('#view').textContent))), 'a deleted day’s clock does not block other days');
  const exp = await page.eval(async () => {
    const P = await import('/src/domain/project.js');
    const r = P.importProject(window.__pwpDebug.exportText());
    return { ok: r.ok, clock: r.ok ? r.clock : 'n/a', errors: r.ok ? [] : r.errors.map((e) => e.message) };
  });
  page.assert(exp.ok && exp.clock === null, `export after deleting the clock's day re-imports ${JSON.stringify(exp)}`);
  await go(page, '#/plan', '.week-strip');
  await clickText(page, '.toast button', 'Undo');
  await waitFor(page, (id) => window.__pwpDebug.project().week.days.some((d) => d.id === id), { label: 'day restored' }, mon.id);
  await go(page, `#/run/${mon.id}`, '.run-controls');
  page.assert((await page.eval(() => window.__pwpDebug.clock().state)) === 'running', 'clock back with the restored day');
  await page.click('[data-clock-action="reset"]');
  await waitFor(page, () => document.getElementById('confirm').open, { label: 'reset confirm' });
  await page.click('#confirm [data-confirm="ok"]');
  await go(page, `#/plan/${mon.id}`, '.day-plan');
  out.orphanClock = 'handled';

  // Let autosave settle (400 ms debounce): a takeover while this tab still holds
  // an unsaved edit is, by design, a conflict rather than a silent discard.
  await waitFor(page, () => !window.__pwpDebug.state().dirty, { label: 'autosave settled' });
  // 4. Competing browsing context: same-origin iframe acts as a second tab.
  await page.eval(() => {
    const f = document.createElement('iframe');
    f.id = 'tab2';
    f.src = `${location.pathname}?test#/plan`;
    f.style.width = '360px';
    f.style.height = '400px';
    document.body.appendChild(f);
  });
  const inFrame = (fn) => page.eval(`(() => { const d = document.getElementById('tab2').contentDocument; const w = document.getElementById('tab2').contentWindow; return (${fn})(d, w); })()`);
  await waitFor(page, () => document.getElementById('tab2')?.contentDocument?.querySelector('#app')?.dataset.ready === 'true', { label: 'second tab ready' });
  page.assert(await inFrame((d) => !!d.querySelector('[data-banner="read-only"]')), 'second tab opens read-only');
  page.assert((await page.eval(() => window.__pwpDebug.state().mode)) === 'writer', 'first tab stays the writer');
  // Takeover in the second tab -> first tab becomes read-only.
  await inFrame((d) => d.querySelector('[data-action="take-over"]').click());
  try {
    await waitFor(page, () => window.__pwpDebug.state().mode === 'read-only', { label: 'first tab read-only after takeover' });
  } catch (e) {
    throw new Error(`${e.message}: ${JSON.stringify(await page.eval(() => ({ s: window.__pwpDebug.state(), meta: localStorage.getItem('pwp:v1:meta'), lease: localStorage.getItem('pwp:v1:lease'), frame: document.getElementById('tab2').contentWindow.__pwpDebug.state(), toasts: [...document.getElementById('tab2').contentDocument.querySelectorAll('.toast-text')].map((t) => t.textContent) })))}`);
  }
  page.assert(await page.exists('[data-banner="read-only"]'), 'read-only banner in first tab');
  const revBefore = (await project(page)).project.rev;
  await page.click('.script > .period-row [data-action="move-down"]:not([disabled])');
  page.assert(/read-only/i.test(await toastText(page)), 'edit refused while read-only');
  page.assert((await project(page)).project.rev === revBefore, 'no write while read-only');
  // The second tab edits; the first tab follows.
  const firstNow = await inFrame((d) => d.querySelector('.script > .period-row').dataset.periodId);
  await inFrame((d) => d.querySelector('.script > .period-row [data-action="move-down"]').click());
  await waitFor(page, (id) => document.querySelectorAll('.script > .period-row')[1]?.dataset.periodId === id, { label: 'first tab follows the writer', timeout: 6000 }, firstNow);
  out.follow = true;
  await page.screenshot('j6-read-only-follow');
  // Take back over explicitly; the second tab turns read-only; nothing lost.
  await page.click('[data-action="take-over"]');
  await waitFor(page, () => window.__pwpDebug.state().mode === 'writer', { label: 'took back over' });
  await waitFor(page, () => !!document.getElementById('tab2').contentDocument.querySelector('[data-banner="read-only"]'), { label: 'second tab read-only again' });
  page.assert(await page.eval((id) => document.querySelectorAll('.script > .period-row')[1].dataset.periodId === id, firstNow), 'the other tab’s saved edit was kept');
  await page.eval(() => document.getElementById('tab2').remove());

  // Revision conflict: someone else's newer save is never overwritten.
  await page.eval(() => {
    const m = JSON.parse(localStorage.getItem('pwp:v1:meta'));
    localStorage.setItem('pwp:v1:meta', JSON.stringify({ ...m, projectRev: 99999 }));
  });
  const storedBefore = await page.eval(() => localStorage.getItem('pwp:v1:project'));
  const top = await page.eval(() => document.querySelector('.script > .period-row').dataset.periodId);
  await page.click(`[data-focus="down-${top}"]`);
  await waitFor(page, () => !!document.querySelector('[data-banner="conflict"]'), { label: 'conflict banner' });
  page.assert((await page.eval(() => localStorage.getItem('pwp:v1:project'))) === storedBefore, 'stored plan untouched on conflict');
  await page.screenshot('j6-conflict');
  await page.click('[data-action="load-saved"]');
  await waitFor(page, () => !document.querySelector('[data-banner="conflict"]') && window.__pwpDebug.state().mode === 'writer', { label: 'conflict resolved' });
  out.conflict = 'detected, nothing overwritten, resolved by loading the saved version';

  // 4b. Unreadable saved data is never overwritten silently.
  await page.eval(() => { localStorage.setItem('pwp:v1:project', '{"schema": broken'); });
  await page.eval(() => { window.__beforeReload = true; });
  await page.raw('Page.reload', {});
  await waitFor(page, () => !window.__beforeReload && document.querySelector('#app')?.dataset.ready === 'true', { label: 'reloaded with corrupt data' });
  page.assert(await page.eval(() => /could not be loaded/.test(document.querySelector('#banners').textContent)), 'unreadable-data banner');
  page.assert(!(await page.exists('[data-action="load-saved"]')), 'no misleading "load the saved version" while it is unreadable');
  const stillBlocked = await page.eval(() => ({ raw: localStorage.getItem('pwp:v1:project'), state: window.__pwpDebug.state() }));
  page.assert(stillBlocked.raw === '{"schema": broken' && stillBlocked.state.mode === 'conflict', `stays blocked ${JSON.stringify(stillBlocked.state)}`);
  const anyRow = await page.eval(() => document.querySelector('.script > .period-row [data-action="move-down"]:not([disabled])')?.dataset.focus);
  if (anyRow) await page.click(`[data-focus="${anyRow}"]`);
  await page.wait(500);
  page.assert((await page.eval(() => localStorage.getItem('pwp:v1:project'))) === '{"schema": broken', 'edits did not overwrite unreadable data');
  await page.screenshot('j6-unreadable-saved-data');
  await clickText(page, '#banners button', 'Replace saved data with this example');
  await waitFor(page, () => document.getElementById('confirm').open, { label: 'replace confirm' });
  await page.click('#confirm [data-confirm="ok"]');
  await waitFor(page, () => window.__pwpDebug.state().mode === 'writer' && localStorage.getItem('pwp:v1:project').startsWith('{"schema":"practice-week-planner'), { label: 'replaced after confirmation' });
  out.unreadable = 'blocked until explicit replace';

  // 5. Empty states.
  await go(page, '#/data', '[data-action="empty-week"]');
  await page.click('[data-action="empty-week"]');
  await waitFor(page, () => document.getElementById('confirm').open, { label: 'empty confirm' });
  await page.click('#confirm [data-confirm="ok"]');
  await waitFor(page, () => window.__pwpDebug.project().week.days.length === 1, { label: 'empty week' });
  const d1 = (await project(page)).week.days[0];
  await go(page, `#/plan/${d1.id}`, '.empty-state');
  page.assert(/no scheduled periods yet/i.test(await page.text('.empty-state')), 'empty day state');
  await page.screenshot('j6-empty-day');
  await go(page, `#/rotation/${d1.id}`, '.empty-state');
  page.assert(/No scout groups/.test(await page.text('.empty-state')), 'empty rotation state');
  await go(page, `#/run/${d1.id}`, '.run-ready');
  page.assert(/no scheduled periods to run/i.test(await page.text('.run-ready')), 'empty run state');

  // 6. Unavailable groups: the thin sample leaves honest gaps.
  await go(page, '#/data', '[data-action="load-sample"]');
  await page.eval(() => { document.querySelector('[data-key="samples"]').open = true; });
  await setValue(page, 'select[name="scenario"]', 'thin');
  await setValue(page, 'select[name="sampleSeed"]', '7');
  await page.click('[data-action="load-sample"]');
  await waitFor(page, () => window.__pwpDebug.project().project.scenario === 'thin', { label: 'thin sample' });
  const wed = (await project(page)).week.days[2];
  await go(page, `#/rotation/${wed.id}`, '[data-action="generate"]');
  await page.click('[data-action="generate"]');
  await waitFor(page, () => document.querySelectorAll('[data-shortage]').length > 0, { label: 'thin shortages' });
  out.thinShortages = await page.eval(() => document.querySelectorAll('[data-shortage]').length);
  out.overflow = await overflow(page);
  page.assert(out.overflow.ok, `overflow ${JSON.stringify(out.overflow)}`);
  log(JSON.stringify(out));
  return out;
}
