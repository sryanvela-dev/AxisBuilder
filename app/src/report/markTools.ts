// The markup editor's tools (design 14 "Tools", R5) as pure functions: what each tool makes from a click, a drag or a
// freehand stroke in the view, with the tool settings the toolbar holds. The editor only routes the pointer here and
// stores the result, so every tool's result data is unit-tested.

import { contrastOf } from './marks.ts'
import { finishStroke, lockAngle, toFrac, type MarkFrame, type Pt } from './markGeometry.ts'
import { applyLabelStyle, type LabelStyle, type NewMark } from './markEdits.ts'
import { imageItems, type ImagePlace } from './imageItems.ts'
import { visibleAspect, type ReportDocument } from './pageModel.ts'
import { markSchema, type FracBox, type Mark, type MarkStyle, type Report, type Rotation } from './schema.ts'

export const TOOL_IDS = ['select', 'rect', 'ellipse', 'highlight', 'highlightLine', 'pen', 'line', 'arrow', 'label', 'badge', 'redaction'] as const
export type ToolId = (typeof TOOL_IDS)[number]

export interface ToolInfo {
  id: ToolId
  label: string
  key: string
  icon: string
  hint: string
}

/** Toolbar order, names, shortcut keys and icons. */
export const TOOLS: readonly ToolInfo[] = [
  { id: 'select', label: 'Select', key: 'V', icon: '⬉', hint: 'Select, move and resize marks; drag on empty picture to select several' },
  { id: 'rect', label: 'Box', key: 'R', icon: '▭', hint: 'Box: drag; Shift = square' },
  { id: 'ellipse', label: 'Ellipse', key: 'E', icon: '◯', hint: 'Ellipse: drag; Shift = circle' },
  { id: 'highlight', label: 'Highlighter', key: 'H', icon: '🖍', hint: 'Highlighter, freehand' },
  { id: 'highlightLine', label: 'Straight highlight', key: 'G', icon: '▬', hint: 'Straight highlighter in any direction: drag; Shift = 0 / 45 / 90 degrees' },
  { id: 'pen', label: 'Pen', key: 'P', icon: '✎', hint: 'Pen, freehand (smoothed)' },
  { id: 'line', label: 'Line', key: 'L', icon: '╱', hint: 'Line: drag; Shift = 0 / 45 / 90 degrees' },
  { id: 'arrow', label: 'Arrow', key: 'A', icon: '↗', hint: 'Arrow: drag from tail to point; Shift = 0 / 45 / 90 degrees' },
  { id: 'label', label: 'Label', key: 'T', icon: 'T', hint: 'Label: click to place, or drag from what it points at to where the label goes (a leader)' },
  { id: 'badge', label: 'Badge', key: 'B', icon: '①', hint: 'Numbered badge: click; its key text prints under the picture' },
  { id: 'redaction', label: 'Redact', key: 'X', icon: '▇', hint: 'Redaction: drag a box; the PDF removes those pixels (black or blurred)' },
]

export const SHAPE_MODES = ['outline', 'filled', 'highlighted'] as const
export type ShapeMode = (typeof SHAPE_MODES)[number]

/** What the toolbar holds for new marks (kept per browser). */
export interface ToolPrefs {
  color: string
  /** Line width, points at print size. */
  width: number
  shape: ShapeMode
  /** Highlighter width, points, and ends. */
  hlWidth: number
  hlEnds: 'flat' | 'round'
  textSize: number
  callout: 'rounded' | 'square' | 'pill' | 'plain'
  leaderEnd: 'arrow' | 'dot' | 'none'
  head: 'closed' | 'open' | 'dot' | 'none'
  redact: 'black' | 'blur'
  bold: boolean
  font: 'roboto' | 'montserrat'
  /** Contrasting outline / halo on labels and badges. */
  halo: boolean
  /** Label and badge box background opacity. */
  bgOpacity: number
}

export const DEFAULT_PREFS: ToolPrefs = {
  color: '#d62828', width: 1.5, shape: 'outline', hlWidth: 12, hlEnds: 'flat', textSize: 9, callout: 'rounded', leaderEnd: 'arrow', head: 'closed', redact: 'black',
  bold: false, font: 'roboto', halo: true, bgOpacity: 0.9,
}

/** Colour presets with their meaning (design 14): red finding, yellow highlight, green acceptable, blue note. */
export const COLOR_PRESETS = [
  { color: '#d62828', name: 'Red (finding)' },
  { color: '#f2c200', name: 'Yellow (highlight)' },
  { color: '#2e9e44', name: 'Green (acceptable)' },
  { color: '#1d5fa8', name: 'Blue (note)' },
  { color: '#1a1a1a', name: 'Black' },
  { color: '#ffffff', name: 'White' },
] as const

export const WIDTH_PRESETS = [{ w: 0.75, name: 'Thin' }, { w: 1.5, name: 'Medium' }, { w: 3, name: 'Thick' }] as const
/** Highlighter widths, points at print size. */
export const HIGHLIGHT_WIDTHS = [{ w: 6, name: 'Fine' }, { w: 12, name: 'Medium' }, { w: 20, name: 'Wide' }, { w: 32, name: 'Extra wide' }] as const
export const TEXT_SIZES = [7, 8, 9, 10, 12, 14, 18] as const
/** See-through look of highlighter strokes and highlighted boxes. */
export const HIGHLIGHT_OPACITY = 0.5
export const HIGHLIGHTED_FILL = 0.25
/** Smallest drag that makes a box, line or arrow (view inches); less is a click. */
export const MIN_DRAG = 0.06

const base = (s: Partial<MarkStyle>): MarkStyle => markSchema.parse({ id: 'x', kind: 'badge', at: [0, 0], n: 1, style: s }).style

/** The style a tool gives a new mark. */
export function toolStyle(tool: ToolId, p: ToolPrefs): MarkStyle {
  switch (tool) {
    case 'rect': case 'ellipse':
      return base({ stroke: p.color, width: p.width, fill: p.shape === 'outline' ? null : p.color, fillOpacity: p.shape === 'highlighted' ? HIGHLIGHTED_FILL : 1 })
    case 'highlight': case 'highlightLine':
      return base({ stroke: p.color, width: p.hlWidth, opacity: HIGHLIGHT_OPACITY, ends: p.hlEnds })
    case 'pen': case 'line': case 'arrow':
      return base({ stroke: p.color, width: p.width })
    case 'label':
      return base({ stroke: p.color, fill: p.color, textColor: p.callout === 'plain' ? p.color : contrastOf(p.color), textSize: p.textSize, width: p.width, bold: p.bold, font: p.font, halo: p.halo, bgOpacity: p.bgOpacity })
    case 'badge':
      return base({ stroke: p.color, fill: p.color, textColor: contrastOf(p.color), textSize: p.textSize + 1, width: 1, bold: true, font: p.font, halo: p.halo, bgOpacity: p.bgOpacity })
    default:
      return base({})
  }
}

const clampPt = (q: Pt): [number, number] => [Math.min(1, Math.max(0, q[0])), Math.min(1, Math.max(0, q[1]))]

/** A box tool's corners from a drag (Shift: a square, from the start corner). */
function dragBox(f: MarkFrame, a: Pt, b: Pt, square: boolean) {
  let end = b
  if (square) {
    const s = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))
    end = [a[0] + Math.sign(b[0] - a[0] || 1) * s, a[1] + Math.sign(b[1] - a[1] || 1) * s]
  }
  const p = clampPt(toFrac(f, a))
  const q = clampPt(toFrac(f, end))
  return { x0: Math.min(p[0], q[0]), y0: Math.min(p[1], q[1]), x1: Math.max(p[0], q[0]), y1: Math.max(p[1], q[1]) }
}

/**
 * The mark a drag tool makes from view point `a` to `b` (box, ellipse, redaction, straight highlight, line, arrow, a
 * label with a leader); null when the drag is too short (a click) for a tool that needs one. `shift` = square / 0, 45,
 * 90 degrees.
 */
export function markFromDrag(tool: ToolId, p: ToolPrefs, f: MarkFrame, a: Pt, b: Pt, shift: boolean, style: LabelStyle | null = null): NewMark | null {
  const long = Math.hypot(b[0] - a[0], b[1] - a[1]) >= MIN_DRAG
  const s = toolStyle(tool, p)
  const meta = { style: s, link: null, locked: false }
  switch (tool) {
    case 'rect': case 'ellipse': {
      if (!long) return null
      const box = dragBox(f, a, b, shift)
      return box.x1 > box.x0 && box.y1 > box.y0 ? { kind: tool, ...meta, box, angle: 0 } : null
    }
    case 'redaction': {
      if (!long) return null
      const box = dragBox(f, a, b, false)
      return box.x1 > box.x0 && box.y1 > box.y0 ? { kind: 'redaction', ...meta, box, mode: p.redact } : null
    }
    case 'highlightLine': case 'line': case 'arrow': {
      if (!long) return null
      const end = shift ? lockAngle(a, b) : b
      const from = clampPt(toFrac(f, a))
      const to = clampPt(toFrac(f, end))
      if (tool === 'highlightLine') return { kind: 'highlight', ...meta, points: [from, to], straight: true }
      if (tool === 'line') return { kind: 'line', ...meta, from, to }
      return { kind: 'arrow', ...meta, from, to, head: p.head }
    }
    case 'label': {
      // A drag points the label: the leader at the start, the label where the drag ends.
      const made: NewMark = {
        kind: 'label', ...meta, at: clampPt(toFrac(f, long ? b : a)), text: 'Label', template: '', callout: p.callout,
        leader: long ? clampPt(toFrac(f, a)) : null, leaderEnd: p.leaderEnd,
      }
      return style ? (applyLabelStyle({ ...made, id: 'x', z: 0 } as Mark, style) as unknown as NewMark) : made
    }
    case 'badge': {
      const made: NewMark = { kind: 'badge', ...meta, at: clampPt(toFrac(f, a)), n: 1, text: '' }
      return style?.kind === 'badge' ? (applyLabelStyle({ ...made, id: 'x', z: 0 } as Mark, style) as unknown as NewMark) : made
    }
    default:
      return null
  }
}

/** The mark a freehand tool (pen, highlighter) makes from the points the pointer went through (view inches). */
export function markFromStroke(tool: ToolId, p: ToolPrefs, f: MarkFrame, pts: readonly Pt[]): NewMark | null {
  if (pts.length < 2 || (tool !== 'pen' && tool !== 'highlight')) return null
  const len = pts.slice(1).reduce((n, q, i) => n + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0)
  if (len < MIN_DRAG / 2) return null
  const points = finishStroke(f, pts)
  const meta = { style: toolStyle(tool, p), link: null, locked: false }
  return tool === 'pen' ? { kind: 'pen', ...meta, points } : { kind: 'highlight', ...meta, points, straight: false }
}

/**
 * A toolbar setting applied to an existing mark, where it means something for that kind (the colour of a filled box
 * fills it too; a label's text colour follows for contrast). The same mark comes back when nothing applies.
 */
export function applyPrefToMark(m: Mark, change: Partial<ToolPrefs>): Mark {
  const s = { ...m.style }
  let out: Mark = m
  const k = m.kind
  if (change.color !== undefined) {
    const c = change.color
    if (k === 'rect' || k === 'ellipse') {
      s.stroke = c
      if (s.fill !== null) s.fill = c
    } else if (k === 'label') {
      s.stroke = c
      s.fill = c
      s.textColor = m.callout === 'plain' ? c : contrastOf(c)
    } else if (k === 'badge') {
      s.stroke = c
      s.fill = c
      s.textColor = contrastOf(c)
    } else if (k !== 'redaction') s.stroke = c
  }
  if (change.width !== undefined && (k === 'rect' || k === 'ellipse' || k === 'pen' || k === 'line' || k === 'arrow' || k === 'label')) s.width = change.width
  if (change.hlWidth !== undefined && k === 'highlight') s.width = change.hlWidth
  if (change.hlEnds !== undefined && k === 'highlight') s.ends = change.hlEnds
  if (change.shape !== undefined && (k === 'rect' || k === 'ellipse')) {
    s.fill = change.shape === 'outline' ? null : (s.stroke ?? '#d62828')
    s.fillOpacity = change.shape === 'highlighted' ? HIGHLIGHTED_FILL : 1
  }
  if (k === 'label' || k === 'badge') {
    if (change.textSize !== undefined) s.textSize = k === 'badge' ? change.textSize + 1 : change.textSize
    if (change.bold !== undefined && k === 'label') s.bold = change.bold
    if (change.font !== undefined) s.font = change.font
    if (change.halo !== undefined) s.halo = change.halo
    if (change.bgOpacity !== undefined) s.bgOpacity = change.bgOpacity
  }
  if (k === 'label' && change.callout !== undefined && change.callout !== m.callout) {
    // Plain text takes the label's colour; boxed text the contrast to its box.
    s.textColor = change.callout === 'plain' ? (s.fill ?? s.stroke ?? '#d62828') : contrastOf(s.fill ?? s.stroke ?? '#d62828')
    out = { ...m, callout: change.callout }
  }
  if (k === 'label' && change.leaderEnd !== undefined) out = { ...(out as typeof m), leaderEnd: change.leaderEnd }
  if (k === 'arrow' && change.head !== undefined) out = { ...m, head: change.head }
  if (k === 'redaction' && change.redact !== undefined) out = { ...m, mode: change.redact }
  const styleChanged = Object.keys(s).some((key) => s[key as keyof typeof s] !== m.style[key as keyof typeof s])
  if (!styleChanged) return out
  return { ...out, style: s } as Mark
}

/** Whether a tool draws freehand (follows the pointer) rather than from a drag's two ends. */
export const isFreehand = (t: ToolId) => t === 'pen' || t === 'highlight'

// --- Where a picture prints ----------------------------------------------------------------------------

const samePlace = (a: ImagePlace | undefined, b: ImagePlace) => !!a && JSON.stringify(a) === JSON.stringify(b)

export interface Printed {
  /** Index of the first page it prints on. */
  page: number
  /** The marks' frame on that page (inches). */
  frame: MarkFrame
}

/** Where a picture prints first in the document (the slot sets the editor's print-true scale), or null when it doesn't. */
export function findPrinted(doc: ReportDocument | null, at: ImagePlace): Printed | null {
  if (!doc) return null
  for (let n = 0; n < doc.pages.length; n++) {
    for (const it of doc.pages[n].items) {
      if (it.t === 'image' && samePlace(it.place, at)) return { page: n, frame: { x: it.x, y: it.y, w: it.w, h: it.h, crop: it.crop, rotate: it.rotate, upright: it.upright } }
      if (it.t === 'pdfPage' && samePlace(it.place, at) && it.pageSize) return { page: n, frame: { ...it.box, crop: null, rotate: it.rotate, upright: it.pageSize } }
    }
  }
  return null
}

/** Printed width a picture that doesn't print (yet) is shown at: a typical photo slot. */
export const FALLBACK_PRINT_W = 6.5

/**
 * The editor's frame for a picture: at (0, 0), as wide as it prints (else FALLBACK_PRINT_W), its height from the
 * picture's shape with the current crop and turn.
 */
export function editorFrame(upright: { w: number; h: number }, edits: { crop: FracBox | null; rotate: Rotation }, printed: Printed | null): MarkFrame {
  const aspect = visibleAspect(upright, edits.crop, edits.rotate)
  const w = printed ? Math.max(printed.frame.w, 0.5) : FALLBACK_PRINT_W
  return { x: 0, y: 0, w, h: w / aspect, crop: edits.crop, rotate: edits.rotate, upright }
}

/** The pictures marks can be copied to: every other picture of the report that has a file. */
export function copyTargets(r: Report, from: ImagePlace): { at: ImagePlace; file: string }[] {
  return imageItems(r).filter((x) => x.file && !samePlace(x.place, from)).map((x) => ({ at: x.place, file: x.file! }))
}
