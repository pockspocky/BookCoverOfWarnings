import type { ApiClient, ListQuery } from '../types/api'
import { ApiError } from '../types/errors'
import type {
  AdminSubmission,
  AttachmentUploadAuthorization,
  AuthUser,
  CreateRelationshipPayload,
  CreateSubmissionPayload,
  DashboardStats,
  Evidence,
  EvidenceDetail,
  GraphNeighborhood,
  Group,
  GroupDetail,
  GroupMembership,
  GroupRole,
  MutationResult,
  Paginated,
  PrivateProfilePatch,
  ProfileMatchCorrection,
  RecentUpdate,
  RelationshipDetail,
  RelationshipType,
  SearchFilters,
  SearchHit,
  SessionInfo,
  StudentDetail,
  StudentListItem,
  StudentPrivateProfile,
  Submission,
  SubmissionPublic,
  TraitCategory,
  TraitDetail,
  VerifyEvidenceRequest,
  VersionHistoryEntry
} from '../types'
import type { EndpointType, RelationshipStatus } from '../types'
import type { ApiErrorCode } from '../types/errors'

function toQuery(params: object) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      if (value.length) search.set(key, value.map(String).join(','))
      continue
    }
    if (typeof value === 'object') continue
    search.set(key, String(value))
  }
  const encoded = search.toString()
  return encoded ? `?${encoded}` : ''
}

const ERROR_CODES: ApiErrorCode[] = ['VALIDATION', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'CONSENT_REQUIRED', 'RATE_LIMITED', 'NETWORK', 'INTERNAL']

function errorCode(status: number, bodyCode?: string): ApiErrorCode {
  if (bodyCode && ERROR_CODES.includes(bodyCode as ApiErrorCode)) return bodyCode as ApiErrorCode
  if (status === 401) return 'UNAUTHORIZED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 404) return 'NOT_FOUND'
  if (status === 409) return 'CONFLICT'
  if (status === 422) return 'VALIDATION'
  if (status === 429) return 'RATE_LIMITED'
  return 'INTERNAL'
}

export class HttpApiClient implements ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly getToken: () => string | null,
    private readonly getCsrf?: () => string | null,
    private readonly setCsrf?: (token: string | null) => void
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/json'
    }
    const token = this.getToken()
    if (token) headers.Authorization = `Bearer ${token}`
    const verb = method.toUpperCase()
    if (!token && verb !== 'GET' && verb !== 'HEAD') {
      const csrf = this.getCsrf?.()
      if (csrf) headers['X-CSRF-Token'] = csrf
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        credentials: 'include',
        body: body === undefined ? undefined : JSON.stringify(body)
      })
    } catch {
      throw ApiError.network()
    }
    if (!response.ok) {
      let payload: { message?: string; code?: string; fieldErrors?: Record<string, string[]>; details?: Record<string, string[] | string> | null } = {}
      try {
        payload = await response.json() as typeof payload
      } catch {
        payload = { message: response.statusText }
      }
      throw new ApiError({
        code: errorCode(response.status, payload.code),
        status: response.status,
        message: payload.message || 'Request failed.',
        details: payload.details,
        fieldErrors: payload.fieldErrors
      })
    }
    if (response.status === 204) {
      if (path === '/api/auth/logout') this.setCsrf?.(null)
      return undefined as T
    }
    const payload = await response.json() as T
    if (payload && typeof payload === 'object' && 'csrfToken' in payload) {
      const csrf = (payload as { csrfToken?: unknown }).csrfToken
      this.setCsrf?.(typeof csrf === 'string' ? csrf : null)
    }
    return payload
  }

  auth = {
    login: (payload: { email: string; password: string }) => this.request<MutationResult<AuthUser>>('POST', '/api/auth/login', payload),
    logout: () => this.request<void>('POST', '/api/auth/logout'),
    providers: () => this.request<{ password: boolean; oidc: boolean }>('GET', '/api/auth/providers'),
    me: () => this.request<AuthUser>('GET', '/api/auth/me'),
    session: () => this.request<SessionInfo>('GET', '/api/auth/session')
  }

  students = {
    list: (query?: ListQuery) => this.request<Paginated<StudentListItem>>('GET', `/api/students${toQuery(query ?? {})}`),
    get: (id: string) => this.request<StudentDetail>('GET', `/api/students/${id}`),
    traits: (id: string) => this.request<Paginated<TraitDetail>>('GET', `/api/students/${id}/traits`),
    groups: (id: string) => this.request<Paginated<StudentDetail['memberships'][number]>>('GET', `/api/students/${id}/groups`),
    relationships: (id: string) => this.request<Paginated<RelationshipDetail>>('GET', `/api/students/${id}/relationships`),
    history: (id: string) => this.request<VersionHistoryEntry[]>('GET', `/api/students/${id}/history`)
  }

  privateProfile = {
    get: () => this.request<StudentPrivateProfile>('GET', '/api/me/private-profile'),
    patch: (payload: PrivateProfilePatch) => this.request<MutationResult<StudentPrivateProfile>>('PATCH', '/api/me/private-profile', payload)
  }

  traits = {
    list: (query?: ListQuery) => this.request<Paginated<TraitDetail>>('GET', `/api/traits${toQuery(query ?? {})}`),
    get: (id: string) => this.request<TraitDetail>('GET', `/api/traits/${id}`),
    categories: () => this.request<TraitCategory[]>('GET', '/api/trait-categories')
  }

  evidence = {
    list: (query?: ListQuery) => this.request<Paginated<Evidence>>('GET', `/api/evidence${toQuery(query ?? {})}`),
    get: (id: string) => this.request<EvidenceDetail>('GET', `/api/evidence/${id}`),
    traits: (id: string) => this.request<TraitDetail[]>('GET', `/api/evidence/${id}/traits`),
    attachment: (evidenceId: string, attachmentId: string) => this.request<{ url: string; fileName: string }>('GET', `/api/evidence/${evidenceId}/attachments/${attachmentId}`),
    authorizeUpload: (evidenceId: string, payload: { fileName: string; contentType: string; sizeBytes: number }) => this.request<AttachmentUploadAuthorization>('POST', `/api/evidence/${evidenceId}/attachments/authorize`, payload)
  }

  groups = {
    list: (query?: ListQuery) => this.request<Paginated<Group>>('GET', `/api/groups${toQuery(query ?? {})}`),
    get: (id: string) => this.request<GroupDetail>('GET', `/api/groups/${id}`),
    members: (id: string, query?: ListQuery) => this.request<Paginated<GroupDetail['currentMembers'][number]>>('GET', `/api/groups/${id}/members${toQuery(query ?? {})}`),
    relationships: (id: string) => this.request<Paginated<RelationshipDetail>>('GET', `/api/groups/${id}/relationships`),
    roles: () => this.request<GroupRole[]>('GET', '/api/group-roles')
  }

  relationships = {
    list: (query?: ListQuery) => this.request<Paginated<RelationshipDetail>>('GET', `/api/relationships${toQuery(query ?? {})}`),
    get: (id: string) => this.request<RelationshipDetail>('GET', `/api/relationships/${id}`),
    history: (id: string) => this.request<VersionHistoryEntry[]>('GET', `/api/relationships/${id}/history`),
    types: () => this.request<RelationshipType[]>('GET', '/api/relationship-types')
  }

  search = {
    query: (filters: SearchFilters) => this.request<Paginated<SearchHit>>('GET', `/api/search${toQuery(filters)}`)
  }

  graph = {
    neighborhood: (nodeType: EndpointType, nodeId: string, depth = 1) => this.request<GraphNeighborhood>('GET', `/api/graph/neighbors/${nodeType}/${nodeId}${toQuery({ depth })}`),
    overview: (filters?: { relationshipTypeId?: string; nodeType?: EndpointType; q?: string }) => this.request<GraphNeighborhood>('GET', `/api/graph${toQuery(filters ?? {})}`)
  }

  dashboard = {
    stats: () => this.request<DashboardStats>('GET', '/api/dashboard/stats'),
    recent: () => this.request<RecentUpdate[]>('GET', '/api/dashboard/recent')
  }

  submissions = {
    create: (payload: CreateSubmissionPayload) => this.request<MutationResult<Submission>>('POST', '/api/submissions', payload),
    createRelationship: (payload: CreateRelationshipPayload) => this.request<MutationResult<Submission | Submission[]>>('POST', '/api/submissions', { entityType: 'relationship', operation: 'create', proposedData: payload }),
    mine: (query?: ListQuery) => this.request<Paginated<SubmissionPublic>>('GET', `/api/submissions/mine${toQuery(query ?? {})}`),
    get: (id: string) => this.request<SubmissionPublic | Submission>('GET', `/api/submissions/${id}`),
    grantConsent: (id: string) => this.request<MutationResult<Submission>>('POST', `/api/submissions/${id}/consent`),
    revokeConsent: (consentId: string) => this.request<MutationResult<{ id: string }>>('POST', `/api/consents/${consentId}/revoke`)
  }

  admin = {
    submissions: (query?: ListQuery) => this.request<Paginated<AdminSubmission>>('GET', `/api/admin/submissions${toQuery(query ?? {})}`),
    approve: (id: string) => this.request<MutationResult<{ publishedIds: string[] }>>('POST', `/api/admin/submissions/${id}/approve`),
    reject: (id: string, reason: string) => this.request<MutationResult<{ deleted: true }>>('POST', `/api/admin/submissions/${id}/reject`, { reason }),
    verifyEvidence: (id: string, payload: VerifyEvidenceRequest) => this.request<MutationResult<Evidence>>('POST', `/api/admin/evidence/${id}/verify`, payload),
    createGroup: (payload: { name: string; description: string }) => this.request<MutationResult<Group>>('POST', '/api/admin/groups', payload),
    patchGroup: (id: string, payload: Partial<Pick<Group, 'name' | 'description' | 'status'>> & { baseVersion?: number }) => this.request<MutationResult<Group>>('PATCH', `/api/admin/groups/${id}`, payload),
    createCategory: (payload: { name: string; description: string }) => this.request<MutationResult<TraitCategory>>('POST', '/api/admin/categories', payload),
    patchCategory: (id: string, payload: Partial<Pick<TraitCategory, 'name' | 'description' | 'isActive'>>) => this.request<MutationResult<TraitCategory>>('PATCH', `/api/admin/categories/${id}`, payload),
    createRelationshipType: (payload: { name: string; description: string; category: string }) => this.request<MutationResult<RelationshipType>>('POST', '/api/admin/relationship-types', payload),
    patchRelationshipType: (id: string, payload: Partial<Pick<RelationshipType, 'name' | 'description' | 'category' | 'isActive'>>) => this.request<MutationResult<RelationshipType>>('PATCH', `/api/admin/relationship-types/${id}`, payload),
    createGroupRole: (payload: { name: string; description: string }) => this.request<MutationResult<GroupRole>>('POST', '/api/admin/group-roles', payload),
    patchGroupRole: (id: string, payload: Partial<Pick<GroupRole, 'name' | 'description' | 'isActive'>>) => this.request<MutationResult<GroupRole>>('PATCH', `/api/admin/group-roles/${id}`, payload),
    archiveTrait: (id: string) => this.request<MutationResult<{ id: string }>>('POST', `/api/admin/traits/${id}/archive`),
    correctProfileMatch: (userId: string, payload: ProfileMatchCorrection) => this.request<MutationResult<AuthUser['account']>>('POST', `/api/admin/profile-matches/${userId}/correct`, payload),
    archiveStudent: (id: string) => this.request<MutationResult<{ id: string }>>('POST', `/api/admin/students/${id}/archive`),
    archiveRelationship: (id: string) => this.request<MutationResult<{ id: string }>>('POST', `/api/admin/relationships/${id}/archive`),
    patchStudent: (id: string, payload: { displayName?: string; graduationYear?: number; generalComment?: string; baseVersion?: number }) => this.request<MutationResult<StudentDetail>>('PATCH', `/api/admin/students/${id}`, payload),
    createStudent: (payload: { displayName: string; graduationYear: number; generalComment?: string }) => this.request<MutationResult<StudentDetail>>('POST', '/api/admin/students', payload),
    createTrait: (payload: { studentId: string; title: string; categoryId: string; description?: string | null; evidenceIds?: string[] }) => this.request<MutationResult<TraitDetail>>('POST', '/api/admin/traits', payload),
    patchTrait: (id: string, payload: { title?: string; categoryId?: string; description?: string | null; baseVersion: number }) => this.request<MutationResult<TraitDetail>>('PATCH', `/api/admin/traits/${id}`, payload),
    createEvidence: (payload: { summary: string; evidenceDate: string; urls?: string[]; traitIds?: string[] }) => this.request<MutationResult<Evidence>>('POST', '/api/admin/evidence', payload),
    attachTraitEvidence: (id: string, payload: { evidenceId: string }) => this.request<MutationResult<TraitDetail>>('POST', `/api/admin/traits/${id}/evidence`, payload),
    patchEvidence: (id: string, payload: { summary?: string; evidenceDate?: string; urls?: string[] }) => this.request<MutationResult<Evidence>>('PATCH', `/api/admin/evidence/${id}`, payload),
    archiveEvidence: (id: string) => this.request<MutationResult<{ id: string }>>('POST', `/api/admin/evidence/${id}/archive`),
    createMembership: (payload: { groupId: string; studentId: string; roleId: string; startDate: string; endDate?: string | null }) => this.request<MutationResult<GroupMembership>>('POST', '/api/admin/memberships', payload),
    patchMembership: (id: string, payload: { endDate: string }) => this.request<MutationResult<GroupMembership>>('PATCH', `/api/admin/memberships/${id}`, payload),
    createRelationship: (payload: CreateRelationshipPayload) => this.request<MutationResult<RelationshipDetail | RelationshipDetail[]>>('POST', '/api/admin/relationships', payload),
    patchRelationship: (id: string, payload: { generalComment?: string; startDate?: string | null; endDate?: string | null; status?: RelationshipStatus; baseVersion: number }) => this.request<MutationResult<RelationshipDetail>>('PATCH', `/api/admin/relationships/${id}`, payload),
    accounts: () => this.request<Paginated<AuthUser['account']>>('GET', '/api/admin/accounts'),
    createAdministrator: (payload: { email: string; password: string }) => this.request<MutationResult<AuthUser['account']>>('POST', '/api/admin/administrators', payload)
  }
}
