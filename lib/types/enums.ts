export const UserRole = {
  member: 'member',
  administrator: 'administrator'
} as const
export type UserRole = (typeof UserRole)[keyof typeof UserRole]

export const MatchStatus = {
  pending: 'pending',
  verified: 'verified',
  disputed: 'disputed',
  corrected: 'corrected'
} as const
export type MatchStatus = (typeof MatchStatus)[keyof typeof MatchStatus]

export const RecordStatus = {
  active: 'active',
  archived: 'archived'
} as const
export type RecordStatus = (typeof RecordStatus)[keyof typeof RecordStatus]

export const RelationshipStatus = {
  active: 'active',
  ended: 'ended',
  archived: 'archived'
} as const
export type RelationshipStatus = (typeof RelationshipStatus)[keyof typeof RelationshipStatus]

export const EndpointType = {
  student: 'student',
  group: 'group'
} as const
export type EndpointType = (typeof EndpointType)[keyof typeof EndpointType]

export const VerificationStatus = {
  pending: 'pending',
  verified: 'verified',
  insufficient: 'insufficient',
  disputed: 'disputed'
} as const
export type VerificationStatus = (typeof VerificationStatus)[keyof typeof VerificationStatus]

export const SubmissionStatus = {
  pending: 'pending',
  awaiting_consent: 'awaiting_consent',
  approved: 'approved',
  rejected: 'rejected'
} as const
export type SubmissionStatus = (typeof SubmissionStatus)[keyof typeof SubmissionStatus]

export const SubmissionOperation = {
  create: 'create',
  update: 'update',
  archive: 'archive',
  correction: 'correction'
} as const
export type SubmissionOperation = (typeof SubmissionOperation)[keyof typeof SubmissionOperation]

export const EntityType = {
  student: 'student',
  trait: 'trait',
  evidence: 'evidence',
  group: 'group',
  group_membership: 'group_membership',
  group_role: 'group_role',
  relationship: 'relationship',
  trait_category: 'trait_category',
  relationship_type: 'relationship_type'
} as const
export type EntityType = (typeof EntityType)[keyof typeof EntityType]

export const ConsentStatus = {
  granted: 'granted',
  revoked: 'revoked',
  pending: 'pending'
} as const
export type ConsentStatus = (typeof ConsentStatus)[keyof typeof ConsentStatus]

export const SexualityPreset = {
  prefer_not_to_say: 'prefer_not_to_say',
  heterosexual: 'heterosexual',
  gay: 'gay',
  lesbian: 'lesbian',
  bisexual: 'bisexual',
  asexual: 'asexual',
  questioning: 'questioning',
  other: 'other'
} as const
export type SexualityPreset = (typeof SexualityPreset)[keyof typeof SexualityPreset]
