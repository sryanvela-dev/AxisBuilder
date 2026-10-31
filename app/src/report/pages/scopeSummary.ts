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

export const buildScopeSummary: PageBuilder = (c, def, title) => {
  const tv = textValues(c.p, c.r, c.t)
  const area = content()
  const gap = 0.22
  const colW = (area.w - gap) / 2
  const inner = colW - 0.28
  const paras = (part: 'scope' | 'summary') => {
    const list = textParagraphs(c.p, c.r, c.t, part, tv)
    for (const p of list.filter((x) => !x.complete)) {
      const keys = (p.template.match(/\{\w+\}/g) ?? []).map((k) => k.slice(1, -1) as TextField).filter((k) => tv.values[k] === undefined)
      const missing = [...new Set(keys.map(fieldWords))]
      c.notes.push(`${part === 'scope' ? 'Scope' : 'Summary'}: the "${p.block?.label ?? 'text'}" sentence is left out until ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} filled in.`)
    }
    return list.filter((x) => x.complete).map((x) => (x.block ? runsOf(x.template, tv) : [{ text: x.text, font: F.body, color: COLORS.text }]))
  }
  const scope = linesOf(paras('scope'), inner)
  const summary = linesOf(paras('summary'), inner)
  const tiles = tilesOf(c, tv)
  const tilesH = 2 * TILE_H + TILE_GAP + 0.14

  const pages = []
  const boxTop = area.y + 0.04
  const titleH = 0.3 + 3 / 72 + 0.11
  const avail = area.y + area.h - boxTop - titleH - 0.12
  let first = true
  while (first || scope.length || summary.length) {
    const sTake = take(scope, avail)
    const sumTake = take(summary, first ? avail - tilesH : avail)
    const hL = heightOf(sTake)
    const hR = heightOf(sumTake) + (first ? tilesH : 0)
    const boxH = Math.min(area.y + area.h - boxTop, titleH + Math.max(hL, hR, 1) + 0.16)
    const items: PageItem[] = []
    const suffix = first ? '' : ' (continued)'
    if (first || sTake.length) {
      const b = titledBox({ x: area.x, y: boxTop, w: colW, h: boxH }, `Scope${suffix}`)
      items.push(...b.items, ...drawLines(sTake, b.inner.x, b.inner.y))
    }
    if (first || sumTake.length) {
      const b = titledBox({ x: area.x + colW + gap, y: boxTop, w: colW, h: boxH }, `Summary${suffix}`)
      items.push(...b.items)
      let y = b.inner.y
      if (first) {
        items.push(...tileItems(tiles, { x: b.inner.x, y, w: b.inner.w, h: tilesH }))
        y += tilesH
      }
      items.push(...drawLines(sumTake, b.inner.x, y))
    }
    pages.push(standardPage(c, def, first ? title : `${title} ${pages.length + 1}`, title, '', items))
    first = false
    if (pages.length > 5) break
  }
  return { pages, bookmarks: [] }
}

