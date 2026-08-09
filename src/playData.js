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
  behindYards: 10,
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
const offensivePlayer = (label, x, y, sourceLabel = label) => ({
  id: `o-${label.toLowerCase()}`,
  label,
  sourceLabel,
  x,
  y,
});
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
  offensivePlayer("Z", 20, 0),
  offensivePlayer("Y", 12, -1.5),
  offensivePlayer("F", 8, -1.5),
  offensivePlayer("Q", 0, -SHOTGUN_DEPTH_YARDS),
  offensivePlayer("H", 3, -SHOTGUN_DEPTH_YARDS),
];

const doublesPlayers = [
  offensivePlayer("X", -20.5, 0),
  ...interiorLine(),
  offensivePlayer("Z", 20.5, 0),
  offensivePlayer("Y", -10.5, -1.5),
  offensivePlayer("F", 10.5, -1.5),
  offensivePlayer("Q", 0, -SHOTGUN_DEPTH_YARDS),
  offensivePlayer("H", 3, -SHOTGUN_DEPTH_YARDS),
];

const emptyPlayers = [
  offensivePlayer("X", -22, 0),
  ...interiorLine(),
  offensivePlayer("Z", 22, 0),
  offensivePlayer("Y", -12.5, -1.5),
  offensivePlayer("F", 12.5, -1.5),
  offensivePlayer("H", 7.5, -1.5),
  offensivePlayer("Q", 0, -SHOTGUN_DEPTH_YARDS),
];

// LSU's Tiger/Troop calls flex the H into the left slot. Keeping that
// ownership in the formation is what makes Panther H and Choice originate
// from the source player instead of from a generic backfield alignment.
const lsuTigerPlayers = [
  offensivePlayer("X", -22, 0, "X"),
  ...interiorLine(),
  offensivePlayer("Z", 22, 0, "Z"),
  offensivePlayer("H", -16, -1.5, "H"),
  offensivePlayer("Y", 8.5, -1.5, "Y"),
  offensivePlayer("F", 15, -1.5, "F"),
  offensivePlayer("Q", 0, -SHOTGUN_DEPTH_YARDS, "Q"),
];

const lsuTroopPlayers = [
  offensivePlayer("X", -22, 0, "X"),
  ...interiorLine(),
  offensivePlayer("Y", 22, 0, "Y"),
  offensivePlayer("H", -16, -1.5, "H"),
  offensivePlayer("F", 8.5, -1.5, "F"),
  offensivePlayer("Z", 15, -1.5, "Z"),
  offensivePlayer("Q", 0, -SHOTGUN_DEPTH_YARDS, "Q"),
];

const tripsLeftPlayers = [
  offensivePlayer("X", -21, 0),
  ...interiorLine(),
  offensivePlayer("Z", 21, 0),
  offensivePlayer("Y", -12, -1.5),
  offensivePlayer("F", -8, -1.5),
  offensivePlayer("Q", 0, -SHOTGUN_DEPTH_YARDS),
  offensivePlayer("H", 3, -SHOTGUN_DEPTH_YARDS),
];

const texasTechPlayers = [
  offensivePlayer("X", -21, 0, "X"),
  ...interiorLine(),
  offensivePlayer("Z", 21, 0, "Z"),
  offensivePlayer("Y", -12, -1.5, "S"),
  offensivePlayer("F", 12, -1.5, "Y"),
  offensivePlayer("Q", 0, -SHOTGUN_DEPTH_YARDS, "QB"),
  offensivePlayer("H", -3, -SHOTGUN_DEPTH_YARDS, "T"),
];

const lsuPlayers = [
  offensivePlayer("X", -20, 0, "X"),
  ...interiorLine(),
  offensivePlayer("Z", 20, 0, "Z"),
  offensivePlayer("Y", -10.5, -1.5, "Y"),
  offensivePlayer("F", 10.5, -1.5, "F"),
  offensivePlayer("Q", 0, -SHOTGUN_DEPTH_YARDS, "Q"),
  offensivePlayer("H", -3, -SHOTGUN_DEPTH_YARDS, "H"),
];

const airRaidPlayers = [
  offensivePlayer("X", -20.5, 0, "X"),
  ...interiorLine(),
  offensivePlayer("Z", 20.5, 0, "Z"),
  offensivePlayer("Y", -10.5, -1.5, "H"),
  offensivePlayer("F", 10.5, -1.5, "Y"),
  offensivePlayer("Q", 0, -SHOTGUN_DEPTH_YARDS, "QB"),
  offensivePlayer("H", 3, -SHOTGUN_DEPTH_YARDS, "T"),
];

const airRaidBackLeftPlayers = airRaidPlayers.map((player) => (
  player.label === "H" ? { ...player, x: -3 } : player
));

const texasTechTripsLeftPlayers = [
  offensivePlayer("X", -22, 0, "X"),
  ...interiorLine(),
  offensivePlayer("Z", 22, 0, "Z"),
  offensivePlayer("Y", -15, -1.5, "S"),
  offensivePlayer("F", -9, -1.5, "Y"),
  offensivePlayer("Q", 0, -SHOTGUN_DEPTH_YARDS, "QB"),
  offensivePlayer("H", -6, -SHOTGUN_DEPTH_YARDS, "T"),
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

// Texas Tech's selected diagrams include a clear, relevant opponent shell.
// These labels and landmarks are traced from the source pages; the Air Raid
// and LSU references intentionally carry no defense because none is shown.
const texasTechReferenceDefenders = [
  defensivePlayer("tt-c-l", "C", -22, 8),
  defensivePlayer("tt-b-l", "B", -15, 5.5),
  defensivePlayer("tt-ss", "SS", -10, 15),
  defensivePlayer("tt-e-l", "E", -6, 2.5),
  defensivePlayer("tt-t-l", "T", -3, 2.5),
  defensivePlayer("tt-t-r", "T", 3, 2.5),
  defensivePlayer("tt-e-r", "E", 6, 2.5),
  defensivePlayer("tt-b-m", "B", 0, 7),
  defensivePlayer("tt-b-r", "B", 15, 5.5),
  defensivePlayer("tt-c-r", "C", 22, 8),
  defensivePlayer("tt-fs", "FS", 10, 15),
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

function sanitizeRouteAlternative(alternative = {}, index = 0) {
  return {
    id: typeof alternative.id === "string" && alternative.id.trim()
      ? alternative.id.trim()
      : `alternative-${index + 1}`,
    label: typeof alternative.label === "string" && alternative.label.trim()
      ? alternative.label.trim()
      : `Alternative ${index + 1}`,
    when: typeof alternative.when === "string" ? alternative.when : "",
    release: releaseOptions.includes(alternative.release) ? alternative.release : "none",
    stemYards: clamp(Number(alternative.stemYards) || 0, 0, 40),
    breaks: Array.isArray(alternative.breaks) ? alternative.breaks.map(sanitizeBreak).slice(0, 4) : [],
  };
}

export function sanitizeRouteDefinition(definition = {}) {
  const alternatives = Array.isArray(definition.alternatives)
    ? definition.alternatives.map(sanitizeRouteAlternative).slice(0, 4)
    : [];
  const requestedAlternative = typeof definition.activeAlternativeId === "string"
    ? definition.activeAlternativeId
    : null;
  return {
    release: releaseOptions.includes(definition.release) ? definition.release : "none",
    stemYards: clamp(Number(definition.stemYards) || 0, 0, 40),
    breaks: Array.isArray(definition.breaks) ? definition.breaks.map(sanitizeBreak).slice(0, 4) : [],
    condition: typeof definition.condition === "string" ? definition.condition : "",
    alternatives,
    activeAlternativeId: alternatives.some((item) => item.id === requestedAlternative)
      ? requestedAlternative
      : null,
  };
}

export function routeDefinitionToPoints(start, definition) {
  const normalized = sanitizeRouteDefinition(definition);
  const alternative = normalized.alternatives.find((item) => item.id === normalized.activeAlternativeId);
  const effective = alternative ?? normalized;
  const [startX, startY] = start;
  const points = [[startX, startY]];
  let x = startX;
  let y = startY;

  if (effective.release === "inside" || effective.release === "outside") {
    x = clampFieldX(x + lateralDirection(startX, effective.release) * 1.5);
    y = clampFieldY(y + 1.5);
    points.push([roundTo(x, 0.1), roundTo(y, 0.1)]);
  }

  if (effective.stemYards > 0) {
    y = clampFieldY(startY + effective.stemYards);
    points.push([roundTo(x, 0.1), roundTo(y, 0.1)]);
  }

  effective.breaks.forEach((segment) => {
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
  const alternative = normalized.alternatives.find((item) => item.id === normalized.activeAlternativeId);
  const effective = alternative ?? normalized;
  const release = effective.release === "none"
    ? "No release"
    : `${effective.release[0].toUpperCase()}${effective.release.slice(1)} release`;
  const breakSummary = effective.breaks.length
    ? effective.breaks.map((segment) => `${segment.distanceYards} yd ${segment.direction} ${segment.angle}°`).join(" · ")
    : "vertical";
  const active = alternative ? `${alternative.label} · ` : "";
  return `${active}${release} · ${effective.stemYards} yd stem · ${breakSummary}`;
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

/** Coach-authored route whose editable definition is the source of truth. */
const structuredRoute = (id, playerRef, preset, definition, pace = 1, metadata = {}) => ({
  id,
  playerRef,
  unit: "offense",
  type: "Route",
  preset,
  pace,
  delay: 0,
  phase: "post",
  definition: sanitizeRouteDefinition(definition),
  geometryMode: "structured",
  evidence: {
    method: "coach-authored",
    confidence: "high",
    coachEdited: true,
  },
  ...metadata,
});

const sourceRoute = (id, playerRef, preset, definition, evidence = {}, pace = 1, metadata = {}) => ({
  id,
  playerRef,
  unit: "offense",
  type: "Route",
  preset,
  pace,
  delay: 0,
  phase: "post",
  definition: sanitizeRouteDefinition(definition),
  geometryMode: "structured",
  evidence: {
    method: evidence.method ?? "source-explicit",
    geometryBasis: evidence.geometryBasis ?? "source-explicit",
    confidence: evidence.confidence ?? "high",
    note: evidence.note ?? "",
    sourcePositionLabel: evidence.sourcePositionLabel ?? playerRef,
    coachEdited: false,
  },
  ...metadata,
});

const passSetAssignments = (prefix) => [
  assignment(`${prefix}-lt`, "offense", "LT", "Block", "Pass Set", { technique: "pass-set", direction: "left", target: "Edge", climb: false }),
  assignment(`${prefix}-lg`, "offense", "LG", "Block", "Pass Set", { technique: "pass-set", direction: "left", target: "Inside", climb: false }),
  assignment(`${prefix}-c`, "offense", "C", "Block", "Pass Set", { technique: "pass-set", direction: "right", target: "Mike", climb: false }),
  assignment(`${prefix}-rg`, "offense", "RG", "Block", "Pass Set", { technique: "pass-set", direction: "right", target: "Inside", climb: false }),
  assignment(`${prefix}-rt`, "offense", "RT", "Block", "Pass Set", { technique: "pass-set", direction: "right", target: "Edge", climb: false }),
];

const insideZoneAssignments = (prefix) => [
  assignment(`${prefix}-lt`, "offense", "LT", "Block", "Zone Left", { technique: "reach", direction: "left", target: "First covered defender", climb: true }),
  assignment(`${prefix}-lg`, "offense", "LG", "Block", "Zone Left", { technique: "combo", direction: "left", target: "Down lineman to linebacker", climb: true }),
  assignment(`${prefix}-c`, "offense", "C", "Block", "Zone Left", { technique: "reach", direction: "left", target: "Play-side A gap", climb: true }),
  assignment(`${prefix}-rg`, "offense", "RG", "Block", "Zone Left", { technique: "combo", direction: "left", target: "Down lineman to linebacker", climb: true }),
  assignment(`${prefix}-rt`, "offense", "RT", "Block", "Zone Left", { technique: "reach", direction: "left", target: "Back-side cutoff", climb: true }),
];

/** Non-route assignments derive their geometry from their definition. */
const assignment = (id, unit, playerRef, type, preset, definition, metadata = {}) => ({
  id,
  playerRef,
  unit,
  type,
  preset,
  pace: 1,
  delay: type === "Motion" ? -1.5 : 0,
  phase: assignmentPhaseForType(type),
  definition,
  ...metadata,
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
    conceptName: options.conceptName ?? name,
    family: options.family ?? "Mesh",
    personnel: options.personnel ?? "10 Personnel",
    formation: options.formation ?? "Trips Right Open",
    folder: options.folder ?? "Offense",
    protection: options.protection ?? "",
    blockingScheme: options.blockingScheme ?? "",
    variantOf: options.variantOf ?? null,
    conceptTemplateId: null,
    players,
    defenders,
    assignments: specs.map((spec) => resolveAssignment(spec, players, defenders)),
    sourcePage: options.sourcePage ?? null,
    sourceLabel: options.sourceLabel ?? null,
    sourceDocumentId: options.sourceDocumentId ?? null,
    sourceCall: options.sourceCall ?? options.name ?? name,
    sourceVerified: options.sourceVerified === true,
    referenceStatus: options.referenceStatus ?? null,
  };
};

export const plays = [
  play("mesh", "Mesh", [
    structuredRoute("mesh-x", "X", "Shallow", { release: "inside", stemYards: 4, breaks: [{ direction: "inside", angle: 90, distanceYards: 26 }], condition: "Run under the opposite crosser; keep moving versus man." }, 0.95),
    structuredRoute("mesh-f", "F", "Shallow", { release: "inside", stemYards: 5, breaks: [{ direction: "inside", angle: 90, distanceYards: 25 }], condition: "Set the mesh at 5–6 yards and avoid traffic." }, 0.95),
    structuredRoute("mesh-y", "Y", "Corner", { release: "outside", stemYards: 10, breaks: [{ direction: "outside", angle: 45, distanceYards: 15 }], condition: "Win over the flat defender." }, 1.04),
    structuredRoute("mesh-z", "Z", "Clear", { release: "outside", stemYards: 30, breaks: [], condition: "Remove the corner and cap defender." }, 1.08),
    structuredRoute("mesh-h", "H", "Swing", { release: "outside", stemYards: 0, breaks: [{ direction: "outside", angle: 90, distanceYards: 11 }], condition: "Check protection first, then expand." }, 0.9),
    ...passSetAssignments("mesh-block"),
    assignment("mesh-defense-m-fit", "defense", "d-m", "Fit", "B Fit", { responsibility: "B", technique: "spill" }),
    assignment("mesh-defense-el-rush", "defense", "d-e-l", "Rush", "Contain", { technique: "contain", gap: "C", direction: "left" }),
    assignment("mesh-defense-cbl-zone", "defense", "d-cb-l", "Zone", "Flat", { area: "flat", landmark: "Outside leverage on X" }),
  ], { family: "Mesh", formation: "Trips Right Open", personnel: "10 Personnel", folder: "Quick Game", protection: "Texas", blockingScheme: "Quick Pass Set" }),
  play("mesh-sit", "Mesh Sit", [
    structuredRoute("mesh-sit-x", "X", "Shallow Sit", { release: "inside", stemYards: 4, breaks: [{ direction: "inside", angle: 90, distanceYards: 14 }], condition: "Settle in grass versus zone; continue versus man." }, 0.95),
    structuredRoute("mesh-sit-f", "F", "Shallow", { release: "inside", stemYards: 5, breaks: [{ direction: "inside", angle: 90, distanceYards: 25 }], condition: "Keep moving through the mesh." }, 0.95),
    structuredRoute("mesh-sit-y", "Y", "Corner", { release: "outside", stemYards: 10, breaks: [{ direction: "outside", angle: 45, distanceYards: 15 }], condition: "Win over the flat defender." }, 1.04),
    structuredRoute("mesh-sit-z", "Z", "Clear", { release: "outside", stemYards: 30, breaks: [], condition: "Remove the corner and cap defender." }, 1.08),
    structuredRoute("mesh-sit-h", "H", "Swing", { release: "outside", stemYards: 0, breaks: [{ direction: "outside", angle: 90, distanceYards: 11 }], condition: "Check protection first, then expand." }, 0.9),
    ...passSetAssignments("mesh-sit-block"),
  ], { family: "Mesh", formation: "Trips Right Open", personnel: "10 Personnel", folder: "Quick Game", protection: "Texas", blockingScheme: "Quick Pass Set" }),
  play("mesh-wheel", "Mesh Wheel", [
    structuredRoute("mesh-wheel-x", "X", "Shallow", { release: "inside", stemYards: 4, breaks: [{ direction: "inside", angle: 90, distanceYards: 26 }], condition: "Keep moving versus man." }, 0.95),
    structuredRoute("mesh-wheel-f", "F", "Shallow", { release: "inside", stemYards: 5, breaks: [{ direction: "inside", angle: 90, distanceYards: 25 }], condition: "Set the mesh at 5–6 yards." }, 0.95),
    structuredRoute("mesh-wheel-y", "Y", "Post", { release: "inside", stemYards: 12, breaks: [{ direction: "inside", angle: 45, distanceYards: 17 }], condition: "Occupy the post safety." }, 1.04),
    structuredRoute("mesh-wheel-z", "Z", "Clear", { release: "outside", stemYards: 30, breaks: [], condition: "Remove the corner." }, 1.08),
    structuredRoute("mesh-wheel-h", "H", "Wheel", { release: "outside", stemYards: 0, breaks: [{ direction: "outside", angle: 90, distanceYards: 10 }, { direction: "vertical", angle: 0, distanceYards: 24 }], condition: "Wheel outside the shallow crosser." }, 0.98),
    ...passSetAssignments("mesh-wheel-block"),
  ], { family: "Mesh", formation: "Trips Right Open", personnel: "10 Personnel", folder: "Dropback", protection: "Florida", blockingScheme: "Half Slide" }),
  play("stick", "Trips Right Stick", [
    structuredRoute("stick-x", "X", "Fade", { release: "outside", stemYards: 30, breaks: [], condition: "Take the top off the corner." }, 1.08),
    structuredRoute("stick-y", "Y", "Stick", { release: "inside", stemYards: 6, breaks: [{ direction: "outside", angle: 90, distanceYards: 3 }], condition: "Turn away from leverage; settle in grass." }, 0.94),
    structuredRoute("stick-f", "F", "Arrow", { release: "outside", stemYards: 1, breaks: [{ direction: "outside", angle: 90, distanceYards: 12 }], condition: "Race to the flat." }, 1),
    structuredRoute("stick-z", "Z", "Fade", { release: "outside", stemYards: 30, breaks: [], condition: "Outside release unless pressed." }, 1.08),
    structuredRoute("stick-h", "H", "Check Swing", { release: "outside", stemYards: 0, breaks: [{ direction: "outside", angle: 90, distanceYards: 9 }], condition: "Check edge pressure first." }, 0.9),
    ...passSetAssignments("stick-block"),
  ], { family: "Stick", formation: "Trips Right Open", personnel: "10 Personnel", folder: "Quick Game", protection: "Texas", blockingScheme: "Quick Pass Set" }),
  play("y-cross", "Doubles Y Cross", [
    structuredRoute("y-cross-x", "X", "Go", { release: "outside", stemYards: 34, breaks: [], condition: "Mandatory outside release." }, 1.08),
    structuredRoute("y-cross-y", "Y", "Cross", { release: "inside", stemYards: 8, breaks: [{ direction: "inside", angle: 35, distanceYards: 26 }], condition: "Climb over linebackers at 18–22 yards." }, 1.02),
    structuredRoute("y-cross-f", "F", "Dig", { release: "inside", stemYards: 12, breaks: [{ direction: "inside", angle: 90, distanceYards: 14 }], condition: "Find the window behind the hook defender." }, 0.98),
    structuredRoute("y-cross-z", "Z", "Post", { release: "inside", stemYards: 14, breaks: [{ direction: "inside", angle: 45, distanceYards: 18 }], condition: "Hold or cross the post safety." }, 1.04),
    structuredRoute("y-cross-h", "H", "Swing", { release: "outside", stemYards: 0, breaks: [{ direction: "outside", angle: 90, distanceYards: 12 }], condition: "Check protection, then outlet." }, 0.9),
    ...passSetAssignments("y-cross-block"),
  ], { family: "Y Cross", formation: "Doubles", personnel: "10 Personnel", players: doublesPlayers, folder: "Dropback", protection: "Florida", blockingScheme: "Half Slide" }),
  play("inside-zone-glance", "Inside Zone Glance", [
    structuredRoute("izg-x", "X", "Glance", { release: "inside", stemYards: 7, breaks: [{ direction: "inside", angle: 45, distanceYards: 12 }], condition: "Replace an overhang who inserts into the fit." }, 0.98),
    structuredRoute("izg-y", "Y", "Arc", { release: "outside", stemYards: 8, breaks: [], condition: "Arc the force defender." }, 0.94),
    structuredRoute("izg-f", "F", "Bubble", { release: "outside", stemYards: 0, breaks: [{ direction: "outside", angle: 90, distanceYards: 12 }], condition: "Fast width; stay behind the line." }, 1),
    structuredRoute("izg-z", "Z", "Fade", { release: "outside", stemYards: 28, breaks: [], condition: "Clear the corner." }, 1.06),
    ...insideZoneAssignments("izg-block"),
  ], { family: "Inside Zone RPO", formation: "Trips Right Open", personnel: "10 Personnel", folder: "Run Game", protection: "Run Action", blockingScheme: "Inside Zone" }),
];

const evidence = (sourcePositionLabel, note, confidence = "high") => ({ sourcePositionLabel, note, confidence });

const tracedEvidence = (sourcePositionLabel, note, confidence = "medium-high") => ({
  sourcePositionLabel,
  note,
  confidence,
  method: "diagram-traced",
  geometryBasis: "diagram-traced",
});

const neutralEvidence = (sourcePositionLabel, note, confidence = "medium") => ({
  sourcePositionLabel,
  note,
  confidence,
  method: "source-explicit",
  geometryBasis: "neutral-animation",
});

const referenceOptions = ({ documentId, documentTitle, call, page, family, formation = "Doubles", players, defenders = [], folder, protection = "", blockingScheme = "Pass Set", variantOf = null }) => ({
  family,
  formation,
  personnel: "10 Personnel",
  players,
  defenders,
  folder,
  protection,
  blockingScheme,
  variantOf,
  sourcePage: page,
  sourceLabel: documentTitle,
  sourceDocumentId: documentId,
  sourceCall: call,
  sourceVerified: true,
  referenceStatus: "verified-reference",
});

const airRaidOptions = (call, page, family, folder, extra = {}) => referenceOptions({
  documentId: "air-raid-pass-plays",
  documentTitle: "Air Raid Offense Passing Plays",
  call,
  page,
  family,
  folder,
  formation: "Doubles",
  players: airRaidPlayers,
  ...extra,
});

const airRaidPlays = [
  play("air-60-hitch", "All Hitch", [
    sourceRoute("air-hitch-x", "X", "Hitch", { release: "none", stemYards: 6, breaks: [{ direction: "inside", angle: 135, distanceYards: 2 }], condition: "" }, neutralEvidence("X", "Hitch is explicit; depth and curl are neutral animation geometry."), 0.96),
    sourceRoute("air-hitch-y", "Y", "Hitch", { release: "none", stemYards: 6, breaks: [{ direction: "inside", angle: 135, distanceYards: 2 }], condition: "" }, neutralEvidence("H", "Hitch is explicit; canonical Y is source H. Depth is neutral for animation."), 0.96),
    sourceRoute("air-hitch-f", "F", "Hitch", { release: "none", stemYards: 6, breaks: [{ direction: "inside", angle: 135, distanceYards: 2 }], condition: "" }, neutralEvidence("Y", "Hitch is explicit; canonical F is source Y. Depth is neutral for animation."), 0.96),
    sourceRoute("air-hitch-z", "Z", "Hitch", { release: "none", stemYards: 6, breaks: [{ direction: "inside", angle: 135, distanceYards: 2 }], condition: "" }, neutralEvidence("Z", "Hitch is explicit; depth and curl are neutral animation geometry."), 0.96),
    assignment("air-hitch-h", "offense", "H", "Block", "Protect", { technique: "pass-set", direction: "right", target: "Inside-out", climb: false }, { evidence: { method: "source-explicit", geometryBasis: "neutral-animation", note: "T Protect is explicit; the short protection track is neutral animation geometry." } }),
  ], airRaidOptions("60 Hitch", 2, "Hitch", "Quick Game", { protection: "60", blockingScheme: "Unspecified" })),
  play("air-y-cross", "Y Cross", [
    sourceRoute("air-cross-x", "X", "Go", { release: "none", stemYards: 34, breaks: [], condition: "" }, tracedEvidence("X", "Go label and path are shown; depth is traced from the diagram."), 1.08),
    sourceRoute("air-cross-y", "Y", "Post", { release: "none", stemYards: 12, breaks: [{ direction: "inside", angle: 45, distanceYards: 20 }], condition: "" }, tracedEvidence("H", "Post path is shown; canonical Y is source H."), 1.03),
    sourceRoute("air-cross-f", "F", "Cross", { release: "none", stemYards: 8, breaks: [{ direction: "inside", angle: 55, distanceYards: 28 }], condition: "" }, tracedEvidence("Y", "Cross path is shown; canonical F is source Y."), 1.01),
    sourceRoute("air-cross-z", "Z", "Hitch", { release: "none", stemYards: 6, breaks: [{ direction: "inside", angle: 135, distanceYards: 2 }], condition: "" }, neutralEvidence("Z", "Hitch is explicit; depth is neutral for animation."), 0.96),
    sourceRoute("air-cross-h", "H", "Shoot", { release: "none", stemYards: 0, breaks: [{ direction: "outside", angle: 90, distanceYards: 12 }], condition: "" }, tracedEvidence("T", "Shoot path is shown to the left; canonical H is source T."), 0.92),
  ], airRaidOptions("Y-Cross", 5, "Y Cross", "Dropback", { players: airRaidBackLeftPlayers, protection: "Unspecified", blockingScheme: "Unspecified" })),
  play("air-91-y-smash", "Smash", [
    sourceRoute("air-smash-x", "X", "Hitch", { release: "none", stemYards: 6, breaks: [{ direction: "inside", angle: 135, distanceYards: 2 }], condition: "" }, neutralEvidence("X", "Hitch is explicit; depth is neutral for animation."), 0.96),
    sourceRoute("air-smash-y", "Y", "Post", { release: "inside", stemYards: 12, breaks: [{ direction: "inside", angle: 45, distanceYards: 18 }], condition: "Hold the middle safety." }, evidence("H", "Post explicitly labeled; canonical Y is source H."), 1.03),
    sourceRoute("air-smash-f", "F", "Corner", { release: "outside", stemYards: 10, breaks: [{ direction: "outside", angle: 45, distanceYards: 18 }], condition: "Stay over the flat defender." }, evidence("Y", "Corner explicitly labeled; canonical F is source Y."), 1.02),
    sourceRoute("air-smash-z", "Z", "Quick Hitch", { release: "none", stemYards: 3, breaks: [{ direction: "inside", angle: 135, distanceYards: 1 }], condition: "Two-to-three-yard access throw." }, evidence("Z", "2-3 Yd. Hitch explicitly labeled."), 0.94),
    assignment("air-smash-h", "offense", "H", "Block", "Protect / middle curl", { technique: "pass-set", direction: "right", target: "Inside-out", climb: false }, { evidence: { method: "source-explicit", geometryBasis: "neutral-animation", note: "T Protect or Middle Curl is explicit; the preview shows the protection branch." } }),
  ], airRaidOptions("91 Y", 7, "Smash", "Quick Game", { protection: "91", blockingScheme: "Unspecified" })),
  play("air-94-y-sail", "Sail", [
    sourceRoute("air-sail-x", "X", "Dig", { release: "inside", stemYards: 12, breaks: [{ direction: "inside", angle: 90, distanceYards: 16 }], condition: "Find the backside window." }, evidence("X", "Dig explicitly labeled."), 0.99),
    sourceRoute("air-sail-y", "Y", "Shoot", { release: "outside", stemYards: 1, breaks: [{ direction: "outside", angle: 90, distanceYards: 12 }], condition: "Fast to the flat." }, evidence("H", "Shoot explicitly labeled; canonical Y is source H."), 0.94),
    sourceRoute("air-sail-f", "F", "Sail", { release: "outside", stemYards: 10, breaks: [{ direction: "outside", angle: 55, distanceYards: 18 }], condition: "Stay between the corner and flat defender." }, evidence("Y", "Sail explicitly labeled; canonical F is source Y.", "medium-high"), 1.02),
    sourceRoute("air-sail-z", "Z", "Go", { release: "outside", stemYards: 34, breaks: [], condition: "Clear the corner." }, evidence("Z", "Go explicitly labeled."), 1.08),
    sourceRoute("air-sail-h", "H", "Swing", { release: "outside", stemYards: 0, breaks: [{ direction: "outside", angle: 90, distanceYards: 12 }], condition: "Outlet under the sail." }, evidence("T", "Swing explicitly labeled; canonical H is source T."), 0.9),
  ], airRaidOptions("94 Y", 10, "Sail", "Dropback", { protection: "94", blockingScheme: "Unspecified" })),
];

const lsuOptions = (call, page, family, formation, folder, extra = {}) => referenceOptions({
  documentId: "lsu-2019-offense",
  documentTitle: "2019 LSU Offense Playbook",
  call,
  page,
  family,
  folder,
  formation,
  players: formation.startsWith("Tiger") || formation === "Empty"
    ? lsuTigerPlayers
    : formation === "Troop"
      ? lsuTroopPlayers
      : lsuPlayers,
  ...extra,
});

const lsuPlays = [
  play("lsu-stick", "Stick", [
    sourceRoute("lsu-stick-x", "X", "Access Out", { release: "none", stemYards: 3, breaks: [{ direction: "outside", angle: 90, distanceYards: 4 }], condition: "Take access with width over depth." }, evidence("X", "2-3 YDS and width-over-depth labels are explicit."), 0.96),
    sourceRoute("lsu-stick-y", "Y", "Stick", { release: "none", stemYards: 5, breaks: [{ direction: "outside", angle: 90, distanceYards: 3 }], condition: "Read man/zone; turn away from leverage.", alternatives: [{ id: "man-out", label: "Out versus man", when: "Man with inside leverage", release: "none", stemYards: 5, breaks: [{ direction: "outside", angle: 90, distanceYards: 6 }] }] }, evidence("Y", "5 YDS and READ MAN/ZONE are explicit."), 0.95),
    sourceRoute("lsu-stick-f", "F", "Stick", { release: "none", stemYards: 5, breaks: [{ direction: "outside", angle: 90, distanceYards: 3 }], condition: "Read man/zone; turn away from leverage.", alternatives: [{ id: "man-out", label: "Out versus man", when: "Man with inside leverage", release: "none", stemYards: 5, breaks: [{ direction: "outside", angle: 90, distanceYards: 6 }] }] }, evidence("F", "5 YDS and READ MAN/ZONE are explicit."), 0.95),
    sourceRoute("lsu-stick-z", "Z", "Access Out", { release: "none", stemYards: 3, breaks: [{ direction: "outside", angle: 90, distanceYards: 4 }], condition: "Take access with width over depth." }, evidence("Z", "2-3 YDS and width-over-depth labels are explicit."), 0.96),
    sourceRoute("lsu-stick-h", "H", "Check Arrow", { release: "outside", stemYards: 0, breaks: [{ direction: "outside", angle: 90, distanceYards: 10 }], condition: "Check eyes, then arrow." }, evidence("H", "CHECK EYES and ARROW are explicit."), 0.88),
  ], lsuOptions("L DICE JORDAN STICKY", 37, "Stick", "Dice", "Quick Game", { protection: "Jordan", blockingScheme: "Unspecified" })),
  play("lsu-choice", "Choice", [
    sourceRoute("lsu-choice-x", "X", "Choice Corner", { release: "none", stemYards: 12, breaks: [{ direction: "outside", angle: 45, distanceYards: 14 }], condition: "Corner/choice by man-zone and leverage.", alternatives: [{ id: "zone-settle", label: "Settle versus zone", when: "Zone", release: "none", stemYards: 5, breaks: [{ direction: "inside", angle: 90, distanceYards: 4 }] }] }, evidence("X", "12 YDS, leverage conversions, and alert are explicit."), 1.02),
    sourceRoute("lsu-choice-y", "Y", "Hitch", { release: "none", stemYards: 5, breaks: [{ direction: "inside", angle: 135, distanceYards: 2 }], condition: "Access versus soft leverage." }, evidence("Y", "Hitch/choice relationship visible.", "medium-high"), 0.95),
    sourceRoute("lsu-choice-f", "F", "Stick", { release: "none", stemYards: 5, breaks: [{ direction: "outside", angle: 90, distanceYards: 4 }], condition: "Read man/zone; force outside release." }, evidence("F", "5 YDS and READ MAN/ZONE are explicit."), 0.95),
    sourceRoute("lsu-choice-z", "Z", "Locked Hitch / Fade", { release: "outside", stemYards: 5, breaks: [{ direction: "inside", angle: 135, distanceYards: 2 }], condition: "Locked hitch; alert fade versus man.", alternatives: [{ id: "fade-v-man", label: "Fade versus man", when: "Alert versus man", release: "outside", stemYards: 34, breaks: [] }] }, evidence("Z", "LOCKED HITCH and ALERT VS. MAN are explicit."), 1.02),
    sourceRoute("lsu-choice-h", "H", "Choice", { release: "outside", stemYards: 2, breaks: [{ direction: "outside", angle: 65, distanceYards: 12 }], condition: "Choice away from leverage." }, evidence("H", "CHOICE explicitly labeled.", "medium-high"), 0.9),
  ], lsuOptions("R TROOP PACER SHOCK CHOICE", 39, "Choice", "Troop", "Dropback", { protection: "Pacer", blockingScheme: "Unspecified" })),
  play("lsu-hank", "Hank / Spacing", [
    sourceRoute("lsu-hank-x", "X", "Hook", { release: "none", stemYards: 10, breaks: [{ direction: "outside", angle: 135, distanceYards: 3 }], condition: "Hook and find outside void." }, evidence("X", "10 YDS and HOOK are explicit."), 0.96),
    sourceRoute("lsu-hank-y", "Y", "Middle Hook", { release: "none", stemYards: 5, breaks: [], condition: "Find the void." }, evidence("Y", "5 YDS FIND THE VOID is explicit."), 0.92),
    sourceRoute("lsu-hank-f", "F", "Flat Hook", { release: "outside", stemYards: 4, breaks: [{ direction: "outside", angle: 90, distanceYards: 7 }], condition: "Expand 4-6 yards, then settle." }, evidence("F", "FLAT/HOOK and 4-6 YDS are explicit."), 0.94),
    sourceRoute("lsu-hank-z", "Z", "Hook", { release: "none", stemYards: 10, breaks: [{ direction: "inside", angle: 135, distanceYards: 3 }], condition: "Hook and find the inside void." }, evidence("Z", "10 YDS and the inward hook are explicit."), 0.96),
    sourceRoute("lsu-hank-h", "H", "Arrow", { release: "outside", stemYards: 0, breaks: [{ direction: "outside", angle: 90, distanceYards: 11 }], condition: "Immediate arrow." }, evidence("H", "ARROW explicitly labeled."), 0.9),
  ], lsuOptions("L DICE PACER HANK", 40, "Hank", "Dice", "Dropback", { protection: "Pacer", blockingScheme: "Unspecified" })),
  play("lsu-four-verticals", "Four Verticals", [
    sourceRoute("lsu-verts-x", "X", "Go", { release: "best", stemYards: 34, breaks: [], condition: "Best release; alert versus access." }, evidence("X", "BEST REL. GO and alert are explicit."), 1.06),
    sourceRoute("lsu-verts-y", "Y", "Bender", { release: "none", stemYards: 11, breaks: [{ direction: "inside", angle: 30, distanceYards: 20 }], condition: "Bender versus MFO; seam versus MFC.", alternatives: [{ id: "seam-mfc", label: "Seam versus MFC", when: "Middle field closed", release: "none", stemYards: 34, breaks: [] }] }, evidence("Y", "10-12 YDS plus MFO bender/MFC seam are explicit."), 1.01),
    sourceRoute("lsu-verts-f", "F", "Bender", { release: "none", stemYards: 11, breaks: [{ direction: "inside", angle: 30, distanceYards: 20 }], condition: "Bender versus MFO; seam versus MFC.", alternatives: [{ id: "seam-mfc", label: "Seam versus MFC", when: "Middle field closed", release: "none", stemYards: 34, breaks: [] }] }, evidence("F", "10-12 YDS plus MFO bender/MFC seam are explicit."), 1.01),
    sourceRoute("lsu-verts-z", "Z", "Go", { release: "best", stemYards: 34, breaks: [], condition: "Best release; go." }, evidence("Z", "BEST REL. GO is explicit."), 1.06),
    sourceRoute("lsu-verts-h", "H", "Check Balloon", { release: "outside", stemYards: 0, breaks: [{ direction: "outside", angle: 90, distanceYards: 9 }], condition: "Check protection, then balloon." }, evidence("H", "CHECK BALLOON is explicit."), 0.84),
  ], lsuOptions("L DOME JORDAN CAT", 41, "Four Verticals", "Dome", "Verticals", { protection: "Jordan", blockingScheme: "Unspecified" })),
  play("lsu-shallow", "Shallow Cross", [
    sourceRoute("lsu-shallow-x", "X", "Go", { release: "best", stemYards: 34, breaks: [], condition: "Best release; go." }, evidence("X", "BEST REL. GO is explicit."), 1.06),
    sourceRoute("lsu-shallow-y", "Y", "Deep Over", { release: "inside", stemYards: 11, breaks: [{ direction: "inside", angle: 45, distanceYards: 20 }], condition: "Bender versus MFO.", alternatives: [{ id: "bender-mfo", label: "Bender versus MFO", when: "Middle field open", release: "inside", stemYards: 11, breaks: [{ direction: "inside", angle: 30, distanceYards: 22 }] }] }, evidence("Y", "10-12 YDS deep over and MFO bender are explicit."), 1.02),
    sourceRoute("lsu-shallow-f", "F", "Bender", { release: "inside", stemYards: 11, breaks: [{ direction: "inside", angle: 30, distanceYards: 20 }], condition: "Seam versus MFC; bender versus MFO." }, evidence("F", "10-12 YDS and BENDER READ are explicit."), 1.01),
    sourceRoute("lsu-shallow-z", "Z", "Go", { release: "best", stemYards: 34, breaks: [], condition: "Best release; go." }, evidence("Z", "BEST REL. GO is explicit."), 1.06),
    sourceRoute("lsu-shallow-h", "H", "Shallow", { release: "inside", stemYards: 4, breaks: [{ direction: "inside", angle: 90, distanceYards: 28 }], condition: "Continue versus man; throttle in zone." }, evidence("H", "4-6 YDS shallow and READ IT are explicit."), 0.94),
  ], lsuOptions("R TIGER PACER PANTHER H", 49, "Shallow Cross", "Tiger", "Dropback", { protection: "Pacer", blockingScheme: "Unspecified" })),
  play("lsu-snag", "Snag", [
    sourceRoute("lsu-snag-x", "X", "Snag", { release: "outside", stemYards: 4, breaks: [{ direction: "outside", angle: 75, distanceYards: 6 }], condition: "Sit versus zone." }, evidence("X", "4 YDS, SNAG, and SIT VS. ZONE are explicit."), 0.93),
    sourceRoute("lsu-snag-y", "Y", "Basic", { release: "inside", stemYards: 12, breaks: [{ direction: "inside", angle: 90, distanceYards: 14 }], condition: "Get friendly across the field." }, evidence("Y", "12 YDS GET FRIENDLY is explicit."), 0.99),
    sourceRoute("lsu-snag-f", "F", "Lucy Slant", { release: "inside", stemYards: 4, breaks: [{ direction: "inside", angle: 45, distanceYards: 10 }], condition: "Slant until you cannot; settle versus zone." }, evidence("F", "SLANT UNTIL YOU CAN'T is explicit."), 0.96),
    sourceRoute("lsu-snag-z", "Z", "Go", { release: "outside", stemYards: 34, breaks: [], condition: "Collision through outside shoulder; clear." }, evidence("Z", "Collision instruction and bus-ticket clear are explicit."), 1.04),
    sourceRoute("lsu-snag-h", "H", "Flat", { release: "outside", stemYards: 0, breaks: [{ direction: "outside", angle: 90, distanceYards: 12 }], condition: "Fast flat under the snag." }, evidence("H", "FLAT explicitly labeled."), 0.91),
  ], lsuOptions("L DOME PACER LUCY SNAG", 66, "Snag", "Dome", "Dropback", { protection: "Pacer", blockingScheme: "Unspecified" })),
  play("lsu-empty-choice", "Empty Choice", [
    sourceRoute("lsu-empty-x", "X", "Alert Corner", { release: "none", stemYards: 12, breaks: [{ direction: "outside", angle: 45, distanceYards: 14 }], condition: "Alert corner." }, evidence("X", "ALERT and the 12-yard corner are explicit."), 1.02),
    sourceRoute("lsu-empty-y", "Y", "Seam Read", { release: "inside", stemYards: 11, breaks: [{ direction: "inside", angle: 30, distanceYards: 20 }], condition: "Deep over versus MFC; take middle versus MFO." }, evidence("Y", "10-12 YDS and seam-read rules are explicit."), 1.01),
    sourceRoute("lsu-empty-f", "F", "Spot", { release: "inside", stemYards: 5, breaks: [{ direction: "inside", angle: 45, distanceYards: 6 }], condition: "Find the void." }, evidence("F", "5 YDS FIND THE VOID is explicit."), 0.93),
    sourceRoute("lsu-empty-z", "Z", "Spot", { release: "inside", stemYards: 5, breaks: [{ direction: "inside", angle: 45, distanceYards: 6 }], condition: "Find the void." }, evidence("Z", "5 YDS FIND THE VOID is explicit."), 0.93),
    sourceRoute("lsu-empty-h", "H", "Choice", { release: "none", stemYards: 5, breaks: [{ direction: "outside", angle: 90, distanceYards: 5 }], condition: "Convert by man/zone and inside/outside leverage.", alternatives: [{ id: "zone-settle", label: "Settle versus zone", when: "Zone", release: "none", stemYards: 5, breaks: [{ direction: "inside", angle: 90, distanceYards: 4 }] }] }, evidence("H", "CHOICE, 5 YDS, and the leverage conversions are explicit."), 0.96),
  ], lsuOptions("R TIGER PACER SPARK CHOICE", 57, "Choice", "Tiger Empty", "Empty", { protection: "Pacer", blockingScheme: "Unspecified", variantOf: "lsu-choice" })),
];

const texasTechOptions = (call, page, family, formation, folder, extra = {}) => referenceOptions({
  documentId: "texas-tech-mike-leach",
  documentTitle: "Texas Tech Style Offensive Attack",
  call,
  page,
  family,
  folder,
  formation,
  players: formation === "Trips Left" ? texasTechTripsLeftPlayers : texasTechPlayers,
  defenders: texasTechReferenceDefenders,
  ...extra,
});

const texasTechPlays = [
  play("tt-z-mesh", "Z Mesh", [
    sourceRoute("tt-zmesh-x", "X", "Shallow", { release: "inside", stemYards: 5, breaks: [{ direction: "inside", angle: 80, distanceYards: 27 }], condition: "Continue across the formation." }, tracedEvidence("X", "Shallow path is traced from the diagram."), 0.92),
    sourceRoute("tt-zmesh-y", "Y", "Speed Out", { release: "none", stemYards: 12, breaks: [{ direction: "outside", angle: 90, distanceYards: 7 }], condition: "Read 2 in the source progression." }, tracedEvidence("S", "Canonical Y is source S; the out and read 2 are visible."), 0.98),
    sourceRoute("tt-zmesh-f", "F", "Post", { release: "inside", stemYards: 14, breaks: [{ direction: "inside", angle: 45, distanceYards: 20 }], condition: "Read 1 in the source progression." }, tracedEvidence("Y", "Canonical F is source Y; the post and read 1 are visible."), 1.04),
    sourceRoute("tt-zmesh-z", "Z", "Mesh", { release: "inside", stemYards: 5, breaks: [{ direction: "inside", angle: 80, distanceYards: 30 }], condition: "Read 3 in the source progression." }, tracedEvidence("Z", "Mesh path and read 3 are visible."), 0.92),
    sourceRoute("tt-zmesh-h", "H", "Swing", { release: "outside", stemYards: 0, breaks: [{ direction: "outside", angle: 75, distanceYards: 16 }], condition: "Outlet under the mesh." }, tracedEvidence("T", "Canonical H is source T; the left swing is traced from the diagram."), 0.87),
  ], texasTechOptions("700 Z MESH", 118, "Mesh", "Doubles", "Dropback", { protection: "700", blockingScheme: "Unspecified" })),
  play("tt-y-mesh", "Y Mesh", [
    sourceRoute("tt-ymesh-x", "X", "Mesh", { release: "inside", stemYards: 5, breaks: [{ direction: "inside", angle: 80, distanceYards: 28 }], condition: "Continue across the formation." }, tracedEvidence("X", "The left-to-right mesh path is traced from the diagram."), 0.92),
    sourceRoute("tt-ymesh-y", "Y", "Post", { release: "outside", stemYards: 14, breaks: [{ direction: "outside", angle: 45, distanceYards: 20 }], condition: "Read 1 in the source progression." }, tracedEvidence("S", "Canonical Y is source S; the post and read 1 are visible."), 1.04),
    sourceRoute("tt-ymesh-f", "F", "Mesh", { release: "inside", stemYards: 5, breaks: [{ direction: "inside", angle: 80, distanceYards: 28 }], condition: "Read 2 in the source progression." }, tracedEvidence("Y", "Canonical F is source Y; the right-to-left mesh and read 2 are visible."), 0.92),
    sourceRoute("tt-ymesh-z", "Z", "Post", { release: "inside", stemYards: 14, breaks: [{ direction: "inside", angle: 45, distanceYards: 20 }], condition: "Clear the right side." }, tracedEvidence("Z", "Post path is traced from the diagram."), 1.04),
    sourceRoute("tt-ymesh-h", "H", "Swing", { release: "outside", stemYards: 0, breaks: [{ direction: "outside", angle: 75, distanceYards: 16 }], condition: "Read 3 in the source progression." }, tracedEvidence("T", "Canonical H is source T; the left swing and read 3 are visible."), 0.87),
  ], texasTechOptions("700 Y MESH", 120, "Mesh", "Doubles", "Dropback", { protection: "700", blockingScheme: "Unspecified", variantOf: "tt-z-mesh" })),
  play("tt-crack-go", "Crack-and-Go Motion", [
    sourceRoute("tt-crack-x", "X", "Deep Cross", { release: "inside", stemYards: 8, breaks: [{ direction: "inside", angle: 60, distanceYards: 24 }], condition: "Read 4 in the source progression." }, tracedEvidence("X", "Backside crossing path and read 4 are visible."), 1.01),
    assignment("tt-crack-y-motion", "offense", "Y", "Motion", "Rip", { motionType: "jet", direction: "right", distanceYards: 20 }, { evidence: { method: "diagram-traced", geometryBasis: "diagram-traced", note: "RIP motion is drawn left to right." } }),
    assignment("tt-crack-y-block", "offense", "Y", "Block", "Crack", { technique: "down", direction: "right", target: "Force defender", climb: false }, { evidence: { method: "diagram-traced", geometryBasis: "diagram-traced", note: "The crack path after motion is shown." } }),
    sourceRoute("tt-crack-f", "F", "Post", { release: "inside", stemYards: 12, breaks: [{ direction: "inside", angle: 45, distanceYards: 20 }], condition: "Read 2 in the source progression." }, tracedEvidence("Y", "Canonical F is source Y; read 2 and the post path are visible."), 1.04),
    sourceRoute("tt-crack-z", "Z", "Crack-and-Go", { release: "inside", stemYards: 4, breaks: [{ direction: "outside", angle: 60, distanceYards: 6 }, { direction: "vertical", angle: 0, distanceYards: 25 }], condition: "Read 1 in the source progression." }, tracedEvidence("Z", "Crack-and-go path and read 1 are visible."), 1.05),
    sourceRoute("tt-crack-h", "H", "Shoot", { release: "inside", stemYards: 0, breaks: [{ direction: "inside", angle: 75, distanceYards: 13 }], condition: "Read 3 in the source progression." }, tracedEvidence("T", "Canonical H is source T; the right shoot and read 3 are visible."), 0.91),
  ], texasTechOptions("60 CRACK & GO", 116, "Crack-and-Go", "Doubles", "Motion Pass", { protection: "60", blockingScheme: "Diagrammed blocking" })),
  play("tt-bubble", "Bubble Screen", [
    assignment("tt-bubble-x", "offense", "X", "Block", "Stalk", { technique: "drive", direction: "left", target: "Corner", climb: false }, { evidence: { method: "diagram-traced", geometryBasis: "diagram-traced", note: "Source X stalks the corner." } }),
    assignment("tt-bubble-y", "offense", "Y", "Block", "Alley", { technique: "reach", direction: "right", target: "Apex defender", climb: true }, { evidence: { method: "diagram-traced", geometryBasis: "diagram-traced", note: "Source S blocks the alley defender." } }),
    sourceRoute("tt-bubble-f", "F", "Bubble", { release: "outside", stemYards: 0, breaks: [{ direction: "outside", angle: 95, distanceYards: 12 }], condition: "Read 1 in the source progression." }, tracedEvidence("Y", "Canonical F is source Y; the bubble and read 1 are visible."), 1.03),
    sourceRoute("tt-bubble-z", "Z", "Backside Access Choice", { release: "none", stemYards: 8, breaks: [{ direction: "inside", angle: 135, distanceYards: 2 }], condition: "Choose the access conversion shown in the source.", alternatives: [{ id: "access-go", label: "Go access", when: "Take the vertical access", release: "none", stemYards: 34, breaks: [] }, { id: "access-slant", label: "Slant access", when: "Take the inside access", release: "none", stemYards: 5, breaks: [{ direction: "inside", angle: 45, distanceYards: 12 }] }] }, tracedEvidence("Z", "The vertical, inside, and settle access branches are all drawn; the trigger is not specified."), 0.96),
    assignment("tt-bubble-h", "offense", "H", "Block", "Inside lead", { technique: "reach", direction: "right", target: "Inside support", climb: false }, { evidence: { method: "diagram-traced", geometryBasis: "diagram-traced", note: "Source T works inside in the diagram." } }),
  ], texasTechOptions("300 BUBBLE", 223, "Bubble Screen", "Trips Left", "Screens", { protection: "300", blockingScheme: "Perimeter Screen" })),
];

export const defaultFormations = [
  { id: "trips-right-open", name: "Trips Right Open", personnel: "10 Personnel", players: clonePlaybook(basePlayers) },
  { id: "doubles", name: "Doubles", personnel: "10 Personnel", players: clonePlaybook(doublesPlayers) },
  { id: "trips-left", name: "Trips Left", personnel: "10 Personnel", players: clonePlaybook(tripsLeftPlayers) },
  { id: "empty", name: "Empty", personnel: "10 Personnel", players: clonePlaybook(emptyPlayers) },
];

export const REFERENCE_PLAYBOOK_IDS = ["air-raid-reference", "lsu-2019-reference", "texas-tech-reference"];
export const LEGACY_REFERENCE_PLAYBOOK_IDS = ["texas-tech-sample", "lsu-2019-sample"];

export const seedPlaybooks = [
  {
    id: MAIN_PLAYBOOK_ID,
    name: "Personal Active",
    description: "Your working playbook",
    isMain: true,
    readOnly: false,
    source: "personal",
    formations: defaultFormations,
    concepts: [],
    plays,
  },
  {
    id: "air-raid-reference",
    name: "Air Raid Reference",
    description: "4 verified 10-personnel concepts",
    isMain: false,
    readOnly: true,
    source: "Air Raid Offense Passing Plays",
    formations: [{ id: "air-raid-doubles", name: "Doubles", personnel: "10 Personnel", players: clonePlaybook(airRaidPlayers) }],
    concepts: [],
    plays: airRaidPlays,
  },
  {
    id: "lsu-2019-reference",
    name: "LSU 2019 Reference",
    description: "7 verified 10-personnel concepts",
    isMain: false,
    readOnly: true,
    source: "2019 LSU Offense Playbook",
    formations: [
      { id: "lsu-doubles", name: "Doubles", personnel: "10 Personnel", players: clonePlaybook(lsuPlayers) },
      { id: "lsu-empty", name: "Empty", personnel: "10 Personnel", players: clonePlaybook(emptyPlayers) },
    ],
    concepts: [],
    plays: lsuPlays,
  },
  {
    id: "texas-tech-reference",
    name: "Texas Tech Reference",
    description: "4 verified 10-personnel concepts",
    isMain: false,
    readOnly: true,
    source: "Texas Tech Style Offensive Attack",
    formations: [
      { id: "texas-tech-doubles", name: "Doubles", personnel: "10 Personnel", players: clonePlaybook(texasTechPlayers) },
      { id: "texas-tech-trips-left", name: "Trips Left", personnel: "10 Personnel", players: clonePlaybook(tripsLeftPlayers) },
    ],
    concepts: [],
    plays: texasTechPlays,
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

  const embeddedEvidence = assignmentData.evidence ?? {};

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
      ...embeddedEvidence,
      method: embeddedEvidence.method ?? (evidence ? "labels-and-geometry" : playData.sourcePage ? "diagram-geometry" : "existing-diagram"),
      geometryBasis: embeddedEvidence.geometryBasis ?? (evidence ? "source-explicit" : playData.sourcePage ? "diagram-traced" : "existing-diagram"),
      confidence: embeddedEvidence.confidence ?? (evidence ? "medium-high" : "medium"),
      sourceLabel: embeddedEvidence.sourceLabel ?? playData.sourceLabel ?? null,
      sourcePage: embeddedEvidence.sourcePage ?? playData.sourcePage ?? null,
      sourcePositionLabel: embeddedEvidence.sourcePositionLabel ?? null,
      note: evidence?.note ?? embeddedEvidence.note ?? "",
      coachEdited: false,
    },
  };
}

export function normalizePlay(playData) {
  const migrated = isLegacyPlay(playData) ? migrateLegacyPlay(playData) : playData;
  const players = clonePlaybook(migrated.players?.length ? migrated.players : basePlayers);
  const defenders = clonePlaybook(Array.isArray(migrated.defenders) ? migrated.defenders : baseDefenders);
  const playerIds = new Set([...players, ...defenders].map((player) => player.id));

  return {
    ...migrated,
    folder: migrated.folder ?? (migrated.sourcePage ? "Source Plays" : "Offense"),
    protection: migrated.protection ?? "",
    blockingScheme: migrated.blockingScheme ?? "",
    conceptName: migrated.conceptName ?? migrated.name,
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
    personnel: formation.personnel ?? "10 Personnel",
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

/**
 * Cross-play identity for players. Player ids are unique per play, so anything
 * that matches players across plays -- the formation morph, the thumbnail diff
 * -- matches by unit, label, and occurrence index instead: "the second
 * defensive T" maps to the second defensive T of the other play. The
 * occurrence index exists because duplicate labels are legal on both units.
 */
export function morphKeys(roster, unit) {
  const seen = new Map();
  const keys = new Map();
  for (const player of roster) {
    const occurrence = seen.get(player.label) ?? 0;
    seen.set(player.label, occurrence + 1);
    keys.set(player.id, `${unit}|${player.label}|${occurrence}`);
  }
  return keys;
}

/**
 * Which of a play's assignments differ from the family's base play -- the thing
 * a browser thumbnail should emphasise, since variants of one family usually
 * share everything but a route or two. An assignment counts as changed when the
 * base has no counterpart for that player and phase, or the counterpart has a
 * different type or shape, or its path moved by more than two yards anywhere.
 * The tolerance is deliberately coarse: in real families the shared routes
 * drift by a yard or so of re-spacing (measured 1.3-1.5 yd across the seeds)
 * while the route a variant is actually about goes somewhere else entirely
 * (10+ yd). A tight tolerance flagged everything and emphasised nothing.
 */
export function changedAssignmentIds(play, basePlay) {
  if (!basePlay || basePlay.id === play.id) return new Set();
  const keyFor = (target) => {
    const offense = morphKeys(target.players ?? [], "offense");
    const defense = morphKeys(target.defenders ?? [], "defense");
    return (item) => {
      const player = offense.get(item.playerId) ?? defense.get(item.playerId);
      return player ? `${player}|${item.phase}` : null;
    };
  };
  const baseKey = keyFor(basePlay);
  const counterparts = new Map();
  for (const item of basePlay.assignments ?? []) {
    const key = baseKey(item);
    if (key) counterparts.set(key, item);
  }
  const samePath = (a, b) => a.length === b.length
    && a.every(([x, y], index) => Math.abs(x - b[index][0]) <= 2 && Math.abs(y - b[index][1]) <= 2);

  const playKey = keyFor(play);
  const changed = new Set();
  for (const item of play.assignments ?? []) {
    const key = playKey(item);
    const other = key ? counterparts.get(key) : null;
    if (!other || other.type !== item.type || !samePath(item.points, other.points)) changed.add(item.id);
  }
  return changed;
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
