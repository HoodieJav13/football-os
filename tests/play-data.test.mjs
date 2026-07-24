import assert from "node:assert/strict";
import test from "node:test";
import {
  applyFormationToPlay,
  assignmentDefinitionToPoints,
  assignmentStartSeconds,
  basePlayers,
  baseDefenders,
  clonePlaybook,
  createPlayFromFormation,
  createSeedPlaybooks,
  defaultFormations,
  formationStatus,
  inferRouteDefinition,
  normalizePlay,
  playDuration,
  plays,
  routeDefinitionToPoints,
  routeDuration,
  seedPlaybooks,
} from "../src/playData.js";

test("the default offense is a legal eleven-player formation", () => {
  assert.deepEqual(formationStatus(basePlayers), {
    legal: true,
    onLine: 7,
    inBackfield: 4,
    playerCount: 11,
  });
});

test("seeded plays carry distinct, player-owned route data", () => {
  const signatures = plays.map((play) => JSON.stringify(play.routes.map((route) => route.points)));
  assert.equal(new Set(signatures).size, plays.length);
  assert.ok(plays.every((play) => play.routes.every((route) => route.id && route.player && Number.isFinite(route.pace))));
});

test("playbook cloning protects the source during temporary changes", () => {
  const clone = clonePlaybook(plays);
  clone[0].routes[0].points[0][0] = 99;
  assert.notEqual(clone[0].routes[0].points[0][0], plays[0].routes[0].points[0][0]);
});

test("source playbooks remain separate from the main personal playbook", () => {
  assert.deepEqual(seedPlaybooks.map((book) => book.name), [
    "Personal Active",
    "Texas Tech Sample",
    "LSU 2019 Sample",
  ]);
  assert.equal(seedPlaybooks[0].isMain, true);
  assert.ok(seedPlaybooks.slice(1).every((book) => book.plays.length === 6));
  assert.ok(seedPlaybooks.slice(1).every((book) => book.plays.every((play) => Number.isInteger(play.sourcePage))));
});

test("migrated personal plays keep their content and gain pace data", () => {
  const legacy = clonePlaybook(plays);
  legacy[0].routes[0] = { ...legacy[0].routes[0], pace: undefined, delay: 0.5 };
  const books = createSeedPlaybooks(legacy);
  assert.equal(books[0].plays[0].routes[0].pace, 1);
  assert.equal(books[0].plays[0].routes[0].geometryMode, "detected");
  assert.ok(books[0].plays[0].routes[0].definition);
  assert.equal(books[0].plays[0].name, legacy[0].name);
});

test("player pace changes animation duration", () => {
  const route = plays[0].routes[0];
  assert.ok(routeDuration({ ...route, pace: 1.5 }) < routeDuration({ ...route, pace: 0.75 }));
});

test("every reusable seed formation is legal", () => {
  assert.ok(defaultFormations.length >= 3);
  assert.ok(defaultFormations.every((formation) => formationStatus(formation.players).legal));
});

test("creating a play from a formation copies player state without assignments", () => {
  const created = createPlayFromFormation({
    formation: defaultFormations[1],
    id: "new-play",
    name: "New Play",
  });
  assert.equal(created.formation, defaultFormations[1].name);
  assert.equal(created.players.length, 11);
  assert.deepEqual(created.routes, []);
  created.players[0][1] = 99;
  assert.notEqual(created.players[0][1], defaultFormations[1].players[0][1]);
});

test("structured routes mirror release and break direction across the formation", () => {
  const definition = {
    release: "inside",
    stemYards: 10,
    breaks: [{ direction: "outside", angle: 45, distanceYards: 8 }],
    condition: "",
  };
  const left = routeDefinitionToPoints([20, 73], definition);
  const right = routeDefinitionToPoints([80, 73], definition);

  assert.equal(left.length, right.length);
  left.forEach((point, index) => {
    assert.ok(Math.abs(point[0] + right[index][0] - 100) < 0.2);
    assert.equal(point[1], right[index][1]);
  });
});

test("double moves generate ordered route segments", () => {
  const points = routeDefinitionToPoints([20, 73], {
    release: "none",
    stemYards: 8,
    breaks: [
      { direction: "outside", angle: 90, distanceYards: 4 },
      { direction: "vertical", angle: 0, distanceYards: 12 },
    ],
    condition: "",
  });

  assert.equal(points.length, 4);
  assert.equal(points[1][1], points[2][1], "the 90-degree first move stays level");
  assert.ok(points[3][1] < points[2][1], "the second move continues upfield");
});

test("existing diagrams receive an editable inferred definition and source evidence", () => {
  const normalized = normalizePlay({
    id: "source-play",
    name: "Source Play",
    sourceLabel: "Reference Playbook",
    sourcePage: 12,
    routes: [{
      id: "source-route",
      player: "Z",
      type: "Route",
      pace: 1,
      preset: "Post",
      points: [[82, 73], [82, 53], [70, 40]],
    }],
  });
  const route = normalized.routes[0];

  assert.equal(route.definition.release, "none");
  assert.equal(route.definition.breaks[0].direction, "inside");
  assert.equal(route.evidence.sourcePage, 12);
  assert.equal(route.evidence.method, "diagram-geometry");
  assert.equal(route.geometryMode, "detected");
});

test("route inference measures the stem in yards rather than canvas units", () => {
  const definition = inferRouteDefinition({
    points: [[80, 73], [80, 60], [70, 50]],
  });

  assert.equal(definition.stemYards, 10);
  assert.equal(definition.breaks[0].direction, "inside");
});

test("explicit PDF measurements override conflicting traced geometry", () => {
  const books = createSeedPlaybooks();
  const lsu = books.find((book) => book.id === "lsu-2019-sample");
  const sticky = lsu.plays.find((play) => play.id === "lsu-dice-jordan-sticky");
  const yRoute = sticky.routes.find((route) => route.id === "lsu-sticky-y");

  assert.equal(yRoute.definition.stemYards, 5);
  assert.equal(yRoute.definition.condition, "Read man/zone");
  assert.equal(yRoute.evidence.method, "labels-and-geometry");
  assert.equal(yRoute.evidence.confidence, "medium-high");
  assert.equal(yRoute.geometryMode, "detected");
});

test("legacy plays gain editable defensive personnel and assignment timing", () => {
  const normalized = normalizePlay({
    ...plays[0],
    defenders: undefined,
    routes: [
      ...plays[0].routes,
      {
        id: "legacy-block",
        player: "LT",
        type: "Block",
        points: [[40, 73], [42, 64]],
      },
    ],
  });

  assert.equal(normalized.defenders.length, baseDefenders.length);
  assert.equal(new Set(normalized.defenders.map((player) => player.id)).size, baseDefenders.length);
  const block = normalized.routes.find((assignment) => assignment.id === "legacy-block");
  assert.equal(block.unit, "offense");
  assert.equal(block.definition.technique, "drive");
  assert.equal(block.delay, 0);
  assert.equal(block.phase, "post");
});

test("football block techniques produce distinct assignment geometry", () => {
  const start = [45, 73];
  const drive = assignmentDefinitionToPoints(start, "Block", { technique: "drive" });
  const pull = assignmentDefinitionToPoints(start, "Block", { technique: "pull", direction: "right" });
  const passSet = assignmentDefinitionToPoints(start, "Block", { technique: "pass-set", direction: "left" });

  assert.deepEqual(drive[0], start);
  assert.ok(pull.length > drive.length);
  assert.ok(pull.at(-1)[0] > start[0]);
  assert.ok(passSet.at(-1)[1] > start[1]);
});

test("defensive responsibilities generate unit-appropriate landmarks", () => {
  const rush = assignmentDefinitionToPoints([35, 61], "Rush", { technique: "stunt", direction: "right" });
  const zone = assignmentDefinitionToPoints([15, 32], "Zone", { area: "flat" });
  const fit = assignmentDefinitionToPoints([50, 48], "Fit", { responsibility: "A" });

  assert.ok(rush.at(-1)[1] > rush[0][1], "rush path attacks the offensive backfield");
  assert.deepEqual(zone.at(-1), [12, 50]);
  assert.equal(fit.at(-1)[1], 71);
});

test("applying a formation translates matching assignments and preserves defense", () => {
  const source = normalizePlay({
    ...plays[0],
    routes: [
      ...plays[0].routes,
      {
        id: "defense-fit",
        unit: "defense",
        player: "M",
        type: "Fit",
        definition: { responsibility: "B", technique: "spill" },
        points: [[50, 48], [55, 71]],
        pace: 1,
        delay: 0,
      },
    ],
  });
  const xBefore = source.routes.find((assignment) => assignment.player === "X").points[0];
  const applied = applyFormationToPlay(source, defaultFormations[1]);
  const xAfter = applied.routes.find((assignment) => assignment.player === "X").points[0];

  assert.equal(applied.formation, "Doubles");
  assert.notDeepEqual(xAfter, xBefore);
  assert.ok(applied.routes.some((assignment) => assignment.id === "defense-fit"));
});

test("animation timing honors pre-snap and post-snap delays", () => {
  const motion = {
    type: "Motion",
    delay: -1.5,
    pace: 1,
    points: [[80, 73], [40, 73]],
  };
  const route = {
    type: "Route",
    delay: 0.5,
    pace: 1,
    points: [[20, 73], [20, 40]],
  };

  assert.equal(assignmentStartSeconds(motion), 0.5);
  assert.equal(assignmentStartSeconds(route), 2.5);
  assert.ok(playDuration([motion, route]) > 2.5);
});
