/**
 * The route vocabulary
 * ====================
 *
 * A playbook does not draw every route. It writes `X Slant` and trusts the
 * receiver to know what a slant is. This module is that shared knowledge: a
 * name maps to a shape, and the shape mirrors itself onto whichever side of
 * the formation the receiver lines up on.
 *
 * Why the vocabulary is worth having as its own thing:
 *
 *   - The source playbooks are written in it. Transcribing "617 Switch" means
 *     writing five names, not twenty hand-measured coordinates, so a play is
 *     checkable against the page it came from at a glance.
 *   - A named route stays editable. Side-stable routes are stored as the app's
 *     structured definition (`release` / `stemYards` / `breaks`), so opening one
 *     in the inspector shows "12 yd stem, break out" rather than a frozen
 *     polyline a coach can only redraw.
 *
 * Depths are the conventional coaching numbers, not measurements: the diagrams
 * these came from carry no yardage annotations at all. That is why an imported
 * play records `method: "labels-and-geometry"` -- the route *names* are quoted
 * verbatim from the source and are certain; the depths are this module's
 * convention and a coach should feel free to overrule them.
 *
 * Mirroring
 * ---------
 * Two mechanisms, because one does not cover both cases.
 *
 * Side-stable routes (everything that breaks and stays on its own half) use
 * structured definitions. `routeDefinitionToPoints` resolves `inside`/`outside`
 * through `lateralDirection`, which reads the sign of the player's x -- so one
 * definition serves the left slot and the right slot with no duplication.
 *
 * Crossing routes cannot use that. `lateralDirection` re-reads the sign at
 * every break, so a shallow starting at x = -10 flips direction the moment it
 * passes the centre line and turns back the way it came. Crossers are therefore
 * authored as explicit points against an inward sign fixed once at the snap.
 */

/** Which way is "toward the middle" for a player aligned at `x`. */
const inwardFrom = (x) => (x < 0 ? 1 : -1);

/** A structured route: stem straight, then break. */
const structured = (stemYards, breaks = [], release = "none") => ({
  kind: "structured",
  definition: { release, stemYards, breaks, condition: "" },
});

/** One break leg. `angle` is measured off vertical, so 90 is a square cut. */
const leg = (direction, angle, distanceYards) => ({ direction, angle, distanceYards });

/**
 * A crossing route, authored as points relative to the player's alignment.
 * `into` is +1 when the receiver works from the left half toward the right.
 */
const crosser = (shape) => ({ kind: "crosser", shape });

/**
 * The vocabulary itself. Names are spelled exactly as the source playbooks
 * spell them, because that is what a coach will search for.
 */
export const ROUTE_VOCABULARY = {
  /* --- Vertical --- */
  // Deep enough to reach the top of the fixed play window without clipping.
  Go: structured(35),
  Clear: structured(35),
  Fade: structured(14, [leg("outside", 22, 21)], "outside"),

  /* --- Quick game --- */
  // A hitch is a six-yard stop that works back toward the throw. 135 is as far
  // back as a break can point -- `sanitizeRouteDefinition` clamps the angle
  // there -- so comebacks are authored at exactly that rather than past it.
  Hitch: structured(6, [leg("inside", 135, 1.6)]),
  // The source writes this one out longhand: "2-3 Yd. Hitch".
  "Short Hitch": structured(2.5, [leg("inside", 135, 1.2)]),
  // Three steps and in, flattening as it climbs.
  Slant: structured(2.5, [leg("inside", 52, 9)]),
  Stick: structured(5.5, [leg("outside", 68, 3.8)]),
  // Breaks either way off leverage; drawn to the inside as the base rule.
  Option: structured(5.5, [leg("inside", 62, 2.8)]),
  // Out at five, then pivot back under the defender who jumped it.
  Pivot: structured(4.5, [leg("outside", 78, 2.6), leg("inside", 96, 4.2)]),

  /* --- Intermediate --- */
  Out: structured(12, [leg("outside", 90, 5.5)]),
  Curl: structured(13, [leg("inside", 135, 2.4)]),
  // Long enough that a dig from either slot finishes past the middle of the
  // field, which is where the diagrams show every one of them ending up.
  Dig: structured(12, [leg("inside", 90, 14)]),
  Sail: structured(10, [leg("outside", 42, 5), leg("outside", 30, 5.5)], "outside"),

  /* --- Deep --- */
  Post: structured(11, [leg("inside", 30, 12.5)]),
  Corner: structured(11, [leg("outside", 32, 12)]),
  // Double move: stem, break to the post, then back out to the corner.
  "Post Corner": structured(10, [leg("inside", 34, 4.5), leg("outside", 36, 11)]),
  /*
   * The book's cover-2 beater. Available but unused by the transcription: the
   * "98 Shakes" page draws the double move but prints the call as "X Corner",
   * and a printed label outranks what the drawing appears to show.
   */
  Shakes: structured(6, [leg("inside", 40, 3.5), leg("outside", 34, 14)]),

  /* --- To the flat --- */
  /*
   * The flat routes all climb more than their name suggests, because most of
   * the players running them start five yards deep. Angles here are measured
   * off vertical, so a truly flat break out of the backfield would finish
   * behind the line of scrimmage and never threaten anyone.
   */
  // Narrower than a shoot: run by an outside receiver it would otherwise
  // finish past the sideline from a 20-yard split.
  Flat: structured(0, [leg("outside", 52, 3), leg("outside", 74, 4)]),
  // A back or slot releasing immediately, working out and across the line.
  Shoot: structured(0, [leg("outside", 55, 5), leg("outside", 68, 6)]),
  // A swing loses ground before it gains any -- that is what makes it a swing.
  Swing: structured(0, [leg("outside", 104, 4.5), leg("outside", 62, 7)]),
  // Out to the flat and straight up the sideline.
  Wheel: structured(0, [leg("outside", 72, 4.5), leg("outside", 12, 18)]),
  // The back releases vertically instead of to the flat ("98 T-go").
  "T Go": structured(22, [], "outside"),

  /* --- Crossers: authored, because a resolved break would flip at midfield --- */
  // Under the linebackers and all the way across.
  Shallow: crosser([[4, 2.6], [15, 5.2], [27, 5.8]]),
  // Deeper than a shallow, climbing as it goes.
  Cross: crosser([[4.5, 4.5], [15, 9.5], [25, 11.5]]),
  // Two crossers rubbing at the centre; shallower and flatter than a cross.
  Mesh: crosser([[4, 4.2], [14, 5.6], [25, 7]]),
  // Curl to the middle rather than back to the sideline.
  "Middle Curl": crosser([[4, 9], [7.5, 11], [6.5, 9.5]]),
};

export const routeNames = Object.keys(ROUTE_VOCABULARY);

/**
 * Resolves a route name into something `resolveAssignment` can consume:
 * either a structured `definition` it will convert, or explicit `points`.
 *
 * @param name     a key of ROUTE_VOCABULARY
 * @param alignment [x, y] of the player running it, in yards
 */
export function routeFromVocabulary(name, alignment) {
  const entry = ROUTE_VOCABULARY[name];
  if (!entry) throw new Error(`Unknown route "${name}"`);
  if (entry.kind === "structured") return { definition: entry.definition };

  const [x, y] = alignment;
  const into = inwardFrom(x);
  return { points: [[x, y], ...entry.shape.map(([across, depth]) => [x + into * across, y + depth])] };
}

/**
 * How fast a route is run, relative to the play's base tempo.
 *
 * Quick-game routes beat the pass rush and deep routes eat clock, and the
 * playback timing is derived from path length alone -- so without this a hitch
 * and a go would both look like a jog. The numbers are the same ones the
 * existing seeded plays were tuned to by eye.
 */
const PACE = {
  Go: 1.08, Clear: 1.08, Fade: 1.06,
  Slant: 0.88, Hitch: 0.9, "Short Hitch": 0.86, Stick: 0.94, Option: 0.94, Pivot: 0.92,
  Shoot: 0.84, Flat: 0.86, Swing: 0.86, Wheel: 0.9, "T Go": 1.0,
  Post: 1.02, Corner: 1.02, "Post Corner": 1.0, Shakes: 1.0, Sail: 0.98,
  Shallow: 0.92, Mesh: 0.92, Cross: 0.94, Dig: 0.96, Curl: 0.94, "Middle Curl": 0.9,
  Out: 0.96,
};

export const routePace = (name) => PACE[name] ?? 1;
