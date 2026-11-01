// SYNTHETIC TEST MATERIAL. Not a verified, adopted or real-team call. Every rule is
// explicitly authored for software proof and marked synthetic_example.
//
// Byte-identical copies live at lesson/tests/fixtures, practice/tests/fixtures and
// packet/test/fixtures, following the existing vendored-copy convention
// (packet/public/src/practice-week.js === practice/src/domain/week.js).
//
// This file holds data plus independent oracles. It never imports the implementation;
// helpers that need the API receive it as an argument.
import { createHash } from 'node:crypto';

export const T0 = '2026-10-31T16:00:00.000Z';
export const T1 = '2026-10-31T16:05:00.000Z';
export const T2 = '2026-10-31T16:10:00.000Z';
export const T3 = '2026-10-31T16:15:00.000Z';

export const PACKAGE_ID = 'syn-pkg-c41d';
export const FAMILY_ID = 'syn-fam-7f3a';
export const CALL = Object.freeze({ quarters: 'syn-call-a1', show: 'syn-call-b2', sim4: 'syn-call-c3', p5: 'syn-call-d4' });
export const ROLE_IDS = Object.freeze(['syn-r01', 'syn-r02', 'syn-r03', 'syn-r04', 'syn-r05', 'syn-r06', 'syn-r07', 'syn-r08', 'syn-r09', 'syn-r10', 'syn-r11']);
export const FORMATION_CASE_ID = 'syn-form-1';
export const LOCAL_TEST_ACTION = 'synthetic-local-test';

// Shared labels are deliberate: E, C and H each name two different jobs.
const POSITIONS = [['E', -7, 1], ['T', -2, 1], ['N', 2, 1], ['E', 7, 1], ['W', -4, 4.5], ['M', 0, 4.5], ['S', 5, 4.5], ['C', -19, 7], ['H', -8, 12], ['H', 8, 12], ['C', 19, 7]];
const OFFENSE = [['LT', -4, -1], ['LG', -2, -1], ['C', 0, -1], ['RG', 2, -1], ['RT', 4, -1], ['X', -22, -1], ['Y', 6, -1], ['F', 3, -5], ['Z', 20, -1], ['H', -3, -5], ['Q', 0, -4]];

// [unit, responsibility, run fit, exchange partner]
const BASE_JOBS = [
  ['rush', 'edge contain left', 'C gap left', null], ['rush', 'A gap penetrate', 'A gap', null], ['rush', 'B gap penetrate', 'B gap', null], ['rush', 'edge contain right', 'C gap right', null],
  ['coverage', 'curl-flat left', 'B gap left', null], ['coverage', 'hook middle', 'A gap', null], ['coverage', 'curl-flat right', 'B gap right', null],
  ['coverage', 'quarter outside left', 'force left', null], ['coverage', 'quarter inside left', 'alley left', null], ['coverage', 'quarter inside right', 'alley right', null], ['coverage', 'quarter outside right', 'force right', null],
];
const SIM4_JOBS = { 'syn-r04': ['coverage', 'replace hook right', 'B gap right', 'syn-r06'], 'syn-r06': ['rush', 'replacement rush B gap', 'B gap', 'syn-r04'] };
const P5_JOBS = { 'syn-r07': ['rush', 'boundary pressure', 'C gap right', 'syn-r10'], 'syn-r10': ['coverage', 'replace curl-flat right', 'alley right', 'syn-r07'] };

const jobsFor = (overrides = {}) => ROLE_IDS.map((id, i) => overrides[id] ?? BASE_JOBS[i]);
const copy = (value) => JSON.parse(JSON.stringify(value));

function buildRoles(callKey, jobs, alignmentOverrides = {}) {
  return ROLE_IDS.map((roleId, i) => {
    const [positionLabel, baseX, baseY] = POSITIONS[i];
    const [unit, responsibility, runFit, partner] = jobs[i];
    const [x, y] = alignmentOverrides[roleId] ?? [baseX, baseY];
    return {
      roleId,
      positionLabel,
      alignment: { label: `SYN-ALIGN ${positionLabel}`, x, y },
      unit,
      key: `SYN-JOB key ${callKey} ${roleId}`,
      decision: `SYN-JOB decision ${callKey} ${roleId}`,
      responsibility: `SYN-JOB ${responsibility}`,
      exchangePartnerRoleId: partner,
      finish: `SYN-JOB finish ${callKey} ${roleId}`,
      fallback: `SYN-JOB fallback ${callKey} ${roleId}`,
      runFitOwnership: `SYN-JOB ${runFit}`,
      ruleBasis: 'synthetic_example',
    };
  });
}

const offensePlayers = () => OFFENSE.map(([label, x, y], i) => ({ id: `syn-o${String(i + 1).padStart(2, '0')}`, label, x, y }));

function buildDiagram(diagramId, key, roles) {
  const play = {
    id: diagramId,
    name: `SYN-DIAGRAM ${key}`,
    family: 'SYN-DIAGRAM family',
    formation: 'SYN-DIAGRAM formation',
    personnel: 'SYN-DIAGRAM personnel',
    folder: 'Synthetic',
    fieldSide: 'right',
    players: offensePlayers(),
    defenders: roles.map((role) => ({ id: role.roleId, label: role.positionLabel, x: role.alignment.x, y: role.alignment.y })),
    assignments: roles.filter((role) => role.unit === 'coverage').map((role) => {
      const center = [role.alignment.x, role.alignment.y + 12];
      return {
        id: `syn-assign-${key}-${role.roleId}`, playerId: role.roleId, unit: 'defense', phase: 'post', type: 'Zone', pace: 1, delay: 0,
        geometryMode: 'manual', preset: 'SYN-JOB preset', points: [[role.alignment.x, role.alignment.y], center],
        definition: {
          area: 'SYN-JOB area', landmark: 'SYN-JOB landmark',
          responsibilityArea: { version: 1, shape: 'ellipse', center, radiusX: 8, radiusY: 7, label: `AREA-SENTINEL ${key} ${role.roleId}`, color: 'blue' },
        },
      };
    }),
  };
  return { diagramId, play };
}

const coachKeyFor = (key, callId) => ({
  keyId: `syn-key-${key}`,
  callId,
  revision: 1,
  answers: ROLE_IDS.map((roleId) => ({ roleId, questionKind: 'teachBack', answer: `COACH-ONLY rubric ${key} ${roleId}` })),
});

const SIM4_OUTCOMES = [
  {
    outcomeId: 'syn-out-c1', condition: 'SYN-JOB back releases to the replacement side',
    pairedJobs: [{ roleId: 'syn-r04', job: 'SYN-JOB take the release' }, { roleId: 'syn-r06', job: 'SYN-JOB finish the rush' }],
    replacementCoverage: [{ roleId: 'syn-r04', replaces: 'syn-r06', coverage: 'SYN-JOB hook replacement' }],
    rushLanes: [{ roleId: 'syn-r06', lane: 'SYN-JOB B gap', contain: false }, { roleId: 'syn-r01', lane: 'SYN-JOB edge', contain: true }],
    expectedRushCount: 4, expectedCoverageCount: 7,
  },
  {
    outcomeId: 'syn-out-c2', condition: 'SYN-JOB back stays in',
    pairedJobs: [{ roleId: 'syn-r04', job: 'SYN-JOB sink under the slot' }, { roleId: 'syn-r06', job: 'SYN-JOB rush through the back' }],
    replacementCoverage: [{ roleId: 'syn-r04', replaces: 'syn-r06', coverage: 'SYN-JOB middle hook' }],
    rushLanes: [{ roleId: 'syn-r06', lane: 'SYN-JOB B gap', contain: false }, { roleId: 'syn-r01', lane: 'SYN-JOB edge', contain: true }],
    expectedRushCount: 4, expectedCoverageCount: 7,
  },
];
const P5_OUTCOMES = [
  {
    outcomeId: 'syn-out-d1', condition: 'SYN-JOB back releases, rusher peels',
    pairedJobs: [{ roleId: 'syn-r07', job: 'SYN-JOB peel the back' }, { roleId: 'syn-r10', job: 'SYN-JOB stay on the replacement' }],
    replacementCoverage: [{ roleId: 'syn-r10', replaces: 'syn-r07', coverage: 'SYN-JOB curl-flat replacement' }],
    rushLanes: [{ roleId: 'syn-r04', lane: 'SYN-JOB edge', contain: true }],
    expectedRushCount: 4, expectedCoverageCount: 7,
  },
  {
    outcomeId: 'syn-out-d2', condition: 'SYN-JOB back blocks',
    pairedJobs: [{ roleId: 'syn-r07', job: 'SYN-JOB finish the rush' }, { roleId: 'syn-r10', job: 'SYN-JOB stay on the replacement' }],
    replacementCoverage: [{ roleId: 'syn-r10', replaces: 'syn-r07', coverage: 'SYN-JOB curl-flat replacement' }],
    rushLanes: [{ roleId: 'syn-r07', lane: 'SYN-JOB C gap', contain: false }, { roleId: 'syn-r04', lane: 'SYN-JOB edge', contain: true }],
    expectedRushCount: 5, expectedCoverageCount: 6,
  },
];

function buildCall({ key, callId, variantOf, rushFamily, rushCount, coverageCount, jobs, jobKey = key, alignment, outcomes = [], ambiguous = 'not-applicable', callName }) {
  const roles = buildRoles(jobKey, jobs, alignment);
  const diagramId = `syn-diagram-${key}`;
  return {
    call: {
      callId, title: `SYN-JOB title ${key}`, familyId: FAMILY_ID, variantOf, status: 'ready',
      front: 'SYN-JOB front', presentation: `SYN-JOB presentation ${key}`, rushFamily, coverage: 'SYN-JOB coverage', checks: ['SYN-JOB check'],
      intendedRushCount: rushCount, anticipatedCoverageCount: coverageCount,
      formationCases: [{ formationCaseId: FORMATION_CASE_ID, label: 'SYN-FORMATION two by two', offense: offensePlayers() }],
      eligibleReceiverNumbering: { method: 'outside-in', numbers: [{ playerId: 'syn-o06', number: 1 }, { playerId: 'syn-o09', number: 1 }, { playerId: 'syn-o07', number: 2 }] },
      roles,
      exchangeOutcomes: copy(outcomes),
      ambiguousReadDefault: ambiguous,
      compatibleCombinationIds: [],
      counters: ['COACH-ONLY counter'],
      teachingCues: ['SYN-CUE keep the eyes on the key'],
      uncertainties: ['COACH-ONLY uncertainty: synthetic rule, not field tested'],
      learnerContext: { callName, situation: '2nd and 7, left hash', question: 'On this call and this look, what do you do?' },
      diagramRef: { diagramId, teachableRevision: null },
      coachKeyRef: { keyId: `syn-key-${key}`, revision: 1, digest: null },
    },
    diagram: buildDiagram(diagramId, key, roles),
    key: coachKeyFor(key, callId),
  };
}

const MUG = { 'syn-r05': [-4, 1.5], 'syn-r06': [0, 1.5] };

/** Unfrozen draft revision 1 holding the four proof variants. Returns a new object each call. */
export function syntheticDraftPackage() {
  const parts = [
    buildCall({ key: 'quarters', callId: CALL.quarters, variantOf: null, rushFamily: 'base', rushCount: 4, coverageCount: 7, jobs: jobsFor(), callName: 'Sample Palm' }),
    buildCall({ key: 'show', callId: CALL.show, variantOf: CALL.quarters, rushFamily: 'presentation-only', rushCount: 4, coverageCount: 7, jobs: jobsFor(), jobKey: 'quarters', alignment: MUG, callName: 'Sample Palm Mug' }),
    buildCall({ key: 'sim4', callId: CALL.sim4, variantOf: CALL.quarters, rushFamily: 'sim4', rushCount: 4, coverageCount: 7, jobs: jobsFor(SIM4_JOBS), outcomes: SIM4_OUTCOMES, ambiguous: 'syn-out-c1', callName: 'Sample Swap' }),
    buildCall({ key: 'p5', callId: CALL.p5, variantOf: CALL.quarters, rushFamily: 'p5', rushCount: 5, coverageCount: 6, jobs: jobsFor(P5_JOBS), outcomes: P5_OUTCOMES, ambiguous: 'syn-out-d2', callName: 'Sample Five' }),
  ];
  for (const part of parts) part.call.diagramRef.teachableRevision = teachableRevisionOf(part.diagram.play);
  return {
    packageKind: 'coach-scheme-package',
    schemaVersion: 1,
    packageId: PACKAGE_ID,
    familyId: FAMILY_ID,
    revision: 1,
    parentRevision: null,
    parentDigest: null,
    contentDigest: null,
    callDigests: {},
    frozen: false,
    createdAt: T0,
    updatedAt: T0,
    provenance: { producerComponent: 'football-os-playmaker', producerVersion: 'synthetic-fixture-1', synthetic: true },
    authority: { doctrineStatus: 'not-adopted', kbRelease: null, kbIds: [] },
    sourceRefs: [
      { sourceId: 'syn-src-1', url: 'https://www.youtube.com/watch?v=vdGa81ZxpT4', locator: '17:05-17:24', reviewExtent: 'selected-visual-samples', representationDigest: null },
      { sourceId: 'syn-src-2', url: 'https://www.youtube.com/watch?v=FW-jjGnJq5w', locator: 'full auto transcript', reviewExtent: 'transcript-only', representationDigest: null },
      { sourceId: 'syn-src-3', url: 'https://www.youtube.com/watch?v=r4CP4aAupGY', locator: 'annotated frame near 10:06', reviewExtent: 'selected-visual-samples', representationDigest: null },
    ],
    interpretations: [{
      interpretationId: 'syn-int-1', sourceRefIds: ['syn-src-1', 'syn-src-3'],
      analystClaim: 'COACH-ONLY analyst identification; not a verified headset call or execution pair.',
      coachAdaptation: 'COACH-ONLY synthetic test adaptation; not adopted doctrine.',
      uncertainty: 'COACH-ONLY trigger not verified.',
    }],
    approval: { status: 'draft', actorLabel: null, timestamp: null, approvedDigest: null, actionKind: null, authenticated: false },
    calls: parts.map((part) => part.call),
    diagrams: parts.map((part) => part.diagram),
    coachKeys: parts.map((part) => part.key),
    lessonRefs: [],
    practiceRefs: [],
    correctionRefs: [],
  };
}

/** An authored changed offensive picture for the SIM4 recheck. */
export function changedPictureScenario(callId = CALL.sim4) {
  const offense = offensePlayers();
  offense.find((player) => player.label === 'Z').x = 12;
  offense.find((player) => player.label === 'H').x = 9;
  return {
    scenarioId: 'syn-scn-01',
    callId,
    changedFromFormationCaseId: FORMATION_CASE_ID,
    offense,
    learnerContext: { callName: 'Sample Swap', situation: '3rd and 4, right hash', question: 'The picture changed. What do you do now?' },
    coachNote: 'COACH-ONLY the receiver moved inside to test the exchange.',
  };
}

export const syntheticCorrection = (pin, overrides = {}) => ({
  correctionId: 'syn-cor-01',
  originatingPackageId: pin.packageId,
  originatingRevision: pin.revision,
  originatingDigest: pin.contentDigest,
  callId: pin.callId,
  observedIssue: 'Synthetic practice note: the replacement arrived late.',
  observationType: 'synthetic-fixture',
  practicePeriodRef: { dayId: 'syn-day-1', periodId: 'syn-period-1' },
  evidenceRef: null,
  proposedRuleChange: { roleId: 'syn-r04', field: 'decision', value: 'SYN-JOB decision revised after the synthetic correction' },
  newDraftRevisionRef: null,
  changedPictureScenarioRef: 'syn-scn-01',
  recheckStatus: 'planned',
  ...overrides,
});

// ---------------------------------------------------------------- API-driven helpers
export const frozenPackage = async (api, draft = syntheticDraftPackage(), now = T1) => {
  // The fixture author explicitly reviews its authored keys before publishing a new specimen.
  let reviewed = draft;
  for (const call of draft.calls) {
    if (draft.coachKeys?.some(key => key.keyId === call.coachKeyRef?.keyId) && api.keyBindingStatus(reviewed, call.callId) !== 'current') reviewed = await api.regenerateCoachKey(reviewed, call.callId);
  }
  return api.freezeSchemePackage(reviewed, { now });
};

export const localApproval = (frozen, now = T2) => ({ actionKind: LOCAL_TEST_ACTION, actorLabel: 'Local test action', confirmedDigest: frozen.contentDigest, now });

export async function approvedPackage(api, draft = syntheticDraftPackage()) {
  const frozen = await frozenPackage(api, draft);
  return api.approveSchemePackage(frozen, localApproval(frozen));
}

/** New approved revision after a coach edit in the authoring workflow. */
export async function nextApproved(api, base, edit) {
  const draft = api.createDraftRevision(base, { now: T3 });
  edit(draft);
  return approvedPackage(api, draft);
}

export const findCall = (pkg, callId) => pkg.calls.find((call) => call.callId === callId);
export const findRole = (call, roleId) => call.roles.find((role) => role.roleId === roleId);

/** Unknown fields planted at every level. An allowlist projection drops all of them. */
export function smuggle(pkg) {
  pkg.future_private = 'SMUGGLED top';
  pkg.approval.future_private = 'SMUGGLED approval';
  for (const call of pkg.calls) {
    call.future_private = 'SMUGGLED call';
    call.learnerContext.future_private = 'SMUGGLED context';
    for (const role of call.roles) role.future_private = 'SMUGGLED role';
  }
  return pkg;
}

// ---------------------------------------------------------------- independent oracles
/** Same contract as the implementation, written separately so it can catch drift. */
export function oracleCanonical(value) {
  if (Array.isArray(value)) return `[${value.map(oracleCanonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${oracleCanonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export const oracleSha256 = (text) => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');

const PLAY_TEACHABLE_FIELDS = ['id', 'name', 'family', 'formation', 'personnel', 'fieldSide', 'players', 'defenders', 'assignments'];
const DIGEST_EXCLUDED = ['contentDigest', 'callDigests', 'frozen', 'approval', 'createdAt', 'updatedAt'];

export function oraclePreimage(pkg) {
  const preimage = Object.fromEntries(Object.entries(pkg).filter(([key]) => !DIGEST_EXCLUDED.includes(key)));
  if (Array.isArray(pkg.diagrams)) {
    preimage.diagrams = pkg.diagrams.map((diagram) => ({
      ...diagram,
      play: Object.fromEntries(PLAY_TEACHABLE_FIELDS.filter((field) => diagram.play[field] !== undefined).map((field) => [field, diagram.play[field]])),
    }));
  }
  return preimage;
}

export const oracleContentDigest = (pkg) => oracleSha256(oracleCanonical(oraclePreimage(pkg)));

export const oracleCallDigest = (pkg, callId) => oracleSha256(oracleCanonical({ packageId: pkg.packageId, familyId: pkg.familyId, call: findCall(pkg, callId) }));

function lessonCanonical(value) {
  if (Array.isArray(value)) return `[${value.map((item) => (item === undefined ? 'null' : lessonCanonical(item))).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${lessonCanonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Reproduces lessonPack.lessonRevision so Practice and Packet fixtures need no playData. */
export function teachableRevisionOf(play) {
  const content = {};
  for (const field of ['name', 'family', 'formation', 'personnel', 'fieldSide', 'players', 'defenders', 'assignments']) content[field] = play?.[field];
  content.fieldSide = play?.fieldSide ?? 'none';
  const text = lessonCanonical(content);
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return `rev-${hash.toString(16).padStart(16, '0')}`;
}

// ---------------------------------------------------------------- leak scan
export const IDENTIFY_FORBIDDEN = Object.freeze([
  /SYN-JOB/, /SYN-ALIGN/, /SYN-CUE/, /SYN-FORMATION/, /SYN-DIAGRAM/, /COACH-ONLY/, /AREA-SENTINEL/, /SMUGGLED/,
  /syn-r\d\d/, /syn-o\d\d/, /syn-out-/, /syn-key-/, /syn-src-/, /syn-int-/, /syn-assign-/, /syn-diagram-/,
  /responsibilityArea/, /radius[XY]/, /"center"/, /coachKey/i, /rubric/i, /approvedDigest/, /actorLabel/, /contentDigest/, /callDigest/,
]);

/** Returns the patterns found. Tests assert this is empty so a failure names the leak. */
export const identifyLeaks = (text) => IDENTIFY_FORBIDDEN.filter((pattern) => pattern.test(text)).map(String);

export const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
};
