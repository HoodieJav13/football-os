import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultWorkspace,
  createWorkspaceBackup,
  normalizeWorkspace,
  parseWorkspaceBackup,
  WORKSPACE_VERSION,
} from "../src/workspaceData.js";

test("legacy workspaces migrate to version eight with concept libraries", () => {
  const current = createDefaultWorkspace();
  const legacy = {
    ...current,
    version: 7,
    playbooks: current.playbooks.map(({ concepts, ...book }) => book),
  };
  const migrated = normalizeWorkspace(legacy);

  assert.equal(migrated.version, WORKSPACE_VERSION);
  assert.ok(migrated.playbooks.every((book) => Array.isArray(book.concepts)));
  assert.equal(migrated.playbooks.reduce((count, book) => count + book.plays.length, 0), 18);
});

test("workspace backups make a valid, restorable round trip", () => {
  const workspace = createDefaultWorkspace();
  const backup = createWorkspaceBackup(workspace, "2026-07-24T12:00:00.000Z");
  const restored = parseWorkspaceBackup(JSON.stringify(backup));

  assert.equal(restored.exportedAt, "2026-07-24T12:00:00.000Z");
  assert.equal(restored.playbookCount, 3);
  assert.equal(restored.playCount, 18);
  assert.equal(restored.workspace.version, WORKSPACE_VERSION);
  assert.notEqual(restored.workspace, workspace);
});

test("restore rejects unrelated JSON before touching current data", () => {
  assert.throws(
    () => parseWorkspaceBackup(JSON.stringify({ plays: [] })),
    /not a Football OS backup/,
  );
  assert.throws(
    () => parseWorkspaceBackup("{broken"),
    /not valid JSON/,
  );
});
