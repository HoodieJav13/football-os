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

test("the default offense is a legal eleven-player formation", () => {
  assert.deepEqual(formationStatus(basePlayers), {
    legal: true,
    onLine: 7,
    inBackfield: 4,
    playerCount: 11,
  });
});

test("every player carries a stable id that is independent of its label", () => {
  const roster = [...basePlayers, ...baseDefenders];
  assert.equal(new Set(roster.map((player) => player.id)).size, roster.length);
  assert.ok(roster.every((player) => typeof player.id === "string" && typeof player.label === "string"));
  // Several defenders legitimately share a label; their ids must still be distinct.
  const sharedLabels = baseDefenders.filter((player) => player.label === "C");
  assert.equal(sharedLabels.length, 2);
  assert.notEqual(sharedLabels[0].id, sharedLabels[1].id);
});

test("coordinates are stored in yards from the line of scrimmage", () => {
  // The centre sits on the origin, and the interior line is on the LOS.
  const centre = byLabel(basePlayers, "C");
  assert.deepEqual([centre.x, centre.y], [0, 0]);
  // The quarterback is behind the LOS, so y is negative.
  assert.ok(byLabel(basePlayers, "Q").y < 0);
  // A split end is inside the sideline.
  assert.ok(Math.abs(byLabel(basePlayers, "X").x) < FIELD.halfWidthYards);
});

test("the fixed field window contains every seeded route without clipping", () => {
  const books = createSeedPlaybooks();
  const points = books.flatMap((book) => book.plays.flatMap((play) => play.assignments.flatMap((item) => item.points)));
  const deepest = Math.max(...points.map(([, y]) => y));
  const shallowest = Math.min(...points.map(([, y]) => y));

  assert.ok(deepest <= FIELD_WINDOW.downfieldYards, `deepest point ${deepest} exceeds the window`);
  assert.ok(shallowest >= -FIELD_WINDOW.behindYards, `deepest backfield point ${shallowest} exceeds the window`);
});

test("every seeded assignment is anchored on a player that exists in its play", () => {
  const books = createSeedPlaybooks();
  for (const book of books) {
    for (const play of book.plays) {
      const roster = [...play.players, ...play.defenders];
      for (const item of play.assignments) {
        const owner = roster.find((player) => player.id === item.playerId);
        assert.ok(owner, `${play.id}/${item.id} references missing player ${item.playerId}`);
        const drift = Math.hypot(item.points[0][0] - owner.x, item.points[0][1] - owner.y);
        assert.ok(drift < 0.35, `${play.id}/${item.id} starts ${drift.toFixed(2)} yd away from its player`);
      }
    }
  }
});

test("normalization always produces an explicit unit and phase", () => {
  const books = createSeedPlaybooks();
  const assignments = books.flatMap((book) => book.plays.flatMap((play) => play.assignments));
  assert.ok(assignments.length > 0);
  assert.ok(assignments.every((item) => item.unit === "offense" || item.unit === "defense"));
  assert.ok(assignments.every((item) => item.phase === "pre" || item.phase === "post"));
});

test("seeded plays carry distinct, player-owned assignment data", () => {
  const signatures = plays.map((play) => JSON.stringify(play.assignments.map((item) => item.points)));
  assert.equal(new Set(signatures).size, plays.length);
  assert.ok(plays.every((play) => play.assignments.every((item) => (
    item.id && item.playerId && Number.isFinite(item.pace)
  ))));
});

test("Personal Active opens with truthful coach-authored concepts and useful classifications", () => {
  assert.deepEqual(plays.map((play) => play.name), [
    "Mesh",
    "Mesh Sit",
    "Mesh Wheel",
    "Trips Right Stick",
    "Doubles Y Cross",
    "Inside Zone Glance",
  ]);
  assert.ok(plays.every((play) => play.family && play.formation && play.personnel));
  assert.ok(plays.every((play) => play.protection && play.blockingScheme && play.folder));
  assert.ok(new Set(plays.map((play) => play.family)).size >= 4);
  assert.ok(new Set(plays.map((play) => play.protection)).size >= 3);
});

test("the Mesh seed contains two opposite shallow crossers", () => {
  const mesh = plays.find((play) => play.id === "mesh");
  const crossers = mesh.assignments.filter((item) => item.type === "Route" && item.preset === "Shallow");
  assert.equal(crossers.length, 2);
  assert.ok(crossers.every((item) => item.geometryMode === "structured"));
  assert.ok(crossers.every((item) => item.evidence?.coachEdited));
  const directions = crossers.map((item) => Math.sign(item.points.at(-1)[0] - item.points[0][0]));
  assert.deepEqual(directions.sort(), [-1, 1]);
});

test("formation names describe the actual seeded alignments", () => {
  const trips = defaultFormations.find((formation) => formation.name === "Trips Right Open");
  const rightEligibleLabels = trips.players
    .filter((player) => player.x > 6 && !["RT", "RG"].includes(player.label))
    .map((player) => player.label)
    .sort();
  assert.deepEqual(rightEligibleLabels, ["F", "Y", "Z"]);
});

test("playbook cloning protects the source during temporary changes", () => {
  const clone = clonePlaybook(plays);
  clone[0].assignments[0].points[0][0] = 99;
  assert.notEqual(clone[0].assignments[0].points[0][0], plays[0].assignments[0].points[0][0]);
});

test("source playbooks remain separate from the main personal playbook", () => {
  assert.deepEqual(seedPlaybooks.map((book) => book.name), [
    "Personal Active",
    "Air Raid Reference",
    "LSU 2019 Reference",
    "Texas Tech Reference",
  ]);
  assert.equal(seedPlaybooks[0].isMain, true);
  assert.deepEqual(seedPlaybooks.slice(1).map((book) => book.plays.length), [4, 7, 4]);
  assert.ok(seedPlaybooks.slice(1).every((book) => book.readOnly));
  assert.ok(seedPlaybooks.slice(1).every((book) => book.plays.every((play) => (
    Number.isInteger(play.sourcePage) && play.sourceCall && play.sourceVerified && play.personnel === "10 Personnel"
  ))));
});

test("the verified reference pack uses canonical and source labels without losing either", () => {
  const references = seedPlaybooks.slice(1).flatMap((book) => book.plays);
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
  const references = createSeedPlaybooks().slice(1).flatMap((book) => book.plays);
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
  const references = createSeedPlaybooks().slice(1).flatMap((book) => book.plays);
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

test("migrated personal plays keep their content and gain pace data", () => {
  const legacy = clonePlaybook(plays);
  legacy[0].assignments[0] = {
    ...legacy[0].assignments[0],
    pace: undefined,
    delay: 0.5,
    definition: undefined,
    geometryMode: undefined,
    evidence: undefined,
  };
  const books = createSeedPlaybooks(legacy);
  assert.equal(books[0].plays[0].assignments[0].pace, 1);
  assert.equal(books[0].plays[0].assignments[0].geometryMode, "detected");
  assert.ok(books[0].plays[0].assignments[0].definition);
  assert.equal(books[0].plays[0].name, legacy[0].name);
});

test("player pace changes animation duration", () => {
  const item = plays[0].assignments[0];
  assert.ok(routeDuration({ ...item, pace: 1.5 }) < routeDuration({ ...item, pace: 0.75 }));
});

test("assignment duration is driven by true yard distance", () => {
  const short = { points: [[0, 0], [0, 6]], pace: 1 };
  const long = { points: [[0, 0], [0, 30]], pace: 1 };
  assert.equal(assignmentDistanceYards(short), 6);
  assert.equal(assignmentDistanceYards(long), 30);
  assert.ok(routeDuration(long) > routeDuration(short));
});

test("a lateral yard and a vertical yard cost the same distance", () => {
  // The old percent space made a lateral yard 2.3x longer on screen than a
  // vertical one; in yard space the two axes are interchangeable.
  const across = assignmentDistanceYards({ points: [[0, 0], [10, 0]] });
  const upfield = assignmentDistanceYards({ points: [[0, 0], [0, 10]] });
  assert.equal(across, upfield);
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
  assert.deepEqual(created.assignments, []);
  created.players[0].x = 99;
  assert.notEqual(created.players[0].x, defaultFormations[1].players[0].x);
});

test("structured routes mirror release and break direction across the formation", () => {
  const definition = {
    release: "inside",
    stemYards: 10,
    breaks: [{ direction: "outside", angle: 45, distanceYards: 8 }],
    condition: "",
  };
  const left = routeDefinitionToPoints([-15, 0], definition);
  const right = routeDefinitionToPoints([15, 0], definition);

  assert.equal(left.length, right.length);
  left.forEach((point, index) => {
    assert.ok(Math.abs(point[0] + right[index][0]) < 0.2, "mirrored about the centre line");
    assert.equal(point[1], right[index][1]);
  });
});

test("a structured stem depth lands at exactly that depth downfield", () => {
  const points = routeDefinitionToPoints([-15, 0], { release: "none", stemYards: 12, breaks: [] });
  assert.equal(points.at(-1)[1], 12);
});

test("double moves generate ordered route segments", () => {
  const points = routeDefinitionToPoints([-15, 0], {
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
  assert.ok(points[3][1] > points[2][1], "the second move continues upfield");
});

test("existing diagrams receive an editable inferred definition and source evidence", () => {
  const normalized = normalizePlay({
    id: "source-play",
    name: "Source Play",
    sourceLabel: "Reference Playbook",
    sourcePage: 12,
    players: clonePlaybook(basePlayers),
    assignments: [{
      id: "source-route",
      playerId: "o-z",
      unit: "offense",
      type: "Route",
      pace: 1,
      preset: "Post",
      points: [[17, 0], [17, 15], [11, 25]],
    }],
  });
  const item = normalized.assignments[0];

  assert.equal(item.definition.release, "none");
  assert.equal(item.definition.stemYards, 15);
  assert.equal(item.definition.breaks[0].direction, "inside");
  assert.equal(item.evidence.sourcePage, 12);
  assert.equal(item.evidence.method, "diagram-geometry");
  assert.equal(item.geometryMode, "detected");
});

test("route inference measures the stem in yards", () => {
  const definition = inferRouteDefinition({ points: [[17, 0], [17, 10], [11, 17]] });
  assert.equal(definition.stemYards, 10);
  assert.equal(definition.breaks[0].direction, "inside");
});

test("explicit PDF measurements override conflicting traced geometry", () => {
  const books = createSeedPlaybooks();
  const lsu = books.find((book) => book.id === "lsu-2019-reference");
  const sticky = lsu.plays.find((play) => play.id === "lsu-stick");
  const yRoute = sticky.assignments.find((item) => item.id === "lsu-stick-y");

  assert.equal(yRoute.definition.stemYards, 5);
  assert.equal(yRoute.definition.condition, "Read man/zone; turn away from leverage.");
  assert.equal(yRoute.evidence.method, "source-explicit");
  assert.equal(yRoute.evidence.geometryBasis, "source-explicit");
  assert.equal(yRoute.evidence.confidence, "high");
  assert.equal(yRoute.geometryMode, "structured");
});

test("legacy plays gain editable defensive personnel and assignment timing", () => {
  const normalized = normalizePlay({
    ...clonePlaybook(plays[0]),
    defenders: undefined,
    assignments: [
      ...clonePlaybook(plays[0].assignments),
      { id: "extra-block", playerId: "o-lt", unit: "offense", type: "Block", points: [[-3.2, 0], [-1, 6]] },
    ],
  });

  assert.equal(normalized.defenders.length, baseDefenders.length);
  assert.equal(new Set(normalized.defenders.map((player) => player.id)).size, baseDefenders.length);
  const block = normalized.assignments.find((item) => item.id === "extra-block");
  assert.equal(block.unit, "offense");
  assert.equal(block.definition.technique, "drive");
  assert.equal(block.delay, 0);
  assert.equal(block.phase, "post");
});

test("assignments whose player no longer exists are dropped", () => {
  const normalized = normalizePlay({
    ...clonePlaybook(plays[0]),
    assignments: [
      ...clonePlaybook(plays[0].assignments),
      { id: "ghost", playerId: "o-does-not-exist", unit: "offense", type: "Route", points: [[0, 0], [0, 10]] },
    ],
  });
  assert.ok(!normalized.assignments.some((item) => item.id === "ghost"));
});

test("football block techniques produce distinct assignment geometry", () => {
  const start = [-1.6, 0];
  const drive = assignmentDefinitionToPoints(start, "Block", { technique: "drive" });
  const pull = assignmentDefinitionToPoints(start, "Block", { technique: "pull", direction: "right" });
  const passSet = assignmentDefinitionToPoints(start, "Block", { technique: "pass-set", direction: "left" });

  assert.deepEqual(drive[0], start);
  assert.ok(drive.at(-1)[1] > start[1], "a drive block works downfield");
  assert.ok(pull.length > drive.length);
  assert.ok(pull.at(-1)[0] > start[0]);
  assert.ok(passSet.at(-1)[1] < start[1], "a pass set retreats behind the line");
});

test("defensive responsibilities generate unit-appropriate landmarks", () => {
  const rush = assignmentDefinitionToPoints([-6, 1], "Rush", { technique: "stunt", direction: "right" });
  const zone = assignmentDefinitionToPoints([-19, 7], "Zone", { area: "flat" });
  const fit = assignmentDefinitionToPoints([0, 5], "Fit", { responsibility: "A" });

  assert.ok(rush.at(-1)[1] < rush[0][1], "a rush attacks the offensive backfield");
  assert.deepEqual(zone.at(-1), [-20, 4]);
  assert.equal(fit.at(-1)[1], 1.5);
});

test("man coverage tracks the offensive player it is assigned to", () => {
  const play = normalizePlay(clonePlaybook(plays[0]));
  const target = byLabel(play.players, "Z");
  const points = manCoveragePoints(play, [19, 7], { targetId: target.id, leverage: "inside" });
  assert.ok(Math.abs(points.at(-1)[0] - target.x) <= 2, "finishes on the receiver's leverage");
  assert.ok(points.at(-1)[1] > target.y, "sits over the top of the receiver");
});

test("applying a formation translates matching assignments and preserves defense", () => {
  const source = normalizePlay(clonePlaybook(plays[0]));
  const xBefore = assignmentFor(source, "X").points[0];
  const applied = applyFormationToPlay(source, defaultFormations[1]);
  const xAfter = assignmentFor(applied, "X").points[0];

  assert.equal(applied.formation, "Doubles");
  assert.notDeepEqual(xAfter, xBefore);
  assert.ok(applied.assignments.some((item) => item.id === "mesh-defense-m-fit"));
  // the translated route still starts on the receiver
  const xPlayer = byLabel(applied.players, "X");
  assert.ok(Math.hypot(xAfter[0] - xPlayer.x, xAfter[1] - xPlayer.y) < 0.35);
});

test("applying a formation keeps player ids so assignments stay attached", () => {
  const source = normalizePlay(clonePlaybook(plays[0]));
  const applied = applyFormationToPlay(source, defaultFormations[1]);
  const sourceIds = new Set(source.players.map((player) => player.id));
  assert.ok(applied.players.every((player) => sourceIds.has(player.id)));
  assert.ok(applied.assignments.every((item) => (
    [...applied.players, ...applied.defenders].some((player) => player.id === item.playerId)
  )));
});

test("animation timing honors pre-snap and post-snap delays", () => {
  const motion = { type: "Motion", delay: -1.5, pace: 1, points: [[17, 0], [-8, 0]] };
  const route = { type: "Route", delay: 0.5, pace: 1, points: [[-20, 0], [-20, 25]] };

  assert.equal(assignmentStartSeconds(motion), 0.5);
  assert.equal(assignmentStartSeconds(route), 2.5);
  assert.ok(playDuration([motion, route]) > 2.5);
});

test("a player can own separate pre-snap and post-snap assignments", () => {
  const normalized = normalizePlay({
    ...clonePlaybook(plays[0]),
    assignments: [
      { id: "h-motion", playerId: "o-h", unit: "offense", type: "Motion", points: [[1.5, -6.5], [-12, -6.5]], phase: "pre" },
      { id: "h-route", playerId: "o-h", unit: "offense", type: "Route", points: [[1.5, -6.5], [1.5, 12]], phase: "post" },
    ],
  });

  const hAssignments = normalized.assignments.filter((item) => item.playerId === "o-h");
  assert.equal(hAssignments.length, 2);
  assert.deepEqual(hAssignments.map((item) => item.phase), ["pre", "post"]);
  assert.ok(assignmentStartSeconds(hAssignments[0]) < assignmentStartSeconds(hAssignments[1]));
});

test("concept templates translate assignments to matching positions", () => {
  const source = normalizePlay(clonePlaybook(plays[0]));
  const template = createConceptTemplate(source, { id: "mesh-template", name: "Mesh" });
  const target = createPlayFromFormation({
    formation: defaultFormations[1],
    id: "mesh-doubles",
    name: "Mesh Doubles",
  });
  const applied = applyConceptTemplateToPlay(target, template);
  const sourceX = byLabel(source.players, "X");
  const targetX = byLabel(applied.players, "X");
  const sourceXAssignment = assignmentFor(source, "X");
  const targetXAssignment = assignmentFor(applied, "X");

  assert.equal(applied.conceptTemplateId, template.id);
  assert.equal(applied.family, "Mesh");
  assert.deepEqual(targetXAssignment.points[0], [targetX.x, targetX.y]);
  assert.equal(
    Math.round(targetXAssignment.points.at(-1)[0] - targetX.x),
    Math.round(sourceXAssignment.points.at(-1)[0] - sourceX.x),
  );
  assert.equal(targetXAssignment.inheritedFrom.conceptId, template.id);
});

test("concepts store their position label so they survive an id change", () => {
  const source = normalizePlay(clonePlaybook(plays[0]));
  const template = createConceptTemplate(source, { id: "mesh-template", name: "Mesh" });
  assert.ok(template.assignments.every((item) => typeof item.positionLabel === "string" && item.positionLabel.length > 0));
});

test("reapplying a concept preserves explicit play-level overrides", () => {
  const template = createConceptTemplate(normalizePlay(clonePlaybook(plays[0])), { id: "mesh-template", name: "Mesh" });
  const target = createPlayFromFormation({
    formation: defaultFormations[0],
    id: "mesh-override",
    name: "Mesh Override",
  });
  const firstPass = applyConceptTemplateToPlay(target, template);
  const xPlayer = byLabel(firstPass.players, "X");
  const overridden = {
    ...firstPass,
    assignments: firstPass.assignments.map((item) => (
      item.playerId === xPlayer.id && item.phase === "post"
        ? { ...item, points: [[xPlayer.x, xPlayer.y], [0, 20]], templateOverride: true }
        : item
    )),
  };
  const reapplied = applyConceptTemplateToPlay(overridden, template);
  const xAssignment = reapplied.assignments.find((item) => item.playerId === xPlayer.id && item.phase === "post");

  assert.deepEqual(xAssignment.points, [[xPlayer.x, xPlayer.y], [0, 20]]);
  assert.equal(xAssignment.templateOverride, true);
});

/* ---------------- legacy percent-space migration ---------------- */

const legacyPlay = () => ({
  id: "legacy",
  name: "Legacy Play",
  family: "Mesh",
  personnel: "11 Personnel",
  formation: "Trips Right Open",
  players: [["X", 14, 73], ["Y", 29, 78], ["LT", 40, 73], ["LG", 45, 73], ["C", 50, 73],
    ["RG", 55, 73], ["RT", 60, 73], ["F", 67, 78], ["Q", 50, 80], ["H", 50, 89], ["Z", 82, 73]],
  defenders: [{ id: "CB-L", label: "C", x: 15, y: 32 }, { id: "M", label: "M", x: 50, y: 48 }],
  routes: [
    { id: "lx", player: "X", type: "Route", preset: "Go", pace: 1, points: [[14, 73], [14, 45]] },
    { id: "lm", player: "M", unit: "defense", type: "Man", definition: { target: "Z", leverage: "inside" }, points: [[50, 48], [80, 60]] },
  ],
});

test("legacy plays are detected by shape, not by a version field", () => {
  assert.equal(isLegacyPlay(legacyPlay()), true);
  assert.equal(isLegacyPlay(normalizePlay(legacyPlay())), false);
  // A formation normalized as an assignment-free play must not look legacy.
  assert.equal(isLegacyPlay({ players: clonePlaybook(basePlayers), routes: [] }), false);
});

test("legacy percent coordinates convert to yards from the line of scrimmage", () => {
  const migrated = normalizePlay(legacyPlay());
  const centre = byLabel(migrated.players, "C");
  assert.deepEqual([centre.x, centre.y], [0, 0]);
  // x = 14 sat 36 percent-units left of centre, i.e. 36 * 0.533 yd.
  assert.equal(byLabel(migrated.players, "X").x, -19.2);
  // The quarterback was 7 units behind the LOS, i.e. 7 * (10/13) yd.
  assert.equal(byLabel(migrated.players, "Q").y, -5.4);
  // A 28-unit stem is 21.5 yd.
  assert.deepEqual(migrated.assignments[0].points, [[-19.2, 0], [-19.2, 21.5]]);
});

test("legacy assignments rebind from labels and defender ids to player ids", () => {
  const migrated = normalizePlay(legacyPlay());
  const xPlayer = byLabel(migrated.players, "X");
  const zPlayer = byLabel(migrated.players, "Z");

  assert.equal(migrated.assignments[0].playerId, xPlayer.id);
  assert.ok(!("player" in migrated.assignments[0]));
  // Defender ids were already stable, so they carry over verbatim.
  assert.equal(migrated.assignments[1].playerId, "M");
  // Man coverage moves from a label reference to an id reference.
  assert.equal(migrated.assignments[1].definition.targetId, zPlayer.id);
});

test("migration is idempotent", () => {
  const once = normalizePlay(legacyPlay());
  const twice = normalizePlay(clonePlaybook(once));
  assert.deepEqual(twice.players, once.players);
  assert.deepEqual(twice.assignments, once.assignments);
});

test("migrating a roster preserves ids that already exist", () => {
  const migrated = migrateRoster(clonePlaybook(basePlayers), { unit: "offense" });
  assert.deepEqual(migrated.map((player) => player.id), basePlayers.map((player) => player.id));
  assert.deepEqual(migrated.map((player) => player.x), basePlayers.map((player) => player.x));
});

test("migrating a roster keeps duplicate labels on separate ids", () => {
  const migrated = migrateRoster([["E", 35, 61], ["E", 65, 61]], { unit: "defense" });
  assert.equal(new Set(migrated.map((player) => player.id)).size, 2);
  assert.deepEqual(migrated.map((player) => player.label), ["E", "E"]);
});

test("a migrated legacy play keeps its own alignment rather than the reseeded one", () => {
  // The seed formations were re-authored in yards; a coach's saved play must not
  // be silently snapped onto them.
  const migrated = migrateLegacyPlay(legacyPlay());
  assert.equal(byLabel(migrated.players, "H").y, -12.3);
  assert.notEqual(byLabel(migrated.players, "H").y, byLabel(basePlayers, "H").y);
});

test("dragging snaps to another player's row and column, and says whose", () => {
  const play = plays[0];
  const anchor = play.players.find((player) => player.label === "X");
  const mover = play.players.find((player) => player.label === "Z");
  const { point, guides } = snapDragTarget(play, "offense", mover.id, [anchor.x + 0.2, anchor.y - 6.3]);
  assert.equal(point[0], anchor.x);
  assert.equal(guides.x.playerId, anchor.id);
  assert.equal(guides.y, null);
});

test("dragging beyond the snap window moves freely, rounded to a tenth", () => {
  const play = plays[0];
  const mover = play.players.find((player) => player.label === "Z");
  const { point, guides } = snapDragTarget(play, "offense", mover.id, [4.4401, -6.3399]);
  assert.deepEqual(point, [4.4, -6.3]);
  assert.equal(guides.x, null);
  assert.equal(guides.y, null);
});

test("Alt drags free even inside the snap window", () => {
  const play = plays[0];
  const anchor = play.players.find((player) => player.label === "X");
  const mover = play.players.find((player) => player.label === "Z");
  const { point, guides } = snapDragTarget(play, "offense", mover.id, [anchor.x + 0.2, -6.3], { free: true });
  assert.equal(point[0], Math.round((anchor.x + 0.2) * 10) / 10);
  assert.equal(guides.x, null);
});

test("an offensive player near the line snaps onto it, outranking a row magnet", () => {
  const play = plays[0];
  const mover = play.players.find((player) => player.label === "Z");
  const { point } = snapDragTarget(play, "offense", mover.id, [17, 0.6]);
  assert.equal(point[1], 0);
});

test("a defender is never pulled onto the LOS by the offensive line snap", () => {
  const play = plays[0];
  const mover = play.defenders[0];
  const { point } = snapDragTarget(play, "defense", mover.id, [17.77, 0.62]);
  assert.notEqual(point[1], 0);
});

test("the dragged player is not its own magnet", () => {
  const play = plays[0];
  const mover = play.players.find((player) => player.label === "Z");
  const { guides } = snapDragTarget(play, "offense", mover.id, [mover.x + 0.2, mover.y - 4]);
  assert.notEqual(guides.x?.playerId, mover.id);
});

test("a play diffs empty against itself and against no base", () => {
  assert.equal(changedAssignmentIds(plays[0], plays[0]).size, 0);
  assert.equal(changedAssignmentIds(plays[0], null).size, 0);
});

test("family variants flag exactly the assignments that differ from the base", () => {
  const base = plays[0];
  for (const variant of plays.slice(1)) {
    const changed = changedAssignmentIds(variant, base);
    for (const item of variant.assignments) {
      const flagged = changed.has(item.id);
      // Re-derive the expectation independently: match by player label + phase.
      const label = (p, id) => [...p.players, ...p.defenders].find((pl) => pl.id === id)?.label;
      const counterpart = base.assignments.find((other) =>
        label(base, other.playerId) === label(variant, item.playerId) && other.phase === item.phase);
      const same = counterpart && counterpart.type === item.type
        && counterpart.points.length === item.points.length
        && counterpart.points.every(([x, y], i) => Math.abs(x - item.points[i][0]) <= 2 && Math.abs(y - item.points[i][1]) <= 2);
      assert.equal(flagged, !same, `${variant.name}/${item.id}`);
    }
    // A variant must differ somewhere, or it would not be a variant.
    assert.ok(changed.size > 0, `${variant.name} should differ from ${base.name}`);
  }
});

test("re-spacing is ignored, a re-route or shape change is flagged", () => {
  const base = plays[0];
  const copy = clonePlaybook([base])[0];
  copy.id = "copy";
  copy.assignments = copy.assignments.map((item, index) => index === 0
    ? { ...item, points: item.points.map(([x, y]) => [x + 1.4, y]) }
    : item);
  assert.equal(changedAssignmentIds(copy, base).size, 0, "1.4 yd re-spacing ignored");
  copy.assignments = copy.assignments.map((item, index) => index === 0
    ? { ...item, points: item.points.map(([x, y]) => [x + 6, y]) }
    : item);
  assert.equal(changedAssignmentIds(copy, base).size, 1, "6 yd re-route flagged");
  copy.assignments = copy.assignments.map((item, index) => index === 1
    ? { ...item, points: [...item.points, [0, 30]] }
    : item);
  assert.equal(changedAssignmentIds(copy, base).size, 2, "extra break flagged as a shape change");
});
