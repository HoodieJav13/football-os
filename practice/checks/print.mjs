// Print checks: every print view in print media. No sheet overflows, every
// block and card sits wholly inside one page body (never split or clipped),
// every page carries FICTIONAL / REFERENCE and versions, and the browser's own
// PDF has exactly one page per sheet. Includes a worst-case stress project
// imported through the normal import path.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fresh, go, waitFor, setValue, project } from './lib.mjs';
import { pdfText } from './pdftext.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// The runner passes its evidence area; the default keeps the original location.
const PDF_DIR = process.env.PWP_PRINT_DIR || path.join(ROOT, 'evidence', 'print');

function stressDoc(text) {
  const doc = JSON.parse(text);
  const long = (n, word) => Array.from({ length: Math.ceil(n / (word.length + 1)) }, () => word).join(' ').slice(0, n);
  const mon = doc.week.days[0];
  const day = structuredClone(mon);
  day.id = 'day-stress-print';
  day.label = 'Stress day (long text)';
  day.version = 1;
  day.periods = Array.from({ length: 14 }, (_, i) => ({
    ...structuredClone(mon.periods[i % mon.periods.length]),
    id: `per-stress-${i}`,
    title: `${i + 1}. ${long(110, 'Longtitle')}`,
    objective: long(300, 'objective'),
    callLabel: long(60, 'call'),
    notes: i === 13 ? `${long(1989, 'notes')} ENDNOTES14` : i % 3 === 0 ? `${'U'.repeat(400)} ${long(1590, 'note')}` : long(2000, 'notes'),
    equipment: Array.from({ length: 8 }, (_, k) => `Item ${k} ${long(40, 'gear')}`),
    cardIds: doc.cards.slice(0, 4).map((c) => c.id),
    groupIds: ['grp-skill', 'grp-line', 'grp-pass'],
  }));
  doc.week.days.push(day);
  const card = structuredClone(doc.cards[0]);
  card.id = 'card-stress-print';
  card.title = long(80, 'Maxtitle');
  card.lookLabel = long(60, 'Maxlook');
  card.notes = `${long(490, 'cardnote')} ENDSTRESS`; // 500 characters: the limit
  card.cues = Array.from({ length: 4 }, (_, i) => (i < 3 ? `REFERENCE / FICTIONAL: ${long(116, `cue${i}`)}` : `REFERENCE / FICTIONAL: ${long(109, `cue${i}`)} ENDCUE`)); // 4 x ~140 chars: the limit
  card.diagram.tokens = Array.from({ length: 24 }, (_, i) => ({ id: `t${i}`, label: 'WWWW', x: (i % 12) * 8 + 4, y: i < 12 ? 26 : 40, side: i % 5 ? 'O' : 'D' }));
  card.diagram.arrows = Array.from({ length: 24 }, (_, i) => ({ id: `a${i}`, from: { x: (i % 12) * 8 + 4, y: 26 }, to: { x: (i % 12) * 8 + 6, y: 4 + (i % 4) }, kind: ['route', 'run', 'block', 'motion'][i % 4], label: 'WWWWWWWWWWWW' }));
  doc.cards.push(card);
  // Multiline probes (F2): explicit newlines and blank lines at the printed-line
  // limit, notes + cues sharing it, and wrapped prose. Each ends with a marker
  // that must appear in the browser's own PDF.
  const probe = (id, title, notes, cues = []) => ({ ...structuredClone(doc.cards[1]), id, version: 1, title, lookLabel: title, notes, cues, provenance: null });
  doc.cards.push(
    probe('card-ml-blank', 'Multiline probe: blank lines', Array.from({ length: 21 }, (_, i) => (i === 0 ? 'Blank-line probe' : i === 20 ? 'ENDBLANK' : i % 2 ? '' : 'x')).join('\n')),
    probe('card-ml-mixed', 'Multiline probe: notes and cues', Array.from({ length: 17 }, (_, i) => (i === 16 ? 'ENDMIX' : `line ${i + 1}`)).join('\n'), Array.from({ length: 4 }, (_, i) => `REFERENCE / FICTIONAL: short cue ${i + 1}`)),
    probe('card-ml-prose', 'Multiline probe: wrapped prose', `${long(490, 'prose')} ENDPROSE`),
  );
  // Probe days that print 4, 5 and 10 cards (four per page).
  const ids = doc.cards.map((c) => c.id);
  for (const n of [4, 5, 10]) {
    const pd = structuredClone(mon);
    pd.id = `day-probe-${n}`;
    pd.label = `Probe day ${n} cards`;
    pd.version = 1;
    pd.periods = [{ ...structuredClone(mon.periods[0]), id: `per-probe-${n}`, cardIds: ids.slice(-n), groupIds: [] }];
    doc.week.days.push(pd);
  }
  return JSON.stringify(doc);
}

const MARKERS = { 'cards-all': ['ENDBLANK', 'ENDMIX', 'ENDPROSE', 'ENDSTRESS', 'ENDCUE'], 'card-stress': ['ENDSTRESS', 'ENDCUE'], 'card-ml-blank': ['ENDBLANK'], 'card-ml-mixed': ['ENDMIX'], 'card-ml-prose': ['ENDPROSE'], 'cards-10': ['ENDBLANK', 'ENDMIX', 'ENDPROSE', 'ENDSTRESS'], 'script-stress-day-long-text-': ['ENDNOTES14'] };
const CARD_LAYOUT = { 'card-stress': [1], 'card-ml-blank': [1], 'card-ml-mixed': [1], 'card-ml-prose': [1], 'cards-4': [4], 'cards-5': [4, 1], 'cards-10': [4, 4, 2], 'cards-all': [4, 4, 4, 1] };

async function checkSheets(page) {
  return page.eval(() => {
    const sheets = [...document.querySelectorAll('.print-root .sheet')];
    const problems = [];
    sheets.forEach((s, i) => {
      const body = s.querySelector('.sheet-body');
      const br = body.getBoundingClientRect();
      if (body.scrollHeight > body.clientHeight + 1) problems.push(`sheet ${i + 1}: body overflows (${body.scrollHeight} > ${body.clientHeight})`);
      if (s.scrollWidth > s.clientWidth + 1) problems.push(`sheet ${i + 1}: horizontal overflow`);
      const head = s.querySelector('.sheet-head').textContent;
      if (!/FICTIONAL \/ REFERENCE/.test(head) || !/Project rev \d+/.test(head) || !/week v\d+/.test(head)) problems.push(`sheet ${i + 1}: header missing status/version`);
      for (const b of s.querySelectorAll('.pblock, .pcard')) {
        const r = b.getBoundingClientRect();
        if (r.top < br.top - 1 || r.bottom > br.bottom + 1) problems.push(`sheet ${i + 1}: block outside the page body (${Math.round(r.top - br.top)}..${Math.round(r.bottom - br.top)} of ${Math.round(br.height)})`);
        if (b.classList.contains('pcard') && b.scrollHeight > b.clientHeight + 1) problems.push(`sheet ${i + 1}: card content clipped (${b.scrollHeight} > ${b.clientHeight})`);
        if (b.scrollWidth > b.clientWidth + 1) problems.push(`sheet ${i + 1}: block wider than the page`);
      }
    });
    return { sheets: sheets.length, problems, dayVersion: sheets.every((s) => /day v\d+/.test(s.querySelector('.sheet-head').textContent)) };
  });
}

function pdfPages(b64) {
  const txt = Buffer.from(b64, 'base64').toString('latin1');
  return (txt.match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
}

export default async function (page, { viewport, log }) {
  await page.raw('Page.setDownloadBehavior', { behavior: 'deny' }).catch(() => {});
  await fresh(page, '#/plan');
  const savePdf = viewport.name === '1440x900';
  if (savePdf) fs.mkdirSync(PDF_DIR, { recursive: true });

  // Rotations for every day so rotation sheets have content (Wednesday has a shortage).
  const p0 = await project(page);
  for (const d of p0.week.days) {
    await go(page, `#/rotation/${d.id}`, '[data-action="generate"]');
    if (await page.eval(() => !document.querySelector('[data-action="generate"]').disabled)) {
      await page.click('[data-action="generate"]');
      await waitFor(page, (id) => !!window.__pwpDebug.project().rotations[id], { label: `rotation ${d.label}` }, d.id);
    }
  }
  // Stress project through the normal import path.
  const text = await page.eval(() => window.__pwpDebug.exportText());
  await go(page, '#/data', '[data-import-text]');
  await setValue(page, '[data-import-text]', stressDoc(text));
  await page.click('[data-action="import-text"]');
  await waitFor(page, () => window.__pwpDebug.project().week.days.some((d) => d.id === 'day-stress-print'), { label: 'stress import' });
  const p = await project(page);

  const targets = [['week', '', 'week-summary'], ...p.week.days.map((d) => ['day', d.id, `script-${d.label.replace(/\W+/g, '-').toLowerCase()}`]),
    ...p.week.days.filter((d) => p.rotations[d.id]).map((d) => ['rotation', d.id, `rotation-${d.label.replace(/\W+/g, '-').toLowerCase()}`]),
    ['cards', 'all', 'cards-all'], ['cards', 'card-stress-print', 'card-stress'],
    ['cards', 'card-ml-blank', 'card-ml-blank'], ['cards', 'card-ml-mixed', 'card-ml-mixed'], ['cards', 'card-ml-prose', 'card-ml-prose'],
    ['cards', 'day-probe-4', 'cards-4'], ['cards', 'day-probe-5', 'cards-5'], ['cards', 'day-probe-10', 'cards-10']];
  const results = [];
  for (const [kind, id, label] of targets) {
    await go(page, `#/print/${kind}${id ? `/${id}` : ''}`, '.print-root .sheet');
    await page.raw('Emulation.setEmulatedMedia', { media: 'print' });
    await page.wait(150);
    const r = await checkSheets(page);
    const pdf = await page.raw('Page.printToPDF', { preferCSSPageSize: true, printBackground: true });
    const pages = pdfPages(pdf.data);
    if (savePdf) fs.writeFileSync(path.join(PDF_DIR, `${label}.pdf`), Buffer.from(pdf.data, 'base64'));
    const row = { kind, label, sheets: r.sheets, pdfPages: pages, problems: r.problems };
    if (MARKERS[label] || CARD_LAYOUT[label]) {
      const t = pdfText(pdf.data);
      row.pdfTextPages = t.pageCount;
      row.markersFound = (MARKERS[label] || []).filter((m) => t.text.includes(m));
      page.assert(row.markersFound.length === (MARKERS[label] || []).length, `${label}: PDF text is missing ${(MARKERS[label] || []).filter((m) => !t.text.includes(m)).join(', ')}`);
    }
    if (kind === 'cards') {
      const lay = await page.eval(() => ({ perSheet: [...document.querySelectorAll('.print-root .sheet')].map((s) => s.querySelectorAll('.pcard').length), solo: document.querySelectorAll('.print-root .pcard-solo').length, unprintable: document.querySelectorAll('.print-root .pb-unprintable').length }));
      row.perSheet = lay.perSheet;
      page.assert(lay.solo === 0 && lay.unprintable === 0, `${label}: every accepted card prints four to a page (solo ${lay.solo}, unprintable ${lay.unprintable})`);
      if (CARD_LAYOUT[label]) page.assert(JSON.stringify(lay.perSheet) === JSON.stringify(CARD_LAYOUT[label]), `${label}: cards per sheet ${JSON.stringify(lay.perSheet)} (expected ${JSON.stringify(CARD_LAYOUT[label])})`);
    }
    results.push(row);
    page.assert(r.problems.length === 0, `${label}: ${r.problems.slice(0, 4).join('; ')}`);
    page.assert(pages === r.sheets, `${label}: PDF has ${pages} pages for ${r.sheets} sheets (a sheet split or overflowed)`);
    if (kind !== 'week' && kind !== 'cards') page.assert(r.dayVersion, `${label}: day version on every page`);
    if (['week-summary', 'script-monday', 'rotation-wednesday', 'cards-all', 'card-stress', 'script-stress-day-long-text-', 'card-ml-blank', 'cards-10'].includes(label)) {
      await page.eval(() => window.scrollTo(0, document.querySelector('.print-root').getBoundingClientRect().top + window.scrollY));
      await page.screenshot(`print-${label}`);
    }
    await page.raw('Emulation.setEmulatedMedia', { media: '' });
  }
  const wedRot = results.find((x) => x.label === 'rotation-wednesday');
  page.assert(wedRot, 'Wednesday rotation sheet printed');
  log(JSON.stringify(results.map((x) => `${x.label}:${x.sheets}/${x.pdfPages}`)));
  return results.map(({ problems, ...x }) => x);
}
