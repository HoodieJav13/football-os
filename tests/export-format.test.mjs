import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  applyConceptTemplateToPlay,
  clonePlaybook,
  createConceptTemplate,
  normalizePlay,
} from "../src/playData.js";
import {
  createDefaultWorkspace,
  createWorkspaceBackup,
  parseWorkspaceBackup,
} from "../src/workspaceData.js";
import { keywordsIn, SUPPORTED_KEYWORDS, validate } from "./json-schema-validator.mjs";

/**
 * `docs/export-format.md` is a contract for another application, so the
 * schema beside it is checked against what the app really writes, not against
 * a hand-typed sample: every test here runs real `createWorkspaceBackup`
 * output through the schema.
 */
const schema = JSON.parse(readFileSync(new URL("../docs/export-format.schema.json", import.meta.url), "utf8"));
const example = JSON.parse(readFileSync(new URL("../docs/export-format.example.json", import.meta.url), "utf8"));

const describe = (errors) => errors.slice(0, 8).map((error) => `${error.path}: ${error.message}`).join("\n");
const assertValid = (value, label) => {
  const errors = validate(value, schema);
  assert.equal(errors.length, 0, `${label} should validate:\n${describe(errors)}`);
};

test("the schema uses only keywords the hand-written validator implements", () => {
  const unsupported = [...keywordsIn(schema)].filter((keyword) => !SUPPORTED_KEYWORDS.has(keyword));
  assert.deepEqual(unsupported, [], "a keyword the validator ignores would check nothing");
});

test("the validator rejects, so a passing backup means something", () => {
  assert.notEqual(validate({}, schema).length, 0);
  assert.notEqual(validate(null, schema).length, 0);

  const backup = createWorkspaceBackup(createDefaultWorkspace(), "2026-09-24T12:00:00.000Z");
  const broken = clonePlaybook(backup);
  broken.format = "football-os-play";
  broken.workspace.version = 8;
  broken.workspace.playbooks[0].plays[0].assignments[0].points = [[1, 2]];
  broken.workspace.playbooks[0].plays[0].assignments[1].type = "Screen";
  broken.workspace.playbooks[0].plays[0].players[0].x = "20";

  const paths = validate(broken, schema).map((error) => error.path);
  for (const expected of [
    "/format",
    "/workspace/version",
    "/workspace/playbooks/0/plays/0/assignments/0/points",
    "/workspace/playbooks/0/plays/0/assignments/1/type",
    "/workspace/playbooks/0/plays/0/players/0/x",
  ]) {
    assert.ok(paths.includes(expected), `expected an error at ${expected}, got:\n${paths.join("\n")}`);
  }
});

test("a backup of the seeded workspace validates against the published schema", () => {
  const backup = createWorkspaceBackup(createDefaultWorkspace(), "2026-09-24T12:00:00.000Z");
  assertValid(backup, "seed backup");

  // The same bytes a coach downloads: serialised, then read back.
  assertValid(JSON.parse(JSON.stringify(backup)), "serialised seed backup");
});

test("coach-authored content validates: every assignment type, a concept, and a concept-derived play", () => {
  const workspace = createDefaultWorkspace();
  const book = workspace.playbooks[0];
  const [first, second] = book.plays;

  // Every assignment type the designer can produce, through the normaliser
  // exactly as an edit in the app would go.
  const drawn = normalizePlay({
    ...first,
    assignments: [
      ...first.assignments,
      { id: "t-man", playerId: "d-cb-r", unit: "defense", type: "Man", points: [[19, 8], [17, 1]], definition: { targetId: "o-z", leverage: "outside" } },
      { id: "t-rush", playerId: "d-e-r", unit: "defense", type: "Rush", points: [[6.3, 2.5], [8, -2]], definition: { technique: "blitz", gap: "C" } },
      { id: "t-zone", playerId: "d-fs", unit: "defense", type: "Zone", points: [[0, 15], [0, 18]], definition: { area: "deep-half" } },
      { id: "t-fit", playerId: "d-w", unit: "defense", type: "Fit", points: [[-6.5, 5.5], [-3, 1]], definition: { responsibility: "force" } },
      { id: "t-block", playerId: "o-rt", unit: "offense", type: "Block", points: [[4.8, -0.5], [6, 1]], definition: { technique: "reach", direction: "right" } },
      { id: "t-motion", playerId: "o-y", unit: "offense", type: "Motion", points: [[-11, -1.5], [-1, -1.5]], definition: { motionType: "orbit", direction: "right", distanceYards: 10 } },
      {
        id: "t-route",
        playerId: "o-f",
        unit: "offense",
        type: "Route",
        points: [[9, -1.5], [9, 10.5], [3.3, 15.2]],
        definition: { release: "inside", stemYards: 12, breaks: [{ direction: "inside", angle: 45, distanceYards: 8 }], condition: "" },
        geometryMode: "structured",
        evidence: { method: "coach-authored", confidence: "high", sourceLabel: null, sourcePage: null, note: "", coachEdited: true },
      },
    ],
  });

  const concept = createConceptTemplate(drawn, { id: "t-concept", name: "Test Concept" });
  book.concepts = [concept];
  book.plays = [drawn, applyConceptTemplateToPlay(second, concept), ...book.plays.slice(2)];

  const backup = createWorkspaceBackup(workspace, "2026-09-24T12:00:00.000Z");
  assertValid(backup, "coach-authored backup");

  const derived = backup.workspace.playbooks[0].plays[1];
  assert.ok(derived.assignments.some((item) => item.inheritedFrom?.conceptId === "t-concept"), "the concept-derived play carries inheritedFrom");
  assert.equal(backup.workspace.playbooks[0].concepts.length, 1);
});

test("the documented example is valid, restorable, and stable through a restore/export round trip", () => {
  assertValid(example, "docs/export-format.example.json");

  const restored = parseWorkspaceBackup(JSON.stringify(example));
  assert.equal(restored.upconvertedFrom, null, "the example is already at the current format");
  assert.equal(restored.playCount, 1);
  assert.equal(restored.conceptCount, 1);

  const reExported = createWorkspaceBackup(restored.workspace, example.exportedAt);
  assertValid(reExported, "re-exported example");
  assert.deepEqual(reExported.workspace, example.workspace, "normalising the example changes nothing, so it shows the real stored shape");
});
