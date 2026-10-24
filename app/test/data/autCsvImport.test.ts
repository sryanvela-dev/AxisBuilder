import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  createEmptyProject,
  importAutCsv,
  openProject,
  parseCsv,
  replaceScans,
  saveProject,
  type AutReportEntry,
} from '../../src/data/index.ts'

// Made-up ScanSheet CSVs. Real exports come from the AUT Solutions scan sheet on a Windows PC.
const brief = (e: AutReportEntry) => `${e.kind} row ${e.row ?? '-'} ${e.column}`

describe('AUT CSV import', () => {
  it('finds columns by header name in any order and normalizes scan names', () => {
    const csv = [
      'Y.Stop,Notes,x_start,File Name,X-Stop,Y Start',
      '24,first,0,scan1,30,0',
      '48,"note, with comma",30,"Scan  2 ",60,24',
    ].join('\r\n')
    const r = importAutCsv(csv)
    expect(r.ok).toBe(true)
    expect(r.scans).toEqual([
      { id: 'SCAN1', xStart: 0, xStop: 30, yStart: 0, yStop: 24, include: true, noWrap: false, acrossSeam: false },
      { id: 'SCAN 2', xStart: 30, xStop: 60, yStart: 24, yStop: 48, include: true, noWrap: false, acrossSeam: false },
    ])
    expect(r.report).toEqual([])
    expect(r.summary).toEqual({ rowsRead: 2, imported: 2, calibrationRowsSkipped: 0 })
  })

  it('accepts "Scan Name" or "File" for the name column, a BOM and LF-only lines', () => {
    const r = importAutCsv('﻿Scan Name,X-Start,X-Stop,Y-Start,Y-Stop\nS1,0,10,0,10\n')
    expect(r.ok).toBe(true)
    expect(r.scans[0].id).toBe('S1')
    expect(importAutCsv('file,xstart,xstop,ystart,ystop\nS1,0,10,0,10').scans).toHaveLength(1)
  })

  it('skips calibration rows and rows without a name, and lists them', () => {
    const csv = [
      'File Name,X-Start,X-Stop,Y-Start,Y-Stop',
      'cal,0,0,0,0',
      'S1,0,10,0,10',
      ' CAL ,1,2,3,4',
      ',5,6,7,8',
      '',
      'S2,10,20,0,10',
    ].join('\r\n')
    const r = importAutCsv(csv)
    expect(r.ok).toBe(true)
    expect(r.scans.map((s) => s.id)).toEqual(['S1', 'S2'])
    expect(r.report.map(brief)).toEqual(['skipped row 2 File Name', 'skipped row 4 File Name', 'skipped row 5 File Name'])
    expect(r.report[0].message).toBe('Calibration row; not imported.')
    expect(r.report[2].message).toBe('No scan name; row not imported.')
    expect(r.summary).toEqual({ rowsRead: 5, imported: 2, calibrationRowsSkipped: 2 })
  })

  it('blocks the import on duplicate scan names, ignoring case and spaces', () => {
    const csv = 'File Name,X-Start,X-Stop,Y-Start,Y-Stop\nS1,0,10,0,10\nS2,0,10,10,20\n s1 ,5,6,7,8\nS2,1,2,3,4'
    const r = importAutCsv(csv)
    expect(r.ok).toBe(false)
    expect(r.scans).toEqual([])
    expect(r.summary.imported).toBe(0)
    expect(r.report.map((e) => [e.row, e.message])).toEqual([
      [4, 'Duplicate scan name S1 (also on row 2).'],
      [5, 'Duplicate scan name S2 (also on row 3).'],
    ])
  })

  it('blocks the import when a required column is missing, naming each one', () => {
    const r = importAutCsv('File Name,X-Start,Y-Start\nS1,0,0')
    expect(r.ok).toBe(false)
    expect(r.report.map((e) => e.message)).toEqual([
      'Required column "X-Stop" not found in the header row.',
      'Required column "Y-Stop" not found in the header row.',
    ])
    expect(importAutCsv('Name,X-Start,X-Stop,Y-Start,Y-Stop\nS1,0,1,0,1').report[0].message).toBe(
      'Required column "File Name" not found in the header row (accepted: File Name, Scan Name or File).',
    )
  })

  it('blocks on short rows and blank or non-numeric coordinates, listing every problem', () => {
    const csv = [
      'File Name,X-Start,X-Stop,Y-Start,Y-Stop',
      'S1,0,10,0',
      'S2,0,abc,0,10',
      'S3,,10,0,10',
      'S4,0,10,0,10',
    ].join('\r\n')
    const r = importAutCsv(csv)
    expect(r.ok).toBe(false)
    expect(r.report.map((e) => `${e.row} ${e.column}: ${e.message}`)).toEqual([
      '2 : The row has 4 column(s); at least 5 are needed for the required columns.',
      '3 X-Stop: Scan S2: X-Stop is not a number.',
      '4 X-Start: Scan S3: X-Start is blank.',
    ])
  })

  it('blocks an empty file or one with only calibration rows', () => {
    expect(importAutCsv('').report[0].message).toBe('The CSV is empty.')
    const r = importAutCsv('File Name,X-Start,X-Stop,Y-Start,Y-Stop\ncal,0,0,0,0')
    expect(r.ok).toBe(false)
    expect(r.report.map(brief)).toEqual(['skipped row 2 File Name', 'blocking row - '])
    expect(r.report[1].message).toBe('No scan rows were found in the CSV.')
  })

  it('keeps a scan with no width or height, with the stop value blank', () => {
    const r = importAutCsv('File Name,X-Start,X-Stop,Y-Start,Y-Stop\nS1,5,5,0,10')
    expect(r.ok).toBe(true)
    expect(r.scans[0]).toMatchObject({ xStart: 5, xStop: null, yStop: 10 })
    expect(r.report).toEqual([
      { row: 2, column: 'X-Stop', value: '5', kind: 'invalid', message: 'Scan S1 has no width (start = stop); X-Stop left blank.' },
    ])
  })

  it('has no 150-scan limit', () => {
    const rows = Array.from({ length: 200 }, (_, i) => `S${i + 1},${i},${i + 1},0,10`)
    const r = importAutCsv(['File Name,X-Start,X-Stop,Y-Start,Y-Stop', ...rows].join('\r\n'))
    expect(r.ok).toBe(true)
    expect(r.scans).toHaveLength(200)
  })

  it('reads Windows-1252 bytes and the sample fixture file', () => {
    const bytes = new Uint8Array([...new TextEncoder().encode('File Name,X-Start,X-Stop,Y-Start,Y-Stop,Note\r\nS1,0,1,0,1,90'), 0xb0])
    expect(importAutCsv(bytes).ok).toBe(true)
    const sample = importAutCsv(readFileSync(new URL('../fixtures/aut/scansheet-sample.csv', import.meta.url)))
    expect(sample.ok).toBe(true)
    expect(sample.scans.map((s) => s.id)).toEqual(['SCAN1', 'SCAN2', 'SCAN3', 'SCAN4', 'SCAN10'])
    expect(sample.summary.calibrationRowsSkipped).toBe(1)
  })

  it('parses quoted fields with line breaks and doubled quotes', () => {
    expect(parseCsv('a,"b ""q"", c"\r\n"multi\nline",d\n')).toEqual([
      { line: 1, fields: ['a', 'b "q", c'] },
      { line: 2, fields: ['multi\nline', 'd'] },
    ])
  })

  it('replaces the scans of a project and clears the image links, like v5.0', () => {
    const project = { ...createEmptyProject(), scans: [{ id: 'OLD', xStart: 0, xStop: 1, yStart: 0, yStop: 1, include: true, noWrap: false, acrossSeam: false }],
      scanImages: [{ scanId: 'OLD', imageFile: 'S1.png', processedImage: '', include: true }] }
    const r = importAutCsv('File Name,X-Start,X-Stop,Y-Start,Y-Stop\nS1,0,10,0,10')
    const updated = replaceScans(project, r.scans)
    expect(updated.scans.map((s) => s.id)).toEqual(['S1'])
    expect(updated.scanImages).toEqual([])
    expect(openProject(saveProject(updated)).ok).toBe(true)
  })
})
