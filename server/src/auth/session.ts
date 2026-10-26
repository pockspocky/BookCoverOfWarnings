import { and, eq } from 'drizzle-orm'
import { ANONYMOUS_ACCOUNT_EMAIL, credentialsAreEmpty } from '../../../lib/auth/anonymous'
import { schoolEmailSchema } from '../../../lib/schemas/index'
import type { Student, UserAccount } from '../../../lib/types'
import { ApiError } from '../../../lib/types/errors'
import type { MatchStatus, UserRole } from '../../../lib/types/enums'
import type { Database } from '../db/client'
import { accounts, rosterMappings, sessions, students } from '../db/schema'
import { fromZod } from '../http/errors'
import { iso, newId } from '../util'
import type { Actor } from './actor'
import { permissionsFor } from './actor'
import type { VerifiedSchoolIdentity } from './claims'
import { verifyPassword } from './password'
import { hashSecret, newSecret } from './tokens'

const accountColumns = {
  id: accounts.id,
  email: accounts.email,
  emailVerified: accounts.emailVerified,
  role: accounts.role,
  matchedStudentId: accounts.matchedStudentId,
  matchStatus: accounts.matchStatus,
  createdAt: accounts.createdAt,
  updatedAt: accounts.updatedAt
}

function toActor(row: {
  sessionId: string
  expiresAt: Date
  csrfToken: string
  id: string
  email: string
  emailVerified: boolean
  role: string
  matchedStudentId: string | null
  matchStatus: string
  createdAt: Date
  updatedAt: Date
}): Actor {
  return {
    sessionId: row.sessionId,
    expiresAt: row.expiresAt,
    csrfToken: row.csrfToken,
    id: row.id,
    email: row.email,
    emailVerified: row.emailVerified,
    role: row.role as UserRole,
    matchedStudentId: row.matchedStudentId,
    matchStatus: row.matchStatus as MatchStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

export async function findActor(db: Database, token: string | null | undefined) {
  if (!token) return null
  const rows = await db.select({
    sessionId: sessions.id,
    expiresAt: sessions.expiresAt,
    csrfToken: sessions.csrfToken,
    ...accountColumns
  }).from(sessions).innerJoin(accounts, eq(sessions.accountId, accounts.id)).where(eq(sessions.tokenHash, hashSecret(token))).limit(1)
  const row = rows[0]
  if (!row) return null
  if (row.expiresAt.getTime() <= Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, row.sessionId))
    return null
  }
  return toActor(row)
}

async function matchedStudent(db: Database, studentId: string | null): Promise<Student | null> {
  if (!studentId) return null
  const rows = await db.select({
    id: students.id,
    displayName: students.displayName,
    graduationYear: students.graduationYear,
    generalComment: students.generalComment,
    archivedAt: students.archivedAt,
    currentVersion: students.currentVersion,
    createdAt: students.createdAt,
    updatedAt: students.updatedAt
  }).from(students).where(eq(students.id, studentId)).limit(1)
  const row = rows[0]
  if (!row) return null
  return {
    id: row.id,
    displayName: row.displayName,
    graduationYear: row.graduationYear,
    generalComment: row.generalComment,
    archivedAt: row.archivedAt ? iso(row.archivedAt) : null,
    currentVersion: row.currentVersion,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt)
  }
}

export async function toAuthUser(db: Database, actor: Actor) {
  const account: UserAccount = {
    id: actor.id,
    email: actor.email,
    emailVerified: actor.emailVerified,
    role: actor.role,
    matchedStudentId: actor.matchedStudentId,
    matchStatus: actor.matchStatus,
    createdAt: iso(actor.createdAt),
    updatedAt: iso(actor.updatedAt)
  }
  return {
    account,
    matchedStudent: await matchedStudent(db, actor.matchedStudentId),
    permissions: permissionsFor(actor)
  }
}

async function applyRoster(db: Database, accountId: string, email: string, matchedStudentId: string | null, matchStatus: MatchStatus) {
  if (matchStatus !== 'pending' || matchedStudentId) return { matchedStudentId, matchStatus }
  const mapping = await db.select({ studentId: rosterMappings.studentId }).from(rosterMappings).where(eq(rosterMappings.email, email)).limit(1)
  const mapped = mapping[0]
  if (!mapped) return { matchedStudentId, matchStatus }
  const next = { matchedStudentId: mapped.studentId, matchStatus: 'verified' as MatchStatus }
  await db.update(accounts).set({ ...next, updatedAt: new Date() }).where(eq(accounts.id, accountId))
  return next
}

async function createSession(db: Database, account: {
  id: string
  email: string
  emailVerified: boolean
  role: string
  matchedStudentId: string | null
  matchStatus: string
  createdAt: Date
  updatedAt: Date
}, ttlHours: number) {
  const token = newSecret()
  const csrfToken = newSecret()
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000)
  const sessionId = newId()
  await db.insert(sessions).values({
    id: sessionId,
    accountId: account.id,
    tokenHash: hashSecret(token),
    csrfToken,
    expiresAt,
    createdAt: new Date()
  })
  const actor = toActor({
    sessionId,
    expiresAt,
    csrfToken,
    id: account.id,
    email: account.email,
    emailVerified: account.emailVerified,
    role: account.role,
    matchedStudentId: account.matchedStudentId,
    matchStatus: account.matchStatus,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt
  })
  return { token, csrfToken, expiresAt, user: await toAuthUser(db, actor) }
}

export async function loginAnonymous(db: Database, ttlHours: number) {
  const now = new Date()
  await db.insert(accounts).values({
    id: newId(),
    email: ANONYMOUS_ACCOUNT_EMAIL,
    passwordHash: null,
    emailVerified: false,
    role: 'member',
    matchedStudentId: null,
    matchStatus: 'pending',
    oidcIssuer: null,
    oidcSubject: null,
    createdAt: now,
    updatedAt: now
  }).onConflictDoNothing({ target: accounts.email })
  const rows = await db.select(accountColumns).from(accounts).where(eq(accounts.email, ANONYMOUS_ACCOUNT_EMAIL)).limit(1)
  const account = rows[0]
  if (!account) throw ApiError.unauthorized('Anonymous sign-in could not be opened.')
  let current = account
  if (current.role !== 'member' || current.matchedStudentId || current.matchStatus !== 'pending') {
    await db.update(accounts).set({
      role: 'member',
      matchedStudentId: null,
      matchStatus: 'pending',
      updatedAt: now
    }).where(eq(accounts.id, current.id))
    current = {
      ...current,
      role: 'member',
      matchedStudentId: null,
      matchStatus: 'pending',
      updatedAt: now
    }
  }
  return createSession(db, current, ttlHours)
}

export async function loginAccount(db: Database, domain: string, payload: unknown, ttlHours: number) {
  if (credentialsAreEmpty(payload)) return loginAnonymous(db, ttlHours)
  const parsed = schoolEmailSchema(domain).safeParse(payload)
  if (!parsed.success) throw fromZod(parsed.error)
  const email = parsed.data.email.toLowerCase()
  const rows = await db.select({
    ...accountColumns,
    passwordHash: accounts.passwordHash
  }).from(accounts).where(eq(accounts.email, email)).limit(1)
  const account = rows[0]
  if (!account?.passwordHash || !(await verifyPassword(account.passwordHash, parsed.data.password))) {
    throw ApiError.unauthorized('Invalid email or password.')
  }
  const linked = await applyRoster(db, account.id, email, account.matchedStudentId, account.matchStatus as MatchStatus)
  return createSession(db, {
    ...account,
    matchedStudentId: linked.matchedStudentId,
    matchStatus: linked.matchStatus,
    updatedAt: linked.matchedStudentId === account.matchedStudentId ? account.updatedAt : new Date()
  }, ttlHours)
}

export async function loginWithVerifiedIdentity(db: Database, identity: VerifiedSchoolIdentity, ttlHours: number) {
  const bySubject = await db.select(accountColumns).from(accounts).where(and(
    eq(accounts.oidcIssuer, identity.issuer),
    eq(accounts.oidcSubject, identity.subject)
  )).limit(1)
  let account = bySubject[0]
  if (!account) {
    const byEmail = await db.select({
      ...accountColumns,
      oidcIssuer: accounts.oidcIssuer,
      oidcSubject: accounts.oidcSubject
    }).from(accounts).where(eq(accounts.email, identity.email)).limit(1)
    const existing = byEmail[0]
    if (existing?.oidcSubject && (existing.oidcSubject !== identity.subject || existing.oidcIssuer !== identity.issuer)) {
      throw ApiError.forbidden('This school email is already linked to a different institutional account.')
    }
    if (existing) {
      await db.update(accounts).set({
        oidcIssuer: identity.issuer,
        oidcSubject: identity.subject,
        emailVerified: true,
        updatedAt: new Date()
      }).where(eq(accounts.id, existing.id))
      account = { ...existing, emailVerified: true, updatedAt: new Date() }
    } else {
      const now = new Date()
      const created = {
        id: newId(),
        email: identity.email,
        emailVerified: true,
        role: 'member' as UserRole,
        matchedStudentId: null,
        matchStatus: 'pending' as MatchStatus,
        createdAt: now,
        updatedAt: now
      }
      await db.insert(accounts).values({
        ...created,
        passwordHash: null,
        oidcIssuer: identity.issuer,
        oidcSubject: identity.subject
      })
      account = created
    }
  }
  const linked = await applyRoster(db, account.id, account.email, account.matchedStudentId, account.matchStatus as MatchStatus)
  return createSession(db, {
    ...account,
    matchedStudentId: linked.matchedStudentId,
    matchStatus: linked.matchStatus,
    updatedAt: linked.matchedStudentId === account.matchedStudentId ? account.updatedAt : new Date()
  }, ttlHours)
}

export async function logoutToken(db: Database, token: string | null) {
  if (!token) return
  await db.delete(sessions).where(eq(sessions.tokenHash, hashSecret(token)))
}

export async function correctProfileMatch(db: Database, actor: Actor, userId: string, payload: unknown) {
  if (actor.role !== 'administrator') throw ApiError.forbidden('Only administrators can correct a profile match.')
  const { profileMatchCorrectionSchema } = await import('../../../lib/schemas/index')
  const parsed = profileMatchCorrectionSchema.safeParse(payload)
  if (!parsed.success) throw fromZod(parsed.error)
  if (parsed.data.matchedStudentId) {
    const student = await db.select({ id: students.id }).from(students).where(eq(students.id, parsed.data.matchedStudentId)).limit(1)
    if (!student[0]) throw ApiError.validation('Matched student does not exist.', { matchedStudentId: ['Matched student does not exist.'] })
  }
  const existing = await db.select(accountColumns).from(accounts).where(eq(accounts.id, userId)).limit(1)
  if (!existing[0]) throw ApiError.notFound('Account not found.')
  const updatedAt = new Date()
  await db.update(accounts).set({
    matchedStudentId: parsed.data.matchedStudentId,
    matchStatus: parsed.data.matchStatus,
    updatedAt
  }).where(eq(accounts.id, userId))
  await db.delete(sessions).where(eq(sessions.accountId, userId))
  const { writeAudit } = await import('../services/records')
  await writeAudit(db, { action: 'account.match_correct', actorId: actor.id, entityType: 'account', entityId: userId })
  const next = existing[0]
  return {
    id: next.id,
    email: next.email,
    emailVerified: next.emailVerified,
    role: next.role as UserRole,
    matchedStudentId: parsed.data.matchedStudentId,
    matchStatus: parsed.data.matchStatus,
    createdAt: iso(next.createdAt),
    updatedAt: iso(updatedAt)
  }
}
