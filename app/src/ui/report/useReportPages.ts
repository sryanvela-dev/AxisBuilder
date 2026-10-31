// The report as pages in the browser: its pictures read once each (size, phone orientation, upright thumbnail) and the
// page model built from the job and those sizes (report/pages buildReport), kept up to date as the job changes. The
// Pages view, the pages panel beside each step and "Make report PDF" all use the same document.

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { Project } from '../../data/schema.ts'
import type { LayerGroup } from '../../engine/drawing.ts'
import type { ImageRef, ReportDocument } from '../../report/pageModel.ts'
import { buildReport } from '../../report/pages/index.ts'
import { isPdfUpload } from '../../report/pagesEdits.ts'
import { readPdfInfo, type PdfInfo } from '../../report/pdfInfo.ts'
import { readPicture, readReportFile, readUploadFile, refKey, reportImageRefs, type ReadPicture, type ReportFileSources } from './reportFiles.ts'

/** Where a source's files come from now (a new folder reads its pictures again). */
function sourceToken(src: ReportFileSources, ref: ImageRef): string {
  if (ref.source === 'photos') return `photos:${src.photos?.name ?? ''}:${src.photos?.names.length ?? 0}`
  if (ref.source === 'screenshots') return `shots:${src.screenshots?.name ?? ''}:${src.screenshots?.names.length ?? 0}`
  return ref.source
}

/** refKey -> picture (null = could not be read), read in the background. `retry` reads the missing ones again. */
export function useReportPictures(project: Project, src: ReportFileSources) {
  // What has been read (kept across renders for the reading loop), and the same as state for drawing.
  const cache = useRef(new Map<string, { token: string; pic: ReadPicture | null }>())
  const [pictures, setPictures] = useState<ReadonlyMap<string, ReadPicture | null>>(new Map())
  const [retries, setRetries] = useState(0)
  const refs = useMemo(() => (project.report ? reportImageRefs(project.report) : []), [project.report])

  useEffect(() => {
    let alive = true
    const known = cache.current
    void (async () => {
      for (const ref of refs) {
        const token = sourceToken(src, ref)
        const had = known.get(refKey(ref))
        if (had && had.token === token && (had.pic || retries === 0)) continue
        const file = await readReportFile(src, ref)
        const pic = file ? await readPicture(file).catch(() => null) : null
        if (!alive) {
          if (pic) URL.revokeObjectURL(pic.thumb)
          return
        }
        if (had?.pic) URL.revokeObjectURL(had.pic.thumb)
        known.set(refKey(ref), { token, pic })
        setPictures(new Map([...known].map(([k, v]) => [k, v.pic])))
      }
    })()
    return () => {
      alive = false
    }
  }, [refs, src, retries])

  useEffect(() => {
    const known = cache.current
    return () => known.forEach((x) => x.pic && URL.revokeObjectURL(x.pic.thumb))
  }, [])

  const retry = useCallback(() => setRetries((n) => n + 1), [])
  /** Pictures still being read. */
  const loading = refs.some((r) => !pictures.has(refKey(r)))
  return { pictures, retry, loading }
}

/** The picture key of an uploaded PDF page in the pictures map ("uploads|file.pdf#2"), so the Pages view can draw it. */
export const pdfPageKey = (file: string, page: number) => refKey({ source: 'uploads', file: `${file}#${page}` })

/** Side of the PDF page pictures drawn for the Pages view, in pixels. */
const PDF_PAGE_SIDE = 1400

/**
 * The uploaded PDFs of the report: each file's pages (sizes, or why it can't be used; 'missing' when the file is not
 * found or needs an "Allow" click) and a picture of every page the report prints, drawn with pdf.js for the Pages view.
 */
export function useUploadPdfs(project: Project, src: ReportFileSources, retries: number) {
  const [info, setInfo] = useState<ReadonlyMap<string, PdfInfo | 'missing'>>(new Map())
  const [pages, setPages] = useState<ReadonlyMap<string, ReadPicture | null>>(new Map())
  const known = useRef(new Map<string, ReadPicture | null>())
  const wanted = useMemo(() => {
    const ups = (project.report?.uploads ?? []).filter(isPdfUpload)
    return [...new Set(ups.map((u) => u.file))].map((file) => ({ file, pages: [...new Set(ups.filter((u) => u.file === file).map((u) => u.page ?? 1))] }))
  }, [project.report?.uploads])
  const key = JSON.stringify(wanted)

  useEffect(() => {
    let alive = true
    void (async () => {
      const nextInfo = new Map<string, PdfInfo | 'missing'>()
      for (const w of wanted) {
        const file = await readUploadFile(src, w.file)
        const bytes = file ? new Uint8Array(await file.arrayBuffer()) : null
        const pi = bytes ? await readPdfInfo(bytes) : 'missing'
        if (!alive) return
        nextInfo.set(w.file, pi)
        setInfo(new Map(nextInfo))
        if (!bytes || pi === 'missing' || !pi.ok) continue
        const todo = w.pages.filter((n) => n <= pi.pages.length && !known.current.get(pdfPageKey(w.file, n)))
        if (todo.length === 0) continue
        try {
          const { openPdf, renderPage } = await import('./pdfPages.ts')
          const doc = await openPdf(bytes)
          try {
            for (const n of todo) {
              const thumb = await renderPage(doc, n, PDF_PAGE_SIDE).catch(() => null)
              if (!alive) {
                if (thumb) URL.revokeObjectURL(thumb)
                return
              }
              const size = pi.pages[n - 1]
              known.current.set(pdfPageKey(w.file, n), thumb ? { info: { width: Math.round(size.w * 100), height: Math.round(size.h * 100), orientation: 1 }, thumb } : null)
              setPages(new Map(known.current))
            }
          } finally {
            void doc.loadingTask.destroy()
          }
        } catch {
          // The Pages view shows a box for it; the PDF copies the page anyway.
        }
      }
    })()
    return () => {
      alive = false
    }
    // `key` stands for `wanted`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, src, retries])

  useEffect(() => {
    const k = known.current
    return () => k.forEach((x) => x && URL.revokeObjectURL(x.thumb))
  }, [])
  return { info, pages }
}

/** The page model of the job's report (null without a report), built from a slightly deferred copy of the job. */
export function useReportDocument(project: Project, pictures: ReadonlyMap<string, ReadPicture | null>, previewHidden: ReadonlySet<LayerGroup>, pdfInfo: ReadonlyMap<string, PdfInfo | 'missing'> = new Map()): ReportDocument | null {
  const p = useDeferredValue(project)
  return useMemo(() => {
    if (!p.report) return null
    try {
      const pdfPages = (file: string) => {
        const i = pdfInfo.get(file)
        return i && i !== 'missing' && i.ok ? i.pages : null
      }
      return buildReport({ project: p, image: (ref) => pictures.get(refKey(ref))?.info ?? null, previewHidden, pdfPages })
    } catch {
      return null
    }
  }, [p, pictures, previewHidden, pdfInfo])
}
