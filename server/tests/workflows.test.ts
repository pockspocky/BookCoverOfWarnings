import { Algorithm, hash } from '@node-rs/argon2'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDatabase, createSql, type Sql } from '../src/db/client'
import { loadDotEnv } from '../src/env'
import { migrate } from '../src/db/migrate'
import { markAmbientTransaction } from '../src/db/tx'
import {
  accounts,
  auditEvents,
  evidence,
  evidenceAttachments,
  fieldDefinitions,
  privateAttributeValues,
  relationshipTypes,
  rosterMappings,
  groupMemberships,
  recordRevisions,
  relationships,
  searchDocuments,
  sessions,
  studentPrivateProfiles,
  students,
  submissions,
  traitCategories,
  traitEvidence,
  traits
} from '../src/db/schema'
import { ANONYMOUS_ACCOUNT_EMAIL } from '../../lib/auth/anonymous'
import { UnconfiguredIdentityProvider } from '../src/auth/identity'
import { loginWithVerifiedIdentity } from '../src/auth/session'
import { createApp, type AppDeps } from '../src/http/app'
import { createMetadataScanner } from '../src/services/storage'

loadDotEnv()
const databaseUrl = (process.env.DATABASE_URL ?? 'postgres://bow:bow@127.0.0.1:5433/bow').replace(/\/[^/]+$/, '/bow_test')
const password = 'test-password-1'

let sql: Sql
let db: ReturnType<typeof createDatabase>
let app: ReturnType<typeof createApp>
let passwordHash: string

const storage = {
  async ensureBucket() {},
  async presignPut(key: string) {
    return `https://storage.local/${key}`
  },
  async presignGet(key: string) {
    return `https://storage.local/${key}`
  }
}

function deps(limits?: { search?: number; submission?: number }): AppDeps {
  return {
    db,
    schoolEmailDomain: 'northbridge.test',
    webOrigin: 'http://localhost:3000',
    cookieSecure: false,
    sessionTtlHours: 12,
    submissionRateLimit: limits?.submission ?? 100,
    submissionWindowSeconds: 3600,
    searchRateLimit: limits?.search ?? 100,
    searchWindowSeconds: 60,
    storage,
    scanner: createMetadataScanner(10_000_000, ['application/pdf', 'image/png', 'image/jpeg', 'text/plain']),
    identity: new UnconfiguredIdentityProvider(),
    apiPublicUrl: 'http://localhost:3001',
    oidcRedirectUri: 'http://localhost:3001/api/auth/oidc/callback'
  }
}

async function inTx(run: () => Promise<void>) {
  await markAmbientTransaction(run)
}

async function login(email: string, secret = password) {
  const response = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: secret })
  })
  const body = await response.json() as { sessionToken?: string; csrfToken?: string; data?: { permissions?: string[] }; code?: string }
  const cookie = response.headers.get('set-cookie') ?? ''
  const token = /bow_session=([^;]+)/.exec(cookie)?.[1] ?? ''
  return { response, body, token }
}

function auth(token: string) {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

beforeAll(async () => {
  const adminUrl = databaseUrl.replace(/\/[^/]+$/, '/postgres')
  const admin = createSql(adminUrl, 1)
  const existing = await admin`select 1 from pg_database where datname = 'bow_test'`
  if (!existing.length) await admin.unsafe('create database bow_test')
  await admin.end()
  sql = createSql(databaseUrl, 1)
  await migrate(sql)
  db = createDatabase(sql)
  passwordHash = await hash(password, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 4096,
    timeCost: 1,
    parallelism: 1
  })
  app = createApp(deps())
}, 60_000)

beforeEach(async () => {
  await sql`begin`
})

afterEach(async () => {
  await sql`rollback`
})

afterAll(async () => {
  await sql?.end()
})

async function insertStudent(displayName: string) {
  const id = crypto.randomUUID()
  const now = new Date()
  await db.insert(students).values({
    id,
    displayName,
    graduationYear: 2026,
    generalComment: '',
    archivedAt: null,
    currentVersion: 1,
    createdAt: now,
    updatedAt: now
  })
  return id
}

async function insertAccount(email: string, role: 'member' | 'administrator', matchedStudentId: string | null) {
  const id = crypto.randomUUID()
  const now = new Date()
  await db.insert(accounts).values({
    id,
    email,
    passwordHash,
    emailVerified: true,
    role,
    matchedStudentId,
    matchStatus: matchedStudentId ? 'verified' : 'pending',
    createdAt: now,
    updatedAt: now
  })
  return id
}

describe('API workflows', () => {
  it('signs in with an httpOnly cookie and a bearer token', async () => {
    await inTx(async () => {
      await insertAccount('member-a@northbridge.test', 'member', null)
      const { response, body, token } = await login('member-a@northbridge.test')
      expect(response.status).toBe(200)
      expect(body.sessionToken).toBeUndefined()
      expect(body.csrfToken).toBeTruthy()
      expect(response.headers.get('set-cookie')?.toLowerCase()).toContain('httponly')
      const session = await app.request('/api/auth/session', { headers: auth(token) })
      const info = await session.json() as { authenticated: boolean; mockMode?: boolean; expiresAt: string }
      expect(info.authenticated).toBe(true)
      expect(info.mockMode).toBeUndefined()
      expect(info.expiresAt).toBeTruthy()
    })
  })

  it('opens a regular member session when login credentials are empty', async () => {
    await inTx(async () => {
      const entered = await login('', '')
      expect(entered.response.status).toBe(200)
      const account = (entered.body as { data?: { account?: { id?: string; email?: string; role?: string; matchedStudentId?: string | null }; permissions?: string[] } }).data
      expect(account?.account?.email).toBe(ANONYMOUS_ACCOUNT_EMAIL)
      expect(account?.account?.role).toBe('member')
      expect(account?.account?.matchedStudentId).toBeNull()
      expect(account?.permissions).toEqual(['directory:read', 'submissions:create'])
      expect(entered.body.sessionToken).toBeUndefined()

      const directory = await app.request('/api/students', { headers: auth(entered.token) })
      expect(directory.status).toBe(200)
      const mine = await app.request('/api/submissions/mine', { headers: auth(entered.token) })
      expect(mine.status).toBe(200)
      const adminQueue = await app.request('/api/admin/submissions', { headers: auth(entered.token) })
      expect(adminQueue.status).toBe(403)
      const profile = await app.request('/api/me/private-profile', { headers: auth(entered.token) })
      expect(profile.status).toBe(403)

      const again = await login('   ', '   ')
      expect(again.response.status).toBe(200)
      expect((again.body as { data?: { account?: { id?: string } } }).data?.account?.id).toBe(account?.account?.id)

      await db.update(accounts).set({ role: 'administrator' }).where(eq(accounts.email, ANONYMOUS_ACCOUNT_EMAIL))
      const demoted = await login('', '')
      expect((demoted.body as { data?: { account?: { role?: string } } }).data?.account?.role).toBe('member')
      expect((await app.request('/api/admin/submissions', { headers: auth(demoted.token) })).status).toBe(403)

      const partial = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: '', password: 'not-empty-password' })
      })
      expect(partial.status).toBe(422)
      const passwordAttempt = await login(ANONYMOUS_ACCOUNT_EMAIL, 'longenough-password')
      expect(passwordAttempt.response.status).toBe(422)
    })
  })

  it('keeps shared evidence when one of two traits is archived and does not let a member publish directly', async () => {
    await inTx(async () => {
      const studentId = await insertStudent('Student A')
      const memberId = await insertAccount('member-a@northbridge.test', 'member', studentId)
      await insertAccount('admin-user@northbridge.test', 'administrator', null)
      const categoryId = crypto.randomUUID()
      const now = new Date()
      await db.insert(traitCategories).values({
        id: categoryId,
        name: 'Activity',
        description: 'Approved activity',
        isActive: true,
        createdAt: now,
        updatedAt: now
      })
      const member = await login('member-a@northbridge.test')
      const admin = await login('admin-user@northbridge.test')
      const forbidden = await app.request('/api/admin/groups', {
        method: 'POST',
        headers: auth(member.token),
        body: JSON.stringify({ name: 'Closed', description: 'No' })
      })
      expect(forbidden.status).toBe(403)

      const queued = await app.request('/api/submissions', {
        method: 'POST',
        headers: auth(member.token),
        body: JSON.stringify({
          entityType: 'trait',
          operation: 'create',
          proposedData: { studentId, title: 'Not published yet', categoryId }
        })
      })
      expect(queued.status).toBe(200)
      const traitsBefore = await db.select({ id: traits.id }).from(traits)
      expect(traitsBefore).toHaveLength(0)

      const evidenceResponse = await app.request('/api/submissions', {
        method: 'POST',
        headers: auth(member.token),
        body: JSON.stringify({
          entityType: 'evidence',
          operation: 'create',
          proposedData: {
            summary: 'Shared source',
            evidenceDate: '2026-01-15',
            urls: ['https://records.example.test/file']
          }
        })
      })
      const evidenceBody = await evidenceResponse.json() as { data: { id: string } }
      const publishedEvidence = await app.request(`/api/admin/submissions/${evidenceBody.data.id}/approve`, {
        method: 'POST',
        headers: auth(admin.token)
      })
      const evidenceIds = await publishedEvidence.json() as { data: { publishedIds: string[] } }
      const evidenceId = evidenceIds.data.publishedIds[0]
      expect(evidenceId).toBeTruthy()

      const firstTrait = await (await app.request('/api/submissions', {
        method: 'POST',
        headers: auth(member.token),
        body: JSON.stringify({
          entityType: 'trait',
          operation: 'create',
          proposedData: { studentId, title: 'Trait one', categoryId, evidenceIds: [evidenceId] }
        })
      })).json() as { data: { id: string } }
      const secondTrait = await (await app.request('/api/submissions', {
        method: 'POST',
        headers: auth(member.token),
        body: JSON.stringify({
          entityType: 'trait',
          operation: 'create',
          proposedData: { studentId, title: 'Trait two', categoryId, evidenceIds: [evidenceId] }
        })
      })).json() as { data: { id: string } }
      await app.request(`/api/admin/submissions/${firstTrait.data.id}/approve`, { method: 'POST', headers: auth(admin.token) })
      await app.request(`/api/admin/submissions/${secondTrait.data.id}/approve`, { method: 'POST', headers: auth(admin.token) })
      const traitRows = await db.select({ id: traits.id, title: traits.title }).from(traits)
      const traitOne = traitRows.find((row) => row.title === 'Trait one')
      const traitTwo = traitRows.find((row) => row.title === 'Trait two')
      expect(traitOne && traitTwo).toBeTruthy()
      const archive = await app.request(`/api/admin/traits/${traitOne?.id}/archive`, { method: 'POST', headers: auth(admin.token) })
      expect(archive.status).toBe(200)
      const links = await db.select({ traitId: traitEvidence.traitId }).from(traitEvidence).where(eq(traitEvidence.evidenceId, evidenceId ?? ''))
      expect(links.map((row) => row.traitId)).toEqual([traitTwo?.id])
      const evidenceRows = await db.select({ id: evidence.id }).from(evidence).where(eq(evidence.id, evidenceId ?? ''))
      expect(evidenceRows).toHaveLength(1)
      expect(memberId).toBeTruthy()
    })
  })

  it('lets an administrator publish a relationship before subject consent, and a mirror as two ids', async () => {
    await inTx(async () => {
      const studentA = await insertStudent('Student A')
      const studentB = await insertStudent('Student B')
      await insertAccount('member-a@northbridge.test', 'member', studentA)
      await insertAccount('member-b@northbridge.test', 'member', studentB)
      await insertAccount('admin-user@northbridge.test', 'administrator', null)
      const typeId = crypto.randomUUID()
      const now = new Date()
      await db.insert(relationshipTypes).values({
        id: typeId,
        name: 'Collaborates',
        description: 'Works together',
        category: 'work',
        isActive: true,
        createdAt: now,
        updatedAt: now
      })
      const memberA = await login('member-a@northbridge.test')
      const memberB = await login('member-b@northbridge.test')
      const admin = await login('admin-user@northbridge.test')
      const queued = await (await app.request('/api/submissions', {
        method: 'POST',
        headers: auth(memberA.token),
        body: JSON.stringify({
          entityType: 'relationship',
          operation: 'create',
          proposedData: {
            sourceType: 'student',
            sourceId: studentA,
            targetType: 'student',
            targetId: studentB,
            relationshipTypeId: typeId,
            generalComment: 'One direction',
            createMirroredRelationship: false
          }
        })
      })).json() as { data: { id: string; status: string } }
      expect(queued.data.status).toBe('awaiting_consent')
      const adminGrant = await app.request(`/api/submissions/${queued.data.id}/consent`, { method: 'POST', headers: auth(admin.token) })
      expect(adminGrant.status).toBe(403)
      const approved = await (await app.request(`/api/admin/submissions/${queued.data.id}/approve`, { method: 'POST', headers: auth(admin.token) })).json() as { data: { publishedIds: string[] } }
      expect(approved.data.publishedIds).toHaveLength(1)
      expect(await db.select({ id: relationships.id }).from(relationships)).toHaveLength(1)

      const mirror = await (await app.request('/api/submissions', {
        method: 'POST',
        headers: auth(memberA.token),
        body: JSON.stringify({
          entityType: 'relationship',
          operation: 'create',
          proposedData: {
            sourceType: 'student',
            sourceId: studentA,
            targetType: 'student',
            targetId: studentB,
            relationshipTypeId: typeId,
            generalComment: 'Both directions',
            createMirroredRelationship: true
          }
        })
      })).json() as { data: Array<{ id: string }> }
      expect(mirror.data).toHaveLength(2)
      expect(mirror.data[0]?.id).not.toBe(mirror.data[1]?.id)
      for (const submission of mirror.data) {
        await app.request(`/api/submissions/${submission.id}/consent`, { method: 'POST', headers: auth(memberA.token) })
        await app.request(`/api/submissions/${submission.id}/consent`, { method: 'POST', headers: auth(memberB.token) })
      }
      const mirrorPublished = await (await app.request(`/api/admin/submissions/${mirror.data[0]?.id}/approve`, {
        method: 'POST',
        headers: auth(admin.token)
      })).json() as { data: { publishedIds: string[] } }
      expect(mirrorPublished.data.publishedIds).toHaveLength(2)
      const rows = await db.select({
        id: relationships.id,
        sourceId: relationships.sourceId,
        targetId: relationships.targetId,
        generalComment: relationships.generalComment,
        currentVersion: relationships.currentVersion
      }).from(relationships)
      expect(rows).toHaveLength(3)
      const forward = rows.find((row) => row.generalComment === 'Both directions' && row.sourceId === studentA)
      const backward = rows.find((row) => row.generalComment === 'Both directions' && row.sourceId === studentB)
      expect(forward?.id).not.toBe(backward?.id)
      expect(backward?.targetId).toBe(studentA)
      const correction = await (await app.request('/api/submissions', {
        method: 'POST',
        headers: auth(memberA.token),
        body: JSON.stringify({
          entityType: 'relationship',
          operation: 'correction',
          targetEntityId: forward?.id,
          baseVersion: forward?.currentVersion,
          proposedData: { generalComment: 'Edited one direction' }
        })
      })).json() as { data: { id: string } }
      await app.request(`/api/submissions/${correction.data.id}/consent`, { method: 'POST', headers: auth(memberA.token) })
      await app.request(`/api/submissions/${correction.data.id}/consent`, { method: 'POST', headers: auth(memberB.token) })
      expect((await app.request(`/api/admin/submissions/${correction.data.id}/approve`, { method: 'POST', headers: auth(admin.token) })).status).toBe(200)
      const after = await db.select({
        id: relationships.id,
        generalComment: relationships.generalComment
      }).from(relationships)
      expect(after.find((row) => row.id === forward?.id)?.generalComment).toBe('Edited one direction')
      expect(after.find((row) => row.id === backward?.id)?.generalComment).toBe('Both directions')
    })
  })

  it('deletes rejected proposal text and leaves only an audit reference', async () => {
    await inTx(async () => {
      const studentId = await insertStudent('Student A')
      await insertAccount('member-a@northbridge.test', 'member', studentId)
      await insertAccount('admin-user@northbridge.test', 'administrator', null)
      const categoryId = crypto.randomUUID()
      const now = new Date()
      await db.insert(traitCategories).values({
        id: categoryId,
        name: 'Activity',
        description: '',
        isActive: true,
        createdAt: now,
        updatedAt: now
      })
      const member = await login('member-a@northbridge.test')
      const admin = await login('admin-user@northbridge.test')
      const queued = await (await app.request('/api/submissions', {
        method: 'POST',
        headers: auth(member.token),
        body: JSON.stringify({
          entityType: 'trait',
          operation: 'create',
          proposedData: {
            studentId,
            title: 'delete-me-body',
            categoryId,
            sexualityPreset: 'gay'
          }
        })
      })).json() as { data: { id: string } }
      const queue = await (await app.request('/api/admin/submissions', { headers: auth(admin.token) })).json() as { data: Array<{ proposedData: Record<string, unknown> }> }
      expect(JSON.stringify(queue)).not.toContain('sexualityPreset')
      const rejected = await app.request(`/api/admin/submissions/${queued.data.id}/reject`, {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({ reason: 'Outside the publication rules.' })
      })
      expect(rejected.status).toBe(200)
      expect((await app.request(`/api/submissions/${queued.data.id}`, { headers: auth(admin.token) })).status).toBe(404)
      const remaining = await sql`select coalesce(proposed_data::text, '') as body from submissions`
      expect(remaining.some((row) => String(row.body).includes('delete-me-body'))).toBe(false)
      const audits = await db.select({
        action: auditEvents.action,
        entityType: auditEvents.entityType,
        entityId: auditEvents.entityId
      }).from(auditEvents)
      expect(audits.some((row) => row.action === 'submission.reject' && row.entityId === queued.data.id)).toBe(true)
      expect(JSON.stringify(audits)).not.toContain('delete-me-body')
      expect(JSON.stringify(audits)).not.toContain('sexuality')
    })
  })

  it('returns conflict for a stale baseVersion and leaves the published row unchanged', async () => {
    await inTx(async () => {
      const studentId = await insertStudent('Student A')
      await insertAccount('member-a@northbridge.test', 'member', studentId)
      await insertAccount('admin-user@northbridge.test', 'administrator', null)
      const member = await login('member-a@northbridge.test')
      const admin = await login('admin-user@northbridge.test')
      const queued = await (await app.request('/api/submissions', {
        method: 'POST',
        headers: auth(member.token),
        body: JSON.stringify({
          entityType: 'student',
          operation: 'correction',
          targetEntityId: studentId,
          baseVersion: 1,
          proposedData: { generalComment: 'queued change' }
        })
      })).json() as { data: { id: string } }
      const patched = await app.request(`/api/admin/students/${studentId}`, {
        method: 'PATCH',
        headers: auth(admin.token),
        body: JSON.stringify({ generalComment: 'patched directly' })
      })
      expect(patched.status).toBe(200)
      const conflict = await app.request(`/api/admin/submissions/${queued.data.id}/approve`, {
        method: 'POST',
        headers: auth(admin.token)
      })
      const body = await conflict.json() as { code: string }
      expect(conflict.status).toBe(409)
      expect(body.code).toBe('CONFLICT')
      const row = await db.select({ generalComment: students.generalComment, currentVersion: students.currentVersion }).from(students).where(eq(students.id, studentId))
      expect(row[0]?.generalComment).toBe('patched directly')
      expect(row[0]?.currentVersion).toBe(2)
    })
  })

  it('keeps private profile and private attributes off public, admin, search, graph, and audit paths', async () => {
    await inTx(async () => {
      const studentId = await insertStudent('Student A')
      const otherId = await insertStudent('Student B')
      await insertAccount('member-a@northbridge.test', 'member', studentId)
      await insertAccount('member-b@northbridge.test', 'member', null)
      await insertAccount('admin-user@northbridge.test', 'administrator', null)
      const categoryId = crypto.randomUUID()
      const now = new Date()
      await db.insert(traitCategories).values({
        id: categoryId,
        name: 'Activity',
        description: '',
        isActive: true,
        createdAt: now,
        updatedAt: now
      })
      await db.insert(fieldDefinitions).values({
        id: crypto.randomUUID(),
        entityType: 'trait',
        key: 'internalNote',
        valueType: 'string',
        visibility: 'subject_private',
        requiresConsent: true,
        searchable: false
      })
      const member = await login('member-a@northbridge.test')
      const other = await login('member-b@northbridge.test')
      const admin = await login('admin-user@northbridge.test')
      expect(admin.body.data?.permissions).not.toContain('private-profile:self')
      const saved = await app.request('/api/me/private-profile', {
        method: 'PATCH',
        headers: auth(member.token),
        body: JSON.stringify({ sexualityPreset: 'other', sexualityCustom: 'profile-marker-not-for-search' })
      })
      expect(saved.status).toBe(200)
      const own = await (await app.request('/api/me/private-profile', { headers: auth(member.token) })).json() as { sexualityCustom: string }
      expect(own.sexualityCustom).toBe('profile-marker-not-for-search')
      expect((await app.request('/api/me/private-profile', { headers: auth(other.token) })).status).toBe(403)
      expect((await app.request('/api/me/private-profile', { headers: auth(admin.token) })).status).toBe(403)

      const queued = await (await app.request('/api/submissions', {
        method: 'POST',
        headers: auth(member.token),
        body: JSON.stringify({
          entityType: 'trait',
          operation: 'create',
          proposedData: {
            studentId,
            title: 'Public label',
            categoryId,
            attributes: { internalNote: 'private-marker-not-for-search' },
            requiresConsent: true
          }
        })
      })).json() as { data: { id: string; status: string } }
      expect(queued.data.status).toBe('awaiting_consent')
      const review = await (await app.request('/api/admin/submissions', { headers: auth(admin.token) })).json()
      expect(JSON.stringify(review)).not.toContain('private-marker-not-for-search')
      expect(JSON.stringify(review)).not.toContain('profile-marker-not-for-search')
      expect(JSON.stringify(review)).not.toContain('sexuality')
      await app.request(`/api/submissions/${queued.data.id}/consent`, { method: 'POST', headers: auth(member.token) })
      expect((await app.request(`/api/admin/submissions/${queued.data.id}/approve`, { method: 'POST', headers: auth(admin.token) })).status).toBe(200)
      const storedPrivate = await db.select({ valueText: privateAttributeValues.valueText }).from(privateAttributeValues)
      expect(storedPrivate.some((row) => row.valueText === 'private-marker-not-for-search')).toBe(true)
      const profileRows = await db.select({ sexualityCustom: studentPrivateProfiles.sexualityCustom }).from(studentPrivateProfiles)
      expect(profileRows[0]?.sexualityCustom).toBe('profile-marker-not-for-search')

      const student = await (await app.request(`/api/students/${studentId}`, { headers: auth(other.token) })).json()
      const search = await (await app.request('/api/search?q=profile-marker-not-for-search', { headers: auth(admin.token) })).json()
      const privateSearch = await (await app.request('/api/search?q=private-marker-not-for-search', { headers: auth(admin.token) })).json()
      const graph = await (await app.request('/api/graph', { headers: auth(admin.token) })).json()
      const neighborhood = await (await app.request(`/api/graph/neighbors/student/${studentId}`, { headers: auth(admin.token) })).json() as { nodes: Array<Record<string, unknown>> }
      const blob = JSON.stringify({ student, search, privateSearch, graph, neighborhood })
      expect(blob).not.toContain('profile-marker-not-for-search')
      expect(blob).not.toContain('private-marker-not-for-search')
      expect(blob).not.toContain('sexuality')
      expect(blob).not.toContain('internalNote')
      const node = neighborhood.nodes.find((item) => item.id === `student:${studentId}`)
      expect(Object.keys(node ?? {}).sort()).toEqual(['graduationYear', 'id', 'label', 'status', 'type'])
      const docs = await db.select({
        title: searchDocuments.title,
        subtitle: searchDocuments.subtitle,
        filters: searchDocuments.filters
      }).from(searchDocuments)
      expect(JSON.stringify(docs)).not.toContain('profile-marker')
      expect(JSON.stringify(docs)).not.toContain('private-marker')
      expect(otherId).toBeTruthy()
    })
  })

  it('refuses an unauthorized attachment and a disallowed upload', async () => {
    await inTx(async () => {
      const accountId = await insertAccount('member-a@northbridge.test', 'member', null)
      const evidenceId = crypto.randomUUID()
      const attachmentId = crypto.randomUUID()
      const now = new Date()
      await db.insert(evidence).values({
        id: evidenceId,
        providerUserId: accountId,
        summary: 'Notes',
        evidenceDate: '2026-02-02',
        urls: [],
        verificationStatus: 'pending',
        reliabilityScore: null,
        status: 'active',
        createdAt: now,
        updatedAt: now
      })
      await db.insert(evidenceAttachments).values({
        id: attachmentId,
        evidenceId,
        fileName: 'notes.pdf',
        contentType: 'application/pdf',
        sizeBytes: 10,
        authorized: false,
        objectKey: `attachments/${evidenceId}/${attachmentId}`,
        createdAt: now
      })
      const member = await login('member-a@northbridge.test')
      const denied = await app.request(`/api/evidence/${evidenceId}/attachments/${attachmentId}`, { headers: auth(member.token) })
      expect(denied.status).toBe(403)
      expect((await denied.json() as { code: string }).code).toBe('FORBIDDEN')
      const invalid = await app.request(`/api/evidence/${evidenceId}/attachments/authorize`, {
        method: 'POST',
        headers: auth(member.token),
        body: JSON.stringify({ fileName: 'evil.exe', contentType: 'application/x-msdownload', sizeBytes: 20 })
      })
      expect(invalid.status).toBe(422)
    })
  })

  it('revokes every session when an administrator corrects the profile match', async () => {
    await inTx(async () => {
      const studentId = await insertStudent('Student A')
      const memberId = await insertAccount('member-a@northbridge.test', 'member', null)
      await insertAccount('admin-user@northbridge.test', 'administrator', null)
      const member = await login('member-a@northbridge.test')
      expect((await app.request('/api/auth/me', { headers: auth(member.token) })).status).toBe(200)
      const admin = await login('admin-user@northbridge.test')
      const corrected = await app.request(`/api/admin/profile-matches/${memberId}/correct`, {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({ matchedStudentId: studentId, matchStatus: 'corrected', reason: 'Roster mapping was corrected.' })
      })
      expect(corrected.status).toBe(200)
      expect((await app.request('/api/auth/me', { headers: auth(member.token) })).status).toBe(401)
      const remaining = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.accountId, memberId))
      expect(remaining).toHaveLength(0)
      const again = await login('member-a@northbridge.test')
      const me = await (await app.request('/api/auth/me', { headers: auth(again.token) })).json() as { account: { matchedStudentId: string; matchStatus: string } }
      expect(me.account.matchedStudentId).toBe(studentId)
      expect(me.account.matchStatus).toBe('corrected')
    })
  })

  it('requires a CSRF token only for cookie mutations without a bearer token', async () => {
    await inTx(async () => {
      const studentId = await insertStudent('Student A')
      await insertAccount('member-a@northbridge.test', 'member', studentId)
      const { response, body, token } = await login('member-a@northbridge.test')
      expect(body.sessionToken).toBeUndefined()
      const cookie = /bow_session=([^;]+)/.exec(response.headers.get('set-cookie') ?? '')?.[1]
      expect(cookie).toBe(token)
      expect(response.headers.get('set-cookie')).toContain('HttpOnly')
      const categoryId = crypto.randomUUID()
      const now = new Date()
      await db.insert(traitCategories).values({
        id: categoryId,
        name: 'Activity',
        description: '',
        isActive: true,
        createdAt: now,
        updatedAt: now
      })
      const payload = JSON.stringify({
        entityType: 'trait',
        operation: 'create',
        proposedData: { studentId, title: 'Cookie trait', categoryId }
      })
      const missing = await app.request('/api/submissions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `bow_session=${cookie}` },
        body: payload
      })
      expect(missing.status).toBe(403)
      const withBearer = await app.request('/api/submissions', {
        method: 'POST',
        headers: auth(token),
        body: payload
      })
      expect(withBearer.status).toBe(200)
      const queued = await db.select({ id: submissions.id }).from(submissions)
      expect(queued.length).toBeGreaterThan(0)
    })
  })

  it('returns 429 when the search window is exceeded', async () => {
    await inTx(async () => {
      await insertAccount('member-a@northbridge.test', 'member', null)
      const limited = createApp(deps({ search: 1 }))
      const { token } = await login('member-a@northbridge.test')
      const first = await limited.request('/api/search', { headers: auth(token) })
      expect(first.status).toBe(200)
      const second = await limited.request('/api/search?q=student', { headers: auth(token) })
      expect(second.status).toBe(429)
      expect(second.headers.get('retry-after')).toBeTruthy()
      expect((await second.json() as { code: string }).code).toBe('RATE_LIMITED')
    })
  })

  it('publishes administrator creates immediately and keeps consent, version, and shared-evidence rules', async () => {
    await inTx(async () => {
      const studentA = await insertStudent('Consent Subject')
      await insertAccount('publish-member@northbridge.test', 'member', studentA)
      await insertAccount('publish-admin@northbridge.test', 'administrator', null)
      const categoryId = crypto.randomUUID()
      const now = new Date()
      await db.insert(traitCategories).values({
        id: categoryId,
        name: 'Publication',
        description: 'Direct publication',
        isActive: true,
        createdAt: now,
        updatedAt: now
      })
      const member = await login('publish-member@northbridge.test')
      const admin = await login('publish-admin@northbridge.test')
      const memberBodies = [
        ['/api/admin/students', { displayName: 'Blocked', graduationYear: 2026, generalComment: '' }],
        ['/api/admin/traits', { studentId: studentA, title: 'Blocked', categoryId }],
        ['/api/admin/evidence', { summary: 'Blocked', evidenceDate: '2026-03-01', urls: ['https://records.example.test/blocked'] }],
        ['/api/admin/memberships', { groupId: crypto.randomUUID(), studentId: studentA, roleId: crypto.randomUUID(), startDate: '2026-01-01' }],
        ['/api/admin/relationships', { sourceType: 'student', sourceId: studentA, targetType: 'student', targetId: studentA, relationshipTypeId: crypto.randomUUID(), generalComment: 'Blocked' }]
      ] as const
      for (const [path, body] of memberBodies) {
        const forbidden = await app.request(path, { method: 'POST', headers: auth(member.token), body: JSON.stringify(body) })
        expect(forbidden.status).toBe(403)
      }
      const memberStudent = await app.request('/api/submissions', {
        method: 'POST',
        headers: auth(member.token),
        body: JSON.stringify({
          entityType: 'student',
          operation: 'create',
          proposedData: { displayName: 'Not allowed', graduationYear: 2026, generalComment: '' }
        })
      })
      expect(memberStudent.status).toBe(403)

      const createdStudent = await app.request('/api/admin/students', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({ displayName: 'Published Student', graduationYear: 2027, generalComment: 'Public note' })
      })
      expect(createdStudent.status).toBe(200)
      const studentBody = await createdStudent.json() as { data: { id: string; displayName: string; currentVersion: number } }
      const studentId = studentBody.data.id
      expect(studentBody.data.displayName).toBe('Published Student')
      expect(JSON.stringify(studentBody)).not.toContain('sexual')
      expect(await db.select({ id: submissions.id }).from(submissions)).toHaveLength(0)

      const createdEvidence = await app.request('/api/admin/evidence', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({
          summary: 'Shared source',
          evidenceDate: '2026-04-02',
          urls: ['https://records.example.test/shared']
        })
      })
      expect(createdEvidence.status).toBe(200)
      const evidenceId = (await createdEvidence.json() as { data: { id: string } }).data.id
      const firstTrait = await app.request('/api/admin/traits', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({ studentId, title: 'Trait one', categoryId, evidenceIds: [evidenceId] })
      })
      const secondTrait = await app.request('/api/admin/traits', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({ studentId, title: 'Trait two', categoryId, evidenceIds: [evidenceId] })
      })
      expect(firstTrait.status).toBe(200)
      expect(secondTrait.status).toBe(200)
      const traitOneId = (await firstTrait.json() as { data: { id: string } }).data.id
      const traitTwoId = (await secondTrait.json() as { data: { id: string; currentVersion: number } }).data.id
      expect(await db.select({ id: submissions.id }).from(submissions)).toHaveLength(0)

      const archivedTrait = await app.request(`/api/admin/traits/${traitOneId}/archive`, { method: 'POST', headers: auth(admin.token) })
      expect(archivedTrait.status).toBe(200)
      const traitRows = await db.select({ id: traits.id, status: traits.status }).from(traits)
      expect(traitRows.find((row) => row.id === traitOneId)?.status).toBe('archived')
      expect(traitRows.find((row) => row.id === traitTwoId)?.status).toBe('active')
      const evidenceRows = await db.select({ id: evidence.id, status: evidence.status }).from(evidence).where(eq(evidence.id, evidenceId))
      expect(evidenceRows).toEqual([{ id: evidenceId, status: 'active' }])
      const links = await db.select({ traitId: traitEvidence.traitId }).from(traitEvidence).where(eq(traitEvidence.evidenceId, evidenceId))
      expect(links.map((row) => row.traitId)).toEqual([traitTwoId])
      const traitHistory = await db.select({ id: recordRevisions.id }).from(recordRevisions).where(eq(recordRevisions.entityId, traitOneId))
      expect(traitHistory.length).toBeGreaterThan(0)

      const revised = await app.request(`/api/admin/students/${studentId}`, {
        method: 'PATCH',
        headers: auth(admin.token),
        body: JSON.stringify({ generalComment: 'Revised note', baseVersion: 1 })
      })
      expect(revised.status).toBe(200)
      const history = await (await app.request(`/api/students/${studentId}/history`, { headers: auth(admin.token) })).json() as Array<{ version: number }>
      expect(history.some((entry) => entry.version === 2)).toBe(true)
      const conflict = await app.request(`/api/admin/students/${studentId}`, {
        method: 'PATCH',
        headers: auth(admin.token),
        body: JSON.stringify({ generalComment: 'Stale note', baseVersion: 1 })
      })
      expect(conflict.status).toBe(409)
      expect((await conflict.json() as { code: string }).code).toBe('CONFLICT')
      const studentRow = await db.select({
        generalComment: students.generalComment,
        currentVersion: students.currentVersion
      }).from(students).where(eq(students.id, studentId))
      expect(studentRow[0]).toMatchObject({ generalComment: 'Revised note', currentVersion: 2 })
      const historyAfter = await (await app.request(`/api/students/${studentId}/history`, { headers: auth(admin.token) })).json() as unknown[]
      expect(historyAfter).toHaveLength(history.length)

      const traitRevised = await app.request(`/api/admin/traits/${traitTwoId}`, {
        method: 'PATCH',
        headers: auth(admin.token),
        body: JSON.stringify({ title: 'Trait two revised', baseVersion: 1 })
      })
      expect(traitRevised.status).toBe(200)
      const traitConflict = await app.request(`/api/admin/traits/${traitTwoId}`, {
        method: 'PATCH',
        headers: auth(admin.token),
        body: JSON.stringify({ title: 'Trait two stale', baseVersion: 1 })
      })
      expect(traitConflict.status).toBe(409)
      expect((await traitConflict.json() as { code: string }).code).toBe('CONFLICT')
      const traitTitle = await db.select({ title: traits.title, currentVersion: traits.currentVersion }).from(traits).where(eq(traits.id, traitTwoId))
      expect(traitTitle[0]).toMatchObject({ title: 'Trait two revised', currentVersion: 2 })

      const typeResponse = await app.request('/api/admin/relationship-types', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({ name: 'Studies with', description: 'Academic', category: 'school' })
      })
      const typeId = (await typeResponse.json() as { data: { id: string } }).data.id
      const personal = await app.request('/api/admin/relationships', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({
          sourceType: 'student',
          sourceId: studentId,
          targetType: 'student',
          targetId: studentA,
          relationshipTypeId: typeId,
          generalComment: 'Needs consent',
          createMirroredRelationship: false
        })
      })
      expect(personal.status).toBe(200)
      const personalMirror = await app.request('/api/admin/relationships', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({
          sourceType: 'student',
          sourceId: studentId,
          targetType: 'student',
          targetId: studentA,
          relationshipTypeId: typeId,
          generalComment: 'Mirror needs consent',
          createMirroredRelationship: true
        })
      })
      expect(personalMirror.status).toBe(200)
      expect(await db.select({ id: relationships.id }).from(relationships)).toHaveLength(3)

      const groupOne = await app.request('/api/admin/groups', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({ name: 'Group One', description: 'First' })
      })
      const groupTwo = await app.request('/api/admin/groups', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({ name: 'Group Two', description: 'Second' })
      })
      const groupOneId = (await groupOne.json() as { data: { id: string } }).data.id
      const groupTwoId = (await groupTwo.json() as { data: { id: string } }).data.id
      const mirror = await app.request('/api/admin/relationships', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({
          sourceType: 'group',
          sourceId: groupOneId,
          targetType: 'group',
          targetId: groupTwoId,
          relationshipTypeId: typeId,
          generalComment: 'Group mirror',
          createMirroredRelationship: true
        })
      })
      expect(mirror.status).toBe(200)
      const mirrorBody = await mirror.json() as { data: Array<{ id: string; sourceId: string; targetId: string }> }
      expect(mirrorBody.data).toHaveLength(2)
      expect(mirrorBody.data[0]?.id).not.toBe(mirrorBody.data[1]?.id)
      const forward = mirrorBody.data.find((row) => row.sourceId === groupOneId)
      const backward = mirrorBody.data.find((row) => row.sourceId === groupTwoId)
      expect(forward?.targetId).toBe(groupTwoId)
      expect(backward?.targetId).toBe(groupOneId)
      expect(await db.select({ id: relationships.id }).from(relationships)).toHaveLength(5)
      expect(await db.select({ id: submissions.id }).from(submissions)).toHaveLength(0)

      const reusedType = await app.request('/api/admin/relationships', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({
          sourceType: 'group',
          sourceId: groupTwoId,
          targetType: 'group',
          targetId: groupOneId,
          relationshipTypeName: 'studies with',
          generalComment: 'Reuses the existing type',
          createMirroredRelationship: false
        })
      })
      expect(reusedType.status).toBe(200)
      const createdType = await app.request('/api/admin/relationships', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({
          sourceType: 'group',
          sourceId: groupOneId,
          targetType: 'group',
          targetId: groupTwoId,
          relationshipTypeName: 'Competes with',
          generalComment: 'Creates a new type',
          createMirroredRelationship: false
        })
      })
      expect(createdType.status).toBe(200)
      const typeNames = await db.select({ name: relationshipTypes.name }).from(relationshipTypes)
      expect(typeNames.filter((row) => row.name.toLowerCase() === 'studies with')).toHaveLength(1)
      expect(typeNames.some((row) => row.name === 'Competes with')).toBe(true)

      const roleResponse = await app.request('/api/admin/group-roles', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({ name: 'Member', description: 'Current member' })
      })
      const roleId = (await roleResponse.json() as { data: { id: string } }).data.id
      const membership = await app.request('/api/admin/memberships', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({ groupId: groupOneId, studentId, roleId, startDate: '2026-01-15' })
      })
      expect(membership.status).toBe(200)
      const membershipId = (await membership.json() as { data: { id: string } }).data.id
      const tooEarly = await app.request(`/api/admin/memberships/${membershipId}`, {
        method: 'PATCH',
        headers: auth(admin.token),
        body: JSON.stringify({ endDate: '2025-01-01' })
      })
      expect(tooEarly.status).toBe(422)
      const ended = await app.request(`/api/admin/memberships/${membershipId}`, {
        method: 'PATCH',
        headers: auth(admin.token),
        body: JSON.stringify({ endDate: '2026-06-01' })
      })
      expect(ended.status).toBe(200)
      const membershipRows = await db.select({
        id: groupMemberships.id,
        endDate: groupMemberships.endDate
      }).from(groupMemberships).where(eq(groupMemberships.id, membershipId))
      expect(membershipRows).toEqual([{ id: membershipId, endDate: '2026-06-01' }])

      const queued = await app.request('/api/submissions', {
        method: 'POST',
        headers: auth(member.token),
        body: JSON.stringify({
          entityType: 'trait',
          operation: 'create',
          proposedData: { studentId, title: 'Queued only', categoryId }
        })
      })
      expect(queued.status).toBe(200)
      expect((await queued.json() as { data: { status: string } }).data.status).toBe('pending')
      expect(await db.select({ id: traits.id }).from(traits)).toHaveLength(2)
      expect(await db.select({ id: submissions.id }).from(submissions)).toHaveLength(1)

      const archivedStudent = await app.request(`/api/admin/students/${studentId}/archive`, { method: 'POST', headers: auth(admin.token) })
      expect(archivedStudent.status).toBe(200)
      const archivedRow = await db.select({ id: students.id, archivedAt: students.archivedAt }).from(students).where(eq(students.id, studentId))
      expect(archivedRow).toHaveLength(1)
      expect(archivedRow[0]?.archivedAt).toBeTruthy()
      const historyFinal = await (await app.request(`/api/students/${studentId}/history`, { headers: auth(admin.token) })).json() as unknown[]
      expect(historyFinal.length).toBeGreaterThan(historyAfter.length)
    })
  })

  it('refuses institutional login when the provider is not configured', async () => {
    const response = await app.request('/api/auth/oidc/start', { headers: { accept: 'application/json' } })
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ code: 'NOT_FOUND' })
    const providers = await (await app.request('/api/auth/providers')).json() as { oidc: boolean }
    expect(providers.oidc).toBe(false)
    const sessionsBefore = await db.select({ id: sessions.id }).from(sessions)
    expect(sessionsBefore).toHaveLength(0)
  })

  it('links a verified school identity without using a display name', async () => {
    await inTx(async () => {
      const studentId = await insertStudent('Different Person')
      await db.insert(rosterMappings).values({
        id: crypto.randomUUID(),
        email: 'member-a@northbridge.test',
        studentId,
        createdAt: new Date()
      })
      const result = await loginWithVerifiedIdentity(db, {
        issuer: 'https://idp.northbridge.test',
        subject: 'subject-1',
        email: 'member-a@northbridge.test'
      }, 1)
      expect(result.user.account.role).toBe('member')
      expect(result.user.account.matchedStudentId).toBe(studentId)
      expect(result.user.matchedStudent?.displayName).toBe('Different Person')
      const again = await loginWithVerifiedIdentity(db, {
        issuer: 'https://idp.northbridge.test',
        subject: 'subject-1',
        email: 'member-a@northbridge.test'
      }, 1)
      expect(again.user.account.id).toBe(result.user.account.id)
      const denied = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'member-a@northbridge.test', password: 'test-password-1' })
      })
      expect(denied.status).toBe(401)
      await insertAccount('taken@northbridge.test', 'member', null)
      await db.update(accounts).set({ oidcIssuer: 'https://idp.northbridge.test', oidcSubject: 'other-subject' }).where(eq(accounts.email, 'taken@northbridge.test'))
      await expect(loginWithVerifiedIdentity(db, {
        issuer: 'https://idp.northbridge.test',
        subject: 'new-subject',
        email: 'taken@northbridge.test'
      }, 1)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    })
  })

  it('lets an administrator create another administrator without promoting an existing account', async () => {
    await inTx(async () => {
      await insertAccount('admin-user@northbridge.test', 'administrator', null)
      const memberId = await insertAccount('member-a@northbridge.test', 'member', null)
      const admin = await login('admin-user@northbridge.test')
      const member = await login('member-a@northbridge.test')
      const nextPassword = 'second-admin-pass'
      const createdEmail = 'second-admin@northbridge.test'

      const anonymous = await app.request('/api/admin/administrators', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: createdEmail, password: nextPassword })
      })
      expect(anonymous.status).toBe(401)

      const forbidden = await app.request('/api/admin/administrators', {
        method: 'POST',
        headers: auth(member.token),
        body: JSON.stringify({ email: createdEmail, password: nextPassword })
      })
      expect(forbidden.status).toBe(403)

      const badDomain = await app.request('/api/admin/administrators', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({ email: 'second-admin@example.com', password: nextPassword })
      })
      expect(badDomain.status).toBe(422)

      const shortPassword = await app.request('/api/admin/administrators', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({ email: createdEmail, password: 'short-pass' })
      })
      expect(shortPassword.status).toBe(422)

      const promote = await app.request('/api/admin/administrators', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({ email: 'member-a@northbridge.test', password: nextPassword })
      })
      expect(promote.status).toBe(409)
      const memberRow = await db.select({ role: accounts.role }).from(accounts).where(eq(accounts.id, memberId))
      expect(memberRow[0]?.role).toBe('member')

      const created = await app.request('/api/admin/administrators', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({ email: 'Second-Admin@Northbridge.test', password: nextPassword })
      })
      expect(created.status).toBe(200)
      const createdBody = await created.json() as {
        data: {
          email: string
          role: string
          emailVerified: boolean
          matchedStudentId: string | null
          matchStatus: string
          password?: string
          passwordHash?: string
        }
      }
      expect(createdBody.data).toMatchObject({
        email: createdEmail,
        role: 'administrator',
        emailVerified: true,
        matchedStudentId: null,
        matchStatus: 'pending'
      })
      expect(createdBody.data.password).toBeUndefined()
      expect(createdBody.data.passwordHash).toBeUndefined()
      expect(JSON.stringify(createdBody)).not.toContain(nextPassword)

      const row = await db.select({
        role: accounts.role,
        emailVerified: accounts.emailVerified,
        matchedStudentId: accounts.matchedStudentId,
        matchStatus: accounts.matchStatus,
        oidcIssuer: accounts.oidcIssuer,
        oidcSubject: accounts.oidcSubject,
        passwordHash: accounts.passwordHash
      }).from(accounts).where(eq(accounts.email, createdEmail))
      expect(row).toHaveLength(1)
      expect(row[0]).toMatchObject({
        role: 'administrator',
        emailVerified: true,
        matchedStudentId: null,
        matchStatus: 'pending',
        oidcIssuer: null,
        oidcSubject: null
      })
      expect(row[0]?.passwordHash).toBeTruthy()
      expect(row[0]?.passwordHash).not.toBe(nextPassword)

      const duplicate = await app.request('/api/admin/administrators', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({ email: createdEmail, password: nextPassword })
      })
      expect(duplicate.status).toBe(409)
      expect(await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.role, 'administrator'))).toHaveLength(2)

      const second = await login(createdEmail, nextPassword)
      expect(second.response.status).toBe(200)
      const me = await app.request('/api/auth/me', { headers: auth(second.token) })
      expect(me.status).toBe(200)
      expect(await me.json()).toMatchObject({ account: { role: 'administrator', email: createdEmail } })
    })
  })

  it('lets an administrator update a relationship and attach evidence once', async () => {
    await inTx(async () => {
      await insertAccount('directory-admin@northbridge.test', 'administrator', null)
      await insertAccount('directory-member@northbridge.test', 'member', null)
      const admin = await login('directory-admin@northbridge.test')
      const member = await login('directory-member@northbridge.test')
      const studentId = await insertStudent('Evidence Subject')
      const categoryId = crypto.randomUUID()
      const now = new Date()
      await db.insert(traitCategories).values({
        id: categoryId,
        name: 'Directory',
        description: 'Directory admin',
        isActive: true,
        createdAt: now,
        updatedAt: now
      })
      const groupOne = await app.request('/api/admin/groups', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({ name: 'Directory One', description: 'First' })
      })
      const groupTwo = await app.request('/api/admin/groups', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({ name: 'Directory Two', description: 'Second' })
      })
      const groupOneId = (await groupOne.json() as { data: { id: string } }).data.id
      const groupTwoId = (await groupTwo.json() as { data: { id: string } }).data.id
      const typeResponse = await app.request('/api/admin/relationship-types', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({ name: 'Works beside', description: 'Adjacent groups', category: 'school' })
      })
      const typeId = (await typeResponse.json() as { data: { id: string } }).data.id
      const created = await app.request('/api/admin/relationships', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({
          sourceType: 'group',
          sourceId: groupOneId,
          targetType: 'group',
          targetId: groupTwoId,
          relationshipTypeId: typeId,
          generalComment: 'Original comment',
          createMirroredRelationship: false
        })
      })
      expect(created.status).toBe(200)
      const relationshipId = (await created.json() as { data: { id: string } }).data.id
      const updated = await app.request(`/api/admin/relationships/${relationshipId}`, {
        method: 'PATCH',
        headers: auth(admin.token),
        body: JSON.stringify({
          generalComment: 'Updated comment',
          startDate: '2024-01-01',
          endDate: '2024-06-01',
          status: 'ended',
          baseVersion: 1
        })
      })
      expect(updated.status).toBe(200)
      const relationshipRows = await db.select({
        generalComment: relationships.generalComment,
        startDate: relationships.startDate,
        endDate: relationships.endDate,
        status: relationships.status,
        currentVersion: relationships.currentVersion
      }).from(relationships).where(eq(relationships.id, relationshipId))
      expect(relationshipRows[0]).toMatchObject({
        generalComment: 'Updated comment',
        startDate: '2024-01-01',
        endDate: '2024-06-01',
        status: 'ended',
        currentVersion: 2
      })

      const traitResponse = await app.request('/api/admin/traits', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({ studentId, title: 'Cited trait', categoryId })
      })
      const evidenceResponse = await app.request('/api/admin/evidence', {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({ summary: 'Shared record', evidenceDate: '2026-02-02', urls: ['https://records.example.test/shared'] })
      })
      const traitId = (await traitResponse.json() as { data: { id: string } }).data.id
      const evidenceId = (await evidenceResponse.json() as { data: { id: string } }).data.id
      const firstLink = await app.request(`/api/admin/traits/${traitId}/evidence`, {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({ evidenceId })
      })
      const secondLink = await app.request(`/api/admin/traits/${traitId}/evidence`, {
        method: 'POST',
        headers: auth(admin.token),
        body: JSON.stringify({ evidenceId })
      })
      expect(firstLink.status).toBe(200)
      expect(secondLink.status).toBe(200)
      const links = await db.select({ id: traitEvidence.id }).from(traitEvidence).where(eq(traitEvidence.traitId, traitId))
      expect(links).toHaveLength(1)

      const deniedUpdate = await app.request(`/api/admin/relationships/${relationshipId}`, {
        method: 'PATCH',
        headers: auth(member.token),
        body: JSON.stringify({ generalComment: 'Member edit', baseVersion: 2 })
      })
      const deniedLink = await app.request(`/api/admin/traits/${traitId}/evidence`, {
        method: 'POST',
        headers: auth(member.token),
        body: JSON.stringify({ evidenceId })
      })
      expect(deniedUpdate.status).toBe(403)
      expect(deniedLink.status).toBe(403)
      const unchanged = await db.select({ generalComment: relationships.generalComment }).from(relationships).where(eq(relationships.id, relationshipId))
      expect(unchanged[0]?.generalComment).toBe('Updated comment')
      expect(await db.select({ id: traitEvidence.id }).from(traitEvidence).where(eq(traitEvidence.traitId, traitId))).toHaveLength(1)
    })
  })
})
