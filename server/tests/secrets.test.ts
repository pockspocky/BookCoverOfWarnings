import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { verifiedSchoolIdentity } from '../src/auth/claims'
import { assertProductionSecret, readSecret } from '../src/secrets'

const previous = { ...process.env }

afterEach(() => {
  process.env = { ...previous }
})

describe('secrets', () => {
  it('reads a secret from a file before the environment value', () => {
    const directory = mkdtempSync(join(tmpdir(), 'bow-secret-'))
    const path = join(directory, 'DATABASE_URL')
    writeFileSync(path, 'postgres://bow:from-file@localhost:5433/bow\n')
    process.env.DATABASE_URL_FILE = path
    process.env.DATABASE_URL = 'postgres://bow:from-env@localhost:5433/bow'
    expect(readSecret('DATABASE_URL')).toBe('postgres://bow:from-file@localhost:5433/bow')
  })

  it('rejects placeholder secrets in production', () => {
    process.env.NODE_ENV = 'production'
    expect(() => assertProductionSecret('S3_SECRET_KEY', 'bowsecret')).toThrow(/placeholder/)
    expect(() => assertProductionSecret('DATABASE_URL', 'postgres://bow:bow@localhost:5432/bow')).toThrow(/placeholder/)
  })
})

describe('institutional claims', () => {
  it('accepts a verified school email and ignores a display name', () => {
    const identity = verifiedSchoolIdentity({
      iss: 'https://idp.northbridge.test/',
      sub: 'subject-1',
      email: 'Member-A@northbridge.test',
      email_verified: true,
      name: 'Someone Else'
    }, 'northbridge.test', 'https://idp.northbridge.test')
    expect(identity).toEqual({
      issuer: 'https://idp.northbridge.test',
      subject: 'subject-1',
      email: 'member-a@northbridge.test'
    })
    expect('name' in identity).toBe(false)
  })

  it('rejects an unverified email, the wrong domain, and the wrong issuer', () => {
    const claims = { iss: 'https://idp.northbridge.test', sub: 'subject-1', email: 'member-a@northbridge.test', email_verified: false }
    expect(() => verifiedSchoolIdentity(claims, 'northbridge.test', 'https://idp.northbridge.test')).toThrow(/not verified/)
    expect(() => verifiedSchoolIdentity({ ...claims, email_verified: true, email: 'person@example.com' }, 'northbridge.test', 'https://idp.northbridge.test')).toThrow(/school domain/)
    expect(() => verifiedSchoolIdentity({ ...claims, email_verified: true }, 'northbridge.test', 'https://other.example')).toThrow(/issuer/)
  })
})
