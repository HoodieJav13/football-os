import assert from "node:assert/strict";
import test from "node:test";
import { WORKSPACE_KEY } from "../../src/workspaceData.js";
import { currentPlay, token, useBrowser } from "./harness.mjs";

const open = useBrowser();

/*
 * The game-day dialog promises that "the original stays protected until you
 * decide what to keep". Resolving the adjustment restores the original from
 * its snapshot, but the per-play undo history still held every edit made
 * during the adjustment -- so one reflexive Ctrl+Z after Discard (or after
 * Save as Variation) quietly made the discarded change permanent, with no
 * Temporary chip to say so. The resolution is a commit point, like deleting a
 * play: nothing from the adjustment may remain for undo to bring back.
 */

const labels = (page) => page.evaluate(() => [...document.querySelectorAll(".player-label")].map((t) => t.textContent));
const savedPlay = (page, name) => page.evaluate(({ key, name }) => {
  const workspace = JSON.parse(localStorage.getItem(key));
  const book = workspace.playbooks.find((b) => b.id === workspace.activePlaybookId);
  return book.plays.find((p) => p.name === name);
}, { key: WORKSPACE_KEY, name });
const undoEnabled = (page) => page.getByRole("button", { name: "Undo", exact: true }).isEnabled();

async function menuItem(page, name) {
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
  await page.waitForTimeout(300);
}

async function adjustWithRename(page, label) {
  await menuItem(page, "Game Day Adjust");
  await page.getByRole("button", { name: "Start adjusting", exact: true }).click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator(".temporary-chip").count(), 1, "the play is marked Temporary while adjusting");
  await token(page, "X").click();
  await page.waitForTimeout(250);
  const input = page.locator(".position-label-control input");
  await input.fill(label);
  await input.press("Enter");
  await page.waitForTimeout(300);
  assert.ok((await labels(page)).includes(label), "the temporary edit is on the field");
}

test("discarding a game-day adjustment leaves nothing for undo to bring back", async () => {
  const app = await open();
  const { page } = app;
  const name = await currentPlay(page);
  await page.waitForTimeout(700);
  const original = await savedPlay(page, name);

  await adjustWithRename(page, "GD");
  await menuItem(page, "Resolve adjustment");
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await page.waitForTimeout(400);
  assert.ok(!(await labels(page)).includes("GD"), "discard restored the original");
  assert.equal(await page.locator(".temporary-chip").count(), 0, "the Temporary chip is gone");

  assert.equal(await undoEnabled(page), false, "undo offers nothing after the adjustment is discarded");
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(700);
  assert.ok(!(await labels(page)).includes("GD"), "Ctrl+Z after Discard must not make the discarded change permanent");
  assert.deepEqual(await savedPlay(page, name), original, "the saved original is exactly what it was before the adjustment");
  app.assertNoErrors();
  await app.close();
});

test("saving a game-day adjustment as a variation keeps the variation's edits out of the original's undo", async () => {
  const app = await open();
  const { page } = app;
  const name = await currentPlay(page);
  await page.waitForTimeout(700);
  const original = await savedPlay(page, name);

  await adjustWithRename(page, "GV");
  await menuItem(page, "Resolve adjustment");
  await page.getByRole("button", { name: "Save as Variation", exact: true }).click();
  await page.waitForTimeout(500);
  assert.equal(await currentPlay(page), `${name} Variation`, "the app opens the new variation");
  assert.ok((await labels(page)).includes("GV"), "the variation carries the edit");

  await page.locator(".film-card").filter({ hasText: name }).first().click();
  await page.waitForTimeout(600);
  assert.equal(await currentPlay(page), name);
  assert.ok(!(await labels(page)).includes("GV"), "the original was restored");
  assert.equal(await undoEnabled(page), false, "the original has nothing to undo");
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(700);
  assert.ok(!(await labels(page)).includes("GV"), "Ctrl+Z on the original must not pull the variation's edit back into it");
  assert.deepEqual(await savedPlay(page, name), original);
  assert.ok((await savedPlay(page, `${name} Variation`)).players.some((p) => p.label === "GV"), "the variation still has its edit");
  app.assertNoErrors();
  await app.close();
});
