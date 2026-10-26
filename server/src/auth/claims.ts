import { ApiError } from '../../../lib/types/errors'

export interface VerifiedSchoolIdentity {
  issuer: string
  subject: string
  email: string
}

function issuerMatches(actual: string, expected: string) {
  return actual.replace(/\/$/, '') === expected.replace(/\/$/, '')
}

export function verifiedSchoolIdentity(claims: Record<string, unknown> | undefined, domain: string, expectedIssuer: string): VerifiedSchoolIdentity {
  if (!claims) throw ApiError.unauthorized('Institutional login did not return an identity token.')
  const issuer = claims.iss
  const subject = claims.sub
  const email = claims.email
  const verified = claims.email_verified
  if (typeof issuer !== 'string' || !issuerMatches(issuer, expectedIssuer)) {
    throw ApiError.unauthorized('Institutional login issuer was not accepted.')
  }
  if (typeof subject !== 'string' || !subject.trim()) {
    throw ApiError.unauthorized('Institutional login did not include a subject.')
  }
  const emailVerified = verified === true || verified === 'true'
  if (!emailVerified) throw ApiError.forbidden('The school email is not verified.')
  if (typeof email !== 'string' || !email.includes('@')) {
    throw ApiError.validation('Institutional login did not include a school email.', { email: ['A verified school email is required.'] })
  }
  const normalized = email.trim().toLowerCase()
  if (!normalized.endsWith(`@${domain.toLowerCase()}`)) {
    throw ApiError.validation('Email must use the school domain.', { email: [`Use an @${domain} address.`] })
  }
  return { issuer: issuer.replace(/\/$/, ''), subject: subject.trim(), email: normalized }
}
