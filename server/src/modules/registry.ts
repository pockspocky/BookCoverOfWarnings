import { ApiError } from '../../../lib/types/errors'
import {
  categoryModule,
  evidenceModule,
  groupModule,
  groupRoleModule,
  membershipModule,
  relationshipModule,
  relationshipTypeModule,
  studentModule,
  traitModule
} from './entities'
import type { EntityModule } from './types'

const modules: EntityModule[] = [
  studentModule,
  traitModule,
  evidenceModule,
  groupModule,
  membershipModule,
  relationshipModule,
  categoryModule,
  relationshipTypeModule,
  groupRoleModule
]

export function requireModule(entityType: string) {
  const found = modules.find((item) => item.entityType === entityType)
  if (!found) throw ApiError.validation('Unknown entity type.', { entityType: ['Unknown entity type.'] })
  return found
}

export function registeredEntityTypes() {
  return modules.map((item) => item.entityType)
}
