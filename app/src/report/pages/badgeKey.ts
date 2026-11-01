// The key of a picture's numbered badges (design 14 "Labels" 3, R5): printed under the picture on its page, one line
// per badge that has key text ("(1) Pitting at 6 o'clock": a small badge in the badge's own colour, then its text),
// in badge order. The page builders make room for it by fitting the picture into what is left of its slot, so the
// picture keeps its shape and is never squashed.

import { wrapText } from '../fonts.ts'
import { contrastOf } from '../marks.ts'
import { ellipsePath, type PageItem, type Rect } from '../pageModel.ts'
import type { Mark } from '../schema.ts'
import { COLORS, F, fitBox } from './layout.ts'

export const KEY_SIZE = 8
const LH = (KEY_SIZE * 1.3) / 72
/** Space between the picture and its key, and between key columns. */
export const KEY_GAP = 0.08
const BADGE_W = 0.2
/** The key is never narrower than this (a small picture's key may stick out on both sides, centred). */
const KEY_MIN_W = 2.6
/** Two columns once the key is this wide and has this many lines. */
const TWO_COL_W = 4.5
const TWO_COL_N = 4

type Badge = Extract<Mark, { kind: 'badge' }>

/** The badges that print a key line, in number order. */
export function keyEntries(marks: readonly Mark[]): Badge[] {
  return marks.filter((m): m is Badge => m.kind === 'badge' && m.text.trim() !== '').sort((a, b) => a.n - b.n)
}

const columnsFor = (n: number, width: number) => (width >= TWO_COL_W && n >= TWO_COL_N ? 2 : 1)

/** Lines of each entry at a column width. */
function entryLines(b: Badge, colW: number): string[] {
  return wrapText(b.text.trim(), F.body, KEY_SIZE, Math.max(0.5, colW - BADGE_W))
}

/** Height of the key at a width (0 without entries). */
export function keyHeight(entries: readonly Badge[], width: number): number {
  if (entries.length === 0) return 0
  const cols = columnsFor(entries.length, width)
  const colW = (width - (cols - 1) * KEY_GAP * 2) / cols
  const heights = entries.map((b) => entryLines(b, colW).length * LH)
  if (cols === 1) return heights.reduce((a, b) => a + b, 0)
  const half = Math.ceil(entries.length / 2)
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
  return Math.max(sum(heights.slice(0, half)), sum(heights.slice(half)))
}

/** The key's items with its top-left at (x, y), `width` wide. */
export function keyItems(entries: readonly Badge[], x: number, y: number, width: number): PageItem[] {
  const out: PageItem[] = []
  const cols = columnsFor(entries.length, width)
  const colW = (width - (cols - 1) * KEY_GAP * 2) / cols
  const half = cols === 2 ? Math.ceil(entries.length / 2) : entries.length
  let cy = y
  entries.forEach((b, i) => {
    if (i === half) cy = y
    const cx = x + (i >= half ? colW + KEY_GAP * 2 : 0)
    const lines = entryLines(b, colW)
    const color = b.style.fill ?? b.style.stroke ?? COLORS.text
    const r = 0.07
    const mid = cy + LH / 2
    out.push({ t: 'path', d: ellipsePath({ x: cx, y: mid - r, w: 2 * r, h: 2 * r }), stroke: null, fill: color, width: 0, opacity: 1, fillOpacity: 1, cap: 'round' })
    out.push({ t: 'text', x: cx + r, y: mid + 0.028, text: String(b.n), font: F.bold, size: 6, color: b.style.textColor || contrastOf(color), align: 'center' })
    lines.forEach((l, k) => out.push({ t: 'text', x: cx + BADGE_W, y: cy + (k + 0.5) * LH + 0.035, text: l, font: F.body, size: KEY_SIZE, color: COLORS.text, align: 'left' }))
    cy += lines.length * LH
  })
  return out
}

/**
 * Where a picture of this shape and its badge key go in `area`: the picture as large as fits with the key under it
 * (never squashed), the two centred together when `align` is 'center'. `key` is the key's box.
 */
export function fitWithKey(aspect: number, area: Rect, align: 'center' | 'top', marks: readonly Mark[]): { box: Rect; key: Rect | null; entries: Badge[] } {
  const entries = keyEntries(marks)
  if (entries.length === 0) return { box: fitBox(aspect, area, align), key: null, entries }
  let box = fitBox(aspect, area, align)
  let kw = 0
  let kh = 0
  for (let i = 0; i < 3; i++) {
    kw = Math.min(area.w, Math.max(box.w, KEY_MIN_W))
    kh = keyHeight(entries, kw)
    box = fitBox(aspect, { ...area, h: Math.max(0.5, area.h - kh - KEY_GAP) }, 'top')
  }
  const total = box.h + KEY_GAP + kh
  const top = align === 'center' ? area.y + Math.max(0, (area.h - total) / 2) : area.y
  box = { ...box, y: top }
  const kx = Math.max(area.x, Math.min(box.x + box.w / 2 - kw / 2, area.x + area.w - kw))
  return { box, key: { x: kx, y: top + box.h + KEY_GAP, w: kw, h: kh }, entries }
}
