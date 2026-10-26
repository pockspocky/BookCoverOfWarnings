import type { ApiClient } from '../types/api'
import { HttpApiClient } from './http-client'

export function createApiClient(options: {
  apiBaseUrl: string
  getToken: () => string | null
  getCsrf?: () => string | null
  setCsrf?: (token: string | null) => void
}): ApiClient {
  return new HttpApiClient(options.apiBaseUrl, options.getToken, options.getCsrf, options.setCsrf)
}
