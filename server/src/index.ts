import { serve } from '@hono/node-server'
import { createIdentityProvider } from './auth/identity'
import { createDatabase, createSql } from './db/client'
import { migrate } from './db/migrate'
import { loadDotEnv, loadEnv } from './env'
import { createApp } from './http/app'
import { createMetadataScanner, createS3Storage } from './services/storage'

loadDotEnv()
const env = loadEnv()
const sql = createSql(env.databaseUrl)
const db = createDatabase(sql)

await migrate(sql)
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

const app = createApp({
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

serve({ fetch: app.fetch, port: env.port, hostname: '0.0.0.0' }, () => {
  console.log(`API listening on ${env.port}`)
})
