// Snapping for the preview's drawing mode (Phase 5b; MUT areas in 5c lean on it). Pure functions, no UI.
//
// Everything here is in the visual frame (as the drawing reads: x right, y up), so "horizontal" is horizontal on the
// sheet in every orientation. snapGeometry turns the drawing's real lines, rectangles, circles and arcs into that
// frame; findSnap finds the best snap near the cursor:
//   endpoint > intersection > center > perpendicular (needs `from`) > align (same x or y as a given point) > on (the
//   nearest point on a line or circle). Within the tolerance, a higher kind wins; between equals, the nearer.
// Shift = free (no snap). Ctrl = ortho: the point is held to the horizontal or vertical line through `from`, and only
// snaps on that line count.

import type { Drawing } from './drawing.ts'
import type { Pt } from './leaders.ts'
import { toVisual } from './transform.ts'

export type SnapKind = 'endpoint' | 'intersection' | 'center' | 'perpendicular' | 'align' | 'on'

export interface SnapCircle {
  c: Pt
  r: number
  /** Drawn part, degrees counter-clockwise from a0 to a1 (as the drawing reads); null = the whole circle. */
  arc: [number, number] | null
}

export interface SnapGeom {
  segs: [Pt, Pt][]
  circles: SnapCircle[]
}

export interface SnapOptions {
  /** Shift: no snapping, the cursor as it is. */
  free?: boolean
  /** Ctrl: held to the horizontal or vertical line through `from` (needs `from`). */
  ortho?: boolean
  /** Where the move started (perpendicular and ortho measure from it). */
  from?: Pt
  /** Points to line up with (same x or same y), e.g. other labels' centers. */
  align?: readonly Pt[]
  /** Only these kinds (default: all). */
  kinds?: readonly SnapKind[]
}

export interface Snap {
  pt: Pt
  /** What was snapped to; 'free' with Shift, null when nothing was near (the cursor, held to ortho if on). */
  kind: SnapKind | 'free' | null
  /** align: the point lined up with; perpendicular: the line's foot is pt itself. */
  ref?: Pt
}

const PRIORITY: SnapKind[] = ['endpoint', 'intersection', 'center', 'perpendicular', 'align', 'on']
const ALL = new Set<SnapKind>(PRIORITY)
/** Layers left out: hatch lines would put a snap everywhere; text and photos have no lines. */
const SKIP_LAYER = /HATCH/

/** The drawing's lines, rectangles, circles and arcs as the drawing reads (items whose key is in `skip` left out). */
export function snapGeometry(d: Drawing, skip: ReadonlySet<string> = new Set()): SnapGeom {
  const o = d.orientation
  const v = (x: number, y: number): Pt => toVisual(o, x, y)
  const turn = o === 'Vertical' ? 0 : o === 'Horizontal CCW' ? 90 : -90
  const segs: [Pt, Pt][] = []
  const circles: SnapCircle[] = []
  for (const it of d.items) {
    if (skip.has(it.key)) continue
    for (const s of it.shapes) {
      if (SKIP_LAYER.test(s.layer)) continue
      if (s.t === 'line') segs.push([v(s.x1, s.y1), v(s.x2, s.y2)])
      else if (s.t === 'rect') {
        const c = [v(s.x, s.y), v(s.x + s.w, s.y), v(s.x + s.w, s.y + s.h), v(s.x, s.y + s.h)]
        for (let i = 0; i < 4; i++) segs.push([c[i], c[(i + 1) % 4]])
      } else if (s.t === 'circle') circles.push({ c: v(s.cx, s.cy), r: s.r, arc: null })
      else if (s.t === 'arc') circles.push({ c: v(s.cx, s.cy), r: s.r, arc: [s.a0 + turn, s.a1 + turn] })
      else if (s.t === 'poly' && !s.fill) for (let i = 1; i < s.pts.length; i++) segs.push([v(...s.pts[i - 1]), v(...s.pts[i])])
    }
  }
  return { segs, circles }
}

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])

/** Nearest point on the segment a-b to q. */
export function nearestOnSegment(a: Pt, b: Pt, q: Pt): Pt {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / len2)) : 0
  return [a[0] + t * dx, a[1] + t * dy]
}

/** Is the angle (degrees) on the drawn part of the circle? */
function onArc(c: SnapCircle, deg: number): boolean {
  if (!c.arc) return true
  const t = (((deg - c.arc[0]) % 360) + 360) % 360
  return t <= c.arc[1] - c.arc[0] + 1e-9
}
const angleOf = (c: SnapCircle, q: Pt) => (Math.atan2(q[1] - c.c[1], q[0] - c.c[0]) * 180) / Math.PI
const atAngle = (c: SnapCircle, deg: number): Pt => [c.c[0] + c.r * Math.cos((deg * Math.PI) / 180), c.c[1] + c.r * Math.sin((deg * Math.PI) / 180)]

/** Nearest point on the circle (or its drawn arc) to q. */
export function nearestOnCircle(c: SnapCircle, q: Pt): Pt {
  const a = dist(c.c, q) > 1e-12 ? angleOf(c, q) : 0
  if (onArc(c, a)) return atAngle(c, a)
  const ends = [atAngle(c, c.arc![0]), atAngle(c, c.arc![1])]
  return dist(ends[0], q) <= dist(ends[1], q) ? ends[0] : ends[1]
}

/** Where two segments cross (ends included), or null. */
export function segmentIntersection(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const r: Pt = [b[0] - a[0], b[1] - a[1]]
  const s: Pt = [d[0] - c[0], d[1] - c[1]]
  const den = r[0] * s[1] - r[1] * s[0]
  if (Math.abs(den) < 1e-12) return null
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den
  const e = 1e-9
  return t >= -e && t <= 1 + e && u >= -e && u <= 1 + e ? [a[0] + t * r[0], a[1] + t * r[1]] : null
}

/** Where a segment meets a circle (on its drawn part). */
export function segmentCircle(a: Pt, b: Pt, c: SnapCircle): Pt[] {
  const d: Pt = [b[0] - a[0], b[1] - a[1]]
  const f: Pt = [a[0] - c.c[0], a[1] - c.c[1]]
  const A = d[0] * d[0] + d[1] * d[1]
  const B = 2 * (f[0] * d[0] + f[1] * d[1])
  const C = f[0] * f[0] + f[1] * f[1] - c.r * c.r
  const disc = B * B - 4 * A * C
  if (A < 1e-12 || disc < 0) return []
  const sq = Math.sqrt(disc)
  return [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]
    .filter((t) => t >= -1e-9 && t <= 1 + 1e-9)
    .map((t): Pt => [a[0] + t * d[0], a[1] + t * d[1]])
    .filter((q) => onArc(c, angleOf(c, q)))
}

/** Where two circles meet (on their drawn parts). */
export function circleCircle(p: SnapCircle, q: SnapCircle): Pt[] {
  const d = dist(p.c, q.c)
  if (d < 1e-12 || d > p.r + q.r || d < Math.abs(p.r - q.r)) return []
  const a = (p.r * p.r - q.r * q.r + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, p.r * p.r - a * a))
  const m: Pt = [p.c[0] + (a * (q.c[0] - p.c[0])) / d, p.c[1] + (a * (q.c[1] - p.c[1])) / d]
  const ox = (h * (q.c[1] - p.c[1])) / d
  const oy = (h * (q.c[0] - p.c[0])) / d
  return [[m[0] + ox, m[1] - oy] as Pt, [m[0] - ox, m[1] + oy] as Pt].filter((x) => onArc(p, angleOf(p, x)) && onArc(q, angleOf(q, x)))
}

/** The cursor held to the horizontal or vertical line through `from` (whichever is nearer). */
export function orthoPoint(from: Pt, q: Pt): Pt {
  return Math.abs(q[0] - from[0]) >= Math.abs(q[1] - from[1]) ? [q[0], from[1]] : [from[0], q[1]]
}

/** The best snap near `cursor` within `tol` (drawing units; the UI passes a few screen pixels' worth). */
export function findSnap(g: SnapGeom, cursor: Pt, tol: number, opt: SnapOptions = {}): Snap {
  if (opt.free) return { pt: cursor, kind: 'free' }
  const kinds = opt.kinds ? new Set(opt.kinds) : ALL
  const ortho = opt.ortho && opt.from ? opt.from : null
  const q = ortho ? orthoPoint(ortho, cursor) : cursor
  /** With ortho, only points on the held line count. */
  const onLine = (x: Pt) => !ortho || Math.abs(x[0] - ortho[0]) < 1e-6 || Math.abs(x[1] - ortho[1]) < 1e-6
  const horizontal = ortho ? Math.abs(q[1] - ortho[1]) < 1e-12 : false

  const near = {
    segs: g.segs.filter(([a, b]) => dist(nearestOnSegment(a, b, q), q) <= tol),
    circles: g.circles.filter((c) => dist(nearestOnCircle(c, q), q) <= tol || dist(c.c, q) <= tol),
  }
  const found: { pt: Pt; kind: SnapKind; ref?: Pt }[] = []
  const add = (kind: SnapKind, pt: Pt, ref?: Pt) => {
    if (kinds.has(kind) && dist(pt, q) <= tol && onLine(pt)) found.push({ pt, kind, ...(ref ? { ref } : {}) })
  }
  for (const [a, b] of near.segs) {
    add('endpoint', a)
    add('endpoint', b)
  }
  for (const c of near.circles) {
    if (c.arc) {
      add('endpoint', atAngle(c, c.arc[0]))
      add('endpoint', atAngle(c, c.arc[1]))
    }
    add('center', c.c)
  }
  if (kinds.has('intersection')) {
    for (let i = 0; i < near.segs.length; i++) {
      for (let j = i + 1; j < near.segs.length; j++) {
        const x = segmentIntersection(...near.segs[i], ...near.segs[j])
        if (x) add('intersection', x)
      }
      for (const c of near.circles) for (const x of segmentCircle(...near.segs[i], c)) add('intersection', x)
    }
    for (let i = 0; i < near.circles.length; i++) for (let j = i + 1; j < near.circles.length; j++) for (const x of circleCircle(near.circles[i], near.circles[j])) add('intersection', x)
  }
  if (opt.from && kinds.has('perpendicular')) {
    const f = opt.from
    for (const [a, b] of near.segs) {
      // Only a true foot: inside the segment, not past an end.
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const len2 = dx * dx + dy * dy
      const t = len2 > 0 ? ((f[0] - a[0]) * dx + (f[1] - a[1]) * dy) / len2 : -1
      if (t >= 0 && t <= 1) add('perpendicular', [a[0] + t * dx, a[1] + t * dy])
    }
    for (const c of near.circles) if (dist(c.c, f) > 1e-12) for (const x of [nearestOnCircle(c, f), atAngle(c, angleOf(c, f) + 180)]) if (onArc(c, angleOf(c, x))) add('perpendicular', x)
  }
  if (opt.align && kinds.has('align')) {
    let best: { pt: Pt; ref: Pt; d: number } | null = null
    for (const a of opt.align) {
      // Ortho already holds one axis; align only along the free one.
      if ((!ortho || horizontal) && Math.abs(a[0] - q[0]) <= tol && (!best || Math.abs(a[0] - q[0]) < best.d)) best = { pt: [a[0], q[1]], ref: a, d: Math.abs(a[0] - q[0]) }
      if ((!ortho || !horizontal) && Math.abs(a[1] - q[1]) <= tol && (!best || Math.abs(a[1] - q[1]) < best.d)) best = { pt: [q[0], a[1]], ref: a, d: Math.abs(a[1] - q[1]) }
    }
    if (best) add('align', best.pt, best.ref)
  }
  if (kinds.has('on')) {
    if (ortho) {
      // Where the held line meets the nearby lines and circles.
      const far = tol * 2
      const line: [Pt, Pt] = horizontal ? [[q[0] - far, q[1]], [q[0] + far, q[1]]] : [[q[0], q[1] - far], [q[0], q[1] + far]]
      for (const [a, b] of near.segs) {
        const x = segmentIntersection(line[0], line[1], a, b)
        if (x) add('on', x)
      }
      for (const c of near.circles) for (const x of segmentCircle(line[0], line[1], c)) add('on', x)
    } else {
      for (const [a, b] of near.segs) add('on', nearestOnSegment(a, b, q))
      for (const c of near.circles) add('on', nearestOnCircle(c, q))
    }
  }
  if (found.length === 0) return { pt: q, kind: null }
  found.sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind) || dist(a.pt, q) - dist(b.pt, q))
  const best = found[0]
  return { pt: best.pt, kind: best.kind, ...(best.ref ? { ref: best.ref } : {}) }
}
