import { z } from 'zod'
import {
  ConsentStatus,
  EndpointType,
  EntityType,
  MatchStatus,
  RecordStatus,
  RelationshipStatus,
  SexualityPreset,
  SubmissionOperation,
  SubmissionStatus,
  UserRole,
  VerificationStatus
} from '../types/enums'

export const uuidSchema = z.string().uuid()
export const isoDateSchema = z.string().datetime({ offset: true }).or(z.string().date())
export const markdownSchema = z.string().max(20_000)
export const httpsUrlSchema = z.string().url().refine((value) => value.startsWith('https://'), {
  message: 'Only HTTPS URLs are permitted.'
})

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
})

export const schoolEmailSchema = (domain: string) =>
  loginSchema.superRefine((value, ctx) => {
    const at = value.email.split('@')[1]?.toLowerCase()
    if (at !== domain.toLowerCase()) {
      ctx.addIssue({
        code: 'custom',
        path: ['email'],
        message: `Email must use the school domain @${domain}.`
      })
    }
  })

export const privateProfilePatchSchema = z
  .object({
    sexualityPreset: z.enum(SexualityPreset).nullable(),
    sexualityCustom: z.string().max(200).nullable().optional()
  })
  .superRefine((value, ctx) => {
    if (value.sexualityPreset === 'other' && !value.sexualityCustom?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['sexualityCustom'],
        message: 'Custom text is required when using Other / Self-described.'
      })
    }
    if (value.sexualityPreset !== 'other' && value.sexualityCustom) {
      ctx.addIssue({
        code: 'custom',
        path: ['sexualityCustom'],
        message: 'Custom text is only permitted for Other / Self-described.'
      })
    }
  })

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
})

export const studentListQuerySchema = paginationQuerySchema.extend({
  q: z.string().optional(),
  graduationYear: z.coerce.number().int().optional(),
  categoryId: z.string().uuid().optional(),
  groupId: z.string().uuid().optional(),
  sort: z.enum(['name', 'graduationYear']).default('name'),
  includeArchived: z.coerce.boolean().optional()
})

export const createRelationshipSchema = z.object({
  sourceType: z.enum(EndpointType),
  sourceId: uuidSchema,
  targetType: z.enum(EndpointType),
  targetId: uuidSchema,
  relationshipTypeId: uuidSchema,
  generalComment: markdownSchema,
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  createMirroredRelationship: z.boolean().optional().default(false)
}).superRefine((value, ctx) => {
  if (value.sourceType === value.targetType && value.sourceId === value.targetId) {
    ctx.addIssue({ code: 'custom', message: 'A record cannot relate to itself.', path: ['targetId'] })
  }
})

export const createSubmissionSchema = z.object({
  entityType: z.enum(EntityType),
  operation: z.enum(SubmissionOperation),
  targetEntityId: uuidSchema.nullable().optional(),
  proposedData: z.record(z.string(), z.unknown()),
  baseVersion: z.number().int().nullable().optional()
})

export const verifyEvidenceSchema = z.object({
  verificationStatus: z.enum(VerificationStatus),
  reliabilityScore: z.number().int().min(1).max(5).nullable()
})

export const profileMatchCorrectionSchema = z.object({
  matchedStudentId: uuidSchema.nullable(),
  matchStatus: z.enum(MatchStatus),
  reason: z.string().min(8).max(500)
})

export const searchFiltersSchema = paginationQuerySchema.extend({
  q: z.string().optional(),
  studentId: uuidSchema.optional(),
  graduationYear: z.coerce.number().int().optional(),
  traitTitle: z.string().optional(),
  traitCategoryId: uuidSchema.optional(),
  groupId: uuidSchema.optional(),
  groupName: z.string().optional(),
  relationshipTypeId: uuidSchema.optional(),
  endpointType: z.enum(EndpointType).optional(),
  endpointId: uuidSchema.optional(),
  connectedToType: z.enum(EndpointType).optional(),
  connectedToId: uuidSchema.optional(),
  verificationStatus: z.enum(VerificationStatus).optional(),
  minReliability: z.coerce.number().int().min(1).max(5).optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  status: z.string().optional(),
  entityTypes: z.array(z.enum(EntityType)).optional()
})

export const consentGrantSchema = z.object({
  subjectStudentId: uuidSchema,
  scope: z.string().min(3),
  entityType: z.enum(EntityType),
  entityId: uuidSchema.nullable(),
  pendingSubmissionId: uuidSchema.nullable(),
  status: z.enum(ConsentStatus)
})

export const roleSchema = z.enum(UserRole)
export const recordStatusSchema = z.enum(RecordStatus)
export const relationshipStatusSchema = z.enum(RelationshipStatus)
export const submissionStatusSchema = z.enum(SubmissionStatus)
