import assert from "node:assert/strict";
import test from "node:test";
import { playClock, token, tokenSpot, useBrowser, waitForIdle } from "./harness.mjs";

const open = useBrowser();

test("Run moves the players themselves, labels included", async () => {
  const app = await open();
  const { page } = app;

  const startSpot = await tokenSpot(page, "X");
  const startLabel = await page.evaluate(() => {
    const label = [...document.querySelectorAll(".player-label")].find((t) => t.textContent.startsWith("X"));
    const box = label.getBoundingClientRect();
    return [Math.round(box.x), Math.round(box.y)];
  });

  await page.keyboard.press("Space");
  await page.waitForTimeout(2600); // past the 2s snap, into the route

  const runningSpot = await tokenSpot(page, "X");
  const runningLabel = await page.evaluate(() => {
    const label = [...document.querySelectorAll(".player-label")].find((t) => t.textContent.startsWith("X"));
    const box = label.getBoundingClientRect();
    return [Math.round(box.x), Math.round(box.y)];
  });

  assert.notDeepEqual(runningSpot, startSpot, "the token ran its route");
  assert.notDeepEqual(runningLabel, startLabel, "the label ran with it");
  // The label must stay ON its token, not drift free of it.
  assert.ok(Math.abs(runningLabel[0] - runningSpot[0]) < 60 && Math.abs(runningLabel[1] - runningSpot[1]) < 60,
    `label ${runningLabel} should track token ${runningSpot}`);

  app.assertNoErrors();
  await app.close();
});

test("a defender with an assignment runs it too", async () => {
  const app = await open();
  const spot = () => app.page.evaluate(() => {
    const box = document.querySelector('g.defender[aria-label*="Rush"]').getBoundingClientRect();
    return [Math.round(box.x), Math.round(box.y)];
  });
  await app.page.keyboard.press("Space");
  await app.page.waitForTimeout(2400);
  const first = await spot();
  await app.page.waitForTimeout(500);
  assert.notDeepEqual(await spot(), first, "the rusher moved");
  await app.close();
});

test("pause freezes the play, and finishing returns everyone to alignment", async () => {
  const app = await open();
  const { page } = app;
  const home = await tokenSpot(page, "X");

  await page.keyboard.press("Space");
  await page.waitForTimeout(2600);
  await page.keyboard.press("Space"); // pause
  await page.waitForTimeout(250);
  const frozen = await tokenSpot(page, "X");
  await page.waitForTimeout(500);
  assert.deepEqual(await tokenSpot(page, "X"), frozen, "paused play holds still");

  await page.keyboard.press("Space"); // resume
  await waitForIdle(page);
  await page.waitForTimeout(300);
  assert.deepEqual(await tokenSpot(page, "X"), home, "the board resets to alignment");
  await app.close();
});

/*
 * The regression this file exists for: making tokens focusable meant clicking a
 * player focused it, and the token then swallowed Space -- silently killing
 * run/pause, the shortcut a coach uses most, for the rest of the session.
 */
test("Space still runs the play after clicking a player", async () => {
  const app = await open();
  const { page } = app;
  await token(page, "X").click();
  await page.waitForTimeout(250);
  assert.equal(await page.locator(".run-button").textContent().then((t) => t.trim()), "Run");
  await page.keyboard.press("Space");
  await page.waitForTimeout(400);
  assert.equal(await page.locator(".run-button").textContent().then((t) => t.trim()), "Pause",
    "Space reached the transport, not the focused token");
  await app.close();
});

test("routes light only while their player is running them", async () => {
  const app = await open();
  const { page } = app;
  await page.keyboard.press("Space");

  await page.waitForTimeout(700); // pre-snap: routes wait, motion is live
  const preSnap = await page.evaluate(() => {
    const routes = [...document.querySelectorAll(".route[data-run-start]")];
    return {
      waiting: routes.filter((r) => r.style.opacity !== "" && Number(r.style.opacity) < 1).length,
      motionLive: routes.filter((r) => r.dataset.assignmentType === "Motion" && r.style.opacity === "1").length,
    };
  });
  assert.ok(preSnap.waiting >= 5, `routes dimmed pre-snap: ${preSnap.waiting}`);
  assert.ok(preSnap.motionLive >= 1, "pre-snap motion is lit while it runs");

  await page.waitForTimeout(1600); // past the snap
  const lit = await page.evaluate(() =>
    [...document.querySelectorAll('.route[data-run-start][data-assignment-type="Route"]')]
      .filter((r) => r.style.opacity === "1").length);
  assert.ok(lit >= 4, `routes lit after the snap: ${lit}`);

  await waitForIdle(page);
  await page.waitForTimeout(200);
  const cleaned = await page.evaluate(() =>
    [...document.querySelectorAll(".route[data-run-start]")].every((r) => r.style.opacity === ""));
  assert.ok(cleaned, "route lighting is handed back at idle");
  await app.close();
});

test("the play clock survives a pause without drifting", async () => {
  const app = await open();
  const { page } = app;
  await page.keyboard.press("Space");
  await page.waitForTimeout(900);
  await page.keyboard.press("Space"); // pause
  await page.waitForTimeout(200);
  const paused = await playClock(page);
  await page.waitForTimeout(600);
  const stillPaused = await playClock(page);
  assert.ok(Math.abs(stillPaused - paused) < 0.05,
    `clock held at ${paused.toFixed(2)}s, read ${stillPaused.toFixed(2)}s`);
  await app.close();
});
