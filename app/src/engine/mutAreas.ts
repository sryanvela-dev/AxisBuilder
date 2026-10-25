// MUT areas (Phase 5c): small manual-UT areas drawn in the preview on the shell or on a head view, stored on their MUT
// row (`area`, data/schema.ts). This file turns them into what every output draws: the outline (across the seam in
// pieces, like scans), the hatch with islands left empty (scans, objects, nozzles and labels inside the area, like CAD's
// hatch island detection), the MUT ID at the most open spot inside (outside with a leader when it doesn't fit), the
// hatched area for the coverage % (shell only), and the Review problems. The preview, Sheets view, PDF, report images,
// the .lsp and later the DXF all read `mutAreaLayouts`, so they agree.
//
// Frames: shell areas are stored in logical inches (X around, Y along); head areas in head radii from the head's center
// as the head view reads (u toward 3 o'clock, v toward 12 o'clock). The drawing tool works as the drawing reads (the
// visual frame, engine/snap.ts); `areaFrame` converts.

import { rowOverride } from '../data/overrides.ts'
import type { HeadMut, MutArea, Project, ShellMut } from '../data/schema.ts'
import { drawnScans, panelOf, shouldShowHead } from './layout.ts'
import { headNozzleLabels, offsetPoint, shellNozzleLabels, type NozzleLabel } from './labels.ts'
import {
  boxOf, boxTouchesPolygon, circlePolygon, enclosingBoundary, hatchLines, hatchedArea, labelSpot,
  pointInPolygon, polygonArea, rectPolygon, selfIntersects, type Box, type Poly, type Pt,
} from './polygon.ts'
import type { SnapCircle, SnapGeom } from './snap.ts'
import { sizedHeight, textSizeRules } from './styles.ts'
import { headVector, toLogical, toVisual, type Orientation } from './transform.ts'
import { circumference, nozzlePieces, objectPieces, scanPieces, shellAreaPieces } from './wrap.ts'

export type MutList = 'shellMut' | 'headMut'
export type HeadName = 'HEAD 1' | 'HEAD 2'

/** The row's area when it can be drawn (3 corners or more), else null. */
/** How close to the head edge (in head radii) a corner must be to count as on it. */
const RIM_TOL = 2e-3
const onRim = (q: readonly number[]) => Math.abs(Math.hypot(q[0], q[1]) - 1) <= RIM_TOL

/**
 * A head area's outline as drawn (head radii): an edge between two corners that are both on the head edge follows the
 * head circle (the shorter way round) instead of cutting across it, so a few clicks on the rim hug the head. A corner
 * just inside the edge keeps a straight edge.
 */
export function headOutline(pts: readonly (readonly number[])[]): Pt[] {
  const out: Pt[] = []
  const step = (3 * Math.PI) / 180
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    out.push([a[0], a[1]])
    if (pts.length < 2 || !onRim(a) || !onRim(b)) continue
    const ta = Math.atan2(a[1], a[0])
    let d = Math.atan2(b[1], b[0]) - ta
    while (d > Math.PI) d -= 2 * Math.PI
    while (d < -Math.PI) d += 2 * Math.PI
    const n = Math.ceil(Math.abs(d) / step)
    for (let k = 1; k < n; k++) out.push([Math.cos(ta + (d * k) / n), Math.sin(ta + (d * k) / n)])
  }
  return out
}

/**
 * The opposite for an outline found by Pick inside on a head: a run of corners along the head edge is kept as its two
 * ends plus a corner at least every 90 degrees (so the shorter way round is the right way), and headOutline draws the
 * circle between them again.
 */
export function compactRim(pts: readonly Pt[]): Pt[] {
  const n = pts.length
  if (n < 4 || pts.every((q) => onRim(q))) return [...pts]
  const keep = pts.map((q, i) => !onRim(q) || !onRim(pts[(i + n - 1) % n]) || !onRim(pts[(i + 1) % n]))
  // Within each run, keep a corner whenever the arc from the last kept one would pass 90 degrees.
  const start = keep.indexOf(true)
  let last = pts[start]
  for (let k = 1; k <= n; k++) {
    const i = (start + k) % n
    if (keep[i]) {
      last = pts[i]
      continue
    }
    const next = pts[(i + 1) % n]
    const ang = (p: Pt, q: Pt) => Math.abs(Math.atan2(p[0] * q[1] - p[1] * q[0], p[0] * q[0] + p[1] * q[1]))
    if (ang(last, next) > Math.PI / 2) {
      keep[i] = true
      last = pts[i]
    }
  }
  return pts.filter((_, i) => keep[i])
}

export function drawableArea(m: ShellMut | HeadMut): MutArea | null {
  return m.area && m.area.length >= 3 ? m.area : null
}

const fmtNum = (n: number) => String(Math.round(n * 1000) / 1000)

// --- Frames ------------------------------------------------------------------------------------------

/** A head view's frame: its center (logical), radius as drawn, and the logical directions of 3 and 12 o'clock. */
export interface HeadFrame {
  c: Pt
  r: number
  e3: Pt
  e12: Pt
}

export function headFrame(p: Project, head: HeadName): HeadFrame | null {
  if (p.vessel.height === null || p.vessel.length === null || !(p.vessel.height > 0)) return null
  if (!shouldShowHead(p.settings.headViewMode, head)) return null
  const { headDia, panel } = panelOf(p)
  const o = p.vessel.orientation as Orientation
  const c: Pt = head === 'HEAD 1' ? [panel.head1X, panel.head1Y] : [panel.head2X, panel.head2Y]
  return { c, r: headDia / 2, e3: headVector(o, 90), e12: headVector(o, 0) }
}

export const headToLogical = (f: HeadFrame, q: Pt): Pt => [f.c[0] + f.r * (q[0] * f.e3[0] + q[1] * f.e12[0]), f.c[1] + f.r * (q[0] * f.e3[1] + q[1] * f.e12[1])]
export function logicalToHead(f: HeadFrame, q: Pt): Pt {
  const d: Pt = [(q[0] - f.c[0]) / f.r, (q[1] - f.c[1]) / f.r]
  return [d[0] * f.e3[0] + d[1] * f.e3[1], d[0] * f.e12[0] + d[1] * f.e12[1]]
}

/** Where an area is drawn: on the shell, or on one head view. */
export type AreaTarget = { kind: 'shell' } | { kind: 'head'; head: HeadName }

export function targetOf(list: MutList, m: ShellMut | HeadMut): AreaTarget {
  return list === 'shellMut' ? { kind: 'shell' } : { kind: 'head', head: (m as HeadMut).head }
}

/** Converts between what is stored and the visual frame the drawing tool works in. null: the target isn't drawn. */
export interface AreaFrame {
  toStored: (v: Pt) => Pt
  toVisual: (s: Pt) => Pt
  /** Stored -> logical (where the drawing draws it). */
  toLogical: (s: Pt) => Pt
}

const round = (v: number, k: number) => Math.round(v * k) / k

export function areaFrame(p: Project, t: AreaTarget): AreaFrame | null {
  const o = p.vessel.orientation as Orientation
  if (t.kind === 'shell') {
    return {
      toStored: (v) => {
        const [x, y] = toLogical(o, v[0], v[1])
        return [round(x, 1000), round(y, 1000)]
      },
      toVisual: (s) => toVisual(o, s[0], s[1]),
      toLogical: (s) => s,
    }
  }
  const f = headFrame(p, t.head)
  if (!f) return null
  return {
    toStored: (v) => {
      const q = logicalToHead(f, toLogical(o, v[0], v[1]))
      return [round(q[0], 1e5), round(q[1], 1e5)]
    },
    toVisual: (s) => {
      const q = headToLogical(f, s)
      return toVisual(o, q[0], q[1])
    },
    toLogical: (s) => headToLogical(f, s),
  }
}

/** Which target a visual point is on: inside a head circle that is drawn, else the shell. */
export function targetAt(p: Project, v: Pt): AreaTarget {
  const o = p.vessel.orientation as Orientation
  for (const head of ['HEAD 1', 'HEAD 2'] as const) {
    const f = headFrame(p, head)
    if (!f) continue
    const c = toVisual(o, f.c[0], f.c[1])
    if (Math.hypot(v[0] - c[0], v[1] - c[1]) <= f.r) return { kind: 'head', head }
  }
  return { kind: 'shell' }
}

// --- Pieces across the seam ----------------------------------------------------------------------------

export { shellAreaPieces }

// --- Labels --------------------------------------------------------------------------------------------

/** The text layer of an area's label. */
export const areaTextLayer = (list: MutList) => (list === 'shellMut' ? 'SHELL_MUT_TEXT' : 'HEAD_MUT_TEXT')

/** The Min. T line under the ID ("Setting: Show Min T under the MUT ID"), or null. */
export function areaSubText(p: Project, m: ShellMut | HeadMut): string | null {
  return p.settings.showMutMinT && m.minT !== null ? `MIN T ${fmtNum(m.minT)}` : null
}

/** The Min. T line's height as a share of the ID's (the same: CAD sizes every text on a layer alike), and the gap between the lines. */
export const SUB_SCALE = 1
const SUB_GAP = 0.5

/** The label's box as the drawing reads ([width, height]; text reads upright), for an ID of height sh. */
export function areaLabelSize(txt: string, sub: string | null, sh: number): [number, number] {
  const w = Math.max(1, txt.length) * sh * 0.6
  if (sub === null) return [w, sh]
  return [Math.max(w, sub.length * sh * SUB_SCALE * 0.6), sh * (1 + SUB_GAP + SUB_SCALE)]
}

/** The two text lines' centers (as the drawing reads) relative to the label center: ID up, Min. T down. */
export function areaLineOffsets(sh: number, sub: string | null): { id: number; sub: number } {
  if (sub === null) return { id: 0, sub: 0 }
  const total = sh * (1 + SUB_GAP + SUB_SCALE)
  return { id: total / 2 - sh / 2, sub: -total / 2 + (sh * SUB_SCALE) / 2 }
}

/** The label box (logical) of a label centered at c, w x h as the drawing reads. */
function logicalBox(o: Orientation, c: Pt, w: number, h: number): Box {
  const v = toVisual(o, c[0], c[1])
  const a = toLogical(o, v[0] - w / 2, v[1] - h / 2)
  const b = toLogical(o, v[0] + w / 2, v[1] + h / 2)
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]
}

const boxPoly = (b: Box): Poly => rectPolygon(b[0], b[1], b[2], b[3])

// --- The layout ----------------------------------------------------------------------------------------

export interface MutAreaLayout {
  list: MutList
  index: number
  id: string
  target: AreaTarget
  /** Outline pieces as drawn, logical (shell: clipped to the shell and wrapped across the seam). */
  pieces: Poly[]
  /** The piece that carries the label. */
  labelPiece: number
  /** Label: the automatic center (logical), the point an outside label's leader goes to, whether it fits inside. */
  auto: Pt
  open: Pt
  inside: boolean
  /** Text heights (the ID's, after the Drawing step's size; before it) and the Min. T line. */
  sh: number
  th: number
  sub: string | null
  /** The label box as the drawing reads. */
  w: number
  h: number
  /** Where the label is drawn (after a move by hand) and whether it was moved. */
  at: Pt
  moved: boolean
  /** Hatch lines, logical, with the islands left empty. */
  hatch: [Pt, Pt][]
  /** Shell: the hatched part counted in the coverage % (sq in): the area on the shell minus scans, objects and nozzles in it. */
  coverageArea: number
}

const cache = new WeakMap<Project, MutAreaLayout[]>()

/** Every MUT area that is drawn, in row order (shell MUT, then head MUT). Cached per project version. */
export function mutAreaLayouts(p: Project): MutAreaLayout[] {
  let out = cache.get(p)
  if (!out) {
    out = buildLayouts(p)
    cache.set(p, out)
  }
  return out
}

export function hasMutAreas(p: Project): boolean {
  return p.shellMut.some((m) => drawableArea(m)) || p.headMut.some((m) => drawableArea(m))
}

/** The layout of one row's area, or undefined when it has none drawn. */
export function mutAreaOf(p: Project, list: MutList, index: number): MutAreaLayout | undefined {
  return mutAreaLayouts(p).find((a) => a.list === list && a.index === index)
}

/** What an area's hatch keeps clear of, logical: label boxes separately (they don't reduce the coverage). */
interface Islands {
  solid: Poly[]
  text: Poly[]
}

function shellIslands(p: Project, nozzles: Map<number, NozzleLabel>): Islands {
  const s = p.settings
  const o = p.vessel.orientation as Orientation
  const C = circumference(p)
  const solid: Poly[] = []
  const text: Poly[] = []
  for (const sc of drawnScans(p)) {
    if (!sc.include || sc.xStart === null || sc.xStop === null || sc.yStart === null || sc.yStop === null) continue
    for (const pc of scanPieces(sc, C)) {
      const b: Box = [Math.min(pc.x0, pc.x1), Math.min(sc.yStart, sc.yStop), Math.max(pc.x0, pc.x1), Math.max(sc.yStart, sc.yStop)]
      if (b[2] > b[0] && b[3] > b[1]) solid.push(boxPoly(b))
    }
  }
  if (s.showSupportsOnOverlay) {
    for (const ob of p.objects) {
      if (!ob.include || ob.x === null || ob.y === null || ob.circWidth === null || ob.length === null) continue
      for (const pc of objectPieces(ob, C)) solid.push(boxPoly([pc.x0, ob.y, pc.x1, ob.y + ob.length]))
    }
  }
  for (const [index, l] of nozzles) {
    const n = p.shellNozzles[index]
    const pieces = n && C !== null ? nozzlePieces(n, C) : [{ cx: l.x, cy: l.y, r: l.r, arc: null }]
    for (const pc of pieces) solid.push(circlePolygon(pc.cx, pc.cy, pc.r))
    if (l.txt !== '') text.push(boxPoly(logicalBox(o, [l.tx, l.ty], l.tw, l.sh)))
  }
  return { solid, text }
}

function headIslands(p: Project, head: HeadName, nozzles: Map<number, NozzleLabel>): Islands {
  const o = p.vessel.orientation as Orientation
  const solid: Poly[] = []
  const text: Poly[] = []
  for (const [index, l] of nozzles) {
    if (p.headNozzles[index]?.head !== head) continue
    solid.push(circlePolygon(l.x, l.y, l.r))
    if (l.txt !== '') text.push(boxPoly(logicalBox(o, [l.tx, l.ty], l.tw, l.sh)))
  }
  return { solid, text }
}

function buildLayouts(p: Project): MutAreaLayout[] {
  if (!hasMutAreas(p) || p.vessel.height === null || p.vessel.length === null || !(p.vessel.height > 0) || !(p.vessel.length > 0)) return []
  const s = p.settings
  const o = p.vessel.orientation as Orientation
  const rules = textSizeRules(s)
  const step = s.autHatchScale > 0 ? s.autHatchScale : 2.5
  const out: MutAreaLayout[] = []
  const anyShell = p.shellMut.some((m) => drawableArea(m))
  const anyHead = p.headMut.some((m) => drawableArea(m) && m.include)
  const shellNoz = anyShell ? shellNozzleLabels(p, drawnScans(p)) : new Map<number, NozzleLabel>()
  const headNoz = anyHead && s.headViewMode !== 'NONE' ? (() => {
    const { headDia, panel } = panelOf(p)
    return headNozzleLabels(p, panel, headDia)
  })() : new Map<number, NozzleLabel>()
  const shellIsl = anyShell ? shellIslands(p, shellNoz) : { solid: [], text: [] }
  const L = p.vessel.length
  const C = p.vessel.height

  const place = (list: MutList, index: number, m: ShellMut | HeadMut, pieces: Poly[], isl: Islands, inShell: boolean) => {
    if (pieces.length === 0) return
    let labelPiece = 0
    pieces.forEach((pc, i) => {
      if (polygonArea(pc) > polygonArea(pieces[labelPiece]) + 1e-9) labelPiece = i
    })
    const layer = areaTextLayer(list)
    const th = 1.5
    const sh = sizedHeight(rules, layer, th)
    const sub = areaSubText(p, m)
    const [w, h] = areaLabelSize(m.id, sub, sh)
    const piece = pieces[labelPiece]
    const [lw, lh] = o === 'Vertical' ? [w, h] : [h, w]
    const islands = [...isl.solid, ...isl.text]
    const spot = labelSpot(piece, islands, lw, lh)
    let auto = spot.at
    if (!spot.fits) auto = outsideSpot(o, piece, islands, w, h, inShell ? [0, 0, C, L] : null)
    // A move by hand: the same rule as placeTextLabel (engine/textLabels.ts), so the hatch gap follows the label.
    const ov = m.id === '' ? undefined : rowOverride(p, list, index)
    let at = auto
    let moved = false
    if (ov && ov.label !== null && ov.label !== 'inside') {
      const q = offsetPoint(o, auto, ov.label)
      if (!inShell || (q[0] >= 0 && q[1] >= 0 && q[0] <= C && q[1] <= L)) [at, moved] = [q, true]
    }
    const own = m.id === '' ? [] : [boxPoly(logicalBox(o, at, w, h))]
    const hatch = pieces.flatMap((pc) => hatchLines(pc, [...islands, ...own], step))
    const coverageArea = inShell ? pieces.reduce((a, pc) => a + hatchedArea(pc, isl.solid, [0, L]), 0) : 0
    out.push({
      list, index, id: m.id, target: targetOf(list, m), pieces, labelPiece, auto, open: spot.open, inside: spot.fits, sh, th, sub, w, h, at, moved, hatch, coverageArea,
    })
  }

  p.shellMut.forEach((m, index) => {
    const pts = drawableArea(m)
    if (!pts) return
    place('shellMut', index, m, shellAreaPieces(p, pts), shellIsl, true)
  })
  if (s.headViewMode !== 'NONE') {
    p.headMut.forEach((m, index) => {
      const pts = drawableArea(m)
      if (!pts || !m.include) return
      const f = headFrame(p, m.head)
      if (!f) return
      place('headMut', index, m, [headOutline(pts).map((q) => headToLogical(f, q))], headIslands(p, m.head, headNoz), false)
    })
  }
  return out
}

/**
 * A label that doesn't fit inside: beside the area (right, above, left, below, then the corners, as the drawing reads),
 * the first spot clear of the area and what is around it and (shell) on the shell; else the first one.
 */
function outsideSpot(o: Orientation, piece: Poly, islands: Poly[], w: number, h: number, shell: Box | null): Pt {
  const vis = piece.map((q) => toVisual(o, q[0], q[1]))
  const b = boxOf(vis)
  const gap = Math.max(2, h)
  const mx = (b[0] + b[2]) / 2
  const my = (b[1] + b[3]) / 2
  const dx = (b[2] - b[0]) / 2 + gap + w / 2
  const dy = (b[3] - b[1]) / 2 + gap + h / 2
  const cands: Pt[] = [[mx + dx, my], [mx, my + dy], [mx - dx, my], [mx, my - dy], [mx + dx, my + dy], [mx - dx, my + dy], [mx + dx, my - dy], [mx - dx, my - dy]]
  const logical = cands.map((c) => toLogical(o, c[0], c[1]))
  for (const c of logical) {
    const box = logicalBox(o, c, w, h)
    if (shell && (box[0] < shell[0] || box[1] < shell[1] || box[2] > shell[2] || box[3] > shell[3])) continue
    if (boxTouchesPolygon(box, piece) || islands.some((isl) => boxTouchesPolygon(box, isl))) continue
    return c
  }
  return logical[0]
}

// --- Coverage, sizes and problems -----------------------------------------------------------------------

/** The hatched part of every shell MUT area (sq in), added into the coverage % (app only; head areas never count). */
export function mutCoverageArea(p: Project): number {
  return mutAreaLayouts(p).reduce((a, l) => a + (l.list === 'shellMut' ? l.coverageArea : 0), 0)
}

/**
 * An area's size in sq in on the vessel, or null when the row has none (fewer than 3 corners). Head areas are measured
 * on a flat circle of the shell's diameter (circumference / pi), so a dished head's true surface is a little larger.
 */
export function mutAreaSize(p: Project, list: MutList, m: ShellMut | HeadMut): { sqIn: number; approx: boolean } | null {
  const pts = drawableArea(m)
  if (!pts) return null
  if (list === 'shellMut') return { sqIn: polygonArea(pts), approx: false }
  const C = p.vessel.height
  if (C === null || !(C > 0)) return null
  const R = C / Math.PI / 2
  return { sqIn: polygonArea(headOutline(pts)) * R * R, approx: true }
}

/** "84 sq in", "1,230 sq in (8.5 sq ft)". */
export function formatAreaSize(sqIn: number): string {
  const n = sqIn >= 100 ? Math.round(sqIn) : Math.round(sqIn * 10) / 10
  const txt = `${n.toLocaleString('en-US')} sq in`
  return sqIn >= 144 ? `${txt} (${(Math.round((sqIn / 144) * 10) / 10).toLocaleString('en-US')} sq ft)` : txt
}

export interface AreaProblem {
  list: MutList
  index: number
  id: string
  text: string
  fix: string
}

/** What is wrong with stored areas (Review warnings; never blocks saving or export). */
export function mutAreaProblems(p: Project): AreaProblem[] {
  const out: AreaProblem[] = []
  const C = p.vessel.height
  const L = p.vessel.length
  const redraw = 'Draw the area again (MUT areas in the drawing preview), or delete it.'
  const check = (list: MutList, index: number, m: ShellMut | HeadMut) => {
    const a = m.area
    if (!a) return
    const add = (text: string, fix: string) => out.push({ list, index, id: m.id, text, fix })
    if (a.length < 3) {
      add(`The MUT area has ${a.length === 1 ? '1 corner' : `${a.length} corners`}, so it is not drawn (3 or more are needed).`, redraw)
      return
    }
    if (selfIntersects(a)) add('The MUT area\'s outline crosses itself, so the hatch may look odd.', 'Drag its corners in the drawing preview (MUT areas) so the outline does not cross, or draw it again.')
    else if (polygonArea(a) < 1e-9) add('The MUT area has no size (its corners are in a line).', redraw)
    if (list === 'shellMut' && C !== null && L !== null) {
      const b = boxOf(a)
      if (b[1] < -1e-6 || b[3] > L + 1e-6) add('Part of the MUT area is off the shell (past Y 0 or the shell length); that part is not drawn.', 'Drag its corners onto the shell in the drawing preview (MUT areas).')
      if (b[2] - b[0] >= C) add('The MUT area is as wide as the circumference or wider.', 'Check its corners in the drawing preview (MUT areas).')
    }
    if (list === 'headMut' && a.some((q) => Math.hypot(q[0], q[1]) > 1.0005)) {
      add('Part of the MUT area is outside the head circle.', 'Drag its corners inside the head in the drawing preview (MUT areas).')
    }
  }
  p.shellMut.forEach((m, i) => check('shellMut', i, m))
  p.headMut.forEach((m, i) => check('headMut', i, m))
  return out
}

/** The center of an area (logical for the shell; head radii for a head), for filling in a blank X / Y or clock. */
export function areaCenter(pts: readonly Pt[]): Pt {
  const b = boxOf(pts)
  const c: Pt = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]
  // The middle of the box, unless that is outside the area (an L shape): then the area's own centroid-ish open point.
  if (pts.length >= 3 && !pointInPolygon(pts, c)) return labelSpot(pts, [], 0, 0).open
  return c
}

// --- Geometry for the drawing tool (visual frame) ---------------------------------------------------------

/**
 * The lines an area can snap to and close against on its target, as the drawing reads: the shell's edges, circ welds,
 * long seams, scan outlines, objects, nozzle circles and other MUT areas; on a head, the head circle, its centerlines,
 * head nozzles and other areas on that head. `skip` leaves one row's own area out (while it is being edited).
 */
export function areaGeometry(p: Project, t: AreaTarget, skip?: { list: MutList; index: number }): SnapGeom {
  const o = p.vessel.orientation as Orientation
  const s = p.settings
  const v = (q: Pt): Pt => toVisual(o, q[0], q[1])
  const segs: [Pt, Pt][] = []
  const circles: SnapCircle[] = []
  const turn = o === 'Vertical' ? 0 : o === 'Horizontal CCW' ? 90 : -90
  const poly = (pts: readonly Pt[]) => {
    for (let i = 0; i < pts.length; i++) segs.push([v(pts[i]), v(pts[(i + 1) % pts.length])])
  }
  const H = p.vessel.height
  const L = p.vessel.length
  const areas = mutAreaLayouts(p).filter((a) => !(skip && a.list === skip.list && a.index === skip.index))
  if (t.kind === 'shell') {
    if (H === null || L === null) return { segs, circles }
    const C = circumference(p)
    poly(rectPolygon(0, 0, H, L))
    if (s.showWeldsOnOverlay) {
      for (const cw of p.circWelds) if (cw.include && cw.y !== null) segs.push([v([0, cw.y]), v([H, cw.y])])
      for (const ls of p.longSeams) {
        if (!ls.include || ls.x === null) continue
        const y1 = ls.startY === null || ls.startY < 0 ? 0 : ls.startY
        const y2 = ls.stopY === null || ls.stopY < 0 ? L : ls.stopY
        segs.push([v([ls.x, y1]), v([ls.x, y2])])
      }
    }
    for (const sc of drawnScans(p)) {
      if (!sc.include || sc.xStart === null || sc.xStop === null || sc.yStart === null || sc.yStop === null) continue
      for (const pc of scanPieces(sc, C)) poly(rectPolygon(pc.x0, sc.yStart, pc.x1, sc.yStop))
    }
    if (s.showSupportsOnOverlay) {
      for (const ob of p.objects) {
        if (!ob.include || ob.x === null || ob.y === null || ob.circWidth === null || ob.length === null) continue
        for (const pc of objectPieces(ob, C)) poly(rectPolygon(pc.x0, ob.y, pc.x1, ob.y + ob.length))
      }
    }
    if (s.showNozzlesOnOverlay) {
      for (const n of p.shellNozzles) {
        if (!n.include || n.x === null || n.y === null || n.diameter === null) continue
        for (const pc of nozzlePieces(n, C)) circles.push({ c: v([pc.cx, pc.cy]), r: pc.r, arc: pc.arc ? [pc.arc[0] + turn, pc.arc[1] + turn] : null })
      }
    }
    for (const a of areas) if (a.list === 'shellMut') for (const pc of a.pieces) poly(pc)
    return { segs, circles }
  }
  const f = headFrame(p, t.head)
  if (!f) return { segs, circles }
  const c = v(f.c)
  circles.push({ c, r: f.r, arc: null })
  if (s.showHeadCenterlines) {
    segs.push([[c[0] - f.r, c[1]], [c[0] + f.r, c[1]]])
    segs.push([[c[0], c[1] - f.r], [c[0], c[1] + f.r]])
  }
  if (s.showHeadNozzles) {
    const { headDia, panel } = panelOf(p)
    for (const [index, l] of headNozzleLabels(p, panel, headDia)) if (p.headNozzles[index]?.head === t.head) circles.push({ c: v([l.x, l.y]), r: l.r, arc: null })
  }
  for (const a of areas) if (a.list === 'headMut' && a.target.kind === 'head' && a.target.head === t.head) for (const pc of a.pieces) poly(pc)
  return { segs, circles }
}

/** The geometry's circles as short segments (for finding a closed boundary). */
function asSegments(g: SnapGeom): [Pt, Pt][] {
  const out = [...g.segs]
  for (const c of g.circles) {
    const n = 96
    const a0 = c.arc ? c.arc[0] : 0
    const span = c.arc ? c.arc[1] - c.arc[0] : 360
    const k = Math.max(4, Math.ceil((n * span) / 360))
    const at = (i: number): Pt => {
      const a = ((a0 + (span * i) / k) * Math.PI) / 180
      return [c.c[0] + c.r * Math.cos(a), c.c[1] + c.r * Math.sin(a)]
    }
    for (let i = 0; i < k; i++) out.push([at(i), at(i + 1)])
  }
  return out
}

/** Drops corners that sit on a straight run between their neighbours (left over from splitting lines). */
export function simplifyOutline(pts: readonly Pt[], tol = 1e-6): Poly {
  let out = [...pts]
  let changed = true
  while (changed && out.length > 3) {
    changed = false
    for (let i = 0; i < out.length; i++) {
      const a = out[(i + out.length - 1) % out.length]
      const b = out[i]
      const c = out[(i + 1) % out.length]
      const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
      const len = Math.hypot(c[0] - a[0], c[1] - a[1])
      if (Math.abs(cross) <= tol * Math.max(1, len) || Math.hypot(b[0] - a[0], b[1] - a[1]) < tol) {
        out = out.filter((_, j) => j !== i)
        changed = true
        break
      }
    }
  }
  return out
}

/**
 * "Pick inside": the closed space around the visual point v on its target, as the drawing reads (counter-clockwise),
 * or null when the lines around it don't close.
 */
export function pickInside(p: Project, t: AreaTarget, v: Pt, skip?: { list: MutList; index: number }): Poly | null {
  const found = enclosingBoundary(asSegments(areaGeometry(p, t, skip)), v)
  return found ? simplifyOutline(found) : null
}

/** Is the visual point inside the area (any piece)? */
export function areaHit(o: Orientation, a: MutAreaLayout, v: Pt): boolean {
  const q = toLogical(o, v[0], v[1])
  return a.pieces.some((pc) => pointInPolygon(pc, q))
}

/** The label's two text lines' centers (logical) for an area's label at `at`. */
export function areaTextLines(o: Orientation, a: Pick<MutAreaLayout, 'sh' | 'sub'>, at: Pt): { id: Pt; sub: Pt | null } {
  const off = areaLineOffsets(a.sh, a.sub)
  const v = toVisual(o, at[0], at[1])
  return { id: toLogical(o, v[0], v[1] + off.id), sub: a.sub === null ? null : toLogical(o, v[0], v[1] + off.sub) }
}
