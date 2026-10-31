// "Make DXF" on the Export step (Phase 7a): the drawing in model space as a DXF for more work in CAD, written from the
// app's own drawing (export/dxf/exportDxf.ts). Processes missing or out-of-date images first, reads their pixel sizes,
// asks before replacing the DXF, and ends with a summary and what to do in CAD.

import { useState } from 'react'
import { exportDxf } from '../export/dxf/exportDxf.ts'
import { dxfFileName } from '../export/files.ts'
import { processedFolderName } from '../export/images/process.ts'
import { jobTitle } from '../state/session.ts'
import { plural } from '../state/steps.ts'
import { useApp } from './appContext.ts'
import { bringImagesUpToDate, processedImageSizes } from './exportImages.tsx'
import { WrittenSummary, type Written } from './exportStep.tsx'
import { useJobFolders } from './foldersContext.ts'
import { previewPrefs } from './preview/previewPrefs.ts'
import { okToReplace, writeFile } from './writeFiles.ts'

export function ExportDxfPanel({ disabled }: { disabled: boolean }) {
  const app = useApp()
  const job = app.state.job!
  const p = job.history.present
  const { photos, jobFolder } = useJobFolders()
  const [busy, setBusy] = useState<string | null>(null)
  const [written, setWritten] = useState<Written | null>(null)
  const folderName = processedFolderName(p.settings.processedImageFolder)
  const fileName = dxfFileName(jobTitle(job))

  async function say(text: string) {
    await app.ask({ title: 'The DXF was not made', message: <p>{text}</p>, buttons: [{ id: 'ok', label: 'OK', primary: true }], cancelId: 'ok' })
  }

  async function run() {
    const root = jobFolder.handle
    if (!root) return
    const notes: string[] = []
    const files: string[] = []
    setWritten(null)
    try {
      const images = await bringImagesUpToDate({ app, project: p, job, photoFolder: photos.photoFolder, root, folder: folderName, setBusy })
      if (images === 'cancel') return
      if (typeof images === 'string') {
        await say(images)
        return
      }
      files.push(...images.written)
      notes.push(...images.notes)
      setBusy('Writing the DXF...')
      const sizes = await processedImageSizes(root, folderName)
      // Layers switched off in the preview are written too, turned off.
      const r = exportDxf(p, { hidden: new Set(previewPrefs().hidden), imageSizes: sizes })
      const missing = r.images.filter((i) => !i.sized)
      if (missing.length > 0) {
        notes.push(`${plural(missing.length, 'image')} not found in ${folderName} (${missing.slice(0, 3).map((i) => i.fileName).join(', ')}${missing.length > 3 ? ', ...' : ''}): linked anyway, so CAD shows them once they are there.`)
      }
      if (!(await okToReplace(app, root, [fileName]))) {
        notes.push(`${fileName} was kept as it was.`)
      } else {
        await writeFile(root, { name: fileName, data: new TextEncoder().encode(r.text) })
        files.push(fileName)
      }
      setWritten({ title: 'DXF made.', folder: root.name, files, notes })
    } catch (err) {
      await say(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(null)
      void jobFolder.refresh()
    }
  }

  return (
    <section className="export-card">
      <h2>Make DXF</h2>
      <p className="muted">
        The drawing in model space, for more work in AutoCAD or DraftSight: the drawing's own layers, colors and positions, with the
        labels, leaders and MUT areas as you see them, and the scan images linked from {folderName}. Writes {fileName}. Section sheets are not in
        the DXF yet; the PDF has them.
      </p>
      <div className="button-row">
        <button type="button" className="btn btn-primary" disabled={disabled || busy !== null} onClick={() => void run()}>
          Make DXF
        </button>
        {busy && <span role="status">{busy}</span>}
      </div>
      {written && (
        <WrittenSummary w={written}>
          <ol className="cad-steps">
            <li>Open {fileName} from the job folder ({written.folder}) in AutoCAD or DraftSight, and Zoom Extents.</li>
            <li>Keep the DXF and the {folderName} folder together: the images are found next to the DXF. Moving them, move both.</li>
            <li>To keep working in CAD, save it as a drawing (DWG) in the same folder.</li>
          </ol>
        </WrittenSummary>
      )}
    </section>
  )
}
