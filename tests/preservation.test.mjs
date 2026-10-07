import assert from "node:assert/strict";
import test from "node:test";
import { createPreservationBundle, describePreservation, parseRestoreFile } from "../src/preservation.js";
import { createDefaultWorkspace, createWorkspaceBackup, RECOVERY_WORKSPACE_KEY, WORKSPACE_KEY } from "../src/workspaceData.js";
import { GAME_DAY_KEY, GAME_DAY_RECOVERY_KEY, loadGameDayState, recoverGameDay, RecoveryCopyExistsError, restoreWorkspace } from "../src/workspaceStorage.js";
import { memoryStorage } from "./fixtures/fake-locks.mjs";

function adjusted() {
  const workspace = createDefaultWorkspace();
  const play = workspace.playbooks[0].plays[0];
  const snapshot = structuredClone(play);
  play.players[0].label = "GD";
  return { workspace, gameDay: { playbookId: workspace.playbooks[0].id, playId: play.id, snapshot, startedAt: "2026-10-07T10:00:00.000Z" } };
}

test("a preservation file keeps the game-day original and drafts, and restores both workspace and adjustment", () => {
  const { workspace, gameDay } = adjusted();
  const bundle = createPreservationBundle({
    reason: "save-failed",
    workspace,
    gameDay,
    drafts: [{ id: "play-details", label: "Play details for Mesh", values: { name: "Mesh Typed" } }],
    durable: { [WORKSPACE_KEY]: "{\"older\":true}" },
  });
  assert.match(describePreservation(bundle), /game-day adjustment and its original play/);
  assert.match(describePreservation(bundle), /1 unfinished draft/);
  const parsed = parseRestoreFile(JSON.stringify(bundle));
  assert.equal(parsed.preservation, true);
  assert.equal(parsed.workspace.playbooks[0].plays[0].players[0].label, "GD");
  assert.equal(parsed.gameDay.snapshot.players[0].label, "X", "the original is restorable");
  assert.equal(parsed.drafts[0].values.name, "Mesh Typed");
});

test("a preservation file whose adjustment does not belong to its workspace is refused whole", () => {
  const { workspace, gameDay } = adjusted();
  const bundle = createPreservationBundle({ reason: "x", workspace, gameDay: { ...gameDay, playId: "missing", snapshot: { ...gameDay.snapshot, id: "missing" } } });
  assert.throws(() => parseRestoreFile(JSON.stringify(bundle)), /does not match its workspace/);
});

test("an ordinary backup still parses through the same entry point", () => {
  const parsed = parseRestoreFile(JSON.stringify(createWorkspaceBackup(createDefaultWorkspace())));
  assert.deepEqual([parsed.preservation, parsed.gameDay, parsed.drafts], [undefined, null, []]);
});

test("restore keeps the raw game-day record in the recovery copy and ends the adjustment before replacing the workspace", () => {
  const { workspace, gameDay } = adjusted();
  const gameDayRaw = JSON.stringify({ ...gameDay, workspaceVersion: 11 });
  const order = [];
  const storage = memoryStorage({ [WORKSPACE_KEY]: JSON.stringify(workspace), [GAME_DAY_KEY]: gameDayRaw });
  const setItem = storage.setItem;
  storage.setItem = (key, value) => { order.push(key); setItem(key, value); };
  restoreWorkspace(storage, createDefaultWorkspace(), { workspace, writable: true }, { endAdjustment: true });
  assert.deepEqual(order, [RECOVERY_WORKSPACE_KEY, GAME_DAY_KEY, WORKSPACE_KEY]);
  const recovery = JSON.parse(storage.getItem(RECOVERY_WORKSPACE_KEY));
  assert.deepEqual(recovery.gameDay, { sourceKey: GAME_DAY_KEY, raw: gameDayRaw });
  assert.equal(loadGameDayState(storage).gameDay, null);
});

test("an existing recovery copy is replaced only with confirmation of exactly those bytes", () => {
  const storage = memoryStorage({ [RECOVERY_WORKSPACE_KEY]: "{\"createdAt\":\"first\"}" });
  const current = { workspace: createDefaultWorkspace(), writable: true };
  assert.throws(() => restoreWorkspace(storage, createDefaultWorkspace(), current), RecoveryCopyExistsError);
  assert.throws(() => restoreWorkspace(storage, createDefaultWorkspace(), current, { replaceRecovery: "{\"createdAt\":\"other\"}" }), RecoveryCopyExistsError);
  assert.equal(storage.getItem(RECOVERY_WORKSPACE_KEY), "{\"createdAt\":\"first\"}");
  assert.equal(storage.getItem(WORKSPACE_KEY), null);
  restoreWorkspace(storage, createDefaultWorkspace(), current, { replaceRecovery: "{\"createdAt\":\"first\"}" });
  assert.notEqual(storage.getItem(RECOVERY_WORKSPACE_KEY), "{\"createdAt\":\"first\"}");

  const damaged = memoryStorage({ "football-os.game-day.v7": "{bad", [GAME_DAY_RECOVERY_KEY]: "earlier" });
  assert.throws(() => recoverGameDay(damaged, loadGameDayState(damaged)), RecoveryCopyExistsError);
  assert.equal(damaged.getItem("football-os.game-day.v7"), "{bad");
  recoverGameDay(damaged, loadGameDayState(damaged), { replaceRecovery: "earlier" });
  assert.equal(JSON.parse(damaged.getItem(GAME_DAY_RECOVERY_KEY)).raw, "{bad");
});

/* Regressions from the independent review of this change. */

test("both versions in a conflict preservation file are restorable: this tab's, and the one found in storage", () => {
  const live = createDefaultWorkspace();
  live.playbooks[0].plays[0].name = "This Tab";
  const stored = createDefaultWorkspace();
  stored.playbooks[0].plays[0].name = "Written Elsewhere";
  const text = JSON.stringify(createPreservationBundle({ reason: "conflict", workspace: live, durable: { [WORKSPACE_KEY]: JSON.stringify(stored) } }));
  const mine = parseRestoreFile(text);
  assert.deepEqual([mine.version, mine.storedAvailable, mine.workspace.playbooks[0].plays[0].name], ["live", true, "This Tab"]);
  const theirs = parseRestoreFile(text, { version: "stored" });
  assert.deepEqual([theirs.version, theirs.workspace.playbooks[0].plays[0].name], ["stored", "Written Elsewhere"]);
});

test("an adjustment the loader would reject as damaged is refused at restore, not written", () => {
  const { workspace, gameDay } = adjusted();
  gameDay.snapshot.assignments.push({ id: "bad", playerId: gameDay.snapshot.defenders[0].id, unit: "defense", type: "Zone", phase: "post", points: [[0, 5], [0, 20]], definition: { responsibilityArea: { version: 1, shape: "ellipse", center: [0, 20], radiusX: -4, radiusY: 5, label: "Bad", color: "blue" } } });
  const text = JSON.stringify(createPreservationBundle({ reason: "x", workspace, gameDay }));
  assert.throws(() => parseRestoreFile(text), /damaged/);
});

/* Stored-version selection follows the loaders, legacy keys included (PR #13 follow-up, gap 5). */
import { readFileSync } from "node:fs";

const fileWith = (live, durable, liveGameDay = null) => JSON.stringify({
  format: "football-os-preservation", formatVersion: 1, createdAt: "2026-10-07T00:00:00.000Z", reason: "conflict",
  live: { workspaceVersion: 11, workspace: live, gameDay: liveGameDay, location: null }, drafts: [], durable,
});

test("a stored version held only under a legacy workspace key is restorable, migrated", () => {
  const legacy = readFileSync(new URL("./fixtures/workspace-v10.json", import.meta.url), "utf8");
  const parsed = parseRestoreFile(fileWith(createDefaultWorkspace(), { "football-os.playbooks.v10": legacy }));
  assert.equal(parsed.storedAvailable, true);
  const stored = parseRestoreFile(fileWith(createDefaultWorkspace(), { "football-os.playbooks.v10": legacy }), { version: "stored" });
  assert.deepEqual([stored.workspace.version, stored.workspace.playbooks[0].plays[0].name, stored.gameDay], [11, "Saved custom v10", null]);
});

test("a current workspace with only a legacy adjustment (its migration write failed) restores with that adjustment", () => {
  const { workspace, gameDay } = adjusted();
  const stored = parseRestoreFile(fileWith(createDefaultWorkspace(), {
    [WORKSPACE_KEY]: JSON.stringify(workspace),
    "football-os.game-day.v6": JSON.stringify(gameDay),
  }), { version: "stored" });
  assert.deepEqual([stored.gameDay.playId, stored.gameDay.snapshot.players[0].label], [gameDay.playId, "X"]);
});

test("identical workspaces with different adjustments are two states, and the stored one is offered", () => {
  const { workspace, gameDay } = adjusted();
  const text = fileWith(workspace, { [WORKSPACE_KEY]: JSON.stringify(workspace), [GAME_DAY_KEY]: JSON.stringify({ ...gameDay, workspaceVersion: 11 }) });
  const live = parseRestoreFile(text);
  assert.deepEqual([live.gameDay, live.storedAvailable], [null, true]);
  assert.equal(parseRestoreFile(text, { version: "stored" }).gameDay.playId, gameDay.playId);
  const same = fileWith(workspace, { [WORKSPACE_KEY]: JSON.stringify(workspace), [GAME_DAY_KEY]: JSON.stringify({ ...gameDay, workspaceVersion: 11 }) }, gameDay);
  assert.equal(parseRestoreFile(same).storedAvailable, false, "same workspace and same adjustment: nothing else to offer");
});

test("a stored version whose adjustment is damaged is refused rather than offered without it", () => {
  const workspace = createDefaultWorkspace();
  const text = fileWith(createDefaultWorkspace(), { [WORKSPACE_KEY]: JSON.stringify(workspace), [GAME_DAY_KEY]: "{damaged" });
  assert.equal(parseRestoreFile(text).storedAvailable, false);
  assert.throws(() => parseRestoreFile(text, { version: "stored" }), /damaged/);
});

test("the recovery copy records the live adjustment even when no adjustment is stored", () => {
  const { workspace, gameDay } = adjusted();
  const storage = memoryStorage({ [WORKSPACE_KEY]: JSON.stringify(createDefaultWorkspace()) });
  restoreWorkspace(storage, createDefaultWorkspace(), { workspace, writable: true }, { endAdjustment: true, liveGameDay: gameDay });
  const recovery = JSON.parse(storage.getItem(RECOVERY_WORKSPACE_KEY));
  assert.deepEqual([recovery.gameDay, recovery.liveGameDay.snapshot.players[0].label], [undefined, "X"]);
});
