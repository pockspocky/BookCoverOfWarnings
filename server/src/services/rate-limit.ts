import { and, asc, eq, gt } from 'drizzle-orm'
import type { Database } from '../db/client'
import { rateLimitEvents } from '../db/schema'
import { RateLimitError } from '../http/errors'
import { newId } from '../util'

export async function enforceRateLimit(db: Database, accountId: string, action: string, limit: number, windowSeconds: number) {
  const since = new Date(Date.now() - windowSeconds * 1000)
  const rows = await db.select({
    occurredAt: rateLimitEvents.occurredAt
  }).from(rateLimitEvents).where(and(
    eq(rateLimitEvents.accountId, accountId),
    eq(rateLimitEvents.action, action),
    gt(rateLimitEvents.occurredAt, since)
  )).orderBy(asc(rateLimitEvents.occurredAt))
  if (rows.length >= limit) {
    const oldest = rows[0]?.occurredAt ?? new Date()
    const retryAfter = Math.max(1, Math.ceil((oldest.getTime() + windowSeconds * 1000 - Date.now()) / 1000))
    throw new RateLimitError(retryAfter)
  }
  await db.insert(rateLimitEvents).values({
    id: newId(),
    accountId,
    action,
    occurredAt: new Date()
  })
}
