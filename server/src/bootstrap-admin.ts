import { count, eq } from 'drizzle-orm'
import { schoolEmailSchema } from '../../lib/schemas/index'
import { createDatabase, createSql } from './db/client'
import { migrate } from './db/migrate'
import { accounts } from './db/schema'
import { loadDotEnv, loadEnv } from './env'
import { hashPassword } from './auth/password'
import { requireSecret } from './secrets'
import { newId } from './util'

loadDotEnv()
const env = loadEnv()
const email = requireSecret('ADMIN_EMAIL').toLowerCase()
const password = requireSecret('ADMIN_PASSWORD')
const parsed = schoolEmailSchema(env.schoolEmailDomain).safeParse({ email, password })
if (!parsed.success) {
  console.error('Administrator email must use the configured school domain, and the password must be at least 12 characters.')
  process.exit(1)
}
if (password.length < 12) {
  console.error('Administrator password must be at least 12 characters.')
  process.exit(1)
}

const sql = createSql(env.databaseUrl)
await migrate(sql)
const db = createDatabase(sql)
const existing = await db.select({ total: count() }).from(accounts).where(eq(accounts.role, 'administrator'))
if ((existing[0]?.total ?? 0) > 0) {
  console.error('An administrator already exists. This command does not reset passwords or add another administrator.')
  await sql.end()
  process.exit(1)
}

const now = new Date()
await db.insert(accounts).values({
  id: newId(),
  email,
  passwordHash: await hashPassword(password),
  emailVerified: true,
  role: 'administrator',
  matchedStudentId: null,
  matchStatus: 'pending',
  oidcIssuer: null,
  oidcSubject: null,
  createdAt: now,
  updatedAt: now
})
await sql.end()
console.log(`Created administrator ${email}.`)
