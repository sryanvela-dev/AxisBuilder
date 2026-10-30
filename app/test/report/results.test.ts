import { describe, expect, it } from 'vitest'
import { countedScans, coveragePercent, drawnScans } from '../../src/engine/layout.ts'
import { mutCoverageArea } from '../../src/engine/mutAreas.ts'
import type { Project } from '../../src/data/schema.ts'
import { createReport } from '../../src/report/report.ts'
import { jobLadder, readingRows, readingTotals, reportCoverage, scanRows, totalsByComponent, totalsOf } from '../../src/report/calc/results.ts'
import { reportSchema, type Reading, type Report, type ScanResult } from '../../src/report/schema.ts'
import { olderSample } from '../fixtures/olderSample.ts'

const result = (scanId: string, r: Partial<ScanResult> = {}): ScanResult => ({
  ...reportSchema.parse({ templateId: 'generic-aut', templateVersion: 1, scanResults: [{ scanId }] }).scanResults[0], ...r,
})
const reading = (r: Partial<Reading> = {}): Reading => ({
  ...reportSchema.parse({ templateId: 'generic-aut', templateVersion: 1, readings: [{}] }).readings[0], ...r,
})

/** The older sample with a report: shell 0.5, heads 0.55 / 0.6, made-up results on scans 1-5 (scan 6 has none). */
function job(change: (r: Report) => Report = (r) => r): Project {
  const p = olderSample()
  let report = createReport(p)
  report = {
    ...report,
    components: report.components.map((c) => ({ ...c, nominal: c.id === 'shell' ? 0.5 : c.id === 'head1' ? 0.55 : 0.6 })),
    calibration: { ...report.calibration, increments: { x: 0.125, y: 0.05 } },
    scanResults: [
      result('SCAN 1', { readings: 1000, minT: 0.49, avgT: 0.5 }),
      result('SCAN 2', { readings: 3000, minT: 0.4, avgT: 0.46 }),
      result('SCAN 3', { readings: 1000, minT: 0.52, avgT: 0.53 }),
      result('SCAN 4', { minT: 0.3, avgT: 0.45, form: 'localized', cause: 'corrosion' }),
      result('SCAN 5', { readings: 10, minT: 0.45, avgT: 0.47, inReport: false }),
    ],
  }
  return { ...p, report: change(report) }
}

describe('scan rows', () => {
  it('lists every drawing scan in the report, against its component nominal, with the comment', () => {
    const p = job()
    const rows = scanRows(p, p.report!)
    expect(rows.map((r) => r.scan.id)).toEqual(['SCAN 1', 'SCAN 2', 'SCAN 3', 'SCAN 4', 'SCAN 6'])
    expect(rows[0]).toMatchObject({ nominal: 0.5, readings: 1000, readingsCalculated: false, band: 0, color: 'normal' })
    expect(rows[0].wallLoss).toBeCloseTo(2, 10)
    expect(rows[1].wallLoss).toBeCloseTo(20, 10)
    expect(rows[1]).toMatchObject({ band: 2, color: 'amber' })
    expect(rows[1].comment!.text).toBe('Moderate I.D. wall loss detected.')
    expect(rows[2].wallLoss).toBeCloseTo(-4, 10)
    expect(rows[2].comment!.text).toBe('No significant I.D. wall loss detected.')
    expect(rows[3]).toMatchObject({ band: 3, color: 'red' })
    expect(rows[3].comment!.text).toBe('Significant localized I.D. corrosion detected.')
    expect(rows[0].area).toBe(24 * 48)
    // No result yet: listed with blanks.
    expect(rows[4]).toMatchObject({ result: undefined, minT: null, wallLoss: null, comment: null })
  })

  it('works out blank readings from the size and the job increments, marked calculated', () => {
    const p = job()
    const row = scanRows(p, p.report!)[3]
    expect(row.readings).toBe((24 / 0.125 + 1) * (48 / 0.05 + 1))
    expect(row.readingsCalculated).toBe(true)
  })

  it('applies the temperature correction to min and avg before wall loss', () => {
    const p = job((r) => ({ ...r, options: { ...r.options, tempCorrection: { on: true, tempF: 270 } } }))
    const row = scanRows(p, p.report!)[0]
    expect(row.minT).toBeCloseTo(0.49 * 0.98, 10)
    expect(row.avgT).toBeCloseTo(0.5 * 0.98, 10)
    expect(row.wallLoss).toBeCloseTo((1 - 0.49 * 0.98 / 0.5) * 100, 10)
  })

  it('uses the job’s own ladder cutoffs', () => {
    const p = job((r) => ({ ...r, options: { ...r.options, ladder: { cutoffs: [1, 10, 25] } } }))
    expect(jobLadder(p.report!).cutoffs).toEqual([1, 10, 25])
    expect(scanRows(p, p.report!)[0].band).toBe(1)
  })
})

describe('totals', () => {
  it('sums readings, finds the minimum, weights the average by readings, takes the worst wall loss', () => {
    const p = job()
    const t = totalsOf(scanRows(p, p.report!))
    const scan4 = 193 * 961
    expect(t.scans).toBe(5)
    // SCAN 6 has no result yet: its readings are worked out too.
    expect(t.readings).toBe(5000 + 2 * scan4)
    expect(t.min).toEqual({ value: 0.3, scanId: 'SCAN 4' })
    expect(t.average).toBeCloseTo((0.5 * 1000 + 0.46 * 3000 + 0.53 * 1000 + 0.45 * scan4) / (5000 + scan4), 12)
    expect(t.wallLoss).toMatchObject({ scanId: 'SCAN 4', band: 3, color: 'red' })
    expect(t.wallLoss!.value).toBeCloseTo(40, 10)
  })

  it('takes each scan against its own component and totals per component', () => {
    const p = job((r) => ({
      ...r,
      components: [...r.components, { ...r.components[0], id: 'thick', name: 'Thick plate', nominal: 0.8 }],
      scanResults: r.scanResults.map((s) => (s.scanId === 'SCAN 3' ? { ...s, componentId: 'thick' } : s)),
    }))
    const rows = scanRows(p, p.report!)
    expect(rows[2].nominal).toBe(0.8)
    expect(rows[2].wallLoss).toBeCloseTo(35, 10)
    // Two shell parts and no Y bands: scans without a pick have no component.
    expect(rows[0].component).toBeUndefined()
    const per = totalsByComponent(p.report!, rows)
    expect(per.map((x) => [x.component.id, x.totals.scans])).toEqual([['thick', 1]])
    expect(totalsOf(rows).wallLoss!.scanId).toBe('SCAN 3')
  })
})

describe('coverage', () => {
  it('is the drawing’s own figure, split into AUT and MUT, shown even when the drawing hides it', () => {
    const p = job()
    const c = reportCoverage(p)!
    const counted = countedScans(p, drawnScans(p), false)
    expect(c.componentArea).toBe(240 * 188.5)
    expect(c.autArea).toBeCloseTo(6 * 24 * 48, 8)
    expect(c.autPercent).toBeCloseTo(coveragePercent(p, counted)!, 10)
    expect(c.mutArea).toBe(mutCoverageArea(p))
    expect(c.mutArea).toBeGreaterThan(0)
    expect(c.combinedPercent).toBeCloseTo(coveragePercent(p, counted, mutCoverageArea(p))!, 10)
    expect(c.combinedPercent).toBeCloseTo(c.autPercent + c.mutPercent, 10)
    const hidden = { ...p, settings: { ...p.settings, showCoveragePercentage: false } }
    expect(reportCoverage(hidden)).toEqual(c)
    expect(reportCoverage({ ...p, vessel: { ...p.vessel, length: null } })).toBeNull()
  })
})

describe('manual reading rows', () => {
  it('shows linked MUT rows with the drawing’s values, each head against its own nominal', () => {
    const p = job()
    const rows = readingRows(p, p.report!)
    const m1 = rows.find((r) => r.name === 'M1')!
    expect(m1).toMatchObject({ minT: 0.48, nominal: 0.5, component: { id: 'shell' } })
    expect(m1.wallLoss).toBeCloseTo(4, 10)
    const m3 = rows.find((r) => r.name === 'M3')!
    expect(m3).toMatchObject({ minT: 0.5, nominal: 0.55, component: { id: 'head1' } })
    const m7 = rows.find((r) => r.name === 'M7')!
    expect(m7.nominal).toBe(0.6)
    expect(m7.area).toBeGreaterThan(0)
    expect(rows.find((r) => r.name === 'M4')!.area).toBeCloseTo(26 * 26, 8)
  })

  it('suggests a pipe wall from the thickest reading of all the nozzle’s rows', () => {
    const p = job((r) => ({
      ...r,
      readings: [
        reading({ name: 'N2', location: 'North', nominalMode: 'pipe', pipeSize: '4', minT: 0.25 }),
        reading({ name: 'N2', location: 'South', nominalMode: 'pipe', pipeSize: '4', minT: 0.32 }),
        reading({ name: 'N2', location: 'East', nominalMode: 'pipe', pipeSize: '4', na: 'U-Bolt Obstruction', minT: 0.6 }),
        ...r.readings,
      ],
    }))
    const rows = readingRows(p, p.report!)
    expect(rows[0].pipePick!.wall.wall).toBe(0.337)
    expect(rows[0].nominal).toBe(0.337)
    expect(rows[0].wallLoss).toBeCloseTo((1 - 0.25 / 0.337) * 100, 10)
    expect(rows[0].pipeOverridden).toBe(false)
    expect(rows[2]).toMatchObject({ na: 'U-Bolt Obstruction', minT: null, wallLoss: null, comment: null })
  })

  it('takes a wall chosen by hand (flagged) and a custom nominal', () => {
    const p = job((r) => ({
      ...r,
      readings: [
        reading({ name: 'N2', nominalMode: 'pipe', pipeSize: '4', minT: 0.25, nominal: 0.337 }),
        reading({ name: 'LWN', nominalMode: 'custom', minT: 0.9, nominal: 1.0 }),
        reading({ name: 'X', nominalMode: 'custom', minT: 0.9 }),
      ],
    }))
    const rows = readingRows(p, p.report!)
    expect(rows[0]).toMatchObject({ nominal: 0.337, pipeOverridden: true })
    expect(rows[0].pipePick!.wall.wall).toBe(0.237)
    expect(rows[1].nominal).toBe(1)
    expect(rows[1].wallLoss).toBeCloseTo(10, 10)
    expect(rows[2]).toMatchObject({ nominal: null, wallLoss: null })
  })

  it('totals the rows measured and the minimum with its name', () => {
    const p = job((r) => ({ ...r, readings: [reading({ name: 'N9', minT: 0.2, nominalMode: 'custom', nominal: 0.3 }), reading({ name: 'N8', na: 'Repad' }), ...r.readings] }))
    const t = readingTotals(readingRows(p, p.report!))
    expect(t.readings).toBe(1 + p.shellMut.length + p.headMut.length)
    expect(t.min).toEqual({ value: 0.2, name: 'N9' })
  })
})
