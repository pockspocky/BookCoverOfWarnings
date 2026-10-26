import { createApiClient } from '../../lib/api/create-client'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const legacy = useCookie<string | null>('bow_bearer', { path: '/', sameSite: 'lax' })
  legacy.value = null
  const csrf = { current: null as string | null }

  const client = createApiClient({
    apiBaseUrl: String(config.public.apiBaseUrl ?? '').replace(/\/$/, ''),
    getToken: () => null,
    getCsrf: () => csrf.current,
    setCsrf: (value) => {
      csrf.current = value
    }
  })

  return {
    provide: {
      api: client
    }
  }
})
