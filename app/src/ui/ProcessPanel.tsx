// Images step, part 2: making the processed images. They go into <job folder>\Processed_Images with
// the names the drawing file uses, plus the job marker file. Nothing is replaced without asking, and a
// folder holding another job's images is never touched.

import { useRef, useState } from 'react'
import { createFitter } from '../export/images/fitClient.ts'
import { MARKER_FILE } from '../export/images/marker.ts'
import { checkTargetFolder, planProcessing, processedFolderName, runProcessing, type RunSummary } from '../export/images/process.ts'
import { listFiles, type DirectoryHandleLike } from '../state/folders.ts'
import { jobTitle } from '../state/session.ts'
import { plural } from '../state/steps.ts'
import { useApp } from './appContext.ts'
import { FolderBar } from './PhotoPanel.tsx'
import type { RememberedFolder } from './useRememberedFolder.ts'

async function writeFile(dir: DirectoryHandleLike, name: string, data: Blob | string) {
  const w = await (await dir.getFileHandle(name, { create: true })).createWritable()
  await w.write(data)
  await w.close()
}

export function ProcessPanel({ photos, jobFolder }: { photos: RememberedFolder; jobFolder: RememberedFolder }) {
  const app = useApp()
  const job = app.state.job!
  const p = job.history.present
  const [progress, setProgress] = useState<{ done: number; total: number; current: string } | null>(null)
  const [summary, setSummary] = useState<RunSummary | null>(null)
  const abort = useRef<AbortController | null>(null)
  const folderName = processedFolderName(p.settings.processedImageFolder)
  const plan = planProcessing(p, photos.photoFolder?.names ?? null)
  const canWrite = jobFolder.canPick

  async function say(title: string, text: string) {
    await app.ask({ title, message: <p>{text}</p>, buttons: [{ id: 'ok', label: 'OK', primary: true }], cancelId: 'ok' })
  }

  async function run() {
    const root = jobFolder.handle
    const photoFolder = photos.photoFolder
    if (!root || !photoFolder) return
    if (plan.jobs.length === 0) {
      await say('Nothing to process', 'No scan has a photo in the photo folder yet. Match the photos to the scans first.')
      return
    }
    // Look at the folder first; nothing is written before the questions are answered.
    let names: string[] = []
    let marker: string | null = null
    try {
      const dir = await root.getDirectoryHandle(folderName)
      names = await listFiles(dir)
      const markerName = names.find((n) => n.toLowerCase() === MARKER_FILE.toLowerCase())
      if (markerName) marker = await (await (await dir.getFileHandle(markerName)).getFile()).text()
    } catch {
      // No such folder yet: it is made below.
    }
    const check = checkTargetFolder(names, marker, p.jobId, plan, jobTitle(job))
    if (check.kind === 'otherJob') {
      await say(
        'This folder belongs to another job',
        `${root.name}\\${folderName} already holds the processed images of "${check.marker.jobName || 'another job'}". Nothing was changed. Choose this job's own folder.`,
      )
      return
    }
    let keep = new Set<string>()
    if (check.existing.length > 0 || check.unmarked) {
      const answer = await app.ask<'replace' | 'keep' | 'cancel'>({
        title: check.existing.length > 0 ? 'Replace the processed images?' : 'Add to this folder?',
        message: (
          <>
            {check.existing.length > 0 && (
              <p>
                {plural(check.existing.length, 'processed image')} of this job {check.existing.length === 1 ? 'is' : 'are'} already in {folderName} (from an
                earlier run).
              </p>
            )}
            {check.unmarked && <p>{folderName} also has files AxisBuilder did not make (perhaps from the Excel version). They are left as they are.</p>}
          </>
        ),
        buttons:
          check.existing.length > 0
            ? [
                { id: 'replace', label: 'Replace them', primary: true },
                { id: 'keep', label: 'Keep the existing ones' },
                { id: 'cancel', label: 'Cancel' },
              ]
            : [
                { id: 'replace', label: 'Continue', primary: true },
                { id: 'cancel', label: 'Cancel' },
              ],
        cancelId: 'cancel',
      })
      if (answer === 'cancel') return
      if (answer === 'keep') keep = new Set(check.existing)
    }

    setSummary(null)
    const controller = new AbortController()
    abort.current = controller
    setProgress({ done: 0, total: plan.jobs.length - keep.size, current: '' })
    const fitter = createFitter()
    try {
      const dir = await root.getDirectoryHandle(folderName, { create: true })
      const result = await runProcessing({
        plan,
        keep,
        maxSide: p.settings.maxImageSide,
        marker: { jobId: p.jobId, jobName: jobTitle(job) },
        io: {
          readPhoto: async (name) => {
            const f = await photoFolder.getFile(name)
            if (!f) throw new Error('not found')
            return f
          },
          fit: fitter.fit,
          write: (name, data) => writeFile(dir, name, data),
        },
        onProgress: (done, total, current) => setProgress({ done, total, current }),
        signal: controller.signal,
      })
      setSummary(result)
    } catch (err) {
      await say('The images were not processed', `The folder could not be written: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      fitter.close()
      setProgress(null)
      abort.current = null
      void jobFolder.refresh()
    }
  }

  return (
    <section className="process-panel">
      <h2>Processed images</h2>
      <p className="muted">
        Each photo is stretched in one direction only, to the exact shape of its scan, keeping its own detail (very large ones are scaled down to the
        size limit, but never below the size the Excel version made). They are written to the job folder, in {folderName}, where the drawing file looks for them. Save the CAD drawing in the job folder
        too.
      </p>
      {!canWrite ? (
        <p className="coming-soon">Making the processed images needs Edge or Chrome: this browser can't write files into a folder.</p>
      ) : (
        <>
          <FolderBar folder={jobFolder} label="Job folder" chooseLabel="Choose job folder" what="writing to" />
          <p>
            {plural(plan.jobs.length, 'photo')} ready to process
            {plan.skipped.length > 0 ? `, ${plural(plan.skipped.length, 'scan')} without one (see below)` : ''}.
          </p>
          {progress ? (
            <div className="progress-row" role="status">
              <progress value={progress.done} max={Math.max(1, progress.total)} />
              <span>
                {progress.done} of {progress.total}
                {progress.current ? `: ${progress.current}` : ''}
              </span>
              <button type="button" className="btn" onClick={() => abort.current?.abort()}>
                Cancel
              </button>
            </div>
          ) : (
            <div className="button-row">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void run()}
                disabled={jobFolder.status !== 'ready' || !photos.photoFolder || plan.jobs.length === 0}
              >
                Process images
              </button>
              {jobFolder.status !== 'ready' && <span className="muted">Choose the job folder first.</span>}
              {jobFolder.status === 'ready' && !photos.photoFolder && <span className="muted">Open the photo folder first.</span>}
            </div>
          )}
          {summary && <Summary summary={summary} folder={`${jobFolder.name}\\${folderName}`} />}
          {!summary && plan.skipped.length > 0 && (
            <details>
              <summary>Scans without a processed image ({plan.skipped.length})</summary>
              <ul className="paste-list">
                {plan.skipped.map((s) => (
                  <li key={s.scanId}>
                    {s.scanId}: {s.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  )
}

function Summary({ summary, folder }: { summary: RunSummary; folder: string }) {
  const capped = summary.processed.filter((x) => x.capped && !x.raised).length
  const raised = summary.processed.filter((x) => x.raised).length
  return (
    <div className={`notice${summary.failed.length ? ' notice-error' : ''}`} role="status">
      <p>
        <strong>{summary.cancelled ? 'Stopped.' : 'Done.'}</strong> {plural(summary.processed.length, 'image')} written to {folder}
        {capped || raised
          ? ` (${[capped ? `${capped} scaled down to the size limit` : '', raised ? `${raised} made larger, to at least the Excel version's size` : ''].filter(Boolean).join(', ')})`
          : ''}; {summary.skipped.length} skipped; {summary.failed.length} failed.
      </p>
      {summary.failed.length > 0 && (
        <ul className="paste-list">
          {summary.failed.map((f) => (
            <li key={f.scanId} className="msg-error">
              {f.scanId}: {f.reason}
            </li>
          ))}
        </ul>
      )}
      {summary.skipped.length > 0 && (
        <details>
          <summary>Skipped ({summary.skipped.length})</summary>
          <ul className="paste-list">
            {summary.skipped.map((s) => (
              <li key={s.scanId}>
                {s.scanId}: {s.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
