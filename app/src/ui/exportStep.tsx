// The Export step: the job folder, then the PDF and the report images (the main way, from the app's own
// sheets) and the CAD drawing file (.lsp, the backup way). Everything refuses while there are errors, asks
// before replacing a file, and ends with a plain summary of what was written where.

import { useState, type ReactNode } from 'react'
import { MARKER_FILE } from '../export/images/marker.ts'
import { createFitter } from '../export/images/fitClient.ts'
import { checkTargetFolder, planProcessing, pngSize, processedFolderName, runProcessing, staleJobs, type ExistingImage } from '../export/images/process.ts'
import { exportBaseName } from '../export/files.ts'
import { exportLsp } from '../export/lsp/exportLsp.ts'
import { lspBytes } from '../export/lsp/lspBytes.ts'
import { listFiles, type DirectoryHandleLike } from '../state/folders.ts'
import { jobTitle } from '../state/session.ts'
import { plural, type StepStatus } from '../state/steps.ts'
import { useApp } from './appContext.ts'
import { useJobFolders } from './foldersContext.ts'
import { FolderBar } from './PhotoPanel.tsx'
import { SettingsGroup } from './SettingsForm.tsx'
import { writeFile, okToReplace } from './writeFiles.ts'
import { ExportPdfPanel } from './exportPdf.tsx'

type StepProps = { status: StepStatus }

/** What one export wrote, for the summary. */
export interface Written {
  title: string
  folder: string
  files: string[]
  notes: string[]
}

export function WrittenSummary({ w, children }: { w: Written; children?: ReactNode }) {
  return (
    <div className="notice notice-ready" role="status">
      <p>
        <strong>{w.title}</strong> {w.files.length ? `${plural(w.files.length, 'file')} written to ${w.folder}:` : 'Nothing was written.'}
      </p>
      {w.files.length > 0 && (
        <ul className="paste-list">
          {w.files.slice(0, 20).map((f) => (
            <li key={f}>{f}</li>
          ))}
          {w.files.length > 20 && <li>...and {w.files.length - 20} more</li>}
        </ul>
      )}
      {w.notes.map((n) => (
        <p key={n} className="muted">
          {n}
        </p>
      ))}
      {children}
    </div>
  )
}

export function ExportStep({ status }: StepProps) {
  const app = useApp()
  const { jobFolder } = useJobFolders()
  const blocked = status.issues.length
  const ready = jobFolder.status === 'ready' && jobFolder.handle !== null
  return (
    <>
      {blocked > 0 ? (
        <div className="notice notice-error" role="alert">
          <p>
            <strong>Nothing can be exported yet:</strong> {plural(blocked, 'thing')} must be fixed first.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => app.goToStep('review')}>
            See them on the Review step
          </button>
        </div>
      ) : (
        <p>Nothing blocks the export.</p>
      )}
      <section className="export-folder">
        <h2>Job folder</h2>
        <p className="muted">Everything is written here: the PDF, the report images, and the CAD drawing file with its processed images.</p>
        {jobFolder.canPick ? (
          <FolderBar folder={jobFolder} label="Job folder" chooseLabel="Choose job folder" what="writing to" />
        ) : (
          <p className="coming-soon">Writing into a folder needs Edge or Chrome.</p>
        )}
      </section>
      <ExportPdfPanel disabled={blocked > 0 || !ready} />
      <LspPanel disabled={blocked > 0 || !ready} />
      <SettingsGroup group="export" step="export" />
    </>
  )
}

/** "Make CAD drawing (.lsp)": the backup way. Processes missing or out-of-date images first, then writes the .lsp. */
function LspPanel({ disabled }: { disabled: boolean }) {
  const app = useApp()
  const job = app.state.job!
  const p = job.history.present
  const { photos, jobFolder } = useJobFolders()
  const [busy, setBusy] = useState<string | null>(null)
  const [written, setWritten] = useState<Written | null>(null)
  const folderName = processedFolderName(p.settings.processedImageFolder)
  const fileName = `${exportBaseName(jobTitle(job))}.lsp`
  const cad = p.settings.cadPlatform

  async function say(title: string, text: string) {
    await app.ask({ title, message: <p>{text}</p>, buttons: [{ id: 'ok', label: 'OK', primary: true }], cancelId: 'ok' })
  }

  async function run() {
    const root = jobFolder.handle
    if (!root) return
    const notes: string[] = []
    const files: string[] = []
    setWritten(null)
    try {
      // 1. Processed images: the ones missing or out of date (photo changed, or the scan's shape).
      if (p.settings.generateOverlayDrawing) {
        const photoFolder = photos.photoFolder
        const plan = planProcessing(p, photoFolder?.names ?? null)
        if (!photoFolder) notes.push('The photo folder is not open, so no images were processed. Open it on the Images step to include the photos.')
        else if (plan.jobs.length > 0) {
          setBusy('Checking the processed images...')
          const result = await processStale(root, folderName, plan, photoFolder)
          if (result === 'cancel') return
          if (typeof result === 'string') {
            await say('The drawing file was not made', result)
            return
          }
          files.push(...result.written.map((n) => `${folderName}\\${n}`))
          notes.push(...result.notes)
        }
      }
      // 2. The .lsp itself.
      setBusy('Writing the drawing file...')
      const text = exportLsp(p, { relativeImages: { folderName } })
      if (!(await okToReplace(app, root, [fileName]))) {
        notes.push(`${fileName} was kept as it was.`)
      } else {
        await writeFile(root, { name: fileName, data: lspBytes(text) })
        files.push(fileName)
      }
      setWritten({ title: 'CAD drawing file made.', folder: root.name, files, notes })
    } catch (err) {
      await say('The drawing file was not made', err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
      void jobFolder.refresh()
    }
  }

  /** Processes the images that are missing or out of date; a string = why it stopped, 'cancel' = the user stopped it. */
  async function processStale(
    root: DirectoryHandleLike,
    folder: string,
    plan: ReturnType<typeof planProcessing>,
    photoFolder: NonNullable<typeof photos.photoFolder>,
  ): Promise<{ written: string[]; notes: string[] } | string | 'cancel'> {
    let names: string[] = []
    let marker: string | null = null
    let dir: DirectoryHandleLike | null = null
    try {
      dir = await root.getDirectoryHandle(folder)
      names = await listFiles(dir)
      const markerName = names.find((n) => n.toLowerCase() === MARKER_FILE.toLowerCase())
      if (markerName) marker = await (await (await dir.getFileHandle(markerName)).getFile()).text()
    } catch {
      // No folder yet.
    }
    const check = checkTargetFolder(names, marker, p.jobId, plan)
    if (check.kind === 'otherJob') return `${root.name}\\${folder} holds the processed images of "${check.marker.jobName || 'another job'}". Nothing was changed.`
    const existing = new Map<string, ExistingImage>()
    if (dir) {
      for (const n of check.existing) {
        const f = await (await dir.getFileHandle(n)).getFile()
        const size = pngSize(new Uint8Array(await f.slice(0, 24).arrayBuffer()))
        if (size) existing.set(n.toLowerCase(), { lastModified: f.lastModified, ...size })
      }
    }
    const photoTimes = new Map<string, number>()
    for (const j of plan.jobs) {
      const f = await photoFolder.getFile(j.photoName)
      if (f) photoTimes.set(j.photoName, f.lastModified)
    }
    const stale = staleJobs(plan, existing, photoTimes)
    const upToDate = plan.jobs.length - stale.length
    if (stale.length === 0) return { written: [], notes: [`All ${plural(plan.jobs.length, 'processed image')} were up to date.`] }
    const replacing = stale.filter((j) => existing.has(j.outName.toLowerCase()))
    if (replacing.length > 0) {
      const answer = await app.ask<'replace' | 'keep' | 'cancel'>({
        title: 'Replace out-of-date processed images?',
        message: (
          <p>
            {plural(replacing.length, 'processed image')} in {folder} {replacing.length === 1 ? 'is' : 'are'} older than {replacing.length === 1 ? 'its photo' : 'their photos'}, or
            no longer the shape of {replacing.length === 1 ? 'its scan' : 'their scans'}.
          </p>
        ),
        buttons: [
          { id: 'replace', label: 'Replace them', primary: true },
          { id: 'keep', label: 'Keep them' },
          { id: 'cancel', label: 'Cancel' },
        ],
        cancelId: 'cancel',
      })
      if (answer === 'cancel') return 'cancel'
      if (answer === 'keep') stale.splice(0, stale.length, ...stale.filter((j) => !existing.has(j.outName.toLowerCase())))
    }
    setBusy(`Processing ${plural(stale.length, 'image')}...`)
    const fitter = createFitter()
    try {
      const out = await root.getDirectoryHandle(folder, { create: true })
      const result = await runProcessing({
        plan: { jobs: stale, skipped: [] },
        keep: new Set(),
        maxSide: p.settings.maxImageSide,
        marker: { jobId: p.jobId, jobName: jobTitle(job) },
        io: {
          readPhoto: async (name) => {
            const f = await photoFolder.getFile(name)
            if (!f) throw new Error('not found')
            return f
          },
          fit: fitter.fit,
          write: (name, data) => writeFile(out, { name, data }),
        },
        onProgress: (done, total, current) => setBusy(`Processing images: ${done} of ${total}${current ? ` (${current})` : ''}`),
      })
      const notes = [`${plural(result.processed.length, 'image')} processed; ${upToDate} already up to date.`]
      for (const f of result.failed) notes.push(`${f.scanId}: ${f.reason}`)
      return { written: result.processed.map((x) => x.outName), notes }
    } finally {
      fitter.close()
    }
  }

  return (
    <section className="export-card export-backup">
      <h2>
        Make CAD drawing (.lsp) <span className="tag">Backup</span>
      </h2>
      <p className="muted">
        For more work in {cad}: writes {fileName} and brings the processed images in {folderName} up to date first.
      </p>
      <div className="button-row">
        <button type="button" className="btn" disabled={disabled || busy !== null} onClick={() => void run()}>
          Make CAD drawing (.lsp)
        </button>
        {busy && <span role="status">{busy}</span>}
      </div>
      {written && (
        <WrittenSummary w={written}>
          <ol className="cad-steps">
            <li>Start {cad} with a new drawing and save it in the job folder ({written.folder}) first, so it finds the images.</li>
            <li>Load {fileName} ({cad === 'AutoCAD' ? 'APPLOAD' : 'LOADAPPLICATION, or APPLOAD'}).</li>
            <li>Type AXISBUILDER and choose 1 to draw. If the images aren't found, pick any image in {folderName} when asked.</li>
          </ol>
        </WrittenSummary>
      )}
    </section>
  )
}
