// Step page for Review (Project, Field data and Drawing are in projectSteps.tsx, AUT scans and Images in
// scanSteps.tsx, Export in exportStep.tsx).

import { reviewList, stepInfo, type ReviewGroup, type StepStatus } from '../state/steps.ts'
import { useApp } from './appContext.ts'
import { useGoToIssue } from './goToIssue.ts'
import { WorkbookReportTable } from './reports.tsx'

type StepProps = { status: StepStatus }

function Groups({ groups, kind }: { groups: ReviewGroup[]; kind: 'error' | 'warning' }) {
  const goTo = useGoToIssue()
  return (
    <>
      {groups.map((g) => (
        <section key={g.step} className="review-group">
          <h3>{stepInfo(g.step).title}</h3>
          <ul className="review-list">
            {g.issues.map((i, n) => (
              <li key={`${n}:${i.text}`}>
                <span className={`kind ${kind === 'error' ? 'kind-invalid' : 'kind-review'}`}>{kind === 'error' ? 'Fix' : 'Check'}</span>
                <span className="review-text">{i.text}</span>
                <button type="button" className="btn btn-small" onClick={() => goTo(i)} title={i.check ? 'Go to the field or row' : `Go to ${stepInfo(i.step).title}`}>
                  Go to
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  )
}

export function ReviewStep({ status }: StepProps) {
  const app = useApp()
  const wb = app.state.job!.workbookImport
  const { errors, warnings } = reviewList(status)
  const nErrors = errors.reduce((a, g) => a + g.issues.length, 0)
  const nWarnings = warnings.reduce((a, g) => a + g.issues.length, 0)
  return (
    <>
      {status.state === 'notStarted' ? (
        <p>Nothing entered yet. Start with the Project step.</p>
      ) : nErrors + nWarnings === 0 ? (
        <div className="notice notice-ready" role="status">
          <p>
            <strong>Ready to export.</strong> Nothing is open.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => app.goToStep('export')}>
            Go to Export
          </button>
        </div>
      ) : (
        <>
          {nErrors > 0 ? (
            <section aria-labelledby="review-errors">
              <h2 id="review-errors">To fix before export ({nErrors})</h2>
              <p className="muted">The PDF and the CAD drawing can't be made until these are fixed.</p>
              <Groups groups={errors} kind="error" />
            </section>
          ) : (
            <div className="notice notice-ready" role="status">
              <p>
                <strong>Ready to export.</strong> Nothing blocks it; the points below are only worth a look.
              </p>
              <button type="button" className="btn btn-primary" onClick={() => app.goToStep('export')}>
                Go to Export
              </button>
            </div>
          )}
          {nWarnings > 0 && (
            <section aria-labelledby="review-warnings">
              <h2 id="review-warnings">Worth checking ({nWarnings})</h2>
              <p className="muted">These don't stop the export.</p>
              <Groups groups={warnings} kind="warning" />
            </section>
          )}
        </>
      )}
      {wb && (
        <details>
          <summary>Full import report from {wb.fileName} ({wb.report.length})</summary>
          <WorkbookReportTable entries={wb.report} />
        </details>
      )}
    </>
  )
}
