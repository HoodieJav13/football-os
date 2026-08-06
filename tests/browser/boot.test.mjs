import assert from "node:assert/strict";
import test from "node:test";
import {
  DESKTOP,
  PHONE_LANDSCAPE,
  PHONE_PORTRAIT,
  SMALL_LAPTOP,
  useBrowser,
} from "./harness.mjs";

const open = useBrowser();

/*
 * The cheapest test in the suite and the one that has earned its keep most
 * often. A temporal-dead-zone crash after a refactor compiled cleanly, passed
 * every unit test, and shipped a blank field; only rendering the app caught it.
 * Run at every layout the app claims to support, because each has its own
 * branch of CSS and its own chance to render nothing.
 */
for (const [name, viewport, touch] of [
  ["desktop", DESKTOP, false],
  ["small laptop", SMALL_LAPTOP, false],
  ["phone landscape", PHONE_LANDSCAPE, true],
  ["phone portrait", PHONE_PORTRAIT, true],
]) {
  test(`the app renders a full board on ${name}`, async () => {
    const app = await open({ viewport, touch });
    const board = await app.page.evaluate(() => ({
      offense: document.querySelectorAll("g.player").length,
      defense: document.querySelectorAll("g.defender").length,
      assignments: document.querySelectorAll(".route").length,
      canvasBox: (() => {
        const stage = document.querySelector(".field-stage")?.getBoundingClientRect();
        return stage ? { w: Math.round(stage.width), h: Math.round(stage.height) } : null;
      })(),
    }));
    assert.equal(board.offense, 11, "offensive players");
    assert.equal(board.defense, 11, "defenders");
    assert.ok(board.assignments > 0, "assignments drawn");
    assert.ok(board.canvasBox && board.canvasBox.w > 200 && board.canvasBox.h > 200,
      `field has real size: ${JSON.stringify(board.canvasBox)}`);
    app.assertNoErrors();
    await app.close();
  });
}

test("the page never scrolls: the app owns exactly one viewport", async () => {
  for (const viewport of [DESKTOP, SMALL_LAPTOP, PHONE_LANDSCAPE]) {
    const app = await open({ viewport, settle: 1200 });
    const overflow = await app.page.evaluate(() => ({
      vertical: document.documentElement.scrollHeight - window.innerHeight,
      horizontal: document.documentElement.scrollWidth - window.innerWidth,
    }));
    assert.ok(overflow.vertical <= 1, `${viewport.width}x${viewport.height} vertical overflow ${overflow.vertical}px`);
    assert.ok(overflow.horizontal <= 1, `${viewport.width}x${viewport.height} horizontal overflow ${overflow.horizontal}px`);
    await app.close();
  }
});

test("every visible control carries an accessible name", async () => {
  const app = await open();
  const unnamed = await app.page.evaluate(() =>
    [...document.querySelectorAll("button, a[href], input, select, textarea")]
      .filter((element) => element.offsetParent !== null)
      .filter((element) => !(
        element.getAttribute("aria-label")
        || element.textContent.trim()
        || element.getAttribute("title")
        || element.labels?.length
      ))
      .map((element) => `${element.tagName}.${element.className}`.slice(0, 60)));
  assert.deepEqual(unnamed, [], "controls with no accessible name");
  await app.close();
});
