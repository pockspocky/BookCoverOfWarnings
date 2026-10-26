import { AsyncLocalStorage } from 'node:async_hooks'
import { sql } from 'drizzle-orm'
import type { Database } from './client'

const ambient = new AsyncLocalStorage<boolean>()
let savepointSeq = 0

export function markAmbientTransaction<T>(fn: () => Promise<T>) {
  return ambient.run(true, fn)
}

export async function runInTransaction<T>(db: Database, fn: (tx: Database) => Promise<T>): Promise<T> {
  if (ambient.getStore()) {
    const name = `bowsp${++savepointSeq}`
    await db.execute(sql.raw(`savepoint ${name}`))
    try {
      const result = await fn(db)
      await db.execute(sql.raw(`release savepoint ${name}`))
      return result
    } catch (error) {
      await db.execute(sql.raw(`rollback to savepoint ${name}`))
      throw error
    }
  }
  return db.transaction(async (tx) => fn(tx as unknown as Database))
}
