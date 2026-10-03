/**
 * Shared helpers for the 2026-10-03 rehearsal scripts.
 *
 * These are *not* part of the test suite. They drive the production build
 * (served by `vite preview`, URL in APP_URL) through Playwright the way a coach
 * would, and write what they saw into docs/rehearsal/2026-10-03/evidence/.
 *
 *   APP_URL=http://127.0.0.1:4173/ node docs/rehearsal/2026-10-03/scripts/a-personal-play.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

export const APP_URL = process.env.APP_URL;
if (!APP_URL) throw new Error("APP_URL is not set");

export const WORKSPACE_KEY = "football-os.playbooks.v11";
export const GAME_DAY_KEY = "football-os.game-day.v7";
export const RECOVERY_KEY = "football-os.recovery.v1";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const EVIDENCE = join(ROOT, "evidence");

export const IPAD = { width: 1024, height: 768 };
export const DESKTOP = { width: 1440, height: 900 };

/** Simple step → result → evidence recorder. */
export function recorder(name) {
  const steps = [];
  const rec = {
    name,
    steps,
    step(label, result, evidence) {
      steps.push({ label, result, evidence });
      const mark = result === "pass" ? "PASS" : result === "fail" ? "FAIL" : result.toUpperCase();
      console.log(`[${mark}] ${label}${evidence !== undefined ? " — " + (typeof evidence === "string" ? evidence : JSON.stringify(evidence)) : ""}`);
    },
    check(label, ok, evidence) { rec.step(label, ok ? "pass" : "fail", evidence); return ok; },
    note(label, evidence) { rec.step(label, "note", evidence); },
    async save() {
      await mkdir(EVIDENCE, { recursive: true });
      await writeFile(join(EVIDENCE, `${name}.json`), JSON.stringify({ name, at: new Date().toISOString(), steps }, null, 2));
      const fails = steps.filter((s) => s.result === "fail").length;
      console.log(`\n${name}: ${steps.filter((s) => s.result === "pass").length} pass, ${fails} fail, ${steps.filter((s) => s.result === "note").length} notes`);
      return fails;
    },
  };
  return rec;
}

export async function launch() {
  return chromium.launch();
}

/**
 * A fresh browser context = a fresh browser profile: empty localStorage,
 * no service worker, no cache. `storageState` reuses the saved state of an
 * earlier script so the workflow can be chained.
 */
export async function openApp(browser, { viewport = IPAD, touch = true, storageState, settle = 1800, serviceWorkers = "allow" } = {}) {
  const context = await browser.newContext({
    viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1, serviceWorkers,
    ...(storageState ? { storageState } : {}),
    acceptDownloads: true,
  });
  const errors = [];
  const page = await context.newPage();
  watchErrors(page, errors);
  await page.goto(APP_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(settle);
  return { context, page, errors };
}

export function watchErrors(page, errors) {
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
}

export const saved = (page, key = WORKSPACE_KEY) => page.evaluate((k) => { const v = localStorage.getItem(k); return v === null ? null : JSON.parse(v); }, key);
export const rawSaved = (page, key = WORKSPACE_KEY) => page.evaluate((k) => localStorage.getItem(k), key);

export function findPlay(workspace, name, bookId = workspace?.mainPlaybookId) {
  const book = workspace?.playbooks.find((b) => b.id === bookId);
  return book?.plays.find((p) => p.name === name) ?? null;
}

export const heading = (page) => page.locator(".title-line h1").textContent().then((t) => t.trim());
export const token = (page, label) => page.locator(`g.player[aria-label^="${label},"]`);
export const defender = (page, label) => page.locator(`g.defender[aria-label^="${label},"]`);
export const labelsOnField = (page) => page.evaluate(() => [...document.querySelectorAll(".player-label")].map((t) => t.textContent));
export const toast = (page) => page.locator(".toast").textContent().catch(() => null);

export async function openMore(page) {
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.waitForTimeout(200);
}
export async function menu(page, name) {
  await openMore(page);
  await page.getByRole("menuitem", { name, exact: true }).click();
  await page.waitForTimeout(300);
}
export async function dataTools(page) {
  await page.locator(".playbook-trigger").click();
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: /Backup and export/ }).click();
  await page.waitForTimeout(400);
}
export async function closeDialog(page) {
  await page.locator(".modal-close").first().click();
  await page.waitForTimeout(400);
}
export async function pickPlay(page, name) {
  await page.locator(".film-card").filter({ hasText: name }).first().click();
  await page.waitForTimeout(600);
}

/** Selects an offensive player and, if the inspector is collapsed (phone), expands it. */
export async function selectToken(page, label) {
  await token(page, label).click();
  await page.waitForTimeout(300);
  const expand = page.getByRole("button", { name: "Expand player inspector", exact: true });
  if (await expand.isVisible().catch(() => false)) await expand.click();
}

/** Gives the selected (offensive) player a Route via the inspector type picker. */
export async function giveRoute(page) {
  await page.locator(".inspector .assignment-type-picker button", { hasText: "Route" }).click();
  await page.waitForTimeout(300);
}
export const stemInput = (page) => page.locator(".inspector .route-number-field input[type=number]").first();

export async function renameSelected(page, label) {
  const input = page.locator(".position-label-control input");
  await input.fill(label);
  await input.press("Enter");
  await page.waitForTimeout(300);
}

/** The debounced autosave is 400 ms; wait comfortably past it. */
export const settleSave = (page) => page.waitForTimeout(900);

export const undoEnabled = (page) => page.getByRole("button", { name: "Undo", exact: true }).isEnabled();
export const redoEnabled = (page) => page.getByRole("button", { name: "Redo", exact: true }).isEnabled();

export const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Top-level keys whose JSON differs, with both values, for a readable failure. */
export function diffKeys(a, b) {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  const out = {};
  for (const k of keys) if (JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k])) out[k] = { a: a?.[k], b: b?.[k] };
  return out;
}

/** Strip volatile ids so two plays can be compared on content. */
export function playContent(play) {
  if (!play) return null;
  const { id, variantOf, ...rest } = play;
  return rest;
}

export async function playDetails(page, patch) {
  await menu(page, "Play details");
  const dialog = page.getByRole("dialog", { name: "Play details" });
  for (const [label, value] of Object.entries(patch)) {
    const field = dialog.getByLabel(label, { exact: true });
    if (label === "Field side") await field.selectOption(value);
    else await field.fill(value);
  }
  return dialog;
}
