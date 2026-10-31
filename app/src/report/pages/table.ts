// Tables in the style sample (blue header, light rules, tinted every other row, bold totals) laid out once and split
// into pages (design 7): rows fill the content area, the header repeats on every page, a row never splits and the
// totals row stays with at least one data row.

import { fitText, fontBox, measure, wrapText } from '../fonts.ts'
import type { Color, PageItem } from '../pageModel.ts'
import { COLORS, F, line, rect, text } from './layout.ts'

export interface TableColumn {
  header: string
  /** Header above this column and its neighbours with the same group. */
  group?: string
  align: 'left' | 'center'
  /** Long text: wraps, and takes the width left over. */
  wrap?: boolean
}

export interface TableCell {
  text: string
  color?: Color
  bold?: boolean
  /** Columns this cell covers (N/A reasons, the totals label). */
  span?: number
  align?: 'left' | 'center'
}

export interface TableRow {
  cells: TableCell[]
  kind: 'data' | 'total' | 'subtotal'
}

const HEAD = 7
const BODY = 7.8
const PAD_X = 0.06
const ROW = 0.205
const LH = (BODY * 1.3) / 72
const HEAD_ROW = 0.24

export interface TableLayout {
  widths: number[]
  headerHeight: number
  rowHeights: number[]
  /** Cell lines after wrapping, per row and cell. */
  lines: string[][][]
}

const cellFont = (row: TableRow, c: TableCell) => (c.bold || row.kind !== 'data' ? F.bold : F.body)

/** Column widths (fitted to `width`), header height and every row's height. */
export function layoutTable(columns: readonly TableColumn[], rows: readonly TableRow[], width: number): TableLayout {
  const n = columns.length
  const natural = columns.map((c) => measure(c.header, F.heading, HEAD) + 2 * PAD_X)
  for (const row of rows) {
    let col = 0
    for (const c of row.cells) {
      const span = c.span ?? 1
      if (span === 1 && col < n) natural[col] = Math.max(natural[col], measure(c.text, cellFont(row, c), BODY) + 2 * PAD_X)
      col += span
    }
  }
  // A group header wider than its columns widens them evenly.
  for (const g of new Set(columns.map((c) => c.group).filter((x): x is string => !!x))) {
    const idx = columns.flatMap((c, i) => (c.group === g ? [i] : []))
    const need = measure(g, F.heading, HEAD) + 2 * PAD_X
    const have = idx.reduce((a, i) => a + natural[i], 0)
    if (need > have) idx.forEach((i) => (natural[i] += (need - have) / idx.length))
  }
  const widths = [...natural]
  const wrapIdx = columns.flatMap((c, i) => (c.wrap ? [i] : []))
  const fixed = widths.reduce((a, w, i) => a + (columns[i].wrap ? 0 : w), 0)
  if (wrapIdx.length) {
    const left = Math.max(1.2 * wrapIdx.length, width - fixed)
    const want = wrapIdx.reduce((a, i) => a + widths[i], 0)
    wrapIdx.forEach((i) => (widths[i] = left * (widths[i] / want)))
  }
  const sum = widths.reduce((a, b) => a + b, 0)
  if (sum > width || !wrapIdx.length) {
    const k = width / sum
    for (let i = 0; i < n; i++) widths[i] *= k
  }
  const lines = rows.map((row) => {
    let col = 0
    return row.cells.map((c) => {
      const span = c.span ?? 1
      const w = widths.slice(col, col + span).reduce((a, b) => a + b, 0) - 2 * PAD_X
      const wrap = columns[col]?.wrap
      col += span
      return wrap ? wrapText(c.text, cellFont(row, c), BODY, w) : [fitText(c.text, cellFont(row, c), BODY, w)]
    })
  })
  const rowHeights = lines.map((ls) => Math.max(ROW, Math.max(1, ...ls.map((x) => x.length)) * LH + (ROW - LH)))
  const grouped = columns.some((c) => c.group)
  return { widths, headerHeight: grouped ? 2 * HEAD_ROW : HEAD_ROW * 1.25, rowHeights, lines }
}

/**
 * Splits rows into pages: the first page has `first` inches below its header, the others `rest`. A row never splits;
 * a totals row never starts a page alone (the row before it comes along).
 */
export function splitRows(layout: TableLayout, rows: readonly TableRow[], first: number, rest: number): [number, number][] {
  const pages: [number, number][] = []
  let start = 0
  let avail = first - layout.headerHeight
  let used = 0
  for (let i = 0; i < rows.length; i++) {
    const h = layout.rowHeights[i]
    if (used + h > avail && i > start) {
      let end = i
      // Keep a totals row with at least one data row.
      if (rows[i].kind !== 'data' && end - start > 1) end--
      pages.push([start, end])
      start = end
      used = layout.rowHeights.slice(start, i).reduce((a, b) => a + b, 0)
      avail = rest - layout.headerHeight
    }
    used += h
  }
  pages.push([start, rows.length])
  return pages
}

/** Items for the header and rows [from, to) of a table at (x, top). */
export function tableItems(columns: readonly TableColumn[], rows: readonly TableRow[], layout: TableLayout, x: number, top: number, from: number, to: number): PageItem[] {
  const items: PageItem[] = []
  const { widths } = layout
  const total = widths.reduce((a, b) => a + b, 0)
  const xs = widths.reduce<number[]>((a, w) => [...a, a[a.length - 1] + w], [x])
  const headBase = (y: number, h: number) => y + h / 2 + fontBox(F.heading, HEAD).cap / 2
  const grouped = columns.some((c) => c.group)
  items.push(rect({ x, y: top, w: total, h: layout.headerHeight }, COLORS.blue))
  for (let i = 0; i < columns.length; i++) {
    const c = columns[i]
    if (grouped && !c.group) {
      items.push(text(xs[i] + widths[i] / 2, headBase(top, layout.headerHeight), c.header, F.heading, HEAD, COLORS.white, 'center'))
    } else if (grouped) {
      items.push(text(xs[i] + widths[i] / 2, headBase(top + HEAD_ROW, HEAD_ROW), c.header, F.heading, HEAD, COLORS.white, 'center'))
      if (i === 0 || columns[i - 1].group !== c.group) {
        let j = i
        while (j + 1 < columns.length && columns[j + 1].group === c.group) j++
        items.push(text((xs[i] + xs[j + 1]) / 2, headBase(top, HEAD_ROW), c.group!, F.heading, HEAD, COLORS.white, 'center'))
        items.push(line(xs[i] + 0.02, top + HEAD_ROW, xs[j + 1] - 0.02, top + HEAD_ROW, 0.5, COLORS.white))
      }
    } else {
      items.push(text(xs[i] + widths[i] / 2, headBase(top, layout.headerHeight), c.header, F.heading, HEAD, COLORS.white, 'center'))
    }
    if (i > 0) items.push(line(xs[i], top + (grouped && c.group && columns[i - 1].group === c.group ? HEAD_ROW : 0), xs[i], top + layout.headerHeight, 0.5, COLORS.white))
  }
  let y = top + layout.headerHeight
  let zebra = 0
  for (let r = from; r < to; r++) {
    const row = rows[r]
    const h = layout.rowHeights[r]
    if (row.kind === 'data') {
      if (zebra++ % 2 === 1) items.push(rect({ x, y, w: total, h }, COLORS.tint))
      items.push(line(x, y + h, x + total, y + h, 0.5, COLORS.line))
    } else {
      items.push(line(x, y, x + total, y, 1.2, COLORS.deep))
      items.push(line(x, y + h, x + total, y + h, 0.5, COLORS.line))
    }
    let col = 0
    row.cells.forEach((c, k) => {
      const span = c.span ?? 1
      const x0 = xs[col]
      const x1 = xs[Math.min(col + span, columns.length)]
      const align = c.align ?? columns[col]?.align ?? 'center'
      const ls = layout.lines[r][k]
      const font = cellFont(row, c)
      const lineTop = y + (h - ls.length * LH) / 2
      ls.forEach((l, li) => {
        const base = lineTop + li * LH + LH / 2 + fontBox(font, BODY).cap / 2
        items.push(text(align === 'left' ? x0 + PAD_X : (x0 + x1) / 2, base, l, font, BODY, c.color ?? COLORS.text, align))
      })
      col += span
    })
    y += h
  }
  return items
}

/** Height of rows [from, to) with the header. */
export const tableHeight = (layout: TableLayout, from: number, to: number) => layout.headerHeight + layout.rowHeights.slice(from, to).reduce((a, b) => a + b, 0)
