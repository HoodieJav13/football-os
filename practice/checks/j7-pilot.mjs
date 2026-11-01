// J7: Practice Pilot. Free text alone is refused honestly; a preset with time,
// participants and equipment gives a full proposal that changes nothing until
// "Add as a new day"; the new day is edited with the usual editor; a shorter
// copy is added without touching its source; both print, run on the clock and
// survive a reload.
import { fresh, go, waitFor, setValue, project, reload, overflow, smallTargets, toastText } from './lib.mjs';

const daysJson = (p, n) => JSON.stringify(p.week.days.slice(0, n));
const openPilot = (page) => page.eval(() => { document.querySelector('details[data-key="pilot"]').open = true; });

export default async function (page, { viewport, log }) {
  await fresh(page, '#/plan');
  const out = { viewport: viewport.name };
  const p0 = await project(page);
  const n0 = p0.week.days.length;
  const tue = p0.week.days[1];
  await go(page, `#/plan/${tue.id}`, `.day-plan[data-day-id="${tue.id}"]`);

  // Collapsed by default: the existing day workflow stays in view.
  page.assert(await page.eval(() => !document.querySelector('details[data-key="pilot"]').open), 'Pilot panel starts collapsed');
  await openPilot(page);

  // Free text without a preset: not interpreted, nothing proposed.
  await setValue(page, 'textarea[name="pilotObjective"]', 'Finish every rep at the ball');
  await page.click('[data-action="pilot-propose"]');
  await waitFor(page, () => !!document.querySelector('[data-pilot-status="unsupported"]'), { label: 'unsupported message' });
  out.unsupported = await page.text('[data-pilot-status="unsupported"]');
  page.assert(/does not read or interpret/.test(out.unsupported) && /Finish every rep at the ball/.test(out.unsupported), `unsupported text: ${out.unsupported}`);

  // Preset + time + participants + equipment.
  await setValue(page, 'select[name="pilotPreset"]', 'pursuit-takeaway');
  await waitFor(page, () => !!document.querySelector('input[data-equip="Cones"]'), { label: 'equipment fields for the preset' });
  page.assert(await page.eval(() => document.querySelector('textarea[name="pilotObjective"]').value === 'Finish every rep at the ball'), 'objective text kept across the re-render');
  await setValue(page, 'input[name="pilotMinutes"]', '75');
  await setValue(page, 'input[name="pilotParticipants"]', '0');
  for (const [name, q] of [['Cones', '24'], ['Pinnies', '2'], ['Footballs', '8'], ['Scout cards', '1'], ['Scout pinnies', '10']]) await setValue(page, `input[data-equip="${name}"]`, q);
  await page.click('[data-action="pilot-propose"]');
  await waitFor(page, () => !!document.querySelector('[data-pilot-status="rejected"]'), { label: 'zero participants refused' });
  page.assert(/No participants/.test(await page.text('[data-pilot-status="rejected"]')), 'zero participants message');

  await setValue(page, 'input[name="pilotParticipants"]', '18');
  await page.click('[data-action="pilot-propose"]');
  await waitFor(page, () => !!document.querySelector('[data-pilot-status="proposed"]'), { label: 'proposal shown' });
  out.proposal = await page.text('[data-pilot-status="proposed"]');
  page.assert(/3 stations/.test(out.proposal) && /not interpreted/.test(out.proposal) && /4 stations not used/.test(out.proposal), `proposal explains itself: ${out.proposal.slice(0, 300)}`);
  page.assert(/Fits exactly: 75 of 75 min/.test(out.proposal), 'exact-fit check shown');
  page.assert(daysJson(await project(page), n0 + 1) === daysJson(p0, n0 + 1), 'proposing changed nothing');
  out.overflowProposal = await overflow(page);
  page.assert(out.overflowProposal.ok, `overflow with proposal ${JSON.stringify(out.overflowProposal)}`);
  out.smallProposal = await smallTargets(page);
  page.assert(out.smallProposal.length === 0, `small targets: ${out.smallProposal.join('; ')}`);
  await page.eval(() => document.querySelector('[data-pilot-status="proposed"]').scrollIntoView());
  await page.screenshot('j7-pilot-proposal');

  // Changing an input marks the proposal stale; propose again before adding.
  await setValue(page, 'input[name="pilotMinutes"]', '76');
  page.assert(!(await page.exists('[data-action="pilot-apply"]')), 'stale proposal cannot be applied');
  await setValue(page, 'input[name="pilotMinutes"]', '75');
  await page.click('[data-action="pilot-propose"]');
  await waitFor(page, () => !!document.querySelector('[data-action="pilot-apply"]'), { label: 'proposal again' });

  // Explicit apply: a NEW day; every existing day unchanged.
  await page.click('[data-action="pilot-apply"]');
  await waitFor(page, (n) => window.__pwpDebug.project().week.days.length === n + 1, { label: 'day added' }, n0);
  const p1 = await project(page);
  const pilot = p1.week.days[n0];
  await waitFor(page, (id) => !!document.querySelector(`.day-plan[data-day-id="${id}"]`), { label: 'new day shown' }, pilot.id);
  page.assert(daysJson(p1, n0) === daysJson(p0, n0), 'existing days unchanged');
  page.assert(/as a new day/.test(await toastText(page)), 'toast names the new day');
  out.pilotTotal = await page.eval(() => Number(document.querySelector('.total-big').dataset.total));
  page.assert(out.pilotTotal === 75, `new day total ${out.pilotTotal}`);
  page.assert(await page.eval(() => document.querySelectorAll('.script > .period-row').length === 12), '12 scheduled periods (3 rounds × 3 stations + 3)');
  page.assert(await page.eval(() => document.querySelectorAll('.script > .period-row.is-parallel').length === 6), 'stations shown as parallel');

  // Normal editing with the existing editor.
  const firstId = pilot.periods[0].id;
  await page.click(`.period-row[data-period-id="${firstId}"] [data-action="edit"]`);
  await waitFor(page, () => document.getElementById('editor').open, { label: 'editor open' });
  await setValue(page, '#editor [data-field="minutes"]', '9');
  await page.click('#editor [data-action="save"]');
  await waitFor(page, () => !document.getElementById('editor').open, { label: 'editor closed' });
  await waitFor(page, () => Number(document.querySelector('.total-big').dataset.total) === 73, { label: 'total after edit' });

  // Shorter copy of the edited Pilot day: added after it, source unchanged.
  const p2 = await project(page);
  const source = JSON.stringify(p2.week.days.find((d) => d.id === pilot.id));
  await openPilot(page);
  await setValue(page, 'input[name="pilotShortMinutes"]', '45');
  await page.click('[data-action="pilot-short-preview"]');
  await waitFor(page, () => !!document.querySelector('[data-short-status="proposed"]'), { label: 'short preview' });
  out.shortPreview = await page.text('[data-short-status="proposed"]');
  page.assert(/73 → 45 min/.test(out.shortPreview), `short preview ${out.shortPreview.slice(0, 200)}`);
  await page.click('[data-action="pilot-short-apply"]');
  await waitFor(page, (n) => window.__pwpDebug.project().week.days.length === n + 2, { label: 'short copy added' }, n0);
  const p3 = await project(page);
  const short = p3.week.days[n0 + 1];
  page.assert(JSON.stringify(p3.week.days[n0]) === source, 'source day unchanged by the shorter copy');
  page.assert(short.periods.every((x) => !pilot.periods.some((y) => y.id === x.id)), 'copy has new period ids');
  await waitFor(page, (id) => !!document.querySelector(`.day-plan[data-day-id="${id}"]`) && Number(document.querySelector('.total-big').dataset.total) === 45, { label: 'short copy shown, 45 min' }, short.id);
  await page.screenshot('j7-pilot-short-copy');

  // Print and clock use the new days like any other.
  await go(page, `#/print/day/${short.id}`, '.print-root .sheet');
  out.print = await page.eval(() => {
    const t = document.querySelector('.print-root').textContent;
    return { stations: /Station A · round 1\/3/.test(t), script: /Coach script/.test(t), fictional: /FICTIONAL/.test(t), sheets: document.querySelectorAll('.print-root .sheet').length };
  });
  page.assert(out.print.stations && out.print.script && out.print.fictional && out.print.sheets >= 1, `coach script prints the stations ${JSON.stringify(out.print)}`);
  await go(page, `#/run/${pilot.id}`, '[data-action="prepare"]');
  await page.click('[data-action="prepare"]');
  await waitFor(page, () => !!document.querySelector('[data-clock-action="start"]'), { label: 'clock set up' });
  out.clockSteps = await page.eval(() => window.__pwpDebug.clock().steps.length);
  page.assert(out.clockSteps === 6, `clock steps ${out.clockSteps}`);

  // Local persistence.
  await page.wait(600);
  await reload(page, `#/plan/${pilot.id}`);
  const p4 = await project(page);
  page.assert(p4.week.days.length === n0 + 2 && JSON.stringify(p4.week.days[n0 + 1]) === JSON.stringify(short), 'both new days persisted');
  page.assert(daysJson(p4, n0) === daysJson(p0, n0), 'original days persisted unchanged');

  out.overflow = await overflow(page);
  page.assert(out.overflow.ok, `horizontal overflow ${JSON.stringify(out.overflow)}`);
  log(JSON.stringify(out));
  return out;
}
