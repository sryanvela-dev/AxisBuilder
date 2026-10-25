// The Export step: the job folder, then the PDF and the report images (the main way, from the app's own
// sheets) and the CAD drawing file (.lsp, the backup way). Everything refuses while there are errors, asks
// before replacing a file, and ends with a plain summary of what was written where.

import { useState, type ReactNode } from 'react'
import { processedFolderName } from '../export/images/process.ts'
import { exportBaseName } from '../export/files.ts'
import { exportLsp } from '../export/lsp/exportLsp.ts'
import { lspBytes } from '../export/lsp/lspBytes.ts'
import { jobTitle } from '../state/session.ts'
import { plural, type StepStatus } from '../state/steps.ts'
import { useApp } from './appContext.ts'
import { useJobFolders } from './foldersContext.ts'
import { FolderBar } from './PhotoPanel.tsx'
import { SettingsGroup } from './SettingsForm.tsx'
import { writeFile, okToReplace } from './writeFiles.ts'
import { bringImagesUpToDate } from './exportImages.tsx'
import { ExportDxfPanel } from './exportDxf.tsx'
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
        <p className="muted">Everything is written here: the PDF, the report images, the DXF and the CAD drawing file, with the processed images.</p>
        {jobFolder.canPick ? (
          <FolderBar folder={jobFolder} label="Job folder" chooseLabel="Choose job folder" what="writing to" />
        ) : (
          <p className="coming-soon">Writing into a folder needs Edge or Chrome.</p>
        )}
      </section>
      <ExportPdfPanel disabled={blocked > 0 || !ready} />
      <ExportDxfPanel disabled={blocked > 0 || !ready} />
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
      const images = await bringImagesUpToDate({ app, project: p, job, photoFolder: photos.photoFolder, root, folder: folderName, setBusy })
      if (images === 'cancel') return
      if (typeof images === 'string') {
        await say('The drawing file was not made', images)
        return
      }
      files.push(...images.written)
      notes.push(...images.notes)
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
