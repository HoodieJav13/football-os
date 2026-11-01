// J2: generate a rotation, change an assignment, lock it, regenerate with a
// new seed, and inspect the shortage (screen and print).
import { fresh, go, waitFor, setValue, project, overflow, smallTargets } from './lib.mjs';

export default async function (page, { viewport, log }) {
  await fresh(page, '#/plan');
  const out = { viewport: viewport.name };
  const p0 = await project(page);
  const wed = p0.week.days[2];
  await go(page, `#/rotation/${wed.id}`, '[data-action="generate"]');
  page.assert(await page.exists('.empty-state'), 'empty state before generating');
  await setValue(page, 'input[name="seed"]', '3');
  await page.click('[data-action="generate"]');
  await waitFor(page, () => document.querySelectorAll('.rot-table select').length > 0, { label: 'tables' });

  // The honest shortage: Station B QB.
  const shortage = await page.eval(() => [...document.querySelectorAll('[data-shortage]')].map((e) => e.textContent));
  page.assert(shortage.length >= 1, 'a shortage is shown');
  page.assert(shortage.some((t) => /unavailable/i.test(t) && /same time/i.test(t)), `shortage reason: ${shortage[0]}`);
  out.shortage = shortage[0];

  // Domain check: no conflicts, every filled slot is eligible and available.
  const check = await page.eval(async (dayId) => {
    const R = await import('/src/domain/rotation.js');
    const p = window.__pwpDebug.project();
    const day = p.week.days.find((d) => d.id === dayId);
    const v = R.validateRotation({ day, groups: p.groups, participants: p.participants, rotation: p.rotations[dayId] });
    const ids = new Set(p.participants.map((x) => x.id));
    const filled = p.rotations[dayId].entries.flatMap((e) => e.slots).filter((s) => s.participantId);
    return { errors: v.warnings.filter((w) => w.severity === 'error').length, invented: filled.filter((s) => !ids.has(s.participantId)).length, shortages: v.warnings.filter((w) => w.type === 'shortage').length };
  }, wed.id);
  page.assert(check.errors === 0 && check.invented === 0 && check.shortages >= 1, `domain check ${JSON.stringify(check)}`);

  // Change an assignment to another valid participant.
  const pick = await page.eval(() => {
    for (const sel of document.querySelectorAll('.rot-table select')) {
      const cur = sel.value;
      const alt = [...sel.options].find((o) => o.value && o.value !== cur && !o.disabled);
      if (cur && alt) return { slot: sel.dataset.slot, from: cur, to: alt.value };
    }
    return null;
  });
  page.assert(pick, 'found a slot with an alternative');
  await setValue(page, `select[data-slot="${pick.slot}"]`, pick.to);
  await waitFor(page, (s, v) => document.querySelector(`select[data-slot="${s}"]`)?.value === v, { label: 'assignment changed' }, pick.slot, pick.to);
  const why = await page.text(`tr[data-row="${pick.slot}"] .why`);
  page.assert(/Set by coach/.test(why), `why: ${why}`);

  // Lock it, then regenerate with another seed: the lock holds.
  await page.click(`[data-lock="${pick.slot}"]`);
  await waitFor(page, (s) => document.querySelector(`[data-lock="${s}"]`)?.getAttribute('aria-pressed') === 'true', { label: 'locked' }, pick.slot);
  page.assert(await page.eval((s) => document.querySelector(`select[data-slot="${s}"]`).disabled, pick.slot), 'locked select is disabled');
  await setValue(page, 'input[name="seed"]', '777');
  await page.click('[data-action="generate"]');
  await waitFor(page, () => /seed 777/.test(document.querySelector('[data-rotation-meta]')?.textContent || ''), { label: 'regenerated' });
  const after = await page.eval((s) => ({ value: document.querySelector(`select[data-slot="${s}"]`).value, pressed: document.querySelector(`[data-lock="${s}"]`).getAttribute('aria-pressed') }), pick.slot);
  page.assert(after.value === pick.to && after.pressed === 'true', `lock survived regenerate ${JSON.stringify(after)}`);
  out.lock = { slot: pick.slot, kept: after.value };
  const stillShort = await page.eval(() => document.querySelectorAll('[data-shortage]').length);
  page.assert(stillShort >= 1, 'shortage still visible after regenerate');

  // Unavailability edit revalidates: mark the locked person out for that period.
  const [periodId] = pick.slot.split('|');
  await page.eval(() => { document.querySelector('.participants').open = true; });
  await page.click(`[data-out-period="${pick.to}|${periodId}"]`);
  await waitFor(page, () => [...document.querySelectorAll('.warn-item')].some((e) => /unavailable/.test(e.textContent) && /locked|unlock/.test(e.textContent)), { label: 'locked-invalid warning' });
  out.lockedInvalidWarning = true;
  page.assert(await page.eval(() => document.querySelector('.participants').open), 'participant manager stays open after an edit');
  page.assert(await page.eval((k) => document.activeElement?.getAttribute('data-out-period') === k, `${pick.to}|${periodId}`), 'focus stays on the toggled checkbox');
  // Put it back: the locked slot is valid again.
  await page.click(`[data-out-period="${pick.to}|${periodId}"]`);
  await waitFor(page, () => !document.querySelector('.rot-summary .warn-error'), { label: 'locked problem cleared' });

  out.overflow = await overflow(page);
  page.assert(out.overflow.ok, `overflow ${JSON.stringify(out.overflow)}`);
  out.smallTargets = await smallTargets(page);
  page.assert(out.smallTargets.length === 0, `small targets: ${out.smallTargets.join('; ')}`);
  await page.eval(() => { document.querySelector('.participants').open = false; window.scrollTo(0, 0); });
  await page.screenshot('j2-rotation-warnings');
  await page.eval((s) => document.querySelector(`tr[data-row="${s}"]`).scrollIntoView({ block: 'center' }), pick.slot);
  await page.screenshot('j2-rotation-locked');

  // Print view lists the unresolved shortage.
  await go(page, `#/print/rotation/${wed.id}`, '.print-root .sheet');
  const printed = await page.eval(() => document.querySelector('.print-root .pb-short')?.textContent || '');
  page.assert(/UNFILLED/.test(printed) && /QB/.test(printed), `print shortage: ${printed.slice(0, 120)}`);
  page.assert(await page.eval(() => [...document.querySelectorAll('.print-root td')].some((td) => td.textContent === '[locked]')), 'print shows the lock');
  log(JSON.stringify(out));
  return out;
}
