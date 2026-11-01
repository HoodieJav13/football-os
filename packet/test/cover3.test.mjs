import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonical, clone } from '../public/src/common.js';
import {
  IDENTIFY_MARKER, bundledCover3, cover3SnapshotFrom, identifyDiagram, projectIdentifyCards,
  shortRevision, spatialLegend, verifyCover3,
} from '../public/src/cover3.js';
import { sampleCover3 } from '../public/src/sample-cover3.js';

// Source lessonRevision semantics, kept here as an independent integrity check.
function lessonRevision(play) {
  const content = {};
  for (const field of ['name', 'family', 'formation', 'personnel', 'fieldSide', 'players', 'defenders', 'assignments']) content[field] = play?.[field];
  content.fieldSide = play?.fieldSide ?? 'none';
  const text = canonical(content);
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return `rev-${hash.toString(16).padStart(16, '0')}`;
}

const AUTHORED = [
  ['BC', 'Deep left', 'deep-third', 'blue'],
  ['S', 'Deep middle', 'deep-third', 'blue'],
  ['FC', 'Deep right', 'deep-third', 'blue'],
  ['W', 'Left hook', 'hook', 'amber'],
  ['M', 'Right hook', 'hook', 'amber'],
  ['B', 'Left flat', 'flat', 'teal'],
  ['A', 'Right flat', 'flat', 'teal'],
];

test('answers match the seven authored responsibilities', () => {
  const { pack } = bundledCover3();
  assert.equal(pack.answers.length, 7);
  for (const [tag, area, job, color] of AUTHORED) {
    const answer = pack.answers.find((item) => item.tag === tag);
    assert.ok(answer, tag);
    assert.deepEqual([answer.areaLabel, answer.job, answer.color], [area, job, color]);
    const assignment = pack.diagram.assignments.find((item) => item.id === answer.assignmentId);
    const authored = assignment.definition.responsibilityArea;
    assert.equal(assignment.playerId, answer.defenderId);
    assert.deepEqual([authored.label, authored.color, authored.center, authored.radiusX, authored.radiusY],
      [area, color, answer.center, answer.radiusX, answer.radiusY]);
  }
});

test('front defenders stay unanswered and no answer is invented', () => {
  const { pack } = bundledCover3();
  assert.deepEqual(pack.unansweredDefenders.map((item) => item.tag), ['E', 'T', 'T', 'E']);
  const answered = new Set(pack.answers.map((item) => item.defenderId));
  assert.ok(pack.unansweredDefenders.every((item) => !answered.has(item.defenderId)));
});

test('the stored revision matches the authored content', () => {
  assert.equal(lessonRevision(sampleCover3.pack.diagram), sampleCover3.pack.revision);
  assert.equal(lessonRevision(bundledCover3().pack.diagram), sampleCover3.pack.revision);
  assert.equal(shortRevision(sampleCover3.pack.revision), '3f2f5783');
});

test('the snapshot allowlists authored fields and keeps geometry and labels', () => {
  const { pack } = bundledCover3();
  assert.equal(Object.hasOwn(pack.diagram, 'folder'), false);
  assert.equal(pack.diagram.fieldSide, 'right');
  assert.equal(pack.diagram.players[0].sourceLabel, 'X');
  assert.deepEqual(pack.diagram.assignments[0].points, [[-19, 8], [-18, 26]]);
});

test('the legend groups jobs and reads left to right', () => {
  const legend = spatialLegend(bundledCover3().pack);
  assert.deepEqual(legend.map((group) => group.entries.map((entry) => entry.tag)), [['BC', 'S', 'FC'], ['W', 'M'], ['B', 'A']]);
  assert.deepEqual(legend.map((group) => group.color), ['blue', 'amber', 'teal']);
});

test('nonfictional or unfinished example documents are refused', () => {
  assert.throws(() => cover3SnapshotFrom({ ...sampleCover3, fictional: false }), /fictional/);
  assert.throws(() => cover3SnapshotFrom({ ...sampleCover3, status: 'approved' }), /draft/);
  assert.throws(() => cover3SnapshotFrom({ ...sampleCover3, pack: { ...sampleCover3.pack, answers: [] } }), /no authored answers/);
});

test('any edit to the authored snapshot is refused', async (t) => {
  const edits = {
    revision: (c) => { c.pack.revision = 'rev-0000000000000000'; },
    answer: (c) => { c.pack.answers[0].areaLabel = 'Deep right'; },
    geometry: (c) => { c.pack.diagram.assignments[0].definition.responsibilityArea.radiusX = 9; },
    alignment: (c) => { c.pack.diagram.defenders[4].x = -18; },
    'field direction': (c) => { c.pack.diagram.fieldSide = 'left'; },
    'added answer': (c) => { c.pack.answers.push(clone(c.pack.answers[0])); },
    status: (c) => { c.status = 'approved'; },
  };
  for (const [name, edit] of Object.entries(edits)) {
    await t.test(name, () => {
      const copy = bundledCover3();
      edit(copy);
      assert.throws(() => verifyCover3(copy), /bundled authored example/);
    });
  }
});

test('the bundled snapshot passes and comes back detached', () => {
  const input = bundledCover3();
  const output = verifyCover3(input);
  assert.deepEqual(output, input);
  assert.notEqual(output.pack, input.pack);
});

test('identify projection follows the source semantics', () => {
  const { diagram, answers } = bundledCover3().pack;
  const look = identifyDiagram(diagram, answers[0].defenderId);
  assert.equal(look.fieldSide, 'right');
  assert.deepEqual(look.assignments, []);
  assert.equal(look.players.length, 11);
  assert.equal(look.defenders.length, 11);
  assert.deepEqual(look.players.map((player) => player.id), Array.from({ length: 11 }, (_, i) => `o${i + 1}`));
  assert.deepEqual(look.defenders.map((defender) => defender.id), Array.from({ length: 11 }, (_, i) => `d${i + 1}`));
  assert.deepEqual(look.defenders.filter((defender) => defender.label).map((defender) => defender.label), [IDENTIFY_MARKER]);
  const xs = look.defenders.map((defender) => defender.x);
  assert.deepEqual(xs, [...xs].sort((a, b) => a - b));
  assert.deepEqual(new Set(look.defenders.map((defender) => Object.keys(defender).join())), new Set(['id,label,x,y']));
});

test('identify projection replaces a label outside the neutral offense set', () => {
  const look = identifyDiagram({ players: [{ id: 'secret-id', label: 'BC', x: 1, y: 2 }], defenders: [], fieldSide: 'up' });
  assert.deepEqual(look.players, [{ id: 'o1', label: 'O1', x: 1, y: 2 }]);
  assert.equal(look.fieldSide, 'none');
});

test('identify cards hold no answer content, geometry or source identifiers', () => {
  const { pack } = bundledCover3();
  const cards = projectIdentifyCards(pack);
  assert.equal(cards.length, 7);
  assert.deepEqual(cards.map((card) => card.number), [1, 2, 3, 4, 5, 6, 7]);
  const text = JSON.stringify(cards);
  for (const word of ['Deep', 'deep', 'hook', 'flat', 'Cover', 'packet-cover3', 'rev-', 'blue', 'teal', 'amber', 'radius', 'center', 'ellipse', 'Zone', 'BC', 'FC', 'sourceLabel', 'Trips', 'Personnel']) {
    assert.equal(text.includes(word), false, word);
  }
  const defenderLabels = new Set(cards.flatMap((card) => card.diagram.defenders.map((defender) => defender.label)));
  assert.deepEqual(defenderLabels, new Set(['', IDENTIFY_MARKER]));
  const authoredXs = pack.answers.flatMap((answer) => [answer.center[0], answer.radiusX]);
  assert.ok(authoredXs.length > 0);
  assert.equal(Object.hasOwn(cards[0], 'defenderId'), false);
});

test('each identify card stars one distinct defender', () => {
  const cards = projectIdentifyCards(bundledCover3().pack);
  const starred = cards.map((card) => card.diagram.defenders.findIndex((defender) => defender.label === IDENTIFY_MARKER));
  assert.ok(starred.every((index) => index >= 0));
  assert.equal(new Set(starred).size, 7);
});
