// Export step, the main way: the PDF and the report images, both from the app's own sheets (engine/sheetModel.ts,
// the same model the Sheets view shows), with the layers chosen under "What is exported" (export/exportSets.ts).
// Both ask before replacing a file and end with a summary.

import { useState } from 'react'
import fontUrl from '../assets/fonts/Arimo-Regular.ttf?url'
import { buildDrawing } from '../engine/drawing.ts'
import { activeSectionPlan } from '../engine/sections.ts'
import { photoNeeds, sheetModels, type SheetModel } from '../engine/sheetModel.ts'
import { exportRuns, type ExportRun } from '../export/exportSets.ts'
import { cleanFileName, exportBaseName, reportImageNames } from '../export/files.ts'
import { preparePhotos } from '../export/pdf/photos.ts'
import { REPORT_FONT, drawReportSheet, encodeReportJpeg, reportFrame, type Ctx2D, type ReportCrop } from '../export/report/reportImages.ts'
import type { DirectoryHandleLike } from '../state/folders.ts'
import { jobTitle } from '../state/session.ts'
import { plural } from '../state/steps.ts'
import { useApp } from './appContext.ts'
import { WrittenSummary, type Written } from './exportStep.tsx'
import { useJobFolders } from './foldersContext.ts'
import { previewPrefs, usePreviewPrefs } from './preview/previewPrefs.ts'
import { SettingsGroup } from './SettingsForm.tsx'
import { browserPhotoReader, closePhotos, sheetBitmaps } from './sheetPhotos.ts'
import { okToReplace, writeFile } from './writeFiles.ts'

const sheetName = (m: SheetModel) => (m.kind === 'main' ? 'drawing' : m.kind === 'overview' ? 'overview' : m.title.toLowerCase())
const mb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

let fontBytes: Promise<Uint8Array> | null = null
function loadFont(): Promise<Uint8Array> {
  fontBytes ??= fetch(fontUrl).then(async (r) => {
    if (!r.ok) throw new Error('The PDF font could not be loaded.')
    return new Uint8Array(await r.arrayBuffer())
  })
  return fontBytes
}

/** Opens a file the export wrote, in a new browser tab (the browser's PDF or picture viewer). */
async function openWritten(dir: DirectoryHandleLike, name: string) {
  const file = await (await dir.getFileHandle(name)).getFile()
  const url = URL.createObjectURL(file)
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function ExportPdfPanel({ disabled }: { disabled: boolean }) {
  const app = useApp()
  const job = app.state.job!
  const p = job.history.present
  const s = p.settings
  const { photos, jobFolder } = useJobFolders()
  const [busy, setBusy] = useState<string | null>(null)
  const [written, setWritten] = useState<(Written & { pdfs: string[] }) | null>(null)
  const base = exportBaseName(jobTitle(job))
  const imageBase = s.reportName.trim() ? cleanFileName(s.reportName, base) : base
  const runs = () => exportRuns(s.exportSet, previewPrefs().hidden)
  const shownRuns = exportRuns(s.exportSet, usePreviewPrefs().hidden)
  const pdfNames = shownRuns.map((r) => `${base}${r.suffix}.pdf`)

  const models = (run: ExportRun) => sheetModels(p, buildDrawing(p), activeSectionPlan(p), { hidden: run.hidden })
  const photoNote = (missing: Iterable<string>) => {
    const m = [...new Set(missing)]
    return m.length ? [`${plural(m.length, 'photo')} could not be read and ${m.length === 1 ? 'was' : 'were'} left out: ${m.slice(0, 10).join(', ')}${m.length > 10 ? ', ...' : ''}.`] : []
  }
  const noPhotoFolder = (list: ExportRun[]) =>
    s.generateOverlayDrawing && !photos.photoFolder && list.some((r) => !r.hidden.has('images')) ? ['The photo folder is not open, so the photos were left out. Open it on the Images step to include them.'] : []

  async function fail(title: string, err: unknown) {
    await app.ask({ title, message: <p>{err instanceof Error ? err.message : String(err)}</p>, buttons: [{ id: 'ok', label: 'OK', primary: true }], cancelId: 'ok' })
  }

  async function makePdf() {
    const root = jobFolder.handle
    if (!root) return
    setWritten(null)
    const list = runs()
    const names = list.map((r) => `${base}${r.suffix}.pdf`)
    try {
      if (!(await okToReplace(app, root, names))) return
      const notes: string[] = []
      const missing: string[] = []
      for (const [i, run] of list.entries()) {
        const what = list.length > 1 ? ` (${run.label})` : ''
        setBusy(`Preparing the sheets${what}...`)
        const sheets = models(run)
        const prepared = await preparePhotos(photoNeeds(sheets), browserPhotoReader(p, photos.photoFolder), s.pdfPhotoDpi, (done, total) =>
          setBusy(`Preparing photos${what}: ${done} of ${total}`))
        missing.push(...prepared.missing)
        setBusy(`Writing the PDF${what}...`)
        const { writePdf } = await import('../export/pdf/writePdf.ts')
        const bytes = await writePdf({ models: sheets, font: await loadFont(), photos: prepared.photos, layers: s.pdfLayers, title: `${jobTitle(job)} - AUT Coverage${run.suffix}` })
        await writeFile(root, { name: names[i], data: bytes })
        notes.push(
          `${names[i]}: ${run.label === 'As the preview' ? 'the layers ticked on the preview' : run.label}; ${plural(sheets.length, 'page')}, letter size (${sheets.map(sheetName).join(', ')}), ` +
            `${mb(bytes.length)}${prepared.photos.size ? `, ${plural(prepared.photos.size, 'photo')} at up to ${s.pdfPhotoDpi} dpi of the printed size` : ''}.`,
        )
      }
      setWritten({
        title: list.length > 1 ? 'PDFs made.' : 'PDF made.', folder: root.name, files: names, pdfs: names,
        notes: [...notes, ...noPhotoFolder(list), ...photoNote(missing)],
      })
    } catch (err) {
      await fail('The PDF was not made', err)
    } finally {
      setBusy(null)
      void jobFolder.refresh()
    }
  }

  async function makeImages() {
    const root = jobFolder.handle
    if (!root) return
    setWritten(null)
    const crop = s.reportCrop as ReportCrop
    const list = runs()
    try {
      const sets = list.map((run) => {
        const sheets = models(run)
        return { run, sheets, names: reportImageNames(`${imageBase}${run.suffix}`, sheets.length) }
      })
      const all = sets.flatMap((x) => x.names)
      if (!(await okToReplace(app, root, all))) return
      await document.fonts.load(`12px '${REPORT_FONT}'`)
      const missing: string[] = []
      const sizes: string[] = []
      let n = 0
      for (const { sheets, names } of sets) {
        for (const [i, m] of sheets.entries()) {
          setBusy(`Drawing report image ${++n} of ${all.length}...`)
          const frame = reportFrame(m, crop, s.reportDpi, s.reportPadding)
          const loaded = await sheetBitmaps(p, photos.photoFolder, m.drawing.flatMap((x) => (x.t === 'image' ? [x.scanId] : [])))
          missing.push(...loaded.missing)
          try {
            const canvas = new OffscreenCanvas(frame.width, frame.height)
            const ctx = canvas.getContext('2d')
            if (!ctx) throw new Error('The browser could not make a picture this big.')
            drawReportSheet(ctx as unknown as Ctx2D, m, frame, crop, loaded.photos)
            const data = ctx.getImageData(0, 0, frame.width, frame.height).data
            const jpeg = encodeReportJpeg(data, frame.width, frame.height, s.reportQuality, s.reportDpi)
            await writeFile(root, { name: names[i], data: jpeg })
            sizes.push(`${names[i]}: ${frame.width} x ${frame.height} px, ${mb(jpeg.length)}`)
          } finally {
            closePhotos(loaded.photos)
          }
        }
      }
      setWritten({
        title: 'Report images made.', folder: root.name, files: all, pdfs: [],
        notes: [
          `One JPEG per sheet${list.length > 1 ? ' for each set (scans, then overlays)' : ''}, ${crop === 'Drawing only' ? 'cropped to the drawing (no title, legend or head views)' : 'cropped to everything printed'}, ${s.reportDpi} DPI, quality ${s.reportQuality}, ${s.reportPadding} px padding.`,
          ...sizes,
          ...noPhotoFolder(list),
          ...photoNote(missing),
        ],
      })
    } catch (err) {
      await fail('The report images were not made', err)
    } finally {
      setBusy(null)
      void jobFolder.refresh()
    }
  }

  const root = jobFolder.handle
  return (
    <section className="export-card">
      <h2>PDF and report images</h2>
      <p className="muted">
        Every sheet the Sheets view shows (open the preview and click Sheets to check them first): {pdfNames.join(' and ')}, and one JPEG per sheet for the inspection report.
        {shownRuns.length > 1 ? ' Both sets are made in one go.' : ''}
      </p>
      <div className="button-row">
        <button type="button" className="btn btn-primary" disabled={disabled || busy !== null} onClick={() => void makePdf()}>
          {shownRuns.length > 1 ? 'Make PDFs' : 'Make PDF'}
        </button>
        <button type="button" className="btn btn-primary" disabled={disabled || busy !== null} onClick={() => void makeImages()}>
          Export report images
        </button>
        {busy && <span role="status">{busy}</span>}
        {disabled && !busy && <span className="muted">Choose the job folder and fix what blocks export first.</span>}
      </div>
      {written && (
        <WrittenSummary w={written}>
          {root && written.pdfs.length > 0 && (
            <div className="button-row">
              {written.pdfs.map((name) => (
                <button key={name} type="button" className="btn btn-small" onClick={() => void openWritten(root, name).catch((e) => fail('The PDF could not be opened', e))}>
                  Open {written.pdfs.length > 1 ? name.replace(/^.* - /, '').replace(/\.pdf$/, ' PDF') : 'the PDF'}
                </button>
              ))}
            </div>
          )}
        </WrittenSummary>
      )}
      <SettingsGroup group="exportSets" step="export" />
      <SettingsGroup group="pdf" step="export" />
      <SettingsGroup group="reportImages" step="export" />
    </section>
  )
}
