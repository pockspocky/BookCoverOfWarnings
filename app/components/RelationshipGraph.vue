<template>
  <div>
    <div class="mb-2 flex flex-wrap items-center gap-3 text-xs text-ink-400">
      <span class="inline-flex items-center gap-1"><span class="inline-block h-3 w-3 rounded-full border border-accent" /> Student</span>
      <span class="inline-flex items-center gap-1"><span class="inline-block h-3 w-3 border border-[rgb(var(--graph-group))] bg-ink-900" /> Group</span>
      <span class="inline-flex items-center gap-1"><span class="inline-block h-px w-6 bg-accent" /> Active</span>
      <span class="inline-flex items-center gap-1"><span class="inline-block h-px w-6 border-t border-dashed border-ink-400" /> Ended</span>
      <span>Arrow follows the relationship</span>
      <button class="ml-auto border border-panel-border px-2 py-1 text-ink-200" type="button" @click="canvas?.fit()">Fit</button>
    </div>
    <div class="mb-2 grid gap-3 text-xs text-ink-300 sm:grid-cols-4">
      <label>Center {{ forces.centerStrength.toFixed(2) }}
        <input v-model.number="centerSlider" class="mt-1 w-full accent-current" type="range" min="0" max="1" step="0.01" />
      </label>
      <label>Repel {{ repel }}
        <input v-model.number="repel" class="mt-1 w-full" type="range" min="0" max="20" step="0.5" />
      </label>
      <label>Link {{ forces.linkStrength.toFixed(2) }}
        <input v-model.number="linkSlider" class="mt-1 w-full" type="range" min="0" max="1" step="0.01" />
      </label>
      <label>Distance {{ distance }}
        <input v-model.number="distance" class="mt-1 w-full" type="range" min="30" max="500" step="1" />
      </label>
    </div>
    <div class="h-[32rem] border border-panel-border bg-ink-950">
      <ForceGraph
        ref="canvas"
        :graph="graph"
        :selected-node-id="selectedNodeId"
        :selected-edge-id="selectedEdgeId"
        :highlight-query="highlightQuery"
        :forces="forces"
        @select-node="emit('selectNode', $event)"
        @select-edge="emit('selectEdge', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { GraphEdge, GraphNeighborhood, GraphNode } from '../../lib/types'
import { defaultForceSettings, sliderToStrength, strengthToSlider, type ForceSettings } from '../../lib/graph/model'

defineProps<{
  graph: GraphNeighborhood
  selectedNodeId?: string | null
  selectedEdgeId?: string | null
  highlightQuery?: string
}>()

const emit = defineEmits<{
  selectNode: [GraphNode]
  selectEdge: [GraphEdge]
}>()

const canvas = ref<{ fit: () => void } | null>(null)
const centerSlider = ref(strengthToSlider(defaultForceSettings.centerStrength))
const repel = ref(defaultForceSettings.repelStrength)
const linkSlider = ref(strengthToSlider(defaultForceSettings.linkStrength))
const distance = ref(defaultForceSettings.linkDistance)

const forces = computed<ForceSettings>(() => ({
  centerStrength: sliderToStrength(centerSlider.value),
  repelStrength: repel.value,
  linkStrength: sliderToStrength(linkSlider.value),
  linkDistance: distance.value
}))
</script>
