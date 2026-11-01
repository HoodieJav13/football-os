import raw from './teaching.json' with { type: 'json' }
import type { FollowUpOutcome, QuestionKind, StudyMode, TeachingPurpose } from '../domain/teaching.ts'

interface TeachingConfig {
  readonly formatVersion: number
  readonly purposes: Readonly<Record<TeachingPurpose, {
    readonly label: string
    readonly allowNoCheck: boolean
    readonly suggestedQuestions: Readonly<Record<QuestionKind, boolean>>
  }>>
  readonly questionKinds: Readonly<Record<QuestionKind, { readonly label: string; readonly coachJudgmentAllowed: boolean }>>
  readonly studyModes: Readonly<Record<StudyMode, { readonly label: string; readonly instruction: string }>>
  readonly followUpOutcomes: Readonly<Record<FollowUpOutcome, string>>
  readonly nothingRightNowLabel: string
  readonly quizColor: string
  readonly limits: Readonly<Record<
    'maxDefinitionTitleCharacters' | 'maxReferenceIds' | 'minPublishedQuestions' | 'maxQuestions' | 'minReadChoices' | 'maxReadChoices' |
    'maxChoiceCharacters' | 'maxPromptCharacters' | 'maxStableIdCharacters' | 'maxDigestCharacters' |
    'maxResponseCharacters' | 'maxRubricCharacters' | 'maxExpectedProfiles' | 'maxAssetsPerAssignment' |
    'maxImageBytes' | 'maxAssignmentsPerDayPublication' | 'maxTakeawayCharacters' |
    'maxChangeNoticeCharacters' | 'maxProvenanceCharacters' | 'maxFirestoreDocumentBytes', number>>
}

/** Suggestions are optional. No purpose becomes a card type or mandatory three-question check. */
export const TEACHING_CONFIG: TeachingConfig = raw
