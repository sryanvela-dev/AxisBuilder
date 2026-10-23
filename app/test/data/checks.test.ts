import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkProject, checkSentence, checksAt, type Check } from '../../src/data/checks.ts'
import { openProject } from '../../src/data/projectFile.ts'
import { findDuplicateIds, findMissingData, type Project } from '../../src/data/schema.ts'
import { sampleProject } from '../../src/ui/sampleJob.ts'

const golden = join(import.meta.dirname, '..', 'golden')
const goldenJobs = readdirSync(golden, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)

function load(job: string): Project {
  const r = openProject(readFileSync(join(golden, job, 'project.json'), 'utf8'))
  if (!r.ok) throw new Error(r.errors.join('\n'))
  return r.project
}

/** Checks without the photo checks (the sample job has no photos linked). */
const checkFields = (p: Project) => checkProject(p).filter((c) => c.place.kind !== 'photo')
const errors = (cs: Check[]) => cs.filter((c) => c.severity === 'error')
const warnings = (cs: Check[]) => cs.filter((c) => c.severity === 'warning')

describe('checks', () => {
  it('the sample job has nothing to fix or check', () => {
    expect(checkFields(sampleProject())).toEqual([])
  })

  it.each(goldenJobs)('%s: the export rules match what the exporter refuses on', (job) => {
    const p = load(job)
    const rules = checkFields(p).filter((c) => c.exportRule)
    expect(rules.length).toBe(findMissingData(p).length + findDuplicateIds(p).length)
  })

  it('export rules match on a job full of problems too', () => {
    const p = sampleProject()
    const bad: Project = {
      ...p,
      vessel: { ...p.vessel, height: null },
      shellNozzles: [...p.shellNozzles, { ...p.shellNozzles[0], id: 'n1', diameter: null }, { ...p.shellNozzles[1], include: false, x: null }],
      headNozzles: [...p.headNozzles, { ...p.headNozzles[0], id: 'N2', clock: null, radiusPosition: 'CUSTOM', customRadiusPercent: null }],
      headMut: [{ ...p.headMut[0], radiusPosition: null }],
      shellMut: [{ ...p.shellMut[0], x: null }],
    }
    const rules = checkFields(bad).filter((c) => c.exportRule)
    expect(rules.length).toBe(findMissingData(bad).length + findDuplicateIds(bad).length)
    expect(rules.length).toBeGreaterThan(5)
  })

  it('each check is placed on its row and field and says how to fix it', () => {
    const p = sampleProject()
    const cs = checkFields({ ...p, shellNozzles: [{ ...p.shellNozzles[0], diameter: null }] })
    expect(cs).toEqual([
      {
        severity: 'error', exportRule: true, place: { kind: 'row', list: 'shellNozzles', index: 0, field: 'diameter' },
        text: 'Diameter is blank.', fix: 'Enter the diameter, or untick Include if it is not drawn.',
      },
    ])
    expect(checkSentence(p, cs[0])).toBe('Shell nozzles, row 1 (N1): Diameter is blank. Enter the diameter, or untick Include if it is not drawn.')
    expect(checksAt(cs, 'shellNozzles', 0, 'diameter')).toHaveLength(1)
    expect(checksAt(cs, 'shellNozzles', 1)).toHaveLength(0)
  })

  it('shell and head nozzles share names (ignoring capitals)', () => {
    const p = sampleProject()
    const cs = checkFields({ ...p, headNozzles: [{ ...p.headNozzles[0], id: 'mw' }] })
    expect(errors(cs).map((c) => c.text)).toEqual(['The name "mw" is also used in Shell nozzles, row 3.'])
    expect(errors(cs)[0].place).toMatchObject({ list: 'headNozzles', index: 0, field: 'id' })
  })

  it('a long seam that starts after it stops is an error', () => {
    const p = sampleProject()
    const cs = checkFields({ ...p, longSeams: [{ ...p.longSeams[0], startY: 100, stopY: 40 }] })
    expect(errors(cs).map((c) => c.text)).toEqual(['Start Y (100 in) is after Stop Y (40 in).'])
    expect(errors(cs)[0].exportRule).toBeUndefined()
  })

  it('items outside the shell are warnings', () => {
    const p = sampleProject() // 240 long, 188.5 around
    const cs = checkFields({
      ...p,
      circWelds: [{ ...p.circWelds[0], y: 250 }],
      shellNozzles: [{ ...p.shellNozzles[0], x: -2 }],
      objects: [{ ...p.objects[0], x: 150, circWidth: 60 }],
      shellMut: [{ ...p.shellMut[0], y: 300 }],
    })
    expect(errors(cs)).toEqual([])
    expect(warnings(cs).map((c) => c.text)).toEqual([
      'Y position (250 in) is past the shell length (240 in).',
      'X position (-2 in) is below 0, outside the shell.',
      'It reaches 210 in around, past the circumference (188.5 in).',
      'Y position (300 in) is past the shell length (240 in).',
    ])
  })

  it('a switched-off item is not checked for missing or outside values', () => {
    const p = sampleProject()
    expect(checkFields({ ...p, circWelds: [{ ...p.circWelds[0], include: false, y: null }, { ...p.circWelds[1], include: false, y: 999 }] })).toEqual([])
  })

  it('head items are a warning while their head view is off', () => {
    const p = sampleProject()
    const none = checkFields({ ...p, settings: { ...p.settings, headViewMode: 'NONE' } })
    expect(errors(none)).toEqual([])
    expect(warnings(none).map((c) => c.text)).toEqual([
      '2 are on HEAD 1 and HEAD 2, but Head views is NONE, so they are not drawn.',
      '1 is on HEAD 1, but Head views is NONE, so it is not drawn.',
    ])
    const one = checkFields({ ...p, settings: { ...p.settings, headViewMode: 'HEAD 1' } })
    expect(warnings(one).map((c) => c.text)).toEqual(['1 is on HEAD 2, but Head views is HEAD 1, so it is not drawn.'])
  })

  it('a blank project name is a warning only', () => {
    const p = sampleProject()
    const cs = checkFields({ ...p, project: { ...p.project, projectName: ' ' } })
    expect(cs).toMatchObject([{ severity: 'warning', place: { kind: 'setting', section: 'project', key: 'projectName' } }])
  })
})
