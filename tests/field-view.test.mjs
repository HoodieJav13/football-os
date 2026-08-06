import assert from "node:assert/strict";
import test from "node:test";
import { createSeedPlaybooks, FIELD, FIELD_WINDOW } from "../src/playData.js";
import {
  fieldProjection,
  playBounds,
  pointerToField,
  polylinePoints,
  tokenMotionPath,
  ZOOM_MAX,
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

/* ---------------- phone framing ---------------- */

const PHONE_CANVAS = { width: 390, height: 556 };

test("a narrow canvas frames the play; a wide one keeps the fixed window", () => {
  const play = createSeedPlaybooks()[0].plays[0];
  const phone = fieldProjection({ ...PHONE_CANVAS, play });
  const tablet = fieldProjection({ width: 822, height: 516, play });

  // Fitting raises the scale on a phone...
  assert.ok(phone.pxPerYard > fieldProjection(PHONE_CANVAS).pxPerYard);
  // ...but only until the play's own width binds, which on a portrait phone it
  // always does. The loose axis then still extends past the fixed window, so the
  // gain is bounded by canvas width / play width and nothing else.
  const bounds = playBounds(play);
  const neededWidth = (bounds.maxX - bounds.minX) + 8;
  assert.ok(Math.abs(phone.pxPerYard - PHONE_CANVAS.width / neededWidth) < 0.01);

  // A tablet is wide enough to keep the fixed, fully comparable window.
  assert.equal(tablet.depthRange[1] - tablet.depthRange[0], FIELD_WINDOW.depthYards);
});

test("a fitted window still contains the whole play and the line of scrimmage", () => {
  for (const book of createSeedPlaybooks()) {
    for (const play of book.plays) {
      const projection = fieldProjection({ ...PHONE_CANVAS, play });
      const [near, far] = projection.depthRange;
      const [left, right] = projection.lateralRange;
      assert.ok(near <= 0 && far >= 0, `${play.id}: the LOS must stay in frame`);
      for (const item of play.assignments) {
        for (const [x, y] of item.points) {
          assert.ok(x >= left && x <= right, `${play.id}/${item.id}: x ${x} outside ${left}..${right}`);
          assert.ok(y >= near && y <= far, `${play.id}/${item.id}: y ${y} outside ${near}..${far}`);
        }
      }
    }
  }
});

test("fitting never distorts: one scale still governs both axes", () => {
  const play = createSeedPlaybooks()[0].plays[0];
  const projection = fieldProjection({ ...PHONE_CANVAS, play });
  const origin = projection.project([0, 0]);
  const across = projection.project([10, 0]);
  const upfield = projection.project([0, 10]);
  assert.ok(Math.abs(Math.hypot(across[0] - origin[0], across[1] - origin[1])
    - Math.hypot(upfield[0] - origin[0], upfield[1] - origin[1])) < 1e-9);
});

test("pointer input stays accurate under a fitted window", () => {
  const play = createSeedPlaybooks()[0].plays[0];
  const projection = fieldProjection({ ...PHONE_CANVAS, play });
  const box = { left: 0, top: 0, width: PHONE_CANVAS.width, height: PHONE_CANVAS.height };
  const target = [-11, 12];
  const [sx, sy] = projection.project(target);
  const clientX = ((sx - projection.bounds.minX) / (projection.bounds.maxX - projection.bounds.minX)) * box.width;
  const clientY = ((sy - projection.bounds.minY) / (projection.bounds.maxY - projection.bounds.minY)) * box.height;
  const back = pointerToField({ clientX, clientY }, box, projection);
  assert.ok(Math.hypot(back[0] - target[0], back[1] - target[1]) < 1e-9);
});

test("a token's motion path starts at zero and mirrors the absolute geometry", () => {
  const projection = fieldProjection({ ...IPAD, view: "end" });
  const origin = [4, 0];
  const points = [[4, 0], [4, 12], [9, 18]];
  const path = tokenMotionPath(points, projection, origin);
  // Anchored assignments start on their player, so the relative path must open at the origin.
  assert.ok(path.startsWith("M0 0"), path);
  // Each segment's offset must equal the projected absolute difference.
  const [ox, oy] = projection.project(origin);
  const [px, py] = projection.project([9, 18]);
  assert.ok(path.endsWith(`L${Math.round((px - ox) * 1000) / 1000} ${Math.round((py - oy) * 1000) / 1000}`), path);
});

test("a token's motion path never emits negative zero", () => {
  const projection = fieldProjection({ ...IPAD, view: "end" });
  const path = tokenMotionPath([[0, 0], [0, 10]], projection, [0, 0]);
  assert.ok(!path.includes("-0 "), path);
});

test("the sideline view frames the play at any canvas width", () => {
  const play = createSeedPlaybooks()[0].plays[0];
  const desktop = { width: 1200, height: 650 };
  const fitted = fieldProjection({ ...desktop, view: "side", play });
  const fixed = fieldProjection({ ...desktop, view: "side" });
  // Fitting must zoom in relative to the fixed window, never out.
  assert.ok(fitted.pxPerYard > fixed.pxPerYard,
    `fitted ${fitted.pxPerYard} should beat fixed ${fixed.pxPerYard}`);
  // And the play must still be fully inside the window.
  const bounds = playBounds(play);
  const [near, far] = fitted.depthRange;
  const [left, right] = fitted.lateralRange;
  assert.ok(bounds.minY >= near && bounds.maxY <= far, "depth in frame");
  assert.ok(bounds.minX >= left && bounds.maxX <= right, "width in frame");
});

test("zoom multiplies the scale and keeps its centre put", () => {
  const base = fieldProjection(IPAD);
  const zoomed = fieldProjection({ ...IPAD, zoom: { factor: 2, centre: [5, 8] } });
  assert.ok(Math.abs(zoomed.pxPerYard - base.pxPerYard * 2) < 1e-9);
  const [left, right] = zoomed.lateralRange;
  const [near, far] = zoomed.depthRange;
  assert.ok(Math.abs((left + right) / 2 - 5) < 1e-9);
  assert.ok(Math.abs((near + far) / 2 - 8) < 1e-9);
});

test("zoom clamps to its maximum and a unit factor is a no-op", () => {
  const base = fieldProjection(IPAD);
  const capped = fieldProjection({ ...IPAD, zoom: { factor: 40, centre: [0, 0] } });
  assert.ok(Math.abs(capped.pxPerYard - base.pxPerYard * ZOOM_MAX) < 1e-9);
  const unit = fieldProjection({ ...IPAD, zoom: { factor: 1, centre: [9, 9] } });
  assert.equal(unit.viewBox, base.viewBox);
});

test("panning cannot leave the base framing", () => {
  const base = fieldProjection(IPAD);
  const dragged = fieldProjection({ ...IPAD, zoom: { factor: 2, centre: [500, -500] } });
  // The clamped window must stay inside what the unzoomed view showed.
  assert.ok(dragged.lateralRange[1] <= base.lateralRange[1] + 1e-9);
  assert.ok(dragged.depthRange[0] >= base.depthRange[0] - 1e-9);
});

test("pointer input stays accurate through a zoom", () => {
  const zoom = { factor: 3, centre: [-4, 6] };
  const projection = fieldProjection({ ...IPAD, zoom });
  const box = { left: 0, top: 0, width: IPAD.width, height: IPAD.height };
  const target = [-6, 9];
  const [sx, sy] = projection.project(target);
  const clientX = ((sx - projection.bounds.minX) / (projection.bounds.maxX - projection.bounds.minX)) * box.width;
  const clientY = ((sy - projection.bounds.minY) / (projection.bounds.maxY - projection.bounds.minY)) * box.height;
  const back = pointerToField({ clientX, clientY }, box, projection);
  assert.ok(Math.hypot(back[0] - target[0], back[1] - target[1]) < 1e-9);
});

test("presentation frames the play, and never shrinks it", () => {
  const play = createSeedPlaybooks()[0].plays[0];
  // A phone in landscape: editing fits (narrow canvas), presenting widens it
  // past the width threshold, which used to flip it back to the fixed window.
  const editing = fieldProjection({ width: 548, height: 390, play });
  const presenting = fieldProjection({ width: 844, height: 390, play, framePlay: true });
  assert.ok(presenting.pxPerYard >= editing.pxPerYard,
    `presenting must not shrink the play: ${editing.pxPerYard.toFixed(2)} -> ${presenting.pxPerYard.toFixed(2)} px/yd`);
  const bounds = playBounds(play);
  const [near, far] = presenting.depthRange;
  const [left, right] = presenting.lateralRange;
  assert.ok(bounds.minY >= near && bounds.maxY <= far, "the play stays in frame");
  assert.ok(bounds.minX >= left && bounds.maxX <= right, "the play stays in frame");
});

test("editing keeps the fixed, comparable window wherever it fits", () => {
  const play = createSeedPlaybooks()[0].plays[0];
  for (const canvas of [{ width: 1440, height: 900 }, { width: 908, height: 426 }, { width: 808, height: 526 }]) {
    assert.equal(
      fieldProjection({ ...canvas, play }).viewBox,
      fieldProjection(canvas).viewBox,
      `${canvas.width}x${canvas.height}: a play must not change editing framing`,
    );
  }
});
