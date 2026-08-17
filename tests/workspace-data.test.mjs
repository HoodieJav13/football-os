import assert from "node:assert/strict";
import test from "node:test";
import { clonePlaybook, seedPlaybooks } from "../src/playData.js";

/**
 * Derived, not hard-coded: seeding a new source playbook is a content change
 * and should not read as a migration regression.
 */
const SEEDED_PLAY_COUNT = seedPlaybooks.reduce((count, book) => count + book.plays.length, 0);
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  createDefaultWorkspace,
  createWorkspaceBackup,
  normalizeWorkspace,
  parseWorkspaceBackup,
  WORKSPACE_VERSION,
} from "../src/workspaceData.js";

const legacyPlay = () => ({
  id: "legacy",
  name: "Legacy Play",
  family: "Mesh",
  personnel: "11 Personnel",
  formation: "Trips Right Open",
  folder: "Offense",
  players: [["X", 14, 73], ["Y", 29, 78], ["LT", 40, 73], ["LG", 45, 73], ["C", 50, 73],
    ["RG", 55, 73], ["RT", 60, 73], ["F", 67, 78], ["Q", 50, 80], ["H", 50, 89], ["Z", 82, 73]],
  defenders: [{ id: "CB-L", label: "C", x: 15, y: 32 }, { id: "M", label: "M", x: 50, y: 48 }],
  routes: [{ id: "lx", player: "X", type: "Route", preset: "Go", pace: 1, points: [[14, 73], [14, 45]] }],
});

const legacyWorkspace = (version) => ({
  version,
  mainPlaybookId: "book",
  activePlaybookId: "book",
  playbooks: [{
    id: "book",
    name: "Book",
    plays: [legacyPlay()],
    formations: [{ id: "f", name: "Trips Right Open", personnel: "11 Personnel", players: legacyPlay().players }],
    concepts: [{
      id: "c",
      name: "Mesh",
      players: legacyPlay().players,
      defenders: legacyPlay().defenders,
      assignments: [{ id: "cx", player: "X", type: "Route", pace: 1, points: [[14, 73], [14, 45]] }],
    }],
  }],
});

test("legacy workspaces migrate to the current version with concept libraries", () => {
  const current = createDefaultWorkspace();
  const legacy = {
    ...current,
    version: 7,
    playbooks: current.playbooks.map(({ concepts, ...book }) => book),
  };
  const migrated = normalizeWorkspace(legacy);

  assert.equal(migrated.version, WORKSPACE_VERSION);
  assert.ok(migrated.playbooks.every((book) => Array.isArray(book.concepts)));
  assert.equal(migrated.playbooks.reduce((count, book) => count + book.plays.length, 0), SEEDED_PLAY_COUNT);
});

test("every supported legacy version converts percent coordinates to yards", () => {
  for (const version of [5, 6, 7, 8]) {
    const migrated = normalizeWorkspace(legacyWorkspace(version));
    assert.ok(migrated, `version ${version} should migrate`);
    assert.equal(migrated.version, WORKSPACE_VERSION);
    const play = migrated.playbooks[0].plays[0];
    const centre = play.players.find((player) => player.label === "C");
    assert.deepEqual([centre.x, centre.y], [0, 0], `version ${version} centre on the origin`);
    assert.deepEqual(play.assignments[0].points, [[-19.2, 0], [-19.2, 21.5]]);
  }
});

test("migration rewrites formations and concepts, not just plays", () => {
  const migrated = normalizeWorkspace(legacyWorkspace(8));
  const book = migrated.playbooks[0];

  // formations become player objects in yard space
  const formationCentre = book.formations[0].players.find((player) => player.label === "C");
  assert.equal(typeof book.formations[0].players[0].id, "string");
  assert.deepEqual([formationCentre.x, formationCentre.y], [0, 0]);

  // concepts convert too, and gain the position label they are keyed by
  const concept = book.concepts[0];
  assert.equal(typeof concept.players[0].id, "string");
  assert.deepEqual(concept.assignments[0].points, [[-19.2, 0], [-19.2, 21.5]]);
  assert.equal(concept.assignments[0].positionLabel, "X");
});

test("a workspace already at the current version is left alone", () => {
  const current = createDefaultWorkspace();
  const normalized = normalizeWorkspace(clonePlaybook(current));
  assert.deepEqual(normalized.playbooks[0].plays[0].players, current.playbooks[0].plays[0].players);
  assert.deepEqual(normalized.playbooks[0].plays[0].assignments, current.playbooks[0].plays[0].assignments);
});

test("normalizing twice changes nothing", () => {
  const once = normalizeWorkspace(legacyWorkspace(8));
  const twice = normalizeWorkspace(clonePlaybook(once));
  assert.deepEqual(twice, once);
});

test("workspace backups make a valid, restorable round trip", () => {
  const workspace = createDefaultWorkspace();
  const backup = createWorkspaceBackup(workspace, "2026-07-24T12:00:00.000Z");
  const restored = parseWorkspaceBackup(JSON.stringify(backup));

  assert.equal(backup.format, BACKUP_FORMAT);
  assert.equal(backup.formatVersion, BACKUP_FORMAT_VERSION);
  assert.equal(restored.exportedAt, "2026-07-24T12:00:00.000Z");
  assert.equal(restored.playbookCount, seedPlaybooks.length);
  assert.equal(restored.playCount, SEEDED_PLAY_COUNT);
  assert.equal(restored.workspace.version, WORKSPACE_VERSION);
  assert.equal(restored.upconvertedFrom, null);
  assert.notEqual(restored.workspace, workspace);
});

test("a format-1 backup still imports and reports that it was upconverted", () => {
  const legacyBackup = {
    format: BACKUP_FORMAT,
    formatVersion: 1,
    exportedAt: "2026-01-01T00:00:00.000Z",
    workspace: legacyWorkspace(8),
  };
  const restored = parseWorkspaceBackup(JSON.stringify(legacyBackup));

  assert.equal(restored.upconvertedFrom, 1);
  assert.equal(restored.workspace.version, WORKSPACE_VERSION);
  assert.deepEqual(restored.workspace.playbooks[0].plays[0].assignments[0].points, [[-19.2, 0], [-19.2, 21.5]]);
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

test("restore refuses a backup from a newer format than it understands", () => {
  assert.throws(
    () => parseWorkspaceBackup(JSON.stringify({
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION + 1,
      workspace: createDefaultWorkspace(),
    })),
    /newer version of Football OS/,
  );
});

test("restore rejects a backup whose plays are structurally invalid", () => {
  const workspace = createDefaultWorkspace();
  workspace.playbooks[0].plays[0].assignments[0].points = [[1, 2]];
  assert.throws(
    () => parseWorkspaceBackup(JSON.stringify({
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      workspace,
    })),
    /incomplete or contains invalid play data/,
  );
});
