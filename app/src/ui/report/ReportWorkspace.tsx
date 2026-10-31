// The Report workspace (report design section 5): its own step bar with done / needs attention / not started, a
// "before export" banner, the current step's page and one "Next" button, in the same look as the drawing's, with the
// report pages that step affects beside it (PagesPanel). Shared by every step: the report folders, this computer's saved
// lists and the report as pages.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { applyReportCheckAction } from '../../report/checks.ts'
import { emptySavedLists, loadSavedLists, storeSavedLists, type SavedLists } from '../../report/savedLists.ts'
import {
  REPORT_STEPS,
  nextReportStep,
  reportReviewList,
  reportStepInfo,
  reportStepStatuses,
  reportWhatsLeft,
  type ReportIssue,
  type ReportReviewGroup,
  type ReportStepStatus,
} from '../../state/reportSteps.ts'
import type { ReportStepId } from '../../state/session.ts'
import type { StepState } from '../../state/steps.ts'
import { useApp } from '../appContext.ts'
import { useJobFolders } from '../foldersContext.ts'
import { usePhotoThumbs } from '../preview/usePhotoThumbs.ts'
import { usePreviewPrefs } from '../preview/previewPrefs.ts'
import { ErrorBoundary } from '../ErrorBoundary.tsx'
import { Notices } from '../Notices.tsx'
import { useRememberedFolder } from '../useRememberedFolder.ts'
import { restoreEvents } from '../../state/restore.ts'
import { CalibrationStep } from './CalibrationStep.tsx'
import { ExportStep } from './ExportStep.tsx'
import { ManualStep } from './ManualStep.tsx'
import { PagesPanel } from './PagesView.tsx'
import { PhotosStep } from './PhotosStep.tsx'
import { useGoToIssue } from './places.ts'
import { ReportContext, type ReportShared } from './reportContext.ts'
import { ResultsStep } from './ResultsStep.tsx'
import { SetupStep } from './SetupStep.tsx'
import { SummaryStep } from './SummaryStep.tsx'
import { useReportDocument, useReportPictures, useUploadPdfs } from './useReportPages.ts'

const STATE_ICON: Record<StepState, string> = { done: '✓', attention: '!', notStarted: '○' }
const STATE_TEXT: Record<StepState, string> = { done: 'Done', attention: 'Needs attention', notStarted: 'Not started' }

export type ReportStepProps = { status: ReportStepStatus }

const PAGES: Record<ReportStepId, (props: ReportStepProps) => React.JSX.Element> = {
  setup: SetupStep,
  calibration: CalibrationStep,
  results: ResultsStep,
  manual: ManualStep,
  pages: PhotosStep,
  summary: SummaryStep,
  reportReview: ReportReviewStep,
  reportExport: ExportStep,
}

/** This computer's saved lists, loaded once and written back on every change. */
function useSavedLists() {
  const app = useApp()
  const store = app.browserStore
  const [lists, setLists] = useState<SavedLists>(emptySavedLists)
  const current = useRef(lists)
  // Nothing is written until the stored lists are read: a change made before that waits for them (writing then would
  // put the empty starting lists over the saved ones).
  const loaded = useRef<Promise<void> | null>(null)
  useEffect(() => {
    let alive = true
    loaded.current = loadSavedLists(store).then((l) => {
      current.current = l
      if (alive) setLists(l)
    })
    return () => {
      alive = false
    }
  }, [store])
  const changeLists = useCallback((change: (l: SavedLists) => SavedLists) => {
    void (loaded.current ?? Promise.resolve()).then(() => {
      const next = change(current.current)
      if (next === current.current) return
      current.current = next
      setLists(next)
      void storeSavedLists(store, next).catch(() => {})
    })
  }, [store])
  return { lists, changeLists }
}

export function ReportWorkspace() {
  const app = useApp()
  const job = app.state.job!
  const statuses = useMemo(() => reportStepStatuses(job), [job])
  const step = job.reportStep
  const Page = PAGES[step]
  const next = nextReportStep(step)
  const photos = useRememberedFolder('reportPhotos', 'read')
  const screenshots = useRememberedFolder('screenshots', 'read')
  const { lists, changeLists } = useSavedLists()
  const project = job.history.present
  const sources = useMemo(() => ({ photos: photos.photoFolder, screenshots: screenshots.photoFolder, store: app.browserStore, jobId: project.jobId }),
    [photos.photoFolder, screenshots.photoFolder, app.browserStore, project.jobId])
  const { pictures: imagePictures, retry: retryPictures, loading } = useReportPictures(project, sources)
  const [pdfRetries, setPdfRetries] = useState(0)
  const pdfs = useUploadPdfs(project, sources, pdfRetries)
  // Uploaded PDF pages are drawn in the Pages view like pictures (pdfPageKey).
  const pictures = useMemo(() => (pdfs.pages.size ? new Map([...imagePictures, ...pdfs.pages]) : imagePictures), [imagePictures, pdfs.pages])
  const retry = useCallback(() => {
    retryPictures()
    setPdfRetries((n) => n + 1)
  }, [retryPictures])
  // "Restore files" (RestoreFilesBar) asked the browser: read the pictures that were waiting again.
  useEffect(() => {
    restoreEvents.addEventListener('restored', retry)
    return () => restoreEvents.removeEventListener('restored', retry)
  }, [retry])
  const prefs = usePreviewPrefs()
  const previewHidden = useMemo(() => new Set(prefs.hidden), [prefs.hidden])
  const doc = useReportDocument(project, pictures, previewHidden, pdfs.info)
  const drawingPhotos = useJobFolders().photos
  const sheetThumbs = usePhotoThumbs(project, drawingPhotos.photoFolder, project.settings.generateOverlayDrawing)
  const shared = useMemo<ReportShared>(() => ({ photos, screenshots, savedLists: lists, changeLists, pages: { doc, pictures, sources, retry, pdfInfo: pdfs.info } }),
    [photos, screenshots, lists, changeLists, doc, pictures, sources, retry, pdfs.info])
  const page = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    page.current?.scrollTo(0, 0)
    window.scrollTo(0, 0)
  }, [step])
  const go = (s: ReportStepId) => app.dispatch({ type: 'goToReportStep', step: s })
  return (
    <ReportContext.Provider value={shared}>
      <nav className="stepbar stepbar-report" aria-label="Report steps">
        <ol>
          {REPORT_STEPS.map((s, i) => {
            const st = statuses[s.id]
            return (
              <li key={s.id}>
                <button
                  type="button"
                  className={`step step-${st.state}${s.id === step ? ' step-current' : ''}`}
                  aria-current={s.id === step ? 'step' : undefined}
                  onClick={() => go(s.id)}
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
      <div className="work with-preview">
        <main className="page" ref={page}>
          <ErrorBoundary key={step} where={`Report ${reportStepInfo(step).title} step`} onLeave={{ label: 'Go to the report Review step', action: () => go('reportReview') }}>
            <header className="page-header">
              <h1>{reportStepInfo(step).title}</h1>
              <p className="muted">{reportStepInfo(step).intro}</p>
            </header>
            <Page status={statuses[step]} />
          </ErrorBoundary>
        </main>
        {doc && (
          <ErrorBoundary where="Report pages">
            <PagesPanel doc={doc} pictures={pictures} sheetThumbs={sheetThumbs} step={step} onGo={go} loading={loading} />
          </ErrorBoundary>
        )}
      </div>
      <footer className="page-footer">
        <span className="muted footer-hint">Ctrl+Z undo, Ctrl+Y redo, Ctrl+S save</span>
        {next ? (
          <button type="button" className="btn btn-primary btn-large" onClick={() => go(next)}>
            Next: {reportStepInfo(next).title}
          </button>
        ) : null}
      </footer>
    </ReportContext.Provider>
  )
}

function Banner({ statuses }: { statuses: Record<ReportStepId, ReportStepStatus> }) {
  const app = useApp()
  const left = reportWhatsLeft(statuses)
  const go = (s: ReportStepId) => app.dispatch({ type: 'goToReportStep', step: s })
  if (left.length === 0) {
    return (
      <div className="banner banner-ready" role="status">
        Nothing left to fix in the report data so far.
      </div>
    )
  }
  const shown = left.slice(0, 4)
  return (
    <div className="banner" role="status">
      <span className="banner-label">Before the report:</span>
      {shown.map((l) => (
        <button key={l.text} type="button" className="banner-item" onClick={() => go(l.step)}>
          {l.text}
        </button>
      ))}
      {left.length > shown.length && (
        <button type="button" className="banner-item" onClick={() => go('reportReview')}>
          and {left.length - shown.length} more
        </button>
      )}
    </div>
  )
}

/** What is open on a report step; each item jumps to its row. */
export function ReportStepIssues({ status }: { status: ReportStepStatus }) {
  const goTo = useGoToIssue()
  if (status.issues.length === 0) return null
  const fix = status.issues.filter((i) => i.blocksExport)
  const check = status.issues.filter((i) => !i.blocksExport)
  const item = (i: ReportIssue, n: number) => (
    <li key={`${n}:${i.text}`}>
      {i.check ? (
        <button type="button" className="link-btn" onClick={() => goTo(i)}>
          {i.note ? 'Note: ' : ''}{i.text}
        </button>
      ) : (
        i.text
      )}
    </li>
  )
  return (
    <section className="issues" aria-label="Open items">
      <details open={status.issues.length <= 6}>
        <summary>
          {fix.length > 0 && <span className="kind kind-invalid">{fix.length} to fix before the report</span>}{' '}
          {check.length > 0 && <span className="kind kind-review">{check.length} to check</span>}{' '}
          <span className="muted">(click one to go to it)</span>
        </summary>
        <ul>
          {fix.slice(0, 50).map(item)}
          {fix.length > 50 && <li>...and {fix.length - 50} more.</li>}
          {check.slice(0, 50).map(item)}
        </ul>
      </details>
    </section>
  )
}

function ReviewGroups({ groups, kind }: { groups: ReportReviewGroup[]; kind: 'error' | 'warning' }) {
  const app = useApp()
  const goTo = useGoToIssue()
  return (
    <>
      {groups.map((g) => (
        <section key={g.step} className="review-group">
          <h3>{reportStepInfo(g.step).title}</h3>
          <ul className="review-list">
            {g.issues.map((i, n) => (
              <li key={`${n}:${i.text}`}>
                <span className={`kind ${kind === 'error' ? 'kind-invalid' : i.note ? 'kind-other' : 'kind-review'}`}>{kind === 'error' ? 'Fix' : i.note ? 'Note' : 'Check'}</span>
                <span className="review-text">
                  {i.text}
                  {i.fix && <span className="muted"> {i.fix}</span>}
                </span>
                {i.check?.actions?.map((a) => (
                  <button key={a.label} type="button" className="btn btn-small" onClick={() => app.edit(a.label, (p) => applyReportCheckAction(p, a))}>
                    {a.label}
                  </button>
                ))}
                <button type="button" className="btn btn-small" onClick={() => goTo(i)} title={i.check ? 'Go to the row' : `Go to ${reportStepInfo(i.step).title}`}>
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

/** Every open report check (design 9 and 14): errors first, then warnings and notes, grouped by step in step order. */
function ReportReviewStep({ status }: ReportStepProps) {
  const { errors, warnings } = reportReviewList(status)
  const nErrors = errors.reduce((a, g) => a + g.issues.length, 0)
  const nWarnings = warnings.reduce((a, g) => a + g.issues.length, 0)
  return (
    <>
      {nErrors + nWarnings === 0 ? (
        <div className="notice notice-ready" role="status">
          <p>
            <strong>Nothing is open</strong> in the report data entered so far.
          </p>
        </div>
      ) : (
        <>
          {nErrors > 0 && (
            <section aria-labelledby="report-review-errors">
              <h2 id="report-review-errors">To fix before the report ({nErrors})</h2>
              <p className="muted">The report PDF can't be made until these are fixed.</p>
              <ReviewGroups groups={errors} kind="error" />
            </section>
          )}
          {nWarnings > 0 && (
            <section aria-labelledby="report-review-warnings">
              <h2 id="report-review-warnings">Worth checking ({nWarnings})</h2>
              <p className="muted">These don't stop the report.</p>
              <ReviewGroups groups={warnings} kind="warning" />
            </section>
          )}
        </>
      )}
    </>
  )
}
