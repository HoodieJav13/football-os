// Producer boundary (Coaching flagship): a saved debrief offers "Export debrief
// (JSON)", and the document it produces from the live plan is the frozen
// practice-week-planner.practice-debrief v1 with matching provenance.
import { fresh, go, waitFor, reload, project } from './lib.mjs';

export default async function (page, { viewport, log }) {
  await page.raw('Page.setDownloadBehavior', { behavior: 'deny' }).catch(() => {});
  await fresh(page, '#/plan');
  // Build a practised, debriefed Wednesday with the domain modules (fictional data), then load it as saved.
  const recordId = await page.eval(async () => {
    const C = await import('/src/domain/clock.js');
    const D = await import('/src/domain/disruption.js');
    const p = window.__pwpDebug.project();
    const d = p.week.days[2];
    const env = (mono) => ({ mono, wall: 1_800_000_000_000 + mono, instanceId: 'probe' });
    const act = (s, type, mono, extra = {}) => { const r = C.applyAction(s, { type, rev: s.rev, ...extra }, env(mono)); if (!r.ok) throw new Error(r.error); return r.session; };
    let s = C.createSession({ id: 'clk-probe', day: d });
    s = act(s, 'start', 0);
    s = act(s, 'revise', 960_000, { change: D.proposeRebalance(s, env(960_000), { minutesLeft: 80, mode: 'fit', deferIndexes: [s.steps.findIndex((x) => /Situations/.test(x.title))] }).change });
    let t = 960_000;
    while (s.state !== 'completed') { t += s.steps[s.index].plannedSec * 1000; s = act(s, 'next', t); }
    const rec = D.buildRecord(s, d, { id: 'rec-probe', notes: 'Fictional debrief for the export check.', wall: 1_800_000_100_000 });
    const proj = JSON.parse(localStorage.getItem('pwp:v1:project') || JSON.stringify(p));
    proj.records = [rec];
    localStorage.setItem('pwp:v1:project', JSON.stringify(proj));
    return rec.id;
  });
  const p0 = await project(page);
  const wed = p0.week.days[2];
  await reload(page, `#/run/${wed.id}`);
  await waitFor(page, (id) => !!document.querySelector(`[data-action="export-debrief"][data-record-id="${id}"]`), { label: 'export button' }, recordId);
  const before = await page.eval(() => localStorage.getItem('pwp:v1:project'));
  await page.click(`[data-action="export-debrief"][data-record-id="${recordId}"]`);
  await page.wait(200);
  const note = await page.text('[data-export-note]');
  page.assert(/Export requested/.test(note || '') && /not proof/.test(note || ''), `export is requested and stated honestly: ${note}`);
  const result = await page.eval(async (id) => {
    const X = await import('/src/domain/debrief-export.js');
    const p = window.__pwpDebug.project();
    const doc = X.exportPracticeDebrief(p, id, { wall: Date.now() });
    const back = X.parsePracticeDebrief(JSON.stringify(doc));
    return { ok: back.ok, errors: back.errors, schema: doc.schema, v: doc.schemaVersion, src: doc.source, steps: doc.steps.length, unfinished: doc.unfinished.map((u) => u.title), projectId: p.project.id, projectRev: p.project.rev };
  }, recordId);
  page.assert(result.ok && result.schema === 'practice-week-planner.practice-debrief' && result.v === 1, `valid v1 document ${JSON.stringify(result.errors)}`);
  page.assert(result.src.recordId === recordId && result.src.projectId === result.projectId && result.src.projectRev === result.projectRev && result.src.dayId === wed.id && result.src.sessionId === 'clk-probe', `provenance matches the live plan ${JSON.stringify(result.src)}`);
  page.assert(result.unfinished.length === 1 && /Situations/.test(result.unfinished[0]), 'unfinished work is exported');
  page.assert((await page.eval(() => localStorage.getItem('pwp:v1:project'))) === before, 'export changes nothing that is saved');
  await page.screenshot('debrief-export-button');
  const out = { viewport: viewport.name, note: note.slice(0, 60), steps: result.steps, unfinished: result.unfinished, source: result.src };
  log(JSON.stringify(out));
  return out;
}
