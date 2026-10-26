import { and, eq, isNull, or, sql } from 'drizzle-orm'
import type { GraphNeighborhood } from '../../../lib/types'
import type { EndpointType, RelationshipStatus } from '../../../lib/types/enums'
import { ApiError } from '../../../lib/types/errors'
import type { Database } from '../db/client'
import { groups, relationshipTypes, relationships, students } from '../db/schema'
import { likePattern } from '../util'

const nodeCap = 40
const edgeCap = 80

type Ref = { type: EndpointType; id: string }

async function edgesTouching(db: Database, node: Ref, relationshipTypeId?: string) {
  const rows = await db.select({
    id: relationships.id,
    sourceType: relationships.sourceType,
    sourceId: relationships.sourceId,
    targetType: relationships.targetType,
    targetId: relationships.targetId,
    relationshipTypeId: relationships.relationshipTypeId,
    status: relationships.status
  }).from(relationships).where(and(
    sql`${relationships.status} <> 'archived'`,
    relationshipTypeId ? eq(relationships.relationshipTypeId, relationshipTypeId) : undefined,
    or(
      and(eq(relationships.sourceType, node.type), eq(relationships.sourceId, node.id)),
      and(eq(relationships.targetType, node.type), eq(relationships.targetId, node.id))
    )
  )).limit(25)
  return rows
}

async function present(db: Database, refs: Ref[], edges: Awaited<ReturnType<typeof edgesTouching>>): Promise<GraphNeighborhood> {
  const typeIds = [...new Set(edges.map((edge) => edge.relationshipTypeId))]
  const types = typeIds.length
    ? await db.select({ id: relationshipTypes.id, name: relationshipTypes.name }).from(relationshipTypes).where(sql`${relationshipTypes.id} in (${sql.join(typeIds.map((id) => sql`${id}`), sql`, `)})`)
    : []
  const names = new Map(types.map((type) => [type.id, type.name]))
  const nodes = []
  for (const ref of refs) {
    if (ref.type === 'student') {
      const rows = await db.select({
        id: students.id,
        displayName: students.displayName,
        graduationYear: students.graduationYear,
        archivedAt: students.archivedAt
      }).from(students).where(eq(students.id, ref.id)).limit(1)
      const row = rows[0]
      if (!row) continue
      nodes.push({
        id: `student:${row.id}`,
        type: 'student' as const,
        label: row.displayName,
        graduationYear: row.graduationYear,
        status: row.archivedAt ? 'archived' : 'active'
      })
    } else {
      const rows = await db.select({
        id: groups.id,
        name: groups.name,
        status: groups.status
      }).from(groups).where(eq(groups.id, ref.id)).limit(1)
      const row = rows[0]
      if (!row) continue
      nodes.push({
        id: `group:${row.id}`,
        type: 'group' as const,
        label: row.name,
        status: row.status
      })
    }
  }
  return {
    nodes,
    edges: edges.map((edge) => ({
      id: edge.id,
      source: `${edge.sourceType}:${edge.sourceId}`,
      target: `${edge.targetType}:${edge.targetId}`,
      relationshipTypeId: edge.relationshipTypeId,
      relationshipTypeName: names.get(edge.relationshipTypeId) ?? 'Relationship',
      status: edge.status as RelationshipStatus,
      directed: true as const
    }))
  }
}

async function expand(db: Database, seeds: Ref[], depth: number, relationshipTypeId?: string) {
  const visited = new Map<string, Ref>()
  for (const seed of seeds) visited.set(`${seed.type}:${seed.id}`, seed)
  const neighborCap = visited.size + nodeCap
  let frontier = [...visited.values()]
  const edges: Awaited<ReturnType<typeof edgesTouching>> = []
  for (let hop = 0; hop < depth; hop += 1) {
    const next: Ref[] = []
    for (const node of frontier) {
      if (edges.length >= edgeCap) break
      const found = await edgesTouching(db, node, relationshipTypeId)
      for (const edge of found) {
        if (edges.length >= edgeCap) break
        if (edges.some((item) => item.id === edge.id)) continue
        edges.push(edge)
        const other: Ref = edge.sourceType === node.type && edge.sourceId === node.id
          ? { type: edge.targetType as EndpointType, id: edge.targetId }
          : { type: edge.sourceType as EndpointType, id: edge.sourceId }
        const key = `${other.type}:${other.id}`
        if (!visited.has(key) && visited.size < neighborCap) {
          visited.set(key, other)
          next.push(other)
        }
      }
    }
    frontier = next
  }
  return present(db, [...visited.values()], edges)
}

export async function neighborhood(db: Database, nodeType: EndpointType, nodeId: string, depth = 1) {
  if (nodeType === 'student') {
    const rows = await db.select({ id: students.id }).from(students).where(eq(students.id, nodeId)).limit(1)
    if (!rows[0]) throw ApiError.notFound()
  } else {
    const rows = await db.select({ id: groups.id }).from(groups).where(eq(groups.id, nodeId)).limit(1)
    if (!rows[0]) throw ApiError.notFound()
  }
  const safeDepth = Math.min(Math.max(depth || 1, 1), 3)
  return expand(db, [{ type: nodeType, id: nodeId }], safeDepth)
}

export async function overview(db: Database, filters: { q?: string; nodeType?: EndpointType; relationshipTypeId?: string }) {
  const seeds: Ref[] = []
  if (!filters.nodeType || filters.nodeType === 'student') {
    const rows = await db.select({ id: students.id }).from(students).where(and(
      isNull(students.archivedAt),
      filters.q ? sql`${students.displayName} ilike ${likePattern(filters.q)} escape '\\'` : undefined
    )).orderBy(students.displayName)
    for (const row of rows) seeds.push({ type: 'student', id: row.id })
  }
  if (!filters.nodeType || filters.nodeType === 'group') {
    const rows = await db.select({ id: groups.id }).from(groups).where(and(
      eq(groups.status, 'active'),
      filters.q ? sql`${groups.name} ilike ${likePattern(filters.q)} escape '\\'` : undefined
    )).orderBy(groups.name)
    for (const row of rows) seeds.push({ type: 'group', id: row.id })
  }
  if (!seeds.length) return { nodes: [], edges: [] }
  return expand(db, seeds, 1, filters.relationshipTypeId)
}
