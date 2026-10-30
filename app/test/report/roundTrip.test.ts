// R2 "done when": a job's report data can be entered, undone, saved and reopened. A golden job gets a report through
// the same edits the screens make (each one undo step), is saved to text and opened again unchanged, and undoing every
// step takes it back to a drawing-only job.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { openProject, saveProject } from '../../src/data/projectFile.ts'
import type { Project } from '../../src/data/schema.ts'
import { readingRows, scanRows } from '../../src/report/calc/results.ts'
import {
  addComponent,
  addListItem,
  addNozzleReadings,
  setReadingMinT,
  setReportValue,
  setScanResult,
  setSectionTitle,
  startReport,
  updateComponent,
} from '../../src/report/edits.ts'
import { applyScansheet, importScansheet } from '../../src/report/scansheetImport.ts'
import { initialSession, sessionReducer, type SessionAction, type SessionState } from '../../src/state/session.ts'

const REF1 = readFileSync(new URL('../golden/REF1/project.json', import.meta.url), 'utf8')
const CSV = readFileSync(new URL('../fixtures/report/ref5-scansheet.csv', import.meta.url))

const run = (actions: SessionAction[], start: SessionState) => actions.reduce(sessionReducer, start)
const edit = (label: string, update: (p: Project) => Project): SessionAction => ({ type: 'edit', label, update })

function golden(): Project {
  const res = openProject(REF1)
  if (!res.ok) throw new Error(res.errors.join('\n'))
  // REF1 has no MUT rows; one shell MUT row gives the report a linked reading.
  return { ...res.project, shellMut: [{ id: 'M1', x: 40, y: 60, minT: null, notes: '', area: null }] }
}

describe('report round trip (R2)', () => {
  it('enters report data, saves it, reopens it unchanged, and undoes it all', () => {
    const start = golden()
    let s = run([{ type: 'openJob', project: start, source: 'file', saved: true }], initialSession)
    const steps: SessionAction[] = [
      edit('Start the AUT report', (p) => startReport(p)),
      edit('Import results', (p) => applyScansheet(p, importScansheet(CSV, p))),
      edit('Shell nominal', (p) => updateComponent(p, 'shell', { nominal: 0.75 })),
      edit('Add boot', (p) => addComponent(p, 'boot')),
      edit('Boot nominal', (p) => updateComponent(p, 'c1', { nominal: 0.5, notes: 'North boot' })),
      edit('Scan on the boot', (p) => setScanResult(p, 'SCAN 2', { componentId: 'c1', form: 'localized', cause: 'corrosion', commentOverride: null })),
      edit('Severity by hand', (p) => setScanResult(p, 'SCAN 3', { severityOverride: 'minor', location: 'Bottom' })),
      edit('Job number', (p) => setReportValue(p, ['job', 'jobNumber'], '26-0142')),
      edit('Examiner', (p) => addListItem(p, ['job', 'techs'], { name: 'Pat Doe', title: 'AUT Level II' })),
      edit('Section title', (p) => setSectionTitle(p, 'photos', 'Overview Photos')),
      edit('Linked Min T', (p) => setReadingMinT(p, p.report!.readings.findIndex((r) => r.link !== null), 0.69)),
      edit('Nozzle readings', (p) => addNozzleReadings(p, [{ list: 'shellNozzles', index: 0 }], ['North', 'South']).project),
      edit('Temperature', (p) => setReportValue(setReportValue(p, ['options', 'tempCorrection', 'on'], true), ['options', 'tempCorrection', 'tempF'], 150)),
    ]
    s = run(steps, s)
    const p = s.job!.history.present
    const report = p.report!
    expect(s.job!.history.past.length).toBe(steps.length)

    // What was entered is there, and the figures follow it.
    expect(report.scanResults.length).toBeGreaterThan(0)
    expect(report.components.map((c) => c.id)).toContain('c1')
    const rows = scanRows(p, report)
    const scan2 = rows.find((r) => r.scan.id === 'SCAN 2')!
    expect(scan2.component?.id).toBe('c1')
    expect(scan2.comment?.text).toMatch(/localized I\.D\. corrosion detected\./)
    expect(rows.find((r) => r.scan.id === 'SCAN 3')!.comment?.severityOverridden).toBe(true)
    expect(p.shellMut[0].minT).toBe(0.69)
    expect(readingRows(p, report).filter((r) => r.reading.nozzle !== null)).toHaveLength(2)

    // Saved to text and opened again: the same project.
    const text = saveProject(p)
    const back = openProject(text)
    expect(back.ok).toBe(true)
    if (!back.ok) return
    expect(back.project).toEqual(p)
    expect(saveProject(back.project)).toBe(text)

    // Undo every step: back to the job as it was, with no report, on the drawing.
    s = run([{ type: 'goToReportStep', step: 'manual' }], s)
    expect(s.job!.workspace).toBe('report')
    s = run(steps.map((): SessionAction => ({ type: 'undo' })), s)
    expect(s.job!.history.present.report).toBeNull()
    expect(s.job!.history.present).toEqual(start)
    expect(s.job!.workspace).toBe('drawing')
  })
})
