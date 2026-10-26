import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const directory = join(root, 'secrets')
mkdirSync(directory, { recursive: true })

function ensure(name) {
  const path = join(directory, name)
  if (existsSync(path)) {
    const current = readFileSync(path, 'utf8').trim()
    if (current) return current
  }
  const value = randomBytes(24).toString('base64url')
  writeFileSync(path, `${value}\n`, { mode: 0o600 })
  return value
}

const postgresPassword = ensure('postgres_password')
const minioPassword = ensure('minio_root_password')
const s3Path = join(directory, 's3_secret_key')
if (!existsSync(s3Path) || !readFileSync(s3Path, 'utf8').trim()) {
  writeFileSync(s3Path, `${minioPassword}\n`, { mode: 0o600 })
}
const databaseUrl = `postgres://bow:${encodeURIComponent(postgresPassword)}@postgres:5432/bow`
writeFileSync(join(directory, 'database_url'), `${databaseUrl}\n`, { mode: 0o600 })

const hostUrl = `postgres://bow:${encodeURIComponent(postgresPassword)}@127.0.0.1:5433/bow`
const envPath = join(root, 'server/.env')
const example = readFileSync(join(root, 'server/.env.example'), 'utf8')
const source = existsSync(envPath) ? readFileSync(envPath, 'utf8') : example
const next = /^(DATABASE_URL=).*$/m.test(source)
  ? source.replace(/^(DATABASE_URL=).*$/m, `$1${hostUrl}`)
  : `DATABASE_URL=${hostUrl}\n${source}`
writeFileSync(envPath, next)
const s3Line = `S3_SECRET_KEY=${readFileSync(s3Path, 'utf8').trim()}`
const withS3 = /^(S3_SECRET_KEY=).*$/m.test(next)
  ? next.replace(/^(S3_SECRET_KEY=).*$/m, s3Line)
  : `${next.trim()}\n${s3Line}\n`
writeFileSync(envPath, withS3.endsWith('\n') ? withS3 : `${withS3}\n`)
console.log('Wrote secrets/ and updated server/.env database and object-storage secrets.')
