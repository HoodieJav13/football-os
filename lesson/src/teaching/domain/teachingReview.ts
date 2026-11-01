import { TEACHING_CONFIG } from '../config/teachingConfig.ts'
import type { IsoDateString } from './types.ts'
import type {
  CompleteFrozenAssignmentKeys, FeedbackRelease, FollowUpOutcome, FrozenGroupSnapshot, FrozenKeySlots, PublishedAssignment, PublishedTeachingSnapshot, QuestionSlot, StudyMode, TeachingRef,
  TeachingAttempt, TeachingQuestion, TeachingResponse,
} from './teaching.ts'
import { QUESTION_SLOTS, TeachingValidationError } from './teachingValidation.ts'

export type ReviewJudgment = 'correct' | 'needsCorrection' | null
export interface PlayerSafeFeedback {
  readonly judgment: ReviewJudgment
  readonly explanation: string
}
/** Coach-private in full. Only questionId + playerSafeFeedback of reviewed questions is ever released. */
export interface ReviewQuestionInput {
  readonly questionId: string
  readonly reviewed: boolean
  readonly needsFollowUp: boolean
  readonly privateNote: string
  readonly correctionNote: string | null
  readonly practiceDate: string | null
  readonly outcome: FollowUpOutcome
  readonly recheckAssignmentId: string | null
  readonly playerSafeFeedback: PlayerSafeFeedback
}
export interface ReviewInput {
  readonly questions: readonly ReviewQuestionInput[]
}
export type ReviewSlots = Readonly<Record<QuestionSlot, ReviewQuestionInput | null>>
export interface Review {
  readonly profileId: string
  readonly revision: number
  readonly slots: ReviewSlots
  readonly updatedAt: IsoDateString
  readonly updatedBy: string
}
export interface ReleasedSlot {
  readonly questionId: string
  readonly judgment: ReviewJudgment
  readonly explanation: string
}
export type ReleaseSlots = Readonly<Record<QuestionSlot, ReleasedSlot | null>>

const limits = TEACHING_CONFIG.limits
const OUTCOMES: readonly FollowUpOutcome[] = ['resolved', 'stillUnclear', 'notYetChecked']
function fail(message: string): never { throw new TeachingValidationError(message) }
function bounded(value: string, label: string): string {
  if (value.length > limits.maxResponseCharacters) fail(`${label} is too long`)
  return value
}

export function emptyReviewQuestion(questionId: string): ReviewQuestionInput {
  return { questionId, reviewed: false, needsFollowUp: false, privateNote: '', correctionNote: null, practiceDate: null,
    outcome: 'notYetChecked', recheckAssignmentId: null, playerSafeFeedback: { judgment: null, explanation: '' } }
}

/** Frozen-slot mapping enforced again by Security Rules; correctness stays a coach judgment. */
export function reviewSlots(snapshot: Pick<PublishedTeachingSnapshot, 'questions'>, input: ReviewInput): ReviewSlots {
  const byId = new Map(input.questions.map(q => [q.questionId, q]))
  if (byId.size !== input.questions.length) fail('Each question is reviewed once')
  const known = new Set(QUESTION_SLOTS.flatMap(slot => { const q = snapshot.questions[slot]; return q === null ? [] : [q.id] }))
  if (input.questions.some(q => !known.has(q.questionId))) fail('Review references a question outside this assignment')
  return Object.fromEntries(QUESTION_SLOTS.map(slot => {
    const question = snapshot.questions[slot], review = question === null ? undefined : byId.get(question.id)
    if (question === null || review === undefined) return [slot, null]
    const { judgment, explanation } = review.playerSafeFeedback
    if (question.kind === 'unclear' && judgment !== null) fail('An unclear response is never marked correct or incorrect')
    if (!([null, 'correct', 'needsCorrection'] as readonly unknown[]).includes(judgment)) fail('Unsupported judgment')
    if (!OUTCOMES.includes(review.outcome)) fail('Unsupported follow-up outcome')
    if (review.practiceDate !== null && !/^\d{4}-\d{2}-\d{2}$/u.test(review.practiceDate)) fail('Use a YYYY-MM-DD practice date')
    if (review.recheckAssignmentId !== null && (review.recheckAssignmentId === '' || review.recheckAssignmentId.length > limits.maxStableIdCharacters || review.recheckAssignmentId.includes('/'))) fail('Invalid recheck link')
    return [slot, {
      questionId: question.id, reviewed: review.reviewed, needsFollowUp: review.needsFollowUp,
      privateNote: bounded(review.privateNote, 'Private note'), correctionNote: review.correctionNote === null ? null : bounded(review.correctionNote, 'Correction note'),
      practiceDate: review.practiceDate, outcome: review.outcome, recheckAssignmentId: review.recheckAssignmentId,
      playerSafeFeedback: { judgment, explanation: bounded(explanation, 'Explanation') },
    }]
  })) as ReviewSlots
}

/** Copies only player-safe fields of reviewed questions; never a review object wholesale. */
export function releaseSlots(slots: ReviewSlots): ReleaseSlots {
  return Object.fromEntries(QUESTION_SLOTS.map(slot => {
    const review = slots[slot]
    return [slot, review?.reviewed !== true ? null
      : { questionId: review.questionId, judgment: review.playerSafeFeedback.judgment, explanation: review.playerSafeFeedback.explanation }]
  })) as ReleaseSlots
}

export interface SubmittedEntry {
  readonly profileId: string
  readonly response: TeachingResponse
  /** Coach-side assistance for read questions only; never shown to players or used as a grade. */
  readonly keyMatch: 'matches' | 'differs' | null
}
export interface QuestionGroup {
  readonly slot: QuestionSlot
  readonly question: TeachingQuestion
  readonly required: readonly SubmittedEntry[]
  readonly optional: readonly SubmittedEntry[]
}
export interface AssignmentReviewModel {
  readonly missing: readonly string[]
  readonly excused: readonly string[]
  readonly questions: readonly QuestionGroup[]
  readonly counts: { readonly expected: number; readonly submitted: number; readonly excused: number; readonly optionalPractice: number }
}
export interface AssignmentReviewInput {
  readonly snapshot: Pick<PublishedTeachingSnapshot, 'questions' | 'expectedProfileIds'>
  readonly keys: FrozenKeySlots
  readonly state: 'active' | 'withdrawn'
  readonly groupSnapshot: FrozenGroupSnapshot
  readonly attempts: readonly TeachingAttempt[]
  readonly excused: ReadonlySet<string>
  /** Frozen publication-time group; filtering is a coach view, never an access rule. */
  readonly groupId?: string | null
}

export function buildAssignmentReview(input: AssignmentReviewInput): AssignmentReviewModel {
  const { snapshot, keys, groupSnapshot, excused, groupId = null } = input
  const expected = new Set(snapshot.expectedProfileIds)
  const inGroup = (profileId: string) => groupId === null || (groupSnapshot[profileId] ?? []).includes(groupId)
  const submitted = input.attempts.filter(a => a.state === 'submitted' && inGroup(a.profileId))
  const submittedIds = new Set(submitted.map(a => a.profileId))
  const visibleExpected = snapshot.expectedProfileIds.filter(inGroup)
  const missing = input.state === 'withdrawn' ? [] : visibleExpected.filter(p => !excused.has(p) && !submittedIds.has(p))
  const questions = QUESTION_SLOTS.flatMap((slot): QuestionGroup[] => {
    const question = snapshot.questions[slot]
    if (question === null) return []
    const entry = (a: TeachingAttempt): SubmittedEntry => {
      const response = a.responses[slot], key = keys[slot]
      const keyMatch = question.kind !== 'read' || key === null || typeof response !== 'string' ? null : response === key ? 'matches' : 'differs'
      return { profileId: a.profileId, response, keyMatch }
    }
    return [{ slot, question, required: submitted.filter(a => expected.has(a.profileId)).map(entry), optional: submitted.filter(a => !expected.has(a.profileId)).map(entry) }]
  })
  const excusedVisible = visibleExpected.filter(p => excused.has(p))
  return {
    missing, excused: excusedVisible, questions,
    counts: {
      expected: visibleExpected.length - excusedVisible.length,
      submitted: visibleExpected.filter(p => !excused.has(p) && submittedIds.has(p)).length,
      excused: excusedVisible.length,
      optionalPractice: submitted.filter(a => !expected.has(a.profileId)).length,
    },
  }
}

/** Coach-only load result; keys and reviews never reach a player session. */
export interface AssignmentReviewData {
  readonly assignment: PublishedAssignment
  readonly keys: CompleteFrozenAssignmentKeys
  readonly model: AssignmentReviewModel
  readonly attempts: ReadonlyMap<string, TeachingAttempt>
  readonly reviews: ReadonlyMap<string, Review>
  readonly releases: ReadonlyMap<string, readonly FeedbackRelease[]>
  readonly recipientRevisions: ReadonlyMap<string, number>
}
export interface RecheckRequest {
  readonly ref: TeachingRef
  readonly parentAssignmentId: string
  readonly questionIds: readonly string[]
  readonly expectedProfileIds: readonly string[]
  readonly instruction: StudyMode
  readonly dueAt: string | null
  readonly changeNotice: string
}
