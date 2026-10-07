import assert from "node:assert/strict";
import { WORKSPACE_KEY } from "../../src/workspaceData.js";
import { token } from "./harness.mjs";

/*
 * Helpers for the multi-tab suite. Every scenario uses genuine same-origin
 * pages in one browser context, so they share localStorage, Web Locks and
 * BroadcastChannel exactly as two tabs of one browser profile do.
 *
 * Durable results are always read from a *fresh third page* that never runs
 * the app: it loads a static same-origin file and reads localStorage, so the
 * act of observing cannot itself write (an app page would acquire editing
 * authority and save).
 */

const APP_URL = process.env.APP_URL;
export const GAME_DAY_KEY = "football-os.game-day.v7";
export const RECOVERY_KEY = "football-os.recovery.v1";

/** Opens another tab of the same profile and waits for the board. */
export async function openTab(context, { init, settle = 1200 } = {}) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  if (init) await page.addInitScript(init);
  await page.goto(APP_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(settle);
  return { page, errors, assertNoErrors: () => assert.deepEqual(errors, [], "console/page errors") };
}

/** Every Football OS key, read by a fresh page that does not run the app. */
export async function readDurable(context) {
  const page = await context.newPage();
  await page.goto(new URL("manifest.webmanifest", APP_URL).href);
  const values = await page.evaluate(() => Object.fromEntries(
    Object.keys(localStorage).filter((key) => key.startsWith("football-os.")).sort().map((key) => [key, localStorage.getItem(key)]),
  ));
  await page.close();
  return values;
}

export async function durableWorkspace(context) {
  const raw = (await readDurable(context))[WORKSPACE_KEY];
  return raw ? JSON.parse(raw) : null;
}

export const bookOf = (workspace, id = "personal-active") => workspace.playbooks.find((book) => book.id === id);
export const playOf = (workspace, playId, bookId = "personal-active") => bookOf(workspace, bookId).plays.find((play) => play.id === playId);
export const labelsOf = (play) => play.players.map((player) => player.label);

/** Renames a player through the inspector, the way a coach does. */
export async function renamePlayer(page, from, to) {
  await token(page, from).click();
  await page.waitForTimeout(200);
  const input = page.locator(".position-label-control input");
  await input.fill(to);
  await input.press("Enter");
  await page.waitForTimeout(150);
}

/** Lets the debounced autosave land. */
export const settleSave = (page) => page.waitForTimeout(700);

/** Fires the hide/close lifecycle a real tab switch or close delivers. */
export async function hideAndClose(page) {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.close();
}

export async function menuItem(page, name) {
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
  await page.waitForTimeout(300);
}
