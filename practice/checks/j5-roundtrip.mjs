// J5: build up state (edits, rotation + lock, new card, running clock), export,
// reset to the example, re-import, and verify ids, plan, cards, assignments and
// clock match. Bad files are rejected without touching the plan.
import { fresh, go, waitFor, setValue, clickText, project, clock } from './lib.mjs';

const strip = (p) => {
  const c = structuredClone(p);
  c.project.rev = 0; // the revision counter keeps increasing through import; everything else must match
  return c;
};

export default async function (page, { viewport, log }) {
  await page.raw('Page.setDownloadBehavior', { behavior: 'deny' }).catch(() => {});
  await fresh(page, '#/plan');
  const out = { viewport: viewport.name };
  const p0 = await project(page);
  const tue = p0.week.days[1];

  // State: rotation with a lock, an edited period, a new card, a running clock.
  await go(page, `#/rotation/${tue.id}`, '[data-action="generate"]');
  await setValue(page, 'input[name="seed"]', '11');
  await page.click('[data-action="generate"]');
  await waitFor(page, () => document.querySelectorAll('[data-lock]').length > 0, { label: 'rotation' });
  const lockKey = await page.eval(() => [...document.querySelectorAll('[data-lock]')].find((b) => !b.disabled).dataset.lock);
  await page.click(`[data-lock="${lockKey}"]`);
  await waitFor(page, (k) => document.querySelector(`[data-lock="${k}"]`)?.getAttribute('aria-pressed') === 'true', { label: 'locked' }, lockKey);
  await go(page, '#/card/new', '[data-stage]');
  await page.type('input[name="cardTitle"]', 'Round-trip card');
  await page.click('[data-action="add-token"]');
  await page.click('[data-action="save-card"]');
  await waitFor(page, () => /^#\/card\/card-/.test(location.hash) && /^Edit card/.test(document.querySelector('h1')?.textContent || ''), { label: 'card saved' });
  await go(page, `#/run/${tue.id}`, '[data-action="prepare"]');
  await page.click('[data-action="prepare"]');
  await waitFor(page, () => !!document.querySelector('[data-clock-action="start"]'), { label: 'prepared' });
  await page.click('[data-clock-action="start"]');
  await page.eval(() => window.__pwpClock.advance(90_000));
  await page.click('[data-clock-action="next"]');
  await page.eval(() => window.__pwpClock.advance(30_000));
  await page.click('[data-clock-action="pause"]');
  await waitFor(page, () => window.__pwpDebug.clock().state === 'paused', { label: 'paused' });

  // Export (the file request) and capture the same text the download contains.
  await go(page, '#/data', '[data-action="export"]');
  await page.click('[data-action="export"]');
  const note = await page.text('[data-export-note]');
  page.assert(/Export requested/.test(note) && /not proof/.test(note), `export note ${note}`);
  const exported = await page.eval(() => window.__pwpDebug.exportText());
  const before = { project: await project(page), clock: await clock(page) };
  out.exportBytes = exported.length;

  // Reset (confirmed) — the plan changes.
  await page.click('[data-action="reset"]');
  await waitFor(page, () => document.getElementById('confirm').open, { label: 'reset confirm' });
  await page.click('#confirm [data-confirm="ok"]');
  await waitFor(page, () => Object.keys(window.__pwpDebug.project().rotations).length === 0, { label: 'reset done' });
  page.assert((await clock(page)) === null, 'clock cleared by reset');

  // Bad imports are rejected and change nothing.
  const revBefore = (await project(page)).project.rev;
  const bad = async (text, re) => {
    await setValue(page, '[data-import-text]', text);
    await page.click('[data-action="import-text"]');
    const msg = await page.text('[data-import-result]');
    page.assert(re.test(msg), `bad import message: ${msg.slice(0, 160)}`);
    page.assert((await project(page)).project.rev === revBefore, 'rejected import changed nothing');
  };
  await bad('{"schema": "practice-week-planner.project",', /not valid JSON/i);
  const doc = JSON.parse(exported);
  await bad(JSON.stringify({ ...doc, schemaVersion: 2 }), /Unsupported schema version 2/);
  const dup = structuredClone(doc);
  dup.week.days[1].periods[0].id = dup.week.days[0].periods[0].id;
  await bad(JSON.stringify(dup), /Duplicate id/);
  const unk = structuredClone(doc);
  unk.week.days[0].periods[0].cardIds = ['card-nope'];
  await bad(JSON.stringify(unk), /Unknown card/);

  // Good import restores everything.
  await setValue(page, '[data-import-text]', exported);
  await page.click('[data-action="import-text"]');
  await waitFor(page, () => !!window.__pwpDebug.clock(), { label: 'imported' });
  const after = { project: await project(page), clock: await clock(page) };
  page.assert(JSON.stringify(strip(after.project)) === JSON.stringify(strip(before.project)), 'project matches after import (ids, plan, cards, rotations)');
  const pick = (c) => ({ id: c.id, dayId: c.dayId, state: c.state, index: c.index, rev: c.rev, steps: c.steps, historyTypes: c.history.map((x) => x.type) });
  page.assert(JSON.stringify(pick(after.clock)) === JSON.stringify(pick(before.clock)), `clock matches ${JSON.stringify(pick(after.clock)).slice(0, 200)}`);
  out.matched = { periods: after.project.week.days.reduce((a, d) => a + d.periods.length, 0), cards: after.project.cards.length, rotations: Object.keys(after.project.rotations).length, clockRev: after.clock.rev };

  // Import is undoable.
  await clickText(page, '.toast button', 'Undo');
  await waitFor(page, () => Object.keys(window.__pwpDebug.project().rotations).length === 0, { label: 'import undone' });
  await page.screenshot('j5-data');
  log(JSON.stringify(out));
  return out;
}
