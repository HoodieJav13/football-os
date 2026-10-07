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
