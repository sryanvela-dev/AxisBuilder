// Element ids of report rows, so the Review list and the step's own list can jump to them (like ui/placeIds.ts).

import { idKey } from '../../data/schema.ts'
import type { ReportCheckPlace } from '../../report/checks.ts'

export function reportPlaceId(place: ReportCheckPlace): string {
  if (place.kind === 'component') return `report-component-${place.id}`
  if (place.kind === 'scan') return `report-scan-${idKey(place.scanId).replace(/\s+/g, '_')}`
  return `report-reading-${place.index}`
}

/** Scrolls to a report row and puts the cursor in its first box. */
export function jumpToReport(place: ReportCheckPlace) {
  const el = document.getElementById(reportPlaceId(place))
  if (!el) return
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  el.querySelector<HTMLElement>('input, select, textarea')?.focus({ preventScroll: true })
}
