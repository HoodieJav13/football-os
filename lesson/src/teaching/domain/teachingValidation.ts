import { TEACHING_CONFIG } from '../config/teachingConfig.ts';
import type { TeachingDefinitionInput, TeachingDefinition, DefinitionKeyInput, CompleteFrozenAssignmentKeys, FrozenKeySlots, PreparedTeachingSnapshot, PublishedTeachingSnapshot, QuestionSlots, ResponseSlots, RetainedAssetReceipt, TeachingQuestion, TeachingRef, ReadChoices, TeachingAttempt } from './teaching.ts';
const limits = TEACHING_CONFIG.limits;
export const QUESTION_SLOTS = Object.freeze(['q0', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9'] as const);
export class TeachingValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'TeachingValidationError'; }
}
function fail(message: string): never { throw new TeachingValidationError(message); }
function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return fail(`${label} must be an object`);
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null)
    return fail(`${label} must be plain data`);
  return value as Record<string, unknown>;
}
function fields(value: unknown, required: readonly string[], optional: readonly string[], label: string) {
  const d = record(value, label), allowed = new Set([...required, ...optional]);
  if (required.some(k => !Object.hasOwn(d, k)) || Object.keys(d).some(k => !allowed.has(k)))
    fail(`${label} has missing or unsupported fields`);
  return d;
}
// Match the emulator-proven UTF16 units used by Firestore Rules String.size().
function text(value: unknown, max: number, label: string, empty = false): string {
  if (typeof value !== 'string' || (!empty && value.length === 0) || value.length > max)
    return fail(`${label} exceeds its text bounds`);
  return value;
}
function id(value: unknown, label: string): string {
  const v = text(value, limits.maxStableIdCharacters, label);
  if (v.includes('/'))
    fail(`${label} must be one identifier`);
  return v;
}
function list(value: unknown, max: number, label: string): readonly unknown[] {
  if (!Array.isArray(value) || value.length > max)
    return fail(`${label} exceeds its item bound`);
  return value as readonly unknown[];
}
function ids(value: unknown, max: number, label: string): readonly string[] {
  const v = list(value, max, label).map(x => id(x, label));
  if (new Set(v).size !== v.length)
    fail(`${label} contains duplicates`);
  return v;
}
function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== 'string' || !allowed.some(x => x === value))
    return fail(`${label} is unsupported`);
  return value as T;
}
function time(value: unknown, label: string): string {
  const v = text(value, 24, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/u.test(v))
    fail(`${label} must use UTC ISO time`);
  const normalized = v.length === 20 ? v.replace('Z', '.000Z') : v;
  if (!Number.isFinite(Date.parse(v)) || new Date(v).toISOString() !== normalized)
    fail(`${label} is invalid`);
  return v;
}
function nullableId(v: unknown, label: string) { return v === null ? null : id(v, label); }
function question(value: unknown): TeachingQuestion | null {
  if (value === null)
    return null;
  const q = fields(value, ['id', 'kind', 'prompt', 'options'], [], 'question');
  const base = {
    id: text(q['id'], limits.maxStableIdCharacters, 'question ID'), prompt: text(q['prompt'], limits.maxPromptCharacters, 'prompt')
  };
  const kind = oneOf(q['kind'], ['read', 'teachBack', 'unclear'], 'question kind');
  if (kind === 'read') {
    const options = list(q['options'], limits.maxReadChoices, 'choices').map(x => text(x, limits.maxChoiceCharacters, 'choice'));
    if (options.length < limits.minReadChoices || new Set(options).size !== options.length)
      fail('Read choices must be distinct and bounded');
    return {
      ...base, kind, options: options as unknown as ReadChoices
    };
  }
  list(q['options'], 0, 'non-read options');
  return {
    ...base, kind, options: []
  };
}
function parseSnapshot(value: unknown, published: boolean) {
  const d = fields(value, ['formatVersion', 'digest', 'quizId', 'questions', 'expectedProfileIds', 'assets', 'purpose', 'instruction', 'takeaway', 'publishedAt', 'changeNotice', 'dueAt', 'parentAssignmentId'], ['provenance', 'installDayId', 'supersedesAssignmentId'], 'snapshot');
  if (d['formatVersion'] !== 1)
    fail('Unsupported teaching format');
  const raw = fields(d['questions'], QUESTION_SLOTS, [], 'question slots');
  const pairs = QUESTION_SLOTS.map(slot => [slot, question(raw[slot])] as const);
  if (pairs[0]?.[1] === null)
    fail('A published check needs at least one question');
  const questionIds = pairs.flatMap(([, q]) => q === null ? [] : [q.id]);
  if (new Set(questionIds).size !== questionIds.length)
    fail('Stable question IDs must be unique');
  const takeaway = fields(d['takeaway'], ['key', 'rule', 'commonMistake'], [], 'takeaway');
  const result = {
    formatVersion: 1 as const, digest: text(d['digest'], limits.maxDigestCharacters, 'digest'), quizId: id(d['quizId'], 'quiz ID'), questions: Object.fromEntries(pairs) as QuestionSlots,
    expectedProfileIds: ids(d['expectedProfileIds'], limits.maxExpectedProfiles, 'recipients'), assets: ids(d['assets'], limits.maxAssetsPerAssignment, 'assets'),
    purpose: oneOf(d['purpose'], ['foundation', 'reminder', 'connection'], 'purpose'), instruction: oneOf(d['instruction'], ['supported', 'memory'], 'study mode'),
    takeaway: {
      key: text(takeaway['key'], limits.maxTakeawayCharacters, 'key takeaway'), rule: text(takeaway['rule'], limits.maxTakeawayCharacters, 'rule takeaway'), commonMistake: text(takeaway['commonMistake'], limits.maxTakeawayCharacters, 'mistake takeaway')
    },
    changeNotice: text(d['changeNotice'], limits.maxChangeNoticeCharacters, 'change notice'), dueAt: d['dueAt'] === null ? null : time(d['dueAt'], 'due time'), parentAssignmentId: nullableId(d['parentAssignmentId'], 'parent assignment'),
    provenance: text(d['provenance'] ?? '', limits.maxProvenanceCharacters, 'provenance', true), installDayId: nullableId(d['installDayId'] ?? null, 'install day'), supersedesAssignmentId: nullableId(d['supersedesAssignmentId'] ?? null, 'superseded assignment')
  };
  if (!published && d['publishedAt'] !== null)
    fail('Prepared snapshot cannot claim publication');
  return {
    ...result, publishedAt: published ? time(d['publishedAt'], 'publication time') : null
  };
}
export function parsePreparedSnapshot(value: unknown): PreparedTeachingSnapshot { const v = parseSnapshot(value, false); return {
  ...v, publishedAt: null
}; }
export function parsePublishedSnapshot(value: unknown): PublishedTeachingSnapshot {
  const v = parseSnapshot(value, true);
  if (v.publishedAt === null)
    return fail('Publication timestamp missing');
  return {
    ...v, publishedAt: v.publishedAt
  };
}
export interface TeachingValidationContext {
  readonly ref: TeachingRef;
  readonly validGroupIds: readonly string[];
  readonly mode?: 'publication' | 'history';
}
function receipt(value: unknown, ref: TeachingRef): RetainedAssetReceipt {
  const d = fields(value, ['assetId', 'storagePath', 'sha256', 'contentType', 'byteLength', 'verifiedAt', 'sourceCardId', 'sourcePacketDigest'], [], 'asset receipt');
  const assetId = id(d['assetId'], 'asset ID'), path = `assessment-assets/${id(ref.teamId, 'team')}/${id(ref.seasonId, 'season')}/${id(ref.assignmentId, 'assignment')}/${assetId}`;
  if (d['storagePath'] !== path)
    fail('Asset receipt scope/path mismatch');
  const sha256 = text(d['sha256'], 64, 'asset SHA256');
  if (!/^[a-f0-9]{64}$/u.test(sha256))
    fail('Asset SHA256 is invalid');
  const byteLength = d['byteLength'];
  if (typeof byteLength !== 'number' || !Number.isSafeInteger(byteLength) || byteLength <= 0 || byteLength > limits.maxImageBytes)
    fail('Asset bytes exceed the bound');
  const sourcePacketDigest = d['sourcePacketDigest'] === null ? null : text(d['sourcePacketDigest'], 64, 'packet digest');
  if (sourcePacketDigest !== null && !/^[a-f0-9]{64}$/u.test(sourcePacketDigest))
    fail('Packet digest is invalid');
  return {
    assetId, storagePath: path, sha256, contentType: oneOf(d['contentType'], ['image/png', 'image/jpeg', 'image/webp'], 'image type'), byteLength, verifiedAt: time(d['verifiedAt'], 'asset verification time'), sourceCardId: nullableId(d['sourceCardId'], 'source card'), sourcePacketDigest
  };
}
export function parseFrozenKeys(value: unknown, snapshot: PreparedTeachingSnapshot | PublishedTeachingSnapshot, context: TeachingValidationContext): CompleteFrozenAssignmentKeys {
  estimateDocumentBytes(value, `teams/${context.ref.teamId}/seasons/${context.ref.seasonId}/assignmentKeys/${context.ref.assignmentId}`);
  const d = fields(value, ['formatVersion', 'digest', 'keys', 'groupSnapshot', 'assetReceipts'], [], 'private snapshot');
  if (d['formatVersion'] !== 1 || d['digest'] !== snapshot.digest)
    fail('Private snapshot identity mismatch');
  const raw = fields(d['keys'], QUESTION_SLOTS, [], 'frozen keys');
  const keys = Object.fromEntries(QUESTION_SLOTS.map(slot => {
    const q = snapshot.questions[slot], k = raw[slot];
    if (q === null || q.kind === 'unclear') {
      if (k !== null)
        fail('Unused/unclear questions have no key');
      return [slot, null];
    }
    const answer = text(k, q.kind === 'read' ? limits.maxChoiceCharacters : limits.maxRubricCharacters, 'frozen answer');
    if (q.kind === 'read' && !q.options.includes(answer))
      fail('Frozen choice is not in the question');
    return [slot, answer];
  })) as FrozenKeySlots;
  const groups = record(d['groupSnapshot'], 'frozen groups'), expected = new Set(snapshot.expectedProfileIds);
  if (Object.keys(groups).length !== expected.size || Object.keys(groups).some(p => !expected.has(p)))
    fail('Frozen groups must cover exactly the expected profiles');
  const validGroups = new Set(context.validGroupIds.map(g => id(g, 'configured group')));
  const groupSnapshot = Object.fromEntries(snapshot.expectedProfileIds.map(profile => {
    const values = ids(groups[profile], context.mode === 'history' ? Number.MAX_SAFE_INTEGER : validGroups.size, 'profile groups');
    if (context.mode !== 'history' && values.some(g => !validGroups.has(g)))
      fail('Unrecognized frozen group');
    return [profile, values];
  }));
  const assetReceipts = list(d['assetReceipts'], limits.maxAssetsPerAssignment, 'asset receipts').map(x => receipt(x, context.ref));
  const assetIds = new Set(assetReceipts.map(x => x.assetId));
  if (assetIds.size !== assetReceipts.length || assetIds.size !== snapshot.assets.length || snapshot.assets.some(a => !assetIds.has(a)))
    fail('Asset receipts must exactly cover the snapshot');
  const result = {
    formatVersion: 1 as const, digest: snapshot.digest, keys, groupSnapshot, assetReceipts
  };
  estimateDocumentBytes(result, `teams/${context.ref.teamId}/seasons/${context.ref.seasonId}/assignmentKeys/${context.ref.assignmentId}`);
  return result;
}
export function parseResponses(value: unknown, snapshot: PreparedTeachingSnapshot | PublishedTeachingSnapshot, state: 'draft' | 'submitted'): ResponseSlots {
  const raw = fields(value, QUESTION_SLOTS, [], 'responses');
  return Object.fromEntries(QUESTION_SLOTS.map(slot => {
    const q = snapshot.questions[slot], v = raw[slot];
    if (q === null) {
      if (v !== null)
        fail('Unused slot has an answer');
      return [slot, null];
    }
    if (v === null) {
      if (state === 'submitted' && q.kind !== 'unclear')
        fail('Required answer missing');
      return [slot, null];
    }
    if (q.kind === 'unclear' && typeof v === 'object') {
      const unclear = fields(v, ['nothingRightNow'], [], 'unclear response');
      if (unclear['nothingRightNow'] !== true)
        fail('Unclear response is invalid');
      return [slot, {
          nothingRightNow: true as const
        }];
    }
    const answer = text(v, q.kind === 'read' ? limits.maxChoiceCharacters : limits.maxResponseCharacters, 'answer', state === 'draft' || q.kind === 'unclear');
    if (q.kind === 'read' && !q.options.includes(answer))
      fail('Answer is not an allowed option');
    return [slot, answer];
  })) as ResponseSlots;
}
/** Conservative SDK-free upper bound for this JSON-only schema, including value/map/name overhead. */
export function estimateDocumentBytes(value: unknown, path: string): number {
  const bytes = (s: string) => new TextEncoder().encode(s).byteLength;
  function size(item: unknown, depth: number): number {
    if (depth > 20)
      return fail('Document nesting exceeds the backend limit');
    if (item === null || typeof item === 'boolean')
      return 17;
    if (typeof item === 'string')
      return bytes(item) + 16;
    if (typeof item === 'number' && Number.isFinite(item))
      return 24;
    if (Array.isArray(item))
      return 32 + (item as readonly unknown[]).reduce<number>((sum, x) => sum + 16 + size(x, depth + 1), 0);
    const data = record(item, 'document value');
    return 32 + Object.entries(data).reduce((sum, [key, x]) => sum + bytes(key) + 32 + size(x, depth + 1), 0);
  }
  const result = bytes(path) + 64 + size(value, 0);
  if (result > limits.maxFirestoreDocumentBytes)
    fail('Document exceeds the preflight byte budget');
  return result;
}
/** Decoding does not establish server acknowledgement; only the adapter may issue a receipt. */
export function parseAttempt(value: unknown, snapshot: PreparedTeachingSnapshot | PublishedTeachingSnapshot, profileId: string): TeachingAttempt {
  const d = fields(value, ['formatVersion','digest','profileId','state','revision','responses','submittedAt'], [], 'attempt');
  if (d['formatVersion'] !== 1 || d['digest'] !== snapshot.digest || d['profileId'] !== profileId)
    fail('Attempt identity or version mismatch');
  const revision = d['revision'];
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0)
    fail('Attempt revision is invalid');
  const state = oneOf(d['state'], ['draft','submitted'], 'attempt state');
  const base = {formatVersion:1 as const,digest:snapshot.digest,profileId:id(profileId,'attempt profile'),revision,responses:parseResponses(d['responses'],snapshot,state)};
  if (state === 'draft') {
    if (d['submittedAt'] !== null) fail('Draft cannot claim a submission time');
    return {...base,state,submittedAt:null};
  }
  return {...base,state,submittedAt:time(d['submittedAt'],'submission time')};
}

/** Drafts permit unfinished text/choices; publication remains a separate stricter parse. */
export function parseTeachingDefinitionInput(value: unknown): TeachingDefinitionInput {
  const d = fields(value, ['title','purpose','takeaway','questions','supportingCardIds','groupIds','provenance'], [], 'definition')
  const takeaway = fields(d['takeaway'], ['key','rule','commonMistake'], [], 'takeaway')
  const questions = list(d['questions'], limits.maxQuestions, 'questions').map(value => {
    const q = fields(value, ['id','kind','prompt','options'], [], 'draft question')
    const base = { id: id(q['id'], 'question ID'), prompt: text(q['prompt'], limits.maxPromptCharacters, 'prompt', true) }
    const kind = oneOf(q['kind'], ['read','teachBack','unclear'], 'question kind')
    const options = list(q['options'], kind === 'read' ? limits.maxReadChoices : 0, 'options').map(x => text(x, limits.maxChoiceCharacters, 'option', true))
    if (kind === 'read') {
      if (options.length < limits.minReadChoices) fail('A draft read item keeps at least two choice fields')
      return { ...base, kind, options: options as unknown as ReadChoices }
    }
    return { ...base, kind, options: [] as const }
  })
  if (new Set(questions.map(q => q.id)).size !== questions.length) fail('Question IDs must be unique')
  return {
    title: text(d['title'], limits.maxDefinitionTitleCharacters, 'title', true),
    purpose: oneOf(d['purpose'], ['foundation','reminder','connection'], 'purpose'),
    takeaway: { key: text(takeaway['key'],500,'key',true), rule: text(takeaway['rule'],500,'rule',true), commonMistake: text(takeaway['commonMistake'],500,'common mistake',true) },
    questions, supportingCardIds: ids(d['supportingCardIds'], limits.maxReferenceIds, 'supporting cards'),
    groupIds: ids(d['groupIds'], limits.maxReferenceIds, 'groups'), provenance: text(d['provenance'],limits.maxProvenanceCharacters,'provenance',true),
  }
}
export function parseDefinitionKeys(value: unknown, input: TeachingDefinitionInput): DefinitionKeyInput {
  const d = fields(value, ['answersByQuestionId'], [], 'private draft keys')
  const answers = fields(d['answersByQuestionId'], input.questions.map(q => q.id), [], 'private answers')
  return { answersByQuestionId: Object.fromEntries(input.questions.map(q => {
    const v = answers[q.id]
    if (q.kind === 'unclear' && v !== null) fail('Unclear has no correctness key')
    if (v !== null) {
      text(v, limits.maxRubricCharacters, 'draft key', true)
      if (q.kind === 'read' && !q.options.includes(v as string)) fail('Read key must name a current choice')
    }
    return [q.id, v as string | null]
  })) }
}
export function parseTeachingDefinitionDocument(value: unknown, teamId: string, quizId: string): TeachingDefinition {
  const d = fields(value, ['formatVersion','writeId','revision','createdAt','updatedAt','archivedAt','deletedAt','title','purpose','takeaway','questions','supportingCardIds','groupIds','provenance'], [], 'stored definition')
  if (d['formatVersion'] !== 1) fail('Unsupported teaching definition version')
  if (!Number.isSafeInteger(d['revision']) || Number(d['revision']) < 1) fail('Invalid draft revision')
  const { writeId: _writeId, formatVersion: _version, revision: _revision, createdAt: _created, updatedAt: _updated, archivedAt: _archived, deletedAt: _deleted, ...input } = d
  return { ...parseTeachingDefinitionInput(input), formatVersion: 1, writeId: id(d['writeId'],'write ID'), id: id(quizId,'quiz ID'), teamId: id(teamId,'team ID'), revision: Number(d['revision']), createdAt: time(d['createdAt'],'created at'), updatedAt: time(d['updatedAt'],'updated at'), archivedAt: d['archivedAt'] === null ? null : time(d['archivedAt'],'archive time'), deletedAt: d['deletedAt'] === null ? null : time(d['deletedAt'],'delete time') }
}
