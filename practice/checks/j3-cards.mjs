// J3: create a scout card from scratch, edit its diagram by keyboard and by
// numbers, save, edit again (version bump), attach it to a period and open its
// print view.
import { fresh, go, waitFor, setValue, clickText, project, overflow, smallTargets } from './lib.mjs';

export default async function (page, { viewport, log }) {
  await fresh(page, '#/cards');
  const out = { viewport: viewport.name };
  out.libraryCards = await page.eval(() => document.querySelectorAll('.card-tile').length);
  page.assert(out.libraryCards >= 8, `library cards ${out.libraryCards}`);

  await page.click('[data-action="new-card"]');
  await waitFor(page, () => location.hash === '#/card/new' && !!document.querySelector('[data-stage]'), { label: 'card editor' });
  await page.type('input[name="cardTitle"]', 'Quads right — sample');
  await page.type('input[name="lookLabel"]', 'Quads Right (gun)');
  await page.type('textarea[name="cardNotes"]', 'Four receivers to the right. Count them out loud.');

  // Add a player; it is selected. Nudge it by keyboard: right x3, Shift+Up (5).
  await setValue(page, 'input[name="newTokenLabel"]', 'H');
  await page.click('[data-action="add-token"]');
  await waitFor(page, () => document.querySelector('[data-selected-kind="token"]'), { label: 'token selected' });
  const start = await page.eval(() => ({ x: Number(document.querySelector('input[name="tokenX"]').value), y: Number(document.querySelector('input[name="tokenY"]').value) }));
  await page.eval(() => document.querySelector('[data-stage]').focus());
  for (let i = 0; i < 3; i++) await page.key('ArrowRight');
  await page.raw('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38, modifiers: 8 });
  await page.raw('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38, modifiers: 8 });
  const moved = await page.eval(() => ({ x: Number(document.querySelector('input[name="tokenX"]').value), y: Number(document.querySelector('input[name="tokenY"]').value) }));
  page.assert(moved.x === start.x + 3 && moved.y === start.y - 5, `keyboard nudge ${JSON.stringify({ start, moved })}`);
  // Exact numbers.
  await setValue(page, 'input[name="tokenX"]', '72.5');
  await waitFor(page, () => Number(document.querySelector('input[name="tokenX"]').value) === 72.5, { label: 'numeric x' });
  // Nudge buttons.
  await page.click('[data-nudge="down"]');
  out.token = await page.eval(() => ({ x: Number(document.querySelector('input[name="tokenX"]').value), y: Number(document.querySelector('input[name="tokenY"]').value) }));
  page.assert(out.token.y === moved.y + 1, 'nudge button');

  // Arrow from the player, end point set by numbers.
  await page.click('[data-action="add-arrow"]');
  await waitFor(page, () => document.querySelector('[data-selected-kind="arrow"]'), { label: 'arrow selected' });
  await setValue(page, 'input[name="toY"]', '6');
  await setValue(page, 'select[name="arrowKind"]', 'motion');
  // Pointer drag of the arrow end handle (mouse events through CDP).
  const drag = await page.eval(() => {
    document.querySelector('[data-stage]').scrollIntoView({ block: 'center' });
    const hdl = document.querySelector('.dg-handle.is-selected');
    const r = hdl.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.raw('Input.dispatchMouseEvent', { type: 'mouseMoved', x: drag.x, y: drag.y });
  await page.raw('Input.dispatchMouseEvent', { type: 'mousePressed', x: drag.x, y: drag.y, button: 'left', clickCount: 1 });
  await page.raw('Input.dispatchMouseEvent', { type: 'mouseMoved', x: drag.x + 30, y: drag.y, button: 'left', buttons: 1 });
  await page.raw('Input.dispatchMouseEvent', { type: 'mouseReleased', x: drag.x + 30, y: drag.y, button: 'left', clickCount: 1 });
  out.arrowEnd = await page.eval(() => ({ x: Number(document.querySelector('input[name="toX"]').value), y: Number(document.querySelector('input[name="toY"]').value) }));
  page.assert(out.arrowEnd.x > out.token.x, `drag moved the end point ${JSON.stringify(out.arrowEnd)}`);

  // Save -> new id, version 1.
  await page.click('[data-action="save-card"]');
  await waitFor(page, () => /^#\/card\/card-/.test(location.hash) && /^Edit card/.test(document.querySelector('h1')?.textContent || ''), { label: 'saved new card' });
  const cardId = await page.eval(() => decodeURIComponent(location.hash.split('/')[2]));
  let p = await project(page);
  let card = p.cards.find((c) => c.id === cardId);
  page.assert(card && card.version === 1 && card.fictional === true && card.diagram.tokens.length === 1 && card.diagram.arrows[0].kind === 'motion', `saved card ${JSON.stringify(card).slice(0, 200)}`);

  // Edit again -> version 2, same id.
  await setValue(page, 'textarea[name="cardNotes"]', 'Four receivers to the right. Count them out loud. Edited.');
  await page.click('[data-action="save-card"]');
  await waitFor(page, (id) => window.__pwpDebug.project().cards.find((c) => c.id === id)?.version === 2, { label: 'version 2' }, cardId);

  // Attach to the first Tuesday group period.
  const tue = p.week.days[1];
  const target = tue.periods.find((x) => x.groupIds.length && x.scheduled);
  await setValue(page, 'select[name="attachTo"]', `${tue.id}|${target.id}`);
  await page.click('[data-action="attach"]');
  await waitFor(page, (d, per, id) => window.__pwpDebug.project().week.days.find((x) => x.id === d).periods.find((x) => x.id === per).cardIds.includes(id), { label: 'attached' }, tue.id, target.id, cardId);
  out.attachedTo = target.title;

  out.overflow = await overflow(page);
  page.assert(out.overflow.ok, `overflow ${JSON.stringify(out.overflow)}`);
  out.smallTargets = await smallTargets(page);
  page.assert(out.smallTargets.length === 0, `small targets: ${out.smallTargets.join('; ')}`);
  await page.eval(() => window.scrollTo(0, 0));
  await page.screenshot('j3-card-editor');

  // The day plan shows the card on that period; the print views include it.
  await go(page, `#/plan/${tue.id}`, `.period-row[data-period-id="${target.id}"]`);
  page.assert(await page.eval((id) => document.querySelector(`.period-row[data-period-id="${id}"]`).textContent.includes('Quads Right (gun)'), target.id), 'card chip on period');
  await go(page, `#/print/cards/${cardId}`, '.print-root .pcard');
  const printed = await page.eval(() => document.querySelector('.print-root .pcard').textContent);
  page.assert(/Quads Right \(gun\)/.test(printed) && /REFERENCE \/ FICTIONAL · v2/.test(printed), `print card ${printed.slice(0, 120)}`);
  await go(page, `#/print/cards/${tue.id}`, '.print-root .pcard');
  out.tueCards = await page.eval(() => document.querySelectorAll('.print-root .pcard').length);
  page.assert(await page.eval((id) => !!document.querySelector(`.print-root [data-print-card="${id}"]`), cardId), 'card in Tuesday card print');
  await page.screenshot('j3-card-print');

  // Discard path: start another new card, type, discard with confirmation.
  await go(page, '#/card/new', '[data-stage]');
  await page.type('input[name="cardTitle"]', 'Will be discarded');
  await page.click('[data-action="discard-card"]');
  await waitFor(page, () => document.getElementById('confirm').open, { label: 'discard confirm' });
  await page.click('#confirm [data-confirm="ok"]');
  await waitFor(page, () => location.hash === '#/cards', { label: 'back to cards' });
  p = await project(page);
  page.assert(!p.cards.some((c) => c.title === 'Will be discarded'), 'discarded card was not saved');
  log(JSON.stringify(out));
  return out;
}
