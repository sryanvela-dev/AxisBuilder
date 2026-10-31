// What every page builder gets and shares: the job, the files it can read (picture sizes, PDF page sizes), the
// standard page and pictures placed with their edits.

import type { LayerGroup } from '../../engine/drawing.ts'
import type { ReportStepId } from '../../state/reportStepIds.ts'
import { imageKey, uprightSize, visibleAspect, type Bookmark, type ImageInfo, type ImageRef, type PageItem, type Rect, type ReportPage } from '../pageModel.ts'
import type { ImageEdits } from '../schema.ts'
import type { SectionDef } from '../templates/types.ts'
import { CONTENT, CONTENT_PORTRAIT, FRAME, fitBox, frameItems, isPortrait, LETTER_LANDSCAPE, placeholder, type FrameContext, type PageSize } from './layout.ts'

export interface BuildContext extends FrameContext {
  /** Size and orientation of a picture; null = not found or not readable (a placeholder prints). */
  image: (ref: ImageRef) => ImageInfo | null
  /** Page sizes (inches) of an uploaded PDF; null = not found or not readable. */
  pdfPages: (file: string) => { w: number; h: number }[] | null
  /** Layer groups switched off in the drawing preview ("As the preview" drawings). */
  previewHidden: ReadonlySet<LayerGroup>
  /** Things the PDF leaves out or shows as a placeholder (export summary, Review). */
  notes: string[]
  /** Picture files that could not be read (one note lists them). */
  unread: string[]
}

export interface SectionPages {
  pages: ReportPage[]
  /** Bookmarks under the section's own, pages counted from the section's first page. */
  bookmarks: Bookmark[]
  /** Extra contents entries (custom sheets and uploads placed after another section), pages from the section's first. */
  entries?: { title: string; page: number }[]
}

export type PageBuilder = (c: BuildContext, def: SectionDef, title: string) => SectionPages

/** The report step that fills a section's pages (the Pages view jumps there). */
export function stepOf(def: SectionDef): ReportStepId {
  switch (def.pageType) {
    case 'scopeSummary': return 'summary'
    case 'calibration': return 'calibration'
    case 'table': return def.options?.table === 'readings' ? 'manual' : 'results'
    case 'cscan': return 'results'
    case 'photos': case 'drawing': case 'custom': case 'uploaded': return 'pages'
    default: return 'setup'
  }
}

/** A landscape page in the standard frame. */
/** A page under the standard frame; landscape letter unless `size` says portrait (reference pages of upright sheets). */
export function standardPage(c: BuildContext, def: SectionDef, label: string, title: string, subtitle: string, items: PageItem[], size: PageSize = LETTER_LANDSCAPE): ReportPage {
  return { size, sectionId: def.id, step: stepOf(def), label, footer: 'standard', items: [...frameItems(c, title, subtitle, size), ...items] }
}

export const content = (size: PageSize = LETTER_LANDSCAPE): Rect => ({ ...(isPortrait(size) ? CONTENT_PORTRAIT : CONTENT) })
export { FRAME }

/**
 * A picture with its edits fitted into `area` (shape kept, never stretched), or the quiet placeholder when the file
 * can't be read. Returns the items and the box the picture took.
 */
export function placeImage(c: BuildContext, ref: ImageRef | null, edits: ImageEdits, area: Rect, missing: string, align: 'center' | 'top' = 'center', frame = false): { items: PageItem[]; box: Rect; found: boolean } {
  const info = ref ? c.image(ref) : null
  if (!ref || !info) {
    if (ref) c.unread.push(ref.file)
    const box = align === 'top' ? { ...area, h: Math.min(area.h, area.w * 0.62) } : area
    return { items: placeholder(box, missing), box, found: false }
  }
  const upright = uprightSize(info)
  const box = fitBox(visibleAspect(upright, edits.crop, edits.rotate), area, align)
  const marks = edits.markup.filter((m) => m.kind !== 'redaction')
  const items: PageItem[] = [{
    t: 'image', ref, ...box, upright, orientation: info.orientation, rotate: edits.rotate, crop: edits.crop, marks, key: imageKey(ref, edits.crop),
  }]
  if (frame) items.push({ t: 'rect', ...box, fill: null, stroke: '#C9DAEA', width: 0.75, radius: 0 })
  if (edits.markup.some((m) => m.kind === 'redaction')) c.notes.push(`${ref.file} has a redaction box: redaction comes in a later version, so it is not applied in this PDF.`)
  return { items, box, found: true }
}
