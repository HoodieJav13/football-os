import assert from "node:assert/strict";
import test from "node:test";
import { useBrowser } from "./harness.mjs";

const open = useBrowser();

/*
 * AGENTS.md: "Production offline status may say `Offline ready` only after the
 * service worker has primed a same-origin application cache."
 *
 * A coach on a field with no signal trusts that label, so it is asserted at
 * the level of the promise it makes rather than at the level of the module
 * that computes it. The signal is public/sw.js's CACHE_URLS handshake
 * (src/offline.js primes the cache and only then emits `ready: true`); the
 * observable side of that is the "football-os-shell-v1" Cache holding the
 * app's own bundle. So: sample the header label and the cache together from
 * the first paint onward, and reject any sample where the label is ahead of
 * the cache.
 *
 * Runs against the production build (vite preview); the dev server never
 * registers the worker and the label reads "Local workspace" there.
 */

const STATUS = ".offline-state";
const label = (page) => page.evaluate((sel) => document.querySelector(sel)?.textContent?.trim() ?? "", STATUS);

/** Whether the app's shell cache holds the page and its script bundle. */
const cachePrimed = (page) => page.evaluate(async () => {
  if (!("caches" in window)) return false;
  const cache = await caches.open("football-os-shell-v1");
  const keys = (await cache.keys()).map((request) => new URL(request.url).pathname);
  const bundle = [...document.scripts].map((script) => script.src).filter(Boolean)
    .map((src) => new URL(src).pathname);
  return keys.includes("/index.html") && bundle.length > 0 && bundle.every((path) => keys.includes(path));
});

test("'Offline ready' never appears before the service worker has primed the cache", async () => {
  const app = await open({ settle: 0 });
  const { page } = app;

  const samples = [];
  const deadline = Date.now() + 15000;
  let sawReady = false;
  while (Date.now() < deadline) {
    const sample = { label: await label(page), primed: await cachePrimed(page), at: Date.now() };
    samples.push(sample);
    if (sample.label === "Offline ready" && sample.primed) { sawReady = true; break; }
    await page.waitForTimeout(40);
  }

  const early = samples.filter((sample) => /^Offline/.test(sample.label) && !sample.primed);
  assert.deepEqual(early, [], `label claimed readiness before the cache held the app: ${JSON.stringify(early)}`);
  assert.ok(samples.length > 0 && samples[0].label !== "Offline ready" || samples[0].primed,
    `first paint must not already promise readiness with an empty cache (first sample: ${JSON.stringify(samples[0])})`);
  assert.ok(sawReady, `the label reaches 'Offline ready' once the cache is primed (last: ${JSON.stringify(samples.at(-1))})`);
  assert.ok(await page.evaluate(() => Boolean(navigator.serviceWorker?.controller)), "a service worker controls the page");
  app.assertNoErrors();
  await app.close();
});

/*
 * The negative half: block the worker entirely (Playwright's serviceWorkers:
 * 'block' makes registration fail) and the label must never promise
 * readiness, no matter how long it waits. A label derived from `navigator.onLine`
 * or from the mere existence of the worker API would pass the positive test
 * by luck and fail this one.
 */
test("with no service worker, the label never says 'Offline ready'", async () => {
  const app = await open({ settle: 0, serviceWorkers: "block" });
  const { page } = app;
  const seen = new Set();
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    seen.add(await label(page));
    await page.waitForTimeout(100);
  }
  assert.ok(!seen.has("Offline ready") && !seen.has("Offline · ready"),
    `label promised readiness without a worker: ${[...seen].join(" | ")}`);
  assert.ok(seen.has("Preparing offline"), `label states that it is not ready yet: ${[...seen].join(" | ")}`);
  assert.equal(await page.evaluate(() => navigator.serviceWorker?.controller ?? null), null, "no worker controls the page");
  await app.close();
});

/*
 * The promise itself: once the label says ready, cutting the network and
 * reloading must still produce a full board, served by the worker.
 */
test("once 'Offline ready', the app reloads with the network cut", async () => {
  const app = await open({ settle: 0 });
  const { page, context } = app;
  await page.waitForFunction((sel) => document.querySelector(sel)?.textContent?.trim() === "Offline ready", STATUS, { timeout: 15000 });

  await context.setOffline(true);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(1500);
  const board = await page.evaluate(() => ({
    offense: document.querySelectorAll("g.player").length,
    defense: document.querySelectorAll("g.defender").length,
    label: document.querySelector(".offline-state")?.textContent?.trim(),
  }));
  assert.equal(board.offense, 11, "offense rendered from the cache");
  assert.equal(board.defense, 11, "defense rendered from the cache");
  assert.equal(board.label, "Offline · ready", "the header reports offline with a ready copy");
  await context.setOffline(false);
  await app.close();
});
