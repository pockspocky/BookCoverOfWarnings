import { describe, expect, it } from 'vitest'
import { publicApiBaseUrl, withApiBase } from '../../lib/utils/api-url'

describe('public API base URL', () => {
  it('keeps the local default and uses a relative path when the base is empty', () => {
    expect(publicApiBaseUrl({})).toBe('http://localhost:3001')
    expect(publicApiBaseUrl({ VERCEL: '1' })).toBe('')
    expect(publicApiBaseUrl({ VERCEL: '1', NUXT_PUBLIC_API_BASE_URL: '' })).toBe('')
    expect(publicApiBaseUrl({ NUXT_PUBLIC_API_BASE_URL: 'http://localhost:3001/' })).toBe('http://localhost:3001')
    expect(withApiBase('', '/api/auth/oidc/start?next=%2F')).toBe('/api/auth/oidc/start?next=%2F')
    expect(withApiBase('http://localhost:3001/', '/api/auth/oidc/start?next=%2F')).toBe('http://localhost:3001/api/auth/oidc/start?next=%2F')
  })
})
