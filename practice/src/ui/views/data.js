// Save, export, import, reset, templates and sample data.
import { h, clear } from '../dom.js';
import { SCHEMA, SCHEMA_VERSION } from '../../domain/project.js';
import { SCENARIOS, FIXTURE_SEEDS } from '../../domain/fixtures.js';
import { newDay } from '../../domain/week.js';
import { fictionalBadge, field } from './common.js';
import { downloadExport, exportText, importFromText, replaceProject, freshExample, saveStateDescription } from '../app.js';
import { schemeIntakePanel } from './scheme.js';

const ZONES = ['America/Chicago', 'America/New_York', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'UTC'];

export function renderData(main, ctx) {
  const { app } = ctx;
  const p = app.project;

  // Status.
  const status = h('section', { class: 'panel', 'aria-label': 'Save status' },
    h('h2', null, 'Where this plan lives'),
    h('p', { 'data-save-line': '' }, saveStateDescription(app.save)),
    h('p', { class: 'muted small' }, 'Everything stays in this browser’s local storage on this device. Nothing is sent to a server, an account or another app.'),
    h('dl', { class: 'facts' },
      h('dt', null, 'Project'), h('dd', null, p.project.name),
      h('dt', null, 'Revision'), h('dd', null, `project rev ${p.project.rev} · week v${p.week.version}`),
      h('dt', null, 'Format'), h('dd', null, `${SCHEMA} v${SCHEMA_VERSION}`),
      h('dt', null, 'Timezone'), h('dd', null, `${p.project.timezone} (all planned times are wall times in this zone)`)));

  // Export.
  const exportNote = h('p', { class: 'small', role: 'status', 'data-export-note': '' });
  const exportBox = h('textarea', { class: 'export-text', rows: 8, readonly: true, hidden: true, 'aria-label': 'Export JSON' });
  const exp = h('section', { class: 'panel', 'aria-label': 'Export' },
    h('h2', null, 'Export'),
    h('p', { class: 'muted small' }, 'A versioned JSON file with the whole plan, cards, rotations and the practice clock.'),
    h('div', { class: 'row-actions' },
      h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'export', on: { click: () => {
        downloadExport();
        exportNote.textContent = `Export requested at ${new Date().toLocaleTimeString()}. Check your downloads folder — a download request is not proof the file was saved.`;
      } } }, 'Export JSON file'),
      h('button', { type: 'button', class: 'btn', 'data-action': 'show-export', on: { click: () => {
        exportBox.hidden = !exportBox.hidden;
        if (!exportBox.hidden) { exportBox.value = exportText(); exportBox.select(); }
      } } }, 'Show export text')),
    exportNote, exportBox);

  // Import.
  const file = h('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Choose an export file', 'data-import-file': '' });
  const paste = h('textarea', { rows: 5, placeholder: 'Or paste exported JSON here', 'aria-label': 'Paste exported JSON', 'data-import-text': '' });
  const result = h('div', { class: 'import-result', role: 'status', 'data-import-result': '' });
  const runImport = (text) => {
    clear(result);
    const r = importFromText(text);
    if (!r.ok) {
      result.append(h('p', { class: 'error-text' }, `✕ Nothing was imported. ${r.errors.length} problem${r.errors.length === 1 ? '' : 's'}:`),
        h('ul', { class: 'form-errors' }, r.errors.slice(0, 12).map((e) => h('li', null, `${e.path ? `${e.path}: ` : ''}${e.message}`))),
        r.errors.length > 12 ? h('p', { class: 'muted small' }, `…and ${r.errors.length - 12} more.`) : null);
      return;
    }
    ctx.toast(`Imported. ${r.warnings.length ? r.warnings.join(' ') : ''}`);
  };
  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return;
    if (f.size > 5_000_000) { clear(result).append(h('p', { class: 'error-text' }, '✕ That file is larger than 5 MB; it is not a planner export.')); return; }
    runImport(await f.text());
  });
  const imp = h('section', { class: 'panel', 'aria-label': 'Import' },
    h('h2', null, 'Import'),
    h('p', { class: 'muted small' }, 'The file is checked first. If anything is wrong, nothing is replaced. A successful import can be undone.'),
    file, paste,
    h('div', { class: 'row-actions' }, h('button', { type: 'button', class: 'btn', 'data-action': 'import-text', on: { click: () => runImport(paste.value) } }, 'Check and import pasted text')),
    result);

  // Reset.
  const reset = h('section', { class: 'panel', 'aria-label': 'Reset' },
    h('h2', null, 'Start over'),
    h('div', { class: 'row-actions' },
      h('button', { type: 'button', class: 'btn btn-danger', 'data-action': 'reset', on: { click: async () => {
        const ok = await ctx.confirmDialog({ title: 'Reset to the fictional example?', body: 'The current plan, cards, rotations and clock are replaced by the sample week. You can undo this right after, or export first.', confirmLabel: 'Reset to example', danger: true });
        if (ok) replaceProject(freshExample(), null, 'Reset to the fictional example');
      } } }, 'Reset to the fictional example…'),
      h('button', { type: 'button', class: 'btn', 'data-action': 'empty-week', on: { click: async () => {
        const ok = await ctx.confirmDialog({ title: 'Start an empty week?', body: 'Keeps the drills, cards, groups and participants; replaces the days with one empty day. You can undo this right after.', confirmLabel: 'Start empty week', danger: true });
        if (!ok) return;
        const cur = app.project;
        const d = newDay(app.ids('day'), { label: 'Monday' });
        replaceProject({ ...cur, week: { ...cur.week, version: cur.week.version + 1, days: [d] }, participants: cur.participants.map((x) => ({ ...x, unavailable: [] })), rotations: {} }, null, 'Started an empty week');
      } } }, 'Start an empty week…')));

  // Project settings.
  const name = h('input', { type: 'text', value: p.project.name, maxlength: 80, name: 'projectName' });
  const zone = h('select', { name: 'timezone' }, ZONES.concat(ZONES.includes(p.project.timezone) ? [] : [p.project.timezone]).map((z) => h('option', { value: z, selected: z === p.project.timezone }, z)));
  const settings = h('section', { class: 'panel', 'aria-label': 'Project settings' },
    h('h2', null, 'Project settings'),
    h('form', { class: 'grid-form', novalidate: true, on: { submit: (e) => {
      e.preventDefault();
      const n = name.value.trim();
      if (!n) return ctx.toast('Project name is required.', { tone: 'warn' });
      ctx.commit({ ...app.project, project: { ...app.project.project, name: n, timezone: zone.value } }, { label: 'Project settings saved' });
    } } },
    field('Project name', name),
    field('Timezone label', zone, { hint: 'Planned times are wall-clock times in this zone. Changing it relabels; it does not shift times.' }),
    h('div', { class: 'row-actions field-wide' }, h('button', { type: 'submit', class: 'btn' }, 'Save settings'))));

  // Templates.
  const templates = h('section', { class: 'panel', 'aria-label': 'Day templates' },
    h('h2', null, `Day templates (${p.templates.length})`),
    h('ul', { class: 'tpl-list' }, p.templates.map((t) => {
      const label = h('input', { type: 'text', value: t.label, maxlength: 60, 'aria-label': `Template name for ${t.label}` });
      label.addEventListener('change', () => {
        const v = label.value.trim();
        if (!v) { label.value = t.label; return; }
        ctx.commit({ ...app.project, templates: app.project.templates.map((x) => (x.id === t.id ? { ...x, label: v } : x)) }, { label: 'Renamed template' });
      });
      return h('li', null, label, h('span', { class: 'muted small' }, ` ${t.periods.length} periods · ${t.plannedMinutes} min`),
        h('button', { type: 'button', class: 'btn btn-small btn-danger-quiet', on: { click: () => ctx.commit({ ...app.project, templates: app.project.templates.filter((x) => x.id !== t.id) }, { label: `Deleted template “${t.label}”`, undoable: true }) } }, 'Delete'));
    })),
    h('p', { class: 'muted small' }, 'Apply or save templates from a day’s “Day settings and templates”.'));

  // Samples.
  const scen = h('select', { name: 'scenario', 'aria-label': 'Sample scenario' }, SCENARIOS.map((s) => h('option', { value: s }, s)));
  const seed = h('select', { name: 'sampleSeed', 'aria-label': 'Sample seed' }, FIXTURE_SEEDS.map((s) => h('option', { value: String(s), selected: s === 42 }, `seed ${s}`)));
  const samples = h('details', { class: 'disclosure', 'data-key': 'samples' }, h('summary', null, 'Fictional sample scenarios (stress cases)'),
    h('p', { class: 'muted small' }, 'Deterministic generated weeks: normal, too few eligible participants (thin), one person out for one period (unavailable), two overlapping periods sharing a group (shared-group), pre-locked slots (locks) and a renamed participant (renamed).'),
    h('div', { class: 'row-actions' }, scen, seed, h('button', { type: 'button', class: 'btn', 'data-action': 'load-sample', on: { click: () => replaceProject(freshExample(scen.value, Number(seed.value)), null, `Loaded sample “${scen.value}” (seed ${seed.value})`) } }, 'Load sample')));

  main.append(h('header', { class: 'page-head' }, h('div', { class: 'page-title' }, h('h1', null, 'Save and restore'), fictionalBadge())),
    h('div', { class: 'panel-grid' }, status, exp, imp, schemeIntakePanel(ctx), reset, settings, templates),
    samples,
    h('p', { class: 'muted small' }, 'Game Plan Lab and Team Hub are not connected. A possible future card exchange is described in FUTURE-HANDOFF-PROPOSAL.md as a proposal only.'));
}
