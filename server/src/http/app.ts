import { timingSafeEqual } from 'node:crypto'
import { and, count, desc, eq, lt, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { z } from 'zod'
import {
  paginationQuerySchema,
  schoolEmailSchema,
  searchFiltersSchema,
  studentListQuerySchema,
  uuidSchema,
  verifyEvidenceSchema
} from '../../../lib/schemas/index'
import { ANONYMOUS_ACCOUNT_EMAIL } from '../../../lib/auth/anonymous'
import { ApiError } from '../../../lib/types/errors'
import type { SearchFilters } from '../../../lib/types'
import type { Actor } from '../auth/actor'
import type { IdentityProvider } from '../auth/identity'
import { hashPassword } from '../auth/password'
import { findActor, loginAccount, loginWithVerifiedIdentity, logoutToken, toAuthUser, correctProfileMatch } from '../auth/session'
import type { Database } from '../db/client'
import { accounts, oidcTransactions, submissions } from '../db/schema'
import {
  insertCategory,
  insertGroup,
  insertGroupRole,
  insertRelationshipType,
  patchCategory,
  patchGroup,
  patchGroupRole,
  patchRelationshipType,
  attachTraitEvidence,
  traitModule,
  relationshipModule,
  studentModule,
  verifyEvidence
} from '../modules/entities'
import {
  dashboardStats,
  evidenceTraits,
  getEvidence,
  getGroup,
  getTrait,
  getRelationship,
  getStudent,
  groupMembers,
  historyFor,
  listAccounts,
  listCategories,
  listEvidence,
  listGroups,
  listRelationshipTypes,
  listRelationships,
  listRoles,
  listStudents,
  listTraits,
  loadCategory,
  loadEvidenceRow,
  loadGroupRow,
  loadMembership,
  loadRelationshipType,
  loadRole,
  recentUpdates,
  relationshipsFor,
  studentGroups,
  studentTraits
} from '../services/directory'
import { neighborhood, overview } from '../services/graph'
import { readPrivateProfile, patchPrivateProfile } from '../services/private-profile'
import { enforceRateLimit } from '../services/rate-limit'
import { searchDirectory } from '../services/search'
import { authorizeDownload, authorizeUpload, type AttachmentScanner, type ObjectStorage } from '../services/storage'
import {
  archiveAdminRecord,
  endAdminMembership,
  publishAdminChange,
  publishAdminRelationship
} from '../services/publish'
import {
  approveSubmission,
  assertVersion,
  grantConsent,
  presentAnonymous,
  presentOwned,
  queueSubmission,
  rejectSubmission,
  revokeConsent,
  toAdminSubmission
} from '../services/submissions'
import { RateLimitError, fromZod } from './errors'
import { parseQuery } from './query'
import { newSecret } from '../auth/tokens'
import { sessionCookieOptions } from './session-cookie'
import { iso, newId, pageWindow } from '../util'

export type AppDeps = {
  db: Database
  schoolEmailDomain: string
  webOrigin: string
  webOrigins?: string[]
  cookieSecure: boolean
  sessionTtlHours: number
  submissionRateLimit: number
  submissionWindowSeconds: number
  searchRateLimit: number
  searchWindowSeconds: number
  storage: ObjectStorage
  scanner: AttachmentScanner
  identity: IdentityProvider
  apiPublicUrl: string
  oidcRedirectUri: string
}

type AppEnv = { Variables: { actor: Actor | null; authMethod: 'bearer' | 'cookie' | 'none' } }

function uniqueViolation(error: unknown) {
  let current: unknown = error
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
    if ('code' in current && (current as { code?: unknown }).code === '23505') return true
    current = 'cause' in current ? (current as { cause?: unknown }).cause : undefined
  }
  return false
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function bearerToken(header: string | undefined) {
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header)
  return match?.[1]?.trim() || null
}

function pathId(value: string) {
  const parsed = uuidSchema.safeParse(value)
  if (!parsed.success) throw ApiError.notFound()
  return parsed.data
}

function requireActor(c: { get: (key: 'actor') => Actor | null }) {
  const actor = c.get('actor')
  if (!actor) throw ApiError.unauthorized()
  return actor
}

function requireAdmin(actor: Actor) {
  if (actor.role !== 'administrator') throw ApiError.forbidden('Administrator access is required.')
}

const namedSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(20_000)
})

function safeNext(value: string | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || value.includes('://')) return '/'
  return value
}

function institutionalFailure(
  c: {
    req: { header: (name: string) => string | undefined }
    json: (body: unknown, status: (401 | 404)) => Response
    redirect: (location: string) => Response
  },
  webOrigin: string,
  status: 401 | 404 = 404
) {
  if ((c.req.header('accept') ?? '').includes('application/json')) {
    return c.json({
      code: status === 404 ? 'NOT_FOUND' : 'UNAUTHORIZED',
      message: 'Institutional login was not accepted.'
    }, status)
  }
  return c.redirect(`${webOrigin}/login?error=institutional`)
}

function originsFor(origins: string[]) {
  const values = new Set<string>()
  for (const origin of origins) {
    values.add(origin)
    if (origin.includes('localhost')) values.add(origin.replace('localhost', '127.0.0.1'))
    if (origin.includes('127.0.0.1')) values.add(origin.replace('127.0.0.1', 'localhost'))
  }
  return values
}

function cookieOptions(deps: AppDeps, origin: string | undefined) {
  const crossSite = Boolean(origin && origin !== deps.webOrigin && (deps.webOrigins ?? []).includes(origin))
  return sessionCookieOptions(deps.cookieSecure, deps.sessionTtlHours * 60 * 60, crossSite)
}

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>()
  const allowed = originsFor(deps.webOrigins?.length ? deps.webOrigins : [deps.webOrigin])
  app.use('*', cors({
    origin: (origin) => allowed.has(origin) ? origin : deps.webOrigin,
    credentials: true,
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    exposeHeaders: ['Retry-After']
  }))
  app.onError((err, c) => {
    if (err instanceof RateLimitError) c.header('Retry-After', String(err.retryAfter))
    if (err instanceof ApiError) {
      return c.json({
        code: err.code,
        message: err.message,
        ...(Object.keys(err.fieldErrors).length ? { fieldErrors: err.fieldErrors } : {}),
        ...(err.details ? { details: err.details } : {})
      }, err.status as 400)
    }
    console.error('request failed')
    return c.json({ code: 'INTERNAL', message: 'Internal server error.' }, 500)
  })
  app.notFound((c) => c.json({ code: 'NOT_FOUND', message: 'Record not found.' }, 404))

  app.get('/health', async (c) => {
    await deps.db.execute(sql`select 1 as ok`)
    return c.json({ ok: true, database: 'up' })
  })

  app.use('/api/*', async (c, next) => {
    const anonymous = c.req.path === '/api/auth/login'
      || c.req.path === '/api/auth/providers'
      || c.req.path === '/api/auth/oidc/start'
      || c.req.path === '/api/auth/oidc/callback'
    if (anonymous) {
      c.set('actor', null)
      c.set('authMethod', 'none')
      return next()
    }
    const bearer = bearerToken(c.req.header('authorization'))
    const cookie = getCookie(c, 'bow_session') ?? null
    if (bearer) {
      const actor = await findActor(deps.db, bearer)
      if (!actor) {
        if (c.req.path === '/api/auth/session') {
          c.set('actor', null)
          c.set('authMethod', 'none')
          return next()
        }
        throw ApiError.unauthorized()
      }
      c.set('actor', actor)
      c.set('authMethod', 'bearer')
    } else if (cookie) {
      const actor = await findActor(deps.db, cookie)
      if (!actor) {
        if (c.req.path === '/api/auth/session') {
          c.set('actor', null)
          c.set('authMethod', 'none')
          return next()
        }
        throw ApiError.unauthorized()
      }
      c.set('actor', actor)
      c.set('authMethod', 'cookie')
    } else if (c.req.path === '/api/auth/session') {
      c.set('actor', null)
      c.set('authMethod', 'none')
      return next()
    } else {
      throw ApiError.unauthorized()
    }
    const method = c.req.method.toUpperCase()
    const mutation = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS'
    const current = c.get('actor')
    if (mutation && c.get('authMethod') === 'cookie' && current) {
      const header = c.req.header('x-csrf-token') ?? ''
      if (!header || !safeEqual(header, current.csrfToken)) {
        throw ApiError.forbidden('CSRF token is required for cookie-authenticated changes.')
      }
    }
    return next()
  })

  app.post('/api/auth/login', async (c) => {
    const result = await loginAccount(deps.db, deps.schoolEmailDomain, await c.req.json().catch(() => null), deps.sessionTtlHours)
    setCookie(c, 'bow_session', result.token, cookieOptions(deps, c.req.header('origin')))
    const anonymous = result.user.account.email === ANONYMOUS_ACCOUNT_EMAIL
    return c.json({
      data: result.user,
      message: anonymous ? 'Signed in as an anonymous member.' : 'Signed in.',
      csrfToken: result.csrfToken,
      expiresAt: result.expiresAt.toISOString()
    })
  })

  app.get('/api/auth/providers', (c) => c.json({ password: true, oidc: deps.identity.configured }))

  app.get('/api/auth/oidc/start', async (c) => {
    if (!deps.identity.configured) return institutionalFailure(c, deps.webOrigin)
    const next = safeNext(c.req.query('next'))
    const state = newSecret()
    const nonce = newSecret()
    const codeVerifier = newSecret()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)
    await deps.db.delete(oidcTransactions).where(lt(oidcTransactions.expiresAt, new Date()))
    await deps.db.insert(oidcTransactions).values({ state, codeVerifier, nonce, nextPath: next, expiresAt })
    const url = await deps.identity.authorizationUrl({
      redirectUri: deps.oidcRedirectUri,
      state,
      nonce,
      codeVerifier
    })
    return c.redirect(url.toString())
  })

  app.get('/api/auth/oidc/callback', async (c) => {
    if (!deps.identity.configured) return institutionalFailure(c, deps.webOrigin, 401)
    const state = c.req.query('state') ?? ''
    const rows = state
      ? await deps.db.select().from(oidcTransactions).where(eq(oidcTransactions.state, state)).limit(1)
      : []
    if (state) await deps.db.delete(oidcTransactions).where(eq(oidcTransactions.state, state))
    const pending = rows[0]
    if (!pending || pending.expiresAt.getTime() <= Date.now()) return institutionalFailure(c, deps.webOrigin, 401)
    try {
      const currentUrl = new URL(`${c.req.path}${new URL(c.req.url).search}`, deps.apiPublicUrl)
      const identity = await deps.identity.exchange(currentUrl, {
        expectedState: pending.state,
        expectedNonce: pending.nonce,
        codeVerifier: pending.codeVerifier
      })
      const result = await loginWithVerifiedIdentity(deps.db, identity, deps.sessionTtlHours)
      setCookie(c, 'bow_session', result.token, cookieOptions(deps, c.req.header('origin')))
      return c.redirect(`${deps.webOrigin}${pending.nextPath}`)
    } catch {
      return institutionalFailure(c, deps.webOrigin, 401)
    }
  })

  app.post('/api/auth/logout', async (c) => {
    const token = bearerToken(c.req.header('authorization')) ?? getCookie(c, 'bow_session') ?? null
    await logoutToken(deps.db, token)
    deleteCookie(c, 'bow_session', cookieOptions(deps, c.req.header('origin')))
    return c.body(null, 204)
  })

  app.get('/api/auth/me', async (c) => c.json(await toAuthUser(deps.db, requireActor(c))))

  app.get('/api/auth/session', (c) => {
    const actor = c.get('actor')
    if (!actor) return c.json({ authenticated: false, expiresAt: null, csrfToken: null })
    return c.json({ authenticated: true, expiresAt: actor.expiresAt.toISOString(), csrfToken: actor.csrfToken })
  })

  app.get('/api/students', async (c) => {
    requireActor(c)
    const query = parseQuery(studentListQuerySchema, c.req.query())
    return c.json(await listStudents(deps.db, query))
  })
  app.get('/api/students/:id', async (c) => {
    requireActor(c)
    return c.json(await getStudent(deps.db, pathId(c.req.param('id'))))
  })
  app.get('/api/students/:id/traits', async (c) => {
    requireActor(c)
    const page = parseQuery(paginationQuerySchema, c.req.query())
    return c.json(await studentTraits(deps.db, pathId(c.req.param('id')), page.page, page.pageSize))
  })
  app.get('/api/students/:id/groups', async (c) => {
    requireActor(c)
    const page = parseQuery(paginationQuerySchema, c.req.query())
    return c.json(await studentGroups(deps.db, pathId(c.req.param('id')), page.page, page.pageSize))
  })
  app.get('/api/students/:id/relationships', async (c) => {
    requireActor(c)
    const page = parseQuery(paginationQuerySchema, c.req.query())
    return c.json(await relationshipsFor(deps.db, 'student', pathId(c.req.param('id')), page.page, page.pageSize))
  })
  app.get('/api/students/:id/history', async (c) => {
    requireActor(c)
    const id = pathId(c.req.param('id'))
    await getStudent(deps.db, id)
    return c.json(await historyFor(deps.db, 'student', id))
  })

  app.get('/api/me/private-profile', async (c) => c.json(await readPrivateProfile(deps.db, requireActor(c))))
  app.patch('/api/me/private-profile', async (c) => {
    const profile = await patchPrivateProfile(deps.db, requireActor(c), await c.req.json().catch(() => null))
    return c.json({ data: profile, message: 'Private profile saved.' })
  })

  app.get('/api/traits', async (c) => {
    requireActor(c)
    const query = parseQuery(paginationQuerySchema.extend({
      q: z.string().optional(),
      categoryId: uuidSchema.optional(),
      includeArchived: z.boolean().optional()
    }), c.req.query())
    return c.json(await listTraits(deps.db, query))
  })
  app.get('/api/traits/:id', async (c) => {
    requireActor(c)
    return c.json(await getTrait(deps.db, pathId(c.req.param('id'))))
  })
  app.get('/api/trait-categories', async (c) => {
    requireActor(c)
    return c.json(await listCategories(deps.db))
  })

  app.get('/api/evidence', async (c) => {
    const actor = requireActor(c)
    const query = parseQuery(paginationQuerySchema.extend({
      q: z.string().optional(),
      verificationStatus: z.string().optional(),
      minReliability: z.coerce.number().int().min(1).max(5).optional(),
      fromDate: z.string().optional(),
      toDate: z.string().optional(),
      includeArchived: z.boolean().optional()
    }), c.req.query())
    return c.json(await listEvidence(deps.db, actor, query))
  })
  app.get('/api/evidence/:id', async (c) => c.json(await getEvidence(deps.db, requireActor(c), pathId(c.req.param('id')))))
  app.get('/api/evidence/:id/traits', async (c) => {
    requireActor(c)
    return c.json(await evidenceTraits(deps.db, pathId(c.req.param('id'))))
  })
  app.get('/api/evidence/:id/attachments/:attachmentId', async (c) => {
    requireActor(c)
    return c.json(await authorizeDownload(deps.db, deps.storage, pathId(c.req.param('id')), pathId(c.req.param('attachmentId'))))
  })
  app.post('/api/evidence/:id/attachments/authorize', async (c) => {
    const actor = requireActor(c)
    return c.json(await authorizeUpload(deps.db, deps.storage, deps.scanner, actor, pathId(c.req.param('id')), await c.req.json().catch(() => ({}))))
  })

  app.get('/api/groups', async (c) => {
    requireActor(c)
    const query = parseQuery(paginationQuerySchema.extend({
      q: z.string().optional(),
      includeArchived: z.boolean().optional()
    }), c.req.query())
    return c.json(await listGroups(deps.db, query))
  })
  app.get('/api/groups/:id', async (c) => {
    requireActor(c)
    return c.json(await getGroup(deps.db, pathId(c.req.param('id'))))
  })
  app.get('/api/groups/:id/members', async (c) => {
    requireActor(c)
    const query = parseQuery(paginationQuerySchema.extend({ includeArchived: z.boolean().optional() }), c.req.query())
    return c.json(await groupMembers(deps.db, pathId(c.req.param('id')), query))
  })
  app.get('/api/groups/:id/relationships', async (c) => {
    requireActor(c)
    return c.json(await relationshipsFor(deps.db, 'group', pathId(c.req.param('id'))))
  })
  app.get('/api/group-roles', async (c) => {
    requireActor(c)
    return c.json(await listRoles(deps.db))
  })

  app.get('/api/relationships', async (c) => {
    requireActor(c)
    const query = parseQuery(paginationQuerySchema.extend({
      q: z.string().optional(),
      relationshipTypeId: uuidSchema.optional(),
      sourceType: z.string().optional(),
      targetType: z.string().optional(),
      status: z.string().optional(),
      includeArchived: z.boolean().optional()
    }), c.req.query())
    return c.json(await listRelationships(deps.db, query))
  })
  app.get('/api/relationships/:id', async (c) => {
    requireActor(c)
    return c.json(await getRelationship(deps.db, pathId(c.req.param('id'))))
  })
  app.get('/api/relationships/:id/history', async (c) => {
    requireActor(c)
    const id = pathId(c.req.param('id'))
    await getRelationship(deps.db, id)
    return c.json(await historyFor(deps.db, 'relationship', id))
  })
  app.get('/api/relationship-types', async (c) => {
    requireActor(c)
    return c.json(await listRelationshipTypes(deps.db))
  })

  app.get('/api/search', async (c) => {
    const actor = requireActor(c)
    await enforceRateLimit(deps.db, actor.id, 'search', deps.searchRateLimit, deps.searchWindowSeconds)
    const filters = parseQuery(searchFiltersSchema, c.req.query())
    return c.json(await searchDirectory(deps.db, filters as SearchFilters))
  })
  app.get('/api/graph', async (c) => {
    requireActor(c)
    const query = c.req.query()
    const nodeType = query.nodeType === 'student' || query.nodeType === 'group' ? query.nodeType : undefined
    return c.json(await overview(deps.db, {
      q: query.q,
      nodeType,
      relationshipTypeId: query.relationshipTypeId
    }))
  })
  app.get('/api/graph/neighbors/:nodeType/:nodeId', async (c) => {
    requireActor(c)
    const nodeType = c.req.param('nodeType')
    if (nodeType !== 'student' && nodeType !== 'group') throw ApiError.notFound()
    const depth = Number(c.req.query('depth') || 1)
    return c.json(await neighborhood(deps.db, nodeType, pathId(c.req.param('nodeId')), depth))
  })
  app.get('/api/dashboard/stats', async (c) => {
    requireActor(c)
    return c.json(await dashboardStats(deps.db))
  })
  app.get('/api/dashboard/recent', async (c) => {
    requireActor(c)
    return c.json(await recentUpdates(deps.db))
  })

  app.post('/api/submissions', async (c) => {
    const actor = requireActor(c)
    await enforceRateLimit(deps.db, actor.id, 'submission', deps.submissionRateLimit, deps.submissionWindowSeconds)
    return c.json(await queueSubmission(deps.db, actor, await c.req.json().catch(() => null)))
  })
  app.get('/api/submissions/mine', async (c) => {
    const actor = requireActor(c)
    const page = parseQuery(paginationQuerySchema, c.req.query())
    const totals = await deps.db.select({ total: count() }).from(submissions).where(eq(submissions.submitterUserId, actor.id))
    const window = pageWindow(Number(totals[0]?.total ?? 0), page.page, page.pageSize)
    const rows = await deps.db.select().from(submissions).where(eq(submissions.submitterUserId, actor.id)).orderBy(desc(submissions.submittedAt)).limit(page.pageSize).offset(window.offset)
    return c.json({
      data: rows.map(presentOwned),
      meta: { page: window.page, pageSize: window.pageSize, total: window.total, totalPages: window.totalPages }
    })
  })
  app.get('/api/submissions/:id', async (c) => {
    const actor = requireActor(c)
    const id = pathId(c.req.param('id'))
    const rows = await deps.db.select().from(submissions).where(eq(submissions.id, id)).limit(1)
    const row = rows[0]
    if (!row) throw ApiError.notFound('Submission not found.')
    if (actor.role === 'administrator' || actor.id === row.submitterUserId) return c.json(presentOwned(row))
    return c.json(presentAnonymous(row))
  })
  app.post('/api/submissions/:id/consent', async (c) => {
    const submission = await grantConsent(deps.db, requireActor(c), pathId(c.req.param('id')))
    return c.json({ data: submission, message: 'Consent recorded. An administrator still has to approve publication.' })
  })
  app.post('/api/consents/:consentId/revoke', async (c) => {
    const result = await revokeConsent(deps.db, requireActor(c), pathId(c.req.param('consentId')))
    return c.json({ data: result, message: 'Consent withdrawn.' })
  })

  app.get('/api/admin/submissions', async (c) => {
    const actor = requireActor(c)
    requireAdmin(actor)
    const page = parseQuery(paginationQuerySchema.extend({ status: z.string().optional() }), c.req.query())
    const filters = page.status
      ? eq(submissions.status, page.status)
      : sql`${submissions.status} in ('pending', 'awaiting_consent')`
    const totals = await deps.db.select({ total: count() }).from(submissions).where(filters)
    const window = pageWindow(Number(totals[0]?.total ?? 0), page.page, page.pageSize)
    const rows = await deps.db.select().from(submissions).where(filters).orderBy(desc(submissions.submittedAt)).limit(page.pageSize).offset(window.offset)
    const data = []
    for (const row of rows) data.push(await toAdminSubmission(deps.db, row))
    return c.json({ data, meta: { page: window.page, pageSize: window.pageSize, total: window.total, totalPages: window.totalPages } })
  })
  app.post('/api/admin/submissions/:id/approve', async (c) => {
    const result = await approveSubmission(deps.db, requireActor(c), pathId(c.req.param('id')))
    return c.json({ data: result, message: 'Published.' })
  })
  app.post('/api/admin/submissions/:id/reject', async (c) => {
    const body = await c.req.json().catch(() => ({})) as { reason?: string }
    const result = await rejectSubmission(deps.db, requireActor(c), pathId(c.req.param('id')), body.reason)
    return c.json({ data: result, message: 'Submission deleted.' })
  })
  app.post('/api/admin/evidence/:id/verify', async (c) => {
    const actor = requireActor(c)
    requireAdmin(actor)
    const parsed = verifyEvidenceSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) throw fromZod(parsed.error)
    const id = pathId(c.req.param('id'))
    await verifyEvidence(deps.db, id, parsed.data.verificationStatus, parsed.data.reliabilityScore)
    return c.json({ data: await loadEvidenceRow(deps.db, actor, id), message: 'Evidence verification saved.' })
  })
  app.post('/api/admin/groups', async (c) => {
    const actor = requireActor(c)
    requireAdmin(actor)
    const parsed = namedSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) throw fromZod(parsed.error)
    const id = await insertGroup(deps.db, parsed.data, actor.id)
    return c.json({ data: await loadGroupRow(deps.db, id), message: 'Group created.' })
  })
  app.patch('/api/admin/groups/:id', async (c) => {
    const actor = requireActor(c)
    requireAdmin(actor)
    const parsed = z.object({
      name: z.string().min(1).max(200).optional(),
      description: z.string().max(20_000).optional(),
      status: z.enum(['active', 'archived']).optional(),
      baseVersion: z.number().int().optional()
    }).safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) throw fromZod(parsed.error)
    const id = pathId(c.req.param('id'))
    const { baseVersion, ...patch } = parsed.data
    if (baseVersion != null) await assertVersion(deps.db, 'group', 'update', id, baseVersion)
    await patchGroup(deps.db, id, patch, actor.id)
    return c.json({ data: await loadGroupRow(deps.db, id), message: 'Group updated.' })
  })
  app.post('/api/admin/categories', async (c) => {
    const actor = requireActor(c)
    requireAdmin(actor)
    const parsed = namedSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) throw fromZod(parsed.error)
    const id = await insertCategory(deps.db, parsed.data)
    return c.json({ data: await loadCategory(deps.db, id), message: 'Category created.' })
  })
  app.patch('/api/admin/categories/:id', async (c) => {
    const actor = requireActor(c)
    requireAdmin(actor)
    const parsed = z.object({
      name: z.string().min(1).max(200).optional(),
      description: z.string().max(20_000).optional(),
      isActive: z.boolean().optional()
    }).safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) throw fromZod(parsed.error)
    const id = pathId(c.req.param('id'))
    await patchCategory(deps.db, id, parsed.data)
    return c.json({ data: await loadCategory(deps.db, id), message: 'Category updated.' })
  })
  app.post('/api/admin/relationship-types', async (c) => {
    const actor = requireActor(c)
    requireAdmin(actor)
    const parsed = namedSchema.extend({ category: z.string().min(1).max(100) }).safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) throw fromZod(parsed.error)
    const id = await insertRelationshipType(deps.db, parsed.data)
    return c.json({ data: await loadRelationshipType(deps.db, id), message: 'Relationship type created.' })
  })
  app.patch('/api/admin/relationship-types/:id', async (c) => {
    const actor = requireActor(c)
    requireAdmin(actor)
    const parsed = z.object({
      name: z.string().min(1).max(200).optional(),
      description: z.string().max(20_000).optional(),
      category: z.string().min(1).max(100).optional(),
      isActive: z.boolean().optional()
    }).safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) throw fromZod(parsed.error)
    const id = pathId(c.req.param('id'))
    await patchRelationshipType(deps.db, id, parsed.data)
    return c.json({ data: await loadRelationshipType(deps.db, id), message: 'Relationship type updated.' })
  })
  app.post('/api/admin/group-roles', async (c) => {
    const actor = requireActor(c)
    requireAdmin(actor)
    const parsed = namedSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) throw fromZod(parsed.error)
    const id = await insertGroupRole(deps.db, parsed.data)
    return c.json({ data: await loadRole(deps.db, id), message: 'Role created.' })
  })
  app.patch('/api/admin/group-roles/:id', async (c) => {
    const actor = requireActor(c)
    requireAdmin(actor)
    const parsed = z.object({
      name: z.string().min(1).max(200).optional(),
      description: z.string().max(20_000).optional(),
      isActive: z.boolean().optional()
    }).safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) throw fromZod(parsed.error)
    const id = pathId(c.req.param('id'))
    await patchGroupRole(deps.db, id, parsed.data)
    return c.json({ data: await loadRole(deps.db, id), message: 'Role updated.' })
  })
  app.post('/api/admin/traits/:id/archive', async (c) => {
    const actor = requireActor(c)
    requireAdmin(actor)
    const id = pathId(c.req.param('id'))
    await traitModule.archiveById(deps.db, id, actor.id)
    return c.json({ data: { id }, message: 'Trait archived. Shared evidence was kept.' })
  })
  app.post('/api/admin/traits/:id/evidence', async (c) => {
    const actor = requireActor(c)
    requireAdmin(actor)
    const parsed = z.object({ evidenceId: uuidSchema }).safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) throw fromZod(parsed.error)
    const id = pathId(c.req.param('id'))
    await attachTraitEvidence(deps.db, id, parsed.data.evidenceId)
    return c.json({ data: await getTrait(deps.db, id), message: 'Evidence attached.' })
  })
  app.post('/api/admin/students', async (c) => {
    const actor = requireActor(c)
    requireAdmin(actor)
    const ids = await publishAdminChange(deps.db, actor, {
      entityType: 'student',
      operation: 'create',
      targetEntityId: null,
      body: await c.req.json().catch(() => null)
    })
    const id = ids[0]
    if (!id) throw ApiError.validation('Publication did not create a record.')
    return c.json({ data: await getStudent(deps.db, id), message: 'Student published.' })
  })
  app.post('/api/admin/students/:id/archive', async (c) => {
    const actor = requireActor(c)
    requireAdmin(actor)
    const id = pathId(c.req.param('id'))
    await studentModule.archiveById(deps.db, id, actor.id)
    return c.json({ data: { id }, message: 'Student archived.' })
  })
  app.patch('/api/admin/students/:id', async (c) => {
    const actor = requireActor(c)
    requireAdmin(actor)
    const id = pathId(c.req.param('id'))
    await publishAdminChange(deps.db, actor, {
      entityType: 'student',
      operation: 'update',
      targetEntityId: id,
      body: await c.req.json().catch(() => null)
    })
    return c.json({ data: await getStudent(deps.db, id), message: 'Student updated.' })
  })
  app.post('/api/admin/traits', async (c) => {
    const actor = requireActor(c)
    requireAdmin(actor)
    const ids = await publishAdminChange(deps.db, actor, {
      entityType: 'trait',
      operation: 'create',
      targetEntityId: null,
      body: await c.req.json().catch(() => null)
    })
    const id = ids[0]
    if (!id) throw ApiError.validation('Publication did not create a record.')
    return c.json({ data: await getTrait(deps.db, id), message: 'Trait published.' })
  })
  app.patch('/api/admin/traits/:id', async (c) => {
    const actor = requireActor(c)
    requireAdmin(actor)
    const id = pathId(c.req.param('id'))
    await publishAdminChange(deps.db, actor, {
      entityType: 'trait',
      operation: 'update',
      targetEntityId: id,
      body: await c.req.json().catch(() => null),
      requireBaseVersion: true
    })
    return c.json({ data: await getTrait(deps.db, id), message: 'Trait updated.' })
  })
  app.post('/api/admin/evidence', async (c) => {
    const actor = requireActor(c)
    requireAdmin(actor)
    const ids = await publishAdminChange(deps.db, actor, {
      entityType: 'evidence',
      operation: 'create',
      targetEntityId: null,
      body: await c.req.json().catch(() => null)
    })
    const id = ids[0]
    if (!id) throw ApiError.validation('Publication did not create a record.')
    return c.json({ data: await loadEvidenceRow(deps.db, actor, id), message: 'Evidence published.' })
  })
  app.patch('/api/admin/evidence/:id', async (c) => {
    const actor = requireActor(c)
    requireAdmin(actor)
    const id = pathId(c.req.param('id'))
    await publishAdminChange(deps.db, actor, {
      entityType: 'evidence',
      operation: 'update',
      targetEntityId: id,
      body: await c.req.json().catch(() => null)
    })
    return c.json({ data: await loadEvidenceRow(deps.db, actor, id), message: 'Evidence updated.' })
  })
  app.post('/api/admin/evidence/:id/archive', async (c) => {
    const actor = requireActor(c)
    requireAdmin(actor)
    const id = pathId(c.req.param('id'))
    await archiveAdminRecord(deps.db, actor, 'evidence', id)
    return c.json({ data: { id }, message: 'Evidence archived.' })
  })
  app.post('/api/admin/memberships', async (c) => {
    const actor = requireActor(c)
    requireAdmin(actor)
    const ids = await publishAdminChange(deps.db, actor, {
      entityType: 'group_membership',
      operation: 'create',
      targetEntityId: null,
      body: await c.req.json().catch(() => null)
    })
    const id = ids[0]
    if (!id) throw ApiError.validation('Publication did not create a record.')
    return c.json({ data: await loadMembership(deps.db, id), message: 'Membership published.' })
  })
  app.patch('/api/admin/memberships/:id', async (c) => {
    const actor = requireActor(c)
    requireAdmin(actor)
    const parsed = z.object({
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
    }).safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) throw fromZod(parsed.error)
    const id = pathId(c.req.param('id'))
    await endAdminMembership(deps.db, actor, id, parsed.data.endDate)
    return c.json({ data: await loadMembership(deps.db, id), message: 'Membership ended. The history row was kept.' })
  })
  app.patch('/api/admin/relationships/:id', async (c) => {
    const actor = requireActor(c)
    requireAdmin(actor)
    const id = pathId(c.req.param('id'))
    await publishAdminChange(deps.db, actor, {
      entityType: 'relationship',
      operation: 'update',
      targetEntityId: id,
      body: await c.req.json().catch(() => null),
      requireBaseVersion: true
    })
    return c.json({ data: await getRelationship(deps.db, id), message: 'Relationship updated.' })
  })
  app.post('/api/admin/relationships', async (c) => {
    const actor = requireActor(c)
    requireAdmin(actor)
    const ids = await publishAdminRelationship(deps.db, actor, await c.req.json().catch(() => null))
    const records = []
    for (const id of ids) records.push(await getRelationship(deps.db, id))
    return c.json({
      data: records.length === 1 ? records[0] : records,
      message: records.length > 1 ? 'Mirrored relationships published.' : 'Relationship published.'
    })
  })
  app.post('/api/admin/relationships/:id/archive', async (c) => {
    const actor = requireActor(c)
    requireAdmin(actor)
    const id = pathId(c.req.param('id'))
    await relationshipModule.archiveById(deps.db, id, actor.id)
    return c.json({ data: { id }, message: 'Relationship archived.' })
  })
  app.post('/api/admin/profile-matches/:userId/correct', async (c) => {
    const actor = requireActor(c)
    const account = await correctProfileMatch(deps.db, actor, pathId(c.req.param('userId')), await c.req.json().catch(() => null))
    return c.json({ data: account, message: 'Profile match corrected. Existing sessions for that account were revoked.' })
  })
  app.get('/api/admin/accounts', async (c) => {
    requireAdmin(requireActor(c))
    return c.json(await listAccounts(deps.db))
  })
  app.post('/api/admin/administrators', async (c) => {
    requireAdmin(requireActor(c))
    const parsed = schoolEmailSchema(deps.schoolEmailDomain).safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) throw fromZod(parsed.error)
    if (parsed.data.password.length < 12) {
      throw ApiError.validation('Request is invalid.', {
        password: ['Password must be at least 12 characters.']
      })
    }
    const email = parsed.data.email.toLowerCase()
    const existing = await deps.db.select({ id: accounts.id }).from(accounts).where(eq(accounts.email, email)).limit(1)
    if (existing.length) throw ApiError.conflict('An account with this email already exists.')
    const now = new Date()
    const id = newId()
    try {
      await deps.db.insert(accounts).values({
        id,
        email,
        passwordHash: await hashPassword(parsed.data.password),
        emailVerified: true,
        role: 'administrator',
        matchedStudentId: null,
        matchStatus: 'pending',
        oidcIssuer: null,
        oidcSubject: null,
        createdAt: now,
        updatedAt: now
      })
    } catch (error) {
      if (uniqueViolation(error)) throw ApiError.conflict('An account with this email already exists.')
      throw error
    }
    return c.json({
      data: {
        id,
        email,
        emailVerified: true,
        role: 'administrator',
        matchedStudentId: null,
        matchStatus: 'pending',
        createdAt: iso(now),
        updatedAt: iso(now)
      },
      message: 'Administrator created.'
    })
  })

  return app
}
