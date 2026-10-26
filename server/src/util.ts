export function iso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString()
}

export function dateOnly(value: Date | string | null | undefined): string | null {
  if (value == null) return null
  if (typeof value === 'string') return value.slice(0, 10)
  return value.toISOString().slice(0, 10)
}

export function pageWindow(total: number, page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safe = Math.min(Math.max(page, 1), totalPages)
  return {
    page: safe,
    pageSize,
    total,
    totalPages,
    offset: (safe - 1) * pageSize
  }
}

export function likePattern(value: string) {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
}

export function newId() {
  return crypto.randomUUID()
}
