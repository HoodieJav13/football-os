import { TEACHING_CONFIG } from '../config/teachingConfig.ts'
import type {
  DefinitionKeyInput, PreparedPublication, PreparedTeachingSnapshot, RetainedAssetReceipt,
  StudyMode, TeachingDefinition, TeachingRef,
} from './teaching.ts'
import {
  parseDefinitionKeys, parseFrozenKeys, parsePreparedSnapshot, parseTeachingDefinitionDocument,
  QUESTION_SLOTS, TeachingValidationError,
} from './teachingValidation.ts'

/** Preflight shape only. Task4 must still integrate this union into the install adapter/UI. */
export type PublicationInstallItem =
  | { readonly cardId: string; readonly quizId?: never; readonly sort: number }
  | { readonly quizId: string; readonly cardId?: never; readonly sort: number }

function identifier(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > TEACHING_CONFIG.limits.maxStableIdCharacters || value.includes('/')) {
    throw new TeachingValidationError('Invalid publication identifier')
  }
  return value
}

export function parseInstallItems(value: unknown): readonly PublicationInstallItem[] {
  if (!Array.isArray(value)) throw new TeachingValidationError('Install items must be an array')
  const result = (value as readonly unknown[]).map((entry): PublicationInstallItem => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) throw new TeachingValidationError('Invalid install item')
    const item = entry as Record<string, unknown>
    const keys = Object.keys(item)
    const card = Object.hasOwn(item, 'cardId')
    const quiz = Object.hasOwn(item, 'quizId')
    if (card === quiz || keys.length !== 2 || !Object.hasOwn(item, 'sort')) throw new TeachingValidationError('Install items require exactly one card or quiz reference and sort')
    const sort = item['sort']
    if (typeof sort !== 'number' || !Number.isSafeInteger(sort) || sort < 0) throw new TeachingValidationError('Invalid install sort')
    return card ? { cardId: identifier(item['cardId']), sort } : { quizId: identifier(item['quizId']), sort }
  }).toSorted((a, b) => a.sort - b.sort)
  const ids = result.map(item => item.quizId === undefined ? `card:${item.cardId}` : `quiz:${item.quizId}`)
  if (new Set(ids).size !== ids.length || result.some((item, index) => item.sort !== index)) {
    throw new TeachingValidationError('Install items require unique references and contiguous zero-based ordering')
  }
  return result
}

export interface TeachingPublicationInput {
  readonly ref: TeachingRef
  readonly definition: TeachingDefinition
  readonly privateKeys: DefinitionKeyInput
  readonly expectedProfileIds: readonly string[]
  /** Authoritative eligibility is the future adapter's responsibility; this helper validates supplied data only. */
  readonly roster: readonly { readonly profileId: string; readonly groupIds: readonly string[] }[]
  readonly validGroupIds: readonly string[]
  readonly instruction: StudyMode
  readonly dueAt: string | null
  readonly changeNotice: string
  readonly assets: readonly RetainedAssetReceipt[]
  readonly installDayId: string | null
  readonly parentAssignmentId: string | null
}

/** Stable public payload identity. Private answers are deliberately excluded from public digests. */
export function canonicalTeachingJson(value: unknown): string {
  if (Array.isArray(value)) return `[${(value as readonly unknown[]).map(canonicalTeachingJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalTeachingJson(item)}`).join(',')}}`
  }
  if (typeof value === 'undefined') throw new TeachingValidationError('Publication data cannot contain undefined')
  return JSON.stringify(value)
}

export async function buildTeachingPublication(input: TeachingPublicationInput): Promise<PreparedPublication> {
  const ref = {
    teamId: identifier(input.ref.teamId), seasonId: identifier(input.ref.seasonId), assignmentId: identifier(input.ref.assignmentId),
  }
  const { id, teamId, ...stored } = input.definition
  const definition = parseTeachingDefinitionDocument(stored, teamId, id)
  if (definition.teamId !== ref.teamId || definition.archivedAt !== null || definition.deletedAt !== null) {
    throw new TeachingValidationError('Publication requires an available same-team definition')
  }
  const keys = parseDefinitionKeys(input.privateKeys, definition)
  const roster = new Map(input.roster.map(member => [identifier(member.profileId), member]))
  if (roster.size !== input.roster.length || input.expectedProfileIds.some(profileId => !roster.has(profileId))) {
    throw new TeachingValidationError('Expected recipients must be explicit current roster profiles')
  }
  const slots = Object.fromEntries(QUESTION_SLOTS.map((slot, index) => [slot, definition.questions[index] ?? null]))
  const body = {
    formatVersion: 1, quizId: definition.id, questions: slots, expectedProfileIds: [...input.expectedProfileIds],
    assets: input.assets.map(asset => asset.assetId), purpose: definition.purpose, instruction: input.instruction,
    takeaway: definition.takeaway, publishedAt: null, changeNotice: input.changeNotice, dueAt: input.dueAt,
    parentAssignmentId: input.parentAssignmentId, provenance: definition.provenance, installDayId: input.installDayId,
  }
  // Normalize optional fields before identity is calculated; persisted data must
  // reproduce the digest without knowledge of which fields a caller omitted.
  const { digest: _temporaryDigest, ...publicBody } = parsePreparedSnapshot({ ...body, digest: 'preflight' })
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalTeachingJson({ ref, snapshot: publicBody })))
  const digest = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
  const snapshot: PreparedTeachingSnapshot = parsePreparedSnapshot({ ...publicBody, digest })
  const frozenKeys = Object.fromEntries(QUESTION_SLOTS.map((slot, index) => {
    const question = definition.questions[index]
    return [slot, question === undefined || question.kind === 'unclear' ? null : keys.answersByQuestionId[question.id]]
  }))
  const groupSnapshot = Object.fromEntries(input.expectedProfileIds.map(profileId => [profileId, [...(roster.get(profileId)?.groupIds ?? [])]]))
  const privateKeys = parseFrozenKeys({ formatVersion: 1, digest, keys: frozenKeys, groupSnapshot, assetReceipts: input.assets }, snapshot, { ref, validGroupIds: input.validGroupIds, mode: 'publication' })
  return { ref, snapshot, privateKeys }
}
