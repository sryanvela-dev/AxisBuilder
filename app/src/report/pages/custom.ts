// Custom sheets (design 4.6, 6.10): one page per sheet in the standard frame with the sheet's title, its blocks
// filling the layout's slots in order: 1 large, 2 side by side, 2 + side panel, 4 grid. Blocks: a picture with its
// caption, an AxisBuilder view (main drawing, a section sheet or a part of the main sheet), C-scan style boxes, text, a
// small table. A head view is that head alone (its outline, title, nozzles and MUT readings) drawn as the main sheet
// draws it, so nothing next to it on the sheet shows.

import { buildDrawing, type Drawing } from '../../engine/drawing.ts'
import type { Project } from '../../data/schema.ts'
import { activeSectionPlan } from '../../engine/sections.ts'
import { mainSheet, sheetModels, type SheetModel } from '../../engine/sheetModel.ts'
import { scanRows } from '../calc/results.ts'
import { fontBox } from '../fonts.ts'
import type { PageItem, Rect } from '../pageModel.ts'
import type { Block, CustomSheet } from '../schema.ts'
import { content, placeImage, standardPage, type BuildContext, type PageBuilder } from './common.ts'
import { cscanBoxes, scanStats } from './cscan.ts'
import { sheetItem } from './drawing.ts'
import { COLORS, F, fitBox, placeholder, text, textBlock } from './layout.ts'
import { layoutTable, tableItems, type TableRow } from './table.ts'

const GAP = 0.2
const SIDE = 2.35

/** The slots of a custom sheet layout in the content area. */
export function sheetSlots(layout: CustomSheet['layout'], area: Rect): Rect[] {
  const half = (area.w - GAP) / 2
  switch (layout) {
    case '2 side by side':
      return [{ ...area, w: half }, { ...area, x: area.x + half + GAP, w: half }]
    case '2 + side panel': {
      const w = (area.w - SIDE - 2 * GAP) / 2
      return [{ ...area, w }, { ...area, x: area.x + w + GAP, w }, { ...area, x: area.x + area.w - SIDE, w: SIDE }]
    }
    case '4 grid': {
      const h = (area.h - GAP) / 2
      return [0, 1, 2, 3].map((i) => ({ x: area.x + (i % 2) * (half + GAP), y: area.y + Math.floor(i / 2) * (h + GAP), w: half, h }))
    }
    default:
      return [area]
  }
}

/** One head view as a sheet of its own (null when the drawing does not draw that head). */
export function headSheet(p: Project, d: Drawing, head: 'HEAD 1' | 'HEAD 2', hidden: BuildContext['previewHidden']): SheetModel | null {
  const mine = (list: 'headNozzles' | 'headMut', i: number) => p[list][i]?.head === head
  const items = d.items.filter((it) => it.key === `head:${head}` || ((it.source?.list === 'headNozzles' || it.source?.list === 'headMut') && mine(it.source.list, it.source.index)))
  if (!items.some((it) => it.key === `head:${head}`)) return null
  return mainSheet(p, { ...d, items }, { hidden })
}

function viewModel(c: BuildContext, view: Extract<Block, { kind: 'view' }>['view']): { model: SheetModel; region?: { x: number; y: number; w: number; h: number } } | null {
  const drawing = buildDrawing(c.p)
  const models = sheetModels(c.p, drawing, activeSectionPlan(c.p), { hidden: c.previewHidden })
  if (view === 'main') return { model: models[0] }
  if (view === 'head1' || view === 'head2') {
    const m = headSheet(c.p, drawing, view === 'head1' ? 'HEAD 1' : 'HEAD 2', c.previewHidden)
    return m ? { model: m } : null
  }
  if (typeof view === 'string' && view.startsWith('section:')) {
    const n = Number(view.slice('section:'.length))
    const m = models.find((x) => x.section?.n === n)
    return m ? { model: m } : null
  }
  if (typeof view === 'object') {
    const b = view.crop
    return { model: models[0], region: { x: Math.min(b.x0, b.x1), y: Math.min(b.y0, b.y1), w: Math.abs(b.x1 - b.x0), h: Math.abs(b.y1 - b.y0) } }
  }
  return null
}

function blockItems(c: BuildContext, b: Block, slot: Rect): PageItem[] {
  switch (b.kind) {
    case 'image': {
      const capH = b.caption.trim() ? 0.36 : 0
      const placed = placeImage(c, { source: 'photos', file: b.file }, b, { ...slot, h: slot.h - capH }, 'Picture not found')
      const out = [...placed.items]
      if (capH) out.push(...textBlock(b.caption.trim(), placed.box.x, placed.box.y + placed.box.h + 0.05, Math.max(placed.box.w, 2), F.body, 9, COLORS.text, { align: 'center', maxLines: 2, k: 1.3 }).items)
      return out
    }
    case 'view': {
      const v = viewModel(c, b.view)
      if (!v) {
        c.notes.push(`A custom sheet's ${b.view === 'head1' ? 'head 1' : b.view === 'head2' ? 'head 2' : typeof b.view === 'string' ? b.view.replace(':', ' sheet ') : 'drawing'} view is not in the drawing; a placeholder prints.`)
        return placeholder(slot, 'View not available')
      }
      if (!v.region) return [sheetItem(v.model, slot)]
      return [{ t: 'sheet', model: v.model, region: v.region, box: fitBox(v.region.w / v.region.h, slot) }]
    }
    case 'cscanBoxes': {
      const row = b.scanId ? scanRows(c.p, c.r).find((r) => r.scan.id.trim().toLowerCase() === b.scanId!.trim().toLowerCase()) ?? null : null
      const stats: [string, string][] = b.stats.length ? b.stats.map((s) => [s.label, s.value]) : row ? scanStats(c, row).map(([k, v]) => [k, v]) : []
      return cscanBoxes(b.comment || row?.comment?.text || '', stats, slot)
    }
    case 'text': {
      const out: PageItem[] = []
      let y = slot.y
      if (b.title.trim()) {
        out.push(text(slot.x, y + fontBox(F.title, 12).ascent, b.title.trim(), F.title, 12, COLORS.blue))
        y += 0.32
      }
      out.push(...textBlock(b.body, slot.x, y, slot.w, F.body, 9.5).items)
      return out
    }
    case 'table': {
      const out: PageItem[] = []
      let y = slot.y
      if (b.title.trim()) {
        out.push(text(slot.x, y + fontBox(F.title, 12).ascent, b.title.trim(), F.title, 12, COLORS.blue))
        y += 0.32
      }
      if (b.rows.length === 0) return out
      const n = Math.max(...b.rows.map((r) => r.length))
      const columns = Array.from({ length: n }, (_, i) => ({ header: b.rows[0][i] ?? '', align: 'left' as const, wrap: true }))
      const rows: TableRow[] = b.rows.slice(1).map((r) => ({ cells: columns.map((_, i) => ({ text: r[i] ?? '' })), kind: 'data' }))
      const layout = layoutTable(columns, rows, slot.w)
      out.push(...tableItems(columns, rows, layout, slot.x, y, 0, rows.length))
      return out
    }
  }
}

/** The pages of the given custom sheets. */
export function customSheetPages(c: BuildContext, def: Parameters<PageBuilder>[1], sheets: readonly CustomSheet[]) {
  const area = content()
  return sheets.map((sh) => {
    const slots = sheetSlots(sh.layout, area)
    const items = sh.blocks.slice(0, slots.length).flatMap((b, i) => blockItems(c, b, slots[i]))
    if (sh.blocks.length > slots.length) c.notes.push(`Custom sheet "${sh.title}": ${sh.blocks.length - slots.length} block(s) more than its layout holds are left out.`)
    const title = sh.title.trim() || def.title
    return standardPage(c, def, title, title, '', items)
  })
}

export const buildCustom: PageBuilder = (c, def) => {
  const pages = customSheetPages(c, def, c.r.customSheets)
  return { pages, bookmarks: c.r.customSheets.map((s, i) => ({ title: s.title.trim() || def.title, page: i, children: [] })) }
}
