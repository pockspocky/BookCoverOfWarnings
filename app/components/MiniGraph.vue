<template>
  <div class="h-72 border border-panel-border bg-ink-950">
    <ClientOnly>
      <VueFlow
        v-if="nodes.length"
        :nodes="nodes"
        :edges="edges"
        :default-viewport="{ zoom: 1 }"
        fit-view-on-init
        class="h-full"
        @node-click="onNode"
        @edge-click="onEdge"
      >
        <Background :gap="18" color="#2b271f" />
        <Controls />
      </VueFlow>
      <EmptyState v-else title="No graph neighborhood" description="No approved relationships are linked to this record." />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import { VueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import type { GraphNeighborhood } from '../../lib/types'

const props = defineProps<{ graph: GraphNeighborhood }>()
const router = useRouter()

const nodes = computed(() => props.graph.nodes.map((node, index) => ({
  id: node.id,
  label: node.label,
  position: { x: (index % 4) * 180, y: Math.floor(index / 4) * 110 },
  style: {
    background: node.type === 'student' ? '#1f1c17' : '#14201c',
    color: '#e7e1d4',
    border: node.type === 'student' ? '1px solid #c4a35a' : '1px solid #6ea8a0',
    borderRadius: node.type === 'group' ? '2px' : '999px',
    padding: '8px 12px',
    fontSize: '12px'
  }
})))

const edges = computed(() => props.graph.edges.map((edge) => ({
  id: edge.id,
  source: edge.source,
  target: edge.target,
  label: edge.relationshipTypeName,
  animated: edge.status === 'active',
  style: { stroke: edge.status === 'active' ? '#c4a35a' : '#7d7668' },
  markerEnd: 'arrowclosed'
})))

function onNode(event: { node: { id: string } }) {
  const [type, id] = event.node.id.split(':')
  if (type === 'student') router.push(`/students/${id}`)
  if (type === 'group') router.push(`/groups/${id}`)
}

function onEdge(event: { edge: { id: string } }) {
  router.push(`/relationships/${event.edge.id}`)
}
</script>
