// Scope & Summary (design 6.3, as the style sample): the Scope box and the Summary box side by side, the summary with
// its six number tiles, then the summary text with the figures in colour (minimum and wall loss in their ladder colour,
// other figures deep blue). Text edited by hand wins (Summary step, report/summary.ts); otherwise the template's blocks
// with the job's values. A sentence missing a value is left out (listed in the notes). Long text flows onto another page.

import { fontBox, wrapText } from '../fonts.ts'
import type { TextField } from '../calc/textFill.ts'
import type { PageItem, Rect } from '../pageModel.ts'
import { content, standardPage, type PageBuilder } from './common.ts'
import { COLORS, F, ladderInk, lineHeight, rect, runItems, text, titledBox, wrapRuns, type Run } from './layout.ts'
import { fieldWords, summaryTiles } from '../summary.ts'
import { FIGURE_FIELDS, textParagraphs, textValues, type TextValues } from './values.ts'

const SIZE = 9.5

const PARA_GAP = 0.09

/** A paragraph as runs: the template's words plain, the filled-in figures bold and coloured. */
function runsOf(template: string, tv: TextValues): Run[] {
  const out: Run[] = []
  for (const part of template.split(/(\{\w+\})/)) {
    if (part === '') continue
    const m = /^\{(\w+)\}$/.exec(part)
    if (!m) {
      out.push({ text: part, font: F.body, color: COLORS.text })
      continue
    }
    const key = m[1] as TextField
    const v = tv.values[key] ?? part
    if (!FIGURE_FIELDS.includes(key)) out.push({ text: v, font: F.body, color: COLORS.text })
    else out.push({ text: v, font: F.bold, color: key === 'minT' || key === 'wallLoss' ? ladderInk(tv.lossColor, COLORS.deep) : COLORS.deep })
  }
  return out
}

function tilesOf(c: Parameters<PageBuilder>[0], tv: TextValues): { value: string; label: string; color: string }[] {
  const loss = ladderInk(tv.lossColor, COLORS.deep)
  return summaryTiles(c.p, c.r, tv).map((t) => ({ value: t.value, label: t.label, color: t.tone === 'deep' ? COLORS.deep : loss }))
}

const TILE_H = 0.74
const TILE_GAP = 0.07

function tileItems(tiles: ReturnType<typeof tilesOf>, area: Rect): PageItem[] {
  const w = (area.w - 2 * TILE_GAP) / 3
  return tiles.flatMap((t, i) => {
    const x = area.x + (i % 3) * (w + TILE_GAP)
    const y = area.y + Math.floor(i / 3) * (TILE_H + TILE_GAP)
    const out: PageItem[] = [rect({ x, y, w, h: TILE_H }, COLORS.white, COLORS.line, 0.75, 3 / 72)]
    out.push(text(x + 0.11, y + 0.1 + fontBox(F.title, 15).ascent * 0.9, t.value, F.title, 15, t.color))
    wrapText(t.label, F.body, 7.5, w - 0.22).slice(0, 2).forEach((l, k) => out.push(text(x + 0.11, y + 0.5 + k * 0.13, l, F.body, 7.5, COLORS.muted)))
    return out
  })
}

type Line = Run[] | 'gap'

function linesOf(paras: Run[][], width: number): Line[] {
  const out: Line[] = []
  paras.forEach((p, i) => {
    if (i > 0) out.push('gap')
    out.push(...wrapRuns(p, SIZE, width))
  })
  return out
}

const lineH = lineHeight(SIZE)
const heightOf = (ls: readonly Line[]) => ls.reduce((a, l) => a + (l === 'gap' ? PARA_GAP : lineH), 0)

/** Takes lines that fit in `h` from the front of the list. */
function take(ls: Line[], h: number): Line[] {
  let used = 0
  let n = 0
  while (n < ls.length && used + (ls[n] === 'gap' ? PARA_GAP : lineH) <= h + 1e-9) used += ls[n++] === 'gap' ? PARA_GAP : lineH
  const out = ls.splice(0, n)
  while (ls[0] === 'gap') ls.shift()
  return out
}

function drawLines(ls: readonly Line[], x: number, top: number): PageItem[] {
  const out: PageItem[] = []
  let y = top
  const asc = fontBox(F.body, SIZE).ascent
  for (const l of ls) {
    if (l === 'gap') {
      y += PARA_GAP
      continue
    }
    out.push(...runItems(l, x, y + (lineH - asc - fontBox(F.body, SIZE).descent) / 2 + asc, SIZE))
    y += lineH
  }
  return out
}

/** Pages are never more than this: past it the rest is left out with a note (text this long is not a summary). */
export const SUMMARY_PAGE_LIMIT = 20

const GAP = 0.22
const TITLE_H = 0.3 + 3 / 72 + 0.11

/** The page area's measures for the two boxes. */
function frame() {
  const area = content()
  const colW = (area.w - GAP) / 2
  const boxTop = area.y + 0.04
  return { area, colW, inner: colW - 0.28, boxTop, avail: area.y + area.h - boxTop - TITLE_H - 0.12, tilesH: 2 * TILE_H + TILE_GAP + 0.14 }
}

/** The paragraphs of the scope or summary as runs; sentences missing a value are left out (`notes` hears why). */
function partRuns(p: Parameters<PageBuilder>[0]['p'], r: Parameters<PageBuilder>[0]['r'], t: Parameters<PageBuilder>[0]['t'], part: 'scope' | 'summary', tv: TextValues, notes?: string[]): Run[][] {
  const list = textParagraphs(p, r, t, part, tv)
  if (notes) {
    for (const x of list.filter((y) => !y.complete)) {
      const keys = (x.template.match(/{w+}/g) ?? []).map((k) => k.slice(1, -1) as TextField).filter((k) => tv.values[k] === undefined)
      const missing = [...new Set(keys.map(fieldWords))]
      notes.push(`${part === 'scope' ? 'Scope' : 'Summary'}: the "${x.block?.label ?? 'text'}" sentence is left out until ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} filled in.`)
    }
  }
  return list.filter((x) => x.complete).map((x) => (x.block ? runsOf(x.template, tv) : [{ text: x.text, font: F.body, color: COLORS.text }]))
}

/**
 * The scope and summary lines split into pages: the first page has the tiles above the summary, later ones are
 * "(continued)". Stops at SUMMARY_PAGE_LIMIT; `cut` = lines left out past it.
 */
function flow(scope: Line[], summary: Line[]): { pages: { scope: Line[]; summary: Line[] }[]; cut: number } {
  const f = frame()
  const pages: { scope: Line[]; summary: Line[] }[] = []
  while (pages.length === 0 || scope.length || summary.length) {
    if (pages.length === SUMMARY_PAGE_LIMIT) break
    const first = pages.length === 0
    const s = take(scope, f.avail)
    const sum = take(summary, first ? f.avail - f.tilesH : f.avail)
    // A line taller than a whole page cannot happen with this text size; never loop on it.
    if (!first && !s.length && !sum.length) break
    pages.push({ scope: s, summary: sum })
  }
  return { pages, cut: scope.filter((l) => l !== 'gap').length + summary.filter((l) => l !== 'gap').length }
}

/** How many pages the Scope & Summary takes (for the Summary step and Review). */
export function scopeSummaryPageCount(c: Pick<Parameters<PageBuilder>[0], 'p' | 'r' | 't'>): number {
  const tv = textValues(c.p, c.r, c.t)
  const { inner } = frame()
  return flow(linesOf(partRuns(c.p, c.r, c.t, 'scope', tv), inner), linesOf(partRuns(c.p, c.r, c.t, 'summary', tv), inner)).pages.length
}

export const buildScopeSummary: PageBuilder = (c, def, title) => {
  const tv = textValues(c.p, c.r, c.t)
  const { area, colW, inner, boxTop, tilesH } = frame()
  const { pages: split, cut } = flow(linesOf(partRuns(c.p, c.r, c.t, 'scope', tv, c.notes), inner), linesOf(partRuns(c.p, c.r, c.t, 'summary', tv, c.notes), inner))
  if (cut > 0) c.notes.push(`Scope & Summary: ${cut} line${cut === 1 ? '' : 's'} past ${SUMMARY_PAGE_LIMIT} pages left out. Shorten the text on the Summary step.`)
  const tiles = tilesOf(c, tv)
  const pages = split.map((pg, i) => {
    const first = i === 0
    const hL = heightOf(pg.scope)
    const hR = heightOf(pg.summary) + (first ? tilesH : 0)
    const boxH = Math.min(area.y + area.h - boxTop, TITLE_H + Math.max(hL, hR, 1) + 0.16)
    const items: PageItem[] = []
    const suffix = first ? '' : ' (continued)'
    if (first || pg.scope.length) {
      const b = titledBox({ x: area.x, y: boxTop, w: colW, h: boxH }, `Scope${suffix}`)
      items.push(...b.items, ...drawLines(pg.scope, b.inner.x, b.inner.y))
    }
    if (first || pg.summary.length) {
      const b = titledBox({ x: area.x + colW + GAP, y: boxTop, w: colW, h: boxH }, `Summary${suffix}`)
      items.push(...b.items)
      let y = b.inner.y
      if (first) {
        items.push(...tileItems(tiles, { x: b.inner.x, y, w: b.inner.w, h: tilesH }))
        y += tilesH
      }
      items.push(...drawLines(pg.summary, b.inner.x, y))
    }
    return standardPage(c, def, first ? title : `${title} ${i + 1}`, title, '', items)
  })
  return { pages, bookmarks: [] }
}
