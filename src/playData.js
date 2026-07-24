export const MAIN_PLAYBOOK_ID = "personal-active";

export const basePlayers = [
  ["X", 14, 73], ["Y", 29, 78], ["F", 67, 78], ["LT", 40, 73],
  ["LG", 45, 73], ["C", 50, 73], ["RG", 55, 73], ["RT", 60, 73],
  ["Q", 50, 80], ["H", 50, 89], ["Z", 82, 73],
];

const texasTechPlayers = [
  ["X", 10, 73], ["S", 27, 73], ["LT", 40, 73], ["LG", 45, 73],
  ["C", 50, 73], ["RG", 55, 73], ["RT", 60, 73], ["Y", 73, 73],
  ["Z", 90, 73], ["Q", 50, 81], ["T", 50, 90],
];

const lsuPlayers = [
  ["X", 12, 73], ["Y", 30, 73], ["LT", 40, 73], ["LG", 45, 73],
  ["C", 50, 73], ["RG", 55, 73], ["RT", 60, 73], ["F", 70, 73],
  ["Z", 88, 73], ["Q", 50, 82], ["H", 50, 90],
];

export const baseDefenders = [
  { id: "CB-L", label: "C", x: 15, y: 32 },
  { id: "W", label: "W", x: 35, y: 48 },
  { id: "M", label: "M", x: 50, y: 48 },
  { id: "S", label: "S", x: 67, y: 48 },
  { id: "CB-R", label: "C", x: 88, y: 32 },
  { id: "E-L", label: "E", x: 35, y: 61 },
  { id: "T-L", label: "T", x: 43, y: 61 },
  { id: "N", label: "N", x: 50, y: 61 },
  { id: "T-R", label: "T", x: 57, y: 61 },
  { id: "E-R", label: "E", x: 65, y: 61 },
  { id: "FS", label: "FS", x: 50, y: 18 },
];

const route = (id, player, preset, points, pace = 1, metadata = {}) => ({
  id,
  player,
  unit: "offense",
  type: "Route",
  preset,
  pace,
  delay: 0,
  phase: "post",
  points,
  ...metadata,
});

const assignment = (id, unit, player, type, preset, points, metadata = {}) => ({
  id,
  unit,
  player,
  type,
  preset,
  pace: 1,
  delay: type === "Motion" ? -1.5 : 0,
  phase: type === "Motion" ? "pre" : "post",
  points,
  ...metadata,
});

const play = (id, name, routes, options = {}) => ({
  id,
  name,
  family: options.family ?? "Mesh",
  personnel: options.personnel ?? "11 Personnel",
  formation: options.formation ?? "Trips Right Open",
  folder: options.folder ?? "Offense",
  protection: options.protection ?? "",
  blockingScheme: options.blockingScheme ?? "",
  variantOf: null,
  players: clonePlaybook(options.players ?? basePlayers),
  defenders: clonePlaybook(options.defenders ?? baseDefenders),
  routes,
  sourcePage: options.sourcePage ?? null,
  sourceLabel: options.sourceLabel ?? null,
});

export const plays = [
  play("mesh", "Mesh", [
    route("mesh-x", "X", "Go", [[14, 73], [14, 45]]),
    route("mesh-y", "Y", "Out", [[29, 78], [29, 53], [34, 53]], 0.95),
    route("mesh-f", "F", "Post", [[67, 78], [69, 67], [74, 59]], 1.05),
    route("mesh-z", "Z", "Go", [[82, 73], [82, 40]], 1.1),
    assignment("mesh-lt-block", "offense", "LT", "Block", "Pass Set", [[40, 73], [36, 80]], {
      definition: { technique: "pass-set", direction: "left", target: "E", climb: false },
    }),
    assignment("mesh-h-motion", "offense", "H", "Motion", "Jet", [[50, 89], [25, 91]], {
      definition: { motionType: "jet", direction: "left", distanceYards: 14 },
    }),
    assignment("mesh-defense-m-fit", "defense", "M", "Fit", "B Fit", [[50, 48], [55, 71]], {
      definition: { responsibility: "B", technique: "spill" },
    }),
    assignment("mesh-defense-el-rush", "defense", "E-L", "Rush", "Contain", [[35, 61], [29, 70], [31, 82]], {
      definition: { technique: "contain", gap: "C", direction: "left" },
    }),
    assignment("mesh-defense-cbl-zone", "defense", "CB-L", "Zone", "Flat", [[15, 32], [12, 50]], {
      definition: { area: "flat", landmark: "Outside leverage on X" },
    }),
  ]),
  play("mesh-stick", "Mesh Stick", [
    route("mesh-stick-x", "X", "Go", [[14, 73], [14, 47]]),
    route("mesh-stick-y", "Y", "Out", [[29, 78], [29, 52], [36, 52]], 0.95),
    route("mesh-stick-f", "F", "Out", [[67, 78], [72, 72], [78, 72]], 1.05),
    route("mesh-stick-z", "Z", "Post", [[82, 73], [82, 47], [77, 40]], 1.1),
  ]),
  play("mesh-sit", "Mesh Sit", [
    route("mesh-sit-x", "X", "Post", [[14, 73], [14, 48], [22, 54]]),
    route("mesh-sit-y", "Y", "Out", [[29, 78], [29, 54], [35, 54]], 0.95),
    route("mesh-sit-f", "F", "Dig", [[67, 78], [61, 71], [56, 66]], 1.05),
    route("mesh-sit-z", "Z", "Dig", [[82, 73], [82, 56], [75, 56]], 1.1),
  ]),
  play("mesh-choice", "Mesh Choice", [
    route("mesh-choice-x", "X", "Go", [[14, 73], [14, 44]]),
    route("mesh-choice-y", "Y", "Post", [[29, 78], [29, 55], [37, 48]], 0.95),
    route("mesh-choice-f", "F", "Dig", [[67, 78], [62, 68], [56, 59]], 1.05),
    route("mesh-choice-z", "Z", "Post", [[82, 73], [82, 45], [77, 37]], 1.1),
  ]),
  play("mesh-corner", "Mesh Corner", [
    route("mesh-corner-x", "X", "Post", [[14, 73], [14, 49], [23, 39]]),
    route("mesh-corner-y", "Y", "Out", [[29, 78], [29, 54], [36, 54]], 0.95),
    route("mesh-corner-f", "F", "Dig", [[67, 78], [61, 70], [53, 70]], 1.05),
    route("mesh-corner-z", "Z", "Corner", [[82, 73], [82, 53], [75, 38]], 1.1),
  ]),
  play("mesh-wheel", "Mesh Wheel", [
    route("mesh-wheel-x", "X", "Go", [[14, 73], [14, 46]]),
    route("mesh-wheel-y", "Y", "Out", [[29, 78], [29, 54], [36, 54]], 0.95),
    route("mesh-wheel-f", "F", "Post", [[67, 78], [70, 67], [76, 58]], 1.05),
    route("mesh-wheel-z", "Z", "Corner", [[82, 73], [82, 39], [76, 30]], 1.1),
    route("mesh-wheel-h", "H", "Custom", [[50, 89], [55, 86], [61, 81]], 0.85),
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
    route("tt-600-x", "X", "Go", [[10, 73], [10, 25]], 1.08),
    route("tt-600-s", "S", "Post", [[27, 73], [27, 52], [43, 28]], 1.02),
    route("tt-600-t", "T", "Texas", [[50, 90], [64, 76], [64, 60], [54, 55]], 0.9),
    route("tt-600-y", "Y", "Option", [[73, 73], [63, 56], [72, 53]], 0.96),
    route("tt-600-z", "Z", "Go", [[90, 73], [90, 25]], 1.08),
  ], texasTechOptions("Texas", 114)),
  play("tt-700-texas", "700 TEXAS", [
    route("tt-700-x", "X", "Go", [[10, 73], [10, 25]], 1.08),
    route("tt-700-s", "S", "Option", [[27, 73], [37, 56], [28, 53]], 0.96),
    route("tt-700-t", "T", "Texas", [[50, 90], [36, 76], [36, 60], [46, 55]], 0.9),
    route("tt-700-y", "Y", "Post", [[73, 73], [73, 52], [57, 28]], 1.02),
    route("tt-700-z", "Z", "Go", [[90, 73], [90, 25]], 1.08),
  ], texasTechOptions("Texas", 115)),
  play("tt-700-z-mesh", "700 Z MESH", [
    route("tt-zmesh-x", "X", "Shallow", [[10, 73], [16, 62], [40, 55], [69, 54]], 0.92),
    route("tt-zmesh-s", "S", "Out", [[27, 73], [27, 48], [18, 48]], 1),
    route("tt-zmesh-t", "T", "Swing", [[50, 90], [42, 79], [28, 67], [8, 62]], 0.86),
    route("tt-zmesh-y", "Y", "Post", [[73, 73], [73, 50], [60, 24]], 1.04),
    route("tt-zmesh-z", "Z", "Mesh", [[90, 73], [82, 62], [60, 56], [35, 54], [10, 48]], 0.92),
  ], texasTechOptions("Mesh", 118)),
  play("tt-700-y-mesh", "700 Y MESH", [
    route("tt-ymesh-x", "X", "Go", [[10, 73], [10, 26]], 1.08),
    route("tt-ymesh-s", "S", "Mesh", [[27, 73], [35, 62], [56, 56], [83, 53]], 0.92),
    route("tt-ymesh-t", "T", "Swing", [[50, 90], [42, 79], [27, 67], [8, 62]], 0.86),
    route("tt-ymesh-y", "Y", "Mesh", [[73, 73], [66, 62], [47, 56], [22, 53], [8, 48]], 0.92),
    route("tt-ymesh-z", "Z", "Post", [[90, 73], [90, 51], [76, 25]], 1.04),
  ], texasTechOptions("Mesh", 120)),
  play("tt-600-s-mesh", "600 S MESH", [
    route("tt-smesh-x", "X", "Post", [[10, 73], [10, 52], [24, 26]], 1.04),
    route("tt-smesh-s", "S", "Mesh", [[27, 73], [35, 62], [56, 56], [84, 52]], 0.92),
    route("tt-smesh-t", "T", "Swing", [[50, 90], [58, 79], [74, 67], [94, 62]], 0.86),
    route("tt-smesh-y", "Y", "Mesh", [[73, 73], [66, 62], [46, 56], [20, 52]], 0.92),
    route("tt-smesh-z", "Z", "Go", [[90, 73], [90, 25]], 1.08),
  ], texasTechOptions("Mesh", 128)),
  play("tt-500-smash", "500 SMASH", [
    route("tt-smash-x", "X", "Hitch", [[10, 73], [10, 56], [7, 52], [11, 49]], 0.94),
    route("tt-smash-s", "S", "Corner", [[27, 73], [27, 52], [14, 28]], 1.02),
    route("tt-smash-y", "Y", "Hitch", [[73, 73], [73, 59], [80, 57]], 0.94),
    route("tt-smash-z", "Z", "Corner", [[90, 73], [84, 58], [91, 47], [96, 25]], 1.02),
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
    route("lsu-sticky-x", "X", "Out", [[12, 73], [12, 58], [5, 58]], 0.96),
    route("lsu-sticky-y", "Y", "Stick", [[30, 73], [30, 57], [37, 53]], 0.94),
    route("lsu-sticky-f", "F", "Arrow", [[70, 73], [77, 67], [88, 67]], 1),
    route("lsu-sticky-z", "Z", "Out", [[88, 73], [88, 58], [96, 58]], 0.96),
    route("lsu-sticky-h", "H", "Check", [[50, 90], [50, 79]], 0.8),
  ], lsuOptions("Sticky", 37)),
  play("lsu-troop-shock-choice", "R TROOP PACER SHOCK CHOICE", [
    route("lsu-shock-x", "X", "Corner", [[12, 73], [12, 47], [5, 28]], 1.03),
    route("lsu-shock-h", "H", "Choice", [[50, 90], [34, 78], [24, 61]], 0.9),
    route("lsu-shock-f", "F", "Stick", [[70, 73], [70, 56], [77, 53]], 0.95),
    route("lsu-shock-z", "Z", "Fade", [[88, 73], [88, 55], [96, 28]], 1.06),
    route("lsu-shock-y", "Y", "Hitch", [[30, 73], [30, 56]], 0.96),
  ], lsuOptions("Shock Choice", 39, "Troop")),
  play("lsu-dome-jordan-cat", "L DOME JORDAN CAT", [
    route("lsu-cat-x", "X", "Go", [[12, 73], [12, 27]], 1.06),
    route("lsu-cat-y", "Y", "Bender", [[30, 73], [30, 46], [40, 26]], 1.01),
    route("lsu-cat-f", "F", "Bender", [[70, 73], [70, 46], [60, 26]], 1.01),
    route("lsu-cat-z", "Z", "Go", [[88, 73], [88, 27]], 1.06),
    route("lsu-cat-h", "H", "Check", [[50, 90], [50, 80]], 0.8),
  ], lsuOptions("Cat", 41, "Dome")),
  play("lsu-tiger-panther-h", "R TIGER PACER PANTHER H", [
    route("lsu-panther-x", "X", "Go", [[12, 73], [12, 27]], 1.06),
    route("lsu-panther-h", "H", "Shallow", [[50, 90], [42, 78], [26, 59], [78, 58]], 0.9),
    route("lsu-panther-y", "Y", "Deep Over", [[30, 73], [34, 50], [58, 28]], 1.02),
    route("lsu-panther-f", "F", "Bender", [[70, 73], [70, 48], [79, 28]], 1),
    route("lsu-panther-z", "Z", "Go", [[88, 73], [88, 27]], 1.06),
  ], lsuOptions("Panther", 49, "Tiger")),
  play("lsu-token-music-fitch", "R TOKEN PACER MUSIC FITCH", [
    route("lsu-music-x", "X", "Fade", [[12, 73], [12, 54], [5, 30]], 1.05),
    route("lsu-music-y", "Y", "Clear", [[30, 73], [30, 26]], 1.08),
    route("lsu-music-f", "F", "Slide", [[70, 73], [70, 58], [80, 58]], 0.94),
    route("lsu-music-z", "Z", "Basic", [[88, 73], [88, 42], [78, 38]], 1),
    route("lsu-music-h", "H", "Hitch", [[50, 90], [36, 72], [34, 59]], 0.9),
  ], lsuOptions("Music Fitch", 50, "Token")),
  play("lsu-triple-jordan-spark", "R TRIPLE JORDAN SPARK", [
    route("lsu-spark-x", "X", "Harvey", [[12, 73], [12, 43], [17, 37]], 0.98),
    route("lsu-spark-y", "Y", "Seam Read", [[30, 73], [30, 43], [22, 25]], 1.02),
    route("lsu-spark-f", "F", "Spot", [[70, 73], [61, 59], [55, 55]], 0.93),
    route("lsu-spark-z", "Z", "Spot", [[88, 73], [79, 59], [73, 55]], 0.93),
    route("lsu-spark-h", "H", "Check", [[50, 90], [42, 85], [42, 78]], 0.8),
  ], lsuOptions("Spark", 55, "Triple")),
];

export const defaultFormations = [
  {
    id: "trips-right-open",
    name: "Trips Right Open",
    personnel: "11 Personnel",
    players: clonePlaybook(basePlayers),
  },
  {
    id: "doubles",
    name: "Doubles",
    personnel: "10 Personnel",
    players: [
      ["X", 12, 73], ["Y", 30, 73], ["LT", 40, 73], ["LG", 45, 73],
      ["C", 50, 73], ["RG", 55, 73], ["RT", 60, 73], ["F", 70, 73],
      ["Z", 88, 73], ["Q", 50, 81], ["H", 50, 90],
    ],
  },
  {
    id: "empty",
    name: "Empty",
    personnel: "Empty",
    players: [
      ["X", 8, 73], ["Y", 25, 73], ["LT", 40, 73], ["LG", 45, 73],
      ["C", 50, 73], ["RG", 55, 73], ["RT", 60, 73], ["F", 75, 73],
      ["Z", 92, 73], ["Q", 50, 81], ["H", 64, 73],
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
    plays,
  },
  {
    id: "texas-tech-sample",
    name: "Texas Tech Sample",
    description: "6 traced reference plays",
    isMain: false,
    source: "Texas Tech Style Offensive Attack",
    formations: [{
      id: "texas-tech-doubles",
      name: "Texas Tech Doubles",
      personnel: "X · S · T · Y · Z",
      players: texasTechPlayers,
    }],
    plays: texasTechPlays,
  },
  {
    id: "lsu-2019-sample",
    name: "LSU 2019 Sample",
    description: "6 traced reference plays",
    isMain: false,
    source: "2019 LSU Offense Playbook",
    formations: [{
      id: "lsu-doubles",
      name: "LSU Doubles",
      personnel: "X · Y · F · H · Z",
      players: lsuPlayers,
    }],
    plays: lsuPlays,
  },
];

export const releaseOptions = ["none", "inside", "outside", "best"];
export const breakDirections = ["inside", "outside", "vertical"];
export const blockTechniques = ["drive", "reach", "down", "double", "pull", "wrap", "kick-out", "pass-set", "combo"];
export const motionTypes = ["jet", "orbit", "return", "shift", "trade"];
export const defensiveAssignmentTypes = ["Rush", "Man", "Zone", "Fit"];
export const defensiveTechniques = ["rush", "contain", "blitz", "stunt"];
export const zoneAreas = ["flat", "hook", "curl", "deep-third", "deep-half", "quarter"];
export const fitResponsibilities = ["A", "B", "C", "D", "force", "cutback"];
export const assignmentPhases = ["pre", "post"];

const YARDS_PER_X_UNIT = 53.3 / 100;
const YARDS_PER_Y_UNIT = 10 / 13;

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const roundTo = (value, increment = 1) => Math.round(value / increment) * increment;

const horizontalDirection = (direction) => direction === "left" ? -1 : 1;

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
      target: typeof definition.target === "string" ? definition.target : "X",
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

export function assignmentDefinitionToPoints(start, type, definition = {}) {
  const [startX, startY] = start;

  if (type === "Block") {
    const normalized = sanitizeBlockDefinition(definition);
    const direction = horizontalDirection(normalized.direction);
    const finish = {
      drive: [startX, startY - 9],
      reach: [startX + direction * 6, startY - 7],
      down: [startX + direction * 9, startY - 4],
      double: [startX + direction * 4, startY - 7],
      "kick-out": [startX + direction * 12, startY - 4],
      "pass-set": [startX + direction * 4, startY + 7],
    }[normalized.technique];
    if (finish) return [[startX, startY], [clamp(finish[0], 2, 98), clamp(finish[1], 4, 96)]];
    if (normalized.technique === "pull") {
      return [[startX, startY], [startX, clamp(startY + 4, 4, 96)], [clamp(startX + direction * 14, 2, 98), clamp(startY + 4, 4, 96)], [clamp(startX + direction * 18, 2, 98), clamp(startY - 7, 4, 96)]];
    }
    if (normalized.technique === "wrap") {
      return [[startX, startY], [startX, clamp(startY + 4, 4, 96)], [clamp(startX + direction * 11, 2, 98), clamp(startY + 2, 4, 96)], [clamp(startX + direction * 8, 2, 98), clamp(startY - 12, 4, 96)]];
    }
    return [[startX, startY], [clamp(startX + direction * 4, 2, 98), clamp(startY - 6, 4, 96)], [clamp(startX + direction * 7, 2, 98), clamp(startY - 16, 4, 96)]];
  }

  if (type === "Motion") {
    const normalized = sanitizeMotionDefinition(definition);
    const direction = horizontalDirection(normalized.direction);
    const distanceUnits = normalized.distanceYards / YARDS_PER_X_UNIT;
    const finishX = clamp(startX + direction * distanceUnits, 3, 97);
    if (normalized.motionType === "orbit") {
      return [[startX, startY], [clamp(startX - direction * 4, 3, 97), clamp(startY + 7, 4, 96)], [finishX, clamp(startY + 9, 4, 96)]];
    }
    if (normalized.motionType === "return") {
      const turnX = clamp(startX + direction * distanceUnits * 0.72, 3, 97);
      return [[startX, startY], [turnX, startY], [clamp(startX + direction * 3, 3, 97), clamp(startY + 2, 4, 96)]];
    }
    if (normalized.motionType === "trade") {
      return [[startX, startY], [finishX, clamp(startY - 2, 4, 96)]];
    }
    if (normalized.motionType === "shift") {
      return [[startX, startY], [finishX, startY]];
    }
    return [[startX, startY], [finishX, clamp(startY + 2, 4, 96)]];
  }

  if (type === "Rush") {
    const normalized = sanitizeDefensiveDefinition(type, definition);
    const direction = horizontalDirection(normalized.direction);
    const lateral = normalized.technique === "stunt" ? 10 : normalized.technique === "contain" ? 7 : 3;
    return [[startX, startY], [clamp(startX + direction * lateral, 2, 98), clamp(startY + 10, 4, 96)], [clamp(startX + direction * (lateral - 2), 2, 98), clamp(startY + 21, 4, 96)]];
  }

  if (type === "Zone") {
    const normalized = sanitizeDefensiveDefinition(type, definition);
    const landmarks = {
      flat: [startX < 50 ? 12 : 88, 50],
      hook: [clamp(startX, 30, 70), 45],
      curl: [startX < 50 ? 28 : 72, 42],
      "deep-third": [startX < 34 ? 18 : startX > 66 ? 82 : 50, 25],
      "deep-half": [startX < 50 ? 28 : 72, 22],
      quarter: [clamp(startX, 12, 88), 24],
    };
    return [[startX, startY], landmarks[normalized.area]];
  }

  if (type === "Fit") {
    const normalized = sanitizeDefensiveDefinition(type, definition);
    const offsets = { A: 2, B: 5, C: 9, D: 13, force: 17, cutback: -8 };
    const side = startX < 50 ? -1 : 1;
    return [[startX, startY], [clamp(50 + side * offsets[normalized.responsibility], 3, 97), 71]];
  }

  return [[startX, startY], [startX, clamp(startY + 18, 4, 96)]];
}

export function assignmentStartSeconds(assignment, snapSeconds = 2) {
  const delay = Number.isFinite(assignment.delay) ? assignment.delay : assignment.type === "Motion" ? -1.5 : 0;
  return Math.max(0, snapSeconds + delay);
}

function lateralDirection(startX, direction) {
  if (direction === "vertical") return 0;
  const towardMiddle = startX < 50 ? 1 : startX > 50 ? -1 : 1;
  return direction === "inside" ? towardMiddle : -towardMiddle;
}

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
    const releaseDirection = lateralDirection(startX, normalized.release);
    x = clamp(x + (releaseDirection * 1.5) / YARDS_PER_X_UNIT, 2, 98);
    y = clamp(y - 1.5 / YARDS_PER_Y_UNIT, 4, 96);
    points.push([roundTo(x, 0.1), roundTo(y, 0.1)]);
  }

  if (normalized.stemYards > 0) {
    y = clamp(startY - normalized.stemYards / YARDS_PER_Y_UNIT, 4, 96);
    points.push([roundTo(x, 0.1), roundTo(y, 0.1)]);
  }

  normalized.breaks.forEach((segment) => {
    const angleRadians = (segment.angle * Math.PI) / 180;
    const verticalYards = Math.cos(angleRadians) * segment.distanceYards;
    const lateralYards = Math.sin(angleRadians) * segment.distanceYards;
    const direction = lateralDirection(x, segment.direction);
    x = clamp(x + (direction * lateralYards) / YARDS_PER_X_UNIT, 2, 98);
    y = clamp(y - verticalYards / YARDS_PER_Y_UNIT, 4, 96);
    points.push([roundTo(x, 0.1), roundTo(y, 0.1)]);
  });

  if (points.length === 1) {
    points.push([startX, roundTo(clamp(startY - 10 / YARDS_PER_Y_UNIT, 4, 96), 0.1)]);
  }

  return points.filter((point, index) => index === 0 || point[0] !== points[index - 1][0] || point[1] !== points[index - 1][1]);
}

export function inferRouteDefinition(routeData) {
  const points = routeData.points ?? [];
  if (points.length < 2) {
    return sanitizeRouteDefinition({ release: "none", stemYards: 10, breaks: [] });
  }

  const [startX, startY] = points[0];
  const stemEnd = points.length > 2 ? points[1] : points.at(-1);
  const stemYards = roundTo(Math.max(0, startY - stemEnd[1]) * YARDS_PER_Y_UNIT, 1);
  const breaks = [];

  if (points.length > 2) {
    const finalPoint = points.at(-1);
    const dxYards = (finalPoint[0] - stemEnd[0]) * YARDS_PER_X_UNIT;
    const dyYards = (stemEnd[1] - finalPoint[1]) * YARDS_PER_Y_UNIT;
    const distanceYards = roundTo(Math.hypot(dxYards, dyYards), 1);
    const angle = roundTo((Math.atan2(Math.abs(dxYards), dyYards || 0.001) * 180) / Math.PI, 5);
    const towardMiddle = stemEnd[0] < 50 ? dxYards > 0 : dxYards < 0;
    breaks.push({
      direction: Math.abs(dxYards) < 0.75 ? "vertical" : towardMiddle ? "inside" : "outside",
      angle: Math.abs(dxYards) < 0.75 ? 0 : clamp(angle, 0, 135),
      distanceYards,
    });
  }

  return sanitizeRouteDefinition({
    release: "none",
    stemYards,
    breaks,
    condition: "",
  });
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

export function formationStatus(players = basePlayers) {
  const lineOfScrimmage = 73;
  const onLine = players.filter(([, , y]) => Math.abs(y - lineOfScrimmage) <= 2).length;
  const inBackfield = players.length - onLine;
  const legal = players.length === 11 && onLine >= 7 && inBackfield <= 4;
  return { legal, onLine, inBackfield, playerCount: players.length };
}

export function routeDuration(routeData, playbackSpeed = 1) {
  const distance = routeData.points.slice(1).reduce((total, point, index) => {
    const previous = routeData.points[index];
    return total + Math.hypot(point[0] - previous[0], point[1] - previous[1]);
  }, 0);
  const pace = Number.isFinite(routeData.pace) ? routeData.pace : 1;
  return clamp(distance / 12, 1.2, 5.4) / pace / playbackSpeed;
}

export function playDuration(assignments = [], playbackSpeed = 1, snapSeconds = 2) {
  return Math.max(
    snapSeconds,
    ...assignments.map((assignment) => assignmentStartSeconds(assignment, snapSeconds) + routeDuration(assignment, playbackSpeed)),
  );
}

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

export function normalizePlay(playData) {
  return {
    ...playData,
    folder: playData.folder ?? (playData.sourcePage ? "Source Plays" : "Offense"),
    protection: playData.protection ?? "",
    blockingScheme: playData.blockingScheme ?? "",
    players: clonePlaybook(playData.players ?? basePlayers),
    defenders: clonePlaybook(playData.defenders ?? baseDefenders),
    routes: (playData.routes ?? []).map((routeData) => {
      const sourceEvidence = sourceRouteEvidence[routeData.id];
      if (routeData.type !== "Route") {
        const unit = routeData.unit === "defense" || defensiveAssignmentTypes.includes(routeData.type) ? "defense" : "offense";
        const definition = routeData.type === "Block"
          ? sanitizeBlockDefinition(routeData.definition)
          : routeData.type === "Motion"
            ? sanitizeMotionDefinition(routeData.definition)
            : sanitizeDefensiveDefinition(routeData.type, routeData.definition);
        return {
          ...routeData,
          unit,
          definition,
          pace: Number.isFinite(routeData.pace) ? routeData.pace : 1,
          delay: Number.isFinite(routeData.delay) ? routeData.delay : routeData.type === "Motion" ? -1.5 : 0,
          phase: assignmentPhases.includes(routeData.phase) ? routeData.phase : routeData.type === "Motion" ? "pre" : "post",
        };
      }
      const coachEdited = routeData.evidence?.coachEdited === true;
      const definition = sanitizeRouteDefinition(
        coachEdited
          ? routeData.definition
          : sourceEvidence?.definition ?? routeData.definition ?? inferRouteDefinition(routeData),
      );
      const points = sourceEvidence?.definition && !coachEdited
        ? routeDefinitionToPoints(routeData.points[0], definition)
        : routeData.points;
      return {
        ...routeData,
        unit: "offense",
        pace: Number.isFinite(routeData.pace) ? routeData.pace : 1,
        delay: Number.isFinite(routeData.delay) ? routeData.delay : 0,
        phase: "post",
        points,
        definition,
        geometryMode: coachEdited ? routeData.geometryMode ?? "structured" : sourceEvidence ? "detected" : routeData.geometryMode ?? (routeData.definition ? "structured" : "detected"),
        evidence: coachEdited ? routeData.evidence : {
          method: sourceEvidence ? "labels-and-geometry" : playData.sourcePage ? "diagram-geometry" : "existing-diagram",
          confidence: sourceEvidence ? "medium-high" : "medium",
          sourceLabel: playData.sourceLabel ?? null,
          sourcePage: playData.sourcePage ?? null,
          note: sourceEvidence?.note ?? routeData.evidence?.note ?? "",
          coachEdited: false,
        },
      };
    }),
  };
}

export function createSeedPlaybooks(personalPlays = plays) {
  const books = clonePlaybook(seedPlaybooks);
  books.forEach((book) => {
    book.plays = book.plays.map(normalizePlay);
  });
  books[0].plays = personalPlays.map(normalizePlay);
  return books;
}

export function createPlayFromFormation({
  formation,
  id,
  name,
}) {
  return {
    id,
    name,
    family: "Unsorted",
    personnel: formation.personnel ?? "11 Personnel",
    formation: formation.name,
    folder: "Offense",
    protection: "",
    blockingScheme: "",
    variantOf: null,
    players: clonePlaybook(formation.players),
    defenders: clonePlaybook(baseDefenders),
    routes: [],
    sourcePage: null,
    sourceLabel: null,
  };
}

export function applyFormationToPlay(playData, formation) {
  const currentPlayers = new Map((playData.players ?? []).map(([label, x, y]) => [label, [x, y]]));
  const nextPlayers = clonePlaybook(formation.players);
  const nextPlayerLabels = new Set(nextPlayers.map(([label]) => label));
  const nextAssignments = (playData.routes ?? []).flatMap((assignment) => {
    if (assignment.unit === "defense") return [clonePlaybook(assignment)];
    if (!nextPlayerLabels.has(assignment.player)) return [];
    const nextPlayer = nextPlayers.find(([label]) => label === assignment.player);
    const previous = currentPlayers.get(assignment.player);
    if (!nextPlayer || !previous) return [];
    const dx = nextPlayer[1] - previous[0];
    const dy = nextPlayer[2] - previous[1];
    return [{
      ...clonePlaybook(assignment),
      points: assignment.points.map(([x, y]) => [clamp(x + dx, 2, 98), clamp(y + dy, 4, 96)]),
    }];
  });
  return {
    ...playData,
    personnel: formation.personnel ?? playData.personnel,
    formation: formation.name,
    players: nextPlayers,
    routes: nextAssignments,
  };
}

export function clonePlaybook(value = plays) {
  return JSON.parse(JSON.stringify(value));
}
