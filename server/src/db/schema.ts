import { boolean, date, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import type { ConsentRequirement } from '../../../lib/types/entities'

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
}

export const students = pgTable('students', {
  id: uuid('id').primaryKey(),
  displayName: text('display_name').notNull(),
  graduationYear: integer('graduation_year').notNull(),
  generalComment: text('general_comment').notNull().default(''),
  archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
  currentVersion: integer('current_version').notNull().default(1),
  ...timestamps
})

export const studentPrivateProfiles = pgTable('student_private_profiles', {
  studentId: uuid('student_id').primaryKey().references(() => students.id),
  sexualityPreset: text('sexuality_preset'),
  sexualityCustom: text('sexuality_custom'),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
})

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  emailVerified: boolean('email_verified').notNull().default(false),
  role: text('role').notNull(),
  matchedStudentId: uuid('matched_student_id').references(() => students.id),
  matchStatus: text('match_status').notNull(),
  oidcIssuer: text('oidc_issuer'),
  oidcSubject: text('oidc_subject'),
  ...timestamps
}, (table) => [
  uniqueIndex('accounts_oidc_identity').on(table.oidcIssuer, table.oidcSubject)
])

export const rosterMappings = pgTable('roster_mappings', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull().unique(),
  studentId: uuid('student_id').notNull().references(() => students.id),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
})

export const oidcTransactions = pgTable('oidc_transactions', {
  state: text('state').primaryKey(),
  codeVerifier: text('code_verifier').notNull(),
  nonce: text('nonce').notNull(),
  nextPath: text('next_path').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
})

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  csrfToken: text('csrf_token').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
})

export const traitCategories = pgTable('trait_categories', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps
})

export const traits = pgTable('traits', {
  id: uuid('id').primaryKey(),
  studentId: uuid('student_id').notNull().references(() => students.id),
  title: text('title').notNull(),
  categoryId: uuid('category_id').notNull().references(() => traitCategories.id),
  description: text('description'),
  status: text('status').notNull(),
  currentVersion: integer('current_version').notNull().default(1),
  ...timestamps
})

export const evidence = pgTable('evidence', {
  id: uuid('id').primaryKey(),
  providerUserId: uuid('provider_user_id').notNull().references(() => accounts.id),
  summary: text('summary').notNull(),
  evidenceDate: date('evidence_date', { mode: 'string' }).notNull(),
  urls: jsonb('urls').$type<string[]>().notNull(),
  verificationStatus: text('verification_status').notNull(),
  reliabilityScore: integer('reliability_score'),
  status: text('status').notNull(),
  ...timestamps
})

export const evidenceAttachments = pgTable('evidence_attachments', {
  id: uuid('id').primaryKey(),
  evidenceId: uuid('evidence_id').notNull().references(() => evidence.id),
  fileName: text('file_name').notNull(),
  contentType: text('content_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  authorized: boolean('authorized').notNull().default(false),
  objectKey: text('object_key'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
})

export const traitEvidence = pgTable('trait_evidence', {
  id: uuid('id').primaryKey(),
  traitId: uuid('trait_id').notNull().references(() => traits.id),
  evidenceId: uuid('evidence_id').notNull().references(() => evidence.id),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
})

export const groups = pgTable('groups', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  currentVersion: integer('current_version').notNull().default(1),
  status: text('status').notNull(),
  ...timestamps
})

export const groupRoles = pgTable('group_roles', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps
})

export const groupMemberships = pgTable('group_memberships', {
  id: uuid('id').primaryKey(),
  groupId: uuid('group_id').notNull().references(() => groups.id),
  studentId: uuid('student_id').notNull().references(() => students.id),
  roleId: uuid('role_id').notNull().references(() => groupRoles.id),
  startDate: date('start_date', { mode: 'string' }).notNull(),
  endDate: date('end_date', { mode: 'string' }),
  ...timestamps
})

export const relationshipTypes = pgTable('relationship_types', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  category: text('category').notNull().default(''),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps
})

export const relationships = pgTable('relationships', {
  id: uuid('id').primaryKey(),
  sourceType: text('source_type').notNull(),
  sourceId: uuid('source_id').notNull(),
  targetType: text('target_type').notNull(),
  targetId: uuid('target_id').notNull(),
  relationshipTypeId: uuid('relationship_type_id').notNull().references(() => relationshipTypes.id),
  generalComment: text('general_comment').notNull().default(''),
  startDate: date('start_date', { mode: 'string' }),
  endDate: date('end_date', { mode: 'string' }),
  status: text('status').notNull(),
  currentVersion: integer('current_version').notNull().default(1),
  ...timestamps
})

export const submissions = pgTable('submissions', {
  id: uuid('id').primaryKey(),
  submitterUserId: uuid('submitter_user_id').notNull().references(() => accounts.id),
  entityType: text('entity_type').notNull(),
  operation: text('operation').notNull(),
  targetEntityId: uuid('target_entity_id'),
  proposedData: jsonb('proposed_data').$type<Record<string, unknown>>().notNull(),
  status: text('status').notNull(),
  submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'date' }).notNull(),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
  reviewedBy: uuid('reviewed_by'),
  consentRequirements: jsonb('consent_requirements').$type<ConsentRequirement[]>().notNull(),
  baseVersion: integer('base_version'),
  batchId: uuid('batch_id'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
})

export const consentGrants = pgTable('consent_grants', {
  id: uuid('id').primaryKey(),
  subjectStudentId: uuid('subject_student_id').notNull().references(() => students.id),
  scope: text('scope').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id'),
  pendingSubmissionId: uuid('pending_submission_id').references(() => submissions.id, { onDelete: 'cascade' }),
  grantedAt: timestamp('granted_at', { withTimezone: true, mode: 'date' }),
  revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
  status: text('status').notNull()
})

export const recordRevisions = pgTable('record_revisions', {
  id: uuid('id').primaryKey(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  version: integer('version').notNull(),
  previousValues: jsonb('previous_values').$type<Record<string, unknown>>().notNull(),
  newValues: jsonb('new_values').$type<Record<string, unknown>>().notNull(),
  changedAt: timestamp('changed_at', { withTimezone: true, mode: 'date' }).notNull(),
  effectiveDate: date('effective_date', { mode: 'string' }),
  changedByUserId: uuid('changed_by_user_id').notNull().references(() => accounts.id)
})

export const auditEvents = pgTable('audit_events', {
  id: uuid('id').primaryKey(),
  action: text('action').notNull(),
  actorUserId: uuid('actor_user_id'),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull()
})

export const fieldDefinitions = pgTable('field_definitions', {
  id: uuid('id').primaryKey(),
  entityType: text('entity_type').notNull(),
  key: text('key').notNull(),
  valueType: text('value_type').notNull(),
  visibility: text('visibility').notNull(),
  requiresConsent: boolean('requires_consent').notNull().default(false),
  searchable: boolean('searchable').notNull().default(false)
}, (table) => [uniqueIndex('field_definitions_entity_key').on(table.entityType, table.key)])

export const fieldValues = pgTable('field_values', {
  id: uuid('id').primaryKey(),
  definitionId: uuid('definition_id').notNull().references(() => fieldDefinitions.id),
  entityId: uuid('entity_id').notNull(),
  valueText: text('value_text').notNull()
}, (table) => [uniqueIndex('field_values_definition_entity').on(table.definitionId, table.entityId)])

export const privateAttributeValues = pgTable('private_attribute_values', {
  id: uuid('id').primaryKey(),
  definitionId: uuid('definition_id').notNull().references(() => fieldDefinitions.id),
  entityId: uuid('entity_id'),
  subjectStudentId: uuid('subject_student_id').notNull().references(() => students.id),
  pendingSubmissionId: uuid('pending_submission_id').references(() => submissions.id, { onDelete: 'cascade' }),
  valueText: text('value_text').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
})

export const searchDocuments = pgTable('search_documents', {
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  title: text('title').notNull(),
  subtitle: text('subtitle').notNull(),
  href: text('href').notNull(),
  filters: jsonb('filters').$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
}, (table) => [primaryKey({ columns: [table.entityType, table.entityId] })])

export const rateLimitEvents = pgTable('rate_limit_events', {
  id: uuid('id').primaryKey(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' }).notNull()
})

export const uploadTickets = pgTable('upload_tickets', {
  id: uuid('id').primaryKey(),
  tokenHash: text('token_hash').notNull().unique(),
  evidenceId: uuid('evidence_id').notNull().references(() => evidence.id),
  attachmentId: uuid('attachment_id').notNull().references(() => evidenceAttachments.id),
  accountId: uuid('account_id').notNull().references(() => accounts.id),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow()
})
