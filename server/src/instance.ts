import { createIdentityProvider } from './auth/identity'
import { createDatabase, createSql } from './db/client'
import { migrateWithLock, type MigrationSource } from './db/migrate'
import { loadDotEnv, loadEnv } from './env'
import { createApp } from './http/app'
import { createMetadataScanner, createS3Storage } from './services/storage'

type App = ReturnType<typeof createApp>

let pending: Promise<App> | undefined

export function getApp(migrations?: MigrationSource[]) {
  if (pending) return pending
  pending = boot(migrations).catch((error: unknown) => {
    pending = undefined
    throw error
  })
  return pending
}

async function boot(migrations?: MigrationSource[]) {
  if (process.env.VERCEL && !migrations?.length) {
    throw new Error('Database migrations were not bundled into the Vercel function.')
  }
  loadDotEnv()
  const env = loadEnv()
  const sql = createSql(env.databaseUrl)
  try {
    const db = createDatabase(sql)
    await migrateWithLock(sql, migrations)
    const storage = createS3Storage(env)
    try {
      await storage.ensureBucket()
    } catch {
      console.error('object storage unavailable')
    }
    const identity = await createIdentityProvider({
      kind: env.identityProvider,
      issuer: env.oidcIssuer,
      clientId: env.oidcClientId,
      clientSecret: env.oidcClientSecret,
      domain: env.schoolEmailDomain
    })
    return createApp({
      db,
      schoolEmailDomain: env.schoolEmailDomain,
      webOrigin: env.webOrigin,
      webOrigins: env.webOrigins,
      cookieSecure: env.cookieSecure,
      sessionTtlHours: env.sessionTtlHours,
      submissionRateLimit: env.submissionRateLimit,
      submissionWindowSeconds: env.submissionWindowSeconds,
      searchRateLimit: env.searchRateLimit,
      searchWindowSeconds: env.searchWindowSeconds,
      storage,
      scanner: createMetadataScanner(env.maxUploadBytes, env.allowedUploadTypes),
      identity,
      apiPublicUrl: env.apiPublicUrl,
      oidcRedirectUri: env.oidcRedirectUri
    })
  } catch (error) {
    await sql.end({ timeout: 1 }).catch(() => undefined)
    throw error
  }
}
