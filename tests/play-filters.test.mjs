import assert from "node:assert/strict";
import test from "node:test";
import { createSeedPlaybooks, plays } from "../src/playData.js";
import {
  activePlayFilterCount,
  createEmptyPlayFilters,
  createFamilyBases,
  createPlayFilterOptions,
  filterPlays,
} from "../src/playFilters.js";

test("structured filters combine personnel, formation, family, protection, and blocking scheme", () => {
  const filters = {
    ...createEmptyPlayFilters(),
    personnel: "10 Personnel",
    formation: "Trips Right Open",
    family: "Mesh",
    protection: "Texas",
    blockingScheme: "Quick Pass Set",
  };
  assert.deepEqual(filterPlays(plays, filters).map((play) => play.name), ["Mesh", "Mesh Sit"]);
  assert.equal(activePlayFilterCount(filters), 5);
});

test("search and folder narrow the same structured result set", () => {
  const filters = {
    ...createEmptyPlayFilters(),
    query: "wheel",
    folder: "Dropback",
    family: "Mesh",
  };
  assert.deepEqual(filterPlays(plays, filters).map((play) => play.name), ["Mesh Wheel"]);
});

test("reference search finds both the source call and the clean concept name", () => {
  const references = createSeedPlaybooks().find((book) => book.id === "air-raid-reference").plays;
  assert.deepEqual(filterPlays(references, { ...createEmptyPlayFilters(), query: "91 y" }).map((play) => play.id), ["air-91-y-smash"]);
  assert.deepEqual(filterPlays(references, { ...createEmptyPlayFilters(), query: "smash" }).map((play) => play.id), ["air-91-y-smash"]);
});

test("filter options are sorted, unique, and omit empty values", () => {
  const options = createPlayFilterOptions(plays);
  assert.deepEqual(options.family, ["Inside Zone RPO", "Mesh", "Stick", "Y Cross"]);
  assert.deepEqual(options.protection, ["Florida", "Run Action", "Texas"]);
  assert.ok(options.blockingScheme.every(Boolean));
});

test("family bases remain stable regardless of filtered results", () => {
  const bases = createFamilyBases(plays);
  assert.equal(bases.get("Mesh").name, "Mesh");
  assert.equal(bases.get("Stick").name, "Trips Right Stick");
});
