import type {
  ConsentStatus,
  EndpointType,
  EntityType,
  MatchStatus,
  RecordStatus,
  RelationshipStatus,
  SexualityPreset,
  SubmissionOperation,
  SubmissionStatus,
  UserRole,
  VerificationStatus
} from './enums'

export interface Timestamps {
  createdAt: string
  updatedAt: string
}

export interface Student extends Timestamps {
  id: string
  displayName: string
  graduationYear: number
  generalComment: string
  archivedAt: string | null
  currentVersion: number
}

export interface StudentPrivateProfile {
  studentId: string
  sexualityPreset: SexualityPreset | null
  sexualityCustom: string | null
  updatedAt: string
}

export interface UserAccount extends Timestamps {
  id: string
  email: string
  emailVerified: boolean
  role: UserRole
  matchedStudentId: string | null
  matchStatus: MatchStatus
}

export interface TraitCategory extends Timestamps {
  id: string
  name: string
  description: string
  isActive: boolean
}

export interface Trait extends Timestamps {
  id: string
  studentId: string
  title: string
  categoryId: string
  description: string | null
  status: RecordStatus
  currentVersion: number
}

export interface EvidenceAttachment {
  id: string
  evidenceId: string
  fileName: string
  contentType: string
  sizeBytes: number
  authorized: boolean
}

export interface Evidence extends Timestamps {
  id: string
  providerUserId: string
  summary: string
  evidenceDate: string
  urls: string[]
  attachments: EvidenceAttachment[]
  verificationStatus: VerificationStatus
  reliabilityScore: number | null
  status: RecordStatus
}

export interface TraitEvidence {
  id: string
  traitId: string
  evidenceId: string
  createdAt: string
}

export interface Group extends Timestamps {
  id: string
  name: string
  description: string
  currentVersion: number
  status: RecordStatus
}

export interface GroupRole extends Timestamps {
  id: string
  name: string
  description: string
  isActive: boolean
}

export interface GroupMembership extends Timestamps {
  id: string
  groupId: string
  studentId: string
  roleId: string
  startDate: string
  endDate: string | null
}

export interface RelationshipType extends Timestamps {
  id: string
  name: string
  description: string
  category: string
  isActive: boolean
}

export interface Relationship extends Timestamps {
  id: string
  sourceType: EndpointType
  sourceId: string
  targetType: EndpointType
  targetId: string
  relationshipTypeId: string
  generalComment: string
  startDate: string | null
  endDate: string | null
  status: RelationshipStatus
  currentVersion: number
}

export interface VersionHistoryEntry {
  id: string
  entityType: EntityType
  entityId: string
  version: number
  previousValues: Record<string, unknown>
  newValues: Record<string, unknown>
  changedAt: string
  effectiveDate: string | null
  changedByUserId: string
}

export interface ConsentRequirement {
  subjectStudentId: string
  scope: string
  satisfied: boolean
}

export interface Submission {
  id: string
  submitterUserId: string
  entityType: EntityType
  operation: SubmissionOperation
  targetEntityId: string | null
  proposedData: Record<string, unknown>
  status: SubmissionStatus
  submittedAt: string
  reviewedAt: string | null
  reviewedBy: string | null
  consentRequirements: ConsentRequirement[]
  baseVersion: number | null
}

export interface ConsentGrant {
  id: string
  subjectStudentId: string
  scope: string
  entityType: EntityType
  entityId: string | null
  pendingSubmissionId: string | null
  grantedAt: string | null
  revokedAt: string | null
  status: ConsentStatus
}

export interface GraphNode {
  id: string
  type: EndpointType
  label: string
  graduationYear?: number
  status?: string
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  relationshipTypeId: string
  relationshipTypeName: string
  status: RelationshipStatus
  directed: true
}

export interface GraphNeighborhood {
  nodes: GraphNode[]
  edges: GraphEdge[]
}
