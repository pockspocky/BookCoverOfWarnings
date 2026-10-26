export const ANONYMOUS_ACCOUNT_EMAIL = 'anonymous@local.invalid'

function blank(value: unknown) {
  return value == null || (typeof value === 'string' && value.trim() === '')
}

export function credentialsAreEmpty(payload: unknown) {
  if (payload == null) return true
  if (typeof payload !== 'object' || Array.isArray(payload)) return false
  const body = payload as { email?: unknown; password?: unknown }
  return blank(body.email) && blank(body.password)
}
