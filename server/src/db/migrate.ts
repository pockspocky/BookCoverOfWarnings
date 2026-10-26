import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Sql } from './client'

export type MigrationSource = {
  id: string
  source: string
}

function statements(text: string) {
  const withoutComments = text
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
  return withoutComments
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
}

export function readDiskMigrations(): MigrationSource[] {
  const directory = join(dirname(fileURLToPath(import.meta.url)), '../../drizzle')
  if (!existsSync(directory)) throw new Error(`Migration directory not found: ${directory}`)
  return readdirSync(directory)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((id) => ({ id, source: readFileSync(join(directory, id), 'utf8') }))
}

async function ensureMigrationsTable(sql: Sql) {
  await sql`
    create table if not exists schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `
}

async function applyFile(tx: Sql, file: MigrationSource) {
  for (const statement of statements(file.source)) await tx.unsafe(statement)
  await tx`insert into schema_migrations (id) values (${file.id})`
}

export async function migrate(sql: Sql, migrations?: MigrationSource[]) {
  const files = migrations ?? readDiskMigrations()
  await ensureMigrationsTable(sql)
  for (const file of files) {
    const applied = await sql`select id from schema_migrations where id = ${file.id}`
    if (applied.length) continue
    await sql.begin(async (tx) => {
      await applyFile(tx as unknown as Sql, file)
    })
  }
}

export async function migrateWithLock(sql: Sql, migrations?: MigrationSource[]) {
  const files = migrations ?? readDiskMigrations()
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(842190351, 703)`
    const db = tx as unknown as Sql
    await ensureMigrationsTable(db)
    for (const file of files) {
      const applied = await db`select id from schema_migrations where id = ${file.id}`
      if (applied.length) continue
      await applyFile(db, file)
    }
  })
}
