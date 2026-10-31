// Reference pages (design 4.6, 6.11): uploaded pictures fitted under the standard frame with their title, and pages of
// uploaded PDFs copied as vectors (pdf-lib embedPage): 'standard' fitted under the frame, turned as chosen; 'full' the
// page as it is, at its own size, with only the page number added. An upright sheet or picture (taller than wide, as
// turned) gets a portrait page, so it prints larger (user, 2026-10-31).

import type { PageItem, ReportPage } from '../pageModel.ts'
import type { Upload } from '../schema.ts'
import type { SectionDef } from '../templates/types.ts'
import { content, placeImage, printedMarks, standardPage, stepOf, type BuildContext, type PageBuilder } from './common.ts'
import { LETTER_LANDSCAPE, LETTER_PORTRAIT, placeholder } from './layout.ts'
import { uprightSize, visibleAspect } from '../pageModel.ts'
import { fitWithKey, keyItems } from './badgeKey.ts'

const isPdf = (u: Upload) => /\.pdf$/i.test(u.file) || u.page !== null

/** Portrait letter when the sheet is taller than wide (as it prints), else landscape. */
const pageFor = (aspect: number | null) => (aspect !== null && aspect < 1 ? LETTER_PORTRAIT : LETTER_LANDSCAPE)

function uploadPage(c: BuildContext, def: SectionDef, u: Upload): ReportPage {
  const title = u.title.trim() || def.title
  const label = u.title.trim() || u.file
  const place = { kind: 'upload' as const, index: c.r.uploads.indexOf(u) }
  if (!isPdf(u)) {
    const ref = { source: 'uploads' as const, file: u.file }
    const info = c.image(ref)
    const size = pageFor(info ? visibleAspect(uprightSize(info), u.crop, u.rotate) : null)
    return standardPage(c, def, label, title, '', placeImage(c, ref, u, content(size), 'Picture not found', 'center', false, place).items, size)
  }
  const sizes = c.pdfPages(u.file)
  const size = sizes?.[(u.page ?? 1) - 1]
  if (!size) {
    c.notes.push(`${u.file}${u.page ? ` page ${u.page}` : ''} could not be read; a placeholder prints.`)
    return standardPage(c, def, label, title, '', placeholder(content(), 'Reference page not found'))
  }
  const turned = u.rotate === 90 || u.rotate === 270
  const w = turned ? size.h : size.w
  const h = turned ? size.w : size.h
  // Marks over the page (R5); redaction can't remove what is on a PDF page without turning it into a picture, so the
  // editor doesn't offer it there and any redaction mark is left out (Review says so).
  const { marks } = printedMarks(c, u)
  const extra = { ...(marks.length ? { marks } : {}), pageSize: size, place }
  if (u.frame === 'full') {
    const item: PageItem = { t: 'pdfPage', file: u.file, page: u.page ?? 1, rotate: u.rotate, box: { x: 0, y: 0, w, h }, darken: u.adjust.darken, ...extra }
    return { size: { w, h }, sectionId: def.id, step: stepOf(def), label, footer: 'number', items: [item] }
  }
  const page = pageFor(w / h)
  const fit = fitWithKey(w / h, content(page), 'center', marks)
  const items: PageItem[] = [{ t: 'pdfPage', file: u.file, page: u.page ?? 1, rotate: u.rotate, box: fit.box, darken: u.adjust.darken, ...extra }]
  if (fit.key) items.push(...keyItems(fit.entries, fit.key.x, fit.key.y, fit.key.w))
  return standardPage(c, def, label, title, '', items, page)
}

/** The pages of the given uploads. */
export function uploadPages(c: BuildContext, def: SectionDef, uploads: readonly Upload[]): ReportPage[] {
  return uploads.map((u) => uploadPage(c, def, u))
}

export const buildUploads: PageBuilder = (c, def) => {
  const pages = uploadPages(c, def, c.r.uploads)
  return { pages, bookmarks: c.r.uploads.map((u, i) => ({ title: u.title.trim() || u.file, page: i, children: [] })) }
}

