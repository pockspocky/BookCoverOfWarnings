export function publicApiBaseUrl(env: Record<string, string | undefined> = process.env) {
  const configured = env.NUXT_PUBLIC_API_BASE_URL?.trim()
  if (configured) return configured.replace(/\/$/, '')
  if (env.VERCEL) return ''
  return 'http://localhost:3001'
}

export function withApiBase(apiBaseUrl: string, path: string) {
  const base = apiBaseUrl.trim().replace(/\/$/, '')
  const suffix = path.startsWith('/') ? path : `/${path}`
  return base ? `${base}${suffix}` : suffix
}
