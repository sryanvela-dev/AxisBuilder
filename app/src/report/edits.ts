// Every change the report screens make (Phase R2), as pure functions of the project: each screen action is one
// app.edit() call, so one undo step. Nothing here checks the values typed into a box (the boxes do, with the schema's
// own rules); a function that would change nothing returns the same project, so no empty undo step is recorded.

import { occurrenceOf, rowOf } from '../data/overrides.ts'
import { idKey, type HeadNozzle, type Project, type ShellNozzle } from '../data/schema.ts'
import { npsForDiameter } from './calc/pipeWalls.ts'
import { createReport, headComponentId, linkedRow } from './report.ts'
import {
  componentSchema,
  readingSchema,
  scanResultSchema,
  type Component,
  type ComponentKind,
  type NozzleListKey,
  type Reading,
  type Report,
  type ScanResult,
} from './schema.ts'
import { DEFAULT_TEMPLATE_ID, templateOf } from './templates/registry.ts'
import type { ReportTemplate, SectionDef } from './templates/types.ts'

export type ReportPath = readonly (string | number)[]

const withReport = (p: Project, update: (r: Report) => Report): Project => {
  if (!p.report) return p
  const report = update(p.report)
  return report === p.report ? p : { ...p, report }
}

const same = (a: unknown, b: unknown) => Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b)

// --- Starting, template -------------------------------------------------------------------------

/** The job with a new report (Shell, the heads shown, a linked reading per MUT row); a job that has one is kept. */
export function startReport(p: Project, templateId: string = DEFAULT_TEMPLATE_ID): Project {
  return p.report ? p : { ...p, report: createReport(p, templateId) }
}

/** Another template: every value is kept (design 3: one data model for all templates). */
export function switchTemplate(p: Project, templateId: string): Project {
  const t = templateOf(templateId)
  return withReport(p, (r) => (r.templateId === t.id && r.templateVersion === t.version ? r : { ...r, templateId: t.id, templateVersion: t.version }))
}

// --- Any value by its path -------------------------------------------------------------------

/** The value at a path under the report ('job', 'jobNumber'), or undefined. */
export function getReportValue(report: Report, path: ReportPath): unknown {
  let v: unknown = report
  for (const k of path) {
    if (v === null || typeof v !== 'object') return undefined
    v = (v as Record<string | number, unknown>)[k]
  }
  return v
}

function setIn(obj: unknown, path: ReportPath, value: unknown): unknown {
  if (path.length === 0) return value
  const [k, ...rest] = path
  if (Array.isArray(obj)) {
    const copy = obj.slice()
    copy[k as number] = setIn(copy[k as number], rest, value)
    return copy
  }
  const o = (obj ?? {}) as Record<string, unknown>
  return { ...o, [k]: setIn(o[k as string], rest, value) }
}

/** Sets one value under the report: ['job', 'jobNumber'], ['calibration', 'transducers', 0, 'maker'], ... */
export function setReportValue(p: Project, path: ReportPath, value: unknown): Project {
  return withReport(p, (r) => (same(getReportValue(r, path), value) ? r : (setIn(r, path, value) as Report)))
}

/** Adds an item at the end of a list under the report (examiners, transducers). */
export function addListItem(p: Project, path: ReportPath, item: unknown): Project {
  return withReport(p, (r) => {
    const list = getReportValue(r, path)
    return setIn(r, path, [...(Array.isArray(list) ? list : []), item]) as Report
  })
}

export function removeListItem(p: Project, path: ReportPath, index: number): Project {
  return withReport(p, (r) => {
    const list = getReportValue(r, path)
    if (!Array.isArray(list) || index < 0 || index >= list.length) return r
    return setIn(r, path, list.filter((_, i) => i !== index)) as Report
  })
}

/** Moves an item one place up (-1) or down (+1). */
export function moveListItem(p: Project, path: ReportPath, index: number, by: -1 | 1): Project {
  return withReport(p, (r) => {
    const list = getReportValue(r, path)
    const to = index + by
    if (!Array.isArray(list) || index < 0 || index >= list.length || to < 0 || to >= list.length) return r
    const copy = list.slice()
    ;[copy[index], copy[to]] = [copy[to], copy[index]]
    return setIn(r, path, copy) as Report
  })
}

// --- Components (design 4.0) -------------------------------------------------------------------

/** What "Add ..." makes: a boot, another shell thickness (a course with a Y band), anything else. */
export const ADDABLE_KINDS = ['boot', 'course', 'other'] as const
export const KIND_NAMES: Record<ComponentKind, string> = {
  shell: 'Shell', course: 'Shell course', head: 'Head', boot: 'Boot', line: 'Line', other: 'Other',
}

/** A new component of a kind, with a free id and name ("Shell course 2", "Boot 2"), at the end of the list. */
export function addComponent(p: Project, kind: ComponentKind): Project {
  return withReport(p, (r) => {
    const ids = new Set(r.components.map((c) => c.id))
    let n = 1
    while (ids.has(`c${n}`)) n++
    const names = new Set(r.components.map((c) => idKey(c.name)))
    const base = KIND_NAMES[kind]
    let name = kind === 'course' ? `${base} 1` : base
    for (let i = 2; names.has(idKey(name)); i++) name = `${base} ${i}`
    const c = componentSchema.parse({ id: `c${n}`, name, kind })
    return { ...r, components: [...r.components, c] }
  })
}

export function updateComponent(p: Project, id: string, change: Partial<Omit<Component, 'id'>>): Project {
  return withReport(p, (r) => {
    const i = r.components.findIndex((c) => c.id === id)
    if (i < 0) return r
    const next = { ...r.components[i], ...change }
    if (same(next, r.components[i])) return r
    return { ...r, components: r.components.map((c, j) => (j === i ? next : c)) }
  })
}

/** How many scan results and readings picked the component (removing it clears those picks). */
export function componentUses(p: Project, id: string): { scans: number; readings: number } {
  const r = p.report
  if (!r) return { scans: 0, readings: 0 }
  return { scans: r.scanResults.filter((s) => s.componentId === id).length, readings: r.readings.filter((x) => x.componentId === id).length }
}

/** Removes a component; scans and readings that picked it go back to automatic. */
export function removeComponent(p: Project, id: string): Project {
  return withReport(p, (r) => {
    if (!r.components.some((c) => c.id === id)) return r
    return {
      ...r,
      components: r.components.filter((c) => c.id !== id),
      scanResults: r.scanResults.map((s) => (s.componentId === id ? { ...s, componentId: null } : s)),
      readings: r.readings.map((x) => (x.componentId === id ? { ...x, componentId: null } : x)),
    }
  })
}

// --- Sections and cover (design 4.8, 4.1) -------------------------------------------------------

/** Whether a section has anything to print, for sections on "when any exist". */
export function sectionHasContent(report: Report, def: SectionDef): boolean {
  if (def.pageType === 'table' && def.options?.table === 'readings') return report.readings.length > 0
  if (def.pageType === 'custom') return report.customSheets.length > 0
  if (def.pageType === 'uploaded') return report.uploads.length > 0
  if (def.pageType === 'photos') return report.photos.length > 0
  return true
}

/** Whether a section is on: the job's choice, else the template's default. A section that can't be turned off is on. */
export function sectionOn(report: Report, def: SectionDef): boolean {
  if (!def.optional) return true
  const own = report.sections[def.id]?.on
  if (own !== undefined) return own
  return def.defaultOn === 'whenAny' ? sectionHasContent(report, def) : def.defaultOn
}

/** The section's title: the job's own, else the template's. */
export function sectionTitle(report: Report, def: SectionDef): string {
  return report.sections[def.id]?.title ?? def.title
}

const sectionDef = (r: Report, id: string): SectionDef | undefined => templateOf(r.templateId).sections.find((s) => s.id === id)

export function setSectionOn(p: Project, id: string, on: boolean): Project {
  return withReport(p, (r) => {
    const def = sectionDef(r, id)
    if (!def || !def.optional || r.sections[id]?.on === on) return r
    return { ...r, sections: { ...r.sections, [id]: { ...r.sections[id], on } } }
  })
}

/** Renames a section; a blank title (or the template's own) goes back to the template's. */
export function setSectionTitle(p: Project, id: string, title: string): Project {
  return withReport(p, (r) => {
    const def = sectionDef(r, id)
    if (!def) return r
    const t = title.trim()
    const own = r.sections[id]
    const nextTitle = t === '' || t === def.title ? undefined : t
    if (own?.title === nextTitle) return r
    const entry = { on: own?.on ?? sectionOn(r, def), ...(own?.order !== undefined && { order: own.order }), ...(nextTitle !== undefined && { title: nextTitle }) }
    return { ...r, sections: { ...r.sections, [id]: entry } }
  })
}

/** Turns an optional cover field on or off (its FieldRef source, e.g. 'project.unit'). */
export function setCoverExtra(p: Project, source: string, on: boolean): Project {
  return withReport(p, (r) => {
    const has = r.job.coverExtras.includes(source)
    if (has === on) return r
    const coverExtras = on ? [...r.job.coverExtras, source] : r.job.coverExtras.filter((s) => s !== source)
    return { ...r, job: { ...r.job, coverExtras } }
  })
}

/** Optional cover fields the template offers. */
export const optionalCoverFields = (t: ReportTemplate) => t.coverFields.filter((f) => f.optional)

// --- Scan results (design 4.3) ---------------------------------------------------------------------

/** Changes a scan's result; made when the scan has none yet. Results are kept in scan order. */
export function setScanResult(p: Project, scanId: string, change: Partial<Omit<ScanResult, 'scanId'>>): Project {
  return withReport(p, (r) => {
    const scan = p.scans.find((s) => idKey(s.id) === idKey(scanId))
    if (!scan) return r
    const i = r.scanResults.findIndex((x) => idKey(x.scanId) === idKey(scanId))
    const old = i >= 0 ? r.scanResults[i] : scanResultSchema.parse({ scanId: scan.id })
    const next = { ...old, ...change }
    // A value typed over a worked-out one is not "calculated" any more.
    if (change.calculated === undefined && (change.readings !== undefined || change.incrX !== undefined || change.incrY !== undefined)) {
      next.calculated = old.calculated.filter((f) => !(f in change))
    }
    if (i >= 0 && same(next, old)) return r
    const byId = new Map(r.scanResults.map((x) => [idKey(x.scanId), x]))
    byId.set(idKey(scan.id), next)
    const ordered = p.scans.flatMap((s) => byId.get(idKey(s.id)) ?? [])
    return { ...r, scanResults: ordered }
  })
}

/** The data-page screenshot of many scans at once (scan ID -> file name); results are made where needed. */
export function setDataImages(p: Project, choices: ReadonlyMap<string, string>): Project {
  let out = p
  for (const [scanId, file] of choices) out = setScanResult(out, scanId, { dataImage: file })
  return out
}

/**
 * One form and / or cause for every drawing scan and every manual reading at once (user, 2026-10-29); each can still be
 * changed on its own afterwards. A pick left undefined is not touched. Results are made for scans that have none.
 */
export function setPicksForAll(p: Project, picks: { form?: string; cause?: string }): Project {
  const change = { ...(picks.form !== undefined && { form: picks.form }), ...(picks.cause !== undefined && { cause: picks.cause }) }
  if (!p.report || Object.keys(change).length === 0) return p
  let out = p
  for (const s of p.scans) out = setScanResult(out, s.id, change)
  out.report!.readings.forEach((_, i) => {
    out = setReading(out, i, change)
  })
  return out
}

// --- Manual readings (design 4.4) --------------------------------------------------------------------

const newReading = (fields: Partial<Reading> = {}): Reading => ({ ...readingSchema.parse({}), ...fields })

/** Where a new report row goes: after the other report rows, before the linked MUT rows. */
function reportRowsEnd(readings: readonly Reading[]): number {
  const first = readings.findIndex((x) => x.link !== null)
  return first < 0 ? readings.length : first
}

export function setReading(p: Project, index: number, change: Partial<Omit<Reading, 'link'>>): Project {
  return withReport(p, (r) => {
    const old = r.readings[index]
    if (!old) return r
    const next = { ...old, ...change }
    if (same(next, old)) return r
    return { ...r, readings: r.readings.map((x, i) => (i === index ? next : x)) }
  })
}

/** A new report row (a reading that isn't drawn as a MUT point), before the MUT rows. */
export function addReportReading(p: Project, fields: Partial<Omit<Reading, 'link'>> = {}): Project {
  return addReportReadings(p, [fields])
}

/** Several report rows at once (a paste), before the MUT rows, in order. */
export function addReportReadings(p: Project, rows: readonly Partial<Omit<Reading, 'link'>>[]): Project {
  if (rows.length === 0) return p
  return withReport(p, (r) => {
    const at = reportRowsEnd(r.readings)
    const added = rows.map((f) => newReading({ ...f, link: null }))
    return { ...r, readings: [...r.readings.slice(0, at), ...added, ...r.readings.slice(at)] }
  })
}

/** Removes a report row; a linked row stays (it goes with its MUT row in the drawing). */
export function removeReading(p: Project, index: number): Project {
  return withReport(p, (r) => {
    const x = r.readings[index]
    if (!x || x.link !== null) return r
    return { ...r, readings: r.readings.filter((_, i) => i !== index) }
  })
}

export function moveReading(p: Project, index: number, by: -1 | 1): Project {
  const r = p.report
  if (!r) return p
  return moveListItem(p, ['readings'], index, by)
}

/**
 * Min 'T' of a reading. A linked row's is the drawing MUT row's own (design 4.4: the same value on both sides), so it
 * is written there; a report row keeps its own.
 */
export function setReadingMinT(p: Project, index: number, minT: number | null): Project {
  const reading = p.report?.readings[index]
  if (!reading) return p
  if (!reading.link) return setReading(p, index, { minT })
  const row = linkedRow(p, reading)
  if (!row || Object.is(row.minT, minT)) return p
  const list = reading.link.list
  const i = rowOf(p[list], reading.link.id, reading.link.occurrence)
  if (list === 'shellMut') return { ...p, shellMut: p.shellMut.map((m, j) => (j === i ? { ...m, minT } : m)) }
  return { ...p, headMut: p.headMut.map((m, j) => (j === i ? { ...m, minT } : m)) }
}

/** "Add nozzle readings" positions (design 5; any mix). */
export const NOZZLE_POSITIONS = ['North', 'East', 'South', 'West', 'Top', 'Bottom'] as const

/** A nozzle of the drawing, by list and row. */
export interface NozzlePick {
  list: NozzleListKey
  index: number
}

/**
 * One UTT row per nozzle and position (design 5): linked to the nozzle, location = the position, nominal from the
 * pipe table (size from the nozzle's diameter when it is a standard size). A nozzle + position that already has a row
 * is skipped, so the button never makes doubles. New rows go after the other report rows, before the MUT rows.
 */
export function addNozzleReadings(p: Project, nozzles: readonly NozzlePick[], positions: readonly string[]): { project: Project; added: number; skipped: number } {
  const r = p.report
  if (!r) return { project: p, added: 0, skipped: 0 }
  const rows: Reading[] = []
  let skipped = 0
  const has = (list: NozzleListKey, id: string, occurrence: number, location: string) =>
    [...r.readings, ...rows].some((x) => x.nozzle?.list === list && idKey(x.nozzle.id) === idKey(id) && x.nozzle.occurrence === occurrence && idKey(x.location) === idKey(location))
  for (const n of nozzles) {
    const list: readonly (ShellNozzle | HeadNozzle)[] = p[n.list]
    const nozzle = list[n.index]
    if (!nozzle) continue
    const occurrence = occurrenceOf(list, n.index)
    const head = 'head' in nozzle ? headComponentId(nozzle.head) : null
    const componentId = head !== null && r.components.some((c) => c.id === head) ? head : null
    for (const location of positions) {
      if (has(n.list, nozzle.id, occurrence, location)) {
        skipped++
        continue
      }
      rows.push(newReading({
        nozzle: { list: n.list, id: nozzle.id, occurrence }, location, componentId, type: 'UTT',
        nominalMode: 'pipe', pipeSize: npsForDiameter(nozzle.diameter),
      }))
    }
  }
  if (rows.length === 0) return { project: p, added: 0, skipped }
  const at = reportRowsEnd(r.readings)
  const readings = [...r.readings.slice(0, at), ...rows, ...r.readings.slice(at)]
  return { project: { ...p, report: { ...r, readings } }, added: rows.length, skipped }
}
