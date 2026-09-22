import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { currentPlay, inspectorIdentity, token, tokenSpot, useBrowser, waitForIdle } from "./harness.mjs";

const open = useBrowser();

/*
 * The path an ordinary coach walks, with ordinary inputs and no debug hooks:
 * open a playbook, pick a play, change one route, run it, export the PNG,
 * back the workspace up and restore it. Everything a unit test cannot prove
 * about "the app works" lives here, against the production bundle that
 * scripts/with-preview.mjs serves.
 *
 * The workspace lives only in this browser's localStorage, so the persistence
 * assertions are load-bearing: a coach who loses this loses the playbook.
 */

const WORKSPACE_KEY = "football-os.playbooks.v10";
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const openDataTools = async (page) => {
  await page.locator(".playbook-trigger").click();
  await page.waitForTimeout(250);
  await page.locator(".playbook-menu button", { hasText: "Backup and export" }).click();
  await page.waitForTimeout(400);
};

test("a coach can open a playbook, pick a play, edit a route, run it and export it", async () => {
  const app = await open();
  const { page } = app;

  // Open a different playbook from the switcher.
  await page.locator(".playbook-trigger").click();
  await page.waitForTimeout(250);
  const books = page.locator(".playbook-menu button[role=menuitem]");
  assert.ok(await books.count() >= 2, "more than one playbook to choose from");
  const target = books.filter({ hasText: "Air Raid Passing Game" });
  const targetName = (await target.locator("strong").first().textContent()).trim();
  await target.click();
  await page.waitForTimeout(600);
  assert.match(await page.locator(".playbook-trigger").getAttribute("aria-label"), new RegExp(targetName), "the playbook opened");

  // Pick a play from the filmstrip.
  const cards = page.locator(".film-card:not(.create-card)");
  assert.ok(await cards.count() >= 2, "the playbook has plays to pick from");
  const secondName = (await cards.nth(1).locator("strong").textContent()).trim();
  await cards.nth(1).click();
  await page.waitForTimeout(700);
  assert.equal(await currentPlay(page), secondName, "the header names the picked play");

  // Edit a route: change the selected receiver's stem depth by typing a number.
  await token(page, "X").click();
  await page.waitForTimeout(400);
  const stem = page.locator(".inspector input[type=number]").first();
  assert.ok(await stem.isVisible(), "the inspector offers the route's stem depth");
  const before = Number(await stem.inputValue());
  const next = before > 20 ? before - 6 : before + 6; // stays inside the control's 0-40 range
  const routeBefore = await page.locator(".route.selected").first().getAttribute("points");
  await stem.fill(String(next));
  await page.waitForTimeout(400);
  const routeAfter = await page.locator(".route.selected").first().getAttribute("points");
  assert.notEqual(routeAfter, routeBefore, "the drawn route changed with the number");
  assert.match(await page.locator(".inspector-head").textContent(), new RegExp(`${next} yd stem`), "the inspector summary follows");

  // Run the play: the tokens themselves move.
  const spot = await tokenSpot(page, "X");
  await page.locator(".run-button").click();
  await page.waitForTimeout(3200);
  const moved = await tokenSpot(page, "X");
  assert.ok(Math.hypot(moved[0] - spot[0], moved[1] - spot[1]) > 20, `X ran its route: ${spot} -> ${moved}`);
  await waitForIdle(page);

  // Export the current play as a PNG and check the file is a real image.
  await openDataTools(page);
  const download = page.waitForEvent("download");
  await page.locator("button", { hasText: "Export current play as PNG" }).click();
  const file = await download;
  assert.match(file.suggestedFilename(), /\.png$/, "a .png is offered");
  const bytes = await readFile(await file.path());
  assert.ok(bytes.length > 2000 && bytes.subarray(0, 8).equals(PNG_MAGIC), `a real PNG (${bytes.length} bytes)`);
  await page.keyboard.press("Escape");

  app.assertNoErrors();
  await app.close();
});

test("the workspace persists in localStorage and survives a reload, edit included", async () => {
  const app = await open();
  const { page } = app;
  const play = await currentPlay(page);

  await token(page, "X").click();
  await page.waitForTimeout(300);
  const stem = page.locator(".inspector input[type=number]").first();
  const before = Number(await stem.inputValue());
  await stem.fill(String(before + 7));
  await page.waitForTimeout(1500); // persistence is debounced

  const stored = await page.evaluate((key) => window.localStorage.getItem(key), WORKSPACE_KEY);
  assert.ok(stored, `the workspace is written under ${WORKSPACE_KEY}`);
  const saved = JSON.parse(stored);
  assert.ok(saved.playbooks?.length >= 1 && saved.playbooks.every((b) => b.plays?.length >= 1), "every stored playbook has plays");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  assert.equal(await currentPlay(page), play, "the same play is open after reload");
  await token(page, "X").click();
  await page.waitForTimeout(300);
  assert.equal(Number(await page.locator(".inspector input[type=number]").first().inputValue()), before + 7,
    "the edited stem depth came back");
  app.assertNoErrors();
  await app.close();
});

test("a .footballos backup downloads, validates and restores the same workspace", async () => {
  const app = await open();
  const { page } = app;

  // Make the workspace distinguishable from a fresh seed before backing up.
  await token(page, "X").click();
  await page.waitForTimeout(300);
  const input = page.locator(".position-label-control input");
  await input.fill("Q7");
  await input.press("Enter");
  await page.waitForTimeout(1500);
  const original = await page.evaluate((key) => window.localStorage.getItem(key), WORKSPACE_KEY);

  await openDataTools(page);
  const download = page.waitForEvent("download");
  await page.locator("button", { hasText: "Download backup" }).click();
  const file = await download;
  assert.match(file.suggestedFilename(), /\.footballos$/, "a .footballos file is offered");
  const path = await file.path();
  const backup = JSON.parse(await readFile(path, "utf8"));
  assert.equal(backup.format, "football-os-workspace");
  assert.ok(backup.workspace.playbooks.some((b) => b.plays.some((p) => p.players.some((pl) => pl.label === "Q7"))),
    "the backup carries the edit");

  // Undo the edit so the restore has something to bring back, then restore.
  await page.locator(".modal-close").click();
  await page.waitForTimeout(600);
  await token(page, "Q7").click();
  await page.waitForTimeout(400);
  assert.match(await inspectorIdentity(page) ?? "", /^Q7/, "the relabelled player is selected");
  await page.locator(".position-label-control input").fill("X");
  await page.locator(".position-label-control input").press("Enter");
  await page.waitForTimeout(1500);
  assert.ok(!(await page.evaluate((key) => window.localStorage.getItem(key), WORKSPACE_KEY)).includes('"Q7"'), "the edit is gone before restore");

  await openDataTools(page);
  await page.locator(".file-action input[type=file]").setInputFiles(path);
  await page.waitForTimeout(500);
  assert.ok(await page.locator(".restore-preview", { hasText: "Valid Football OS backup" }).isVisible(), "the backup validates");
  await page.locator(".restore-preview button", { hasText: "Restore this backup" }).click();
  await page.waitForTimeout(1800);

  const restored = await page.evaluate((key) => window.localStorage.getItem(key), WORKSPACE_KEY);
  assert.deepEqual(JSON.parse(restored).playbooks, JSON.parse(original).playbooks, "the restored playbooks equal the backed-up ones");
  assert.ok(await page.evaluate(() => window.localStorage.getItem("football-os.recovery.v1")), "the replaced workspace was kept as a recovery copy");
  const labels = await page.evaluate(() => [...document.querySelectorAll(".player-label")].map((t) => t.textContent));
  assert.ok(labels.includes("Q7"), `the restored edit is on the field: ${labels.join(",")}`);
  app.assertNoErrors();
  await app.close();
});
