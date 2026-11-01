// Eldorado Eagles styling: burnt orange / white / charcoal, dark mode. The
// screen theme lives in :root tokens; every text and control pair must stay
// readable (WCAG 2.x: 4.5:1 for text, 3:1 for focus rings and large marks).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const rootBlock = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
const tokens = Object.fromEntries([...rootBlock.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2].toLowerCase()]));

function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const t = (name) => { assert.ok(tokens[name], `token --${name} is defined in :root`); return tokens[name]; };

function hsl(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const l = (mx + mn) / 2; const d = mx - mn;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  const h = !d ? 0 : mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return { h, s: s * 100, l: l * 100 };
}

test('the brand is the owner reference burnt orange #CB6015 on charcoal with white', () => {
  assert.equal(t('brand'), '#cb6015', 'owner-supplied reference (RGB 203/96/21)');
  assert.equal(t('on-brand'), '#ffffff', 'white on the brand fill');
  // White on #CB6015 is only 4.02:1, so filled primary actions use the same hue a little darker.
  const b = hsl(t('brand'));
  for (const name of ['brand-fill', 'brand-hover', 'brand-text']) assert.ok(Math.abs(hsl(t(name)).h - b.h) < 1.5, `--${name} keeps the brand hue`);
  assert.ok(b.l - hsl(t('brand-fill')).l <= 5, 'the primary fill is only slightly darker than the reference');
  assert.ok(hsl(t('brand-text')).s < 85, 'accent text is not a bright tangerine');
  assert.ok(lum(t('bg')) < 0.03, 'dark mode: a charcoal page');
  assert.ok(lum(t('text')) > 0.9, 'near-white text');
});

test('every text colour is readable on every dark surface (4.5:1)', () => {
  const surfaces = ['bg', 'surface', 'surface-2', 'surface-3'];
  const texts = ['text', 'muted', 'brand-text', 'info', 'amber', 'error', 'rose'];
  const low = [];
  for (const s of surfaces) for (const x of texts) { const r = ratio(t(x), t(s)); if (r < 4.5) low.push(`--${x} on --${s}: ${r.toFixed(2)}`); }
  assert.deepEqual(low, []);
});

test('filled controls and marks are readable', () => {
  for (const fill of ['brand-fill', 'brand-hover']) assert.ok(ratio(t('on-brand'), t(fill)) >= 4.5, `white on --${fill}: ${ratio(t('on-brand'), t(fill)).toFixed(2)}`);
  for (const fill of ['brand-text', 'info', 'amber']) assert.ok(ratio(t('on-accent'), t(fill)) >= 4.5, `--on-accent on --${fill}: ${ratio(t('on-accent'), t(fill)).toFixed(2)}`);
  // #CB6015 itself is used only for non-text marks (stripe, selection edges): 3:1 against what it sits on.
  for (const s of ['bg', 'surface', 'surface-2']) assert.ok(ratio(t('brand'), t(s)) >= 3, `brand mark on --${s}: ${ratio(t('brand'), t(s)).toFixed(2)}`);
  assert.match(css, /\.nav-link\.is-active \{ background: var\(--surface-2\)/, 'selected navigation sits on a surface where the brand underline reads (3:1)');
  assert.ok(/\.btn-primary \{ background: var\(--brand-fill\)/.test(css), 'primary actions use the white-safe fill');
  for (const s of ['bg', 'surface', 'surface-2', 'surface-3']) assert.ok(ratio(t('focus'), t(s)) >= 3, `focus ring on --${s}`);
});

test('semantic colours are unchanged by the brand correction', () => {
  assert.equal(t('amber'), '#f2c14e');
  assert.equal(t('error'), '#ff9a8a');
  assert.equal(t('info'), '#d6d2c4');
  assert.equal(/--orange\b|#ff8f3f|#bf5700/i.test(css), false, 'the previous tangerine accent and brand are gone');
});

test('the old coral/lavender accents are gone from the screen theme', () => {
  assert.equal(/--coral|--lav\b/.test(css), false);
  assert.equal(/#f2836b|#b7a6ef/i.test(css), false);
});
