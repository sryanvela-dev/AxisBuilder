// Drawings (design 6.6): one page per drawing sheet, the app's own sheet models (engine/sheetModel.ts) printed into
// the content area as vectors, fitted with their shape kept: the rollout (the scans with their hatch, no photos), the
// scan overlay (photos with the scan outlines and labels, no hatch) when the drawing uses scan photos, and the section
// sheets when the drawing has them. The other layer groups follow the drawing preview, as the drawing PDF's sets do.
// The PDF draws them with the drawing PDF's own code, so the two always match.

import { buildDrawing, type LayerGroup } from '../../engine/drawing.ts'
import { activeSectionPlan } from '../../engine/sections.ts'
import { sheetModels, type SheetModel } from '../../engine/sheetModel.ts'
import { exportRuns } from '../../export/exportSets.ts'
import type { Bookmark, PageItem, Rect } from '../pageModel.ts'
import { content, standardPage, type PageBuilder } from './common.ts'
import { fitBox } from './layout.ts'

/** The sheet's printed extents (paper inches, y up) fitted into a box on the page. */
export function sheetItem(model: SheetModel, area: Rect): PageItem {
  const [x0, y0, x1, y1] = model.extents.all
  const region = { x: x0, y: y0, w: Math.max(x1 - x0, 0.01), h: Math.max(y1 - y0, 0.01) }
  return { t: 'sheet', model, region, box: fitBox(region.w / region.h, area) }
}

export const buildDrawings: PageBuilder = (c, def, title) => {
  const { p, r } = c
  const opts = r.options.drawings
  const drawing = buildDrawing(p)
  const plan = opts.sections === 'as drawing' ? activeSectionPlan(p) : null
  const area = content()
  const sheets: { label: string; model: SheetModel }[] = []
  if (opts.rollout) {
    const models = sheetModels(p, drawing, plan, { hidden: exportRuns('Scans', c.previewHidden)[0].hidden })
    sheets.push({ label: 'Rollout drawing', model: models[0] })
    for (const m of models.slice(1)) sheets.push({ label: m.kind === 'overview' ? 'Overview' : m.title.charAt(0) + m.title.slice(1).toLowerCase(), model: m })
  }
  if (opts.overlay && p.settings.generateOverlayDrawing && p.scans.length > 0) {
    const hidden: ReadonlySet<LayerGroup> = exportRuns('Overlays', c.previewHidden)[0].hidden
    sheets.splice(opts.rollout ? 1 : 0, 0, { label: 'Scan overlay drawing', model: sheetModels(p, drawing, null, { hidden })[0] })
  }
  const pages = sheets.map((s) => standardPage(c, def, s.label, title, s.label, [sheetItem(s.model, area)]))
  const bookmarks: Bookmark[] = sheets.map((s, i) => ({ title: s.label, page: i, children: [] }))
  return { pages, bookmarks }
}
