// The report's Export step (design 5 row 8, 11.4): "Make report PDF" writes "<job> - <client> - AUT Report.pdf" into the
// job folder from the page model the Pages view shows: remembered files that need an "Allow" click are asked for first,
// it asks before replacing (as the drawing PDF), reads every picture and uploaded PDF again, then shows a short summary
// (pages, size, what was left out) and "Open the PDF". Everything that blocks the report on Review blocks it here, with
// a link to Review. Word export comes later.

import { useState } from 'react'
import arimoUrl from '../../assets/fonts/Arimo-Regular.ttf?url'
import { photoNeeds, type SheetModel } from '../../engine/sheetModel.ts'
import { reportPdfName } from '../../export/files.ts'
import { preparePhotos } from '../../export/pdf/photos.ts'
import type { ReportFontId } from '../../report/fonts.ts'
import { withExamplePhotos } from '../../report/exampleJobs.ts'
import { buildReport } from '../../report/pages/index.ts'
import { jobTitle } from '../../state/session.ts'
import { plural } from '../../state/steps.ts'
import { useApp } from '../appContext.ts'
import { WrittenSummary, type Written } from '../exportStep.tsx'
import { useJobFolders } from '../foldersContext.ts'
import { FolderBar } from '../PhotoPanel.tsx'
import { JobFilesPanel } from '../JobFilesPanel.tsx'
import { previewPrefs } from '../preview/previewPrefs.ts'
import { browserPhotoReader } from '../sheetPhotos.ts'
import { okToReplace, openWritten, writeFile } from '../writeFiles.ts'
import { readPdfInfo } from '../../report/pdfInfo.ts'
import { isPdfUpload } from '../../report/pagesEdits.ts'
import { allowReportFiles, preparePictures, readUploadFile, refKey } from './reportFiles.ts'
import { useReport } from './reportContext.ts'
import { examplePhotoReader } from './useExampleThumbs.ts'
import { FONT_URLS } from './reportFonts.ts'
import type { ReportStepProps } from './ReportWorkspace.tsx'

const mb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)
/** Pictures in the report PDF: about 300 dpi of their printed size (design 7). */
const PICTURE_DPI = 300

async function fetchBytes(url: string): Promise<Uint8Array> {
  const r = await fetch(url)
  if (!r.ok) throw new Error('A font for the PDF could not be loaded.')
  return new Uint8Array(await r.arrayBuffer())
}

export function ExportStep({ status }: ReportStepProps) {
  const app = useApp()
  const job = app.state.job!
  const p = job.history.present
  const { jobFolder, photos: drawingPhotos } = useJobFolders()
  const { pages } = useReport()
  const [busy, setBusy] = useState<string | null>(null)
  const [written, setWritten] = useState<Written | null>(null)
  const blocked = status.issues.filter((i) => i.blocksExport).length
  const ready = jobFolder.status === 'ready' && jobFolder.handle !== null
  const name = reportPdfName(jobTitle(job), p.project.client)

  async function make() {
    const root = jobFolder.handle
    if (!root) return
    setWritten(null)
    try {
      await allowReportFiles(pages.sources, p.report!)
      if (!(await okToReplace(app, root, [name]))) return
      setBusy('Reading the uploaded PDFs...')
      // Uploaded PDFs are read again now: the page sizes for the layout, the bytes to copy the pages from.
      const pdfs = new Map<string, Uint8Array>()
      const pdfSizes = new Map<string, { w: number; h: number }[]>()
      const pdfProblems: string[] = []
      for (const file of [...new Set(p.report!.uploads.filter(isPdfUpload).map((u) => u.file))]) {
        const f = await readUploadFile(pages.sources, file)
        const bytes = f ? new Uint8Array(await f.arrayBuffer()) : null
        const info = bytes ? await readPdfInfo(bytes) : null
        if (!bytes || !info) pdfProblems.push(`${file} could not be found, so its pages print as boxes.`)
        else if (!info.ok) pdfProblems.push(`${file}: ${info.problem}`)
        else {
          pdfs.set(file, bytes)
          pdfSizes.set(file, info.pages)
        }
      }
      setBusy('Reading the pictures...')
      const known = pages.pictures
      const doc = buildReport({ project: p, image: (ref) => known.get(refKey(ref))?.info ?? null, previewHidden: new Set(previewPrefs().hidden), pdfPages: (f) => pdfSizes.get(f) ?? null })
      const prepared = await preparePictures(doc, pages.sources, PICTURE_DPI, (d, t) => setBusy(`Preparing pictures: ${d} of ${t}`))
      const models: SheetModel[] = doc.pages.flatMap((pg) => pg.items.flatMap((i) => (i.t === 'sheet' ? [i.model] : [])))
      const sheetPhotos = await preparePhotos(photoNeeds(models), withExamplePhotos(browserPhotoReader(p, drawingPhotos.photoFolder), examplePhotoReader), p.settings.pdfPhotoDpi, (d, t) => setBusy(`Preparing drawing photos: ${d} of ${t}`))
      setBusy('Writing the PDF...')
      const fonts = {} as Record<ReportFontId, Uint8Array>
      for (const [id, url] of Object.entries(FONT_URLS) as [ReportFontId, string][]) fonts[id] = await fetchBytes(url)
      const { writeReportPdf } = await import('../../report/pdf/writeReportPdf.ts')
      const bytes = await writeReportPdf({ doc, fonts, drawingFont: await fetchBytes(arimoUrl), images: prepared.images, sheetPhotos: sheetPhotos.photos, pdfs })
      await writeFile(root, { name, data: bytes })
      const missing = [...new Set([...prepared.missing, ...sheetPhotos.missing])]
      setWritten({
        title: 'Report PDF made.', folder: root.name, files: [name],
        notes: [
          `${plural(doc.pages.length, 'page')}, ${mb(bytes.length)}; ${plural(prepared.images.size, 'picture')} at up to ${PICTURE_DPI} dpi of the printed size.`,
          ...(missing.length ? [`${plural(missing.length, 'picture')} could not be read and print as grey boxes: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ', ...' : ''}.`] : []),
          ...pdfProblems,
          ...doc.notes.slice(0, 12),
          ...(missing.length + pdfProblems.length + doc.notes.length === 0 ? ['Nothing was left out.'] : []),
        ],
      })
    } catch (err) {
      await app.ask({ title: 'The report PDF was not made', message: <p>{err instanceof Error ? err.message : String(err)}</p>, buttons: [{ id: 'ok', label: 'OK', primary: true }], cancelId: 'ok' })
    } finally {
      setBusy(null)
      pages.retry()
      void jobFolder.refresh()
    }
  }

  return (
    <>
      {blocked > 0 ? (
        <div className="notice notice-error" role="alert">
          <p>
            <strong>The report PDF can't be made yet:</strong> {plural(blocked, 'thing')} must be fixed first.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => app.dispatch({ type: 'goToReportStep', step: 'reportReview' })}>
            See them on the Review step
          </button>
        </div>
      ) : (
        <p>Nothing blocks the report PDF.</p>
      )}
      <section className="export-folder">
        <h2>Job folder</h2>
        <p className="muted">The report PDF is written here, next to the drawing files.</p>
        {jobFolder.canPick ? (
          <FolderBar folder={jobFolder} label="Job folder" chooseLabel="Choose job folder" what="writing to" />
        ) : (
          <p className="coming-soon">Writing into a folder needs Edge or Chrome.</p>
        )}
      </section>
      <JobFilesPanel />
      <section className="export-card">
        <h2>Report PDF</h2>
        <p className="muted">
          <strong>{name}</strong>{p.project.client.trim() ? '' : ' (no client on the Project step, so the name has none)'}: every page the Pages view shows ({plural(pages.doc?.pages.length ?? 0, 'page')}), letter size, with clickable contents and bookmarks for
          every section and scan.
        </p>
        <div className="button-row">
          <button type="button" className="btn btn-primary" disabled={blocked > 0 || !ready || busy !== null || !pages.doc} onClick={() => void make()}>
            Make report PDF
          </button>
          {busy && <span role="status">{busy}</span>}
          {!busy && (blocked > 0 || !ready) && <span className="muted">Choose the job folder and fix what blocks the report first.</span>}
        </div>
        {written && (
          <WrittenSummary w={written}>
            {jobFolder.handle && (
              <div className="button-row">
                <button type="button" className="btn btn-small" onClick={() => void openWritten(jobFolder.handle!, name).catch(() => {})}>
                  Open the PDF
                </button>
              </div>
            )}
          </WrittenSummary>
        )}
      </section>
      <p className="coming-soon">Coming later: Word export.</p>
    </>
  )
}
