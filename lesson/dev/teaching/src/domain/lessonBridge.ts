import type { TeachingPurpose, TeachingTakeaway } from './teaching.ts'

/** Manual data bridge. Diagram role IDs are never roster profile IDs. */
export interface LessonBridgeV1 {
  readonly formatVersion: 1
  readonly sourceProject: 'football-os'
  readonly sourcePlayId: string
  readonly sourceLessonId: string
  readonly sourceRevision: number
  readonly sourceDigest: string
  readonly playerAssetSha256: string
  readonly playerAssetPath: string
  readonly purpose: TeachingPurpose
  readonly objective: string
  readonly cues: readonly string[]
  readonly takeaway: TeachingTakeaway
  readonly provenance: string
  readonly approvalStatus: 'illustrative-ungraded'
}
