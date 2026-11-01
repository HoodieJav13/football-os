// Field diagrams as SVG view trees. One unit is one yard on both axes; +x is right
// and +y is downfield, so screen y is flipped. Authored geometry is drawn unchanged.
import { IDENTIFY_MARKER } from './cover3.js';
import { svg } from './dom.js';

// Yard extents for every diagram. Identify cards use this frame unchanged, so the
// frame cannot reveal anything about the authored areas.
const BASE_FRAME = Object.freeze({ minX: -28.5, maxX: 28.5, minY: -9, maxY: 40 });
const SIDELINE_X = 160 / 6;
const INK = '#14181a';
const MUTED = '#6b767a';
const LINE = '#cfd8da';
const TURF = '#f5f8f6';

/** Area fills are the source palette; ink is a darker shade that reads on white. */
export const JOB_COLORS = Object.freeze({
  blue: { fill: '#7CB7FF', ink: '#1E5BA8' },
  amber: { fill: '#F1C86A', ink: '#8A5B00' },
  teal: { fill: '#67D9C0', ink: '#0E6E5E' },
  violet: { fill: '#BEA0F5', ink: '#5B3AA0' },
  rose: { fill: '#F49DAF', ink: '#A03048' },
});
// An imported area keeps its shape even if its color name is unknown here.
const UNKNOWN_COLOR = Object.freeze({ fill: '#D5DBDD', ink: '#4A5356' });

const round = (value) => Number(value.toFixed(2));

function frameFor(extents) {
  const frame = { ...BASE_FRAME };
  for (const { minX, maxX, minY, maxY } of extents) {
    frame.minX = Math.min(frame.minX, minX - 1);
    frame.maxX = Math.max(frame.maxX, maxX + 1);
    frame.minY = Math.min(frame.minY, minY - 1);
    frame.maxY = Math.max(frame.maxY, maxY + 1);
  }
  return frame;
}

function projector(frame) {
  return {
    x: (value) => round(value - frame.minX),
    y: (value) => round(frame.maxY - value),
    width: round(frame.maxX - frame.minX),
    height: round(frame.maxY - frame.minY),
  };
}

const label = (x, y, text, size, fill, weight = 700) => svg('text', {
  x, y, fill, 'font-size': size, 'font-weight': weight, 'text-anchor': 'middle', 'dominant-baseline': 'central',
}, text);

function turf(p, frame, fieldSide) {
  const lines = [];
  for (let yard = Math.ceil(frame.minY / 5) * 5; yard <= frame.maxY; yard += 5) {
    if (yard === 0) continue;
    lines.push(svg('line', { x1: p.x(-SIDELINE_X), x2: p.x(SIDELINE_X), y1: p.y(yard), y2: p.y(yard), stroke: LINE, 'stroke-width': 0.12 }));
  }
  const direction = fieldSide === 'right' ? 'FIELD →' : fieldSide === 'left' ? '← FIELD' : null;
  return [
    svg('rect', { x: 0, y: 0, width: p.width, height: p.height, fill: TURF }),
    svg('line', { x1: p.x(-SIDELINE_X), x2: p.x(-SIDELINE_X), y1: 0, y2: p.height, stroke: MUTED, 'stroke-width': 0.2 }),
    svg('line', { x1: p.x(SIDELINE_X), x2: p.x(SIDELINE_X), y1: 0, y2: p.height, stroke: MUTED, 'stroke-width': 0.2 }),
    lines,
    svg('line', { x1: p.x(-SIDELINE_X), x2: p.x(SIDELINE_X), y1: p.y(0), y2: p.y(0), stroke: MUTED, 'stroke-width': 0.2, 'stroke-dasharray': '1 0.7' }),
    direction && svg('text', { x: round(p.width - 2.2), y: 2.4, fill: INK, 'font-size': 1.6, 'font-weight': 700, 'text-anchor': 'end', 'dominant-baseline': 'central' }, direction),
  ];
}

const offenseMarkers = (p, players) => players.map((player) => [
  svg('circle', { cx: p.x(player.x), cy: p.y(player.y), r: 1.2, fill: '#ffffff', stroke: INK, 'stroke-width': 0.22 }),
  label(p.x(player.x), p.y(player.y), player.label, 1.05, INK),
]);

function dropPath(p, assignment, ink) {
  const from = assignment.points[0];
  const to = assignment.points[assignment.points.length - 1];
  const [x1, y1, x2, y2] = [p.x(from[0]), p.y(from[1]), p.x(to[0]), p.y(to[1])];
  const length = Math.hypot(x2 - x1, y2 - y1) || 1;
  const [ux, uy] = [(x2 - x1) / length, (y2 - y1) / length];
  const [bx, by] = [x2 - ux * 1.5, y2 - uy * 1.5];
  const corners = [[x2, y2], [bx - uy * 0.8, by + ux * 0.8], [bx + uy * 0.8, by - ux * 0.8]];
  return [
    svg('line', { x1, y1, x2: round(bx), y2: round(by), stroke: ink, 'stroke-width': 0.3, 'stroke-dasharray': '0.9 0.6' }),
    svg('polygon', { points: corners.map(([x, y]) => `${round(x)},${round(y)}`).join(' '), fill: ink }),
  ];
}

/** Full authored diagram with areas, drop paths and labels. Coach and assignment only. */
export function teachingField(pack) {
  const { diagram, answers } = pack;
  const frame = frameFor(answers.map((a) => ({
    minX: a.center[0] - a.radiusX, maxX: a.center[0] + a.radiusX, minY: a.center[1] - a.radiusY, maxY: a.center[1] + a.radiusY,
  })));
  const p = projector(frame);
  const answerOf = new Map(answers.map((answer) => [answer.defenderId, answer]));
  const colorsOf = (answer) => JOB_COLORS[answer.color] ?? UNKNOWN_COLOR;

  const areas = answers.map((a) => svg('ellipse', {
    cx: p.x(a.center[0]), cy: p.y(a.center[1]), rx: a.radiusX, ry: a.radiusY,
    fill: colorsOf(a).fill, 'fill-opacity': 0.35, stroke: colorsOf(a).ink, 'stroke-width': 0.2,
  }));
  const paths = diagram.assignments.flatMap((assignment) => {
    const answer = answerOf.get(assignment.playerId);
    return answer ? [dropPath(p, assignment, colorsOf(answer).ink)] : [];
  });
  const defenders = diagram.defenders.map((defender) => {
    const answer = answerOf.get(defender.id);
    const [cx, cy] = [p.x(defender.x), p.y(defender.y)];
    return [
      svg('circle', { cx, cy, r: 1.2, fill: answer ? colorsOf(answer).fill : '#e6eaeb', stroke: answer ? colorsOf(answer).ink : MUTED, 'stroke-width': 0.2 }),
      label(cx, cy, answer ? answer.tag : defender.label, 1.05, INK),
    ];
  });
  // Tags sit in the upper part of each area so they clear the defenders aligned nearby.
  const areaTags = answers.map((a) => {
    const [x, y] = [p.x(a.center[0]), p.y(a.center[1] + a.radiusY * 0.55)];
    return [
      svg('rect', { x: round(x - 2.1), y: round(y - 1.3), width: 4.2, height: 2.6, rx: 0.5, fill: '#ffffff', stroke: colorsOf(a).ink, 'stroke-width': 0.18 }),
      label(x, y, a.tag, 1.6, INK),
    ];
  });

  return svg('svg', {
    class: 'field', viewBox: `0 0 ${p.width} ${p.height}`, role: 'img',
    'aria-label': 'Field diagram of the authored responsibility areas. The legend below lists each position and area.',
  }, turf(p, frame, diagram.fieldSide), areas, paths, offenseMarkers(p, diagram.players), defenders, areaTags);
}

/** Takes only a projected diagram, which holds alignment and nothing else. */
export function identifyField(diagram, frame = BASE_FRAME) {
  const p = projector(frame);
  const defenders = diagram.defenders.map((defender) => {
    const [cx, cy] = [p.x(defender.x), p.y(defender.y)];
    if (defender.label !== IDENTIFY_MARKER) {
      return svg('circle', { cx, cy, r: 1, fill: '#ffffff', stroke: MUTED, 'stroke-width': 0.22 });
    }
    return [svg('circle', { cx, cy, r: 1.6, fill: INK }), label(cx, cy, IDENTIFY_MARKER, 2, '#ffffff')];
  });
  return svg('svg', {
    class: 'field', viewBox: `0 0 ${p.width} ${p.height}`, role: 'img',
    'aria-label': 'Field diagram showing the offense and anonymous defensive positions. One position is starred.',
  }, turf(p, frame, diagram.fieldSide), offenseMarkers(p, diagram.players), defenders);
}

/** Study sheet alignment: named positions, no areas, no paths. */
export function studyField(look, frame) {
  const p = projector(frame);
  const defenders = look.defense.map((defender) => {
    const [cx, cy] = [p.x(defender.x), p.y(defender.y)];
    return [svg('circle', { cx, cy, r: 1.2, fill: '#e6eaeb', stroke: MUTED, 'stroke-width': 0.2 }), label(cx, cy, defender.label, 1.05, INK)];
  });
  return svg('svg', {
    class: 'field', viewBox: `0 0 ${p.width} ${p.height}`, role: 'img',
    'aria-label': 'Field diagram of the alignment for this call. The table below lists each position.',
  }, turf(p, frame, look.fieldSide), offenseMarkers(p, look.offense), defenders);
}
