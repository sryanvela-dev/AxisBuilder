// Uploaded PDFs (design 4.6): how many pages, and each page's size, read with pdf-lib (the PDF writer's own library, so
// what it can read here it can copy into the report). A password-protected or damaged PDF gets the design's plain
// message instead.

/** Each page's size in inches, or the plain reason the PDF can't be used. */
export type PdfInfo = { ok: true; pages: { w: number; h: number }[] } | { ok: false; problem: string }

export const PDF_LOCKED = 'This PDF is locked; open it and print to a new PDF first.'
export const PDF_DAMAGED = 'This PDF could not be read (it may be damaged); open it and print to a new PDF first.'

export async function readPdfInfo(bytes: Uint8Array): Promise<PdfInfo> {
  const { PDFDocument } = await import('pdf-lib')
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false })
    if (doc.isEncrypted) return { ok: false, problem: PDF_LOCKED }
    const pages = doc.getPages().map((pg) => {
      const { width, height } = pg.getSize()
      return { w: width / 72, h: height / 72 }
    })
    return pages.length ? { ok: true, pages } : { ok: false, problem: PDF_DAMAGED }
  } catch (e) {
    // pdf-lib's EncryptedPDFError doesn't survive instanceof (a compiled Error subclass): known by its message.
    return { ok: false, problem: e instanceof Error && /encrypted/i.test(e.message) ? PDF_LOCKED : PDF_DAMAGED }
  }
}
