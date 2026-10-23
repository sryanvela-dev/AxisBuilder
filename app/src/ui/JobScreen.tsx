// The screen while a job is open: top bar (save, undo), step bar, "before export" banner, the
// current step's page and its main "Next" button.

import { useMemo } from 'react'
import { isDirty, jobTitle, type StepId } from '../state/session.ts'
import { nextStep, stepInfo, stepStatuses, STEPS, whatsLeft, type StepState, type StepStatus } from '../state/steps.ts'
import { useApp } from './appContext.ts'
import { ErrorBoundary } from './ErrorBoundary.tsx'
import { copyText } from './errorDetails.ts'
import { ExportStep, FieldDataStep, ImagesStep, ProjectStep, ReviewStep, ScansStep } from './steps.tsx'

const STATE_ICON: Record<StepState, string> = { done: '✓', attention: '!', notStarted: '○' }
const STATE_TEXT: Record<StepState, string> = { done: 'Done', attention: 'Needs attention', notStarted: 'Not started' }

const PAGES: Record<StepId, (props: { status: StepStatus }) => React.JSX.Element> = {
  project: ProjectStep,
  fieldData: FieldDataStep,
  scans: ScansStep,
  images: ImagesStep,
  review: ReviewStep,
  export: ExportStep,
}

export function JobScreen() {
  const app = useApp()
  const job = app.state.job!
  const statuses = useMemo(() => stepStatuses(job), [job])
  const step = job.step
  const Page = PAGES[step]
  const next = nextStep(step)
  return (
    <div className="job">
      <TopBar />
      <nav className="stepbar" aria-label="Steps">
        <ol>
          {STEPS.map((s, i) => {
            const st = statuses[s.id]
            return (
              <li key={s.id}>
                <button
                  type="button"
                  className={`step step-${st.state}${s.id === step ? ' step-current' : ''}`}
                  aria-current={s.id === step ? 'step' : undefined}
                  onClick={() => app.goToStep(s.id)}
                  title={`${s.title}: ${STATE_TEXT[st.state]}`}
                >
                  <span className="step-icon" aria-hidden="true">
                    {STATE_ICON[st.state]}
                  </span>
                  <span className="step-text">
                    <span className="step-title">
                      {i + 1}. {s.title}
                    </span>
                    <span className="step-state">
                      <span className="visually-hidden">{STATE_TEXT[st.state]}: </span>
                      {st.short}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>
      <Banner statuses={statuses} />
      <Notices />
      <main className="page">
        <ErrorBoundary key={step} where={`${stepInfo(step).title} step`} onLeave={{ label: 'Go to the Review step', action: () => app.goToStep('review') }}>
          <header className="page-header">
            <h1>{stepInfo(step).title}</h1>
            <p className="muted">{stepInfo(step).intro}</p>
          </header>
          <Page status={statuses[step]} />
        </ErrorBoundary>
      </main>
      <footer className="page-footer">
        <span className="muted footer-hint">Ctrl+Z undo, Ctrl+Y redo, Ctrl+S save</span>
        {next ? (
          <button type="button" className="btn btn-primary btn-large" onClick={() => app.goToStep(next)}>
            Next: {stepInfo(next).title}
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-large" disabled title="Comes in a later update">
            Make CAD drawing (coming soon)
          </button>
        )}
      </footer>
    </div>
  )
}

function TopBar() {
  const app = useApp()
  const job = app.state.job!
  const dirty = isDirty(job)
  return (
    <header className="topbar">
      <span className="brand">AxisBuilder</span>
      <span className="job-name">
        <strong>{jobTitle(job)}</strong>
        <span className={dirty ? 'save-state unsaved' : 'save-state'}>
          {dirty ? (job.file ? 'Unsaved changes' : 'Not saved yet') : `Saved${job.file ? ` in ${job.file.name}` : ''}`}
        </span>
      </span>
      <span className="topbar-actions">
        <button type="button" className="btn" onClick={app.undo} disabled={!app.canUndo} title={app.undoLabel ? `Undo: ${app.undoLabel} (Ctrl+Z)` : 'Nothing to undo'}>
          Undo
        </button>
        <button type="button" className="btn" onClick={app.redo} disabled={!app.canRedo} title={app.redoLabel ? `Redo: ${app.redoLabel} (Ctrl+Y)` : 'Nothing to redo'}>
          Redo
        </button>
        <button type="button" className="btn btn-primary" onClick={() => void app.save()} title="Save (Ctrl+S)">
          Save
        </button>
        <button type="button" className="btn" onClick={() => void app.save(true)} title="Save as a new file (Ctrl+Shift+S)">
          Save as...
        </button>
        <button type="button" className="btn" onClick={() => void app.closeJob()}>
          Close job
        </button>
      </span>
    </header>
  )
}

function Banner({ statuses }: { statuses: Record<StepId, StepStatus> }) {
  const app = useApp()
  const left = whatsLeft(statuses)
  if (left.length === 0) {
    return (
      <div className="banner banner-ready" role="status">
        Nothing left to fix: ready for export.
      </div>
    )
  }
  const shown = left.slice(0, 4)
  return (
    <div className="banner" role="status">
      <span className="banner-label">Before export:</span>
      {shown.map((l) => (
        <button key={l.text} type="button" className="banner-item" onClick={() => app.goToStep(l.step)}>
          {l.text}
        </button>
      ))}
      {left.length > shown.length && (
        <button type="button" className="banner-item" onClick={() => app.goToStep('review')}>
          and {left.length - shown.length} more
        </button>
      )}
    </div>
  )
}

export function Notices() {
  const app = useApp()
  return (
    <>
      {app.notice && (
        <div className={`toast toast-${app.notice.kind}`} role={app.notice.kind === 'error' ? 'alert' : 'status'}>
          <span>{app.notice.text}</span>
          <button type="button" className="btn btn-small" onClick={app.dismissNotice}>
            OK
          </button>
        </div>
      )}
      {app.backgroundError && <BackgroundError details={app.backgroundError} onClose={app.dismissBackgroundError} />}
    </>
  )
}

function BackgroundError({ details, onClose }: { details: string; onClose: () => void }) {
  return (
    <div className="toast toast-error" role="alert">
      <span>Something went wrong in the background. Your work is kept; you can carry on.</span>
      <span className="button-row">
        <button
          type="button"
          className="btn btn-small"
          onClick={() => void copyText(details)}
        >
          Copy error details
        </button>
        <button type="button" className="btn btn-small" onClick={onClose}>
          OK
        </button>
      </span>
    </div>
  )
}
