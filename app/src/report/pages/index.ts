// The whole report as pages (design 7): every section that is on, in the template's order, each drawn by its page
// type's builder (no code checks a template id); custom sheets and uploads moved after another section go there. Two
// passes: the sections are laid out and counted, then the contents get their page numbers and every page its footer
// with "Page X of Y". Pure: the files the report needs come in as their sizes (`image`, `pdfPages`).

import type { LayerGroup } from '../../engine/drawing.ts'
import type { Project } from '../../data/schema.ts'
import { sectionOn, sectionTitle } from '../edits.ts'
import type { Bookmark, ContentsEntry, ImageInfo, ImageRef, ReportDocument, ReportPage } from '../pageModel.ts'
import { DEFAULT_PLACE_AFTER } from '../schema.ts'
import { templateOf } from '../templates/registry.ts'
import type { PageTypeId, SectionDef } from '../templates/types.ts'
import { buildCalibration } from './calibration.ts'
import type { BuildContext, PageBuilder, SectionPages } from './common.ts'
import { buildContents, contentsPageCount } from './contents.ts'
import { buildCover } from './cover.ts'
import { buildCscans } from './cscan.ts'
import { buildCustom, customSheetPages } from './custom.ts'
import { buildDrawings } from './drawing.ts'
import { buildFixedText } from './fixedText.ts'
import { COLORS, F, footerItems, text } from './layout.ts'
import { buildPhotos } from './photos.ts'
import { buildScopeSummary } from './scopeSummary.ts'
import { buildTable } from './tables.ts'
import { buildUploads, uploadPages } from './uploaded.ts'
import { equipmentWords } from './values.ts'

const BUILDERS: Record<Exclude<PageTypeId, 'contents'>, PageBuilder> = {
  cover: buildCover,
  scopeSummary: buildScopeSummary,
  calibration: buildCalibration,
  photos: buildPhotos,
  drawing: buildDrawings,
  table: buildTable,
  cscan: buildCscans,
  custom: buildCustom,
  uploaded: buildUploads,
  fixedText: buildFixedText,
}

export interface ReportBuildInput {
  project: Project
  /** Size and orientation of a picture (null = not found); default: none can be read. */
  image?: (ref: ImageRef) => ImageInfo | null
  pdfPages?: (file: string) => { w: number; h: number }[] | null
  previewHidden?: ReadonlySet<LayerGroup>
}

interface Part {
  def: SectionDef
  title: string
  built: SectionPages
  /** Gets its own contents entry and bookmark. */
  listed: boolean
}

export function buildReport(input: ReportBuildInput): ReportDocument {
  const p = input.project
  const r = p.report
  if (!r) throw new Error('The job has no report.')
  const t = templateOf(r.templateId)
  const notes: string[] = []
  const unread: string[] = []
  const c: BuildContext = {
    p, r, t, notes, unread,
    image: input.image ?? (() => null),
    pdfPages: input.pdfPages ?? (() => null),
    previewHidden: input.previewHidden ?? new Set(),
  }
  const on = t.sections.filter((d) => sectionOn(r, d))
  const onIds = new Set(on.map((d) => d.id))
  /** Where a custom sheet or upload goes: its own section, or after the section it names. */
  const anchor = (after: string, own: SectionDef | undefined) => (after === DEFAULT_PLACE_AFTER || after === own?.id || !onIds.has(after) ? null : after)
  const customDef = t.sections.find((d) => d.pageType === 'custom')
  const uploadDef = t.sections.find((d) => d.pageType === 'uploaded')

  // Pass 1: lay out every section (the contents later).
  const parts: Part[] = []
  for (const def of on) {
    const title = sectionTitle(r, def)
    if (def.pageType === 'contents') {
      parts.push({ def, title, built: { pages: [], bookmarks: [] }, listed: false })
    } else if (def.pageType === 'custom') {
      const sheets = r.customSheets.filter((s) => anchor(s.after, customDef) === null)
      if (sheets.length) parts.push({ def, title, built: { pages: customSheetPages(c, def, sheets), bookmarks: sheets.map((s, i) => ({ title: s.title.trim() || title, page: i, children: [] })) }, listed: true })
    } else if (def.pageType === 'uploaded') {
      const ups = r.uploads.filter((u) => anchor(u.after, uploadDef) === null)
      if (ups.length) parts.push({ def, title, built: { pages: uploadPages(c, def, ups), bookmarks: ups.map((u, i) => ({ title: u.title.trim() || u.file, page: i, children: [] })) }, listed: true })
    } else {
      parts.push({ def, title, built: BUILDERS[def.pageType](c, def, title), listed: def.pageType !== 'cover' })
    }
    // Custom sheets and uploads placed after this section.
    if (customDef) for (const s of r.customSheets.filter((x) => anchor(x.after, customDef) === def.id)) {
      parts.push({ def: customDef, title: s.title.trim() || customDef.title, built: { pages: customSheetPages(c, customDef, [s]), bookmarks: [] }, listed: true })
    }
    if (uploadDef) for (const u of r.uploads.filter((x) => anchor(x.after, uploadDef) === def.id)) {
      parts.push({ def: uploadDef, title: u.title.trim() || u.file, built: { pages: uploadPages(c, uploadDef, [u]), bookmarks: [] }, listed: true })
    }
  }

  // Pass 2: the contents' own length, then every part's first page, then the contents with real numbers.
  const listed = parts.filter((x) => x.listed && x.built.pages.length > 0)
  const contentsPart = parts.find((x) => x.def.pageType === 'contents')
  // The Scans index under the contents: every scan of the C-Scan Data section (one page each), while it is on.
  const cscanPart = parts.find((x) => x.def.pageType === 'cscan' && x.built.pages.length > 0)
  const scanMarks = cscanPart?.built.bookmarks ?? []
  if (contentsPart) contentsPart.built = { pages: new Array<ReportPage>(contentsPageCount(listed.length, scanMarks.length)), bookmarks: [] }
  const starts = new Map<Part, number>()
  let n = 0
  for (const part of parts) {
    starts.set(part, n)
    n += part.built.pages.length
  }
  const contents: ContentsEntry[] = listed.map((x) => ({ title: x.title, page: starts.get(x)! }))
  const scanIndex: ContentsEntry[] = cscanPart ? scanMarks.map((b) => ({ title: b.title, page: starts.get(cscanPart)! + b.page })) : []
  if (contentsPart) contentsPart.built = buildContents(c, contentsPart.def, contentsPart.title, contents, scanIndex)

  const pages = parts.flatMap((x) => x.built.pages)
  const bookmarks: Bookmark[] = listed.map((x) => {
    const s = starts.get(x)!
    const shift = (b: Bookmark): Bookmark => ({ title: b.title, page: b.page + s, children: b.children.map(shift) })
    return { title: x.title, page: s, children: x.built.bookmarks.map(shift) }
  })
  if (contentsPart) bookmarks.splice(0, 0, { title: contentsPart.title, page: starts.get(contentsPart)!, children: [] })

  // Footers with "Page X of Y".
  const total = pages.length
  const withFooters = pages.map((page, i): ReportPage => {
    if (page.footer === 'standard') return { ...page, items: [...page.items, ...footerItems(c, page, i + 1, total)] }
    if (page.footer === 'number') return { ...page, items: [...page.items, text(page.size.w - 0.4, page.size.h - 0.25, `Page ${i + 1} of ${total}`, F.body, 7.5, COLORS.muted, 'right')] }
    return page
  })
  const files = [...new Set(unread)]
  if (files.length) notes.unshift(`${files.length} picture${files.length === 1 ? '' : 's'} could not be read, so a grey box prints in ${files.length === 1 ? 'its' : 'their'} place: ${files.slice(0, 10).join(', ')}${files.length > 10 ? ', ...' : ''}.`)
  const equipment = equipmentWords(p)
  return {
    pages: withFooters,
    bookmarks,
    contents,
    notes: [...new Set(notes)],
    title: `${equipment ? `${equipment} - ` : ''}AUT Report`,
    author: r.job.techs.map((x) => x.name.trim()).filter((s) => s).join(', '),
  }
}
