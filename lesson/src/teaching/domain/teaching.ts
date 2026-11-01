import type { IsoDateString } from './types.ts'

/** SDK-free contract. Types do not validate network data or replace Security Rules. */
export type TeachingPurpose = 'foundation' | 'reminder' | 'connection'
export type StudyMode = 'supported' | 'memory'
export type QuestionKind = 'read' | 'teachBack' | 'unclear'
export type FollowUpOutcome = 'resolved' | 'stillUnclear' | 'notYetChecked'
export type QuestionSlot = 'q0' | 'q1' | 'q2' | 'q3' | 'q4' | 'q5' | 'q6' | 'q7' | 'q8' | 'q9'
export type ReadChoices =
  | readonly [string, string]
  | readonly [string, string, string]
  | readonly [string, string, string, string]
  | readonly [string, string, string, string, string]

interface QuestionText {
  readonly id: string
  readonly prompt: string
}
export type TeachingQuestion = QuestionText & (
  | { readonly kind: 'read'; readonly options: ReadChoices }
  | { readonly kind: 'teachBack'; readonly options: readonly [] }
  | { readonly kind: 'unclear'; readonly options: readonly [] }
)
export type QuestionSlots = Readonly<Record<QuestionSlot, TeachingQuestion | null>> & {
  readonly q0: TeachingQuestion
}
export type FrozenKeySlots = Readonly<Record<QuestionSlot, string | null>>
export type TeachingResponse = string | { readonly nothingRightNow: true } | null
export type ResponseSlots = Readonly<Record<QuestionSlot, TeachingResponse>>

export interface TeachingRef {
  readonly teamId: string
  readonly seasonId: string
  readonly assignmentId: string
}
export interface AttemptRef extends TeachingRef {
  readonly profileId: string
}
export interface TeachingTakeaway {
  readonly key: string
  readonly rule: string
  readonly commonMistake: string
}

/** Reusable coach draft; incomplete/zero-question drafts are allowed, publishing is stricter. */
export interface TeachingDefinitionInput {
  readonly title: string
  readonly purpose: TeachingPurpose
  readonly takeaway: TeachingTakeaway
  readonly questions: readonly TeachingQuestion[]
  readonly supportingCardIds: readonly string[]
  readonly groupIds: readonly string[]
  readonly provenance: string
}
export interface TeachingDefinition extends TeachingDefinitionInput {
  readonly formatVersion: 1
  readonly writeId: string
  readonly updatedAt: IsoDateString
  readonly id: string
  readonly teamId: string
  readonly revision: number
  readonly createdAt: IsoDateString
  readonly archivedAt: IsoDateString | null
  readonly deletedAt: IsoDateString | null
}
export interface DefinitionKeyInput {
  readonly answersByQuestionId: Readonly<Record<string, string | null>>
}

/** Exact public payload fields accepted by the repaired header rules. Scope/ID live in the path. */
interface TeachingSnapshotFields {
  readonly formatVersion: 1
  readonly digest: string
  readonly quizId: string
  readonly questions: QuestionSlots
  readonly expectedProfileIds: readonly string[]
  readonly assets: readonly string[]
  readonly purpose: TeachingPurpose
  readonly instruction: StudyMode
  readonly takeaway: TeachingTakeaway
  readonly changeNotice: string
  readonly dueAt: IsoDateString | null
  readonly parentAssignmentId: string | null
  readonly provenance?: string
  readonly installDayId?: string | null
  readonly supersedesAssignmentId?: string | null
}
export interface PreparedTeachingSnapshot extends TeachingSnapshotFields {
  readonly publishedAt: null
}
export interface PublishedTeachingSnapshot extends TeachingSnapshotFields {
  readonly publishedAt: IsoDateString
}
/** Coach-private; diagram-role IDs must never substitute for roster profile IDs. */
export type FrozenGroupSnapshot = Readonly<Record<string, readonly string[]>>
export interface FrozenAssignmentKeys {
  readonly formatVersion: 1
  readonly digest: string
  readonly keys: FrozenKeySlots
  readonly groupSnapshot?: FrozenGroupSnapshot
  readonly assetReceipts?: readonly RetainedAssetReceipt[]
}
export interface CompleteFrozenAssignmentKeys extends FrozenAssignmentKeys {
  readonly groupSnapshot: FrozenGroupSnapshot
  readonly assetReceipts: readonly RetainedAssetReceipt[]
}
export interface QuestionValidationRecord {
  readonly digest: string
  readonly questionIds: readonly string[]
}
export interface AssignmentState {
  readonly digest: string
  readonly state: 'active' | 'withdrawn'
  readonly revision: number
  readonly publishedAt: IsoDateString
}
export interface PublishedAssignment {
  readonly ref: TeachingRef
  readonly snapshot: PublishedTeachingSnapshot
  readonly state: AssignmentState
}

interface AttemptFields {
  readonly formatVersion: 1
  readonly digest: string
  readonly profileId: string
  readonly revision: number
  readonly responses: ResponseSlots
}
export interface DraftAttempt extends AttemptFields {
  readonly state: 'draft'
  readonly submittedAt: null
}
export interface SubmittedAttempt extends AttemptFields {
  readonly state: 'submitted'
  readonly submittedAt: IsoDateString
}
export type TeachingAttempt = DraftAttempt | SubmittedAttempt
export interface SubmissionReceipt {
  readonly ref: AttemptRef
  readonly snapshotDigest: string
  readonly submittedAt: IsoDateString
}
export type SubmissionResult =
  | { readonly kind: 'confirmed'; readonly receipt: SubmissionReceipt }
  | { readonly kind: 'pending'; readonly ref: TeachingRef }

/** Coach-private verification receipt, never a field on the public header. */
export interface RetainedAssetReceipt {
  readonly assetId: string
  readonly storagePath: string
  readonly sha256: string
  readonly contentType: 'image/png' | 'image/jpeg' | 'image/webp'
  readonly byteLength: number
  readonly verifiedAt: IsoDateString
  readonly sourceCardId: string | null
  readonly sourcePacketDigest: string | null
}
export interface PreparedPublication {
  readonly ref: TeachingRef
  readonly snapshot: PreparedTeachingSnapshot
  readonly privateKeys: CompleteFrozenAssignmentKeys
}
/** Coach choices for one publication; recipients/material/day are re-read authoritatively by the adapter. */
export interface PublicationRequest {
  readonly ref: TeachingRef
  readonly quizId: string
  readonly expectedProfileIds: readonly string[]
  readonly instruction: StudyMode
  readonly dueAt: IsoDateString | null
  readonly changeNotice: string
  readonly assets: readonly RetainedAssetReceipt[]
  readonly installDayId: string | null
  readonly parentAssignmentId: string | null
}
export interface PublicationPreview {
  readonly publication: PreparedPublication
  readonly previewDigest: string
  /** Exact preconditions rechecked inside the activation transaction; null = frozen parent material. */
  readonly definitionRevision: number | null
  readonly dayBaseline: string | null
}
export interface ConfirmedPublication {
  readonly preview: PublicationPreview
  readonly confirmedPreviewDigest: string
}
export interface PublicationReceipt {
  readonly ref: TeachingRef
  readonly snapshotDigest: string
  readonly publishedAt: IsoDateString
}
export type PublicationResult =
  | { readonly kind: 'confirmed'; readonly receipts: readonly PublicationReceipt[] }
  | { readonly kind: 'pending'; readonly refs: readonly TeachingRef[] }
export type PublicationProgress =
  | { readonly kind: 'absent' }
  | { readonly kind: 'prepared'; readonly digest: string }
  | { readonly kind: 'validating'; readonly digest: string; readonly lastValidatedSlot: QuestionSlot; readonly questionIds: readonly string[] }
  | { readonly kind: 'published'; readonly receipt: PublicationReceipt }

export interface ReleasedQuestionFeedback {
  readonly questionId: string
  readonly judgment: 'correct' | 'needsCorrection' | null
  readonly explanation: string
}
/** Read contract for the later explicit-release implementation; review/release writes remain denied. */
export interface FeedbackRelease {
  readonly releaseId: string
  readonly releasedBy: string
  readonly releasedAt: IsoDateString
  readonly reviewRevision: number
  readonly supersedesReleaseId: string | null
  readonly questions: readonly ReleasedQuestionFeedback[]
}
export type OwnRequirement = 'required' | 'excused' | 'optional' | 'withdrawn'
