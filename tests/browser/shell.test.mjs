import assert from "node:assert/strict";
import test from "node:test";
import { PHONE_LANDSCAPE, SMALL_LAPTOP, token, useBrowser } from "./harness.mjs";

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

/*
 * Presenting on a phone in landscape once drew the play SMALLER than editing
 * did: entering presentation widens the canvas past the fit-to-play width
 * threshold, which flipped it back to the fixed window. Height binds this
 * orientation, so the mode meant for showing a play was the worst place to see
 * it. Scale is the assertion, not box size -- the box grew while the play shrank.
 */
test("presenting never draws the play smaller than editing does", async () => {
  for (const [name, viewport] of [
    ["phone landscape", PHONE_LANDSCAPE],
    ["desktop", { width: 1440, height: 900 }],
  ]) {
    const app = await open({ viewport, touch: name.startsWith("phone"), settle: 1300 });
    const { page } = app;
    const scale = () => page.evaluate(() => {
      const svg = document.querySelector(".play-canvas");
      const box = svg.getBoundingClientRect();
      return +(box.width / Number(svg.getAttribute("viewBox").split(" ")[2])).toFixed(2);
    });

    const editing = await scale();
    const present = page.locator("button", { hasText: /present/i }).first();
    assert.ok(await present.isVisible(), `${name}: Present is reachable`);
    await present.click();
    await page.waitForTimeout(900);
    const presenting = await scale();

    assert.ok(presenting >= editing,
      `${name}: ${editing} -> ${presenting} px/yd`);
    assert.ok(
      (await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)) <= 1,
      `${name}: presenting does not overflow the page`);
    app.assertNoErrors();
    await app.close();
  }
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

/*
 * Entrances were the easy half. Exits need the element to survive its own
 * dismissal, so every one of these asserts the thing is still mounted and
 * animating shortly after being closed, then actually gone once it finishes --
 * a leak here would strand a dead panel on screen forever.
 */
test("surfaces animate out rather than popping", async () => {
  const app = await open();
  const { page } = app;

  // The inspector's content is derived from the selection, so its dismissal
  // defers the state change: clearing first would leave an empty shell to slide.
  await token(page, "X").click();
  await page.waitForTimeout(450);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(70);
  assert.equal(
    await page.evaluate(() => {
      const panel = document.querySelector(".inspector");
      return panel ? getComputedStyle(panel).animationName : "unmounted";
    }),
    "panel-out-right", "the inspector slides out");
  assert.ok(await page.evaluate(() => document.querySelector(".inspector h2")?.textContent?.trim()),
    "and it still has its content on the way out");
  await page.waitForTimeout(400);
  assert.equal(await page.locator(".inspector").count(), 0, "then it is gone");

  await page.locator(".assignment-key > button").click();
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(60);
  assert.equal(
    await page.evaluate(() => {
      const panel = document.querySelector(".assignment-key-panel");
      return panel ? getComputedStyle(panel).animationName : "unmounted";
    }),
    "pop-out", "the popover shrinks away");
  await page.waitForTimeout(350);
  assert.equal(await page.locator(".assignment-key-panel").count(), 0, "then it is gone");

  await page.locator(".film-card.create-card").click();
  await page.waitForTimeout(400);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(70);
  const dialog = await page.evaluate(() => {
    const scrim = document.querySelector(".modal-scrim");
    return scrim
      ? { scrim: getComputedStyle(scrim).animationName, panel: getComputedStyle(scrim.firstElementChild).animationName }
      : "unmounted";
  });
  assert.deepEqual(dialog, { scrim: "fade-out", panel: "surface-out" }, "the dialog fades out over a fading scrim");
  await page.waitForTimeout(400);
  assert.equal(await page.locator(".modal-scrim").count(), 0, "then it is gone");

  // Reopening during or after an exit must land open, not stuck half-closed.
  await token(page, "X").click();
  await page.waitForTimeout(400);
  assert.equal(await page.locator(".inspector").count(), 1, "the inspector reopens");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(60);
  await token(page, "Y").click();
  await page.waitForTimeout(400);
  assert.equal(await page.locator(".inspector").count(), 1, "closing then immediately reopening lands open");

  app.assertNoErrors();
  await app.close();
});

/*
 * The reopen pill is positioned against .canvas-workspace, whose first grid row
 * is the layer bar -- so it once sat directly on top of the Key button and ate
 * every press on it. Any floating control over the canvas can do this.
 */
test("floating canvas controls do not cover the layer bar", async () => {
  const app = await open();
  const { page } = app;
  await page.keyboard.press("Escape"); // no selection -> the reopen pill appears
  await page.waitForTimeout(500);

  const covered = await page.evaluate(() =>
    [...document.querySelectorAll(".layer-bar button")]
      .filter((button) => button.offsetParent !== null)
      .filter((button) => {
        const box = button.getBoundingClientRect();
        const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return !button.contains(top) && top !== button;
      })
      .map((button) => (button.getAttribute("aria-label") || button.textContent).trim().slice(0, 40)));

  assert.deepEqual(covered, [], "layer bar controls covered by something else");
  await app.close();
});
