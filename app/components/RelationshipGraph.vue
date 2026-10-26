<template>
  <div>
    <div class="mb-2 flex flex-wrap items-center gap-3 text-xs text-ink-400">
      <span class="inline-flex items-center gap-1"><span class="inline-block h-3 w-3 rounded-full border border-accent" /> Student</span>
      <span class="inline-flex items-center gap-1"><span class="inline-block h-3 w-3 border border-teal-700 bg-[#14201c]" /> Group</span>
      <span class="inline-flex items-center gap-1"><span class="inline-block h-px w-6 bg-accent" /> Current</span>
      <span class="inline-flex items-center gap-1"><span class="inline-block h-px w-6 border-t border-dashed border-ink-400" /> Historical</span>
      <button class="ml-auto border border-panel-border px-2 py-1 text-ink-200" type="button" @click="fit">Fit</button>
    </div>
    <div class="h-[32rem] border border-panel-border bg-ink-950" data-testid="graph-canvas" role="application" aria-label="Relationship graph">
      <VueFlow
        id="directory-graph"
        :nodes="flowNodes"
        :edges="flowEdges"
        :nodes-draggable="false"
        fit-view-on-init
        @node-click="onNode"
        @edge-click="onEdge"
      >
        <Background :gap="18" color="#2b271f" />
        <Controls />
        <MiniMap pannable zoomable />
      </VueFlow>
    </div>
  </div>
</template>

<script setup lang="ts">
import { MarkerType, VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import type { GraphEdge, GraphNeighborhood, GraphNode } from '../../lib/types'

const props = defineProps<{
  graph: GraphNeighborhood
  selectedNodeId?: string | null
  highlightQuery?: string
}>()

const emit = defineEmits<{
  selectNode: [GraphNode]
  selectEdge: [GraphEdge]
}>()

const { fitView } = useVueFlow({ id: 'directory-graph' })

const neighborIds = computed(() => {
  const selected = props.selectedNodeId
  if (!selected) return null
  const ids = new Set<string>([selected])
  for (const edge of props.graph.edges) {
    if (edge.source === selected) ids.add(edge.target)
    if (edge.target === selected) ids.add(edge.source)
  }
  return ids
})

const flowNodes = computed(() => props.graph.nodes.map((node, index) => {
  const total = Math.max(props.graph.nodes.length, 1)
  const angle = (index / total) * Math.PI * 2
  const radius = 160 + total * 12
  const dimmed = neighborIds.value ? !neighborIds.value.has(node.id) : false
  const query = props.highlightQuery?.trim().toLowerCase()
  const matched = Boolean(query && node.label.toLowerCase().includes(query))
  return {
    id: node.id,
    data: { label: node.label },
    label: node.label,
    position: { x: 360 + Math.cos(angle) * radius, y: 260 + Math.sin(angle) * radius },
    style: {
      background: node.type === 'student' ? '#1f1c17' : '#14201c',
      color: '#e7e1d4',
      border: node.type === 'student' ? '1px solid #c4a35a' : '1px solid #6ea8a0',
      borderRadius: node.type === 'group' ? '2px' : '999px',
      padding: '8px 12px',
      fontSize: '12px',
      opacity: dimmed ? 0.28 : 1,
      boxShadow: matched ? '0 0 0 2px #c4a35a' : undefined
    }
  }
}))

const flowEdges = computed(() => props.graph.edges.map((edge) => ({
  id: edge.id,
  source: edge.source,
  target: edge.target,
  label: edge.status === 'active' ? edge.relationshipTypeName : `${edge.relationshipTypeName} (${edge.status})`,
  animated: edge.status === 'active',
  markerEnd: MarkerType.ArrowClosed,
  style: {
    stroke: edge.status === 'active' ? '#c4a35a' : '#7d7668',
    strokeDasharray: edge.status === 'ended' ? '6 4' : undefined
  },
  labelStyle: { fill: '#a89f8d', fontSize: 10 }
})))

function fit() {
  fitView({ padding: 0.2, duration: 200 })
}

function onNode(event: { node: { id: string } }) {
  const node = props.graph.nodes.find((item) => item.id === event.node.id)
  if (node) emit('selectNode', node)
}

function onEdge(event: { edge: { id: string } }) {
  const edge = props.graph.edges.find((item) => item.id === event.edge.id)
  if (edge) emit('selectEdge', edge)
}

watch(() => props.graph, async () => {
  await nextTick()
  fit()
})
</script>
