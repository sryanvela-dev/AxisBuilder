import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '../../src/data/projectFile.ts'
import type { Project } from '../../src/data/schema.ts'
import type { ReportEntry } from '../../src/data/xlsmImport.ts'
import { sessionReducer, type Job, type WorkbookImport } from '../../src/state/session.ts'
import { nextStep, stepStatuses, whatsLeft } from '../../src/state/steps.ts'
import { sampleProject } from '../../src/ui/sampleJob.ts'

function jobOf(project: Project, workbookImport: WorkbookImport | null = null): Job {
  return sessionReducer({ job: null }, { type: 'openJob', project, source: 'new', workbookImport }).job!
}

function withImages(p: Project, ids: string[]): Project {
  return { ...p, scanImages: ids.map((scanId) => ({ scanId, imageFile: `${scanId}.png`, processedImage: '', include: true })) }
}

const report = (sheet: string, kind: ReportEntry['kind']): ReportEntry => ({ sheet, cell: 'B10', value: 'REVIEW', kind, message: 'Check it.' })

describe('step status', () => {
  it('a new job: nothing started, only the AUT scans are listed as left', () => {
    const s = stepStatuses(jobOf(createEmptyProject()))
    for (const id of ['project', 'fieldData', 'scans', 'images', 'review', 'export'] as const) expect(s[id].state).toBe('notStarted')
    expect(whatsLeft(s).map((l) => l.text)).toEqual(['AUT scans: not imported yet'])
  })

  it('the sample job is complete except for photos', () => {
    const p = sampleProject()
    const s = stepStatuses(jobOf(p))
    expect(s.project.state).toBe('done')
    expect(s.fieldData.state).toBe('done')
    expect(s.scans.state).toBe('done')
    expect(s.images.state).toBe('notStarted')
    expect(s.export.issues).toEqual([])
    expect(whatsLeft(s)).toEqual([{ step: 'images', text: 'Images: no photos linked yet' }])
    expect(s.review.state).toBe('attention')
    expect(s.review.issues.map((i) => i.text)).toEqual(['No photos linked yet.'])

    const some = stepStatuses(jobOf(withImages(p, ['SCAN 1', 'SCAN 2'])))
    expect(some.images.state).toBe('attention')
    expect(some.images.issues[0].text).toBe('4 scans have no photo yet.')
    expect(some.images.issues[0].blocksExport).toBe(false)

    const all = stepStatuses(jobOf(withImages(p, p.scans.map((x) => x.id))))
    expect(all.images.state).toBe('done')
    expect(all.review.state).toBe('done')
    expect(whatsLeft(all)).toEqual([])
  })

  it('a missing vessel size needs attention on Project and blocks export', () => {
    const p = sampleProject()
    const s = stepStatuses(jobOf({ ...p, vessel: { ...p.vessel, length: null } }))
    expect(s.project.state).toBe('attention')
    expect(s.project.short).toBe('1 to fix')
    expect(s.fieldData.state).toBe('done')
    expect(s.export.state).toBe('attention')
    expect(s.export.issues.map((i) => i.text)).toEqual(['Shell length (Y): Not entered yet. Enter the shell length in inches on the Project step.'])
  })

  it('missing values and repeated names go to the step that holds them', () => {
    const p = sampleProject()
    const broken: Project = {
      ...p,
      headNozzles: [...p.headNozzles, { ...p.headNozzles[0], id: 'N1' }], // N1 is also a shell nozzle
      scans: p.scans.map((s, i) => (i === 0 ? { ...s, yStop: null } : s)),
    }
    const s = stepStatuses(jobOf(broken))
    expect(s.project.state).toBe('done')
    expect(s.fieldData.state).toBe('attention')
    expect(s.fieldData.issues[0].text).toContain('The name "N1" is also used in Shell nozzles, row 1.')
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
    let job = jobOf(sampleProject(), wb)
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

  it('Next goes through the steps in order', () => {
    expect(nextStep('project')).toBe('fieldData')
    expect(nextStep('review')).toBe('export')
    expect(nextStep('export')).toBeNull()
  })
})
