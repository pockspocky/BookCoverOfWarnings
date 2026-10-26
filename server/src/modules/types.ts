import type { z } from 'zod'
import type { EntityType, SubmissionOperation, UserRole } from '../../../lib/types/enums'
import type { Database } from '../db/client'
import type { submissions } from '../db/schema'

export type SubmissionRow = typeof submissions.$inferSelect

export interface EntityModule {
  entityType: EntityType
  sensitiveKeys: string[]
  denial: string
  allows(operation: SubmissionOperation, role: UserRole): boolean
  schema(operation: SubmissionOperation): z.ZodType
  consentSubjects(db: Database, proposed: Record<string, unknown>, operation: SubmissionOperation, targetEntityId: string | null): Promise<Array<{ subjectStudentId: string; scope: string }>>
  currentVersion(db: Database, id: string): Promise<number | null>
  apply(db: Database, submission: SubmissionRow, actorId: string): Promise<string[]>
  archiveById(db: Database, id: string, actorId: string): Promise<void>
}
