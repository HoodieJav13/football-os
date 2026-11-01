// Shared helpers for headless-check --script journeys. Trusted local code: it
// talks only to the page under test through the check tool's page API.

export async function waitFor(page, fn, { timeout = 8000, interval = 80, label = 'condition' } = {}, ...args) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < timeout) {
    try {
      last = await page.eval(fn, ...args);
      if (last) return last;
    } catch {
      // The page may be mid-navigation; try again.
    }
    await page.wait(interval);
  }
  throw new Error(`timed out waiting for ${label}`);
}

// Clear this origin's storage and reload into a fresh fictional example.
export async function fresh(page, hash = '#/plan') {
  await page.eval(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
  await reload(page, hash);
}

export async function reload(page, hash) {
  await page.eval(() => { window.__beforeReload = true; });
  if (hash) await page.eval((h) => { history.replaceState(null, '', `${location.pathname}?test${h}`); }, hash);
  await page.raw('Page.reload', { ignoreCache: true });
  await waitFor(page, () => !window.__beforeReload && document.querySelector('#app')?.dataset.ready === 'true', { label: 'app ready after reload' });
  await page.wait(150);
}

export async function go(page, hash, selector) {
  await page.eval((h) => { location.hash = h; }, hash);
  await waitFor(page, (h, s) => location.hash === h && (!s || !!document.querySelector(s)), { label: `route ${hash}` }, hash, selector || null);
  await page.wait(80);
}

// Click the first element matching selector whose text includes `text`.
export async function clickText(page, selector, text) {
  const ok = await page.eval((s, t) => {
    document.querySelectorAll('[data-tmp-click]').forEach((e) => e.removeAttribute('data-tmp-click'));
    const el = [...document.querySelectorAll(s)].find((e) => e.textContent.includes(t));
    if (!el) return false;
    el.setAttribute('data-tmp-click', '1');
    return true;
  }, selector, text);
  if (!ok) throw new Error(`clickText: no "${selector}" containing "${text}"`);
  await page.click('[data-tmp-click]');
  await page.wait(80);
}

export async function setValue(page, selector, value) {
  const ok = await page.eval((s, v) => {
    const el = document.querySelector(s);
    if (!el) return false;
    el.focus();
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, selector, value);
  if (!ok) throw new Error(`setValue: no element "${selector}"`);
}

export const state = (page) => page.eval(() => window.__pwpDebug.state());
export const project = (page) => page.eval(() => window.__pwpDebug.project());
export const clock = (page) => page.eval(() => window.__pwpDebug.clock());

// Horizontal overflow: the page itself must not scroll sideways.
export async function overflow(page) {
  return page.eval(() => {
    const w = document.documentElement.clientWidth;
    const offenders = [];
    if (document.documentElement.scrollWidth > w + 1) {
      for (const el of document.querySelectorAll('#app *')) {
        const r = el.getBoundingClientRect();
        if (r.width && r.right > w + 1 && getComputedStyle(el).position !== 'fixed' && !el.closest('.table-wrap, .print-root')) offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} right=${Math.round(r.right)}`);
        if (offenders.length > 6) break;
      }
    }
    return { scrollWidth: document.documentElement.scrollWidth, clientWidth: w, ok: document.documentElement.scrollWidth <= w + 1, offenders };
  });
}

// Every visible interactive control should be at least 44 x 44 CSS px.
export async function smallTargets(page, root = '#view') {
  return page.eval((r) => {
    const out = [];
    for (const el of document.querySelectorAll(`${r} button, ${r} a.btn, ${r} select, ${r} input:not([type=checkbox]):not([type=radio]):not([type=file]), ${r} summary, .nav a`)) {
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height || el.closest('[hidden]') || getComputedStyle(el).visibility === 'hidden') continue;
      if (b.height < 43.5 || b.width < 43.5) out.push(`${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30)}" ${Math.round(b.width)}x${Math.round(b.height)}`);
    }
    return out;
  }, root);
}

export async function toastText(page) {
  return page.eval(() => [...document.querySelectorAll('.toast-text')].map((e) => e.textContent).join(' | '));
}
