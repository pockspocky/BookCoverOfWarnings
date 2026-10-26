import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import type {
  Evidence,
  EvidenceDetail,
  Group,
  GroupDetail,
  GroupMembership,
  GroupRole,
  Relationship,
  RelationshipDetail,
  RelationshipType,
  Student,
  StudentDetail,
  StudentListItem,
  Trait,
  TraitCategory,
  TraitDetail,
  VersionHistoryEntry
} from '../../../lib/types'
import type { EntityType, UserRole } from '../../../lib/types/enums'
import { ApiError } from '../../../lib/types/errors'
import type { Database } from '../db/client'
import {
  accounts,
  consentGrants,
  evidence,
  evidenceAttachments,
  groupMemberships,
  groupRoles,
  groups,
  recordRevisions,
  relationshipTypes,
  relationships,
  students,
  traitCategories,
  traitEvidence,
  traits
} from '../db/schema'
import { stripPrivate } from '../privacy/strip'
import { dateOnly, iso, likePattern, pageWindow } from '../util'
import { changedAtIso, hrefFor, revisionTitle } from './records'

export type Viewer = { role: UserRole }

const studentColumns = {
  id: students.id,
  displayName: students.displayName,
  graduationYear: students.graduationYear,
  generalComment: students.generalComment,
  archivedAt: students.archivedAt,
  currentVersion: students.currentVersion,
  createdAt: students.createdAt,
  updatedAt: students.updatedAt
}

function presentStudent(row: {
  id: string
  displayName: string
  graduationYear: number
  generalComment: string
  archivedAt: Date | null
  currentVersion: number
  createdAt: Date
  updatedAt: Date
}): Student {
  return {
    id: row.id,
    displayName: row.displayName,
    graduationYear: row.graduationYear,
    generalComment: row.generalComment,
    archivedAt: row.archivedAt ? iso(row.archivedAt) : null,
    currentVersion: row.currentVersion,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt)
  }
}

function presentTrait(row: typeof traits.$inferSelect): Trait {
  return {
    id: row.id,
    studentId: row.studentId,
    title: row.title,
    categoryId: row.categoryId,
    description: row.description,
    status: row.status as Trait['status'],
    currentVersion: row.currentVersion,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt)
  }
}

function presentCategory(row: typeof traitCategories.$inferSelect): TraitCategory {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isActive: row.isActive,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt)
  }
}

function presentGroup(row: typeof groups.$inferSelect): Group {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    currentVersion: row.currentVersion,
    status: row.status as Group['status'],
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt)
  }
}

function presentRole(row: typeof groupRoles.$inferSelect): GroupRole {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isActive: row.isActive,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt)
  }
}

function presentType(row: typeof relationshipTypes.$inferSelect): RelationshipType {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    isActive: row.isActive,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt)
  }
}

function presentRelationship(row: typeof relationships.$inferSelect): Relationship {
  return {
    id: row.id,
    sourceType: row.sourceType as Relationship['sourceType'],
    sourceId: row.sourceId,
    targetType: row.targetType as Relationship['targetType'],
    targetId: row.targetId,
    relationshipTypeId: row.relationshipTypeId,
    generalComment: row.generalComment,
    startDate: dateOnly(row.startDate),
    endDate: dateOnly(row.endDate),
    status: row.status as Relationship['status'],
    currentVersion: row.currentVersion,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt)
  }
}

async function attachmentsFor(db: Database, evidenceIds: string[]) {
  if (!evidenceIds.length) return new Map<string, Evidence['attachments']>()
  const rows = await db.select({
    id: evidenceAttachments.id,
    evidenceId: evidenceAttachments.evidenceId,
    fileName: evidenceAttachments.fileName,
    contentType: evidenceAttachments.contentType,
    sizeBytes: evidenceAttachments.sizeBytes,
    authorized: evidenceAttachments.authorized
  }).from(evidenceAttachments).where(inArray(evidenceAttachments.evidenceId, evidenceIds))
  const grouped = new Map<string, Evidence['attachments']>()
  for (const row of rows) {
    const list = grouped.get(row.evidenceId) ?? []
    list.push(row)
    grouped.set(row.evidenceId, list)
  }
  return grouped
}

function presentEvidence(row: typeof evidence.$inferSelect, files: Evidence['attachments'], viewer: Viewer): Evidence {
  return {
    id: row.id,
    providerUserId: viewer.role === 'administrator' ? row.providerUserId : 'redacted',
    summary: row.summary,
    evidenceDate: row.evidenceDate,
    urls: row.urls,
    attachments: files,
    verificationStatus: row.verificationStatus as Evidence['verificationStatus'],
    reliabilityScore: row.reliabilityScore,
    status: row.status as Evidence['status'],
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt)
  }
}

export async function historyFor(db: Database, entityType: EntityType, entityId: string): Promise<VersionHistoryEntry[]> {
  const rows = await db.select({
    id: recordRevisions.id,
    entityType: recordRevisions.entityType,
    entityId: recordRevisions.entityId,
    version: recordRevisions.version,
    previousValues: recordRevisions.previousValues,
    newValues: recordRevisions.newValues,
    changedAt: recordRevisions.changedAt,
    effectiveDate: recordRevisions.effectiveDate,
    changedByUserId: recordRevisions.changedByUserId
  }).from(recordRevisions).where(and(
    eq(recordRevisions.entityType, entityType),
    eq(recordRevisions.entityId, entityId)
  )).orderBy(desc(recordRevisions.version))
  return rows.map((row) => ({
    id: row.id,
    entityType: row.entityType as EntityType,
    entityId: row.entityId,
    version: row.version,
    previousValues: stripPrivate(row.previousValues),
    newValues: stripPrivate(row.newValues),
    changedAt: iso(row.changedAt),
    effectiveDate: row.effectiveDate,
    changedByUserId: row.changedByUserId
  }))
}

async function labelFor(db: Database, type: string, id: string) {
  if (type === 'student') {
    const rows = await db.select({ displayName: students.displayName }).from(students).where(eq(students.id, id)).limit(1)
    return rows[0]?.displayName ?? 'Unknown student'
  }
  const rows = await db.select({ name: groups.name }).from(groups).where(eq(groups.id, id)).limit(1)
  return rows[0]?.name ?? 'Unknown group'
}

export async function listStudents(db: Database, query: {
  q?: string
  page: number
  pageSize: number
  graduationYear?: number
  categoryId?: string
  groupId?: string
  sort: 'name' | 'graduationYear'
  includeArchived?: boolean
}) {
  const filters = []
  if (!query.includeArchived) filters.push(isNull(students.archivedAt))
  if (query.graduationYear) filters.push(eq(students.graduationYear, query.graduationYear))
  if (query.q) filters.push(sql`${students.displayName} ilike ${likePattern(query.q)} escape '\\'`)
  if (query.groupId) {
    filters.push(sql`exists (select 1 from group_memberships m where m.student_id = ${students.id} and m.group_id = ${query.groupId} and m.end_date is null)`)
  }
  if (query.categoryId) {
    filters.push(sql`exists (select 1 from traits t where t.student_id = ${students.id} and t.category_id = ${query.categoryId} and t.status = 'active')`)
  }
  const where = filters.length ? and(...filters) : undefined
  const totals = await db.select({ total: count() }).from(students).where(where)
  const window = pageWindow(Number(totals[0]?.total ?? 0), query.page, query.pageSize)
  const rows = await db.select(studentColumns).from(students).where(where).orderBy(
    query.sort === 'graduationYear' ? desc(students.graduationYear) : asc(students.displayName),
    asc(students.displayName)
  ).limit(query.pageSize).offset(window.offset)
  const ids = rows.map((row) => row.id)
  const traitCounts = ids.length
    ? await db.select({ studentId: traits.studentId, total: count() }).from(traits).where(and(inArray(traits.studentId, ids), eq(traits.status, 'active'))).groupBy(traits.studentId)
    : []
  const groupCounts = ids.length
    ? await db.select({ studentId: groupMemberships.studentId, total: count() }).from(groupMemberships).where(and(inArray(groupMemberships.studentId, ids), isNull(groupMemberships.endDate))).groupBy(groupMemberships.studentId)
    : []
  const data: StudentListItem[] = rows.map((row) => ({
    ...presentStudent(row),
    traitCount: Number(traitCounts.find((item) => item.studentId === row.id)?.total ?? 0),
    groupCount: Number(groupCounts.find((item) => item.studentId === row.id)?.total ?? 0)
  }))
  return { data, meta: { page: window.page, pageSize: window.pageSize, total: window.total, totalPages: window.totalPages } }
}

export async function getStudent(db: Database, id: string): Promise<StudentDetail> {
  const rows = await db.select(studentColumns).from(students).where(eq(students.id, id)).limit(1)
  const row = rows[0]
  if (!row) throw ApiError.notFound()
  const traitRows = await db.select().from(traits).where(eq(traits.studentId, id)).orderBy(asc(traits.title))
  const membershipRows = await db.select().from(groupMemberships).where(eq(groupMemberships.studentId, id))
  const relationshipRows = await db.select().from(relationships).where(sql`
    (${relationships.sourceType} = 'student' and ${relationships.sourceId} = ${id})
    or (${relationships.targetType} = 'student' and ${relationships.targetId} = ${id})
  `)
  const memberships = []
  for (const membership of membershipRows) {
    const groupRows = await db.select().from(groups).where(eq(groups.id, membership.groupId)).limit(1)
    const roleRows = await db.select().from(groupRoles).where(eq(groupRoles.id, membership.roleId)).limit(1)
    const group = groupRows[0]
    const role = roleRows[0]
    if (!group || !role) continue
    memberships.push({
      id: membership.id,
      groupId: membership.groupId,
      studentId: membership.studentId,
      roleId: membership.roleId,
      startDate: membership.startDate,
      endDate: membership.endDate,
      createdAt: iso(membership.createdAt),
      updatedAt: iso(membership.updatedAt),
      group: presentGroup(group),
      role: presentRole(role)
    })
  }
  return {
    ...presentStudent(row),
    traits: traitRows.map(presentTrait),
    memberships,
    relationships: relationshipRows.map(presentRelationship)
  }
}

export async function studentTraits(db: Database, id: string, page = 1, pageSize = 20) {
  const exists = await db.select({ id: students.id }).from(students).where(eq(students.id, id)).limit(1)
  if (!exists[0]) throw ApiError.notFound()
  const rows = await db.select({ id: traits.id }).from(traits).where(and(eq(traits.studentId, id), eq(traits.status, 'active'))).orderBy(asc(traits.title))
  const window = pageWindow(rows.length, page, pageSize)
  const data = []
  for (const row of rows.slice(window.offset, window.offset + pageSize)) data.push(await getTrait(db, row.id))
  return { data, meta: { page: window.page, pageSize: window.pageSize, total: window.total, totalPages: window.totalPages } }
}

export async function studentGroups(db: Database, id: string, page = 1, pageSize = 20) {
  const detail = await getStudent(db, id)
  const window = pageWindow(detail.memberships.length, page, pageSize)
  return {
    data: detail.memberships.slice(window.offset, window.offset + pageSize),
    meta: { page: window.page, pageSize: window.pageSize, total: window.total, totalPages: window.totalPages }
  }
}

export async function listTraits(db: Database, query: { q?: string; page: number; pageSize: number; categoryId?: string; includeArchived?: boolean }) {
  const filters = []
  if (!query.includeArchived) filters.push(eq(traits.status, 'active'))
  if (query.categoryId) filters.push(eq(traits.categoryId, query.categoryId))
  if (query.q) filters.push(sql`${traits.title} ilike ${likePattern(query.q)} escape '\\'`)
  const where = filters.length ? and(...filters) : undefined
  const totals = await db.select({ total: count() }).from(traits).where(where)
  const window = pageWindow(Number(totals[0]?.total ?? 0), query.page, query.pageSize)
  const rows = await db.select({ id: traits.id }).from(traits).where(where).orderBy(asc(traits.title)).limit(query.pageSize).offset(window.offset)
  const data: TraitDetail[] = []
  for (const row of rows) data.push(await getTrait(db, row.id))
  return { data, meta: { page: window.page, pageSize: window.pageSize, total: window.total, totalPages: window.totalPages } }
}

export async function getTrait(db: Database, id: string): Promise<TraitDetail> {
  const rows = await db.select().from(traits).where(eq(traits.id, id)).limit(1)
  const trait = rows[0]
  if (!trait) throw ApiError.notFound()
  const studentRows = await db.select(studentColumns).from(students).where(eq(students.id, trait.studentId)).limit(1)
  const categoryRows = await db.select().from(traitCategories).where(eq(traitCategories.id, trait.categoryId)).limit(1)
  const student = studentRows[0]
  const category = categoryRows[0]
  if (!student || !category) throw ApiError.notFound()
  const links = await db.select({ evidenceId: traitEvidence.evidenceId }).from(traitEvidence).where(eq(traitEvidence.traitId, id))
  const evidenceRows = links.length
    ? await db.select().from(evidence).where(inArray(evidence.id, links.map((link) => link.evidenceId)))
    : []
  const files = await attachmentsFor(db, evidenceRows.map((item) => item.id))
  return {
    ...presentTrait(trait),
    student: presentStudent(student),
    category: presentCategory(category),
    evidence: evidenceRows.map((item) => presentEvidence(item, files.get(item.id) ?? [], { role: 'member' })),
    history: await historyFor(db, 'trait', id)
  }
}

export async function listCategories(db: Database) {
  const rows = await db.select().from(traitCategories).orderBy(asc(traitCategories.name))
  return rows.map(presentCategory)
}

export async function listEvidence(db: Database, viewer: Viewer, query: {
  q?: string
  page: number
  pageSize: number
  verificationStatus?: string
  minReliability?: number
  fromDate?: string
  toDate?: string
  includeArchived?: boolean
}) {
  const filters = []
  if (!query.includeArchived) filters.push(eq(evidence.status, 'active'))
  if (query.verificationStatus) filters.push(eq(evidence.verificationStatus, query.verificationStatus))
  if (query.minReliability) filters.push(sql`${evidence.reliabilityScore} >= ${query.minReliability}`)
  if (query.fromDate) filters.push(sql`${evidence.evidenceDate} >= ${query.fromDate}`)
  if (query.toDate) filters.push(sql`${evidence.evidenceDate} <= ${query.toDate}`)
  if (query.q) filters.push(sql`${evidence.summary} ilike ${likePattern(query.q)} escape '\\'`)
  const where = filters.length ? and(...filters) : undefined
  const totals = await db.select({ total: count() }).from(evidence).where(where)
  const window = pageWindow(Number(totals[0]?.total ?? 0), query.page, query.pageSize)
  const rows = await db.select().from(evidence).where(where).orderBy(desc(evidence.evidenceDate)).limit(query.pageSize).offset(window.offset)
  const files = await attachmentsFor(db, rows.map((row) => row.id))
  return {
    data: rows.map((row) => presentEvidence(row, files.get(row.id) ?? [], viewer)),
    meta: { page: window.page, pageSize: window.pageSize, total: window.total, totalPages: window.totalPages }
  }
}

export async function getEvidence(db: Database, viewer: Viewer, id: string): Promise<EvidenceDetail> {
  const rows = await db.select().from(evidence).where(eq(evidence.id, id)).limit(1)
  const row = rows[0]
  if (!row) throw ApiError.notFound()
  const files = await attachmentsFor(db, [id])
  const base = presentEvidence(row, files.get(id) ?? [], viewer)
  const linked = await evidenceTraits(db, id)
  let providerLabel = 'Provider identity withheld'
  if (viewer.role === 'administrator') {
    const emails = await db.select({ email: accounts.email }).from(accounts).where(eq(accounts.id, row.providerUserId)).limit(1)
    providerLabel = emails[0]?.email ?? 'Unknown provider'
  }
  return {
    ...base,
    traits: linked,
    providerVisible: viewer.role === 'administrator',
    providerLabel
  }
}

export async function evidenceTraits(db: Database, id: string) {
  const exists = await db.select({ id: evidence.id }).from(evidence).where(eq(evidence.id, id)).limit(1)
  if (!exists[0]) throw ApiError.notFound()
  const links = await db.select({ traitId: traitEvidence.traitId }).from(traitEvidence).where(eq(traitEvidence.evidenceId, id))
  const data: TraitDetail[] = []
  for (const link of links) data.push(await getTrait(db, link.traitId))
  return data
}

export async function listGroups(db: Database, query: { q?: string; page: number; pageSize: number; includeArchived?: boolean }) {
  const filters = []
  if (!query.includeArchived) filters.push(eq(groups.status, 'active'))
  if (query.q) filters.push(sql`${groups.name} ilike ${likePattern(query.q)} escape '\\'`)
  const where = filters.length ? and(...filters) : undefined
  const totals = await db.select({ total: count() }).from(groups).where(where)
  const window = pageWindow(Number(totals[0]?.total ?? 0), query.page, query.pageSize)
  const rows = await db.select().from(groups).where(where).orderBy(asc(groups.name)).limit(query.pageSize).offset(window.offset)
  return {
    data: rows.map(presentGroup),
    meta: { page: window.page, pageSize: window.pageSize, total: window.total, totalPages: window.totalPages }
  }
}

async function membershipView(db: Database, membership: typeof groupMemberships.$inferSelect) {
  const studentRows = await db.select(studentColumns).from(students).where(eq(students.id, membership.studentId)).limit(1)
  const roleRows = await db.select().from(groupRoles).where(eq(groupRoles.id, membership.roleId)).limit(1)
  const student = studentRows[0]
  const role = roleRows[0]
  if (!student || !role) return null
  return {
    id: membership.id,
    groupId: membership.groupId,
    studentId: membership.studentId,
    roleId: membership.roleId,
    startDate: membership.startDate,
    endDate: membership.endDate,
    createdAt: iso(membership.createdAt),
    updatedAt: iso(membership.updatedAt),
    student: presentStudent(student),
    role: presentRole(role)
  }
}

export async function getGroup(db: Database, id: string): Promise<GroupDetail> {
  const rows = await db.select().from(groups).where(eq(groups.id, id)).limit(1)
  const group = rows[0]
  if (!group) throw ApiError.notFound()
  const membershipRows = await db.select().from(groupMemberships).where(eq(groupMemberships.groupId, id))
  const currentMembers = []
  const historicalMembers = []
  for (const membership of membershipRows) {
    const view = await membershipView(db, membership)
    if (!view) continue
    if (membership.endDate) historicalMembers.push(view)
    else currentMembers.push(view)
  }
  const relationshipRows = await db.select().from(relationships).where(sql`
    (${relationships.sourceType} = 'group' and ${relationships.sourceId} = ${id})
    or (${relationships.targetType} = 'group' and ${relationships.targetId} = ${id})
  `)
  return {
    ...presentGroup(group),
    currentMembers,
    historicalMembers,
    relationships: relationshipRows.map(presentRelationship),
    history: await historyFor(db, 'group', id)
  }
}

export async function groupMembers(db: Database, id: string, query: { page: number; pageSize: number; includeArchived?: boolean }) {
  const exists = await db.select({ id: groups.id }).from(groups).where(eq(groups.id, id)).limit(1)
  if (!exists[0]) throw ApiError.notFound()
  const filters = [eq(groupMemberships.groupId, id)]
  if (!query.includeArchived) filters.push(isNull(groupMemberships.endDate))
  const rows = await db.select().from(groupMemberships).where(and(...filters)).orderBy(asc(groupMemberships.startDate))
  const views = []
  for (const row of rows) {
    const view = await membershipView(db, row)
    if (view) views.push(view)
  }
  const window = pageWindow(views.length, query.page, query.pageSize)
  return {
    data: views.slice(window.offset, window.offset + query.pageSize),
    meta: { page: window.page, pageSize: window.pageSize, total: window.total, totalPages: window.totalPages }
  }
}

export async function listRoles(db: Database) {
  const rows = await db.select().from(groupRoles).orderBy(asc(groupRoles.name))
  return rows.map(presentRole)
}

export async function listRelationshipTypes(db: Database) {
  const rows = await db.select().from(relationshipTypes).orderBy(asc(relationshipTypes.name))
  return rows.map(presentType)
}

async function relationshipDetail(db: Database, row: typeof relationships.$inferSelect): Promise<RelationshipDetail> {
  const typeRows = await db.select().from(relationshipTypes).where(eq(relationshipTypes.id, row.relationshipTypeId)).limit(1)
  const type = typeRows[0]
  if (!type) throw ApiError.notFound()
  const grants = await db.select({
    id: consentGrants.id,
    subjectStudentId: consentGrants.subjectStudentId,
    scope: consentGrants.scope,
    entityType: consentGrants.entityType,
    entityId: consentGrants.entityId,
    pendingSubmissionId: consentGrants.pendingSubmissionId,
    grantedAt: consentGrants.grantedAt,
    revokedAt: consentGrants.revokedAt,
    status: consentGrants.status
  }).from(consentGrants).where(and(eq(consentGrants.entityType, 'relationship'), eq(consentGrants.entityId, row.id)))
  return {
    ...presentRelationship(row),
    sourceLabel: await labelFor(db, row.sourceType, row.sourceId),
    targetLabel: await labelFor(db, row.targetType, row.targetId),
    relationshipType: presentType(type),
    history: await historyFor(db, 'relationship', row.id),
    consent: grants.map((grant) => ({
      ...grant,
      entityType: grant.entityType as EntityType,
      grantedAt: grant.grantedAt ? iso(grant.grantedAt) : null,
      revokedAt: grant.revokedAt ? iso(grant.revokedAt) : null,
      status: grant.status as RelationshipDetail['consent'][number]['status']
    }))
  }
}

export async function listRelationships(db: Database, query: {
  q?: string
  page: number
  pageSize: number
  relationshipTypeId?: string
  sourceType?: string
  targetType?: string
  status?: string
  includeArchived?: boolean
}) {
  const filters = []
  if (query.status) filters.push(eq(relationships.status, query.status))
  else if (!query.includeArchived) filters.push(sql`${relationships.status} <> 'archived'`)
  if (query.relationshipTypeId) filters.push(eq(relationships.relationshipTypeId, query.relationshipTypeId))
  if (query.sourceType) filters.push(eq(relationships.sourceType, query.sourceType))
  if (query.targetType) filters.push(eq(relationships.targetType, query.targetType))
  if (query.q) filters.push(sql`${relationships.generalComment} ilike ${likePattern(query.q)} escape '\\'`)
  const where = filters.length ? and(...filters) : undefined
  const totals = await db.select({ total: count() }).from(relationships).where(where)
  const window = pageWindow(Number(totals[0]?.total ?? 0), query.page, query.pageSize)
  const rows = await db.select().from(relationships).where(where).orderBy(desc(relationships.updatedAt)).limit(query.pageSize).offset(window.offset)
  const data: RelationshipDetail[] = []
  for (const row of rows) data.push(await relationshipDetail(db, row))
  return { data, meta: { page: window.page, pageSize: window.pageSize, total: window.total, totalPages: window.totalPages } }
}

export async function getRelationship(db: Database, id: string) {
  const rows = await db.select().from(relationships).where(eq(relationships.id, id)).limit(1)
  const row = rows[0]
  if (!row) throw ApiError.notFound()
  return relationshipDetail(db, row)
}

export async function relationshipsFor(db: Database, type: 'student' | 'group', id: string, page = 1, pageSize = 20) {
  const rows = await db.select().from(relationships).where(sql`
    (${relationships.sourceType} = ${type} and ${relationships.sourceId} = ${id})
    or (${relationships.targetType} = ${type} and ${relationships.targetId} = ${id})
  `)
  const visible = rows.filter((row) => row.status !== 'archived')
  const window = pageWindow(visible.length, page, pageSize)
  const data: RelationshipDetail[] = []
  for (const row of visible.slice(window.offset, window.offset + pageSize)) data.push(await relationshipDetail(db, row))
  return { data, meta: { page: window.page, pageSize: window.pageSize, total: window.total, totalPages: window.totalPages } }
}

export async function dashboardStats(db: Database) {
  const [studentCount] = await db.select({ total: count() }).from(students).where(isNull(students.archivedAt))
  const [groupCount] = await db.select({ total: count() }).from(groups).where(eq(groups.status, 'active'))
  const [traitCount] = await db.select({ total: count() }).from(traits).where(eq(traits.status, 'active'))
  const [evidenceCount] = await db.select({ total: count() }).from(evidence).where(eq(evidence.status, 'active'))
  const [relationshipCount] = await db.select({ total: count() }).from(relationships).where(sql`${relationships.status} <> 'archived'`)
  return {
    students: Number(studentCount?.total ?? 0),
    groups: Number(groupCount?.total ?? 0),
    traits: Number(traitCount?.total ?? 0),
    evidence: Number(evidenceCount?.total ?? 0),
    relationships: Number(relationshipCount?.total ?? 0)
  }
}

export async function recentUpdates(db: Database) {
  const rows = await db.select({
    id: recordRevisions.id,
    entityType: recordRevisions.entityType,
    entityId: recordRevisions.entityId,
    newValues: recordRevisions.newValues,
    changedAt: recordRevisions.changedAt
  }).from(recordRevisions).orderBy(desc(recordRevisions.changedAt)).limit(12)
  return rows.map((row) => ({
    id: row.id,
    entityType: row.entityType as EntityType,
    title: revisionTitle(row.newValues, row.entityType),
    href: hrefFor(row.entityType, row.entityId),
    occurredAt: changedAtIso(row.changedAt)
  }))
}

export async function listAccounts(db: Database) {
  const rows = await db.select({
    id: accounts.id,
    email: accounts.email,
    emailVerified: accounts.emailVerified,
    role: accounts.role,
    matchedStudentId: accounts.matchedStudentId,
    matchStatus: accounts.matchStatus,
    createdAt: accounts.createdAt,
    updatedAt: accounts.updatedAt
  }).from(accounts).orderBy(asc(accounts.email))
  const data = rows.map((row) => ({
    id: row.id,
    email: row.email,
    emailVerified: row.emailVerified,
    role: row.role as UserRole,
    matchedStudentId: row.matchedStudentId,
    matchStatus: row.matchStatus as 'pending' | 'verified' | 'disputed' | 'corrected',
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt)
  }))
  return { data, meta: { page: 1, pageSize: Math.max(data.length, 1), total: data.length, totalPages: 1 } }
}

export async function loadCategory(db: Database, id: string) {
  const rows = await db.select().from(traitCategories).where(eq(traitCategories.id, id)).limit(1)
  const row = rows[0]
  if (!row) throw ApiError.notFound()
  return presentCategory(row)
}

export async function loadGroupRow(db: Database, id: string) {
  const rows = await db.select().from(groups).where(eq(groups.id, id)).limit(1)
  const row = rows[0]
  if (!row) throw ApiError.notFound()
  return presentGroup(row)
}

export async function loadMembership(db: Database, id: string): Promise<GroupMembership> {
  const rows = await db.select().from(groupMemberships).where(eq(groupMemberships.id, id)).limit(1)
  const row = rows[0]
  if (!row) throw ApiError.notFound()
  return {
    id: row.id,
    groupId: row.groupId,
    studentId: row.studentId,
    roleId: row.roleId,
    startDate: row.startDate,
    endDate: row.endDate,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt)
  }
}

export async function loadRole(db: Database, id: string) {
  const rows = await db.select().from(groupRoles).where(eq(groupRoles.id, id)).limit(1)
  const row = rows[0]
  if (!row) throw ApiError.notFound()
  return presentRole(row)
}

export async function loadRelationshipType(db: Database, id: string) {
  const rows = await db.select().from(relationshipTypes).where(eq(relationshipTypes.id, id)).limit(1)
  const row = rows[0]
  if (!row) throw ApiError.notFound()
  return presentType(row)
}

export async function loadEvidenceRow(db: Database, viewer: Viewer, id: string) {
  const rows = await db.select().from(evidence).where(eq(evidence.id, id)).limit(1)
  const row = rows[0]
  if (!row) throw ApiError.notFound()
  const files = await attachmentsFor(db, [id])
  return presentEvidence(row, files.get(id) ?? [], viewer)
}
