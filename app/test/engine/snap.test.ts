// Snap engine (engine/snap.ts): each kind, priorities, Shift = free, Ctrl = ortho, and the geometry read from a drawing.
import { describe, expect, it } from 'vitest'
import { buildDrawing } from '../../src/engine/drawing.ts'
import { circleCircle, findSnap, segmentCircle, snapGeometry, type SnapGeom } from '../../src/engine/snap.ts'
import { toVisual } from '../../src/engine/transform.ts'
// The sample as it was when these tests were written (test/fixtures/olderSample.ts).
import { olderSample as sampleProject } from '../fixtures/olderSample.ts'

// A 100 x 50 box, a diagonal through it and a circle of radius 10 at (50, 25).
const G: SnapGeom = {
  segs: [
    [[0, 0], [100, 0]],
    [[100, 0], [100, 50]],
    [[100, 50], [0, 50]],
    [[0, 50], [0, 0]],
    [[0, 0], [100, 50]],
  ],
  circles: [{ c: [50, 25], r: 10, arc: null }],
}
const near = (a: [number, number], b: [number, number]) => {
  expect(a[0]).toBeCloseTo(b[0], 6)
  expect(a[1]).toBeCloseTo(b[1], 6)
}

describe('snap engine', () => {
  it('endpoint wins over everything else nearby', () => {
    const s = findSnap(G, [99.5, 0.4], 2)
    expect(s.kind).toBe('endpoint')
    near(s.pt, [100, 0])
  })

  it('intersection of two lines and of a line with a circle', () => {
    // The diagonal meets the circle at (50 +- 8.944, 25 +- 4.472).
    const s = findSnap(G, [59, 29.6], 1.5)
    expect(s.kind).toBe('intersection')
    near(s.pt, [50 + 20 / Math.sqrt(5), 25 + 10 / Math.sqrt(5)])
    const t = findSnap({ segs: [[[0, 0], [10, 10]], [[0, 10], [10, 0]]], circles: [] }, [5.4, 4.7], 1)
    expect(t.kind).toBe('intersection')
    near(t.pt, [5, 5])
  })

  it('center of a circle', () => {
    const s = findSnap(G, [50.6, 25.3], 1, { kinds: ['center', 'on'] })
    expect(s.kind).toBe('center')
    near(s.pt, [50, 25])
  })

  it('on a line and on a circle (nearest point)', () => {
    const s = findSnap(G, [30, 49.2], 1)
    expect(s.kind).toBe('on')
    near(s.pt, [30, 50])
    const c = findSnap(G, [50, 35.6], 1, { kinds: ['on'] })
    near(c.pt, [50, 35])
  })

  it('perpendicular from where the move started', () => {
    const s = findSnap(G, [41, 0.8], 2, { from: [40, 30], kinds: ['perpendicular', 'on'] })
    expect(s.kind).toBe('perpendicular')
    near(s.pt, [40, 0])
  })

  it('lines up with other points (same x or y)', () => {
    const s = findSnap({ segs: [], circles: [] }, [30.4, 70], 1, { align: [[30, 10], [80, 90]] })
    expect(s.kind).toBe('align')
    near(s.pt, [30, 70])
    expect(s.ref).toEqual([30, 10])
  })

  it('Shift: free, no snap at all', () => {
    expect(findSnap(G, [99.5, 0.4], 2, { free: true })).toEqual({ pt: [99.5, 0.4], kind: 'free' })
  })

  it('Ctrl: held horizontal or vertical from the start; only snaps on that line', () => {
    const s = findSnap({ segs: [], circles: [] }, [30, 12], 1, { ortho: true, from: [10, 10] })
    expect(s).toEqual({ pt: [30, 10], kind: null })
    const v = findSnap({ segs: [], circles: [] }, [11, 40], 1, { ortho: true, from: [10, 10] })
    expect(v.pt).toEqual([10, 40])
    // Held horizontal at y = 10, the vertical box edge x = 100 is met at (100, 10), even though the cursor is above it.
    const e = findSnap(G, [99.4, 13], 1, { ortho: true, from: [60, 10], kinds: ['on'] })
    expect(e.kind).toBe('on')
    near(e.pt, [100, 10])
  })

  it('nothing near: the cursor as it is', () => {
    expect(findSnap(G, [30, 20], 0.5)).toEqual({ pt: [30, 20], kind: null })
  })

  it('arcs: only the drawn part counts, its ends are endpoints', () => {
    const arc = { c: [0, 0] as [number, number], r: 10, arc: [-90, 90] as [number, number] }
    expect(segmentCircle([-20, 0], [20, 0], arc)).toEqual([[10, 0]])
    expect(circleCircle(arc, { c: [10, 0], r: 10, arc: null }).length).toBe(2)
    const s = findSnap({ segs: [], circles: [arc] }, [0.5, -9.6], 1)
    expect(s.kind).toBe('endpoint')
    near(s.pt, [0, -10])
    expect(findSnap({ segs: [], circles: [arc] }, [-10, 0.2], 0.5).kind).toBe(null)
  })

  it('reads the drawing in the visual frame, hatch left out', () => {
    for (const o of ['Vertical', 'Horizontal CW', 'Horizontal CCW'] as const) {
      const p = sampleProject()
      const d = buildDrawing({ ...p, vessel: { ...p.vessel, orientation: o } })
      const g = snapGeometry(d)
      // The shell outline's corner (logical 0, 0) is an endpoint.
      const corner = toVisual(o, 0, 0)
      const s = findSnap(g, [corner[0] + 0.3, corner[1] + 0.3], 1)
      expect(s.kind).toBe('endpoint')
      near(s.pt, corner)
      // N1 (12 in at X 94, Y 30) is a circle there.
      const c = toVisual(o, 94, 30)
      expect(g.circles.some((x) => Math.hypot(x.c[0] - c[0], x.c[1] - c[1]) < 1e-9 && x.r === 6)).toBe(true)
      const hatch = d.items.flatMap((it) => it.shapes).filter((sh) => sh.t === 'line' && /HATCH/.test(sh.layer))
      expect(hatch.length).toBeGreaterThan(0)
      const key = (a: [number, number], b: [number, number]) => [...a, ...b].map((v) => v.toFixed(6)).join(',')
      const segs = new Set(g.segs.map(([a, b]) => key(a, b)))
      for (const h of hatch) if (h.t === 'line') expect(segs.has(key(toVisual(o, h.x1, h.y1), toVisual(o, h.x2, h.y2)))).toBe(false)
    }
  })
})
