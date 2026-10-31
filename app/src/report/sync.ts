// Keeps the report in step with the drawing after every edit (state/session.ts, next to syncLabelOverrides): scan
// results follow renamed scans and go with deleted ones (as the scan photo links do, syncScanImages); linked readings
// follow their MUT rows through renames, sorting and deletes (as moved labels do, followRow), and a new MUT row gets
// its linked reading; a report row's nozzle link follows the nozzle, and is dropped (the row kept) when the nozzle goes.
// Marks linked to a scan or MUT row (live data labels, format 8) follow their row the same way; a deleted row leaves
// the link as it was (the mark stays, Review lists it).

import { scanRenames } from '../data/columns.ts'
import { followRow } from '../data/overrides.ts'
import { idKey, type Project } from '../data/schema.ts'
import { mapMarkup } from './imageItems.ts'
import { linkedReadings } from './report.ts'
import type { Mark, Reading, Report, ScanResult } from './schema.ts'

const WATCHED = ['shellMut', 'headMut', 'shellNozzles', 'headNozzles'] as const

export function syncReport(prev: Project, next: Project): Project {
  const report = next.report
  if (!report) return next
  // A report that was just started is already in step (createReport); otherwise only these lists matter.
  if (prev.report === null) return next
  if (prev.scans === next.scans && WATCHED.every((l) => prev[l] === next[l])) return next

  let scanResults = report.scanResults
  if (prev.scans !== next.scans) {
    const renamed = scanRenames(prev, next)
    const ids = new Set(next.scans.map((s) => idKey(s.id)))
    const out: ScanResult[] = []
    for (const r of scanResults) {
      const to = renamed.get(idKey(r.scanId))
      const moved = to !== undefined ? { ...r, scanId: to } : r
      if (ids.has(idKey(moved.scanId))) out.push(moved)
    }
    if (out.length !== scanResults.length || out.some((r, i) => r !== scanResults[i])) scanResults = out
  }

  const readings: Reading[] = []
  for (const r of report.readings) {
    let out = r
    if (r.link && prev[r.link.list] !== next[r.link.list]) {
      const to = followRow(prev[r.link.list], next[r.link.list], r.link.id, r.link.occurrence)
      if (!to) continue
      if (to.id !== r.link.id || to.occurrence !== r.link.occurrence) out = { ...out, link: { ...r.link, ...to } }
    }
    if (r.nozzle && prev[r.nozzle.list] !== next[r.nozzle.list]) {
      const to = followRow(prev[r.nozzle.list], next[r.nozzle.list], r.nozzle.id, r.nozzle.occurrence)
      if (!to) out = { ...out, nozzle: null, name: out.name || r.nozzle.id }
      else if (to.id !== r.nozzle.id || to.occurrence !== r.nozzle.occurrence) out = { ...out, nozzle: { ...r.nozzle, ...to } }
    }
    readings.push(out)
  }
  const kept = readings.length === report.readings.length && readings.every((r, i) => r === report.readings[i]) ? report.readings : readings
  const withNew = linkedReadings(next, { ...report, readings: kept })

  const out: Report = scanResults === report.scanResults && withNew === report.readings ? report : { ...report, scanResults, readings: withNew }
  const marked = followMarkLinks(prev, next, out)
  return marked === report ? next : { ...next, report: marked }
}

/** Mark links follow their scan or MUT row; a link whose row was deleted is left as it was. */
function followMarkLinks(prev: Project, next: Project, report: Report): Report {
  if (prev.scans === next.scans && prev.shellMut === next.shellMut && prev.headMut === next.headMut) return report
  return mapMarkup(report, (marks) => {
    let changed = false
    const out = marks.map((m): Mark => {
      const l = m.link
      if (!l || prev[l.list] === next[l.list]) return m
      const to = followRow(prev[l.list], next[l.list], l.id, l.occurrence)
      if (!to || (to.id === l.id && to.occurrence === l.occurrence)) return m
      changed = true
      return { ...m, link: { ...l, ...to } }
    })
    return changed ? out : marks
  })
}
