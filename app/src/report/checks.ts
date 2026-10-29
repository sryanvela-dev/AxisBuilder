// Checks on the report data (report design section 9), the ones R1's data can answer. Errors block the report PDF,
// warnings never do. Not shown in the app yet (the Review step takes them in R4). Each says what is wrong and how to
// fix it, like the drawing's checks (data/checks.ts).

import { scanOverlaps } from '../data/checks.ts'
import { formatNumber } from '../data/parse.ts'
import { idKey, type Project } from '../data/schema.ts'
import { jobLadder, readingRows, scanRows } from './calc/results.ts'
import { wallLossPercent } from './calc/ladder.ts'
import { bandsOf } from './report.ts'

export type ReportCheckPlace =
  | { kind: 'component'; id: string }
  | { kind: 'scan'; scanId: string }
  | { kind: 'reading'; index: number }

export interface ReportCheck {
  severity: 'error' | 'warning'
  place: ReportCheckPlace
  text: string
  fix: string
}

/** Wall Remain % from the CSV may differ from the recalculated value by this much (rounding). */
export const WALL_REMAIN_TOLERANCE = 0.1

export function checkReport(p: Project): ReportCheck[] {
  const report = p.report
  if (!report) return []
  const out: ReportCheck[] = []
  const ladder = jobLadder(report)

  // A component with no nominal.
  for (const c of report.components) {
    if (c.nominal === null) {
      out.push({ severity: 'error', place: { kind: 'component', id: c.id }, text: `${c.name} has no nominal thickness.`,
        fix: 'Enter its nominal; every scan and reading on it is measured against it.' })
    }
  }

  // Scans in the report.
  const rows = scanRows(p, report, ladder)
  for (const r of rows) {
    const place = { kind: 'scan' as const, scanId: r.scan.id }
    if (!r.component) {
      out.push({ severity: 'error', place, text: `${r.scan.id} has no component.`,
        fix: report.components.length === 0 ? 'Add a component (e.g. Shell) with its nominal.' : 'Pick the component it was scanned on.' })
    }
    if (r.minT === null) out.push({ severity: 'error', place, text: `${r.scan.id} has no Min 'T'.`, fix: 'Import the scansheet, type it in, or take the scan out of the report.' })
    if (r.readings === null) out.push({ severity: 'error', place, text: `${r.scan.id} has no readings.`, fix: 'Import the scansheet, or enter the readings or the scan increments.' })
    // Crossing two shell-course / plate bands (when no component was picked).
    if (!r.result?.componentId) {
      const bands = bandsOf(report, r.scan)
      if (bands.length > 1) {
        out.push({ severity: 'warning', place, text: `${r.scan.id} crosses ${bands.map((b) => b.name).join(' and ')}; it is measured against ${r.component?.name ?? 'neither'}.`,
          fix: 'Pick the component it belongs to.' })
      }
    }
    // Wall Remain % in the CSV against the recalculated wall loss.
    const remain = r.result?.csvWallRemain ?? null
    const rawMin = r.result?.minT ?? null
    const loss = wallLossPercent(rawMin, r.nominal)
    if (remain !== null && loss !== null && Math.abs(100 - loss - remain) > WALL_REMAIN_TOLERANCE + 1e-9) {
      out.push({ severity: 'warning', place,
        text: `Wall Remain ${formatNumber(remain)}% in the CSV; ${formatNumber(rawMin!)} on ${formatNumber(r.nominal!)} is ${(100 - loss).toFixed(2)}%.`,
        fix: 'The report uses the recalculated value. Check the nominal and the CSV.' })
    }
  }

  // Overlapping scans: their readings are counted twice in the total.
  const inReport = new Set(rows.map((r) => idKey(r.scan.id)))
  for (const o of scanOverlaps(p)) {
    if (!inReport.has(idKey(o.a.id)) || !inReport.has(idKey(o.b.id))) continue
    out.push({ severity: 'warning', place: { kind: 'scan', scanId: o.b.id }, text: `${o.b.id} overlaps ${o.a.id} by ${formatNumber(o.area)} sq in.`,
      fix: 'Both scans’ readings are counted in the total. Fine for a rescan; otherwise check the positions.' })
  }

  // Manual readings.
  for (const r of readingRows(p, report, ladder)) {
    const place = { kind: 'reading' as const, index: r.index }
    const name = r.name || `Row ${r.index + 1}`
    if (r.na !== null) continue
    if (!r.component && r.reading.nominalMode === 'component') {
      out.push({ severity: 'error', place, text: `${name} has no component.`, fix: 'Pick the component it was measured on, or give it its own nominal.' })
    } else if (r.nominal === null && r.reading.nominalMode !== 'component') {
      // (A component without a nominal is listed once, above.)
      const fix = r.reading.nominalMode === 'pipe'
        ? (r.reading.pipeSize === null ? 'Enter the pipe size, or switch the row to a custom nominal.' : 'Enter a reading so a wall can be suggested, or pick one.')
        : 'Type the nominal.'
      out.push({ severity: 'error', place, text: `${name} has no nominal.`, fix })
    }
  }
  return out
}
