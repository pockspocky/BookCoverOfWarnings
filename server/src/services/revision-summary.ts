import { stripPrivate } from '../privacy/strip'

const FIELD_LABELS: Record<string, string> = {
  displayName: 'display name',
  graduationYear: 'graduation year',
  generalComment: 'general comment',
  title: 'title',
  name: 'name',
  description: 'description',
  summary: 'summary',
  categoryId: 'category',
  category: 'category',
  relationshipTypeId: 'relationship type',
  roleId: 'role',
  studentId: 'student',
  groupId: 'group',
  evidenceDate: 'evidence date',
  startDate: 'start date',
  endDate: 'end date',
  urls: 'links',
  evidenceLink: 'evidence link',
  verificationStatus: 'verification',
  reliabilityScore: 'reliability',
  status: 'status',
  isActive: 'active state',
  archivedAt: 'archive state'
}

const FIELD_ORDER = [
  'displayName',
  'name',
  'title',
  'summary',
  'description',
  'graduationYear',
  'generalComment',
  'categoryId',
  'category',
  'relationshipTypeId',
  'roleId',
  'studentId',
  'groupId',
  'evidenceDate',
  'startDate',
  'endDate',
  'urls',
  'evidenceLink',
  'verificationStatus',
  'reliabilityScore',
  'status',
  'isActive',
  'archivedAt'
]

function stable(value: unknown) {
  return JSON.stringify(value ?? null)
}

function meaningful(value: unknown) {
  if (value == null) return false
  if (typeof value === 'string' && value.trim() === '') return false
  if (Array.isArray(value) && value.length === 0) return false
  return true
}

function skipOnAdd(key: string, value: unknown) {
  if (key === 'status' && (value === 'active' || value === 'pending')) return true
  if (key === 'isActive' && value === true) return true
  if (key === 'archivedAt') return true
  return false
}

function labelForKey(key: string) {
  const known = FIELD_LABELS[key]
  if (known) return known
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ').toLowerCase()
}

function changedKeys(previous: Record<string, unknown>, next: Record<string, unknown>) {
  const keys = new Set<string>()
  const previousEmpty = Object.keys(previous).length === 0
  for (const key of Object.keys(next)) {
    if (previousEmpty || (key in previous && stable(previous[key]) !== stable(next[key]))) keys.add(key)
  }
  for (const key of Object.keys(previous)) {
    if (key in next && stable(previous[key]) !== stable(next[key])) keys.add(key)
  }
  return [...keys].sort((left, right) => {
    const leftIndex = FIELD_ORDER.indexOf(left)
    const rightIndex = FIELD_ORDER.indexOf(right)
    const leftRank = leftIndex === -1 ? FIELD_ORDER.length : leftIndex
    const rightRank = rightIndex === -1 ? FIELD_ORDER.length : rightIndex
    if (leftRank !== rightRank) return leftRank - rightRank
    return left.localeCompare(right)
  })
}

function joinLabels(labels: string[]) {
  const unique: string[] = []
  for (const label of labels) {
    if (!unique.includes(label)) unique.push(label)
  }
  if (!unique.length) return ''
  if (unique.length > 3) return `${unique.slice(0, 3).join(', ')}, and other fields`
  if (unique.length === 1) return unique[0] ?? ''
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`
  return `${unique[0]}, ${unique[1]}, and ${unique[2]}`
}

function becameArchived(previous: Record<string, unknown>, next: Record<string, unknown>) {
  if (next.status === 'archived' && previous.status !== 'archived') return true
  return 'archivedAt' in next && next.archivedAt != null && previous.archivedAt == null
}

export function describeRevision(previousValues: Record<string, unknown>, newValues: Record<string, unknown>) {
  const previous = stripPrivate(previousValues)
  const next = stripPrivate(newValues)
  const keys = changedKeys(previous, next)
  if (becameArchived(previous, next)) {
    const others = keys
      .filter((key) => key !== 'status' && key !== 'archivedAt')
      .map(labelForKey)
    return others.length ? `Archived record. Updated ${joinLabels(others)}` : 'Archived record'
  }
  if (Object.keys(previous).length === 0) {
    const labels = keys
      .filter((key) => meaningful(next[key]) && !skipOnAdd(key, next[key]))
      .map(labelForKey)
    return labels.length ? `Added ${joinLabels(labels)}` : 'Added record'
  }
  const labels = keys.map(labelForKey)
  return labels.length ? `Updated ${joinLabels(labels)}` : 'Updated record'
}
