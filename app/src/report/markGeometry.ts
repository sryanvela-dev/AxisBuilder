// Picture mark geometry (design 14, R5): pure functions shared by the markup editor, the page drawing (report/marks.ts)
// and the tests. Marks are stored in the upright picture's 0-1 fractions (after EXIF, before the turn); the editor and
// the page show them in the "view": page inches of the picture as it prints, turned and cropped. Turn and crop are a
// quarter turn plus a uniform scale and a shift, so the view is a similarity of the upright picture's pixels: lengths
// and angles measured in view inches are true, and every edit (move, resize, turn, snap) is worked out there, then
// stored back as fractions.

import { fontBox, measure, type ReportFontId } from './fonts.ts'
import { imagePoint, type Rect } from './pageModel.ts'
import type { FracBox, Mark, MarkStyle, Rotation } from './schema.ts'

export type Pt = [number, number]
const FULL: FracBox = { x0: 0, y0: 0, x1: 1, y1: 1 }
const PT = 1 / 72

/** Where a picture's marks are drawn: the visible part's box (inches), its turn and crop, its upright pixel size. */
export interface MarkFrame extends Rect {
  crop: FracBox | null
  rotate: Rotation
  /** Upright pixel size (after EXIF, before the turn); an uploaded PDF page: its size in any unit. */
  upright: { w: number; h: number }
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const clampPt = (q: readonly [number, number]): Pt => [clamp01(q[0]), clamp01(q[1])]
const swaps = (r: Rotation) => r === 90 || r === 270

// --- View <-> stored ------------------------------------------------------------------------------

/** Stored fraction -> view (page inches). */
export const toView = (f: MarkFrame, q: readonly [number, number]): Pt => imagePoint(f, q)

/** View (page inches) -> stored fraction (not clamped). */
export function toFrac(f: MarkFrame, [x, y]: readonly [number, number]): Pt {
  const fu = (x - f.x) / f.w
  const fv = (y - f.y) / f.h
  const r = f.rotate
  const [cu, cv] = r === 90 ? [fv, 1 - fu] : r === 180 ? [1 - fu, 1 - fv] : r === 270 ? [1 - fv, fu] : [fu, fv]
  const c = f.crop ?? FULL
  return [c.x0 + cu * (c.x1 - c.x0), c.y0 + cv * (c.y1 - c.y0)]
}

/** View inches per upright pixel. */
export function viewScale(f: MarkFrame): number {
  const c = f.crop ?? FULL
  const visibleW = swaps(f.rotate) ? (c.y1 - c.y0) * f.upright.h : (c.x1 - c.x0) * f.upright.w
  return f.w / visibleW
}

/** A box mark in the view: centre, width, height (inches) and turn (degrees clockwise). */
export interface BoxGeom {
  c: Pt
  w: number
  h: number
  a: number
}

/** A stored box + angle as the box seen in the view (a quarter turn swaps width and height; the angle stays). */
export function boxToView(f: MarkFrame, b: FracBox, angle = 0): BoxGeom {
  const s = viewScale(f)
  const wpx = (b.x1 - b.x0) * f.upright.w * s
  const hpx = (b.y1 - b.y0) * f.upright.h * s
  return { c: toView(f, [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]), w: swaps(f.rotate) ? hpx : wpx, h: swaps(f.rotate) ? wpx : hpx, a: angle }
}

/** The smallest side of a box mark, in view inches. */
export const MIN_BOX = 0.04

/** A view box back to the stored box (kept on the picture, size kept where it fits) and angle. */
export function viewToBox(f: MarkFrame, g: BoxGeom): { box: FracBox; angle: number } {
  const s = viewScale(f)
  const [wv, hv] = swaps(f.rotate) ? [g.h, g.w] : [g.w, g.h]
  const fw = Math.min(1, Math.max(MIN_BOX, wv) / s / f.upright.w)
  const fh = Math.min(1, Math.max(MIN_BOX, hv) / s / f.upright.h)
  const [cu, cv] = toFrac(f, g.c)
  const x0 = Math.min(Math.max(cu - fw / 2, 0), 1 - fw)
  const y0 = Math.min(Math.max(cv - fh / 2, 0), 1 - fh)
  return { box: { x0, y0, x1: x0 + fw, y1: y0 + fh }, angle: normAngle(g.a) }
}

/** An angle in (-180, 180]. */
export function normAngle(a: number): number {
  let x = a % 360
  if (x > 180) x -= 360
  if (x <= -180) x += 360
  return Math.round(x * 1000) / 1000
}

const rot = ([x, y]: Pt, deg: number): Pt => {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  return [x * c - y * s, x * s + y * c]
}

/** A point given in the box's own frame (from its centre, unturned) -> the view. */
export const boxPoint = (g: BoxGeom, local: Pt): Pt => {
  const [x, y] = rot(local, g.a)
  return [g.c[0] + x, g.c[1] + y]
}
/** A view point -> the box's own frame. */
export const boxLocal = (g: BoxGeom, p: Pt): Pt => rot([p[0] - g.c[0], p[1] - g.c[1]], -g.a)

/** The four corners of a view box, clockwise from the top left. */
export function boxCorners(g: BoxGeom): Pt[] {
  const w = g.w / 2
  const h = g.h / 2
  return [boxPoint(g, [-w, -h]), boxPoint(g, [w, -h]), boxPoint(g, [w, h]), boxPoint(g, [-w, h])]
}

// --- Labels and badges ------------------------------------------------------------------------------

/** The report font of a label or badge style. */
export function markFont(s: Pick<MarkStyle, 'font' | 'bold'>): ReportFontId {
  if (s.font === 'montserrat') return s.bold ? 'montserrat-700' : 'montserrat-600'
  return s.bold ? 'roboto-700' : 'roboto-500'
}

/** Label text lines (blank text shows one blank line so the box can still be found). */
export const labelLines = (text: string): string[] => (text === '' ? [''] : text.split(/\r?\n/))

/** Inner spacing of a label box, inches, from the text size (looks right at print size). */
export function labelPadding(s: Pick<MarkStyle, 'textSize'>, callout: string): { x: number; y: number } {
  if (callout === 'plain') return { x: 0.12 * s.textSize * PT, y: 0.08 * s.textSize * PT }
  return { x: 0.55 * s.textSize * PT, y: 0.32 * s.textSize * PT }
}

export const LINE_HEIGHT = 1.22

/** A label's box in the view (inches), centred on its point. */
export function labelRect(f: MarkFrame, m: Extract<Mark, { kind: 'label' }>): Rect {
  const s = m.style
  const font = markFont(s)
  const lines = labelLines(m.text)
  const pad = labelPadding(s, m.callout)
  const tw = Math.max(s.textSize * 0.6 * PT, ...lines.map((l) => measure(l, font, s.textSize)))
  const w = tw + 2 * pad.x
  const h = lines.length * s.textSize * LINE_HEIGHT * PT + 2 * pad.y - (LINE_HEIGHT - 1) * s.textSize * PT
  const [cx, cy] = toView(f, m.at)
  return { x: cx - w / 2, y: cy - h / 2, w, h }
}

/** Corner radius of a label box (inches): pill = half the height. */
export function labelRadius(m: Extract<Mark, { kind: 'label' }>, r: Rect): number {
  return m.callout === 'pill' ? r.h / 2 : m.callout === 'rounded' ? Math.min(r.h / 2, 0.38 * m.style.textSize * PT) : 0
}

/** Baselines of the label's lines (inches), for centred text. */
export function labelBaselines(m: Extract<Mark, { kind: 'label' }>, r: Rect): number[] {
  const s = m.style
  const font = markFont(s)
  const lines = labelLines(m.text)
  const lh = s.textSize * LINE_HEIGHT * PT
  const cap = fontBox(font, s.textSize).cap
  const block = (lines.length - 1) * lh
  const first = r.y + r.h / 2 - block / 2 + cap / 2
  return lines.map((_, i) => first + i * lh)
}

/**
 * Where a label's leader leaves its box: the point on the box outline nearest the leader's end (kept off the rounded
 * corners), so the leader re-attaches to the nearest edge whenever the label moves.
 */
export function leaderStart(box: Rect, radius: number, end: Pt): Pt | null {
  if (end[0] > box.x && end[0] < box.x + box.w && end[1] > box.y && end[1] < box.y + box.h) return null
  const inset = Math.min(radius, box.w / 2, box.h / 2)
  const x = Math.max(box.x + inset, Math.min(end[0], box.x + box.w - inset))
  const y = Math.max(box.y + inset, Math.min(end[1], box.y + box.h - inset))
  // The edge the end is beyond, by the larger excess.
  const dx = end[0] < box.x ? box.x - end[0] : end[0] > box.x + box.w ? end[0] - box.x - box.w : 0
  const dy = end[1] < box.y ? box.y - end[1] : end[1] > box.y + box.h ? end[1] - box.y - box.h : 0
  if (dx >= dy) return [end[0] < box.x ? box.x : box.x + box.w, y]
  return [x, end[1] < box.y ? box.y : box.y + box.h]
}

/** A badge's radius, inches. */
export const badgeRadius = (s: Pick<MarkStyle, 'textSize'>) => s.textSize * 0.95 * PT

// --- Bounds, hit test ----------------------------------------------------------------------------------

/** The mark's points in the view (outline points for boxes), for bounds and snapping. */
export function markViewPoints(f: MarkFrame, m: Mark): Pt[] {
  switch (m.kind) {
    case 'rect': case 'ellipse': case 'redaction':
      return boxCorners(boxToView(f, m.box, m.kind === 'redaction' ? 0 : m.angle))
    case 'highlight': case 'pen':
      return m.points.map((q) => toView(f, q))
    case 'line': case 'arrow':
      return [toView(f, m.from), toView(f, m.to)]
    case 'label': {
      const r = labelRect(f, m)
      const out: Pt[] = [[r.x, r.y], [r.x + r.w, r.y + r.h]]
      if (m.leader) out.push(toView(f, m.leader))
      return out
    }
    case 'badge': {
      const [cx, cy] = toView(f, m.at)
      const r = badgeRadius(m.style)
      return [[cx - r, cy - r], [cx + r, cy + r]]
    }
  }
}

/** Axis-aligned bounds in the view (inches). */
export function markBounds(f: MarkFrame, m: Mark): Rect {
  const pts = markViewPoints(f, m)
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

/** The part of a label or badge that is its body (box or circle), without the leader. */
export function bodyRect(f: MarkFrame, m: Mark): Rect {
  if (m.kind === 'label') return labelRect(f, m)
  return markBounds(f, m)
}

export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)
}

const inRect = (p: Pt, r: Rect, tol = 0) => p[0] >= r.x - tol && p[0] <= r.x + r.w + tol && p[1] >= r.y - tol && p[1] <= r.y + r.h + tol

/** Whether a view point is on the mark (within `tol` inches of a line, or inside a filled shape / label / badge). */
export function hitMark(f: MarkFrame, m: Mark, p: Pt, tol: number): boolean {
  const half = (m.style.width * PT) / 2
  switch (m.kind) {
    case 'rect': case 'ellipse': case 'redaction': {
      const g = boxToView(f, m.box, m.kind === 'redaction' ? 0 : m.angle)
      const [lx, ly] = boxLocal(g, p)
      const w = g.w / 2
      const h = g.h / 2
      const filled = m.kind === 'redaction' || m.style.fill !== null
      if (m.kind === 'ellipse') {
        const k = Math.hypot(lx / Math.max(w, 1e-9), ly / Math.max(h, 1e-9))
        if (filled && k <= 1) return true
        return Math.abs(k - 1) * Math.min(w, h) <= tol + half
      }
      const inside = Math.abs(lx) <= w && Math.abs(ly) <= h
      if (filled && inside) return true
      const edge = Math.min(Math.abs(Math.abs(lx) - w), Math.abs(Math.abs(ly) - h))
      return Math.abs(lx) <= w + tol + half && Math.abs(ly) <= h + tol + half && edge <= tol + half
    }
    case 'highlight': case 'pen': case 'line': case 'arrow': {
      const pts = markViewPoints(f, m)
      for (let i = 1; i < pts.length; i++) if (distToSegment(p, pts[i - 1], pts[i]) <= tol + half) return true
      return false
    }
    case 'label': {
      const r = labelRect(f, m)
      if (inRect(p, r, tol)) return true
      if (m.leader) {
        const end = toView(f, m.leader)
        const start = leaderStart(r, labelRadius(m, r), end)
        if (start && distToSegment(p, start, end) <= tol + half) return true
      }
      return false
    }
    case 'badge': {
      const c = toView(f, m.at)
      return Math.hypot(p[0] - c[0], p[1] - c[1]) <= badgeRadius(m.style) + tol
    }
  }
}

/** The top-most mark under a view point (highest z first), or null. */
export function markAt(f: MarkFrame, marks: readonly Mark[], p: Pt, tol: number): Mark | null {
  const sorted = [...marks].sort((a, b) => b.z - a.z)
  return sorted.find((m) => hitMark(f, m, p, tol)) ?? null
}

/** Marks whose bounds lie wholly inside a view rectangle (rubber-band select). */
export function marksInside(f: MarkFrame, marks: readonly Mark[], r: Rect): Mark[] {
  return marks.filter((m) => {
    const b = markBounds(f, m)
    return b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h
  })
}

// --- Handles ----------------------------------------------------------------------------------------------

export type BoxHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export type MarkHandle = BoxHandle | 'rotate' | 'from' | 'to' | 'leader'
export const BOX_HANDLES: BoxHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/** Distance of the turn handle above a box's top edge, inches. */
export const ROTATE_GAP = 0.25

const handleLocal = (h: BoxHandle, w: number, hh: number): Pt => [h.includes('w') ? -w : h.includes('e') ? w : 0, h.includes('n') ? -hh : h.includes('s') ? hh : 0]

/** The handles a selected mark shows, in the view. `gap` = the turn handle's distance above the box. */
export function markHandles(f: MarkFrame, m: Mark, gap = ROTATE_GAP): { h: MarkHandle; at: Pt }[] {
  switch (m.kind) {
    case 'rect': case 'ellipse': case 'redaction': {
      const g = boxToView(f, m.box, m.kind === 'redaction' ? 0 : m.angle)
      const out = BOX_HANDLES.map((h) => ({ h: h as MarkHandle, at: boxPoint(g, handleLocal(h, g.w / 2, g.h / 2)) }))
      if (m.kind !== 'redaction') out.push({ h: 'rotate', at: boxPoint(g, [0, -g.h / 2 - gap]) })
      return out
    }
    case 'line': case 'arrow':
      return [{ h: 'from', at: toView(f, m.from) }, { h: 'to', at: toView(f, m.to) }]
    case 'highlight':
      if (m.straight) return [{ h: 'from', at: toView(f, m.points[0]) }, { h: 'to', at: toView(f, m.points[m.points.length - 1]) }]
      return freehandHandles(f, m)
    case 'pen':
      return freehandHandles(f, m)
    case 'label':
      return m.leader ? [{ h: 'leader', at: toView(f, m.leader) }] : []
    case 'badge':
      return []
  }
}

function freehandHandles(f: MarkFrame, m: Mark): { h: MarkHandle; at: Pt }[] {
  const b = markBounds(f, m)
  return (['nw', 'ne', 'se', 'sw'] as BoxHandle[]).map((h) => ({ h, at: [h.includes('w') ? b.x : b.x + b.w, h.includes('n') ? b.y : b.y + b.h] as Pt }))
}

// --- Edits --------------------------------------------------------------------------------------------------

const movePt = (f: MarkFrame, q: readonly [number, number], d: Pt): Pt => clampPt(toFrac(f, [toView(f, q)[0] + d[0], toView(f, q)[1] + d[1]]))

/** A stored box moved by whole fractions, kept on the picture with its size. */
function shiftBox(b: FracBox, du: number, dv: number): FracBox {
  const w = b.x1 - b.x0
  const h = b.y1 - b.y0
  const x0 = Math.min(Math.max(b.x0 + du, 0), 1 - w)
  const y0 = Math.min(Math.max(b.y0 + dv, 0), 1 - h)
  return { x0, y0, x1: x0 + w, y1: y0 + h }
}

/** The stored-fraction shift of a view shift (the turn and crop scale it). */
function fracDelta(f: MarkFrame, d: Pt): Pt {
  const o = toFrac(f, [f.x, f.y])
  const e = toFrac(f, [f.x + d[0], f.y + d[1]])
  return [e[0] - o[0], e[1] - o[1]]
}

/**
 * A mark moved by `d` view inches. Points stay on the picture; a box keeps its size. Freehand strokes move as a whole
 * (by the largest shift that keeps every point on the picture), so they never squash against an edge.
 */
export function moveMark(f: MarkFrame, m: Mark, d: Pt): Mark {
  const [du, dv] = fracDelta(f, d)
  switch (m.kind) {
    case 'rect': case 'ellipse': case 'redaction':
      return { ...m, box: shiftBox(m.box, du, dv) }
    case 'highlight': case 'pen': {
      const xs = m.points.map((q) => q[0])
      const ys = m.points.map((q) => q[1])
      const su = Math.min(Math.max(du, -Math.min(...xs)), 1 - Math.max(...xs))
      const sv = Math.min(Math.max(dv, -Math.min(...ys)), 1 - Math.max(...ys))
      return { ...m, points: m.points.map((q) => clampPt([q[0] + su, q[1] + sv])) }
    }
    case 'line': case 'arrow':
      return { ...m, from: movePt(f, m.from, d), to: movePt(f, m.to, d) }
    case 'label':
      // The leader's end stays where it points; only the label moves.
      return { ...m, at: movePt(f, m.at, d) }
    case 'badge':
      return { ...m, at: movePt(f, m.at, d) }
  }
}

/** Snap a turn to 15 degree steps. */
export const snapAngle = (a: number, step = 15) => Math.round(a / step) * step

/**
 * A mark after dragging one of its handles to view point `p` (from the mark as it was when the drag started).
 * `lock` (Shift): boxes keep their shape, turns go in 15 degree steps, line ends hold to 0 / 45 / 90 degrees.
 */
export function dragHandle(f: MarkFrame, m: Mark, h: MarkHandle, p: Pt, lock = false): Mark {
  switch (m.kind) {
    case 'rect': case 'ellipse': case 'redaction': {
      const g = boxToView(f, m.box, m.kind === 'redaction' ? 0 : m.angle)
      if (h === 'rotate') {
        if (m.kind === 'redaction') return m
        const a = (Math.atan2(p[1] - g.c[1], p[0] - g.c[0]) * 180) / Math.PI + 90
        return { ...m, angle: normAngle(lock ? snapAngle(a) : a) }
      }
      if (!BOX_HANDLES.includes(h as BoxHandle)) return m
      const r = resizeBox(g, h as BoxHandle, p, lock)
      const back = viewToBox(f, r)
      return m.kind === 'redaction' ? { ...m, box: back.box } : { ...m, box: back.box, angle: back.angle }
    }
    case 'line': case 'arrow': {
      const other = toView(f, h === 'from' ? m.to : m.from)
      const q = clampPt(toFrac(f, lock ? lockAngle(other, p) : p))
      if (h === 'from') return { ...m, from: q }
      if (h === 'to') return { ...m, to: q }
      return m
    }
    case 'highlight':
      if (m.straight && (h === 'from' || h === 'to')) {
        const pts = m.points
        const other = toView(f, h === 'from' ? pts[pts.length - 1] : pts[0])
        const q = clampPt(toFrac(f, lock ? lockAngle(other, p) : p))
        return { ...m, points: h === 'from' ? [q, pts[pts.length - 1]] : [pts[0], q] }
      }
      return scaleFreehand(f, m, h, p)
    case 'pen':
      return scaleFreehand(f, m, h, p)
    case 'label':
      return h === 'leader' ? { ...m, leader: clampPt(toFrac(f, p)) } : m
    case 'badge':
      return m
  }
}

/** A view box resized by dragging a handle to `p`: the opposite side or corner stays put, in the box's own frame. */
export function resizeBox(g: BoxGeom, h: BoxHandle, p: Pt, keepShape = false): BoxGeom {
  const w = g.w / 2
  const hh = g.h / 2
  const [px, py] = boxLocal(g, p)
  let x0 = -w
  let x1 = w
  let y0 = -hh
  let y1 = hh
  if (h.includes('w')) x0 = Math.min(px, x1 - MIN_BOX)
  if (h.includes('e')) x1 = Math.max(px, x0 + MIN_BOX)
  if (h.includes('n')) y0 = Math.min(py, y1 - MIN_BOX)
  if (h.includes('s')) y1 = Math.max(py, y0 + MIN_BOX)
  if (keepShape && g.w > 0 && g.h > 0 && (h.length === 2)) {
    const aspect = g.w / g.h
    const nw = x1 - x0
    const nh = y1 - y0
    if (nw / nh > aspect) {
      const want = nw / aspect
      if (h.includes('n')) y0 = y1 - want
      else y1 = y0 + want
    } else {
      const want = nh * aspect
      if (h.includes('w')) x0 = x1 - want
      else x1 = x0 + want
    }
  }
  const c = boxPoint(g, [(x0 + x1) / 2, (y0 + y1) / 2])
  return { c, w: x1 - x0, h: y1 - y0, a: g.a }
}

/** A freehand stroke scaled by dragging a corner of its bounds (the opposite corner stays put). */
function scaleFreehand<M extends Extract<Mark, { kind: 'highlight' | 'pen' }>>(f: MarkFrame, m: M, h: MarkHandle, p: Pt): M {
  if (!['nw', 'ne', 'se', 'sw'].includes(h)) return m
  const b = markBounds(f, m)
  const fx = h.includes('w') ? b.x + b.w : b.x
  const fy = h.includes('n') ? b.y + b.h : b.y
  const ox = h.includes('w') ? b.x : b.x + b.w
  const oy = h.includes('n') ? b.y : b.y + b.h
  const sx = Math.abs(ox - fx) < 1e-9 ? 1 : (p[0] - fx) / (ox - fx)
  const sy = Math.abs(oy - fy) < 1e-9 ? 1 : (p[1] - fy) / (oy - fy)
  const kx = Math.max(0.05, sx)
  const ky = Math.max(0.05, sy)
  return { ...m, points: m.points.map((q) => {
    const v = toView(f, q)
    return clampPt(toFrac(f, [fx + (v[0] - fx) * kx, fy + (v[1] - fy) * ky]))
  }) }
}

/** `p` held to the nearest 0 / 45 / 90 degree line through `from` (the straight highlighter and line ends with Shift). */
export function lockAngle(from: Pt, p: Pt, step = 45): Pt {
  const dx = p[0] - from[0]
  const dy = p[1] - from[1]
  const len = Math.hypot(dx, dy)
  if (len === 0) return p
  const a = Math.round(Math.atan2(dy, dx) / ((step * Math.PI) / 180)) * ((step * Math.PI) / 180)
  // Keep the length along the held direction (the projection), so the stroke ends under the pointer's reach.
  const k = dx * Math.cos(a) + dy * Math.sin(a)
  return [from[0] + Math.cos(a) * k, from[1] + Math.sin(a) * k]
}

// --- Freehand strokes ------------------------------------------------------------------------------------------

/** Ramer-Douglas-Peucker: the stroke with the points that change its shape by less than `tol` left out. */
export function simplify(pts: readonly Pt[], tol: number): Pt[] {
  if (pts.length <= 2) return pts.map((p) => [p[0], p[1]] as Pt)
  let worst = 0
  let at = 0
  const a = pts[0]
  const b = pts[pts.length - 1]
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distToSegment(pts[i], a, b)
    if (d > worst) {
      worst = d
      at = i
    }
  }
  if (worst <= tol) return [[a[0], a[1]], [b[0], b[1]]]
  const left = simplify(pts.slice(0, at + 1), tol)
  const right = simplify(pts.slice(at), tol)
  return [...left.slice(0, -1), ...right]
}

/**
 * A freehand stroke drawn in the view, as stored points: jitter smoothed (each point averaged with its neighbours),
 * then simplified to about `tol` inches. The page draws it as a smooth curve through them (smoothCurve).
 */
export function finishStroke(f: MarkFrame, view: readonly Pt[], tol = 0.008): Pt[] {
  const avg: Pt[] = view.map((p, i) => {
    if (i === 0 || i === view.length - 1) return p
    const a = view[i - 1]
    const b = view[i + 1]
    return [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4]
  })
  const out = simplify(avg, tol).map((p) => clampPt(toFrac(f, p)))
  if (out.length === 1) out.push([...out[0]])
  return out
}

/** Catmull-Rom curve through the points as cubic Bezier segments: [start, c1, c2, end] per segment. */
export function smoothCurve(pts: readonly Pt[]): [Pt, Pt, Pt, Pt][] {
  const out: [Pt, Pt, Pt, Pt][] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    out.push([p1, [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6], p2])
  }
  return out
}

// --- Snapping (labels and shapes line up) ------------------------------------------------------------------

export interface SnapTargets {
  xs: number[]
  ys: number[]
}

/** What a moved box lines up with: the picture's edges and centre, and every other mark's edges and centre. */
export function snapTargets(f: MarkFrame, marks: readonly Mark[], skip: ReadonlySet<string>): SnapTargets {
  const xs = [f.x, f.x + f.w / 2, f.x + f.w]
  const ys = [f.y, f.y + f.h / 2, f.y + f.h]
  for (const m of marks) {
    if (skip.has(m.id)) continue
    const b = bodyRect(f, m)
    xs.push(b.x, b.x + b.w / 2, b.x + b.w)
    ys.push(b.y, b.y + b.h / 2, b.y + b.h)
  }
  return { xs, ys }
}

export interface MoveSnap {
  d: Pt
  /** The lines snapped to (alignment guides), view inches. */
  guideX: number | null
  guideY: number | null
}

/**
 * The move `d` adjusted so the moved bounds' left, centre or right (top, middle or bottom) line up with the nearest
 * target within `tol`; each axis on its own. `free` (Shift): as it is.
 */
export function snapMove(bounds: Rect, d: Pt, t: SnapTargets, tol: number, free = false): MoveSnap {
  if (free) return { d, guideX: null, guideY: null }
  const best = (vals: number[], targets: number[]) => {
    let out: { shift: number; at: number } | null = null
    for (const v of vals) for (const g of targets) {
      const s = g - v
      if (Math.abs(s) <= tol && (!out || Math.abs(s) < Math.abs(out.shift))) out = { shift: s, at: g }
    }
    return out
  }
  const bx = bounds.x + d[0]
  const by = bounds.y + d[1]
  const sx = best([bx, bx + bounds.w / 2, bx + bounds.w], t.xs)
  const sy = best([by, by + bounds.h / 2, by + bounds.h], t.ys)
  return { d: [d[0] + (sx?.shift ?? 0), d[1] + (sy?.shift ?? 0)], guideX: sx?.at ?? null, guideY: sy?.at ?? null }
}

/** Snap points for drawing new marks: the picture's corners, edge middles and centre, every mark's corners and centre. */
export function snapPoints(f: MarkFrame, marks: readonly Mark[]): Pt[] {
  const out: Pt[] = []
  const box = (r: Rect) => {
    for (const x of [r.x, r.x + r.w / 2, r.x + r.w]) for (const y of [r.y, r.y + r.h / 2, r.y + r.h]) out.push([x, y])
  }
  box(f)
  for (const m of marks) {
    if (m.kind === 'line' || m.kind === 'arrow') out.push(...markViewPoints(f, m))
    else if (m.kind === 'rect' || m.kind === 'ellipse' || m.kind === 'redaction') {
      const g = boxToView(f, m.box, m.kind === 'redaction' ? 0 : m.angle)
      out.push(...boxCorners(g), g.c)
    } else box(bodyRect(f, m))
  }
  return out
}

/** The nearest snap point within `tol`, else the alignment with one (same x or y), else `p`. Shift = free. */
export function snapPoint(p: Pt, pts: readonly Pt[], tol: number, free = false): { pt: Pt; to: Pt | null; guideX: number | null; guideY: number | null } {
  if (free) return { pt: p, to: null, guideX: null, guideY: null }
  let near: Pt | null = null
  let nd = tol
  for (const q of pts) {
    const d = Math.hypot(q[0] - p[0], q[1] - p[1])
    if (d <= nd) {
      nd = d
      near = q
    }
  }
  if (near) return { pt: [near[0], near[1]], to: near, guideX: near[0], guideY: near[1] }
  let gx: number | null = null
  let gy: number | null = null
  let dx = tol
  let dy = tol
  for (const q of pts) {
    if (Math.abs(q[0] - p[0]) < dx) {
      dx = Math.abs(q[0] - p[0])
      gx = q[0]
    }
    if (Math.abs(q[1] - p[1]) < dy) {
      dy = Math.abs(q[1] - p[1])
      gy = q[1]
    }
  }
  return { pt: [gx ?? p[0], gy ?? p[1]], to: null, guideX: gx, guideY: gy }
}
