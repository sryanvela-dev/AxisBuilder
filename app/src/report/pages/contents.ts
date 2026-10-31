// Table of Contents (design 6.2): every section (and custom sheet or upload placed on its own) with its page number,
// each line a link to its page, across the full content width with dot leaders to the numbers at the right margin. Below
// it, while the C-Scan Data section is on, a "Scans" index: every scan with its C-Scan Data page, in 3 or 4 columns
// (filled top to bottom, then the next column), each a link too (user, 2026-10-31). What does not fit flows onto further
// contents pages under the same header. Laid out twice: once to count its own pages (`contentsPageCount`), once with the
// real numbers; the layout does not depend on the numbers, so the count holds.

import { measure, type ReportFontId } from '../fonts.ts'
import type { ContentsEntry, PageItem, Rect } from '../pageModel.ts'
import type { SectionDef } from '../templates/types.ts'
import { content, standardPage, type BuildContext, type SectionPages } from './common.ts'
import { COLORS, F, text } from './layout.ts'

/** One section line. */
const ROW = 0.34
/** One scan line in the index. */
const SCAN_ROW = 0.25
/** Space above the Scans heading, and the heading's own line. */
const GAP = 0.22
const HEADING = 0.36
/** Space between index columns. */
const COL_GAP = 0.3
const SIZE = 11
const SCAN_SIZE = 9.5

/** Columns of the scan index: 3, or 4 for a long list. */
export const scanColumns = (count: number) => (count > 45 ? 4 : 3)

/** Where every line goes, page by page (numbers and titles do not move it). */
interface Placed {
  sections: { index: number; top: number }[]
  heading: { top: number; continued: boolean } | null
  scans: { index: number; cell: Rect }[]
}

export function contentsLayout(sectionCount: number, scanCount: number, area: Rect = content()): Placed[] {
  const pages: Placed[] = []
  let page: Placed = { sections: [], heading: null, scans: [] }
  let y = area.y
  const bottom = area.y + area.h
  const next = () => {
    pages.push(page)
    page = { sections: [], heading: null, scans: [] }
    y = area.y
  }
  for (let i = 0; i < sectionCount; i++) {
    if (y + ROW > bottom + 1e-9) next()
    page.sections.push({ index: i, top: y })
    y += ROW
  }
  const cols = scanColumns(scanCount)
  const colW = (area.w - COL_GAP * (cols - 1)) / cols
  let done = 0
  let continued = false
  while (done < scanCount) {
    const top = (page.sections.length ? y + GAP : y)
    // Room for the heading and at least one row, else the index starts on the next page.
    if (top + HEADING + SCAN_ROW > bottom + 1e-9) {
      next()
      continue
    }
    page.heading = { top, continued }
    const first = top + HEADING
    const room = Math.floor((bottom - first) / SCAN_ROW + 1e-9)
    const take = Math.min(scanCount - done, room * cols)
    // Fill top to bottom, then the next column; rows balanced over the columns this page needs.
    const rows = Math.ceil(take / cols)
    for (let k = 0; k < take; k++) {
      const col = Math.floor(k / rows)
      const row = k % rows
      page.scans.push({ index: done + k, cell: { x: area.x + col * (colW + COL_GAP), y: first + row * SCAN_ROW, w: colW, h: SCAN_ROW } })
    }
    done += take
    continued = true
    if (done < scanCount) next()
    else y = first + rows * SCAN_ROW
  }
  pages.push(page)
  return pages
}

/** How many pages the contents take (pass 1). */
export const contentsPageCount = (sectionCount: number, scanCount: number) => contentsLayout(sectionCount, scanCount).length

/** A title, dot leaders and the page number across `w`, all one link. */
function entryLine(x: number, top: number, w: number, h: number, title: string, page: number, font: { title: ReportFontId; num: ReportFontId }, size: number): PageItem[] {
  const base = top + h * 0.62
  const num = String(page + 1)
  const right = x + w
  const items: PageItem[] = [text(x, base, title, font.title, size), text(right, base, num, font.num, size, COLORS.deep, 'right')]
  const from = x + measure(title, font.title, size) + 0.08
  const to = right - measure(num, font.num, size) - 0.08
  const dot = measure(' .', F.body, size)
  const count = Math.floor((to - from) / dot)
  if (count > 0) items.push(text(to, base, ' .'.repeat(count), F.body, size, COLORS.muted, 'right'))
  items.push({ t: 'link', x, y: top, w, h, page })
  return items
}

export function buildContents(c: BuildContext, def: SectionDef, title: string, entries: readonly ContentsEntry[], scans: readonly ContentsEntry[] = []): SectionPages {
  const area = content()
  const layout = contentsLayout(entries.length, scans.length, area)
  const pages = layout.map((pl, n) => {
    const items: PageItem[] = []
    for (const s of pl.sections) items.push(...entryLine(area.x, s.top, area.w, ROW, entries[s.index].title, entries[s.index].page, { title: F.body, num: F.heading }, SIZE))
    if (pl.heading) items.push(text(area.x, pl.heading.top + HEADING * 0.7, pl.heading.continued ? 'Scans (continued)' : 'Scans', F.title, 12, COLORS.blue))
    for (const s of pl.scans) items.push(...entryLine(s.cell.x, s.cell.y, s.cell.w, s.cell.h, scans[s.index].title, scans[s.index].page, { title: F.body, num: F.label }, SCAN_SIZE))
    return standardPage(c, def, n ? `Contents ${n + 1}` : 'Contents', title, '', items)
  })
  return { pages, bookmarks: [] }
}
