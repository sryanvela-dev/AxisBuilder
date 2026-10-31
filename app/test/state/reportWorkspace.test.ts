// The Report workspace in the session (state/session.ts) and its step statuses (state/reportSteps.ts).
import { describe, expect, it } from 'vitest'
import type { Project } from '../../src/data/schema.ts'
import { setScanResult, startReport, updateComponent } from '../../src/report/edits.ts'
import { nextReportStep, reportReviewList, reportStepStatuses, reportWhatsLeft } from '../../src/state/reportSteps.ts'
import { initialSession, sessionReducer, type SessionAction, type SessionState } from '../../src/state/session.ts'
import { stepStatuses } from '../../src/state/steps.ts'
import { olderSample } from '../fixtures/olderSample.ts'

const run = (actions: SessionAction[], start: SessionState = initialSession) => actions.reduce(sessionReducer, start)
const edit = (update: (p: Project) => Project, label = 'Edit'): SessionAction => ({ type: 'edit', label, update })
const open = (p: Project = olderSample()) => run([{ type: 'openJob', project: p, source: 'new' }])
const withReport = () => run([edit((p) => startReport(p), 'Start the AUT report'), { type: 'goToReportStep', step: 'setup' }], open())

describe('workspace', () => {
  it('a job opens on the drawing; the report needs a report', () => {
    let s = open()
    expect(s.job!.workspace).toBe('drawing')
    expect(s.job!.reportStep).toBe('setup')
    s = run([{ type: 'setWorkspace', workspace: 'report' }, { type: 'goToReportStep', step: 'results' }], s)
    expect(s.job!.workspace).toBe('drawing')
    expect(s.job!.reportStep).toBe('setup')
  })

  it('switches between the workspaces; goToStep (Find a setting, Go to) goes back to the drawing', () => {
    let s = withReport()
    expect(s.job!.workspace).toBe('report')
    s = run([{ type: 'goToReportStep', step: 'manual' }], s)
    expect(s.job!.reportStep).toBe('manual')
    s = run([{ type: 'goToStep', step: 'fieldData' }], s)
    expect(s.job!.workspace).toBe('drawing')
    expect(s.job!.step).toBe('fieldData')
    // The report keeps its step.
    s = run([{ type: 'setWorkspace', workspace: 'report' }], s)
    expect(s.job!.reportStep).toBe('manual')
    const same = run([{ type: 'setWorkspace', workspace: 'report' }], s)
    expect(same).toBe(s)
  })

  it('neither the workspace nor the report step is in the undo history', () => {
    let s = withReport()
    const past = s.job!.history.past.length
    s = run([{ type: 'goToReportStep', step: 'calibration' }, { type: 'setWorkspace', workspace: 'drawing' }], s)
    expect(s.job!.history.past.length).toBe(past)
  })

  it('undo of "Start the AUT report" shows the drawing again; redo brings the report back', () => {
    let s = withReport()
    s = run([{ type: 'undo' }], s)
    expect(s.job!.history.present.report).toBeNull()
    expect(s.job!.workspace).toBe('drawing')
    s = run([{ type: 'redo' }, { type: 'setWorkspace', workspace: 'report' }], s)
    expect(s.job!.workspace).toBe('report')
  })

  it('a report draft counts on its own step and blocks the report, not the drawing', () => {
    let s = withReport()
    s = run([{ type: 'setDraft', key: 'report.components.shell.nominal', draft: { text: '0.5x', problem: 'Not a number.', step: 'setup', where: 'Shell, Nominal' } }], s)
    const r = reportStepStatuses(s.job!)
    expect(r.setup.state).toBe('attention')
    expect(r.setup.issues.some((i) => i.blocksExport && i.text.includes('0.5x'))).toBe(true)
    const d = stepStatuses(s.job!)
    expect(Object.values(d).some((st) => st.issues.some((i) => i.text.includes('0.5x')))).toBe(false)
    // The first undo throws drafts away, as on the drawing side.
    s = run([{ type: 'undo' }], s)
    expect(s.job!.drafts).toEqual({})
    expect(s.job!.history.present.report).not.toBeNull()
  })
})

describe('report step statuses', () => {
  it('places checks on their steps: components on Setup, scans on AUT results', () => {
    const s = withReport()
    const st = reportStepStatuses(s.job!)
    // Shell and heads have no nominal yet.
    expect(st.setup.state).toBe('attention')
    expect(st.setup.issues.map((i) => i.text)).toContain('Shell has no nominal thickness.')
    expect(st.results.issues.some((i) => /has no results yet/.test(i.text))).toBe(true)
    expect(st.calibration.state).toBe('notStarted')
    expect(st.pages.short).toBe('Not started')
    expect(st.summary.short).toBe('Coming later')
    // Export lists what blocks the PDF (the Review list's errors).
    const blocking = st.reportReview.issues.filter((i) => i.blocksExport)
    expect(st.reportExport.issues).toEqual(blocking)
    expect(st.reportExport.state).toBe(blocking.length ? 'attention' : 'notStarted')
    expect(st.reportReview.issues.length).toBe(st.setup.issues.length + st.results.issues.length + st.manual.issues.length)
    const list = reportReviewList(st.reportReview)
    expect(list.errors[0].step).toBe('setup')
    expect(reportWhatsLeft(st).map((l) => l.step)).toContain('results')
  })

  it('setup is done once every component has its nominal; calibration starts with its first value', () => {
    let s = withReport()
    s = run([edit((p) => ['shell', 'head1', 'head2'].reduce((q, id) => updateComponent(q, id, { nominal: 0.5 }), p))], s)
    s = run([edit((p) => setScanResult(p, 'SCAN 1', { minT: 0.49 }))], s)
    s = run([edit((p) => ({ ...p, report: { ...p.report!, calibration: { ...p.report!.calibration, referenceReflector: 'FBH' } } }))], s)
    const st = reportStepStatuses(s.job!)
    expect(st.setup.state).toBe('done')
    expect(st.calibration.state).toBe('done')
    expect(st.results.state).toBe('attention')
  })

  it('the next step follows the step bar', () => {
    expect(nextReportStep('setup')).toBe('calibration')
    expect(nextReportStep('reportReview')).toBe('reportExport')
    expect(nextReportStep('reportExport')).toBeNull()
  })
})
