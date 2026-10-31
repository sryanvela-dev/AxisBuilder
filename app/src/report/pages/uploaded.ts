// Reference pages (design 4.6, 6.11): uploaded pictures fitted under the standard frame with their title, and pages of
// uploaded PDFs copied as vectors (pdf-lib embedPage): 'standard' fitted under the frame, turned as chosen; 'full' the
// page as it is, at its own size, with only the page number added. An upright sheet or picture (taller than wide, as
// turned) gets a portrait page, so it prints larger (user, 2026-10-31).

import type { PageItem, ReportPage } from '../pageModel.ts'
import type { Upload } from '../schema.ts'
import type { SectionDef } from '../templates/types.ts'
import { content, placeImage, standardPage, stepOf, type BuildContext, type PageBuilder } from './common.ts'
import { fitBox, LETTER_LANDSCAPE, LETTER_PORTRAIT, placeholder } from './layout.ts'
import { uprightSize, visibleAspect } from '../pageModel.ts'

const isPdf = (u: Upload) => /\.pdf$/i.test(u.file) || u.page !== null

/** Portrait letter when the sheet is taller than wide (as it prints), else landscape. */
const pageFor = (aspect: number | null) => (aspect !== null && aspect < 1 ? LETTER_PORTRAIT : LETTER_LANDSCAPE)

function uploadPage(c: BuildContext, def: SectionDef, u: Upload): ReportPage {
  const title = u.title.trim() || def.title
  const label = u.title.trim() || u.file
  if (!isPdf(u)) {
    const ref = { source: 'uploads' as const, file: u.file }
    const info = c.image(ref)
    const size = pageFor(info ? visibleAspect(uprightSize(info), u.crop, u.rotate) : null)
    return standardPage(c, def, label, title, '', placeImage(c, ref, u, content(size), 'Picture not found').items, size)
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
  if (u.markup.length) c.notes.push(`Marks on ${u.file} page ${u.page ?? 1} print from R5 (markup over PDF pages).`)
  if (u.frame === 'full') {
    const item: PageItem = { t: 'pdfPage', file: u.file, page: u.page ?? 1, rotate: u.rotate, box: { x: 0, y: 0, w, h }, darken: u.adjust.darken }
    return { size: { w, h }, sectionId: def.id, step: stepOf(def), label, footer: 'number', items: [item] }
  }
  const page = pageFor(w / h)
  return standardPage(c, def, label, title, '', [{ t: 'pdfPage', file: u.file, page: u.page ?? 1, rotate: u.rotate, box: fitBox(w / h, content(page)), darken: u.adjust.darken }], page)
}

/** The pages of the given uploads. */
export function uploadPages(c: BuildContext, def: SectionDef, uploads: readonly Upload[]): ReportPage[] {
  return uploads.map((u) => uploadPage(c, def, u))
}

export const buildUploads: PageBuilder = (c, def) => {
  const pages = uploadPages(c, def, c.r.uploads)
  return { pages, bookmarks: c.r.uploads.map((u, i) => ({ title: u.title.trim() || u.file, page: i, children: [] })) }
}

