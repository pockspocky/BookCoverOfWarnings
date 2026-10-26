export type ApiErrorCode =
  | 'VALIDATION'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'CONSENT_REQUIRED'
  | 'RATE_LIMITED'
  | 'NETWORK'
  | 'INTERNAL'

export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly status: number
  readonly details: Record<string, string[] | string> | null
  readonly fieldErrors: Record<string, string[]>

  constructor(options: {
    code: ApiErrorCode
    status: number
    message: string
    details?: Record<string, string[] | string> | null
    fieldErrors?: Record<string, string[]>
  }) {
    super(options.message)
    this.name = 'ApiError'
    this.code = options.code
    this.status = options.status
    this.details = options.details ?? null
    this.fieldErrors = options.fieldErrors ?? {}
  }

  static validation(message: string, fieldErrors: Record<string, string[]> = {}) {
    return new ApiError({ code: 'VALIDATION', status: 422, message, fieldErrors })
  }

  static unauthorized(message = 'Authentication required.') {
    return new ApiError({ code: 'UNAUTHORIZED', status: 401, message })
  }

  static forbidden(message = 'You are not authorized to perform this action.') {
    return new ApiError({ code: 'FORBIDDEN', status: 403, message })
  }

  static notFound(message = 'Record not found.') {
    return new ApiError({ code: 'NOT_FOUND', status: 404, message })
  }

  static conflict(message: string, details: Record<string, string[] | string> | null = null) {
    return new ApiError({ code: 'CONFLICT', status: 409, message, details })
  }

  static consentRequired(message: string) {
    return new ApiError({ code: 'CONSENT_REQUIRED', status: 409, message })
  }

  static network(message = 'Network request failed.') {
    return new ApiError({ code: 'NETWORK', status: 0, message })
  }

  static rateLimited(message = 'Rate limit exceeded. Retry later.') {
    return new ApiError({ code: 'RATE_LIMITED', status: 429, message })
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}
