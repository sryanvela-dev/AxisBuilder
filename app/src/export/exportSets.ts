// What the PDF and the report images show (setting "Layers to export"): the preview's ticked layer groups, or the
// two sets an inspection report uses: the AUT scans (no photos) and the AUT overlays (photos with the scan outlines
// and labels, no hatch). The other groups (welds, nozzles, rulers, ...) follow the preview in every set.

import type { LayerGroup } from '../engine/drawing.ts'
import type { EXPORT_SETS } from '../data/settings.ts'

export interface ExportRun {
  /** Added to the file names: '' for "As the preview". */
  suffix: string
  /** For the summary. */
  label: string
  hidden: ReadonlySet<LayerGroup>
}

function withOut(hidden: Iterable<LayerGroup>, add: LayerGroup[], show: LayerGroup[]): Set<LayerGroup> {
  const out = new Set(hidden)
  for (const g of add) out.add(g)
  for (const g of show) out.delete(g)
  return out
}

export function exportRuns(set: (typeof EXPORT_SETS)[number], previewHidden: Iterable<LayerGroup>): ExportRun[] {
  const scans: ExportRun = { suffix: ' - Scans', label: 'Scans (no photos)', hidden: withOut(previewHidden, ['images'], ['scans', 'hatch']) }
  const overlays: ExportRun = { suffix: ' - Overlays', label: 'Overlays (photos, no hatch)', hidden: withOut(previewHidden, ['hatch'], ['images', 'scans']) }
  if (set === 'Scans') return [scans]
  if (set === 'Overlays') return [overlays]
  if (set === 'Both scans and overlays') return [scans, overlays]
  return [{ suffix: '', label: 'As the preview', hidden: new Set(previewHidden) }]
}
