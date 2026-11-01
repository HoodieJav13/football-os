/**
 * Synthetic, coach-only bridge from a scheme projection to the completed Teaching Loop.
 * It adds no teaching domain of its own: publication, attempts, review and release all run
 * through the existing pure models over in-memory state. No SDK, no store adapter, no
 * persistence and no real profiles. Correctness stays a coach judgment and is never computed.
 */
import type {
  DefinitionKeyInput, FeedbackRelease, PreparedPublication, SubmissionResult, TeachingAttempt, TeachingDefinitionInput, TeachingQuestion,
  TeachingRef, TeachingTakeaway, PublishedTeachingSnapshot,
} from './teaching.ts'
import { buildTeachingPublication, canonicalTeachingJson } from './teachingPublication.ts'
import { buildAssignmentReview, releaseSlots, reviewSlots } from './teachingReview.ts'
import type { AssignmentReviewModel, Review, ReviewInput } from './teachingReview.ts'
import { parseAttempt, parseDefinitionKeys, parsePublishedSnapshot, parseTeachingDefinitionDocument, parseTeachingDefinitionInput, QUESTION_SLOTS, TeachingValidationError } from './teachingValidation.ts'

export const MAX_ASSIGNMENT_QUESTIONS = QUESTION_SLOTS.length
export const ROLE_GROUP_SIZE = 6

interface ProjectionCard {
  readonly card: number
  readonly total: number
  readonly prompt: string
  readonly context: { readonly callName: string; readonly situation: string }
  readonly look?: { readonly offense: readonly { readonly label: string; readonly x: number; readonly y: number }[]; readonly defense: readonly { readonly label: string; readonly x: number; readonly y: number }[]; readonly fieldSide?: string }
  readonly frame?: { readonly minX: number; readonly maxX: number; readonly minY: number; readonly maxY: number }
}
export interface IdentifyProjection {
  readonly held: boolean
  readonly reason?: string
  readonly cards?: readonly ProjectionCard[]
}
export interface CoachKeySheet {
  readonly entries: readonly { readonly card: number; readonly questionId: string; readonly answer: string | null }[]
}
export interface SchemeSource {
  readonly packageId: string
  readonly revision: number
  readonly contentDigest: string
  readonly callId: string
  readonly callDigest: string
  readonly approvalStatus: string
}
export interface HeldQuestion { readonly card: number; readonly reason: string }
export interface SchemeTeachingDraft {
  readonly definition: TeachingDefinitionInput
  readonly privateKeys: DefinitionKeyInput
  readonly held: readonly HeldQuestion[]
  readonly source: SchemeSource
  readonly cardNumbers: readonly number[]
  readonly pictureContent: string
}

/** Eleven roles exceed one assignment's ten slots, so they travel in alignment-order groups. */
export function roleGroups(total: number, size: number = ROLE_GROUP_SIZE): readonly (readonly number[])[] {
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_ASSIGNMENT_QUESTIONS) throw new TeachingValidationError('A role group must fit the assignment question slots')
  const cards = Array.from({ length: total }, (_, index) => index + 1)
  return Array.from({ length: Math.ceil(total / size) }, (_, index) => cards.slice(index * size, (index + 1) * size))
}

const SYNTHETIC_TAKEAWAY: TeachingTakeaway = {
  key: 'Synthetic check of an authored call',
  rule: 'Illustrative test material, not adopted program doctrine',
  commonMistake: 'Not authored for this synthetic check',
}

/** Cards without an approved revision or an authored key are held, never given an invented answer. */
export function buildSchemeTeachingDraft(input: {
  readonly identifyProjection: IdentifyProjection
  readonly coachKeySheet: CoachKeySheet
  readonly source: SchemeSource
  readonly cardNumbers: readonly number[]
  readonly title: string
}): SchemeTeachingDraft {
  const { identifyProjection, coachKeySheet, source, cardNumbers, title } = input
  if (cardNumbers.length > MAX_ASSIGNMENT_QUESTIONS) throw new TeachingValidationError('One assignment holds at most ten questions; use role groups')
  const blocked = source.approvalStatus !== 'approved' ? 'package-not-approved' : identifyProjection.held ? (identifyProjection.reason ?? 'projection-held') : null
  const held: HeldQuestion[] = []
  const questions: TeachingQuestion[] = []
  const answersByQuestionId: Record<string, string | null> = {}
  for (const number of cardNumbers) {
    if (blocked !== null) { held.push({ card: number, reason: blocked }); continue }
    const card = identifyProjection.cards?.find(item => item.card === number)
    const entry = coachKeySheet.entries.find(item => item.card === number)
    if (card === undefined || entry === undefined) { held.push({ card: number, reason: 'unknown-card' }); continue }
    if (entry.answer === null) { held.push({ card: number, reason: 'missing-key' }); continue }
    questions.push({ id: entry.questionId, kind: 'teachBack', options: [], prompt: `${card.context.callName}. ${card.context.situation}. ${card.prompt} (Card ${String(card.card)} of ${String(card.total)})` })
    answersByQuestionId[entry.questionId] = entry.answer
  }
  const definition = parseTeachingDefinitionInput({
    title, purpose: 'foundation', takeaway: SYNTHETIC_TAKEAWAY, questions, supportingCardIds: [], groupIds: [],
    provenance: 'Synthetic local teaching check. Illustrative, not adopted doctrine.',
  })
  const labels = new Set(['LT', 'LG', 'C', 'RG', 'RT', 'X', 'Y', 'F', 'Z', 'H', 'Q'])
  const pictures = (identifyProjection.cards ?? []).map(card => ({
    card: card.card, total: card.total, prompt: card.prompt, context: { callName: card.context.callName, situation: card.context.situation },
    ...(card.look === undefined ? {} : { look: {
      offense: card.look.offense.map((player, i) => ({ id: `o${String(i + 1)}`, label: labels.has(player.label) ? player.label : `O${String(i + 1)}`, x: player.x, y: player.y })),
      defense: card.look.defense.map((player, i) => ({ id: `d${String(i + 1)}`, label: player.label === '★' ? '★' : '', x: player.x, y: player.y })),
      fieldSide: card.look.fieldSide === 'left' || card.look.fieldSide === 'right' ? card.look.fieldSide : 'none',
    } }),
    ...(card.frame === undefined ? {} : { frame: { minX: card.frame.minX, maxX: card.frame.maxX, minY: card.frame.minY, maxY: card.frame.maxY } }),
  }))
  return { definition, privateKeys: parseDefinitionKeys({ answersByQuestionId }, definition), held, source, cardNumbers: [...cardNumbers], pictureContent: canonicalTeachingJson(pictures) }
}

export interface SyntheticAssignment {
  readonly ref: TeachingRef
  readonly snapshot: PublishedTeachingSnapshot
  readonly cardNumbers: readonly number[]
  readonly pictureCards: readonly ProjectionCard[]
}
interface Stored extends SyntheticAssignment {
  readonly source: SchemeSource
  readonly privateKeys: PreparedPublication['privateKeys']
  readonly attempts: Map<string, TeachingAttempt>
  readonly reviews: Map<string, Review>
  readonly releases: Map<string, FeedbackRelease[]>
  readonly fieldObservations: Map<string, string>
}
export interface TeachingStatus {
  readonly submission: 'none' | 'acknowledged'
  readonly coachRelease: 'not-released' | 'released'
  readonly fieldObserved: 'not-observed' | 'observed'
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const refKey = (ref: TeachingRef) => `${ref.teamId}/${ref.seasonId}/${ref.assignmentId}`
const emptyResponses = (): Record<string, string | null> => Object.fromEntries(QUESTION_SLOTS.map(slot => [slot, null]))

/** In-memory coach and learner sides of one synthetic session. Reloading the page discards it. */
export function createSyntheticTeachingLoop({ now = () => new Date().toISOString(), newId = () => crypto.randomUUID() }: { readonly now?: () => string; readonly newId?: () => string } = {}) {
  const assignments = new Map<string, Stored>()
  const get = (ref: TeachingRef): Stored => {
    const found = assignments.get(refKey(ref))
    if (found === undefined) throw new TeachingValidationError('That synthetic assignment does not exist')
    return found
  }

  async function publish(input: { readonly ref: TeachingRef; readonly draft: SchemeTeachingDraft; readonly expectedProfileIds: readonly string[]; readonly changeNotice: string; readonly parentAssignmentId?: string | null }): Promise<SyntheticAssignment> {
    const { ref, draft, expectedProfileIds, changeNotice, parentAssignmentId = null } = input
    if (assignments.has(refKey(ref))) throw new TeachingValidationError('That synthetic assignment already exists')
    const time = now()
    const pictureHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(draft.pictureContent))
    const fingerprint = Array.from(new Uint8Array(pictureHash), byte => byte.toString(16).padStart(2, '0')).join('')
    const definition = parseTeachingDefinitionDocument({ ...draft.definition, provenance: `${draft.definition.provenance} Player picture fingerprint ${fingerprint}.`, formatVersion: 1, writeId: newId(), revision: 1, createdAt: time, updatedAt: time, archivedAt: null, deletedAt: null }, ref.teamId, newId())
    const prepared = await buildTeachingPublication({
      ref, definition, privateKeys: draft.privateKeys, expectedProfileIds, roster: expectedProfileIds.map(profileId => ({ profileId, groupIds: [] })), validGroupIds: [],
      instruction: 'memory', dueAt: null, changeNotice, assets: [], installDayId: null, parentAssignmentId,
    })
    const snapshot = parsePublishedSnapshot({ ...prepared.snapshot, publishedAt: time })
    const stored: Stored = { ref, snapshot, source: draft.source, cardNumbers: draft.cardNumbers, pictureCards: JSON.parse(draft.pictureContent) as readonly ProjectionCard[], privateKeys: prepared.privateKeys, attempts: new Map(), reviews: new Map(), releases: new Map(), fieldObservations: new Map() }
    assignments.set(refKey(ref), stored)
    return learnerView(ref)
  }

  /** No keys, reviews or digests of private content. */
  function learnerView(ref: TeachingRef): SyntheticAssignment {
    const { snapshot, cardNumbers, pictureCards } = get(ref)
    return clone({ ref, snapshot, cardNumbers, pictureCards })
  }

  /** The acknowledgement carries identity and time only: no key, grade or correctness. */
  function submit(ref: TeachingRef, profileId: string, answers: Readonly<Record<string, string>>): SubmissionResult {
    const stored = get(ref)
    if (stored.attempts.has(profileId)) throw new TeachingValidationError('This response is already submitted and stays frozen')
    const responses = { ...emptyResponses(), ...answers }
    const submittedAt = now()
    const attempt = parseAttempt({ formatVersion: 1, digest: stored.snapshot.digest, profileId, state: 'submitted', revision: 1, responses, submittedAt }, stored.snapshot, profileId)
    stored.attempts.set(profileId, Object.freeze(attempt))
    return { kind: 'confirmed', receipt: { ref: { ...ref, profileId }, snapshotDigest: stored.snapshot.digest, submittedAt } }
  }

  const getAttempt = (ref: TeachingRef, profileId: string): TeachingAttempt | null => {
    const attempt = get(ref).attempts.get(profileId)
    return attempt === undefined ? null : clone(attempt)
  }

  function coachReview(ref: TeachingRef): { readonly model: AssignmentReviewModel; readonly keys: PreparedPublication['privateKeys']['keys'] } {
    const stored = get(ref)
    const model = buildAssignmentReview({ snapshot: stored.snapshot, keys: stored.privateKeys.keys, state: 'active', groupSnapshot: stored.privateKeys.groupSnapshot, attempts: [...stored.attempts.values()], excused: new Set<string>() })
    return { model, keys: clone(stored.privateKeys.keys) }
  }

  function saveReview(ref: TeachingRef, profileId: string, input: ReviewInput): Review {
    const stored = get(ref)
    const review: Review = { profileId, revision: (stored.reviews.get(profileId)?.revision ?? 0) + 1, slots: reviewSlots(stored.snapshot, input), updatedAt: now(), updatedBy: 'synthetic-coach' }
    stored.reviews.set(profileId, review)
    return clone(review)
  }

  /** Explicit coach action. Only reviewed questions and their player-safe fields leave. */
  function release(ref: TeachingRef, profileId: string): FeedbackRelease {
    const stored = get(ref)
    const review = stored.reviews.get(profileId)
    if (review === undefined) throw new TeachingValidationError('Save a review before releasing feedback')
    const earlier = stored.releases.get(profileId) ?? []
    const released = releaseSlots(review.slots)
    const questions = QUESTION_SLOTS.flatMap(slot => { const item = released[slot]; return item === null ? [] : [item] })
    if (questions.length === 0) throw new TeachingValidationError('Mark at least one question reviewed before releasing feedback')
    const feedback: FeedbackRelease = { releaseId: newId(), releasedBy: 'synthetic-coach', releasedAt: now(), reviewRevision: review.revision, supersedesReleaseId: earlier.at(-1)?.releaseId ?? null, questions }
    stored.releases.set(profileId, [...earlier, feedback])
    return clone(feedback)
  }

  const ownFeedback = (ref: TeachingRef, profileId: string): readonly FeedbackRelease[] => clone(get(ref).releases.get(profileId) ?? [])

  function recordFieldObservation(ref: TeachingRef, profileId: string, note: string): void {
    if (note.trim() === '') throw new TeachingValidationError('A field observation needs a coach note')
    get(ref).fieldObservations.set(profileId, note)
  }

  /** Three independent facts. There is deliberately no combined pass or ready field. */
  function statusOf(ref: TeachingRef, profileId: string): TeachingStatus {
    const stored = get(ref)
    return {
      submission: stored.attempts.has(profileId) ? 'acknowledged' : 'none',
      coachRelease: (stored.releases.get(profileId) ?? []).length > 0 ? 'released' : 'not-released',
      fieldObserved: stored.fieldObservations.has(profileId) ? 'observed' : 'not-observed',
    }
  }

  return { publish, learnerView, submit, getAttempt, coachReview, saveReview, release, ownFeedback, recordFieldObservation, statusOf }
}
