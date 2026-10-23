// Step pages. For now most are placeholders that show the step's data and what is open; the full
// editors come in later updates. The earlier test tools live here under their steps: AUT CSV import
// (AUT scans) and scan photo folder matching (Images).

import { importAutCsv, replaceScans } from '../data/autCsvImport.ts'
import { LIST_META, type ListKey } from '../data/schema.ts'
import { STEP_IDS, type StepId } from '../state/session.ts'
import { plural, reportEntriesForStep, reportEntriesToCheck, scansWithoutImage, stepInfo, type StepStatus } from '../state/steps.ts'
import { pickWithInput } from '../state/projectFiles.ts'
import { useApp } from './appContext.ts'
import { FieldInput } from './FieldInput.tsx'
import { ImageFolderPanel } from './ImageFolderPanel.tsx'
import { AutReportTable, WorkbookReportTable } from './reports.tsx'

type StepProps = { status: StepStatus }

function ComingSoon({ children }: { children: React.ReactNode }) {
  return <p className="coming-soon">{children}</p>
}

/** What is open on this step, as a short list. */
function StepIssues({ status }: StepProps) {
  if (status.issues.length === 0) return null
  const fix = status.issues.filter((i) => i.blocksExport)
  const check = status.issues.filter((i) => !i.blocksExport)
  return (
    <section className="issues" aria-label="Open items">
      {fix.length > 0 && (
        <>
          <h2>To fix before export ({fix.length})</h2>
          <ul>
            {fix.slice(0, 30).map((i) => (
              <li key={i.text}>{i.text}</li>
            ))}
            {fix.length > 30 && <li>...and {fix.length - 30} more.</li>}
          </ul>
        </>
      )}
      {check.length > 0 && (
        <>
          <h2>To check</h2>
          <ul>
            {check.map((i) => (
              <li key={i.text}>{i.text}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

/** Import report entries for this step's data, with "Mark as checked". */
function ImportReportPart({ step }: { step: StepId }) {
  const app = useApp()
  const wb = app.state.job!.workbookImport
  const all = reportEntriesForStep(wb, step)
  if (!wb || all.length === 0) return null
  const toCheck = reportEntriesToCheck(wb, step)
  const checked = wb.checkedSteps.includes(step)
  return (
    <section>
      <h2>From the Excel job ({wb.fileName})</h2>
      {toCheck.length > 0 ? (
        <>
          <p>
            {plural(toCheck.length, 'value')} could not be read or {toCheck.length === 1 ? 'was' : 'were'} marked for review
            in the workbook. Check {toCheck.length === 1 ? 'it' : 'them'} against the field form, then mark them as checked.
          </p>
          <WorkbookReportTable entries={toCheck} />
          <div className="button-row">
            <button type="button" className="btn" onClick={() => app.dispatch({ type: 'markReportChecked', step })}>
              Mark as checked
            </button>
          </div>
        </>
      ) : (
        <p className="muted">{checked ? 'The values to check here are marked as checked.' : 'Nothing here needs checking.'}</p>
      )}
      <details>
        <summary>Full import report for this step ({all.length})</summary>
        <WorkbookReportTable entries={all} />
      </details>
    </section>
  )
}

export function ProjectStep({ status }: StepProps) {
  return (
    <>
      <StepIssues status={status} />
      <section>
        <h2>Job</h2>
        <div className="field-grid">
          <FieldInput section="project" field="projectName" />
          <FieldInput section="project" field="client" />
          <FieldInput section="project" field="component" />
          <FieldInput section="project" field="unit" />
          <FieldInput section="project" field="inspector" />
          <FieldInput section="project" field="date" />
        </div>
      </section>
      <section>
        <h2>Shell</h2>
        <div className="field-grid">
          <FieldInput section="vessel" field="orientation" />
          <FieldInput section="vessel" field="length" />
          <FieldInput section="vessel" field="height" />
        </div>
      </section>
      <ComingSoon>The other job details and drawing options come in a later update.</ComingSoon>
      <ImportReportPart step="project" />
    </>
  )
}

const FIELD_LISTS: ListKey[] = ['circWelds', 'longSeams', 'shellNozzles', 'objects', 'shellMut', 'headNozzles', 'headMut']

export function FieldDataStep({ status }: StepProps) {
  const p = useApp().state.job!.history.present
  return (
    <>
      <StepIssues status={status} />
      <section>
        <h2>What the job has</h2>
        <table className="counts">
          <thead>
            <tr>
              <th>List</th>
              <th>Items</th>
            </tr>
          </thead>
          <tbody>
            {FIELD_LISTS.map((k) => (
              <tr key={k}>
                <td>{LIST_META[k].name}</td>
                <td className="num">{p[k].length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <ComingSoon>Entering and editing welds, nozzles, objects and MUT readings comes in the next update.</ComingSoon>
      <ImportReportPart step="fieldData" />
    </>
  )
}

export function ScansStep({ status }: StepProps) {
  const app = useApp()
  const job = app.state.job!
  const p = job.history.present
  const last = job.autImport

  async function importCsv() {
    const file = await pickWithInput('.csv,text/csv')
    if (!file) return
    const result = importAutCsv(await file.arrayBuffer())
    app.dispatch({ type: 'setAutImport', fileName: file.name, result })
    if (!result.ok) return
    if (p.scans.length > 0) {
      const answer = await app.ask({
        title: 'Replace the AUT scans?',
        message: (
          <p>
            The job has {plural(p.scans.length, 'scan')}. Importing {file.name} replaces them with {plural(result.scans.length, 'scan')}, and
            the photo links of the old scans are removed. You can undo this.
          </p>
        ),
        buttons: [
          { id: 'replace', label: 'Replace the scans', primary: true },
          { id: 'cancel', label: 'Cancel' },
        ],
        cancelId: 'cancel',
      })
      if (answer !== 'replace') return
    }
    app.edit(`Import AUT scans from ${file.name}`, (proj) => replaceScans(proj, result.scans))
  }

  return (
    <>
      <StepIssues status={status} />
      <div className="button-row">
        <button type="button" className="btn btn-primary" onClick={() => void importCsv()}>
          Import AUT CSV
        </button>
      </div>
      {last && (
        <section>
          <h2>Last import: {last.fileName}</h2>
          <p className={last.result.ok ? '' : 'error'}>
            {last.result.ok
              ? `${plural(last.result.summary.imported, 'scan')} read from ${plural(last.result.summary.rowsRead, 'row')}` +
                (last.result.summary.calibrationRowsSkipped ? `, ${plural(last.result.summary.calibrationRowsSkipped, 'calibration row')} skipped` : '') +
                '.'
              : 'The import stopped and nothing was imported. Fix the CSV and import it again.'}
          </p>
          <AutReportTable entries={last.result.report} />
        </section>
      )}
      <section>
        <h2>Scans ({p.scans.length})</h2>
        {p.scans.length === 0 ? (
          <p className="muted">No scans yet. Import the AUT CSV to add them.</p>
        ) : (
          <div className="table-wrap table-limit">
            <table className="report">
              <thead>
                <tr>
                  <th>Scan</th>
                  <th className="num">X start</th>
                  <th className="num">X stop</th>
                  <th className="num">Y start</th>
                  <th className="num">Y stop</th>
                  <th>Drawn</th>
                </tr>
              </thead>
              <tbody>
                {p.scans.map((s, i) => (
                  <tr key={`${s.id}-${i}`}>
                    <td>{s.id}</td>
                    <td className="num">{s.xStart ?? '-'}</td>
                    <td className="num">{s.xStop ?? '-'}</td>
                    <td className="num">{s.yStart ?? '-'}</td>
                    <td className="num">{s.yStop ?? '-'}</td>
                    <td>{s.include ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <ComingSoon>Editing scans by hand comes in a later update.</ComingSoon>
      <ImportReportPart step="scans" />
    </>
  )
}

export function ImagesStep({ status }: StepProps) {
  const app = useApp()
  const p = app.state.job!.history.present
  if (p.scans.length === 0) {
    return (
      <>
        <p>Import the AUT scans first; then choose the folder with the scan photos here.</p>
        <div className="button-row">
          <button type="button" className="btn" onClick={() => app.goToStep('scans')}>
            Go to AUT scans
          </button>
        </div>
      </>
    )
  }
  const missing = scansWithoutImage(p)
  const included = p.scans.filter((s) => s.include).length
  return (
    <>
      <StepIssues status={status} />
      <p>
        {included - missing.length} of {plural(included, 'scan')} {included - missing.length === 1 ? 'has' : 'have'} a photo.
      </p>
      <ImageFolderPanel
        key={p.scans.map((x) => x.id).join('|')}
        project={p}
        onApply={(next) => app.edit('Link scan photos', () => next)}
      />
      <ImportReportPart step="images" />
    </>
  )
}

export function ReviewStep({ status }: StepProps) {
  const app = useApp()
  const wb = app.state.job!.workbookImport
  return (
    <>
      {status.issues.length === 0 ? (
        <p>{status.state === 'done' ? 'Nothing is open. The job is ready for export.' : 'Nothing entered yet. Start with the Project step.'}</p>
      ) : (
        STEP_IDS.filter((id) => id !== 'review' && id !== 'export').map((id) => {
          const items = status.issues.filter((i) => i.step === id)
          if (items.length === 0) return null
          return (
            <section key={id} className="review-group">
              <div className="review-head">
                <h2>{stepInfo(id).title}</h2>
                <button type="button" className="btn" onClick={() => app.goToStep(id)}>
                  Go to {stepInfo(id).title}
                </button>
              </div>
              <ul>
                {items.slice(0, 20).map((i) => (
                  <li key={i.text}>
                    {i.blocksExport ? <span className="kind kind-invalid">Fix</span> : <span className="kind kind-review">Check</span>} {i.text}
                  </li>
                ))}
                {items.length > 20 && <li>...and {items.length - 20} more.</li>}
              </ul>
            </section>
          )
        })
      )}
      <ComingSoon>Checks on the drawing itself (scans outside the shell, overlapping items) come in a later update.</ComingSoon>
      {wb && (
        <details>
          <summary>Full import report from {wb.fileName} ({wb.report.length})</summary>
          <WorkbookReportTable entries={wb.report} />
        </details>
      )}
    </>
  )
}

export function ExportStep({ status }: StepProps) {
  return (
    <>
      {status.issues.length > 0 ? (
        <section className="issues">
          <h2>Export is blocked until these are fixed ({status.issues.length})</h2>
          <ul>
            {status.issues.slice(0, 30).map((i) => (
              <li key={i.text}>{i.text}</li>
            ))}
            {status.issues.length > 30 && <li>...and {status.issues.length - 30} more.</li>}
          </ul>
        </section>
      ) : (
        <p>Nothing blocks the export.</p>
      )}
      <ComingSoon>Making the CAD drawing file (DraftSight or AutoCAD) comes in a later update.</ComingSoon>
    </>
  )
}
