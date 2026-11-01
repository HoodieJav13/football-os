// Optional coach controls for version 2 packets. The existing app entry and its v1 controls
// stay as they are; mountSchemeControls(controller) adds this panel beside them.
//
// This panel never holds rules or answers. While Identify is selected it unmounts everything
// but a way back, and the browser print or PDF title stays generic through the same hook.
import { printDocumentTitle } from './packet.js';

/** Live DOM with listeners. The print views stay plain trees built by dom.js. */
function h(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs ?? {})) {
    if (name === 'on') for (const [event, handler] of Object.entries(value)) node.addEventListener(event, handler);
    else if (name === 'class') node.className = value;
    else if (name === 'disabled') node.disabled = Boolean(value);
    else node.setAttribute(name, value);
  }
  node.append(...children.flat(Infinity).filter((child) => child !== null && child !== undefined && child !== false));
  return node;
}

const STATUS_TEXT = {
  current: 'Current: this call matches the newest loaded revision.',
  stale: 'Stale: a newer loaded revision changed this call. This packet keeps its pinned revision.',
  missing: 'Missing: the newest loaded revision no longer has this call.',
  conflict: 'Conflict: this pin disagrees with the loaded package.',
  'not-checked': 'Not checked: load this package file to compare revisions.',
};
const short = (digest) => digest.slice(0, 12);

function replace(host, ...children) {
  host.replaceChildren(...children.flat().filter(Boolean));
}

function dayOptions(intake) {
  return intake.days.flatMap((day) => day.periods.flatMap((period) => (period.schemeRefs ?? []).map((ref) => ({ day, period, ref }))));
}

function previewNode(controller, preview) {
  const held = preview.action === 'held';
  const { summary } = preview;
  return h('section', { class: 'scheme-preview', role: 'status', 'data-scheme-preview': preview.action },
    h('h3', null, `Package preview: ${preview.action}`),
    h('p', null, `${summary.packageId} · revision ${summary.revision} · ${short(summary.contentDigest)} · ${summary.callCount} calls`),
    h('p', null, `Approval claim: ${preview.approvalClaim.status}. Unsigned files do not authenticate anyone.`),
    held ? h('p', null, `Held: missing ${preview.heldAssets.map((asset) => asset.kind).join(', ')}.`) : null,
    preview.conflicts.length ? h('p', null, `Conflict: ${preview.conflicts.map((item) => item.code).join(', ')}. Loading keeps both for this session, and only an exact pin can use either.`) : null,
    h('div', { class: 'scheme-actions' },
      h('button', { type: 'button', 'data-action': 'scheme-confirm', on: { click: () => controller.confirmScheme() } }, held ? 'Close held file' : 'Load for this session'),
      h('button', { type: 'button', 'data-action': 'scheme-cancel', on: { click: () => controller.cancelScheme() } }, 'Cancel')));
}

function pinNodes(controller, state) {
  if (!state.intake) return h('p', null, 'Import a Practice export to choose a pinned period.');
  const options = dayOptions(state.intake);
  if (!options.length) return h('p', null, 'No period in this Practice export has a scheme pin.');
  const loaded = (ref) => state.schemes.some((pkg) => pkg.packageId === ref.packageId && pkg.revision === ref.revision && pkg.contentDigest === ref.contentDigest);
  return h('ul', { class: 'scheme-pins' }, options.map(({ day, period, ref }) => h('li', { 'data-scheme-pin': ref.callId },
    h('span', null, `${day.label} · ${period.title} · revision ${ref.revision} · ${short(ref.callDigest)} · ${loaded(ref) ? 'package loaded' : 'held: load this exact revision'}`),
    h('button', { type: 'button', 'data-action': 'scheme-build', disabled: !loaded(ref), on: { click: () => controller.chooseSchemeCall({ dayId: day.id, periodId: period.id, callId: ref.callId }) } }, 'Build packet from this pin'))));
}

function coachControls(controller, state, file) {
  const { packet } = state;
  const teaching = packet?.teaching ?? null;
  return [
    h('h2', null, 'Scheme package'),
    h('p', null, 'Coach only. Packages load for this session; a built packet keeps its own copy. Learner outputs come from strict projections.'),
    file,
    state.schemePreview ? previewNode(controller, state.schemePreview) : null,
    state.schemes.length ? h('ul', { class: 'scheme-loaded' }, state.schemes.map((pkg) => h('li', null, `${pkg.packageId} · revision ${pkg.revision} · ${short(pkg.contentDigest)} · ${pkg.approval.status}`))) : null,
    pinNodes(controller, state),
    teaching ? h('p', { role: 'status', 'data-teaching-status': state.teachingStatus ?? 'not-checked' }, `Packet pin: revision ${teaching.pin.revision}, ${short(teaching.pin.callDigest)}. ${STATUS_TEXT[state.teachingStatus] ?? STATUS_TEXT['not-checked']}`) : null,
    teaching && state.teachingIntegrity === 'failed' ? h('p', { role: 'alert', 'data-teaching-integrity': 'failed' }, 'This packet failed its digest check. Do not use it.') : null,
  ];
}

export function mountSchemeControls(controller, host = document.createElement('section')) {
  host.className = 'scheme-controls';
  host.setAttribute('aria-label', 'Scheme package controls');
  if (!host.isConnected) (document.querySelector('main') ?? document.body).prepend(host);
  const file = h('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Choose a coach scheme package', 'data-scheme-file': '' });
  file.addEventListener('change', () => {
    const chosen = file.files[0];
    file.value = '';
    if (chosen) controller.importFile(chosen);
  });

  const render = (state) => {
    if (state.packet?.teaching && state.teachingIntegrity === null) controller.verifyTeaching();
    if (state.packet?.output === 'identify') {
      replace(host, h('button', { type: 'button', 'data-action': 'scheme-leave-identify', on: { click: () => controller.chooseOutput('coach') } }, 'Back to coach packet'));
      return;
    }
    replace(host, coachControls(controller, state, file));
  };

  // Print and PDF metadata stay generic, including when print starts from the browser menu.
  let title = document.title;
  window.addEventListener('beforeprint', () => {
    title = document.title;
    document.title = printDocumentTitle(controller.state.packet);
  });
  window.addEventListener('afterprint', () => { document.title = title; });

  const unsubscribe = controller.subscribe(render);
  render(controller.state);
  return unsubscribe;
}
