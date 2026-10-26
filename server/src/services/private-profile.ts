import { eq } from 'drizzle-orm'
import { privateProfilePatchSchema } from '../../../lib/schemas/index'
import { ApiError } from '../../../lib/types/errors'
import type { SexualityPreset } from '../../../lib/types/enums'
import type { Actor } from '../auth/actor'
import type { Database } from '../db/client'
import { studentPrivateProfiles } from '../db/schema'
import { fromZod } from '../http/errors'
import { iso } from '../util'

function requireSubject(actor: Actor) {
  if (!actor.matchedStudentId) {
    throw ApiError.forbidden('Only the matched student can read this profile.')
  }
  return actor.matchedStudentId
}

export async function readPrivateProfile(db: Database, actor: Actor) {
  const studentId = requireSubject(actor)
  const rows = await db.select({
    studentId: studentPrivateProfiles.studentId,
    sexualityPreset: studentPrivateProfiles.sexualityPreset,
    sexualityCustom: studentPrivateProfiles.sexualityCustom,
    updatedAt: studentPrivateProfiles.updatedAt
  }).from(studentPrivateProfiles).where(eq(studentPrivateProfiles.studentId, studentId)).limit(1)
  const row = rows[0]
  if (!row) {
    return {
      studentId,
      sexualityPreset: null,
      sexualityCustom: null,
      updatedAt: new Date().toISOString()
    }
  }
  return {
    studentId: row.studentId,
    sexualityPreset: row.sexualityPreset as SexualityPreset | null,
    sexualityCustom: row.sexualityCustom,
    updatedAt: iso(row.updatedAt)
  }
}

export async function patchPrivateProfile(db: Database, actor: Actor, payload: unknown) {
  const studentId = requireSubject(actor)
  const parsed = privateProfilePatchSchema.safeParse(payload)
  if (!parsed.success) throw fromZod(parsed.error)
  const updatedAt = new Date()
  const sexualityCustom = parsed.data.sexualityPreset === 'other' ? parsed.data.sexualityCustom ?? null : null
  await db.insert(studentPrivateProfiles).values({
    studentId,
    sexualityPreset: parsed.data.sexualityPreset,
    sexualityCustom,
    updatedAt
  }).onConflictDoUpdate({
    target: studentPrivateProfiles.studentId,
    set: {
      sexualityPreset: parsed.data.sexualityPreset,
      sexualityCustom,
      updatedAt
    }
  })
  return {
    studentId,
    sexualityPreset: parsed.data.sexualityPreset,
    sexualityCustom,
    updatedAt: iso(updatedAt)
  }
}
