import assert from 'node:assert/strict';
import { test } from 'node:test';
import { h, mount, svg, viewText } from '../public/src/dom.js';
import { createPacket, readPracticeDocument } from '../public/src/packet.js';
import { JOB_COLORS, identifyField, teachingField } from '../public/src/field.js';
import { projectIdentifyCards } from '../public/src/cover3.js';
import { STAMP_DRAFT, STAMP_REFERENCE, emptyView, viewFor } from '../public/src/views.js';
import { DAY_45, DAY_60, packetFor, practiceDoc } from './helpers.mjs';

function fakeDocument() {
  const element = (tag, namespace = null) => ({
    tag, namespace, attrs: {}, children: [],
    setAttribute(name, value) { this.attrs[name] = value; },
    appendChild(child) { this.children.push(child); },
  });
  return { createElement: (tag) => element(tag), createElementNS: (ns, tag) => element(tag, ns), createTextNode: (text) => ({ text }) };
}

function collect(node, found = []) {
  if (typeof node === 'string') return found;
  found.push(node);
  node.children.forEach((child) => collect(child, found));
  return found;
}

const tags = (view, tag) => collect(view).filter((node) => node.tag === tag);

test('the coach packet holds the whole selected day, teaching example and key', () => {
  const text = viewText(viewFor(packetFor(DAY_60, 'coach')));
  for (const wanted of [
    'Pilot: Coverage & rush', 'Schedule warnings', 'None for this day.', 'Unscheduled shelf', 'Station C · round 3/3',
    '3 parallel stations', 'Drill details', 'Zone drop landmarks', 'Rush-lane integrity', 'Day notes', '3 numbered groups',
    'Provenance', 'Coach key', 'Deep left', 'Right flat', 'rev-3f2f578330f6335e', 'copied snapshot',
    'REFERENCE / FICTIONAL cue (generic)', '3:30 PM–4:30 PM', '1 h scheduled of 1 h planned',
  ]) assert.ok(text.includes(wanted), wanted);
  assert.equal(text.includes('Pilot: Recognize & align'), false);
  assert.equal(text.includes('Formation recognition flash'), false);
});

test('a different day prints its own schedule only', () => {
  const text = viewText(viewFor(packetFor(DAY_45, 'coach')));
  assert.ok(text.includes('Formation recognition flash'));
  assert.equal(text.includes('Station A'), false);
  assert.equal(text.includes('parallel stations'), false);
});

test('stamps appear in every output', () => {
  for (const output of ['coach', 'assignment', 'identify']) {
    const text = viewText(viewFor(packetFor(DAY_60, output)));
    assert.ok(text.includes(STAMP_REFERENCE), output);
    assert.ok(text.includes(STAMP_DRAFT), output);
  }
});

test('warnings and shelf items render', () => {
  const doc = practiceDoc();
  const day = doc.week.days[1];
  day.plannedMinutes = 20;
  day.periods[1].fixedStart = 933;
  day.periods[4].scheduled = false;
  const view = viewFor(createPacket({ intake: readPracticeDocument(doc), dayId: DAY_45 }));
  const text = viewText(view);
  assert.ok(text.includes('overlaps the previous period by 4 min'));
  assert.ok(text.includes('over the planned 20 min'));
  assert.ok(text.includes('fixed start 3:33 PM'));
  const shelf = tags(view, 'li').filter((node) => node.attrs.class === 'period period-shelf');
  assert.equal(shelf.length, 1);
  assert.ok(viewText(shelf[0]).includes('Situations: call-and-check'));
});

test('the assignment sheet has the diagram and legend but no key or schedule', () => {
  const view = viewFor(packetFor(DAY_60, 'assignment'));
  const text = viewText(view);
  assert.ok(text.includes('Cover 3 — teaching example'));
  assert.ok(text.includes('Deep middle'));
  assert.ok(text.includes('10 Personnel · Trips Right Open'));
  assert.ok(text.includes('Revision 3f2f5783'));
  assert.equal(text.includes('Coach key'), false);
  assert.equal(text.includes('Schedule'), false);
  assert.equal(text.includes('Water break'), false);
  assert.equal(tags(view, 'ellipse').length, 7);
  assert.equal(tags(view, 'table').length, 0);
});

test('authored areas are drawn at one scale with yards unchanged', () => {
  const { pack } = packetFor().cover3;
  const field = teachingField(pack);
  const ellipses = tags(field, 'ellipse');
  pack.answers.forEach((answer, i) => {
    assert.equal(ellipses[i].attrs.rx, answer.radiusX);
    assert.equal(ellipses[i].attrs.ry, answer.radiusY);
    assert.equal(ellipses[i].attrs.fill, JOB_COLORS[answer.color].fill);
  });
  const [, , width, height] = field.attrs.viewBox.split(' ').map(Number);
  assert.ok(width >= 54 && height >= 47, 'frame holds the full 38 yard area extent');
  const deepMiddle = ellipses[pack.answers.findIndex((answer) => answer.tag === 'S')];
  assert.ok(deepMiddle.attrs.cy - deepMiddle.attrs.ry >= 0, 'no area is clipped at the top');
  assert.ok(viewText(field).includes('FIELD →'));
});

test('every teaching text label matches its authored source label', () => {
  const text = viewText(teachingField(packetFor().cover3.pack));
  for (const label of ['BC', 'S', 'FC', 'W', 'M', 'B', 'A', 'E', 'T', 'LT', 'LG', 'C', 'RG', 'RT', 'X', 'Y', 'Z', 'F', 'Q', 'H']) {
    assert.ok(text.split(' ').includes(label), label);
  }
});

const FORBIDDEN_LEARNER = [
  'Deep', 'deep', 'hook', 'Hook', 'flat', 'Flat', 'Coach', 'coach', 'Cover', 'packet-cover3', 'rev-', 'Revision',
  'ellipse', 'radius', 'polygon', 'Pilot', 'prj-', 'day-', 'wk-', 'Trips', 'Personnel', 'assignment', 'responsib',
  ...Object.values(JOB_COLORS).flatMap((color) => [color.fill, color.ink]),
];

test('identify cards mount answer-free structure, attributes and ARIA', () => {
  for (const dayId of [DAY_60, DAY_45]) {
    const view = viewFor(packetFor(dayId, 'identify'));
    const serialized = JSON.stringify(view);
    for (const word of FORBIDDEN_LEARNER) assert.equal(serialized.includes(word), false, word);
    assert.equal(tags(view, 'article').length, 7);
    assert.equal(tags(view, 'ellipse').length, 0);
    assert.equal(tags(view, 'title').length, 0);
    assert.equal(tags(view, 'table').length, 0);
    assert.deepEqual(collect(view).filter((node) => node.attrs.id || node.attrs['data-id']), []);
  }
});

test('identify field text is limited to neutral offense labels, direction and the star', () => {
  const cards = projectIdentifyCards(packetFor().cover3.pack);
  const allowed = new Set(['LT', 'LG', 'C', 'RG', 'RT', 'X', 'Y', 'F', 'Z', 'H', 'Q', 'FIELD →', '★']);
  for (const card of cards) {
    const field = identifyField(card.diagram);
    const labels = tags(field, 'text').map((node) => node.children.join(''));
    assert.ok(labels.every((label) => allowed.has(label)), labels.join());
    assert.equal(labels.filter((label) => label === '★').length, 1);
    assert.equal(field.attrs['aria-label'].includes('Deep'), false);
  }
});

test('the identify frame does not vary with authored areas', () => {
  const cards = projectIdentifyCards(packetFor().cover3.pack);
  assert.equal(identifyField(cards[0].diagram).attrs.viewBox, '0 0 57 49');
});

test('mount creates text nodes and never markup from hostile data', () => {
  const doc = practiceDoc();
  const hostile = '<img src=x onerror=alert(1)><script>alert(1)</script>';
  doc.week.days[0].label = hostile.slice(0, 40);
  doc.week.days[0].periods[0].title = hostile;
  doc.week.days[0].periods[0].notes = hostile;
  doc.drills.find((drill) => drill.id === 'drill-zone-drops').steps[0] = hostile;
  const view = viewFor(createPacket({ intake: readPracticeDocument(doc), dayId: DAY_60 }));
  const mounted = mount(view, fakeDocument());
  const created = [];
  const walk = (node) => {
    if (node.tag) created.push(node.tag);
    (node.children ?? []).forEach(walk);
  };
  walk(mounted);
  assert.equal(created.includes('script'), false);
  assert.equal(created.includes('img'), false);
  assert.ok(viewText(view).includes(hostile));
});

test('mount refuses scriptable or inline style attributes', () => {
  const doc = fakeDocument();
  for (const attrs of [{ onclick: 'x' }, { href: 'x' }, { src: 'x' }, { style: 'x' }, { srcdoc: 'x' }, { 'xlink:href': 'x' }]) {
    assert.throws(() => mount(h('div', attrs), doc), /not allowed/);
  }
});

test('mount places SVG in the SVG namespace and omits empty attributes', () => {
  const element = mount(svg('circle', { r: 1, fill: null, hidden: false }), fakeDocument());
  assert.equal(element.namespace, 'http://www.w3.org/2000/svg');
  assert.deepEqual(element.attrs, { r: '1' });
});

test('the empty state names the next step', () => {
  assert.ok(viewText(emptyView()).includes('No packet yet'));
});
