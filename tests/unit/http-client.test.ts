import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpApiClient } from '../../lib/api/http-client'
import { ApiError } from '../../lib/types/errors'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('HttpApiClient', () => {
  it('fails closed when the network fails instead of inventing success', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))
    const client = new HttpApiClient('http://backend.test', () => null)
    await expect(client.auth.me()).rejects.toMatchObject({ code: 'NETWORK', status: 0 })
    await expect(client.auth.me()).rejects.toBeInstanceOf(ApiError)
  })

  it('calls same-origin /api when the base URL is empty', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(String(url))
      return new Response(JSON.stringify({ password: true, oidc: false }), { status: 200 })
    })
    const client = new HttpApiClient('', () => null)
    await client.auth.providers()
    expect(calls).toEqual(['/api/auth/providers'])
  })

  it('calls the configured base URL and preserves server error codes', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      if (String(url).includes('/attachments/secret')) {
        return new Response(JSON.stringify({ message: 'Attachment retrieval is not authorized.', code: 'FORBIDDEN' }), { status: 403 })
      }
      return new Response(JSON.stringify({ data: [], meta: { page: 2, pageSize: 15, total: 0, totalPages: 1 } }), { status: 200 })
    })
    const client = new HttpApiClient('http://backend.test', () => 'session-token')
    await expect(client.evidence.attachment('evidence-1', 'secret')).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 })
    const page = await client.search.query({ q: 'Alex', entityTypes: ['student'], page: 2, pageSize: 15 })
    expect(page.meta.page).toBe(2)
    expect(calls[0]?.url).toBe('http://backend.test/api/evidence/evidence-1/attachments/secret')
    expect(calls[1]?.url).toContain('http://backend.test/api/search?')
    expect(calls[1]?.url).toContain('q=Alex')
    expect(calls[1]?.url).toContain('entityTypes=student')
    const headers = calls[0]?.init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer session-token')
  })

  it('requests upload authorization without pretending the file was stored', async () => {
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      expect(String(url)).toBe('http://backend.test/api/evidence/evidence-1/attachments/authorize')
      expect(init.method).toBe('POST')
      const body = JSON.parse(String(init.body)) as { fileName: string }
      expect(body.fileName).toBe('roster.pdf')
      return new Response(JSON.stringify({
        uploadToken: 'ticket',
        expiresAt: '2026-10-23T00:00:00.000Z',
        url: 'https://uploads.example.test/ticket',
        method: 'PUT'
      }), { status: 200 })
    })
    const client = new HttpApiClient('http://backend.test', () => null)
    const ticket = await client.evidence.authorizeUpload('evidence-1', {
      fileName: 'roster.pdf',
      contentType: 'application/pdf',
      sizeBytes: 10
    })
    expect(ticket.method).toBe('PUT')
    expect(ticket.uploadToken).toBe('ticket')
  })

  it('keeps the session token out of script storage and sends the CSRF header for cookie changes', async () => {
    const csrf: Array<string | null> = []
    const calls: Array<{ url: string; init: RequestInit }> = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init })
      if (String(url).endsWith('/api/auth/logout')) return new Response(null, { status: 204 })
      if (String(url).endsWith('/api/auth/session')) {
        return new Response(JSON.stringify({ authenticated: false, expiresAt: null, csrfToken: null }), { status: 200 })
      }
      return new Response(JSON.stringify({
        data: { account: { id: '1' } },
        message: 'Signed in.',
        csrfToken: 'csrf-value',
        expiresAt: '2026-10-23T12:00:00.000Z'
      }), { status: 200 })
    })
    const client = new HttpApiClient('http://backend.test', () => null, () => csrf.at(-1) ?? null, (value) => {
      csrf.push(value)
    })
    await client.auth.login({ email: 'person@school.test', password: 'longenough' })
    expect(csrf).toEqual(['csrf-value'])
    const loginHeaders = calls[0]?.init.headers as Record<string, string>
    expect(loginHeaders.Authorization).toBeUndefined()
    await client.auth.logout()
    const logoutHeaders = calls[1]?.init.headers as Record<string, string>
    expect(logoutHeaders['X-CSRF-Token']).toBe('csrf-value')
    expect(logoutHeaders.Authorization).toBeUndefined()
    expect(csrf).toEqual(['csrf-value', null])
  })

  it('sends administrator publication to the admin routes without private fields', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init })
      return new Response(JSON.stringify({ data: { id: 'created' }, message: 'Published.' }), { status: 200 })
    })
    const client = new HttpApiClient('http://backend.test', () => 'token')
    await client.admin.createStudent({ displayName: 'Ada', graduationYear: 2026, generalComment: 'note' })
    await client.admin.patchTrait('trait-1', { title: 'Updated', baseVersion: 2 })
    await client.admin.createRelationship({
      sourceType: 'group',
      sourceId: 'group-a',
      targetType: 'group',
      targetId: 'group-b',
      relationshipTypeId: 'type-1',
      generalComment: 'Works with',
      createMirroredRelationship: true
    })
    expect(calls.map((call) => [call.init.method, call.url])).toEqual([
      ['POST', 'http://backend.test/api/admin/students'],
      ['PATCH', 'http://backend.test/api/admin/traits/trait-1'],
      ['POST', 'http://backend.test/api/admin/relationships']
    ])
    const studentBody = JSON.parse(String(calls[0]?.init.body)) as Record<string, unknown>
    expect(studentBody).toEqual({ displayName: 'Ada', graduationYear: 2026, generalComment: 'note' })
    expect(studentBody.sexualityPreset).toBeUndefined()
    expect(JSON.parse(String(calls[1]?.init.body))).toEqual({ title: 'Updated', baseVersion: 2 })
  })
})
