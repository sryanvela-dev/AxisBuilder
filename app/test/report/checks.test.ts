import { describe, expect, it } from 'vitest'
import { checkProject } from '../../src/data/checks.ts'
import type { Project, Scan } from '../../src/data/schema.ts'
import { checkReport } from '../../src/report/checks.ts'
import { createReport } from '../../src/report/report.ts'
import { applyReportCheckAction } from '../../src/report/checks.ts'
import { photoSchema, reportSchema, transducerSchema, type Reading, type Report, type ScanResult } from '../../src/report/schema.ts'
import { olderSample } from '../fixtures/olderSample.ts'

const result = (scanId: string, r: Partial<ScanResult> = {}): ScanResult => ({
  ...reportSchema.parse({ templateId: 'generic-aut', templateVersion: 1, scanResults: [{ scanId }] }).scanResults[0], ...r,
})
const reading = (r: Partial<Reading> = {}): Reading => ({
  ...reportSchema.parse({ templateId: 'generic-aut', templateVersion: 1, readings: [{}] }).readings[0], ...r,
})

/**
 * Older sample with a complete report: every scan has results and a data page, every component a nominal, an
 * examiner, a photo, the transducer and increments and the scope fields; so no checks at all.
 */
function clean(change: (r: Report, p: Project) => Report = (r) => r, scans?: Scan[]): Project {
  const p0 = olderSample()
  const p = scans ? { ...p0, scans } : p0
  const r = createReport(p)
  const report: Report = {
    ...r,
    components: r.components.map((c) => ({ ...c, nominal: 0.5 })),
    scanResults: p.scans.map((s) => result(s.id, { readings: 100, minT: 0.49, avgT: 0.5, dataImage: `${s.id}.png` })),
    job: { ...r.job, techs: [{ name: 'A. Tech', title: 'AUT Specialist' }] },
    photos: [photoSchema.parse({ file: 'site.jpg' })],
    calibration: {
      ...r.calibration, increments: { x: 0.125, y: 0.05 },
      transducers: [transducerSchema.parse({ maker: 'AUT Solutions', mode: 'Longitudinal', size: '0.375"', frequency: '5 MHz', angle: '0°' })],
    },
    text: { ...r.text, scope: { ...r.text.scope, fields: { purpose: 'map the remaining wall', areaCovered: 'the shell', limitations: '' } } },
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
      ...r, calibration: { ...r.calibration, increments: { x: null, y: null } },
      scanResults: r.scanResults.map((s) => (s.scanId === 'SCAN 2' ? { ...s, minT: null, readings: null } : s.scanId === 'SCAN 3' ? { ...s, minT: null, inReport: false } : s)),
    }))
    expect(texts(p)).toEqual([
      'error: SCAN 2 has no results yet.',
      'warning: SCAN 3 is drawn but left out of the report.',
      'warning: Scope: the "Equipment and indexing" sentence is left out until the scan increments (Calibration) is filled in.',
    ])
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

describe('report checks, design 9 and 14 in full', () => {
  const only = (p: Project, sev?: string) => checkReport(p).filter((c) => !sev || c.severity === sev)

  it('needs the cover fields: client, Equipment ID, date and an examiner with a name', () => {
    const p0 = clean((r) => ({ ...r, job: { ...r.job, techs: [{ name: ' ', title: 'AUT Assistant' }] } }))
    const p = { ...p0, project: { ...p0.project, client: '', component: ' ', date: '' } }
    expect(texts(p)).toEqual([
      'error: The cover has no Client.',
      'error: The cover has no Equipment ID.',
      'error: The cover has no Date.',
      'error: The cover names no examiner.',
      // The Equipment ID also fills two sentences.
      'warning: Scope: the "Opening" sentence is left out until the Equipment ID is filled in.',
      'warning: Summary: the "Scans and coverage" sentence is left out until the Equipment ID is filled in.',
    ])
    expect(checkReport(p)[0].place).toEqual({ kind: 'field', step: 'setup', elementId: 'setting-project-client' })
  })

  it('a section that is on with nothing to print is an error with "Turn the section off"', () => {
    const p = clean((r) => ({ ...r, photos: [], sections: { ...r.sections, reference: { on: true } } }))
    const errs = only(p, 'error')
    expect(errs.map((c) => c.text)).toEqual(['Photos is on but has no photos.', 'Reference Pages is on but has no reference pages.'])
    expect(errs[0].actions).toEqual([{ label: 'Turn the section off', kind: 'sectionOff', sectionId: 'photos' }])
    const fixed = errs.reduce((q, c) => applyReportCheckAction(q, c.actions![0]), p)
    expect(only(fixed, 'error')).toEqual([])
    // A renamed section is named by its own title.
    const q = clean((r) => ({ ...r, photos: [], sections: { photos: { on: true, title: 'Overview Photos' } } }))
    expect(only(q, 'error')[0].text).toBe('Overview Photos is on but has no photos.')
  })

  it('the scan sheet (not optional) and the drawings with nothing chosen', () => {
    const p = clean((r) => ({
      ...r, scanResults: r.scanResults.map((s) => ({ ...s, inReport: false })),
      options: { ...r.options, drawings: { rollout: false, overlay: false, sections: 'off' as const } },
    }))
    const errs = only(p, 'error')
    expect(errs.map((c) => c.text)).toEqual(['Drawings is on but has no drawings chosen.', 'Scan Sheet is on but has no scans.', 'C-Scan Data is on but has no scans.'])
    expect(errs[1].actions).toBeUndefined()
  })

  it('temperature correction on needs a temperature; changed ladder bands are listed', () => {
    const p = clean((r) => ({ ...r, options: { ...r.options, tempCorrection: { on: true, tempF: null }, ladder: { cutoffs: [10, 20, 40] as [number, number, number] } } }))
    expect(texts(p)).toEqual(['error: Temperature correction is on but has no temperature.', 'warning: The severity bands were changed for this job (10 / 20 / 40%).'])
  })

  it('scans: no data page, switched off in the drawing but in the report (and the reverse)', () => {
    const scans = olderSample().scans.map((s, i) => (i === 0 ? { ...s, include: false } : s))
    const p = clean((r) => ({ ...r, scanResults: r.scanResults.map((s, i) => (i === 1 ? { ...s, dataImage: null } : i === 2 ? { ...s, inReport: false } : s)) }), scans)
    expect(texts(p)).toEqual([
      'warning: SCAN 1 is switched off in the drawing but is in the report.',
      'warning: SCAN 2 has no data-page screenshot; its C-scan page shows an empty box.',
      'warning: SCAN 3 is drawn but left out of the report.',
    ])
    // No C-scan pages: no screenshot needed.
    const q = clean((r) => ({ ...r, sections: { cscan: { on: false } }, scanResults: r.scanResults.map((s) => ({ ...s, dataImage: null })) }))
    expect(texts(q)).toEqual([])
  })

  it('lists what was set by hand: severity, comment, pipe wall; and readings far over the nominal', () => {
    const p = clean((r) => ({
      ...r,
      scanResults: r.scanResults.map((s, i) => (i === 0 ? { ...s, severityOverride: 'minor', commentOverride: 'Looks fine.' } : i === 1 ? { ...s, minT: 0.6 } : s)),
      readings: [
        reading({ name: 'N1', nominalMode: 'custom', nominal: 0.3, minT: 0.36 }),
        reading({ name: 'N2', nominalMode: 'pipe', pipeSize: '4', nominal: 0.237, minT: 0.33 }),
        reading({ name: 'N3', nominalMode: 'pipe', pipeSize: '4', minT: 0.9 }),
        reading({ name: 'N4', nominalMode: 'custom', nominal: 0.5, minT: 0.49, severityOverride: 'minor', commentOverride: 'x' }),
      ],
    }))
    expect(texts(p)).toEqual([
      'warning: SCAN 1: the severity was set by hand.',
      'warning: SCAN 1: the comment was written by hand.',
      "warning: SCAN 2: Min 'T' 0.6 is more than 15% over the nominal 0.5.",
      'warning: N1: a reading of 0.36 is more than 15% over the nominal 0.3.',
      'warning: N2: a reading of 0.33 is more than 15% over the nominal 0.237.',
      'warning: N2: the pipe wall was chosen by hand.',
      'warning: N3: the thickest reading is more than 15% over the suggested wall (XXS, 0.674").',
      'warning: N4: the severity was set by hand.',
      'warning: N4: the comment was written by hand.',
    ])
  })

  it('pictures: a redaction (note), a label linked to a deleted row, marks outside the crop (note)', () => {
    const photo = (file: string, rest: object) => reportSchema.parse({ templateId: 'generic-aut', templateVersion: 1, photos: [{ file, ...rest }] }).photos[0]
    const p = clean((r) => ({
      ...r,
      photos: [
        photo('a.jpg', { markup: [{ id: 'm1', kind: 'redaction', box: { x0: 0.1, y0: 0.1, x1: 0.2, y1: 0.2 } }] }),
        photo('b.jpg', { markup: [{ id: 'm2', kind: 'label', at: [0.5, 0.5], text: 'S9', link: { list: 'scans', id: 'SCAN 99' } }] }),
        photo('c.jpg', { crop: { x0: 0.5, y0: 0.5, x1: 1, y1: 1 }, markup: [
          { id: 'm3', kind: 'rect', box: { x0: 0, y0: 0, x1: 0.2, y1: 0.2 } },
          { id: 'm4', kind: 'line', from: [0.4, 0.4], to: [0.6, 0.6] },
        ] }),
      ],
    }))
    expect(texts(p)).toEqual([
      'note: Photo 1 (a.jpg) has a redacted area: the PDF holds this picture with those pixels removed (blacked out or blurred), not covered.',
      'warning: Photo 2 (b.jpg) has a live label linked to SCAN 99, which is no longer in the drawing: it prints its last text.',
      'note: Photo 3 (c.jpg): a mark is outside the crop, so it does not print.',
    ])
    expect(checkReport(p)[1].place).toEqual({ kind: 'picture', at: { kind: 'photo', index: 1 } })
  })

  it('custom sheets: empty, a section sheet or head the drawing does not have, a scan no longer drawn', () => {
    const p = clean((r) => ({
      ...r,
      customSheets: [
        { id: 's1', title: 'Boot', after: 'cscan', layout: '1 large' as const, blocks: [] },
        { id: 's2', title: '', after: 'cscan', layout: '4 grid' as const, blocks: [
          { kind: 'view' as const, view: 'section:3' }, { kind: 'view' as const, view: 'head2' as const },
          { kind: 'cscanBoxes' as const, scanId: 'SCAN 99', comment: '', stats: [] },
        ] },
      ],
    }))
    const p2 = { ...p, settings: { ...p.settings, headViewMode: 'HEAD 1' as const } }
    expect(texts(p2)).toEqual([
      'warning: The custom sheet "Boot" has nothing on it.',
      'warning: The custom sheet "Untitled" shows section sheet 3, which the drawing does not have.',
      'warning: The custom sheet "Untitled" shows head 2, which the drawing does not draw.',
      'warning: The custom sheet "Untitled" shows SCAN 99, which is no longer in the drawing.',
    ])
  })

  it('summary: sentences left out are listed on Summary and go to where the value is filled in; edited text is listed', () => {
    const p = clean((r) => ({ ...r, text: { ...r.text, summary: { ...r.text.summary, edited: 'My own words.' } }, calibration: { ...r.calibration, transducers: [] } }))
    const c = checkReport(p)
    expect(c.map((x) => `${x.severity}: ${x.text}`)).toEqual([
      'warning: Scope: the "Equipment and indexing" sentence is left out until the transducer (Calibration) is filled in.',
      'warning: The summary text was edited by hand, so it no longer follows the data.',
    ])
    expect(c[0].place).toEqual({ kind: 'field', step: 'calibration', elementId: 'report-field-transducers' })
    expect(c[0].listOn).toBe('summary')
    // The template asks for the purpose to be checked.
    const q = clean((r) => ({ ...r, text: { ...r.text, scope: { ...r.text.scope, fields: { purpose: '', areaCovered: '', limitations: '' } } } }))
    expect(checkReport(q)[0].fix).toBe('Fill it in and check the wording; the template asks for it.')
  })
})
