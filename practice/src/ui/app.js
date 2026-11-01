// App shell: store, autosave, tab guard, clock persistence, routing.
// Rendering lives in views/*; domain logic lives in src/domain (pure).
import { h, clear } from './dom.js';
import { createStorage, KEYS } from '../persist/storage.js';
import { validateProject, exportProject, importProject, pruneReferences, validateClockFor } from '../domain/project.js';
import { printFitError } from '../domain/cards.js';
import { generateFixture } from '../domain/fixtures.js';
import { createIdFactory } from '../domain/ids.js';
import { createHistory, pushHistory, undoHistory, peekHistory } from '../domain/history.js';
import { evaluateLease, makeLease, planWrite, LEASE_HEARTBEAT_MS } from '../domain/guard.js';
import { applyAction, createSession, recoverSession, serializeSession, isLikelyDoubleTap, clockForProject } from '../domain/clock.js';
import { mono, wall, TEST_MODE } from './timesource.js';
import { renderPlan } from './views/plan.js';
import { renderRotation } from './views/rotation.js';
import { renderCards, renderCardEditor } from './views/cards.js';
import { renderRun, tickRun, showRunMessage } from './views/run.js';
import { renderData } from './views/data.js';
import { renderPrint, renderPrintInto } from './views/print.js';

const ids = createIdFactory();
const instanceId = ids('inst');
const storage = createStorage(() => globalThis.localStorage);
const CHECKPOINT_MS = 5000;

export const app = {
  instanceId,
  ids,
  library: null,
  project: null,
  clock: null,
  history: createHistory(30),
  mode: 'writer', // 'writer' | 'read-only' | 'conflict'
  conflictReason: null,
  save: { state: 'saved', error: null }, // derived by refreshSaveState()
  saveErrors: { project: null, clock: null },
  lastSavedProjectRev: null, // stored meta revision this tab last saw (the write guard's base)
  dirty: false, // true only after a real edit, until it is saved or replaced by a load
  lastSavedClockRev: null,
  savedInvalid: null,
  route: { name: 'plan', id: null },
  ui: { selectedDayId: null, rotationDayId: null, runDayId: null, runCompact: false, editing: null, cardDraft: null },
};

export const env = () => ({ mono: mono(), wall: wall(), instanceId });

// ---------------------------------------------------------------- toasts / dialogs
const live = () => document.getElementById('toasts');

export function toast(message, { action, tone = 'info', timeout = 7000 } = {}) {
  // On the Run page a message sits in the page next to the controls it is about
  // (never floating over them); other pages keep the floating stack.
  if (['run', 'assist'].includes(document.body.dataset.route) && showRunMessage({ message, action, tone, timeout })) return null;
  const el = h('div', { class: `toast toast-${tone}`, role: tone === 'error' ? 'alert' : 'status' },
    h('span', { class: 'toast-text' }, message),
    action ? h('button', { type: 'button', class: 'btn btn-small', on: { click: () => { el.remove(); action.run(); } } }, action.label) : null,
    h('button', { type: 'button', class: 'btn btn-small btn-quiet', 'aria-label': 'Dismiss message', on: { click: () => el.remove() } }, '✕'));
  live().appendChild(el);
  const max = window.matchMedia('(max-width: 719px)').matches ? 2 : 3;
  while (live().children.length > max) live().firstChild.remove();
  if (timeout) setTimeout(() => el.remove(), timeout);
  return el;
}

// Promise-based confirm on the shared <dialog>; resolves true/false.
export function confirmDialog({ title, body, confirmLabel, cancelLabel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const dlg = document.getElementById('confirm');
    clear(dlg);
    const done = (v) => { dlg.close(); resolve(v); };
    dlg.append(
      h('form', { method: 'dialog', class: 'confirm-body', on: { submit: (e) => { e.preventDefault(); done(true); } } },
        h('h2', { id: 'confirm-title' }, title),
        body ? h('p', null, body) : null,
        h('div', { class: 'row-actions' },
          h('button', { type: 'button', class: 'btn', 'data-confirm': 'cancel', on: { click: () => done(false) } }, cancelLabel),
          h('button', { type: 'submit', class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, 'data-confirm': 'ok' }, confirmLabel))));
    dlg.setAttribute('aria-labelledby', 'confirm-title');
    dlg.onclose = () => resolve(false);
    dlg.oncancel = () => resolve(false);
    dlg.showModal();
    dlg.querySelector('[data-confirm="cancel"]').focus();
  });
}

// ---------------------------------------------------------------- writes
// Unreadable saved data blocks every write until the coach exports or replaces it.
export const canWrite = () => app.mode === 'writer' && !app.savedInvalid;

function refuseWrite() {
  const msg = app.savedInvalid
    ? 'The saved plan could not be read. Export it or replace it from the banner before editing.'
    : app.mode === 'read-only' ? 'This tab is read-only because the plan is open in another tab. Use “Take over here” to edit.' : 'Resolve the save conflict first (see the banner).';
  toast(msg, { tone: 'warn' });
  return false;
}

// Save status is derived, so one successful write can never hide another's failure.
function refreshSaveState() {
  const errs = [app.saveErrors.project, app.saveErrors.clock].filter(Boolean);
  let state = 'saved';
  if (app.mode === 'read-only') state = 'read-only';
  else if (app.mode === 'conflict' || app.savedInvalid) state = 'conflict';
  else if (errs.length) state = 'error';
  else if (app.dirty) state = 'unsaved';
  app.save = { state, error: errs.length ? [...new Set(errs)].join(' ') : null };
  renderSaveState();
}

// Commit a new project state. `undoable` records the previous state for Undo.
export function commit(next, { label = 'Change', undoable = false, quiet = false } = {}) {
  if (!canWrite()) return refuseWrite();
  if (undoable) app.history = pushHistory(app.history, app.project, label);
  app.project = { ...next, project: { ...next.project, rev: app.project.project.rev + 1 } };
  app.dirty = true;
  scheduleSave();
  render();
  if (undoable && !quiet) toast(`${label}.`, { action: { label: 'Undo', run: undo } });
  return true;
}

export function undo() {
  if (!canWrite()) return refuseWrite();
  const u = undoHistory(app.history);
  if (!u) {
    toast('Nothing to undo.');
    return false;
  }
  app.history = u.history;
  app.project = { ...u.snapshot, project: { ...u.snapshot.project, rev: app.project.project.rev + 1 } };
  app.dirty = true;
  scheduleSave();
  render();
  toast(`Undone: ${u.label}.`);
  return true;
}

export const undoLabel = () => peekHistory(app.history);

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveProjectNow, 400);
  refreshSaveState();
}

function readMeta() {
  const r = storage.read(KEYS.meta);
  return r.ok ? { ok: true, meta: r.value || {} } : { ok: false, error: r.error };
}

function decide(storedRev, baseRev) {
  const lease = storage.read(KEYS.lease);
  return planWrite({ lease: lease.ok ? lease.value : null, myId: instanceId, now: wall(), storedRev, baseRev });
}

export function saveProjectNow() {
  clearTimeout(saveTimer);
  if (!canWrite()) return;
  const m = readMeta();
  if (!m.ok) return setSaveError('project', m.error);
  const d = decide(m.meta.projectRev ?? null, app.lastSavedProjectRev);
  if (!d.allowed) return d.reason === 'read-only' ? enterReadOnly() : enterConflict('Another tab saved a newer version of this plan.');
  const w = storage.write(KEYS.project, app.project);
  if (!w.ok) return setSaveError('project', w.error);
  const w2 = storage.write(KEYS.meta, { ...m.meta, projectRev: app.project.project.rev, savedBy: instanceId, savedAt: wall() });
  if (!w2.ok) return setSaveError('project', w2.error);
  app.lastSavedProjectRev = app.project.project.rev;
  app.dirty = false;
  clearSaveError('project');
}

function setSaveError(kind, error) {
  app.saveErrors[kind] = error;
  refreshSaveState();
  renderBanners();
}

function clearSaveError(kind) {
  const had = !!app.saveErrors[kind];
  app.saveErrors[kind] = null;
  refreshSaveState();
  if (had) renderBanners();
}

// ---------------------------------------------------------------- clock writes
export function clockAction(type, extra = {}, expectRev) {
  if (!canWrite()) return refuseWrite();
  if (!app.clock) return false;
  if (isLikelyDoubleTap(app.clock, { type }, env())) {
    toast('Ignored a second tap less than a second after the last one.', { tone: 'warn' });
    return false;
  }
  const r = applyAction(app.clock, { type, rev: expectRev ?? app.clock.rev, ...extra }, env());
  if (!r.ok) {
    // A tap on a button drawn before the last change: say so plainly.
    toast(/^Stale action/.test(r.error) ? 'That tap was for an older version of the clock. Nothing changed; try again.' : r.error, { tone: 'warn' });
    return false;
  }
  app.clock = r.session;
  saveClockNow();
  render();
  return true;
}

export function startSessionForDay(dayId) {
  if (!canWrite()) return refuseWrite();
  const day = app.project.week.days.find((d) => d.id === dayId);
  if (!day) return false;
  app.clock = createSession({ id: ids('clk'), day });
  app.clockSetAside = null;
  saveClockNow();
  return true;
}

export function saveClockNow() {
  if (!canWrite()) return;
  const m = readMeta();
  if (!m.ok) return setSaveError('clock', m.error);
  const d = decide(m.meta.clockRev ?? null, app.lastSavedClockRev);
  if (!d.allowed) return d.reason === 'read-only' ? enterReadOnly() : enterConflict('Another tab changed the practice clock.');
  const w = storage.write(KEYS.clock, app.clock ? serializeSession(app.clock, env()) : null);
  if (!w.ok) return setSaveError('clock', w.error);
  const w2 = storage.write(KEYS.meta, { ...m.meta, clockRev: app.clock ? app.clock.rev : null, savedBy: instanceId, savedAt: wall() });
  if (!w2.ok) return setSaveError('clock', w2.error);
  app.lastSavedClockRev = app.clock ? app.clock.rev : null;
  clearSaveError('clock');
}

// Checkpoint the live clock (no new revision) only if nobody else changed it.
function checkpointClock() {
  if (!app.clock || !canWrite()) return;
  const m = readMeta();
  if (!m.ok) return setSaveError('clock', m.error);
  const d = decide(m.meta.clockRev ?? null, app.lastSavedClockRev);
  if (!d.allowed) return;
  const w = storage.write(KEYS.clock, serializeSession(app.clock, env()));
  if (!w.ok) setSaveError('clock', w.error);
  else if (app.saveErrors.clock) clearSaveError('clock');
}

// ---------------------------------------------------------------- competing tabs
function holdLease() {
  return storage.write(KEYS.lease, makeLease(instanceId, wall())).ok;
}

function enterReadOnly() {
  if (app.mode === 'read-only') return;
  if (app.dirty) return enterConflict('Another tab took over while this tab had unsaved changes.');
  app.mode = 'read-only';
  loadFromStorage();
  refreshSaveState();
  clear(live());
  render();
}

function enterConflict(reason) {
  app.mode = 'conflict';
  app.conflictReason = reason;
  refreshSaveState();
  render();
}

// Taking over or reloading only proceeds when the saved plan can be read;
// otherwise the tab stays in conflict and nothing is overwritten.
function stayBlockedIfUnreadable(readable) {
  if (readable) return false;
  app.mode = 'conflict';
  app.savedInvalid = app.savedInvalid || 'the saved plan could not be read';
  app.conflictReason = 'The saved plan is unreadable.';
  refreshSaveState();
  toast('The saved plan could not be read, so nothing was changed. Export it or replace it from the banner.', { tone: 'warn' });
  render();
  return true;
}

export function takeOver() {
  if (!holdLease()) {
    toast('Could not take over: browser storage is unavailable.', { tone: 'error' });
    return;
  }
  clear(live());
  if (stayBlockedIfUnreadable(loadFromStorage())) return;
  app.mode = 'writer';
  app.conflictReason = null;
  app.savedInvalid = null;
  if (app.clock) saveClockNow();
  refreshSaveState();
  toast('This tab now edits the plan. The other tab became read-only.');
  render();
}

export function loadSavedVersion() {
  clear(live());
  if (stayBlockedIfUnreadable(loadFromStorage())) return;
  const lease = storage.read(KEYS.lease);
  app.mode = evaluateLease(lease.ok ? lease.value : null, instanceId, wall()) === 'other' ? 'read-only' : 'writer';
  if (app.mode === 'writer') holdLease();
  app.conflictReason = null;
  app.savedInvalid = null;
  refreshSaveState();
  render();
}

// Returns false when saved data exists but cannot be read or validated.
function loadFromStorage() {
  const p = storage.read(KEYS.project);
  let readable = p.ok;
  if (p.ok && p.value) {
    if (validateProject(p.value, { legacyPrintFit: 'flag' }).errors.length === 0) {
      app.project = p.value;
      app.dirty = false;
    } else readable = false;
  }
  const c = storage.read(KEYS.clock);
  if (c.ok) app.clock = loadClock(c.value);
  const m = readMeta();
  if (m.ok) {
    app.lastSavedProjectRev = m.meta.projectRev ?? null;
    app.lastSavedClockRev = m.meta.clockRev ?? null;
  }
  fixSelections();
  return readable;
}

// A saved clock is validated like an import (F3). One that fails is left in
// storage untouched and reported; it is never half-loaded.
function loadClock(saved) {
  app.clockSetAside = null;
  if (!saved) return null;
  const errs = validateClockFor(app.project, saved);
  if (errs.length) {
    app.clockSetAside = `${errs.length} problem${errs.length === 1 ? '' : 's'}, first: ${errs[0].path} — ${errs[0].message}`;
    return null;
  }
  return recoverSession(saved, env()).session;
}

function heartbeat() {
  if (app.mode !== 'writer') return;
  const lease = storage.read(KEYS.lease);
  if (lease.ok && evaluateLease(lease.value, instanceId, wall()) === 'other') return enterReadOnly();
  holdLease();
}

function onStorage(e) {
  if (e.key === KEYS.lease && app.mode === 'writer') {
    const lease = storage.read(KEYS.lease);
    if (lease.ok && evaluateLease(lease.value, instanceId, wall()) === 'other') enterReadOnly();
    return;
  }
  if ((e.key === KEYS.meta || e.key === KEYS.project || e.key === KEYS.clock) && app.mode === 'read-only') {
    loadFromStorage();
    render();
  }
}

// ---------------------------------------------------------------- project helpers
// A clock whose day was deleted is left out of the export (it stays in memory for undo).
export function exportText() {
  const c = clockForProject(app.project, app.clock);
  return exportProject(app.project, c ? serializeSession(c, env()) : null);
}

export function downloadExport(text = exportText(), name) {
  const day = new Date(wall()).toISOString().slice(0, 10);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name || `practice-week-planner-FICTIONAL-${day}-rev${app.project.project.rev}.json` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function replaceProject(project, clock, label) {
  if (!canWrite()) return refuseWrite();
  app.history = pushHistory(app.history, app.project, label);
  const prevClock = app.clock;
  app.project = { ...project, project: { ...project.project, rev: app.project.project.rev + 1 } };
  app.dirty = true;
  app.clock = clock ? recoverSession(clock, env()).session : null;
  fixSelections();
  scheduleSave();
  saveClockNow();
  render();
  toast(`${label}.`, {
    action: { label: 'Undo', run: () => { undo(); app.clock = prevClock; saveClockNow(); render(); } },
  });
  return true;
}

export function importFromText(text) {
  const r = importProject(text);
  if (!r.ok) return r;
  if (!replaceProject(r.project, r.clock, 'Imported project')) {
    return { ok: false, errors: [{ path: '', message: 'This tab cannot change the plan right now (read-only, save conflict or unreadable saved data). Nothing was imported.' }], warnings: [] };
  }
  return r;
}

export function freshExample(scenario = 'example', seed = 42) {
  return generateFixture({ seed, scenario, library: app.library });
}

export function prune(p) {
  return pruneReferences(p);
}

function fixSelections() {
  const days = app.project?.week.days || [];
  const has = (id) => days.some((d) => d.id === id);
  if (!has(app.ui.selectedDayId)) app.ui.selectedDayId = days[0]?.id ?? null;
  if (!has(app.ui.rotationDayId)) app.ui.rotationDayId = app.ui.selectedDayId;
  if (!has(app.ui.runDayId)) app.ui.runDayId = app.clock && has(app.clock.dayId) ? app.clock.dayId : app.ui.selectedDayId;
}

// ---------------------------------------------------------------- routing
const NAV = [
  { name: 'plan', label: 'Plan', icon: '▤' },
  { name: 'rotation', label: 'Rotation', icon: '⇄' },
  { name: 'cards', label: 'Cards', icon: '◫' },
  { name: 'run', label: 'Run', icon: '◷' },
  { name: 'data', label: 'Save', icon: '⤓' },
];

function parseRoute() {
  const parts = (location.hash || '#/plan').replace(/^#\/?/, '').split('/').filter(Boolean);
  const [name = 'plan', a = null, b = null] = parts.map(decodeURIComponent);
  return { name, id: a, sub: b };
}

export function navigate(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

let lastRouteKey = null;
export function render() {
  if (!app.project) return;
  app.route = parseRoute();
  fixSelections();
  const { name, id } = app.route;
  if (name === 'plan' && id) app.ui.selectedDayId = id;
  if (name === 'rotation' && id) app.ui.rotationDayId = id;
  if ((name === 'run' || name === 'assist') && id) app.ui.runDayId = id;
  renderHeader();
  renderBanners();
  const main = document.getElementById('view');
  const routeKey = `${name}/${id}`;
  const keepScroll = routeKey === lastRouteKey ? window.scrollY : 0;
  const openKeys = routeKey === lastRouteKey ? new Set([...main.querySelectorAll('details[data-key]')].filter((d) => d.open).map((d) => d.dataset.key)) : new Set();
  const focusKey = app.ui.pendingFocus || document.activeElement?.getAttribute?.('data-focus');
  app.ui.pendingFocus = null;
  clear(main);
  document.body.dataset.route = name;
  const ctx = { app, commit, undo, toast, confirmDialog, navigate, canWrite, clockAction, startSessionForDay, saveClockNow, ids, env, render, downloadExport };
  if (name === 'print') renderPrint(main, ctx);
  else if (name === 'rotation') renderRotation(main, ctx);
  else if (name === 'cards') renderCards(main, ctx);
  else if (name === 'card') renderCardEditor(main, ctx);
  else if (name === 'run' || name === 'assist') renderRun(main, ctx, { compact: name === 'assist' });
  else if (name === 'data') renderData(main, ctx);
  else renderPlan(main, ctx);
  for (const d of main.querySelectorAll('details[data-key]')) if (openKeys.has(d.dataset.key)) d.open = true;
  if (routeKey !== lastRouteKey) {
    window.scrollTo(0, 0);
    const h1 = main.querySelector('h1');
    if (h1 && lastRouteKey !== null) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
  } else {
    window.scrollTo(0, keepScroll);
  }
  if (focusKey) {
    const el = main.querySelector(`[data-focus="${CSS.escape(focusKey)}"]`);
    if (el && !el.disabled) el.focus({ preventScroll: true });
  }
  lastRouteKey = routeKey;
  document.getElementById('app').dataset.ready = 'true';
}

function renderHeader() {
  const nav = document.getElementById('nav');
  clear(nav);
  const active = app.route.name === 'card' ? 'cards' : app.route.name === 'assist' ? 'run' : app.route.name;
  for (const n of NAV) {
    const dayPart = ['plan', 'rotation'].includes(n.name) ? `/${encodeURIComponent(n.name === 'plan' ? app.ui.selectedDayId || '' : app.ui.rotationDayId || '')}` : n.name === 'run' ? `/${encodeURIComponent(app.ui.runDayId || '')}` : '';
    nav.appendChild(h('a', { href: `#/${n.name}${dayPart}`, class: `nav-link${active === n.name ? ' is-active' : ''}`, 'aria-current': active === n.name ? 'page' : null },
      h('span', { class: 'nav-icon', 'aria-hidden': 'true' }, n.icon), h('span', { class: 'nav-label' }, n.label)));
  }
  const meta = document.getElementById('project-meta');
  clear(meta);
  meta.append(h('span', { class: 'meta-opponent' }, app.project.week.opponentLabel), h('span', { class: 'meta-rev' }, `rev ${app.project.project.rev}`));
  renderSaveState();
}

const SAVE_TEXT = {
  saved: ['✓', 'Saved'],
  unsaved: ['•', 'Unsaved changes'],
  error: ['!', 'Not saved'],
  'read-only': ['◐', 'Read-only'],
  conflict: ['!', 'Save conflict'],
};

export function saveStateDescription(save) {
  const labels = { saved: '✓ Saved in this browser', unsaved: '• Unsaved changes (saving shortly)', error: `! Not saved: ${save.error}`, 'read-only': '◐ Read-only in this tab', conflict: '! Save conflict — see the banner' };
  return labels[save.state] || '';
}

function renderSaveState() {
  const el = document.getElementById('save-state');
  if (!el) return;
  const [icon, text] = SAVE_TEXT[app.save.state] || SAVE_TEXT.saved;
  clear(el);
  el.dataset.state = app.save.state;
  el.append(h('span', { 'aria-hidden': 'true', class: 'save-icon' }, icon), h('span', null, text));
  el.title = app.save.error || text;
  const line = document.querySelector('[data-save-line]');
  if (line) line.textContent = saveStateDescription(app.save);
}

function renderBanners() {
  const box = document.getElementById('banners');
  clear(box);
  if (app.savedInvalid) {
    box.append(h('div', { class: 'banner banner-error', role: 'alert' },
      h('p', null, h('strong', null, 'Saved data could not be loaded. '), `It was left in browser storage untouched (${app.savedInvalid}). This tab shows the fictional example and will not save over it.`),
      h('div', { class: 'row-actions' },
        h('button', { type: 'button', class: 'btn', on: { click: exportRawSaved } }, 'Export the saved data'),
        h('button', { type: 'button', class: 'btn btn-danger', on: { click: replaceInvalidSaved } }, 'Replace saved data with this example'))));
  }
  const longCards = (app.project?.cards || []).filter((c) => printFitError(c));
  if (longCards.length) {
    box.append(h('div', { class: 'banner banner-warn banner-compact', role: 'status', 'data-banner': 'long-cards' },
      h('p', null, h('strong', null, `${longCards.length} card${longCards.length === 1 ? ' is' : 's are'} too long to print four to a page `), '(saved by an older version). They are kept unchanged and print on their own page, or are listed as not printed, until shortened. Exports that include them cannot be re-imported until then.'),
      h('div', { class: 'row-actions' }, h('a', { class: 'btn', href: `#/card/${encodeURIComponent(longCards[0].id)}` }, 'Open the first one'))));
  }
  if (app.clockSetAside && !app.clock) {
    box.append(h('div', { class: 'banner banner-warn banner-compact', role: 'status', 'data-banner': 'clock-set-aside' },
      h('p', null, h('strong', null, 'A saved practice clock could not be read. '), `It was left in storage untouched (${app.clockSetAside}). Setting up a new clock replaces it.`)));
  }
  if (app.mode === 'read-only') {
    box.append(h('div', { class: 'banner banner-info banner-compact', role: 'status', 'data-banner': 'read-only' },
      h('p', null, h('strong', null, 'Read-only. '), 'Another tab is editing; this tab follows its changes.'),
      h('div', { class: 'row-actions' }, h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'take-over', on: { click: takeOver } }, 'Take over here'))));
  }
  // Unreadable saved data has its own banner and actions; loading it again cannot help.
  if (app.mode === 'conflict' && !app.savedInvalid) {
    box.append(h('div', { class: 'banner banner-error', role: 'alert', 'data-banner': 'conflict' },
      h('p', null, h('strong', null, 'Save conflict. '), `${app.conflictReason || 'The saved plan changed elsewhere.'} Nothing was overwritten. Export this tab’s copy if you need it, then load the saved version.`),
      h('div', { class: 'row-actions' },
        h('button', { type: 'button', class: 'btn', 'data-action': 'export-mine', on: { click: () => { downloadExport(); toast('Export requested for this tab’s copy. Check your downloads; a download request is not proof the file was saved.'); } } }, 'Export this tab’s copy'),
        h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'load-saved', on: { click: loadSavedVersion } }, 'Load the saved version'))));
  }
  if (app.save.state === 'error') {
    box.append(h('div', { class: 'banner banner-error', role: 'alert', 'data-banner': 'storage-error' },
      h('p', null, h('strong', null, 'Not saved. '), `${app.save.error} Your changes are still here in this tab; export to keep a copy.`),
      h('div', { class: 'row-actions' },
        h('button', { type: 'button', class: 'btn', on: { click: () => { saveProjectNow(); if (app.clock) saveClockNow(); } } }, 'Try saving again'),
        h('button', { type: 'button', class: 'btn', on: { click: () => { downloadExport(); toast('Export requested. Check your downloads; a download request is not proof the file was saved.'); } } }, 'Export a copy'))));
  }
}

function exportRawSaved() {
  try {
    const raw = globalThis.localStorage.getItem(KEYS.project) || '';
    downloadExport(raw, 'practice-week-planner-unreadable-saved-data.json');
    toast('Export requested. Check your downloads; a download request is not proof the file was saved.');
  } catch (e) {
    toast(`Could not read storage: ${e.message}`, { tone: 'error' });
  }
}

async function replaceInvalidSaved() {
  const ok = await confirmDialog({ title: 'Replace the saved data?', body: 'The unreadable saved data will be overwritten by this fictional example. Export it first if you might need it.', confirmLabel: 'Replace saved data', danger: true });
  if (!ok) return;
  app.savedInvalid = null;
  app.mode = 'writer';
  holdLease();
  app.lastSavedProjectRev = readMeta().meta?.projectRev ?? null;
  saveProjectNow();
  render();
}

// ---------------------------------------------------------------- clock loop
let lastCheckpoint = 0;
function clockLoop() {
  if (app.clock && app.clock.state === 'running' && canWrite()) {
    const t = mono();
    if (t - lastCheckpoint >= CHECKPOINT_MS) {
      lastCheckpoint = t;
      checkpointClock();
    }
  }
  if (app.route.name === 'run' || app.route.name === 'assist') tickRun();
}

// ---------------------------------------------------------------- boot
async function boot() {
  const root = document.getElementById('app');
  try {
    const res = await fetch('content/library.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    app.library = await res.json();
  } catch (e) {
    clear(document.getElementById('view')).append(h('div', { class: 'banner banner-error', role: 'alert' }, h('p', null, `The fictional content library could not be loaded (${e.message}). Start the app with “node server.mjs” and open it from that address.`)));
    root.dataset.ready = 'error';
    return;
  }

  const lease = storage.read(KEYS.lease);
  const leaseState = lease.ok ? evaluateLease(lease.value, instanceId, wall()) : 'free';
  app.mode = leaseState === 'other' ? 'read-only' : 'writer';

  const saved = storage.read(KEYS.project);
  if (!saved.ok) {
    app.project = freshExample();
    if (/corrupt/i.test(saved.error)) {
      app.savedInvalid = saved.error;
      app.mode = 'conflict';
      app.conflictReason = 'The saved plan is unreadable.';
    } else {
      app.saveErrors.project = saved.error;
    }
  } else if (saved.value) {
    // Cards saved by an older version that are too long to print four-up are
    // flagged, not blocking (F2); every other rule still applies.
    const v = validateProject(saved.value, { legacyPrintFit: 'flag' });
    if (v.errors.length) {
      app.project = freshExample();
      app.savedInvalid = `${v.errors.length} problem${v.errors.length === 1 ? '' : 's'}, first: ${v.errors[0].path} ${v.errors[0].message}`;
      app.mode = 'conflict';
      app.conflictReason = 'The saved plan did not pass validation.';
    } else {
      app.project = saved.value;
      app.lastSavedProjectRev = saved.value.project.rev;
    }
  } else {
    app.project = freshExample();
  }

  const savedClock = storage.read(KEYS.clock);
  if (savedClock.ok && savedClock.value && !app.savedInvalid) app.clock = loadClock(savedClock.value);
  // Saves compare against the stored meta revisions, so the bases come from there.
  const m = readMeta();
  if (m.ok) {
    app.lastSavedProjectRev = m.meta.projectRev ?? null;
    app.lastSavedClockRev = m.meta.clockRev ?? null;
  }

  if (app.mode === 'writer') {
    holdLease();
    if (app.lastSavedProjectRev === null && !app.saveErrors.project) saveProjectNow();
    if (app.clock) saveClockNow();
  }
  refreshSaveState();

  fixSelections();
  window.addEventListener('hashchange', render);
  window.addEventListener('storage', onStorage);
  // The print route already holds its paginated sheets; other views print what they show.
  window.addEventListener('beforeprint', () => { if (app.route.name !== 'print') renderPrintInto(document.getElementById('print-root'), { app }); });
  window.addEventListener('afterprint', () => { if (app.route.name !== 'print') clear(document.getElementById('print-root')); });
  window.addEventListener('pagehide', () => {
    if (!canWrite()) return;
    checkpointClock();
    if (app.dirty) saveProjectNow();
    // Hand the writer lease back so a new tab does not open read-only.
    const lease = storage.read(KEYS.lease);
    if (lease.ok && evaluateLease(lease.value, instanceId, wall()) === 'mine') storage.remove(KEYS.lease);
  });
  setInterval(heartbeat, LEASE_HEARTBEAT_MS);
  setInterval(clockLoop, 200);
  render();
}

if (TEST_MODE) {
  globalThis.__pwpDebug = {
    state: () => ({ mode: app.mode, save: app.save, dirty: app.dirty, projectRev: app.project?.project.rev, lastSavedProjectRev: app.lastSavedProjectRev, lastSavedClockRev: app.lastSavedClockRev, conflictReason: app.conflictReason, savedInvalid: app.savedInvalid, clockRev: app.clock?.rev ?? null, clockState: app.clock?.state ?? null, instanceId }),
    project: () => structuredClone(app.project),
    clock: () => structuredClone(app.clock),
    exportText,
  };
}

boot();
