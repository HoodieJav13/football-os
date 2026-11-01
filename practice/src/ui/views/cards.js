// Scout card library and editor with a small diagram editor.
import { h, clear } from '../dom.js';
import { createCard, saveCard, duplicateCard, printedLines, printFitError, cardFit, PRINT_FIT, addToken, removeToken, moveToken, setTokenLabel, addArrow, removeArrow, moveArrowEnd, setArrowKind, nudge, DIAGRAM, LIMITS, ARROW_KINDS, resolveProvenance } from '../../domain/cards.js';
import { updatePeriod } from '../../domain/week.js';
import { pruneReferences } from '../../domain/project.js';
import { renderDiagram, arrowKindText } from '../diagram.js';
import { fictionalBadge, emptyState, field, byId } from './common.js';

const usage = (p, cardId) => p.week.days.flatMap((d) => d.periods.filter((x) => x.cardIds.includes(cardId)).map((x) => ({ day: d, period: x })));

export function renderCards(main, ctx) {
  const { app } = ctx;
  const p = app.project;
  main.append(h('header', { class: 'page-head' },
    h('div', { class: 'page-title' }, h('h1', null, 'Scout cards'), fictionalBadge()),
    h('p', { class: 'page-sub' }, 'Local, fictional scout looks with illustrative diagrams. Stored in this planner only.'),
    h('div', { class: 'row-actions' },
      h('a', { class: 'btn btn-primary', href: '#/card/new', 'data-action': 'new-card' }, '+ New card from scratch'),
      h('a', { class: 'btn', href: '#/print/cards/all' }, 'Print all cards (4 per page)'))));
  if (!p.cards.length) {
    main.append(emptyState('No scout cards yet', 'Create a card from scratch: name the look, place the players, draw the arrows.', h('a', { class: 'btn btn-primary', href: '#/card/new' }, '+ New card')));
    return;
  }
  main.append(h('ul', { class: 'card-grid' }, p.cards.map((c) => {
    const used = usage(p, c.id);
    return h('li', { class: 'card-tile', 'data-card-id': c.id },
      h('a', { href: `#/card/${encodeURIComponent(c.id)}`, class: 'card-tile-link', 'aria-label': `Edit ${c.title}` }, renderDiagram(c, { size: 'thumb' })),
      h('div', { class: 'card-tile-body' },
        h('h2', { class: 'card-tile-title' }, c.lookLabel || c.title),
        h('p', { class: 'muted small' }, `${c.title} · v${c.version}`),
        h('p', { class: 'small' }, used.length ? `Used in ${used.length} period${used.length === 1 ? '' : 's'}` : 'Not used yet'),
        printFitError(c) ? h('p', { class: 'small warn-text', 'data-long-card': c.id }, '⚠ Too long to print four to a page (older version). Open it to shorten; it is kept unchanged.') : null,
        h('div', { class: 'row-actions' },
          h('a', { class: 'btn btn-small', href: `#/card/${encodeURIComponent(c.id)}` }, 'Edit'),
          h('button', { type: 'button', class: 'btn btn-small', on: { click: () => {
            const { card: copy, errors } = duplicateCard(c, app.ids);
            if (errors.length) return ctx.toast(`Not duplicated: the copy, titled “${copy.title}”, would not print four to a page. ${errors.join(' ')}`, { tone: 'warn', timeout: 15000 });
            ctx.commit({ ...app.project, cards: app.project.cards.concat([copy]) }, { label: 'Duplicated card' });
          } } }, 'Duplicate'),
          h('button', { type: 'button', class: 'btn btn-small btn-danger-quiet', on: { click: () => {
            ctx.commit(pruneReferences({ ...app.project, cards: app.project.cards.filter((x) => x.id !== c.id) }), { label: `Deleted card “${c.title}”${used.length ? ` (removed from ${used.length} period${used.length === 1 ? '' : 's'})` : ''}`, undoable: true });
          } } }, 'Delete'))));
  })));
}

// ---------------------------------------------------------------- editor
function ensureDraft(app, routeId) {
  const d = app.ui.cardDraft;
  if (d && d.routeId === routeId) return d;
  if (routeId === 'new') {
    app.ui.cardDraft = { routeId, isNew: true, card: createCard(app.ids, { title: '' }), selected: null, dirty: false };
  } else {
    const c = byId(app.project.cards, routeId);
    if (!c) return null;
    app.ui.cardDraft = { routeId, isNew: false, card: structuredClone(c), selected: null, dirty: false };
  }
  return app.ui.cardDraft;
}

export function renderCardEditor(main, ctx) {
  const { app } = ctx;
  const draft = ensureDraft(app, app.route.id);
  if (!draft) {
    main.append(emptyState('Card not found', 'It may have been deleted. Undo is available from the toast if you just removed it.', h('a', { class: 'btn', href: '#/cards' }, 'Back to cards')));
    return;
  }
  const saved = draft.isNew ? null : byId(app.project.cards, draft.card.id);
  const card = () => draft.card;
  const markDirty = () => { draft.dirty = true; dirtyNote.hidden = false; };

  const dirtyNote = h('p', { class: 'dirty-note', hidden: !draft.dirty, role: 'status' }, '• Unsaved changes. Choose Save card to keep them, or Discard.');
  const errors = h('ul', { class: 'form-errors', role: 'alert' });

  // Fields.
  const title = h('input', { type: 'text', value: card().title, maxlength: LIMITS.title, name: 'cardTitle', required: true });
  const look = h('input', { type: 'text', value: card().lookLabel, maxlength: LIMITS.lookLabel, name: 'lookLabel' });
  const family = h('input', { type: 'text', value: card().family, maxlength: LIMITS.family, name: 'family' });
  const notes = h('textarea', { rows: 4, maxlength: LIMITS.notes, name: 'cardNotes' }, card().notes);
  const count = h('span', { class: 'counter' }, `${card().notes.length}/${LIMITS.notes}`);
  const printLines = h('p', { class: 'field-hint', 'data-print-lines': '', 'aria-live': 'polite' });
  // Both save rules, live: the notes/cues line cap and the whole printed card
  // (look label, title, notes, cues and diagram on a four-up quarter page).
  const showPrintLines = (draftCard) => {
    const c = saveCard(draft.isNew ? null : byId(app.project.cards, draftCard.id), draftCard).card; // as it would be saved
    const n = printedLines(c);
    const f = cardFit(c);
    const overLines = n.total > PRINT_FIT.maxLines;
    const overCard = !f.fits;
    printLines.classList.toggle('warn-text', overLines || overCard);
    printLines.textContent = `Printed lines: ${n.total} of ${PRINT_FIT.maxLines} (notes ${n.notes}, cues ${n.cues}). Whole card: ${f.usedLines} of ${f.maxLines} lines (look label ${f.lookLines}, title ${f.titleLines}, notes ${f.notesLines}, cues ${f.cueLines}).`
      + `${overLines ? ' ⚠ Too many note and cue lines — join short lines or shorten the text before saving. Blank lines count.' : ''}`
      + `${overCard ? ' ⚠ The whole card does not fit a four-up page — shorten the title or look label, or join or shorten note lines, before saving.' : ''}`;
  };
  showPrintLines(card());
  const cues = h('textarea', { rows: 3, name: 'cues' }, card().cues.join('\n'));
  const sync = () => {
    draft.card = { ...draft.card, title: title.value, lookLabel: look.value, family: family.value, notes: notes.value, cues: cues.value.split('\n').map((x) => x.trim()).filter(Boolean) };
    count.textContent = `${notes.value.length}/${LIMITS.notes}`;
    showPrintLines(draft.card);
    markDirty();
  };
  for (const el of [title, look, family, notes, cues]) el.addEventListener('input', sync);

  // Diagram editor.
  const stage = h('div', { class: 'dg-stage', tabindex: '0', role: 'group', 'aria-label': 'Diagram editor. Select a player or arrow end, then use the arrow keys to move it by 1 (Shift for 5).', 'data-stage': '' });
  const tools = h('div', { class: 'dg-tools' });
  const itemList = h('div', { class: 'dg-items' });
  const redraw = () => {
    clear(stage).append(renderDiagram(card(), { size: 'full', interactive: true, selected: draft.selected }));
    drawTools();
    drawItems();
  };
  const select = (ref) => { draft.selected = ref; redraw(); };
  const edit = (fn) => { draft.card = fn(draft.card); markDirty(); redraw(); };

  const toSvg = (evt) => {
    const svg = stage.querySelector('svg');
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const m = svg.getScreenCTM();
    return m ? pt.matrixTransform(m.inverse()) : { x: 0, y: 0 };
  };
  let dragging = null;
  stage.addEventListener('pointerdown', (e) => {
    const target = e.target.closest('[data-ref]');
    if (!target) return;
    e.preventDefault();
    const ref = JSON.parse(target.getAttribute('data-ref'));
    draft.selected = ref;
    dragging = { ref, id: e.pointerId };
    stage.setPointerCapture(e.pointerId);
    stage.focus({ preventScroll: true });
    redraw();
  });
  stage.addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== dragging.id) return;
    const pt = toSvg(e);
    const r = dragging.ref;
    draft.card = r.kind === 'token' ? moveToken(draft.card, r.id, pt.x, pt.y) : moveArrowEnd(draft.card, r.id, r.end, pt.x, pt.y);
    markDirty();
    redraw();
  });
  const endDrag = () => { dragging = null; };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('keydown', (e) => {
    const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!dirs[e.key] || !draft.selected) return;
    e.preventDefault();
    const step = e.shiftKey ? 5 : 1;
    edit((c) => nudge(c, draft.selected, dirs[e.key][0] * step, dirs[e.key][1] * step));
    stage.focus({ preventScroll: true });
  });

  const num = (label, value, max, onSet, name) => {
    const input = h('input', { type: 'number', min: 0, max, step: 0.5, value, inputmode: 'decimal', name });
    input.addEventListener('change', () => {
      const v = Number(input.value);
      if (Number.isFinite(v)) onSet(v);
    });
    return field(label, input);
  };
  const nudgePad = (ref) => h('div', { class: 'nudge-pad', role: 'group', 'aria-label': 'Move selected item' },
    [['←', 'left', -1, 0], ['↑', 'up', 0, -1], ['↓', 'down', 0, 1], ['→', 'right', 1, 0]].map(([s, w, dx, dy]) => h('button', { type: 'button', class: 'btn btn-icon', 'aria-label': `Move ${w} by 1`, 'data-nudge': w, on: { click: () => edit((c) => nudge(c, ref, dx, dy)) } }, h('span', { 'aria-hidden': 'true' }, s))));

  function drawTools() {
    clear(tools);
    const c = card();
    const sel = draft.selected;
    const newLabel = h('input', { type: 'text', value: 'X', maxlength: LIMITS.tokenLabel, 'aria-label': 'New player label', class: 'input-short', name: 'newTokenLabel' });
    const newSide = h('select', { 'aria-label': 'New player side', name: 'newTokenSide' }, h('option', { value: 'O' }, 'Offense (circle)'), h('option', { value: 'D' }, 'Defense (triangle)'));
    tools.append(h('div', { class: 'row-actions add-player' }, h('label', { class: 'inline-label' }, 'New player ', newLabel), newSide,
      h('button', { type: 'button', class: 'btn btn-small', 'data-action': 'add-token', disabled: c.diagram.tokens.length >= LIMITS.tokens, on: { click: () => {
        const id = `t${Date.now().toString(36)}${c.diagram.tokens.length}`;
        draft.selected = { kind: 'token', id };
        edit((cc) => addToken(cc, { id, label: (newLabel.value.trim() || 'X').slice(0, LIMITS.tokenLabel), x: 50, y: newSide.value === 'D' ? 14 : 40, side: newSide.value }));
      } } }, '+ Add player')));
    if (!sel) {
      tools.append(h('p', { class: 'muted small' }, 'Select a player or an arrow end (tap it, or use the list) to move it with the arrow keys, the buttons or exact numbers.'));
      return;
    }
    if (sel.kind === 'token') {
      const t = c.diagram.tokens.find((x) => x.id === sel.id);
      if (!t) return;
      const lab = h('input', { type: 'text', value: t.label, maxlength: LIMITS.tokenLabel, name: 'tokenLabel' });
      lab.addEventListener('change', () => edit((cc) => setTokenLabel(cc, t.id, lab.value.trim() || t.label)));
      tools.append(h('div', { class: 'tool-group', 'data-selected-kind': 'token' },
        h('h4', null, `Player ${t.label}`),
        h('div', { class: 'tool-grid' },
          field('Label (max 4)', lab),
          num(`x (0–${DIAGRAM.width})`, t.x, DIAGRAM.width, (v) => edit((cc) => moveToken(cc, t.id, v, t.y)), 'tokenX'),
          num(`y (0–${DIAGRAM.height})`, t.y, DIAGRAM.height, (v) => edit((cc) => moveToken(cc, t.id, t.x, v)), 'tokenY')),
        nudgePad(sel),
        h('div', { class: 'row-actions' },
          h('button', { type: 'button', class: 'btn btn-small', 'data-action': 'add-arrow', disabled: c.diagram.arrows.length >= LIMITS.arrows, on: { click: () => {
            const id = `a${Date.now().toString(36)}${c.diagram.arrows.length}`;
            draft.selected = { kind: 'arrow-end', id, end: 'to' };
            edit((cc) => addArrow(cc, { id, from: { x: t.x, y: t.y }, to: { x: t.x, y: Math.max(0, t.y - 12) }, kind: 'route' }));
          } } }, '+ Arrow from this player'),
          h('button', { type: 'button', class: 'btn btn-small btn-danger-quiet', on: { click: () => { draft.selected = null; edit((cc) => removeToken(cc, t.id)); } } }, 'Delete player'))));
    } else {
      const a = c.diagram.arrows.find((x) => x.id === sel.id);
      if (!a) return;
      const kind = h('select', { name: 'arrowKind' }, ARROW_KINDS.map((k) => h('option', { value: k, selected: k === a.kind }, arrowKindText(k))));
      kind.addEventListener('change', () => edit((cc) => setArrowKind(cc, a.id, kind.value)));
      const other = sel.end === 'from' ? 'to' : 'from';
      tools.append(h('div', { class: 'tool-group', 'data-selected-kind': 'arrow' },
        h('h4', null, `Arrow, ${sel.end === 'from' ? 'start' : 'end'} point`),
        h('div', { class: 'tool-grid' },
          field('Kind', kind),
          num('Start x', a.from.x, DIAGRAM.width, (v) => edit((cc) => moveArrowEnd(cc, a.id, 'from', v, a.from.y)), 'fromX'),
          num('Start y', a.from.y, DIAGRAM.height, (v) => edit((cc) => moveArrowEnd(cc, a.id, 'from', a.from.x, v)), 'fromY'),
          num('End x', a.to.x, DIAGRAM.width, (v) => edit((cc) => moveArrowEnd(cc, a.id, 'to', v, a.to.y)), 'toX'),
          num('End y', a.to.y, DIAGRAM.height, (v) => edit((cc) => moveArrowEnd(cc, a.id, 'to', a.to.x, v)), 'toY')),
        nudgePad(sel),
        h('div', { class: 'row-actions' },
          h('button', { type: 'button', class: 'btn btn-small', on: { click: () => select({ kind: 'arrow-end', id: a.id, end: other }) } }, `Select the ${other === 'from' ? 'start' : 'end'} point`),
          h('button', { type: 'button', class: 'btn btn-small btn-danger-quiet', on: { click: () => { draft.selected = null; edit((cc) => removeArrow(cc, a.id)); } } }, 'Delete arrow'))));
    }
  }

  function drawItems() {
    clear(itemList);
    const c = card();
    const isSel = (ref) => draft.selected && draft.selected.id === ref.id && draft.selected.kind === ref.kind && (ref.kind !== 'arrow-end' || draft.selected.end === ref.end);
    itemList.append(h('h4', null, 'Players and arrows'),
      c.diagram.tokens.length || c.diagram.arrows.length ? h('ul', { class: 'dg-item-list' },
        c.diagram.tokens.map((t) => h('li', null, h('button', { type: 'button', class: `btn btn-small${isSel({ kind: 'token', id: t.id }) ? ' is-on' : ''}`, 'aria-pressed': isSel({ kind: 'token', id: t.id }) ? 'true' : 'false', 'data-select-token': t.id, on: { click: () => select({ kind: 'token', id: t.id }) } }, `${t.side === 'D' ? '▽' : '○'} ${t.label} (${t.x}, ${t.y})`))),
        c.diagram.arrows.map((a, i) => h('li', null, h('button', { type: 'button', class: `btn btn-small${isSel({ kind: 'arrow-end', id: a.id, end: 'to' }) ? ' is-on' : ''}`, 'data-select-arrow': a.id, on: { click: () => select({ kind: 'arrow-end', id: a.id, end: 'to' }) } }, `→ Arrow ${i + 1}: ${arrowKindText(a.kind)}`)))) : h('p', { class: 'muted small' }, 'Empty diagram. Add a player to begin.'));
  }

  redraw();

  // Save / cancel / attach.
  const doSave = () => {
    sync();
    clear(errors);
    // Check the card exactly as it will be stored (new: v1; edit: version + 1).
    const { card: next, errors: problems } = saveCard(draft.isNew ? null : byId(app.project.cards, draft.card.id), draft.card);
    if (problems.length) {
      for (const m of problems) errors.append(h('li', null, `✕ ${m}`));
      errors.scrollIntoView({ block: 'nearest' });
      return false;
    }
    const cards = draft.isNew ? app.project.cards.concat([next]) : app.project.cards.map((x) => (x.id === next.id ? next : x));
    if (!ctx.canWrite()) return ctx.commit(app.project);
    app.ui.cardDraft = { routeId: next.id, isNew: false, card: structuredClone(next), selected: draft.selected, dirty: false };
    // A new card moves to its own address before the re-render, without a flash of a blank editor.
    if (draft.isNew) history.replaceState(null, '', `${location.pathname}${location.search}#/card/${encodeURIComponent(next.id)}`);
    return ctx.commit({ ...app.project, cards }, { label: `Saved card “${next.title}” (v${next.version})` });
  };
  const discard = async () => {
    if (draft.dirty) {
      const ok = await ctx.confirmDialog({ title: 'Discard changes to this card?', body: 'The diagram and text changes since the last save will be lost.', confirmLabel: 'Discard changes', cancelLabel: 'Keep editing', danger: true });
      if (!ok) return;
    }
    app.ui.cardDraft = null;
    ctx.navigate('#/cards');
  };

  const targets = app.project.week.days.flatMap((d) => d.periods.map((x) => ({ d, x })));
  const attachSel = h('select', { 'aria-label': 'Period to attach this card to', name: 'attachTo' }, targets.map(({ d, x }) => h('option', { value: `${d.id}|${x.id}` }, `${d.label} · ${x.title}${x.cardIds.includes(draft.card.id) ? ' (attached)' : ''}`)));
  const used = draft.isNew ? [] : usage(app.project, draft.card.id);
  const prov = resolveProvenance(draft.card);

  main.append(
    h('header', { class: 'page-head' },
      h('div', { class: 'page-title' }, h('h1', null, draft.isNew ? 'New scout card' : `Edit card: ${saved ? saved.title : draft.card.title}`), fictionalBadge()),
      h('p', { class: 'page-sub' }, draft.isNew ? 'Not saved yet.' : `Version ${saved?.version ?? draft.card.version} · ${prov.message}`),
      dirtyNote),
    errors,
    h('div', { class: 'card-editor' },
      h('section', { class: 'dg-editor', 'aria-label': 'Diagram' },
        stage,
        h('p', { class: 'ref-label' }, 'REFERENCE / FICTIONAL · illustrative diagram, not to scale'),
        tools,
        itemList),
      h('section', { class: 'card-fields', 'aria-label': 'Card details' },
        field('Title', title),
        field('Look label (fictional)', look, { hint: 'The short name coaches call out, for example “Trips Right (gun)”.' }),
        field('Family', family),
        h('div', { class: 'field' }, h('label', { for: 'card-notes' }, 'Notes ', count), Object.assign(notes, { id: 'card-notes' }), printLines),
        field(`Reference cues (one per line, up to ${LIMITS.cues} lines of ${LIMITS.cue} characters)`, cues, { hint: 'Generic reference wording only. Printed with a REFERENCE / FICTIONAL label.' }),
        h('div', { class: 'row-actions' },
          h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'save-card', on: { click: doSave } }, 'Save card'),
          h('button', { type: 'button', class: 'btn', 'data-action': 'discard-card', on: { click: discard } }, draft.dirty ? 'Discard changes' : 'Back to cards'),
          draft.isNew ? null : h('a', { class: 'btn', href: `#/print/cards/${encodeURIComponent(draft.card.id)}` }, 'Print this card')),
        draft.isNew ? h('p', { class: 'muted small' }, 'Save the card to attach it to a period.') : h('div', { class: 'attach' },
          h('h3', null, 'Attach to a period'),
          h('div', { class: 'row-actions' }, attachSel,
            h('button', { type: 'button', class: 'btn', 'data-action': 'attach', on: { click: () => {
              const [dayId, periodId] = attachSel.value.split('|');
              const per = byId(byId(app.project.week.days, dayId).periods, periodId);
              if (per.cardIds.includes(draft.card.id)) return ctx.toast('Already attached to that period.');
              const keep = draft.dirty ? draft : null;
              ctx.commit({ ...app.project, week: updatePeriod(app.project.week, dayId, periodId, { cardIds: per.cardIds.concat([draft.card.id]) }) }, { label: `Attached to ${per.title}` });
              if (keep) app.ui.cardDraft = keep;
            } } }, 'Attach')),
          used.length ? h('ul', { class: 'small' }, used.map(({ day, period }) => h('li', null, `${day.label} · ${period.title}`))) : h('p', { class: 'muted small' }, 'Not attached to any period yet.')))));
}
