// Wrapping across the circumference seam (Phase 3f-2). X = 0 and X = circumference are the same line on
// the vessel, so an item that crosses it is drawn in pieces, one at each edge of the rollout. Nothing wraps
// along the length (Y). The preview, the .lsp, the checks, coverage and the photo split all use these rules,
// so they always agree. v5.0 did this in CAD afterwards (NOZZLEWRAP, OBJECTWRAP, clicking the two edges);
// compat 'v5.0' never wraps.

import type { Project, Scan, ShellNozzle, ShellObject } from '../data/schema.ts'
import { clipToBox, polygonArea, type Poly, type Pt } from './polygon.ts'

/** Anything smaller than this (inches) does not count as crossing the seam. */
export const WRAP_EPS = 1e-6

/** One piece of an item along X, inside 0..C. from / to: where it is along the item (0 = its start, 1 = its end). */
export interface XPiece {
  x0: number
  x1: number
  from: number
  to: number
}

/**
 * The pieces of the X range a..b (a < b) inside the rollout 0..C. An item within 0..C is one piece; one
 * running past an edge is two pieces, one at each edge; one wholly past an edge (typed past the seam) is
 * one piece moved back by C. An item as wide as the shell or wider can't be wrapped: one piece, as given.
 */
export function wrapSpan(a: number, b: number, C: number): XPiece[] {
  const len = b - a
  if (!(C > 0) || !(len > 0) || len >= C - WRAP_EPS) return [{ x0: a, x1: b, from: 0, to: 1 }]
  const out: XPiece[] = []
  for (const k of [-C, 0, C]) {
    const lo = Math.max(0, a + k)
    const hi = Math.min(C, b + k)
    if (hi - lo > WRAP_EPS) out.push({ x0: lo, x1: hi, from: (lo - (a + k)) / len, to: (hi - (a + k)) / len })
  }
  out.sort((p, q) => p.from - q.from)
  return out.length ? out : [{ x0: a, x1: b, from: 0, to: 1 }]
}

/** True when the pieces are not just the item where it was typed. */
export function isWrapped(pieces: readonly XPiece[]): boolean {
  return pieces.length > 1
}

/**
 * Which piece gets the ID label: the larger one (v5.0's OBJECTWRAP rule); an equal split goes to the piece
 * the item starts in.
 */
export function labelPieceIndex(pieces: readonly XPiece[]): number {
  let best = 0
  for (let i = 1; i < pieces.length; i++) {
    const d = pieces[i].x1 - pieces[i].x0 - (pieces[best].x1 - pieces[best].x0)
    if (d > WRAP_EPS) best = i
  }
  return best
}

// --- Scans -------------------------------------------------------------------------------------------

/** The scan's X range as drawn: a reversed scan marked "across the seam" runs from X start to X stop + C. */
export function scanXRange(sc: Scan, C: number | null): { a: number; b: number } {
  const a = sc.xStart!
  const b = sc.xStop!
  if (a > b && sc.acrossSeam && !sc.noWrap && C !== null && C > 0) return { a, b: b + C }
  return { a, b }
}

/** X pieces of a scan as drawn (after the reversed-scan rules of drawnScans). */
export function scanPieces(sc: Scan, C: number | null): XPiece[] {
  const { a, b } = scanXRange(sc, C)
  if (sc.noWrap || C === null || !(b > a)) return [{ x0: a, x1: b, from: 0, to: 1 }]
  return wrapSpan(a, b, C)
}

/**
 * A reversed X range (X start > X stop) that could also be a scan across the seam. Not asked for scans
 * marked "Don't wrap" or already marked across.
 */
export function scanNeedsSeamChoice(sc: Scan): boolean {
  return sc.include && !sc.noWrap && !sc.acrossSeam && sc.xStart !== null && sc.xStop !== null && sc.xStart > sc.xStop
}

// --- Objects -----------------------------------------------------------------------------------------

export function objectPieces(o: ShellObject, C: number | null): XPiece[] {
  const a = o.x!
  const b = o.x! + o.circWidth!
  if (o.noWrap || C === null) return [{ x0: a, x1: b, from: 0, to: 1 }]
  return wrapSpan(a, b, C)
}

// --- Nozzles -----------------------------------------------------------------------------------------

/** A circle drawn whole (arc null) or as an arc from a0 to a1 degrees, counter-clockwise, logical axes. */
export interface ArcPiece {
  cx: number
  cy: number
  r: number
  arc: [number, number] | null
}

const DEG = 180 / Math.PI

/** Center X moved into 0..C (a nozzle typed past the seam). Exactly 0 or C stays as typed. */
export function normalizeX(x: number, C: number): number {
  if (!(C > 0) || (x >= 0 && x <= C)) return x
  return ((x % C) + C) % C
}

/**
 * The pieces of a nozzle circle (center cx, cy, radius r) inside the rollout 0..C. A circle overlapping
 * an edge is drawn as the arc inside plus the overhanging arc at the opposite edge. The first piece is
 * the main one (its center is inside the rollout); the label belongs to it.
 */
export function circlePieces(cx: number, cy: number, r: number, C: number | null, noWrap = false): ArcPiece[] {
  if (noWrap || C === null || !(C > 0) || !(r > 0) || 2 * r >= C) return [{ cx, cy, r, arc: null }]
  const x = normalizeX(cx, C)
  const out: ArcPiece[] = []
  for (const k of [0, -C, C]) {
    const c = x + k
    if (c + r <= WRAP_EPS || c - r >= C - WRAP_EPS) continue
    if (c - r >= -WRAP_EPS && c + r <= C + WRAP_EPS) {
      out.push({ cx: c, cy, r, arc: null })
      continue
    }
    // Clipped by X = 0 (keep x >= 0) or by X = C (keep x <= C): the kept arc, counter-clockwise.
    if (c - r < 0) {
      const t = Math.acos(Math.max(-1, Math.min(1, -c / r))) * DEG
      out.push({ cx: c, cy, r, arc: [-t, t] })
    } else {
      const t = Math.acos(Math.max(-1, Math.min(1, (C - c) / r))) * DEG
      out.push({ cx: c, cy, r, arc: [t, 360 - t] })
    }
  }
  return out
}

export function nozzlePieces(n: ShellNozzle, C: number | null): ArcPiece[] {
  return circlePieces(n.x!, n.y!, n.diameter! / 2, C, n.noWrap)
}

/** Bounding boxes of the pieces (logical), e.g. for label placement. */
export function arcBox(p: ArcPiece): [number, number, number, number] {
  if (!p.arc) return [p.cx - p.r, p.cy - p.r, p.cx + p.r, p.cy + p.r]
  const [a0, a1] = p.arc
  const pts: [number, number][] = [a0, a1].map((a) => [p.cx + p.r * Math.cos(a / DEG), p.cy + p.r * Math.sin(a / DEG)])
  for (let a = Math.ceil(a0 / 90) * 90; a <= a1; a += 90) pts.push([p.cx + p.r * Math.cos(a / DEG), p.cy + p.r * Math.sin(a / DEG)])
  const xs = pts.map((q) => q[0])
  const ys = pts.map((q) => q[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

// --- MUT areas (Phase 5c) ---------------------------------------------------------------------------

/**
 * A shell area's outline as drawn: clipped to the shell, in pieces across the circumference seam (a corner past
 * X = 0 or the circumference wraps round to the other edge, as scans do). Logical. An area that can't be placed
 * (vessel size not known) is drawn as it is.
 */
export function shellAreaPieces(p: Project, pts: readonly Pt[]): Poly[] {
  const C = circumference(p)
  const L = p.vessel.length
  if (C === null || L === null || !(L > 0)) return [pts.map((q) => [q[0], q[1]] as Pt)]
  const out: Poly[] = []
  for (const k of [0, -C, C]) {
    const piece = clipToBox(pts.map((q): Pt => [q[0] + k, q[1]]), [0, 0, C, L])
    if (piece.length >= 3 && polygonArea(piece) > 1e-6) out.push(piece)
  }
  return out
}

// --- Items typed past the seam -----------------------------------------------------------------------

/** The circumference when wrapping applies (the vessel size is known). */
export function circumference(p: Project): number | null {
  const C = p.vessel.height
  return C !== null && C > 0 ? C : null
}

/** A value read as being past the seam: x moved by whole circumferences into 0..C. */
export function pastSeamValue(x: number, C: number): number {
  return Math.round(normalizeX(x, C) * 1e6) / 1e6
}
