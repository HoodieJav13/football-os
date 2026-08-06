import assert from "node:assert/strict";
import test from "node:test";
import { PHONE_LANDSCAPE, playClock, useBrowser } from "./harness.mjs";

const open = useBrowser();

const focusDescription = (page) => page.evaluate(() => {
  const active = document.activeElement;
  if (!active) return null;
  const group = active.closest?.("g.player, g.defender");
  if (group) return { kind: "token", label: active.getAttribute("aria-label").split(",")[0] };
  return { kind: active.tagName, label: (active.getAttribute("aria-label") || active.textContent || "").trim().slice(0, 30) };
});

/*
 * Before tokens became real controls, 70 Tab presses never reached the canvas:
 * a keyboard-only coach could open the app and edit precisely nothing.
 */
test("Tab reaches the players, and the offence comes first", async () => {
  const app = await open();
  const { page } = app;

  const order = [];
  await page.keyboard.press("Tab");
  for (let i = 0; i < 60; i += 1) {
    const here = await focusDescription(page);
    if (here?.kind === "token") order.push(here.label);
    else if (order.length) break; // walked past the roster
    await page.keyboard.press("Tab");
  }

  assert.ok(order.length >= 22, `Tab walks the whole roster, saw ${order.length}`);
  // The offence is the coach's own eleven; they should not wade through the defence first.
  assert.deepEqual(order.slice(0, 5), ["X", "LT", "LG", "C", "RG"], `roster order: ${order.slice(0, 8).join(",")}`);
  app.assertNoErrors();
  await app.close();
});

test("Enter selects the focused player, and the arrows then move them", async () => {
  const app = await open();
  const { page } = app;

  await page.keyboard.press("Tab");
  for (let i = 0; i < 60; i += 1) {
    if ((await focusDescription(page))?.kind === "token") break;
    await page.keyboard.press("Tab");
  }

  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  const selected = await page.evaluate(() => ({
    marked: document.querySelectorAll("g.player.focus-player, g.defender.focus-player").length,
    inspector: document.querySelector(".inspector-head h2")?.textContent?.trim() ?? null,
  }));
  assert.equal(selected.marked, 1, "exactly one player is selected");
  assert.ok(selected.inspector, "the inspector opened on them");

  const spot = () => page.evaluate(() =>
    document.querySelector("g.player.focus-player, g.defender.focus-player")
      .querySelector("circle:not(.token-hit)").getAttribute("cx"));
  const before = await spot();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(250);
  assert.notEqual(await spot(), before, "arrows nudge the keyboard selection");
  await app.close();
});

test("a locked layer leaves the tab order", async () => {
  const app = await open();
  const { page } = app;
  await page.locator("button[aria-label='Lock offense']").click();
  await page.waitForTimeout(300);
  const tabbable = await page.evaluate(() =>
    [...document.querySelectorAll("g.player")].filter((g) => g.tabIndex === 0).length);
  assert.equal(tabbable, 0, "locked players are not reachable by Tab");
  await app.close();
});

test("a hidden layer is neither visible nor tabbable", async () => {
  const app = await open();
  const { page } = app;
  await page.locator("button[aria-label='Hide offense']").click();
  await page.waitForTimeout(400);
  const state = await page.evaluate(() => {
    const layer = document.querySelector(".unit-layer.layer-hidden");
    return {
      faded: layer ? Number(getComputedStyle(layer).opacity) : null,
      tabbable: document.querySelectorAll(".unit-layer.layer-hidden g[tabindex='0']").length,
    };
  });
  assert.equal(state.faded, 0, "the layer faded out");
  assert.equal(state.tabbable, 0, "hidden players left the tab order");
  await app.close();
});

test("the timeline is a slider the keyboard can drive", async () => {
  const app = await open();
  const { page } = app;
  const track = page.locator(".phase-bars");

  assert.equal(await track.getAttribute("role"), "slider");
  await track.focus();

  await page.keyboard.press("End");
  await page.waitForTimeout(250);
  const atEnd = await playClock(page);
  assert.ok(atEnd > 3, `End jumps to the last moment: ${atEnd.toFixed(2)}s`);

  await page.keyboard.press("Home");
  await page.waitForTimeout(250);
  assert.ok(await playClock(page) < 0.05, "Home rewinds to the top");

  const start = await playClock(page);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  assert.ok(Math.abs((await playClock(page)) - start - 0.1) < 0.03, "arrow steps a tenth of a second");

  // Scrubbing must not also nudge the selected player.
  const columns = await page.evaluate(() =>
    [...document.querySelectorAll("g.player circle:not(.token-hit)")].map((c) => c.getAttribute("cx")).join(","));
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() =>
    [...document.querySelectorAll("g.player circle:not(.token-hit)")].map((c) => c.getAttribute("cx")).join(",")),
    columns, "track arrows do not move players");
  await app.close();
});

/*
 * A landscape rule once hid `.run-button svg:last-child` to drop a caret. When
 * the caret went away that rule hid the play icon instead, and since the same
 * breakpoint zeroes the label, the button rendered completely blank.
 */
test("every icon-only control still shows its icon", async () => {
  const app = await open({ viewport: PHONE_LANDSCAPE, touch: true, settle: 1200 });
  const blank = await app.page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .filter((button) => button.offsetParent !== null)
      .filter((button) => {
        const style = getComputedStyle(button);
        const hasText = button.textContent.trim() && parseFloat(style.fontSize) > 0;
        const icons = [...button.querySelectorAll("svg")]
          .filter((svg) => getComputedStyle(svg).display !== "none");
        return !hasText && icons.length === 0;
      })
      .map((button) => `${button.className || button.getAttribute("aria-label")}`.slice(0, 50)));
  assert.deepEqual(blank, [], "buttons rendering neither text nor an icon");
  await app.close();
});
