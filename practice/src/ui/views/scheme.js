// Scheme handoff UI. Save tab: preview and confirm a package manifest. Plan tab: bind an exact
// revision to a period, see its status, record observations and export a correction.
import { h } from '../dom.js';
import {
  JOB_TEXT_FIELDS, OBSERVATION_TYPES, RECHECK_STATUSES, STATUS_TEXT, confirmSchemeImport, correctionExportText, pinSchemeCall, previewSchemeImport,
  recordSchemeObservation, replaceSchemeCall, schemeCallChoices, schemeCallName, schemeCallRoles, schemeCallScenarios, schemeRefStatus, setRecheckStatus, unpinSchemeCall,
} from '../../domain/schemeHandoff.js';

const short = (digest) => digest.slice(0, 12);
let ticket = 0;

async function runPreview(ctx, read) {
  const mine = ++ticket;
  const { app } = ctx;
  app.ui.schemePlan = { pending: true };
  ctx.render();
  let plan;
  try {
    const text = await read();
    if (mine !== ticket) return;
    plan = await previewSchemeImport(app.project, text);
  } catch (error) {
    plan = { action: 'rejected', errors: [{ message: `The file could not be read: ${error.message}` }], conflicts: [], heldAssets: [], preservedPins: [] };
  }
  if (mine !== ticket) return;
  app.ui.schemePlan = plan;
  ctx.render();
}

function confirmPlan(ctx, plan, resolution) {
  const { app } = ctx;
  const result = confirmSchemeImport(app.project, plan, { confirmedDigest: plan.manifest?.contentDigest, resolution });
  if (result.changed && !ctx.commit(result.project, { label: `Scheme revision ${result.receipt.revision} imported`, undoable: true })) return;
  ctx.toast(result.receipt.message, { tone: result.ok ? 'info' : 'warn' });
  if (result.ok || result.receipt.reason === 'stale-plan' || result.receipt.status === 'held') {
    app.ui.schemePlan = null;
    ctx.render();
  }
}

function planView(ctx, plan) {
  if (plan.pending) return h('p', { role: 'status' }, 'Checking the file and its digests…');
  const { manifest } = plan;
  const conflict = plan.action === 'conflict';
  return h('div', { class: 'import-result', role: 'status', 'data-scheme-preview': plan.action },
    h('p', null, h('strong', null, `Preview: ${plan.action}`)),
    manifest ? h('p', { class: 'small' }, `${manifest.packageId} · revision ${manifest.revision} · ${short(manifest.contentDigest)} · ${manifest.calls.length} calls`) : null,
    plan.approvalClaim ? h('p', { class: 'small' }, `Approval claim: ${plan.approvalClaim.status}. Unsigned files do not authenticate anyone.`) : null,
    plan.changedCallIds?.length && plan.action !== 'create' ? h('p', { class: 'small' }, `Calls changed from current: ${plan.changedCallIds.length}`) : null,
    plan.preservedPins.length ? h('p', { class: 'small' }, `${plan.preservedPins.length} existing period pin${plan.preservedPins.length === 1 ? '' : 's'} stay on their exact revision.`) : null,
    h('ul', { class: 'form-errors' },
      plan.errors.map((e) => h('li', null, e.message)),
      plan.conflicts.map((c) => h('li', null, `Conflict: ${c.code}`)),
      plan.heldAssets.map((a) => h('li', null, `Held: missing ${a.kind} for ${a.callId}`))),
    h('div', { class: 'row-actions' },
      plan.action === 'rejected' ? null : conflict
        ? [h('button', { type: 'button', class: 'btn', 'data-action': 'scheme-keep-current', on: { click: () => confirmPlan(ctx, plan, 'keep-current') } }, 'Keep current revision'),
            h('button', { type: 'button', class: 'btn', 'data-action': 'scheme-adopt', on: { click: () => confirmPlan(ctx, plan, 'adopt-incoming') } }, 'Use this revision')]
        : h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'scheme-confirm', on: { click: () => confirmPlan(ctx, plan) } }, plan.action === 'noop' ? 'Acknowledge' : plan.action === 'held' ? 'Close held file' : 'Confirm scheme import'),
      h('button', { type: 'button', class: 'btn', 'data-action': 'scheme-cancel', on: { click: () => { ctx.app.ui.schemePlan = null; ctx.render(); } } }, 'Cancel')));
}

export function schemeIntakePanel(ctx) {
  const { app } = ctx;
  const entries = Object.values(app.project.schemeManifests?.packages ?? {});
  const file = h('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Choose a coach scheme package', 'data-scheme-file': '' });
  file.addEventListener('change', () => {
    const chosen = file.files[0];
    file.value = '';
    if (chosen) runPreview(ctx, () => chosen.text());
  });
  return h('section', { class: 'panel', 'aria-label': 'Scheme package', 'data-scheme-panel': '' },
    h('h2', null, 'Scheme package'),
    h('p', { class: 'muted small' }, 'Adds a revision reference from a coach-only Playmaker file. This never replaces your schedule, and Practice keeps ids and digests only: no rules or answer keys.'),
    file,
    app.ui.schemePlan ? planView(ctx, app.ui.schemePlan) : null,
    entries.length ? h('ul', { class: 'small', 'data-scheme-list': '' }, entries.map((entry) => h('li', null, `${entry.packageId}: ${entry.revisions.length} revision${entry.revisions.length === 1 ? '' : 's'}, current ${entry.current.revision} (${short(entry.current.contentDigest)})`))) : h('p', { class: 'muted small' }, 'No scheme revisions imported.'));
}

function observationForm(ctx, day, period, ref) {
  const { app } = ctx;
  const issue = h('textarea', { rows: 2, maxlength: 1000, 'aria-label': 'What was observed', 'data-observation-issue': '' });
  const type = h('select', { 'aria-label': 'Observation type', 'data-observation-type': '' }, OBSERVATION_TYPES.map((value) => h('option', { value, selected: value === 'synthetic-fixture' }, value)));
  const role = h('select', { 'aria-label': 'Role for a proposed change', 'data-observation-role': '' }, h('option', { value: '' }, 'No rule change proposed'), schemeCallRoles(app.project, ref).map((item) => h('option', { value: item.roleId }, `${item.positionLabel} (${item.roleId})`)));
  const fieldName = h('select', { 'aria-label': 'Rule field', 'data-observation-field': '' }, JOB_TEXT_FIELDS.map((value) => h('option', { value }, value)));
  const value = h('input', { type: 'text', maxlength: 500, 'aria-label': 'Proposed wording', 'data-observation-value': '' });
  const scenario = h('select', { 'aria-label': 'Changed-picture scenario', 'data-observation-scenario': '' }, h('option', { value: '' }, 'No changed picture'), schemeCallScenarios(app.project, ref).map((item) => h('option', { value: item.scenarioId }, item.scenarioId)));
  return h('details', { class: 'disclosure', 'data-key': `observe-${period.id}-${ref.callId}-${ref.revision}` },
    h('summary', null, 'Record a practice observation'),
    issue, type, role, fieldName, value, scenario,
    h('div', { class: 'row-actions' }, h('button', { type: 'button', class: 'btn', 'data-action': 'scheme-observe', on: { click: () => {
      try {
        const proposal = role.value ? { roleId: role.value, field: fieldName.value, value: value.value.trim() } : null;
        const { project } = recordSchemeObservation(app.project, { ref, dayId: day.id, periodId: period.id, observedIssue: issue.value.trim(), observationType: type.value, proposedRuleChange: proposal, changedPictureScenarioRef: scenario.value || null }, app.ids);
        ctx.commit(project, { label: 'Observation recorded' });
      } catch (error) { ctx.toast(error.message, { tone: 'warn' }); }
    } } }, 'Save observation')));
}

function pinRow(ctx, day, period, ref) {
  const { app } = ctx;
  const status = schemeRefStatus(app.project, ref);
  const newest = status === 'stale' ? schemeCallChoices(app.project).find((choice) => choice.ref.packageId === ref.packageId && choice.ref.callId === ref.callId && choice.label.endsWith('(current)')) : null;
  return h('li', { 'data-scheme-pin': ref.callId, 'data-scheme-status': status },
    h('p', null, h('strong', null, schemeCallName(app.project, ref)), ` · revision ${ref.revision} · ${short(ref.contentDigest)} · `, h('span', { class: status === 'current' ? '' : 'warn-text' }, STATUS_TEXT[status])),
    h('div', { class: 'row-actions' },
      newest ? h('button', { type: 'button', class: 'btn btn-small', 'data-action': 'scheme-replace', on: { click: () => ctx.commit(replaceSchemeCall(app.project, day.id, period.id, ref, newest.ref), { label: 'Scheme pin replaced', undoable: true }) } }, 'Replace with current revision') : null,
      h('button', { type: 'button', class: 'btn btn-small btn-danger-quiet', 'data-action': 'scheme-unpin', on: { click: () => ctx.commit(unpinSchemeCall(app.project, day.id, period.id, ref), { label: 'Scheme pin removed', undoable: true }) } }, 'Remove')),
    observationForm(ctx, day, period, ref));
}

function periodRow(ctx, day, period, choices) {
  const { app } = ctx;
  const select = h('select', { 'aria-label': `Scheme call for ${period.title}`, 'data-scheme-select': '' }, h('option', { value: '' }, 'Choose a call revision'), choices.map((choice, i) => h('option', { value: String(i) }, choice.label)));
  return h('li', { 'data-scheme-period': period.id },
    h('h3', null, period.title),
    h('ul', null, (period.schemeRefs ?? []).map((ref) => pinRow(ctx, day, period, ref))),
    choices.length ? h('div', { class: 'row-actions' }, select, h('button', { type: 'button', class: 'btn btn-small', 'data-action': 'scheme-pin', on: { click: () => {
      const choice = choices[Number(select.value)];
      if (select.value === '' || !choice) return ctx.toast('Choose a call revision first.', { tone: 'warn' });
      try { return ctx.commit(pinSchemeCall(app.project, day.id, period.id, choice.ref), { label: 'Scheme call pinned' }); } catch (error) { return ctx.toast(error.message, { tone: 'warn' }); }
    } } }, 'Pin to this period')) : null);
}

function observationRow(ctx, item) {
  const { app } = ctx;
  const status = h('select', { 'aria-label': 'Recheck status', 'data-recheck-status': '' }, RECHECK_STATUSES.map((value) => h('option', { value, selected: value === item.recheckStatus }, value)));
  const note = h('input', { type: 'text', maxlength: 500, value: item.fieldNote ?? '', 'aria-label': 'Field note', placeholder: 'Coach note from practice (needed for field-observed)', 'data-recheck-note': '' });
  return h('li', { 'data-observation': item.correctionId },
    h('p', null, item.observedIssue),
    h('p', { class: 'muted small' }, `Revision ${item.originatingRevision} · ${item.observationType} · ${item.recheckStatus}`),
    h('div', { class: 'row-actions' }, status, note,
      h('button', { type: 'button', class: 'btn btn-small', 'data-action': 'recheck-save', on: { click: () => {
        try { ctx.commit(setRecheckStatus(app.project, item.correctionId, status.value, { fieldNote: note.value.trim() }), { label: 'Recheck status saved' }); } catch (error) { ctx.toast(error.message, { tone: 'warn' }); }
      } } }, 'Save status'),
      h('button', { type: 'button', class: 'btn btn-small', 'data-action': 'correction-export', on: { click: () => {
        ctx.downloadExport(correctionExportText(app.project, item.correctionId), `scheme-correction-${item.correctionId}.json`);
        ctx.toast('Export requested. Check your downloads; a download request is not proof the file was saved.');
      } } }, 'Export correction')));
}

export function schemePeriodPanel(ctx, day) {
  const { app } = ctx;
  if (!day) return null;
  const choices = schemeCallChoices(app.project);
  const observations = (app.project.schemeObservations ?? []).filter((item) => item.practicePeriodRef.dayId === day.id);
  const pinned = day.periods.some((period) => period.schemeRefs?.length);
  if (!choices.length && !pinned && !observations.length) return null;
  return h('details', { class: 'disclosure', 'data-key': 'scheme-calls', 'data-scheme-day': day.id },
    h('summary', null, 'Scheme calls for this day'),
    h('p', { class: 'muted small' }, 'Each pin names one exact revision. Importing a newer revision never moves a pin; replacing one is your choice.'),
    h('ul', null, day.periods.map((period) => periodRow(ctx, day, period, choices))),
    observations.length ? [h('h3', null, 'Observations and rechecks'), h('ul', null, observations.map((item) => observationRow(ctx, item)))] : null);
}
