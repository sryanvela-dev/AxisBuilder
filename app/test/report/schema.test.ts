import { describe, expect, it } from 'vitest'
import { createEmptyProject, openProject, saveProject } from '../../src/data/projectFile.ts'
import { CURRENT_SCHEMA_VERSION, projectFileSchema, type Project } from '../../src/data/schema.ts'
import { createReport, linkedRow, readingComponent, scanComponent } from '../../src/report/report.ts'
import { syncReport } from '../../src/report/sync.ts'
import { reportSchema, type Report } from '../../src/report/schema.ts'
import { olderSample } from '../fixtures/olderSample.ts'

function withReport(p: Project): Project {
  return { ...p, report: createReport(p) }
}

function errorsFor(data: unknown): string[] {
  const r = openProject(JSON.stringify(data))
  return r.ok ? [] : r.errors
}

describe('project file format 7', () => {
  it('is the current format', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(9)
  })

  it('opens a format 6 file with no report and blank Location and Equipment name', () => {
    const r = openProject(JSON.stringify({ schemaVersion: 6, jobId: 'j6', project: { client: 'C' } }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.migratedFrom).toBe(6)
    expect(r.project.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(r.project.report).toBeNull()
    expect(r.project.project.location).toBe('')
    expect(r.project.project.equipmentName).toBe('')
    expect(r.project.project.client).toBe('C')
  })

  it('a new project has no report', () => {
    expect(createEmptyProject().report).toBeNull()
  })

  it('saves and reopens a job with a report unchanged', () => {
    const p = withReport(olderSample())
    p.report!.components[0].nominal = 0.736
    p.report!.job.techs = [{ name: 'A. Tech', title: 'AUT Specialist, Level II' }]
    const back = openProject(saveProject(p))
    expect(back.ok && back.project).toEqual(p)
  })

  it('gives plain-language errors inside the report', () => {
    const p = withReport(olderSample())
    const data = JSON.parse(saveProject(p))
    data.report.components[0].nominal = -1
    data.report.scanResults = [{ scanId: 'NOPE' }]
    expect(errorsFor(data)).toEqual([
      'Report, components, item 1 (Shell): Nominal must be greater than 0.',
      'Report, scan results, item 1 (NOPE): Scan "NOPE" does not match any AUT scan.',
    ])
  })

  it('refuses unknown report fields, an unknown component and two results for one scan', () => {
    const p = withReport(olderSample())
    const data = JSON.parse(saveProject(p))
    data.report.mechanism = 'x'
    const scan = p.scans[0].id
    data.report.scanResults = [{ scanId: scan, componentId: 'boot' }, { scanId: scan.toLowerCase() }]
    expect(errorsFor(data)).toEqual([
      'Report has unknown field: mechanism.',
      `Report, scan results, item 1 (${scan}): Component "boot" does not match any component.`,
      `Report, scan results, item 2 (${scan.toLowerCase()}): Scan "${scan.toLowerCase()}" has two result rows.`,
    ])
  })

  it('checks the ladder cutoffs increase', () => {
    expect(reportSchema.safeParse({ templateId: 'generic-aut', templateVersion: 1, options: { ladder: { cutoffs: [5, 30, 16] } } }).success).toBe(false)
    expect(reportSchema.safeParse({ templateId: 'generic-aut', templateVersion: 1, options: { ladder: { cutoffs: [4, 10, 20] } } }).success).toBe(true)
  })
})

describe('createReport', () => {
  it('makes Shell and the heads that are drawn, and a linked row per MUT row', () => {
    const p = olderSample()
    const r = createReport(p)
    expect(r.templateId).toBe('generic-aut')
    expect(r.templateVersion).toBe(1)
    expect(r.components.map((c) => [c.id, c.name, c.kind, c.nominal])).toEqual([
      ['shell', 'Shell', 'shell', null],
      ['head1', 'East head', 'head', null],
      ['head2', 'West head', 'head', null],
    ])
    expect(r.components[0].size.circumference).toBe(p.vessel.height)
    const links = r.readings.map((x) => `${x.link!.list}:${x.link!.id}`)
    expect(links).toEqual([...p.shellMut.map((m) => `shellMut:${m.id}`), ...p.headMut.map((m) => `headMut:${m.id}`)])
    expect(r.readings.every((x) => x.nominalMode === 'component')).toBe(true)
  })

  it('leaves the heads out when the drawing shows none', () => {
    const p = { ...olderSample(), headMut: [] }
    p.settings = { ...p.settings, headViewMode: 'NONE' }
    expect(createReport(p).components.map((c) => c.id)).toEqual(['shell'])
  })

  it('measures head MUT rows against their own head, never the shell', () => {
    const p = withReport(olderSample())
    const head = p.report!.readings.find((r) => r.link?.list === 'headMut')!
    const row = linkedRow(p, head) as { head: string }
    expect(readingComponent(p, p.report!, head)?.id).toBe(row.head === 'HEAD 1' ? 'head1' : 'head2')
  })
})

describe('scan components by Y band', () => {
  const report = (): Report => reportSchema.parse({
    templateId: 'generic-aut', templateVersion: 1,
    components: [
      { id: 'c1', name: 'Course 1', kind: 'course', yRange: [0, 96] },
      { id: 'c2', name: 'Course 2', kind: 'course', yRange: [96, 192] },
    ],
  })
  const scan = (y0: number, y1: number) => ({ id: 'S', xStart: 0, xStop: 10, yStart: y0, yStop: y1, include: true, noWrap: false, acrossSeam: false })

  it('places a scan in the band it lies in, the larger part when it crosses two, and the pick first', () => {
    const r = report()
    expect(scanComponent(r, scan(10, 30), undefined)?.id).toBe('c1')
    expect(scanComponent(r, scan(150, 120), undefined)?.id).toBe('c2')
    expect(scanComponent(r, scan(80, 120), undefined)?.id).toBe('c2')
    expect(scanComponent(r, scan(80, 120), { ...emptyResult('S'), componentId: 'c1' })?.id).toBe('c1')
  })

  it('has no automatic component with two shell parts and no bands', () => {
    const r = reportSchema.parse({ templateId: 'generic-aut', templateVersion: 1, components: [
      { id: 'a', name: 'A', kind: 'shell' }, { id: 'b', name: 'B', kind: 'shell' },
    ] })
    expect(scanComponent(r, scan(0, 10), undefined)).toBeUndefined()
  })
})

function emptyResult(scanId: string) {
  return reportSchema.parse({ templateId: 'x', templateVersion: 1, scanResults: [{ scanId }] }).scanResults[0]
}

describe('syncReport', () => {
  function start() {
    const p = withReport(olderSample())
    p.report = { ...p.report!, scanResults: p.scans.map((s) => ({ ...emptyResult(s.id), minT: 0.5 })) }
    return projectFileSchema.parse(p)
  }

  it('follows a renamed scan and drops a deleted one', () => {
    const p = start()
    const renamed = { ...p, scans: p.scans.map((s, i) => (i === 0 ? { ...s, id: 'SCAN 99' } : s)) }
    const a = syncReport(p, renamed)
    expect(a.report!.scanResults[0].scanId).toBe('SCAN 99')
    expect(a.report!.scanResults[0].minT).toBe(0.5)
    const deleted = { ...p, scans: p.scans.slice(1) }
    const b = syncReport(p, deleted)
    expect(b.report!.scanResults.map((r) => r.scanId)).toEqual(p.scans.slice(1).map((s) => s.id))
    expect(() => projectFileSchema.parse(b)).not.toThrow()
  })

  it('follows a renamed or sorted MUT row, drops a deleted one and adds a new one', () => {
    const p = start()
    const first = p.shellMut[0]
    const withNa = { ...p, report: { ...p.report!, readings: p.report!.readings.map((r, i) => (i === 0 ? { ...r, na: 'Repad' } : r)) } }
    const renamed = { ...withNa, shellMut: [{ ...first, id: 'M99' }, ...p.shellMut.slice(1)] }
    const a = syncReport(withNa, renamed)
    expect(a.report!.readings[0].link!.id).toBe('M99')
    expect(a.report!.readings[0].na).toBe('Repad')

    const sorted = { ...withNa, shellMut: [...p.shellMut].reverse() }
    const b = syncReport(withNa, sorted)
    expect(b.report!.readings.find((r) => r.na === 'Repad')!.link!.id).toBe(first.id)

    const deleted = { ...withNa, shellMut: p.shellMut.slice(1) }
    const c = syncReport(withNa, deleted)
    expect(c.report!.readings.some((r) => r.na === 'Repad')).toBe(false)
    expect(c.report!.readings).toHaveLength(p.report!.readings.length - 1)

    const added = { ...p, shellMut: [...p.shellMut, { id: 'M50', x: 1, y: 1, minT: null, notes: '', area: null }] }
    const d = syncReport(p, added)
    const i = d.report!.readings.findIndex((r) => r.link?.id === 'M50')
    expect(i).toBe(p.shellMut.length)
    expect(d.report!.readings[i + 1]?.link?.list ?? 'headMut').toBe('headMut')
    expect(() => projectFileSchema.parse(d)).not.toThrow()
  })

  it("keeps a nozzle reading when its nozzle goes, without the link", () => {
    const p = start()
    const nozzle = p.shellNozzles[0]
    const reading = { ...emptyReading(), nozzle: { list: 'shellNozzles' as const, id: nozzle.id, occurrence: 0 }, location: 'North', nominalMode: 'pipe' as const }
    const q = { ...p, report: { ...p.report!, readings: [reading, ...p.report!.readings] } }
    const renamed = syncReport(q, { ...q, shellNozzles: [{ ...nozzle, id: 'N77' }, ...p.shellNozzles.slice(1)] })
    expect(renamed.report!.readings[0].nozzle!.id).toBe('N77')
    const gone = syncReport(q, { ...q, shellNozzles: p.shellNozzles.slice(1) })
    expect(gone.report!.readings[0].nozzle).toBeNull()
    expect(gone.report!.readings[0].name).toBe(nozzle.id)
  })

  it('changes nothing when the drawing lists did not change', () => {
    const p = start()
    const next = { ...p, vessel: { ...p.vessel, length: 300 } }
    expect(syncReport(p, next)).toBe(next)
    const noReport = olderSample()
    expect(syncReport(noReport, { ...noReport, scans: [] }).report).toBeNull()
  })
})

function emptyReading() {
  return reportSchema.parse({ templateId: 'x', templateVersion: 1, readings: [{}] }).readings[0]
}
