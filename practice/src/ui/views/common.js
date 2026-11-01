// Small shared view helpers. All text goes through h() as text nodes.
import { h } from '../dom.js';
import { formatClock12 } from '../../domain/time.js';

export const CATEGORY_LABEL = { walkthrough: 'Walkthrough', individual: 'Individual', group: 'Group', team: 'Team', break: 'Break' };
export const CATEGORY_MARK = { walkthrough: 'W', individual: 'I', group: 'G', team: 'T', break: 'B' };

export const fictionalBadge = () => h('span', { class: 'badge badge-fictional', title: 'Everything in this planner is fictional sample data.' }, 'FICTIONAL');

export function chip(text, { tone = 'neutral', symbol = null, title = null } = {}) {
  return h('span', { class: `chip chip-${tone}`, title }, symbol ? h('span', { class: 'chip-symbol', 'aria-hidden': 'true' }, symbol) : null, text);
}

export const SEVERITY = {
  error: { symbol: '✕', tone: 'error', word: 'Problem' },
  warning: { symbol: '⚠', tone: 'warn', word: 'Warning' },
  info: { symbol: 'ℹ', tone: 'info', word: 'Note' },
};

export function warningItem(w) {
  const s = SEVERITY[w.severity] || SEVERITY.warning;
  return h('li', { class: `warn-item warn-${s.tone}`, 'data-warning': w.type },
    h('span', { class: 'warn-symbol', 'aria-hidden': 'true' }, s.symbol),
    h('span', { class: 'sr-only' }, `${s.word}: `),
    h('span', null, w.message));
}

export const timeRange = (it) => `${formatClock12(it.startMin)}–${formatClock12(it.endMin)}`;

let fieldSeq = 0;
export function field(label, control, { hint = null, error = null, wide = false } = {}) {
  const id = control.id || `f${++fieldSeq}`;
  control.id = id;
  const hintId = hint ? `${id}-hint` : null;
  const errId = error ? `${id}-err` : null;
  const described = [hintId, errId].filter(Boolean).join(' ');
  if (described) control.setAttribute('aria-describedby', described);
  if (error) control.setAttribute('aria-invalid', 'true');
  return h('div', { class: `field${wide ? ' field-wide' : ''}${error ? ' has-error' : ''}` },
    h('label', { for: id }, label),
    control,
    hint ? h('p', { class: 'field-hint', id: hintId }, hint) : null,
    error ? h('p', { class: 'field-error', id: errId }, h('span', { 'aria-hidden': 'true' }, '✕ '), error) : null);
}

export function daySwitcher(days, selectedId, hrefFor, { label = 'Day' } = {}) {
  return h('nav', { class: 'day-switcher', 'aria-label': `${label} picker` },
    days.map((d) => h('a', { href: hrefFor(d), class: `day-pill${d.id === selectedId ? ' is-active' : ''}`, 'aria-current': d.id === selectedId ? 'true' : null }, d.label)));
}

export function emptyState(title, body, action) {
  return h('div', { class: 'empty-state' }, h('h3', null, title), h('p', null, body), action || null);
}

export function iconButton(symbol, label, onClick, extra = {}) {
  return h('button', { type: 'button', class: `btn btn-icon ${extra.class || ''}`, 'aria-label': label, title: label, on: { click: onClick }, ...extra.attrs }, h('span', { 'aria-hidden': 'true' }, symbol));
}

export const byId = (list, id) => list.find((x) => x.id === id);
