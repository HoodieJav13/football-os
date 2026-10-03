/** (b) Game day: start a temporary adjustment, edit, survive a reload, resolve each way. */
import { join } from "node:path";
import {
  EVIDENCE, GAME_DAY_KEY, deepEqual, findPlay, heading, launch, menu, openApp, openMore, pickPlay, playContent, recorder,
  renameSelected, saved, selectToken, settleSave, stemInput, token, undoEnabled, labelsOnField,
} from "./lib.mjs";

const PLAY = "Trips Rt 24 Blast";
const rec = recorder(process.env.REC_NAME ?? "b-game-day");
const startOnly = process.env.START_ONLY === "1";
const browser = await launch();
const storageState = process.env.STORAGE_STATE ?? join(EVIDENCE, "a-personal-play.storage.json");
let { context, page, errors } = await openApp(browser, { storageState });
if (process.env.OFFLINE === "1") {
  await page.waitForFunction(() => document.querySelector(".offline-state")?.textContent?.trim() === "Offline ready", null, { timeout: 20000 });
  await context.setOffline(true);
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(1800);
  rec.check("offline: app reloaded with the network cut", (await page.locator("g.player").count()) === 11, await page.locator(".offline-state").textContent());
}
await pickPlay(page, PLAY);
let ws = await saved(page);
const original = findPlay(ws, PLAY);
rec.check("precondition: the personal play from (a) is open", (await heading(page)) === PLAY && Boolean(original));
const temporaryChip = () => page.locator(".temporary-chip").count().then((n) => n > 0);
const gameDay = () => saved(page, GAME_DAY_KEY);

// --- start ----------------------------------------------------------------
await menu(page, "Game Day Adjust");
await page.getByRole("button", { name: "Start adjusting", exact: true }).click();
await page.waitForTimeout(400);
let gd = await gameDay();
rec.check("start: Temporary chip shown and snapshot stored", (await temporaryChip()) && gd?.playId === original.id && deepEqual(gd.snapshot, original), { playId: gd?.playId, startedAt: gd?.startedAt });

// --- edit during the adjustment ------------------------------------------
await selectToken(page, "W2");
await renameSelected(page, "W3");
await page.keyboard.press("ArrowLeft"); await page.waitForTimeout(200);
await page.keyboard.press("ArrowLeft"); await page.waitForTimeout(200);
const stem = stemInput(page);
const stemBefore = Number(await stem.inputValue());
await stem.fill(String(stemBefore + 4));
await page.waitForTimeout(300);
await settleSave(page);
ws = await saved(page);
let p = findPlay(ws, PLAY);
gd = await gameDay();
const adjusted = p;
rec.check("edit: the play carries the temporary edits while the snapshot stays the original", p.players.some((pl) => pl.label === "W3") && p.assignments[0].definition.stemYards === stemBefore + 4 && deepEqual(gd.snapshot, original) && !deepEqual(p, original));
if (startOnly) {
  rec.check("no errors", errors.length === 0, errors);
  await context.storageState({ path: join(EVIDENCE, `${rec.name}.storage.json`) });
  const fails = await rec.save(); await browser.close(); process.exit(fails ? 1 : 0);
}

// --- interruption: reload mid-adjustment ---------------------------------
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);
rec.note("reload: play shown after reload", await heading(page));
await openMore(page);
const menuSays = await page.getByRole("menuitem", { name: /Resolve adjustment|Game Day Adjust/ }).textContent();
await page.keyboard.press("Escape");
await pickPlay(page, PLAY);
ws = await saved(page); p = findPlay(ws, PLAY); gd = await gameDay();
rec.check("reload: adjustment survives a reload (chip back, edits present, snapshot intact)", (await temporaryChip()) && deepEqual(p, adjusted) && deepEqual(gd.snapshot, original), { menuOnOtherPlay: menuSays.trim() });

// --- game day on A, open More on play B ----------------------------------
const otherName = ws.playbooks.find((b) => b.id === ws.mainPlaybookId).plays.find((pl) => pl.name !== PLAY).name;
await pickPlay(page, otherName);
rec.check("other play: no Temporary chip on a play that is not being adjusted", !(await temporaryChip()), { other: otherName });
await menu(page, "Game Day Adjust");
await page.waitForTimeout(400);
rec.check("other play: Game Day Adjust from another play jumps back to the adjusted play and offers Resolve", (await heading(page)) === PLAY && (await page.getByRole("button", { name: "Discard", exact: true }).count()) === 1, { headingNow: await heading(page) });
await page.locator(".modal-close").first().click();
await page.waitForTimeout(300);

// --- resolve: Save as Variation ------------------------------------------
await menu(page, "Resolve adjustment");
await page.getByRole("button", { name: "Save as Variation", exact: true }).click();
await page.waitForTimeout(600);
await settleSave(page);
ws = await saved(page); p = findPlay(ws, PLAY); gd = await gameDay();
const variation = findPlay(ws, `${PLAY} Variation`);
rec.check("variation: original restored exactly to the snapshot", deepEqual(p, original));
rec.check("variation: new play holds the adjusted content and links to the original", Boolean(variation) && variation.variantOf === original.id && deepEqual(playContent({ ...variation, name: PLAY }), playContent(adjusted)), { variantOf: variation?.variantOf, id: variation?.id });
rec.check("variation: game-day key resolved and chip gone", gd?.resolved === true && !(await temporaryChip()) && (await heading(page)) === `${PLAY} Variation`);
rec.note("variation: assignment ids shared with the original? (ids are per-play like player ids; Duplicate-as-variation remaps, game-day does not)", { shared: variation.assignments.some((a) => original.assignments.some((b) => b.id === a.id)), variationIds: variation.assignments.map((a) => a.id), originalIds: original.assignments.map((a) => a.id) });

// Undo on the original right after Save as Variation: does the adjustment content come back into the original?
await pickPlay(page, PLAY);
await page.keyboard.press("Control+z"); await page.waitForTimeout(400); await settleSave(page);
ws = await saved(page); p = findPlay(ws, PLAY);
rec.note("variation: Undo on the original right after Save as Variation — labels now, equals original?", { labels: await labelsOnField(page), equalsOriginal: deepEqual(p, original), temporary: await temporaryChip() });
if (!deepEqual(p, original)) { await page.keyboard.press("Control+Shift+z"); await page.waitForTimeout(300); }

// --- resolve: Discard, then try Undo -------------------------------------
await pickPlay(page, PLAY);
await menu(page, "Game Day Adjust");
await page.getByRole("button", { name: "Start adjusting", exact: true }).click();
await page.waitForTimeout(300);
await selectToken(page, "W2");
await renameSelected(page, "GD");
await page.keyboard.press("ArrowRight"); await page.waitForTimeout(200);
await settleSave(page);
rec.check("discard: edits made (GD on field)", (await labelsOnField(page)).includes("GD"));
await menu(page, "Resolve adjustment");
await page.getByRole("button", { name: "Discard", exact: true }).click();
await page.waitForTimeout(500);
await settleSave(page);
ws = await saved(page); p = findPlay(ws, PLAY); gd = await gameDay();
rec.check("discard: original equals the snapshot again; chip gone", deepEqual(p, original) && !(await temporaryChip()) && gd?.resolved === true);
const undoAfterDiscard = await undoEnabled(page);
await page.keyboard.press("Control+z");
await page.waitForTimeout(400);
await settleSave(page);
ws = await saved(page); p = findPlay(ws, PLAY);
rec.note("discard: Undo right after Discard — undo enabled?, labels now, play equals original?", { undoWasEnabled: undoAfterDiscard, labels: await labelsOnField(page), equalsOriginal: deepEqual(p, original), temporary: await temporaryChip() });
if (!deepEqual(p, original)) { // put it back so the rest of the run starts clean
  await page.keyboard.press("Control+Shift+z"); await page.waitForTimeout(300);
}

// --- resolve: Replace Original -------------------------------------------
await pickPlay(page, PLAY);
await menu(page, "Game Day Adjust");
await page.getByRole("button", { name: "Start adjusting", exact: true }).click();
await page.waitForTimeout(300);
await selectToken(page, "W2");
await renameSelected(page, "RP");
await settleSave(page);
await menu(page, "Resolve adjustment");
await page.getByRole("button", { name: "Replace Original", exact: true }).click();
await page.waitForTimeout(500);
await settleSave(page);
ws = await saved(page); p = findPlay(ws, PLAY); gd = await gameDay();
rec.check("replace: original now carries the edit permanently; chip gone", p.players.some((pl) => pl.label === "RP") && !(await temporaryChip()) && gd?.resolved === true);
const replaced = p;

// --- resolve: Save as New Play -------------------------------------------
await menu(page, "Game Day Adjust");
await page.getByRole("button", { name: "Start adjusting", exact: true }).click();
await page.waitForTimeout(300);
await selectToken(page, "RP");
await renameSelected(page, "NP");
await settleSave(page);
await menu(page, "Resolve adjustment");
await page.getByRole("button", { name: "Save as New Play", exact: true }).click();
await page.waitForTimeout(500);
await settleSave(page);
ws = await saved(page); p = findPlay(ws, PLAY); gd = await gameDay();
const fresh = findPlay(ws, `${PLAY} New`);
rec.check("new play: original restored to the replaced state; new play holds NP and is unlinked", deepEqual(p, replaced) && Boolean(fresh) && fresh.players.some((pl) => pl.label === "NP") && (fresh.variantOf ?? null) === null && gd?.resolved === true,
  { variantOf: fresh?.variantOf ?? null });

// --- reload after everything ---------------------------------------------
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);
ws = await saved(page);
const names = ws.playbooks.find((b) => b.id === ws.mainPlaybookId).plays.map((pl) => pl.name);
rec.check("after reload: all three plays present and no adjustment pending", names.includes(PLAY) && names.includes(`${PLAY} Variation`) && names.includes(`${PLAY} New`) && !(await temporaryChip()), names);
rec.check("no console or page errors through (b)", errors.length === 0, errors);
await page.screenshot({ path: join(EVIDENCE, `${rec.name}-end.png`) });
await context.storageState({ path: join(EVIDENCE, `${rec.name}.storage.json`) });
const fails = await rec.save();
await browser.close();
process.exit(fails ? 1 : 0);
