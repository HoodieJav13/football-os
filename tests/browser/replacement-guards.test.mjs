import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultWorkspace, createWorkspaceBackup, WORKSPACE_KEY } from "../../src/workspaceData.js";
import { useBrowser } from "./harness.mjs";
import { GAME_DAY_KEY, labelsOf, menuItem, playOf, readDurable, renamePlayer, settleSave } from "./tabs.mjs";

const open = useBrowser();

/*
 * Two failure combinations from a source review of 20ea612. Each drives the
 * real app and reads the durable result from a fresh page that does not run
 * the app.
 */

const APP = () => process.env.APP_URL;
async function download(page, click) {
  const waiting = page.waitForEvent("download");
  await click();
  const stream = await (await waiting).createReadStream();
  let text = "";
  for await (const chunk of stream) text += chunk;
  return JSON.parse(text);
}

test("an export that could not read stored records keeps Keep this tab's version blocked, and B stays untouched", async () => {
  const app = await open();
  const page = app.page;
  await page.waitForTimeout(5200); // past the post-grant reread window
  await renamePlayer(page, "X", "AONE"); // A's unique change
  await settleSave(page);

  // A genuine same-origin outsider saves B, with its own unique change.
  const outsider = await app.context.newPage();
  await outsider.goto(new URL("manifest.webmanifest", APP()).href);
  const b = createDefaultWorkspace();
  b.playbooks[0].plays[0].name = "B ONLY";
  await outsider.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: WORKSPACE_KEY, value: JSON.stringify(b) });
  await outsider.close();
  await page.waitForTimeout(800);
  assert.match(await page.locator(".authority-banner").innerText(), /Saving paused/);

  // Only key enumeration fails from here on; reads and writes still work.
  await page.evaluate(() => { Storage.prototype.key = function () { throw new DOMException("Enumeration denied", "SecurityError"); }; });
  const bundle = await download(page, () => page.locator(".authority-banner").getByRole("button", { name: /Download preservation file/ }).click());
  assert.deepEqual(
    { liveRescue: labelsOf(playOf(bundle.live.workspace, "mesh")).includes("AONE"), storedMissing: bundle.durable[WORKSPACE_KEY] === undefined, marked: /Enumeration denied/.test(bundle.durableUnavailable ?? "") },
    { liveRescue: true, storedMissing: true, marked: true },
    "the live-only rescue file is still produced, and says what it lacks",
  );

  const keep = page.getByRole("button", { name: "Keep this tab's version" });
  const keepDisabled = await keep.isDisabled();
  if (!keepDisabled) await keep.click();
  await page.waitForTimeout(800);
  await page.evaluate(() => { document.dispatchEvent(new Event("visibilitychange")); });
  await page.waitForTimeout(300);

  const stored = JSON.parse((await readDurable(app.context))[WORKSPACE_KEY]);
  assert.deepEqual(
    { keepDisabled, storedName: playOf(stored, "mesh").name, aOverwroteB: labelsOf(playOf(stored, "mesh")).includes("AONE") },
    { keepDisabled: true, storedName: "B ONLY", aOverwroteB: false },
  );
  assert.match(await page.locator(".authority-banner").innerText(), /could not be read|not in the file/i, "the coach is told why the choice stays blocked");
  await app.close();
});

/** Fails the first getItem after the restored workspace is written: the reread right after a successful restore. */
const rereadFailsOnce = () => {
  const set = Storage.prototype.setItem, get = Storage.prototype.getItem;
  window.__armReread = false;
  let failNext = false;
  window.__rereadFailures = 0;
  Storage.prototype.setItem = function (key, value) {
    const result = set.call(this, key, value);
    if (window.__armReread && key === "football-os.playbooks.v11" && String(value).includes("From Backup")) { failNext = true; window.__armReread = false; }
    return result;
  };
  Storage.prototype.getItem = function (key) {
    if (failNext) { failNext = false; window.__rereadFailures += 1; throw new DOMException("Read denied once", "SecurityError"); }
    return get.call(this, key);
  };
};

test("a successful restore whose reread fails never lets the old live state overwrite the restored one", async () => {
  const app = await open({ init: rereadFailsOnce });
  const page = app.page;
  // A: an active adjustment and an edit, saved.
  await menuItem(page, "Game Day Adjust");
  await page.getByRole("button", { name: "Start adjusting", exact: true }).click();
  await page.waitForTimeout(400);
  await renamePlayer(page, "X", "AOLD");
  await settleSave(page);

  const backup = createWorkspaceBackup(createDefaultWorkspace());
  backup.workspace.playbooks[0].plays[0].name = "From Backup";
  await page.locator(".playbook-trigger").click();
  await page.getByRole("button", { name: /Backup and export/ }).click();
  await page.locator("input[type=file]").setInputFiles({ name: "b.footballos", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
  await page.waitForTimeout(400);
  await page.evaluate(() => { window.__armReread = true; });
  await page.getByRole("button", { name: "Restore this backup" }).click();
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.__rereadFailures), 1, "the reread right after the restore failed once");
  if (await page.getByRole("dialog").count()) await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // Reads work again. Hide/close flushes and an ordinary edit.
  await page.evaluate(() => { document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false })); });
  await renamePlayer(page, "Z", "AFTR").catch(() => {});
  await settleSave(page);

  const durable = await readDurable(app.context);
  const stored = JSON.parse(durable[WORKSPACE_KEY]);
  const mesh = playOf(stored, "mesh");
  assert.deepEqual(
    {
      restoredKept: mesh.name,
      oldLiveWritten: labelsOf(mesh).includes("AOLD"),
      editLandsOnRestored: labelsOf(mesh).includes("AFTR"),
      gameDay: JSON.parse(durable[GAME_DAY_KEY]),
      board: await page.locator(".title-line h1").innerText(),
      temporaryChip: await page.locator(".temporary-chip").count(),
    },
    { restoredKept: "From Backup", oldLiveWritten: false, editLandsOnRestored: true, gameDay: { resolved: true, workspaceVersion: 11 }, board: "From Backup", temporaryChip: 0 },
  );
  await app.close();
});

test("a restore over unsaved work stays refused while the preservation file could not include what is stored", async () => {
  const workspace = createDefaultWorkspace();
  workspace.playbooks[0].plays[0].name = "ORIGINAL";
  const app = await open({
    workspace,
    init: () => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === "football-os.game-day.v7") throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
        return set.call(this, key, value);
      };
    },
  });
  const page = app.page;
  await menuItem(page, "Game Day Adjust");
  await page.getByRole("button", { name: "Start adjusting", exact: true }).click();
  await page.waitForTimeout(500);
  assert.match(await page.locator(".storage-recovery").innerText(), /could not be saved/);
  await page.evaluate(() => { Storage.prototype.key = function () { throw new DOMException("Enumeration denied", "SecurityError"); }; });
  await page.locator(".playbook-trigger").click();
  await page.getByRole("button", { name: /Backup and export/ }).click();
  await page.locator("input[type=file]").setInputFiles({ name: "b.footballos", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(createWorkspaceBackup(createDefaultWorkspace()))) });
  await page.waitForTimeout(400);
  const bundle = await download(page, () => page.locator(".restore-preview").getByRole("button", { name: /Download preservation file/ }).click());
  assert.equal(bundle.live.gameDay.snapshot.name, "ORIGINAL", "the live-only rescue still holds the original");
  await page.getByRole("button", { name: "Restore this backup" }).click();
  await page.waitForTimeout(500);
  const durable = await readDurable(app.context);
  assert.deepEqual(
    { refused: /not restored/.test(await page.locator(".restore-error").innerText().catch(() => "")), stored: playOf(JSON.parse(durable[WORKSPACE_KEY]), "mesh").name, recoveryWritten: durable["football-os.recovery.v1"] !== undefined },
    { refused: true, stored: "ORIGINAL", recoveryWritten: false },
  );
  await app.close();
});
