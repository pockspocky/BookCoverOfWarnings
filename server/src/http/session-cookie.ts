import type { CookieOptions } from 'hono/utils/cookie'

export function sessionCookieOptions(secure: boolean, maxAge: number, crossSite: boolean): CookieOptions {
  if (crossSite) {
    return {
      httpOnly: true,
      path: '/',
      maxAge,
      sameSite: 'None',
      secure: true,
      partitioned: true
    }
  }
  return {
    httpOnly: true,
    path: '/',
    maxAge,
    sameSite: 'Lax',
    secure
  }
}
