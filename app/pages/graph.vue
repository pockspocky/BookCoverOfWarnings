<template>
  <div>
    <PageHeader title="Graph" kicker="Neighborhood" description="Approved student and group nodes with directional relationship edges. Private self-description fields are never included." />
    <form class="mb-4 grid gap-3 md:grid-cols-4" @submit.prevent="loadOverview">
      <label class="text-sm">Highlight
        <input v-model="q" class="mt-1 w-full border border-panel-border bg-panel px-3 py-2" placeholder="Student or group" />
      </label>
      <label class="text-sm">Node type
        <select v-model="nodeType" class="mt-1 w-full border border-panel-border bg-panel px-3 py-2">
          <option value="">Students and groups</option>
          <option value="student">Students</option>
          <option value="group">Groups</option>
        </select>
      </label>
      <label class="text-sm">Relationship type
        <select v-model="relationshipTypeId" class="mt-1 w-full border border-panel-border bg-panel px-3 py-2">
          <option value="">All types</option>
          <option v-for="type in types" :key="type.id" :value="type.id">{{ type.name }}</option>
        </select>
      </label>
      <div class="flex items-end gap-2">
        <button class="border border-accent px-3 py-2 text-sm text-accent" type="submit">Apply</button>
        <button class="border border-panel-border px-3 py-2 text-sm" type="button" @click="collapse">Collapse</button>
      </div>
    </form>
    <SkeletonBlock v-if="pending" />
    <EmptyState v-else-if="error" title="Graph unavailable" :description="error" />
    <EmptyState v-else-if="!visible.nodes.length" title="No visible nodes" description="Adjust the filters or search for a published student or group." />
    <div v-else class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <RelationshipGraph :graph="visible" :selected-node-id="selectedNode?.id" :highlight-query="q" @select-node="selectedNode = $event" @select-edge="selectedEdge = $event" />
      <aside class="space-y-4 border border-panel-border bg-panel p-4">
        <div v-if="selectedNode">
          <p class="mono-meta uppercase">{{ selectedNode.type }}</p>
          <h2 class="text-lg font-semibold">{{ selectedNode.label }}</h2>
          <p class="mt-1 text-xs text-ink-400">Immediate neighbors are highlighted. Other nodes are dimmed.</p>
          <div class="mt-3 flex flex-wrap gap-2">
            <NuxtLink class="border border-accent px-2 py-1 text-sm text-accent" :to="profileHref(selectedNode)">Open profile</NuxtLink>
            <button class="border border-panel-border px-2 py-1 text-sm" type="button" @click="expand(selectedNode)">Expand neighborhood</button>
          </div>
        </div>
        <div v-if="selectedEdge" class="border-t border-panel-border pt-3">
          <p class="mono-meta uppercase">Edge · {{ selectedEdge.status }}</p>
          <p class="text-sm">{{ selectedEdge.relationshipTypeName }}</p>
          <NuxtLink class="mt-2 inline-block text-sm text-accent" :to="`/relationships/${selectedEdge.id}`">Relationship details</NuxtLink>
        </div>
        <div>
          <h2 class="mb-2 text-sm font-semibold uppercase tracking-wider text-ink-400">Nodes</h2>
          <ul class="max-h-80 space-y-1 overflow-auto text-sm">
            <li v-for="node in visible.nodes" :key="node.id" class="flex items-center justify-between gap-2">
              <button class="text-left hover:text-accent" type="button" @click="selectedNode = node">{{ node.label }}</button>
              <NuxtLink class="font-mono text-[11px] text-accent" :to="profileHref(node)">Open</NuxtLink>
            </li>
          </ul>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { errorMessage } from '../utils/errors'
import type { EndpointType, GraphEdge, GraphNeighborhood, GraphNode } from '../../lib/types'

const route = useRoute()
const { $api } = useNuxtApp()
const q = ref(typeof route.query.q === 'string' ? route.query.q : '')
const nodeType = ref<'' | EndpointType>('')
const relationshipTypeId = ref('')
const pending = ref(true)
const error = ref('')
const types = ref<Awaited<ReturnType<typeof $api.relationships.types>>>([])
const graph = ref<GraphNeighborhood>({ nodes: [], edges: [] })
const selectedNode = ref<GraphNode | null>(null)
const selectedEdge = ref<GraphEdge | null>(null)

const visible = computed<GraphNeighborhood>(() => {
  const nodes = nodeType.value ? graph.value.nodes.filter((node) => node.type === nodeType.value) : graph.value.nodes
  const ids = new Set(nodes.map((node) => node.id))
  const edges = graph.value.edges.filter((edge) => {
    if (!ids.has(edge.source) || !ids.has(edge.target)) return false
    if (relationshipTypeId.value && edge.relationshipTypeId !== relationshipTypeId.value) return false
    return true
  })
  return { nodes, edges }
})

function profileHref(node: GraphNode) {
  const id = node.id.split(':')[1]
  return node.type === 'student' ? `/students/${id}` : `/groups/${id}`
}

function merge(next: GraphNeighborhood) {
  const nodes = new Map(graph.value.nodes.map((node) => [node.id, node]))
  const edges = new Map(graph.value.edges.map((edge) => [edge.id, edge]))
  for (const node of next.nodes) nodes.set(node.id, node)
  for (const edge of next.edges) edges.set(edge.id, edge)
  graph.value = { nodes: [...nodes.values()], edges: [...edges.values()] }
}

async function loadOverview() {
  pending.value = true
  error.value = ''
  selectedNode.value = null
  selectedEdge.value = null
  try {
    graph.value = await $api.graph.overview({
      q: q.value || undefined,
      nodeType: nodeType.value || undefined,
      relationshipTypeId: relationshipTypeId.value || undefined
    })
  } catch (err) {
    error.value = errorMessage(err)
  } finally {
    pending.value = false
  }
}

async function expand(node: GraphNode) {
  const [, id] = node.id.split(':')
  if (!id) return
  try {
    const next = await $api.graph.neighborhood(node.type, id, 1)
    merge(next)
  } catch (err) {
    error.value = errorMessage(err)
  }
}

function collapse() {
  q.value = ''
  nodeType.value = ''
  relationshipTypeId.value = ''
  loadOverview()
}

onMounted(async () => {
  types.value = await $api.relationships.types()
  const focus = typeof route.query.node === 'string' ? route.query.node : typeof route.query.focus === 'string' ? route.query.focus : ''
  if (focus.includes(':')) {
    const [type, id] = focus.split(':')
    if ((type === 'student' || type === 'group') && id) {
      try {
        graph.value = await $api.graph.neighborhood(type, id, 1)
        selectedNode.value = graph.value.nodes.find((node) => node.id === `${type}:${id}`) ?? null
        pending.value = false
        return
      } catch (err) {
        error.value = errorMessage(err)
      }
    }
  }
  await loadOverview()
})
</script>
