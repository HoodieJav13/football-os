import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultWorkspace, createWorkspaceBackup, WORKSPACE_KEY } from "../../src/workspaceData.js";
import { token, useBrowser } from "./harness.mjs";
import { GAME_DAY_KEY, labelsOf, menuItem, playOf, readDurable, RECOVERY_KEY, renamePlayer, settleSave } from "./tabs.mjs";

const open = useBrowser();

/*
 * Gaps found by an independent source review of the preservation work
 * (PR #13 at 0f73f16). Each test drives the real app through the sequence
 * the review described and asserts the exact durable result, read by a fresh
 * page that does not run the app.
 */

const APP = () => process.env.APP_URL;

/** Fault plan installed before the app loads; tests arm it at runtime. */
const faults = () => {
  const set = Storage.prototype.setItem;
  window.__faults = { setItem: () => false, writes: [] };
  Storage.prototype.setItem = function (key, value) {
    if (String(key).startsWith("football-os.")) {
      if (window.__faults.setItem(key, value)) throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      window.__faults.writes.push(key);
    }
    return set.call(this, key, value);
  };
};
const arm = (page, body) => page.evaluate(`window.__faults.setItem = ${body};`);

async function openDataTools(page) {
  await page.locator(".playbook-trigger").click();
  await page.getByRole("button", { name: /Backup and export/ }).click();
  await page.waitForTimeout(300);
}
async function chooseRestoreFile(page, value, name = "backup.footballos") {
  await page.locator("input[type=file]").setInputFiles({ name, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(value)) });
  await page.waitForTimeout(400);
}
async function download(page, click) {
  const waiting = page.waitForEvent("download");
  await click();
  const stream = await (await waiting).createReadStream();
  let text = "";
  for await (const chunk of stream) text += chunk;
  return JSON.parse(text);
}
const leaveAsks = (page) => page.evaluate(() => {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
});
async function renamePlay(page, name) {
  await menuItem(page, "Play details");
  await page.getByLabel("Play name").fill(name);
  await page.getByRole("button", { name: "Save details" }).click();
  await page.waitForTimeout(300);
}
function originalWorkspace() {
  const workspace = createDefaultWorkspace();
  workspace.playbooks[0].plays[0].name = "ORIGINAL";
  return workspace;
}

test("gap 1: a restore while the adjustment could not be saved keeps the live original recoverable", async () => {
  const app = await open({ workspace: originalWorkspace(), init: faults });
  const page = app.page;
  await arm(page, `(key) => key === "football-os.game-day.v7"`);
  await menuItem(page, "Game Day Adjust");
  await page.getByRole("button", { name: "Start adjusting", exact: true }).click();
  await page.waitForTimeout(400);
  await renamePlay(page, "TEMP");
  await settleSave(page);
  assert.match(await page.locator(".storage-recovery").innerText(), /could not be saved/);

  await openDataTools(page);
  await chooseRestoreFile(page, createWorkspaceBackup(createDefaultWorkspace()));
  // First attempt, before any preservation file: refused, nothing written.
  await page.getByRole("button", { name: "Restore this backup" }).click();
  await page.waitForTimeout(500);
  const firstAttempt = await readDurable(app.context);
  const blocked = /not restored/.test(await page.locator(".restore-error").innerText().catch(() => ""))
    && firstAttempt[RECOVERY_KEY] === undefined && playOf(JSON.parse(firstAttempt[WORKSPACE_KEY]), "mesh").name === "ORIGINAL";
  if (blocked) {
    const bundle = await download(page, () => page.locator(".restore-preview").getByRole("button", { name: /Download preservation file/ }).click());
    assert.equal(bundle.live.gameDay.snapshot.name, "ORIGINAL", "the file holds the live original");
    await page.getByRole("button", { name: "Restore this backup" }).click();
    await page.waitForTimeout(500);
  }
  const durable = await readDurable(app.context);
  const recovery = JSON.parse(durable[RECOVERY_KEY] ?? "null");
  assert.deepEqual(
    {
      blockedUntilPreserved: blocked,
      recoveryLiveOriginal: recovery?.liveGameDay?.snapshot?.name ?? null,
      recoveryLiveTemp: recovery ? playOf(recovery.workspace, "mesh").name : null,
      restored: playOf(JSON.parse(durable[WORKSPACE_KEY]), "mesh").name,
    },
    { blockedUntilPreserved: true, recoveryLiveOriginal: "ORIGINAL", recoveryLiveTemp: "TEMP", restored: "Mesh" },
  );
  await app.close();
});

const counting = () => {
  const set = Storage.prototype.setItem;
  window.__writeCount = 0;
  Storage.prototype.setItem = function (key, value) { if (String(key).startsWith("football-os.")) window.__writeCount += 1; return set.call(this, key, value); };
};
async function outsiderWrites(context, key = "football-os.playbooks.v10") {
  const outsider = await context.newPage();
  await outsider.goto(new URL("manifest.webmanifest", APP()).href);
  await outsider.evaluate((k) => localStorage.setItem(k, JSON.stringify({ from: "outside" })), key);
  await outsider.close();
}

for (const kind of ["position label", "route condition", "area preview"]) {
  test(`gap 2: a ${kind} draft in progress when a conflict demotes the editor is preserved exactly, with no writes after it`, async () => {
    const w = createDefaultWorkspace(), p = w.playbooks[0].plays[0];
    const corner = p.defenders.find((d) => d.label === "C");
    p.assignments = p.assignments.filter((a) => a.playerId !== corner.id);
    p.assignments.push({ id: "zone-c", playerId: corner.id, unit: "defense", phase: "post", type: "Zone", points: [[corner.x, corner.y], [-18, 26]], pace: 1, delay: 0, definition: { area: "deep-third", landmark: "", responsibilityArea: { version: 1, shape: "ellipse", center: [-18, 26], radiusX: 6, radiusY: 6, label: "Deep", color: "blue" } } });
    const app = await open({ workspace: w, init: counting });
    const page = app.page;
    await page.waitForTimeout(5200); // past the post-grant reread window
    let expected;
    if (kind === "position label") {
      await token(page, "X").click();
      await page.locator(".position-label-control input").fill("DRFT");
      expected = (d) => d.values?.to === "DRFT";
    } else if (kind === "route condition") {
      await token(page, "Z").click();
      await page.locator(".route-condition textarea").fill("Convert vs press");
      expected = (d) => d.values?.condition === "Convert vs press";
    } else {
      await page.locator(`g.defender[data-player="${corner.id}"]`).click();
      await page.getByRole("button", { name: "Edit area", exact: true }).click();
      const handle = await page.locator('[data-region-handle="center"]').boundingBox();
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
      await page.mouse.down();
      await page.mouse.move(handle.x + handle.width / 2 + 40, handle.y + handle.height / 2, { steps: 6 });
      expected = (d) => d.id === "region" && d.values?.area?.center?.[0] > -18 + 1;
    }
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => window.__writeCount);
    await outsiderWrites(app.context);
    await page.waitForTimeout(800);
    if (kind === "area preview") await page.mouse.up();
    assert.match(await page.locator(".authority-banner").innerText(), /Saving paused/);
    const bundle = await download(page, () => page.locator(".authority-banner").getByRole("button", { name: /Download preservation file/ }).click());
    assert.deepEqual(
      { writesAfterConflict: (await page.evaluate(() => window.__writeCount)) - before, draftKept: bundle.drafts.some(expected) },
      { writesAfterConflict: 0, draftKept: true },
      JSON.stringify(bundle.drafts),
    );
    await app.close();
  });
}

test("gap 2: a draft typed right after taking over blocks the automatic reread; it becomes a conflict instead", async () => {
  const app = await open();
  const page = app.page;
  // Within the post-grant window (the app just acquired the lock on load).
  await token(page, "X").click();
  await page.locator(".position-label-control input").fill("DRFT");
  await outsiderWrites(app.context);
  await page.waitForTimeout(800);
  assert.match(await page.locator(".authority-banner").innerText().catch(() => ""), /Saving paused/);
  await app.close();
});

test("gap 3: a draft typed after a preservation download makes the file stale and keeps the close prompt; an ordinary dirty dialog prompts too", async () => {
  const app = await open();
  const page = app.page;
  await menuItem(page, "Play details");
  await page.getByLabel("Play name").fill("Typed, not saved");
  assert.equal(await leaveAsks(page), true, "an ordinary dirty dialog asks before leaving");
  await page.getByRole("button", { name: /Cancel/ }).click();
  assert.equal(await leaveAsks(page), false, "nothing unfinished: no prompt");

  await page.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException("Full", "QuotaExceededError"); }; });
  await renamePlayer(page, "X", "Q1");
  await settleSave(page);
  await download(page, () => page.locator(".storage-recovery").getByRole("button", { name: "Download preservation file" }).click());
  await page.waitForTimeout(200);
  assert.equal(await leaveAsks(page), false, "the fresh file covers everything");
  await menuItem(page, "Play details");
  await page.getByLabel("Play name").fill("Typed after the file");
  assert.equal(await leaveAsks(page), true, "the new draft is not in the file");
  await app.close();
});

const denyStorage = () => {
  Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("The operation is insecure.", "SecurityError"); } });
};

test("gap 4: storage denied at startup: the app renders, explains, and exports a file marking storage unavailable", async () => {
  const app = await open({ init: denyStorage });
  const page = app.page;
  assert.equal(await page.locator("g.player").count() > 0, true, "the board renders");
  assert.match(await page.locator(".storage-recovery").innerText(), /could not be opened/);
  await openDataTools(page);
  assert.equal(await page.getByRole("dialog").count(), 1, `the data dialog opens (page errors: ${app.errors.join(" | ")})`);
  const bundle = await download(page, () => page.getByRole("button", { name: /Download preservation file/ }).click());
  assert.deepEqual({ live: bundle.live, unavailable: /SecurityError|insecure/.test(bundle.durableUnavailable ?? "") }, { live: null, unavailable: true });
  app.assertNoErrors();
  await app.close();
});

test("gap 4: a read failure after editing pauses saving with a message, and the live export still works", async () => {
  const app = await open();
  const page = app.page;
  await renamePlayer(page, "X", "R1");
  await settleSave(page);
  await page.evaluate(() => { Storage.prototype.getItem = function () { throw new DOMException("Read denied", "SecurityError"); }; });
  await renamePlayer(page, "Z", "R2");
  await settleSave(page);
  assert.match(await page.locator(".storage-recovery").innerText(), /could not be (read|saved)/);
  const bundle = await download(page, () => page.locator(".storage-recovery").getByRole("button", { name: "Download preservation file" }).click());
  assert.deepEqual(
    { live: ["R1", "R2"].map((l) => labelsOf(playOf(bundle.live.workspace, "mesh")).includes(l)), unavailable: Boolean(bundle.durableUnavailable) },
    { live: [true, true], unavailable: true },
  );
  app.assertNoErrors();
  await app.close();
});

test("gap 4: key enumeration failing during export still downloads the live workspace and marks storage unavailable", async () => {
  const app = await open();
  const page = app.page;
  await renamePlayer(page, "X", "K1");
  await settleSave(page);
  await page.evaluate(() => { Storage.prototype.key = function () { throw new DOMException("Enumeration denied", "SecurityError"); }; });
  await openDataTools(page);
  const bundle = await download(page, () => page.getByRole("button", { name: /Download preservation file/ }).click());
  assert.deepEqual(
    { live: labelsOf(playOf(bundle.live.workspace, "mesh")).includes("K1"), unavailable: /Enumeration denied/.test(bundle.durableUnavailable ?? "") },
    { live: true, unavailable: true },
  );
  app.assertNoErrors();
  await app.close();
});

test("gap 5: a stored version held as current workspace plus a legacy adjustment restores through the UI with its adjustment", async () => {
  const stored = createDefaultWorkspace();
  stored.playbooks[0].plays[0].name = "Stored Mesh";
  const snapshot = structuredClone(createDefaultWorkspace().playbooks[0].plays[0]);
  const legacyAdjustment = { playbookId: "personal-active", playId: snapshot.id, snapshot, startedAt: "2026-10-01T10:00:00.000Z" };
  const live = createDefaultWorkspace();
  live.playbooks[0].plays[0].name = "Live Mesh";
  const file = {
    format: "football-os-preservation", formatVersion: 1, createdAt: "2026-10-07T10:00:00.000Z", reason: "conflict",
    live: { workspaceVersion: 11, workspace: live, gameDay: null, location: null }, drafts: [],
    durable: { [WORKSPACE_KEY]: JSON.stringify(stored), "football-os.game-day.v6": JSON.stringify(legacyAdjustment) },
  };
  const app = await open();
  const page = app.page;
  await openDataTools(page);
  await chooseRestoreFile(page, file, "p.footballos");
  await page.getByRole("button", { name: "Restore the stored version instead" }).click();
  await page.waitForTimeout(200);
  assert.match(await page.locator(".restore-preview").innerText(), /game-day adjustment/);
  await page.getByRole("button", { name: "Restore this backup" }).click();
  await page.waitForTimeout(500);
  const durable = await readDurable(app.context);
  const adjustment = JSON.parse(durable[GAME_DAY_KEY]);
  assert.deepEqual(
    { workspace: playOf(JSON.parse(durable[WORKSPACE_KEY]), "mesh").name, adjustment: adjustment.playId, original: adjustment.snapshot?.name },
    { workspace: "Stored Mesh", adjustment: snapshot.id, original: "Mesh" },
  );
  assert.equal(await page.locator(".temporary-chip").count(), 1, "the restored adjustment is live again");
  await app.close();
});

test("gap 6: a restore whose rollback also fails reports the records left changed and keeps the recovery copy", async () => {
  const app = await open({ init: faults });
  const page = app.page;
  await menuItem(page, "Game Day Adjust");
  await page.getByRole("button", { name: "Start adjusting", exact: true }).click();
  await page.waitForTimeout(500);
  const before = await readDurable(app.context);
  // The workspace write fails; so does every game-day write after the first (the rollback).
  await arm(page, `(() => { let gameDayWrites = 0; return (key) => key === "football-os.playbooks.v11" || (key === "football-os.game-day.v7" && ++gameDayWrites > 1); })()`);
  await openDataTools(page);
  const backup = createWorkspaceBackup(createDefaultWorkspace());
  backup.workspace.playbooks[0].plays[0].name = "From Backup"; // differs, so the workspace write really happens
  await chooseRestoreFile(page, backup);
  await page.getByRole("button", { name: "Restore this backup" }).click();
  await page.waitForTimeout(500);
  const message = await page.locator(".restore-error").innerText({ timeout: 3000 }).catch(() => `NO RESTORE ERROR SHOWN; page errors: ${app.errors.join(" | ")}; toast: ${"" }`);
  const after = await readDurable(app.context);
  const recovery = JSON.parse(after[RECOVERY_KEY] ?? "null");
  assert.deepEqual(
    {
      claimsUnchanged: /unchanged/.test(message),
      namesGameDay: message.includes(GAME_DAY_KEY),
      workspaceUntouched: after[WORKSPACE_KEY] === before[WORKSPACE_KEY],
      recoveryKeepsAdjustment: Boolean(recovery && JSON.parse(recovery.gameDay.raw).snapshot),
    },
    { claimsUnchanged: false, namesGameDay: true, workspaceUntouched: true, recoveryKeepsAdjustment: true },
    message,
  );
  assert.match(await page.locator(".storage-recovery").innerText(), /preservation file/);
  await app.close();
});

test("gap 5: a stored version held only under a legacy workspace key restores through the UI, migrated", async () => {
  const { readFileSync } = await import("node:fs");
  const legacy = readFileSync(new URL("../fixtures/workspace-v10.json", import.meta.url), "utf8");
  const file = {
    format: "football-os-preservation", formatVersion: 1, createdAt: "2026-10-07T10:00:00.000Z", reason: "conflict",
    live: { workspaceVersion: 11, workspace: createDefaultWorkspace(), gameDay: null, location: null }, drafts: [],
    durable: { "football-os.playbooks.v10": legacy },
  };
  const app = await open();
  const page = app.page;
  await openDataTools(page);
  await chooseRestoreFile(page, file, "p.footballos");
  await page.getByRole("button", { name: "Restore the stored version instead" }).click();
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "Restore this backup" }).click();
  await page.waitForTimeout(500);
  const saved = JSON.parse((await readDurable(app.context))[WORKSPACE_KEY]);
  assert.deepEqual([saved.version, playOf(saved, "mesh").name], [11, "Saved custom v10"]);
  assert.match(await page.locator(".title-line h1").innerText(), /Saved custom v10/);
  await app.close();
});

test("gap 5: identical workspaces with different adjustments are offered as two versions; the stored adjustment restores", async () => {
  const workspace = createDefaultWorkspace();
  const snapshot = structuredClone(workspace.playbooks[0].plays[0]);
  const storedAdjustment = { playbookId: "personal-active", playId: snapshot.id, snapshot, startedAt: "2026-10-01T10:00:00.000Z", workspaceVersion: 11 };
  const file = {
    format: "football-os-preservation", formatVersion: 1, createdAt: "2026-10-07T10:00:00.000Z", reason: "conflict",
    live: { workspaceVersion: 11, workspace, gameDay: null, location: null }, drafts: [],
    durable: { [WORKSPACE_KEY]: JSON.stringify(workspace), [GAME_DAY_KEY]: JSON.stringify(storedAdjustment) },
  };
  const app = await open();
  const page = app.page;
  await openDataTools(page);
  await chooseRestoreFile(page, file, "p.footballos");
  await page.getByRole("button", { name: "Restore the stored version instead" }).click();
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "Restore this backup" }).click();
  await page.waitForTimeout(500);
  const adjustment = JSON.parse((await readDurable(app.context))[GAME_DAY_KEY]);
  assert.deepEqual([adjustment.playId, adjustment.startedAt], [snapshot.id, "2026-10-01T10:00:00.000Z"]);
  assert.equal(await page.locator(".temporary-chip").count(), 1);
  await app.close();
});
