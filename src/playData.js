export const MAIN_PLAYBOOK_ID = "personal-active";

/**
 * Field model
 * -----------
 * Every stored coordinate is in YARDS:
 *   x  yards right of the field's centre line (offense's right is positive)
 *   y  yards downfield of the line of scrimmage (the backfield is negative)
 *
 * There is no separate "canvas space" and no percentage space. The LOS is the
 * origin, so a route's stem depth in the inspector and its y coordinate on the
 * field are the same number, and both axes share one scale.
 */
export const FIELD = {
  // A regulation field is 53 1/3 yards between the sidelines.
  halfWidthYards: 26.65,
  // High-school hash marks sit 53'4" apart, i.e. 8.89 yd either side of centre.
  hashFromCentreYards: 8.89,
  // Yard lines are drawn every 5 yards; numbers every 10.
  yardLineStepYards: 5,
  // Editing bounds: a little past each sideline so a route can break out of bounds.
  bounds: { minX: -30, maxX: 30, minY: -18, maxY: 55 },
};

/**
 * The visible window is fixed and anchored on the LOS, so every play in a
 * playbook renders at exactly the same scale and is directly comparable.
 * Sized to contain the deepest seeded route (36.9 yd) without clipping.
 */
export const FIELD_WINDOW = {
  behindYards: 8,
  downfieldYards: 38,
  get depthYards() { return this.behindYards + this.downfieldYards; },
  get widthYards() { return FIELD.halfWidthYards * 2; },
};

/**
 * Diagram spacing in the box.
 *
 * A true interior split is 2-3 ft and a defensive lineman aligns about a yard
 * off the ball. At the fixed window scale that puts eleven tokens on top of one
 * another, so the box is drawn to a slightly opened-up convention: splits and
 * the defensive front are spaced far enough apart that every player stays
 * individually readable and tappable. Everything outside the box -- receiver
 * alignment, route depth, break distance -- is exact.
 */
const OL_SPLIT_YARDS = 2.4;
const DEFENSIVE_LINE_DEPTH_YARDS = 2.5;
const LINEBACKER_DEPTH_YARDS = 5.5;
const SHOTGUN_DEPTH_YARDS = 5;

const lineLabels = new Set(["LT", "LG", "C", "RG", "RT"]);
export const isLineLabel = (label) => lineLabels.has(label);

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

/**
 * Rounds to a step without the float noise of `Math.round(v / step) * step`,
 * which turns -19.188 into -19.200000000000003 and leaks that into stored data.
 */
const roundTo = (value, increment = 1) => {
  const factor = 1 / increment;
  return Math.round(value * factor) / factor;
};

export const clampFieldX = (x) => clamp(x, FIELD.bounds.minX, FIELD.bounds.maxX);
export const clampFieldY = (y) => clamp(y, FIELD.bounds.minY, FIELD.bounds.maxY);
export const clampPoint = ([x, y]) => [clampFieldX(x), clampFieldY(y)];

/**
 * Offensive and defensive players share one shape: a stable opaque `id` plus a
 * `label` a coach can change freely. Identity never travels through the label,
 * so two players may carry the same label and relabelling never rewrites an
 * assignment.
 */
const offensivePlayer = (label, x, y) => ({ id: `o-${label.toLowerCase()}`, label, x, y });
const defensivePlayer = (id, label, x, y) => ({ id, label, x, y });

const interiorLine = () => [
  offensivePlayer("LT", -OL_SPLIT_YARDS * 2, 0),
  offensivePlayer("LG", -OL_SPLIT_YARDS, 0),
  offensivePlayer("C", 0, 0),
  offensivePlayer("RG", OL_SPLIT_YARDS, 0),
  offensivePlayer("RT", OL_SPLIT_YARDS * 2, 0),
];

export const basePlayers = [
  offensivePlayer("X", -20, 0),
  ...interiorLine(),
  offensivePlayer("Z", 17, 0),
  offensivePlayer("Y", -11, -1.5),
  offensivePlayer("F", 9, -1.5),
  offensivePlayer("Q", 0, -SHOTGUN_DEPTH_YARDS),
  offensivePlayer("H", 3, -SHOTGUN_DEPTH_YARDS),
];

const texasTechPlayers = [
  offensivePlayer("X", -21, 0),
  ...interiorLine(),
  offensivePlayer("Z", 21, 0),
  offensivePlayer("S", -12, -1.5),
  offensivePlayer("Y", 12, -1.5),
  offensivePlayer("Q", 0, -SHOTGUN_DEPTH_YARDS),
  offensivePlayer("T", -3, -SHOTGUN_DEPTH_YARDS),
];

const lsuPlayers = [
  offensivePlayer("X", -20, 0),
  ...interiorLine(),
  offensivePlayer("Z", 20, 0),
  offensivePlayer("Y", -10.5, -1.5),
  offensivePlayer("F", 10.5, -1.5),
  offensivePlayer("Q", 0, -SHOTGUN_DEPTH_YARDS),
  offensivePlayer("H", 3, -SHOTGUN_DEPTH_YARDS),
];

export const baseDefenders = [
  defensivePlayer("d-e-l", "E", -6.3, DEFENSIVE_LINE_DEPTH_YARDS),
  defensivePlayer("d-t-l", "T", -3.15, DEFENSIVE_LINE_DEPTH_YARDS),
  defensivePlayer("d-n", "N", 0, DEFENSIVE_LINE_DEPTH_YARDS),
  defensivePlayer("d-t-r", "T", 3.15, DEFENSIVE_LINE_DEPTH_YARDS),
  defensivePlayer("d-e-r", "E", 6.3, DEFENSIVE_LINE_DEPTH_YARDS),
  defensivePlayer("d-w", "W", -6.5, LINEBACKER_DEPTH_YARDS),
  defensivePlayer("d-m", "M", 0, LINEBACKER_DEPTH_YARDS),
  defensivePlayer("d-s", "S", 6.5, LINEBACKER_DEPTH_YARDS),
  defensivePlayer("d-cb-l", "C", -19, 8),
  defensivePlayer("d-cb-r", "C", 19, 8),
  defensivePlayer("d-fs", "FS", 0, 15),
];

export const releaseOptions = ["none", "inside", "outside", "best"];
export const breakDirections = ["inside", "outside", "vertical"];
export const blockTechniques = ["drive", "reach", "down", "double", "pull", "wrap", "kick-out", "pass-set", "combo"];
export const motionTypes = ["jet", "orbit", "return", "shift", "trade"];
export const offensiveAssignmentTypes = ["Route", "Block", "Motion"];
export const defensiveAssignmentTypes = ["Rush", "Man", "Zone", "Fit"];
export const defensiveTechniques = ["rush", "contain", "blitz", "stunt"];
export const zoneAreas = ["flat", "hook", "curl", "deep-third", "deep-half", "quarter"];
export const fitResponsibilities = ["A", "B", "C", "D", "force", "cutback"];
export const assignmentPhases = ["pre", "post"];

export const assignmentPhaseForType = (type) => type === "Motion" ? "pre" : "post";
export const unitForAssignmentType = (type) => defensiveAssignmentTypes.includes(type) ? "defense" : "offense";

const horizontalDirection = (direction) => direction === "left" ? -1 : 1;

/** Which way is "inside" for a player standing at x. */
function lateralDirection(x, direction) {
  if (direction === "vertical") return 0;
  const towardMiddle = x < 0 ? 1 : x > 0 ? -1 : 1;
  return direction === "inside" ? towardMiddle : -towardMiddle;
}

export function findPlayer(playData, unit, playerId) {
  const roster = unit === "defense" ? playData.defenders : playData.players;
  return (roster ?? []).find((player) => player.id === playerId) ?? null;
}

export function playerLocation(playData, unit, playerId) {
  const player = findPlayer(playData, unit, playerId);
  return player ? [player.x, player.y] : null;
}

export function playerLabel(playData, unit, playerId) {
  return findPlayer(playData, unit, playerId)?.label ?? playerId;
}

/* ------------------------------------------------------------------ *
 * Assignment definitions -> field geometry
 * ------------------------------------------------------------------ */

export function sanitizeBlockDefinition(definition = {}) {
  return {
    technique: blockTechniques.includes(definition.technique) ? definition.technique : "drive",
    direction: definition.direction === "left" ? "left" : "right",
    target: typeof definition.target === "string" ? definition.target : "",
    climb: Boolean(definition.climb),
  };
}

export function sanitizeMotionDefinition(definition = {}) {
  return {
    motionType: motionTypes.includes(definition.motionType) ? definition.motionType : "jet",
    direction: definition.direction === "left" ? "left" : "right",
    distanceYards: clamp(Number(definition.distanceYards) || 12, 2, 40),
  };
}

export function sanitizeDefensiveDefinition(type, definition = {}) {
  if (type === "Man") {
    return {
      targetId: typeof definition.targetId === "string" ? definition.targetId : "",
      leverage: ["inside", "outside", "head-up"].includes(definition.leverage) ? definition.leverage : "inside",
    };
  }
  if (type === "Zone") {
    return {
      area: zoneAreas.includes(definition.area) ? definition.area : "hook",
      landmark: typeof definition.landmark === "string" ? definition.landmark : "",
    };
  }
  if (type === "Fit") {
    return {
      responsibility: fitResponsibilities.includes(definition.responsibility) ? definition.responsibility : "B",
      technique: ["spill", "box", "lever"].includes(definition.technique) ? definition.technique : "spill",
    };
  }
  return {
    technique: defensiveTechniques.includes(definition.technique) ? definition.technique : "rush",
    gap: ["A", "B", "C", "D"].includes(definition.gap) ? definition.gap : "B",
    direction: definition.direction === "left" ? "left" : "right",
  };
}

export function sanitizeAssignmentDefinition(type, definition) {
  if (type === "Route") return sanitizeRouteDefinition(definition);
  if (type === "Block") return sanitizeBlockDefinition(definition);
  if (type === "Motion") return sanitizeMotionDefinition(definition);
  return sanitizeDefensiveDefinition(type, definition);
}

/** Blocking tracks, in yards. Positive y is downfield, so a drive block gains y. */
function blockPoints([startX, startY], definition) {
  const normalized = sanitizeBlockDefinition(definition);
  const side = horizontalDirection(normalized.direction);
  const straight = {
    drive: [0, 7],
    reach: [side * 3, 5],
    down: [side * 5, 3],
    double: [side * 2, 5],
    "kick-out": [side * 6, 3],
    "pass-set": [side * 2, -5],
  }[normalized.technique];

  if (straight) {
    return [[startX, startY], clampPoint([startX + straight[0], startY + straight[1]])];
  }
  if (normalized.technique === "pull") {
    return [
      [startX, startY],
      clampPoint([startX, startY - 3]),
      clampPoint([startX + side * 7.5, startY - 3]),
      clampPoint([startX + side * 9.5, startY + 5]),
    ];
  }
  if (normalized.technique === "wrap") {
    return [
      [startX, startY],
      clampPoint([startX, startY - 3]),
      clampPoint([startX + side * 6, startY - 1.5]),
      clampPoint([startX + side * 4, startY + 9]),
    ];
  }
  // combo
  return [
    [startX, startY],
    clampPoint([startX + side * 2, startY + 4.5]),
    clampPoint([startX + side * 4, startY + 12]),
  ];
}

/** Motion paths run laterally behind the line; distance is already in yards. */
function motionPoints([startX, startY], definition) {
  const normalized = sanitizeMotionDefinition(definition);
  const side = horizontalDirection(normalized.direction);
  const finishX = clampFieldX(startX + side * normalized.distanceYards);

  if (normalized.motionType === "orbit") {
    return [
      [startX, startY],
      clampPoint([startX - side * 2, startY - 5]),
      clampPoint([finishX, startY - 7]),
    ];
  }
  if (normalized.motionType === "return") {
    return [
      [startX, startY],
      clampPoint([clampFieldX(startX + side * normalized.distanceYards * 0.72), startY]),
      clampPoint([startX + side * 1.5, startY - 1.5]),
    ];
  }
  if (normalized.motionType === "trade") return [[startX, startY], clampPoint([finishX, startY + 1.5])];
  if (normalized.motionType === "shift") return [[startX, startY], clampPoint([finishX, startY])];
  return [[startX, startY], clampPoint([finishX, startY - 1.5])];
}

/** Defensive tracks. A rusher works into the offensive backfield, so y decreases. */
function defensivePoints([startX, startY], type, definition) {
  const normalized = sanitizeDefensiveDefinition(type, definition);

  if (type === "Rush") {
    const side = horizontalDirection(normalized.direction);
    const lateral = normalized.technique === "stunt" ? 5 : normalized.technique === "contain" ? 4 : 1.5;
    return [
      [startX, startY],
      clampPoint([startX + side * lateral, startY - 3]),
      clampPoint([startX + side * lateral * 0.8, startY - 6]),
    ];
  }

  if (type === "Zone") {
    const side = startX < 0 ? -1 : 1;
    const landmark = {
      flat: [side * 20, 4],
      hook: [clamp(startX, -10, 10), 10],
      curl: [side * 11, 12],
      "deep-third": [startX < -8 ? -17 : startX > 8 ? 17 : 0, 20],
      "deep-half": [side * 13, 20],
      quarter: [clamp(startX, -18, 18), 20],
    }[normalized.area];
    return [[startX, startY], clampPoint(landmark)];
  }

  if (type === "Fit") {
    const offsets = { A: 1.5, B: 3, C: 5, D: 7, force: 9, cutback: -4 };
    const side = startX < 0 ? -1 : 1;
    return [[startX, startY], clampPoint([side * offsets[normalized.responsibility], 1.5])];
  }

  // Man, with no resolved target: a short mirror off the ball.
  return [[startX, startY], clampPoint([startX, startY - 3])];
}

/**
 * Man coverage tracks a specific offensive player, so its geometry depends on
 * the play, not only on the definition.
 */
export function manCoveragePoints(playData, start, definition) {
  const normalized = sanitizeDefensiveDefinition("Man", definition);
  const target = findPlayer(playData, "offense", normalized.targetId);
  if (!target) return defensivePoints(start, "Man", normalized);
  const leverage = normalized.leverage === "inside"
    ? (target.x < 0 ? 1.5 : -1.5)
    : normalized.leverage === "outside"
      ? (target.x < 0 ? -1.5 : 1.5)
      : 0;
  return [[start[0], start[1]], clampPoint([target.x + leverage, target.y + 2])];
}

export function assignmentDefinitionToPoints(start, type, definition = {}) {
  if (type === "Route") return routeDefinitionToPoints(start, definition);
  if (type === "Block") return blockPoints(start, definition);
  if (type === "Motion") return motionPoints(start, definition);
  if (defensiveAssignmentTypes.includes(type)) return defensivePoints(start, type, definition);
  return [[start[0], start[1]], clampPoint([start[0], start[1] + 10])];
}

/* ------------------------------------------------------------------ *
 * Routes
 * ------------------------------------------------------------------ */

function sanitizeBreak(segment = {}) {
  const direction = breakDirections.includes(segment.direction) ? segment.direction : "vertical";
  return {
    direction,
    angle: direction === "vertical" ? 0 : clamp(Number(segment.angle) || 0, 0, 135),
    distanceYards: clamp(Number(segment.distanceYards) || 0, 0, 40),
  };
}

export function sanitizeRouteDefinition(definition = {}) {
  return {
    release: releaseOptions.includes(definition.release) ? definition.release : "none",
    stemYards: clamp(Number(definition.stemYards) || 0, 0, 40),
    breaks: Array.isArray(definition.breaks) ? definition.breaks.map(sanitizeBreak).slice(0, 4) : [],
    condition: typeof definition.condition === "string" ? definition.condition : "",
  };
}

export function routeDefinitionToPoints(start, definition) {
  const normalized = sanitizeRouteDefinition(definition);
  const [startX, startY] = start;
  const points = [[startX, startY]];
  let x = startX;
  let y = startY;

  if (normalized.release === "inside" || normalized.release === "outside") {
    x = clampFieldX(x + lateralDirection(startX, normalized.release) * 1.5);
    y = clampFieldY(y + 1.5);
    points.push([roundTo(x, 0.1), roundTo(y, 0.1)]);
  }

  if (normalized.stemYards > 0) {
    y = clampFieldY(startY + normalized.stemYards);
    points.push([roundTo(x, 0.1), roundTo(y, 0.1)]);
  }

  normalized.breaks.forEach((segment) => {
    const angleRadians = (segment.angle * Math.PI) / 180;
    x = clampFieldX(x + lateralDirection(x, segment.direction) * Math.sin(angleRadians) * segment.distanceYards);
    y = clampFieldY(y + Math.cos(angleRadians) * segment.distanceYards);
    points.push([roundTo(x, 0.1), roundTo(y, 0.1)]);
  });

  if (points.length === 1) points.push([startX, roundTo(clampFieldY(startY + 10), 0.1)]);

  return points.filter((point, index) => (
    index === 0 || point[0] !== points[index - 1][0] || point[1] !== points[index - 1][1]
  ));
}

export function inferRouteDefinition(routeData) {
  const points = routeData.points ?? [];
  if (points.length < 2) return sanitizeRouteDefinition({ stemYards: 10 });

  const startY = points[0][1];
  const stemEnd = points.length > 2 ? points[1] : points.at(-1);
  const stemYards = roundTo(Math.max(0, stemEnd[1] - startY), 1);
  const breaks = [];

  if (points.length > 2) {
    const finish = points.at(-1);
    const dx = finish[0] - stemEnd[0];
    const dy = finish[1] - stemEnd[1];
    const distanceYards = roundTo(Math.hypot(dx, dy), 1);
    const angle = roundTo((Math.atan2(Math.abs(dx), dy || 0.001) * 180) / Math.PI, 5);
    const towardMiddle = stemEnd[0] < 0 ? dx > 0 : dx < 0;
    breaks.push({
      direction: Math.abs(dx) < 0.75 ? "vertical" : towardMiddle ? "inside" : "outside",
      angle: Math.abs(dx) < 0.75 ? 0 : clamp(angle, 0, 135),
      distanceYards,
    });
  }

  return sanitizeRouteDefinition({ release: "none", stemYards, breaks, condition: "" });
}

export function routeDefinitionSummary(definition) {
  const normalized = sanitizeRouteDefinition(definition);
  const release = normalized.release === "none"
    ? "No release"
    : `${normalized.release[0].toUpperCase()}${normalized.release.slice(1)} release`;
  const breakSummary = normalized.breaks.length
    ? normalized.breaks.map((segment) => `${segment.distanceYards} yd ${segment.direction} ${segment.angle}°`).join(" · ")
    : "vertical";
  return `${release} · ${normalized.stemYards} yd stem · ${breakSummary}`;
}

/* ------------------------------------------------------------------ *
 * Formation legality and timing
 * ------------------------------------------------------------------ */

/** A player is on the line when they are within a yard of the LOS. */
export function formationStatus(players = basePlayers) {
  const roster = players ?? [];
  const onLine = roster.filter((player) => Math.abs(player.y) <= 1).length;
  const inBackfield = roster.length - onLine;
  return { legal: roster.length === 11 && onLine >= 7 && inBackfield <= 4, onLine, inBackfield, playerCount: roster.length };
}

export function assignmentStartSeconds(assignment, snapSeconds = 2) {
  const delay = Number.isFinite(assignment.delay)
    ? assignment.delay
    : assignment.type === "Motion" ? -1.5 : 0;
  return Math.max(0, snapSeconds + delay);
}

/** Path length in real yards, so a deep route genuinely takes longer. */
export function assignmentDistanceYards(assignment) {
  const points = assignment.points ?? [];
  return points.slice(1).reduce((total, point, index) => (
    total + Math.hypot(point[0] - points[index][0], point[1] - points[index][1])
  ), 0);
}

export function routeDuration(assignment, playbackSpeed = 1) {
  const pace = Number.isFinite(assignment.pace) ? assignment.pace : 1;
  return clamp(assignmentDistanceYards(assignment) / 9, 1.2, 5.4) / pace / playbackSpeed;
}

export function playDuration(assignments = [], playbackSpeed = 1, snapSeconds = 2) {
  return Math.max(
    snapSeconds,
    ...assignments.map((assignment) => (
      assignmentStartSeconds(assignment, snapSeconds) + routeDuration(assignment, playbackSpeed)
    )),
  );
}

/* ------------------------------------------------------------------ *
 * Seed content
 * ------------------------------------------------------------------ */

const route = (id, playerRef, preset, points, pace = 1, metadata = {}) => ({
  id,
  playerRef,
  unit: "offense",
  type: "Route",
  preset,
  pace,
  delay: 0,
  phase: "post",
  points,
  ...metadata,
});

/** Non-route assignments derive their geometry from their definition. */
const assignment = (id, unit, playerRef, type, preset, definition) => ({
  id,
  playerRef,
  unit,
  type,
  preset,
  pace: 1,
  delay: type === "Motion" ? -1.5 : 0,
  phase: assignmentPhaseForType(type),
  definition,
});

/**
 * Seed offense is authored by position label; defence is authored by player id,
 * because several defenders legitimately share a label (two `C`, two `T`, two `E`).
 */
function resolveAssignment(spec, players, defenders) {
  const roster = spec.unit === "defense" ? defenders : players;
  const owner = roster.find((player) => player.id === spec.playerRef)
    ?? roster.find((player) => player.label === spec.playerRef);
  if (!owner) throw new Error(`Seed assignment ${spec.id} references unknown player ${spec.playerRef}`);
  const { playerRef: _ref, ...rest } = spec;
  const authored = spec.points ?? assignmentDefinitionToPoints([owner.x, owner.y], spec.type, spec.definition);

  /*
   * Authored paths are anchored onto their player rather than trusted to already
   * start there. Alignment can then be tuned -- splits opened up, a back moved
   * off the quarterback -- without every traced route needing to be re-measured.
   */
  const dx = owner.x - authored[0][0];
  const dy = owner.y - authored[0][1];
  const points = dx === 0 && dy === 0
    ? authored
    : authored.map(([x, y]) => clampPoint([roundTo(x + dx, 0.1), roundTo(y + dy, 0.1)]));

  return { ...rest, playerId: owner.id, points };
}

const play = (id, name, specs, options = {}) => {
  const players = clonePlaybook(options.players ?? basePlayers);
  const defenders = clonePlaybook(options.defenders ?? baseDefenders);
  return {
    id,
    name,
    family: options.family ?? "Mesh",
    personnel: options.personnel ?? "11 Personnel",
    formation: options.formation ?? "Trips Right Open",
    folder: options.folder ?? "Offense",
    protection: options.protection ?? "",
    blockingScheme: options.blockingScheme ?? "",
    variantOf: null,
    conceptTemplateId: null,
    players,
    defenders,
    assignments: specs.map((spec) => resolveAssignment(spec, players, defenders)),
    sourcePage: options.sourcePage ?? null,
    sourceLabel: options.sourceLabel ?? null,
  };
};

export const plays = [
  play("mesh", "Mesh", [
    route("mesh-x", "X", "Go", [[-20, 0], [-20, 21.5]]),
    route("mesh-y", "Y", "Out", [[-11, -1.5], [-11, 17.7], [-8.3, 17.7]], 0.95),
    route("mesh-f", "F", "Post", [[9, -1.5], [10.1, 7], [12.7, 13.1]], 1.05),
    route("mesh-z", "Z", "Go", [[17, 0], [17, 25.4]], 1.1),
    assignment("mesh-lt-block", "offense", "LT", "Block", "Pass Set", { technique: "pass-set", direction: "left", target: "E", climb: false }),
    assignment("mesh-h-motion", "offense", "H", "Motion", "Jet", { motionType: "jet", direction: "left", distanceYards: 14 }),
    assignment("mesh-defense-m-fit", "defense", "d-m", "Fit", "B Fit", { responsibility: "B", technique: "spill" }),
    assignment("mesh-defense-el-rush", "defense", "d-e-l", "Rush", "Contain", { technique: "contain", gap: "C", direction: "left" }),
    assignment("mesh-defense-cbl-zone", "defense", "d-cb-l", "Zone", "Flat", { area: "flat", landmark: "Outside leverage on X" }),
  ]),
  play("mesh-stick", "Mesh Stick", [
    route("mesh-stick-x", "X", "Go", [[-20, 0], [-20, 20]]),
    route("mesh-stick-y", "Y", "Out", [[-11, -1.5], [-11, 18.5], [-7.3, 18.5]], 0.95),
    route("mesh-stick-f", "F", "Out", [[9, -1.5], [11.7, 3.1], [14.9, 3.1]], 1.05),
    route("mesh-stick-z", "Z", "Post", [[17, 0], [17, 20], [14.3, 25.4]], 1.1),
  ]),
  play("mesh-sit", "Mesh Sit", [
    route("mesh-sit-x", "X", "Post", [[-20, 0], [-20, 19.2], [-15.7, 14.6]]),
    route("mesh-sit-y", "Y", "Out", [[-11, -1.5], [-11, 17], [-7.8, 17]], 0.95),
    route("mesh-sit-f", "F", "Dig", [[9, -1.5], [5.8, 3.9], [3.1, 7.7]], 1.05),
    route("mesh-sit-z", "Z", "Dig", [[17, 0], [17, 13.1], [13.3, 13.1]], 1.1),
  ]),
  play("mesh-choice", "Mesh Choice", [
    route("mesh-choice-x", "X", "Go", [[-20, 0], [-20, 22.3]]),
    route("mesh-choice-y", "Y", "Post", [[-11, -1.5], [-11, 16.2], [-6.7, 21.6]], 0.95),
    route("mesh-choice-f", "F", "Dig", [[9, -1.5], [6.3, 6.2], [3.1, 13.1]], 1.05),
    route("mesh-choice-z", "Z", "Post", [[17, 0], [17, 21.5], [14.3, 27.7]], 1.1),
  ]),
  play("mesh-corner", "Mesh Corner", [
    route("mesh-corner-x", "X", "Post", [[-20, 0], [-20, 18.5], [-15.2, 26.2]]),
    route("mesh-corner-y", "Y", "Out", [[-11, -1.5], [-11, 17], [-7.3, 17]], 0.95),
    route("mesh-corner-f", "F", "Dig", [[9, -1.5], [5.8, 4.7], [1.5, 4.7]], 1.05),
    route("mesh-corner-z", "Z", "Corner", [[17, 0], [17, 15.4], [13.3, 26.9]], 1.1),
  ]),
  play("mesh-wheel", "Mesh Wheel", [
    route("mesh-wheel-x", "X", "Go", [[-20, 0], [-20, 20.8]]),
    route("mesh-wheel-y", "Y", "Out", [[-11, -1.5], [-11, 17], [-7.3, 17]], 0.95),
    route("mesh-wheel-f", "F", "Post", [[9, -1.5], [10.6, 7], [13.8, 13.9]], 1.05),
    route("mesh-wheel-z", "Z", "Corner", [[17, 0], [17, 26.2], [13.8, 33.1]], 1.1),
    route("mesh-wheel-h", "H", "Custom", [[1.5, -6.5], [4.2, -4.2], [7.4, -0.3]], 0.85),
  ]),
];

const texasTechOptions = (family, sourcePage) => ({
  family,
  formation: "Doubles",
  personnel: "X · S · T · Y · Z",
  players: texasTechPlayers,
  sourcePage,
  sourceLabel: "Texas Tech Style Offensive Attack",
});

const texasTechPlays = [
  play("tt-600-texas", "600 TEXAS", [
    route("tt-600-x", "X", "Go", [[-21, 0], [-21, 36.9]], 1.08),
    route("tt-600-s", "S", "Post", [[-12, -1.5], [-12, 14.7], [-3.5, 33.1]], 1.02),
    route("tt-600-t", "T", "Texas", [[0, -6.5], [7.5, 4.3], [7.5, 16.6], [2.1, 20.4]], 0.9),
    route("tt-600-y", "Y", "Option", [[12, -1.5], [6.7, 11.6], [11.5, 13.9]], 0.96),
    route("tt-600-z", "Z", "Go", [[21, 0], [21, 36.9]], 1.08),
  ], texasTechOptions("Texas", 114)),
  play("tt-700-texas", "700 TEXAS", [
    route("tt-700-x", "X", "Go", [[-21, 0], [-21, 36.9]], 1.08),
    route("tt-700-s", "S", "Option", [[-12, -1.5], [-6.7, 11.6], [-11.5, 13.9]], 0.96),
    route("tt-700-t", "T", "Texas", [[0, -6.5], [-7.5, 4.3], [-7.5, 16.6], [-2.1, 20.4]], 0.9),
    route("tt-700-y", "Y", "Post", [[12, -1.5], [12, 14.7], [3.5, 33.1]], 1.02),
    route("tt-700-z", "Z", "Go", [[21, 0], [21, 36.9]], 1.08),
  ], texasTechOptions("Texas", 115)),
  play("tt-700-z-mesh", "700 Z MESH", [
    route("tt-zmesh-x", "X", "Shallow", [[-21, 0], [-17.8, 8.5], [-5, 13.8], [10.4, 14.6]], 0.92),
    route("tt-zmesh-s", "S", "Out", [[-12, -1.5], [-12, 17.7], [-16.8, 17.7]]),
    route("tt-zmesh-t", "T", "Swing", [[0, -6.5], [-4.3, 2], [-11.7, 11.2], [-22.4, 15]], 0.86),
    route("tt-zmesh-y", "Y", "Post", [[12, -1.5], [12, 16.2], [5.1, 36.2]], 1.04),
    route("tt-zmesh-z", "Z", "Mesh", [[21, 0], [16.7, 8.5], [5, 13.1], [-8.3, 14.6], [-21.6, 19.2]], 0.92),
  ], texasTechOptions("Mesh", 118)),
  play("tt-700-y-mesh", "700 Y MESH", [
    route("tt-ymesh-x", "X", "Go", [[-21, 0], [-21, 36.2]], 1.08),
    route("tt-ymesh-s", "S", "Mesh", [[-12, -1.5], [-7.7, 7], [3.5, 11.6], [17.8, 13.9]], 0.92),
    route("tt-ymesh-t", "T", "Swing", [[0, -6.5], [-4.3, 2], [-12.3, 11.2], [-22.4, 15]], 0.86),
    route("tt-ymesh-y", "Y", "Mesh", [[12, -1.5], [8.3, 7], [-1.9, 11.6], [-15.2, 13.9], [-22.6, 17.7]], 0.92),
    route("tt-ymesh-z", "Z", "Post", [[21, 0], [21, 16.9], [13.5, 36.9]], 1.04),
  ], texasTechOptions("Mesh", 120)),
  play("tt-600-s-mesh", "600 S MESH", [
    route("tt-smesh-x", "X", "Post", [[-21, 0], [-21, 16.2], [-13.5, 36.2]], 1.04),
    route("tt-smesh-s", "S", "Mesh", [[-12, -1.5], [-7.7, 7], [3.5, 11.6], [18.4, 14.7]], 0.92),
    route("tt-smesh-t", "T", "Swing", [[0, -6.5], [4.3, 2], [12.8, 11.2], [23.5, 15]], 0.86),
    route("tt-smesh-y", "Y", "Mesh", [[12, -1.5], [8.3, 7], [-2.4, 11.6], [-16.2, 14.7]], 0.92),
    route("tt-smesh-z", "Z", "Go", [[21, 0], [21, 36.9]], 1.08),
  ], texasTechOptions("Mesh", 128)),
  play("tt-500-smash", "500 SMASH", [
    route("tt-smash-x", "X", "Hitch", [[-21, 0], [-21, 13.1], [-22.6, 16.2], [-20.5, 18.5]], 0.94),
    route("tt-smash-s", "S", "Corner", [[-12, -1.5], [-12, 14.7], [-18.9, 33.1]], 1.02),
    route("tt-smash-y", "Y", "Hitch", [[12, -1.5], [12, 9.3], [15.7, 10.8]], 0.94),
    route("tt-smash-z", "Z", "Corner", [[21, 0], [17.8, 11.5], [21.5, 20], [24.2, 36.9]], 1.02),
  ], texasTechOptions("Smash", 131)),
];

const lsuOptions = (family, sourcePage, formation = "Doubles") => ({
  family,
  formation,
  personnel: "X · Y · F · H · Z",
  players: lsuPlayers,
  sourcePage,
  sourceLabel: "2019 LSU Offense Playbook",
});

const lsuPlays = [
  play("lsu-dice-jordan-sticky", "L DICE JORDAN STICKY", [
    route("lsu-sticky-x", "X", "Out", [[-20, 0], [-20, 11.5], [-23.7, 11.5]], 0.96),
    route("lsu-sticky-y", "Y", "Stick", [[-10.5, -1.5], [-10.5, 10.8], [-6.8, 13.9]], 0.94),
    route("lsu-sticky-f", "F", "Arrow", [[10.5, -1.5], [14.2, 3.1], [20.1, 3.1]]),
    route("lsu-sticky-z", "Z", "Out", [[20, 0], [20, 11.5], [24.3, 11.5]], 0.96),
    route("lsu-sticky-h", "H", "Check", [[0, -6.5], [0, 2]], 0.8),
  ], lsuOptions("Sticky", 37)),
  play("lsu-troop-shock-choice", "R TROOP PACER SHOCK CHOICE", [
    route("lsu-shock-x", "X", "Corner", [[-20, 0], [-20, 20], [-23.7, 34.6]], 1.03),
    route("lsu-shock-h", "H", "Choice", [[0, -6.5], [-8.5, 2.7], [-13.9, 15.8]], 0.9),
    route("lsu-shock-f", "F", "Stick", [[10.5, -1.5], [10.5, 11.6], [14.2, 13.9]], 0.95),
    route("lsu-shock-z", "Z", "Fade", [[20, 0], [20, 13.8], [24.3, 34.6]], 1.06),
    route("lsu-shock-y", "Y", "Hitch", [[-10.5, -1.5], [-10.5, 11.6]], 0.96),
  ], lsuOptions("Shock Choice", 39, "Troop")),
  play("lsu-dome-jordan-cat", "L DOME JORDAN CAT", [
    route("lsu-cat-x", "X", "Go", [[-20, 0], [-20, 35.4]], 1.06),
    route("lsu-cat-y", "Y", "Bender", [[-10.5, -1.5], [-10.5, 19.3], [-5.2, 34.7]], 1.01),
    route("lsu-cat-f", "F", "Bender", [[10.5, -1.5], [10.5, 19.3], [5.2, 34.7]], 1.01),
    route("lsu-cat-z", "Z", "Go", [[20, 0], [20, 35.4]], 1.06),
    route("lsu-cat-h", "H", "Check", [[0, -6.5], [0, 1.2]], 0.8),
  ], lsuOptions("Cat", 41, "Dome")),
  play("lsu-tiger-panther-h", "R TIGER PACER PANTHER H", [
    route("lsu-panther-x", "X", "Go", [[-20, 0], [-20, 35.4]], 1.06),
    route("lsu-panther-h", "H", "Shallow", [[0, -6.5], [-4.3, 2.7], [-12.8, 17.3], [14.9, 18.1]], 0.9),
    route("lsu-panther-y", "Y", "Deep Over", [[-10.5, -1.5], [-8.4, 16.2], [4.4, 33.1]], 1.02),
    route("lsu-panther-f", "F", "Bender", [[10.5, -1.5], [10.5, 17.7], [15.3, 33.1]]),
    route("lsu-panther-z", "Z", "Go", [[20, 0], [20, 35.4]], 1.06),
  ], lsuOptions("Panther", 49, "Tiger")),
  play("lsu-token-music-fitch", "R TOKEN PACER MUSIC FITCH", [
    route("lsu-music-x", "X", "Fade", [[-20, 0], [-20, 14.6], [-23.7, 33.1]], 1.05),
    route("lsu-music-y", "Y", "Clear", [[-10.5, -1.5], [-10.5, 34.7]], 1.08),
    route("lsu-music-f", "F", "Slide", [[10.5, -1.5], [10.5, 10], [15.8, 10]], 0.94),
    route("lsu-music-z", "Z", "Basic", [[20, 0], [20, 23.8], [14.7, 26.9]]),
    route("lsu-music-h", "H", "Hitch", [[0, -6.5], [-7.5, 7.3], [-8.5, 17.3]], 0.9),
  ], lsuOptions("Music Fitch", 50, "Token")),
  play("lsu-triple-jordan-spark", "R TRIPLE JORDAN SPARK", [
    route("lsu-spark-x", "X", "Harvey", [[-20, 0], [-20, 23.1], [-17.3, 27.7]], 0.98),
    route("lsu-spark-y", "Y", "Seam Read", [[-10.5, -1.5], [-10.5, 21.6], [-14.8, 35.4]], 1.02),
    route("lsu-spark-f", "F", "Spot", [[10.5, -1.5], [5.7, 9.3], [2.5, 12.3]], 0.93),
    route("lsu-spark-z", "Z", "Spot", [[20, 0], [15.2, 10.8], [12, 13.8]], 0.93),
    route("lsu-spark-h", "H", "Check", [[0, -6.5], [-4.3, -2.7], [-4.3, 2.7]], 0.8),
  ], lsuOptions("Spark", 55, "Triple")),
];

export const defaultFormations = [
  { id: "trips-right-open", name: "Trips Right Open", personnel: "11 Personnel", players: clonePlaybook(basePlayers) },
  {
    id: "doubles",
    name: "Doubles",
    personnel: "10 Personnel",
    players: [
      offensivePlayer("X", -20.5, 0),
      ...interiorLine(),
      offensivePlayer("Z", 20.5, 0),
      offensivePlayer("Y", -10.5, -1.5),
      offensivePlayer("F", 10.5, -1.5),
      offensivePlayer("Q", 0, -SHOTGUN_DEPTH_YARDS),
      offensivePlayer("H", 3, -SHOTGUN_DEPTH_YARDS),
    ],
  },
  {
    id: "empty",
    name: "Empty",
    personnel: "Empty",
    players: [
      offensivePlayer("X", -22, 0),
      ...interiorLine(),
      offensivePlayer("Z", 22, 0),
      offensivePlayer("Y", -12.5, -1.5),
      offensivePlayer("F", 12.5, -1.5),
      offensivePlayer("H", 7.5, -1.5),
      offensivePlayer("Q", 0, -SHOTGUN_DEPTH_YARDS),
    ],
  },
];

export const seedPlaybooks = [
  {
    id: MAIN_PLAYBOOK_ID,
    name: "Personal Active",
    description: "Your working playbook",
    isMain: true,
    source: "personal",
    formations: defaultFormations,
    concepts: [],
    plays,
  },
  {
    id: "texas-tech-sample",
    name: "Texas Tech Sample",
    description: "6 traced reference plays",
    isMain: false,
    source: "Texas Tech Style Offensive Attack",
    formations: [{ id: "texas-tech-doubles", name: "Texas Tech Doubles", personnel: "X · S · T · Y · Z", players: clonePlaybook(texasTechPlayers) }],
    concepts: [],
    plays: texasTechPlays,
  },
  {
    id: "lsu-2019-sample",
    name: "LSU 2019 Sample",
    description: "6 traced reference plays",
    isMain: false,
    source: "2019 LSU Offense Playbook",
    formations: [{ id: "lsu-doubles", name: "LSU Doubles", personnel: "X · Y · F · H · Z", players: clonePlaybook(lsuPlayers) }],
    concepts: [],
    plays: lsuPlays,
  },
];

/**
 * Explicit playbook labels outrank inferred geometry, and conditional rules stay
 * conditions rather than collapsing into one deterministic path.
 */
const sourceRouteEvidence = {
  "lsu-sticky-y": {
    note: "5 YDS with man/zone read shown",
    definition: { release: "none", stemYards: 5, breaks: [{ direction: "inside", angle: 50, distanceYards: 5 }], condition: "Read man/zone" },
  },
  "lsu-shock-x": {
    note: "12 YDS corner with leverage conversion shown",
    definition: { release: "none", stemYards: 12, breaks: [{ direction: "outside", angle: 45, distanceYards: 12 }], condition: "Convert by man/zone and outside leverage" },
  },
  "lsu-shock-z": { note: "Alert at 5 steps; locked hitch" },
  "lsu-panther-y": {
    note: "10-12 YDS deep over with MFO bender conversion",
    definition: { release: "none", stemYards: 11, breaks: [{ direction: "inside", angle: 45, distanceYards: 14 }], condition: "Bender versus MFO" },
  },
  "lsu-panther-f": {
    note: "10-12 YDS bender/seam rule",
    definition: { release: "none", stemYards: 11, breaks: [{ direction: "inside", angle: 30, distanceYards: 14 }], condition: "Seam versus MFC" },
  },
  "lsu-music-f": {
    note: "5-6 YDS; hitch to win, then slide",
    definition: { release: "none", stemYards: 6, breaks: [{ direction: "outside", angle: 90, distanceYards: 6 }], condition: "Hitch to win, then slide" },
  },
  "lsu-music-z": {
    note: "10-12 YDS basic",
    definition: { release: "none", stemYards: 11, breaks: [{ direction: "inside", angle: 90, distanceYards: 10 }], condition: "" },
  },
};

/* ------------------------------------------------------------------ *
 * Normalization
 * ------------------------------------------------------------------ */

function normalizeAssignment(assignmentData, playData) {
  const type = assignmentData.type ?? "Route";
  const unit = assignmentData.unit === "defense" || assignmentData.unit === "offense"
    ? assignmentData.unit
    : unitForAssignmentType(type);
  const phase = assignmentPhases.includes(assignmentData.phase)
    ? assignmentData.phase
    : assignmentPhaseForType(type);
  const base = {
    ...assignmentData,
    unit,
    phase,
    pace: Number.isFinite(assignmentData.pace) ? assignmentData.pace : 1,
    delay: Number.isFinite(assignmentData.delay) ? assignmentData.delay : type === "Motion" ? -1.5 : 0,
    templateOverride: assignmentData.templateOverride === true,
  };

  if (type !== "Route") {
    return { ...base, definition: sanitizeAssignmentDefinition(type, assignmentData.definition) };
  }

  const evidence = sourceRouteEvidence[assignmentData.id];
  const coachEdited = assignmentData.evidence?.coachEdited === true;
  const definition = sanitizeRouteDefinition(
    coachEdited
      ? assignmentData.definition
      : evidence?.definition ?? assignmentData.definition ?? inferRouteDefinition(assignmentData),
  );
  const points = evidence?.definition && !coachEdited
    ? routeDefinitionToPoints(assignmentData.points[0], definition)
    : assignmentData.points;

  return {
    ...base,
    points,
    definition,
    geometryMode: coachEdited
      ? assignmentData.geometryMode ?? "structured"
      : evidence
        ? "detected"
        : assignmentData.geometryMode ?? (assignmentData.definition ? "structured" : "detected"),
    evidence: coachEdited ? assignmentData.evidence : {
      method: evidence ? "labels-and-geometry" : playData.sourcePage ? "diagram-geometry" : "existing-diagram",
      confidence: evidence ? "medium-high" : "medium",
      sourceLabel: playData.sourceLabel ?? null,
      sourcePage: playData.sourcePage ?? null,
      note: evidence?.note ?? assignmentData.evidence?.note ?? "",
      coachEdited: false,
    },
  };
}

export function normalizePlay(playData) {
  const migrated = isLegacyPlay(playData) ? migrateLegacyPlay(playData) : playData;
  const players = clonePlaybook(migrated.players?.length ? migrated.players : basePlayers);
  const defenders = clonePlaybook(migrated.defenders?.length ? migrated.defenders : baseDefenders);
  const playerIds = new Set([...players, ...defenders].map((player) => player.id));

  return {
    ...migrated,
    folder: migrated.folder ?? (migrated.sourcePage ? "Source Plays" : "Offense"),
    protection: migrated.protection ?? "",
    blockingScheme: migrated.blockingScheme ?? "",
    conceptTemplateId: migrated.conceptTemplateId ?? null,
    variantOf: migrated.variantOf ?? null,
    players,
    defenders,
    assignments: (migrated.assignments ?? [])
      .filter((item) => playerIds.has(item.playerId))
      .map((item) => normalizeAssignment(item, migrated)),
  };
}

/* ------------------------------------------------------------------ *
 * Legacy (percent-space) migration
 * ------------------------------------------------------------------ */

const LEGACY_YARDS_PER_X = 53.3 / 100;
const LEGACY_YARDS_PER_Y = 10 / 13;
const LEGACY_LINE_OF_SCRIMMAGE = 73;

const legacyPointToYards = ([x, y]) => [
  roundTo((x - 50) * LEGACY_YARDS_PER_X, 0.1),
  roundTo((LEGACY_LINE_OF_SCRIMMAGE - y) * LEGACY_YARDS_PER_Y, 0.1),
];

/**
 * Legacy plays are identified by shape, not by trusting a version field:
 * a `[label, x, y]` tuple roster is conclusive, and so is a non-empty `routes`
 * array with no `assignments`. A v9 play with an empty `routes: []` (which is
 * how a formation is normalized) must not match.
 */
export function isLegacyPlay(playData) {
  if (!playData) return false;
  if (Array.isArray(playData.players?.[0])) return true;
  return Array.isArray(playData.routes) && playData.routes.length > 0 && !Array.isArray(playData.assignments);
}

const uniqueIdFactory = () => {
  const used = new Set();
  return (base) => {
    let id = base;
    let suffix = 2;
    while (used.has(id)) { id = `${base}-${suffix}`; suffix += 1; }
    used.add(id);
    return id;
  };
};

/**
 * Converts a roster to the v9 shape.
 *
 * A `[label, x, y]` tuple is always percent-space and gets a synthesised id.
 * An object roster already carries an id, which is preserved so a coach who
 * relabelled a player never loses the link to their assignments -- but object
 * shape alone does not reveal the coordinate space, because v5-v8 stored
 * defenders as percent-space objects. The caller states which it is.
 */
export function migrateRoster(roster = [], { unit = "offense", convertCoordinates = false } = {}) {
  const uniqueId = uniqueIdFactory();
  const prefix = unit === "defense" ? "d" : "o";
  return roster.map((player) => {
    const isTuple = Array.isArray(player);
    const label = isTuple ? player[0] : player.label;
    const rawX = isTuple ? player[1] : player.x;
    const rawY = isTuple ? player[2] : player.y;
    const [x, y] = isTuple || convertCoordinates
      ? legacyPointToYards([rawX, rawY])
      : [rawX, rawY];
    const id = !isTuple && typeof player.id === "string"
      ? player.id
      : `${prefix}-${String(label).toLowerCase()}`;
    return { id: uniqueId(id), label, x, y };
  });
}

export function migrateLegacyPlay(playData) {
  const players = migrateRoster(playData.players ?? [], { unit: "offense" });
  const defenders = migrateRoster(playData.defenders ?? [], { unit: "defense", convertCoordinates: true });

  /*
   * v5-v8 assignments referenced offensive players by position label and
   * defenders by their (already stable) defender id. Defender ids are preserved
   * verbatim above, so that half of the mapping is the identity.
   */
  const offenseByLabel = new Map(players.map((player) => [player.label, player.id]));
  const defenderIds = new Set(defenders.map((player) => player.id));

  const assignments = (playData.routes ?? playData.assignments ?? []).flatMap((item) => {
    const type = item.type ?? "Route";
    const unit = item.unit === "defense" || defensiveAssignmentTypes.includes(type) ? "defense" : "offense";
    const playerId = unit === "defense"
      ? (defenderIds.has(item.player) ? item.player : item.playerId)
      : offenseByLabel.get(item.player) ?? item.playerId;
    if (!playerId) return [];

    const definition = type === "Man"
      ? {
          ...item.definition,
          targetId: offenseByLabel.get(item.definition?.target) ?? item.definition?.targetId ?? "",
        }
      : item.definition;

    const { player: _legacyPlayer, ...rest } = item;
    return [{
      ...rest,
      playerId,
      unit,
      type,
      definition,
      points: (item.points ?? []).map(legacyPointToYards),
    }];
  });

  const { routes: _legacyRoutes, ...rest } = playData;
  return { ...rest, players, defenders, assignments };
}

export function createSeedPlaybooks(personalPlays = plays) {
  const books = clonePlaybook(seedPlaybooks);
  books.forEach((book) => {
    book.concepts = clonePlaybook(book.concepts ?? []);
    book.plays = book.plays.map(normalizePlay);
  });
  books[0].plays = personalPlays.map(normalizePlay);
  return books;
}

/* ------------------------------------------------------------------ *
 * Formations and concepts
 * ------------------------------------------------------------------ */

export function createPlayFromFormation({ formation, id, name }) {
  return {
    id,
    name,
    family: "Unsorted",
    personnel: formation.personnel ?? "11 Personnel",
    formation: formation.name,
    folder: "Offense",
    protection: "",
    blockingScheme: "",
    conceptTemplateId: null,
    variantOf: null,
    players: clonePlaybook(formation.players),
    defenders: clonePlaybook(baseDefenders),
    assignments: [],
    sourcePage: null,
    sourceLabel: null,
  };
}

/**
 * Applying a formation matches players by position label, translates their
 * assignments to the new alignment, and drops offensive assignments whose
 * position no longer exists. The opponent look and defensive assignments are
 * untouched.
 */
export function applyFormationToPlay(playData, formation) {
  const previousById = new Map((playData.players ?? []).map((player) => [player.id, player]));
  const previousByLabel = new Map((playData.players ?? []).map((player) => [player.label, player]));
  const nextPlayers = clonePlaybook(formation.players);

  // Keep the existing player id where the label survives, so assignments stay attached.
  const idByLabel = new Map();
  const players = nextPlayers.map((player) => {
    const previous = previousByLabel.get(player.label);
    const id = previous ? previous.id : player.id;
    idByLabel.set(player.label, id);
    return { ...player, id };
  });
  const survivingIds = new Set(players.map((player) => player.id));

  const assignments = (playData.assignments ?? []).flatMap((item) => {
    if (item.unit === "defense") return [clonePlaybook(item)];
    if (!survivingIds.has(item.playerId)) return [];
    const previous = previousById.get(item.playerId);
    const next = players.find((player) => player.id === item.playerId);
    if (!previous || !next) return [];
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    return [{
      ...clonePlaybook(item),
      points: item.points.map(([x, y]) => clampPoint([x + dx, y + dy])),
    }];
  });

  return {
    ...playData,
    personnel: formation.personnel ?? playData.personnel,
    formation: formation.name,
    players,
    assignments,
  };
}

function assignmentSlotKey(item) {
  return `${item.unit}:${item.playerId}:${item.phase}`;
}

/** Concepts are stored by position label so they transfer between formations. */
export function createConceptTemplate(playData, { id, name }) {
  const labelById = new Map([...playData.players, ...playData.defenders].map((player) => [player.id, player.label]));
  return {
    id,
    name,
    sourceFormation: playData.formation,
    sourcePersonnel: playData.personnel,
    players: clonePlaybook(playData.players),
    defenders: clonePlaybook(playData.defenders),
    assignments: (playData.assignments ?? []).map((item) => {
      const copy = clonePlaybook(item);
      delete copy.inheritedFrom;
      delete copy.templateOverride;
      return { ...copy, positionLabel: labelById.get(item.playerId) ?? item.playerId };
    }),
  };
}

export function applyConceptTemplateToPlay(playData, concept) {
  const sourceRoster = {
    players: concept.players ?? basePlayers,
    defenders: concept.defenders ?? baseDefenders,
  };

  const incoming = (concept.assignments ?? []).flatMap((item) => {
    const unit = item.unit ?? "offense";
    const label = item.positionLabel ?? item.playerId;
    const sourcePlayer = (unit === "defense" ? sourceRoster.defenders : sourceRoster.players)
      .find((player) => player.label === label);
    const targetPlayer = (unit === "defense" ? playData.defenders : playData.players)
      .find((player) => player.label === label);
    if (!sourcePlayer || !targetPlayer) return [];

    const dx = targetPlayer.x - sourcePlayer.x;
    const dy = targetPlayer.y - sourcePlayer.y;
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return [{
      ...clonePlaybook(item),
      id: `${playData.id}-${concept.id}-${slug}-${item.phase ?? "post"}`,
      playerId: targetPlayer.id,
      points: item.points.map(([x, y]) => clampPoint([x + dx, y + dy])),
      inheritedFrom: { conceptId: concept.id, conceptName: concept.name, assignmentId: item.id },
      templateOverride: false,
    }];
  });

  const incomingKeys = new Set(incoming.map(assignmentSlotKey));
  const retained = (playData.assignments ?? []).filter((item) => (
    !incomingKeys.has(assignmentSlotKey(item)) || item.templateOverride === true
  ));
  const overriddenKeys = new Set(
    retained.filter((item) => item.templateOverride === true).map(assignmentSlotKey),
  );

  return normalizePlay({
    ...playData,
    family: concept.name,
    conceptTemplateId: concept.id,
    assignments: [...retained, ...incoming.filter((item) => !overriddenKeys.has(assignmentSlotKey(item)))],
  });
}

/**
 * Deep copy for play data.
 *
 * `structuredClone` needs Safari 15.4, which is newer than some of the iPads this
 * gets used on. Play data is plain JSON, so the fallback is exact rather than
 * merely close — and without it the app throws during its very first render and
 * shows nothing at all.
 */
export function clonePlaybook(value = plays) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

/** How close a dragged player must be to another's row or column to snap to it. */
export const ALIGN_SNAP_YARDS = 0.35;
/** How close an offensive player must be to the LOS to snap onto it. */
export const LOS_SNAP_YARDS = 0.7;

/**
 * Where a dragged player should actually land, and why.
 *
 * Dragging is magnetic rather than gridded: the position moves freely (rounded
 * to a tenth of a yard so float noise never reaches stored data) but clicks
 * onto meaningful lines when it passes near one — another player's depth or
 * column, or the line of scrimmage for an offensive player. Alignment is
 * relative in football ("stack behind Z", "same depth as F"), so the magnets
 * are other players rather than arbitrary grid lines. `free` (the Alt key)
 * bypasses the magnets for the rare deliberate near-miss placement.
 *
 * Returns `{ point, guides }`, where each guide names the axis value snapped to
 * and the player that produced it, so the canvas can draw the alignment line
 * through that player rather than an anonymous ruler.
 */
export function snapDragTarget(play, unit, playerId, target, { free = false } = {}) {
  const point = clampPoint([roundTo(target[0], 0.1), roundTo(target[1], 0.1)]);
  if (free) return { point, guides: { x: null, y: null } };

  const others = [...play.players, ...play.defenders].filter((player) => player.id !== playerId);
  const nearest = (axis) => {
    let best = null;
    for (const player of others) {
      const gap = Math.abs(player[axis] - point[axis === "x" ? 0 : 1]);
      if (gap <= ALIGN_SNAP_YARDS && (!best || gap < best.gap)) best = { gap, player };
    }
    return best;
  };

  const guides = { x: null, y: null };
  const columnMatch = nearest("x");
  if (columnMatch) {
    point[0] = columnMatch.player.x;
    guides.x = { value: columnMatch.player.x, playerId: columnMatch.player.id };
  }

  // The LOS outranks a player-depth magnet: "on the line" is the alignment that
  // matters most, and it is also where most nearby players already stand.
  if (unit === "offense" && Math.abs(point[1]) <= LOS_SNAP_YARDS) {
    point[1] = 0;
    guides.y = point[1] === target[1] ? null : { value: 0, playerId: null };
  } else {
    const rowMatch = nearest("y");
    if (rowMatch) {
      point[1] = rowMatch.player.y;
      guides.y = { value: rowMatch.player.y, playerId: rowMatch.player.id };
    }
  }
  return { point, guides };
}
