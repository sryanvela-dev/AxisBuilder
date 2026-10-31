// Every report change the screens make (report/edits.ts): one pure function each, one undo step in the app.
import { describe, expect, it } from 'vitest'
import type { Project } from '../../src/data/schema.ts'
import { npsForDiameter } from '../../src/report/calc/pipeWalls.ts'
import { readingRows } from '../../src/report/calc/results.ts'
import {
  addComponent,
  addListItem,
  addNozzleReadings,
  addReportReading,
  addReportReadings,
  componentUses,
  getReportValue,
  moveListItem,
  moveReading,
  removeComponent,
  removeListItem,
  removeReading,
  sectionOn,
  sectionTitle,
  setCoverExtra,
  setDataImages,
  setPicksForAll,
  setReading,
  setReadingMinT,
  setReportValue,
  setScanResult,
  setSectionOn,
  setSectionTitle,
  startReport,
  switchTemplate,
  updateComponent,
} from '../../src/report/edits.ts'
import { syncReport } from '../../src/report/sync.ts'
import { GENERIC_AUT } from '../../src/report/templates/generic.ts'
import { olderSample } from '../fixtures/olderSample.ts'

const started = (): Project => startReport(olderSample())
const def = (id: string) => GENERIC_AUT.sections.find((s) => s.id === id)!

describe('starting and the template', () => {
  it('starts a report once; a job that has one keeps it', () => {
    const p = olderSample()
    expect(p.report).toBeNull()
    const q = startReport(p)
    expect(q.report!.components.map((c) => c.id)).toEqual(['shell', 'head1', 'head2'])
    expect(q.report!.readings.length).toBe(q.shellMut.length + q.headMut.length)
    expect(startReport(q)).toBe(q)
  })

  it('switching to the same template changes nothing; data is kept', () => {
    const p = setReportValue(started(), ['job', 'jobNumber'], '24-001')
    expect(switchTemplate(p, 'generic-aut')).toBe(p)
    expect(() => switchTemplate(p, 'nope')).toThrow()
  })
})

describe('values by path and lists', () => {
  it('sets a value, and the same value records nothing', () => {
    const p = setReportValue(started(), ['calibration', 'system', 'maker'], 'AUT Solutions')
    expect(p.report!.calibration.system.maker).toBe('AUT Solutions')
    expect(getReportValue(p.report!, ['calibration', 'system', 'maker'])).toBe('AUT Solutions')
    expect(setReportValue(p, ['calibration', 'system', 'maker'], 'AUT Solutions')).toBe(p)
    // A job without a report is left alone.
    const none = olderSample()
    expect(setReportValue(none, ['job', 'jobNumber'], 'x')).toBe(none)
  })

  it('adds, removes and moves list items (examiners, transducers)', () => {
    let p = addListItem(started(), ['job', 'techs'], { name: 'A', title: 'Level II' })
    p = addListItem(p, ['job', 'techs'], { name: 'B', title: 'Level III' })
    p = moveListItem(p, ['job', 'techs'], 1, -1)
    expect(p.report!.job.techs.map((t) => t.name)).toEqual(['B', 'A'])
    expect(moveListItem(p, ['job', 'techs'], 0, -1)).toBe(p)
    p = setReportValue(p, ['job', 'techs', 1, 'title'], 'Level I')
    expect(p.report!.job.techs[1]).toEqual({ name: 'A', title: 'Level I' })
    p = removeListItem(p, ['job', 'techs'], 0)
    expect(p.report!.job.techs.map((t) => t.name)).toEqual(['A'])
    expect(removeListItem(p, ['job', 'techs'], 5)).toBe(p)
  })
})

describe('components', () => {
  it('adds a boot, courses and others with free ids and names', () => {
    let p = addComponent(started(), 'course')
    p = addComponent(p, 'course')
    p = addComponent(p, 'boot')
    p = addComponent(p, 'other')
    const added = p.report!.components.slice(3)
    expect(added.map((c) => [c.id, c.name, c.kind])).toEqual([
      ['c1', 'Shell course 1', 'course'], ['c2', 'Shell course 2', 'course'], ['c3', 'Boot', 'boot'], ['c4', 'Other', 'other'],
    ])
    expect(added[0].nominal).toBeNull()
  })

  it('changes a component, and removing one clears the picks of scans and readings', () => {
    let p = addComponent(started(), 'boot')
    p = updateComponent(p, 'c1', { nominal: 0.375, yRange: [0, 96] })
    expect(p.report!.components[3]).toMatchObject({ nominal: 0.375, yRange: [0, 96] })
    expect(updateComponent(p, 'c1', { nominal: 0.375 })).toBe(p)
    p = setScanResult(p, 'SCAN 1', { componentId: 'c1' })
    p = setReading(p, 0, { componentId: 'c1' })
    expect(componentUses(p, 'c1')).toEqual({ scans: 1, readings: 1 })
    p = removeComponent(p, 'c1')
    expect(p.report!.components.map((c) => c.id)).toEqual(['shell', 'head1', 'head2'])
    expect(p.report!.scanResults[0].componentId).toBeNull()
    expect(p.report!.readings[0].componentId).toBeNull()
    expect(removeComponent(p, 'c1')).toBe(p)
  })
})

describe('sections and the cover', () => {
  it('optional sections switch on and off; others stay on', () => {
    let p = started()
    expect(sectionOn(p.report!, def('photos'))).toBe(true)
    // Manual UT is on when there are readings (the sample has MUT rows).
    expect(sectionOn(p.report!, def('manual-ut'))).toBe(true)
    expect(sectionOn(p.report!, def('custom'))).toBe(false)
    p = setSectionOn(p, 'photos', false)
    expect(sectionOn(p.report!, def('photos'))).toBe(false)
    expect(setSectionOn(p, 'scan-sheet', false)).toBe(p)
    expect(sectionOn(p.report!, def('scan-sheet'))).toBe(true)
  })

  it('renames a section; blank or the template title goes back to the template', () => {
    let p = setSectionTitle(started(), 'photos', ' Overview Photos ')
    expect(sectionTitle(p.report!, def('photos'))).toBe('Overview Photos')
    expect(p.report!.sections.photos).toEqual({ on: true, title: 'Overview Photos' })
    p = setSectionTitle(p, 'photos', '')
    expect(sectionTitle(p.report!, def('photos'))).toBe('Photos')
    expect(p.report!.sections.photos.title).toBeUndefined()
    expect(setSectionTitle(p, 'photos', 'Photos')).toBe(p)
  })

  it('turns optional cover fields on and off', () => {
    let p = setCoverExtra(started(), 'project.unit', true)
    expect(p.report!.job.coverExtras).toEqual(['project.unit'])
    expect(setCoverExtra(p, 'project.unit', true)).toBe(p)
    p = setCoverExtra(p, 'project.unit', false)
    expect(p.report!.job.coverExtras).toEqual([])
  })
})

describe('scan results', () => {
  it('makes a result when the scan has none, keeps scan order, and ignores unknown scans', () => {
    let p = setScanResult(started(), 'SCAN 3', { minT: 0.48 })
    p = setScanResult(p, 'scan 1', { location: 'Bottom' })
    expect(p.report!.scanResults.map((r) => r.scanId)).toEqual(['SCAN 1', 'SCAN 3'])
    expect(p.report!.scanResults[1].minT).toBe(0.48)
    expect(setScanResult(p, 'SCAN 99', { minT: 1 })).toBe(p)
    expect(setScanResult(p, 'SCAN 3', { minT: 0.48 })).toBe(p)
  })

  it('a value typed over a calculated one is no longer marked calculated', () => {
    let p = setScanResult(started(), 'SCAN 1', { readings: 100, calculated: ['readings', 'incrX'] })
    p = setScanResult(p, 'SCAN 1', { readings: 120 })
    expect(p.report!.scanResults[0].calculated).toEqual(['incrX'])
  })

  it('sets data images for many scans at once', () => {
    const p = setDataImages(started(), new Map([['SCAN 2', 'Scan 2.png'], ['SCAN 1', 'Scan 1.png']]))
    expect(p.report!.scanResults.map((r) => [r.scanId, r.dataImage])).toEqual([['SCAN 1', 'Scan 1.png'], ['SCAN 2', 'Scan 2.png']])
  })
})

describe('form and cause for all', () => {
  it('sets every scan (results made where missing) and every reading; each can still be changed after', () => {
    let p = addReportReading(started(), { name: 'N1' })
    p = setScanResult(p, 'SCAN 2', { form: 'pitting', cause: 'erosion' })
    p = setPicksForAll(p, { form: 'localized', cause: 'corrosion' })
    expect(p.report!.scanResults).toHaveLength(p.scans.length)
    expect(p.report!.scanResults.every((r) => r.form === 'localized' && r.cause === 'corrosion')).toBe(true)
    expect(p.report!.readings.every((r) => r.form === 'localized' && r.cause === 'corrosion')).toBe(true)
    // Only the cause: forms stay as they are.
    p = setScanResult(p, 'SCAN 1', { form: 'general' })
    p = setPicksForAll(p, { cause: '' })
    expect(p.report!.scanResults[0]).toMatchObject({ form: 'general', cause: '' })
    expect(setPicksForAll(p, {})).toBe(p)
    expect(setPicksForAll(p, { cause: '' })).toBe(p)
  })
})

describe('readings', () => {
  it('Add reading puts a row at the bottom; pasted rows go before the MUT rows; only report rows can be removed', () => {
    let p = started()
    const linked = p.report!.readings.length
    p = addReportReading(p, { name: 'Nozzle 3', location: 'North' })
    expect(p.report!.readings.at(-1)!.name).toBe('Nozzle 3')
    p = addReportReadings(p, [{ name: 'Boot 1' }, { name: 'Boot 2' }])
    expect(p.report!.readings.slice(0, 2).map((r) => r.name)).toEqual(['Boot 1', 'Boot 2'])
    expect(p.report!.readings).toHaveLength(linked + 3)
    expect(removeReading(p, 2)).toBe(p)
    p = removeReading(p, 1)
    expect(p.report!.readings[0].name).toBe('Boot 1')
    expect(p.report!.readings.at(-1)!.name).toBe('Nozzle 3')
    expect(addReportReadings(p, [])).toBe(p)
  })

  it('moves rows up and down', () => {
    let p = addReportReadings(started(), [{ name: 'A' }, { name: 'B' }])
    p = moveReading(p, 1, -1)
    expect(p.report!.readings.slice(0, 2).map((r) => r.name)).toEqual(['B', 'A'])
  })

  it('a linked Min T is the drawing MUT row’s: written there, read back in the reading rows', () => {
    let p = started()
    const i = p.report!.readings.findIndex((r) => r.link?.list === 'shellMut')
    const id = p.report!.readings[i].link!.id
    p = setReadingMinT(p, i, 0.444)
    expect(p.shellMut.find((m) => m.id === id)!.minT).toBe(0.444)
    expect(p.report!.readings[i].minT).toBeNull()
    expect(readingRows(p, p.report!)[i].minT).toBe(0.444)
    expect(setReadingMinT(p, i, 0.444)).toBe(p)
    const h = p.report!.readings.findIndex((r) => r.link?.list === 'headMut')
    p = setReadingMinT(p, h, 0.6)
    expect(p.headMut.find((m) => m.id === p.report!.readings[h].link!.id)!.minT).toBe(0.6)
    // A report row keeps its own.
    p = addReportReading(p, { name: 'X' })
    const last = p.report!.readings.length - 1
    p = setReadingMinT(p, last, 0.3)
    expect(p.report!.readings[last].minT).toBe(0.3)
  })

  it('adds nozzle readings: one per nozzle and position, linked, pipe nominal, no doubles', () => {
    const p = started()
    const first = addNozzleReadings(p, [{ list: 'shellNozzles', index: 1 }, { list: 'headNozzles', index: 0 }], ['North', 'South'])
    expect(first.added).toBe(4)
    const rows = first.project.report!.readings.slice(0, 4)
    expect(rows.map((r) => [r.nozzle!.id, r.location, r.nominalMode, r.pipeSize, r.componentId, r.type])).toEqual([
      ['N2', 'North', 'pipe', '4', null, 'UTT'], ['N2', 'South', 'pipe', '4', null, 'UTT'],
      ['N3', 'North', 'pipe', '2', 'head1', 'UTT'], ['N3', 'South', 'pipe', '2', 'head1', 'UTT'],
    ])
    expect(readingRows(first.project, first.project.report!)[0].name).toBe('N2')
    const again = addNozzleReadings(first.project, [{ list: 'shellNozzles', index: 1 }], ['north', 'Top'])
    expect(again.added).toBe(1)
    expect(again.skipped).toBe(1)
    // A renamed nozzle is followed; a deleted one leaves its rows, unlinked, named after it.
    const renamed = syncReport(again.project, { ...again.project, shellNozzles: again.project.shellNozzles.map((n) => (n.id === 'N2' ? { ...n, id: 'N2A' } : n)) })
    expect(renamed.report!.readings[0].nozzle!.id).toBe('N2A')
  })

  it('pipe size from the nozzle diameter: the NPS or its outside diameter', () => {
    expect(npsForDiameter(4)).toBe('4')
    expect(npsForDiameter(1.5)).toBe('1-1/2')
    expect(npsForDiameter(4.5)).toBe('4')
    expect(npsForDiameter(2.375)).toBe('2')
    expect(npsForDiameter(7)).toBeNull()
    expect(npsForDiameter(null)).toBeNull()
  })
})
