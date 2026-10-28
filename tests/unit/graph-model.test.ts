import { describe, expect, it } from 'vitest'
import type { GraphNeighborhood } from '../../lib/types'
import {
  defaultForceSettings,
  degrees,
  edgeSegment,
  linkForceStrength,
  nodeRadius,
  parallelOffsets,
  repelCharge,
  sliderToStrength,
  strengthToSlider
} from '../../lib/graph/model'
import { createGraphSimulation } from '../../lib/graph/simulation'

describe('directory graph forces', () => {
  it('maps the repel slider through a cube and keeps the center slider invertible', () => {
    expect(repelCharge(10)).toBe(-1000)
    expect(repelCharge(0)).toBe(-0)
    const slider = strengthToSlider(0.1)
    expect(sliderToStrength(slider)).toBeCloseTo(0.1, 5)
    expect(sliderToStrength(0)).toBe(0)
    expect(sliderToStrength(1)).toBeCloseTo(1, 5)
  })

  it('weakens a link when either endpoint has many relationships', () => {
    expect(linkForceStrength(1, 1, 1)).toBe(1)
    expect(linkForceStrength(1, 4, 10)).toBeCloseTo(0.25)
    expect(linkForceStrength(1, 0, 3)).toBe(1)
  })

  it('sizes a node from its degree and caps it', () => {
    expect(nodeRadius(0)).toBe(8)
    expect(nodeRadius(99)).toBe(30)
    expect(degrees([
      { source: 'student:a', target: 'student:b' },
      { source: 'student:a', target: 'group:c' }
    ]).get('student:a')).toBe(2)
  })

  it('splits parallel relationships and reciprocal directions onto opposite sides', () => {
    const single = parallelOffsets([{ id: 'one', source: 'a', target: 'b' }])
    expect(single.get('one')).toBe(0)

    const parallel = parallelOffsets([
      { id: 'p1', source: 'a', target: 'b' },
      { id: 'p2', source: 'a', target: 'b' }
    ])
    expect(parallel.get('p1')).toBeCloseTo(-7)
    expect(parallel.get('p2')).toBeCloseTo(7)

    const mutual = parallelOffsets([
      { id: 'ab', source: 'a', target: 'b' },
      { id: 'ba', source: 'b', target: 'a' }
    ])
    expect((mutual.get('ab') ?? 0) * (mutual.get('ba') ?? 0)).toBeLessThan(0)
  })

  it('stops a directed segment at the node rims', () => {
    const segment = edgeSegment({ x: 0, y: 0 }, { x: 100, y: 0 }, 10, 10, 0, 8)
    expect(segment).not.toBeNull()
    expect(segment?.x1).toBeCloseTo(10)
    expect(segment?.x2).toBeCloseTo(82)
    expect(edgeSegment({ x: 0, y: 0 }, { x: 12, y: 0 }, 10, 10, 0, 8)).toBeNull()
  })

  it('settles a small relationship neighborhood away from a single point', () => {
    const graph: GraphNeighborhood = {
      nodes: [
        { id: 'student:a', type: 'student', label: 'A' },
        { id: 'student:b', type: 'student', label: 'B' },
        { id: 'group:c', type: 'group', label: 'C' }
      ],
      edges: [
        { id: 'ab', source: 'student:a', target: 'student:b', relationshipTypeId: 't', relationshipTypeName: 'knows', status: 'active', directed: true },
        { id: 'ac', source: 'student:a', target: 'group:c', relationshipTypeId: 't', relationshipTypeName: 'advises', status: 'ended', directed: true }
      ]
    }
    const simulation = createGraphSimulation(graph, [], defaultForceSettings)
    for (let step = 0; step < 120; step += 1) simulation.tick()
    const [a, b, c] = simulation.nodes
    expect(Number.isFinite(a.x)).toBe(true)
    expect(Number.isFinite(b.y)).toBe(true)
    const spread = Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0))
      + Math.hypot((a.x ?? 0) - (c.x ?? 0), (a.y ?? 0) - (c.y ?? 0))
    expect(spread).toBeGreaterThan(40)
    expect(simulation.alpha()).toBeLessThan(0.2)
  })
})
