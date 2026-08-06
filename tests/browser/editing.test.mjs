import assert from "node:assert/strict";
import test from "node:test";
import { centreOf, dragTo, inspectorIdentity, token, useBrowser } from "./harness.mjs";

const open = useBrowser();

const columnOf = (page, label) => page.evaluate((l) =>
  [...document.querySelectorAll("g.player")]
    .find((g) => g.getAttribute("aria-label").startsWith(l))
    .querySelector("circle:not(.token-hit)")
    .getAttribute("cx"), `${label},`);

test("dragging a player reads out the spot and snaps to a neighbour's column", async () => {
  const app = await open();
  const { page } = app;

  const from = await centreOf(token(page, "Z"));
  const anchor = await centreOf(token(page, "X"));

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x - 60, from.y - 120, { steps: 8 });
  await page.waitForTimeout(150);

  const readout = await page.locator(".drag-readout").textContent();
  assert.match(readout, /\d+\.\d\s+[LR]\s+·/, `live spot readout: ${readout}`);

  // Move into X's column: a guide should appear through the player causing it.
  await page.mouse.move(anchor.x + 3, anchor.y - 120, { steps: 8 });
  await page.waitForTimeout(150);
  assert.ok(await page.locator(".drag-guide").count() >= 1, "an alignment guide is drawn");

  await page.mouse.up();
  await page.waitForTimeout(250);

  assert.equal(await columnOf(page, "Z"), await columnOf(page, "X"), "Z landed exactly on X's column");
  const toast = await page.locator(".toast").textContent();
  assert.match(toast, /placed .*·/, `the drop names where it landed: ${toast}`);
  assert.equal(await page.locator(".drag-readout").count(), 0, "the readout clears after the drop");

  app.assertNoErrors();
  await app.close();
});

test("Alt places a player freely, ignoring the magnets", async () => {
  const app = await open();
  const { page } = app;
  const from = await centreOf(token(page, "Z"));
  const anchor = await centreOf(token(page, "X"));

  await page.keyboard.down("Alt");
  await dragTo(page, from, { x: anchor.x + 3, y: anchor.y - 120 });
  await page.keyboard.up("Alt");
  await page.waitForTimeout(250);

  assert.notEqual(await columnOf(page, "Z"), await columnOf(page, "X"),
    "Alt drops where the pointer was, not on the magnet");
  await app.close();
});

test("a drag never selects the field's text", async () => {
  const app = await open();
  const { page } = app;
  const from = await centreOf(token(page, "Y"));
  await dragTo(page, from, { x: from.x, y: from.y - 140 });
  await page.waitForTimeout(200);
  const selected = await page.evaluate(() => window.getSelection().toString());
  assert.equal(selected, "", "dragging left a text selection over the turf");
  await app.close();
});

test("rename, nudge, delete and undo all round-trip", async () => {
  const app = await open();
  const { page } = app;

  await token(page, "X").click();
  await page.waitForTimeout(250);
  assert.match(await inspectorIdentity(page), /^X/);

  // rename -> the token label follows
  const input = page.locator(".position-label-control input");
  await input.fill("W1");
  await input.press("Enter");
  await page.waitForTimeout(300);
  const labels = () => page.evaluate(() => [...document.querySelectorAll(".player-label")].map((t) => t.textContent));
  assert.ok((await labels()).includes("W1"), "the rename reached the field");

  await page.keyboard.press("Control+z");
  await page.waitForTimeout(300);
  assert.ok(!(await labels()).includes("W1"), "undo took the rename back");

  await page.keyboard.press("Control+y");
  await page.waitForTimeout(300);
  assert.ok((await labels()).includes("W1"), "redo put it back");
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(300);

  // nudge -> undo
  await token(page, "X").click();
  await page.waitForTimeout(200);
  const before = await columnOf(page, "X");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  assert.notEqual(await columnOf(page, "X"), before, "arrow keys nudge the selection");
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(300);
  assert.equal(await columnOf(page, "X"), before, "undo restored the position");

  // delete an assignment -> undo
  const routeCount = () => page.locator(".route").count();
  const startingRoutes = await routeCount();
  await page.locator(".inspector-actions > summary").click();
  await page.waitForTimeout(250);
  await page.locator(".inspector-secondary.danger-text").click();
  await page.waitForTimeout(350);
  assert.equal(await routeCount(), startingRoutes - 1, "the assignment went away");
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(350);
  assert.equal(await routeCount(), startingRoutes, "undo brought it back");

  app.assertNoErrors();
  await app.close();
});

test("an edit survives a reload", async () => {
  const app = await open();
  const { page } = app;
  await token(page, "X").click();
  await page.waitForTimeout(200);
  const input = page.locator(".position-label-control input");
  await input.fill("ZZ");
  await input.press("Enter");
  await page.waitForTimeout(1400); // persistence is debounced

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const labels = await page.evaluate(() => [...document.querySelectorAll(".player-label")].map((t) => t.textContent));
  assert.ok(labels.includes("ZZ"), `label persisted across reload: ${labels.join(",")}`);
  await app.close();
});
