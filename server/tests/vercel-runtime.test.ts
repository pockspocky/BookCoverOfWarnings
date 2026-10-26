import { afterEach, describe, expect, it } from 'vitest'
import { createSql } from '../src/db/client'
import { readDiskMigrations } from '../src/db/migrate'
import { loadEnv } from '../src/env'
import { sessionCookieOptions } from '../src/http/session-cookie'

const KEYS = [
  'VERCEL',
  'VERCEL_URL',
  'WEB_ORIGIN',
  'WEB_ORIGINS',
  'API_PUBLIC_URL',
  'COOKIE_SECURE',
  'DATABASE_URL',
  'S3_ENDPOINT',
  'IDENTITY_PROVIDER',
  'NODE_ENV',
  'SCHOOL_EMAIL_DOMAIN',
  'OIDC_REDIRECT_URI'
] as const

const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]))

afterEach(() => {
  for (const key of KEYS) {
    const value = saved[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

function useEnv(values: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const key of KEYS) delete process.env[key]
  process.env.DATABASE_URL = 'postgres://app:correct-horse-battery@127.0.0.1:5432/bow'
  process.env.NODE_ENV = 'test'
  for (const [key, value] of Object.entries(values)) process.env[key] = value
}

describe('Vercel runtime defaults', () => {
  it('keeps local origins and an insecure cookie when Vercel is unset', () => {
    useEnv({})
    const env = loadEnv()
    expect(env.webOrigin).toBe('http://localhost:3000')
    expect(env.apiPublicUrl).toBe('http://localhost:3001')
    expect(env.cookieSecure).toBe(false)
    expect(env.schoolEmailDomain).toBe('waprep.org')
  })

  it('fills cookie and origins from the deployment URL', () => {
    useEnv({ VERCEL: '1', VERCEL_URL: 'book-of-warnings.vercel.app' })
    const env = loadEnv()
    expect(env.webOrigin).toBe('https://book-of-warnings.vercel.app')
    expect(env.apiPublicUrl).toBe('https://book-of-warnings.vercel.app')
    expect(env.oidcRedirectUri).toBe('https://book-of-warnings.vercel.app/api/auth/oidc/callback')
    expect(env.cookieSecure).toBe(true)
  })

  it('lets explicit origins and COOKIE_SECURE=false win', () => {
    useEnv({
      VERCEL: '1',
      VERCEL_URL: 'book-of-warnings.vercel.app',
      WEB_ORIGIN: 'https://warnings.example',
      API_PUBLIC_URL: 'https://api.example',
      COOKIE_SECURE: 'false'
    })
    const env = loadEnv()
    expect(env.webOrigin).toBe('https://warnings.example')
    expect(env.apiPublicUrl).toBe('https://api.example')
    expect(env.cookieSecure).toBe(false)
  })

  it('keeps the site origin and adds extra browser origins', () => {
    useEnv({
      VERCEL: '1',
      VERCEL_URL: 'book-cover-of-warnings.vercel.app',
      WEB_ORIGINS: 'https://pockspocky.github.io/, https://pockspocky.github.io'
    })
    const env = loadEnv()
    expect(env.webOrigin).toBe('https://book-cover-of-warnings.vercel.app')
    expect(env.webOrigins).toEqual([
      'https://book-cover-of-warnings.vercel.app',
      'https://pockspocky.github.io'
    ])
  })
})

describe('session cookie', () => {
  it('keeps a lax cookie on the API site and partitions a cross-site browser', () => {
    expect(sessionCookieOptions(true, 60, false)).toMatchObject({ sameSite: 'Lax', secure: true })
    expect(sessionCookieOptions(true, 60, true)).toMatchObject({ sameSite: 'None', secure: true, partitioned: true })
    expect(sessionCookieOptions(false, 60, false)).toMatchObject({ sameSite: 'Lax', secure: false })
  })
})

describe('serverless pool', () => {
  it('uses one connection and no prepared statements on Vercel', async () => {
    useEnv({ VERCEL: '1' })
    const sql = createSql('postgres://app:correct-horse-battery@127.0.0.1:1/bow', 10)
    try {
      expect(sql.options.max).toBe(1)
      expect(sql.options.prepare).toBe(false)
      expect(sql.options.idle_timeout).toBe(20)
    } finally {
      await sql.end({ timeout: 0 })
    }
  })

  it('keeps the requested pool size off Vercel', async () => {
    useEnv({})
    const sql = createSql('postgres://app:correct-horse-battery@127.0.0.1:1/bow', 4)
    try {
      expect(sql.options.max).toBe(4)
      expect(sql.options.prepare).toBe(true)
    } finally {
      await sql.end({ timeout: 0 })
    }
  })
})

describe('migration files', () => {
  it('reads the drizzle directory in filename order', () => {
    const files = readDiskMigrations()
    expect(files.map((file) => file.id)).toEqual(['0001_init.sql', '0002_identity.sql'])
    expect(files[0]?.source).toContain('create table students')
    expect(files[1]?.source).toContain('oidc_transactions')
  })
})
