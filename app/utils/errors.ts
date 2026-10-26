import { isApiError } from '../../lib/types/errors'

export function errorMessage(error: unknown) {
  if (isApiError(error)) {
    const fields = Object.entries(error.fieldErrors).flatMap(([field, messages]) => messages.map((message) => `${field}: ${message}`))
    return fields.length ? `${error.message} ${fields.join(' ')}` : error.message
  }
  if (error instanceof Error) return error.message
  return 'Unexpected error.'
}
