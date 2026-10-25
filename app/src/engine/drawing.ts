// The drawing as a list of items in logical coordinates, for the preview. It follows the .lsp: the
// job layout comes from layout.ts (shared with the exporter), the order and on/off switches follow
// exportLsp, and the shapes are TypeScript ports of the LISP drawing functions (SL_LabelRect,
// SL_CircleSmart, SL_CircWeld, rulers, SL_Legend, SL_HeadView, ...).
//
// Nozzle label positions come from labels.ts, which the exporter writes into the .lsp too, so they are
// exactly CAD's. Preview approximation: CAD still decides some things while it draws (text sizes fitted to
// boxes, the legend summary reflow after TEXTRESIZE); those use the same formulas. Text is drawn with a
// browser font, so its exact width differs. See PREVIEW_DIFFERENCES.

import { vbaFormatFixed } from '../export/lsp/vbaFormat.ts'
import type { ListKey, MovableLabelList, Project } from '../data/schema.ts'
import {
  REFERENCE_POSITIONS,
  axisLabels,
  clockPositionDegrees,
  countedScans,
  coveragePercent,
  drawnScans,
  imageInserts,
  panelOf,
  radiusFactor,
  referenceLabelLayout,
  shouldShowHead,
  titleLines,
  ucaseTrim,
} from './layout.ts'
import { headNozzleLabels, shellNozzleLabels, type NozzleLabel } from './labels.ts'
import { fitTextHeight, labelRot, placeTextLabel, textLabelSpecs, textLayer, type TextLabelSpec, type TextPlacement } from './textLabels.ts'
import { arrowheadParts, directionArrowLength, dotPolygon, leaderParts, leaderStyle, type ArrowStyle, type LeaderPart, type LeaderStyle, type Pt } from './leaders.ts'
import { rulerCalls, type RulerCall } from './rulers.ts'
import { headVector, readableRot, rulerTextRotX, rulerTextRotY, type Orientation } from './transform.ts'
import { appLayerSetup, panelScales, sizedHeight, textSizeRules } from './styles.ts'
import { circumference, isWrapped, labelPieceIndex, objectPieces, scanPieces, type XPiece } from './wrap.ts'

/** Where the preview may look different from the drawing in CAD. */
export const PREVIEW_DIFFERENCES = [
  'Text is drawn with the browser font; CAD uses its own font, so labels can be a little wider or narrower.',
  'Scan photos are shown as the original photos stretched to the scan, not the processed images.',
  'Text sizes are the ones set on the Drawing step; TEXTRESIZE in CAD can change them later (not shown here).',
  'Section pages, viewports and the layout sheet are not shown.',
] as const

// --- Shapes and items ----------------------------------------------------------------------------

export type Shape =
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; layer: string }
  | { t: 'rect'; x: number; y: number; w: number; h: number; layer: string }
  | { t: 'circle'; cx: number; cy: number; r: number; layer: string }
  /** Arc from a0 to a1 degrees, counter-clockwise (a nozzle wrapped across the seam). */
  | { t: 'arc'; cx: number; cy: number; r: number; a0: number; a1: number; layer: string }
  /** Open polyline (a leader), or with fill a closed filled polygon (a closed arrowhead, a dot). */
  | { t: 'poly'; pts: Pt[]; fill: boolean; layer: string }
  /** rot = the logical rotation passed to SL_Text (the drawing adds the orientation's rotation). */
  | { t: 'text'; x: number; y: number; h: number; rot: number; text: string; just: 'MC' | 'ML'; layer: string }
  /** from / to: the part of the photo shown (0..1 across its width; a scan wrapped across the seam). */
  | { t: 'image'; x: number; y: number; w: number; h: number; scanId: string; layer: string; from?: number; to?: number }

/** CAD visibility groups (the AB... toggle commands in the .lsp). Items in 'always' have no toggle. */
export type LayerGroup = 'images' | 'scans' | 'hatch' | 'welds' | 'nozzles' | 'objects' | 'rulers' | 'heads' | 'info' | 'sections' | 'always'

export const LAYER_GROUPS: { id: Exclude<LayerGroup, 'always'>; name: string; layers: string[] }[] = [
  { id: 'scans', name: 'Scans', layers: ['SCANS', 'SCAN_TEXT'] },
  { id: 'hatch', name: 'Hatch', layers: ['AUT_HATCH'] },
  { id: 'images', name: 'Images', layers: ['SCAN_IMAGES'] },
  { id: 'welds', name: 'Welds', layers: ['CIRC_WELDS', 'LONG_SEAMS', 'CIRC_WELD_TEXT', 'LONG_SEAM_TEXT'] },
  { id: 'nozzles', name: 'Nozzles', layers: ['NOZZLES', 'NOZZLE_LEADERS', 'SHELL_NOZZLE_TEXT'] },
  { id: 'objects', name: 'Objects', layers: ['SUPPORTS', 'SUPPORT_TEXT'] },
  { id: 'rulers', name: 'Rulers', layers: ['X_AXIS', 'Y_AXIS', 'X_RULER_TEXT', 'Y_RULER_TEXT', 'X_AXIS_LABEL_TEXT', 'Y_AXIS_LABEL_TEXT', 'REFERENCE_TEXT'] },
  { id: 'heads', name: 'Heads', layers: ['HEADS', 'HEAD_NOZZLE_LEADERS', 'HEAD_NOZZLE_TEXT', 'HEAD_MUT_TEXT', 'HEAD_TITLE_TEXT', 'HEAD_CLOCK_TEXT'] },
  {
    id: 'info', name: 'Legend and title',
    layers: ['LEGEND', 'LEGEND_SAMPLE', 'LEGEND_AUT_HATCH', 'LEGEND_MUT_HATCH', 'LEGEND_TEXT', 'TITLE_BLOCK', 'TITLE_BLOCK_TEXT'],
  },
  // Preview only (not a CAD layer): the section sheet plan, while section sheets are on (engine/sections.ts).
  { id: 'sections', name: 'Sections', layers: ['SECTION_PLAN'] },
]

const GROUP_OF = new Map(LAYER_GROUPS.flatMap((g) => g.layers.map((l) => [l, g.id] as const)))

export function groupOfLayer(layer: string): LayerGroup {
  return GROUP_OF.get(layer) ?? 'always'
}

/** CAD layer colors (SL_SetupLayers): 7 = drawing color, 1 red, 3 green, 5 blue, 6 magenta. */
export const LAYER_COLOR: Record<string, number> = {
  AUT_HATCH: 5, SUPPORTS: 6, X_AXIS: 1, Y_AXIS: 5, LEGEND_AUT_HATCH: 5, LEGEND_MUT_HATCH: 3, MANUAL_UT_HATCH: 3,
  X_RULER_TEXT: 1, Y_RULER_TEXT: 5,
  // Layers the app adds (same colors as the layer they came from).
  X_AXIS_LABEL_TEXT: 1, Y_AXIS_LABEL_TEXT: 5, REFERENCE_TEXT: 1,
  // Preview only: the section plan.
  SECTION_PLAN: 3,
}

/** Layers whose lines take the hatch transparency (SL_SetLayerTransparency). */
export const TRANSPARENT_LAYERS = ['AUT_HATCH', 'LEGEND_AUT_HATCH', 'LEGEND_MUT_HATCH', 'MANUAL_UT_HATCH']

export interface ItemSource {
  list: ListKey
  index: number
  id: string
}

export interface DrawingItem {
  /** Unique: "scans:3", "vessel", "ruler:Y_AXIS", ... */
  key: string
  source: ItemSource | null
  shapes: Shape[]
  /** Hover text: ID and key values. */
  info: string
}

/** A nozzle label as placed, with the row it belongs to (DrawingItem key `<list>:<index>`). */
export interface PlacedLabel {
  key: string
  list: MovableLabelList
  index: number
  id: string
  txt: string
  /** Label center as drawn (logical) and its box as the drawing reads (w across, h up), at the Drawing step's size. */
  x: number
  y: number
  w: number
  h: number
  /** Where a move is measured from (logical): a nozzle's center, a text label's automatic spot. */
  anchor: Pt
  moved: boolean
  /** Nozzle labels: the placed label with its leader and leader end (engine/labels.ts). */
  nozzle?: NozzleLabel
  /** Weld, seam, object and MUT labels (engine/textLabels.ts). */
  text?: TextLabelSpec
}

const nozzlePlaced = (key: string, list: MovableLabelList, index: number, id: string, l: NozzleLabel): PlacedLabel =>
  ({ key, list, index, id, txt: l.txt, x: l.tx, y: l.ty, w: l.tw, h: l.sh, anchor: [l.x, l.y], moved: !!l.moved, nozzle: l })
const textPlaced = (sp: TextLabelSpec, tp: TextPlacement): PlacedLabel =>
  ({ key: `${sp.list}:${sp.index}`, list: sp.list, index: sp.index, id: sp.id, txt: sp.txt, x: tp.x, y: tp.y, w: tp.w, h: tp.h, anchor: [sp.ax, sp.ay], moved: tp.moved, text: sp })

export interface Drawing {
  orientation: Orientation
  items: DrawingItem[]
  /** Hatch transparency, 0-90 %. */
  hatchTransparency: number
  /** Centerline transparency, 0-90 % (app change). */
  centerlineTransparency: number
  /** Layer colors chosen on the Drawing step that differ from LAYER_COLOR. */
  layerColors: Record<string, number>
  /** Nozzle labels as placed (automatic or moved by hand), for moving them in the preview (Phase 5b) and the DXF later. */
  labels: PlacedLabel[]
}


const fmt = (n: number) => String(Math.round(n * 1000) / 1000)

// --- LISP drawing functions, ported -------------------------------------------------------------------

class Pen {
  shapes: Shape[] = []
  line(x1: number, y1: number, x2: number, y2: number, layer: string) {
    this.shapes.push({ t: 'line', x1, y1, x2, y2, layer })
  }
  rect(x: number, y: number, w: number, h: number, layer: string) {
    this.shapes.push({ t: 'rect', x, y, w, h, layer })
  }
  circle(cx: number, cy: number, r: number, layer: string) {
    this.shapes.push({ t: 'circle', cx, cy, r, layer })
  }
  arc(cx: number, cy: number, r: number, a0: number, a1: number, layer: string) {
    this.shapes.push({ t: 'arc', cx, cy, r, a0, a1, layer })
  }
  poly(pts: Pt[], fill: boolean, layer: string) {
    this.shapes.push({ t: 'poly', pts, fill, layer })
  }
  /** Leader or arrowhead parts (engine/leaders.ts): a dot is drawn as a filled polygon. */
  parts(parts: LeaderPart[], layer: string) {
    for (const part of parts) {
      if (part.k === 'dot') this.poly(dotPolygon(part.c, part.d), true, layer)
      else this.poly(part.pts, part.k === 'fill', layer)
    }
  }
  text(x: number, y: number, h: number, rot: number, text: string, layer: string, just: 'MC' | 'ML' = 'MC') {
    this.shapes.push({ t: 'text', x, y, h, rot, text, just, layer: textLayer(layer) })
  }
  /** SL_DashLine */
  dash(x1: number, y1: number, x2: number, y2: number, dash: number, gap: number, layer: string) {
    const dx = x2 - x1
    const dy = y2 - y1
    const len = Math.sqrt(dx * dx + dy * dy)
    if (!(len > 0.0001)) return
    const ux = dx / len
    const uy = dy / len
    for (let pos = 0; pos < len; pos += dash + gap) {
      const end = Math.min(len, pos + dash)
      this.line(x1 + ux * pos, y1 + uy * pos, x1 + ux * end, y1 + uy * end, layer)
    }
  }
  /** SL_HatchRect: 45-degree lines. */
  hatch(x: number, y: number, w: number, h: number, step: number, layer: string) {
    if (step <= 0) step = 2.5
    for (let k = -h; k <= w; k += step) {
      const x1 = Math.max(0, k)
      const y1 = x1 - k
      const x2 = Math.min(w, h + k)
      const y2 = x2 - k
      if (x2 > x1) this.line(x + x1, y + y1, x + x2, y + y2, layer)
    }
  }
  /** SL_Arrow (app: the arrowhead style from the Drawing step; Open is v5.0's). */
  arrow(x1: number, y1: number, x2: number, y2: number, ah: number, layer: string, style: ArrowStyle) {
    const dx = x2 - x1
    const dy = y2 - y1
    const len = Math.sqrt(dx * dx + dy * dy)
    if (!(len > 0.0001)) return
    const ux = dx / len
    const uy = dy / len
    this.line(x1, y1, x2, y2, layer)
    this.parts(arrowheadParts(style, ah, [x2, y2], [ux, uy]), layer)
  }
}

export { fitTextHeight }

/** SL_LabelRect (app version) */
function labelRect(pen: Pen, o: Orientation, x: number, y: number, w: number, h: number, txt: string, outline: string, hatch: string, hatchOn: boolean, step: number) {
  pen.rect(x, y, w, h, outline)
  if (hatch !== '' && hatchOn) pen.hatch(x, y, w, h, step, hatch)
  pen.text(x + w / 2, y + h / 2, fitTextHeight(w, h, txt), labelRot(o, w, h), txt, outline)
}

/** SL_WrapPiece (app): the unlabelled piece of a scan or object wrapped across the seam. */
function pieceRect(pen: Pen, x: number, y: number, w: number, h: number, outline: string, hatch: string, hatchOn: boolean, step: number) {
  pen.rect(x, y, w, h, outline)
  if (hatch !== '' && hatchOn) pen.hatch(x, y, w, h, step, hatch)
}

/** A scan or object in its pieces across the seam: the label on the larger piece (engine/wrap.ts). */
function wrappedRect(pen: Pen, o: Orientation, pieces: XPiece[], y: number, h: number, txt: string, outline: string, hatch: string, hatchOn: boolean, step: number) {
  const big = labelPieceIndex(pieces)
  pieces.forEach((pc, i) => {
    if (i === big) labelRect(pen, o, pc.x0, y, pc.x1 - pc.x0, h, txt, outline, hatch, hatchOn, step)
    else pieceRect(pen, pc.x0, y, pc.x1 - pc.x0, h, outline, hatch, hatchOn, step)
  })
}

/** SL_NozzleAt / SL_NozzleArcsAt: circle (or its arcs across the seam), leader and label where engine/labels.ts placed them. */
function nozzleAt(pen: Pen, o: Orientation, l: NozzleLabel, layer: string, textLayer: string, ls: LeaderStyle) {
  if (l.arcs) {
    for (const a of l.arcs) {
      if (a.arc) pen.arc(a.cx, a.cy, a.r, a.arc[0], a.arc[1], layer)
      else pen.circle(a.cx, a.cy, a.r, layer)
    }
  } else pen.circle(l.x, l.y, l.r, layer)
  if (l.leader) pen.parts(leaderParts(l.leader, ls), layer === 'NOZZLES' ? 'NOZZLE_LEADERS' : 'HEAD_NOZZLE_LEADERS')
  if (l.txt !== '') pen.text(l.tx, l.ty, l.th, readableRot(o), l.txt, textLayer)
}

/**
 * A tick number that would crowd the ruler's end number is left out (its tick stays); the end is always numbered
 * (app change 22, SL_RulerNumberFits in the .lsp): the gap must be at least the number height times
 * 1 + 0.3 x (characters of both numbers). numberH = the ruler numbers' height after the Drawing step's size rule.
 */
export function rulerNumberFits(pos: number, length: number, numberH: number): boolean {
  const inch = (v: number) => `${Math.round(v)}"`
  const d = length - pos
  return d <= 0.001 || d >= numberH * (1 + 0.3 * (inch(pos).length + inch(length).length))
}

/** SL_RulerX / SL_RulerY and their orientation variants (one function, axis and tick side from the call). */
function ruler(pen: Pen, o: Orientation, arrowHead: number, arrowStyle: ArrowStyle, arrLen: number, c: RulerCall, numberH: number) {
  const inch = (v: number) => `${Math.round(v)}"`
  const numbered = (pos: number) => rulerNumberFits(pos, c.length, numberH)
  const mid = c.length / 2
  const sd = c.side
  const ticks: number[] = []
  let last = -999
  if (c.spacing > 0) {
    for (let pos = 0; pos <= c.length; pos += c.spacing) {
      ticks.push(pos)
      last = pos
    }
  }
  if (c.length - last > 0.001) ticks.push(c.length)
  if (c.axis === 'X') {
    const rot = rulerTextRotX(o)
    pen.line(c.x0, c.y0, c.x0 + c.length, c.y0, c.layer)
    for (const pos of ticks) {
      pen.line(c.x0 + pos, c.y0, c.x0 + pos, c.y0 + sd * 3, c.layer)
      if (numbered(pos)) pen.text(c.x0 + pos, c.y0 + sd * 5, 1.8, rot, inch(pos), c.layer)
    }
    pen.text(c.x0 + mid, c.y0 + sd * 10, 2.5, rot, c.label, 'X_AXIS_LABEL_TEXT')
    pen.arrow(c.x0 + mid - arrLen / 2, c.y0 + sd * 15.5, c.x0 + mid + arrLen / 2, c.y0 + sd * 15.5, arrowHead, c.layer, arrowStyle)
  } else {
    const rot = rulerTextRotY(o)
    pen.line(c.x0, c.y0, c.x0, c.y0 + c.length, c.layer)
    for (const pos of ticks) {
      pen.line(c.x0, c.y0 + pos, c.x0 + sd * 3, c.y0 + pos, c.layer)
      if (numbered(pos)) pen.text(c.x0 + sd * 5.5, c.y0 + pos, 1.8, rot, inch(pos), c.layer)
    }
    pen.text(c.x0 + sd * 11, c.y0 + mid, 2.5, rot, c.label, 'Y_AXIS_LABEL_TEXT')
    pen.arrow(c.x0 + sd * 16.5, c.y0 + mid - arrLen / 2, c.x0 + sd * 16.5, c.y0 + mid + arrLen / 2, arrowHead, c.layer, arrowStyle)
  }
}

/** SL_Legend; k = the app's legend scale (every distance times k, as the app's SL_Legend). */
function legend(pen: Pen, o: Orientation, x0: number, y0: number, k: number, hatchOn: boolean, step: number, lines: { total: string; cov: string; orient: string; overlay: string }) {
  const boxW = 12 * k
  const boxH = 7 * k
  const lr = readableRot(o)
  // Offsets from the anchor, scaled: x + 6 is written X(6).
  const X = (d: number) => x0 + d * k
  const Y = (d: number) => y0 + d * k
  const x = x0
  const y = y0
  if (o === 'Vertical') {
    pen.text(X(6), Y(25), 2.3, lr, 'LEGEND', 'LEGEND')
    if (hatchOn) {
      pen.rect(x, Y(8), boxH, boxW, 'LEGEND_SAMPLE')
      pen.hatch(x, Y(8), boxH, boxW, step, 'LEGEND_AUT_HATCH')
      pen.text(X(3.5), Y(5), 2, lr, 'AUT', 'LEGEND')
    }
    pen.rect(X(8), Y(8), boxH, boxW, 'LEGEND_SAMPLE')
    pen.hatch(X(8), Y(8), boxH, boxW, step, 'LEGEND_MUT_HATCH')
    pen.text(X(11.5), Y(5), 2, lr, 'MUT', 'LEGEND')
  } else {
    if (o === 'Horizontal CCW') pen.text(X(19), Y(9), 2.3, lr, 'LEGEND', 'LEGEND')
    else pen.text(X(-5), Y(6), 2.3, lr, 'LEGEND', 'LEGEND')
    pen.rect(x, y, boxW, boxH, 'LEGEND_SAMPLE')
    pen.hatch(x, y, boxW, boxH, step, 'LEGEND_MUT_HATCH')
    pen.text(X(15), Y(3.5), 2, lr, 'MUT', 'LEGEND')
    if (hatchOn) {
      pen.rect(x, Y(8), boxW, boxH, 'LEGEND_SAMPLE')
      pen.hatch(x, Y(8), boxW, boxH, step, 'LEGEND_AUT_HATCH')
      pen.text(X(15), Y(11.5), 2, lr, 'AUT', 'LEGEND')
    }
  }
  const stack = [lines.total, lines.cov, lines.orient, lines.overlay]
  const at = (i: number): [number, number] =>
    o === 'Horizontal CW' ? [X(21.5 + 3.1 * i), y] : o === 'Horizontal CCW' ? [X(-6.5 - 3.1 * i), Y(15)] : [x, Y(-1.5 - 3.1 * i)]
  stack.forEach((t, i) => {
    if (i === 1 && t.length === 0) return
    const [tx, ty] = at(i)
    pen.text(tx, ty, 2, lr, t, 'LEGEND', 'ML')
  })
}

/** SL_TitleBlock; k = the app's title block scale (line spacing times k). */
function titleBlock(pen: Pen, o: Orientation, x: number, y: number, k: number, lines: string[]) {
  const step = 3.4 * k
  const lr = readableRot(o)
  lines.forEach((txt, i) => {
    if (txt === '') return
    const [tx, ty] = o === 'Horizontal CW' ? [x + i * step, y] : o === 'Horizontal CCW' ? [x - i * step, y] : [x, y - i * step]
    pen.text(tx, ty, i === 0 ? 2.4 : 1.8, lr, txt, 'TITLE_BLOCK', 'ML')
  })
}

/** SL_HeadView (with SL_HeadCrosshairs and SL_HeadClockRef) */
function headView(pen: Pen, o: Orientation, p: Project, cx: number, cy: number, dia: number, label: string) {
  const r = dia / 2
  const lr = readableRot(o)
  pen.circle(cx, cy, r, 'HEADS')
  if (p.settings.showHeadCenterlines) {
    pen.dash(cx - r, cy, cx + r, cy, 3, 2.5, 'HEADS')
    pen.dash(cx, cy - r, cx, cy + r, 3, 2.5, 'HEADS')
  }
  if (p.settings.showHeadClockReferences) {
    const [dx, dy] = headVector(o, 0)
    pen.arrow(cx + (r + 2) * dx, cy + (r + 2) * dy, cx + (r + 7) * dx, cy + (r + 7) * dy, p.settings.arrowHeadSize, 'HEADS', p.settings.directionArrowStyle)
    pen.text(cx + (r + 10) * dx, cy + (r + 10) * dy, 1.7, lr, '12', 'HEAD_CLOCK_TEXT')
  }
  const [lx, ly] = o === 'Horizontal CW' ? [cx - r - 9, cy] : o === 'Horizontal CCW' ? [cx + r + 9, cy] : [cx, cy + r + 9]
  pen.text(lx, ly, 2.3, lr, label, 'HEAD_TITLE_TEXT')
}

// --- The drawing -------------------------------------------------------------------------------------

/** Builds the drawing for the preview. Items with values not entered yet are left out (the checks list them). */
export function buildDrawing(p: Project): Drawing {
  const s = p.settings
  const o = p.vessel.orientation as Orientation
  const L = p.vessel.length
  const H = p.vessel.height
  const items: DrawingItem[] = []
  const placed: PlacedLabel[] = []
  const add = (key: string, source: ItemSource | null, pen: Pen, info: string) => {
    if (pen.shapes.length) items.push({ key, source, shapes: pen.shapes, info })
  }
  const step = s.autHatchScale
  const leaders = leaderStyle(s)
  const sized = L !== null && H !== null && L > 0 && H > 0
  const complete = (...v: (number | null)[]) => v.every((n) => n !== null && Number.isFinite(n))
  // Weld, seam, object and MUT labels: at their automatic spot, or where they were moved (engine/textLabels.ts).
  const textSpecs = new Map(textLabelSpecs(p).map((sp) => [`${sp.list}:${sp.index}`, sp]))
  /** The placement of a text label, recorded for the preview's Move labels tool; null when the item has no label. */
  const placeText = (key: string): { sp: TextLabelSpec; tp: TextPlacement } | null => {
    const sp = textSpecs.get(key)
    if (!sp) return null
    const tp = placeTextLabel(p, sp)
    placed.push(textPlaced(sp, tp))
    return { sp, tp }
  }
  /** A moved text label: the text where it was put, and its leader (MUT point, object edge). */
  const movedText = (pen: Pen, t: { sp: TextLabelSpec; tp: TextPlacement }, leaderLayer: string) => {
    pen.text(t.tp.x, t.tp.y, t.sp.th, t.sp.rot, t.sp.txt, t.sp.layer)
    if (t.tp.leader) pen.parts(leaderParts(t.tp.leader, leaders), leaderLayer)
  }

  // Vessel border and centerline
  if (sized && s.showVesselOnOverlay) {
    const pen = new Pen()
    pen.rect(0, 0, H, L, 'VESSEL')
    if (s.showCenterline) pen.dash(H / 2, 0, H / 2, L, 8, 5, 'CENTERLINE')
    add('vessel', null, pen, `Shell: ${fmt(H)} in around x ${fmt(L)} in long`)
  }

  // Scans (drawn as the .lsp does: reversed ones flipped while the data check is on; across the seam in pieces)
  const scans = drawnScans(p)
  const C = circumference(p)
  scans.forEach((sc, index) => {
    if (!sc.include || !complete(sc.xStart, sc.xStop, sc.yStart, sc.yStop)) return
    const pen = new Pen()
    const w = sc.xStop! - sc.xStart!
    const h = sc.yStop! - sc.yStart!
    const pieces = scanPieces(sc, C)
    if (isWrapped(pieces)) wrappedRect(pen, o, pieces, sc.yStart!, h, sc.id, 'SCANS', 'AUT_HATCH', s.autHatchEnabled, step)
    else labelRect(pen, o, sc.xStart!, sc.yStart!, w, h, sc.id, 'SCANS', 'AUT_HATCH', s.autHatchEnabled, step)
    const across = isWrapped(pieces) ? ', across the seam' : ''
    add(`scans:${index}`, { list: 'scans', index, id: sc.id }, pen, `${sc.id}: X ${fmt(sc.xStart!)} to ${fmt(sc.xStop!)}, Y ${fmt(sc.yStart!)} to ${fmt(sc.yStop!)} (${fmt(Math.abs(w))} x ${fmt(Math.abs(h))} in${across})`)
  })

  // Scan images (their rectangles also keep nozzle labels away, as in CAD)
  if (scans.every((sc) => !sc.include || complete(sc.xStart, sc.xStop, sc.yStart, sc.yStop))) {
    for (const img of imageInserts(p, scans, false)) {
      const index = p.scans.findIndex((sc) => sc.id === img.scanId)
      const pen = new Pen()
      pen.shapes.push({ t: 'image', x: img.x, y: img.y, w: img.w, h: img.h, scanId: img.scanId, layer: 'SCAN_IMAGES', ...(img.crop ? { from: img.crop[0], to: img.crop[1] } : {}) })
      add(img.piece === undefined ? `image:${index}` : `image:${index}:${img.piece}`, { list: 'scans', index, id: img.scanId }, pen, `${img.scanId}: photo (${img.fileName})`)
    }
  }

  // Supports / objects
  if (s.showSupportsOnOverlay) {
    p.objects.forEach((ob, index) => {
      if (!ob.include || !complete(ob.x, ob.y, ob.circWidth, ob.length)) return
      const pen = new Pen()
      const pieces = objectPieces(ob, C)
      const t = placeText(`objects:${index}`)
      if (t?.tp.moved) {
        for (const pc of pieces) pieceRect(pen, pc.x0, ob.y!, pc.x1 - pc.x0, ob.length!, 'SUPPORTS', '', false, step)
        movedText(pen, t, 'SUPPORTS')
      } else if (isWrapped(pieces)) wrappedRect(pen, o, pieces, ob.y!, ob.length!, ob.id, 'SUPPORTS', '', false, step)
      else labelRect(pen, o, pieces[0].x0, ob.y!, ob.circWidth!, ob.length!, ob.id, 'SUPPORTS', '', false, step)
      const across = isWrapped(pieces) ? ', across the seam' : ''
      add(`objects:${index}`, { list: 'objects', index, id: ob.id }, pen, `${ob.id}: X ${fmt(ob.x!)}, Y ${fmt(ob.y!)}, ${fmt(ob.circWidth!)} x ${fmt(ob.length!)} in${across}`)
    })
  }

  // Shell nozzles
  if (s.showNozzlesOnOverlay && sized) {
    const labels = shellNozzleLabels(p, scans)
    p.shellNozzles.forEach((n, index) => {
      const l = labels.get(index)
      if (!l) return
      const pen = new Pen()
      nozzleAt(pen, o, l, 'NOZZLES', 'NOZZLES', leaders)
      placed.push(nozzlePlaced(`shellNozzles:${index}`, 'shellNozzles', index, n.id, l))
      add(`shellNozzles:${index}`, { list: 'shellNozzles', index, id: n.id }, pen, `${n.id}: diameter ${fmt(n.diameter!)} in at X ${fmt(n.x!)}, Y ${fmt(n.y!)}${n.minT !== null ? `, min. T ${n.minT}` : ''}`)
    })
  }

  // Shell MUT
  p.shellMut.forEach((m, index) => {
    if (!complete(m.x, m.y)) return
    const pen = new Pen()
    const t = placeText(`shellMut:${index}`)
    if (t?.tp.moved) movedText(pen, t, 'SHELL_MUT_TEXT')
    else pen.text(m.x!, m.y!, 1.5, readableRot(o), m.id, 'SHELL_MUT_TEXT')
    add(`shellMut:${index}`, { list: 'shellMut', index, id: m.id }, pen, `${m.id}: X ${fmt(m.x!)}, Y ${fmt(m.y!)}${m.minT !== null ? `, min. T ${m.minT}` : ''}`)
  })

  // Welds
  if (s.showWeldsOnOverlay && sized) {
    p.circWelds.forEach((cw, index) => {
      if (!cw.include || !complete(cw.y)) return
      const pen = new Pen()
      pen.dash(0, cw.y!, H, cw.y!, 4, 2.5, 'CIRC_WELDS')
      const t = placeText(`circWelds:${index}`)
      if (t) pen.text(t.tp.x, t.tp.y, 2, 0, cw.id, 'CIRC_WELDS')
      add(`circWelds:${index}`, { list: 'circWelds', index, id: cw.id }, pen, `${cw.id}: circ weld at Y ${fmt(cw.y!)}`)
    })
    p.longSeams.forEach((ls, index) => {
      if (!ls.include || !complete(ls.x)) return
      const pen = new Pen()
      const y1 = ls.startY === null || ls.startY < 0 ? 0 : ls.startY
      const y2 = ls.stopY === null || ls.stopY < 0 ? L : ls.stopY
      pen.dash(ls.x!, y1, ls.x!, y2, 4, 2.5, 'LONG_SEAMS')
      const t = placeText(`longSeams:${index}`)
      if (t) pen.text(t.tp.x, t.tp.y, 2, t.sp.rot, ls.id, 'LONG_SEAMS')
      add(`longSeams:${index}`, { list: 'longSeams', index, id: ls.id }, pen, `${ls.id}: long seam at X ${fmt(ls.x!)}, Y ${fmt(y1)} to ${fmt(y2)}`)
    })
  }

  if (!sized) return finish(p, o, items, placed)
  const ori = o.toUpperCase()

  // Rulers
  if (s.showRulers) {
    const placement = ucaseTrim(s.rulerPlacement) || 'BOTTOM + LEFT'
    if (!['NONE', 'OFF', 'NO'].includes(placement)) {
      const labels = axisLabels(p)
      for (const c of rulerCalls({ ori, placement, rulerOffset: s.rulerOffset, vesselXLen: H, vesselYLen: L, spacing: s.rulerSpacing, xAxisLabel: labels.x, yAxisLabel: labels.y })) {
        const pen = new Pen()
        ruler(pen, o, s.arrowHeadSize, s.directionArrowStyle, directionArrowLength(s, c.axis, c.label), c, sizedHeight(textSizeRules(s), textLayer(c.layer), 1.8))
        add(`ruler:${c.layer}`, null, pen, c.label)
      }
    }
  }

  // Reference labels
  const ref = referenceLabelLayout(p)
  if (ref) {
    const pen = new Pen()
    const base = ref.atStart ? 0 : L
    const sd = ref.atStart ? -1 : 1
    REFERENCE_POSITIONS.forEach((f, i) => {
      if (ref.labels[i].trim() === '') return
      pen.line(H * f, base, H * f, base + sd * ref.tickLen, 'X_AXIS')
      pen.text(H * f, base + sd * (ref.tickLen + ref.textGap), ref.textH, rulerTextRotX(o), ref.labels[i], 'REFERENCE_TEXT')
    })
    add('referenceLabels', null, pen, `Reference labels: ${ref.labels.filter((l) => l.trim()).join(', ')}`)
  }

  // Head views
  const { headDia, panel } = panelOf(p)
  const scales = panelScales(s)
  const mode = s.headViewMode
  if (mode !== 'NONE') {
    const center = (head: string): [number, number] => (head === 'HEAD 1' ? [panel.head1X, panel.head1Y] : [panel.head2X, panel.head2Y])
    for (const head of ['HEAD 1', 'HEAD 2'] as const) {
      if (!shouldShowHead(mode, head)) continue
      const pen = new Pen()
      const [cx, cy] = center(head)
      headView(pen, o, p, cx, cy, headDia, ucaseTrim(head === 'HEAD 1' ? s.head1Label : s.head2Label))
      add(`head:${head}`, null, pen, `${head} view (${fmt(headDia)} in)`)
    }
    if (s.showHeadNozzles) {
      const labels = headNozzleLabels(p, panel, headDia)
      p.headNozzles.forEach((n, index) => {
        const l = labels.get(index)
        if (!l) return
        const pen = new Pen()
        nozzleAt(pen, o, l, 'HEADS', 'HEAD_NOZZLE_TEXT', leaders)
        placed.push(nozzlePlaced(`headNozzles:${index}`, 'headNozzles', index, n.id, l))
        add(`headNozzles:${index}`, { list: 'headNozzles', index, id: n.id }, pen, `${n.id} (${n.head}): diameter ${fmt(n.diameter!)} in at ${n.clock ?? '?'} o'clock`)
      })
    }
    p.headMut.forEach((m, index) => {
      if (!m.include || !shouldShowHead(mode, m.head)) return
      const [cx, cy] = center(m.head)
      const [dx, dy] = headVector(o, clockPositionDegrees(m.clock))
      const f = radiusFactor(m) * (headDia / 2)
      const pen = new Pen()
      if (m.id) pen.text(cx + f * dx, cy + f * dy, 1.5, readableRot(o), m.id, 'HEAD_MUT_TEXT')
      add(`headMut:${index}`, { list: 'headMut', index, id: m.id }, pen, `${m.id} (${m.head}): at ${m.clock ?? '?'} o'clock${m.minT !== null ? `, min. T ${m.minT}` : ''}`)
    })
  }

  // Legend and title block
  if (s.showLegendOnOverlay) {
    const counted = countedScans(p, drawnScans(p), false)
    const coverage = coveragePercent(p, counted)
    const pen = new Pen()
    legend(pen, o, panel.legendX, panel.legendY, scales.legend, s.autHatchEnabled, step, {
      total: `Total Scans: ${counted.length}`,
      cov: coverage === null ? '' : `Coverage: ${vbaFormatFixed(coverage, 1, 1)}%`,
      orient: o === 'Vertical' ? 'Orientation: Vertical' : 'Orientation: Horizontal',
      overlay: 'Overlay: Enabled',
    })
    add('legend', null, pen, 'Legend')
  }
  if (s.showTitleBlockOnOverlay) {
    const pen = new Pen()
    titleBlock(pen, o, panel.titleX, panel.titleY, scales.title, titleLines(p, false))
    add('titleBlock', null, pen, 'Title block')
  }

  return finish(p, o, items, placed)
}

function finish(p: Project, o: Orientation, items: DrawingItem[], labels: PlacedLabel[]): Drawing {
  const s = p.settings
  // Text sizes from the Drawing step, applied the way SL_TextHeight does in the .lsp.
  const rules = textSizeRules(s)
  if (rules.size > 0) {
    for (const it of items) for (const sh of it.shapes) if (sh.t === 'text') sh.h = sizedHeight(rules, sh.layer, sh.h)
  }
  return {
    orientation: o, items, hatchTransparency: s.autHatchTransparency, centerlineTransparency: s.centerlineTransparency,
    layerColors: Object.fromEntries(appLayerSetup(s)), labels,
  }
}
