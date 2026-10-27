import { createRelationshipSchema } from '../../../lib/schemas/index'
import type { EntityType } from '../../../lib/types/enums'
import { ApiError } from '../../../lib/types/errors'
import type { Actor } from '../auth/actor'
import type { Database } from '../db/client'
import { runInTransaction } from '../db/tx'
import { fromZod } from '../http/errors'
import { endMembership } from '../modules/entities'
import { requireModule } from '../modules/registry'
import type { SubmissionRow } from '../modules/types'
import { stripPrivate } from '../privacy/strip'
import { newId } from '../util'
import { writeAudit } from './records'
import { assertVersion } from './submissions'

const CONSENT_MESSAGE = 'Administrator approval cannot substitute for required subject consent.'

function requireAdministrator(actor: Actor) {
  if (actor.role !== 'administrator') throw ApiError.forbidden('Administrator access is required.')
}

function cleanProposed(value: Record<string, unknown>) {
  const proposed = stripPrivate({ ...value })
  delete proposed.createMirroredRelationship
  delete proposed.batchId
  delete proposed.baseVersion
  return proposed
}

function peelBaseVersion(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { proposedData: body, baseVersion: null as number | null }
  }
  const record = { ...(body as Record<string, unknown>) }
  if (!('baseVersion' in record)) return { proposedData: record, baseVersion: null }
  const value = record.baseVersion
  delete record.baseVersion
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw ApiError.validation('baseVersion must be an integer.', { baseVersion: ['baseVersion must be an integer.'] })
  }
  return { proposedData: record, baseVersion: value }
}

async function assertDirectConsent(
  db: Database,
  entityType: EntityType,
  proposed: Record<string, unknown>,
  operation: 'create' | 'update',
  targetEntityId: string | null
) {
  const subjects = await requireModule(entityType).consentSubjects(db, proposed, operation, targetEntityId)
  const unique = new Set(subjects.map((subject) => `${subject.subjectStudentId}:${subject.scope}`))
  if (unique.size) throw ApiError.consentRequired(CONSENT_MESSAGE)
}

function synthetic(actor: Actor, input: {
  entityType: EntityType
  operation: 'create' | 'update'
  targetEntityId: string | null
  proposedData: Record<string, unknown>
  baseVersion: number | null
}): SubmissionRow {
  const now = new Date()
  return {
    id: newId(),
    submitterUserId: actor.id,
    entityType: input.entityType,
    operation: input.operation,
    targetEntityId: input.targetEntityId,
    proposedData: input.proposedData,
    status: 'approved',
    submittedAt: now,
    reviewedAt: now,
    reviewedBy: actor.id,
    consentRequirements: [],
    baseVersion: input.baseVersion,
    batchId: null,
    createdAt: now
  }
}

async function applyDirect(db: Database, actor: Actor, input: {
  entityType: EntityType
  operation: 'create' | 'update'
  targetEntityId: string | null
  body: unknown
  requireBaseVersion?: boolean
}) {
  if (input.entityType === 'group_membership' && input.operation !== 'create') {
    throw ApiError.validation('End a membership with an end date. Membership rows are not deleted.')
  }
  const module = requireModule(input.entityType)
  const peeled = peelBaseVersion(stripPrivate(input.body))
  const parsed = module.schema(input.operation).safeParse(peeled.proposedData)
  if (!parsed.success) throw fromZod(parsed.error)
  const proposed = cleanProposed(parsed.data as Record<string, unknown>)
  if (input.operation !== 'create' && !input.targetEntityId) {
    throw ApiError.validation('This operation needs a target record.', { targetEntityId: ['This operation needs a target record.'] })
  }
  if (input.requireBaseVersion && peeled.baseVersion == null) {
    throw ApiError.validation('A correction needs baseVersion.', { baseVersion: ['A correction needs baseVersion.'] })
  }
  await assertVersion(db, input.entityType, input.operation, input.targetEntityId, peeled.baseVersion)
  await assertDirectConsent(db, input.entityType, proposed, input.operation, input.targetEntityId)
  const ids = await module.apply(db, synthetic(actor, {
    entityType: input.entityType,
    operation: input.operation,
    targetEntityId: input.targetEntityId,
    proposedData: proposed,
    baseVersion: peeled.baseVersion
  }), actor.id)
  for (const id of ids) {
    await writeAudit(db, { action: 'admin.publish', actorId: actor.id, entityType: input.entityType, entityId: id })
  }
  return ids
}

export async function publishAdminChange(db: Database, actor: Actor, input: {
  entityType: EntityType
  operation: 'create' | 'update'
  targetEntityId: string | null
  body: unknown
  requireBaseVersion?: boolean
}) {
  requireAdministrator(actor)
  return runInTransaction(db, (tx) => applyDirect(tx, actor, input))
}

function relationshipBody(data: {
  sourceType: 'student' | 'group'
  sourceId: string
  targetType: 'student' | 'group'
  targetId: string
  relationshipTypeId?: string
  relationshipTypeName?: string
  generalComment: string
  startDate?: string | null
  endDate?: string | null
}) {
  const relationshipTypeName = data.relationshipTypeName?.trim()
  return {
    sourceType: data.sourceType,
    sourceId: data.sourceId,
    targetType: data.targetType,
    targetId: data.targetId,
    ...(data.relationshipTypeId ? { relationshipTypeId: data.relationshipTypeId } : {}),
    ...(relationshipTypeName ? { relationshipTypeName } : {}),
    generalComment: data.generalComment,
    startDate: data.startDate ?? null,
    endDate: data.endDate ?? null
  }
}

export async function publishAdminRelationship(db: Database, actor: Actor, body: unknown) {
  requireAdministrator(actor)
  const parsed = createRelationshipSchema.safeParse(stripPrivate(body ?? {}))
  if (!parsed.success) throw fromZod(parsed.error, 'Invalid relationship.')
  const forward = relationshipBody(parsed.data)
  if (!parsed.data.createMirroredRelationship) {
    return runInTransaction(db, (tx) => applyDirect(tx, actor, {
      entityType: 'relationship',
      operation: 'create',
      targetEntityId: null,
      body: forward
    }))
  }
  const reverse = relationshipBody({
    ...forward,
    sourceType: parsed.data.targetType,
    sourceId: parsed.data.targetId,
    targetType: parsed.data.sourceType,
    targetId: parsed.data.sourceId
  })
  return runInTransaction(db, async (tx) => {
    const first = await applyDirect(tx, actor, {
      entityType: 'relationship',
      operation: 'create',
      targetEntityId: null,
      body: forward
    })
    const second = await applyDirect(tx, actor, {
      entityType: 'relationship',
      operation: 'create',
      targetEntityId: null,
      body: reverse
    })
    return [...first, ...second]
  })
}

export async function archiveAdminRecord(db: Database, actor: Actor, entityType: EntityType, id: string) {
  requireAdministrator(actor)
  await requireModule(entityType).archiveById(db, id, actor.id)
}

export async function endAdminMembership(db: Database, actor: Actor, id: string, endDate: string) {
  requireAdministrator(actor)
  await endMembership(db, id, endDate)
}
