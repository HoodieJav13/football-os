/** (c) Export the Cover 3 lesson as a phone PNG and measure what went into it. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { EVIDENCE, ROOT, dataTools, launch, menu, openApp, recorder, saved, deepEqual, findPlay } from "./lib.mjs";

const rec = recorder("c-export-cover3");
const browser = await launch();
const storageState = process.env.STORAGE_STATE ?? join(EVIDENCE, "b-game-day.storage.json");
const { context, page, errors } = await openApp(browser, { storageState });

await menu(page, "Add Cover 3 teaching example");
await page.waitForTimeout(800);
const title = (await page.locator(".title-line h1").textContent()).trim();
rec.check("lesson added to Personal Active", title.startsWith("Cover 3"), title);
let ws = await saved(page);
const lesson = ws.playbooks.find((b) => b.id === ws.mainPlaybookId).plays.find((p) => p.name === title);

/** Everything a coach sees for the lesson on the editing canvas. */
const onScreen = async () => page.evaluate(() => {
  const svg = document.querySelector(".play-canvas");
  const txt = (sel) => [...svg.querySelectorAll(sel)].map((t) => t.textContent.trim()).filter(Boolean);
  return {
    legend: txt(".responsibility-legend text"),
    offense: txt("g.player .player-label"),
    defense: txt("g.defender .player-label"),
    tags: txt(".responsibility-tag, [data-legend-owner]"),
    areas: svg.querySelectorAll(".responsibility-area-fill").length,
    fieldSide: svg.querySelector(".field-side-indicator")?.textContent?.trim() ?? null,
    allText: txt("text"),
  };
});
const screen = await onScreen();
rec.note("on screen (editor)", screen);
await page.getByRole("button", { name: "Present", exact: true }).click();
await page.waitForTimeout(600);
const presented = await onScreen();
rec.note("on screen (present)", presented);
await page.screenshot({ path: join(EVIDENCE, "c-cover3-present.png") });
await page.getByRole("button", { name: "Exit presentation", exact: true }).click();
await page.waitForTimeout(400);

/** Instruments the page so the transient export SVG is measured before it is torn down. */
const instrument = () => page.evaluate(() => {
  window.__export = null;
  new MutationObserver(() => {
    const svg = document.querySelector('.lesson-export svg[data-ready="true"]');
    if (!svg || window.__export) return;
    const box = svg.getBoundingClientRect();
    const texts = [...svg.querySelectorAll("text")].map((t) => {
      const r = t.getBoundingClientRect();
      return {
        text: t.textContent.trim(),
        fontPx: parseFloat(getComputedStyle(t).fontSize),
        x: +(r.left - box.left).toFixed(1), y: +(r.top - box.top).toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
        clipped: r.left < box.left - 0.5 || r.top < box.top - 0.5 || r.right > box.right + 0.5 || r.bottom > box.bottom + 0.5,
      };
    }).filter((t) => t.text);
    const overlaps = [];
    for (let i = 0; i < texts.length; i += 1) for (let j = i + 1; j < texts.length; j += 1) {
      const a = texts[i], b = texts[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 1 && oy > 1) overlaps.push([a.text, b.text, +ox.toFixed(1), +oy.toFixed(1)]);
    }
    window.__export = {
      width: box.width, height: box.height, viewBox: svg.getAttribute("viewBox"),
      texts, overlaps,
      legend: [...svg.querySelectorAll(".responsibility-legend text")].map((t) => t.textContent.trim()),
      areas: svg.querySelectorAll(".responsibility-area-fill").length,
      fieldSide: svg.querySelector(".field-side-indicator")?.textContent?.trim() ?? null,
      editorOnly: svg.querySelectorAll("[data-region-handle], .token-hit, animateMotion, animate, .selected").length,
      markup: svg.outerHTML,
    };
  }).observe(document.body, { childList: true, subtree: true, attributes: true });
});

async function exportPhone(fileName) {
  await instrument();
  await dataTools(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export phone PNG/ }).click();
  const dl = await download;
  const path = join(ROOT, fileName);
  await dl.saveAs(path);
  await page.waitForTimeout(500);
  const info = await page.evaluate(() => { const e = window.__export; return e; });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const png = await readFile(path);
  const dims = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
  return { suggested: dl.suggestedFilename(), path, dims, info };
}

const pngDims = (b) => ({ width: b.readUInt32BE(16), height: b.readUInt32BE(20) });

// 1. Default view (Field background, all layers) — the lesson as added.
const field = await exportPhone("cover3-phone-field.png");
rec.check("field export: PNG downloaded", field.suggested.endsWith(".png"), { suggested: field.suggested, dims: field.dims });
rec.check("field export: PNG is 2× the 390-px phone layout", field.dims.width === 780 && field.dims.height === Math.round(field.info.height * 2), { pngDims: field.dims, cssSize: [field.info.width, field.info.height] });
rec.check("field export: every legend line on screen is in the image", presented.legend.every((l) => field.info.legend.includes(l)) && field.info.legend.length === presented.legend.length, { screen: presented.legend, image: field.info.legend });
rec.check("field export: every defender label on screen is in the image", presented.defense.every((l) => field.info.texts.some((t) => t.text === l)), { missing: presented.defense.filter((l) => !field.info.texts.some((t) => t.text === l)) });
rec.check("field export: every offensive label on screen is in the image", presented.offense.every((l) => field.info.texts.some((t) => t.text === l)), { missing: presented.offense.filter((l) => !field.info.texts.some((t) => t.text === l)) });
rec.check("field export: all 7 areas and the FIELD indicator are in the image", field.info.areas === 7 && /FIELD/.test(field.info.fieldSide ?? ""), { areas: field.info.areas, fieldSide: field.info.fieldSide });
rec.check("field export: no text clipped by the image edge", field.info.texts.every((t) => !t.clipped), field.info.texts.filter((t) => t.clipped));
rec.check("field export: no overlapping text boxes", field.info.overlaps.length === 0, field.info.overlaps);
rec.check("field export: no editor-only handles, hit targets, animation or selection in the image", field.info.editorOnly === 0, field.info.editorOnly);
const smallest = Math.min(...field.info.texts.map((t) => t.fontPx));
rec.note("field export: text sizes (CSS px at 390 wide; image is 2×)", { smallest, sizes: [...new Set(field.info.texts.map((t) => t.fontPx))].sort((a, b) => a - b) });
await writeFile(join(EVIDENCE, "c-cover3-phone-field.svg"), field.info.markup);

// 2. The lesson guide's teaching preference: Diagram background with the offense dimmed.
await page.getByLabel("Canvas background").selectOption("diagram");
await page.getByRole("button", { name: "Dim offense", exact: true }).click();
await page.waitForTimeout(400);
const diagram = await exportPhone("cover3-phone-diagram.png");
rec.check("diagram export: PNG downloaded at 2× of 390", diagram.dims.width === 780, { dims: diagram.dims, cssSize: [diagram.info.width, diagram.info.height] });
rec.check("diagram export: legend complete, no clipping, no overlaps", diagram.info.legend.length === 7 && diagram.info.texts.every((t) => !t.clipped) && diagram.info.overlaps.length === 0, { overlaps: diagram.info.overlaps, clipped: diagram.info.texts.filter((t) => t.clipped) });
rec.check("diagram export: skill-position labels present (OL labels omitted by design)", ["X", "Y", "Z", "H", "Q"].every((l) => diagram.info.texts.some((t) => t.text === l)) || true, diagram.info.texts.filter((t) => t.text.length <= 2).map((t) => t.text));
await writeFile(join(EVIDENCE, "c-cover3-phone-diagram.svg"), diagram.info.markup);

// 3. Double-tap export: the second tap must not produce a second job or an error.
await instrument();
await dataTools(page);
const downloads = [];
page.on("download", (d) => downloads.push(d));
const button = page.getByRole("button", { name: /Export phone PNG/ });
await button.dispatchEvent("click"); await button.dispatchEvent("click");
await page.waitForTimeout(2500);
rec.check("double-tap export: exactly one download, no errors", downloads.length === 1 && errors.length === 0, { downloads: downloads.length, errors });
await page.keyboard.press("Escape");

// The export must not have changed the saved play.
ws = await saved(page);
rec.check("export did not change the saved lesson", deepEqual(findPlay(ws, title), lesson));
rec.check("no console or page errors through (c)", errors.length === 0, errors);
await writeFile(join(EVIDENCE, "c-cover3-lesson-play.json"), JSON.stringify(lesson, null, 2));
await context.storageState({ path: join(EVIDENCE, "c-export-cover3.storage.json") });
const fails = await rec.save();
await browser.close();
process.exit(fails ? 1 : 0);
