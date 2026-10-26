const PRIVATE_KEY = /sexual/i

export function stripPrivate<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => stripPrivate(item)) as T
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const output: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (PRIVATE_KEY.test(key)) continue
      output[key] = stripPrivate(child)
    }
    return output as T
  }
  return value
}

export function containsPrivateKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => containsPrivateKey(item))
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(([key, child]) => PRIVATE_KEY.test(key) || containsPrivateKey(child))
  }
  return false
}
