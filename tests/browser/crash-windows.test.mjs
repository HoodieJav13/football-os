import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultWorkspace, createWorkspaceBackup, WORKSPACE_KEY } from "../../src/workspaceData.js";
import { useBrowser } from "./harness.mjs";
import { GAME_DAY_KEY, labelsOf, menuItem, playOf, readDurable, renamePlayer, settleSave } from "./tabs.mjs";

const open = useBrowser();

/*
 * Crash windows of multi-key saves. Concurrency protection (one editor) does
 * not make two localStorage writes atomic: a tab that dies between them leaves
 * the first written and not the second. Each test arms a fault injector that
 * lets the next N Football OS writes through and silently drops every later
 * one -- the storage a restarted browser would find had the tab died right
 * after write N -- then reads the result from a fresh page.
 *
 * Tests marked `todo` assert the all-or-nothing outcome that needs the redo
 * journal (src/journalPrototype.js, docs/multi-tab/crash-atomicity.md). They
 * run and report, but do not fail the suite, until that persistence change is
 * approved and activated.
 */

const injector = () => {
  const set = Storage.prototype.setItem, remove = Storage.prototype.removeItem;
  window.__crash = null;
  const allow = (key) => {
    if (!String(key).startsWith("football-os.") || window.__crash === null) return true;
    if (window.__crash.remaining > 0) { window.__crash.remaining -= 1; window.__crash.written.push(key); return true; }
    window.__crash.dropped.push(key);
    return false;
  };
  Storage.prototype.setItem = function (key, value) { if (allow(key)) set.call(this, key, value); };
  Storage.prototype.removeItem = function (key) { if (allow(key)) remove.call(this, key); };
};
const arm = (page, remaining) => page.evaluate((n) => { window.__crash = { remaining: n, written: [], dropped: [] }; }, remaining);
const crashLog = (page) => page.evaluate(() => window.__crash);

async function adjustedPlay(page) {
  await menuItem(page, "Game Day Adjust");
  await page.getByRole("button", { name: "Start adjusting", exact: true }).click();
  await page.waitForTimeout(300);
  await renamePlayer(page, "X", "GD");
  await settleSave(page);
}

async function discardThenDie(page) {
  await adjustedPlay(page);
  await arm(page, 1);
  await menuItem(page, "Resolve adjustment");
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await page.waitForTimeout(1200);
  const log = await crashLog(page);
  await page.close();
  return log;
}

function gameDayState(durable) {
  const record = JSON.parse(durable[GAME_DAY_KEY]);
  return record.resolved ? { active: false } : { active: true, snapshotHasX: labelsOf(record.snapshot).includes("X") };
}

test("a tab that dies right after the first write of a game-day Discard never loses the original play", async () => {
  const app = await open({ init: injector });
  const log = await discardThenDie(app.page);
  const durable = await readDurable(app.context);
  const mesh = playOf(JSON.parse(durable[WORKSPACE_KEY]), "mesh");
  // Workspace first: the restored original is what landed; the adjustment
  // record still holds the original too. The old order wrote "resolved"
  // first and the workspace 400 ms later, so the temporary version became
  // the only copy.
  assert.deepEqual(
    { firstWrite: log.written, workspaceHasX: labelsOf(mesh).includes("X"), workspaceHasGD: labelsOf(mesh).includes("GD"), gameDay: gameDayState(durable) },
    { firstWrite: [WORKSPACE_KEY], workspaceHasX: true, workspaceHasGD: false, gameDay: { active: true, snapshotHasX: true } },
  );
  await app.close();
});

test("a tab that dies right after the first write of a game-day Discard leaves the resolution complete", { todo: "needs the redo journal (owner approval pending)" }, async () => {
  const app = await open({ init: injector });
  await discardThenDie(app.page);
  const durable = await readDurable(app.context);
  const mesh = playOf(JSON.parse(durable[WORKSPACE_KEY]), "mesh");
  assert.deepEqual({ workspaceHasX: labelsOf(mesh).includes("X"), gameDay: gameDayState(durable) }, { workspaceHasX: true, gameDay: { active: false } });
  await app.close();
});

test("a tab that dies after two writes of a restore during an adjustment leaves the restore complete", { todo: "needs the redo journal (owner approval pending)" }, async () => {
  const app = await open({ init: injector });
  const page = app.page;
  await adjustedPlay(page);
  const backup = createWorkspaceBackup(createDefaultWorkspace());
  backup.workspace.playbooks[0].plays[0].name = "From Backup";
  await page.locator(".playbook-trigger").click();
  await page.getByRole("button", { name: /Backup and export/ }).click();
  await page.locator("input[type=file]").setInputFiles({ name: "b.footballos", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
  await page.waitForTimeout(300);
  await arm(page, 2);
  await page.getByRole("button", { name: "Restore this backup" }).click();
  await page.waitForTimeout(1200);
  await page.close();
  const durable = await readDurable(app.context);
  assert.deepEqual(
    { workspace: playOf(JSON.parse(durable[WORKSPACE_KEY]), "mesh").name, gameDay: gameDayState(durable) },
    { workspace: "From Backup", gameDay: { active: false } },
  );
  await app.close();
});
