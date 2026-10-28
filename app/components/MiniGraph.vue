<template>
  <div class="h-72 border border-panel-border bg-ink-950">
    <ForceGraph
      v-if="graph.nodes.length"
      :graph="graph"
      @select-node="openNode"
      @select-edge="openEdge"
    />
    <EmptyState v-else title="No graph neighborhood" description="No approved relationships are linked to this record." />
  </div>
</template>

<script setup lang="ts">
import type { GraphEdge, GraphNeighborhood, GraphNode } from '../../lib/types'

defineProps<{ graph: GraphNeighborhood }>()

const router = useRouter()

function openNode(node: GraphNode) {
  const id = node.id.slice(node.id.indexOf(':') + 1)
  if (node.type === 'student') router.push(`/students/${id}`)
  if (node.type === 'group') router.push(`/groups/${id}`)
}

function openEdge(edge: GraphEdge) {
  router.push(`/relationships/${edge.id}`)
}
</script>
