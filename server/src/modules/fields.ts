import { and, eq } from 'drizzle-orm'
import { ApiError } from '../../../lib/types/errors'
import type { Database } from '../db/client'
import { fieldDefinitions, fieldValues, privateAttributeValues } from '../db/schema'
import { newId } from '../util'

type Definition = typeof fieldDefinitions.$inferSelect

async function definitionsFor(db: Database, entityType: string) {
  return db.select({
    id: fieldDefinitions.id,
    entityType: fieldDefinitions.entityType,
    key: fieldDefinitions.key,
    valueType: fieldDefinitions.valueType,
    visibility: fieldDefinitions.visibility,
    requiresConsent: fieldDefinitions.requiresConsent,
    searchable: fieldDefinitions.searchable
  }).from(fieldDefinitions).where(eq(fieldDefinitions.entityType, entityType))
}

function attributeBag(proposed: Record<string, unknown>) {
  const raw = proposed.attributes
  if (raw == null) return {}
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw ApiError.validation('Attributes must be an object.', { attributes: ['Attributes must be an object.'] })
  }
  return raw as Record<string, unknown>
}

export async function consentForAttributes(db: Database, entityType: string, proposed: Record<string, unknown>, subjectStudentId: string | null) {
  const attributes = attributeBag(proposed)
  if (!Object.keys(attributes).length) return []
  const definitions = await definitionsFor(db, entityType)
  const subjects: Array<{ subjectStudentId: string; scope: string }> = []
  for (const key of Object.keys(attributes)) {
    const definition = definitions.find((item) => item.key === key)
    if (!definition) throw ApiError.validation(`Unknown field ${key}.`, { [`attributes.${key}`]: ['Unknown field.'] })
    if ((definition.requiresConsent || definition.visibility === 'subject_private') && subjectStudentId) {
      subjects.push({ subjectStudentId, scope: `publish:${entityType}:${key}` })
    }
  }
  return subjects
}

export async function extractPrivateAttributes(db: Database, entityType: string, proposed: Record<string, unknown>, subjectStudentId: string | null) {
  const attributes = attributeBag(proposed)
  const pending: Array<{ definitionId: string; subjectStudentId: string; valueText: string }> = []
  if (!Object.keys(attributes).length) {
    delete proposed.attributes
    return pending
  }
  const definitions = await definitionsFor(db, entityType)
  const publicAttributes: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(attributes)) {
    const definition = definitions.find((item) => item.key === key)
    if (!definition) throw ApiError.validation(`Unknown field ${key}.`, { [`attributes.${key}`]: ['Unknown field.'] })
    if (definition.visibility === 'subject_private') {
      if (!subjectStudentId) throw ApiError.validation('A private field needs a subject student.', { [`attributes.${key}`]: ['A private field needs a subject student.'] })
      pending.push({ definitionId: definition.id, subjectStudentId, valueText: String(value ?? '') })
      continue
    }
    publicAttributes[key] = value
  }
  if (Object.keys(publicAttributes).length) proposed.attributes = publicAttributes
  else delete proposed.attributes
  return pending
}

export async function bindAttributes(db: Database, entityType: string, entityId: string, proposed: Record<string, unknown>, submissionId: string) {
  const attributes = attributeBag(proposed)
  if (Object.keys(attributes).length) {
    const definitions = await definitionsFor(db, entityType)
    for (const [key, value] of Object.entries(attributes)) {
      const definition: Definition | undefined = definitions.find((item) => item.key === key)
      if (!definition || definition.visibility === 'subject_private') continue
      const valueText = String(value ?? '')
      const existing = await db.select({ id: fieldValues.id }).from(fieldValues).where(and(
        eq(fieldValues.definitionId, definition.id),
        eq(fieldValues.entityId, entityId)
      )).limit(1)
      const current = existing[0]
      if (current) {
        await db.update(fieldValues).set({ valueText }).where(eq(fieldValues.id, current.id))
      } else {
        await db.insert(fieldValues).values({ id: newId(), definitionId: definition.id, entityId, valueText })
      }
    }
  }
  await db.update(privateAttributeValues).set({ entityId }).where(eq(privateAttributeValues.pendingSubmissionId, submissionId))
}

export function subjectStudentId(entityType: string, proposed: Record<string, unknown>, targetEntityId: string | null) {
  if (typeof proposed.studentId === 'string') return proposed.studentId
  if (entityType === 'student' && targetEntityId) return targetEntityId
  return null
}
