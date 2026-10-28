import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationNodeDatum
} from 'd3-force'
import type { GraphNeighborhood } from '../types'
import {
  defaultForceSettings,
  degrees,
  linkForceStrength,
  nodeRadius,
  repelCharge,
  type ForceSettings
} from './model'

export interface SimNode extends SimulationNodeDatum {
  id: string
  degree: number
  radius: number
}

export interface SimLink {
  id: string
  source: SimNode
  target: SimNode
}

export interface GraphSimulation {
  nodes: SimNode[]
  links: SimLink[]
  tick(): void
  alpha(): number
  reheat(alpha?: number): void
  setAlphaTarget(target: number): void
  pin(id: string, x: number, y: number): void
  unpin(id: string): void
  setForces(settings: ForceSettings): void
}

export function createGraphSimulation(
  graph: GraphNeighborhood,
  previous: Iterable<SimNode>,
  settings: ForceSettings = defaultForceSettings
): GraphSimulation {
  const prior = new Map<string, SimNode>()
  for (const node of previous) prior.set(node.id, node)

  const degree = degrees(graph.edges)
  const nodes: SimNode[] = graph.nodes.map((node, index) => {
    const kept = prior.get(node.id)
    const placed = place(node.id, index, graph.nodes.length, kept)
    return {
      id: node.id,
      degree: degree.get(node.id) ?? 0,
      radius: nodeRadius(degree.get(node.id) ?? 0),
      x: placed.x,
      y: placed.y,
      vx: kept?.vx ?? 0,
      vy: kept?.vy ?? 0,
      fx: kept?.fx,
      fy: kept?.fy
    }
  })
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const links: SimLink[] = []
  for (const edge of graph.edges) {
    const source = byId.get(edge.source)
    const target = byId.get(edge.target)
    if (!source || !target || source === target) continue
    links.push({ id: edge.id, source, target })
  }
  placeNewcomers(nodes, links, prior)

  const charge = forceManyBody<SimNode>().theta(0.9).distanceMin(30)
  const springs = forceLink<SimNode, SimLink>(links).distance(settings.linkDistance)
  const centerX = forceX<SimNode>(0)
  const centerY = forceY<SimNode>(0)
  const collide = forceCollide<SimNode>().radius(60).strength(0.5).iterations(1)
  const simulation = forceSimulation(nodes)
    .force('charge', charge)
    .force('link', springs)
    .force('centerX', centerX)
    .force('centerY', centerY)
    .force('collide', collide)
    .velocityDecay(0.6)
    .stop()

  apply(settings)
  simulation.alpha(1)

  function apply(next: ForceSettings) {
    charge.strength(repelCharge(next.repelStrength))
    springs.distance(next.linkDistance).strength((link) => {
      const source = link.source as SimNode
      const target = link.target as SimNode
      return linkForceStrength(next.linkStrength, source.degree, target.degree)
    })
    centerX.strength(next.centerStrength)
    centerY.strength(next.centerStrength)
  }

  return {
    nodes,
    links,
    tick() {
      simulation.tick()
    },
    alpha: () => simulation.alpha(),
    reheat(alpha = 0.3) {
      if (simulation.alpha() < alpha) simulation.alpha(alpha)
    },
    setAlphaTarget(target: number) {
      simulation.alphaTarget(target)
    },
    pin(id, x, y) {
      const node = byId.get(id)
      if (!node) return
      node.fx = x
      node.fy = y
    },
    unpin(id) {
      const node = byId.get(id)
      if (!node) return
      node.fx = null
      node.fy = null
    },
    setForces(next) {
      apply(next)
      if (simulation.alpha() < 0.3) simulation.alpha(0.3)
    }
  }
}

function placeNewcomers(nodes: SimNode[], links: SimLink[], prior: Map<string, SimNode>) {
  if (!prior.size) return
  const fresh = new Set(nodes.filter((node) => !prior.has(node.id)).map((node) => node.id))
  if (!fresh.size) return
  for (const node of nodes) {
    if (!fresh.has(node.id)) continue
    let sx = 0
    let sy = 0
    let count = 0
    for (const link of links) {
      const other = link.source === node ? link.target : link.target === node ? link.source : null
      if (!other || fresh.has(other.id) || other.x == null || other.y == null) continue
      sx += other.x
      sy += other.y
      count += 1
    }
    if (!count) continue
    node.x = sx / count + (hash(node.id) - 0.5) * 48
    node.y = sy / count + (hash(`${node.id}:y`) - 0.5) * 48
  }
}

function place(id: string, index: number, total: number, kept: SimNode | undefined) {
  if (kept && Number.isFinite(kept.x) && Number.isFinite(kept.y)) {
    return { x: kept.x as number, y: kept.y as number }
  }
  const count = Math.max(total, 1)
  const angle = (index / count) * Math.PI * 2 + hash(id)
  const radius = 80 + Math.sqrt(count) * 36
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
}

function hash(id: string) {
  let value = 0
  for (let i = 0; i < id.length; i += 1) value = (value * 31 + id.charCodeAt(i)) % 1000
  return value / 1000
}
