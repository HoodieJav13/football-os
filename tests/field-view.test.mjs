import assert from "node:assert/strict";
import test from "node:test";
import { FIELD, FIELD_WINDOW } from "../src/playData.js";
import {
  fieldProjection,
  pointerToField,
  polylinePoints,
  visibleYardLines,
  yardNumbers,
} from "../src/fieldView.js";

const IPAD = { width: 822, height: 516 };
const PHONE = { width: 390, height: 500 };

test("both axes share one scale, so a yard is a yard in every direction", () => {
  for (const viewport of [IPAD, PHONE, { width: 600, height: 600 }]) {
    for (const view of ["end", "side"]) {
      const projection = fieldProjection({ ...viewport, view });
      const origin = projection.project([0, 0]);
      const across = projection.project([10, 0]);
      const upfield = projection.project([0, 10]);

      const acrossLength = Math.hypot(across[0] - origin[0], across[1] - origin[1]);
      const upfieldLength = Math.hypot(upfield[0] - origin[0], upfield[1] - origin[1]);
      assert.ok(
        Math.abs(acrossLength - upfieldLength) < 1e-9,
        `${view} at ${viewport.width}x${viewport.height}: ${acrossLength} vs ${upfieldLength}`,
      );
    }
  }
});

test("the viewBox matches the viewport aspect, so nothing is stretched or letterboxed", () => {
  for (const viewport of [IPAD, PHONE, { width: 1000, height: 300 }]) {
    const projection = fieldProjection(viewport);
    const [, , width, height] = projection.viewBox.split(" ").map(Number);
    assert.ok(
      Math.abs(width / height - viewport.width / viewport.height) < 1e-6,
      `${viewport.width}x${viewport.height} -> viewBox ${projection.viewBox}`,
    );
  }
});

test("the required window always fits, and the loose axis shows more field rather than less", () => {
  for (const viewport of [IPAD, PHONE, { width: 1400, height: 400 }, { width: 400, height: 900 }]) {
    const projection = fieldProjection(viewport);
    const { bounds } = projection;
    // the whole lateral window is inside the view
    assert.ok(bounds.minX <= -FIELD_WINDOW.widthYards / 2 + 1e-9);
    assert.ok(bounds.maxX >= FIELD_WINDOW.widthYards / 2 - 1e-9);
    // and the whole depth window too (screen y is inverted downfield)
    assert.ok(-bounds.minY >= FIELD_WINDOW.downfieldYards - 1e-9);
    assert.ok(-bounds.maxY <= -FIELD_WINDOW.behindYards + 1e-9);
  }
});

test("the scale is identical for every play, so plays are comparable", () => {
  // The projection depends only on the viewport, never on play content.
  const a = fieldProjection(IPAD);
  const b = fieldProjection(IPAD);
  assert.equal(a.pxPerYard, b.pxPerYard);
  assert.equal(a.viewBox, b.viewBox);
});

test("the line of scrimmage is the origin in both views", () => {
  assert.deepEqual(fieldProjection({ ...IPAD, view: "end" }).project([0, 0]), [0, 0]);
  assert.deepEqual(fieldProjection({ ...IPAD, view: "side" }).project([0, 0]), [0, 0]);
});

test("downfield is up in the end-zone view and right in the sideline view", () => {
  const end = fieldProjection({ ...IPAD, view: "end" });
  const side = fieldProjection({ ...IPAD, view: "side" });
  assert.ok(end.project([0, 10])[1] < end.project([0, 0])[1], "up the screen");
  assert.ok(side.project([0, 10])[0] > side.project([0, 0])[0], "right across the screen");
});

test("projecting and unprojecting round trips", () => {
  for (const view of ["end", "side"]) {
    const projection = fieldProjection({ ...IPAD, view });
    for (const point of [[0, 0], [-20, 12], [17, -6.5], [24.2, 36.9]]) {
      assert.deepEqual(projection.unproject(projection.project(point)), point);
    }
  }
});

test("pointer input maps back to the field point under the cursor", () => {
  const projection = fieldProjection({ ...IPAD, view: "end" });
  const box = { left: 100, top: 50, width: IPAD.width, height: IPAD.height };
  // the centre of the box is the centre of the window
  const centre = pointerToField(
    { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 },
    box,
    projection,
  );
  const expectedDepth = (FIELD_WINDOW.downfieldYards - FIELD_WINDOW.behindYards) / 2;
  assert.ok(Math.abs(centre[0]) < 1e-9);
  assert.ok(Math.abs(centre[1] - expectedDepth) < 1e-9);

  // and a round trip through project() lands back where it started
  const target = [-14, 8];
  const [screenX, screenY] = projection.project(target);
  const clientX = box.left + ((screenX - projection.bounds.minX) / (projection.bounds.maxX - projection.bounds.minX)) * box.width;
  const clientY = box.top + ((screenY - projection.bounds.minY) / (projection.bounds.maxY - projection.bounds.minY)) * box.height;
  const recovered = pointerToField({ clientX, clientY }, box, projection);
  assert.ok(Math.hypot(recovered[0] - target[0], recovered[1] - target[1]) < 1e-9);
});

test("a fixed pixel size converts to a constant on-screen length", () => {
  const projection = fieldProjection(IPAD);
  assert.ok(Math.abs(projection.pixels(44) * projection.pxPerYard - 44) < 1e-9);
});

test("yard lines land on real five-yard increments and include the line of scrimmage", () => {
  const lines = visibleYardLines(fieldProjection(IPAD));
  assert.ok(lines.includes(0), "the line of scrimmage is present");
  assert.ok(lines.every((depth) => depth % FIELD.yardLineStepYards === 0));
  assert.ok(lines.includes(10) && lines.includes(20) && lines.includes(30));
});

test("yard numbers sit on the yard line they name", () => {
  const projection = fieldProjection(IPAD);
  const lines = new Set(visibleYardLines(projection));
  for (const { depth, label } of yardNumbers(projection)) {
    assert.ok(lines.has(depth), `${label} at depth ${depth} is not on a yard line`);
    assert.equal(Number(label), Math.abs(depth), "the number states its true distance from the LOS");
  }
});

test("polyline points are emitted in projected order", () => {
  const projection = fieldProjection({ ...IPAD, view: "end" });
  const attribute = polylinePoints([[0, 0], [0, 10]], projection);
  assert.equal(attribute, "0,0 0,-10");
});
