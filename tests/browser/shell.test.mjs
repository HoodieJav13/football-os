import assert from "node:assert/strict";
import test from "node:test";
import { SMALL_LAPTOP, token, useBrowser } from "./harness.mjs";

const open = useBrowser();

test("with nothing selected, the field takes the inspector's width back", async () => {
  const app = await open();
  const { page } = app;

  const stageWidth = () => page.evaluate(() =>
    Math.round(document.querySelector(".field-stage").getBoundingClientRect().width));

  await page.keyboard.press("Escape"); // clear the startup selection
  await page.waitForTimeout(500);
  const wide = await stageWidth();

  await token(page, "X").click();
  await page.waitForTimeout(500);
  const narrow = await stageWidth();

  assert.ok(wide > narrow + 200, `field reclaims the column: ${wide}px closed vs ${narrow}px open`);
  app.assertNoErrors();
  await app.close();
});

test("surfaces animate in rather than popping", async () => {
  const app = await open();
  const { page } = app;

  await token(page, "X").click();
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".inspector")).animationName),
    "panel-in-right", "the inspector slides in");

  await page.locator(".assignment-key > button").click();
  await page.waitForTimeout(60);
  assert.equal(await page.evaluate(() =>
    getComputedStyle(document.querySelector(".assignment-key-panel")).animationName),
    "pop-in", "the popover grows from its trigger");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);

  await page.locator(".film-card.create-card").click();
  await page.waitForTimeout(60);
  const modal = await page.evaluate(() => ({
    scrim: getComputedStyle(document.querySelector(".modal-scrim")).animationName,
    panel: getComputedStyle(document.querySelector(".modal-scrim > *")).animationName,
  }));
  assert.equal(modal.scrim, "fade-in", "the scrim fades");
  assert.equal(modal.panel, "surface-in", "the dialog scales in over it");
  await page.keyboard.press("Escape");
  await app.close();
});

test("the inspector keeps its section headings on screen and its editor usable", async () => {
  for (const viewport of [{ width: 1440, height: 900 }, SMALL_LAPTOP]) {
    const app = await open({ viewport, settle: 1400 });
    const { page } = app;
    await token(page, "X").click();
    await page.waitForTimeout(400);

    const layout = await page.evaluate(() => {
      const body = document.querySelector(".inspector-body");
      const open = document.querySelector(".inspector-section[open]");
      const sectionBody = open?.querySelector(".section-body");
      return {
        summaries: document.querySelectorAll(".inspector-section > summary").length,
        openHeight: open ? Math.round(open.getBoundingClientRect().height) : 0,
        editorVisible: sectionBody ? sectionBody.clientHeight : 0,
        bodyOverflow: body.scrollHeight - body.clientHeight,
      };
    });

    assert.equal(layout.summaries, 3, "all three sections are present");
    // The floor exists because the editor was once squeezed to a 7px window.
    assert.ok(layout.editorVisible >= 130,
      `${viewport.width}x${viewport.height}: editor has usable height (${layout.editorVisible}px)`);
    await app.close();
  }
});

test("Present hands the whole viewport to the field, and Escape gives it back", async () => {
  const app = await open();
  const { page } = app;

  const stageHeight = () => page.evaluate(() =>
    Math.round(document.querySelector(".field-stage").getBoundingClientRect().height));
  const editing = await stageHeight();

  await page.locator("button", { hasText: "Present" }).click();
  await page.waitForTimeout(700);

  const presenting = await page.evaluate(() => ({
    stage: Math.round(document.querySelector(".field-stage").getBoundingClientRect().height),
    railHidden: getComputedStyle(document.querySelector(".tool-rail")).visibility === "hidden",
    timelineHidden: getComputedStyle(document.querySelector(".timeline")).visibility === "hidden",
  }));
  assert.ok(presenting.stage > editing + 100, `field grew: ${editing}px -> ${presenting.stage}px`);
  assert.ok(presenting.railHidden && presenting.timelineHidden, "chrome left the stage");

  // Off-stage controls must also leave the tab order, not just the eye.
  const reachable = await page.evaluate(() =>
    [...document.querySelectorAll(".tool-rail button")].filter((b) => { b.focus(); return document.activeElement === b; }).length);
  assert.equal(reachable, 0, "hidden chrome is not focusable");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".tool-rail")).visibility),
    "visible", "exiting restores the chrome");
  app.assertNoErrors();
  await app.close();
});

test("thumbnails carry assignment colour and mark what each variant changes", async () => {
  const app = await open();
  const cards = await app.page.evaluate(() =>
    [...document.querySelectorAll(".film-card:not(.create-card)")].map((card) => ({
      name: card.querySelector("strong")?.textContent,
      changed: card.querySelectorAll(".mini-diff").length,
      shared: card.querySelectorAll(".mini-shared").length,
      colours: new Set([...card.querySelectorAll(".mini-route")].map((r) => getComputedStyle(r).stroke)).size,
    })));

  assert.ok(cards.length >= 2, "the strip has plays in it");
  assert.equal(cards[0].changed + cards[0].shared, 0, "the family base carries no diff marking");
  for (const card of cards.slice(1)) {
    assert.ok(card.changed > 0, `${card.name} highlights what it changes`);
    assert.ok(card.shared > 0, `${card.name} recedes what it shares`);
  }
  assert.ok(cards[0].colours > 1, "thumbnails use the assignment colour vocabulary");
  await app.close();
});

test("break depths are off by default and toggle on from the Key", async () => {
  const app = await open();
  const { page } = app;
  const tags = () => page.locator(".play-canvas .depth-tag").count();

  assert.equal(await tags(), 0, "depth tags start hidden");
  await page.locator(".assignment-key > button").click();
  await page.waitForTimeout(200);
  await page.locator(".key-depth-toggle").click();
  await page.waitForTimeout(300);
  assert.ok(await tags() >= 4, "the toggle annotates the route breaks");

  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  assert.ok(await tags() >= 4, "the tags survive dismissing the popover");
  await app.close();
});
