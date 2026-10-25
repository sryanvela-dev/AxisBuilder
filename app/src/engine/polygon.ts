// Plain polygon geometry for MUT areas (Phase 5c): area, clipping to a strip, hatch lines with islands left empty,
// the exact hatched area, the most open spot for a label, and the enclosed space around a point (pick inside).
// Pure functions in one flat 2D frame, no project data. Written here rather than taken from a clipping library: the
// areas are small hand-drawn outlines, and everything needed is scanline arithmetic (even-odd, as CAD's hatch reads
// a boundary) and one face walk, so a few hundred lines cover it with nothing to download or keep up to date.

export type Pt = [number, number]
export type Poly = Pt[]
export type Box = [number, number, number, number]

const EPS = 1e-9

/** Signed area: positive when the points run counter-clockwise. */
export function signedArea(pts: readonly Pt[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % pts.length]
    a += x1 * y2 - x2 * y1
  }
  return a / 2
}

export const polygonArea = (pts: readonly Pt[]) => Math.abs(signedArea(pts))

/** Area centroid (the mean of the points for a polygon with no area). */
export function centroid(pts: readonly Pt[]): Pt {
  const a = signedArea(pts)
  if (Math.abs(a) < EPS) {
    const n = Math.max(1, pts.length)
    return [pts.reduce((s, q) => s + q[0], 0) / n, pts.reduce((s, q) => s + q[1], 0) / n]
  }
  let cx = 0
  let cy = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % pts.length]
    const k = x1 * y2 - x2 * y1
    cx += (x1 + x2) * k
    cy += (y1 + y2) * k
  }
  return [cx / (6 * a), cy / (6 * a)]
}

export function boxOf(pts: readonly Pt[]): Box {
  let b: Box = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [x, y] of pts) b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)]
  return b
}

export const boxesOverlap = (a: Box, b: Box) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]

/** Even-odd point in polygon. */
export function pointInPolygon(pts: readonly Pt[], q: Pt): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    if (yi > q[1] !== yj > q[1] && q[0] < ((xj - xi) * (q[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Where two segments cross (ends included), or null. */
export function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const r: Pt = [b[0] - a[0], b[1] - a[1]]
  const s: Pt = [d[0] - c[0], d[1] - c[1]]
  const den = r[0] * s[1] - r[1] * s[0]
  if (Math.abs(den) < 1e-12) return null
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den
  return t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS ? [a[0] + t * r[0], a[1] + t * r[1]] : null
}

/** True when two edges that are not neighbours cross or touch (a bow tie, a loop). */
export function selfIntersects(pts: readonly Pt[]): boolean {
  const n = pts.length
  if (n < 4) return false
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue
      if (segmentsCross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true
    }
  }
  return false
}

/** Distance from q to the segment a-b. */
export function segmentDistance(a: Pt, b: Pt, q: Pt): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / len2)) : 0
  return Math.hypot(q[0] - (a[0] + t * dx), q[1] - (a[1] + t * dy))
}

/** Nearest point on the polygon's outline to q. */
export function nearestOnOutline(pts: readonly Pt[], q: Pt): Pt {
  let best: Pt = pts[0]
  let bd = Infinity
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const len2 = dx * dx + dy * dy
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / len2)) : 0
    const p: Pt = [a[0] + t * dx, a[1] + t * dy]
    const d = Math.hypot(p[0] - q[0], p[1] - q[1])
    if (d < bd) [best, bd] = [p, d]
  }
  return best
}

/** A circle as a polygon with n corners (counter-clockwise). */
export function circlePolygon(cx: number, cy: number, r: number, n = 96): Poly {
  const out: Poly = []
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return out
}

export const rectPolygon = (x0: number, y0: number, x1: number, y1: number): Poly => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]

/** The polygon clipped to the half-plane where a*x + b*y <= c (Sutherland-Hodgman). */
export function clipHalfPlane(pts: readonly Pt[], a: number, b: number, c: number): Poly {
  const out: Poly = []
  const f = (q: Pt) => a * q[0] + b * q[1] - c
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    const fp = f(p)
    const fq = f(q)
    if (fp <= 0) out.push(p)
    if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) {
      const t = fp / (fp - fq)
      out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])])
    }
  }
  return out
}

/** The polygon clipped to the box (a convex window, so Sutherland-Hodgman is exact; a concave outline may keep a zero-width bridge along an edge). */
export function clipToBox(pts: readonly Pt[], b: Box): Poly {
  let out = clipHalfPlane(pts, -1, 0, -b[0])
  out = clipHalfPlane(out, 1, 0, b[2])
  out = clipHalfPlane(out, 0, -1, -b[1])
  return clipHalfPlane(out, 0, 1, b[3])
}

// --- Scanlines -----------------------------------------------------------------------------------------

type Interval = [number, number]

/**
 * Where the line g(P) = 0 runs inside the polygon (even-odd), as intervals of the parameter u(P) along it. g and u are
 * linear: g(P) = gx*x + gy*y - gc, u(P) = ux*x + uy*y.
 */
function lineIntervals(pts: readonly Pt[], gx: number, gy: number, gc: number, ux: number, uy: number): Interval[] {
  const hits: number[] = []
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    const fp = gx * p[0] + gy * p[1] - gc
    const fq = gx * q[0] + gy * q[1] - gc
    // Half-open, so a corner on the line counts once.
    if (fp >= 0 === fq >= 0) continue
    const t = fp / (fp - fq)
    hits.push(ux * (p[0] + t * (q[0] - p[0])) + uy * (p[1] + t * (q[1] - p[1])))
  }
  hits.sort((a, b) => a - b)
  const out: Interval[] = []
  for (let i = 0; i + 1 < hits.length; i += 2) if (hits[i + 1] - hits[i] > EPS) out.push([hits[i], hits[i + 1]])
  return out
}

function unionIntervals(list: Interval[]): Interval[] {
  const s = [...list].sort((a, b) => a[0] - b[0])
  const out: Interval[] = []
  for (const iv of s) {
    const last = out[out.length - 1]
    if (last && iv[0] <= last[1] + EPS) last[1] = Math.max(last[1], iv[1])
    else out.push([iv[0], iv[1]])
  }
  return out
}

/** a minus b (b already a union, sorted). */
function subtractIntervals(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = []
  for (const [a0, a1] of a) {
    let start = a0
    for (const [b0, b1] of b) {
      if (b1 <= start || b0 >= a1) continue
      if (b0 > start) out.push([start, b0])
      start = Math.max(start, b1)
      if (start >= a1) break
    }
    if (a1 - start > EPS) out.push([start, a1])
  }
  return out
}

function insideIntervals(outer: readonly Pt[], islands: readonly (readonly Pt[])[], gx: number, gy: number, gc: number, ux: number, uy: number): Interval[] {
  const base = lineIntervals(outer, gx, gy, gc, ux, uy)
  if (base.length === 0 || islands.length === 0) return base
  return subtractIntervals(base, unionIntervals(islands.flatMap((isl) => lineIntervals(isl, gx, gy, gc, ux, uy))))
}

/**
 * Hatch lines over the outline with the islands left empty (CAD's island detection): 45-degree lines y = x - k, k a
 * whole number of `step` apart (the same family as the scan hatch, SL_HatchRect, so neighbouring areas line up).
 */
export function hatchLines(outer: readonly Pt[], islands: readonly (readonly Pt[])[], step: number): [Pt, Pt][] {
  if (outer.length < 3) return []
  if (!(step > 0)) step = 2.5
  const b = boxOf(outer)
  const near = islands.filter((isl) => isl.length >= 3 && boxesOverlap(boxOf(isl), b))
  const out: [Pt, Pt][] = []
  // g = x - y - k = 0, u = x.
  for (let k = Math.ceil((b[0] - b[3]) / step) * step; k <= b[2] - b[1]; k += step) {
    for (const [x0, x1] of insideIntervals(outer, near, 1, -1, k, 1, 0)) out.push([[x0, x0 - k], [x1, x1 - k]])
  }
  return out
}

/**
 * The area inside the outline and outside every island (even-odd outline), exactly for polygons: the length across
 * is linear between the heights where a corner sits or two edges cross, so it is measured once in the middle of each
 * band. `clipY` keeps only that band of heights (e.g. the shell's length).
 */
export function hatchedArea(outer: readonly Pt[], islands: readonly (readonly Pt[])[], clipY?: [number, number]): number {
  if (outer.length < 3) return 0
  const b = boxOf(outer)
  const near = islands.filter((isl) => isl.length >= 3 && boxesOverlap(boxOf(isl), b))
  const polys = [outer, ...near]
  const lo = clipY ? Math.max(b[1], clipY[0]) : b[1]
  const hi = clipY ? Math.min(b[3], clipY[1]) : b[3]
  if (!(hi > lo)) return 0
  const ys = new Set<number>([lo, hi])
  const edges: [Pt, Pt][] = []
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      ys.add(poly[i][1])
      edges.push([poly[i], poly[(i + 1) % poly.length]])
    }
  }
  for (let i = 0; i < edges.length; i++) {
    const [a, c] = edges[i]
    for (let j = i + 1; j < edges.length; j++) {
      const x = segmentsCross(a, c, edges[j][0], edges[j][1])
      if (x) ys.add(x[1])
    }
  }
  const sorted = [...ys].filter((y) => y >= lo && y <= hi).sort((p, q) => p - q)
  let area = 0
  for (let i = 0; i + 1 < sorted.length; i++) {
    const h = sorted[i + 1] - sorted[i]
    if (h <= EPS) continue
    const ym = (sorted[i] + sorted[i + 1]) / 2
    // g = y - ym = 0, u = x.
    for (const [x0, x1] of insideIntervals(outer, near, 0, 1, ym, 1, 0)) area += (x1 - x0) * h
  }
  return area
}

// --- Label spot ----------------------------------------------------------------------------------------

/** Does the box overlap the polygon (any part of it)? */
export function boxTouchesPolygon(box: Box, pts: readonly Pt[]): boolean {
  if (!boxesOverlap(box, boxOf(pts))) return false
  const r = rectPolygon(box[0], box[1], box[2], box[3])
  if (pts.some((q) => q[0] > box[0] && q[0] < box[2] && q[1] > box[1] && q[1] < box[3])) return true
  if (pointInPolygon(pts, [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2])) return true
  for (let i = 0; i < pts.length; i++) for (let j = 0; j < 4; j++) if (segmentsCross(pts[i], pts[(i + 1) % pts.length], r[j], r[(j + 1) % 4])) return true
  return false
}

/** Is the box wholly inside the outline and clear of every island? */
export function boxFits(outer: readonly Pt[], islands: readonly (readonly Pt[])[], box: Box): boolean {
  const r = rectPolygon(box[0], box[1], box[2], box[3])
  if (!r.every((q) => pointInPolygon(outer, q))) return false
  for (let i = 0; i < outer.length; i++) for (let j = 0; j < 4; j++) if (segmentsCross(outer[i], outer[(i + 1) % outer.length], r[j], r[(j + 1) % 4])) return false
  return !islands.some((isl) => boxTouchesPolygon(box, isl))
}

/** How far q is from the nearest edge of the outline or an island (negative outside the outline or inside an island). */
export function clearance(outer: readonly Pt[], islands: readonly (readonly Pt[])[], q: Pt): number {
  let d = Infinity
  for (const poly of [outer, ...islands]) for (let i = 0; i < poly.length; i++) d = Math.min(d, segmentDistance(poly[i], poly[(i + 1) % poly.length], q))
  const inside = pointInPolygon(outer, q) && !islands.some((isl) => pointInPolygon(isl, q))
  return inside ? d : -d
}

export interface LabelSpot {
  /** Label center. */
  at: Pt
  /** The label box fits inside the hatched part. */
  fits: boolean
  /** The most open point inside (where a leader from an outside label points). */
  open: Pt
}

/**
 * Where a label of w x h (in this frame) goes: the centroid when it fits there, else the most open spot where it fits;
 * when it fits nowhere, `fits` is false and `at` is the most open point (the caller puts the label outside).
 */
export function labelSpot(outer: readonly Pt[], islands: readonly (readonly Pt[])[], w: number, h: number): LabelSpot {
  const b = boxOf(outer)
  const near = islands.filter((isl) => isl.length >= 3 && boxesOverlap(boxOf(isl), b))
  const boxAt = (q: Pt): Box => [q[0] - w / 2, q[1] - h / 2, q[0] + w / 2, q[1] + h / 2]
  const c = centroid(outer)
  const N = 28
  const cands: Pt[] = [c]
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) cands.push([b[0] + ((b[2] - b[0]) * (i + 0.5)) / (N + 1), b[1] + ((b[3] - b[1]) * (j + 0.5)) / (N + 1)])
  let open: { q: Pt; d: number } = { q: c, d: -Infinity }
  let best: { q: Pt; score: number } | null = null
  const span = Math.max(b[2] - b[0], b[3] - b[1], EPS)
  for (const q of cands) {
    const d = clearance(outer, near, q)
    if (d > open.d) open = { q, d }
    if (d <= 0 || !boxFits(outer, near, boxAt(q))) continue
    // Near the center counts a little, so a roomy spot close to the middle wins over one at the far end.
    const score = q === c ? Infinity : d - (0.15 * d * Math.hypot(q[0] - c[0], q[1] - c[1])) / span
    if (!best || score > best.score) best = { q, score }
  }
  return best ? { at: best.q, fits: true, open: open.q } : { at: open.q, fits: false, open: open.q }
}

// --- Pick inside: the enclosed space around a point ------------------------------------------------------

/**
 * The outline of the smallest closed space around q made by the segments (like CAD's hatch pick point / BOUNDARY),
 * counter-clockwise, or null when q is not enclosed. Segments are split where they cross; loose ends are trimmed;
 * outlines lying wholly inside the space (a nozzle in the middle) are not part of it (they stay islands).
 */
export function enclosingBoundary(segments: readonly [Pt, Pt][], q: Pt): Poly | null {
  // Split every segment where others cross it.
  const tol = 1e-7
  const pieces: [Pt, Pt][] = []
  for (let i = 0; i < segments.length; i++) {
    const [a, b] = segments[i]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (len < tol) continue
    const ts = [0, 1]
    for (let j = 0; j < segments.length; j++) {
      if (j === i) continue
      const x = segmentsCross(a, b, segments[j][0], segments[j][1])
      if (x) ts.push(Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]) ? (x[0] - a[0]) / (b[0] - a[0]) : (x[1] - a[1]) / (b[1] - a[1]))
    }
    ts.sort((s, t) => s - t)
    for (let k = 0; k + 1 < ts.length; k++) {
      if ((ts[k + 1] - ts[k]) * len < tol * 10) continue
      const p0: Pt = [a[0] + ts[k] * (b[0] - a[0]), a[1] + ts[k] * (b[1] - a[1])]
      const p1: Pt = [a[0] + ts[k + 1] * (b[0] - a[0]), a[1] + ts[k + 1] * (b[1] - a[1])]
      pieces.push([p0, p1])
    }
  }
  // Join the ends into vertices (rounded so the ends of neighbouring pieces meet).
  const keyOf = (p: Pt) => `${Math.round(p[0] * 1e5)},${Math.round(p[1] * 1e5)}`
  const verts: Pt[] = []
  const index = new Map<string, number>()
  const vid = (p: Pt) => {
    const k = keyOf(p)
    let i = index.get(k)
    if (i === undefined) {
      i = verts.length
      verts.push(p)
      index.set(k, i)
    }
    return i
  }
  const adj = new Map<number, Set<number>>()
  const link = (a: number, b: number) => {
    if (a === b) return
    if (!adj.has(a)) adj.set(a, new Set())
    if (!adj.has(b)) adj.set(b, new Set())
    adj.get(a)!.add(b)
    adj.get(b)!.add(a)
  }
  for (const [a, b] of pieces) link(vid(a), vid(b))
  // Trim loose ends (a seam that stops in the open does not close anything).
  let trimmed = true
  while (trimmed) {
    trimmed = false
    for (const [v, ns] of adj) {
      if (ns.size >= 2) continue
      for (const n of ns) adj.get(n)?.delete(v)
      adj.delete(v)
      trimmed = true
    }
  }
  if (adj.size === 0) return null
  const ang = (from: number, to: number) => Math.atan2(verts[to][1] - verts[from][1], verts[to][0] - verts[from][0])
  /** The face on the left of the half-edge a -> b: at each corner, the edge first clockwise from the way back. */
  const walk = (a0: number, b0: number): number[] | null => {
    const cycle: number[] = []
    let a = a0
    let b = b0
    for (let guard = 0; guard < 100000; guard++) {
      cycle.push(a)
      const back = ang(b, a)
      let best = -1
      let bestTurn = Infinity
      for (const c of adj.get(b) ?? []) {
        // Clockwise angle from the way back to the candidate, in (0, 2 pi]: the way back itself is last.
        let t = back - ang(b, c)
        while (t <= 1e-12) t += 2 * Math.PI
        while (t > 2 * Math.PI) t -= 2 * Math.PI
        if (t < bestTurn) [best, bestTurn] = [c, t]
      }
      if (best < 0) return null
      a = b
      b = best
      if (a === a0 && b === b0) return cycle
    }
    return null
  }
  // Cast a ray to the right (tilted a little so it misses corners) and try each edge it meets, nearest first.
  const dir: Pt = [Math.cos(0.0123), Math.sin(0.0123)]
  const hits: { d: number; a: number; b: number }[] = []
  for (const [a, ns] of adj) {
    for (const b of ns) {
      if (b < a) continue
      const pa = verts[a]
      const pb = verts[b]
      const e: Pt = [pb[0] - pa[0], pb[1] - pa[1]]
      const den = dir[0] * e[1] - dir[1] * e[0]
      if (Math.abs(den) < 1e-14) continue
      const w: Pt = [pa[0] - q[0], pa[1] - q[1]]
      const t = (w[0] * e[1] - w[1] * e[0]) / den
      const u = (w[0] * dir[1] - w[1] * dir[0]) / den
      if (t > 0 && u >= 0 && u <= 1) {
        // The half-edge with q on its left.
        const left = e[0] * (q[1] - pa[1]) - e[1] * (q[0] - pa[0]) > 0
        hits.push(left ? { d: t, a, b } : { d: t, a: b, b: a })
      }
    }
  }
  hits.sort((s, t) => s.d - t.d)
  for (const h of hits) {
    const cyc = walk(h.a, h.b)
    if (!cyc || cyc.length < 3) continue
    const poly = cyc.map((i) => verts[i])
    if (signedArea(poly) > EPS && pointInPolygon(poly, q)) return poly
  }
  return null
}
