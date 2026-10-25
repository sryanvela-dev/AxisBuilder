// Drawing a MUT area point by point (Phase 5c), without React so it can be tested: adding a point (clicking the first
// point again closes the shape), Backspace, snapping against the job's lines and the shape so far, typed points, and the
// coordinates shown while drawing. Points are kept as the drawing reads (the visual frame, engine/snap.ts).

import { parseLength } from '../../data/parse.ts'
import type { Project } from '../../data/schema.ts'
import { headFrame, type AreaTarget } from '../../engine/mutAreas.ts'
import { findSnap, segmentIntersection, type Snap, type SnapGeom } from '../../engine/snap.ts'
import { toLogical, toVisual, type Orientation } from '../../engine/transform.ts'
import type { Mods } from './drawingTool.ts'

type Pt = [number, number]

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])

/** A click at q: a new corner, or (3 corners or more, at the first one) the shape closed. A click on the last corner again does nothing. */
export function addPoint(pts: readonly Pt[], q: Pt, closeTol: number): { pts: Pt[]; closed: boolean } {
  if (pts.length >= 3 && dist(q, pts[0]) <= closeTol) return { pts: [...pts], closed: true }
  if (pts.length > 0 && dist(q, pts[pts.length - 1]) < 1e-9) return { pts: [...pts], closed: false }
  return { pts: [...pts, q], closed: false }
}

/** Backspace: the last corner taken away. */
export const removeLast = (pts: readonly Pt[]): Pt[] => pts.slice(0, -1)

/** The job's lines plus the shape drawn so far (its edges and corners snap too). */
export function withShape(g: SnapGeom, pts: readonly Pt[]): SnapGeom {
  const segs = [...g.segs]
  for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]])
  // A lone first point is a segment of no length, so its end still snaps.
  if (pts.length === 1) segs.push([pts[0], pts[0]])
  return { segs, circles: g.circles }
}

/**
 * Points a corner can line up with (tracking): every line end and corner of the job's lines, circle centers and the
 * corners drawn so far, without repeats.
 */
export function trackPoints(g: SnapGeom, pts: readonly Pt[]): Pt[] {
  const seen = new Set<string>()
  const out: Pt[] = []
  const add = (q: Pt) => {
    const k = `${Math.round(q[0] * 1000)},${Math.round(q[1] * 1000)}`
    if (seen.has(k)) return
    seen.add(k)
    out.push(q)
  }
  for (const [a, b] of g.segs) {
    add(a)
    add(b)
  }
  for (const c of g.circles) add(c.c)
  for (const q of pts) add(q)
  return out
}

/**
 * The next point for the cursor: snapped to an endpoint, intersection, center, perpendicular (from the last corner),
 * lined up with a point anywhere in the drawing (same X or same Y; with one point on each axis at once, squared up with
 * both), or a point on a line. Shift = the cursor as it is; Ctrl (or the Straight lock) = held level or plumb with the
 * last corner. `from` overrides the point Ctrl measures from (a corner being dragged: where it started).
 */
export function drawSnap(g: SnapGeom, pts: readonly Pt[], cursor: Pt, tol: number, mods: Mods, track: readonly Pt[] = trackPoints(g, pts), from: Pt | undefined = pts.length ? pts[pts.length - 1] : undefined): Snap {
  const ortho = mods.ctrl && from !== undefined
  const s = findSnap(withShape(g, pts), cursor, tol, {
    free: mods.shift, ortho, ...(from ? { from } : {}), align: track, kinds: ['endpoint', 'intersection', 'center', 'perpendicular', 'align', 'on'],
  })
  if (mods.shift || ortho || (s.kind !== null && s.kind !== 'align' && s.kind !== 'on')) return s
  if (s.kind === 'align' && s.ref) {
    // Lined up while near a line: where the tracking line meets that line, or else the line itself (a corner on a
    // weld matters more than lining up).
    const on = findSnap(withShape(g, pts), cursor, tol, { kinds: ['on'] })
    if (on.kind === 'on') {
      const vertical = Math.abs(s.pt[0] - s.ref[0]) < 1e-9
      const far = 1e7
      const track: [Pt, Pt] = vertical ? [[s.ref[0], -far], [s.ref[0], far]] : [[-far, s.ref[1]], [far, s.ref[1]]]
      let best: Pt | null = null
      for (const [a, b] of withShape(g, pts).segs) {
        const x = segmentIntersection(track[0], track[1], a, b)
        if (x && Math.hypot(x[0] - cursor[0], x[1] - cursor[1]) <= tol && (!best || Math.hypot(x[0] - cursor[0], x[1] - cursor[1]) < Math.hypot(best[0] - cursor[0], best[1] - cursor[1]))) best = x
      }
      return best ? { pt: best, kind: 'align', ref: s.ref } : on
    }
  }
  // Squared up with two points: one lined up across, the other up and down.
  let bx: Pt | null = null
  let by: Pt | null = null
  for (const q of track) {
    if (Math.abs(q[0] - cursor[0]) <= tol && (!bx || Math.abs(q[0] - cursor[0]) < Math.abs(bx[0] - cursor[0]))) bx = q
    if (Math.abs(q[1] - cursor[1]) <= tol && (!by || Math.abs(q[1] - cursor[1]) < Math.abs(by[1] - cursor[1]))) by = q
  }
  if (bx && by && bx !== by) return { pt: [bx[0], by[1]], kind: 'align', ref: bx, ref2: by }
  return s
}

/**
 * What typed coordinates mean on each target, in inches: on the shell X around and Y along (as the tables); on a head,
 * right and up from the head's center as the drawing reads.
 */
export interface TypedFrame {
  toVisual: (t: Pt) => Pt
  fromVisual: (v: Pt) => Pt
  /** "X 12.5, Y 30" / "12.5 right, 4 up of the center". */
  describe: (t: Pt) => string
}

const num = (n: number) => String(Math.round(n * 100) / 100)

export function typedFrame(p: Project, t: AreaTarget): TypedFrame | null {
  const o = p.vessel.orientation as Orientation
  if (t.kind === 'shell') {
    return {
      toVisual: (q) => toVisual(o, q[0], q[1]),
      fromVisual: (v) => toLogical(o, v[0], v[1]),
      describe: (q) => `X ${num(q[0])}, Y ${num(q[1])}`,
    }
  }
  const f = headFrame(p, t.head)
  if (!f) return null
  const c = toVisual(o, f.c[0], f.c[1])
  return {
    toVisual: (q) => [c[0] + q[0], c[1] + q[1]],
    fromVisual: (v) => [v[0] - c[0], v[1] - c[1]],
    describe: (q) => `${num(Math.abs(q[0]))} ${q[0] < 0 ? 'left' : 'right'}, ${num(Math.abs(q[1]))} ${q[1] < 0 ? 'down' : 'up'} from the center`,
  }
}

/**
 * Typed coordinates: "12.5, 30" (or with a semicolon), each a length as the tables take it (12 1/2, 10' 6"); "@5, 0"
 * is measured from the last corner.
 */
export function parseTypedPoint(text: string, last: Pt | null): { ok: true; pt: Pt } | { ok: false; problem: string } {
  let t = text.trim()
  const relative = t.startsWith('@')
  if (relative) t = t.slice(1)
  const parts = t.split(/[,;]/)
  if (parts.length !== 2) return { ok: false, problem: 'Type two numbers with a comma between them, like 12.5, 30 (or @5, 0 from the last corner).' }
  const vals: number[] = []
  for (const part of parts) {
    const r = parseLength(part)
    if (!r.ok) return { ok: false, problem: r.problem }
    if (r.value === null) return { ok: false, problem: 'Type both numbers, like 12.5, 30.' }
    vals.push(r.value)
  }
  if (relative) {
    if (!last) return { ok: false, problem: 'There is no corner yet to measure from; type the first one without @.' }
    return { ok: true, pt: [last[0] + vals[0], last[1] + vals[1]] }
  }
  return { ok: true, pt: [vals[0], vals[1]] }
}
