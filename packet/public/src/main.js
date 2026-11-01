import { mountSchemeControls } from './schemeControls.js';
// Browser wiring: DOM events in, rendered state out. All decisions live in controller.js.
import { EXPORT_LABEL, LOCAL_LABELS, createController } from './controller.js';
import { mount } from './dom.js';
import { serializePacket } from './packet.js';
import { samplePractice } from './sample-practice.js';
import { createPacketStore } from './storage.js';
import { emptyView, viewFor } from './views.js';

const $ = (id) => document.getElementById(id);
const OUTPUT_TITLES = { coach: 'Coach packet', assignment: 'Assignment sheet', identify: 'Identify cards' };

const elements = {
  daySelect: $('day-select'),
  dayHint: $('day-hint'),
  importFile: $('import-file'),
  importText: $('import-text'),
  localStatus: $('status-local'),
  exportStatus: $('status-export'),
  notice: $('notice'),
  preview: $('preview'),
  actions: [$('save-local'), $('export-packet'), $('print-packet')],
  outputs: [...document.querySelectorAll('input[name="output"]')],
};

let shownDaySignature = null;
let shownPreview = null;

function dayChoices(state) {
  if (state.intake) return state.intake.days.map((day) => ({ id: day.id, label: `${day.label} · ${day.plannedMinutes} min` }));
  if (state.packet) return [{ id: state.packet.day.id, label: `${state.packet.day.label} · ${state.packet.day.plannedMinutes} min` }];
  return [];
}

function renderDays(state) {
  const choices = dayChoices(state);
  const signature = JSON.stringify(choices.map((choice) => choice.label));
  if (signature !== shownDaySignature) {
    shownDaySignature = signature;
    const placeholder = new Option('Choose a practice day…', '');
    // Options carry list positions, so source ids never enter the document.
    elements.daySelect.replaceChildren(placeholder, ...choices.map((choice, i) => new Option(choice.label, String(i))));
  }
  const selected = choices.findIndex((choice) => choice.id === state.dayId);
  elements.daySelect.value = selected >= 0 ? String(selected) : '';
  elements.daySelect.disabled = !state.intake;
  elements.dayHint.textContent = state.intake
    ? 'Choose explicitly. No day is picked for you.'
    : state.packet
      ? 'From the opened packet. Import Practice JSON to choose another day.'
      : 'Load the sample or import Practice JSON first.';
}

function renderPreview(state) {
  const key = state.packet ? serializePacket(state.packet) : '';
  if (key === shownPreview) return;
  shownPreview = key;
  elements.preview.replaceChildren(mount(state.packet ? viewFor(state.packet) : emptyView(), document));
}

function render(state) {
  $('example-select').options[0].textContent = state.packet?.teaching ? 'Imported pinned teaching snapshot' : 'Bundled teaching example';
  renderDays(state);
  renderPreview(state);
  for (const radio of elements.outputs) radio.checked = radio.value === state.output;
  for (const action of elements.actions) action.disabled = !state.packet;
  elements.localStatus.textContent = LOCAL_LABELS[state.local];
  elements.localStatus.dataset.state = state.local;
  elements.exportStatus.textContent = state.exportRequested ? EXPORT_LABEL : '';
  elements.exportStatus.hidden = !state.exportRequested;
  elements.notice.textContent = state.notice?.text ?? '';
  elements.notice.dataset.kind = state.notice?.kind ?? 'info';
  document.title = `${OUTPUT_TITLES[state.output]} — FICTIONAL / REFERENCE`;
  // Identify mode mounts learner content only, so no pasted packet may linger either.
  if (state.output === 'identify') elements.importText.value = '';
}

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

const controller = createController({
  store: createPacketStore(() => window.localStorage),
  samplePractice,
  download,
  print: () => window.print(),
  onChange: render,
});

$('load-sample').addEventListener('click', () => controller.loadSample());

elements.importFile.addEventListener('change', () => {
  const [file] = elements.importFile.files;
  // Cleared at once so choosing the same file again retries.
  elements.importFile.value = '';
  controller.importFile(file);
});

$('import-text-button').addEventListener('click', () => {
  if (controller.importText(elements.importText.value)) elements.importText.value = '';
});

elements.daySelect.addEventListener('change', () => {
  const choice = dayChoices(controller.state)[Number(elements.daySelect.value)];
  if (elements.daySelect.value !== '' && choice) controller.chooseDay(choice.id);
  else render(controller.state);
});

for (const radio of elements.outputs) {
  radio.addEventListener('change', () => controller.chooseOutput(radio.value));
}

$('save-local').addEventListener('click', () => controller.save());
$('export-packet').addEventListener('click', () => controller.exportPacket());
$('print-packet').addEventListener('click', () => controller.printPacket());

controller.init();
const schemeHost = document.createElement('section');
document.querySelector('.controls .step').after(schemeHost);
mountSchemeControls(controller, schemeHost);
