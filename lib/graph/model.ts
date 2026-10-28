/** Force-directed graph math adapted from a d3-force layout to this directory.
 * Nodes are students and groups. Edges are directed relationships, and the same
 * ordered pair can carry more than one relationship.
 */

export interface ForceSettings {
  centerStrength: number
  /** Slider value 0–20. The charge sent to the simulation is the negative cube. */
  repelStrength: number
  linkStrength: number
  linkDistance: number
}

export const defaultForceSettings: ForceSettings = {
  centerStrength: 0.1,
  repelStrength: 10,
  linkStrength: 1,
  linkDistance: 250
}

const sliderFloor = 0.01

export function sliderToStrength(slider: number, floor = sliderFloor) {
  const clamped = Math.min(1, Math.max(0, slider))
  return (Math.pow(floor, 1 - clamped) - floor) / (1 - floor)
}

export function strengthToSlider(strength: number, floor = sliderFloor) {
  const safe = Math.min(1, Math.max(floor, strength))
  return 1 - Math.log(safe * (1 - floor) + floor) / Math.log(floor)
}

export function repelCharge(repelStrength: number) {
  return -(repelStrength ** 3)
}

export function nodeRadius(degree: number, multiplier = 1) {
  return multiplier * Math.max(8, Math.min(3 * Math.sqrt(Math.max(0, degree) + 1), 30))
}

export function linkForceStrength(linkStrength: number, sourceDegree: number, targetDegree: number) {
  const source = Math.max(1, sourceDegree)
  const target = Math.max(1, targetDegree)
  return linkStrength / Math.min(source, target)
}

export function degrees(edges: Array<{ source: string, target: string }>) {
  const counts = new Map<string, number>()
  for (const edge of edges) {
    counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1)
    counts.set(edge.target, (counts.get(edge.target) ?? 0) + 1)
  }
  return counts
}

const lane = 14

/** Perpendicular offsets so parallel and reciprocal relationships stay readable. */
export function parallelOffsets(edges: Array<{ id: string, source: string, target: string }>) {
  const grouped = new Map<string, string[]>()
  for (const edge of edges) {
    const key = `${edge.source}\0${edge.target}`
    const bucket = grouped.get(key)
    if (bucket) bucket.push(edge.id)
    else grouped.set(key, [edge.id])
  }
  const offsets = new Map<string, number>()
  for (const [key, ids] of grouped) {
    const separator = key.indexOf('\0')
    const source = key.slice(0, separator)
    const target = key.slice(separator + 1)
    const reverse = grouped.has(`${target}\0${source}`)
    const side = reverse ? (source < target ? 1 : -1) : 0
    const bundleShift = side === 0 ? 0 : side * lane * (0.75 + (ids.length - 1) / 2)
    ids.forEach((id, index) => {
      const centered = index - (ids.length - 1) / 2
      offsets.set(id, bundleShift + centered * lane)
    })
  }
  return offsets
}

export interface Segment {
  x1: number
  y1: number
  x2: number
  y2: number
  ux: number
  uy: number
}

/** Directed segment that stops at the node rims, shifted for parallel edges. */
export function edgeSegment(
  source: { x: number, y: number },
  target: { x: number, y: number },
  sourceRadius: number,
  targetRadius: number,
  offset: number,
  arrowClearance: number
): Segment | null {
  const dx = target.x - source.x
  const dy = target.y - source.y
  const length = Math.hypot(dx, dy)
  if (length < sourceRadius + targetRadius + arrowClearance + 4) return null
  const ux = dx / length
  const uy = dy / length
  const ox = -uy * offset
  const oy = ux * offset
  return {
    x1: source.x + ox + ux * sourceRadius,
    y1: source.y + oy + uy * sourceRadius,
    x2: target.x + ox - ux * (targetRadius + arrowClearance),
    y2: target.y + oy - uy * (targetRadius + arrowClearance),
    ux,
    uy
  }
}

export function labelAlpha(scale: number) {
  return Math.min(1, Math.max(0, Math.log(scale) / Math.log(2) + 1.6))
}

export function edgeLabelAlpha(scale: number) {
  return Math.min(1, Math.max(0, Math.log(scale) / Math.log(2) + 0.4))
}
