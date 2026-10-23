// Parts shared by the step pages: the list of what is open on the step (each item jumps to its
// setting or row) and the step's part of the Excel import report with "Mark as checked".

import type { StepId } from '../state/session.ts'
import { plural, reportEntriesForStep, reportEntriesToCheck, type Issue, type StepStatus } from '../state/steps.ts'
import { useApp } from './appContext.ts'
import { WorkbookReportTable } from './reports.tsx'
import { jumpTo } from './placeIds.ts'

export function ComingSoon({ children }: { children: React.ReactNode }) {
  return <p className="coming-soon">{children}</p>
}

function IssueItem({ issue }: { issue: Issue }) {
  const place = issue.check?.place
  return (
    <li>
      {place ? (
        <button type="button" className="link-btn" onClick={() => jumpTo(place)}>
          {issue.text}
        </button>
      ) : (
        issue.text
      )}
    </li>
  )
}

/** What is open on this step. Long lists start folded so the page stays usable. */
export function StepIssues({ status }: { status: StepStatus }) {
  if (status.issues.length === 0) return null
  const fix = status.issues.filter((i) => i.blocksExport)
  const check = status.issues.filter((i) => !i.blocksExport)
  const open = status.issues.length <= 6
  return (
    <section className="issues" aria-label="Open items">
      <details open={open}>
        <summary>
          {fix.length > 0 && <span className="kind kind-invalid">{fix.length} to fix before export</span>}{' '}
          {check.length > 0 && <span className="kind kind-review">{check.length} to check</span>}{' '}
          <span className="muted">(click one to go to it)</span>
        </summary>
        <ul>
          {fix.slice(0, 50).map((i) => (
            <IssueItem key={i.text} issue={i} />
          ))}
          {fix.length > 50 && <li>...and {fix.length - 50} more.</li>}
          {check.map((i) => (
            <IssueItem key={i.text} issue={i} />
          ))}
        </ul>
      </details>
    </section>
  )
}

/** Import report entries for this step's data, with "Mark as checked". */
export function ImportReportPart({ step }: { step: StepId }) {
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
            in the workbook. They are also shown next to their settings and rows above. Check {toCheck.length === 1 ? 'it' : 'them'}{' '}
            against the field form, then mark them as checked.
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
