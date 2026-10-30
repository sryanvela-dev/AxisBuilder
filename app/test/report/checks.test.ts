import { describe, expect, it } from 'vitest'
import { checkProject } from '../../src/data/checks.ts'
import type { Project, Scan } from '../../src/data/schema.ts'
import { checkReport } from '../../src/report/checks.ts'
import { createReport } from '../../src/report/report.ts'
import { reportSchema, type Reading, type Report, type ScanResult } from '../../src/report/schema.ts'
import { olderSample } from '../fixtures/olderSample.ts'

const result = (scanId: string, r: Partial<ScanResult> = {}): ScanResult => ({
  ...reportSchema.parse({ templateId: 'generic-aut', templateVersion: 1, scanResults: [{ scanId }] }).scanResults[0], ...r,
})
const reading = (r: Partial<Reading> = {}): Reading => ({
  ...reportSchema.parse({ templateId: 'generic-aut', templateVersion: 1, readings: [{}] }).readings[0], ...r,
})

/** Older sample: every scan has results, every component a nominal; so no checks at all. */
function clean(change: (r: Report, p: Project) => Report = (r) => r, scans?: Scan[]): Project {
  const p0 = olderSample()
  const p = scans ? { ...p0, scans } : p0
  const r = createReport(p)
  const report: Report = {
    ...r,
    components: r.components.map((c) => ({ ...c, nominal: 0.5 })),
    scanResults: p.scans.map((s) => result(s.id, { readings: 100, minT: 0.49, avgT: 0.5 })),
  }
  return { ...p, report: change(report, p) }
}

const texts = (p: Project) => checkReport(p).map((c) => `${c.severity}: ${c.text}`)

describe('report checks', () => {
  it('finds nothing on a complete report, and nothing without one', () => {
    expect(texts(clean())).toEqual([])
    expect(checkReport(olderSample())).toEqual([])
  })

  it('needs a nominal on every component (listed once, not on every reading)', () => {
    const p = clean((r) => ({ ...r, components: r.components.map((c) => (c.id === 'head1' ? { ...c, nominal: null } : c)) }))
    expect(texts(p)).toEqual(['error: East head has no nominal thickness.'])
  })

  it('needs a component for every scan and component-mode reading', () => {
    const p = clean((r) => ({ ...r, components: [...r.components, { ...r.components[0], id: 'boot', name: 'Boot', kind: 'boot' as const }, { ...r.components[0], id: 'shell2', name: 'Shell 2' }] }))
    const t = texts(p)
    expect(t).toContain('error: SCAN 1 has no component.')
    expect(t).toContain('error: M1 has no component.')
    expect(t.filter((x) => x.includes('has no component'))).toHaveLength(p.scans.length + p.shellMut.length)
  })

  it('needs Min T and readings on a scan in the report (not on one left out)', () => {
    const p = clean((r) => ({
      ...r,
      scanResults: r.scanResults.map((s) => (s.scanId === 'SCAN 2' ? { ...s, minT: null, readings: null } : s.scanId === 'SCAN 3' ? { ...s, minT: null, inReport: false } : s)),
    }))
    expect(texts(p)).toEqual(['error: SCAN 2 has no results yet.'])
    // One of the two missing: that one is named.
    const q = clean((r) => ({ ...r, scanResults: r.scanResults.map((s) => (s.scanId === 'SCAN 2' ? { ...s, minT: null } : s)) }))
    expect(texts(q)).toEqual(["error: SCAN 2 has no Min 'T'."])
  })

  it('works readings out from the increments instead of asking for them', () => {
    const p = clean((r) => ({ ...r, calibration: { ...r.calibration, increments: { x: 0.125, y: 0.05 } }, scanResults: r.scanResults.map((s) => ({ ...s, readings: null })) }))
    expect(texts(p)).toEqual([])
  })

  it('warns about a scan crossing two course bands', () => {
    const p = clean((r) => ({
      ...r,
      components: [
        { ...r.components[0], id: 'c1', name: 'Course 1', kind: 'course' as const, yRange: [0, 60] as [number, number] },
        { ...r.components[0], id: 'c2', name: 'Course 2', kind: 'course' as const, yRange: [60, 240] as [number, number] },
        ...r.components.slice(1),
      ],
      readings: r.readings.map((x) => (x.link?.list === 'shellMut' ? { ...x, componentId: 'c1' } : x)),
    }))
    expect(texts(p)).toEqual([
      'warning: SCAN 4 crosses Course 1 and Course 2; it is measured against Course 2.',
      'warning: SCAN 5 crosses Course 1 and Course 2; it is measured against Course 2.',
      'warning: SCAN 6 crosses Course 1 and Course 2; it is measured against Course 2.',
    ])
  })

  it('warns when the CSV Wall Remain % is more than 0.1% off', () => {
    const p = clean((r) => ({
      ...r,
      scanResults: r.scanResults.map((s, i) => (i === 0 ? { ...s, csvWallRemain: 98.0 } : i === 1 ? { ...s, csvWallRemain: 97.5 } : s)),
    }))
    expect(texts(p)).toEqual(["warning: Wall Remain 97.5% in the CSV; 0.49 on 0.5 is 98.00%."])
  })

  it('warns about overlapping scans in the report, as the drawing finds them', () => {
    const scans = [
      { id: 'A', xStart: 0, xStop: 20, yStart: 0, yStop: 10, include: true, noWrap: false, acrossSeam: false },
      { id: 'B', xStart: 10, xStop: 30, yStart: 0, yStop: 10, include: true, noWrap: false, acrossSeam: false },
    ]
    const p = clean((r) => r, scans)
    expect(texts(p)).toEqual(['warning: B overlaps A by 100 sq in.'])
    expect(checkProject(p).some((c) => c.text === 'Overlaps A (row 1) by 100 sq in.')).toBe(true)
  })

  it('needs a nominal on custom and pipe rows; N/A rows need nothing', () => {
    const p = clean((r) => ({
      ...r,
      readings: [
        reading({ name: 'N1', nominalMode: 'custom', minT: 0.3 }),
        reading({ name: 'N2', nominalMode: 'pipe', minT: 0.3 }),
        reading({ name: 'N3', nominalMode: 'pipe', pipeSize: '4' }),
        reading({ name: 'N4', nominalMode: 'pipe', pipeSize: '4', minT: 0.3 }),
        reading({ name: 'N6', location: 'North', nominalMode: 'custom', minT: 0.3 }),
        reading({ name: 'N5', nominalMode: 'custom', na: 'Repad' }),
        ...r.readings,
      ],
    }))
    expect(checkReport(p).map((c) => `${c.text} ${c.fix}`)).toEqual([
      'N1 has no nominal. Type the nominal.',
      'N2 has no nominal. Enter the pipe size, or switch the row to a custom nominal.',
      'N3 has no nominal. Enter a reading so a wall can be suggested, or pick one.',
      'N6 North has no nominal. Type the nominal.',
    ])
  })
})
