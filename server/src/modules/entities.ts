import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { createRelationshipSchema, httpsUrlSchema, markdownSchema, uuidSchema } from '../../../lib/schemas/index'
import { ApiError } from '../../../lib/types/errors'
import { EndpointType, RecordStatus, RelationshipStatus, type EntityType, type SubmissionOperation, type UserRole } from '../../../lib/types/enums'
import type { Database } from '../db/client'
import {
  evidence,
  groupMemberships,
  groupRoles,
  groups,
  relationshipTypes,
  relationships,
  students,
  traitCategories,
  traitEvidence,
  traits
} from '../db/schema'
import { bindAttributes, consentForAttributes, subjectStudentId } from './fields'
import { removeSearch, upsertSearch, writeRevision } from '../services/records'
import { newId } from '../util'
import type { EntityModule, SubmissionRow } from './types'

const emptySchema = z.object({}).passthrough()
const attributesSchema = z.record(z.string(), z.unknown()).optional()

function nullableDate(value: unknown) {
  if (value == null || value === '') return null
  if (typeof value !== 'string') throw ApiError.validation('Date is invalid.', { date: ['Date is invalid.'] })
  return value.slice(0, 10)
}

function asRecord(value: unknown) {
  return (value ?? {}) as Record<string, unknown>
}

async function requireStudent(db: Database, id: string) {
  const rows = await db.select({ id: students.id }).from(students).where(eq(students.id, id)).limit(1)
  if (!rows[0]) throw ApiError.validation('Unknown student.', { studentId: ['Unknown student.'] })
}

async function link(db: Database, traitId: string, evidenceId: string) {
  const existing = await db.select({ id: traitEvidence.id }).from(traitEvidence).where(and(
    eq(traitEvidence.traitId, traitId),
    eq(traitEvidence.evidenceId, evidenceId)
  )).limit(1)
  if (existing[0]) return
  await db.insert(traitEvidence).values({ id: newId(), traitId, evidenceId, createdAt: new Date() })
}

export async function attachTraitEvidence(db: Database, traitId: string, evidenceId: string) {
  const traitRows = await db.select({ status: traits.status }).from(traits).where(eq(traits.id, traitId)).limit(1)
  const trait = traitRows[0]
  if (!trait) throw ApiError.notFound('Trait not found.')
  if (trait.status === 'archived') {
    throw ApiError.validation('Archived traits cannot receive evidence.', { traitId: ['Archived traits cannot receive evidence.'] })
  }
  const evidenceRows = await db.select({ status: evidence.status }).from(evidence).where(eq(evidence.id, evidenceId)).limit(1)
  const item = evidenceRows[0]
  if (!item) throw ApiError.validation('Unknown evidence.', { evidenceId: ['Unknown evidence.'] })
  if (item.status === 'archived') {
    throw ApiError.validation('Archived evidence cannot be attached.', { evidenceId: ['Archived evidence cannot be attached.'] })
  }
  await link(db, traitId, evidenceId)
}

async function projectStudent(db: Database, id: string) {
  const rows = await db.select({
    id: students.id,
    displayName: students.displayName,
    graduationYear: students.graduationYear,
    archivedAt: students.archivedAt
  }).from(students).where(eq(students.id, id)).limit(1)
  const row = rows[0]
  if (!row) return
  await upsertSearch(db, {
    entityType: 'student',
    entityId: row.id,
    title: row.displayName,
    subtitle: `Class of ${row.graduationYear}`,
    href: `/students/${row.id}`,
    filters: { graduationYear: row.graduationYear, status: row.archivedAt ? 'archived' : 'active' }
  })
}

async function projectTrait(db: Database, id: string) {
  const rows = await db.select({
    id: traits.id,
    title: traits.title,
    studentId: traits.studentId,
    categoryId: traits.categoryId,
    status: traits.status
  }).from(traits).where(eq(traits.id, id)).limit(1)
  const row = rows[0]
  if (!row || row.status !== 'active') {
    await removeSearch(db, 'trait', id)
    return
  }
  const names = await db.select({ displayName: students.displayName }).from(students).where(eq(students.id, row.studentId)).limit(1)
  await upsertSearch(db, {
    entityType: 'trait',
    entityId: row.id,
    title: row.title,
    subtitle: names[0]?.displayName ?? '',
    href: `/traits/${row.id}`,
    filters: { studentId: row.studentId, categoryId: row.categoryId, status: row.status, traitTitle: row.title }
  })
}

async function projectEvidence(db: Database, id: string) {
  const rows = await db.select({
    id: evidence.id,
    summary: evidence.summary,
    evidenceDate: evidence.evidenceDate,
    verificationStatus: evidence.verificationStatus,
    reliabilityScore: evidence.reliabilityScore,
    status: evidence.status
  }).from(evidence).where(eq(evidence.id, id)).limit(1)
  const row = rows[0]
  if (!row || row.status !== 'active') {
    await removeSearch(db, 'evidence', id)
    return
  }
  await upsertSearch(db, {
    entityType: 'evidence',
    entityId: row.id,
    title: row.summary,
    subtitle: row.evidenceDate,
    href: `/evidence/${row.id}`,
    filters: {
      evidenceDate: row.evidenceDate,
      verificationStatus: row.verificationStatus,
      reliabilityScore: row.reliabilityScore,
      status: row.status
    }
  })
}

async function projectGroup(db: Database, id: string) {
  const rows = await db.select({
    id: groups.id,
    name: groups.name,
    status: groups.status
  }).from(groups).where(eq(groups.id, id)).limit(1)
  const row = rows[0]
  if (!row || row.status !== 'active') {
    await removeSearch(db, 'group', id)
    return
  }
  await upsertSearch(db, {
    entityType: 'group',
    entityId: row.id,
    title: row.name,
    subtitle: row.status,
    href: `/groups/${row.id}`,
    filters: { groupId: row.id, status: row.status }
  })
}

async function projectRelationship(db: Database, id: string) {
  const rows = await db.select({
    id: relationships.id,
    sourceType: relationships.sourceType,
    sourceId: relationships.sourceId,
    targetType: relationships.targetType,
    targetId: relationships.targetId,
    relationshipTypeId: relationships.relationshipTypeId,
    status: relationships.status,
    generalComment: relationships.generalComment
  }).from(relationships).where(eq(relationships.id, id)).limit(1)
  const row = rows[0]
  if (!row || row.status === 'archived') {
    await removeSearch(db, 'relationship', id)
    return
  }
  const typeRows = await db.select({ name: relationshipTypes.name }).from(relationshipTypes).where(eq(relationshipTypes.id, row.relationshipTypeId)).limit(1)
  await upsertSearch(db, {
    entityType: 'relationship',
    entityId: row.id,
    title: typeRows[0]?.name ?? 'Relationship',
    subtitle: row.generalComment.slice(0, 180),
    href: `/relationships/${row.id}`,
    filters: {
      relationshipTypeId: row.relationshipTypeId,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      targetType: row.targetType,
      targetId: row.targetId,
      status: row.status
    }
  })
}

const traitWriteSchema = z.object({
  studentId: uuidSchema,
  title: z.string().min(1).max(200),
  categoryId: uuidSchema,
  description: z.string().max(20_000).nullable().optional(),
  evidenceIds: z.array(uuidSchema).optional(),
  requiresConsent: z.boolean().optional(),
  attributes: attributesSchema
})

const traitChangeSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  categoryId: uuidSchema.optional(),
  description: z.string().max(20_000).nullable().optional(),
  requiresConsent: z.boolean().optional(),
  attributes: attributesSchema
})

const evidenceWriteSchema = z.object({
  summary: z.string().min(1).max(4_000),
  evidenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  urls: z.array(httpsUrlSchema).optional().default([]),
  traitIds: z.array(uuidSchema).optional(),
  attributes: attributesSchema
})

const evidenceChangeSchema = z.object({
  summary: z.string().min(1).max(4_000).optional(),
  evidenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  urls: z.array(httpsUrlSchema).optional(),
  attributes: attributesSchema
})

const studentWriteSchema = z.object({
  displayName: z.string().min(1).max(200),
  graduationYear: z.number().int().min(1900).max(2200),
  generalComment: markdownSchema.optional().default(''),
  attributes: attributesSchema
})

const studentChangeSchema = z.object({
  displayName: z.string().min(1).max(200).optional(),
  graduationYear: z.number().int().min(1900).max(2200).optional(),
  generalComment: markdownSchema.optional(),
  attributes: attributesSchema
})

const groupWriteSchema = z.object({
  name: z.string().min(1).max(200),
  description: markdownSchema.optional().default(''),
  attributes: attributesSchema
})

const groupChangeSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: markdownSchema.optional(),
  status: z.enum(RecordStatus).optional(),
  attributes: attributesSchema
})

const membershipSchema = z.object({
  groupId: uuidSchema,
  studentId: uuidSchema,
  roleId: uuidSchema,
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()
})

const relationshipChangeSchema = z.object({
  generalComment: markdownSchema.optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  status: z.enum(RelationshipStatus).optional(),
  attributes: attributesSchema
})

async function relationshipSubjects(db: Database, proposed: Record<string, unknown>, targetEntityId: string | null) {
  let sourceType = proposed.sourceType
  let sourceId = proposed.sourceId
  let targetType = proposed.targetType
  let targetId = proposed.targetId
  if (targetEntityId && (typeof sourceId !== 'string' || typeof targetId !== 'string')) {
    const rows = await db.select({
      sourceType: relationships.sourceType,
      sourceId: relationships.sourceId,
      targetType: relationships.targetType,
      targetId: relationships.targetId
    }).from(relationships).where(eq(relationships.id, targetEntityId)).limit(1)
    const row = rows[0]
    if (row) {
      sourceType = row.sourceType
      sourceId = row.sourceId
      targetType = row.targetType
      targetId = row.targetId
    }
  }
  const subjects: Array<{ subjectStudentId: string; scope: string }> = []
  if (sourceType === 'student' && typeof sourceId === 'string') subjects.push({ subjectStudentId: sourceId, scope: 'publish:relationship' })
  if (targetType === 'student' && typeof targetId === 'string' && targetId !== sourceId) {
    subjects.push({ subjectStudentId: targetId, scope: 'publish:relationship' })
  }
  return subjects
}

function memberOrAdmin(operation: SubmissionOperation, role: UserRole, allowed: SubmissionOperation[]) {
  return (role === 'member' || role === 'administrator') && allowed.includes(operation)
}

export const studentModule: EntityModule = {
  entityType: 'student',
  sensitiveKeys: ['sexualityPreset', 'sexualityCustom'],
  denial: 'Only administrators may create or archive student records.',
  allows(operation, role) {
    if (operation === 'correction' || operation === 'update') return role === 'member' || role === 'administrator'
    return role === 'administrator' && (operation === 'create' || operation === 'archive')
  },
  schema(operation) {
    if (operation === 'create') return studentWriteSchema
    if (operation === 'archive') return emptySchema
    return studentChangeSchema
  },
  async consentSubjects(db, proposed, _operation, targetEntityId) {
    return consentForAttributes(db, 'student', proposed, subjectStudentId('student', proposed, targetEntityId))
  },
  async currentVersion(db, id) {
    const rows = await db.select({ currentVersion: students.currentVersion }).from(students).where(eq(students.id, id)).limit(1)
    return rows[0]?.currentVersion ?? null
  },
  async apply(db, submission, actorId) {
    if (submission.operation === 'archive' && submission.targetEntityId) {
      await this.archiveById(db, submission.targetEntityId, actorId)
      return [submission.targetEntityId]
    }
    if (submission.operation === 'create') {
      const data = studentWriteSchema.parse(submission.proposedData)
      const id = newId()
      const now = new Date()
      await db.insert(students).values({
        id,
        displayName: data.displayName,
        graduationYear: data.graduationYear,
        generalComment: data.generalComment,
        archivedAt: null,
        currentVersion: 1,
        createdAt: now,
        updatedAt: now
      })
      await bindAttributes(db, 'student', id, asRecord(submission.proposedData), submission.id)
      await projectStudent(db, id)
      return [id]
    }
    const id = submission.targetEntityId
    if (!id) throw ApiError.validation('A correction needs a target record.')
    await patchStudent(db, id, studentChangeSchema.parse(submission.proposedData), actorId)
    await bindAttributes(db, 'student', id, asRecord(submission.proposedData), submission.id)
    return [id]
  },
  async archiveById(db, id, actorId) {
    const rows = await db.select({
      displayName: students.displayName,
      graduationYear: students.graduationYear,
      generalComment: students.generalComment,
      currentVersion: students.currentVersion,
      archivedAt: students.archivedAt
    }).from(students).where(eq(students.id, id)).limit(1)
    const row = rows[0]
    if (!row) throw ApiError.notFound()
    if (row.archivedAt) return
    const version = row.currentVersion + 1
    const archivedAt = new Date()
    await db.update(students).set({ archivedAt, currentVersion: version, updatedAt: archivedAt }).where(eq(students.id, id))
    await writeRevision(db, {
      entityType: 'student',
      entityId: id,
      version,
      previousValues: { archivedAt: null },
      newValues: { archivedAt: archivedAt.toISOString(), displayName: row.displayName },
      actorId
    })
    await removeSearch(db, 'student', id)
  }
}

export async function patchStudent(db: Database, id: string, payload: { displayName?: string; graduationYear?: number; generalComment?: string }, actorId: string) {
  const rows = await db.select({
    displayName: students.displayName,
    graduationYear: students.graduationYear,
    generalComment: students.generalComment,
    currentVersion: students.currentVersion
  }).from(students).where(eq(students.id, id)).limit(1)
  const current = rows[0]
  if (!current) throw ApiError.notFound()
  const next = {
    displayName: payload.displayName ?? current.displayName,
    graduationYear: payload.graduationYear ?? current.graduationYear,
    generalComment: payload.generalComment ?? current.generalComment
  }
  const version = current.currentVersion + 1
  await db.update(students).set({ ...next, currentVersion: version, updatedAt: new Date() }).where(eq(students.id, id))
  await writeRevision(db, {
    entityType: 'student',
    entityId: id,
    version,
    previousValues: { displayName: current.displayName, graduationYear: current.graduationYear, generalComment: current.generalComment },
    newValues: next,
    actorId
  })
  await projectStudent(db, id)
}

export const traitModule: EntityModule = {
  entityType: 'trait',
  sensitiveKeys: ['sexualityPreset', 'sexualityCustom'],
  denial: 'This trait change cannot be submitted.',
  allows: (operation, role) => memberOrAdmin(operation, role, ['create', 'update', 'archive', 'correction']),
  schema(operation) {
    if (operation === 'create') return traitWriteSchema
    if (operation === 'archive') return emptySchema
    return traitChangeSchema
  },
  async consentSubjects(db, proposed, operation, targetEntityId) {
    const subjects = []
    if (proposed.requiresConsent === true) {
      const studentId = typeof proposed.studentId === 'string'
        ? proposed.studentId
        : targetEntityId
          ? (await db.select({ studentId: traits.studentId }).from(traits).where(eq(traits.id, targetEntityId)).limit(1))[0]?.studentId
          : null
      if (studentId) subjects.push({ subjectStudentId: studentId, scope: 'publish:trait' })
    }
    const attributeStudent = subjectStudentId('trait', proposed, null) ?? (subjects[0]?.subjectStudentId ?? null)
    subjects.push(...await consentForAttributes(db, 'trait', proposed, attributeStudent))
    return subjects
  },
  async currentVersion(db, id) {
    const rows = await db.select({ currentVersion: traits.currentVersion }).from(traits).where(eq(traits.id, id)).limit(1)
    return rows[0]?.currentVersion ?? null
  },
  async apply(db, submission, actorId) {
    if (submission.operation === 'archive' && submission.targetEntityId) {
      await this.archiveById(db, submission.targetEntityId, actorId)
      return [submission.targetEntityId]
    }
    if (submission.operation === 'create') {
      const data = traitWriteSchema.parse(submission.proposedData)
      await requireStudent(db, data.studentId)
      const category = await db.select({ id: traitCategories.id }).from(traitCategories).where(eq(traitCategories.id, data.categoryId)).limit(1)
      if (!category[0]) throw ApiError.validation('Unknown category.', { categoryId: ['Unknown category.'] })
      const id = newId()
      const now = new Date()
      await db.insert(traits).values({
        id,
        studentId: data.studentId,
        title: data.title,
        categoryId: data.categoryId,
        description: data.description ?? null,
        status: 'active',
        currentVersion: 1,
        createdAt: now,
        updatedAt: now
      })
      for (const evidenceId of data.evidenceIds ?? []) await link(db, id, evidenceId)
      await bindAttributes(db, 'trait', id, asRecord(submission.proposedData), submission.id)
      await projectTrait(db, id)
      return [id]
    }
    const id = submission.targetEntityId
    if (!id) throw ApiError.validation('A correction needs a target record.')
    const data = traitChangeSchema.parse(submission.proposedData)
    const rows = await db.select({
      title: traits.title,
      categoryId: traits.categoryId,
      description: traits.description,
      currentVersion: traits.currentVersion
    }).from(traits).where(eq(traits.id, id)).limit(1)
    const current = rows[0]
    if (!current) throw ApiError.notFound()
    const next = {
      title: data.title ?? current.title,
      categoryId: data.categoryId ?? current.categoryId,
      description: data.description === undefined ? current.description : data.description
    }
    const version = current.currentVersion + 1
    await db.update(traits).set({ ...next, currentVersion: version, updatedAt: new Date() }).where(eq(traits.id, id))
    await writeRevision(db, {
      entityType: 'trait',
      entityId: id,
      version,
      previousValues: { title: current.title, description: current.description, categoryId: current.categoryId },
      newValues: next,
      actorId
    })
    await bindAttributes(db, 'trait', id, asRecord(submission.proposedData), submission.id)
    await projectTrait(db, id)
    return [id]
  },
  async archiveById(db, id, actorId) {
    const rows = await db.select({
      title: traits.title,
      status: traits.status,
      currentVersion: traits.currentVersion
    }).from(traits).where(eq(traits.id, id)).limit(1)
    const row = rows[0]
    if (!row) throw ApiError.notFound()
    if (row.status === 'archived') return
    const version = row.currentVersion + 1
    await db.update(traits).set({ status: 'archived', currentVersion: version, updatedAt: new Date() }).where(eq(traits.id, id))
    await db.delete(traitEvidence).where(eq(traitEvidence.traitId, id))
    await writeRevision(db, {
      entityType: 'trait',
      entityId: id,
      version,
      previousValues: { status: row.status, title: row.title },
      newValues: { status: 'archived', title: row.title },
      actorId
    })
    await removeSearch(db, 'trait', id)
  }
}

export const evidenceModule: EntityModule = {
  entityType: 'evidence',
  sensitiveKeys: ['sexualityPreset', 'sexualityCustom', 'providerUserId'],
  denial: 'This evidence change cannot be submitted.',
  allows: (operation, role) => memberOrAdmin(operation, role, ['create', 'update', 'archive', 'correction']),
  schema(operation) {
    if (operation === 'create') return evidenceWriteSchema
    if (operation === 'archive') return emptySchema
    return evidenceChangeSchema
  },
  consentSubjects: async () => [],
  async currentVersion() {
    return null
  },
  async apply(db, submission) {
    if (submission.operation === 'archive' && submission.targetEntityId) {
      await this.archiveById(db, submission.targetEntityId, submission.submitterUserId)
      return [submission.targetEntityId]
    }
    if (submission.operation === 'create') {
      const data = evidenceWriteSchema.parse(submission.proposedData)
      const id = newId()
      const now = new Date()
      await db.insert(evidence).values({
        id,
        providerUserId: submission.submitterUserId,
        summary: data.summary,
        evidenceDate: data.evidenceDate,
        urls: data.urls,
        verificationStatus: 'pending',
        reliabilityScore: null,
        status: 'active',
        createdAt: now,
        updatedAt: now
      })
      for (const traitId of data.traitIds ?? []) await link(db, traitId, id)
      await bindAttributes(db, 'evidence', id, asRecord(submission.proposedData), submission.id)
      await projectEvidence(db, id)
      return [id]
    }
    const id = submission.targetEntityId
    if (!id) throw ApiError.validation('A correction needs a target record.')
    const data = evidenceChangeSchema.parse(submission.proposedData)
    const rows = await db.select({
      summary: evidence.summary,
      evidenceDate: evidence.evidenceDate,
      urls: evidence.urls
    }).from(evidence).where(eq(evidence.id, id)).limit(1)
    const current = rows[0]
    if (!current) throw ApiError.notFound()
    await db.update(evidence).set({
      summary: data.summary ?? current.summary,
      evidenceDate: data.evidenceDate ?? current.evidenceDate,
      urls: data.urls ?? current.urls,
      updatedAt: new Date()
    }).where(eq(evidence.id, id))
    await bindAttributes(db, 'evidence', id, asRecord(submission.proposedData), submission.id)
    await projectEvidence(db, id)
    return [id]
  },
  async archiveById(db, id) {
    const rows = await db.select({ status: evidence.status }).from(evidence).where(eq(evidence.id, id)).limit(1)
    if (!rows[0]) throw ApiError.notFound()
    await db.update(evidence).set({ status: 'archived', updatedAt: new Date() }).where(eq(evidence.id, id))
    await removeSearch(db, 'evidence', id)
  }
}

export const groupModule: EntityModule = {
  entityType: 'group',
  sensitiveKeys: [],
  denial: 'Only administrators may create groups.',
  allows: (operation, role) => role === 'administrator' && ['create', 'update', 'archive', 'correction'].includes(operation),
  schema(operation) {
    if (operation === 'create') return groupWriteSchema
    if (operation === 'archive') return emptySchema
    return groupChangeSchema
  },
  consentSubjects: async (db, proposed, _operation, targetEntityId) => consentForAttributes(db, 'group', proposed, subjectStudentId('group', proposed, targetEntityId)),
  async currentVersion(db, id) {
    const rows = await db.select({ currentVersion: groups.currentVersion }).from(groups).where(eq(groups.id, id)).limit(1)
    return rows[0]?.currentVersion ?? null
  },
  async apply(db, submission, actorId) {
    if (submission.operation === 'archive' && submission.targetEntityId) {
      await this.archiveById(db, submission.targetEntityId, actorId)
      return [submission.targetEntityId]
    }
    if (submission.operation === 'create') {
      const data = groupWriteSchema.parse(submission.proposedData)
      const id = await insertGroup(db, { name: data.name, description: data.description }, actorId)
      await bindAttributes(db, 'group', id, asRecord(submission.proposedData), submission.id)
      return [id]
    }
    const id = submission.targetEntityId
    if (!id) throw ApiError.validation('A correction needs a target record.')
    await patchGroup(db, id, groupChangeSchema.parse(submission.proposedData), actorId)
    await bindAttributes(db, 'group', id, asRecord(submission.proposedData), submission.id)
    return [id]
  },
  async archiveById(db, id, actorId) {
    await patchGroup(db, id, { status: 'archived' }, actorId)
  }
}

export async function insertGroup(db: Database, payload: { name: string; description: string }, actorId: string) {
  const id = newId()
  const now = new Date()
  await db.insert(groups).values({
    id,
    name: payload.name,
    description: payload.description,
    currentVersion: 1,
    status: 'active',
    createdAt: now,
    updatedAt: now
  })
  await writeRevision(db, {
    entityType: 'group',
    entityId: id,
    version: 1,
    previousValues: {},
    newValues: { name: payload.name, description: payload.description, status: 'active' },
    actorId
  })
  await projectGroup(db, id)
  return id
}

export async function patchGroup(db: Database, id: string, payload: { name?: string; description?: string; status?: string }, actorId: string) {
  const rows = await db.select({
    name: groups.name,
    description: groups.description,
    status: groups.status,
    currentVersion: groups.currentVersion
  }).from(groups).where(eq(groups.id, id)).limit(1)
  const current = rows[0]
  if (!current) throw ApiError.notFound()
  const next = {
    name: payload.name ?? current.name,
    description: payload.description ?? current.description,
    status: payload.status ?? current.status
  }
  const version = current.currentVersion + 1
  await db.update(groups).set({ ...next, currentVersion: version, updatedAt: new Date() }).where(eq(groups.id, id))
  await writeRevision(db, {
    entityType: 'group',
    entityId: id,
    version,
    previousValues: { name: current.name, description: current.description, status: current.status },
    newValues: next,
    actorId
  })
  await projectGroup(db, id)
}

export const membershipModule: EntityModule = {
  entityType: 'group_membership',
  sensitiveKeys: [],
  denial: 'Membership changes use a proposal, not direct publication.',
  allows: (operation, role) => memberOrAdmin(operation, role, ['create', 'archive']),
  schema: (operation) => operation === 'create' ? membershipSchema : emptySchema,
  consentSubjects: async () => [],
  async currentVersion() {
    return null
  },
  async apply(db, submission, actorId) {
    if (submission.operation === 'archive' && submission.targetEntityId) {
      await this.archiveById(db, submission.targetEntityId, actorId)
      return [submission.targetEntityId]
    }
    const data = membershipSchema.parse(submission.proposedData)
    await requireStudent(db, data.studentId)
    const group = await db.select({ id: groups.id }).from(groups).where(eq(groups.id, data.groupId)).limit(1)
    if (!group[0]) throw ApiError.validation('Unknown group.', { groupId: ['Unknown group.'] })
    const role = await db.select({ id: groupRoles.id }).from(groupRoles).where(eq(groupRoles.id, data.roleId)).limit(1)
    if (!role[0]) throw ApiError.validation('Unknown role.', { roleId: ['Unknown role.'] })
    const id = newId()
    const now = new Date()
    await db.insert(groupMemberships).values({
      id,
      groupId: data.groupId,
      studentId: data.studentId,
      roleId: data.roleId,
      startDate: data.startDate,
      endDate: data.endDate ?? null,
      createdAt: now,
      updatedAt: now
    })
    return [id]
  },
  async archiveById(db, id) {
    const rows = await db.select({ id: groupMemberships.id }).from(groupMemberships).where(eq(groupMemberships.id, id)).limit(1)
    if (!rows[0]) throw ApiError.notFound()
    await db.update(groupMemberships).set({ endDate: new Date().toISOString().slice(0, 10), updatedAt: new Date() }).where(eq(groupMemberships.id, id))
  }
}

export async function endMembership(db: Database, id: string, endDate: string) {
  const rows = await db.select({
    id: groupMemberships.id,
    startDate: groupMemberships.startDate
  }).from(groupMemberships).where(eq(groupMemberships.id, id)).limit(1)
  const row = rows[0]
  if (!row) throw ApiError.notFound()
  if (endDate < row.startDate) {
    throw ApiError.validation('End date cannot be before the start date.', { endDate: ['End date cannot be before the start date.'] })
  }
  await db.update(groupMemberships).set({ endDate, updatedAt: new Date() }).where(eq(groupMemberships.id, id))
}

export const relationshipModule: EntityModule = {
  entityType: 'relationship',
  sensitiveKeys: ['sexualityPreset', 'sexualityCustom'],
  denial: 'This relationship change cannot be submitted.',
  allows: (operation, role) => memberOrAdmin(operation, role, ['create', 'update', 'archive', 'correction']),
  schema(operation) {
    if (operation === 'create') return createRelationshipSchema
    if (operation === 'archive') return emptySchema
    return relationshipChangeSchema
  },
  async consentSubjects(db, proposed, operation, targetEntityId) {
    if (operation === 'archive') return []
    const subjects = await relationshipSubjects(db, proposed, targetEntityId)
    const attributeSubject = subjects[0]?.subjectStudentId ?? null
    subjects.push(...await consentForAttributes(db, 'relationship', proposed, attributeSubject))
    return subjects
  },
  async currentVersion(db, id) {
    const rows = await db.select({ currentVersion: relationships.currentVersion }).from(relationships).where(eq(relationships.id, id)).limit(1)
    return rows[0]?.currentVersion ?? null
  },
  async apply(db, submission, actorId) {
    if (submission.operation === 'archive' && submission.targetEntityId) {
      await this.archiveById(db, submission.targetEntityId, actorId)
      return [submission.targetEntityId]
    }
    if (submission.operation === 'create') {
      const data = createRelationshipSchema.parse(submission.proposedData)
      await assertEndpoint(db, data.sourceType, data.sourceId)
      await assertEndpoint(db, data.targetType, data.targetId)
      const type = await db.select({ id: relationshipTypes.id }).from(relationshipTypes).where(eq(relationshipTypes.id, data.relationshipTypeId)).limit(1)
      if (!type[0]) throw ApiError.validation('Unknown relationship type.', { relationshipTypeId: ['Unknown relationship type.'] })
      const id = newId()
      const now = new Date()
      await db.insert(relationships).values({
        id,
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        targetType: data.targetType,
        targetId: data.targetId,
        relationshipTypeId: data.relationshipTypeId,
        generalComment: data.generalComment,
        startDate: nullableDate(data.startDate),
        endDate: nullableDate(data.endDate),
        status: 'active',
        currentVersion: 1,
        createdAt: now,
        updatedAt: now
      })
      await bindAttributes(db, 'relationship', id, asRecord(submission.proposedData), submission.id)
      await projectRelationship(db, id)
      return [id]
    }
    const id = submission.targetEntityId
    if (!id) throw ApiError.validation('A correction needs a target record.')
    const data = relationshipChangeSchema.parse(submission.proposedData)
    const rows = await db.select({
      generalComment: relationships.generalComment,
      startDate: relationships.startDate,
      endDate: relationships.endDate,
      status: relationships.status,
      currentVersion: relationships.currentVersion
    }).from(relationships).where(eq(relationships.id, id)).limit(1)
    const current = rows[0]
    if (!current) throw ApiError.notFound()
    const next = {
      generalComment: data.generalComment ?? current.generalComment,
      startDate: data.startDate === undefined ? current.startDate : nullableDate(data.startDate),
      endDate: data.endDate === undefined ? current.endDate : nullableDate(data.endDate),
      status: data.status ?? current.status
    }
    const version = current.currentVersion + 1
    await db.update(relationships).set({ ...next, currentVersion: version, updatedAt: new Date() }).where(eq(relationships.id, id))
    await writeRevision(db, {
      entityType: 'relationship',
      entityId: id,
      version,
      previousValues: {
        generalComment: current.generalComment,
        startDate: current.startDate,
        endDate: current.endDate,
        status: current.status
      },
      newValues: next,
      actorId
    })
    await bindAttributes(db, 'relationship', id, asRecord(submission.proposedData), submission.id)
    await projectRelationship(db, id)
    return [id]
  },
  async archiveById(db, id, actorId) {
    const rows = await db.select({
      status: relationships.status,
      generalComment: relationships.generalComment,
      currentVersion: relationships.currentVersion
    }).from(relationships).where(eq(relationships.id, id)).limit(1)
    const row = rows[0]
    if (!row) throw ApiError.notFound()
    if (row.status === 'archived') return
    const version = row.currentVersion + 1
    await db.update(relationships).set({ status: 'archived', currentVersion: version, updatedAt: new Date() }).where(eq(relationships.id, id))
    await writeRevision(db, {
      entityType: 'relationship',
      entityId: id,
      version,
      previousValues: { status: row.status, generalComment: row.generalComment },
      newValues: { status: 'archived' },
      actorId
    })
    await removeSearch(db, 'relationship', id)
  }
}

async function assertEndpoint(db: Database, type: string, id: string) {
  if (type === EndpointType.student) {
    const rows = await db.select({ id: students.id }).from(students).where(eq(students.id, id)).limit(1)
    if (!rows[0]) throw ApiError.validation('Unknown relationship endpoint.', { sourceId: ['Unknown relationship endpoint.'] })
    return
  }
  const rows = await db.select({ id: groups.id }).from(groups).where(eq(groups.id, id)).limit(1)
  if (!rows[0]) throw ApiError.validation('Unknown relationship endpoint.', { targetId: ['Unknown relationship endpoint.'] })
}

function vocabulary(entityType: EntityType, denial: string): EntityModule {
  return {
    entityType,
    sensitiveKeys: [],
    denial,
    allows: () => false,
    schema: () => emptySchema,
    consentSubjects: async () => [],
    currentVersion: async () => null,
    apply: async () => {
      throw ApiError.forbidden(denial)
    },
    archiveById: async () => {
      throw ApiError.forbidden(denial)
    }
  }
}

export const categoryModule = vocabulary('trait_category', 'Categories are maintained by administrators and are not published from the submission queue.')
export const relationshipTypeModule = vocabulary('relationship_type', 'Relationship types are maintained by administrators and are not published from the submission queue.')
export const groupRoleModule = vocabulary('group_role', 'Group roles are maintained by administrators and are not published from the submission queue.')

export async function insertCategory(db: Database, payload: { name: string; description: string }) {
  const id = newId()
  const now = new Date()
  await db.insert(traitCategories).values({ id, name: payload.name, description: payload.description, isActive: true, createdAt: now, updatedAt: now })
  return id
}

export async function patchCategory(db: Database, id: string, payload: { name?: string; description?: string; isActive?: boolean }) {
  const rows = await db.select({
    name: traitCategories.name,
    description: traitCategories.description,
    isActive: traitCategories.isActive
  }).from(traitCategories).where(eq(traitCategories.id, id)).limit(1)
  const current = rows[0]
  if (!current) throw ApiError.notFound()
  await db.update(traitCategories).set({
    name: payload.name ?? current.name,
    description: payload.description ?? current.description,
    isActive: payload.isActive ?? current.isActive,
    updatedAt: new Date()
  }).where(eq(traitCategories.id, id))
}

export async function insertRelationshipType(db: Database, payload: { name: string; description: string; category: string }) {
  const id = newId()
  const now = new Date()
  await db.insert(relationshipTypes).values({
    id,
    name: payload.name,
    description: payload.description,
    category: payload.category,
    isActive: true,
    createdAt: now,
    updatedAt: now
  })
  return id
}

export async function patchRelationshipType(db: Database, id: string, payload: { name?: string; description?: string; category?: string; isActive?: boolean }) {
  const rows = await db.select({
    name: relationshipTypes.name,
    description: relationshipTypes.description,
    category: relationshipTypes.category,
    isActive: relationshipTypes.isActive
  }).from(relationshipTypes).where(eq(relationshipTypes.id, id)).limit(1)
  const current = rows[0]
  if (!current) throw ApiError.notFound()
  await db.update(relationshipTypes).set({
    name: payload.name ?? current.name,
    description: payload.description ?? current.description,
    category: payload.category ?? current.category,
    isActive: payload.isActive ?? current.isActive,
    updatedAt: new Date()
  }).where(eq(relationshipTypes.id, id))
}

export async function insertGroupRole(db: Database, payload: { name: string; description: string }) {
  const id = newId()
  const now = new Date()
  await db.insert(groupRoles).values({ id, name: payload.name, description: payload.description, isActive: true, createdAt: now, updatedAt: now })
  return id
}

export async function patchGroupRole(db: Database, id: string, payload: { name?: string; description?: string; isActive?: boolean }) {
  const rows = await db.select({
    name: groupRoles.name,
    description: groupRoles.description,
    isActive: groupRoles.isActive
  }).from(groupRoles).where(eq(groupRoles.id, id)).limit(1)
  const current = rows[0]
  if (!current) throw ApiError.notFound()
  await db.update(groupRoles).set({
    name: payload.name ?? current.name,
    description: payload.description ?? current.description,
    isActive: payload.isActive ?? current.isActive,
    updatedAt: new Date()
  }).where(eq(groupRoles.id, id))
}

export async function verifyEvidence(db: Database, id: string, verificationStatus: string, reliabilityScore: number | null) {
  const rows = await db.select({ id: evidence.id }).from(evidence).where(eq(evidence.id, id)).limit(1)
  if (!rows[0]) throw ApiError.notFound()
  await db.update(evidence).set({ verificationStatus, reliabilityScore, updatedAt: new Date() }).where(eq(evidence.id, id))
  await projectEvidence(db, id)
}
