import assert from "node:assert/strict";
import test from "node:test";
import { useBrowser } from "./harness.mjs";

const open = useBrowser();

/*
 * The four layouts the app claims to support (AGENTS.md: desktop, iPad, phone
 * portrait, phone landscape), checked for the invariants the design decisions
 * state rather than for pixels:
 *
 *  - the page never scrolls sideways (the app owns exactly one viewport);
 *  - the canvas is the dominant region: on screen, larger than any single
 *    piece of chrome, and at least 40% of the viewport (measured 45% / 52% /
 *    66% / 65% on 2026-09-14 -- the floor is below every layout but above
 *    what a stray column or row would leave);
 *  - on touch layouts the primary controls are at least 44 by 44 CSS px
 *    (AGENTS.md:17 "Touch targets are at least 44 by 44 CSS pixels" -- both
 *    axes, because a 31px-wide button is as easy to miss as a 31px-tall one);
 *  - on phones no chrome permanently covers the field: the play browser and
 *    layer controls are collapsed toggles, and what they open is temporary
 *    (AGENTS.md: "must not permanently consume field height").
 *
 * Viewport sizes are emulated through Playwright (viewport + isMobile +
 * hasTouch); no real device is involved.
 */

export const MATRIX = [
  ["desktop 1280x800", { width: 1280, height: 800 }, false],
  ["iPad 1024x1366", { width: 1024, height: 1366 }, true],
  ["phone portrait 390x844", { width: 390, height: 844 }, true],
  ["phone portrait 375x812", { width: 375, height: 812 }, true],
  ["phone portrait 320x568", { width: 320, height: 568 }, true],
  ["phone landscape 844x390", { width: 844, height: 390 }, true],
];

const CHROME = [".topbar", ".filmstrip", ".tool-rail", ".layer-bar", ".inspector", ".timeline"];
const PRIMARY_CONTROLS = ".tool-rail button, .topbar button, .layer-bar button, .filmstrip > button, .timeline button";

const rect = (element) => {
  const box = element.getBoundingClientRect();
  return { x: box.x, y: box.y, w: box.width, h: box.height, right: box.right, bottom: box.bottom };
};
const overlap = (a, b) =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));

/** Everything the assertions need, read in one evaluate so the numbers agree. */
const measure = (page) => page.evaluate(([chrome, controls]) => {
  const rect = (element) => {
    const box = element.getBoundingClientRect();
    return { x: box.x, y: box.y, w: box.width, h: box.height, right: box.right, bottom: box.bottom };
  };
  const shown = (element) => {
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && rect(element).w > 0 && rect(element).h > 0;
  };
  const stage = document.querySelector(".field-stage");
  return {
    innerWidth, innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    stage: stage && shown(stage) ? rect(stage) : null,
    chrome: chrome.flatMap((selector) => [...document.querySelectorAll(selector)].filter(shown).map((el) => ({ selector, ...rect(el) }))),
    controls: [...document.querySelectorAll(controls)].filter(shown).map((el) => ({
      name: (el.getAttribute("aria-label") || el.textContent).trim().slice(0, 30), ...rect(el),
    })),
    browserOpen: Boolean(document.querySelector(".filmstrip.mobile-open")),
    layersOpen: Boolean(document.querySelector(".layer-bar.mobile-open")),
  };
}, [CHROME, PRIMARY_CONTROLS]);

for (const [name, viewport, touch] of MATRIX) {
  test(`${name}: no sideways scroll, the field dominates, controls are reachable`, async () => {
    const app = await open({ viewport, touch });
    const m = await measure(app.page);

    assert.ok(m.scrollWidth <= m.innerWidth, `${name}: horizontal overflow ${m.scrollWidth - m.innerWidth}px`);
    assert.ok(m.scrollHeight - m.innerHeight <= 1, `${name}: vertical overflow ${m.scrollHeight - m.innerHeight}px`);

    assert.ok(m.stage, `${name}: the field stage is rendered and visible`);
    assert.ok(m.stage.x >= 0 && m.stage.y >= 0 && m.stage.right <= m.innerWidth + 1 && m.stage.bottom <= m.innerHeight + 1,
      `${name}: the field is fully on screen: ${JSON.stringify(m.stage)}`);
    const stageArea = m.stage.w * m.stage.h;
    const share = stageArea / (m.innerWidth * m.innerHeight);
    assert.ok(share >= 0.4, `${name}: the field takes ${(share * 100).toFixed(0)}% of the viewport (floor 40%)`);
    const biggestChrome = m.chrome.reduce((best, c) => (c.w * c.h > best.area ? { selector: c.selector, area: c.w * c.h } : best), { selector: null, area: 0 });
    assert.ok(stageArea > biggestChrome.area,
      `${name}: the field (${Math.round(stageArea)}px²) out-sizes the largest chrome surface ${biggestChrome.selector} (${Math.round(biggestChrome.area)}px²)`);

    if (touch) {
      const small = m.controls.filter((c) => c.w < 44 || c.h < 44).map((c) => `${c.name} ${Math.round(c.w)}x${Math.round(c.h)}`);
      assert.deepEqual(small, [], `${name}: primary controls under 44x44`);
      const outside = m.controls.filter((c) => c.x < -0.5 || c.y < -0.5 || c.right > m.innerWidth + 0.5 || c.bottom > m.innerHeight + 0.5);
      assert.deepEqual(outside, [], `${name}: primary controls outside the viewport`);
    }
    app.assertNoErrors();
    await app.close();
  });
}

for (const [name, viewport] of MATRIX.filter(([label]) => label.startsWith("phone"))) {
  test(`${name}: no chrome permanently covers the field`, async () => {
    const app = await open({ viewport, touch: true });
    const { page } = app;
    await page.keyboard.press("Escape"); // nothing selected: the resting state a coach hands over
    await page.waitForTimeout(500);

    const rest = await measure(page);
    assert.ok(rest.stage, `${name}: field stage present`);
    assert.equal(rest.browserOpen, false, `${name}: the play browser starts collapsed`);
    assert.equal(rest.layersOpen, false, `${name}: the layer panel starts collapsed`);
    const covering = rest.chrome
      .map((c) => ({ selector: c.selector, px: Math.round(overlap(c, rest.stage)) }))
      .filter((c) => c.px > 4);
    assert.deepEqual(covering, [], `${name}: chrome resting on top of the field`);

    // What the toggles open is temporary: the field is the same size after.
    const toggles = [".mobile-browser-toggle", ".mobile-layer-toggle"];
    for (const toggle of toggles) {
      const button = page.locator(toggle);
      if (!(await button.isVisible())) continue;
      await button.click();
      await page.waitForTimeout(400);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
      const after = await measure(page);
      assert.equal(after.browserOpen || after.layersOpen, false, `${name}: ${toggle} panel dismissed`);
      assert.deepEqual({ w: Math.round(after.stage.w), h: Math.round(after.stage.h) }, { w: Math.round(rest.stage.w), h: Math.round(rest.stage.h) },
        `${name}: the field keeps its size after ${toggle} opens and closes`);
    }
    app.assertNoErrors();
    await app.close();
  });
}
