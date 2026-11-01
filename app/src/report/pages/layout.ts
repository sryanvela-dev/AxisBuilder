// Shared layout for every report page: the brand style (approved style sample, brand-constants.json), the page
// sizes, small helpers that add items, text wrapping with coloured runs, boxes with a title and the standard frame
// (design 6.0: header band, section title, footer with "Page X of Y").

import type { Project } from '../../data/schema.ts'
import { fitText, fontBox, measure, wrapText, type ReportFontId } from '../fonts.ts'
import { imageKey, type Color, type PageItem, type Rect, type ReportPage, type TextItem } from '../pageModel.ts'
import type { Report } from '../schema.ts'
import type { FieldRef, LadderColor, ReportTemplate } from '../templates/types.ts'
import { fieldValue } from './values.ts'

// --- Style -------------------------------------------------------------------------------------

export const COLORS = {
  blue: '#2875BA',
  deep: '#104777',
  sky: '#3B91CE',
  orange: '#F47E1F',
  tint: '#EEF4FA',
  line: '#C9DAEA',
  text: '#000000',
  muted: '#444444',
  red: '#C0262D',
  amber: '#B86E00',
  white: '#FFFFFF',
  placeholder: '#EEF0F3',
  placeholderText: '#7A8594',
} as const

/** Ladder colour of a figure: normal bands print in the given colour. */
export const ladderInk = (c: LadderColor | null, normal: Color = COLORS.text): Color => (c === 'red' ? COLORS.red : c === 'amber' ? COLORS.amber : normal)

export const F = {
  title: 'montserrat-700',
  heading: 'montserrat-600',
  body: 'roboto-400',
  label: 'roboto-500',
  bold: 'roboto-700',
} as const satisfies Record<string, ReportFontId>

export const LETTER_LANDSCAPE = { w: 11, h: 8.5 }
export const LETTER_PORTRAIT = { w: 8.5, h: 11 }

/** Standard frame (landscape letter): margins, header band, section title and the content area left for builders. */
export const FRAME = {
  left: 0.5,
  right: 10.5,
  top: 0.45,
  /** The blue rule under the header band. */
  headerRule: 1.32,
  /** Baseline of the section title. */
  titleBase: 1.66,
  /** Footer rule and text baseline. */
  footerRule: 8.06,
  footerBase: 8.2,
} as const

/** What is left for a page's content under the standard frame: about 10.0 x 6.1 in (measured: see CONTENT). */
export const CONTENT: Rect = { x: FRAME.left, y: 1.86, w: FRAME.right - FRAME.left, h: 7.94 - 1.86 }

/**
 * The standard frame on a portrait letter page, for reference pages whose sheet is upright (user, 2026-10-31): the
 * header as tall as the landscape one (user, 2026-11-01: a taller one pushed the sheet down): the field list beside the
 * logo, the 0" reference on the right with the side column's chips in two narrower columns under it; content about
 * 7.5 x 8.6 in, so an upright letter sheet prints at about 78% instead of 55%.
 */
export const FRAME_PORTRAIT = {
  left: 0.5,
  right: 8.0,
  top: 0.45,
  headerRule: FRAME.headerRule,
  titleBase: FRAME.titleBase,
  footerRule: 10.56,
  footerBase: 10.7,
} as const
export const CONTENT_PORTRAIT: Rect = { x: FRAME_PORTRAIT.left, y: CONTENT.y, w: FRAME_PORTRAIT.right - FRAME_PORTRAIT.left, h: 10.44 - CONTENT.y }

export type PageSize = { w: number; h: number }
export const isPortrait = (size: PageSize) => size.h > size.w

export const LOGO = { file: 'integrity-epc-logo.png', aspect: 900 / 243 }

// --- Items -------------------------------------------------------------------------------------

export function text(x: number, y: number, s: string, font: ReportFontId, size: number, color: Color = COLORS.text, align: TextItem['align'] = 'left'): TextItem {
  return { t: 'text', x, y, text: s, font, size, color, align }
}

export const line = (x1: number, y1: number, x2: number, y2: number, width: number, color: Color): PageItem => ({ t: 'line', x1, y1, x2, y2, width, color })

export const rect = (r: Rect, fill: Color | null, stroke: Color | null = null, width = 0.75, radius = 0): PageItem => ({ t: 'rect', ...r, fill, stroke, width, radius })

/** Line height (inches) of a font size in points, as the style sample's 1.4 line spacing. */
export const lineHeight = (size: number, k = 1.4) => (size * k) / 72

/** Wrapped text lines placed from `top` (the first line's top), returning the items and the height used. */
export function textBlock(s: string, x: number, top: number, width: number, font: ReportFontId, size: number, color: Color = COLORS.text, opts: { k?: number; align?: TextItem['align']; maxLines?: number } = {}) {
  let lines = wrapText(s, font, size, width)
  if (opts.maxLines !== undefined && lines.length > opts.maxLines) {
    lines = lines.slice(0, opts.maxLines)
    lines[lines.length - 1] = fitText(`${lines[lines.length - 1]}…`, font, size, width)
  }
  const lh = lineHeight(size, opts.k)
  const asc = fontBox(font, size).ascent
  const align = opts.align ?? 'left'
  const ax = align === 'center' ? x + width / 2 : align === 'right' ? x + width : x
  const items = lines.map((l, i) => text(ax, top + (lh - (asc + fontBox(font, size).descent)) / 2 + asc + i * lh, l, font, size, color, align))
  return { items, height: lines.length * lh, lines }
}

// --- Rich text (figures coloured inside a sentence) ---------------------------------------------

export interface Run {
  text: string
  font: ReportFontId
  color: Color
}

/** Runs wrapped to a width: lines of runs (words never split between runs except at spaces). */
export function wrapRuns(runs: readonly Run[], size: number, width: number): Run[][] {
  // Split into words, each word a list of pieces (a word may change colour midway, e.g. 0.716" then ",").
  type Piece = Run
  const words: { pieces: Piece[]; space: boolean }[] = []
  let cur: Piece[] = []
  for (const r of runs) {
    const parts = r.text.split(/( +)/)
    for (const part of parts) {
      if (part === '') continue
      if (/^ +$/.test(part)) {
        if (cur.length) words.push({ pieces: cur, space: true })
        cur = []
        continue
      }
      cur.push({ ...r, text: part })
    }
  }
  if (cur.length) words.push({ pieces: cur, space: false })
  const wordW = (w: { pieces: Piece[] }) => w.pieces.reduce((a, p) => a + measure(p.text, p.font, size), 0)
  const lines: Run[][] = []
  let lineRuns: Run[] = []
  let lineW = 0
  for (const w of words) {
    const ww = wordW(w)
    const space = lineRuns.length ? measure(' ', F.body, size) : 0
    if (lineRuns.length && lineW + space + ww > width) {
      lines.push(lineRuns)
      lineRuns = []
      lineW = 0
    }
    if (lineRuns.length) {
      lineRuns.push({ ...lineRuns[lineRuns.length - 1], text: ' ' })
      lineW += space
    }
    lineRuns.push(...w.pieces)
    lineW += ww
  }
  if (lineRuns.length) lines.push(lineRuns)
  return lines.map(mergeRuns)
}

function mergeRuns(rs: Run[]): Run[] {
  const out: Run[] = []
  for (const r of rs) {
    const last = out[out.length - 1]
    if (last && last.font === r.font && last.color === r.color) last.text += r.text
    else out.push({ ...r })
  }
  return out
}

/** Text items for a line of runs starting at x on a baseline. */
export function runItems(runs: readonly Run[], x: number, baseline: number, size: number): TextItem[] {
  const out: TextItem[] = []
  let at = x
  for (const r of runs) {
    out.push(text(at, baseline, r.text, r.font, size, r.color))
    at += measure(r.text, r.font, size)
  }
  return out
}

// --- Boxes ---------------------------------------------------------------------------------------

/** A box as the style sample's: light outline with a blue top bar and an optional title. */
export function titledBox(r: Rect, title: string | null): { items: PageItem[]; inner: Rect } {
  const items: PageItem[] = [rect(r, COLORS.white, COLORS.line, 0.75), rect({ x: r.x, y: r.y, w: r.w, h: 3 / 72 }, COLORS.blue)]
  let top = r.y + 3 / 72 + 0.11
  if (title) {
    items.push(text(r.x + 0.14, top + fontBox(F.title, 12).ascent, title, F.title, 12, COLORS.blue))
    top += 0.3
  }
  return { items, inner: { x: r.x + 0.14, y: top, w: r.w - 0.28, h: r.y + r.h - top - 0.1 } }
}

/** The quiet placeholder for something missing ("No screenshot"): a grey box with grey words, never "Click here". */
export function placeholder(r: Rect, words: string): PageItem[] {
  const size = 10
  return [rect(r, COLORS.placeholder, COLORS.line, 0.5, 0.03), text(r.x + r.w / 2, r.y + r.h / 2 + fontBox(F.body, size).cap / 2, words, F.body, size, COLORS.placeholderText, 'center')]
}

/** The largest box of a shape (width / height) that fits in `r`, centred (or top-aligned). */
export function fitBox(aspect: number, r: Rect, align: 'center' | 'top' = 'center'): Rect {
  let w = r.w
  let h = w / aspect
  if (h > r.h) {
    h = r.h
    w = h * aspect
  }
  return { x: r.x + (r.w - w) / 2, y: align === 'top' ? r.y : r.y + (r.h - h) / 2, w, h }
}

// --- Standard frame ------------------------------------------------------------------------------

export interface FrameContext {
  p: Project
  r: Report
  t: ReportTemplate
}

const fieldsOf = (c: FrameContext, refs: readonly FieldRef[]) => refs.map((f) => ({ ref: f, value: fieldValue(c.p, c.r, c.t, f) }))

/**
 * Header band, section title (with an optional quieter subtitle) and the footer rule; the footer text with "Page X of
 * Y" is added once the pages are counted (`footer`).
 */
export function frameItems(c: FrameContext, title: string, subtitle = '', pageSize: PageSize = LETTER_LANDSCAPE): PageItem[] {
  const portrait = isPortrait(pageSize)
  const fr = portrait ? FRAME_PORTRAIT : FRAME
  const items: PageItem[] = []
  const logoW = 1.5
  const logoH = logoW / LOGO.aspect
  items.push({ t: 'image', ref: { source: 'brand', file: LOGO.file }, x: FRAME.left, y: FRAME.top + (0.82 - logoH) / 2, w: logoW, h: logoH, upright: { w: 900, h: 243 }, orientation: 1, rotate: 0, crop: null, marks: [], key: imageKey({ source: 'brand', file: LOGO.file }, null) })

  // Fields: before the axis texts = the field list; the axis texts = the 0" reference; after them = chips.
  const all = fieldsOf(c, c.t.headerFields)
  const firstAxis = all.findIndex((f) => /AxisDirectionText$/.test(f.ref.source))
  const kv = firstAxis < 0 ? all : all.slice(0, firstAxis)
  const axes = firstAxis < 0 ? [] : all.filter((f) => /AxisDirectionText$/.test(f.ref.source))
  const after = firstAxis < 0 ? [] : all.slice(firstAxis).filter((f) => !/AxisDirectionText$/.test(f.ref.source))
  const chips = after
  const size = 7.6
  const rowH = 0.168
  const kvX = 2.18
  const kvLabelW = Math.max(...kv.map((f) => measure(f.ref.label, F.label, size)), 0.5)
  const kvValX = kvX + kvLabelW + 0.08
  const kvRight = portrait ? 5.15 : 6.25
  kv.forEach((f, i) => {
    const base = FRAME.top + 0.12 + i * rowH
    items.push(text(kvX + kvLabelW, base, f.ref.label, F.label, size, COLORS.deep, 'right'))
    items.push(text(kvValX, base, fitText(f.value, F.body, size, kvRight - kvValX), F.body, size))
    items.push(line(kvValX, base + 0.045, kvRight, base + 0.045, 0.5, COLORS.line))
  })
  const refX = portrait ? 5.35 : 6.55
  if (axes.length) {
    items.push(text(refX, FRAME.top + 0.12, '0" Reference', F.heading, size, COLORS.deep))
    axes.forEach((f, i) => items.push(text(refX, FRAME.top + 0.12 + (i + 1) * 0.15, fitText(`${f.ref.label} = ${f.value}`, F.body, size, fr.right - refX), F.body, size)))
  }
  const chipTop = FRAME.top + 0.12 + (axes.length + 1) * 0.15 + 0.06
  // Portrait: two narrower columns, each label as wide as it needs, so the chips fit beside the field list.
  const colW = portrait ? (fr.right - refX) / 2 : 2.0
  const labelW = [0, 1].map((col) => (portrait ? Math.max(0, ...chips.filter((_, i) => i % 2 === col).map((f) => measure(f.ref.label, F.label, size))) + 0.06 : 0.92))
  chips.forEach((f, i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const x = refX + col * colW
    const base = chipTop + row * 0.17
    items.push(text(x, base, f.ref.label, F.label, size, COLORS.deep))
    items.push(text(x + labelW[col], base, fitText(f.value, F.body, size, portrait ? colW - labelW[col] - 0.06 : 1.0), F.body, size))
  })
  items.push(line(fr.left, fr.headerRule, fr.right, fr.headerRule, 2, COLORS.blue))

  // Section title, subtitle beside it.
  items.push(text(fr.left, fr.titleBase, title, F.title, 15, COLORS.deep))
  if (subtitle) {
    const x = fr.left + measure(title, F.title, 15) + 0.12
    items.push(text(x, fr.titleBase, fitText(subtitle, F.body, 9, fr.right - x), F.body, 9, COLORS.muted))
  }
  items.push(line(fr.left, fr.footerRule, fr.right, fr.footerRule, 0.75, COLORS.line))
  return items
}

/**
 * Footer text of a standard page: the lead field (bold), the others joined with " · " (with their prefix, blank ones
 * left out), the centre field in the middle and "Page X of Y" on the right.
 */
export function footerItems(c: FrameContext, page: ReportPage, n: number, total: number): PageItem[] {
  const size = 7.5
  const fields = fieldsOf(c, c.t.footerFields).filter((f) => f.value !== '')
  const lead = fields.find((f) => f.ref.place === 'lead')
  const centre = fields.find((f) => f.ref.place === 'centre')
  const rest = fields.filter((f) => f !== lead && f !== centre).map((f) => `${f.ref.prefix ?? ''}${f.value}`)
  const runs: Run[] = []
  if (lead) runs.push({ text: lead.value, font: F.heading, color: COLORS.deep })
  if (rest.length) runs.push({ text: `${lead ? '  ·  ' : ''}${rest.join('  ·  ')}`, font: F.body, color: '#333333' })
  const right = page.size.w - FRAME.left
  const base = page.size.h - (8.5 - FRAME.footerBase)
  const items: PageItem[] = runItems(runs, FRAME.left, base, size)
  if (centre) items.push(text(page.size.w / 2, base, `${centre.ref.prefix ?? ''}${centre.value}`, F.body, size, '#333333', 'center'))
  items.push(text(right, base, `Page ${n} of ${total}`, F.body, size, '#333333', 'right'))
  return items
}
