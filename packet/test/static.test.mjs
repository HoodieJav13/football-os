import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { sampleCover3 } from '../public/src/sample-cover3.js';
import { samplePractice } from '../public/src/sample-practice.js';

const APP = fileURLToPath(new URL('..', import.meta.url));
const PACKET_ROOT = join(APP, '..');
const SRC = join(APP, 'public', 'src');

const sources = () => [
  ...readdirSync(SRC).map((name) => join(SRC, name)),
  join(APP, 'public', 'index.html'),
  join(APP, 'public', 'styles.css'),
  join(APP, 'server.mjs'),
].map((path) => ({ path, text: readFileSync(path, 'utf8') }));

test('shipped code uses no unsafe rendering, network calls or source store keys', () => {
  const banned = /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function|\bfetch\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|pwp:v1/;
  for (const { path, text } of sources()) assert.doesNotMatch(text, banned, path);
});

test('shipped code references no external URL', () => {
  for (const { path, text } of sources()) {
    const urls = text.match(/https?:\/\/[^\s'"`)]+/g) ?? [];
    const external = urls.filter((url) => url !== 'http://www.w3.org/2000/svg' && !url.startsWith('http://local') && !url.startsWith('http://${HOST}'));
    assert.deepEqual(external, [], path);
  }
});

test('shipped modules import only local app files or Node built-ins', () => {
  for (const { path, text } of sources()) {
    for (const [, specifier] of text.matchAll(/from\s+'([^']+)'/g)) {
      assert.match(specifier, /^(\.\/[\w-]+\.js|node:[\w/]+)$/, `${path}: ${specifier}`);
    }
  }
  const manifest = JSON.parse(readFileSync(join(APP, 'package.json'), 'utf8'));
  assert.equal(manifest.dependencies, undefined);
  assert.equal(manifest.devDependencies, undefined);
});

test('the page shell names no answers, coverage or key content', () => {
  const html = readFileSync(join(APP, 'public', 'index.html'), 'utf8');
  assert.doesNotMatch(html, /Cover ?3|Deep|hook|flat|Coach key|packet-cover3|rev-/i);
  assert.match(html, /FICTIONAL \/ REFERENCE/);
  assert.match(html, /authored DRAFT/);
});

test('stylesheet has no clipping, inline job colors or external assets', () => {
  const css = readFileSync(join(APP, 'public', 'styles.css'), 'utf8').toLowerCase();
  assert.doesNotMatch(css, /overflow(-[xy])?\s*:\s*hidden|url\(|@import|@font-face/);
  assert.doesNotMatch(css, /#7cb7ff|#f1c86a|#67d9c0/);
  // Decorative swatches may have fixed dimensions; printable content must flow.
  const contentSelector = /\.(?:paper|preview|block|period|drill|figure|identify-card)(?![-\w])/;
  for (const [, selector, declarations] of css.matchAll(/(?:^|\n)([^{}]+)\{([^{}]*)\}/g)) {
    if (contentSelector.test(selector)) assert.doesNotMatch(declarations, /(^|[;\s])height\s*:\s*\d+(\.\d+)?(px|in|cm|mm|pt|vh)/m, `no fixed-height printable content: ${selector.trim()}`);
  }
  assert.match(css, /@media print/);
});

test('phone controls keep the 44px minimum', () => {
  const css = readFileSync(join(APP, 'public', 'styles.css'), 'utf8');
  for (const selector of ['button, .file-button', 'select', 'summary', '.output-tab']) {
    const start = css.indexOf(`\n${selector} {`);
    assert.ok(start >= 0, selector);
    assert.match(css.slice(start, css.indexOf('}', start)), /min-height: 44px/, selector);
  }
});

const frozen = (relative) => join(PACKET_ROOT, relative);

test('bundled samples equal the frozen fixtures', { skip: !existsSync(frozen('fixtures')) }, () => {
  const read = (name) => JSON.parse(readFileSync(frozen(`fixtures/${name}`), 'utf8'));
  assert.deepEqual(samplePractice, read('practice-fictional.project.json'));
  assert.deepEqual(sampleCover3, read('cover3-authored-example.json'));
});

test('reused schedule modules are byte-identical to the frozen reference', { skip: !existsSync(frozen('reference')) }, () => {
  for (const [copy, reference] of [['practice-week.js', 'practice-week.js'], ['practice-time.js', 'practice-time.js']]) {
    assert.ok(readFileSync(join(SRC, copy)).equals(readFileSync(frozen(`reference/${reference}`))), copy);
  }
});
