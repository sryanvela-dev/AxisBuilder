// Start screen (no job open): new, open, import, sample, recent jobs and unsaved work to restore.
// While an Excel import is waiting, its report is shown first (ImportReview).

import { LIST_META, type ListKey } from '../data/schema.ts'
import { useApp } from './appContext.ts'
import { appVersion } from './errorDetails.ts'
import { HelpButton } from './HelpGuide.tsx'
import { Wordmark } from './logo.tsx'
import { WorkbookReportTable } from './reports.tsx'

function when(ms: number): string {
  const d = new Date(ms)
  const today = new Date()
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return d.toDateString() === today.toDateString() ? `today ${time}` : `${d.toLocaleDateString()} ${time}`
}

export function StartScreen() {
  const app = useApp()
  if (app.pendingImport) return <ImportReview />
  return (
    <main className="start">
      <header className="start-hero">
        <h1 className="start-logo">
          <Wordmark />
        </h1>
        <p className="start-tagline">AUT scan coverage drawings for pressure vessels and tanks, from the field form to the finished PDF.</p>
        <p className="muted start-meta">
          Version {appVersion()} · Works offline · Your jobs stay on this computer
        </p>
        <HelpButton where="Start screen" className="btn start-help" />
      </header>

      {app.recoveries.length > 0 && (
        <section className="recovery" aria-label="Unsaved work">
          <h2>Unsaved work found</h2>
          <p>AxisBuilder was closed before these changes were saved. Restore to carry on where you left off.</p>
          <ul className="plain-list">
            {app.recoveries.map((r) => (
              <li key={r.tabId} className="recovery-item">
                <span>
                  <strong>{r.title}</strong> <span className="muted">(last change {when(r.savedAt)})</span>
                </span>
                <span className="button-row">
                  <button type="button" className="btn btn-primary" onClick={() => app.restore(r)}>
                    Restore
                  </button>
                  <button type="button" className="btn" onClick={() => void app.discard(r)}>
                    Discard
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="start-grid">
        <section className="start-actions" aria-label="Start">
          <button type="button" className="start-card start-card-main" onClick={app.newJob}>
            <strong>New job</strong>
            <span>Start with an empty job and fill it in step by step.</span>
          </button>
          <button type="button" className="start-card" onClick={() => void app.openFromDisk()}>
            <strong>Open job</strong>
            <span>Open an AxisBuilder job file (.axb).</span>
          </button>
          <button type="button" className="start-card" onClick={() => void app.importExcel()} disabled={!!app.busy}>
            <strong>Import old Excel job</strong>
            <span>Bring in a job from the AxisBuilder Excel workbook (.xlsm). You see what was imported first.</span>
          </button>
          <button type="button" className="start-card" onClick={() => void app.openSample()}>
            <strong>Open sample job</strong>
            <span>A finished job with photos that shows every feature. Try things out; nothing is saved unless you save it.</span>
          </button>
          {app.busy && <p className="muted">{app.busy}</p>}
        </section>

        <section className="recent" aria-labelledby="recent-title">
          <h2 id="recent-title">Recent jobs</h2>
          {app.recent.length === 0 ? (
            <p className="muted">Jobs you open or save appear here.</p>
          ) : (
            <ul className="plain-list">
              {app.recent.map((r) => (
                <li key={`${r.fileName}-${r.openedAt}`} className="recent-item">
                  <button type="button" className="recent-open" onClick={() => void app.openRecent(r)}>
                    <strong>{r.title}</strong>
                    <span className="muted">
                      {r.fileName} · opened {when(r.openedAt)}
                      {r.handle ? '' : ' (you pick the file again)'}
                    </span>
                  </button>
                  <button type="button" className="btn btn-small" onClick={() => void app.forgetRecent(r)} aria-label={`Remove ${r.title} from the list`} title="Remove from this list (the file is not deleted)">
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {!app.recoveryAvailable && (
        <p className="muted">This browser can't keep a recovery copy (private window?). Save your work often.</p>
      )}
    </main>
  )
}

function ImportReview() {
  const app = useApp()
  const { fileName, result } = app.pendingImport!
  const s = result.summary
  const toFix = [...s.missingData, ...s.duplicateIds]
  const toCheck = result.report.filter((e) => e.kind === 'invalid' || e.kind === 'review').length
  return (
    <main className="start">
      <header className="start-header">
        <h1>Import old Excel job</h1>
        <p className="muted">
          {fileName}: check what was imported, then continue. Nothing is changed in the workbook.
        </p>
      </header>
      <section>
        <dl className="facts">
          <dt>Project</dt>
          <dd>{result.project.project.projectName || '(no name)'}</dd>
          <dt>Settings and job information found</dt>
          <dd>
            {s.fieldsFound} of {s.fieldsTotal}
          </dd>
          <dt>Values to check</dt>
          <dd>{toCheck}</dd>
          <dt>To fix before export</dt>
          <dd>{toFix.length}</dd>
        </dl>
        <table className="counts">
          <thead>
            <tr>
              <th>Section</th>
              <th>Rows imported</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(s.counts) as ListKey[]).map((k) => (
              <tr key={k}>
                <td>{LIST_META[k].name}</td>
                <td className="num">{s.counts[k]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {toFix.length > 0 && (
        <section>
          <h2>To fix before export ({toFix.length})</h2>
          <ul>
            {toFix.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h2>Import report ({result.report.length})</h2>
        <WorkbookReportTable entries={result.report} />
      </section>
      <div className="sticky-actions">
        <button type="button" className="btn" onClick={app.cancelImport}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary btn-large" onClick={app.continueImport}>
          Continue with this job
        </button>
      </div>
    </main>
  )
}
