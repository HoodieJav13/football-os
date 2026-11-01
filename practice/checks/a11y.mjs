// Accessibility floor across every view: each control has an accessible name,
// targets are >= 44 px, keyboard focus is visibly outlined, and no view
// scrolls sideways. (Automated floor only — not a screen-reader test.)
import { fresh, go, waitFor, overflow, smallTargets } from './lib.mjs';

async function unnamed(page) {
  return page.eval(() => {
    const name = (el) => {
      if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
      if (el.getAttribute('aria-labelledby')) return el.getAttribute('aria-labelledby').split(' ').map((id) => document.getElementById(id)?.textContent || '').join(' ');
      if (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return document.querySelector(`label[for="${CSS.escape(el.id)}"]`).textContent;
      if (el.closest('label')) return el.closest('label').textContent;
      if (['BUTTON', 'A', 'SUMMARY'].includes(el.tagName)) return el.textContent;
      return el.getAttribute('title') || '';
    };
    const out = [];
    for (const el of document.querySelectorAll('#app button, #app a[href], #app input, #app select, #app textarea, #app summary, dialog[open] button, dialog[open] input, dialog[open] select, dialog[open] textarea')) {
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      if (!name(el).trim()) out.push(`${el.tagName.toLowerCase()}${el.name ? `[name=${el.name}]` : ''}${el.className ? `.${String(el.className).split(' ')[0]}` : ''}`);
    }
    return out;
  });
}

async function focusRing(page, selector) {
  const sel = selector;
  await page.key('Tab', sel); // keyboard focus, so :focus-visible applies
  return page.eval((s) => {
    const el = document.activeElement;
    const cs = getComputedStyle(el);
    return { focused: el?.matches(s) || !!el, outline: `${cs.outlineStyle} ${cs.outlineWidth}`, visible: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 };
  }, sel);
}

export default async function (page, { viewport, log }) {
  await fresh(page, '#/plan');
  const p = await page.eval(() => window.__pwpDebug.project());
  const wed = p.week.days[2];
  const results = {};
  const views = [
    ['plan', `#/plan/${wed.id}`, '.day-plan'],
    ['rotation', `#/rotation/${wed.id}`, '[data-action="generate"]'],
    ['cards', '#/cards', '.card-grid'],
    ['card-editor', `#/card/${p.cards[0].id}`, '[data-stage]'],
    ['run', `#/run/${wed.id}`, '.run-head'],
    ['data', '#/data', '[data-action="export"]'],
    ['print', '#/print/week', '.print-root .sheet'],
  ];
  for (const [name, hash, sel] of views) {
    await go(page, hash, sel);
    if (name === 'rotation') {
      await page.click('[data-action="generate"]');
      await waitFor(page, () => document.querySelectorAll('.rot-table select').length > 0, { label: 'rotation tables' });
      await page.eval(() => { document.querySelector('[data-key="participants"]').open = true; });
    }
    if (name === 'run') {
      await page.click('[data-action="prepare"]');
      await waitFor(page, () => !!document.querySelector('[data-clock-action="start"]'), { label: 'clock' });
      await page.click('[data-clock-action="start"]');
    }
    const r = { unnamed: await unnamed(page), small: name === 'print' ? [] : await smallTargets(page), overflow: (await overflow(page)).ok };
    results[name] = r;
    page.assert(r.unnamed.length === 0, `${name}: controls without a name: ${r.unnamed.slice(0, 6).join(', ')}`);
    page.assert(r.small.length === 0, `${name}: small targets: ${r.small.slice(0, 6).join('; ')}`);
    page.assert(r.overflow, `${name}: horizontal overflow`);
  }
  // Period editor dialog.
  await go(page, `#/plan/${wed.id}`, '.day-plan');
  await page.click('[data-action="add-period"]');
  await waitFor(page, () => document.getElementById('editor').open, { label: 'editor' });
  results.editor = { unnamed: await unnamed(page) };
  page.assert(results.editor.unnamed.length === 0, `editor: ${results.editor.unnamed.join(', ')}`);
  await page.click('#editor [data-action="cancel"]');
  // Keyboard focus ring on a primary button.
  results.focus = await focusRing(page, '[data-action="add-period"]');
  page.assert(results.focus.visible, `focus ring ${JSON.stringify(results.focus)}`);
  // Status never by colour alone: warnings carry a symbol and words.
  results.statusText = await page.eval(() => [...document.querySelectorAll('.warn-item')].every((w) => /[✕⚠ℹ]/.test(w.textContent) && w.querySelector('.sr-only')));
  page.assert(results.statusText, 'warnings carry symbol + text');
  log(JSON.stringify(results));
  return results;
}
