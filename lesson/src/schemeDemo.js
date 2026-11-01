// Explicitly loaded synthetic demo family. Every rule here is authored test material,
// not a verified or adopted call, and existing catalogs are not an input.
import { lessonRevision } from './lessonPack.js';

const PACKAGE_ID = 'demo-scheme-pkg-01';
const FAMILY_ID = 'demo-scheme-fam-01';
const CALL = { quarters: 'demo-call-q', show: 'demo-call-show', sim4: 'demo-call-sim4', p5: 'demo-call-p5' };
const ROLE_IDS = Array.from({ length: 11 }, (_, i) => `demo-role-${String(i + 1).padStart(2, '0')}`);
const [E1, , , E2, , M, S, , , H2] = ROLE_IDS;

const POSITIONS = [['E', -7, 1], ['T', -2, 1], ['N', 2, 1], ['E', 7, 1], ['W', -4, 4.5], ['M', 0, 4.5], ['S', 5, 4.5], ['C', -19, 7], ['H', -8, 12], ['H', 8, 12], ['C', 19, 7]];
const OFFENSE = [['LT', -4, -1], ['LG', -2, -1], ['C', 0, -1], ['RG', 2, -1], ['RT', 4, -1], ['X', -22, -1], ['Y', 6, -1], ['F', 3, -5], ['Z', 20, -1], ['H', -3, -5], ['Q', 0, -4]];
const BASE_JOBS = [
  ['rush', 'Edge rush, contain left', 'C gap left', null], ['rush', 'Penetrate A gap', 'A gap', null], ['rush', 'Penetrate B gap', 'B gap', null], ['rush', 'Edge rush, contain right', 'C gap right', null],
  ['coverage', 'Curl to flat, left', 'B gap left', null], ['coverage', 'Middle hook', 'A gap', null], ['coverage', 'Curl to flat, right', 'B gap right', null],
  ['coverage', 'Outside quarter, left', 'Force left', null], ['coverage', 'Inside quarter, left', 'Alley left', null], ['coverage', 'Inside quarter, right', 'Alley right', null], ['coverage', 'Outside quarter, right', 'Force right', null],
];
const SIM4_JOBS = { [E2]: ['coverage', 'Drop to replace the middle hook', 'B gap right', M], [M]: ['rush', 'Replacement rush through B gap', 'B gap', E2] };
const P5_JOBS = { [S]: ['rush', 'Pressure from the boundary', 'C gap right', H2], [H2]: ['coverage', 'Replace the curl to flat, right', 'Alley right', S] };

const jobsFor = (overrides = {}) => ROLE_IDS.map((id, i) => overrides[id] ?? BASE_JOBS[i]);
const offensePlayers = () => OFFENSE.map(([label, x, y], i) => ({ id: `demo-o${i + 1}`, label, x, y }));

function buildRoles(jobs, alignment = {}) {
  return ROLE_IDS.map((roleId, i) => {
    const [positionLabel, baseX, baseY] = POSITIONS[i];
    const [unit, responsibility, runFitOwnership, exchangePartnerRoleId] = jobs[i];
    const [x, y] = alignment[roleId] ?? [baseX, baseY];
    return {
      roleId, positionLabel, alignment: { label: `${positionLabel} alignment (synthetic)`, x, y }, unit,
      key: `Synthetic key for this ${positionLabel}: nearest threat`,
      decision: `Synthetic decision: ${unit === 'rush' ? 'rush unless the back releases' : 'match the route that reaches you'}`,
      responsibility, exchangePartnerRoleId,
      finish: 'Synthetic finish: run to the ball', fallback: 'Synthetic fallback: play your stated responsibility',
      runFitOwnership, ruleBasis: 'synthetic_example',
    };
  });
}

function buildDiagram(key, name, roles) {
  const diagramId = `demo-diagram-${key}`;
  const play = {
    id: diagramId, name: `${name} (synthetic)`, family: 'Synthetic demo', folder: 'Synthetic', formation: 'Two by two (synthetic)', personnel: '11 Personnel', fieldSide: 'right',
    players: offensePlayers(),
    defenders: roles.map((role) => ({ id: role.roleId, label: role.positionLabel, x: role.alignment.x, y: role.alignment.y })),
    assignments: roles.filter((role) => role.unit === 'coverage').map((role) => {
      const center = [role.alignment.x, role.alignment.y + 11];
      return {
        id: `${diagramId}-${role.roleId}`, playerId: role.roleId, unit: 'defense', phase: 'post', type: 'Zone', pace: 1, delay: 0, geometryMode: 'manual',
        preset: role.responsibility, points: [[role.alignment.x, role.alignment.y], center],
        definition: { area: role.responsibility, landmark: 'Synthetic area; adjust for your lesson.', responsibilityArea: { version: 1, shape: 'ellipse', center, radiusX: 7, radiusY: 6, label: role.responsibility.slice(0, 48), color: 'blue' } },
      };
    }),
  };
  return { diagramId, play };
}

const COUNTS = { base: [4, 7], 'presentation-only': [4, 7], sim4: [4, 7], p5: [5, 6] };

function buildCall({ key, callId, variantOf, rushFamily, name, jobs, alignment, outcomes = [], ambiguous = 'not-applicable' }) {
  const roles = buildRoles(jobs, alignment);
  const diagram = buildDiagram(key, name, roles);
  const [rush, coverage] = COUNTS[rushFamily];
  const call = {
    callId, title: `${name} (synthetic example)`, familyId: FAMILY_ID, variantOf, status: 'ready',
    front: 'Synthetic odd front', presentation: rushFamily === 'presentation-only' ? 'Mug both linebackers, then bail' : 'Base two-high look',
    rushFamily, coverage: 'Synthetic match quarters', checks: ['Synthetic check: none authored'],
    intendedRushCount: rush, anticipatedCoverageCount: coverage,
    formationCases: [{ formationCaseId: 'demo-form-1', label: 'Two by two', offense: offensePlayers() }],
    eligibleReceiverNumbering: { method: 'outside-in', numbers: [{ playerId: 'demo-o6', number: 1 }, { playerId: 'demo-o9', number: 1 }, { playerId: 'demo-o7', number: 2 }] },
    roles, exchangeOutcomes: outcomes, ambiguousReadDefault: ambiguous, compatibleCombinationIds: [],
    counters: ['Synthetic counter: none authored'], teachingCues: ['Eyes on your key before you move'], uncertainties: ['Synthetic rule, not field tested'],
    learnerContext: { callName: `Demo ${name}`, situation: '2nd and 7, left hash', question: 'On this call and this look, what do you do?' },
    diagramRef: { diagramId: diagram.diagramId, teachableRevision: lessonRevision(diagram.play) },
    coachKeyRef: { keyId: `demo-key-${key}`, revision: 1, digest: null },
  };
  const coachKey = { keyId: `demo-key-${key}`, callId, revision: 1, answers: roles.map((role) => ({ roleId: role.roleId, questionKind: 'teachBack', answer: `Synthetic rubric: ${role.responsibility}. Finish to the ball.` })) };
  return { call, diagram, coachKey };
}

const SIM4_OUTCOMES = [
  {
    outcomeId: 'demo-out-sim4-release', condition: 'Back releases toward the replacement side',
    pairedJobs: [{ roleId: E2, job: 'Take the release' }, { roleId: M, job: 'Finish the rush' }],
    replacementCoverage: [{ roleId: E2, replaces: M, coverage: 'Middle hook replacement' }],
    rushLanes: [{ roleId: M, lane: 'B gap', contain: false }, { roleId: E1, lane: 'Edge', contain: true }],
    expectedRushCount: 4, expectedCoverageCount: 7,
  },
  {
    outcomeId: 'demo-out-sim4-stay', condition: 'Back stays in to block',
    pairedJobs: [{ roleId: E2, job: 'Sink under the slot' }, { roleId: M, job: 'Rush through the back' }],
    replacementCoverage: [{ roleId: E2, replaces: M, coverage: 'Middle hook' }],
    rushLanes: [{ roleId: M, lane: 'B gap', contain: false }, { roleId: E1, lane: 'Edge', contain: true }],
    expectedRushCount: 4, expectedCoverageCount: 7,
  },
];
const P5_OUTCOMES = [
  {
    outcomeId: 'demo-out-p5-peel', condition: 'Back releases and the rusher peels',
    pairedJobs: [{ roleId: S, job: 'Peel the back' }, { roleId: H2, job: 'Stay on the replacement' }],
    replacementCoverage: [{ roleId: H2, replaces: S, coverage: 'Curl to flat replacement' }],
    rushLanes: [{ roleId: E2, lane: 'Edge', contain: true }],
    expectedRushCount: 4, expectedCoverageCount: 7,
  },
  {
    outcomeId: 'demo-out-p5-block', condition: 'Back blocks',
    pairedJobs: [{ roleId: S, job: 'Finish the rush' }, { roleId: H2, job: 'Stay on the replacement' }],
    replacementCoverage: [{ roleId: H2, replaces: S, coverage: 'Curl to flat replacement' }],
    rushLanes: [{ roleId: S, lane: 'C gap', contain: false }, { roleId: E2, lane: 'Edge', contain: true }],
    expectedRushCount: 5, expectedCoverageCount: 6,
  },
];

function changedPicture() {
  const offense = offensePlayers();
  offense.find((player) => player.label === 'Z').x = 12;
  offense.find((player) => player.label === 'H').x = 9;
  return {
    scenarioId: 'demo-scenario-01', callId: CALL.sim4, changedFromFormationCaseId: 'demo-form-1', offense,
    learnerContext: { callName: 'Demo Swap', situation: '3rd and 4, right hash', question: 'The picture changed. What do you do now?' },
    coachNote: 'Synthetic note: the receiver moved inside to test the exchange.',
  };
}

export function createSchemeDemoDraft(now = new Date().toISOString()) {
  const parts = [
    buildCall({ key: 'q', callId: CALL.quarters, variantOf: null, rushFamily: 'base', name: 'Palm', jobs: jobsFor() }),
    buildCall({ key: 'show', callId: CALL.show, variantOf: CALL.quarters, rushFamily: 'presentation-only', name: 'Palm Mug', jobs: jobsFor(), alignment: { [ROLE_IDS[4]]: [-4, 1.5], [ROLE_IDS[5]]: [0, 1.5] } }),
    buildCall({ key: 'sim4', callId: CALL.sim4, variantOf: CALL.quarters, rushFamily: 'sim4', name: 'Swap', jobs: jobsFor(SIM4_JOBS), outcomes: SIM4_OUTCOMES, ambiguous: 'demo-out-sim4-release' }),
    buildCall({ key: 'p5', callId: CALL.p5, variantOf: CALL.quarters, rushFamily: 'p5', name: 'Five', jobs: jobsFor(P5_JOBS), outcomes: P5_OUTCOMES, ambiguous: 'demo-out-p5-block' }),
  ];
  return {
    packageKind: 'coach-scheme-package', schemaVersion: 1, packageId: PACKAGE_ID, familyId: FAMILY_ID,
    revision: 1, parentRevision: null, parentDigest: null, contentDigest: null, callDigests: {}, frozen: false, createdAt: now, updatedAt: now,
    provenance: { producerComponent: 'football-os-playmaker', producerVersion: 'scheme-demo-1', synthetic: true },
    authority: { doctrineStatus: 'not-adopted', kbRelease: null, kbIds: [] },
    sourceRefs: [
      { sourceId: 'demo-src-1', url: 'https://www.youtube.com/watch?v=vdGa81ZxpT4', locator: 'Run-support sample near 17:05-17:24', reviewExtent: 'selected-visual-samples', representationDigest: null },
      { sourceId: 'demo-src-2', url: 'https://www.youtube.com/watch?v=FW-jjGnJq5w', locator: 'Full auto transcript; frames near 2:34, 8:40, 11:17', reviewExtent: 'selected-visual-samples', representationDigest: null },
      { sourceId: 'demo-src-3', url: 'https://www.youtube.com/watch?v=r4CP4aAupGY', locator: 'Annotated frame near 10:06', reviewExtent: 'selected-visual-samples', representationDigest: null },
    ],
    interpretations: [{
      interpretationId: 'demo-int-1', sourceRefIds: ['demo-src-1', 'demo-src-3'],
      analystClaim: 'Analyst identification only; not a verified headset call or execution pair.',
      coachAdaptation: 'Synthetic test adaptation; not adopted doctrine.',
      uncertainty: 'Trigger not verified.',
    }],
    approval: { status: 'draft', actorLabel: null, timestamp: null, approvedDigest: null, actionKind: null, authenticated: false },
    calls: parts.map((part) => part.call), diagrams: parts.map((part) => part.diagram), coachKeys: parts.map((part) => part.coachKey),
    lessonRefs: [], practiceRefs: [], correctionRefs: [], scenarios: [changedPicture()],
  };
}
