import { and, eq } from 'drizzle-orm'
import type { EntityType } from '../../../lib/types/enums'
import type { Database } from '../db/client'
import { auditEvents, fieldDefinitions, fieldValues, recordRevisions, searchDocuments } from '../db/schema'
import { stripPrivate } from '../privacy/strip'
import { iso, newId } from '../util'

export async function writeRevision(db: Database, input: {
  entityType: EntityType
  entityId: string
  version: number
  previousValues: Record<string, unknown>
  newValues: Record<string, unknown>
  actorId: string
  effectiveDate?: string | null
}) {
  await db.insert(recordRevisions).values({
    id: newId(),
    entityType: input.entityType,
    entityId: input.entityId,
    version: input.version,
    previousValues: stripPrivate(input.previousValues),
    newValues: stripPrivate(input.newValues),
    changedAt: new Date(),
    effectiveDate: input.effectiveDate ?? new Date().toISOString().slice(0, 10),
    changedByUserId: input.actorId
  })
}

export async function writeAudit(db: Database, input: {
  action: string
  actorId: string
  entityType: string
  entityId: string
}) {
  await db.insert(auditEvents).values({
    id: newId(),
    action: input.action,
    actorUserId: input.actorId,
    entityType: input.entityType,
    entityId: input.entityId,
    occurredAt: new Date()
  })
}

export function hrefFor(entityType: string, entityId: string) {
  if (entityType === 'student') return `/students/${entityId}`
  if (entityType === 'trait') return `/traits/${entityId}`
  if (entityType === 'evidence') return `/evidence/${entityId}`
  if (entityType === 'group') return `/groups/${entityId}`
  if (entityType === 'relationship') return `/relationships/${entityId}`
  if (entityType === 'group_membership') return `/groups/${entityId}`
  return `/${entityType}/${entityId}`
}

export async function upsertSearch(db: Database, doc: {
  entityType: string
  entityId: string
  title: string
  subtitle: string
  href: string
  filters: Record<string, unknown>
}) {
  const filters = await publicFilters(db, doc.entityType, doc.entityId, doc.filters)
  const row = {
    entityType: doc.entityType,
    entityId: doc.entityId,
    title: doc.title,
    subtitle: doc.subtitle,
    href: doc.href,
    filters,
    updatedAt: new Date()
  }
  await db.insert(searchDocuments).values(row).onConflictDoUpdate({
    target: [searchDocuments.entityType, searchDocuments.entityId],
    set: {
      title: row.title,
      subtitle: row.subtitle,
      href: row.href,
      filters: row.filters,
      updatedAt: row.updatedAt
    }
  })
}

async function publicFilters(db: Database, entityType: string, entityId: string, base: Record<string, unknown>) {
  const extras = await db.select({
    key: fieldDefinitions.key,
    valueText: fieldValues.valueText
  }).from(fieldValues).innerJoin(fieldDefinitions, eq(fieldValues.definitionId, fieldDefinitions.id)).where(and(
    eq(fieldValues.entityId, entityId),
    eq(fieldDefinitions.entityType, entityType),
    eq(fieldDefinitions.visibility, 'published'),
    eq(fieldDefinitions.searchable, true)
  ))
  const filters: Record<string, unknown> = { ...stripPrivate(base) }
  for (const extra of extras) filters[extra.key] = extra.valueText
  return stripPrivate(filters)
}

export async function removeSearch(db: Database, entityType: string, entityId: string) {
  await db.delete(searchDocuments).where(and(eq(searchDocuments.entityType, entityType), eq(searchDocuments.entityId, entityId)))
}

export function revisionTitle(values: Record<string, unknown>, entityType: string) {
  const safe = stripPrivate(values)
  for (const key of ['displayName', 'title', 'name', 'summary'] as const) {
    const value = safe[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return entityType
}

export function changedAtIso(value: Date) {
  return iso(value)
}
