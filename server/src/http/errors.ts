import { ApiError } from '../../../lib/types/errors'

export class RateLimitError extends ApiError {
  readonly retryAfter: number

  constructor(retryAfter: number) {
    super({
      code: 'RATE_LIMITED',
      status: 429,
      message: 'Rate limit exceeded. Retry later.'
    })
    this.retryAfter = retryAfter
  }
}

export function fromZod(error: { issues: Array<{ path: PropertyKey[]; message: string }> }, message = 'Request is invalid.') {
  const fieldErrors: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.') || 'form'
    fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message]
  }
  return ApiError.validation(message, fieldErrors)
}
