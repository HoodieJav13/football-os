/** (f) Interruptions and repeats: reload/close mid-edit and mid-save, quick play switching, two tabs, repeated save/create. */
import { join } from "node:path";
import {
  APP_URL, EVIDENCE, WORKSPACE_KEY, deepEqual, findPlay, heading, labelsOnField, launch, menu, openApp, pickPlay, playDetails,
  rawSaved, recorder, renameSelected, saved, selectToken, settleSave, token, watchErrors,
} from "./lib.mjs";

const PLAY = "Trips Rt 24 Blast";
const OTHER = `${PLAY} Variation`;
const rec = recorder("f-interruptions");
const browser = await launch();
const storageState = process.env.STORAGE_STATE ?? join(EVIDENCE, "d-backup-restore.storage.json");
let { context, page, errors } = await openApp(browser, { storageState });
const reopen = async () => {
  page = await context.newPage(); watchErrors(page, errors);
  await page.goto(APP_URL, { waitUntil: "networkidle" }); await page.waitForTimeout(1500);
};

// --- reload mid-edit (inside the 400 ms debounce) ------------------------
await pickPlay(page, PLAY);
await selectToken(page, "RP");
await renameSelected(page, "R1");
await page.reload({ waitUntil: "networkidle" });          // no wait: the trailing write has not fired
await page.waitForTimeout(1200);
let ws = await saved(page);
rec.check("reload mid-edit: the rename made 0 ms before reload is on disk", findPlay(ws, PLAY).players.some((p) => p.label === "R1"));

// --- reload mid-drag ------------------------------------------------------
await pickPlay(page, PLAY);
const box = await token(page, "R1").boundingBox();
const xBefore = findPlay(ws, PLAY).players.find((p) => p.label === "R1").x;
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 6 });  // along the line, so the formation stays legal
await page.reload({ waitUntil: "networkidle" });          // pointer never released
await page.waitForTimeout(1200);
ws = await saved(page);
const r1 = findPlay(ws, PLAY).players.find((p) => p.label === "R1");
rec.note("reload mid-drag: R1 before/after (either the moved spot or the start is acceptable; a half-state is not)", { xBefore, xAfter: r1.x, yAfter: r1.y, players: findPlay(ws, PLAY).players.length });
await pickPlay(page, PLAY);
rec.check("reload mid-drag: play still has 11 players, a legal formation, and loads cleanly", findPlay(ws, PLAY).players.length === 11 && errors.length === 0 && !/Draft/.test(await page.locator(".offline-state").textContent()), { errors, status: await page.locator(".offline-state").textContent() });

// --- close the tab mid-edit ----------------------------------------------
await pickPlay(page, PLAY);
await selectToken(page, "R1");
await renameSelected(page, "R2");
await page.close();                                        // 0 ms later
await reopen();
ws = await saved(page);
rec.check("close tab mid-edit: the rename made 0 ms before closing the tab is on disk", findPlay(ws, PLAY).players.some((p) => p.label === "R2"));

// --- reload mid-save (Play details) --------------------------------------
await pickPlay(page, PLAY);
const d = await playDetails(page, { Protection: "Slide Lt" });
await d.getByRole("button", { name: "Save details", exact: true }).click();
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1200);
ws = await saved(page);
rec.check("reload mid-save: Play details saved 0 ms before reload is on disk", findPlay(ws, PLAY).protection === "Slide Lt", findPlay(ws, PLAY).protection);

// --- repeat save: double submit of Play details ---------------------------
await pickPlay(page, PLAY);
const d2 = await playDetails(page, { Protection: "Slide Rt" });
const saveBtn = d2.getByRole("button", { name: "Save details", exact: true });
await saveBtn.dispatchEvent("click"); await saveBtn.dispatchEvent("click").catch(() => {});
await page.waitForTimeout(300);
await settleSave(page);
ws = await saved(page);
const book = ws.playbooks.find((b) => b.id === ws.mainPlaybookId);
rec.check("double save: one play, protection saved once, no errors, dialog closed", findPlay(ws, PLAY).protection === "Slide Rt" && book.plays.filter((p) => p.name === PLAY).length === 1 && errors.length === 0 && (await page.getByRole("dialog").count()) === 0);
// double submit of Create play
await page.getByRole("button", { name: "Create a new play", exact: true }).click();
await page.waitForTimeout(300);
await page.getByLabel("Play name", { exact: true }).fill("Double Tap Dive");
const createBtn = page.getByRole("button", { name: "Create play", exact: true });
await createBtn.dispatchEvent("click"); await createBtn.dispatchEvent("click").catch(() => {});
await page.waitForTimeout(400);
await settleSave(page);
ws = await saved(page);
const dives = ws.playbooks.find((b) => b.id === ws.mainPlaybookId).plays.filter((p) => p.name.startsWith("Double Tap Dive"));
rec.check("double create: exactly one play created", dives.length === 1, dives.map((p) => p.name));

// --- quick switching between two plays with uncommitted edits ------------
await pickPlay(page, PLAY);
ws = await saved(page);
const aBefore = findPlay(ws, PLAY), bBefore = findPlay(ws, OTHER);
await selectToken(page, "R2");
await renameSelected(page, "QA");
await page.keyboard.press("ArrowRight");                   // no wait at all
await pickPlay(page, OTHER);                               // switch immediately (<400 ms)
await selectToken(page, "W3");
await renameSelected(page, "QB");
await page.keyboard.press("ArrowLeft");
await pickPlay(page, PLAY);
await pickPlay(page, OTHER);
await pickPlay(page, PLAY);
await settleSave(page);
ws = await saved(page);
const aAfter = findPlay(ws, PLAY), bAfter = findPlay(ws, OTHER);
const labelsA = aAfter.players.map((p) => p.label), labelsB = bAfter.players.map((p) => p.label);
rec.check("quick switch: play A has QA and not QB; play B has QB and not QA", labelsA.includes("QA") && !labelsA.includes("QB") && labelsB.includes("QB") && !labelsB.includes("QA"), { labelsA, labelsB });
rec.check("quick switch: A's nudge went to A's player, B's nudge to B's player", aAfter.players.find((p) => p.label === "QA").x === aBefore.players.find((p) => p.label === "R2").x + 0.25 && bAfter.players.find((p) => p.label === "QB").x === bBefore.players.find((p) => p.label === "W3").x - 0.25);
// A nudge carries the player's route start along with it, so assignments legitimately move too.
rec.check("quick switch: nothing else on either play changed (players and their carried assignments aside)", deepEqual({ ...aAfter, players: null, assignments: null }, { ...aBefore, players: null, assignments: null }) && deepEqual({ ...bAfter, players: null, assignments: null }, { ...bBefore, players: null, assignments: null }),
  { aAssignmentStarts: [aBefore.assignments.map((x) => x.points[0]), aAfter.assignments.map((x) => x.points[0])], bAssignmentStarts: [bBefore.assignments.map((x) => x.points[0]), bAfter.assignments.map((x) => x.points[0])] });
// A label typed but not committed, then the other play is picked.
await selectToken(page, "QA");
await page.locator(".position-label-control input").fill("UN");  // no Enter, no blur
await pickPlay(page, OTHER);                                        // the click blurs the input
await settleSave(page);
ws = await saved(page);
rec.check("uncommitted label then switch: the blur commits to the play it was typed on, never the next one", findPlay(ws, PLAY).players.some((p) => p.label === "UN") && !findPlay(ws, OTHER).players.some((p) => p.label === "UN"),
  { A: findPlay(ws, PLAY).players.map((p) => p.label), B: findPlay(ws, OTHER).players.map((p) => p.label) });
// Undo on B must never touch A's edits.
await pickPlay(page, OTHER);
const aFrozen = findPlay(ws, PLAY);
await page.keyboard.press("Control+z"); await page.waitForTimeout(200);
await page.keyboard.press("Control+z"); await page.waitForTimeout(200);
await settleSave(page);
ws = await saved(page);
rec.check("undo on play B leaves play A untouched", deepEqual(findPlay(ws, PLAY), aFrozen));

// --- the same play open in two tabs --------------------------------------
await pickPlay(page, PLAY);
const tab2 = await context.newPage(); watchErrors(tab2, errors);
await tab2.goto(APP_URL, { waitUntil: "networkidle" }); await tab2.waitForTimeout(1500);
await pickPlay(tab2, PLAY);
await page.bringToFront();
await selectToken(page, "UN");
await renameSelected(page, "T1");
await settleSave(page);
const afterTab1 = findPlay(await saved(page), PLAY).players.map((p) => p.label);
await tab2.bringToFront();
await selectToken(tab2, "Z");
await renameSelected(tab2, "T2");
await settleSave(tab2);
const afterTab2 = findPlay(await saved(tab2), PLAY).players.map((p) => p.label);
await page.bringToFront();
await page.waitForTimeout(600);
const afterBack = findPlay(await saved(page), PLAY).players.map((p) => p.label);
rec.note("two tabs: labels on disk after tab1 edit, after tab2 edit, after returning to tab1", { afterTab1, afterTab2, afterBack });
const bothKept = afterBack.includes("T1") && afterBack.includes("T2");
rec.step("two tabs: both tabs' edits to the same play are on disk", bothKept ? "pass" : "fail", { T1: afterBack.includes("T1"), T2: afterBack.includes("T2") });
await page.reload({ waitUntil: "networkidle" }); await page.waitForTimeout(1200);
rec.note("two tabs: labels after tab1 reload", findPlay(await saved(page), PLAY).players.map((p) => p.label));
await tab2.close();
await page.waitForTimeout(600);
rec.note("two tabs: labels after closing tab2 (its pagehide flush)", findPlay(await saved(page), PLAY).players.map((p) => p.label));

rec.check("no console or page errors through (f)", errors.length === 0, errors);
await context.storageState({ path: join(EVIDENCE, "f-interruptions.storage.json") });
const fails = await rec.save();
await browser.close();
process.exit(fails ? 1 : 0);
