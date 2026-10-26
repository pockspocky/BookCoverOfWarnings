import type { z } from 'zod'
import { fromZod } from './errors'

export function parseQuery<T>(schema: z.ZodType<T>, query: Record<string, string | undefined>) {
  const normalized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === '') continue
    if (value === 'true') normalized[key] = true
    else if (value === 'false') normalized[key] = false
    else if (key === 'entityTypes') normalized[key] = value.split(',').map((item) => item.trim()).filter(Boolean)
    else normalized[key] = value
  }
  const parsed = schema.safeParse(normalized)
  if (!parsed.success) throw fromZod(parsed.error)
  return parsed.data
}
