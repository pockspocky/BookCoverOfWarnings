import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertProductionSecret, readSecret, requireSecret } from './secrets'

export function loadDotEnv() {
  const path = join(dirname(fileURLToPath(import.meta.url)), '../.env')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator < 0) continue
    const key = trimmed.slice(0, separator).trim()
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')
    if (process.env[key] === undefined) process.env[key] = value
  }
}

function integer(name: string, fallback: number) {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer.`)
  return parsed
}

function deploymentOrigin() {
  const host = process.env.VERCEL_URL?.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
  return host ? `https://${host}` : ''
}

function cookieSecure() {
  const raw = process.env.COOKIE_SECURE?.trim().toLowerCase()
  if (raw === undefined || raw === '') return Boolean(process.env.VERCEL)
  return raw === 'true'
}

function listedOrigins(name: string) {
  return (process.env[name] ?? '')
    .split(',')
    .map((item) => item.trim().replace(/\/$/, ''))
    .filter(Boolean)
}

export function loadEnv() {
  const deployed = deploymentOrigin()
  const apiPublicUrl = (process.env.API_PUBLIC_URL?.trim() || deployed || 'http://localhost:3001').replace(/\/$/, '')
  const webOrigin = (process.env.WEB_ORIGIN?.trim() || deployed || 'http://localhost:3000').replace(/\/$/, '')
  const env = {
    databaseUrl: requireSecret('DATABASE_URL'),
    port: integer('PORT', 3001),
    webOrigin,
    webOrigins: Array.from(new Set([webOrigin, ...listedOrigins('WEB_ORIGINS')])),
    apiPublicUrl,
    schoolEmailDomain: process.env.SCHOOL_EMAIL_DOMAIN?.trim() || 'waprep.org',
    cookieSecure: cookieSecure(),
    sessionTtlHours: integer('SESSION_TTL_HOURS', 12),
    submissionRateLimit: integer('SUBMISSION_RATE_LIMIT', 30),
    submissionWindowSeconds: integer('SUBMISSION_RATE_WINDOW_SECONDS', 3600),
    searchRateLimit: integer('SEARCH_RATE_LIMIT', 60),
    searchWindowSeconds: integer('SEARCH_RATE_WINDOW_SECONDS', 60),
    maxUploadBytes: integer('MAX_UPLOAD_BYTES', 10_000_000),
    allowedUploadTypes: (process.env.ALLOWED_UPLOAD_TYPES || 'application/pdf,image/png,image/jpeg,text/plain')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
    s3Endpoint: process.env.S3_ENDPOINT?.trim() || '',
    s3Region: process.env.S3_REGION?.trim() || 'us-east-1',
    s3Bucket: process.env.S3_BUCKET?.trim() || 'bow-attachments',
    s3AccessKey: readSecret('S3_ACCESS_KEY') || '',
    s3SecretKey: readSecret('S3_SECRET_KEY') || '',
    s3ForcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    identityProvider: process.env.IDENTITY_PROVIDER?.trim() || 'unconfigured',
    oidcIssuer: process.env.OIDC_ISSUER?.trim() || '',
    oidcClientId: process.env.OIDC_CLIENT_ID?.trim() || '',
    oidcClientSecret: readSecret('OIDC_CLIENT_SECRET') || '',
    oidcRedirectUri: process.env.OIDC_REDIRECT_URI?.trim() || `${apiPublicUrl}/api/auth/oidc/callback`
  }
  if (env.s3Endpoint) {
    if (!env.s3SecretKey) throw new Error('Missing S3_SECRET_KEY. Set S3_SECRET_KEY_FILE or SECRETS_DIR.')
    assertProductionSecret('S3_SECRET_KEY', env.s3SecretKey)
  }
  if (env.identityProvider === 'oidc') {
    if (!env.oidcClientSecret) throw new Error('Missing OIDC_CLIENT_SECRET. Set OIDC_CLIENT_SECRET_FILE or SECRETS_DIR.')
    assertProductionSecret('OIDC_CLIENT_SECRET', env.oidcClientSecret)
  }
  return env
}

export type Env = ReturnType<typeof loadEnv>
