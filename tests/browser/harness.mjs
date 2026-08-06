import assert from "node:assert/strict";
import { after, before } from "node:test";
import { chromium } from "playwright";

/**
 * Shared setup for the browser suite.
 *
 * These tests exist because the unit suite and the build cannot see the two
 * failure modes that actually bit this app: a screen that renders nothing (a
 * temporal-dead-zone crash compiled perfectly happily), and a control that is
 * present in the DOM but invisible or unreachable. Everything here therefore
 * asserts on what a coach would see or do, never on implementation detail.
 *
 * The app URL comes from APP_URL, set by scripts/with-preview.mjs.
 */

const APP_URL = process.env.APP_URL;

/** Playwright resolves its own download unless the image pins a shared one. */
const launchOptions = process.env.PLAYWRIGHT_CHROMIUM_PATH
  ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
  : {};

export const DESKTOP = { width: 1440, height: 900 };
export const SMALL_LAPTOP = { width: 1280, height: 720 };
export const PHONE_LANDSCAPE = { width: 844, height: 390 };
export const PHONE_PORTRAIT = { width: 390, height: 844 };

/** Routes leave at the 2s snap mark, so "mid-play" is later than it looks. */
export const SNAP_SECONDS = 2;

let browser;

/**
 * Registers before/after hooks for a test file and returns an `open` function.
 * Each call to `open` yields a fresh context, so localStorage written by one
 * test can never leak into the next.
 */
export function useBrowser() {
  before(async () => {
    assert.ok(APP_URL, "APP_URL is not set -- run through scripts/with-preview.mjs");
    browser = await chromium.launch(launchOptions);
  });
  after(async () => {
    await browser?.close();
  });

  return async function open({ viewport = DESKTOP, touch = false, settle = 1800 } = {}) {
    const context = await browser.newContext({
      viewport,
      hasTouch: touch,
      isMobile: touch,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(APP_URL, { waitUntil: "networkidle" });
    // Let the first-load entrance (token stagger, then route draw) finish.
    await page.waitForTimeout(settle);
    return {
      page,
      errors,
      /** Fails with the actual messages rather than a bare count. */
      assertNoErrors: () => assert.deepEqual(errors, [], "console/page errors"),
      close: () => context.close(),
    };
  };
}

/* ------------------------------------------------------------------ *
 * Queries expressed the way a coach would describe them
 * ------------------------------------------------------------------ */

/** A player token by its position label, e.g. "X" or "C". */
export const token = (page, label) => page.locator(`g.player[aria-label^="${label},"]`);
export const defender = (page, label) => page.locator(`g.defender[aria-label^="${label},"]`);

/** Centre of an element, in page coordinates, for pointer work. */
export async function centreOf(locator) {
  const box = await locator.boundingBox();
  assert.ok(box, "element has no box -- it is not rendered");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Where a token sits on screen, rounded, for before/after comparisons. */
export async function tokenSpot(page, label) {
  return centreOf(token(page, label)).then((p) => [Math.round(p.x), Math.round(p.y)]);
}

/** Drags from one point to another with enough steps to look like a real drag. */
export async function dragTo(page, from, to, { steps = 10, release = true } = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  if (release) await page.mouse.up();
}

/** The SVG animation clock, in seconds; 0 is the start of pre-snap. */
export const playClock = (page) =>
  page.evaluate(() => document.querySelector(".play-canvas")?.getCurrentTime?.() ?? -1);

/** Waits for a run to finish and the transport to offer "Run" again. */
export const waitForIdle = (page) =>
  page.waitForFunction(
    () => document.querySelector(".run-button")?.textContent?.trim() === "Run",
    null,
    { timeout: 20000 },
  );

/** The play name in the header. */
export const currentPlay = (page) =>
  page.locator(".title-line h1").textContent().then((t) => t.trim());

/** The identity line in the inspector, or null when nothing is selected. */
export const inspectorIdentity = (page) =>
  page.evaluate(() => document.querySelector(".inspector-head h2")?.textContent?.trim() ?? null);
