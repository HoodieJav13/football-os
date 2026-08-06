import {
  MAIN_PLAYBOOK_ID,
  assignmentDefinitionToPoints,
  assignmentPhaseForType,
  findPlayer,
  isLineLabel,
  manCoveragePoints,
  normalizePlay,
  playerLabel,
  sanitizeBlockDefinition,
  sanitizeDefensiveDefinition,
  sanitizeMotionDefinition,
  sanitizeRouteDefinition,
} from "./playData";
import {
  LEGACY_WORKSPACE_KEYS,
  WORKSPACE_KEY,
  createDefaultWorkspace,
  normalizeWorkspace,
  validPlays,
} from "./workspaceData";
import { ArrowClockwise, ArrowsOut, CursorClick, DotsThree, ShareNetwork, ShieldCheck } from "@phosphor-icons/react";

/**
 * Helpers shared across the app shell: workspace/game-day persistence keys and
 * readers, assignment lookup, and the small pure utilities several panels need.
 * Extracted from App.jsx unchanged -- this file is a move, not a rewrite.
 */
export const LEGACY_LIBRARY_KEY = "football-os.library.v4";
export const GAME_DAY_KEY = "football-os.game-day.v6";
export const LEGACY_GAME_DAY_KEYS = ["football-os.game-day.v5", "football-os.game-day.v4"];

export const compactViewport = () => typeof window !== "undefined" && window.matchMedia("(max-width: 700px)").matches;

export const toolItems = [
  ["Select", CursorClick],
  ["Route", ShareNetwork],
  ["Block", ArrowClockwise],
  ["Motion", ArrowsOut],
  ["Defense", ShieldCheck],
  ["More", DotsThree],
];

export function readWorkspace() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(WORKSPACE_KEY))
      ?? LEGACY_WORKSPACE_KEYS
        .map((key) => JSON.parse(window.localStorage.getItem(key)))
        .find(Boolean);
    const normalized = normalizeWorkspace(saved);
    if (normalized) return normalized;

    const legacy = JSON.parse(window.localStorage.getItem(LEGACY_LIBRARY_KEY));
    return createDefaultWorkspace(validPlays(legacy) ? legacy : undefined);
  } catch {
    return createDefaultWorkspace();
  }
}

export function readGameDay() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(GAME_DAY_KEY))
      ?? LEGACY_GAME_DAY_KEYS
        .map((key) => JSON.parse(window.localStorage.getItem(key)))
        .find(Boolean);
    return saved?.playId && saved?.snapshot
      ? { ...saved, playbookId: saved.playbookId ?? MAIN_PLAYBOOK_ID, snapshot: normalizePlay(saved.snapshot) }
      : null;
  } catch {
    return null;
  }
}

/** The flanker is the most useful default selection; fall back to any assignment. */

export function defaultAssignmentId(play) {
  const flanker = play.players.find((player) => player.label === "Z");
  const flankerAssignment = flanker
    ? play.assignments.find((item) => item.unit === "offense" && item.playerId === flanker.id)
    : null;
  return flankerAssignment?.id
    ?? play.assignments.find((item) => item.unit === "offense")?.id
    ?? play.assignments[0]?.id
    ?? null;
}

export function assignmentFor(play, unit, playerId, phase) {
  return play.assignments.find((item) => (
    item.unit === unit && item.playerId === playerId && (!phase || item.phase === phase)
  )) ?? null;
}

/** A player's post-snap assignment is the one a coach means by default. */

export function preferredAssignment(play, unit, playerId) {
  return assignmentFor(play, unit, playerId, "post") ?? assignmentFor(play, unit, playerId, "pre");
}

export function playerExists(play, unit, playerId) {
  return Boolean(findPlayer(play, unit, playerId));
}

export function isLinePlayer(play, unit, playerId) {
  return unit === "offense" && isLineLabel(playerLabel(play, unit, playerId));
}

export const titleCase = (value) => value ? `${value[0].toUpperCase()}${value.slice(1)}` : "";

export function createAssignment({ play, playerId, start, type, unit }) {
  const towardField = start[0] < 0 ? "right" : "left";
  let definition;
  if (type === "Route") {
    definition = sanitizeRouteDefinition({ release: "none", stemYards: 10, breaks: [], condition: "" });
  } else if (type === "Block") {
    definition = sanitizeBlockDefinition({ technique: "drive", direction: towardField, target: "", climb: false });
  } else if (type === "Motion") {
    definition = sanitizeMotionDefinition({ motionType: "jet", direction: towardField, distanceYards: 18 });
  } else if (type === "Man") {
    // Default to covering the nearest uncovered receiver rather than nothing.
    const covered = new Set(play.assignments
      .filter((item) => item.type === "Man")
      .map((item) => item.definition?.targetId));
    const candidates = play.players
      .filter((player) => !isLineLabel(player.label) && player.label !== "Q" && !covered.has(player.id))
      .sort((a, b) => Math.abs(a.x - start[0]) - Math.abs(b.x - start[0]));
    definition = sanitizeDefensiveDefinition(type, { targetId: candidates[0]?.id ?? "", leverage: "inside" });
  } else {
    definition = sanitizeDefensiveDefinition(type, {});
  }

  const points = type === "Man"
    ? manCoveragePoints(play, start, definition)
    : assignmentDefinitionToPoints(start, type, definition);

  return {
    id: `${play.id}-${unit}-${playerId.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${assignmentPhaseForType(type)}-${Date.now()}`,
    playerId,
    unit,
    type,
    preset: type === "Route"
      ? "Structured"
      : titleCase(definition.technique ?? definition.motionType ?? definition.area ?? definition.responsibility ?? type),
    pace: 1,
    delay: type === "Motion" ? -1.5 : 0,
    phase: assignmentPhaseForType(type),
    points,
    definition,
    ...(type === "Route" ? {
      geometryMode: "structured",
      evidence: {
        method: "coach-authored",
        confidence: "high",
        sourceLabel: null,
        sourcePage: null,
        note: "",
        coachEdited: true,
      },
    } : {}),
  };
}

export function uniqueName(library, baseName) {
  const names = new Set(library.map((play) => play.name));
  if (!names.has(baseName)) return baseName;
  let index = 2;
  while (names.has(`${baseName} ${index}`)) index += 1;
  return `${baseName} ${index}`;
}
