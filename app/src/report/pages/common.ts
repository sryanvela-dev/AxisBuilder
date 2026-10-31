// What every page builder gets and shares: the job, the files it can read (picture sizes, PDF page sizes), the
// standard page and pictures placed with their edits.

import type { LayerGroup } from '../../engine/drawing.ts'
import type { ReportStepId } from '../../state/reportStepIds.ts'
import type { ImagePlace } from '../imageItems.ts'
import { withLiveText } from '../liveLabels.ts'
import { imageKey, uprightSize, visibleAspect, type Bookmark, type ImageInfo, type ImageRef, type PageItem, type Rect, type Redaction, type ReportPage } from '../pageModel.ts'
import type { ImageEdits, Mark } from '../schema.ts'
import { fitWithKey, keyItems } from './badgeKey.ts'
import type { SectionDef } from '../templates/types.ts'
import { CONTENT, CONTENT_PORTRAIT, FRAME, frameItems, isPortrait, LETTER_LANDSCAPE, placeholder, type FrameContext, type PageSize } from './layout.ts'

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

/** The marks a picture prints over it (live labels filled from the data now) and its redactions (pixels removed). */
export function printedMarks(c: BuildContext, edits: Pick<ImageEdits, 'markup'>): { marks: Mark[]; redactions: Redaction[] } {
  const marks: Mark[] = []
  const redactions: Redaction[] = []
  for (const m of edits.markup) {
    if (m.kind === 'redaction') redactions.push({ box: m.box, mode: m.mode })
    else marks.push(withLiveText(c.p, m))
  }
  return { marks, redactions }
}

/**
 * A picture with its edits fitted into `area` (shape kept, never stretched), with its badge key under it, or the quiet
 * placeholder when the file can't be read. Returns the items, the box the picture took and the bottom of picture + key.
 */
export function placeImage(c: BuildContext, ref: ImageRef | null, edits: ImageEdits, area: Rect, missing: string, align: 'center' | 'top' = 'center', frame = false, place?: ImagePlace): { items: PageItem[]; box: Rect; bottom: number; found: boolean } {
  const info = ref ? c.image(ref) : null
  if (!ref || !info) {
    if (ref) c.unread.push(ref.file)
    const box = align === 'top' ? { ...area, h: Math.min(area.h, area.w * 0.62) } : area
    return { items: placeholder(box, missing), box, bottom: box.y + box.h, found: false }
  }
  const upright = uprightSize(info)
  const { marks, redactions } = printedMarks(c, edits)
  const autoLevels = edits.adjust.autoLevels
  const fit = fitWithKey(visibleAspect(upright, edits.crop, edits.rotate), area, align, marks)
  const box = fit.box
  const items: PageItem[] = [{
    t: 'image', ref, ...box, upright, orientation: info.orientation, rotate: edits.rotate, crop: edits.crop, marks,
    ...(autoLevels ? { autoLevels } : {}), ...(redactions.length ? { redactions } : {}), ...(place ? { place } : {}),
    key: imageKey(ref, edits.crop, { autoLevels, redactions }),
  }]
  if (frame) items.push({ t: 'rect', ...box, fill: null, stroke: '#C9DAEA', width: 0.75, radius: 0 })
  if (fit.key) items.push(...keyItems(fit.entries, fit.key.x, fit.key.y, fit.key.w))
  return { items, box, bottom: fit.key ? fit.key.y + fit.key.h : box.y + box.h, found: true }
}
