// "Job files" on the drawing's and the report's Export steps: every folder and file the job uses, where it is in this
// browser and whether it can be read, with Restore files, Find files... and a Choose folder / Go to per group
// (ui/useJobFiles.ts). A per-file button is only needed for a file that is really missing.

import type { JobFilesGroup, JobFilesGroupId } from '../state/restore.ts'
import type { ReportStepId, StepId } from '../state/session.ts'
import { REPORT_ENABLED } from '../featureFlags.ts'
import { useApp } from './appContext.ts'
import { useJobFiles } from './useJobFiles.ts'

/** Where the files of a group are chosen. */
const GO_TO: Record<JobFilesGroupId, { drawing?: StepId; report?: ReportStepId; label: string } | null> = {
  photos: { drawing: 'images', label: 'Images step' },
  reportPhotos: { report: 'pages', label: 'Photos and pages' },
  screenshots: { report: 'results', label: 'AUT results' },
  cover: { report: 'setup', label: 'Setup' },
  calibration: { report: 'calibration', label: 'Calibration' },
  uploads: { report: 'pages', label: 'Photos and pages' },
  job: null,
}

const listNames = (names: string[]) => `${names.slice(0, 5).join(', ')}${names.length > 5 ? ` and ${names.length - 5} more` : ''}`

function stateText(g: JobFilesGroup): { text: string; kind: 'ok' | 'warn' | 'error' | 'muted' } {
  const total = g.files.length
  const ok = g.files.filter((f) => f.state === 'ok').length
  const missing = g.files.filter((f) => f.state === 'missing').map((f) => f.name)
  if (g.state === 'notChosen') return { text: 'Not chosen yet', kind: 'muted' }
  if (g.state === 'waiting') return { text: "Waiting for the browser's OK", kind: 'warn' }
  if (g.folder === 'lost') return { text: `${g.folderName} can't be opened any more (moved, renamed or deleted?)`, kind: 'error' }
  if (g.state === 'missing') return { text: `${ok} of ${total} found. Not found: ${listNames(missing)}`, kind: 'error' }
  return { text: total === 0 ? 'Ready' : total === 1 ? 'Found' : `All ${total} found`, kind: 'ok' }
}

export function JobFilesPanel() {
  const app = useApp()
  const f = useJobFiles()
  const go = (id: JobFilesGroupId) => {
    const to = GO_TO[id]
    if (to?.drawing) app.goToStep(to.drawing)
    else if (to?.report) app.dispatch({ type: 'goToReportStep', step: to.report })
  }
  return (
    <section className="export-card job-files">
      <h2>Job files</h2>
      <p className="muted">
        Every photo, screenshot and file this job uses, and whether this browser can read it. The job file keeps only their
        names; the files stay where you keep them.
      </p>
      {!f.groups ? (
        <p className="muted">Looking...</p>
      ) : (
        <>
          <div className="button-row">
            {f.waitingCount > 0 && (
              <button type="button" className="btn btn-primary" disabled={f.busy} onClick={() => void f.restore()}
                title="The browser asks once for each folder and each file picked on its own">
                Restore files
              </button>
            )}
            <button type="button" className={f.waitingCount === 0 && f.missingCount > 0 ? 'btn btn-primary' : 'btn'} disabled={f.busy}
              onClick={() => void f.find()} title="Searches the folder you pick and its subfolders for files not found, by name">
              Find files...
            </button>
            {f.busy && f.searched > 0 && <span className="muted">Searching... {f.searched} folders so far.</span>}
          </div>
          {f.note && <p className="msg">{f.note}</p>}
          <table className="data-table job-files-table">
            <thead>
              <tr>
                <th scope="col">What</th>
                <th scope="col">Where</th>
                <th scope="col">State</th>
                <th scope="col"><span className="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {f.groups.map((g) => {
                const st = stateText(g)
                const to = GO_TO[g.id]
                const showGo = to && (to.drawing || REPORT_ENABLED)
                return (
                  <tr key={g.id}>
                    <td>{g.what}</td>
                    <td>{g.folderName || (g.folderKind ? <span className="muted">no folder</span> : <span className="muted">picked one by one</span>)}</td>
                    <td className={`job-files-${st.kind}`}>{st.text}</td>
                    <td className="button-row">
                      {g.folderKind && (
                        <button type="button" className="btn btn-small" onClick={() => void f.chooseFolder(g)}>
                          {g.folder === 'none' ? 'Choose folder...' : 'Change folder...'}
                        </button>
                      )}
                      {showGo && (
                        <button type="button" className="btn btn-small" onClick={() => go(g.id)} title={`Where these are chosen: ${to.label}`}>
                          Go to
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}
