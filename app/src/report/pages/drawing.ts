// Drawings (design 6.6): one page per drawing sheet, the app's own sheet models (engine/sheetModel.ts) printed into
// the content area as vectors, fitted with their shape kept: the rollout (the scans with their hatch, no photos), the
// scan overlay (photos with the scan outlines and labels, no hatch) when the drawing uses scan photos, and the section
// sheets when the drawing has them, as scans, as overlays or both (user, 2026-10-31). The other layer groups follow the
// drawing preview, as the drawing PDF's sets do. The PDF draws them with the drawing PDF's own code, so the two always match.

import { buildDrawing, type LayerGroup } from '../../engine/drawing.ts'
import { activeSectionPlan } from '../../engine/sections.ts'
import { sheetModels, viewRegion, type SheetModel } from '../../engine/sheetModel.ts'
import { exportRuns } from '../../export/exportSets.ts'
import { withLiveText } from '../liveLabels.ts'
import type { Bookmark, Rect, SheetItem } from '../pageModel.ts'
import { content, standardPage, type BuildContext, type PageBuilder } from './common.ts'
import { fitBox } from './layout.ts'

/**
 * The sheet's printed extents (paper inches, y up), every text to its full height plus a small margin (`viewRegion`),
 * fitted into a box on the page.
 */
export function sheetItem(model: SheetModel, area: Rect): SheetItem {
  const r = viewRegion(model)
  const region = { ...r, w: Math.max(r.w, 0.01), h: Math.max(r.h, 0.01) }
  return { t: 'sheet', model, region, box: fitBox(region.w / region.h, area) }
}

/**
 * A drawing sheet with its marks (format 10, stored under `key` in the report's drawingMarkup): live labels filled now,
 * redactions left out (a drawing is vectors; Review warns).
 */
export function withDrawingMarks(c: BuildContext, it: SheetItem, key: string): SheetItem {
  const marks = (c.r.drawingMarkup?.[key] ?? []).filter((m) => m.kind !== 'redaction').map((m) => withLiveText(c.p, m))
  return { ...it, place: { kind: 'drawing', key }, ...(marks.length ? { marks } : {}) }
}

/** Whether the drawing has overlays to print (scans and "Use scan images"). */
export const overlaysUsable = (p: { settings: { generateOverlayDrawing: boolean }; scans: readonly unknown[] }) =>
  p.settings.generateOverlayDrawing && p.scans.length > 0

/** Which section sheet sets print: the scans version, the overlay version, both (scans first) or none. */
export function sectionSets(sections: 'as drawing' | 'overlays' | 'both' | 'off', overlays: boolean): ('scans' | 'overlays')[] {
  const sets: ('scans' | 'overlays')[] = sections === 'as drawing' ? ['scans'] : sections === 'overlays' ? ['overlays'] : sections === 'both' ? ['scans', 'overlays'] : []
  return overlays ? sets : sets.filter((s) => s !== 'overlays')
}

export const buildDrawings: PageBuilder = (c, def, title) => {
  const { p, r } = c
  const opts = r.options.drawings
  const drawing = buildDrawing(p)
  const plan = opts.sections === 'off' ? null : activeSectionPlan(p)
  const area = content()
  const hiddenFor = (set: 'scans' | 'overlays'): ReadonlySet<LayerGroup> => exportRuns(set === 'scans' ? 'Scans' : 'Overlays', c.previewHidden)[0].hidden
  const overlays = overlaysUsable(p)
  const sheets: { label: string; model: SheetModel; key: string }[] = []
  if (opts.rollout) sheets.push({ label: 'Rollout drawing', model: sheetModels(p, drawing, null, { hidden: hiddenFor('scans') })[0], key: 'rollout' })
  if (opts.overlay && overlays) sheets.push({ label: 'Scan overlay drawing', model: sheetModels(p, drawing, null, { hidden: hiddenFor('overlays') })[0], key: 'overlay' })
  // Section sheets (overview first), on their own: they no longer need the rollout ticked.
  const sets = plan ? sectionSets(opts.sections, overlays) : []
  for (const set of sets) {
    const tag = sets.length > 1 && set === 'overlays' ? ' (overlay)' : ''
    for (const m of sheetModels(p, drawing, plan, { hidden: hiddenFor(set) }).slice(1)) {
      sheets.push({ label: (m.kind === 'overview' ? 'Overview' : m.title.charAt(0) + m.title.slice(1).toLowerCase()) + tag, model: m, key: `${set}:${m.kind === 'overview' ? 'overview' : m.section?.n ?? m.title}` })
    }
  }
  const pages = sheets.map((s) => standardPage(c, def, s.label, title, s.label, [withDrawingMarks(c, sheetItem(s.model, area), s.key)]))
  const bookmarks: Bookmark[] = sheets.map((s, i) => ({ title: s.label, page: i, children: [] }))
  return { pages, bookmarks }
}
