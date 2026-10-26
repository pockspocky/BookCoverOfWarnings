import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export function createSql(databaseUrl: string, max = 10) {
  if (process.env.VERCEL) {
    return postgres(databaseUrl, {
      max: 1,
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 10
    })
  }
  return postgres(databaseUrl, { max })
}

export function createDatabase(sql: ReturnType<typeof createSql>) {
  return drizzle(sql, { schema })
}

export type Database = ReturnType<typeof createDatabase>
export type Sql = ReturnType<typeof createSql>
