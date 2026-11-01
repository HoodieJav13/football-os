// Local scout cards and their illustrative diagrams. Pure.
// Coordinates are in a 100 x 60 illustrative space — not to scale.
import { PRINT_METRICS } from './printmetrics.js';

export const DIAGRAM = { width: 100, height: 60, los: 24 };
export const LIMITS = { title: 80, lookLabel: 60, family: 30, notes: 500, tokens: 24, arrows: 24, tokenLabel: 4, arrowLabel: 12, cues: 4, cue: 140 };
export const ARROW_KINDS = ['route', 'run', 'block', 'motion'];
export const SIDES = ['O', 'D'];

// Print fit, rule 1: notes and cues together get at most PRINT_FIT.maxLines
// printed lines. The estimate is deliberately conservative: every explicit
// line counts, blank lines included, long lines wrap at charsPerLine "average"
// characters, and wide or non-Latin characters weigh more. Rule 2 (cardFit
// below) checks the whole card, including the room the title and look label take.
export const PRINT_FIT = { charsPerLine: 60, maxLines: 21 };

function charWeight(ch) {
  const code = ch.codePointAt(0);
  if (code > 0x24f) return 2;
  if (/[WMmw@%&]/.test(ch)) return 1.7;
  if (/[A-Z0-9]/.test(ch)) return 1.35;
  return 1;
}

function wrappedLines(text) {
  let units = 0;
  for (const ch of text) units += charWeight(ch);
  return Math.max(1, Math.ceil(units / PRINT_FIT.charsPerLine - 1e-9));
}

export function printedLines(card) {
  const notesText = typeof card.notes === 'string' ? card.notes : '';
  const notes = notesText === '' ? 0 : notesText.split('\n').reduce((a, line) => a + wrappedLines(line), 0);
  const cues = Array.isArray(card.cues) ? card.cues.reduce((a, c) => a + (typeof c === 'string' ? wrappedLines(c) : 0), 0) : 0;
  return { notes, cues, total: notes + cues, max: PRINT_FIT.maxLines };
}

// Whole-card fit (correction of the residual F2 finding): the complete printed
// card — look label beside the stamp, title, the 105 px diagram floor, notes and
// cues — must fit a four-up quarter page in its most compact (dense) layout.
// Line counts come from a greedy word-wrap simulation over glyph widths
// measured in Chrome print media (PRINT_METRICS), every width taken 3% wider.
export const CARD_FIT = PRINT_METRICS;
const M = PRINT_METRICS;
const FALLBACK = (table) => Math.max(...Object.values(table)) * 1.25; // unmeasured characters: wider than any measured one

function glyphWidth(table, ch) {
  return (table[ch] ?? FALLBACK(table)) * M.safety;
}

// CSS collapses only ASCII spaces, tabs and line breaks (white-space: normal);
// other spaces (ideographic, em, thin, no-break...) keep their width. Those and
// pre-wrap tabs are break opportunities after the character, never hung.
const COLLAPSIBLE = /[ \t\n\r\f]+/g;
const BREAK_AFTER = /(?<=[\t\u1680\u2000-\u2006\u2008-\u200b\u205f\u3000])/;

// Lines a text occupies in a column. pre: white-space pre-wrap (notes keep their
// spaces and tabs; a tab is taken as a full tab stop, 8 spaces); otherwise runs
// of collapsible white space become one space. Long words break anywhere, as the
// print CSS (overflow-wrap: anywhere) does.
function wrapLines(text, table, maxWidth, pre) {
  const t = pre ? text : text.replace(COLLAPSIBLE, ' ').replace(/^ | $/g, '');
  if (t === '') return pre ? 1 : 0;
  const space = glyphWidth(table, ' ');
  const charWidth = (ch) => (ch === '\t' ? 8 * space : glyphWidth(table, ch));
  let lines = 1;
  let x = 0;
  t.split(' ').forEach((word, i) => {
    let sp = i === 0 ? 0 : space;
    for (const piece of word.split(BREAK_AFTER)) {
      let w = 0;
      for (const ch of piece) w += charWidth(ch);
      if (x + sp + w <= maxWidth) { x += sp + w; sp = 0; continue; }
      if (x > 0) { lines++; x = 0; } // a space before the piece hangs at the line end
      sp = 0;
      if (w <= maxWidth) { x = w; continue; }
      for (const ch of piece) {
        const cw = charWidth(ch);
        if (x > 0 && x + cw > maxWidth) { lines++; x = 0; }
        x += cw;
      }
    }
  });
  return lines;
}

export function cardFit(card) {
  const lookText = (typeof card.lookLabel === 'string' && card.lookLabel) || (typeof card.title === 'string' ? card.title : '');
  const digits = String(Number.isInteger(card.version) ? card.version : 1).length;
  const lookWidth = M.contentWidthPx - (M.stampBasePx + M.stampDigitPx * (digits - 1)) - M.headGapPx;
  const lookLines = Math.max(1, wrapLines(lookText, M.widths.look, lookWidth, false));
  const titleLines = Math.max(1, wrapLines(typeof card.title === 'string' ? card.title : '', M.widths.body, M.contentWidthPx, false));
  const notes = typeof card.notes === 'string' ? card.notes : '';
  const notesLines = notes ? notes.split('\n').reduce((a, line) => a + wrapLines(line, M.widths.body, M.contentWidthPx, true), 0) : 0;
  const cues = Array.isArray(card.cues) ? card.cues.filter((c) => typeof c === 'string') : [];
  const cueLines = cues.reduce((a, c) => a + Math.max(1, wrapLines(c, M.widths.cue, M.cueWidthPx, false)), 0);
  const blocks = 3 + (notes ? 1 : 0) + (cues.length ? 1 : 0); // head, title, diagram, notes?, cues?
  const textPx = lookLines * M.lookLinePx + titleLines * M.titleLinePx + notesLines * M.noteLinePx + cueLines * M.cueLinePx;
  const neededPx = M.paddingPx + M.diagramMinPx + M.marginPx + (blocks - 1) * M.gapPx + textPx;
  // The same rule in note-line units, for the editor counter (gaps counted as if all five blocks are present).
  const fixedPx = M.paddingPx + M.diagramMinPx + M.marginPx + 4 * M.gapPx;
  return {
    lookLines, titleLines, notesLines, cueLines,
    neededPx: Math.round(neededPx * 10) / 10,
    capacityPx: M.cellPx,
    usedLines: Math.round(((neededPx - fixedPx) / M.noteLinePx) * 10) / 10,
    maxLines: Math.round(((M.cellPx - fixedPx) / M.noteLinePx) * 10) / 10,
    fits: neededPx <= M.cellPx,
  };
}

export function printFitError(card) {
  const n = printedLines(card);
  if (n.total > PRINT_FIT.maxLines) {
    return `Notes and cues need about ${n.total} printed lines (${n.notes} for notes, ${n.cues} for cues); a printed card holds ${PRINT_FIT.maxLines}. Join short lines or shorten the notes or cues — blank lines count as lines.`;
  }
  const f = cardFit(card);
  if (f.fits) return null;
  return `The whole printed card is too tall for a four-up quarter-page card: it needs about ${f.usedLines} lines of room (look label ${f.lookLines} line${f.lookLines === 1 ? '' : 's'}, title ${f.titleLines}, notes ${f.notesLines}, cues ${f.cueLines}) and the card holds ${f.maxLines}. Shorten the title or look label (wide letters such as W take the most room), or join or shorten note lines.`;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round1 = (v) => Math.round(v * 10) / 10;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isStr = (v) => typeof v === 'string';

export function createCard(ids, fields = {}) {
  return {
    id: ids('card'),
    version: 1,
    title: fields.title ?? 'New scout card',
    lookLabel: fields.lookLabel ?? '',
    family: fields.family ?? 'custom',
    diagram: { width: DIAGRAM.width, height: DIAGRAM.height, los: DIAGRAM.los, tokens: [], arrows: [] },
    notes: fields.notes ?? '',
    cues: [],
    fictional: true,
    provenance: null,
  };
}

export function updateCard(card, patch) {
  const { id: _id, version: _v, fictional: _f, ...rest } = patch;
  return { ...card, ...rest, id: card.id, version: card.version + 1, fictional: true };
}

// Save and Duplicate build the card they will store and check that card: the
// saved version is one higher (v9 -> v10 widens the printed stamp) and a copy's
// title gains " (copy)", and either can change whether the card fits.
export function saveCard(orig, draft) {
  let card;
  if (!orig) card = { ...draft, version: 1, fictional: true };
  else {
    const { title, lookLabel, family, notes, cues, diagram } = draft;
    card = updateCard(orig, { title, lookLabel, family, notes, cues, diagram });
  }
  const errors = validateCard(card).errors;
  const fit = printFitError(card);
  if (orig && fit && !printFitError({ ...card, version: orig.version })) {
    errors[errors.indexOf(fit)] = `${fit} Saving makes this card v${card.version}, and the longer version number on the printed card leaves the look label less room.`;
  }
  return { card, errors };
}

export function duplicateCard(card, ids) {
  const copy = { ...structuredClone(card), id: ids('card'), version: 1, title: `${card.title} (copy)`.slice(0, LIMITS.title), provenance: null };
  return { card: copy, errors: validateCard(copy).errors };
}

const inBounds = (p, d) => p && isNum(p.x) && isNum(p.y) && p.x >= 0 && p.x <= d.width && p.y >= 0 && p.y <= d.height;

export function validateCard(card) {
  const errors = [];
  if (!card || typeof card !== 'object') return { errors: ['Card must be an object.'] };
  if (!isStr(card.id) || !card.id) errors.push('Card id is required.');
  if (!Number.isInteger(card.version) || card.version < 1) errors.push('Card version must be a positive whole number.');
  if (!isStr(card.title) || !card.title.trim()) errors.push('Card title is required.');
  else if (card.title.length > LIMITS.title) errors.push(`Card title is longer than ${LIMITS.title} characters.`);
  if (!isStr(card.lookLabel) || card.lookLabel.length > LIMITS.lookLabel) errors.push(`Look label must be text up to ${LIMITS.lookLabel} characters.`);
  if (!isStr(card.family) || card.family.length > LIMITS.family) errors.push(`Family must be text up to ${LIMITS.family} characters.`);
  if (!isStr(card.notes) || card.notes.length > LIMITS.notes) errors.push(`Card notes must be text up to ${LIMITS.notes} characters.`);
  if (!Array.isArray(card.cues) || card.cues.length > LIMITS.cues || card.cues.some((c) => !isStr(c) || c.length > LIMITS.cue)) errors.push(`Cues must be up to ${LIMITS.cues} lines of ${LIMITS.cue} characters.`);
  else if (isStr(card.notes) && card.notes.length <= LIMITS.notes) {
    const fit = printFitError(card);
    if (fit) errors.push(fit);
  }
  if (card.fictional !== true) errors.push('Local cards must be marked fictional.');
  if (card.provenance !== null && card.provenance !== undefined) {
    const p = card.provenance;
    if (typeof p !== 'object' || (p.sourceProject !== undefined && !isStr(p.sourceProject)) || (p.sourceCardId !== undefined && !isStr(p.sourceCardId)) || (p.sourceVersion !== undefined && !Number.isInteger(p.sourceVersion))) errors.push('Provenance must be null or {sourceProject, sourceCardId, sourceVersion}.');
  }
  const d = card.diagram;
  if (!d || d.width !== DIAGRAM.width || d.height !== DIAGRAM.height || !isNum(d.los)) {
    errors.push(`Diagram must be ${DIAGRAM.width} x ${DIAGRAM.height} with a line of scrimmage.`);
    return { errors };
  }
  const seen = new Set();
  if (!Array.isArray(d.tokens)) errors.push('Diagram tokens must be a list.');
  else {
    if (d.tokens.length > LIMITS.tokens) errors.push(`Too many tokens (max ${LIMITS.tokens}).`);
    for (const t of d.tokens) {
      if (!t || !isStr(t.id)) { errors.push('Each token needs an id.'); continue; }
      if (seen.has(t.id)) errors.push(`Duplicate diagram id “${t.id}”.`);
      seen.add(t.id);
      if (!isStr(t.label) || !t.label.trim() || t.label.length > LIMITS.tokenLabel) errors.push(`Token ${t.id}: label must be 1–${LIMITS.tokenLabel} characters.`);
      if (!inBounds(t, d)) errors.push(`Token ${t.id} is outside the diagram or its position is not a number.`);
      if (!SIDES.includes(t.side)) errors.push(`Token ${t.id}: side must be O or D.`);
    }
  }
  if (!Array.isArray(d.arrows)) errors.push('Diagram arrows must be a list.');
  else {
    if (d.arrows.length > LIMITS.arrows) errors.push(`Too many arrows (max ${LIMITS.arrows}).`);
    for (const a of d.arrows) {
      if (!a || !isStr(a.id)) { errors.push('Each arrow needs an id.'); continue; }
      if (seen.has(a.id)) errors.push(`Duplicate diagram id “${a.id}”.`);
      seen.add(a.id);
      if (!inBounds(a.from, d) || !inBounds(a.to, d)) errors.push(`Arrow ${a.id} has an endpoint outside the diagram or not a number.`);
      if (!ARROW_KINDS.includes(a.kind)) errors.push(`Arrow ${a.id}: kind must be one of ${ARROW_KINDS.join(', ')}.`);
      if (a.label !== undefined && (!isStr(a.label) || a.label.length > LIMITS.arrowLabel)) errors.push(`Arrow ${a.id}: label up to ${LIMITS.arrowLabel} characters.`);
    }
  }
  return { errors };
}

// ---------------------------------------------------------------- diagram edits
const withDiagram = (card, fn) => ({ ...card, diagram: fn(card.diagram) });
const clampPoint = (d, x, y) => ({ x: round1(clamp(x, 0, d.width)), y: round1(clamp(y, 0, d.height)) });

export function addToken(card, token) {
  return withDiagram(card, (d) => ({ ...d, tokens: d.tokens.concat([{ ...token, ...clampPoint(d, token.x, token.y) }]) }));
}

export function removeToken(card, id) {
  return withDiagram(card, (d) => ({ ...d, tokens: d.tokens.filter((t) => t.id !== id) }));
}

export function moveToken(card, id, x, y) {
  return withDiagram(card, (d) => ({ ...d, tokens: d.tokens.map((t) => (t.id === id ? { ...t, ...clampPoint(d, x, y) } : t)) }));
}

export function setTokenLabel(card, id, label) {
  return withDiagram(card, (d) => ({ ...d, tokens: d.tokens.map((t) => (t.id === id ? { ...t, label: String(label).slice(0, LIMITS.tokenLabel) } : t)) }));
}

export function addArrow(card, arrow) {
  return withDiagram(card, (d) => ({ ...d, arrows: d.arrows.concat([{ label: '', ...arrow, from: clampPoint(d, arrow.from.x, arrow.from.y), to: clampPoint(d, arrow.to.x, arrow.to.y) }]) }));
}

export function removeArrow(card, id) {
  return withDiagram(card, (d) => ({ ...d, arrows: d.arrows.filter((a) => a.id !== id) }));
}

export function moveArrowEnd(card, id, end, x, y) {
  return withDiagram(card, (d) => ({ ...d, arrows: d.arrows.map((a) => (a.id === id ? { ...a, [end]: clampPoint(d, x, y) } : a)) }));
}

export function setArrowKind(card, id, kind) {
  if (!ARROW_KINDS.includes(kind)) return card;
  return withDiagram(card, (d) => ({ ...d, arrows: d.arrows.map((a) => (a.id === id ? { ...a, kind } : a)) }));
}

// ref: { kind: 'token', id } | { kind: 'arrow-end', id, end: 'from' | 'to' }
export function nudge(card, ref, dx, dy) {
  if (ref.kind === 'token') {
    const t = card.diagram.tokens.find((x) => x.id === ref.id);
    return t ? moveToken(card, ref.id, t.x + dx, t.y + dy) : card;
  }
  const a = card.diagram.arrows.find((x) => x.id === ref.id);
  if (!a) return card;
  const p = a[ref.end];
  return moveArrowEnd(card, ref.id, ref.end, p.x + dx, p.y + dy);
}

// Future exchange: bind only by explicit source project + card id, never by title.
export function resolveProvenance(card, knownSources = []) {
  const p = card.provenance;
  if (!p || !p.sourceCardId) return { status: 'local', boundTo: null, message: 'Local card (no external source).' };
  const hit = knownSources.find((k) => k.sourceProject === p.sourceProject && k.sourceCardId === p.sourceCardId);
  if (hit) return { status: 'matched-id', boundTo: hit, message: `Matches source ${p.sourceProject}/${p.sourceCardId}.` };
  return { status: 'unresolved', boundTo: null, message: `Source ${p.sourceProject || '?'}/${p.sourceCardId} is unknown here. Left unresolved; never matched by title.` };
}


