// Four-up fit (residual F2): through the normal export/import controls, every
// accepted four-card set prints [4] on one real PDF page with every end marker,
// and an unsupported combination is refused atomically before anything changes.
// The exact reviewer reproduction (W80 / W60 / 21 lines) runs first; its
// outcome is logged before any assertion so a failing baseline keeps its data.
import fs from 'node:fs';
import path from 'node:path';
import { fresh, go, setValue, waitFor, project, reload, toastText } from './lib.mjs';
import { pdfText } from './pdftext.mjs';

const PRINT_DIR = process.env.PWP_PRINT_DIR || null;
const W = (n) => 'W'.repeat(n);
const END21 = Array.from({ length: 21 }, (_, i) => (i === 20 ? 'END21' : 'x')).join('\n');
const REAL_TITLE = 'Scout card: Trips Right motion — Monday walkthrough and Wednesday team rehearsal';
const REAL_LOOK = 'Trips Right · 11 personnel · left hash · motion toward trips';
const REAL_LINES = ['Fictional scout card.', 'Use the shown diagram.', 'Check the look label.', 'Match the shown spacing.', 'Walk through the setup.', 'Keep names generic.',
  'Review one role at a time.', 'Point to the marked spot.', 'Say the task out loud.', 'Ask for the call if needed.', 'Pause before the next rep.', 'Check the full diagram.',
  'Keep the group together.', 'Repeat at a walk.', 'Confirm the period label.', 'Use the printed card.', 'Return to the start spot.', 'Leave room for notes.',
  'Keep this as reference.', 'Discuss after the rep.', 'END21'];
const REAL_NOTES = REAL_LINES.join('\n');
// Final-review cases (see tests/correction-f2-fourup.test.mjs).
const DUP_TITLE = 'Bunch Stick Snag Cross Empty Cover Bunch Over Sweep Cross Monday Smash Two';
const V9_TITLE = 'WHEEL TEAM REHEARSAL COVER READ STRONG MESH WALKTHROUGH WEAK REHEARSAL POWER';
const V9_LOOK = 'DRAG TEAM DRAG SNAG MESH SWEEP DRAG WALKTHROUGH POWER SNAG';
const CAPS_TITLE = 'TRIPS RIGHT MOTION - MONDAY WALKTHROUGH AND WEDNESDAY TEAM REHEARSAL PERIOD';
const CAPS_LOOK = 'TRIPS RIGHT - 11 PERSONNEL - LEFT HASH - MOTION TOWARD TRIPS';
const CUES = ['Eyes on the near slot before the snap; call out motion early and point to the marked spot.',
  'Walk the alignment first, then run it at half speed with the whole group together.',
  'Check spacing against the shown diagram before every rep and reset to the start spot.',
  'Say the task out loud, ask for the call if needed, then pause before the next rep.'];
// The maximum diagram: 24 players with 4-letter labels and 24 labelled arrows.
const MAX_DIAGRAM = {
  width: 100, height: 60, los: 24,
  tokens: Array.from({ length: 24 }, (_, i) => ({ id: `t${i}`, label: 'WWWW', x: (i % 12) * 8 + 4, y: i < 12 ? 26 : 40, side: i % 5 ? 'O' : 'D' })),
  arrows: Array.from({ length: 24 }, (_, i) => ({ id: `a${i}`, from: { x: (i % 12) * 8 + 4, y: 26 }, to: { x: (i % 12) * 8 + 6, y: 4 + (i % 4) }, kind: ['route', 'run', 'block', 'motion'][i % 4], label: 'WWWWWWWWWWWW' })),
};

const settledStorage = async (page) => {
  await waitFor(page, () => !window.__pwpDebug.state().dirty, { label: 'autosave settled' });
  await page.wait(500);
  return page.eval(() => JSON.stringify({ p: localStorage.getItem('pwp:v1:project'), c: localStorage.getItem('pwp:v1:clock'), m: localStorage.getItem('pwp:v1:meta'), mem: window.__pwpDebug.project() }));
};

// Append four cards and one synthetic day that uses them; keep every original reference.
function withFourCards(docText, prefix, fields) {
  const doc = JSON.parse(docText);
  const ids = [0, 1, 2, 3].map((i) => `${prefix}-${i}`);
  ids.forEach((id, i) => doc.cards.push({ ...structuredClone(doc.cards[0]), ...fields(i), id, version: fields(i).version || 1, cues: fields(i).cues || [], provenance: null }));
  const day = structuredClone(doc.week.days[0]);
  day.id = `day-${prefix}`;
  day.label = `Probe ${prefix}`;
  day.version = 1;
  day.periods = [{ ...structuredClone(doc.week.days[0].periods[0]), id: `per-${prefix}`, cardIds: ids }];
  doc.week.days.push(day);
  return { text: JSON.stringify(doc), dayId: day.id, ids };
}

async function importText(page, text) {
  await go(page, '#/data', '[data-import-text]');
  await setValue(page, '[data-import-text]', text);
  await page.click('[data-action="import-text"]');
  await page.wait(300);
  return page.text('[data-import-result]');
}

async function printDay(page, dayId, label, viewport) {
  await go(page, `#/print/cards/${dayId}`, '.print-root .sheet');
  await page.raw('Emulation.setEmulatedMedia', { media: 'print' });
  await page.wait(150);
  const dom = await page.eval(() => {
    const sheets = [...document.querySelectorAll('.print-root .sheet')];
    const cards = [...document.querySelectorAll('.print-root .pcard')];
    return {
      sheets: sheets.length,
      perSheet: sheets.map((s) => s.querySelectorAll('.pcard').length),
      solo: document.querySelectorAll('.print-root .pcard-solo').length,
      unprintable: document.querySelectorAll('.print-root .pb-unprintable').length,
      overflow: cards.filter((c) => c.scrollHeight > c.clientHeight + 1 || c.scrollWidth > c.clientWidth + 1).length,
      outsidePage: cards.filter((c) => { const b = c.closest('.sheet-body').getBoundingClientRect(); const r = c.getBoundingClientRect(); return r.top < b.top - 1 || r.bottom > b.bottom + 1; }).length,
      dense: cards.filter((c) => c.classList.contains('pcard-dense')).length,
      diagramHeights: cards.map((c) => Math.round(c.querySelector('.diagram').getBoundingClientRect().height)),
    };
  });
  const pdf = await page.raw('Page.printToPDF', { preferCSSPageSize: true, printBackground: true });
  if (PRINT_DIR && viewport === '1440x900') fs.writeFileSync(path.join(PRINT_DIR, `${label}.pdf`), Buffer.from(pdf.data, 'base64'));
  const t = pdfText(pdf.data);
  await page.raw('Emulation.setEmulatedMedia', { media: '' });
  return { ...dom, pdfPages: t.pageCount, text: t.text };
}

const count = (text, s) => text.split(s).length - 1;
const fourUp = (r) => JSON.stringify(r.perSheet) === '[4]' && r.pdfPages === 1 && r.solo === 0 && r.unprintable === 0 && r.overflow === 0 && r.outsidePage === 0;

export default async function (page, { viewport, log }) {
  await page.raw('Page.setDownloadBehavior', { behavior: 'deny' }).catch(() => {});
  const out = { viewport: viewport.name };

  // 1. Exact reviewer reproduction.
  await fresh(page);
  const base = await page.eval(() => window.__pwpDebug.exportText());
  const rep = withFourCards(base, 'review-four', () => ({ title: W(80), lookLabel: W(60), notes: END21 }));
  const before = await settledStorage(page);
  const msg = await importText(page, rep.text);
  const accepted = (await project(page)).cards.some((c) => c.id === 'review-four-0');
  if (accepted) {
    const r = await printDay(page, rep.dayId, 'reproduction-W80-W60-21-accepted', viewport.name);
    out.reproduction = { accepted: true, perSheet: r.perSheet, solo: r.solo, unprintable: r.unprintable, pdfPages: r.pdfPages, end21: count(r.text, 'END21') };
  } else {
    const after = await settledStorage(page);
    out.reproduction = { accepted: false, message: msg.slice(0, 400), storageAndMemoryUnchanged: after === before };
  }
  log(`reproduction: ${JSON.stringify(out.reproduction)}`);
  page.assert(accepted ? fourUp({ ...out.reproduction, overflow: 0, outsidePage: 0 }) : true, `accepted W80/W60/21 cards must print four-up: ${JSON.stringify(out.reproduction)}`);
  if (!accepted) {
    page.assert(out.reproduction.storageAndMemoryUnchanged, 'refusal left memory and storage unchanged');
    page.assert(/Nothing was imported/.test(msg) && /cards\[\d+\]\.notes/.test(msg) && /title/i.test(msg) && /look label/i.test(msg), `actionable refusal names the card and what to shorten: ${msg.slice(0, 300)}`);
    // The editor refuses the same card before saving, and keeps the draft.
    await go(page, '#/card/new', 'input[name="cardTitle"]');
    await setValue(page, 'input[name="cardTitle"]', W(80));
    await setValue(page, 'input[name="lookLabel"]', W(60));
    await setValue(page, 'textarea[name="cardNotes"]', END21);
    const counter = await page.text('[data-print-lines]');
    await page.click('[data-action="save-card"]');
    await page.wait(200);
    const ed = await page.eval(() => ({ err: document.querySelector('.form-errors')?.textContent || '', title: document.querySelector('input[name="cardTitle"]').value, look: document.querySelector('input[name="lookLabel"]').value, notes: document.querySelector('textarea[name="cardNotes"]').value, saved: window.__pwpDebug.project().cards.some((c) => c.title === 'W'.repeat(80)) }));
    out.editor = { counter, error: ed.err.slice(0, 300), draftKept: ed.title === W(80) && ed.look === W(60) && ed.notes === END21, saved: ed.saved };
    page.assert(/title/i.test(ed.err) && /look label/i.test(ed.err) && out.editor.draftKept && !ed.saved, `editor refuses and keeps the draft ${JSON.stringify(out.editor)}`);
    page.assert(/Whole card/i.test(counter) && /⚠/.test(counter), `counter shows the whole-card rule: ${counter}`);
    await page.screenshot('fourup-W-refused-in-editor');
  }

  // 2. Realistic maximum fields (80 / 60 / 21 lines, 482 characters), four on one page.
  await fresh(page);
  const real = withFourCards(await page.eval(() => window.__pwpDebug.exportText()), 'real-four', () => ({ title: REAL_TITLE, lookLabel: REAL_LOOK, notes: REAL_NOTES }));
  const realMsg = await importText(page, real.text);
  page.assert((await project(page)).cards.filter((c) => real.ids.includes(c.id)).length === 4, `realistic maximum cards are accepted: ${realMsg.slice(0, 200)}`);
  let r = await printDay(page, real.dayId, 'realistic-max-four-up', viewport.name);
  const missingLines = REAL_LINES.filter((l) => count(r.text, l) < 4);
  out.realistic = { perSheet: r.perSheet, pdfPages: r.pdfPages, solo: r.solo, unprintable: r.unprintable, overflow: r.overflow, dense: r.dense, diagramHeights: r.diagramHeights, end21: count(r.text, 'END21'), missingLines };
  log(`realistic: ${JSON.stringify(out.realistic)}`);
  page.assert(fourUp(r) && out.realistic.end21 === 4 && missingLines.length === 0, `realistic maximum cards print four-up with every line: ${JSON.stringify(out.realistic)}`);
  await go(page, `#/print/cards/${real.dayId}`, '.print-root .sheet');
  await page.raw('Emulation.setEmulatedMedia', { media: 'print' });
  await page.screenshot('fourup-realistic-max');
  await page.raw('Emulation.setEmulatedMedia', { media: '' });

  // 3. Wide wrapped prose with W labels, when it fits, also prints four-up.
  const wide = withFourCards(await page.eval(() => window.__pwpDebug.exportText()), 'wide-four', () => ({ title: W(80), lookLabel: W(60), notes: `${W(485)} ENDWIDE` }));
  await importText(page, wide.text);
  page.assert((await project(page)).cards.filter((c) => wide.ids.includes(c.id)).length === 4, 'wide-prose W cards are accepted');
  r = await printDay(page, wide.dayId, 'wide-prose-W-four-up', viewport.name);
  out.wide = { perSheet: r.perSheet, pdfPages: r.pdfPages, solo: r.solo, overflow: r.overflow, endWide: count(r.text, 'ENDWIDE') };
  page.assert(fourUp(r) && out.wide.endWide === 4, `wide prose prints four-up ${JSON.stringify(out.wide)}`);

  // 4. Near-boundary cards: for each shape the most note lines the rules accept
  //    (whole-card rule for long or wide labels, cues and the maximum diagram;
  //    the 21-line rule for short labels). Four of them print four-up on one
  //    page with every line and each card's own end marker; one more line is refused.
  const shapes = [
    { key: 'A', title: W(80), lookLabel: W(60), cues: [] },
    { key: 'B', title: CAPS_TITLE, lookLabel: CAPS_LOOK, cues: CUES.slice(0, 2), diagram: MAX_DIAGRAM },
    { key: 'C', title: V9_TITLE, lookLabel: V9_LOOK, cues: CUES.slice(0, 1), diagram: MAX_DIAGRAM },
    { key: 'D', title: 'Short title', lookLabel: 'Short look', cues: [] },
  ];
  const plan = await page.eval(async (sh) => {
    const C = await import('/src/domain/cards.js');
    const base = { id: 'c', version: 1, family: 'f', fictional: true, provenance: null };
    return sh.map((x) => {
      const lines = (k) => Array.from({ length: k }, (_, i) => (i === k - 1 ? `END${x.key}${k}` : `${x.key}${String(i + 1).padStart(2, '0')}`));
      const mk = (k) => ({ ...base, title: x.title, lookLabel: x.lookLabel, cues: x.cues, diagram: x.diagram || { width: 100, height: 60, los: 24, tokens: [], arrows: [] }, notes: lines(k).join('\n') });
      let n = 0;
      while (n < 40 && !C.printFitError(mk(n + 1))) n++;
      const over = C.printFitError(mk(n + 1)) || '';
      const fit = C.cardFit(mk(n));
      return { ...x, n, lines: lines(n), notes: mk(n).notes, overNotes: mk(n + 1).notes, binding: /whole printed card/.test(over) ? 'whole-card' : /printed lines/.test(over) ? '21-line' : 'none', usedLines: Math.round(fit.usedLines * 100) / 100, maxLines: Math.round(fit.maxLines * 100) / 100 };
    });
  }, shapes);
  const near = withFourCards(await page.eval(() => window.__pwpDebug.exportText()), 'near-four', (i) => ({ title: plan[i].title, lookLabel: plan[i].lookLabel, notes: plan[i].notes, cues: plan[i].cues, ...(plan[i].diagram ? { diagram: plan[i].diagram } : {}) }));
  const nearMsg = await importText(page, near.text);
  page.assert((await project(page)).cards.filter((c) => near.ids.includes(c.id)).length === 4, `near-boundary cards are accepted: ${nearMsg.slice(0, 200)}`);
  r = await printDay(page, near.dayId, 'near-boundary-four-up', viewport.name);
  await go(page, `#/print/cards/${near.dayId}`, '.print-root .sheet');
  await page.raw('Emulation.setEmulatedMedia', { media: 'print' });
  await page.wait(150);
  const labels = await page.eval((ids) => ids.map((id) => {
    const c = document.querySelector(`.print-root [data-print-card="${id}"]`);
    const hs = [...c.querySelectorAll('.diagram text')].map((t) => t.getBoundingClientRect().height).filter((x) => x > 0);
    return { diagramPx: Math.round(c.querySelector('.diagram').getBoundingClientRect().height), minLabelPx: hs.length ? Math.round(Math.min(...hs) * 10) / 10 : null, labels: hs.length };
  }), near.ids);
  await page.screenshot('fourup-near-boundary');
  await page.raw('Emulation.setEmulatedMedia', { media: '' });
  out.nearBoundary = {
    shapes: plan.map((x, i) => ({ key: x.key, linesAccepted: x.n, binding: x.binding, usedLines: x.usedLines, cues: x.cues.length, maxDiagram: !!x.diagram, marker: `END${x.key}${x.n}`, markerCount: count(r.text, `END${x.key}${x.n}`), missingLines: x.lines.filter((l) => !r.text.includes(l)), ...labels[i] })),
    perSheet: r.perSheet, pdfPages: r.pdfPages, solo: r.solo, unprintable: r.unprintable, overflow: r.overflow, outsidePage: r.outsidePage,
  };
  log(`near-boundary: ${JSON.stringify(out.nearBoundary)}`);
  page.assert(fourUp(r) && out.nearBoundary.shapes.every((x) => x.markerCount === 1 && x.missingLines.length === 0), `near-boundary cards print four-up with every line ${JSON.stringify(out.nearBoundary)}`);
  // W labels reach the whole-card limit; ordinary all-caps labels with cues and the
  // maximum diagram stop at the 21-line rule within about half a line of it.
  page.assert(plan[0].binding === 'whole-card' && plan[1].usedLines >= plan[1].maxLines - 0.75 && plan[2].usedLines >= plan[2].maxLines - 0.75,
    `the near-boundary shapes are at the whole-card limit ${JSON.stringify(plan.map((x) => [x.key, x.n, x.binding, x.usedLines, x.maxLines]))}`);
  const overRefused = await page.eval(async (pl) => {
    const P = await import('/src/domain/project.js');
    const doc = JSON.parse(window.__pwpDebug.exportText());
    return pl.map((x, i) => {
      const d = structuredClone(doc);
      d.cards.push({ ...structuredClone(d.cards[0]), id: `over-${i}`, title: x.title, lookLabel: x.lookLabel, notes: x.overNotes, cues: x.cues, ...(x.diagram ? { diagram: x.diagram } : {}), version: 1, provenance: null });
      const res = P.importProject(JSON.stringify(d));
      return !res.ok && res.errors.some((e) => /cards\[\d+\]\.notes/.test(e.path));
    });
  }, plan);
  out.nearBoundary.oneMoreLineRefused = overRefused;
  page.assert(overRefused.every(Boolean), `one more line is refused for every shape ${JSON.stringify(overRefused)}`);

  // 5. Duplicate never adds a card the rule refuses: the " (copy)" title of a
  //    card at the boundary would not fit, so Duplicate says why and adds nothing.
  await fresh(page);
  const dupSet = withFourCards(await page.eval(() => window.__pwpDebug.exportText()), 'dup-near', () => ({ title: DUP_TITLE, lookLabel: '', notes: END21 }));
  await importText(page, dupSet.text);
  page.assert((await project(page)).cards.some((c) => c.id === 'dup-near-0'), 'the boundary card is accepted');
  await go(page, '#/cards', '[data-card-id="dup-near-0"]');
  // Sections 5-7 record every failure and assert once at the end, so one run shows them all.
  const failures = [];
  const check = (ok, msg) => { if (!ok) failures.push(msg); };
  const cardsBefore = (await project(page)).cards.length;
  const dupBefore = await settledStorage(page);
  await page.eval(() => [...document.querySelectorAll('[data-card-id="dup-near-0"] button')].find((b) => b.textContent.trim() === 'Duplicate').click());
  await page.wait(400);
  const dupToast = await toastText(page);
  const dupAfter = await settledStorage(page);
  const copies = (await project(page)).cards.length - cardsBefore;
  out.duplicate = { copies, storageAndMemoryUnchanged: dupAfter === dupBefore, toast: dupToast.slice(0, 300) };
  log(`duplicate: ${JSON.stringify(out.duplicate)}`);
  check(copies === 0 && out.duplicate.storageAndMemoryUnchanged && /Not duplicated/.test(dupToast) && /title/i.test(dupToast), `Duplicate refuses a copy that would not fit, and says why ${JSON.stringify(out.duplicate)}`);
  await page.screenshot('fourup-duplicate-refused');

  // 6. Save checks the version it stores: a v9 card whose v10 stamp is wider no
  //    longer fits, so Save is refused with the reason; the counter agrees.
  await fresh(page);
  const v9 = withFourCards(await page.eval(() => window.__pwpDebug.exportText()), 'v9-near', () => ({ title: V9_TITLE, lookLabel: V9_LOOK, notes: END21, version: 9 }));
  const v9Msg = await importText(page, v9.text);
  page.assert((await project(page)).cards.find((c) => c.id === 'v9-near-0')?.version === 9, `the v9 card is accepted at v9: ${v9Msg.slice(0, 200)}`);
  await go(page, '#/card/v9-near-0', 'input[name="cardTitle"]');
  const v9Counter = await page.text('[data-print-lines]');
  await page.click('[data-action="save-card"]');
  await page.wait(300);
  const v9After = await page.eval(() => ({ err: document.querySelector('.form-errors')?.textContent || '', title: document.querySelector('input[name="cardTitle"]').value, version: window.__pwpDebug.project().cards.find((c) => c.id === 'v9-near-0').version }));
  out.saveVersion = { counter: v9Counter, error: v9After.err.slice(0, 300), storedVersion: v9After.version, draftKept: v9After.title === V9_TITLE };
  log(`save v9 -> v10: ${JSON.stringify(out.saveVersion)}`);
  check(v9After.version === 9 && /look label|title/i.test(v9After.err) && /v10/.test(v9After.err) && out.saveVersion.draftKept, `Save refuses a v10 card that would not fit ${JSON.stringify(out.saveVersion)}`);
  check(/⚠ The whole card/.test(v9Counter), `the counter shows the same verdict before Save: ${v9Counter}`);

  // 7. Older over-long cards printed on their own page carry their note and are
  //    never clipped: across the range where the solo page fills up, every card
  //    either prints whole (with its end marker in the PDF) or is listed as not printed.
  await fresh(page);
  await settledStorage(page);
  const NS = Array.from({ length: 41 }, (_, i) => 84 + i);
  const legacyIds = await page.eval((ns) => {
    const proj = JSON.parse(localStorage.getItem('pwp:v1:project'));
    const ids = ns.map((n) => `legacy-solo-${n}`);
    ns.forEach((n, i) => proj.cards.push({ ...structuredClone(proj.cards[0]), id: ids[i], title: `Legacy ${n}-line card`, lookLabel: '', cues: [], version: 1, provenance: null, notes: Array.from({ length: n }, (_, k) => (k === n - 1 ? `ENDL${n}Z` : 'x')).join('\n') }));
    const day = structuredClone(proj.week.days[0]);
    day.id = 'day-legacy-solo';
    day.label = 'Probe legacy solo';
    day.version = 1;
    day.periods = [{ ...structuredClone(proj.week.days[0].periods[0]), id: 'per-legacy-solo', cardIds: ids }];
    proj.week.days.push(day);
    localStorage.setItem('pwp:v1:project', JSON.stringify(proj));
    return ids;
  }, NS);
  await reload(page, '#/print/cards/day-legacy-solo');
  await waitFor(page, () => !!document.querySelector('.print-root .sheet'), { label: 'print sheet' });
  await page.raw('Emulation.setEmulatedMedia', { media: 'print' });
  await page.wait(200);
  const solo = await page.eval((ids) => ids.map((id) => {
    const c = document.querySelector(`.print-root [data-print-card="${id}"]`);
    if (!c) return { id, printed: false };
    const notes = c.querySelector('.pcard-notes');
    const body = c.closest('.sheet-body').getBoundingClientRect();
    const r = c.getBoundingClientRect();
    return {
      id, printed: true, solo: c.classList.contains('pcard-solo'), note: !!c.querySelector('.pcard-solo-note'),
      clipped: c.scrollHeight > c.clientHeight + 1 || c.scrollWidth > c.clientWidth + 1 || notes.scrollWidth > notes.clientWidth + 1 || notes.getBoundingClientRect().bottom > r.bottom + 1 || r.bottom > body.bottom + 1,
    };
  }), legacyIds);
  const notPrinted = await page.eval(() => [...document.querySelectorAll('.print-root .pb-unprintable h2')].map((e) => e.textContent));
  const pdf = await page.raw('Page.printToPDF', { preferCSSPageSize: true, printBackground: true });
  if (PRINT_DIR && viewport.name === '1440x900') fs.writeFileSync(path.join(PRINT_DIR, 'legacy-solo-range-84-124.pdf'), Buffer.from(pdf.data, 'base64'));
  const legacyText = pdfText(pdf.data).text;
  await page.raw('Emulation.setEmulatedMedia', { media: '' });
  const printedNs = NS.filter((n, i) => solo[i].printed);
  out.legacySolo = {
    range: [NS[0], NS.at(-1)], printed: printedNs.length, notPrinted: notPrinted.length,
    largestPrinted: printedNs.at(-1) ?? null, clipped: solo.filter((x) => x.clipped).map((x) => x.id),
    withoutNote: solo.filter((x) => x.printed && !x.note).map((x) => x.id),
    markersMissing: printedNs.filter((n) => !legacyText.includes(`ENDL${n}Z`)),
  };
  log(`legacy solo range: ${JSON.stringify(out.legacySolo)}`);
  check(out.legacySolo.clipped.length === 0 && out.legacySolo.withoutNote.length === 0 && out.legacySolo.markersMissing.length === 0 && printedNs.length + notPrinted.length === NS.length && solo.every((x) => !x.printed || x.solo),
    `older over-long cards print whole with their note, or are listed as not printed ${JSON.stringify(out.legacySolo)}`);
  page.assert(failures.length === 0, failures.join(' || '));

  log(JSON.stringify(out));
  return out;
}
