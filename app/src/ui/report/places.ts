// Element ids of report rows, so the Review list and the step's own list can jump to them (like ui/placeIds.ts).

import { idKey } from '../../data/schema.ts'
import type { ReportCheckPlace } from '../../report/checks.ts'
import type { ImagePlace } from '../../report/imageItems.ts'
import { templateOf } from '../../report/templates/registry.ts'
import { placeStep, type ReportIssue } from '../../state/reportSteps.ts'
import { useApp } from '../appContext.ts'

/** The element of a report picture: its row or box on its step. */
export function picturePlaceId(at: ImagePlace): string {
  switch (at.kind) {
    case 'photo': return `report-photo-${at.index}`
    case 'upload': return `report-upload-${at.index}`
    case 'sheetImage': return `report-sheet-${at.sheetId}`
    case 'dataImage': return `report-scan-${idKey(at.scanId).replace(/\s+/g, '_')}`
    default: return `report-picture-${at.kind}`
  }
}

export function reportPlaceId(place: ReportCheckPlace): string {
  switch (place.kind) {
    case 'component': return `report-component-${place.id}`
    case 'scan': return `report-scan-${idKey(place.scanId).replace(/\s+/g, '_')}`
    case 'picture': return picturePlaceId(place.at)
    case 'field': return place.elementId
    case 'section': return `report-section-${place.id}`
    case 'sheet': return `report-sheet-${place.id}`
    case 'reading': return `report-reading-${place.index}`
  }
}

/** Scrolls to a report row and puts the cursor in its first box. */
export function jumpToReport(place: ReportCheckPlace) {
  const el = document.getElementById(reportPlaceId(place))
  if (!el) return
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  el.querySelector<HTMLElement>('input, select, textarea')?.focus({ preventScroll: true })
}

/** Goes to where an issue is fixed: the step of its place (a summary sentence's value may be on Calibration), then the row. */
export function useGoToIssue() {
  const app = useApp()
  return (i: ReportIssue) => {
    const place = i.check?.place
    const report = app.state.job!.history.present.report
    const step = place ? placeStep(place, report ? templateOf(report.templateId) : undefined) : i.step
    app.dispatch({ type: 'goToReportStep', step })
    if (place) window.setTimeout(() => jumpToReport(place), 60)
  }
}
