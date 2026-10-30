import { describe, expect, it } from 'vitest'
import { parseClipboardTable } from '../../src/data/paste.ts'
import { createEmptyProject } from '../../src/data/projectFile.ts'
import { projectFileSchema, type Project } from '../../src/data/schema.ts'
import { createReport } from '../../src/report/report.ts'
import { applyScansheet, buildScansheetPaste, guessScansheetMapping, importScansheet, matchScansheetHeader } from '../../src/report/scansheetImport.ts'

const HEADER = "File Name,X-Start,X-Stop,Y-Start,Y-Stop,X-Incr.,Y-Incr.,Readings,Min. 'T',Ave 'T',Nom. 'T',Wall Remain %,Comments"
// Made-up results: a cal row, a reversed scan (S3), one across the seam (S4, circumference 200).
const CSV = [
  HEADER,
  'cal,0,10,0,10,0.1,0.1,10201,0.500,0.500,0.500,100.0,',
  'Scan 1,10.000,30.000,0.000,10.000,0.125,0.050,32361,0.480,0.495,0.500,96.0,',
  'Scan 2,30.000,50.000,0.000,10.000,0.125,0.050,32361,0.450,0.490,0.500,90.0,check',
  'Scan 3,70.000,60.000,0.000,10.000,0.125,0.050,16281,0.470,0.492,0.500,93.6,',
  'Scan 4,190.000,210.000,20.000,30.000,0.125,0.050,32361,0.490,0.498,0.500,98.0,',
].join('\r\n')

function vessel(): Project {
  const p = createEmptyProject()
  return { ...p, vessel: { ...p.vessel, length: 120, height: 200 } }
}

describe('scansheet.csv: a job with no scans', () => {
  it('creates the scans with the drawing’s rules and reads the results', () => {
    const imp = importScansheet(CSV, vessel())
    expect(imp.ok).toBe(true)
    expect(imp.mode).toBe('create')
    expect(imp.scans.map((s) => [s.id, s.xStart, s.xStop])).toEqual([
      ['SCAN 1', 10, 30], ['SCAN 2', 30, 50], ['SCAN 3', 70, 60], ['SCAN 4', 190, 210],
    ])
    expect(imp.report.find((e) => e.kind === 'skipped')).toMatchObject({ row: 2, message: 'Calibration row; not imported.' })
    expect(imp.report.find((e) => e.kind === 'wrapped')).toMatchObject({ row: 6 })
    expect(imp.rows.map((r) => r.scanId)).toEqual(['SCAN 1', 'SCAN 2', 'SCAN 3', 'SCAN 4'])
    expect(imp.rows[1]).toMatchObject({ comment: 'check', values: { minT: 0.45, avgT: 0.49, nomT: 0.5, readings: 32361, incrX: 0.125, incrY: 0.05, wallRemain: 90 } })
    expect(imp.report.filter((e) => e.kind === 'calculated')).toEqual([])
  })

  it('lists a Wall Remain % that differs from the recalculated one by more than 0.1%', () => {
    const imp = importScansheet(CSV, vessel())
    const m = imp.report.filter((e) => e.kind === 'mismatch')
    // Scan 1: 0.48 / 0.5 = 96.0 (same); Scan 3: 94.0 vs 93.6 (listed); Scan 4: 98.0 (same).
    expect(m.map((e) => e.row)).toEqual([5])
    expect(m[0].message).toBe('Scan SCAN 3: Wall Remain 93.6% in the file; 0.47 on 0.5 is 94.00%. The report uses the recalculated value.')
  })

  it('applies: scans in the drawing, results in a new report, shell nominal from the file', () => {
    const p = vessel()
    const imp = importScansheet(CSV, p)
    expect(imp.report.find((e) => e.kind === 'note' && e.column === "Nom. 'T'")!.message).toBe("The shell's nominal is blank; it is set to 0.5 from the file.")
    const q = applyScansheet(p, imp)
    expect(q.scans).toHaveLength(4)
    expect(q.report!.components[0].nominal).toBe(0.5)
    expect(q.report!.scanResults.map((r) => [r.scanId, r.minT, r.readings, r.csvWallRemain])).toEqual([
      ['SCAN 1', 0.48, 32361, 96], ['SCAN 2', 0.45, 32361, 90], ['SCAN 3', 0.47, 16281, 93.6], ['SCAN 4', 0.49, 32361, 98],
    ])
    expect(q.report!.scanResults[1].csvComment).toBe('check')
    expect(() => projectFileSchema.parse(q)).not.toThrow()
  })

  it('reads the readings of a scan across the seam the short way round', () => {
    const imp = importScansheet(CSV, vessel())
    expect(imp.report.some((e) => e.kind === 'mismatch' && e.column === 'Readings')).toBe(false)
  })

  it('stops on a missing position column or a duplicate name', () => {
    const noY = importScansheet('File Name,X-Start,X-Stop,Min. \'T\'\nScan 1,0,10,0.5', vessel())
    expect(noY.ok).toBe(false)
    expect(noY.report.at(-1)!.message).toContain('missing: Y-Start, Y-Stop')
    const dup = importScansheet([HEADER, 'Scan 1,0,10,0,10,,,,,,,,', 'scan 1,0,10,0,10,,,,,,,,'].join('\n'), vessel())
    expect(dup.ok).toBe(false)
    expect(dup.report.some((e) => e.kind === 'blocking' && e.message.startsWith('Duplicate scan name'))).toBe(true)
  })
})

describe('scansheet.csv: a job that has scans', () => {
  function drawn(): Project {
    const p = vessel()
    const scans = [
      { id: 'S1', xStart: 10, xStop: 30, yStart: 0, yStop: 10, include: true, noWrap: false, acrossSeam: false },
      { id: 'S2', xStart: 30, xStop: 52, yStart: 0, yStop: 10, include: true, noWrap: false, acrossSeam: false },
      { id: 'S9', xStart: 0, xStop: 5, yStart: 50, yStop: 60, include: true, noWrap: false, acrossSeam: false },
    ]
    const q = { ...p, scans }
    return { ...q, report: createReport(q) }
  }

  it('matches by scan number and lists differing positions and unmatched rows', () => {
    const imp = importScansheet(CSV, drawn())
    expect(imp.mode).toBe('match')
    expect(imp.rows.map((r) => r.scanId)).toEqual(['S1', 'S2', null, null])
    expect(imp.positionDiffs).toEqual([{ scanId: 'S2', csv: { xStart: 30, xStop: 50, yStart: 0, yStop: 10 }, drawing: { xStart: 30, xStop: 52, yStart: 0, yStop: 10 } }])
    const unmatched = imp.report.filter((e) => e.kind === 'unmatched').map((e) => e.message)
    expect(unmatched).toEqual([
      'Scan SCAN 3: no drawing scan has its number; its results are not imported.',
      'Scan SCAN 4: no drawing scan has its number; its results are not imported.',
      'No results in the file for S9.',
    ])
  })

  it('keeps the drawing positions unless the file’s are chosen', () => {
    const p = drawn()
    const imp = importScansheet(CSV, p)
    expect(applyScansheet(p, imp).scans[1].xStop).toBe(52)
    expect(applyScansheet(p, imp, { useFilePositions: new Set(['S2']) }).scans[1].xStop).toBe(50)
  })

  it('keeps the picks and overrides of a scan through a re-import', () => {
    const p = drawn()
    const first = applyScansheet(p, importScansheet(CSV, p))
    const edited = {
      ...first,
      report: { ...first.report!, scanResults: first.report!.scanResults.map((r) => (r.scanId === 'S1' ? { ...r, form: 'pitting', commentOverride: 'Look again.', dataImage: 'Scan 1.png', location: 'Bottom' } : r)) },
    }
    const again = applyScansheet(edited, importScansheet(CSV.replace('0.480,0.495', '0.470,0.495'), edited))
    expect(again.report!.scanResults[0]).toMatchObject({ scanId: 'S1', minT: 0.47, form: 'pitting', commentOverride: 'Look again.', dataImage: 'Scan 1.png', location: 'Bottom' })
  })
})

describe('pasting a scan sheet from Excel', () => {
  it('guesses columns by header, else in the CSV order', () => {
    expect(matchScansheetHeader("Min. 'T'")).toBe('minT')
    expect(matchScansheetHeader('Wall Remain %')).toBe('wallRemain')
    expect(matchScansheetHeader('Scan')).toBe('name')
    const byHeader = guessScansheetMapping([['Scan', 'X Start', 'X Stop', 'Y Start', 'Y Stop', 'Min T'], ['1', '0', '10', '0', '10', '0.5']])
    expect(byHeader).toEqual({ hasHeader: true, columns: ['name', 'xStart', 'xStop', 'yStart', 'yStop', 'minT'] })
    expect(guessScansheetMapping([['Scan 1', '0', '10']])).toEqual({ hasHeader: false, columns: ['name', 'xStart', 'xStop'] })
  })

  it('creates the scans, works out readings and increments (marked calculated), leaves Min / Avg blank and lists them', () => {
    const p = vessel()
    const job = { ...p, report: { ...createReport(p), calibration: { ...createReport(p).calibration, increments: { x: 0.125, y: 0.05 } } } }
    const rows = parseClipboardTable('Scan\tX-Start\tX-Stop\tY-Start\tY-Stop\tMin T\r\nScan 1\t10\t30\t0\t10\t0.48\r\nScan 2\t30\t50\t0\t10\t\r\n')
    const imp = buildScansheetPaste(job, rows, guessScansheetMapping(rows))
    expect(imp.ok).toBe(true)
    expect(imp.rows[0]).toMatchObject({ values: { incrX: 0.125, incrY: 0.05, readings: 32361, minT: 0.48 }, calculated: ['incrX', 'incrY', 'readings'] })
    const missing = imp.report.filter((e) => e.kind === 'missing').map((e) => e.message)
    expect(missing).toEqual([
      "Scan SCAN 1: Ave 'T' is blank; type it in or paste it later.",
      "Scan SCAN 2: Min. 'T' is blank; type it in or paste it later.",
      "Scan SCAN 2: Ave 'T' is blank; type it in or paste it later.",
    ])
    const q = applyScansheet(job, imp)
    expect(q.report!.scanResults[1]).toMatchObject({ scanId: 'SCAN 2', minT: null, avgT: null, readings: 32361, calculated: ['incrX', 'incrY', 'readings'] })
  })

  it('fills in a second paste by scan number, keeping what the first gave', () => {
    const p = vessel()
    const base = { ...p, report: { ...createReport(p), calibration: { ...createReport(p).calibration, increments: { x: 0.125, y: 0.05 } } } }
    const first = parseClipboardTable('Scan\tX-Start\tX-Stop\tY-Start\tY-Stop\tMin T\nScan 1\t10\t30\t0\t10\t0.48\n')
    const one = applyScansheet(base, buildScansheetPaste(base, first, guessScansheetMapping(first)))
    const second = parseClipboardTable('S1\t0.495\n')
    const imp = buildScansheetPaste(one, second, { hasHeader: false, columns: ['name', 'avgT'] })
    expect(imp.mode).toBe('match')
    expect(imp.positionDiffs).toEqual([])
    const two = applyScansheet(one, imp)
    expect(two.report!.scanResults[0]).toMatchObject({ scanId: 'SCAN 1', minT: 0.48, avgT: 0.495, readings: 32361 })
  })

  it('needs positions to create scans, and a scan name column', () => {
    const rows = [['Scan 1', '0.48']]
    expect(buildScansheetPaste(vessel(), rows, { hasHeader: false, columns: ['name', 'minT'] }).report.at(-1)!.message)
      .toContain('needs X-Start, X-Stop, Y-Start and Y-Stop')
    expect(buildScansheetPaste(vessel(), rows, { hasHeader: false, columns: [null, 'minT'] }).ok).toBe(false)
  })

  it('lists a value that is not a number and leaves it blank', () => {
    const p = vessel()
    const rows = [['Scan 1', '0', '10', '0', '10', 'abc']]
    const imp = buildScansheetPaste(p, rows, { hasHeader: false, columns: ['name', 'xStart', 'xStop', 'yStart', 'yStop', 'minT'] })
    expect(imp.ok).toBe(true)
    expect(imp.report.find((e) => e.kind === 'invalid')!.message).toBe("Scan SCAN 1: Min. 'T' is not a number; left blank.")
  })
})
