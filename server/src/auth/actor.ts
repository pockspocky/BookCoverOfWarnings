import type { MatchStatus, UserRole } from '../../../lib/types/enums'

export type Actor = {
  id: string
  email: string
  emailVerified: boolean
  role: UserRole
  matchedStudentId: string | null
  matchStatus: MatchStatus
  createdAt: Date
  updatedAt: Date
  sessionId: string
  csrfToken: string
  expiresAt: Date
}

export function permissionsFor(actor: Pick<Actor, 'role' | 'matchedStudentId'>) {
  const permissions = ['directory:read', 'submissions:create']
  if (actor.matchedStudentId) permissions.push('private-profile:self')
  if (actor.role === 'administrator') {
    permissions.push('submissions:moderate', 'vocabulary:manage', 'accounts:match', 'evidence:verify')
  }
  return permissions
}
