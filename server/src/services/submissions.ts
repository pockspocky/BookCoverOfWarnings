import { and, eq, inArray, isNull } from 'drizzle-orm'
import { createRelationshipSchema, createSubmissionSchema } from '../../../lib/schemas/index'
import type { Submission } from '../../../lib/types/entities'
import { ApiError } from '../../../lib/types/errors'
import type { EntityType, SubmissionOperation } from '../../../lib/types/enums'
import type { Actor } from '../auth/actor'
import type { Database } from '../db/client'
import { accounts, consentGrants, privateAttributeValues, submissions } from '../db/schema'
import { runInTransaction } from '../db/tx'
import { fromZod } from '../http/errors'
import { requireModule } from '../modules/registry'
import type { SubmissionRow } from '../modules/types'
import { extractPrivateAttributes, subjectStudentId } from '../modules/fields'
import { stripPrivate } from '../privacy/strip'
import { iso, newId } from '../util'
import { writeAudit } from './records'

const versioned = new Set(['student', 'trait', 'group', 'relationship'])

function present(row: SubmissionRow): Submission {
  return {
    id: row.id,
    submitterUserId: row.submitterUserId,
    entityType: row.entityType as EntityType,
    operation: row.operation as SubmissionOperation,
    targetEntityId: row.targetEntityId,
    proposedData: stripPrivate(row.proposedData),
    status: row.status as Submission['status'],
    submittedAt: iso(row.submittedAt),
    reviewedAt: row.reviewedAt ? iso(row.reviewedAt) : null,
    reviewedBy: row.reviewedBy,
    consentRequirements: row.consentRequirements,
    baseVersion: row.baseVersion
  }
}

export function presentOwned(row: SubmissionRow) {
  return present(row)
}

export function presentAnonymous(row: SubmissionRow) {
  const full = present(row)
  const { submitterUserId: _submitter, proposedData: _proposed, ...rest } = full
  void _submitter
  void _proposed
  return { ...rest, anonymous: true as const }
}

async function hidePrivateAttributes(db: Database, row: Submission) {
  const module = requireModule(row.entityType)
  const hidden = new Set(module.sensitiveKeys)
  const proposed = stripPrivate(row.proposedData)
  if (proposed.attributes && typeof proposed.attributes === 'object' && !Array.isArray(proposed.attributes)) {
    const attributes = { ...(proposed.attributes as Record<string, unknown>) }
    for (const key of hidden) delete attributes[key]
    proposed.attributes = attributes
  }
  for (const key of hidden) delete proposed[key]
  return { ...row, proposedData: proposed }
}

export async function toAdminSubmission(db: Database, row: SubmissionRow) {
  const owned = await hidePrivateAttributes(db, present(row))
  const emails = await db.select({ email: accounts.email }).from(accounts).where(eq(accounts.id, row.submitterUserId)).limit(1)
  return { ...owned, submitterEmail: emails[0]?.email ?? 'unknown' }
}

export async function assertVersion(db: Database, entityType: string, operation: string, targetEntityId: string | null, baseVersion: number | null) {
  if (!versioned.has(entityType) || operation === 'create' || !targetEntityId || baseVersion == null) return
  const current = await requireModule(entityType).currentVersion(db, targetEntityId)
  if (current == null) throw ApiError.notFound('Record not found.')
  if (current !== baseVersion) {
    throw ApiError.conflict('This correction is based on an outdated version.', { baseVersion: String(current) })
  }
}

function cleanProposed(value: Record<string, unknown>) {
  const proposed = stripPrivate({ ...value })
  delete proposed.createMirroredRelationship
  delete proposed.batchId
  return proposed
}

async function insertOne(db: Database, actor: Actor, input: {
  entityType: EntityType
  operation: SubmissionOperation
  targetEntityId: string | null
  proposedData: Record<string, unknown>
  baseVersion: number | null
  batchId: string | null
}) {
  const module = requireModule(input.entityType)
  if (!module.allows(input.operation, actor.role)) throw ApiError.forbidden(module.denial)
  const parsed = module.schema(input.operation).safeParse(input.proposedData)
  if (!parsed.success) throw fromZod(parsed.error)
  if (input.operation !== 'create' && !input.targetEntityId) {
    throw ApiError.validation('This operation needs a target record.', { targetEntityId: ['This operation needs a target record.'] })
  }
  if (versioned.has(input.entityType) && (input.operation === 'correction' || input.operation === 'update') && input.baseVersion == null) {
    throw ApiError.validation('A correction needs baseVersion.', { baseVersion: ['A correction needs baseVersion.'] })
  }
  await assertVersion(db, input.entityType, input.operation, input.targetEntityId, input.baseVersion)
  const proposed = cleanProposed(parsed.data as Record<string, unknown>)
  const subjects = input.operation === 'archive'
    ? []
    : await module.consentSubjects(db, proposed, input.operation, input.targetEntityId)
  const unique = new Map<string, { subjectStudentId: string; scope: string }>()
  for (const subject of subjects) unique.set(`${subject.subjectStudentId}:${subject.scope}`, subject)
  const consentRequirements = [...unique.values()].map((subject) => ({ ...subject, satisfied: false }))
  const id = newId()
  const subject = subjectStudentId(input.entityType, proposed, input.targetEntityId) ?? consentRequirements[0]?.subjectStudentId ?? null
  const pendingPrivate = await extractPrivateAttributes(db, input.entityType, proposed, subject)
  const now = new Date()
  const row: SubmissionRow = {
    id,
    submitterUserId: actor.id,
    entityType: input.entityType,
    operation: input.operation,
    targetEntityId: input.targetEntityId,
    proposedData: proposed,
    status: consentRequirements.some((item) => !item.satisfied) ? 'awaiting_consent' : 'pending',
    submittedAt: now,
    reviewedAt: null,
    reviewedBy: null,
    consentRequirements,
    baseVersion: input.baseVersion,
    batchId: input.batchId,
    createdAt: now
  }
  await db.insert(submissions).values(row)
  if (pendingPrivate.length) {
    await db.insert(privateAttributeValues).values(pendingPrivate.map((item) => ({
      id: newId(),
      definitionId: item.definitionId,
      entityId: null,
      subjectStudentId: item.subjectStudentId,
      pendingSubmissionId: id,
      valueText: item.valueText,
      createdAt: now
    })))
  }
  return row
}

export async function queueSubmission(db: Database, actor: Actor, payload: unknown) {
  const body = payload as Record<string, unknown>
  if (body.entityType === 'relationship' && body.operation === 'create' && body.proposedData && typeof body.proposedData === 'object') {
    const proposed = body.proposedData as Record<string, unknown>
    if (proposed.createMirroredRelationship === true) {
      const parsed = createRelationshipSchema.safeParse(proposed)
      if (!parsed.success) throw fromZod(parsed.error, 'Invalid relationship submission.')
      return queueMirror(db, actor, parsed.data)
    }
  }
  if (!body.entityType && typeof body.sourceType === 'string') {
    const parsed = createRelationshipSchema.safeParse(body)
    if (!parsed.success) throw fromZod(parsed.error, 'Invalid relationship submission.')
    if (parsed.data.createMirroredRelationship) return queueMirror(db, actor, parsed.data)
    const row = await insertOne(db, actor, {
      entityType: 'relationship',
      operation: 'create',
      targetEntityId: null,
      proposedData: parsed.data,
      baseVersion: null,
      batchId: null
    })
    return { data: present(row), message: 'Submission queued.' }
  }
  const parsed = createSubmissionSchema.safeParse(payload)
  if (!parsed.success) throw fromZod(parsed.error)
  const row = await insertOne(db, actor, {
    entityType: parsed.data.entityType,
    operation: parsed.data.operation,
    targetEntityId: parsed.data.targetEntityId ?? null,
    proposedData: parsed.data.proposedData,
    baseVersion: parsed.data.baseVersion ?? null,
    batchId: null
  })
  return { data: present(row), message: 'Submission queued. It is not published.' }
}

async function queueMirror(db: Database, actor: Actor, proposed: {
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
  const batchId = newId()
  return runInTransaction(db, async (tx) => {
    const first = await insertOne(tx, actor, {
      entityType: 'relationship',
      operation: 'create',
      targetEntityId: null,
      proposedData: proposed,
      baseVersion: null,
      batchId
    })
    const second = await insertOne(tx, actor, {
      entityType: 'relationship',
      operation: 'create',
      targetEntityId: null,
      proposedData: {
        ...proposed,
        sourceType: proposed.targetType,
        sourceId: proposed.targetId,
        targetType: proposed.sourceType,
        targetId: proposed.sourceId
      },
      baseVersion: null,
      batchId
    })
    return { data: [present(first), present(second)], message: 'Mirrored submissions queued. Neither direction is published yet.' }
  })
}

async function lockBatch(db: Database, id: string) {
  const firstRows = await db.select().from(submissions).where(eq(submissions.id, id)).for('update')
  const first = firstRows[0]
  if (!first) throw ApiError.notFound('Submission not found.')
  if (!first.batchId) return [first]
  return db.select().from(submissions).where(eq(submissions.batchId, first.batchId)).for('update')
}

export async function approveSubmission(db: Database, actor: Actor, id: string) {
  if (actor.role !== 'administrator') throw ApiError.forbidden('Only administrators can publish submissions.')
  return runInTransaction(db, async (tx) => {
    const batch = await lockBatch(tx, id)
    for (const item of batch) {
      await assertVersion(tx, item.entityType, item.operation, item.targetEntityId, item.baseVersion)
    }
    const publishedIds: string[] = []
    const reviewedAt = new Date()
    for (const item of batch) {
      const module = requireModule(item.entityType)
      const ids = await module.apply(tx, item, actor.id)
      publishedIds.push(...ids)
      await tx.update(submissions).set({
        status: 'approved',
        reviewedAt,
        reviewedBy: actor.id
      }).where(eq(submissions.id, item.id))
      const publishedId = ids[0]
      if (publishedId) {
        await tx.update(consentGrants).set({ entityId: publishedId }).where(and(
          eq(consentGrants.pendingSubmissionId, item.id),
          eq(consentGrants.status, 'granted')
        ))
      }
      await writeAudit(tx, { action: 'submission.approve', actorId: actor.id, entityType: item.entityType, entityId: item.id })
    }
    return { publishedIds }
  })
}

export async function rejectSubmission(db: Database, actor: Actor, id: string, reason: unknown) {
  if (actor.role !== 'administrator') throw ApiError.forbidden('Only administrators can reject submissions.')
  if (typeof reason !== 'string' || !reason.trim()) {
    throw ApiError.validation('A rejection reason is required.', { reason: ['A rejection reason is required.'] })
  }
  return runInTransaction(db, async (tx) => {
    const batch = await lockBatch(tx, id)
    const ids = batch.map((item) => item.id)
    for (const item of batch) {
      await writeAudit(tx, { action: 'submission.reject', actorId: actor.id, entityType: item.entityType, entityId: item.id })
    }
    await tx.delete(consentGrants).where(and(inArray(consentGrants.pendingSubmissionId, ids), isNull(consentGrants.entityId)))
    await tx.delete(submissions).where(inArray(submissions.id, ids))
    return { deleted: true as const }
  })
}

export async function grantConsent(db: Database, actor: Actor, submissionId: string) {
  const rows = await db.select().from(submissions).where(eq(submissions.id, submissionId)).limit(1)
  const submission = rows[0]
  if (!submission) throw ApiError.notFound('Submission not found.')
  if (!actor.matchedStudentId) throw ApiError.forbidden('Only a matched student may grant this consent.')
  const requirements = submission.consentRequirements.map((item) => ({ ...item }))
  const mine = requirements.filter((item) => item.subjectStudentId === actor.matchedStudentId && !item.satisfied)
  const requirement = mine[0]
  if (!requirement) throw ApiError.forbidden('This consent request is not addressed to your profile.')
  const now = new Date()
  for (const item of mine) {
    item.satisfied = true
    await db.insert(consentGrants).values({
      id: newId(),
      subjectStudentId: actor.matchedStudentId,
      scope: item.scope,
      entityType: submission.entityType,
      entityId: null,
      pendingSubmissionId: submission.id,
      grantedAt: now,
      revokedAt: null,
      status: 'granted'
    })
  }
  const status = requirements.every((item) => item.satisfied) ? 'pending' : 'awaiting_consent'
  await db.update(submissions).set({ consentRequirements: requirements, status }).where(eq(submissions.id, submission.id))
  const next = { ...submission, consentRequirements: requirements, status }
  return present(next)
}

export async function revokeConsent(db: Database, actor: Actor, consentId: string) {
  const rows = await db.select().from(consentGrants).where(eq(consentGrants.id, consentId)).limit(1)
  const grant = rows[0]
  if (!grant) throw ApiError.notFound('Consent grant not found.')
  const isSubject = actor.matchedStudentId === grant.subjectStudentId
  if (!isSubject && actor.role !== 'administrator') throw ApiError.forbidden('You cannot withdraw this consent.')
  await db.update(consentGrants).set({ status: 'revoked', revokedAt: new Date() }).where(eq(consentGrants.id, grant.id))
  if (grant.entityId) {
    const module = requireModule(grant.entityType)
    await module.archiveById(db, grant.entityId, actor.id)
  }
  if (grant.pendingSubmissionId) {
    const pendingRows = await db.select().from(submissions).where(eq(submissions.id, grant.pendingSubmissionId)).limit(1)
    const pending = pendingRows[0]
    if (pending) {
      const requirements = pending.consentRequirements.map((item) => item.subjectStudentId === grant.subjectStudentId ? { ...item, satisfied: false } : item)
      await db.update(submissions).set({ consentRequirements: requirements, status: 'awaiting_consent' }).where(eq(submissions.id, pending.id))
    }
  }
  await writeAudit(db, { action: 'consent.revoke', actorId: actor.id, entityType: grant.entityType, entityId: grant.entityId ?? grant.id })
  return { id: grant.id }
}
