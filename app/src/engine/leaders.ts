// Leader lines and arrowheads (Phase 5a). One engine for the preview, the Sheets view, the PDF and the report
// images (they all draw the same shapes) and the .lsp (it writes the same points).
//
// A leader is a path in logical coordinates from the nozzle edge (first point) to just short of the label (last
// point). Straight: one segment. Elbow (like CAD's multileader): an angled segment from the nozzle, then a short
// horizontal landing, with the label at the end of the landing, vertically centred on it. Curved: a smooth curve
// from the nozzle edge to the label, leaving the nozzle along its radius and entering the label horizontally.
// "Horizontal" is on the drawing as it reads, so landings are worked out in the visual frame and turned back
// into logical coordinates (Horizontal CW / CCW turn the logical axes a quarter turn).

import type { Project } from '../data/schema.ts'
import { toLogical, toVisual, type Orientation } from './transform.ts'

export type Pt = [number, number]
export type Box = [number, number, number, number]
export type LeaderShape = 'Straight' | 'Elbow' | 'Curved'
export type ArrowStyle = 'Closed filled' | 'Open' | 'Dot' | 'None'

export interface LeaderStyle {
  shape: LeaderShape
  /** Elbow: length of the horizontal landing. */
  landing: number
  arrow: ArrowStyle
  /** Arrowhead length on leaders (a dot is DOT_FACTOR of it wide). */
  arrowSize: number
}

export function leaderStyle(s: Project['settings']): LeaderStyle {
  return { shape: s.leaderShape, landing: s.leaderLandingLength, arrow: s.arrowheadStyle, arrowSize: s.leaderArrowSize }
}

/** Closed head: half the base width over its length. Open head: v5.0's SL_Arrow (0.55). Dot: diameter over size. */
export const CLOSED_HALF = 0.25
export const OPEN_HALF = 0.55
export const DOT_FACTOR = 0.5
/** Corners of the dot polygon. */
const DOT_SIDES = 16

/** Gap between the end of a leader and its label, as a fraction of the label height. */
export const LEADER_GAP = 0.3

/** What is drawn: an open polyline, a closed filled triangle (tip, then the two base corners), a filled dot. */
export type LeaderPart = { k: 'line'; pts: Pt[] } | { k: 'fill'; pts: Pt[] } | { k: 'dot'; c: Pt; d: number }

const unit = (a: Pt, b: Pt): Pt | null => {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy)
  return len > 1e-9 ? [dx / len, dy / len] : null
}

/** The arrowhead at `tip`; u = unit direction from the tail to the tip (the head points along it). */
export function arrowheadParts(style: ArrowStyle, size: number, tip: Pt, u: Pt): LeaderPart[] {
  if (style === 'None' || !(size > 0)) return []
  const p: Pt = [-u[1], u[0]]
  const base: Pt = [tip[0] - size * u[0], tip[1] - size * u[1]]
  const at = (half: number, sign: number): Pt => [base[0] + sign * half * size * p[0], base[1] + sign * half * size * p[1]]
  if (style === 'Closed filled') return [{ k: 'fill', pts: [tip, at(CLOSED_HALF, -1), at(CLOSED_HALF, 1)] }]
  if (style === 'Open') return [{ k: 'line', pts: [at(OPEN_HALF, -1), tip, at(OPEN_HALF, 1)] }]
  return [{ k: 'dot', c: tip, d: size * DOT_FACTOR }]
}

/** The leader line then the arrowhead at its nozzle end, pointing into the nozzle. */
export function leaderParts(path: Pt[], style: LeaderStyle): LeaderPart[] {
  const u = path.length > 1 ? unit(path[1], path[0]) : null
  return [{ k: 'line', pts: path }, ...(u ? arrowheadParts(style.arrow, style.arrowSize, path[0], u) : [])]
}

/** A dot as a polygon (the preview, Sheets view, PDF and report images draw it filled). */
export function dotPolygon(c: Pt, d: number): Pt[] {
  return Array.from({ length: DOT_SIDES }, (_, i) => {
    const a = (i / DOT_SIDES) * 2 * Math.PI
    return [c[0] + (d / 2) * Math.cos(a), c[1] + (d / 2) * Math.sin(a)] as Pt
  })
}

// --- Paths ---------------------------------------------------------------------------------------------

export interface Spot {
  /** Leader path, nozzle edge first. */
  path: Pt[]
  /** Label centre. */
  tx: number
  ty: number
}

const toV = (o: Orientation, p: Pt): Pt => toVisual(o, p[0], p[1])
const toL = (o: Orientation, p: Pt): Pt => toLogical(o, p[0], p[1])

/**
 * Elbow: from the nozzle edge along `dir` (a visual unit vector) for `seg`, then a horizontal landing of `landing` toward
 * the side dir points to (right when it points straight up or down), then the label, its near edge `gap` past the
 * landing's end, centred on it. n = nozzle centre, r its radius; tw = label width.
 */
export function elbowSpot(o: Orientation, n: Pt, r: number, dir: Pt, seg: number, landing: number, gap: number, tw: number): Spot {
  const nv = toV(o, n)
  const e: Pt = [nv[0] + r * dir[0], nv[1] + r * dir[1]]
  const k: Pt = [e[0] + seg * dir[0], e[1] + seg * dir[1]]
  const side = dir[0] < -1e-9 ? -1 : 1
  const l: Pt = [k[0] + side * landing, k[1]]
  const c: Pt = [l[0] + side * (gap + tw / 2), l[1]]
  // A horizontal direction has no angle: one straight line.
  const pts = Math.abs(dir[1]) < 1e-9 ? [e, l] : [e, k, l]
  const [tx, ty] = toL(o, c)
  return { path: pts.map((q) => toL(o, q)), tx, ty }
}

/** Where the ray from a to the centre of a box (half sizes hw, hh) first meets the box, in the same frame. */
function boxEntry(a: Pt, c: Pt, hw: number, hh: number): Pt {
  const dx = c[0] - a[0]
  const dy = c[1] - a[1]
  let t = 0
  for (const [d, off, half] of [[dx, a[0] - c[0], hw], [dy, a[1] - c[1], hh]] as const) {
    if (Math.abs(d) < 1e-12) continue
    // The ray enters this slab at t = (-off - sign(d) half) / d.
    t = Math.max(t, (-off - Math.sign(d) * half) / d)
  }
  t = Math.min(1, Math.max(0, t))
  return [a[0] + dx * t, a[1] + dy * t]
}

/** Straight: the line from the nozzle edge e toward the label centre, stopping `gap` short of the label box. */
export function straightSpot(o: Orientation, e: Pt, centre: Pt, tw: number, sh: number): Spot {
  const ev = toV(o, e)
  const cv = toV(o, centre)
  const hit = boxEntry(ev, cv, tw / 2 + sh * LEADER_GAP, sh / 2 + sh * LEADER_GAP)
  return { path: [e, toL(o, hit)], tx: centre[0], ty: centre[1] }
}

/**
 * Curved: a cubic curve from the nozzle edge e (leaving along the nozzle's radius) to the near side of the label
 * (entering horizontally), as a polyline of CURVE_STEPS segments.
 */
export const CURVE_STEPS = 14
export function curvedSpot(o: Orientation, n: Pt, e: Pt, centre: Pt, tw: number, sh: number): Spot {
  const nv = toV(o, n)
  const ev = toV(o, e)
  const cv = toV(o, centre)
  const side = cv[0] >= ev[0] ? -1 : 1
  const end: Pt = [cv[0] + side * (tw / 2 + sh * LEADER_GAP), cv[1]]
  const radial = unit(nv, ev) ?? [1, 0]
  const reach = Math.hypot(end[0] - ev[0], end[1] - ev[1]) * 0.4
  const p1: Pt = [ev[0] + radial[0] * reach, ev[1] + radial[1] * reach]
  const p2: Pt = [end[0] + side * reach, end[1]]
  const pts: Pt[] = []
  for (let i = 0; i <= CURVE_STEPS; i++) {
    const t = i / CURVE_STEPS
    const m = 1 - t
    const w = [m * m * m, 3 * m * m * t, 3 * m * t * t, t * t * t]
    pts.push([w[0] * ev[0] + w[1] * p1[0] + w[2] * p2[0] + w[3] * end[0], w[0] * ev[1] + w[1] * p1[1] + w[2] * p2[1] + w[3] * end[1]])
  }
  return { path: pts.map((q) => toL(o, q)), tx: centre[0], ty: centre[1] }
}

// --- Clearance -----------------------------------------------------------------------------------------

/** Does the segment a-b pass through the inside of the box? (Touching an edge does not count.) */
export function segmentHitsBox(a: Pt, b: Pt, box: Box): boolean {
  const eps = 1e-6
  const lo: Pt = [box[0] + eps, box[1] + eps]
  const hi: Pt = [box[2] - eps, box[3] - eps]
  if (lo[0] >= hi[0] || lo[1] >= hi[1]) return false
  let t0 = 0
  let t1 = 1
  for (const i of [0, 1] as const) {
    const d = b[i] - a[i]
    if (Math.abs(d) < 1e-12) {
      if (a[i] <= lo[i] || a[i] >= hi[i]) return false
      continue
    }
    let u0 = (lo[i] - a[i]) / d
    let u1 = (hi[i] - a[i]) / d
    if (u0 > u1) [u0, u1] = [u1, u0]
    t0 = Math.max(t0, u0)
    t1 = Math.min(t1, u1)
    if (t0 >= t1) return false
  }
  return true
}

export function pathHitsBox(path: readonly Pt[], box: Box): boolean {
  for (let i = 1; i < path.length; i++) if (segmentHitsBox(path[i - 1], path[i], box)) return true
  return false
}

/** Do the segments a-b and c-d cross (not just touch at an end)? */
export function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const cross = (p: Pt, q: Pt, r: Pt) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  const d1 = cross(a, b, c)
  const d2 = cross(a, b, d)
  const d3 = cross(c, d, a)
  const d4 = cross(c, d, b)
  return d1 * d2 < -1e-9 && d3 * d4 < -1e-9
}

export function pathsCross(p: readonly Pt[], q: readonly Pt[]): boolean {
  for (let i = 1; i < p.length; i++) for (let j = 1; j < q.length; j++) if (segmentsCross(p[i - 1], p[i], q[j - 1], q[j])) return true
  return false
}
