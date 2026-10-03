/** (a) Personal play: create, edit, cancel, undo/redo past history, save, close, reopen. */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  EVIDENCE, GAME_DAY_KEY, closeDialog, deepEqual, diffKeys, findPlay, giveRoute, heading, labelsOnField, launch, menu, openApp,
  pickPlay, playDetails, recorder, renameSelected, saved, selectToken, settleSave, stemInput, token, undoEnabled, redoEnabled,
} from "./lib.mjs";

const PLAY = "Trips Rt 24 Blast";
const rec = recorder(process.env.REC_NAME ?? "a-personal-play");
const browser = await launch();
const offline = process.env.OFFLINE === "1";
let { context, page, errors } = await openApp(browser, { storageState: process.env.STORAGE_STATE });
if (offline) {
  await page.waitForFunction(() => document.querySelector(".offline-state")?.textContent?.trim() === "Offline ready", null, { timeout: 20000 });
  await context.setOffline(true);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(1800);
  rec.check("offline: app reloaded with the network cut", (await page.locator("g.player").count()) === 11, await page.locator(".offline-state").textContent());
}

const startHeading = await heading(page);
rec.note("opened app", { heading: startHeading, viewport: await page.viewportSize() });

// --- create ---------------------------------------------------------------
await page.getByRole("button", { name: "Create a new play", exact: true }).click();
await page.waitForTimeout(300);
await page.getByLabel("Play name", { exact: true }).fill(PLAY);
await page.getByRole("button", { name: "Create play", exact: true }).click();
await page.waitForTimeout(600);
rec.check("create: header names the new play", (await heading(page)) === PLAY, await heading(page));
await settleSave(page);
let ws = await saved(page);
let p = findPlay(ws, PLAY);
rec.check("create: play persisted with 11 players and no assignments", p?.players.length === 11 && p.assignments.length === 0, { id: p?.id, players: p?.players.length });
const playId = p.id;
const afterCreate = p;

// --- edits (each is one undo step) ---------------------------------------
await selectToken(page, "X");
await giveRoute(page);                                   // 1: route added
await page.waitForTimeout(200);
const stem = stemInput(page);
const stem0 = Number(await stem.inputValue());
await stem.fill(String(stem0 + 6));                       // 2: stem depth
await page.waitForTimeout(300);
await renameSelected(page, "W1");                         // 3: rename X -> W1
await page.keyboard.press("ArrowRight");                  // 4: nudge
await page.waitForTimeout(300);
await settleSave(page);
ws = await saved(page); p = findPlay(ws, PLAY);
const edited = p;
const w1 = p.players.find((pl) => pl.label === "W1");
rec.check("edit: route, stem depth, rename and nudge all persisted", p.assignments.length === 1 && p.assignments[0].definition?.stemYards === stem0 + 6 && Boolean(w1) && w1.x === afterCreate.players.find((pl) => pl.label === "X").x + 0.25,
  { assignments: p.assignments.length, stem: p.assignments[0]?.definition?.stemYards, w1, xBefore: afterCreate.players.find((pl) => pl.label === "X") });

// --- cancel an edit -------------------------------------------------------
const dialog = await playDetails(page, { "Play name": "WRONG NAME", "Play family": "Wrong family" });
await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
await page.waitForTimeout(400);
await settleSave(page);
ws = await saved(page); p = findPlay(ws, PLAY);
rec.check("cancel: Play details cancel changed nothing (header + saved JSON identical)", (await heading(page)) === PLAY && deepEqual(p, edited), { heading: await heading(page) });
// Escape path too
const dialog2 = await playDetails(page, { "Play name": "ESCAPED NAME" });
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
await settleSave(page);
ws = await saved(page); p = findPlay(ws, PLAY);
rec.check("cancel: Escape on Play details changed nothing", (await heading(page)) === PLAY && deepEqual(p, edited) && (await dialog2.count()) === 0);

// --- undo / redo past the ends -------------------------------------------
// The drawing tool stays selected after giving X a route (by design), so leave it before touching the field.
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
rec.note("tool after Escape", await page.locator(".tool-rail button[aria-pressed=true]").first().textContent().catch(() => null));
const undoSteps = [];
for (let i = 0; i < 8; i += 1) {
  const enabled = await undoEnabled(page);
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(250);
  undoSteps.push({ i, undoWasEnabled: enabled, labels: await labelsOnField(page), routes: await page.locator(".route").count() });
}
await settleSave(page);
ws = await saved(page); p = findPlay(ws, PLAY);
rec.check("undo: 8 undos over 4 edits return exactly to the post-create state", deepEqual(p, afterCreate) && !(await undoEnabled(page)), { undoSteps: undoSteps.map((s) => [s.undoWasEnabled, s.routes, s.labels.includes("W1")]) });
rec.check("undo: no errors while undoing past the start of history", errors.length === 0, errors);
const redoSteps = [];
for (let i = 0; i < 8; i += 1) {
  const enabled = await redoEnabled(page);
  await page.keyboard.press("Control+Shift+z");
  await page.waitForTimeout(250);
  redoSteps.push([enabled, await page.locator(".route").count()]);
}
await settleSave(page);
ws = await saved(page); p = findPlay(ws, PLAY);
rec.check("redo: 8 redos return exactly to the fully edited state and stop", deepEqual(p, edited) && !(await redoEnabled(page)), { redoSteps, diff: diffKeys(edited, p) });
// undo until the rename is gone, make a new edit, redo must be gone
let undosToDropW1 = 0;
while ((await labelsOnField(page)).includes("W1") && undosToDropW1 < 8) { await page.keyboard.press("Control+z"); await page.waitForTimeout(250); undosToDropW1 += 1; }
rec.note("redo: undos needed to take back the nudge + rename (2 edits)", undosToDropW1);
await selectToken(page, "X");
await renameSelected(page, "W2");
rec.check("redo: a new edit after undo clears the redo branch", !(await redoEnabled(page)) && (await labelsOnField(page)).includes("W2"));
await page.keyboard.press("Control+z"); await page.waitForTimeout(250);
await page.keyboard.press("Control+z"); await page.waitForTimeout(250);
for (let i = 0; i < 4; i += 1) { await page.keyboard.press("Control+Shift+z"); await page.waitForTimeout(250); }
await settleSave(page);
ws = await saved(page); p = findPlay(ws, PLAY);
rec.check("redo: redo after the new edit lands on W2, never on the discarded W1 branch", (await labelsOnField(page)).includes("W2") && !(await labelsOnField(page)).includes("W1") && p.players.some((pl) => pl.label === "W2"));
const beforeSave = p;

// --- save (Play details) --------------------------------------------------
const d3 = await playDetails(page, { Folder: "Run game", "Play family": "Blast", Personnel: "21 Personnel", "Blocking scheme": "Power", "Field side": "right" });
await d3.getByRole("button", { name: "Save details", exact: true }).click();
await page.waitForTimeout(400);
await settleSave(page);
ws = await saved(page); p = findPlay(ws, PLAY);
const savedPlay = p;
rec.check("save: details persisted", p.folder === "Run game" && p.family === "Blast" && p.personnel === "21 Personnel" && p.blockingScheme === "Power" && p.fieldSide === "right",
  { folder: p.folder, family: p.family, personnel: p.personnel, blockingScheme: p.blockingScheme, fieldSide: p.fieldSide });
rec.check("save: details save kept every earlier edit", deepEqual({ ...p, folder: beforeSave.folder, family: beforeSave.family, personnel: beforeSave.personnel, blockingScheme: beforeSave.blockingScheme, fieldSide: beforeSave.fieldSide }, beforeSave));
const screenBefore = { heading: await heading(page), meta: await page.locator(".play-meta").textContent(), family: await page.locator(".family-label").textContent(), labels: await labelsOnField(page), routes: await page.locator(".route").count(), fieldIndicator: await page.locator(".play-canvas").textContent().then((t) => /FIELD/.test(t)) };
rec.check("save: the saved field side is visible on the canvas", screenBefore.fieldIndicator === true);
await page.screenshot({ path: join(EVIDENCE, `${rec.name}-saved.png`) });

// --- close, reopen --------------------------------------------------------
const rawBefore = await page.evaluate((k) => localStorage.getItem(k), "football-os.playbooks.v11");
await page.close();                       // closes the tab (pagehide → flush)
page = await context.newPage();
errors.length = 0;
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(process.env.APP_URL, { waitUntil: offline ? "load" : "networkidle" });
await page.waitForTimeout(1800);
const reopenedHeading = await heading(page);
rec.note("reopen: play shown after reopen (active play is not persisted; the app opens on the first play)", reopenedHeading);
await pickPlay(page, PLAY);
const screenAfter = { heading: await heading(page), meta: await page.locator(".play-meta").textContent(), family: await page.locator(".family-label").textContent(), labels: await labelsOnField(page), routes: await page.locator(".route").count(), fieldIndicator: await page.locator(".play-canvas").textContent().then((t) => /FIELD/.test(t)) };
ws = await saved(page); p = findPlay(ws, PLAY);
/* Loading runs normalizePlay, which fills `templateOverride: false` on assignments that never had the key.
   That is a schema default, not an edit, so compare with the default applied on both sides and report the raw diff. */
const withDefaults = (play) => ({ ...play, assignments: play.assignments.map((a) => ({ templateOverride: false, ...a })) });
rec.check("reopen: saved play is identical after close/reopen (modulo normalizer defaults)", deepEqual(withDefaults(p), withDefaults(savedPlay)), { rawDiff: diffKeys(savedPlay, p) });
const rawAfter = await page.evaluate((k) => localStorage.getItem(k), "football-os.playbooks.v11");
if (rawAfter !== rawBefore) { await writeFile(join(EVIDENCE, `${rec.name}-raw-before.json`), rawBefore); await writeFile(join(EVIDENCE, `${rec.name}-raw-after.json`), rawAfter); }
rec.step("reopen: stored bytes unchanged by reopening (normalizer defaults may be written back)", rawAfter === rawBefore ? "pass" : "note", { diff: diffKeys(JSON.parse(rawBefore), JSON.parse(rawAfter)) && Object.keys(diffKeys(JSON.parse(rawBefore), JSON.parse(rawAfter))), playDiff: diffKeys(savedPlay, p) });
rec.check("reopen: the screen shows the same play state", deepEqual(screenBefore, screenAfter), { before: screenBefore, after: screenAfter });
await page.screenshot({ path: join(EVIDENCE, `${rec.name}-reopened.png`) });
rec.check("reopen: undo history did not survive the reopen (session-scoped by design)", !(await undoEnabled(page)));
rec.check("no console or page errors through (a)", errors.length === 0, errors);
rec.note("game-day key after (a)", await page.evaluate((k) => localStorage.getItem(k), GAME_DAY_KEY));

await context.storageState({ path: join(EVIDENCE, `${rec.name}.storage.json`) });
await writeFile(join(EVIDENCE, `${rec.name}-play.json`), JSON.stringify(savedPlay, null, 2));
const fails = await rec.save();
await browser.close();
process.exit(fails ? 1 : 0);
