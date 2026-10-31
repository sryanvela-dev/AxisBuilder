import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '../../src/data/projectFile.ts'
import type { Project } from '../../src/data/schema.ts'
import type { ReportEntry } from '../../src/data/xlsmImport.ts'
import { sessionReducer, STEP_IDS, type Job, type WorkbookImport } from '../../src/state/session.ts'
import { nextStep, STEPS, stepStatuses, whatsLeft } from '../../src/state/steps.ts'
import { GUIDE_STEPS } from '../../src/ui/helpText.ts'
// The sample as it was when these tests were written (test/fixtures/olderSample.ts).
import { olderSample as sampleProject } from '../fixtures/olderSample.ts'

function jobOf(project: Project, workbookImport: WorkbookImport | null = null): Job {
  return sessionReducer({ job: null }, { type: 'openJob', project, source: 'new', workbookImport }).job!
}

function withImages(p: Project, ids: string[]): Project {
  return { ...p, scanImages: ids.map((scanId) => ({ scanId, imageFile: `${scanId}.png`, processedImage: '', include: true })) }
}

/** The sample job with a photo for every scan. */
const linked = () => {
  const p = sampleProject()
  return withImages(p, p.scans.map((x) => x.id))
}

const report = (sheet: string, kind: ReportEntry['kind']): ReportEntry => ({ sheet, cell: 'B10', value: 'REVIEW', kind, message: 'Check it.' })

describe('step status', () => {
  it('a new job: nothing started, only the AUT scans are listed as left', () => {
    const s = stepStatuses(jobOf(createEmptyProject()))
    for (const id of ['project', 'fieldData', 'scans', 'images', 'review', 'export'] as const) expect(s[id].state).toBe('notStarted')
    expect(whatsLeft(s).map((l) => l.text)).toEqual(['AUT scans: not imported yet'])
  })

  it('the sample job is complete except for photos, which block export (v5.0 rule)', () => {
    const p = sampleProject()
    const s = stepStatuses(jobOf(p))
    expect(s.project.state).toBe('done')
    expect(s.fieldData.state).toBe('done')
    expect(s.scans.state).toBe('done')
    expect(s.images.state).toBe('attention')
    expect(s.images.short).toBe('6 to fix')
    expect(s.export.issues).toHaveLength(6)
    expect(whatsLeft(s)).toEqual([{ step: 'images', text: 'Images: 6 things to fix' }])
    expect(s.review.state).toBe('attention')

    const some = stepStatuses(jobOf(withImages(p, ['SCAN 1', 'SCAN 2'])))
    expect(some.images.short).toBe('4 to fix')
    expect(some.images.issues[0].text).toBe('Photo of SCAN 3: No photo chosen. Choose the photo folder and match the photos, or untick "Use photo" to draw this scan without one.')

    const noPhotos = stepStatuses(jobOf({ ...p, settings: { ...p.settings, generateOverlayDrawing: false } }))
    expect(noPhotos.images.state).toBe('notStarted')
    expect(noPhotos.export.issues).toEqual([])

    const unchecked = stepStatuses(jobOf({ ...p, settings: { ...p.settings, enableValidation: false } }))
    expect(unchecked.images.short).toBe('6 to check')
    expect(unchecked.export.issues).toEqual([])

    const all = stepStatuses(jobOf(withImages(p, p.scans.map((x) => x.id))))
    expect(all.images.state).toBe('done')
    expect(all.review.state).toBe('done')
    expect(whatsLeft(all)).toEqual([])
  })

  it('a missing vessel size needs attention on Project and blocks export', () => {
    const p = linked()
    const s = stepStatuses(jobOf({ ...p, vessel: { ...p.vessel, length: null } }))
    expect(s.project.state).toBe('attention')
    expect(s.project.short).toBe('1 to fix')
    expect(s.fieldData.state).toBe('done')
    expect(s.export.state).toBe('attention')
    expect(s.export.issues.map((i) => i.text)).toEqual(['Shell length (Y): Not entered yet. Enter the shell length in inches on the Project step.'])
  })

  it('missing values and repeated names go to the step that holds them', () => {
    const p = linked()
    const broken: Project = {
      ...p,
      objects: [...p.objects, { ...p.objects[0] }], // the same object name twice
      scans: p.scans.map((s, i) => (i === 0 ? { ...s, yStop: null } : s)),
    }
    const s = stepStatuses(jobOf(broken))
    expect(s.project.state).toBe('done')
    expect(s.fieldData.state).toBe('attention')
    expect(s.fieldData.issues[0].text).toContain('The name "SADDLE A" is also used in row 1.')
    expect(s.scans.state).toBe('attention')
    expect(s.scans.issues[0].text).toBe('AUT scans, row 1 (SCAN 1): Y stop is blank. Enter the Y stop, or untick Include if it is not drawn.')
    expect(s.export.issues.length).toBe(2)
  })

  it('a switched-off scan needs no values and no photo', () => {
    const p = sampleProject()
    const off = { ...p, scans: p.scans.map((s, i) => (i === 0 ? { ...s, include: false, yStop: null } : s)) }
    const s = stepStatuses(jobOf(withImages(off, off.scans.slice(1).map((x) => x.id))))
    expect(s.scans.state).toBe('done')
    expect(s.images.state).toBe('done')
  })

  it('import report entries to check count until marked as checked', () => {
    const wb: WorkbookImport = {
      fileName: 'old.xlsm',
      report: [report('Shell Features', 'review'), report('Shell Features', 'invalid'), report('Shell Features', 'changed'), report('Project Settings', 'notFound')],
      summary: {} as WorkbookImport['summary'],
      checkedSteps: [],
    }
    let job = jobOf(linked(), wb)
    let s = stepStatuses(job)
    expect(s.fieldData.state).toBe('attention')
    expect(s.fieldData.short).toBe('1 to check')
    expect(s.fieldData.issues[0].text).toBe('2 imported values from the Excel job need checking (see the import report).')
    expect(s.project.state).toBe('done') // "not found" is information only
    expect(s.export.issues).toEqual([]) // checking does not block export

    job = sessionReducer({ job }, { type: 'markReportChecked', step: 'fieldData' }).job!
    s = stepStatuses(job)
    expect(s.fieldData.state).toBe('done')
  })

  it('runs Project, AUT scans, Images, Field data, Drawing, Review, Export (the order the work happens)', () => {
    expect([...STEP_IDS]).toEqual(['project', 'scans', 'images', 'fieldData', 'drawing', 'review', 'export'])
    expect(STEPS.map((s) => s.id)).toEqual([...STEP_IDS])
    expect(Object.keys(GUIDE_STEPS)).toEqual([...STEP_IDS])
  })

  it('Next goes through the steps in order', () => {
    expect(nextStep('project')).toBe('scans')
    expect(nextStep('images')).toBe('fieldData')
    expect(nextStep('fieldData')).toBe('drawing')
    expect(nextStep('review')).toBe('export')
    expect(nextStep('export')).toBeNull()
  })
})

describe('label warnings', () => {
  it('show under their row and on Review, not at the top of the step or in the step bar', async () => {
    const { setOverride } = await import('../../src/data/overrides.ts')
    const { checkProject, checksAt } = await import('../../src/data/checks.ts')
    const p = setOverride(linked(), 'shellNozzles', 0, { label: { dx: -9999, dy: 0 } })
    const label = checkProject(p).filter((c) => c.label)
    expect(label.length).toBeGreaterThan(0)
    expect(checksAt(checkProject(p), 'shellNozzles', 0).some((c) => c.label)).toBe(true)
    const s = stepStatuses(jobOf(p))
    const base = stepStatuses(jobOf(linked()))
    expect(s.fieldData.issues.some((i) => i.check?.label)).toBe(false)
    expect(s.fieldData.short).toBe(base.fieldData.short)
    expect(s.review.issues.filter((i) => i.check?.label).map((i) => i.step)).toEqual(label.map(() => 'fieldData'))
  })
})
