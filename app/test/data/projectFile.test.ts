import { describe, expect, it } from 'vitest'
import {
  MIGRATIONS,
  CURRENT_SCHEMA_VERSION,
  ProjectFileError,
  createEmptyProject,
  findDuplicateIds,
  findMissingData,
  formatDate,
  isValidClock,
  openProject,
  saveProject,
  type Migration,
  type OpenResult,
  type ProjectInput,
} from '../../src/data/index.ts'

// Made-up job. No real client data.
function sampleProject(): ProjectInput {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    project: {
      projectName: 'TEST-V-100',
      drawingTitle: 'AUT COVERAGE MAP',
      component: 'TEST-V-100',
      unit: 'Test Unit 1',
      client: 'Example Client',
      inspector: 'A. Inspector',
      date: '2026-01-15',
      revision: '0',
      equipmentType: 'Vessel',
    },
    vessel: {
      orientation: 'Horizontal CCW',
      length: 240,
      height: 188.5,
      xAxisCardinal: 'North',
      yAxisCardinal: '',
      xAxisDirectionText: 'CW LOOKING NORTH',
      referenceLabelMode: 'Auto Cardinal',
      referenceLabelSet: 'TDC/BDC',
    },
    settings: { rulerSpacing: 12, autHatchTransparency: 40, cadPlatform: 'AutoCAD', headViewMode: 'BOTH' },
    circWelds: [{ id: 'CW1', y: 60, showLabel: true }],
    longSeams: [{ id: 'LS1', x: 20, startY: 0, stopY: 60, include: false }],
    shellNozzles: [{ id: 'N1', diameter: 12.75, x: 94, y: 120, minT: 'TOL', labelMode: 'OUTSIDE' }],
    objects: [{ id: 'SADDLE 1', x: 140, y: 30, circWidth: 40, length: 12, notes: 'Support' }],
    shellMut: [{ id: 'M1', x: 10, y: 10, minT: 0.512 }],
    headNozzles: [
      { head: 'HEAD 1', id: 'N2', diameter: 4.5, clock: '3:30', radiusPosition: 'HALF' },
      { head: 'HEAD 2', id: 'N3', diameter: 2.375, clock: '10.5', radiusPosition: 'CUSTOM', customRadiusPercent: 60 },
    ],
    headMut: [{ head: 'HEAD 1', id: 'HM1', clock: '12' }],
    scans: [
      { id: 'SCAN1', xStart: 0, xStop: 30, yStart: 0, yStop: 24 },
      { id: 'SCAN2', xStart: 60, xStop: 30, yStart: 24, yStop: 48, include: false },
    ],
    scanImages: [{ scanId: 'SCAN1', imageFile: 'S1.png' }],
  }
}

function expectOk(result: OpenResult) {
  if (!result.ok) throw new Error('Expected a valid project, got:\n' + result.errors.join('\n'))
  return result
}

function errorsFor(data: unknown): string[] {
  const result = openProject(JSON.stringify(data))
  if (result.ok) throw new Error('Expected errors, but the project was accepted')
  return result.errors
}

function withChange(change: (p: Record<string, any>) => void): ProjectInput {
  const p = sampleProject() as Record<string, any>
  change(p)
  return p as ProjectInput
}

describe('save and open', () => {
  it('round-trips a valid project unchanged', () => {
    const json = saveProject(sampleProject())
    const opened = expectOk(openProject(json))
    expect(saveProject(opened.project)).toBe(json)
    expect(opened.project.vessel.length).toBe(240)
    expect(opened.project.shellNozzles[0].minT).toBe('TOL')
    expect(opened.project.headNozzles[1].clock).toBe('10.5')
    expect(opened.project.project.date).toBe('2026-01-15')
    expect(opened.migratedFrom).toBeUndefined()
  })

  it('saves pretty JSON with the schema version first', () => {
    const json = saveProject(sampleProject())
    expect(json.startsWith(`{\n  "schemaVersion": ${CURRENT_SCHEMA_VERSION},`)).toBe(true)
  })

  it('refuses to save an invalid project', () => {
    const bad = withChange((p) => (p.vessel.length = -1))
    expect(() => saveProject(bad)).toThrow(ProjectFileError)
    try {
      saveProject(bad)
    } catch (e) {
      expect((e as ProjectFileError).errors).toEqual(['Vessel: Shell length (Y) must be greater than 0.'])
    }
  })
})

describe('defaults', () => {
  it('fills every section of an empty file', () => {
    const { project } = expectOk(openProject(JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION })))
    expect({ ...project, jobId: 'x' }).toEqual({ ...createEmptyProject(), jobId: 'x' })
    expect(project.jobId).toMatch(/^[0-9a-f-]{36}$/)
    expect(project.vessel.length).toBeNull()
    expect(project.vessel.orientation).toBe('Horizontal CW')
    expect(project.settings.rulerSpacing).toBe(12)
    expect(project.settings.autHatchTransparency).toBe(50)
    expect(project.settings.head1Label).toBe('HEAD 1')
    expect(project.settings.head2Label).toBe('HEAD 2')
    expect(project.project.date).toBe('')
    expect(project.settings.showHeadCenterlines).toBe(false)
    expect(project.settings.cadPlatform).toBe('DraftSight')
    expect(project.scans).toEqual([])
  })

  it('keeps given values and fills the rest', () => {
    const { project } = expectOk(
      openProject(JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, settings: { rulerSpacing: 10 } })),
    )
    expect(project.settings.rulerSpacing).toBe(10)
    expect(project.settings.rulerOffset).toBe(2)
  })

  it('fills optional fields on list items', () => {
    const { project } = expectOk(openProject(saveProject(sampleProject())))
    expect(project.shellNozzles[0]).toMatchObject({ include: true, notes: '' })
    expect(project.circWelds[0].include).toBe(true)
    expect(project.longSeams[0].showLabel).toBe(false)
    expect(project.headNozzles[0]).toMatchObject({
      customRadiusPercent: null, minT: null, labelMode: 'AUTO', include: true, notes: '',
    })
    expect(project.headMut[0]).toMatchObject({ radiusPosition: 'CENTER', labelMode: 'AUTO', include: true })
    expect(project.scans[0].include).toBe(true)
    expect(project.scanImages[0]).toMatchObject({ processedImage: '', include: true })
  })
})

describe('readable errors', () => {
  it('rejects text that is not JSON', () => {
    const result = openProject('{ not json')
    expect(result).toEqual({
      ok: false,
      errors: ['The file is not a valid AxisBuilder project file (it is not readable JSON).'],
    })
  })

  it('rejects JSON that is not a project', () => {
    expect(errorsFor([1, 2])).toEqual(['The file is not a valid AxisBuilder project file (no project data found).'])
    expect(errorsFor({ project: {} })).toEqual([
      'The file has no schemaVersion, so it is not an AxisBuilder project file.',
    ])
  })

  it('rejects files from a newer app version', () => {
    const [message] = errorsFor({ schemaVersion: CURRENT_SCHEMA_VERSION + 1 })
    expect(message).toMatch(/newer version of AxisBuilder/)
  })

  it('names the list, item, ID and field', () => {
    const errors = errorsFor(withChange((p) => (p.shellNozzles[0].diameter = 0)))
    expect(errors).toEqual(['Shell nozzles, item 1 (N1): Diameter must be greater than 0.'])
  })

  it('explains wrong types, choices and ranges', () => {
    const errors = errorsFor(
      withChange((p) => {
        p.vessel.orientation = 'Sideways'
        p.settings.rulerSpacing = '12'
        p.settings.autHatchTransparency = 95
        p.settings.showRulers = 'YES'
        p.scans[1].xStart = 'abc'
      }),
    )
    expect(errors).toEqual(
      expect.arrayContaining([
        'Vessel: Orientation must be one of: Vertical, Horizontal CW, Horizontal CCW (found "Sideways").',
        'Settings: Ruler tick spacing must be a number (found "12").',
        'Settings: Hatch transparency must be at most 90.',
        'Settings: Show rulers must be yes or no (true/false) (found "YES").',
        'AUT scans, item 2 (SCAN2): X start must be a number (found "abc").',
      ]),
    )
    expect(errors).toHaveLength(5)
  })

  it('reports missing required fields and unknown fields', () => {
    const errors = errorsFor(
      withChange((p) => {
        delete p.objects[0].length
        p.settings.rulerColour = 'red'
      }),
    )
    expect(errors).toEqual(
      expect.arrayContaining([
        'Objects, item 1 (SADDLE 1): Length is missing.',
        'Settings has unknown field: rulerColour.',
      ]),
    )
  })

  it('checks whole numbers, blank IDs and Min. T', () => {
    const errors = errorsFor(
      withChange((p) => {
        p.settings.autHatchTransparency = 12.5
        p.circWelds[0].id = '  '
        p.shellNozzles[0].minT = 'thin'
      }),
    )
    expect(errors).toEqual(
      expect.arrayContaining([
        'Settings: Hatch transparency must be a whole number.',
        'Circ welds, item 1: Weld ID must not be blank.',
        'Shell nozzles, item 1 (N1): Min. T must be a thickness of 0 or more, "TOL", or empty (found "thin").',
      ]),
    )
  })

  it('checks head clock positions', () => {
    const errors = errorsFor(
      withChange((p) => {
        p.headNozzles[0].clock = 'REVIEW'
        p.headNozzles[1].customRadiusPercent = null
        p.headMut[0].clock = '13:00'
      }),
    )
    expect(errors).toEqual([
      'Head nozzles, item 1 (N2): Clock position must be a clock position from 1 to 12, such as 3, 1:30 or 10.5.',
      'Head MUT, item 1 (HM1): Clock position must be a clock position from 1 to 12, such as 3, 1:30 or 10.5.',
    ])
  })

  it('accepts clock hours 1-12 with minutes or decimals, and nothing else', () => {
    for (const ok of ['1', '12', '3:30', '12:05', '10.5', '12.5']) expect(isValidClock(ok), ok).toBe(true)
    for (const bad of ['0', '13', '0:30', '13:00', '3:60', '3:5', '90°', '0.5', ' 3', 'REVIEW', '']) {
      expect(isValidClock(bad), bad).toBe(false)
    }
  })

  it('keeps the custom radius between 0 and 100 percent', () => {
    expect(errorsFor(withChange((p) => (p.headNozzles[1].customRadiusPercent = 120)))).toEqual([
      'Head nozzles, item 2 (N3): Custom radius % must be at most 100.',
    ])
  })

  it('checks the date is a real date', () => {
    expect(errorsFor(withChange((p) => (p.project.date = '2026-02-30')))).toEqual([
      'Project information: Date must be a real date written as YYYY-MM-DD, or blank.',
    ])
    expect(errorsFor(withChange((p) => (p.project.date = '10/22/2026')))).toHaveLength(1)
  })

  it('saves zero-size scans (checks.ts blocks their export); rejects image links to missing scans', () => {
    expect(openProject(JSON.stringify(withChange((p) => (p.scans[0].yStop = p.scans[0].yStart)))).ok).toBe(true)
    expect(errorsFor(withChange((p) => (p.scanImages[0].scanId = 'SCAN9')))).toEqual([
      'Scan images, item 1 (SCAN9): Scan "SCAN9" does not match any AUT scan.',
    ])
  })
})

describe('duplicate IDs', () => {
  // Duplicates are allowed in a file (v5.0 allowed them); findDuplicateIds lists them and export refuses.
  function duplicatesAfter(change: (p: Record<string, any>) => void): string[] {
    const r = openProject(saveProject(withChange(change)))
    if (!r.ok) throw new Error(r.errors.join(' / '))
    return findDuplicateIds(r.project)
  }

  it('opens a project with repeated IDs and lists them, ignoring case', () => {
    expect(duplicatesAfter((p) => p.scans.push({ id: 'scan1', xStart: 0, xStop: 1, yStart: 0, yStop: 1 }))).toEqual([
      'AUT scans, item 3 (scan1): Scan name "scan1" is also used by item 1; rename one before export.',
    ])
  })

  it('checks every list', () => {
    const dups = duplicatesAfter((p) => {
      p.circWelds.push({ id: 'CW1', y: 1 })
      p.shellNozzles.push({ id: 'N1', diameter: 2, x: 1, y: 1 })
      p.shellMut.push({ id: 'M1', x: 1, y: 1 })
      p.scanImages.push({ scanId: 'SCAN1' })
    })
    // A repeated nozzle name is allowed (a Review warning only), so 3, not 4.
    expect(dups).toHaveLength(3)
    expect(dups[0]).toBe('Circ welds, item 2 (CW1): Weld ID "CW1" is also used by item 1; rename one before export.')
  })

  it('nozzle names may repeat (user, 2026-10-25): they never block export', () => {
    expect(
      duplicatesAfter((p) => {
        p.headNozzles.push({ head: 'HEAD 2', id: 'n1', diameter: 2, clock: '6' })
        p.headNozzles.push({ head: 'HEAD 1', id: 'N3', diameter: 2, clock: '6' })
      }),
    ).toEqual([])
  })

  it('treats shell and head MUT as one vessel: IDs never repeat', () => {
    expect(duplicatesAfter((p) => p.headMut.push({ head: 'HEAD 2', id: 'M1', clock: '6' }))).toEqual([
      'Head MUT, item 2 (M1): MUT ID "M1" is also used by Shell MUT, item 1; rename one before export.',
    ])
  })

  it('finds none in a project with unique names', () => {
    expect(duplicatesAfter(() => {})).toEqual([])
  })
})

describe('migration hook', () => {
  // Pretend an older format 0 stored the vessel length under "shellLength".
  const migrations: Record<number, Migration> = {
    ...MIGRATIONS,
    0: (data) => {
      const { shellLength, ...rest } = data
      return { ...rest, schemaVersion: 1, vessel: { length: shellLength } }
    },
  }

  it('format 1 files get a job ID; a format 2 file keeps its own', () => {
    const v1 = expectOk(openProject(JSON.stringify({ schemaVersion: 1, project: { projectName: 'Old' } })))
    expect(v1.migratedFrom).toBe(1)
    expect(v1.project.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(v1.project.jobId).toMatch(/^[0-9a-f-]{36}$/)
    expect(v1.project.project.projectName).toBe('Old')
    const again = expectOk(openProject(saveProject(v1.project)))
    expect(again.migratedFrom).toBeUndefined()
    expect(again.project.jobId).toBe(v1.project.jobId)
    expect(errorsFor({ schemaVersion: 3, jobId: ' ' })).toEqual(['Job ID must not be blank.'])
    // A format 2 file (before the Drawing step) opens with the new settings at their defaults.
    const v2 = expectOk(openProject(JSON.stringify({ schemaVersion: 2, jobId: 'j2', settings: { rulerSpacing: 10 } })))
    expect(v2.migratedFrom).toBe(2)
    expect(v2.project.jobId).toBe('j2')
    expect(v2.project.settings.rulerSpacing).toBe(10)
    expect(v2.project.settings.scanTextSize).toBe('Automatic')
    expect(v2.project.settings.vesselColor).toBe(7)
  })

  it('upgrades older files before validating', () => {
    const result = expectOk(openProject(JSON.stringify({ schemaVersion: 0, shellLength: 300 }), { migrations }))
    expect(result.migratedFrom).toBe(0)
    expect(result.project.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(result.project.vessel.length).toBe(300)
  })

  it('still validates the upgraded data', () => {
    const result = openProject(JSON.stringify({ schemaVersion: 0, shellLength: -5 }), { migrations })
    expect(result).toEqual({ ok: false, errors: ['Vessel: Shell length (Y) must be greater than 0.'] })
  })

  it('reports a missing or broken migration step', () => {
    const missing = openProject(JSON.stringify({ schemaVersion: 0 }), { migrations: {} })
    expect(missing).toEqual({
      ok: false,
      errors: ["Project files in format 0 can't be upgraded by this version of the app."],
    })
    const broken = openProject(JSON.stringify({ schemaVersion: 0 }), { migrations: { 0: (d) => d } })
    expect(broken.ok).toBe(false)
  })
})

describe('missing data', () => {
  it('opens a project with blank measurements and lists them', () => {
    const p = withChange((p) => {
      p.vessel.length = null
      p.shellNozzles[0].diameter = null
      p.headNozzles[1].customRadiusPercent = null
      p.headMut[0].clock = null
      p.longSeams[0].x = null // switched off (include: false), so not listed
    })
    const { project } = expectOk(openProject(saveProject(p)))
    expect(findMissingData(project)).toEqual([
      'Vessel: Shell length (Y) is not entered yet.',
      'Shell nozzles, item 1 (N1): Diameter is not entered yet.',
      'Head nozzles, item 2 (N3): Custom radius % is not entered yet.',
      'Head MUT, item 1 (HM1): Clock position is not entered yet.',
    ])
  })

  it('is empty for a complete project', () => {
    expect(findMissingData(expectOk(openProject(saveProject(sampleProject()))).project)).toEqual([])
  })
})

describe('formatDate', () => {
  it('prints month-day-year with a short month name', () => {
    expect(formatDate('2026-10-22')).toBe('Oct-22-2026')
    expect(formatDate('2027-01-05')).toBe('Jan-05-2027')
    expect(formatDate('')).toBe('')
  })
})
