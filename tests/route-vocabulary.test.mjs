import assert from "node:assert/strict";
import test from "node:test";
import { ROUTE_VOCABULARY, routeFromVocabulary, routeNames, routePace } from "../src/routeVocabulary.js";
import { FIELD, FIELD_WINDOW, formationStatus, routeDefinitionToPoints, seedPlaybooks } from "../src/playData.js";

const airRaid = seedPlaybooks.find((book) => book.id === "air-raid-sample");
const play = (name) => airRaid.plays.find((item) => item.name === name);
const call = (playName, label) => play(playName).assignments.find((item) => item.playerId === `o-${label.toLowerCase()}`);

/** Where a named route actually finishes, for a player aligned at [x, y]. */
function endOf(name, alignment) {
  const geometry = routeFromVocabulary(name, alignment);
  const points = geometry.points ?? routeDefinitionToPoints(alignment, geometry.definition);
  return points.at(-1);
}

/* ------------------------------------------------------------------ *
 * The vocabulary
 * ------------------------------------------------------------------ */

test("every route in the vocabulary resolves into a drawable path", () => {
  for (const name of routeNames) {
    for (const alignment of [[-20, 0], [-10.5, -1.5], [3, -5], [10.5, -1.5], [20, 0]]) {
      const geometry = routeFromVocabulary(name, alignment);
      const points = geometry.points ?? routeDefinitionToPoints(alignment, geometry.definition);
      assert.ok(points.length >= 2, `${name} from ${alignment} produced ${points.length} point(s)`);
      assert.deepEqual(points[0], alignment, `${name} does not start on its player`);
      assert.ok(routePace(name) > 0, `${name} has no pace`);
    }
  }
});

test("an unknown route is a loud failure, not a silent straight line", () => {
  assert.throws(() => routeFromVocabulary("Corner Post", [0, 0]), /Unknown route "Corner Post"/);
});

test("a route run from either slot is the mirror of itself", () => {
  // The whole reason side-stable routes are stored as definitions rather than
  // points: one authored shape has to serve both sides of the formation.
  for (const name of routeNames.filter((item) => ROUTE_VOCABULARY[item].kind === "structured")) {
    const [leftX, leftY] = endOf(name, [-10.5, -1.5]);
    const [rightX, rightY] = endOf(name, [10.5, -1.5]);
    assert.ok(Math.abs(leftX + rightX) < 0.15, `${name} is lopsided: ${leftX} vs ${rightX}`);
    assert.ok(Math.abs(leftY - rightY) < 0.15, `${name} finishes at different depths: ${leftY} vs ${rightY}`);
  }
});

test("crossing routes finish on the far side of the field", () => {
  /*
   * The bug this guards against is specific. `lateralDirection` re-reads the
   * sign of x at every break, so a crosser expressed as a structured route
   * turns around the moment it passes the centre line and comes back. Crossers
   * are authored as points for exactly this reason; if one is ever converted
   * to a definition, this test fails.
   */
  for (const name of routeNames.filter((item) => ROUTE_VOCABULARY[item].kind === "crosser")) {
    if (name === "Middle Curl") continue; // Settles in the middle by design.
    for (const startX of [-20, -10.5, 10.5, 20]) {
      const [endX] = endOf(name, [startX, -1.5]);
      assert.ok(Math.sign(endX) !== Math.sign(startX) || endX === 0,
        `${name} from x=${startX} never crossed: finished at ${endX}`);
    }
  }
});

test("a middle curl settles in the middle rather than crossing out of it", () => {
  for (const startX of [-10.5, 10.5]) {
    const [endX] = endOf("Middle Curl", [startX, -1.5]);
    assert.ok(Math.abs(endX) < Math.abs(startX), "a middle curl should work back toward the ball");
    assert.ok(Math.abs(endX) < 8, `finished at ${endX}, which is not the middle`);
  }
});

test("routes that release to the flat gain ground out of the backfield", () => {
  /*
   * A back starts five yards deep, so a break authored truly flat -- 90 degrees
   * off vertical, which is how it reads on the page -- finishes behind the line
   * and threatens nobody. Every flat-releasing route climbs as it widens.
   */
  for (const name of ["Shoot", "Flat", "Wheel", "Swing"]) {
    const [endX, endY] = endOf(name, [3, -5]);
    assert.ok(endY > -5, `${name} from the backfield lost ground, finishing at ${endY} yd`);
    assert.ok(endX > 3, `${name} did not widen: finished at x=${endX}`);
  }
  // A shoot and a wheel are the two that have to actually threaten the flat.
  for (const name of ["Shoot", "Wheel"]) {
    assert.ok(endOf(name, [3, -5])[1] >= -1, `${name} never reached the line of scrimmage`);
  }
});

/* ------------------------------------------------------------------ *
 * The Air Raid transcription
 * ------------------------------------------------------------------ */

test("the Air Raid playbook holds all 48 diagrams from the source", () => {
  assert.equal(airRaid.plays.length, 48);
  assert.equal(new Set(airRaid.plays.map((item) => item.id)).size, 48);
  // Twelve play pages, four diagrams each.
  const pages = new Set(airRaid.plays.map((item) => item.sourcePage));
  assert.deepEqual([...pages].sort((a, b) => a - b), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
});

test("every Air Raid alignment is a legal formation", () => {
  for (const book of airRaid.formations) {
    const status = formationStatus(book.players);
    assert.ok(status.legal, `${book.name} is illegal: ${JSON.stringify(status)}`);
  }
  for (const item of airRaid.plays) {
    assert.ok(formationStatus(item.players).legal, `${item.name} lines up illegally`);
  }
});

test("every Air Raid play assigns all five eligible receivers and nobody twice", () => {
  for (const item of airRaid.plays) {
    assert.equal(item.assignments.length, 5, `${item.name} has ${item.assignments.length} assignments`);
    const owners = item.assignments.map((assignment) => assignment.playerId);
    assert.equal(new Set(owners).size, 5, `${item.name} assigns someone twice`);
  }
});

test("no Air Raid route leaves the field or the play window", () => {
  for (const item of airRaid.plays) {
    for (const assignment of item.assignments) {
      for (const [x, y] of assignment.points) {
        assert.ok(Math.abs(x) <= FIELD.bounds.maxX, `${item.name} · ${assignment.preset} runs to x=${x}`);
        assert.ok(y <= FIELD_WINDOW.downfieldYards, `${item.name} · ${assignment.preset} runs to y=${y}`);
        assert.ok(y >= -FIELD_WINDOW.behindYards, `${item.name} · ${assignment.preset} drops to y=${y}`);
      }
    }
  }
});

test("every Air Raid assignment records the call it was transcribed from", () => {
  for (const item of airRaid.plays) {
    for (const assignment of item.assignments) {
      assert.equal(assignment.evidence.method, "labels-and-geometry");
      assert.equal(assignment.evidence.coachEdited, false);
      assert.match(assignment.evidence.note, /^Source call: /);
      assert.equal(assignment.sourceLabel ?? item.sourceLabel, "Air Raid Offense — Passing Plays");
    }
  }
});

test("the transcription matches the page, call for call", () => {
  // Spot checks against the printed play sheets, one per family.
  assert.equal(call("60 Hitch", "X").preset, "Hitch");
  assert.equal(call("60 Hitch", "T").type, "Block");
  assert.equal(call("617 Switch", "Z").preset, "Corner");
  assert.equal(call("91 Y", "Z").preset, "2-3 Yd. Hitch");
  assert.equal(call("92 Mesh", "Y").preset, "Mesh");
  assert.equal(call("98 Shakes", "X").preset, "Corner");
  // The back's "Go" is his own vertical release, not a receiver's go route.
  assert.equal(call("98 T-go", "T").preset, "Go");
  assert.ok(call("98 T-go", "T").points.at(-1)[1] < 20, "the back should not run a 35-yard go");
});

test("a concept taught from two alignments keeps both, with the same calls", () => {
  /*
   * The book's actual teaching method: run the same five routes from the slot
   * and then from the backfield. Deduplicating by name would throw away the
   * half of the book that makes the point.
   */
  for (const [slot, ace] of [["93 H", "93 H (Ace)"], ["95 Y", "95 Y (Ace)"]]) {
    const calls = (name) => play(name).assignments.map((item) => item.preset).sort();
    assert.deepEqual(calls(slot), calls(ace), `${slot} and ${ace} should be the same call`);
    assert.notEqual(play(slot).formation, play(ace).formation);
  }
});

test("the back stays in front of the quarterback when he is kept in to protect", () => {
  // The generic pass-set geometry sets five yards deeper, which from the
  // backfield would put the back below the visible window entirely.
  for (const item of airRaid.plays) {
    for (const assignment of item.assignments.filter((entry) => entry.type === "Block")) {
      const [, endY] = assignment.points.at(-1);
      assert.ok(endY > -FIELD_WINDOW.behindYards, `${item.name}: protection ends at y=${endY}`);
      assert.ok(endY <= 0, `${item.name}: a protecting back should not cross the line`);
    }
  }
});
