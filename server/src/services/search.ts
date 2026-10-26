import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import type { SearchFilters, SearchHit } from '../../../lib/types'
import type { EntityType } from '../../../lib/types/enums'
import type { Database } from '../db/client'
import { evidence, groups, relationships, searchDocuments, students, traits } from '../db/schema'
import { likePattern, pageWindow } from '../util'

const searchable = ['student', 'trait', 'evidence', 'group', 'relationship'] as const

function compatible(type: EntityType, filters: SearchFilters) {
  if (!searchable.includes(type as typeof searchable[number])) return false
  if (filters.graduationYear != null && type !== 'student') return false
  if (filters.traitTitle && type !== 'student' && type !== 'trait') return false
  if (filters.traitCategoryId && type !== 'student' && type !== 'trait') return false
  if (filters.minReliability != null && type !== 'trait' && type !== 'evidence') return false
  if (filters.verificationStatus && type !== 'trait' && type !== 'evidence') return false
  if (filters.relationshipTypeId && type !== 'relationship') return false
  if ((filters.endpointId || filters.endpointType) && type !== 'relationship') return false
  if (filters.groupName && type !== 'student' && type !== 'group') return false
  if ((filters.fromDate || filters.toDate) && type !== 'evidence' && type !== 'trait' && type !== 'relationship') return false
  return true
}

async function idsFor(db: Database, type: EntityType, filters: SearchFilters) {
  if (type === 'student') return studentIds(db, filters)
  if (type === 'trait') return traitIds(db, filters)
  if (type === 'evidence') return evidenceIds(db, filters)
  if (type === 'group') return groupIds(db, filters)
  if (type === 'relationship') return relationshipIds(db, filters)
  return []
}

function archived(filters: SearchFilters, columnSql: ReturnType<typeof sql>) {
  if (!filters.status || filters.status === 'current') return sql`${columnSql} <> 'archived'`
  return sql`${columnSql} = ${filters.status}`
}

async function studentIds(db: Database, filters: SearchFilters) {
  const parts = []
  if (filters.status === 'archived') parts.push(sql`${students.archivedAt} is not null`)
  else parts.push(isNull(students.archivedAt))
  if (filters.studentId) parts.push(eq(students.id, filters.studentId))
  if (filters.graduationYear) parts.push(eq(students.graduationYear, filters.graduationYear))
  if (filters.groupId) {
    parts.push(sql`exists (select 1 from group_memberships m where m.student_id = ${students.id} and m.group_id = ${filters.groupId} and m.end_date is null)`)
  }
  if (filters.groupName) {
    parts.push(sql`exists (
      select 1 from group_memberships m
      join groups g on g.id = m.group_id
      where m.student_id = ${students.id} and m.end_date is null and g.name ilike ${likePattern(filters.groupName)} escape '\\'
    )`)
  }
  if (filters.traitCategoryId) {
    parts.push(sql`exists (select 1 from traits t where t.student_id = ${students.id} and t.category_id = ${filters.traitCategoryId} and t.status = 'active')`)
  }
  if (filters.traitTitle) {
    parts.push(sql`exists (select 1 from traits t where t.student_id = ${students.id} and t.status = 'active' and t.title ilike ${likePattern(filters.traitTitle)} escape '\\')`)
  }
  if (filters.connectedToType && filters.connectedToId) {
    parts.push(sql`exists (
      select 1 from relationships r
      where r.status <> 'archived' and (
        (r.source_type = 'student' and r.source_id = ${students.id} and r.target_type = ${filters.connectedToType} and r.target_id = ${filters.connectedToId})
        or (r.target_type = 'student' and r.target_id = ${students.id} and r.source_type = ${filters.connectedToType} and r.source_id = ${filters.connectedToId})
      )
    )`)
  }
  const rows = await db.select({ id: students.id }).from(students).where(and(...parts))
  return rows.map((row) => row.id)
}

async function traitIds(db: Database, filters: SearchFilters) {
  const parts = [filters.status === 'archived' ? eq(traits.status, 'archived') : eq(traits.status, 'active')]
  if (filters.traitCategoryId) parts.push(eq(traits.categoryId, filters.traitCategoryId))
  if (filters.traitTitle) parts.push(sql`${traits.title} ilike ${likePattern(filters.traitTitle)} escape '\\'`)
  if (filters.studentId) parts.push(eq(traits.studentId, filters.studentId))
  if (filters.groupId) {
    parts.push(sql`exists (select 1 from group_memberships m where m.student_id = ${traits.studentId} and m.group_id = ${filters.groupId} and m.end_date is null)`)
  }
  if (filters.minReliability != null || filters.verificationStatus || filters.fromDate || filters.toDate) {
    const checks = [sql`te.trait_id = ${traits.id}`]
    if (filters.minReliability != null) checks.push(sql`e.reliability_score >= ${filters.minReliability}`)
    if (filters.verificationStatus) checks.push(sql`e.verification_status = ${filters.verificationStatus}`)
    if (filters.fromDate) checks.push(sql`e.evidence_date >= ${filters.fromDate.slice(0, 10)}`)
    if (filters.toDate) checks.push(sql`e.evidence_date <= ${filters.toDate.slice(0, 10)}`)
    parts.push(sql`exists (select 1 from trait_evidence te join evidence e on e.id = te.evidence_id where ${sql.join(checks, sql` and `)})`)
  }
  const rows = await db.select({ id: traits.id }).from(traits).where(and(...parts))
  return rows.map((row) => row.id)
}

async function evidenceIds(db: Database, filters: SearchFilters) {
  const parts = [filters.status === 'archived' ? eq(evidence.status, 'archived') : eq(evidence.status, 'active')]
  if (filters.verificationStatus) parts.push(eq(evidence.verificationStatus, filters.verificationStatus))
  if (filters.minReliability != null) parts.push(sql`${evidence.reliabilityScore} >= ${filters.minReliability}`)
  if (filters.fromDate) parts.push(sql`${evidence.evidenceDate} >= ${filters.fromDate.slice(0, 10)}`)
  if (filters.toDate) parts.push(sql`${evidence.evidenceDate} <= ${filters.toDate.slice(0, 10)}`)
  if (filters.studentId) {
    parts.push(sql`exists (
      select 1 from trait_evidence te
      join traits t on t.id = te.trait_id
      where te.evidence_id = ${evidence.id} and t.student_id = ${filters.studentId}
    )`)
  }
  const rows = await db.select({ id: evidence.id }).from(evidence).where(and(...parts))
  return rows.map((row) => row.id)
}

async function groupIds(db: Database, filters: SearchFilters) {
  const parts = [archived(filters, sql`${groups.status}`)]
  if (filters.groupId) parts.push(eq(groups.id, filters.groupId))
  if (filters.groupName) parts.push(sql`${groups.name} ilike ${likePattern(filters.groupName)} escape '\\'`)
  if (filters.connectedToType && filters.connectedToId) {
    parts.push(sql`exists (
      select 1 from relationships r
      where r.status <> 'archived' and (
        (r.source_type = 'group' and r.source_id = ${groups.id} and r.target_type = ${filters.connectedToType} and r.target_id = ${filters.connectedToId})
        or (r.target_type = 'group' and r.target_id = ${groups.id} and r.source_type = ${filters.connectedToType} and r.source_id = ${filters.connectedToId})
      )
    )`)
  }
  const rows = await db.select({ id: groups.id }).from(groups).where(and(...parts))
  return rows.map((row) => row.id)
}

async function relationshipIds(db: Database, filters: SearchFilters) {
  const parts = [archived(filters, sql`${relationships.status}`)]
  if (filters.relationshipTypeId) parts.push(eq(relationships.relationshipTypeId, filters.relationshipTypeId))
  if (filters.endpointType && filters.endpointId) {
    parts.push(sql`(
      (${relationships.sourceType} = ${filters.endpointType} and ${relationships.sourceId} = ${filters.endpointId})
      or (${relationships.targetType} = ${filters.endpointType} and ${relationships.targetId} = ${filters.endpointId})
    )`)
  }
  if (filters.connectedToType && filters.connectedToId) {
    parts.push(sql`(
      (${relationships.sourceType} = ${filters.connectedToType} and ${relationships.sourceId} = ${filters.connectedToId})
      or (${relationships.targetType} = ${filters.connectedToType} and ${relationships.targetId} = ${filters.connectedToId})
    )`)
  }
  if (filters.studentId) {
    parts.push(sql`(
      (${relationships.sourceType} = 'student' and ${relationships.sourceId} = ${filters.studentId})
      or (${relationships.targetType} = 'student' and ${relationships.targetId} = ${filters.studentId})
    )`)
  }
  if (filters.groupId) {
    parts.push(sql`(
      (${relationships.sourceType} = 'group' and ${relationships.sourceId} = ${filters.groupId})
      or (${relationships.targetType} = 'group' and ${relationships.targetId} = ${filters.groupId})
    )`)
  }
  const rows = await db.select({ id: relationships.id }).from(relationships).where(and(...parts))
  return rows.map((row) => row.id)
}

export async function searchDirectory(db: Database, filters: SearchFilters) {
  const requested = filters.entityTypes?.length ? filters.entityTypes : [...searchable]
  const hits: SearchHit[] = []
  for (const type of requested) {
    if (!compatible(type, filters)) continue
    const ids = await idsFor(db, type, filters)
    if (!ids.length) continue
    const docs = await db.select({
      entityType: searchDocuments.entityType,
      id: searchDocuments.entityId,
      title: searchDocuments.title,
      subtitle: searchDocuments.subtitle,
      href: searchDocuments.href
    }).from(searchDocuments).where(and(
      eq(searchDocuments.entityType, type),
      inArray(searchDocuments.entityId, ids),
      filters.q
        ? sql`(${searchDocuments.title} ilike ${likePattern(filters.q)} escape '\\' or ${searchDocuments.subtitle} ilike ${likePattern(filters.q)} escape '\\')`
        : undefined
    ))
    for (const doc of docs) {
      hits.push({
        entityType: doc.entityType as EntityType,
        id: doc.id,
        title: doc.title,
        subtitle: doc.subtitle,
        href: doc.href
      })
    }
  }
  hits.sort((left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id))
  const window = pageWindow(hits.length, filters.page ?? 1, filters.pageSize ?? 20)
  return {
    data: hits.slice(window.offset, window.offset + window.pageSize),
    meta: { page: window.page, pageSize: window.pageSize, total: window.total, totalPages: window.totalPages }
  }
}
