import type {
  ConsentGrant,
  Evidence,
  GraphNeighborhood,
  Group,
  GroupMembership,
  GroupRole,
  Relationship,
  RelationshipType,
  Student,
  StudentPrivateProfile,
  Submission,
  Trait,
  TraitCategory,
  UserAccount,
  VersionHistoryEntry
} from './entities'
import type { EndpointType, EntityType, RecordStatus, RelationshipStatus, VerificationStatus } from './enums'

export interface PaginationMeta {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface Paginated<T> {
  data: T[]
  meta: PaginationMeta
}

export interface MutationResult<T> {
  data: T
  message: string
}

export interface SessionInfo {
  authenticated: boolean
  expiresAt: string | null
  csrfToken?: string | null
}

export interface AuthProviders {
  password: boolean
  oidc: boolean
}

export interface AuthUser {
  account: UserAccount
  matchedStudent: Student | null
  permissions: string[]
}

export interface LoginRequest {
  email: string
  password: string
}

export interface StudentListItem extends Student {
  traitCount: number
  groupCount: number
}

export interface StudentDetail extends Student {
  traits: Trait[]
  memberships: Array<GroupMembership & { group: Group; role: GroupRole }>
  relationships: Relationship[]
}

export interface TraitDetail extends Trait {
  student: Student
  category: TraitCategory
  evidence: Evidence[]
  history: VersionHistoryEntry[]
}

export interface EvidenceDetail extends Evidence {
  traits: TraitDetail[]
  providerVisible: boolean
  providerLabel: string
}

export interface GroupDetail extends Group {
  currentMembers: Array<GroupMembership & { student: Student; role: GroupRole }>
  historicalMembers: Array<GroupMembership & { student: Student; role: GroupRole }>
  relationships: Relationship[]
  history: VersionHistoryEntry[]
}

export interface AttachmentUploadAuthorization {
  uploadToken: string
  expiresAt: string
  url: string
  method: 'PUT'
}

export interface RelationshipDetail extends Relationship {
  sourceLabel: string
  targetLabel: string
  relationshipType: RelationshipType
  history: VersionHistoryEntry[]
  consent: ConsentGrant[]
}

export interface SearchFilters {
  q?: string
  studentId?: string
  graduationYear?: number
  traitTitle?: string
  traitCategoryId?: string
  groupId?: string
  groupName?: string
  relationshipTypeId?: string
  endpointType?: EndpointType
  endpointId?: string
  connectedToType?: EndpointType
  connectedToId?: string
  verificationStatus?: VerificationStatus
  minReliability?: number
  fromDate?: string
  toDate?: string
  status?: RecordStatus | RelationshipStatus | 'current' | 'archived'
  entityTypes?: EntityType[]
  page?: number
  pageSize?: number
}

export interface SearchHit {
  entityType: EntityType
  id: string
  title: string
  subtitle: string
  href: string
}

export interface DashboardStats {
  students: number
  groups: number
  traits: number
  evidence: number
  relationships: number
}

export interface RecentUpdate {
  id: string
  entityType: EntityType
  title: string
  href: string
  occurredAt: string
}

export interface PrivateProfilePatch {
  sexualityPreset: StudentPrivateProfile['sexualityPreset']
  sexualityCustom?: string | null
}

export type SubmissionPublic = Omit<Submission, 'submitterUserId' | 'proposedData'> & {
  anonymous: true
  proposedData?: Record<string, unknown>
}

export interface AdminSubmission extends Submission {
  submitterEmail: string
}

export interface VerifyEvidenceRequest {
  verificationStatus: VerificationStatus
  reliabilityScore: number | null
}

export interface ProfileMatchCorrection {
  matchedStudentId: string | null
  matchStatus: UserAccount['matchStatus']
  reason: string
}

export interface CreateRelationshipPayload {
  sourceType: EndpointType
  sourceId: string
  targetType: EndpointType
  targetId: string
  relationshipTypeId?: string
  relationshipTypeName?: string
  generalComment: string
  startDate?: string | null
  endDate?: string | null
  createMirroredRelationship?: boolean
}

export interface CreateSubmissionPayload {
  entityType: EntityType
  operation: Submission['operation']
  targetEntityId?: string | null
  proposedData: Record<string, unknown>
  baseVersion?: number | null
}
