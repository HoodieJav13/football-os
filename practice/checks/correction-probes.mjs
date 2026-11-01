// Correction probes for the three independent-review findings, through real
// controls at every viewport. Adapted from the reviewer's independent-browser.mjs
// (read-only original left in the review packet): where that probe recorded the
// defect, this one asserts the corrected behaviour.
import fs from 'node:fs';
import path from 'node:path';
import { fresh, reload, go, setValue, waitFor, clickText, project, clock } from './lib.mjs';
import { pdfText } from './pdftext.mjs';

const PRINT_DIR = process.env.PWP_PRINT_DIR || null;
const END80 = Array.from({ length: 80 }, (_, i) => (i === 79 ? 'END80' : 'x')).join('\n');
const advance = (page, ms) => page.eval((m) => window.__pwpClock.advance(m), ms);
const settle = (page) => page.wait(450);
const storageSnapshot = async (page) => {
  // Let autosave settle first so the snapshot is the saved state, not a pending write.
  await waitFor(page, () => !window.__pwpDebug.state().dirty, { label: 'autosave settled' });
  await page.wait(500);
  return page.eval(() => ({ project: localStorage.getItem('pwp:v1:project'), clock: localStorage.getItem('pwp:v1:clock'), meta: localStorage.getItem('pwp:v1:meta') }));
};
const diffKeys = (a, b) => Object.keys(a).filter((k) => a[k] !== b[k]);
const confirm = async (page, ok) => {
  await waitFor(page, () => document.getElementById('confirm').open, { label: 'confirm dialog' });
  await page.click(`#confirm [data-confirm="${ok ? 'ok' : 'cancel'}"]`);
  await waitFor(page, () => !document.getElementById('confirm').open, { label: 'confirm closed' });
};
const printPdf = async (page, label, viewport) => {
  const pdf = await page.raw('Page.printToPDF', { preferCSSPageSize: true, printBackground: true });
  if (PRINT_DIR && viewport === '1440x900') fs.writeFileSync(path.join(PRINT_DIR, `${label}.pdf`), Buffer.from(pdf.data, 'base64'));
  return pdfText(pdf.data);
};
const cardGeometry = (page, id) => page.eval((cid) => {
  const c = document.querySelector(`.print-root [data-print-card="${cid}"]`);
  if (!c) return null;
  const n = c.querySelector('.pcard-notes');
  const a = c.getBoundingClientRect();
  const b = n ? n.getBoundingClientRect() : a;
  return { overflow: c.scrollHeight > c.clientHeight + 1 || c.scrollWidth > c.clientWidth + 1, notesBottom: b.bottom, cardBottom: a.bottom, solo: c.classList.contains('pcard-solo'), dense: c.classList.contains('pcard-dense'), sheets: document.querySelectorAll('.print-root .sheet').length, perSheet: [...document.querySelectorAll('.print-root .sheet')].map((s) => s.querySelectorAll('.pcard').length), unprintable: document.querySelectorAll('.print-root .pb-unprintable').length };
}, id);

export default async function (page, { viewport, log }) {
  await page.raw('Page.setDownloadBehavior', { behavior: 'deny' }).catch(() => {});
  const out = { viewport: viewport.name };

  // ------------------------------------------------------------- F1 reset rebuild
  await fresh(page);
  let p = await project(page);
  const d = p.week.days[0];
  const pid = d.periods[0].id;
  await go(page, `#/run/${d.id}`, '[data-action="prepare"]');
  await page.click('[data-action="prepare"]');
  await waitFor(page, () => !!document.querySelector('[data-clock-action="start"]'), { label: 'start' });
  await page.click('[data-clock-action="start"]');
  await advance(page, 1000);
  await go(page, `#/plan/${d.id}`, '.period-row');
  await page.click(`.period-row[data-period-id="${pid}"] [data-action="edit"]`);
  await setValue(page, '#editor [data-field="title"]', 'Independent changed drill');
  await setValue(page, '#editor [data-field="minutes"]', '25');
  await page.click('#editor [data-action="save"]');
  await waitFor(page, () => !document.getElementById('editor').open, { label: 'saved edit' });
  await go(page, `#/run/${d.id}`, '.run-controls');
  page.assert(await page.exists('[data-stale-script]'), 'the run view says the plan changed');
  let c = await clock(page);
  page.assert(c.state === 'running' && c.steps[0].title === 'Warm-up' && c.steps[0].plannedSec === 600 && c.dayVersion === 1, 'a plan edit never silently replaces the running session');
  const revRunning = c.rev;
  await page.click('[data-clock-action="reset"]');
  await confirm(page, false);
  c = await clock(page);
  page.assert(c.state === 'running' && c.rev === revRunning && c.steps[0].title === 'Warm-up', 'cancel keeps the running session');
  out.cancelPreservesRunning = true;
  await page.click('[data-clock-action="reset"]');
  await confirm(page, true);
  await waitFor(page, () => window.__pwpDebug.clock().state === 'idle', { label: 'reset to idle' });
  c = await clock(page);
  p = await project(page);
  const check = await page.eval(async (dayId) => {
    const C = await import('/src/domain/clock.js');
    const day = window.__pwpDebug.project().week.days.find((x) => x.id === dayId);
    const fresh = C.buildSteps(day).map((s) => [s.periodIds.join('+'), s.title, s.plannedSec]);
    const now = window.__pwpDebug.clock().steps.map((s) => [s.periodIds.join('+'), s.title, s.plannedSec]);
    const live = new Set(day.periods.map((x) => x.id));
    return { same: JSON.stringify(fresh) === JSON.stringify(now), orphans: window.__pwpDebug.clock().steps.flatMap((s) => s.periodIds).filter((id) => !live.has(id)) };
  }, d.id);
  out.reset = { expectedTitle: p.week.days[0].periods[0].title, actualTitle: c.steps[0].title, expectedSec: 1500, actualSec: c.steps[0].plannedSec, expectedDayVersion: p.week.days[0].version, actualDayVersion: c.dayVersion, rev: c.rev, history: c.history.length, matchesCurrentPlan: check.same, orphanPeriodIds: check.orphans };
  page.assert(c.steps[0].title === 'Independent changed drill' && c.steps[0].plannedSec === 1500 && c.dayVersion === p.week.days[0].version && p.week.days[0].version === 2, `confirmed reset rebuilds ${JSON.stringify(out.reset)}`);
  page.assert(check.same && check.orphans.length === 0, 'the rebuilt steps equal a fresh build of the current day, with no orphan period');
  page.assert(c.rev === revRunning + 1, 'one revision for the reset');
  page.assert(!(await page.exists('[data-stale-script]')) && (await page.exists('[data-clock-action="start"]')), 'start is available and the stale note is gone');
  await settle(page);
  page.assert((await page.text('[data-clock-time]')) === '25:00', 'the clock shows the edited duration');
  await page.screenshot('f1-reset-rebuilt');
  // Undo restores the previous complete session (old script, still running).
  await page.click('[data-clock-action="undo"]');
  c = await clock(page);
  page.assert(c.state === 'running' && c.dayVersion === 1 && c.steps[0].title === 'Warm-up' && c.steps[0].plannedSec === 600 && c.rev === revRunning + 2, `undo restores the prior session ${JSON.stringify({ s: c.state, v: c.dayVersion, t: c.steps[0].title })}`);
  page.assert(await page.exists('[data-stale-script]'), 'stale note back after undo');
  // Rebuild deliberately from the note, start, double tap, reload, export/import.
  await page.click('[data-action="rebuild"]');
  await confirm(page, true);
  await waitFor(page, () => window.__pwpDebug.clock().dayVersion === 2 && window.__pwpDebug.clock().state === 'idle', { label: 'rebuilt from note' });
  await advance(page, 1000);
  await page.click('[data-clock-action="start"]');
  await advance(page, 30_000);
  const r0 = (await clock(page)).rev;
  await page.click('[data-clock-action="pause"]');
  await page.click('[data-clock-action="resume"]'); // lands within the double-tap window: ignored
  c = await clock(page);
  page.assert(c.rev === r0 + 1 && c.state === 'paused', 'double tap after a rebuild makes one transition');
  await advance(page, 1000);
  await page.click('[data-clock-action="resume"]');
  await advance(page, 6000);
  await settle(page);
  await reload(page, `#/run/${d.id}`);
  await waitFor(page, () => !!document.querySelector('[data-banner="recovery"]'), { label: 'recovery' });
  c = await clock(page);
  page.assert(c.state === 'paused' && c.dayVersion === 2 && c.steps[0].plannedSec === 1500 && c.steps[0].title === 'Independent changed drill', 'reload keeps the rebuilt version, recovered paused');
  const backup = await page.eval(() => window.__pwpDebug.exportText());
  await go(page, '#/data', '[data-import-text]');
  await setValue(page, '[data-import-text]', backup);
  await page.click('[data-action="import-text"]');
  await page.wait(300);
  c = await clock(page);
  page.assert(c.dayVersion === 2 && c.steps[0].plannedSec === 1500, 'export/import keeps the chosen version');
  out.reloadAndImportKeepVersion = true;
  // Idle session + another plan edit: the explicit rebuild picks up an added period.
  await go(page, `#/run/${d.id}`, '.run-controls');
  await page.click('[data-clock-action="reset"]');
  await confirm(page, true);
  await waitFor(page, () => window.__pwpDebug.clock().state === 'idle', { label: 'idle again' });
  const stepsBefore = (await clock(page)).steps.length;
  await go(page, `#/plan/${d.id}`, '.period-row');
  const lastPid = await page.eval(() => [...document.querySelectorAll('.script > .period-row')].pop().dataset.periodId);
  await page.click(`.period-row[data-period-id="${lastPid}"] [data-action="more"]`);
  await page.click(`.period-row[data-period-id="${lastPid}"] [data-action="duplicate"]`);
  await go(page, `#/run/${d.id}`, '[data-stale-script]');
  page.assert((await clock(page)).steps.length === stepsBefore, 'an idle session is not silently replaced either');
  await page.click('[data-action="rebuild"]');
  await confirm(page, true);
  await waitFor(page, (n) => window.__pwpDebug.clock().steps.length === n + 1, { label: 'idle rebuild adds the period' }, stepsBefore);
  out.idleRebuild = true;

  // ------------------------------------------------------------- F2 multiline cards
  await fresh(page);
  await go(page, '#/card/new', 'input[name="cardTitle"]');
  await setValue(page, 'input[name="cardTitle"]', 'Multiline print probe');
  await setValue(page, 'textarea[name="cardNotes"]', END80);
  const counter = await page.text('[data-print-lines]');
  page.assert(/Printed lines: 80 of 21/.test(counter) && /⚠ Too many note and cue lines/.test(counter), `live counter ${counter}`);
  await page.click('[data-action="save-card"]');
  await page.wait(200);
  const refused = await page.eval(() => ({ errors: document.querySelector('.form-errors')?.textContent || '', kept: document.querySelector('textarea[name="cardNotes"]').value, saved: window.__pwpDebug.project().cards.some((x) => x.title === 'Multiline print probe') }));
  page.assert(/printed lines/i.test(refused.errors) && /80/.test(refused.errors) && !refused.saved && refused.kept === END80, `80-line card refused, text kept ${JSON.stringify({ e: refused.errors.slice(0, 120), saved: refused.saved })}`);
  out.multilineRefused = { message: refused.errors.slice(0, 200), textKept: refused.kept === END80 };
  await page.screenshot('f2-multiline-refused');
  // Shorten to the supported maximum and print it four-up.
  const END21 = Array.from({ length: 21 }, (_, i) => (i === 20 ? 'END21' : 'x')).join('\n');
  await setValue(page, 'textarea[name="cardNotes"]', END21);
  page.assert(/Printed lines: 21 of 21/.test(await page.text('[data-print-lines]')), 'boundary card counter');
  await page.click('[data-action="save-card"]');
  await waitFor(page, () => /^#\/card\/card-/.test(location.hash) && /^Edit card/.test(document.querySelector('h1')?.textContent || ''), { label: 'boundary card saved' });
  const cardId = await page.eval(() => decodeURIComponent(location.hash.split('/')[2]));
  await go(page, `#/print/cards/${cardId}`, '.print-root .pcard');
  await page.raw('Emulation.setEmulatedMedia', { media: 'print' });
  await page.wait(150);
  let g = await cardGeometry(page, cardId);
  let txt = await printPdf(page, 'f2-boundary-21-lines', viewport.name);
  out.boundaryPrint = { ...g, pdfPages: txt.pageCount, hasEND21: txt.text.includes('END21'), xLines: (txt.text.match(/^x$/gm) || []).length };
  page.assert(g && !g.overflow && g.notesBottom <= g.cardBottom + 1 && !g.solo && g.sheets === 1 && g.unprintable === 0, `boundary card prints four-up without overflow ${JSON.stringify(g)}`);
  page.assert(txt.pageCount === 1 && txt.text.includes('END21') && out.boundaryPrint.xLines === 20, `PDF has every line ${JSON.stringify(out.boundaryPrint)}`);
  await page.screenshot('f2-boundary-print');
  await page.raw('Emulation.setEmulatedMedia', { media: '' });
  // Import of an over-long card is refused atomically.
  const docText = await page.eval(() => window.__pwpDebug.exportText());
  const bad = JSON.parse(docText);
  bad.cards.push({ ...structuredClone(bad.cards[0]), id: 'card-legacy-80', title: 'Legacy 80-line card', notes: END80, provenance: null });
  const before = await storageSnapshot(page);
  await go(page, '#/data', '[data-import-text]');
  await setValue(page, '[data-import-text]', JSON.stringify(bad));
  await page.click('[data-action="import-text"]');
  await page.wait(250);
  const msg = await page.text('[data-import-result]');
  const after = await storageSnapshot(page);
  page.assert(/Nothing was imported/.test(msg) && /cards\[\d+\]\.notes/.test(msg) && /printed lines/i.test(msg), `import refusal message ${msg.slice(0, 200)}`);
  page.assert(JSON.stringify(after) === JSON.stringify(before), `refused import left storage byte-identical (changed: ${diffKeys(before, after).join(', ')})`);
  out.overlongImportRefused = msg.slice(0, 200);
  // A card saved by an older version: kept unchanged, flagged, printed whole on its own page.
  await page.eval((card) => {
    const proj = JSON.parse(localStorage.getItem('pwp:v1:project'));
    proj.cards.push(card);
    localStorage.setItem('pwp:v1:project', JSON.stringify(proj));
  }, { ...bad.cards[bad.cards.length - 1] });
  await reload(page, '#/cards');
  page.assert(await page.exists('[data-banner="long-cards"]') && await page.exists('[data-long-card="card-legacy-80"]'), 'older over-long card is flagged');
  page.assert((await project(page)).cards.find((x) => x.id === 'card-legacy-80').notes === END80, 'older card kept unchanged');
  await go(page, '#/print/cards/card-legacy-80', '.print-root .pcard');
  await page.raw('Emulation.setEmulatedMedia', { media: 'print' });
  await page.wait(150);
  g = await cardGeometry(page, 'card-legacy-80');
  txt = await printPdf(page, 'f2-legacy-80-lines-solo', viewport.name);
  out.legacyPrint = { ...g, pdfPages: txt.pageCount, hasEND80: txt.text.includes('END80'), xLines: (txt.text.match(/^x$/gm) || []).length };
  page.assert(g && g.solo && !g.overflow && g.notesBottom <= g.cardBottom + 1 && g.unprintable === 0, `older 80-line card prints whole on its own page ${JSON.stringify(g)}`);
  page.assert(txt.pageCount === 1 && out.legacyPrint.hasEND80 && out.legacyPrint.xLines === 79, `PDF has all 80 lines ${JSON.stringify(out.legacyPrint)}`);
  await page.screenshot('f2-legacy-solo-print');
  await page.raw('Emulation.setEmulatedMedia', { media: '' });
  // Pathological older card: too long for any page -> explicit notice, never a cut card.
  const huge = `${'x\n'.repeat(248)}END`;
  await page.eval((card) => {
    const proj = JSON.parse(localStorage.getItem('pwp:v1:project'));
    proj.cards.push(card);
    localStorage.setItem('pwp:v1:project', JSON.stringify(proj));
  }, { ...bad.cards[bad.cards.length - 1], id: 'card-legacy-huge', title: 'Legacy 249-line card', notes: huge });
  await reload(page, '#/print/cards/card-legacy-huge');
  await waitFor(page, () => !!document.querySelector('.print-root .sheet'), { label: 'print sheet' });
  const hugeView = await page.eval(() => ({ cards: document.querySelectorAll('.print-root .pcard').length, notice: document.querySelector('.print-root .pb-unprintable')?.textContent || '', info: document.querySelector('[data-print-info]')?.textContent || '' }));
  page.assert(hugeView.cards === 0 && /Not printed/.test(hugeView.notice) && /kept unchanged/.test(hugeView.notice) && /not printed/i.test(hugeView.info), `unprintable older card handled explicitly ${JSON.stringify(hugeView)}`);
  page.assert((await project(page)).cards.find((x) => x.id === 'card-legacy-huge').notes === huge, 'its text is kept');
  out.unprintableNotice = hugeView.notice.slice(0, 120);

  // ------------------------------------------------------------- F3 malformed history
  await fresh(page);
  p = await project(page);
  const mon = p.week.days[0];
  await go(page, `#/run/${mon.id}`, '[data-action="prepare"]');
  await page.click('[data-action="prepare"]');
  await waitFor(page, () => !!document.querySelector('[data-clock-action="start"]'), { label: 'start' });
  await page.click('[data-clock-action="start"]');
  await advance(page, 2000);
  await page.click('[data-clock-action="next"]');
  await waitFor(page, () => window.__pwpDebug.clock().index === 1, { label: 'next' });
  const good = await page.eval(() => window.__pwpDebug.exportText());
  const variants = [
    ['steps-null', (doc) => { doc.clock.history[0].before.steps = [null]; }, /clock\.history\[0\]\.before\.steps\[0\]/],
    ['step-not-object', (doc) => { doc.clock.history[1].before.steps[0] = 'x'; }, /clock\.history\[1\]\.before\.steps\[0\]/],
    ['duplicate-period', (doc) => { const b = doc.clock.history[1].before; b.steps[1].periodIds = b.steps[0].periodIds.slice(); }, /more than once/],
    ['bad-status', (doc) => { doc.clock.history[1].before.steps[0].status = 'exploded'; }, /status/],
    ['bad-state', (doc) => { doc.clock.history[1].before.state = 'idle'; }, /idle/],
  ];
  const beforeImport = { storage: await storageSnapshot(page), clock: await clock(page) };
  out.malformedRefused = [];
  for (const [name, mutate, re] of variants) {
    const doc = JSON.parse(good);
    mutate(doc);
    await go(page, '#/data', '[data-import-text]');
    await setValue(page, '[data-import-text]', JSON.stringify(doc));
    await page.click('[data-action="import-text"]');
    await page.wait(200);
    const m = await page.text('[data-import-result]');
    page.assert(/Nothing was imported/.test(m) && re.test(m), `${name} refused with a path: ${m.slice(0, 200)}`);
    const st = await storageSnapshot(page);
    page.assert(JSON.stringify(st) === JSON.stringify(beforeImport.storage), `${name}: storage byte-identical (changed: ${diffKeys(beforeImport.storage, st).join(', ')})`);
    page.assert(JSON.stringify(await clock(page)) === JSON.stringify(beforeImport.clock), `${name}: session unchanged`);
    out.malformedRefused.push(name);
  }
  await page.screenshot('f3-malformed-refused');
  // The current session's Undo still works.
  await go(page, `#/run/${mon.id}`, '.run-controls');
  const r1 = (await clock(page)).rev;
  await page.click('[data-clock-action="undo"]');
  page.assert((await clock(page)).rev === r1 + 1 && (await clock(page)).index === 0, 'undo works on the current session');
  // A valid backup imports; Undo works after import and after reload.
  await go(page, '#/data', '[data-import-text]');
  await setValue(page, '[data-import-text]', good);
  await page.click('[data-action="import-text"]');
  await waitFor(page, () => window.__pwpDebug.clock().index === 1, { label: 'valid backup imported' });
  await go(page, `#/run/${mon.id}`, '.run-controls');
  const r2 = (await clock(page)).rev;
  await page.click('[data-clock-action="undo"]');
  page.assert((await clock(page)).rev === r2 + 1 && (await clock(page)).index === 0, 'undo after import');
  await advance(page, 1500);
  await page.click('[data-clock-action="next"]');
  await advance(page, 6000);
  await settle(page);
  await reload(page, `#/run/${mon.id}`);
  await waitFor(page, () => !!document.querySelector('[data-banner="recovery"]'), { label: 'recovered' });
  const r3 = (await clock(page)).rev;
  await page.click('[data-clock-action="undo"]');
  c = await clock(page);
  page.assert(c.rev === r3 + 1 && c.index === 0 && c.state === 'paused' && /before the reload/.test(c.notice || ''), 'undo after reload restores paused with a notice');
  out.undoAfterImportAndReload = true;
  // A damaged clock already in storage (written by something else, e.g. an older
  // or broken writer) is set aside on load, never crashing Undo. The meta
  // revision moves too, as any other writer's save would, so this tab's guarded
  // page-hide checkpoint correctly declines to overwrite it.
  const damaged = await page.eval(() => {
    const k = JSON.parse(localStorage.getItem('pwp:v1:clock'));
    k.history[0].before.steps = [null];
    k.rev += 1;
    const s = JSON.stringify(k);
    const m = JSON.parse(localStorage.getItem('pwp:v1:meta'));
    localStorage.setItem('pwp:v1:meta', JSON.stringify({ ...m, clockRev: k.rev, savedBy: 'inst-other-writer' }));
    localStorage.setItem('pwp:v1:clock', s);
    return s;
  });
  await reload(page, `#/run/${mon.id}`);
  page.assert(await page.exists('[data-banner="clock-set-aside"]'), 'damaged saved clock reported');
  page.assert((await clock(page)) === null, 'not loaded');
  page.assert((await page.eval(() => localStorage.getItem('pwp:v1:clock'))) === damaged, 'left in storage untouched');
  await page.screenshot('f3-damaged-clock-set-aside');
  out.damagedSavedClock = 'set aside, untouched';
  log(JSON.stringify(out));
  return out;
}
