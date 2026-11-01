// SVG rendering of a scout-card diagram (illustrative, not to scale).
import { h } from './dom.js';

let uid = 0;

const KIND_TEXT = { route: 'route', run: 'run path', block: 'block', motion: 'motion' };

// opts: { size: 'thumb'|'full'|'print', selected: ref|null, interactive: bool }
export function renderDiagram(card, opts = {}) {
  const d = card.diagram;
  const id = `dg${++uid}`;
  const size = opts.size || 'full';
  const summary = `Diagram for ${card.lookLabel || card.title}: ${d.tokens.length} players, ${d.arrows.length} arrows. Illustrative, not to scale. Reference / fictional.`;
  const sel = opts.selected || null;
  const isSel = (ref) => sel && sel.id === ref.id && sel.kind === ref.kind && (ref.kind !== 'arrow-end' || sel.end === ref.end);

  const defs = h('defs', null,
    h('marker', { id: `${id}-head`, viewBox: '0 0 10 10', refX: '8', refY: '5', markerWidth: '5', markerHeight: '5', orient: 'auto-start-reverse' },
      h('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'dg-head' })),
    h('marker', { id: `${id}-bar`, viewBox: '0 0 10 10', refX: '5', refY: '5', markerWidth: '5', markerHeight: '5', orient: 'auto' },
      h('path', { d: 'M 5 0 L 5 10', class: 'dg-bar' })));

  const arrows = d.arrows.map((a) => {
    const marker = a.kind === 'block' ? `url(#${id}-bar)` : `url(#${id}-head)`;
    const g = h('g', { class: `dg-arrow dg-${a.kind}${sel && sel.id === a.id ? ' is-selected' : ''}`, 'data-arrow': a.id },
      h('line', { x1: a.from.x, y1: a.from.y, x2: a.to.x, y2: a.to.y, 'marker-end': marker }),
      a.label ? h('text', { x: (a.from.x + a.to.x) / 2 + 1.2, y: (a.from.y + a.to.y) / 2, class: 'dg-arrow-label' }, a.label) : null);
    if (opts.interactive) {
      for (const end of ['from', 'to']) {
        const ref = { kind: 'arrow-end', id: a.id, end };
        g.appendChild(h('circle', { cx: a[end].x, cy: a[end].y, r: 1.6, class: `dg-handle${isSel(ref) ? ' is-selected' : ''}`, 'data-ref': JSON.stringify(ref) }));
      }
    }
    return g;
  });

  const tokens = d.tokens.map((t) => {
    const ref = { kind: 'token', id: t.id };
    const shape = t.side === 'D'
      ? h('path', { d: `M ${t.x - 2.6} ${t.y - 2.2} L ${t.x + 2.6} ${t.y - 2.2} L ${t.x} ${t.y + 2.4} z`, class: 'dg-token-shape' })
      : h('circle', { cx: t.x, cy: t.y, r: 2.6, class: 'dg-token-shape' });
    return h('g', { class: `dg-token dg-side-${t.side}${isSel(ref) ? ' is-selected' : ''}`, 'data-ref': opts.interactive ? JSON.stringify(ref) : null, 'data-token': t.id },
      shape,
      h('text', { x: t.x, y: t.y + 0.75, class: 'dg-token-label', 'text-anchor': 'middle', style: { fontSize: `${t.label.length <= 2 ? 2.1 : t.label.length === 3 ? 1.6 : 1.25}px` } }, t.label));
  });

  return h('svg', { viewBox: `0 0 ${d.width} ${d.height}`, class: `diagram diagram-${size}`, role: 'img', 'aria-label': summary, preserveAspectRatio: 'xMidYMid meet' },
    h('title', null, summary),
    defs,
    h('rect', { x: 0, y: 0, width: d.width, height: d.height, class: 'dg-field' }),
    h('line', { x1: 0, y1: d.los, x2: d.width, y2: d.los, class: 'dg-los' }),
    size !== 'thumb' ? h('text', { x: 1.5, y: d.los - 1.2, class: 'dg-los-label' }, 'LOS') : null,
    h('g', { class: 'dg-arrows' }, arrows),
    h('g', { class: 'dg-tokens' }, tokens));
}

export const arrowKindText = (k) => KIND_TEXT[k] || k;
