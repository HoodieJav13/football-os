import assert from "node:assert/strict";
import test from "node:test";
import {
  applyConceptTemplateToPlay,
  applyFormationToPlay,
  assignmentDefinitionToPoints,
  assignmentDistanceYards,
  assignmentStartSeconds,
  basePlayers,
  baseDefenders,
  clonePlaybook,
  createConceptTemplate,
  createPlayFromFormation,
  createSeedPlaybooks,
  defaultFormations,
  FIELD,
  FIELD_WINDOW,
  formationStatus,
  inferRouteDefinition,
  isLegacyPlay,
  manCoveragePoints,
  migrateLegacyPlay,
  migrateRoster,
  normalizePlay,
  playDuration,
  plays,
  routeDefinitionToPoints,
  routeDuration,
  changedAssignmentIds,
  seedPlaybooks,
  snapDragTarget,
} from "../src/playData.js";

const byLabel = (roster, label) => roster.find((player) => player.label === label);
const assignmentFor = (play, label) => {
  const owner = byLabel([...play.players, ...play.defenders], label);
  return play.assignments.find((item) => item.playerId === owner?.id);
};

test("the verified reference pack uses canonical and source labels without losing either", () => {
  const references = seedPlaybooks.filter(book => book.readOnly).flatMap((book) => book.plays);
  assert.equal(references.length, 15);
  for (const play of references) {
    assert.equal(formationStatus(play.players).legal, true, play.name);
    for (const label of ["X", "Y", "F", "Z", "H", "Q"]) {
      const player = play.players.find((item) => item.label === label);
      assert.ok(player, `${play.name} is missing canonical ${label}`);
      assert.ok(player.sourceLabel, `${play.name}/${label} is missing its source label`);
    }
  }
});

test("reference calls remain primary while clean concept names remain available", () => {
  const references = createSeedPlaybooks().filter(book => book.readOnly).flatMap((book) => book.plays);
  assert.ok(references.every((play) => play.sourceCall && play.conceptName));
  assert.deepEqual(
    references.slice(0, 4).map((play) => [play.sourceCall, play.conceptName]),
    [["60 Hitch", "All Hitch"], ["Y-Cross", "Y Cross"], ["91 Y", "Smash"], ["94 Y", "Sail"]],
  );
});

test("reference defense follows the cited page instead of a generic shell", () => {
  const books = createSeedPlaybooks();
  const airAndLsu = books.slice(1, 3).flatMap((book) => book.plays);
  const texasTech = books.find((book) => book.id === "texas-tech-reference").plays;
  assert.ok(airAndLsu.every((play) => play.defenders.length === 0));
  assert.ok(texasTech.every((play) => play.defenders.length === 11));
  assert.deepEqual([...new Set(texasTech[0].defenders.map((player) => player.label))].sort(), ["B", "C", "E", "FS", "SS", "T"]);
});

test("Tiger, Troop, and Texas Tech Mesh routes originate from the source owners", () => {
  const books = createSeedPlaybooks();
  const lsu = books.find((book) => book.id === "lsu-2019-reference").plays;
  const shallow = lsu.find((play) => play.id === "lsu-shallow");
  const emptyChoice = lsu.find((play) => play.id === "lsu-empty-choice");
  const troop = lsu.find((play) => play.id === "lsu-choice");
  assert.ok(byLabel(shallow.players, "H").x < -10);
  assert.ok(assignmentFor(shallow, "H").points.at(-1)[0] > 0);
  assert.ok(byLabel(emptyChoice.players, "H").x < -10);
  assert.ok(byLabel(troop.players, "Y").x > byLabel(troop.players, "Z").x);

  const yMesh = books.find((book) => book.id === "texas-tech-reference").plays.find((play) => play.id === "tt-y-mesh");
  const sourceS = yMesh.players.find((player) => player.sourceLabel === "S");
  const sourceY = yMesh.players.find((player) => player.sourceLabel === "Y");
  const xRoute = assignmentFor(yMesh, "X");
  const sRoute = yMesh.assignments.find((item) => item.playerId === sourceS.id && item.type === "Route");
  const yRoute = yMesh.assignments.find((item) => item.playerId === sourceY.id && item.type === "Route");
  assert.ok(xRoute.points.at(-1)[0] > xRoute.points[0][0]);
  assert.ok(sRoute.points.at(-1)[0] < sRoute.points[0][0]);
  assert.ok(yRoute.points.at(-1)[0] < yRoute.points[0][0]);
});

test("reference route evidence distinguishes explicit, traced, and neutral geometry", () => {
  const references = createSeedPlaybooks().filter(book => book.readOnly).flatMap((book) => book.plays);
  const routes = references.flatMap((play) => play.assignments.filter((item) => item.type === "Route"));
  const bases = new Set(routes.map((route) => route.evidence?.geometryBasis));
  assert.ok(bases.has("source-explicit"));
  assert.ok(bases.has("diagram-traced"));
  assert.ok(bases.has("neutral-animation"));
  assert.ok(routes.every((route) => ["source-explicit", "diagram-traced", "neutral-animation"].includes(route.evidence?.geometryBasis)));
});

test("conditional route alternatives survive normalization and change preview geometry", () => {
  const choice = createSeedPlaybooks().find((book) => book.id === "lsu-2019-reference").plays.find((play) => play.id === "lsu-choice");
  const lockedHitch = choice.assignments.find((item) => item.id === "lsu-choice-z");
  assert.equal(lockedHitch.definition.alternatives[0].label, "Fade versus man");
  const convertedDefinition = { ...lockedHitch.definition, activeAlternativeId: "fade-v-man" };
  const convertedPoints = routeDefinitionToPoints(lockedHitch.points[0], convertedDefinition);
  const normalized = normalizePlay({
    ...choice,
    assignments: choice.assignments.map((item) => item.id === lockedHitch.id
      ? { ...item, definition: convertedDefinition, points: convertedPoints }
      : item),
  }).assignments.find((item) => item.id === lockedHitch.id);
  assert.notDeepEqual(normalized.points, lockedHitch.points);
  assert.equal(normalized.definition.activeAlternativeId, "fade-v-man");
});

test("Crack-and-Go keeps motion and the post-snap crack on the same player", () => {
  const crack = createSeedPlaybooks().find((book) => book.id === "texas-tech-reference").plays.find((play) => play.id === "tt-crack-go");
  const stages = crack.assignments.filter((item) => item.playerId === "o-y");
  assert.deepEqual(stages.map((item) => [item.phase, item.type]), [["pre", "Motion"], ["post", "Block"]]);
});
