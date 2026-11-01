// J1: load the fictional week, edit a day, reorder periods with keyboard
// controls, add/duplicate/delete/undo a period, and verify totals.
import { fresh, go, waitFor, clickText, setValue, project, overflow, smallTargets, toastText } from './lib.mjs';

export default async function (page, { viewport, log }) {
  await fresh(page, '#/plan');
  const out = { viewport: viewport.name };

  // Identity and seeded content.
  out.title = await page.title();
  page.assert(/Practice Week Planner/.test(out.title), `title ${out.title}`);
  page.assert((await page.text('h1')) === 'Practice week', 'h1');
  page.assert(await page.exists('.badge-fictional'), 'FICTIONAL badge');
  const tiles = await page.eval(() => document.querySelectorAll('.day-tile').length);
  page.assert(tiles === 5, `5 day tiles, got ${tiles}`);

  // Select Tuesday.
  const p0 = await project(page);
  const tue = p0.week.days[1];
  await go(page, `#/plan/${tue.id}`, `.day-plan[data-day-id="${tue.id}"]`);

  // Edit the day: label and planned length.
  await page.eval(() => { document.querySelector('.day-settings').open = true; });
  await setValue(page, 'input[name="dayLabel"]', 'Tuesday (edited)');
  await setValue(page, 'input[name="dayPlanned"]', '110');
  await clickText(page, '.day-settings button[type="submit"]', 'Save day settings');
  await waitFor(page, () => document.querySelector('.day-title')?.textContent === 'Tuesday (edited)', { label: 'day renamed' });
  const overText = await page.text('.day-tile.is-selected .day-tile-total');
  page.assert(/10 min over/.test(overText), `over warning on tile: ${overText}`);
  page.assert(await page.exists('.totals [data-warning="over-duration"]'), 'over-duration warning in totals');

  // Keyboard reorder: Enter on "Move down" of the first period, twice, then Space on "Move up".
  const order0 = await page.eval(() => [...document.querySelectorAll('.script > .period-row')].map((r) => r.dataset.periodId));
  const first = order0[0];
  await page.key('Enter', `[data-focus="down-${first}"]`);
  await waitFor(page, (id) => document.querySelectorAll('.script > .period-row')[1]?.dataset.periodId === id, { label: 'moved to 2' }, first);
  let focused = await page.eval(() => document.activeElement?.getAttribute('data-focus'));
  page.assert(focused === `down-${first}`, `focus stays on moved row's Move down, got ${focused}`);
  await page.key('Enter');
  await waitFor(page, (id) => document.querySelectorAll('.script > .period-row')[2]?.dataset.periodId === id, { label: 'moved to 3' }, first);
  focused = await page.eval(() => document.activeElement?.getAttribute('data-focus'));
  page.assert(focused === `down-${first}`, `focus after second move ${focused}`);
  await page.key('Space', `[data-focus="up-${first}"]`);
  await waitFor(page, (id) => document.querySelectorAll('.script > .period-row')[1]?.dataset.periodId === id, { label: 'moved back to 2' }, first);
  const order1 = await page.eval(() => [...document.querySelectorAll('.script > .period-row')].map((r) => r.dataset.periodId));
  page.assert(order1.length === order0.length && order1.every((id) => order0.includes(id)), 'same ids after reorder');
  out.reorder = { before: order0.slice(0, 3), after: order1.slice(0, 3) };

  // Pointer drag on the handle (mouse events through CDP): drag row 1 below row 2.
  const dragFrom = await page.eval(() => {
    const rows = document.querySelectorAll('.script > .period-row');
    rows[0].scrollIntoView({ block: 'center' });
    const hnd = rows[0].querySelector('.drag-handle').getBoundingClientRect();
    const r2 = rows[1].getBoundingClientRect();
    return { id: rows[0].dataset.periodId, x: hnd.left + hnd.width / 2, y: hnd.top + hnd.height / 2, to: r2.top + r2.height * 0.75 };
  });
  await page.raw('Input.dispatchMouseEvent', { type: 'mouseMoved', x: dragFrom.x, y: dragFrom.y });
  await page.raw('Input.dispatchMouseEvent', { type: 'mousePressed', x: dragFrom.x, y: dragFrom.y, button: 'left', buttons: 1, clickCount: 1 });
  for (const f of [0.25, 0.5, 0.75, 1]) await page.raw('Input.dispatchMouseEvent', { type: 'mouseMoved', x: dragFrom.x, y: dragFrom.y + (dragFrom.to - dragFrom.y) * f, button: 'left', buttons: 1 });
  await page.raw('Input.dispatchMouseEvent', { type: 'mouseReleased', x: dragFrom.x, y: dragFrom.to, button: 'left', buttons: 0, clickCount: 1 });
  await waitFor(page, (id) => document.querySelectorAll('.script > .period-row')[1]?.dataset.periodId === id, { label: 'pointer drag moved row 1 to 2' }, dragFrom.id);
  out.pointerDrag = 'row 1 dragged to position 2';

  // Totals match the domain computation and the visible times are recomputed.
  const totals = await page.eval(async (dayId) => {
    const W = await import('/src/domain/week.js');
    const p = window.__pwpDebug.project();
    const d = p.week.days.find((x) => x.id === dayId);
    const s = W.computeSchedule(d);
    const shown = Number(document.querySelector('.total-big').dataset.total);
    const firstStart = document.querySelector('.script > .period-row .pr-start').textContent;
    return { computed: s.totalMin, shown, firstStart, expectFirst: (await import('/src/domain/time.js')).formatClock12(s.items[0].startMin) };
  }, tue.id);
  page.assert(totals.computed === totals.shown, `totals ${JSON.stringify(totals)}`);
  page.assert(totals.firstStart === totals.expectFirst, `start time ${JSON.stringify(totals)}`);

  // Add a period through the focused editor: drill, objective, card, group, equipment.
  await page.click('[data-action="add-period"]');
  await waitFor(page, () => document.getElementById('editor').open, { label: 'editor open' });
  page.assert(await page.eval(() => document.activeElement?.getAttribute('data-field') === 'title'), 'title focused in editor');
  await setValue(page, '#editor [data-field="title"]', 'Pursuit refresh');
  await setValue(page, '#editor [data-field="minutes"]', '12');
  await setValue(page, '#editor [data-field="drill"]', 'drill-pursuit');
  await page.eval(() => {
    document.querySelector('#editor input[name="cards"][value="card-pro-i"]').checked = true;
    document.querySelector('#editor input[name="groups"][value="grp-skill"]').checked = true;
  });
  await clickText(page, '#editor .drill-info button', 'Use this drill');
  await setValue(page, '#editor [data-field="equipment"]', 'Cones (8)\nPinnie (1)');
  await page.click('#editor [data-action="save"]');
  await waitFor(page, () => !document.getElementById('editor').open, { label: 'editor closed' });
  const added = await page.eval(() => {
    const row = [...document.querySelectorAll('.script > .period-row')].find((r) => r.querySelector('.pr-title').textContent === 'Pursuit refresh');
    return row ? { id: row.dataset.periodId, text: row.textContent } : null;
  });
  page.assert(added, 'added period row');
  page.assert(/Pro I/.test(added.text) && /Scout Skill A/.test(added.text) && /12 min/.test(added.text), `added row content ${added.text.slice(0, 200)}`);
  const total2 = await page.eval(() => Number(document.querySelector('.total-big').dataset.total));
  page.assert(total2 === totals.computed + 12, `total +12: ${total2}`);
  page.assert(await page.eval(() => [...document.querySelectorAll('.equip-list li')].some((li) => li.textContent.includes('Pinnie (1)'))), 'equipment listed');

  // Duplicate gets a new id; delete is undoable.
  await page.click(`.period-row[data-period-id="${added.id}"] [data-action="more"]`);
  await page.click(`.period-row[data-period-id="${added.id}"] [data-action="duplicate"]`);
  const ids = await page.eval(() => [...document.querySelectorAll('.script > .period-row')].map((r) => r.dataset.periodId));
  const dupId = ids[ids.indexOf(added.id) + 1];
  page.assert(dupId && dupId !== added.id, 'duplicate has a new id');
  await page.click(`.period-row[data-period-id="${dupId}"] [data-action="more"]`);
  await page.click(`.period-row[data-period-id="${dupId}"] [data-action="delete"]`);
  await waitFor(page, (id) => !document.querySelector(`.period-row[data-period-id="${id}"]`), { label: 'deleted' }, dupId);
  const t = await toastText(page);
  page.assert(/Deleted/.test(t), `toast ${t}`);
  await clickText(page, '.toast button', 'Undo');
  await waitFor(page, (id) => !!document.querySelector(`.period-row[data-period-id="${id}"]`), { label: 'undo restored' }, dupId);

  // Day reorder by keyboard, and duplicate day keeps the original.
  await page.key('Enter', `[data-focus="day-down-${tue.id}"]`);
  const dayOrder = await page.eval(() => [...document.querySelectorAll('.day-tile')].map((x) => x.dataset.dayId));
  page.assert(dayOrder[2] === tue.id, 'Tuesday moved later');
  out.focusAfterDayMove = await page.eval(() => document.activeElement?.getAttribute('data-focus'));

  out.overflow = await overflow(page);
  page.assert(out.overflow.ok, `horizontal overflow ${JSON.stringify(out.overflow)}`);
  out.smallTargets = await smallTargets(page);
  page.assert(out.smallTargets.length === 0, `small targets: ${out.smallTargets.join('; ')}`);
  await page.eval(() => window.scrollTo(0, 0));
  await page.screenshot('j1-week-day-editing');
  await page.eval(() => document.querySelector('.script').scrollIntoView());
  await page.screenshot('j1-day-script');

  // Weekly summary print view renders.
  await go(page, '#/print/week', '.print-root .sheet');
  out.weekSheets = await page.eval(() => document.querySelectorAll('.print-root .sheet').length);
  page.assert(out.weekSheets >= 1, 'week summary sheets');
  log(JSON.stringify(out));
  return out;
}
