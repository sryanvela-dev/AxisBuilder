// Step pages for Review and Export (Project and Field data are in projectSteps.tsx, AUT scans and
// Images in scanSteps.tsx).

import { STEP_IDS } from '../state/session.ts'
import { stepInfo, type StepStatus } from '../state/steps.ts'
import { useApp } from './appContext.ts'
import { WorkbookReportTable } from './reports.tsx'
import { ComingSoon } from './stepParts.tsx'

type StepProps = { status: StepStatus }

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
