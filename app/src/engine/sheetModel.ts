// The printed sheets (Phase 4b): the main sheet, then (with section sheets on) the overview and each section,
// all letter size. Each sheet is a list of primitives in paper inches from the sheet's bottom-left corner
// (y up): lines, rectangles, circles, arcs, text and photos, each with its CAD color, printed line weight,
// transparency and group (the CAD visibility groups, for PDF layers). The Sheets view, the PDF and the
// report images all draw from this model, so they show exactly the same thing.
//
// Main sheet: the whole drawing (vessel, rulers, the right panel with heads, legend and title block) fitted
// to the sheet inside half-inch margins: landscape when the drawing is wider than tall, portrait otherwise.
// v5.0 leaves this sheet to the user in CAD (ABLAYOUT / ABOVERLAY only switch layers), so this is the
// app's own; the photos and the scan outlines and hatch are all on it, on their own PDF layers.
// Section sheets: engine/sheets.ts (SECTIONPAGES' layout), the drawing clipped to the viewport.

import type { Project } from '../data/schema.ts'
import { LAYER_COLOR, TRANSPARENT_LAYERS, groupOfLayer, type Drawing, type LayerGroup, type Shape } from './drawing.ts'
import { FONT_DESCENT, FONT_UNITS_PER_EM } from './fontMetrics.generated.ts'
import { LETTER_AREA, type Section, type SectionPlan } from './sections.ts'
import { PANEL_LAYERS, PAPER_LAYER_COLOR, sheetPages, type PaperShape } from './sheets.ts'
import { lineWeights } from './styles.ts'
import { CAP, textWidth } from './textMetrics.ts'
import { rotationOffset, toVisual, type Orientation } from './transform.ts'

export type Box = [number, number, number, number]

/** Where a primitive belongs: a CAD visibility group, the sheet itself, or the title and legend panel. */
export type PrimGroup = LayerGroup | 'sheet' | 'panel'

export interface PrimStyle {
  /** CAD color number (printed with aci.ts printRgb). */
  color: number
  /** Line weight, inches. */
  weight: number
  /** 1 = solid. */
  opacity: number
}

export type PrimShape =
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { t: 'rect'; x: number; y: number; w: number; h: number }
  | { t: 'circle'; cx: number; cy: number; r: number }
  /** Counter-clockwise from a0 to a1 degrees. */
  | { t: 'arc'; cx: number; cy: number; r: number; a0: number; a1: number }
  /** CAD text: h = capital height, rot degrees counter-clockwise, MC = middle centre, ML = middle left. */
  | { t: 'text'; x: number; y: number; h: number; rot: number; text: string; just: 'MC' | 'ML' }
  /**
   * A scan photo: bottom-left corner (x, y), w along the rotation, h across it. crop = the part of the photo's
   * width (a piece of a scan across the seam); scanW x scanH = the piece's size on the shell (its exact shape).
   */
  | { t: 'image'; x: number; y: number; w: number; h: number; rot: number; scanId: string; piece: number | null; crop: [number, number] | null }

export type Prim = PrimShape & { layer: string; group: PrimGroup; style: PrimStyle }
export type TextPrim = Extract<Prim, { t: 'text' }>
export type ImagePrim = Extract<Prim, { t: 'image' }>

export interface SheetModel {
  kind: 'main' | 'overview' | 'section'
  /** "DRAWING", "OVERVIEW", "SECTION 1 OF 3". */
  title: string
  section: Section | null
  /** Paper size, inches (letter: 11 x 8.5 landscape, 8.5 x 11 portrait). */
  paper: { w: number; h: number }
  /** The drawing primitives are clipped to this rectangle (section viewports); null = not clipped. */
  clip: { x: number; y: number; w: number; h: number } | null
  /** The drawing, then what is drawn on the sheet itself (rulers, references, panel, viewport frame). */
  drawing: Prim[]
  sheet: Prim[]
  /** Paper inches per inch of shell. */
  scale: number
  /** Extents of everything printed, and without the title and legend (paper inches). */
  extents: { all: Box; drawingOnly: Box }
}

export const LANDSCAPE = { w: 11, h: 8.5 } as const
export const PORTRAIT = { w: 8.5, h: 11 } as const
/** Margin of the main sheet (and of the section sheets' template area). */
export const MARGIN = 0.5

// --- Text --------------------------------------------------------------------------------------------

/**
 * Where a CAD text is drawn: the font size (capital height h), its width, the start of its baseline (the point
 * the PDF and canvas draw from) and its outline corners (for extents), all rotated with the text.
 */
export function textGeometry(p: { x: number; y: number; h: number; rot: number; text: string; just: 'MC' | 'ML' }) {
  const size = p.h / CAP
  const width = textWidth(p.text, size)
  const dx = p.just === 'MC' ? -width / 2 : 0
  const dy = -p.h / 2
  const rad = (p.rot * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const at = (u: number, v: number): [number, number] => [p.x + u * cos - v * sin, p.y + u * sin + v * cos]
  const descent = (-FONT_DESCENT / FONT_UNITS_PER_EM) * size
  const corners = [at(dx, dy - descent), at(dx + width, dy - descent), at(dx + width, dy + p.h), at(dx, dy + p.h)]
  return { size, width, start: at(dx, dy), corners }
}

// --- Extents -----------------------------------------------------------------------------------------

function primBox(p: Prim): Box {
  const pad = 'weight' in p.style ? p.style.weight / 2 : 0
  switch (p.t) {
    case 'line':
      return [Math.min(p.x1, p.x2) - pad, Math.min(p.y1, p.y2) - pad, Math.max(p.x1, p.x2) + pad, Math.max(p.y1, p.y2) + pad]
    case 'rect':
      return [p.x - pad, p.y - pad, p.x + p.w + pad, p.y + p.h + pad]
    case 'circle':
      return [p.cx - p.r - pad, p.cy - p.r - pad, p.cx + p.r + pad, p.cy + p.r + pad]
    case 'arc': {
      const pts: [number, number][] = [p.a0, p.a1].map((a) => [p.cx + p.r * Math.cos((a * Math.PI) / 180), p.cy + p.r * Math.sin((a * Math.PI) / 180)])
      for (let a = Math.ceil(p.a0 / 90) * 90; a <= p.a1; a += 90) pts.push([p.cx + p.r * Math.cos((a * Math.PI) / 180), p.cy + p.r * Math.sin((a * Math.PI) / 180)])
      return boxOf(pts, pad)
    }
    case 'text':
      return boxOf(textGeometry(p).corners, 0)
    case 'image': {
      const rad = (p.rot * Math.PI) / 180
      const c = Math.cos(rad)
      const s = Math.sin(rad)
      return boxOf([[p.x, p.y], [p.x + p.w * c, p.y + p.w * s], [p.x - p.h * s, p.y + p.h * c], [p.x + p.w * c - p.h * s, p.y + p.w * s + p.h * c]], 0)
    }
  }
}

function boxOf(pts: [number, number][], pad: number): Box {
  return [Math.min(...pts.map((q) => q[0])) - pad, Math.min(...pts.map((q) => q[1])) - pad, Math.max(...pts.map((q) => q[0])) + pad, Math.max(...pts.map((q) => q[1])) + pad]
}

const EMPTY: Box = [Infinity, Infinity, -Infinity, -Infinity]
const union = (a: Box, b: Box): Box => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]
const intersect = (a: Box, b: Box): Box => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]
const overlaps = (a: Box, b: Box) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]

/**
 * The right panel: title block and legend, and on the main sheet the head views. A "drawing only" report image
 * leaves these out (the shell drawing with its rulers, references and match lines).
 */
export function isPanelPrim(p: { group: PrimGroup }): boolean {
  return p.group === 'panel' || p.group === 'info' || p.group === 'heads'
}

function extentsOf(m: Omit<SheetModel, 'extents'>): SheetModel['extents'] {
  const clip: Box | null = m.clip ? [m.clip.x, m.clip.y, m.clip.x + m.clip.w, m.clip.y + m.clip.h] : null
  let all = EMPTY
  let drawingOnly = EMPTY
  for (const p of m.drawing) {
    const b = clip ? intersect(primBox(p), clip) : primBox(p)
    if (b[2] < b[0] || b[3] < b[1]) continue
    all = union(all, b)
    if (!isPanelPrim(p)) drawingOnly = union(drawingOnly, b)
  }
  for (const p of m.sheet) {
    const b = primBox(p)
    all = union(all, b)
    if (!isPanelPrim(p)) drawingOnly = union(drawingOnly, b)
  }
  return { all, drawingOnly: Number.isFinite(drawingOnly[0]) ? drawingOnly : all }
}

// --- The drawing on a sheet --------------------------------------------------------------------------

interface Place {
  /** Visual (rotated) drawing coordinates -> paper. */
  scale: number
  ox: number
  oy: number
}

function drawingPrims(d: Drawing, styleOf: (layer: string) => PrimStyle, place: Place, hidden: ReadonlySet<LayerGroup>, cull: Box | null): Prim[] {
  const o = d.orientation
  const off = rotationOffset(o)
  const P = (x: number, y: number): [number, number] => {
    const [vx, vy] = toVisual(o, x, y)
    return [place.ox + vx * place.scale, place.oy + vy * place.scale]
  }
  const out: Prim[] = []
  for (const item of d.items) {
    for (const s of item.shapes) {
      const group = groupOfLayer(s.layer)
      if (group !== 'always' && hidden.has(group)) continue
      const base = { layer: s.layer, group, style: styleOf(s.layer) }
      const prim = shapePrim(s, P, place.scale, off, base)
      if (prim && (!cull || overlaps(primBox(prim), cull))) out.push(prim)
    }
  }
  return out
}

function shapePrim(s: Shape, P: (x: number, y: number) => [number, number], k: number, off: number, base: Pick<Prim, 'layer' | 'group' | 'style'>): Prim | null {
  switch (s.t) {
    case 'line': {
      const [x1, y1] = P(s.x1, s.y1)
      const [x2, y2] = P(s.x2, s.y2)
      return { t: 'line', x1, y1, x2, y2, ...base }
    }
    case 'rect': {
      const [ax, ay] = P(s.x, s.y)
      const [bx, by] = P(s.x + s.w, s.y + s.h)
      return { t: 'rect', x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay), ...base }
    }
    case 'circle': {
      const [cx, cy] = P(s.cx, s.cy)
      return { t: 'circle', cx, cy, r: s.r * k, ...base }
    }
    case 'arc': {
      const [cx, cy] = P(s.cx, s.cy)
      return { t: 'arc', cx, cy, r: s.r * k, a0: s.a0 + off, a1: s.a1 + off, ...base }
    }
    case 'text': {
      if (s.text === '') return null
      const [x, y] = P(s.x, s.y)
      return { t: 'text', x, y, h: s.h * k, rot: s.rot + off, text: s.text, just: s.just, ...base }
    }
    case 'image': {
      // The photo's left column is the scan's X start, its bottom row Y start (as in CAD and the preview).
      const [x, y] = P(Math.min(s.x, s.x + s.w), Math.min(s.y, s.y + s.h))
      const crop = s.from !== undefined && s.to !== undefined ? ([s.from, s.to] as [number, number]) : null
      return { t: 'image', x, y, w: Math.abs(s.w) * k, h: Math.abs(s.h) * k, rot: off, scanId: s.scanId, piece: null, crop, ...base }
    }
  }
}

/** Visual-coordinate extents of the whole drawing (text measured with the bundled font). */
function drawingBox(d: Drawing): Box {
  const prims = drawingPrims(d, () => ({ color: 7, weight: 0, opacity: 1 }), { scale: 1, ox: 0, oy: 0 }, new Set(), null)
  return prims.reduce((b, p) => union(b, primBox(p)), EMPTY)
}

// --- The sheets --------------------------------------------------------------------------------------

export interface SheetOptions {
  /** CAD groups left out (the preview's layer toggles); the PDF leaves this empty and uses PDF layers. */
  hidden?: ReadonlySet<LayerGroup>
}

function styler(p: Project, d: Drawing): (layer: string) => PrimStyle {
  const weight = lineWeights(p.settings)
  const hatch = 1 - Math.min(90, Math.max(0, d.hatchTransparency)) / 100
  const center = 1 - Math.min(90, Math.max(0, d.centerlineTransparency)) / 100
  return (layer) => ({
    color: d.layerColors[layer] ?? LAYER_COLOR[layer] ?? PAPER_LAYER_COLOR[layer] ?? 7,
    weight: weight(layer),
    opacity: TRANSPARENT_LAYERS.includes(layer) || layer === 'REPORT_LEGEND_AUT' || layer === 'REPORT_LEGEND_MUT' ? hatch : layer === 'CENTERLINE' ? center : 1,
  })
}

/** The main sheet: the whole drawing, fitted inside the margins. */
export function mainSheet(p: Project, d: Drawing, options: SheetOptions = {}): SheetModel {
  const styleOf = styler(p, d)
  const b = drawingBox(d)
  const bw = Math.max(1e-6, b[2] - b[0])
  const bh = Math.max(1e-6, b[3] - b[1])
  const paper = bw >= bh ? LANDSCAPE : PORTRAIT
  const scale = Math.min((paper.w - 2 * MARGIN) / bw, (paper.h - 2 * MARGIN) / bh)
  const place = { scale, ox: (paper.w - bw * scale) / 2 - b[0] * scale, oy: (paper.h - bh * scale) / 2 - b[1] * scale }
  const m = { kind: 'main' as const, title: 'DRAWING', section: null, paper: { ...paper }, clip: null, scale, sheet: [], drawing: drawingPrims(d, styleOf, place, options.hidden ?? new Set(), null) }
  return { ...m, extents: extentsOf(m) }
}

/** The overview and section sheets (SECTIONPAGES' layout, engine/sheets.ts). */
export function sectionSheets(p: Project, d: Drawing, plan: SectionPlan, options: SheetOptions = {}): SheetModel[] {
  const styleOf = styler(p, d)
  const o = p.vessel.orientation as Orientation
  const C = p.vessel.height!
  const paper = LANDSCAPE
  const ax = (paper.w - LETTER_AREA.w) / 2
  const ay = (paper.h - LETTER_AREA.h) / 2
  return sheetPages(p, plan).map((page): SheetModel => {
    const { vp } = page
    const clip = { x: ax + vp.left, y: ay + vp.bottom, w: vp.w, h: vp.h }
    // The view: the shell from viewStart to viewEnd all the way round, in visual coordinates.
    const corners = [toVisual(o, 0, page.viewStart), toVisual(o, C, page.viewStart), toVisual(o, 0, page.viewEnd), toVisual(o, C, page.viewEnd)]
    const vx = Math.min(...corners.map((c) => c[0]))
    const vy = Math.min(...corners.map((c) => c[1]))
    const place = { scale: vp.scale, ox: clip.x - vx * vp.scale, oy: clip.y - vy * vp.scale }
    const cull: Box = [clip.x, clip.y, clip.x + clip.w, clip.y + clip.h]
    const sheet: Prim[] = page.shapes.map((s) => paperPrim(s, ax, ay, styleOf))
    sheet.push({ t: 'rect', ...clip, layer: 'REPORT_VIEWPORT', group: 'sheet', style: { color: 7, weight: 0.25 / 25.4, opacity: 1 } })
    const m = {
      kind: page.section ? ('section' as const) : ('overview' as const), title: page.title, section: page.section, paper: { ...paper }, clip, scale: vp.scale,
      drawing: drawingPrims(d, styleOf, place, options.hidden ?? new Set(), cull), sheet,
    }
    return { ...m, extents: extentsOf(m) }
  })
}

function paperPrim(s: PaperShape, ax: number, ay: number, styleOf: (layer: string) => PrimStyle): Prim {
  const base = { layer: s.layer, group: (PANEL_LAYERS.has(s.layer) ? 'panel' : 'sheet') as PrimGroup, style: styleOf(s.layer) }
  if (s.t === 'line') return { t: 'line', x1: s.x1 + ax, y1: s.y1 + ay, x2: s.x2 + ax, y2: s.y2 + ay, ...base }
  if (s.t === 'rect') return { t: 'rect', x: s.x + ax, y: s.y + ay, w: s.w, h: s.h, ...base }
  return { t: 'text', x: s.x + ax, y: s.y + ay, h: s.h, rot: s.rot, text: s.text, just: s.just, ...base }
}

/** Every printed sheet in order: the main sheet, then the overview and sections when section sheets are on. */
export function sheetModels(p: Project, d: Drawing, plan: SectionPlan | null, options: SheetOptions = {}): SheetModel[] {
  return [mainSheet(p, d, options), ...(plan && plan.sections.length ? sectionSheets(p, d, plan, options) : [])]
}

// --- Photos ------------------------------------------------------------------------------------------

export interface PhotoNeed {
  key: string
  scanId: string
  piece: number | null
  crop: [number, number] | null
  /** The largest printed size over all sheets (inches). */
  printedW: number
  printedH: number
}

/** Each photo (or photo piece) the sheets print, at its largest printed size, so it is embedded only once. */
export function photoNeeds(models: readonly SheetModel[]): PhotoNeed[] {
  const out = new Map<string, PhotoNeed>()
  for (const m of models) {
    for (const p of m.drawing) {
      if (p.t !== 'image') continue
      const key = photoKey(p)
      const n = out.get(key)
      if (!n) out.set(key, { key, scanId: p.scanId, piece: p.piece, crop: p.crop, printedW: p.w, printedH: p.h })
      else if (p.w > n.printedW) Object.assign(n, { printedW: p.w, printedH: p.h })
    }
  }
  return [...out.values()]
}

export function photoKey(p: { scanId: string; crop: [number, number] | null }): string {
  return `${p.scanId}|${p.crop ? p.crop.join('-') : 'all'}`
}

// --- Paths (shared by the Sheets view, the PDF and the report images) --------------------------------

export type PathOp = ['M', number, number] | ['L', number, number] | ['C', number, number, number, number, number, number] | ['Z']

/** Outline of a line, rectangle, circle or arc as moves, lines and cubic curves (arcs in pieces of 90 degrees or less). */
export function primOps(p: Prim): PathOp[] {
  switch (p.t) {
    case 'line':
      return [['M', p.x1, p.y1], ['L', p.x2, p.y2]]
    case 'rect':
      return [['M', p.x, p.y], ['L', p.x + p.w, p.y], ['L', p.x + p.w, p.y + p.h], ['L', p.x, p.y + p.h], ['Z']]
    case 'circle':
      return [...arcOps(p.cx, p.cy, p.r, 0, 360), ['Z']]
    case 'arc':
      return arcOps(p.cx, p.cy, p.r, p.a0, p.a1 >= p.a0 ? p.a1 : p.a1 + 360)
    default:
      return []
  }
}

function arcOps(cx: number, cy: number, r: number, a0: number, a1: number): PathOp[] {
  const n = Math.max(1, Math.ceil((a1 - a0) / 90 - 1e-9))
  const step = ((a1 - a0) / n) * (Math.PI / 180)
  const k = (4 / 3) * Math.tan(step / 4)
  let a = (a0 * Math.PI) / 180
  const ops: PathOp[] = [['M', cx + r * Math.cos(a), cy + r * Math.sin(a)]]
  for (let i = 0; i < n; i++) {
    const b = a + step
    ops.push([
      'C',
      cx + r * (Math.cos(a) - k * Math.sin(a)), cy + r * (Math.sin(a) + k * Math.cos(a)),
      cx + r * (Math.cos(b) + k * Math.sin(b)), cy + r * (Math.sin(b) - k * Math.cos(b)),
      cx + r * Math.cos(b), cy + r * Math.sin(b),
    ])
    a = b
  }
  return ops
}

export type DrawStep =
  | { kind: 'path'; layer: string; group: PrimGroup; style: PrimStyle; ops: PathOp[] }
  | { kind: 'text'; prim: TextPrim }
  | { kind: 'image'; prim: ImagePrim }

const sameStyle = (a: PrimStyle, b: PrimStyle) => a.color === b.color && a.weight === b.weight && a.opacity === b.opacity

/** The prims in drawing order, with neighbouring lines of the same style and group joined into one path. */
export function drawSteps(prims: readonly Prim[]): DrawStep[] {
  const out: DrawStep[] = []
  for (const p of prims) {
    if (p.t === 'text') out.push({ kind: 'text', prim: p })
    else if (p.t === 'image') out.push({ kind: 'image', prim: p })
    else {
      const last = out[out.length - 1]
      if (last && last.kind === 'path' && last.group === p.group && sameStyle(last.style, p.style)) last.ops.push(...primOps(p))
      else out.push({ kind: 'path', layer: p.layer, group: p.group, style: p.style, ops: primOps(p) })
    }
  }
  return out
}
