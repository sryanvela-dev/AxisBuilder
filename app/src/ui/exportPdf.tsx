// Export step, the main way: the PDF and the report images, both from the app's own sheets (engine/sheetModel.ts,
// the same model the Sheets view shows). Both ask before replacing a file and end with a summary.

import { useState } from 'react'
import fontUrl from '../assets/fonts/Arimo-Regular.ttf?url'
import { buildDrawing } from '../engine/drawing.ts'
import { activeSectionPlan } from '../engine/sections.ts'
import { photoNeeds, sheetModels, type SheetModel } from '../engine/sheetModel.ts'
import { cleanFileName, exportBaseName, reportImageNames } from '../export/files.ts'
import { preparePhotos } from '../export/pdf/photos.ts'
import { REPORT_FONT, drawReportSheet, encodeReportJpeg, reportFrame, type Ctx2D, type ReportCrop } from '../export/report/reportImages.ts'
import { jobTitle } from '../state/session.ts'
import { plural } from '../state/steps.ts'
import { useApp } from './appContext.ts'
import { WrittenSummary, type Written } from './exportStep.tsx'
import { useJobFolders } from './foldersContext.ts'
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

export function ExportPdfPanel({ disabled }: { disabled: boolean }) {
  const app = useApp()
  const job = app.state.job!
  const p = job.history.present
  const { photos, jobFolder } = useJobFolders()
  const [busy, setBusy] = useState<string | null>(null)
  const [written, setWritten] = useState<Written | null>(null)
  const base = exportBaseName(jobTitle(job))
  const pdfName = `${base}.pdf`
  const imageBase = p.settings.reportName.trim() ? cleanFileName(p.settings.reportName, base) : base

  const models = () => sheetModels(p, buildDrawing(p), activeSectionPlan(p))
  const photoNote = (missing: string[]) =>
    missing.length ? [`${plural(missing.length, 'photo')} could not be read and ${missing.length === 1 ? 'was' : 'were'} left out: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ', ...' : ''}.`] : []
  const noPhotoFolder = () => (p.settings.generateOverlayDrawing && !photos.photoFolder ? ['The photo folder is not open, so the photos were left out. Open it on the Images step to include them.'] : [])

  async function fail(title: string, err: unknown) {
    await app.ask({ title, message: <p>{err instanceof Error ? err.message : String(err)}</p>, buttons: [{ id: 'ok', label: 'OK', primary: true }], cancelId: 'ok' })
  }

  async function makePdf() {
    const root = jobFolder.handle
    if (!root) return
    setWritten(null)
    try {
      if (!(await okToReplace(app, root, [pdfName]))) return
      setBusy('Preparing the sheets...')
      const sheets = models()
      const needs = photoNeeds(sheets)
      const prepared = await preparePhotos(needs, browserPhotoReader(p, photos.photoFolder), p.settings.pdfPhotoDpi, (done, total) =>
        setBusy(`Preparing photos: ${done} of ${total}`))
      setBusy('Writing the PDF...')
      const { writePdf } = await import('../export/pdf/writePdf.ts')
      const bytes = await writePdf({ models: sheets, font: await loadFont(), photos: prepared.photos, layers: p.settings.pdfLayers, title: `${jobTitle(job)} - AUT Coverage` })
      await writeFile(root, { name: pdfName, data: bytes })
      setWritten({
        title: 'PDF made.', folder: root.name, files: [pdfName],
        notes: [
          `${plural(sheets.length, 'page')}, letter size (${sheets.map(sheetName).join(', ')}), ${mb(bytes.length)}.`,
          ...(prepared.photos.size ? [`${plural(prepared.photos.size, 'photo')} at up to ${p.settings.pdfPhotoDpi} dpi of the printed size.`] : []),
          ...(p.settings.pdfLayers ? ['Layers (Scans, Hatch, Photos, ...) can be switched on and off in the PDF viewer.'] : []),
          ...noPhotoFolder(),
          ...photoNote(prepared.missing),
        ],
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
    const s = p.settings
    const crop = s.reportCrop as ReportCrop
    try {
      const sheets = models()
      const names = reportImageNames(imageBase, sheets.length)
      if (!(await okToReplace(app, root, names))) return
      await document.fonts.load(`12px '${REPORT_FONT}'`)
      const missing = new Set<string>()
      const sizes: string[] = []
      for (const [i, m] of sheets.entries()) {
        setBusy(`Drawing report image ${i + 1} of ${sheets.length}...`)
        const frame = reportFrame(m, crop, s.reportDpi, s.reportPadding)
        const scanIds = m.drawing.flatMap((x) => (x.t === 'image' ? [x.scanId] : []))
        const loaded = await sheetBitmaps(p, photos.photoFolder, scanIds)
        loaded.missing.forEach((id) => missing.add(id))
        let canvas: OffscreenCanvas
        try {
          canvas = new OffscreenCanvas(frame.width, frame.height)
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
      setWritten({
        title: 'Report images made.', folder: root.name, files: names,
        notes: [
          `One JPEG per sheet, ${crop === 'Drawing only' ? 'cropped to the drawing (no title, legend or head views)' : 'cropped to everything printed'}, ${s.reportDpi} DPI, quality ${s.reportQuality}, ${s.reportPadding} px padding.`,
          ...sizes,
          ...noPhotoFolder(),
          ...photoNote([...missing]),
        ],
      })
    } catch (err) {
      await fail('The report images were not made', err)
    } finally {
      setBusy(null)
      void jobFolder.refresh()
    }
  }

  return (
    <section className="export-card">
      <h2>PDF and report images</h2>
      <p className="muted">
        Every sheet the Sheets view shows (open the preview and click Sheets to check them first): {pdfName}, and one JPEG per sheet ({imageBase}.jpg or {imageBase}_001.jpg, ...) for
        the inspection report.
      </p>
      <div className="button-row">
        <button type="button" className="btn btn-primary" disabled={disabled || busy !== null} onClick={() => void makePdf()}>
          Make PDF
        </button>
        <button type="button" className="btn btn-primary" disabled={disabled || busy !== null} onClick={() => void makeImages()}>
          Export report images
        </button>
        {busy && <span role="status">{busy}</span>}
        {disabled && !busy && <span className="muted">Choose the job folder and fix what blocks export first.</span>}
      </div>
      {written && <WrittenSummary w={written} />}
      <SettingsGroup group="pdf" step="export" />
      <SettingsGroup group="reportImages" step="export" />
    </section>
  )
}
