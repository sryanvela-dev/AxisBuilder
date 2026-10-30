// Starting a report and the questions every part of it asks: which template, which component a scan or reading
// belongs to, and which nominal a row is measured against.

import { idKey, type HeadMut, type Project, type Scan, type ShellMut } from '../data/schema.ts'
import { rowOf } from '../data/overrides.ts'
import { DEFAULT_TEMPLATE_ID, templateOf } from './templates/registry.ts'
import { reportSchema, type Component, type MutList, type Reading, type Report, type ScanResult } from './schema.ts'

/** The template id of the heads: Head 1 -> 'head1'. */
export const headComponentId = (head: 'HEAD 1' | 'HEAD 2') => (head === 'HEAD 1' ? 'head1' : 'head2')

/**
 * A new report for the job: Shell (sized from the vessel), Head 1 and Head 2 when the drawing shows them (design 4.0;
 * nominals entered once, heads always their own), a linked reading row for every shell and head MUT row.
 */
export function createReport(p: Project, templateId: string = DEFAULT_TEMPLATE_ID): Report {
  const template = templateOf(templateId)
  const components: Partial<Component>[] = [
    { id: 'shell', name: 'Shell', kind: 'shell', size: { circumference: p.vessel.height, length: p.vessel.length, diameter: null, nps: null } },
  ]
  const mode = p.settings.headViewMode
  if (mode === 'HEAD 1' || mode === 'BOTH') components.push({ id: 'head1', name: headName(p, 'HEAD 1'), kind: 'head' })
  if (mode === 'HEAD 2' || mode === 'BOTH') components.push({ id: 'head2', name: headName(p, 'HEAD 2'), kind: 'head' })
  const report = reportSchema.parse({ templateId: template.id, templateVersion: template.version, components })
  return { ...report, readings: linkedReadings(p, report) }
}

function headName(p: Project, head: 'HEAD 1' | 'HEAD 2'): string {
  const label = (head === 'HEAD 1' ? p.settings.head1Label : p.settings.head2Label).trim()
  return label === '' ? (head === 'HEAD 1' ? 'Head 1' : 'Head 2') : label.charAt(0) + label.slice(1).toLowerCase()
}

/** A linked reading row for a drawing MUT row (nominal from its own component, so a head is never measured against the shell). */
export function newLinkedReading(list: MutList, row: ShellMut | HeadMut, occurrence: number, report: Report): Reading {
  const head = 'head' in row ? headComponentId(row.head) : null
  const componentId = head !== null && report.components.some((c) => c.id === head) ? head : null
  return {
    link: { list, id: row.id, occurrence }, nozzle: null, name: '', location: '', componentId,
    type: row.area && row.area.length >= 3 ? 'MUT scan' : 'UTT',
    minT: null, avgT: null, maxT: null, area: null,
    nominalMode: 'component', pipeSize: null, nominal: null, na: null,
    severityOverride: null, form: '', cause: '', surface: 'ID', midWall: 'none', commentOverride: null,
  }
}

/**
 * The report's readings with a linked row for every shell and head MUT row that has none yet, in the default order
 * (report rows such as nozzles first, then shell MUT, then head MUT): a new shell MUT row goes after the last shell
 * MUT reading (before the head MUT ones), a new head MUT row after the last head MUT reading.
 */
export function linkedReadings(p: Project, report: Report): Reading[] {
  let out = report.readings
  for (const list of ['shellMut', 'headMut'] as const) {
    const rows: (ShellMut | HeadMut)[] = p[list]
    const counts = new Map<string, number>()
    rows.forEach((row) => {
      const occurrence = counts.get(idKey(row.id)) ?? 0
      counts.set(idKey(row.id), occurrence + 1)
      const has = out.some((r) => r.link?.list === list && idKey(r.link.id) === idKey(row.id) && r.link.occurrence === occurrence)
      if (has) return
      const reading = newLinkedReading(list, row, occurrence, report)
      const lastSame = out.findLastIndex((r) => r.link?.list === list)
      const firstHead = out.findIndex((r) => r.link?.list === 'headMut')
      const at = lastSame >= 0 ? lastSame + 1 : list === 'shellMut' && firstHead >= 0 ? firstHead : out.length
      out = [...out.slice(0, at), reading, ...out.slice(at)]
    })
  }
  return out
}

/** The drawing row a linked reading shows, or null for a report row. */
export function linkedRow(p: Project, r: Reading): ShellMut | HeadMut | null {
  if (!r.link) return null
  const rows: (ShellMut | HeadMut)[] = p[r.link.list]
  const i = rowOf(rows, r.link.id, r.link.occurrence)
  return i >= 0 ? rows[i] : null
}

// --- Components ------------------------------------------------------------------------------

export function componentById(report: Report, id: string | null): Component | undefined {
  return id === null ? undefined : report.components.find((c) => c.id === id)
}

/** Shell components a scan can be placed on by position: kind shell or course. */
const shellParts = (report: Report) => report.components.filter((c) => c.kind === 'shell' || c.kind === 'course')

/** The Y bands (courses / plates) a scan touches, by its Y range. */
export function bandsOf(report: Report, scan: Scan): Component[] {
  if (scan.yStart === null || scan.yStop === null) return []
  const lo = Math.min(scan.yStart, scan.yStop)
  const hi = Math.max(scan.yStart, scan.yStop)
  return report.components.filter((c) => c.yRange !== null && Math.min(...c.yRange) < hi && Math.max(...c.yRange) > lo)
}

/**
 * The component a scan belongs to (design 4.0): the one picked; else the band its Y range is in (the band holding
 * most of it when it crosses two: a check asks to pick); else the only shell part; else undefined (a check asks).
 */
export function scanComponent(report: Report, scan: Scan, result: ScanResult | undefined): Component | undefined {
  if (result?.componentId) return componentById(report, result.componentId)
  const bands = bandsOf(report, scan)
  if (bands.length > 0 && scan.yStart !== null && scan.yStop !== null) {
    const lo = Math.min(scan.yStart, scan.yStop)
    const hi = Math.max(scan.yStart, scan.yStop)
    const inside = (c: Component) => Math.min(hi, Math.max(...c.yRange!)) - Math.max(lo, Math.min(...c.yRange!))
    return bands.reduce((a, b) => (inside(b) > inside(a) ? b : a))
  }
  const shells = shellParts(report)
  return shells.length === 1 ? shells[0] : report.components.length === 1 ? report.components[0] : undefined
}

/** The component a reading belongs to: the one picked; a head MUT row its head; else the only shell part. */
export function readingComponent(p: Project, report: Report, r: Reading): Component | undefined {
  if (r.componentId) return componentById(report, r.componentId)
  if (r.link?.list === 'headMut') {
    const row = linkedRow(p, r) as HeadMut | null
    if (row) return componentById(report, headComponentId(row.head))
  }
  const shells = shellParts(report)
  return shells.length === 1 ? shells[0] : report.components.length === 1 ? report.components[0] : undefined
}

/** The scan's result row, or undefined. */
export function resultOf(report: Report, scanId: string): ScanResult | undefined {
  return report.scanResults.find((r) => idKey(r.scanId) === idKey(scanId))
}
