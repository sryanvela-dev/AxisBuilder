// Pictures of uploaded PDF pages for the screen (design 4.6): the page picker's thumbnails and the Pages view. pdf.js is
// bundled with the app (its worker too, precached for offline use) and loaded only when a PDF is shown. The report PDF
// itself never uses these pictures: it copies the original page (pdf-lib embedPdf), so text stays sharp.

import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PDFDocumentProxy } from 'pdfjs-dist'

let lib: Promise<typeof import('pdfjs-dist')> | null = null

function pdfjs() {
  lib ??= import('pdfjs-dist').then((m) => {
    m.GlobalWorkerOptions.workerSrc = workerUrl
    return m
  })
  return lib
}

/** Opens a PDF for drawing its pages (the bytes are copied: pdf.js takes the buffer it is given). */
export async function openPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const m = await pdfjs()
  // wasmUrl: the decoders for scanned layers (fax / JBIG2 masks), JPEG 2000 and ICC colors (vite.config.ts pdfjsWasm).
  return m.getDocument({ data: bytes.slice(), wasmUrl: new URL('/pdfjs-wasm/', location.href).href }).promise
}

/** One page as a picture (object URL, PNG), its longer side `maxSide` pixels. */
export async function renderPage(doc: PDFDocumentProxy, page: number, maxSide: number): Promise<string> {
  const pg = await doc.getPage(page)
  try {
    // Unturned, as the report copies it (pdf-lib embeds the page without its /Rotate); the upload's own turn fixes it.
    const base = pg.getViewport({ scale: 1, rotation: 0 })
    const viewport = pg.getViewport({ scale: maxSide / Math.max(base.width, base.height), rotation: 0 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(viewport.width))
    canvas.height = Math.max(1, Math.round(viewport.height))
    await pg.render({ canvas, viewport, background: '#ffffff' }).promise
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'))
    if (!blob) throw new Error('The page could not be drawn.')
    return URL.createObjectURL(blob)
  } finally {
    pg.cleanup()
  }
}
