import assert from "node:assert/strict";
import test from "node:test";
import { centreOf, currentPlay, token, useBrowser } from "./harness.mjs";

const open = useBrowser();

const viewBox = (page) => page.evaluate(() =>
  document.querySelector(".play-canvas").getAttribute("viewBox").split(" ").map(Number));

test("the wheel zooms about the cursor, keeping that spot under it", async () => {
  const app = await open();
  const { page } = app;
  const target = await centreOf(token(page, "C"));

  const before = await viewBox(page);
  await page.mouse.move(target.x, target.y);
  for (let i = 0; i < 6; i += 1) {
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(250);

  const after = await viewBox(page);
  assert.ok(after[2] < before[2] * 0.7, `zoomed in: ${before[2].toFixed(1)} -> ${after[2].toFixed(1)} yd across`);

  const moved = await centreOf(token(page, "C"));
  const drift = Math.hypot(moved.x - target.x, moved.y - target.y);
  assert.ok(drift < 40, `the point under the cursor stayed there (drifted ${Math.round(drift)}px)`);

  assert.match(await page.locator(".zoom-reset").textContent(), /Fit · \d\.\d×/);
  app.assertNoErrors();
  await app.close();
});

test("zoomed in, empty field pans but a player still drags", async () => {
  const app = await open();
  const { page } = app;
  const target = await centreOf(token(page, "C"));
  await page.mouse.move(target.x, target.y);
  for (let i = 0; i < 5; i += 1) {
    await page.mouse.wheel(0, -220);
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(200);

  // a player press still edits the player
  const column = () => page.evaluate(() =>
    [...document.querySelectorAll("g.player")].find((g) => g.getAttribute("aria-label").startsWith("C,"))
      .querySelector("circle:not(.token-hit)").getAttribute("cx"));
  const beforeDrag = await column();
  const grab = await centreOf(token(page, "C"));
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x + 60, grab.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  assert.notEqual(await column(), beforeDrag, "dragging a token still moves the token");
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(250);

  // empty field pans the camera
  const stage = await page.locator(".field-stage").boundingBox();
  const beforePan = await viewBox(page);
  await page.mouse.move(stage.x + stage.width * 0.72, stage.y + 120);
  await page.mouse.down();
  await page.mouse.move(stage.x + stage.width * 0.72 - 160, stage.y + 220, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const afterPan = await viewBox(page);
  assert.ok(Math.abs(afterPan[0] - beforePan[0]) > 1 || Math.abs(afterPan[1] - beforePan[1]) > 1,
    "dragging empty grass moved the camera");
  await app.close();
});

test("Fit returns to the base framing, and so does zooming back out", async () => {
  const app = await open();
  const { page } = app;
  const base = await viewBox(page);
  const target = await centreOf(token(page, "C"));

  await page.mouse.move(target.x, target.y);
  for (let i = 0; i < 5; i += 1) { await page.mouse.wheel(0, -220); await page.waitForTimeout(50); }
  await page.waitForTimeout(200);
  await page.locator(".zoom-reset").click();
  await page.waitForTimeout(300);
  assert.ok(Math.abs((await viewBox(page))[2] - base[2]) < 0.5, "Fit restored the base window");

  /*
   * Put the pointer back over the field before wheeling. Clicking Fit leaves it
   * on the chip, and the chip is a sibling of the stage rather than a child, so
   * wheel events there never reach the camera's listener.
   */
  await page.mouse.move(target.x, target.y);
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(120);
  for (let i = 0; i < 8; i += 1) { await page.mouse.wheel(0, 400); await page.waitForTimeout(40); }
  await page.waitForTimeout(250);
  assert.equal(await page.locator(".zoom-reset").count(), 0, "zooming fully out clears the camera");
  await app.close();
});

test("drawing and pointer input stay accurate while zoomed", async () => {
  const app = await open();
  const { page } = app;
  const target = await centreOf(token(page, "Y"));
  await page.mouse.move(target.x, target.y);
  for (let i = 0; i < 4; i += 1) { await page.mouse.wheel(0, -200); await page.waitForTimeout(50); }
  await page.waitForTimeout(200);

  // Arm the Route tool and draw from Y; the draft must follow the pointer.
  await page.keyboard.press("2");
  await page.waitForTimeout(150);
  const from = await centreOf(token(page, "Y"));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y - 150, { steps: 10 });
  await page.waitForTimeout(150);
  const drafted = await page.locator(".route.selected").count();
  await page.mouse.up();
  await page.waitForTimeout(200);
  assert.ok(drafted >= 1, "a route drew under the pointer while zoomed");
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Escape");
  app.assertNoErrors();
  await app.close();
});

/*
 * getTotalLength returns yards, but non-scaling-stroke lays dashes out in
 * screen pixels -- so an unconverted length tiled into a marching dash pattern
 * crawling along the route instead of one stroke drawing itself. The bug was
 * invisible to a probe that only asked whether an animation existed.
 */
test("routes reveal as one drawing stroke, not a marching dash pattern", async () => {
  const app = await open();
  const { page } = app;
  await page.keyboard.press("]"); // switch play -> routes redraw
  await page.waitForTimeout(180);

  const reveal = await page.evaluate(() => {
    const route = [...document.querySelectorAll(".route")].find((r) => r.dataset.assignmentType === "Route");
    const animation = document.getAnimations().find((a) => a.effect?.target === route
      && a.effect.getKeyframes().some((frame) => frame.strokeDashoffset !== undefined));
    if (!animation) return null;
    animation.pause();
    return {
      dash: parseFloat(getComputedStyle(route).strokeDasharray),
      pathOnScreen: route.getTotalLength() * route.getScreenCTM().a,
    };
  });
  assert.ok(reveal, "a draw-in animation was running");
  assert.ok(reveal.dash >= reveal.pathOnScreen - 2,
    `one dash must cover the whole path: dash ${reveal.dash.toFixed(0)}px vs path ${reveal.pathOnScreen.toFixed(0)}px`);
  await app.close();
});

test("dashed assignments keep their pattern after animating", async () => {
  const app = await open();
  const dash = await app.page.evaluate(() =>
    getComputedStyle(document.querySelector('.route[data-assignment-type="Motion"]')).strokeDasharray);
  assert.ok(dash && dash !== "none", `motion stays dashed: ${dash}`);
  await app.close();
});

test("stepping plays with [ and ] moves through the family and back", async () => {
  const app = await open();
  const { page } = app;
  const first = await currentPlay(page);
  await page.keyboard.press("]");
  await page.waitForTimeout(600);
  const second = await currentPlay(page);
  await page.keyboard.press("[");
  await page.waitForTimeout(600);
  assert.notEqual(second, first, "] advanced to the next play");
  assert.equal(await currentPlay(page), first, "[ came back");
  app.assertNoErrors();
  await app.close();
});

/*
 * Portrait shows the play at ~8.3 px/yd -- 39 yd of play against a 390px screen
 * -- and no layout change fixes that without cropping someone off the field.
 * Pinch adds reach without taking anything away by default, so the assertions
 * that matter are that it magnifies AND that two fingers never edit the play.
 */
test("pinch magnifies on a phone, and never drags a player", async () => {
  const app = await open({ viewport: { width: 390, height: 844 }, touch: true, settle: 1800 });
  const { page } = app;

  const scale = () => page.evaluate(() => {
    const svg = document.querySelector(".play-canvas");
    return +(svg.getBoundingClientRect().width / Number(svg.getAttribute("viewBox").split(" ")[2])).toFixed(2);
  });
  const columns = () => page.evaluate(() =>
    [...document.querySelectorAll("g.player circle:not(.token-hit)")].map((c) => c.getAttribute("cx")).join(","));

  const session = await page.context().newCDPSession(page);
  const stage = await page.locator(".field-stage").boundingBox();
  const cx = stage.x + stage.width / 2;
  const cy = stage.y + stage.height / 2;
  const touch = (type, gap) => session.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: type === "touchEnd" ? [] : [
      { x: cx - gap / 2, y: cy, id: 1 },
      { x: cx + gap / 2, y: cy, id: 2 },
    ],
  });
  const pinchBetween = async (from, to) => {
    await touch("touchStart", from);
    for (let step = 1; step <= 8; step += 1) await touch("touchMove", from + (to - from) * (step / 8));
    await touch("touchEnd", to);
  };

  const before = await scale();
  const alignment = await columns();

  await pinchBetween(80, 260);
  await page.waitForTimeout(400);
  const magnified = await scale();
  assert.ok(magnified > before * 1.5, `pinch out magnifies: ${before} -> ${magnified} px/yd`);
  assert.equal(await page.locator(".zoom-reset").count(), 1, "and offers a way back to the base framing");

  await pinchBetween(260, 90);
  await page.waitForTimeout(400);
  assert.ok(await scale() < magnified, "pinch in shrinks again");
  assert.equal(await columns(), alignment, "no player moved: a pinch is a camera gesture, not an edit");

  // The gesture must not have cost the app its ordinary single-touch behaviour.
  await page.locator("g.player").nth(0).tap();
  await page.waitForTimeout(500);
  assert.ok(await page.evaluate(() => document.querySelector(".inspector-head h2")?.textContent?.trim()),
    "a single tap still selects a player");

  app.assertNoErrors();
  await app.close();
});
