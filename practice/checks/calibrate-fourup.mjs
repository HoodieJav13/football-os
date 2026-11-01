// Calibration (opt-in, not a pass/fail check): measure how a quarter-page
// printed card spends its height in Chrome print media, for the four-up fit
// rule. Each probe card is printed alone; the dense layout (the most compact
// the pager uses) is forced and the natural height of every part is read.
import { fresh, go, setValue, waitFor } from './lib.mjs';

const W = (n) => 'W'.repeat(n);
const lines = (n, last = 'END') => Array.from({ length: n }, (_, i) => (i === n - 1 ? last : 'x')).join('\n');
const PROBES = [
  { id: 'cal-short', title: 'Short', lookLabel: 'Short', notes: 'x', cues: [] },
  { id: 'cal-w', title: W(80), lookLabel: W(60), notes: lines(21, 'END21'), cues: [] },
  { id: 'cal-real', title: 'Scout card: Trips Right motion — Monday walkthrough and Wednesday team rehearsal', lookLabel: 'Trips Right · 11 personnel · left hash · motion toward trips', notes: lines(21, 'END21'), cues: [] },
  { id: 'cal-cues', title: 'Short', lookLabel: 'Short', notes: 'x', cues: ['REFERENCE / FICTIONAL: one', 'REFERENCE / FICTIONAL: two', 'REFERENCE / FICTIONAL: three', 'REFERENCE / FICTIONAL: four'] },
  { id: 'cal-wlook', title: 'Short', lookLabel: W(60), notes: 'x', cues: [] },
  { id: 'cal-wtitle', title: W(80), lookLabel: 'Short', notes: 'x', cues: [] },
  { id: 'cal-lower-look', title: 'Short', lookLabel: 'abcdefghij'.repeat(6), notes: 'x', cues: [] },
  { id: 'cal-lower-title', title: 'abcdefghij'.repeat(8), lookLabel: 'Short', notes: 'x', cues: [] },
  { id: 'cal-wnotes', title: 'Short', lookLabel: 'Short', notes: W(120), cues: [] },
  { id: 'cal-lnotes', title: 'Short', lookLabel: 'Short', notes: 'abcdefghij'.repeat(20), cues: [] },
];

export default async function (page, { viewport }) {
  if (viewport.name !== '1440x900') return { skipped: 'measured once (print layout is viewport-independent)' };
  await fresh(page);
  const doc = JSON.parse(await page.eval(() => window.__pwpDebug.exportText()));
  // Probe cards are added straight to the export (validation of the old rule
  // may refuse some); the import path is not under test here.
  for (const p of PROBES) doc.cards.push({ ...structuredClone(doc.cards[0]), ...p, version: 1, provenance: null });
  await page.eval((text) => {
    const d = JSON.parse(text);
    localStorage.setItem('pwp:v1:project', JSON.stringify({ ...d, clock: undefined }));
  }, JSON.stringify(doc));
  await page.eval(() => location.reload());
  await page.wait(1500);
  await waitFor(page, () => document.querySelector('#app')?.dataset.ready === 'true', { label: 'reloaded' });
  const out = [];
  for (const p of PROBES) {
    await go(page, `#/print/cards/${p.id}`, '.print-root .pcard, .print-root .pb-unprintable');
    await page.raw('Emulation.setEmulatedMedia', { media: 'print' });
    await page.wait(120);
    out.push(await page.eval((id) => {
      // Re-render the card in a four-up cell with the dense class, whatever the pager chose.
      const host = document.createElement('div');
      host.className = 'print-pages';
      host.style.cssText = 'position:absolute;left:-30000px;top:0;';
      document.body.appendChild(host);
      const sheet = document.querySelector('.print-root .sheet').cloneNode(true);
      host.appendChild(sheet);
      const src = sheet.querySelector('.pcard');
      const body = sheet.querySelector('.sheet-body');
      body.textContent = '';
      const page = document.createElement('div');
      page.className = 'card-page';
      const legend = document.createElement('p');
      legend.className = 'pcard-legend';
      legend.textContent = 'Diagrams are illustrative, not to scale. ○ offense · ▽ defense · solid arrow = route · thick = run · dashed = motion · bar end = block.';
      const grid = document.createElement('div');
      grid.className = 'card-sheet';
      page.append(legend, grid);
      body.appendChild(page);
      const card = src || document.createElement('article');
      card.classList.remove('pcard-solo');
      card.classList.add('pcard-dense');
      grid.appendChild(card);
      const h = (sel) => { const e = card.querySelector(sel); return e ? Math.round(e.getBoundingClientRect().height * 10) / 10 : 0; };
      const lh = (sel) => { const e = card.querySelector(sel); return e ? parseFloat(getComputedStyle(e).lineHeight) : 0; };
      const cs = getComputedStyle(card);
      const r = {
        id, cellClient: card.clientHeight, cellWidth: card.clientWidth, scrollHeight: card.scrollHeight, fits: card.scrollHeight <= card.clientHeight + 1,
        head: h('.pcard-head'), lookLine: lh('.pcard-look'), title: h('.pcard-title'), titleLine: lh('.pcard-title'),
        diagram: h('.diagram'), notes: h('.pcard-notes'), notesLine: lh('.pcard-notes'), cues: h('.pcard-cues'), cueLine: lh('.pcard-cues li'),
        gap: parseFloat(cs.rowGap) || 0, padTop: parseFloat(cs.paddingTop), padBottom: parseFloat(cs.paddingBottom), border: parseFloat(cs.borderTopWidth) * 2,
        lookWidth: card.querySelector('.pcard-look') ? Math.round(card.querySelector('.pcard-look').getBoundingClientRect().width) : 0,
        stampWidth: card.querySelector('.pcard-stamp') ? Math.round(card.querySelector('.pcard-stamp').getBoundingClientRect().width) : 0,
      };
      host.remove();
      return r;
    }, p.id));
    await page.raw('Emulation.setEmulatedMedia', { media: '' });
  }
  // Glyph widths in the dense print fonts, measured on 40-character runs inside a real dense card.
  await go(page, `#/print/cards/cal-cues`, '.print-root .pcard');
  await page.raw('Emulation.setEmulatedMedia', { media: 'print' });
  await page.wait(120);
  const glyphs = await page.eval(() => {
    const chars = [];
    for (let c = 32; c <= 126; c++) chars.push(String.fromCharCode(c));
    chars.push('·', '—', '–', '’', '‘', '“', '”', 'é', '•', '…', '×', '→');
    const card = document.querySelector('.print-root .pcard');
    card.classList.add('pcard-dense');
    const probe = (cls) => {
      const host = card.querySelector(cls) || card;
      const span = document.createElement('span');
      span.style.whiteSpace = 'pre';
      host.appendChild(span);
      const res = {};
      for (const ch of chars) { span.textContent = ch.repeat(40); res[ch] = Math.round((span.getBoundingClientRect().width / 40) * 1000) / 1000; }
      const cs = getComputedStyle(span);
      const font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; // read before the span leaves the card
      span.remove();
      return { font, widths: res };
    };
    const ul = card.querySelector('.pcard-cues');
    const li = ul && ul.querySelector('li');
    return {
      notes: probe('.pcard-notes'), title: probe('.pcard-title'), look: probe('.pcard-look'), cues: probe('.pcard-cues li'),
      contentWidth: card.clientWidth - parseFloat(getComputedStyle(card).paddingLeft) - parseFloat(getComputedStyle(card).paddingRight),
      cueTextWidth: li ? li.getBoundingClientRect().width : null,
      stampWidth: card.querySelector('.pcard-stamp').getBoundingClientRect().width,
      headGap: parseFloat(getComputedStyle(card.querySelector('.pcard-head')).columnGap) || 0,
    };
  });
  await page.raw('Emulation.setEmulatedMedia', { media: '' });
  return { parts: out, glyphs };
}
