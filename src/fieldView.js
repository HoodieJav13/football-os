import { FIELD, FIELD_WINDOW } from "./playData.js";

/**
 * Field yards -> SVG user space.
 *
 * The single rule this module exists to enforce: both axes share ONE scale, so a
 * lateral yard and a vertical yard are the same length on screen. The previous
 * implementation used separate x and y factors plus `preserveAspectRatio="none"`,
 * which stretched the field ~2.3x horizontally and by a different amount at every
 * viewport size.
 *
 * The window is anchored on the line of scrimmage and fixed in size, so every
 * play in a playbook renders at the same scale and is directly comparable. Where
 * the viewport is a different shape from the window, the non-binding axis is
 * *extended* to show more field (or out-of-bounds) rather than letterboxed, and
 * never distorted.
 */

/** Screen orientation per view. Downfield is up in the end-zone view, right in the sideline view. */
function orient(view) {
  return view === "side"
    // sideline: screen x follows downfield, screen y follows the lateral axis
    ? { toScreen: ([x, y]) => [y, x], windowWidth: FIELD_WINDOW.depthYards, windowHeight: FIELD_WINDOW.widthYards }
    // end zone: screen x follows the lateral axis, screen y is inverted downfield.
    // `0 - y` rather than `-y`, so a point on the LOS is 0 and never -0.
    : { toScreen: ([x, y]) => [x, 0 - y], windowWidth: FIELD_WINDOW.widthYards, windowHeight: FIELD_WINDOW.depthYards };
}

/** Centre of the required window, in screen-space yards. */
function windowCentre(view) {
  const depthCentre = (FIELD_WINDOW.downfieldYards - FIELD_WINDOW.behindYards) / 2;
  return view === "side" ? [depthCentre, 0] : [0, -depthCentre];
}

/**
 * @param {{width: number, height: number, view?: "end"|"side"}} viewport pixel size of the canvas
 * @returns projection describing the viewBox, the scale, and a point mapper
 */
export function fieldProjection({ width, height, view = "end" }) {
  const { toScreen, windowWidth, windowHeight } = orient(view);
  const safeWidth = width > 0 ? width : windowWidth;
  const safeHeight = height > 0 ? height : windowHeight;

  // One scale for both axes: whichever axis is tighter decides it.
  const pxPerYard = Math.min(safeWidth / windowWidth, safeHeight / windowHeight);
  const viewYardsWidth = safeWidth / pxPerYard;
  const viewYardsHeight = safeHeight / pxPerYard;
  const [centreX, centreY] = windowCentre(view);

  const minX = centreX - viewYardsWidth / 2;
  const minY = centreY - viewYardsHeight / 2;

  // The same visible area expressed in field terms, which is what the markings need.
  const depthRange = view === "side"
    ? [minX, minX + viewYardsWidth]
    : [-(minY + viewYardsHeight), -minY];
  const lateralRange = view === "side"
    ? [minY, minY + viewYardsHeight]
    : [minX, minX + viewYardsWidth];

  return {
    view,
    pxPerYard,
    /** visible yards downfield of the LOS, as [nearest, deepest] */
    depthRange,
    /** visible yards either side of the field centre, as [left, right] */
    lateralRange,
    // Deliberately unrounded: the viewBox aspect must match the viewport aspect
    // exactly, or SVG reintroduces a sub-pixel letterbox of its own.
    viewBox: `${minX} ${minY} ${viewYardsWidth} ${viewYardsHeight}`,
    bounds: { minX, minY, maxX: minX + viewYardsWidth, maxY: minY + viewYardsHeight },
    /** field yards -> SVG user units (which are also yards, just reoriented) */
    project: (point) => toScreen(point),
    /** a length in screen pixels, expressed in SVG user units, so it stays visually constant */
    pixels: (value) => value / pxPerYard,
    /** SVG user units -> field yards, for pointer input */
    unproject: view === "side" ? ([sx, sy]) => [sy, sx] : ([sx, sy]) => [sx, 0 - sy],
  };
}

const round = (value) => Math.round(value * 1000) / 1000;

/** Turns a list of field points into an SVG `points` attribute. */
export function polylinePoints(points, projection) {
  return points.map((point) => projection.project(point).join(",")).join(" ");
}

/** Turns a list of field points into an SVG path, for `animateMotion`. */
export function motionPath(points, projection) {
  return points
    .map((point) => projection.project(point))
    .map((point, index) => `${index ? "L" : "M"}${round(point[0])} ${round(point[1])}`)
    .join(" ");
}

/**
 * Converts a pointer position within the canvas box to field yards.
 * The inverse of `fieldProjection`, so drawing lands exactly under the finger.
 */
export function pointerToField({ clientX, clientY }, box, projection) {
  const screenX = projection.bounds.minX + ((clientX - box.left) / box.width) * (projection.bounds.maxX - projection.bounds.minX);
  const screenY = projection.bounds.minY + ((clientY - box.top) / box.height) * (projection.bounds.maxY - projection.bounds.minY);
  return projection.unproject([screenX, screenY]);
}

/**
 * Yard lines that fall inside the visible window, as field-y values.
 * Includes the LOS itself so it can be drawn as its own emphasised line.
 */
export function visibleYardLines(projection) {
  const step = FIELD.yardLineStepYards;
  const [low, high] = projection.depthRange;
  const lines = [];
  for (let depth = Math.ceil(low / step) * step; depth <= high; depth += step) lines.push(round(depth));
  return lines;
}

/**
 * Yard numbers, keyed to their true distance from the line of scrimmage.
 * The old implementation placed "10", "20" and "30" at depths of 3.9, 20.8 and
 * 37.7 yd, none of which sat on a yard line.
 */
export function yardNumbers(projection) {
  return visibleYardLines(projection)
    // Downfield only: a "10" behind the line of scrimmage reads as ambiguous.
    .filter((depth) => depth > 0 && depth % 10 === 0)
    .map((depth) => ({ depth, label: String(depth) }));
}

export { FIELD, FIELD_WINDOW };
