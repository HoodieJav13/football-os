// Safe rendering: hostile text stays text; the paginator never splits a block.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createH } from '../src/ui/dom.js';
import { paginate } from '../src/ui/paginate.js';

// Minimal fake DOM that records how content gets in.
function fakeDoc() {
  const log = [];
  const mk = (tag) => {
    const el = {
      tag, attrs: {}, children: [], style: {}, listeners: {},
      setAttribute(k, v) { this.attrs[k] = String(v); },
      append(...cs) { this.children.push(...cs); },
      appendChild(c) { this.children.push(c); return c; },
      addEventListener(t, f) { this.listeners[t] = f; },
    };
    Object.defineProperty(el, 'innerHTML', { set() { log.push('innerHTML'); throw new Error('innerHTML used'); } });
    return el;
  };
  return {
    log,
    createElement: mk,
    createElementNS: (_ns, tag) => mk(tag),
    createTextNode: (data) => ({ nodeType: 3, data }),
  };
}

const HOSTILE = '<img src=x onerror="window.__pwned=1"><script>alert(1)</script>&amp;';

test('children strings become text nodes verbatim', () => {
  const doc = fakeDoc();
  const h = createH(doc);
  const el = h('p', { class: 'note' }, HOSTILE, 42);
  assert.equal(el.children[0].nodeType, 3);
  assert.equal(el.children[0].data, HOSTILE);
  assert.equal(el.children[1].data, '42');
  assert.equal(el.attrs.class, 'note');
  assert.deepEqual(doc.log, []);
});

test('event handler attributes and script URLs are refused', () => {
  const h = createH(fakeDoc());
  assert.throws(() => h('div', { onclick: 'x()' }), /event/i);
  assert.throws(() => h('a', { href: 'javascript:alert(1)' }), /url/i);
  assert.throws(() => h('a', { href: ' JaVaScRiPt:alert(1)' }), /url/i);
  assert.throws(() => h('div', { innerHTML: '<b>x</b>' }), /innerHTML/i);
  const a = h('a', { href: '#/day/1' }, 'ok');
  assert.equal(a.attrs.href, '#/day/1');
});

test('listeners are attached through the on: map, not attributes', () => {
  const h = createH(fakeDoc());
  let hit = 0;
  const b = h('button', { on: { click: () => hit++ } }, 'Go');
  b.listeners.click();
  assert.equal(hit, 1);
  assert.equal(b.attrs.onclick, undefined);
});

test('null, false and nested arrays are handled', () => {
  const h = createH(fakeDoc());
  const el = h('ul', null, [h('li', null, 'a'), null, false, [h('li', null, 'b')]]);
  assert.equal(el.children.length, 2);
});

test('paginate packs blocks greedily, keeps order and never splits a block', () => {
  const pages = paginate([300, 300, 300, 200, 500, 100], 960);
  assert.deepEqual(pages.map((p) => p.indices), [[0, 1, 2], [3, 4, 5]]);
  const big = paginate([100, 1200, 100], 960);
  assert.deepEqual(big.map((p) => p.indices), [[0], [1], [2]]);
  assert.equal(big[1].oversized, true);
  assert.equal(big[0].oversized, false);
});

test('paginate honours forced page breaks and a header height per page', () => {
  const pages = paginate([{ h: 100 }, { h: 100, breakBefore: true }, { h: 100 }], 960, { headerHeight: 100 });
  assert.deepEqual(pages.map((p) => p.indices), [[0], [1, 2]]);
  const tight = paginate([400, 400, 400], 960, { headerHeight: 160 });
  assert.deepEqual(tight.map((p) => p.indices), [[0, 1], [2]], 'header space is reserved on every page');
  assert.deepEqual(paginate([], 960), []);
});
