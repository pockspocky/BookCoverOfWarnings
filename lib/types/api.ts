import type {
  AdminSubmission,
  AuthUser,
  CreateRelationshipPayload,
  CreateSubmissionPayload,
  DashboardStats,
  AttachmentUploadAuthorization,
  EvidenceDetail,
  GroupDetail,
  AuthProviders,
  LoginRequest,
  MutationResult,
  Paginated,
  PrivateProfilePatch,
  ProfileMatchCorrection,
  RecentUpdate,
  RelationshipDetail,
  SearchFilters,
  SearchHit,
  SessionInfo,
  StudentDetail,
  StudentListItem,
  SubmissionPublic,
  TraitDetail,
  VerifyEvidenceRequest
} from './dto'
import type {
  Evidence,
  GraphNeighborhood,
  Group,
  GroupMembership,
  GroupRole,
  RelationshipType,
  StudentPrivateProfile,
  Submission,
  TraitCategory
} from './entities'
import type { EndpointType, RelationshipStatus } from './enums'

export interface ListQuery {
  q?: string
  page?: number
  pageSize?: number
  sort?: string
  graduationYear?: number
  categoryId?: string
  groupId?: string
  status?: string
  verificationStatus?: string
  minReliability?: number
  fromDate?: string
  toDate?: string
  includeArchived?: boolean
  sourceType?: EndpointType
  targetType?: EndpointType
  relationshipTypeId?: string
}

export interface ApiClient {
  auth: {
    login(payload: LoginRequest): Promise<MutationResult<AuthUser>>
    logout(): Promise<void>
    me(): Promise<AuthUser>
    session(): Promise<SessionInfo>
    providers(): Promise<AuthProviders>
  }
  students: {
    list(query?: ListQuery): Promise<Paginated<StudentListItem>>
    get(id: string): Promise<StudentDetail>
    traits(id: string): Promise<Paginated<TraitDetail>>
    groups(id: string): Promise<Paginated<StudentDetail['memberships'][number]>>
    relationships(id: string): Promise<Paginated<RelationshipDetail>>
    history(id: string): Promise<import('./entities').VersionHistoryEntry[]>
  }
  privateProfile: {
    get(): Promise<StudentPrivateProfile>
    patch(payload: PrivateProfilePatch): Promise<MutationResult<StudentPrivateProfile>>
  }
  traits: {
    list(query?: ListQuery): Promise<Paginated<TraitDetail>>
    get(id: string): Promise<TraitDetail>
    categories(): Promise<TraitCategory[]>
  }
  evidence: {
    list(query?: ListQuery): Promise<Paginated<Evidence>>
    get(id: string): Promise<EvidenceDetail>
    traits(id: string): Promise<TraitDetail[]>
    attachment(evidenceId: string, attachmentId: string): Promise<{ url: string; fileName: string }>
    authorizeUpload(evidenceId: string, payload: { fileName: string; contentType: string; sizeBytes: number }): Promise<AttachmentUploadAuthorization>
  }
  groups: {
    list(query?: ListQuery): Promise<Paginated<Group>>
    get(id: string): Promise<GroupDetail>
    members(id: string, query?: ListQuery): Promise<Paginated<GroupDetail['currentMembers'][number]>>
    relationships(id: string): Promise<Paginated<RelationshipDetail>>
    roles(): Promise<GroupRole[]>
  }
  relationships: {
    list(query?: ListQuery): Promise<Paginated<RelationshipDetail>>
    get(id: string): Promise<RelationshipDetail>
    history(id: string): Promise<import('./entities').VersionHistoryEntry[]>
    types(): Promise<RelationshipType[]>
  }
  search: {
    query(filters: SearchFilters): Promise<Paginated<SearchHit>>
  }
  graph: {
    neighborhood(nodeType: EndpointType, nodeId: string, depth?: number): Promise<GraphNeighborhood>
    overview(filters?: { relationshipTypeId?: string; nodeType?: EndpointType; q?: string }): Promise<GraphNeighborhood>
  }
  dashboard: {
    stats(): Promise<DashboardStats>
    recent(): Promise<RecentUpdate[]>
  }
  submissions: {
    create(payload: CreateSubmissionPayload): Promise<MutationResult<Submission>>
    createRelationship(payload: CreateRelationshipPayload): Promise<MutationResult<Submission | Submission[]>>
    mine(query?: ListQuery): Promise<Paginated<SubmissionPublic>>
    get(id: string): Promise<SubmissionPublic | Submission>
    grantConsent(id: string): Promise<MutationResult<Submission>>
    revokeConsent(consentId: string): Promise<MutationResult<{ id: string }>>
  }
  admin: {
    submissions(query?: ListQuery): Promise<Paginated<AdminSubmission>>
    approve(id: string): Promise<MutationResult<{ publishedIds: string[] }>>
    reject(id: string, reason: string): Promise<MutationResult<{ deleted: true }>>
    verifyEvidence(id: string, payload: VerifyEvidenceRequest): Promise<MutationResult<Evidence>>
    createGroup(payload: { name: string; description: string }): Promise<MutationResult<Group>>
    patchGroup(id: string, payload: Partial<Pick<Group, 'name' | 'description' | 'status'>> & { baseVersion?: number }): Promise<MutationResult<Group>>
    createCategory(payload: { name: string; description: string }): Promise<MutationResult<TraitCategory>>
    patchCategory(id: string, payload: Partial<Pick<TraitCategory, 'name' | 'description' | 'isActive'>>): Promise<MutationResult<TraitCategory>>
    createRelationshipType(payload: { name: string; description: string; category: string }): Promise<MutationResult<RelationshipType>>
    patchRelationshipType(id: string, payload: Partial<Pick<RelationshipType, 'name' | 'description' | 'category' | 'isActive'>>): Promise<MutationResult<RelationshipType>>
    createGroupRole(payload: { name: string; description: string }): Promise<MutationResult<GroupRole>>
    patchGroupRole(id: string, payload: Partial<Pick<GroupRole, 'name' | 'description' | 'isActive'>>): Promise<MutationResult<GroupRole>>
    archiveTrait(id: string): Promise<MutationResult<{ id: string }>>
    correctProfileMatch(userId: string, payload: ProfileMatchCorrection): Promise<MutationResult<AuthUser['account']>>
    archiveStudent(id: string): Promise<MutationResult<{ id: string }>>
    archiveRelationship(id: string): Promise<MutationResult<{ id: string }>>
    patchStudent(id: string, payload: { displayName?: string; graduationYear?: number; generalComment?: string; baseVersion?: number }): Promise<MutationResult<StudentDetail>>
    createStudent(payload: { displayName: string; graduationYear: number; generalComment?: string }): Promise<MutationResult<StudentDetail>>
    createTrait(payload: { studentId: string; title: string; categoryId: string; description?: string | null; evidenceIds?: string[] }): Promise<MutationResult<TraitDetail>>
    patchTrait(id: string, payload: { title?: string; categoryId?: string; description?: string | null; baseVersion: number }): Promise<MutationResult<TraitDetail>>
    createEvidence(payload: { summary: string; evidenceDate: string; urls?: string[]; traitIds?: string[] }): Promise<MutationResult<Evidence>>
    attachTraitEvidence(id: string, payload: { evidenceId: string }): Promise<MutationResult<TraitDetail>>
    patchEvidence(id: string, payload: { summary?: string; evidenceDate?: string; urls?: string[] }): Promise<MutationResult<Evidence>>
    archiveEvidence(id: string): Promise<MutationResult<{ id: string }>>
    createMembership(payload: { groupId: string; studentId: string; roleId?: string; roleName?: string; startDate: string; endDate?: string | null }): Promise<MutationResult<GroupMembership>>
    patchMembership(id: string, payload: { endDate: string }): Promise<MutationResult<GroupMembership>>
    createRelationship(payload: CreateRelationshipPayload): Promise<MutationResult<RelationshipDetail | RelationshipDetail[]>>
    patchRelationship(id: string, payload: { generalComment?: string; startDate?: string | null; endDate?: string | null; status?: RelationshipStatus; baseVersion: number }): Promise<MutationResult<RelationshipDetail>>
    accounts(): Promise<Paginated<AuthUser['account']>>
    createAdministrator(payload: { email: string; password: string }): Promise<MutationResult<AuthUser['account']>>
  }
}
