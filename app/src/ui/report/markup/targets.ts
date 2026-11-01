// Where the markup editor finds a report picture's pixels from its place, and a way for screens without the picture at
// hand (Review's Go to) to open the editor on it: openMarkup(place) asks the MarkupOpener in the report workspace.

import { pictureName } from '../../../report/checks.ts'
import type { ImagePlace } from '../../../report/imageItems.ts'
import type { ImageSource } from '../../../report/pageModel.ts'
import { isPdfUpload, pictureAt } from '../../../report/pagesEdits.ts'
import type { Report } from '../../../report/schema.ts'
import type { MarkupTarget } from './MarkupWindow.tsx'

const SOURCE: Record<ImagePlace['kind'], ImageSource> = {
  photo: 'photos', cover: 'cover', calibration: 'calibration', dataImage: 'screenshots', sheetImage: 'photos', upload: 'uploads', drawing: 'photos',
}

/** The markup target of a picture in the report, or null when the place holds no picture file. */
export function markupTargetFor(r: Report, at: ImagePlace): MarkupTarget | null {
  const item = pictureAt(r, at)
  if (!item?.file) return null
  const name = pictureName(r, at, item.file)
  if (at.kind === 'upload') {
    const u = r.uploads[at.index]
    if (u && isPdfUpload(u)) return { at, picture: null, pdfPage: { file: u.file, page: u.page ?? 1 }, name }
  }
  return { at, picture: { source: SOURCE[at.kind], file: item.file }, name }
}

/** Opens the markup editor on a picture (heard by MarkupOpener). */
export const markupEvents = new EventTarget()
export function openMarkup(at: ImagePlace): void {
  markupEvents.dispatchEvent(new CustomEvent<ImagePlace>('open', { detail: at }))
}
