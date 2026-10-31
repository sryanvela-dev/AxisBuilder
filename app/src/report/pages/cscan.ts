// C-Scan Data (design 6.9, as the style sample): one page per scan in the report, titled "Scan 12" with its component,
// location and position; the data-page screenshot large on the left (about two thirds of the width, shape kept, never
// cropped unless the user cropped it); Comments and Statistics boxes on the right. No screenshot: a grey box.

import { fontBox } from '../fonts.ts'
import { scanRows, type ScanRow } from '../calc/results.ts'
import type { Bookmark, PageItem, Rect } from '../pageModel.ts'
import { imageEditsSchema } from '../schema.ts'
import { content, placeImage, standardPage, type BuildContext, type PageBuilder } from './common.ts'
import { COLORS, F, ladderInk, line, text, textBlock, titledBox } from './layout.ts'
import { inch, inchTrim, pct, scanTitle, thousands } from './values.ts'

const NO_EDITS = imageEditsSchema.parse({})
const SIDE = 2.35

/** "Shell · Bottom · X 115"–187" · Y 2"–22"". */
export function scanSubtitle(row: ScanRow): string {
  const s = row.scan
  const parts = [row.component?.name, row.result?.location ?? undefined].filter((x): x is string => !!x && x.trim() !== '')
  if (s.xStart !== null && s.xStop !== null) parts.push(`X ${inchTrim(Math.min(s.xStart, s.xStop))}–${inchTrim(Math.max(s.xStart, s.xStop))}`)
  if (s.yStart !== null && s.yStop !== null) parts.push(`Y ${inchTrim(Math.min(s.yStart, s.yStop))}–${inchTrim(Math.max(s.yStart, s.yStop))}`)
  return parts.join(' · ')
}

/** The Comments and Statistics boxes of a scan (also used by custom sheets' C-scan blocks). */
export function cscanBoxes(comment: string, stats: [string, string, string?][], area: Rect): PageItem[] {
  const items: PageItem[] = []
  const commentH = 1.6
  const cb = titledBox({ x: area.x, y: area.y, w: area.w, h: commentH }, 'Comments')
  items.push(...cb.items, ...textBlock(comment, cb.inner.x, cb.inner.y, cb.inner.w, F.body, 10, COLORS.text, { maxLines: 6 }).items)
  const rowH = 0.24
  const statsTop = area.y + commentH + 0.14
  const sb = titledBox({ x: area.x, y: statsTop, w: area.w, h: 3 / 72 + 0.11 + 0.3 + stats.length * rowH + 0.14 }, 'Statistics')
  items.push(...sb.items)
  stats.forEach(([k, v, color], i) => {
    const top = sb.inner.y + i * rowH
    const base = top + rowH / 2 + fontBox(F.body, 8.5).cap / 2
    items.push(text(sb.inner.x + 0.04, base, k, F.body, 8.5))
    items.push(text(sb.inner.x + sb.inner.w - 0.04, base, v, i < 1 || color ? F.bold : F.body, 8.5, color ?? COLORS.text, 'right'))
    items.push(line(sb.inner.x, top + rowH, sb.inner.x + sb.inner.w, top + rowH, 0.5, COLORS.line))
  })
  return items
}

/** The statistics lines of a scan: minimum, average, wall loss (ladder colour), readings, area; temperature when on. */
export function scanStats(c: BuildContext, row: ScanRow): [string, string, string?][] {
  const out: [string, string, string?][] = []
  if (row.minT !== null) out.push(['Minimum thickness', inch(row.minT)])
  if (row.avgT !== null) out.push(['Average thickness', inch(row.avgT)])
  if (row.wallLoss !== null) out.push(['Wall loss', pct(row.wallLoss), row.color === 'normal' ? undefined : ladderInk(row.color)])
  if (row.readings !== null) out.push(['UT readings', thousands(row.readings)])
  if (row.area !== null) out.push(['Area', `${thousands(row.area)} sq in`])
  const temp = c.r.options.tempCorrection
  if (temp.on && temp.tempF !== null && c.r.options.cscanStats.temperature) out.push(['Temperature', `${temp.tempF} °F (corrected)`])
  return out
}

export const buildCscans: PageBuilder = (c, def) => {
  const area = content()
  const rows = scanRows(c.p, c.r)
  const pages = rows.map((row) => {
    const title = scanTitle(row.scan.id)
    const shotArea = { x: area.x, y: area.y, w: area.w - SIDE - 0.17, h: area.h }
    const ref = row.result?.dataImage ? { source: 'screenshots' as const, file: row.result.dataImage } : null
    const shot = placeImage(c, ref, row.result?.dataImageEdits ?? NO_EDITS, shotArea, 'No screenshot', 'top', true)
    const items: PageItem[] = [...shot.items, ...cscanBoxes(row.comment?.text ?? '', scanStats(c, row), { x: area.x + area.w - SIDE, y: area.y, w: SIDE, h: area.h })]
    return standardPage(c, def, title, title, scanSubtitle(row), items)
  })
  const none = rows.filter((r) => !r.result?.dataImage).map((r) => scanTitle(r.scan.id))
  if (none.length) {
    const who = none.length === rows.length ? 'No scan has a' : `${none.join(', ')} ${none.length === 1 ? 'has' : 'have'} no`
    c.notes.push(`${who} data-page screenshot yet ("No screenshot" prints).`)
  }
  const bookmarks: Bookmark[] = rows.map((r, i) => ({ title: scanTitle(r.scan.id), page: i, children: [] }))
  return { pages, bookmarks }
}
