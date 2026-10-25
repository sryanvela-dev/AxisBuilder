import { readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import {
  XlsmImportError,
  importWorkbook,
  openProject,
  saveProject,
  type ImportResult,
  type ReportEntry,
} from '../../src/data/index.ts'

// Made-up workbooks built by scripts/build-test-workbooks.ts (npm run fixtures:xlsm).
function load(file: string): ImportResult {
  return importWorkbook(readFileSync(new URL(`../fixtures/xlsm/${file}`, import.meta.url)))
}

const current = load('v5-current.xlsx')
const older = load('v5-pre40.xlsx')

const brief = (e: ReportEntry) => `${e.kind} ${e.sheet}!${e.cell}`

describe('current layout (40 nozzle rows)', () => {
  const p = current.project

  it('finds every section and counts the rows', () => {
    expect(current.summary.layout).toBe('current')
    expect(current.summary.counts).toEqual({
      circWelds: 3, longSeams: 2, shellNozzles: 5, objects: 2, shellMut: 3,
      headNozzles: 4, headMut: 3, scans: 4, scanImages: 2,
    })
    expect(current.summary.fieldsFound).toBe(current.summary.fieldsTotal)
  })

  it('reads project info, vessel and settings by label', () => {
    expect(p.project).toMatchObject({
      projectName: 'TEST-V-101', component: 'TEST-V-101', client: 'Example Energy Co',
      date: '2026-03-14', revision: '1', equipmentType: 'Vessel', material: '',
      inspectionNotes: 'Nozzle N4 REVIEW: partly illegible',
    })
    expect(p.vessel).toMatchObject({
      orientation: 'Horizontal CW', length: null, height: 188.5, xAxisCardinal: 'North', yAxisCardinal: 'East',
      xAxisDirectionText: 'CW LOOKING NORTH', referenceLabelMode: 'Custom Cardinal', referenceLabelSet: 'TDC/BDC',
      refLabel0: 'T.D.C.', refLabel90: '', refLabel180: 'B.D.C.', refLabel270: '', refLabel360: 'T.D.C.',
    })
    expect(p.settings).toMatchObject({
      rulerSpacing: 20, showRulers: true, autHatchTransparency: 50, showScanBordersOnOverlay: true,
      headViewMode: 'BOTH', headViewSize: 'MEDIUM', head1Label: 'NORTH HEAD', showTitleBlock: false,
      cadPlatform: 'AutoCAD', originalImageFolder: 'C:\\Fictional\\Jobs\\Scans',
    })
  })

  it('reads welds, nozzles, objects and MUT with v5.0 include rules', () => {
    expect(p.circWelds).toEqual([
      { id: 'CW1', y: 60, include: true, showLabel: true },
      { id: 'CW2', y: 120, include: true, showLabel: false }, // blank Include = included, blank Label = no label
      { id: 'CW3', y: null, include: true, showLabel: true },
    ])
    expect(p.longSeams[0]).toEqual({ id: 'LS1', x: 30, startY: null, stopY: 60, include: true, showLabel: true })
    expect(p.longSeams[1]).toMatchObject({ id: 'LS2', x: null, include: true, showLabel: true }) // "Y" and "TRUE"
    expect(p.shellNozzles.map((n) => n.id)).toEqual(['N1', 'N2', 'N3', 'N4', 'N5'])
    expect(p.shellNozzles[0]).toMatchObject({ diameter: 12.75, x: 94, y: 120, minT: 'TOL', include: true })
    expect(p.shellNozzles[2]).toMatchObject({ include: false, labelMode: 'OUTSIDE', minT: 0.25 })
    expect(p.shellNozzles[3]).toMatchObject({ diameter: null, labelMode: 'AUTO' })
    expect(p.shellNozzles[4].y).toBe(80) // highlighted but valid: kept
    expect(p.objects[0]).toEqual({ id: 'SADDLE 1', x: 140, y: 30, circWidth: 40, length: 12, include: true, notes: 'Support', noWrap: false })
    expect(p.objects[1].include).toBe(true) // "MAYBE" read as blank
    expect(p.shellMut.map((m) => [m.id, m.minT])).toEqual([['M1', 0.512], ['M2', null], ['M3', null]])
  })

  it('reads head nozzles and head MUT, converting clocks and radius factors', () => {
    expect(p.headNozzles).toEqual([
      { head: 'HEAD 1', id: 'N10', diameter: 4.5, clock: '3:30', radiusPosition: 'HALF', customRadiusPercent: null,
        minT: 0.3, notes: '', labelMode: 'AUTO', include: true },
      { head: 'HEAD 2', id: 'N11', diameter: 2, clock: '3', radiusPosition: 'CUSTOM', customRadiusPercent: 60,
        minT: 'TOL', notes: '', labelMode: 'AUTO', include: true },
      { head: 'HEAD 1', id: 'n3', diameter: 2, clock: '12', radiusPosition: 'CENTER', customRadiusPercent: null,
        minT: null, notes: '', labelMode: 'AUTO', include: true },
      { head: 'HEAD 1', id: 'N12', diameter: 3, clock: null, radiusPosition: 'CENTER', customRadiusPercent: null,
        minT: null, notes: '', labelMode: 'AUTO', include: true },
    ])
    expect(p.headMut.map((m) => [m.head, m.id, m.clock, m.radiusPosition, m.customRadiusPercent, m.include])).toEqual([
      ['HEAD 1', 'HM1', '6', 'OUTER', null, true],
      ['HEAD 2', 'M1 (2)', '10.5', null, null, true], // "SIDE": left for the user to select
      ['HEAD 2', 'HM2', null, 'CUSTOM', null, false],
    ])
  })

  it('reads scan inputs only and links scan images', () => {
    expect(p.scans).toEqual([
      { id: 'SCAN1', xStart: 0, xStop: 30, yStart: 0, yStop: 24, include: true, noWrap: false, acrossSeam: false },
      { id: 'SCAN2', xStart: 60, xStop: 30, yStart: 24, yStop: 48, include: false, noWrap: false, acrossSeam: false },
      { id: 'SCAN3', xStart: 10, xStop: null, yStart: 0, yStop: 5, include: true, noWrap: false, acrossSeam: false },
      { id: 'scan1 (2)', xStart: 90, xStop: 120, yStart: 0, yStop: 24, include: true, noWrap: false, acrossSeam: false },
    ])
    expect(p.scanImages).toEqual([
      { scanId: 'SCAN1', imageFile: 'S1.png', processedImage: '', include: true },
      { scanId: 'SCAN2', imageFile: '', processedImage: '', include: false },
    ])
  })

  it('lists every skipped, changed, invalid and flagged value', () => {
    expect(current.report.map(brief).sort()).toEqual(
      [
        'invalid Drawing Information!B22', // Material "Unobtainium"
        'review Drawing Information!B24', // REVIEW inside notes, kept
        'review Project Settings!B10', // vessel length REVIEW
        'invalid Project Settings!B44', // transparency 95
        'invalid Project Settings!B89', // "Maybe"
        'skipped Project Settings!B39', // Text Scale Factor (dropped)
        'skipped Project Settings!B86', // Show Rulers On Overlay (dropped)
        'skipped Project Settings!B90', // Overlay Scale Method (dropped)
        'skipped Project Settings!B93', // unknown row
        'review Shell Features!B5',
        'invalid Shell Features!B16',
        'skipped Shell Features!row 30', // data but no ID
        'review Shell Features!B31',
        'invalid Shell Features!H31',
        'review Shell Features!D32', // highlighted, valid, kept
        'invalid Shell Features!F70',
        'invalid Shell Features!D93', // TOL is not allowed for shell MUT
        'review Head Features!D5', // degrees converted
        'review Head Features!D7',
        'invalid Head Features!A8', // HEAD 3
        'invalid Head Features!D29',
        'changed Head Features!B29', // M1 renamed (also used by shell M1)
        'invalid Head Features!C30',
        'invalid Head Features!E30',
        'invalid Scan Import!C5', // zero width
        'changed Scan Import!A6', // scan1 renamed (also used by SCAN1)
        'skipped Scan Images!A5', // no such scan
        'skipped Scan Images!F5', // notes
      ].sort(),
    )
  })

  it('explains each entry in plain language with the value found', () => {
    const find = (sheet: string, cell: string) => current.report.find((e) => e.sheet === sheet && e.cell === cell)!
    expect(find('Project Settings', 'B10')).toEqual({
      sheet: 'Project Settings', cell: 'B10', value: 'REVIEW: smudged', kind: 'review',
      message: 'OCR could not read this value; left blank.',
    })
    expect(find('Head Features', 'D5').message).toBe('Degrees converted to clock position 3; please check it.')
    // A repeated nozzle name is kept as written (Review warns about it).
    expect(current.report.find((e) => e.sheet === 'Head Features' && e.cell === 'B6')).toBeUndefined()
    expect(find('Shell Features', 'D32').message).toMatch(/highlighted yellow.*value kept/)
  })

  it('renames repeated names, so none are left to block export; repeated nozzle names stay as written', () => {
    expect(current.summary.duplicateIds).toEqual([])
    expect(current.project.headNozzles.map((n) => n.id)).toContain('n3')
    expect(current.report.filter((e) => /renamed to/.test(e.message)).map((e) => e.message)).toEqual([
      'Head MUT: "M1" is also used by Shell MUT, row 91; renamed to "M1 (2)" (names must be unique).',
      'AUT scans: "scan1" is also used by row 3; renamed to "scan1 (2)" (names must be unique).',
    ])
  })

  it('lists what must be filled in before export', () => {
    expect(current.summary.missingData).toEqual([
      'Vessel: Shell length (Y) is not entered yet.',
      'Circ welds, item 3 (CW3): Y position is not entered yet.',
      'Long seams, item 2 (LS2): X position is not entered yet.',
      'Shell nozzles, item 4 (N4): Diameter is not entered yet.',
      'Head nozzles, item 4 (N12): Clock position is not entered yet.',
      'Head MUT, item 2 (M1 (2)): Radius position is not selected yet.',
      'AUT scans, item 3 (SCAN3): X stop is not entered yet.',
    ])
  })
})

describe('older layout (20 nozzle rows, older labels)', () => {
  const p = older.project

  it('finds the sections at their older rows', () => {
    expect(older.summary.layout).toBe('older (20 nozzles)')
    expect(older.summary.counts).toEqual({
      circWelds: 2, longSeams: 1, shellNozzles: 3, objects: 1, shellMut: 2,
      headNozzles: 2, headMut: 1, scans: 2, scanImages: 2,
    })
    expect(p.objects[0].id).toBe('SADDLE 1')
    expect(p.shellMut.map((m) => m.id)).toEqual(['M1', 'M2'])
    expect(older.summary.missingData).toEqual([])
    expect(older.summary.duplicateIds).toEqual([])
  })

  it('reads the older setting labels', () => {
    expect(p.settings).toMatchObject({
      showRulers: true, showHeadClockReferences: true, autHatchScale: 2.5, rulerSpacing: 10,
      originalImageFolder: 'C:\\Fictional\\Jobs\\Scans', autHatchTransparency: 50,
    })
    expect(p.vessel).toMatchObject({
      orientation: 'Horizontal CW', length: 300, height: 251.3, xAxisDirectionText: 'CW LOOKING NORTH',
      referenceLabelSet: 'NDC/SDC', refLabel0: 'NDC', refLabel180: 'SDC', refLabel360: 'NDC',
    })
    expect(p.project.date).toBe('2026-03-14')
  })

  it('converts Excel time numbers in head clock cells', () => {
    expect(p.headNozzles.map((n) => [n.head, n.id, n.clock, n.radiusPosition])).toEqual([
      ['HEAD 1', 'N10', '3:30', 'HALF'],
      ['HEAD 2', 'N11', '9', 'THREE_QUARTER'],
    ])
    expect(p.headMut[0]).toMatchObject({ head: 'HEAD 2', id: 'HM1', clock: '12', minT: 0.4 })
  })

  it('reports only the conversions and the missing row', () => {
    expect(older.report.map(brief).sort()).toEqual(
      [
        'changed Drawing Information!B9', // text date
        'changed Project Settings!B9', // "Clockwise Horizontal"
        'changed Project Settings!B30', // "NDC / SDC"
        'notFound Project Settings!column A', // no AUT Hatch Transparency row
        'skipped Project Settings!B39',
        'skipped Project Settings!B86',
        'skipped Project Settings!B90',
        'changed Head Features!D4', // time number 3:30
        'changed Head Features!C28', // time number 12:00
      ].sort(),
    )
  })
})

describe('imported projects', () => {
  it('pass the schema and save/open cleanly', () => {
    for (const { project } of [current, older]) {
      const json = saveProject(project)
      const opened = openProject(json)
      expect(opened.ok).toBe(true)
      if (opened.ok) expect(opened.project).toEqual(project)
    }
  })
})

describe('files that are not v5.0 workbooks', () => {
  it('rejects unreadable bytes', () => {
    expect(() => importWorkbook(new Uint8Array([1, 2, 3, 4]))).toThrow(XlsmImportError)
  })

  it('rejects a workbook without Project Settings', () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['hello']]), 'Sheet1')
    const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    expect(() => importWorkbook(bytes)).toThrow('This is not an AxisBuilder v5.0 workbook (no "Project Settings" sheet).')
  })
})

describe('older column orders (v4.7)', () => {
  // Made-up v4.7-style workbook: shell nozzles Name, X, Y, Diameter; head nozzles with Clock in C,
  // Diameter in F and no Min. T. column.
  function v47Workbook(): ArrayBuffer {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Setting', 'Value'], ['Project Name', 'TEST-47']]), 'Project Settings')
    const shell: (string | number | null)[][] = []
    shell[24] = ['Nozzles / Circles']
    shell[25] = ['Nozzle Name', 'X', 'Y', 'Diameter', 'Min. T.', 'Notes', 'Include', 'Label Mode']
    shell[26] = ['N1', 100, 20, 6, 0.5, null, 'YES', 'AUTO']
    shell[46] = ['Objects']
    shell[47] = ['Object ID', 'X Position', 'Y Position', 'Circ. Width', 'Length', 'Include', 'Notes']
    shell[68] = ['Shell MUT']
    shell[69] = ['MUT ID', 'X Position', 'Y Position', 'Min. T.', 'Notes']
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(shell), 'Shell Features')
    const head: (string | number | null)[][] = []
    head[0] = ['Head Nozzles']
    head[2] = ['Head', 'Nozzle', 'Clock Position', 'Radius Position', 'Custom Radius Factor', 'Nozzle Diameter',
      'Label Mode', 'Include Label', 'Notes']
    head[3] = ['HEAD 1', 'N11', '3:30', 'THREE_QUARTER', null, 12, 'AUTO', 'NO', null]
    head[24] = ['Head MUT']
    head[26] = ['Head', 'MUT ID', 'Clock Position', 'Radius Position', 'Custom Radius Factor', 'Min. T.', 'Label Mode',
      'Include Label', 'Notes']
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(head), 'Head Features')
    return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  }
  const r = importWorkbook(v47Workbook())

  it('finds columns by their header text', () => {
    expect(r.project.shellNozzles[0]).toMatchObject({ id: 'N1', x: 100, y: 20, diameter: 6, minT: 0.5 })
    expect(r.project.headNozzles[0]).toMatchObject({
      head: 'HEAD 1', id: 'N11', clock: '3:30', radiusPosition: 'THREE_QUARTER', diameter: 12, include: false, minT: null,
    })
    expect(r.summary.reorderedSections).toEqual(['shellNozzles', 'headNozzles'])
  })

  it('lists a column the layout does not have', () => {
    expect(r.report.find((e) => e.sheet === 'Head Features' && e.kind === 'notFound')?.message).toBe(
      'Head nozzles: no "Min. T." column in this layout; left blank.',
    )
  })

  it('returns the source row and column of each value', () => {
    expect(r.sources.rows.headNozzles[0]).toEqual({
      row: 4,
      cols: { head: 'A', id: 'B', diameter: 'F', clock: 'C', radiusPosition: 'D', customRadiusPercent: 'E', minT: null,
        notes: 'I', labelMode: 'G', include: 'H' },
    })
    expect(r.sources.fields.project.projectName).toEqual({ sheet: 'Project Settings', row: 2 })
  })
})
