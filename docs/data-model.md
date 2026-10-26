# Data model

Primary keys are UUIDs. Timestamps are ISO 8601. Postgres is empty after migration. Display-name similarity is never a match key. The school email domain is `SCHOOL_EMAIL_DOMAIN`.

`entity_type` is text. The code registry decides which types can be published. Vocabulary (trait categories, relationship types, group roles) is administrator-maintained and does not need a new table.

## Student

`id`, `displayName`, `graduationYear`, `generalComment` (sanitized Markdown on render), `archivedAt` nullable, `currentVersion`, `createdAt`, `updatedAt`.

Traits, groups, and relationships are linked by id. Profile reads assemble them from those tables and do not select private-profile columns.

## StudentPrivateProfile

`studentId`, `sexualityPreset` nullable, `sexualityCustom` nullable, `updatedAt`.

`sexualityCustom` is allowed only when the preset is `other`. This row is readable and writable only by `GET/PATCH /api/me/private-profile` for the account whose `matchedStudentId` is `studentId`. Administrator is not an exception. The field catalog cannot promote these keys to a public field.

## Field catalog

`field_definitions` stores entity type, key, value type (`string`, `number`, `date`, `enum`, `markdown`), visibility (`published`, `admin_only`, `subject_private`), whether consent is required, and whether the value is searchable.

`published` and `admin_only` values are stored in `field_values`. `subject_private` values are stored only in `private_attribute_values`. Public queries, search, graph assembly, admin review, audit, and logs do not join `private_attribute_values` or `student_private_profiles`.

## UserAccount, sessions, roster

Account: `id`, `email`, `passwordHash` nullable and never returned, `emailVerified`, `role` (`member` or `administrator`), `matchedStudentId` nullable, `matchStatus` (`pending`, `verified`, `disputed`, `corrected`), `oidcIssuer` nullable, `oidcSubject` nullable, timestamps. Institutional accounts have no password hash. The issuer and subject pair is unique.

`roster_mappings` is the authoritative email-to-student import. Login applies a mapping only when the account is still pending and unmatched. An administrator correction updates `matchedStudentId` and `matchStatus`, then deletes that account's sessions.

Sessions store a hash of the token, a CSRF secret, and an expiry. The raw token is set only as the httpOnly `bow_session` cookie. `oidc_transactions` stores the PKCE verifier, nonce, and return path until the callback, then the row is deleted.

## Trait and TraitCategory

Trait: `id`, `studentId`, `title`, `categoryId`, `description` nullable Markdown, `status` (`active` or `archived`), `currentVersion`, timestamps.

Categories are administrator-managed. Traits are approved factual labels. They are not a place for allegations, intimate details, or protected attributes.

## Evidence and TraitEvidence

Evidence: `id`, `providerUserId`, `summary`, `evidenceDate`, `urls` (HTTPS only), `verificationStatus`, `reliabilityScore` 1–5 or null, `status`, timestamps.

Attachment metadata lives in `evidence_attachments` with an `authorized` flag and an object key. Bytes live in MinIO. `GET .../attachments/{id}` returns a short-lived URL only when `authorized` is true. Otherwise `403`. `POST .../attachments/authorize` checks type and size and returns an upload ticket. Attachment bytes are not indexed.

`TraitEvidence` is a many-to-many link. Archiving a trait deletes that link, not the evidence row.

`providerUserId` is returned to administrators. Other members receive `redacted` and the label "Provider identity withheld".

## Group, GroupRole, GroupMembership

Groups are administrator-created and have `name`, Markdown `description`, `status`, `currentVersion`.

Membership: `groupId`, `studentId`, `roleId`, `startDate`, `endDate` nullable. A null end date is a current member. Members may propose a membership. Publication waits for admin approval.

## Relationship and RelationshipType

Directional polymorphic link. There is **no unique constraint** on `(source_id, target_id)`. A→B does not imply B→A.

"Create mirrored relationship" inserts two submissions that share one `batch_id`. They copy type, dates, and description, swap the endpoints, and receive different UUIDs. Approve publishes both in one transaction or leaves both unpublished. Later corrections update one id.

Any student endpoint requires that student's consent before approval can publish the relationship.

## Version history and audit

`record_revisions` stores `version`, `previousValues`, `newValues`, `changedAt`, `effectiveDate`, and `changedByUserId`. Private keys are removed before insert.

`audit_events` stores action, actor, time, and entity reference. It has no payload column. Rejection deletes the proposal body and consent rows that exist only for that proposal.

## Submission and ConsentGrant

Submission: `submitterUserId`, `entityType`, `operation`, `targetEntityId`, `proposedData`, `status`, `submittedAt`, `reviewedAt`, `reviewedBy`, `consentRequirements`, `baseVersion`, `batchId`.

Ordinary members reading someone else's submission get an anonymous shape without submitter id or proposed content. Moderators see submitter email and proposed fields after private keys are removed.

Consent: `subjectStudentId`, `scope`, `entityType`, `entityId` or `pendingSubmissionId`, `grantedAt`, `revokedAt`, `status`. Withdrawal archives the published entity on that grant. Approval cannot mark a missing requirement as satisfied.

## Search and graph

`search_documents` stores entity type, id, title, subtitle, href, and public filter columns. Cross-filters such as group plus trait category, evidence reliability, and relationship endpoint use the public tables and then read those documents. They do not join private tables.

Graph nodes are `{ id, type, label, graduationYear?, status? }` where `id` is `student:{uuid}` or `group:{uuid}`. Edges carry relationship id, type, status, and direction. Overview expands a bounded neighborhood from a few seeds. Neighbor expansion is one to three hops and is capped. Archived relationships are omitted.
