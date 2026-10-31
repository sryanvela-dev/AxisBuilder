// Table of Contents (design 6.2): every section (and custom sheet or upload placed on its own) with its page number,
// each line a link to its page. Laid out twice: once to count its own pages, once with the real numbers.

import { measure } from '../fonts.ts'
import type { ContentsEntry, PageItem } from '../pageModel.ts'
import type { SectionDef } from '../templates/types.ts'
import { content, standardPage, type BuildContext, type SectionPages } from './common.ts'
import { COLORS, F, line, text } from './layout.ts'

const ROW = 0.34

/** How many entries one contents page holds. */
export const contentsPerPage = () => Math.floor(content().h / ROW)

export function buildContents(c: BuildContext, def: SectionDef, title: string, entries: readonly ContentsEntry[]): SectionPages {
  const area = content()
  const per = contentsPerPage()
  const pages = []
  for (let start = 0; start === 0 || start < entries.length; start += per) {
    const items: PageItem[] = []
    entries.slice(start, start + per).forEach((e, i) => {
      const top = area.y + i * ROW
      const base = top + ROW * 0.62
      const num = String(e.page + 1)
      const left = area.x + 0.1
      const right = area.x + Math.min(area.w, 7.2)
      items.push(text(left, base, e.title, F.body, 11))
      items.push(text(right, base, num, F.heading, 11, COLORS.deep, 'right'))
      const from = left + measure(e.title, F.body, 11) + 0.08
      const to = right - measure(num, F.heading, 11) - 0.08
      if (to > from) items.push(line(from, base, to, base, 0.5, COLORS.line))
      items.push({ t: 'link', x: left, y: top, w: right - left, h: ROW, page: e.page })
    })
    pages.push(standardPage(c, def, pages.length ? `Contents ${pages.length + 1}` : 'Contents', title, '', items))
  }
  return { pages, bookmarks: [] }
}
