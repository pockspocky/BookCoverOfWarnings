<template>
  <div
    ref="host"
    class="relative h-full w-full overflow-hidden touch-none"
    data-testid="graph-canvas"
    role="application"
    aria-label="Relationship graph"
  >
    <p v-if="failure" class="absolute inset-x-3 bottom-3 text-xs text-red-300">{{ failure }}</p>
  </div>
</template>

<script setup lang="ts">
import { Application, Circle, Container, Graphics, Text, type FederatedPointerEvent } from 'pixi.js'
import type { GraphEdge, GraphNeighborhood, GraphNode } from '../../lib/types'
import {
  defaultForceSettings,
  edgeLabelAlpha,
  edgeSegment,
  labelAlpha,
  parallelOffsets,
  type ForceSettings
} from '../../lib/graph/model'
import { createGraphSimulation, type GraphSimulation, type SimNode } from '../../lib/graph/simulation'

const props = withDefaults(defineProps<{
  graph: GraphNeighborhood
  selectedNodeId?: string | null
  selectedEdgeId?: string | null
  highlightQuery?: string
  forces?: ForceSettings
}>(), {
  selectedNodeId: null,
  selectedEdgeId: null,
  highlightQuery: '',
  forces: () => defaultForceSettings
})

const emit = defineEmits<{
  selectNode: [GraphNode]
  selectEdge: [GraphEdge]
}>()

const host = ref<HTMLDivElement | null>(null)
const failure = ref('')
const theme = useThemeStore()

interface NodeView {
  container: Container
  shape: Graphics
  caption: Text
}

let app: Application | null = null
let world: Container | null = null
let edgesLayer: Graphics | null = null
let nodeLayer: Container | null = null
let labelLayer: Container | null = null
const nodeViews = new Map<string, NodeView>()
const edgeLabels = new Map<string, Text>()
let simulation: GraphSimulation | null = null
let simById = new Map<string, SimNode>()
let scale = 1
let userMoved = false
let hoverNodeId: string | null = null
let hoverEdgeId: string | null = null
let dragNodeId: string | null = null
let dragMoved = false
let dragOriginX = 0
let dragOriginY = 0
let panning = false
let panMoved = false
let panStartX = 0
let panStartY = 0
let panWorldX = 0
let panWorldY = 0
let disposed = false
let fittedOnce = false
let starting = false

const palette = {
  student: 0xc4a35a,
  group: 0x6ea8a0,
  ended: 0x7d7668,
  label: 0xe7e1d4,
  fill: 0x1f1c17,
  focus: 0xf4f1ea
}

onMounted(() => {
  void mount()
})

watch(host, (element) => {
  if (element) void mount()
}, { flush: 'post' })

onBeforeUnmount(() => {
  disposed = true
  host.value?.removeEventListener('wheel', onWheel)
  app?.destroy(true, { children: true })
  app = null
})

watch(() => theme.mode, () => {
  readPalette()
})

watch(() => graphSignature(props.graph), () => {
  if (!app) return
  rebuildSimulation()
  if (!userMoved) {
    fittedOnce = false
    fit()
  }
})

watch(() => props.forces, (settings) => {
  simulation?.setForces(settings)
}, { deep: true })

async function mount() {
  if (disposed || app || starting || !host.value) return
  starting = true
  host.value.dataset.graphState = 'init'
  try {
    readPalette()
    const view = new Application()
    await view.init({
      antialias: true,
      backgroundAlpha: 0,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      resizeTo: host.value,
      preference: 'webgl'
    })
    if (disposed || !host.value) {
      view.destroy(true, { children: true })
      return
    }
    app = view
    host.value.appendChild(view.canvas)
    view.canvas.style.display = 'block'
    view.canvas.style.width = '100%'
    view.canvas.style.height = '100%'
    world = new Container()
    edgesLayer = new Graphics()
    nodeLayer = new Container()
    labelLayer = new Container()
    labelLayer.eventMode = 'none'
    world.addChild(edgesLayer, nodeLayer, labelLayer)
    view.stage.addChild(world)
    view.stage.eventMode = 'static'
    view.stage.hitArea = view.screen
    view.stage.on('pointerdown', onStageDown)
    view.stage.on('pointermove', onStageMove)
    view.stage.on('pointerup', finishPointer)
    view.stage.on('pointerupoutside', finishPointer)
    host.value.addEventListener('wheel', onWheel, { passive: false })
    rebuildSimulation()
    fit()
    view.ticker.add(frame)
    host.value.dataset.graphState = 'ready'
  } catch (error) {
    failure.value = error instanceof Error ? error.message : String(error)
    if (host.value) host.value.dataset.graphState = failure.value
  } finally {
    starting = false
  }
}

function graphSignature(graph: GraphNeighborhood) {
  const nodes = graph.nodes.map((node) => `${node.id}:${node.type}:${node.status ?? ''}:${node.label}:${node.graduationYear ?? ''}`).join('|')
  const edges = graph.edges.map((edge) => `${edge.id}:${edge.source}:${edge.target}:${edge.status}:${edge.relationshipTypeName}`).join('|')
  return `${nodes}#${edges}`
}

function readPalette() {
  const style = getComputedStyle(document.documentElement)
  palette.student = channels(style.getPropertyValue('--accent'), 0xc4a35a)
  palette.group = channels(style.getPropertyValue('--graph-group'), 0x6ea8a0)
  palette.ended = channels(style.getPropertyValue('--graph-ended'), 0x7d7668)
  palette.label = channels(style.getPropertyValue('--ink-100'), 0xe7e1d4)
  palette.fill = channels(style.getPropertyValue('--ink-900'), 0x1f1c17)
  palette.focus = channels(style.getPropertyValue('--ink-50'), 0xf4f1ea)
}

function channels(value: string, fallback: number) {
  const parts = value.trim().split(/\s+/).map(Number)
  const red = parts[0]
  const green = parts[1]
  const blue = parts[2]
  if (red == null || green == null || blue == null) return fallback
  if (!Number.isFinite(red) || !Number.isFinite(green) || !Number.isFinite(blue)) return fallback
  return ((red & 255) << 16) + ((green & 255) << 8) + (blue & 255)
}

function rebuildSimulation() {
  simulation = createGraphSimulation(props.graph, simulation?.nodes ?? [], props.forces)
  simById = new Map(simulation.nodes.map((node) => [node.id, node]))
  fittedOnce = false
  pruneViews()
}

function pruneViews() {
  const liveNodes = new Set(props.graph.nodes.map((node) => node.id))
  for (const [id, view] of nodeViews) {
    if (liveNodes.has(id)) continue
    view.container.destroy({ children: true })
    nodeViews.delete(id)
  }
  const liveEdges = new Set(props.graph.edges.map((edge) => edge.id))
  for (const [id, label] of edgeLabels) {
    if (liveEdges.has(id)) continue
    label.destroy()
    edgeLabels.delete(id)
  }
}

function frame() {
  if (!simulation || !world) return
  if (simulation.alpha() > 0.001 || dragNodeId) simulation.tick()
  if (!userMoved && !fittedOnce && simulation.alpha() < 0.45) {
    fit()
    fittedOnce = true
  }
  draw()
}

function draw() {
  if (!edgesLayer || !nodeLayer || !labelLayer) return
  const focus = hoverNodeId ?? props.selectedNodeId
  const neighbors = focus ? neighborhood(focus) : null
  const query = props.highlightQuery.trim().toLowerCase()
  const offsets = parallelOffsets(props.graph.edges)
  const names = labelAlpha(scale)
  const edgeNames = edgeLabelAlpha(scale)
  edgesLayer.clear()

  for (const node of props.graph.nodes) {
    const sim = simById.get(node.id)
    if (!sim || sim.x == null || sim.y == null) continue
    const view = viewFor(node)
    const matched = Boolean(query && node.label.toLowerCase().includes(query))
    const dimmed = neighbors ? !neighbors.has(node.id) : false
    let alpha = dimmed ? (matched ? 0.55 : 0.2) : 1
    if (node.status === 'archived' && node.id !== focus) alpha *= 0.5
    view.container.position.set(sim.x, sim.y)
    view.container.alpha = alpha
    view.container.hitArea = new Circle(0, 0, sim.radius + 8)
    const stroke = node.type === 'group' ? palette.group : palette.student
    const active = node.id === focus || matched
    view.shape.clear()
    if (node.type === 'group') view.shape.roundRect(-sim.radius, -sim.radius, sim.radius * 2, sim.radius * 2, 3)
    else view.shape.circle(0, 0, sim.radius)
    view.shape.fill({ color: palette.fill })
    view.shape.stroke({ width: (active ? 2.5 : 1.25) / scale, color: active ? palette.focus : stroke })
    const showYear = node.type === 'student' && node.graduationYear != null && scale >= 0.9
    const text = showYear ? `${node.label}\n${node.graduationYear}` : node.label
    if (view.caption.text !== text) view.caption.text = text
    view.caption.style.fill = palette.label
    view.caption.alpha = node.id === focus ? 1 : names
    view.caption.y = sim.radius + 6 / scale
  }

  for (const edge of props.graph.edges) {
    const source = simById.get(edge.source)
    const target = simById.get(edge.target)
    if (!source || !target || source.x == null || source.y == null || target.x == null || target.y == null) continue
    const incident = !focus || edge.source === focus || edge.target === focus
    const hot = edge.id === hoverEdgeId || edge.id === props.selectedEdgeId
    const arrow = 11 / scale
    const segment = edgeSegment(
      { x: source.x, y: source.y },
      { x: target.x, y: target.y },
      source.radius,
      target.radius,
      offsets.get(edge.id) ?? 0,
      arrow
    )
    const label = labelFor(edge)
    if (!segment) {
      label.visible = false
      continue
    }
    const color = edge.status === 'ended' ? palette.ended : palette.student
    const alpha = (incident ? 0.95 : 0.12) * (edge.status === 'ended' ? 0.85 : 1)
    const width = (hot ? 2.6 : 1.35) / scale
    if (edge.status === 'ended') dash(edgesLayer, segment, width, color, alpha)
    else {
      edgesLayer.moveTo(segment.x1, segment.y1)
      edgesLayer.lineTo(segment.x2, segment.y2)
      edgesLayer.stroke({ width, color, alpha, cap: 'round' })
    }
    arrowHead(edgesLayer, segment, arrow, color, Math.min(1, alpha + (hot ? 0.15 : 0)))
    label.visible = hot || edgeNames > 0.04
    label.alpha = hot ? 1 : edgeNames * (incident ? 1 : 0.3)
    label.position.set((segment.x1 + segment.x2) / 2, (segment.y1 + segment.y2) / 2)
    label.style.fill = palette.label
    if (label.text !== edge.relationshipTypeName) label.text = edge.relationshipTypeName
  }
}

function viewFor(node: GraphNode) {
  const existing = nodeViews.get(node.id)
  if (existing) return existing
  const shape = new Graphics()
  const caption = new Text({
    text: node.label,
    style: {
      fontFamily: 'IBM Plex Sans, sans-serif',
      fontSize: 13,
      fill: palette.label,
      align: 'center'
    }
  })
  caption.anchor.set(0.5, 0)
  caption.eventMode = 'none'
  const container = new Container()
  container.eventMode = 'static'
  container.cursor = 'pointer'
  container.addChild(shape, caption)
  container.on('pointerdown', (event: FederatedPointerEvent) => {
    event.stopPropagation()
    const sim = simById.get(node.id)
    if (!sim || sim.x == null || sim.y == null) return
    dragNodeId = node.id
    dragMoved = false
    dragOriginX = event.global.x
    dragOriginY = event.global.y
    simulation?.pin(node.id, sim.x, sim.y)
    simulation?.setAlphaTarget(0.3)
    simulation?.reheat(0.3)
    userMoved = true
  })
  container.on('pointerup', (event: FederatedPointerEvent) => {
    event.stopPropagation()
    finishPointer()
  })
  container.on('pointerupoutside', (event: FederatedPointerEvent) => {
    event.stopPropagation()
    finishPointer()
  })
  container.on('pointerover', () => {
    hoverNodeId = node.id
    hoverEdgeId = null
  })
  container.on('pointerout', () => {
    if (hoverNodeId === node.id) hoverNodeId = null
  })
  nodeLayer?.addChild(container)
  const view = { container, shape, caption }
  nodeViews.set(node.id, view)
  return view
}

function labelFor(edge: GraphEdge) {
  const existing = edgeLabels.get(edge.id)
  if (existing) return existing
  const caption = new Text({
    text: edge.relationshipTypeName,
    style: {
      fontFamily: 'IBM Plex Sans, sans-serif',
      fontSize: 11,
      fill: palette.label,
      align: 'center'
    }
  })
  caption.anchor.set(0.5, 0.5)
  caption.eventMode = 'none'
  labelLayer?.addChild(caption)
  edgeLabels.set(edge.id, caption)
  return caption
}

function neighborhood(id: string) {
  const ids = new Set<string>([id])
  for (const edge of props.graph.edges) {
    if (edge.source === id) ids.add(edge.target)
    if (edge.target === id) ids.add(edge.source)
  }
  return ids
}

function onStageDown(event: FederatedPointerEvent) {
  if (dragNodeId || !world) return
  panning = true
  panMoved = false
  panStartX = event.global.x
  panStartY = event.global.y
  panWorldX = world.position.x
  panWorldY = world.position.y
}

function onStageMove(event: FederatedPointerEvent) {
  if (!world) return
  if (dragNodeId && simulation) {
    const local = event.getLocalPosition(world)
    if ((event.global.x - dragOriginX) ** 2 + (event.global.y - dragOriginY) ** 2 > 25) dragMoved = true
    simulation.pin(dragNodeId, local.x, local.y)
    return
  }
  if (panning) {
    const dx = event.global.x - panStartX
    const dy = event.global.y - panStartY
    if (dx * dx + dy * dy > 25) panMoved = true
    world.position.set(panWorldX + dx, panWorldY + dy)
    userMoved = true
    return
  }
  hoverEdgeId = event.target === app?.stage ? edgeAt(event) : null
}

function finishPointer() {
  if (dragNodeId) {
    const id = dragNodeId
    dragNodeId = null
    simulation?.unpin(id)
    simulation?.setAlphaTarget(0)
    if (!dragMoved) {
      const node = props.graph.nodes.find((item) => item.id === id)
      if (node) emit('selectNode', node)
    }
    return
  }
  if (!panning) return
  panning = false
  if (!panMoved && hoverEdgeId) {
    const edge = props.graph.edges.find((item) => item.id === hoverEdgeId)
    if (edge) emit('selectEdge', edge)
  }
}

function edgeAt(event: FederatedPointerEvent) {
  if (!world) return null
  const local = event.getLocalPosition(world)
  const offsets = parallelOffsets(props.graph.edges)
  const limit = (10 / scale) ** 2
  let best: string | null = null
  let bestDistance = limit
  for (const edge of props.graph.edges) {
    const source = simById.get(edge.source)
    const target = simById.get(edge.target)
    if (!source || !target || source.x == null || source.y == null || target.x == null || target.y == null) continue
    const segment = edgeSegment(
      { x: source.x, y: source.y },
      { x: target.x, y: target.y },
      source.radius,
      target.radius,
      offsets.get(edge.id) ?? 0,
      11 / scale
    )
    if (!segment) continue
    const distance = pointSegmentDistance(local.x, local.y, segment.x1, segment.y1, segment.x2, segment.y2)
    if (distance < bestDistance) {
      bestDistance = distance
      best = edge.id
    }
  }
  return best
}

function onWheel(event: WheelEvent) {
  if (!world || !host.value) return
  event.preventDefault()
  const rect = host.value.getBoundingClientRect()
  const px = event.clientX - rect.left
  const py = event.clientY - rect.top
  const next = Math.min(6, Math.max(0.15, scale * Math.exp(-event.deltaY * 0.0012)))
  const wx = (px - world.position.x) / scale
  const wy = (py - world.position.y) / scale
  scale = next
  world.scale.set(scale)
  world.position.set(px - wx * scale, py - wy * scale)
  userMoved = true
}

function fit() {
  if (!world || !host.value || !simulation) return
  const nodes = simulation.nodes.filter((node) => node.x != null && node.y != null)
  if (!nodes.length) return
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const node of nodes) {
    const x = node.x as number
    const y = node.y as number
    const pad = node.radius + 36
    minX = Math.min(minX, x - pad)
    minY = Math.min(minY, y - pad)
    maxX = Math.max(maxX, x + pad)
    maxY = Math.max(maxY, y + pad)
  }
  const width = Math.max(maxX - minX, 1)
  const height = Math.max(maxY - minY, 1)
  const viewWidth = host.value.clientWidth || 1
  const viewHeight = host.value.clientHeight || 1
  scale = Math.min(2.2, Math.max(0.2, Math.min(viewWidth / width, viewHeight / height)))
  world.scale.set(scale)
  world.position.set(
    viewWidth / 2 - ((minX + maxX) / 2) * scale,
    viewHeight / 2 - ((minY + maxY) / 2) * scale
  )
}

defineExpose({ fit })

function dash(
  graphics: Graphics,
  segment: { x1: number, y1: number, x2: number, y2: number },
  width: number,
  color: number,
  alpha: number
) {
  const dx = segment.x2 - segment.x1
  const dy = segment.y2 - segment.y1
  const length = Math.hypot(dx, dy)
  if (!length) return
  const ux = dx / length
  const uy = dy / length
  const dashLength = 7 / scale
  const gapLength = 5 / scale
  let traveled = 0
  let drawing = true
  while (traveled < length) {
    const span = Math.min(drawing ? dashLength : gapLength, length - traveled)
    if (drawing) {
      graphics.moveTo(segment.x1 + ux * traveled, segment.y1 + uy * traveled)
      graphics.lineTo(segment.x1 + ux * (traveled + span), segment.y1 + uy * (traveled + span))
      graphics.stroke({ width, color, alpha, cap: 'butt' })
    }
    traveled += span
    drawing = !drawing
  }
}

function arrowHead(
  graphics: Graphics,
  segment: { x2: number, y2: number, ux: number, uy: number },
  size: number,
  color: number,
  alpha: number
) {
  const x = segment.x2 + segment.ux * size
  const y = segment.y2 + segment.uy * size
  const nx = -segment.uy
  const ny = segment.ux
  const baseX = x - segment.ux * size
  const baseY = y - segment.uy * size
  graphics.moveTo(x, y)
  graphics.lineTo(baseX + nx * size * 0.42, baseY + ny * size * 0.42)
  graphics.lineTo(baseX - nx * size * 0.42, baseY - ny * size * 0.42)
  graphics.closePath()
  graphics.fill({ color, alpha })
}

function pointSegmentDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1
  const dy = y2 - y1
  const length = dx * dx + dy * dy
  const t = length === 0 ? 0 : Math.min(1, Math.max(0, ((px - x1) * dx + (py - y1) * dy) / length))
  const qx = x1 + t * dx
  const qy = y1 + t * dy
  return (px - qx) ** 2 + (py - qy) ** 2
}
</script>
