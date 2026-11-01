// Bounded rotation invariant sweep: 30 seeds x 7 fixture scenarios x 5 days =
// 1,050 generations. Determinism, and no ineligible, out-of-group, unavailable
// or simultaneous assignment, with shortages left honestly unfilled.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateFixture, SCENARIOS } from '../src/domain/fixtures.js';
import { generateRotation, validateRotation } from '../src/domain/rotation.js';
import { loadLibrary } from './helpers.mjs';

const lib = loadLibrary();
const HARD = ['conflict', 'ineligible-role', 'not-in-group', 'unavailable', 'unknown-participant'];

test('1,050 generations: deterministic and free of hard violations', () => {
  let generations = 0;
  let slots = 0;
  let unfilled = 0;
  for (const scenario of SCENARIOS) {
    for (let seed = 1; seed <= 30; seed++) {
      const f = generateFixture({ seed, scenario, library: lib });
      const ids = new Set(f.participants.map((p) => p.id));
      for (const d of f.week.days) {
        const args = { day: d, groups: f.groups, participants: f.participants, previous: f.rotations[d.id] || null, seed };
        const r = generateRotation(args);
        assert.deepEqual(r, generateRotation(args), `${scenario}/${seed}/${d.label} deterministic`);
        const v = validateRotation({ day: d, groups: f.groups, participants: f.participants, rotation: r });
        const hard = v.warnings.filter((w) => HARD.includes(w.type));
        assert.equal(hard.length, 0, `${scenario}/${seed}/${d.label}: ${hard.map((w) => w.message).join(' | ')}`);
        for (const e of r.entries) {
          for (const s of e.slots) {
            slots++;
            if (s.participantId === null) {
              unfilled++;
              assert.ok(s.reason.length > 0, 'an unfilled slot carries its reason');
            } else assert.ok(ids.has(s.participantId), 'nobody is invented');
          }
        }
        generations++;
      }
    }
  }
  assert.equal(generations, 1050);
  assert.ok(slots > 29000);
  assert.ok(unfilled > 0, 'stress scenarios still produce honest gaps');
});
