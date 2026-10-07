import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultWorkspace, createWorkspaceBackup, WORKSPACE_KEY } from "../../src/workspaceData.js";
import { token, useBrowser } from "./harness.mjs";
import {
  bookOf, durableWorkspace, GAME_DAY_KEY, hideAndClose, labelsOf, menuItem, openTab, playOf, readDurable,
  RECOVERY_KEY, renamePlayer, settleSave,
} from "./tabs.mjs";

const open = useBrowser();

/*
 * One editor per workspace, verified with genuine same-origin pages sharing
 * one browser context. Every durable result is read by a fresh third page
 * that does not run the app (tabs.mjs readDurable).
 *
 * The rehearsal's D3 showed two tabs silently overwriting each other: each
 * wrote its whole in-memory copy on a debounce and again on hide/close, so the
 * last tab to hide won.
 */

const viewOnly = (page) => page.locator(".authority-chip").count().then((n) => n > 0);
const banner = (page) => page.locator(".authority-banner").innerText().catch(() => "");
const editHere = (page) => page.locator(".topbar").getByRole("button", { name: "Edit here" }).click();
async function becomesEditor(page, timeout = 6000) {
  await page.waitForFunction(() => !document.querySelector(".authority-chip"), null, { timeout });
  await page.waitForTimeout(250);
}
async function becomesViewer(page, timeout = 6000) {
  await page.waitForFunction(() => Boolean(document.querySelector(".authority-chip")), null, { timeout });
}
/*
 * Suspends a tab's script execution entirely (no timers, no messages, no
 * lock callbacks) while it stays alive and keeps its locks -- what iPadOS does
 * to a backgrounded tab. CDP's Page.setWebLifecycleState "frozen" was tried
 * first and measured to be ignored for visible headless pages (timers kept
 * ticking), so it would have proved nothing.
 */
async function suspend(context, page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Debugger.enable");
  await cdp.send("Debugger.pause");
  page.evaluate(() => 1).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 200));
  return { resume: () => cdp.send("Debugger.resume") };
}
const blockStorageEvents = () => {
  const add = window.addEventListener;
  window.addEventListener = function (type, ...rest) { if (type === "storage") return; return add.call(this, type, ...rest); };
};
const dropBroadcasts = () => {
  window.BroadcastChannel = class { constructor() { this.onmessage = null; } postMessage() {} close() {} addEventListener() {} removeEventListener() {} };
};
async function chooseRestoreFile(page, backup, name = "backup.footballos") {
  await page.locator('input[type=file]').setInputFiles({ name, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
  await page.waitForTimeout(300);
}
async function openDataTools(page) {
  await page.locator(".playbook-trigger").click();
  await page.getByRole("button", { name: /Backup and export/ }).click();
  await page.waitForTimeout(300);
}
async function startAdjustment(page) {
  await menuItem(page, "Game Day Adjust");
  await page.getByRole("button", { name: "Start adjusting", exact: true }).click();
  await page.waitForTimeout(300);
}

test("a stale second tab can neither edit nor overwrite the editor's saved change on hide/close", async () => {
  const app = await open();
  const second = await openTab(app.context);
  const a = app.page, b = second.page;

  await renamePlayer(a, "X", "T1");
  await settleSave(a);

  // The second tab loaded before that edit. It must be view-only: its
  // inspector cannot change the label.
  await b.bringToFront();
  await renamePlayer(b, "Z", "T2").catch(() => {});
  await hideAndClose(b);

  const saved = playOf(await durableWorkspace(app.context), "mesh");
  assert.deepEqual(
    { x: labelsOf(saved).includes("T1"), z: labelsOf(saved).includes("T2") },
    { x: true, z: false },
    "the editor's T1 survives and the view-only tab wrote nothing",
  );
  assert.equal(await viewOnly(a), false, "the editor shows no view-only chip");
  app.assertNoErrors();
  second.assertNoErrors();
  await app.close();
});

test("simultaneous startup: exactly one tab edits, the other is view-only and writes nothing", async () => {
  for (let round = 0; round < 4; round += 1) {
    const app = await open({ settle: 0 });
    const pages = [app.page, await app.context.newPage()];
    await Promise.all([pages[0].reload({ waitUntil: "networkidle" }), pages[1].goto(process.env.APP_URL, { waitUntil: "networkidle" })]);
    await pages[0].waitForTimeout(1200);
    const roles = await Promise.all(pages.map(viewOnly));
    assert.deepEqual(roles.slice().sort(), [false, true], `round ${round}: one editor, one viewer`);
    const editor = pages[roles.indexOf(false)], viewer = pages[roles.indexOf(true)];
    assert.equal(await viewer.locator(".position-label-control input").count(), 0, "the viewer has no label editor");
    await token(viewer, "Z").click();
    await viewer.keyboard.press("ArrowRight");
    await renamePlayer(editor, "X", `R${round}`);
    await settleSave(editor);
    await hideAndClose(viewer);
    const saved = playOf(await durableWorkspace(app.context), "mesh");
    const z = saved.players.find((p) => p.label === "Z");
    const original = playOf(createDefaultWorkspace(), "mesh").players.find((p) => p.label === "Z");
    assert.deepEqual({ x: labelsOf(saved).includes(`R${round}`), zx: z.x }, { x: true, zx: original.x });
    await app.close();
  }
});

test("stale edits across plays and books: navigation in a view-only tab publishes nothing, and its edits after taking over start from the reread base", async () => {
  const app = await open();
  const second = await openTab(app.context, { init: blockStorageEvents });
  const a = app.page, b = second.page;

  // B browses while view-only: another play, then a reference book.
  await b.keyboard.press("]");
  await b.locator(".playbook-trigger").click();
  await b.getByRole("menuitem", { name: /Air Raid Reference/ }).click();
  await b.waitForTimeout(300);
  await b.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  assert.equal((await durableWorkspace(app.context))?.activePlaybookId ?? "personal-active", "personal-active", "view-only navigation is not written");

  await renamePlayer(a, "X", "A1");
  await settleSave(a);

  await editHere(b);
  await becomesEditor(b);
  await becomesViewer(a);
  // B never received a storage event; what it edits must still include A1.
  await b.locator(".playbook-trigger").click();
  await b.getByRole("menuitem", { name: /Personal Active/ }).click();
  await b.waitForTimeout(400);
  assert.ok((await b.locator(".player-label").allTextContents()).includes("A1"), "B reread durable state on taking over");
  await b.keyboard.press("]");
  await b.waitForTimeout(300);
  await renamePlayer(b, "Z", "B1");
  await settleSave(b);
  await hideAndClose(a);

  const saved = await durableWorkspace(app.context);
  const mesh = playOf(saved, "mesh"), second2 = bookOf(saved).plays[1];
  assert.deepEqual(
    { a1: labelsOf(mesh).includes("A1"), b1: labelsOf(second2).includes("B1"), meshZ: labelsOf(mesh).includes("Z") },
    { a1: true, b1: true, meshZ: true },
  );
  second.assertNoErrors();
  await app.close();
});

test("a dirty dialog holds the handover until it is saved; the saved values are what the next editor gets", async () => {
  const app = await open();
  const second = await openTab(app.context);
  const a = app.page, b = second.page;

  await menuItem(a, "Play details");
  await a.getByLabel("Play name").fill("Typed In A");
  await editHere(b);
  await b.waitForTimeout(3000);
  assert.equal(await viewOnly(a), false, "A keeps editing while its dialog is dirty");
  assert.match(await banner(b), /Waiting for the editing tab[\s\S]*Play details/);
  assert.match(await a.locator(".handover-notice").innerText(), /Another tab is waiting to edit/);
  assert.equal(playOf(await durableWorkspace(app.context), "mesh").name, "Mesh", "nothing typed is saved before the coach saves it");

  await a.getByRole("button", { name: "Save details" }).click();
  await becomesEditor(b);
  await becomesViewer(a);
  assert.equal(playOf(await durableWorkspace(app.context), "mesh").name, "Typed In A");
  assert.equal(await b.locator(".title-line h1").innerText(), "Typed In A", "the receiver shows what A saved");
  await app.close();
});

test("cancelling the dirty dialog hands over without saving what was typed", async () => {
  const app = await open();
  const second = await openTab(app.context);
  const a = app.page, b = second.page;
  await menuItem(a, "Play details");
  await a.getByLabel("Play name").fill("Never Saved");
  await editHere(b);
  await b.waitForTimeout(1500);
  assert.equal(await viewOnly(a), false);
  await a.getByRole("button", { name: /Cancel/ }).click();
  await becomesEditor(b);
  assert.equal(playOf(await durableWorkspace(app.context), "mesh").name, "Mesh");
  await app.close();
});

test("a drag in progress holds the handover; releasing it saves the drop and then hands over", async () => {
  const app = await open();
  const second = await openTab(app.context);
  const a = app.page, b = second.page;
  const original = playOf(createDefaultWorkspace(), "mesh").players.find((p) => p.label === "X");
  const box = await token(a, "X").boundingBox();
  await a.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await a.mouse.down();
  await a.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 4, { steps: 8 });
  await editHere(b);
  await b.waitForTimeout(2500);
  assert.equal(await viewOnly(a), false, "the drag keeps A editing");
  assert.match(await banner(b), /dragging a player/);
  await a.mouse.up();
  await becomesEditor(b);
  const dropped = playOf(await durableWorkspace(app.context), "mesh").players.find((p) => p.id === original.id);
  assert.ok(dropped.x > original.x + 2, `the drop was saved (x ${original.x} -> ${dropped.x})`);
  await app.close();
});

test("a responsibility-area drag preview holds the handover and is committed on release, not discarded", async () => {
  const w = createDefaultWorkspace(), p = w.playbooks[0].plays[0];
  const corner = p.defenders.find((d) => d.label === "C");
  p.assignments = p.assignments.filter((a) => a.playerId !== corner.id);
  p.assignments.push({ id: "zone-c", playerId: corner.id, unit: "defense", phase: "post", type: "Zone", points: [[corner.x, corner.y], [-18, 26]], pace: 1, delay: 0, definition: { area: "deep-third", landmark: "", responsibilityArea: { version: 1, shape: "ellipse", center: [-18, 26], radiusX: 6, radiusY: 6, label: "Deep", color: "blue" } } });
  const app = await open({ workspace: w });
  const second = await openTab(app.context);
  const a = app.page, b = second.page;
  await a.locator(`g.defender[data-player="${corner.id}"]`).click();
  await a.getByRole("button", { name: "Edit area", exact: true }).click();
  const handle = await a.locator('[data-region-handle="center"]').boundingBox();
  await a.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await a.mouse.down();
  await a.mouse.move(handle.x + handle.width / 2 + 40, handle.y + handle.height / 2, { steps: 6 });
  await editHere(b);
  await b.waitForTimeout(2500);
  assert.equal(await viewOnly(a), false);
  assert.match(await banner(b), /moving a responsibility area/);
  await a.mouse.up();
  await becomesEditor(b);
  const area = playOf(await durableWorkspace(app.context), "mesh").assignments.find((x) => x.id === "zone-c").definition.responsibilityArea;
  assert.ok(area.center[0] > -18 + 1, `the previewed move was committed (${area.center[0]})`);
  await app.close();
});

test("revoked callbacks cannot write: hide, close, keys and a suspend/resume of the former editor leave the new editor's data alone", async () => {
  const app = await open();
  const second = await openTab(app.context);
  const a = app.page, b = second.page;
  await renamePlayer(a, "X", "P1");
  await editHere(b);           // A has an unsaved debounce pending; handover saves it first
  await becomesEditor(b);
  await becomesViewer(a);
  await renamePlayer(b, "Z", "P2");
  await settleSave(b);
  const afterB = (await readDurable(app.context))[WORKSPACE_KEY];

  await token(a, "Y").click();
  await a.keyboard.press("ArrowRight");
  await a.keyboard.press("Delete");
  await a.evaluate(() => { document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false })); });
  // Suspend the former editor with its hide listeners and timers queued,
  // let B write, then let A's queued callbacks run.
  await a.evaluate(() => { setTimeout(() => document.dispatchEvent(new Event("visibilitychange")), 50); });
  const suspended = await suspend(app.context, a);
  await renamePlayer(b, "Y", "P3");
  await settleSave(b);
  await suspended.resume();
  await a.waitForTimeout(1500);
  await hideAndClose(a);

  const saved = playOf(await durableWorkspace(app.context), "mesh");
  assert.deepEqual(["P1", "P2", "P3"].map((label) => labelsOf(saved).includes(label)), [true, true, true]);
  assert.notEqual((await readDurable(app.context))[WORKSPACE_KEY], afterB, "only B's later edit changed storage");
  await app.close();
});

test("a suspended editor keeps ownership with no timeout; on resume it hands over", async () => {
  const app = await open();
  const second = await openTab(app.context);
  const a = app.page, b = second.page;
  await renamePlayer(a, "X", "F1");      // still in the debounce when A is suspended
  const suspended = await suspend(app.context, a);
  await editHere(b);
  await b.waitForTimeout(5000);
  assert.equal(await viewOnly(b), true, "B still waits after 5 s");
  assert.match(await banner(b), /Waiting for the editing tab/);
  assert.equal(labelsOf(playOf(await durableWorkspace(app.context), "mesh")).includes("F1"), false, "nothing was taken from the suspended tab");
  await suspended.resume();
  await becomesEditor(b);
  await becomesViewer(a);
  await renamePlayer(b, "Z", "F2");
  await settleSave(b);
  const saved = playOf(await durableWorkspace(app.context), "mesh");
  assert.deepEqual(["F1", "F2"].map((l) => labelsOf(saved).includes(l)), [true, true]);
  await app.close();
});

test("a terminated editor releases the lock: the waiting tab takes over from what was durably saved", async () => {
  const app = await open();
  const second = await openTab(app.context, { init: blockStorageEvents });
  const a = app.page, b = second.page;
  await renamePlayer(a, "X", "K1");
  await settleSave(a);
  await menuItem(a, "Play details");
  await a.getByLabel("Play name").fill("Lost With The Tab");
  await editHere(b);
  await b.waitForTimeout(1500);
  assert.equal(await viewOnly(b), true);
  // Kill A without letting it run pagehide: pause its JS, then close it.
  const cdp = await app.context.newCDPSession(a);
  await cdp.send("Debugger.enable");
  await cdp.send("Debugger.pause");
  a.evaluate(() => 1).catch(() => {});
  await b.waitForTimeout(200);
  await a.close({ runBeforeUnload: false });
  await becomesEditor(b);
  assert.ok((await b.locator(".player-label").allTextContents()).includes("K1"), "B reread the durable state");
  await renamePlayer(b, "Z", "K2");
  await settleSave(b);
  const saved = playOf(await durableWorkspace(app.context), "mesh");
  assert.deepEqual({ k1: labelsOf(saved).includes("K1"), k2: labelsOf(saved).includes("K2"), name: saved.name }, { k1: true, k2: true, name: "Mesh" });
  await app.context.close();
});

test("after the editor closes, a view-only tab sees nobody editing; Edit here acquires and rereads before editing", async () => {
  const app = await open();
  const second = await openTab(app.context, { init: blockStorageEvents });
  const a = app.page, b = second.page;
  await renamePlayer(a, "X", "C1");    // left to the close flush, not the debounce
  await a.close();
  await b.waitForFunction(() => /No tab is editing/.test(document.querySelector(".authority-banner")?.innerText ?? ""), null, { timeout: 5000 });
  assert.equal(await viewOnly(b), true, "it does not take over by itself");
  assert.equal((await b.locator(".player-label").allTextContents()).includes("C1"), false, "B's view is stale (storage events blocked)");
  await editHere(b);
  await becomesEditor(b);
  assert.ok((await b.locator(".player-label").allTextContents()).includes("C1"), "B reread before editing");
  await renamePlayer(b, "Z", "C2");
  await settleSave(b);
  const saved = playOf(await durableWorkspace(app.context), "mesh");
  assert.deepEqual(["C1", "C2"].map((l) => labelsOf(saved).includes(l)), [true, true]);
  await app.context.close();
});

test("missing notifications: with BroadcastChannel silenced in both tabs the handover still happens", async () => {
  const app = await open({ init: dropBroadcasts });
  const second = await openTab(app.context, { init: dropBroadcasts });
  const a = app.page, b = second.page;
  await renamePlayer(a, "X", "N1");
  await editHere(b);
  await becomesEditor(b, 5000);
  await becomesViewer(a, 5000);
  assert.ok((await b.locator(".player-label").allTextContents()).includes("N1"));
  await app.close();
});

test("a quota failure keeps the editor in charge and offers a preservation file with the game-day original; it hands over once saving works", async () => {
  const app = await open();
  const second = await openTab(app.context);
  const a = app.page, b = second.page;
  await startAdjustment(a);
  await renamePlayer(a, "X", "GD");
  await settleSave(a);
  await a.evaluate(() => {
    window.__setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function () { throw new DOMException("Full", "QuotaExceededError"); };
  });
  await renamePlayer(a, "Z", "GQ");
  await settleSave(a);
  assert.match(await a.locator(".storage-recovery").innerText(), /Changes could not be saved/);
  await editHere(b);
  await b.waitForTimeout(2500);
  assert.equal(await viewOnly(a), false, "A keeps the lock while its changes are unsaved");
  assert.match(await banner(b), /could not save/i);

  const download = a.waitForEvent("download");
  await a.locator(".storage-recovery").getByRole("button", { name: "Download preservation file" }).click();
  const bundle = JSON.parse(await (await download).createReadStream().then(async (stream) => { let text = ""; for await (const chunk of stream) text += chunk; return text; }));
  const live = playOf(bundle.live.workspace, "mesh"), original = bundle.live.gameDay.snapshot, stored = playOf(JSON.parse(bundle.durable[WORKSPACE_KEY]), "mesh");
  assert.deepEqual(
    { live: ["GD", "GQ"].map((l) => labelsOf(live).includes(l)), original: labelsOf(original).includes("X"), stored: labelsOf(stored).includes("GQ"), gameDayKey: Boolean(bundle.durable[GAME_DAY_KEY]) },
    { live: [true, true], original: true, stored: false, gameDayKey: true },
  );

  await a.evaluate(() => { Storage.prototype.setItem = window.__setItem; });
  await becomesEditor(b, 6000);
  const saved = await durableWorkspace(app.context);
  assert.deepEqual(["GD", "GQ"].map((l) => labelsOf(playOf(saved, "mesh")).includes(l)), [true, true]);
  assert.ok(JSON.parse((await readDurable(app.context))[GAME_DAY_KEY]).snapshot, "the adjustment and its original went across");
  assert.equal(await b.locator(".temporary-chip").count(), 1);
  await app.close();
});

for (const resolution of ["discard", "replace", "variation", "new"]) {
  test(`an active game-day adjustment moves to the next editor, which resolves it with ${resolution}`, async () => {
    const app = await open();
    const second = await openTab(app.context);
    const a = app.page, b = second.page;
    await startAdjustment(a);
    await renamePlayer(a, "X", "GD");
    await editHere(b);
    await becomesEditor(b);
    await becomesViewer(a);
    assert.equal(await b.locator(".temporary-chip").count(), 1, "the adjustment is still temporary in B");
    assert.ok((await b.locator(".player-label").allTextContents()).includes("GD"));
    await menuItem(b, "Resolve adjustment");
    await b.locator(`[data-resolution="${resolution}"]`).click();
    await b.waitForTimeout(500);
    await hideAndClose(a);

    const durable = await readDurable(app.context);
    const saved = JSON.parse(durable[WORKSPACE_KEY]);
    const plays = bookOf(saved).plays;
    const mesh = playOf(saved, "mesh");
    const extra = plays.filter((play) => !createDefaultWorkspace().playbooks[0].plays.some((seed) => seed.id === play.id));
    assert.deepEqual(JSON.parse(durable[GAME_DAY_KEY]), { resolved: true, workspaceVersion: 11 });
    const outcome = { meshHasGD: labelsOf(mesh).includes("GD"), extra: extra.map((play) => ({ name: play.name, gd: labelsOf(play).includes("GD"), variantOf: play.variantOf ?? null })) };
    const expected = {
      discard: { meshHasGD: false, extra: [] },
      replace: { meshHasGD: true, extra: [] },
      variation: { meshHasGD: false, extra: [{ name: "Mesh Variation", gd: true, variantOf: "mesh" }] },
      new: { meshHasGD: false, extra: [{ name: "Mesh New", gd: true, variantOf: null }] },
    }[resolution];
    assert.deepEqual(outcome, expected);
    second.assertNoErrors();
    await app.close();
  });
}

test("a stale restore dialog in a view-only tab cannot restore; after taking over it restores over the reread workspace", async () => {
  const app = await open();
  const second = await openTab(app.context, { init: blockStorageEvents });
  const a = app.page, b = second.page;
  const backup = createWorkspaceBackup(createDefaultWorkspace());
  backup.workspace.playbooks[0].plays[0].name = "From Backup";
  await openDataTools(b);
  await chooseRestoreFile(b, backup);
  assert.equal(await b.getByRole("button", { name: "Restore this backup" }).isDisabled(), true);
  assert.match(await b.locator(".restore-preview").innerText(), /View only: choose Edit here/);

  await renamePlayer(a, "X", "S1");
  await settleSave(a);
  // The view-only tab cannot reach the banner past its dialog, so it closes
  // the dialog (discarding the chosen file explicitly) and asks to edit.
  await b.getByRole("button", { name: "Close" }).click();
  await editHere(b);
  await becomesEditor(b);
  await openDataTools(b);
  await chooseRestoreFile(b, backup);
  await b.getByRole("button", { name: "Restore this backup" }).click();
  await b.waitForTimeout(600);

  const durable = await readDurable(app.context);
  const recovery = JSON.parse(durable[RECOVERY_KEY]);
  assert.deepEqual(
    { restored: playOf(JSON.parse(durable[WORKSPACE_KEY]), "mesh").name, recoveryHasS1: labelsOf(playOf(recovery.workspace, "mesh")).includes("S1") },
    { restored: "From Backup", recoveryHasS1: true },
    "the recovery copy is the reread workspace, including A's last edit",
  );
  await app.close();
});

test("a confirmed recovery copy that changed out of band is not replaced", async () => {
  const app = await open();
  const a = app.page;
  const first = createWorkspaceBackup(createDefaultWorkspace());
  first.workspace.playbooks[0].plays[0].name = "First Restore";
  await openDataTools(a);
  await chooseRestoreFile(a, first);
  await a.getByRole("button", { name: "Restore this backup" }).click();
  await a.waitForTimeout(500);
  const before = await readDurable(app.context);

  await openDataTools(a);
  await chooseRestoreFile(a, createWorkspaceBackup(createDefaultWorkspace()));
  assert.equal(await a.getByRole("button", { name: "Restore this backup" }).isDisabled(), true, "replacing the recovery copy needs confirmation");
  await a.getByLabel("Replace the earlier recovery copy").check();
  // Another writer (an older app version, say) replaces the recovery copy now.
  const outsider = await app.context.newPage();
  await outsider.goto(new URL("manifest.webmanifest", process.env.APP_URL).href);
  await outsider.evaluate((key) => localStorage.setItem(key, JSON.stringify({ createdAt: "outside", workspace: null })), RECOVERY_KEY);
  await outsider.close();
  await a.getByRole("button", { name: "Restore this backup" }).click();
  await a.waitForTimeout(500);
  assert.match(await a.locator(".restore-error").innerText(), /not restored/);
  const after = await readDurable(app.context);
  assert.deepEqual(
    { workspace: after[WORKSPACE_KEY] === before[WORKSPACE_KEY], recovery: JSON.parse(after[RECOVERY_KEY]).createdAt },
    { workspace: true, recovery: "outside" },
  );
  await app.close();
});

test("a stale damaged-adjustment recovery in a view-only tab is disabled and disappears once the editor recovers it", async () => {
  const storage = { [GAME_DAY_KEY]: "{damaged" };
  const app = await open({ storage });
  const second = await openTab(app.context);
  const a = app.page, b = second.page;
  await openDataTools(b);
  assert.equal(await b.getByRole("button", { name: "Preserve and reset adjustment" }).isDisabled(), true);
  await openDataTools(a);
  await a.getByRole("button", { name: "Preserve and reset adjustment" }).click();
  await a.waitForTimeout(500);
  await b.waitForTimeout(500);
  assert.equal(await b.getByRole("button", { name: "Preserve and reset adjustment" }).count(), 0, "B followed the recovery");
  const durable = await readDurable(app.context);
  assert.deepEqual({ marker: JSON.parse(durable[GAME_DAY_KEY]).resolved, raw: JSON.parse(durable["football-os.game-day-recovery.v1"]).raw }, { marker: true, raw: "{damaged" });
  await app.close();
});

test("repeated restore never silently replaces the only recovery copy; confirmation survives navigation and leaves no play-local undo", async () => {
  const app = await open();
  const a = app.page;
  await renamePlayer(a, "X", "ORIG");
  await settleSave(a);
  const first = createWorkspaceBackup(createDefaultWorkspace());
  first.workspace.playbooks[0].plays[0].name = "First Restore";
  await openDataTools(a);
  await chooseRestoreFile(a, first);
  await a.getByRole("button", { name: "Restore this backup" }).click();
  await a.waitForTimeout(300);
  assert.match(await a.locator(".toast").innerText(), /Backup restored/);
  await a.keyboard.press("]");
  await a.waitForTimeout(300);
  assert.match(await a.locator(".toast").innerText(), /Backup restored/, "the confirmation survives play navigation");
  await a.keyboard.press("[");
  assert.equal(await a.getByRole("button", { name: "Undo", exact: true }).isDisabled(), true, "nothing from before the restore is undoable");
  await a.keyboard.press("Control+z");
  await a.waitForTimeout(300);
  assert.equal(await a.locator(".title-line h1").innerText(), "First Restore");

  const second = createWorkspaceBackup(createDefaultWorkspace());
  second.workspace.playbooks[0].plays[0].name = "Second Restore";
  await openDataTools(a);
  await chooseRestoreFile(a, second);
  assert.equal(await a.getByRole("button", { name: "Restore this backup" }).isDisabled(), true);
  const kept = a.waitForEvent("download");
  await a.getByRole("button", { name: "Download earlier copy" }).click();
  const keptText = await (await kept).createReadStream().then(async (stream) => { let t = ""; for await (const c of stream) t += c; return t; });
  assert.ok(labelsOf(playOf(JSON.parse(keptText).live.workspace, "mesh")).includes("ORIG"), "the earlier copy can be kept first");
  await a.getByLabel("Replace the earlier recovery copy").check();
  await a.getByRole("button", { name: "Restore this backup" }).click();
  await a.waitForTimeout(500);
  const durable = await readDurable(app.context);
  assert.deepEqual(
    { now: playOf(JSON.parse(durable[WORKSPACE_KEY]), "mesh").name, recovery: playOf(JSON.parse(durable[RECOVERY_KEY]).workspace, "mesh").name },
    { now: "Second Restore", recovery: "First Restore" },
  );
  app.assertNoErrors();
  await app.close();
});

test("restoring during an active adjustment keeps the adjusted play's original in the recovery copy", async () => {
  const app = await open();
  const a = app.page;
  await startAdjustment(a);
  await renamePlayer(a, "X", "GD");
  await settleSave(a);
  await openDataTools(a);
  await chooseRestoreFile(a, createWorkspaceBackup(createDefaultWorkspace()));
  await a.getByRole("button", { name: "Restore this backup" }).click();
  await a.waitForTimeout(500);
  const durable = await readDurable(app.context);
  const recovery = JSON.parse(durable[RECOVERY_KEY]);
  const original = JSON.parse(recovery.gameDay.raw).snapshot;
  assert.deepEqual(
    { originalHasX: labelsOf(original).includes("X"), recoveredTemp: labelsOf(playOf(recovery.workspace, "mesh")).includes("GD"), marker: JSON.parse(durable[GAME_DAY_KEY]).resolved },
    { originalHasX: true, recoveredTemp: true, marker: true },
  );
  await app.close();
});

test("an out-of-band write (an older app version) pauses saving, overwrites nothing, and is resolved only after preserving both versions", async () => {
  for (const choice of ["Keep this tab's version", "Load saved version"]) {
    const app = await open();
    const a = app.page;
    await renamePlayer(a, "X", "MINE");
    await settleSave(a);
    const foreign = createDefaultWorkspace();
    foreign.playbooks[0].plays[0].name = "Written Elsewhere";
    const outsider = await app.context.newPage();
    await outsider.goto(new URL("manifest.webmanifest", process.env.APP_URL).href);
    await outsider.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: WORKSPACE_KEY, value: JSON.stringify(foreign) });
    await outsider.close();
    await a.waitForTimeout(600);
    assert.match(await banner(a), /Saving paused/);
    assert.equal(await a.locator(".position-label-control input").count(), 0, "editing is paused too, so the branches stop diverging");
    assert.equal(playOf(await durableWorkspace(app.context), "mesh").name, "Written Elsewhere", "nothing was overwritten");
    assert.equal(await a.getByRole("button", { name: choice }).isDisabled(), true, "choosing needs a preservation file first");
    const download = a.waitForEvent("download");
    await a.getByRole("button", { name: "Download preservation file" }).click();
    const text = await (await download).createReadStream().then(async (stream) => { let t = ""; for await (const c of stream) t += c; return t; });
    const bundle = JSON.parse(text);
    assert.deepEqual(
      { live: labelsOf(playOf(bundle.live.workspace, "mesh")).includes("MINE"), stored: playOf(JSON.parse(bundle.durable[WORKSPACE_KEY]), "mesh").name },
      { live: true, stored: "Written Elsewhere" },
    );
    await a.getByRole("button", { name: choice }).click();
    await a.waitForTimeout(700);
    const saved = playOf(await durableWorkspace(app.context), "mesh");
    assert.deepEqual(
      { name: saved.name, mine: labelsOf(saved).includes("MINE") },
      choice === "Keep this tab's version" ? { name: "Mesh", mine: true } : { name: "Written Elsewhere", mine: false },
    );
    assert.equal(await a.locator(".authority-banner").count(), 0, "saving resumed");
    await app.close();
  }
});

test("without Web Locks the app fails closed: view-only, explained, and nothing is written", async () => {
  const app = await open({ init: () => { Object.defineProperty(Navigator.prototype, "locks", { configurable: true, get: () => undefined }); } });
  const a = app.page;
  assert.equal(await viewOnly(a), true);
  assert.match(await banner(a), /View only in this browser[\s\S]*Web Locks[\s\S]*Update Safari/);
  assert.equal(await a.locator(".position-label-control input").count(), 0);
  await token(a, "X").click();
  await a.keyboard.press("ArrowRight");
  assert.equal(await a.getByRole("button", { name: "More", exact: true }).isDisabled(), true, "no editing menu");
  await hideAndClose(a);
  assert.deepEqual(Object.keys(await readDurable(app.context)), [], "nothing was written");
  await app.context.close();
});

/* Regressions from the independent review of this change. */

test("a preservation file downloaded before a conflict does not unlock the conflict's destructive choices", async () => {
  const app = await open();
  const a = app.page;
  await renamePlayer(a, "X", "EARLY");
  await settleSave(a);
  await openDataTools(a);
  const early = a.waitForEvent("download");
  await a.getByRole("button", { name: /Download preservation file/ }).click();
  await early;
  await a.getByRole("button", { name: "Close" }).click();
  const outsider = await app.context.newPage();
  await outsider.goto(new URL("manifest.webmanifest", process.env.APP_URL).href);
  await outsider.evaluate((key) => { const w = JSON.parse(localStorage.getItem(key)); w.playbooks[0].plays[0].name = "Written Elsewhere"; localStorage.setItem(key, JSON.stringify(w)); }, WORKSPACE_KEY);
  await outsider.close();
  await a.waitForTimeout(600);
  assert.match(await banner(a), /Saving paused/);
  assert.deepEqual(
    [await a.getByRole("button", { name: "Keep this tab's version" }).isDisabled(), await a.getByRole("button", { name: "Load saved version" }).isDisabled()],
    [true, true],
    "the earlier file does not hold the version written elsewhere",
  );
  const fresh = a.waitForEvent("download");
  await a.locator(".authority-banner").getByRole("button", { name: /Download preservation file/ }).click();
  await fresh;
  assert.equal(await a.getByRole("button", { name: "Keep this tab's version" }).isDisabled(), false);
  await app.close();
});

test("a locked layer's label field cannot hold a draft that blocks the handover", async () => {
  const app = await open();
  const second = await openTab(app.context);
  const a = app.page, b = second.page;
  await token(a, "X").click();
  await a.locator(".layer-bar").getByRole("button", { name: /Lock offense/i }).click();
  await a.waitForTimeout(300);
  assert.equal(await a.locator(".position-label-control input").isDisabled(), true);
  await editHere(b);
  await becomesEditor(b);
  await app.close();
});

test("closing a tab whose changes could not be saved asks first, until a preservation file covers them", async () => {
  const app = await open();
  const a = app.page;
  await a.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException("Full", "QuotaExceededError"); }; });
  await renamePlayer(a, "X", "UNSAVED");
  await settleSave(a);
  const dialogs = [];
  a.on("dialog", (dialog) => { dialogs.push(dialog.type()); dialog.dismiss(); });
  await a.close({ runBeforeUnload: true });
  await a.waitForTimeout(500);
  assert.deepEqual([dialogs, a.isClosed()], [["beforeunload"], false], "the coach is asked and the page stays");
  const asks = () => a.evaluate(() => { const event = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; });
  assert.equal(await asks(), true);
  const download = a.waitForEvent("download");
  await a.locator(".storage-recovery").getByRole("button", { name: "Download preservation file" }).click();
  await download;
  await a.waitForTimeout(200);
  assert.equal(await asks(), false, "once a current preservation file covers the changes, leaving is not blocked");
  await renamePlayer(a, "Z", "LATER");
  await settleSave(a);
  assert.equal(await asks(), true, "a change after the file was made is not covered by it");
  await app.context.close();
});
