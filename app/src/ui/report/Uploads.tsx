// Reference pages on the Photos and pages step (design 4.6, 6.11): drop or pick pictures and PDFs. A PDF opens the page
// picker (thumbnails drawn by pdf.js): tick pages, each becomes its own report page, all pointing at the same file. Each
// upload has a title, where it prints, its frame (standard: under the report's header and footer; full: the page as it
// is, PDFs only) and a turn; pictures can be cropped. Files are linked like photos: the job keeps the name, this browser
// the file (one "Allow" click after reopening), and the report reads it again when the PDF is made.

import { useEffect, useState, type DragEvent } from 'react'
import { IMAGE_EXTENSIONS } from '../../data/imageMatch.ts'
import { turned } from '../../report/crop.ts'
import { addUploads, isPdfUpload, moveUpload, removeUpload, setUpload, setUploadDarken } from '../../report/pagesEdits.ts'
import { readPdfInfo } from '../../report/pdfInfo.ts'
import type { Upload } from '../../report/schema.ts'
import { templateOf } from '../../report/templates/registry.ts'
import { IMAGE_ACCEPT, PDF_ACCEPT, rememberFile } from '../../state/files.ts'
import type { FileHandleLike } from '../../state/session.ts'
import { plural } from '../../state/steps.ts'
import { useApp } from '../appContext.ts'
import { ReportBox, ReportSelect } from './boxes.tsx'
import { placeOptions, placeValue } from './placeOptions.ts'
import { CropButton, PictureWindow } from './PictureWindow.tsx'
import { refKey, uploadSlot } from './reportFiles.ts'
import { useReport } from './reportContext.ts'
import { pdfPageKey } from './useReportPages.ts'

const STEP = 'pages' as const
const isImage = (name: string) => (IMAGE_EXTENSIONS as readonly string[]).includes(name.split('.').pop()?.toLowerCase() ?? '')
const isPdf = (name: string) => /\.pdf$/i.test(name)

async function pickUploadFiles(): Promise<FileHandleLike[] | undefined> {
  const picker = (window as unknown as { showOpenFilePicker?: (o: object) => Promise<FileHandleLike[]> }).showOpenFilePicker
  if (!picker) return undefined
  try {
    return await picker.call(window, { id: 'axisbuilder-report-uploads', multiple: true, types: [{ description: 'Pictures and PDFs', accept: { ...IMAGE_ACCEPT, ...PDF_ACCEPT } }] })
  } catch {
    return []
  }
}

interface PdfChoice {
  name: string
  bytes: Uint8Array
  pages: number
}

export function Uploads() {
  const app = useApp()
  const p = app.state.job!.history.present
  const { pages } = useReport()
  const [note, setNote] = useState<string | null>(null)
  const [pdf, setPdf] = useState<PdfChoice | null>(null)
  const [queue, setQueue] = useState<PdfChoice[]>([])
  const [over, setOver] = useState(false)

  async function take(handles: FileHandleLike[]) {
    setNote(null)
    const images: string[] = []
    const pdfs: PdfChoice[] = []
    const problems: string[] = []
    for (const h of handles) {
      if (!isImage(h.name) && !isPdf(h.name)) {
        problems.push(`${h.name}: only pictures (JPEG, PNG) and PDFs can be added.`)
        continue
      }
      await rememberFile(app.browserStore, p.jobId, uploadSlot(h.name), h).catch(() => {})
      if (isImage(h.name)) {
        images.push(h.name)
        continue
      }
      const bytes = new Uint8Array(await (await h.getFile()).arrayBuffer())
      const info = await readPdfInfo(bytes)
      if (!info.ok) problems.push(`${h.name}: ${info.problem}`)
      else if (info.pages.length === 1) app.edit(`Add ${h.name}`, (q) => addUploads(q, [{ file: h.name, page: 1 }]))
      else pdfs.push({ name: h.name, bytes, pages: info.pages.length })
    }
    if (images.length) app.edit(`Add ${plural(images.length, 'reference picture')}`, (q) => addUploads(q, images.map((file) => ({ file, page: null }))))
    if (problems.length) setNote(problems.join(' '))
    if (pdfs.length) {
      setPdf(pdfs[0])
      setQueue(pdfs.slice(1))
    }
    pages.retry()
  }

  async function choose() {
    const handles = await pickUploadFiles()
    if (handles === undefined) {
      setNote('Adding reference pages needs Edge or Chrome (the file is remembered for this job and read again when the PDF is made).')
      return
    }
    if (handles.length) await take(handles)
  }

  async function drop(e: DragEvent) {
    e.preventDefault()
    setOver(false)
    const items = [...e.dataTransfer.items].filter((i) => i.kind === 'file')
    const handles: FileHandleLike[] = []
    for (const it of items) {
      const h = await (it as unknown as { getAsFileSystemHandle?: () => Promise<FileHandleLike & { kind: string }> }).getAsFileSystemHandle?.()
      if (h && h.kind === 'file') handles.push(h)
    }
    if (handles.length === 0 && items.length) {
      setNote('This browser can’t keep dropped files for the job; use Edge or Chrome, or "Choose files…".')
      return
    }
    await take(handles)
  }

  const nextPdf = () => {
    setPdf(queue[0] ?? null)
    setQueue(queue.slice(1))
  }

  return (
    <>
      <div className={`drop-zone${over ? ' drop-active' : ''}`} onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }} onDragLeave={() => setOver(false)} onDrop={(e) => void drop(e)}>
        <p>
          Drop pictures or PDFs here (plant drawing, nameplate, GA ...), or{' '}
          <button type="button" className="btn btn-small" onClick={() => void choose()}>
            Choose files…
          </button>
        </p>
        <p className="muted">A PDF page is copied into the report as it is, so its text stays sharp.</p>
      </div>
      {note && <p className="msg msg-warning" role="alert">{note}</p>}
      {pdf && <PagePicker choice={pdf} onCancel={nextPdf} onAdd={(list) => {
        app.edit(`Add ${plural(list.length, 'page')} of ${pdf.name}`, (q) => addUploads(q, list.map((page) => ({ file: pdf.name, page }))))
        pages.retry()
        nextPdf()
      }} />}
      <UploadTable />
    </>
  )
}

/** Thumbnails of every page of a PDF; tick the pages to add. */
function PagePicker({ choice, onAdd, onCancel }: { choice: PdfChoice; onAdd: (pages: number[]) => void; onCancel: () => void }) {
  const [thumbs, setThumbs] = useState<(string | null)[]>([])
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [problem, setProblem] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    const made: string[] = []
    void (async () => {
      try {
        const { openPdf, renderPage } = await import('./pdfPages.ts')
        const doc = await openPdf(choice.bytes)
        try {
          for (let n = 1; n <= choice.pages; n++) {
            const url = await renderPage(doc, n, 260).catch(() => null)
            if (url) made.push(url)
            if (!alive) return
            setThumbs((t) => [...t, url])
          }
        } finally {
          void doc.loadingTask.destroy()
        }
      } catch {
        if (alive) setProblem('The pages could not be drawn here; tick them by number. The report still copies them.')
      }
    })()
    return () => {
      alive = false
      made.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [choice])
  const toggle = (n: number) => setPicked((s) => {
    const next = new Set(s)
    if (next.has(n)) next.delete(n)
    else next.add(n)
    return next
  })
  const all = Array.from({ length: choice.pages }, (_, i) => i + 1)
  return (
    <PictureWindow title={`Pages of ${choice.name}`} okLabel={picked.size ? `Add ${plural(picked.size, 'page')}` : 'Add the ticked pages'}
      onOk={() => picked.size && onAdd(all.filter((n) => picked.has(n)))} onCancel={onCancel}>
      <p className="muted">
        {plural(choice.pages, 'page')}. Tick the pages to add; each becomes its own report page.{' '}
        <button type="button" className="link-btn" onClick={() => setPicked(new Set(all))}>Tick all</button>{' '}
        <button type="button" className="link-btn" onClick={() => setPicked(new Set())}>Tick none</button>
      </p>
      {problem && <p className="msg msg-warning">{problem}</p>}
      <ul className="pdf-page-picker">
        {all.map((n) => (
          <li key={n}>
            <label className={picked.has(n) ? 'picked' : undefined}>
              {thumbs[n - 1] ? <img src={thumbs[n - 1]!} alt="" /> : <span className="pdf-page-empty">{thumbs.length >= n ? '?' : '…'}</span>}
              <span>
                <input type="checkbox" checked={picked.has(n)} onChange={() => toggle(n)} /> Page {n}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </PictureWindow>
  )
}

function UploadTable() {
  const app = useApp()
  const report = app.state.job!.history.present.report!
  const { pages } = useReport()
  const own = templateOf(report.templateId).sections.find((d) => d.pageType === 'uploaded')
  const list = report.uploads
  if (list.length === 0) return <p className="muted">No reference pages yet.</p>
  const status = (u: Upload): string | null => {
    if (!isPdfUpload(u)) return pages.pictures.get(refKey({ source: 'uploads', file: u.file })) === null ? 'not found: choose it again, or allow it' : null
    const info = pages.pdfInfo.get(u.file)
    if (info === 'missing') return 'not found: choose it again, or allow it'
    if (info && !info.ok) return info.problem
    if (info && info.ok && (u.page ?? 1) > info.pages.length) return `the PDF has only ${plural(info.pages.length, 'page')}`
    return null
  }
  // One card per page (user, 2026-10-31: the title box was too narrow to read in a table beside the pages panel): the
  // picture on the left, the title the full width, then where it prints, frame, darken and the buttons.
  return (
    <ol className="upload-cards">
      {list.map((u, i) => {
        const pdf = isPdfUpload(u)
        const pic = pdf ? pages.pictures.get(pdfPageKey(u.file, u.page ?? 1)) : pages.pictures.get(refKey({ source: 'uploads', file: u.file }))
        const what = pdf ? `${u.file}, page ${u.page ?? 1}` : u.file
        const label = `reference page ${i + 1} (${what})`
        const st = status(u)
        return (
          <li key={`${u.file}-${u.page}-${i}`} id={`report-upload-${i}`} className="upload-card">
            <span className="upload-num">{i + 1}</span>
            {pic ? (
              <img className="photo-thumb" src={pic.thumb} alt="" style={u.rotate ? { transform: `rotate(${u.rotate}deg)${u.rotate % 180 ? ' scale(0.75)' : ''}` } : undefined} />
            ) : (
              <span className="photo-thumb thumb-empty" />
            )}
            <div className="upload-body">
              <div className="upload-title">
                <span className="upload-field-label">Title</span>
                <ReportBox compact label="Title" where={`Reference page ${i + 1}, title`} value={u.title} placeholder="e.g. Nameplate"
                  set={(q, v: string) => setUpload(q, i, { title: v })} boxKey={`report.upload.${i}.title`} step={STEP} />
              </div>
              <p className="muted upload-file">
                {what}
                {st && <span className="msg msg-warning"> ({st})</span>}
              </p>
              <div className="upload-options">
                <label className="upload-option">
                  <span className="upload-field-label">Prints</span>
                  <ReportSelect compact label="Prints" where={`Reference page ${i + 1}, prints`} value={placeValue(u.after, own)} options={placeOptions(report, own)}
                    set={(q, v: string) => setUpload(q, i, { after: v })} boxKey={`report.upload.${i}.after`} step={STEP} />
                </label>
                {pdf && (
                  <label className="upload-option">
                    <span className="upload-field-label">Frame</span>
                    <ReportSelect compact label="Frame" where={`Reference page ${i + 1}, frame`} value={u.frame}
                      options={[{ value: 'standard', label: 'Standard (under the header)' }, { value: 'full', label: 'Full (the page as it is)' }]}
                      set={(q, v: string) => setUpload(q, i, { frame: v as Upload['frame'] })} boxKey={`report.upload.${i}.frame`} step={STEP} />
                  </label>
                )}
                {pdf && (
                  <label className="upload-option">
                    <span className="upload-field-label">Darken</span>
                    <ReportSelect compact label="Darken" where={`Reference page ${i + 1}, darken`} value={String(u.adjust.darken)}
                      options={[{ value: '0', label: 'As it is' }, { value: '1', label: 'Darker (faint copy)' }, { value: '2', label: 'Much darker' }]}
                      set={(q, v: string) => setUploadDarken(q, i, Number(v))} boxKey={`report.upload.${i}.darken`} step={STEP} />
                  </label>
                )}
                <span className="button-row row-buttons">
                  <button type="button" className="icon-btn" onClick={() => app.edit('Turn a reference page left', (q) => setUpload(q, i, { rotate: turned(u.rotate, 'left') }))} aria-label={`Turn ${label} left`} title="Turn left (a quarter, anticlockwise)">⟲</button>
                  <button type="button" className="icon-btn" onClick={() => app.edit('Turn a reference page right', (q) => setUpload(q, i, { rotate: turned(u.rotate, 'right') }))} aria-label={`Turn ${label} right`} title="Turn right (a quarter, clockwise)">⟳</button>
                  {!pdf && <CropButton small at={{ kind: 'upload', index: i }} picture={{ source: 'uploads', file: u.file }} name={u.file} />}
                  <button type="button" className="icon-btn" onClick={() => app.edit('Move a reference page', (q) => moveUpload(q, i, i - 1))} disabled={i === 0} aria-label={`Move ${label} up`} title="Move up">↑</button>
                  <button type="button" className="icon-btn" onClick={() => app.edit('Move a reference page', (q) => moveUpload(q, i, i + 1))} disabled={i === list.length - 1} aria-label={`Move ${label} down`} title="Move down">↓</button>
                  <button type="button" className="icon-btn icon-danger" onClick={() => app.edit('Remove a reference page', (q) => removeUpload(q, i))} aria-label={`Remove ${label}`} title="Remove from the report (the file stays)">✕</button>
                </span>
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
