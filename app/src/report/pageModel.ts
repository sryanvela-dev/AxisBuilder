// The report's page model (report design section 7): every report page as placed items in inches, export-neutral.
// Layout happens once, in the page builders (report/pages/); the PDF writer (report/pdf/) and the Pages view only draw
// what is here, so they always show the same thing. Word export later converts the same model.
//
// Coordinates: inches from the page's top-left corner, y down (the PDF writer flips them). Text sizes are points.

import type { SheetModel } from '../engine/sheetModel.ts'
import type { ReportStepId } from '../state/reportStepIds.ts'
import type { ReportFontId } from './fonts.ts'
import type { ImagePlace } from './imageItems.ts'
import type { FracBox, Mark, Rotation } from './schema.ts'

export type Color = string

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** One line of text: x is the anchor (left, centre or right edge by `align`), y the baseline. */
export interface TextItem {
  t: 'text'
  x: number
  y: number
  text: string
  font: ReportFontId
  size: number
  color: Color
  align: 'left' | 'center' | 'right'
  /** A contrasting outline drawn under the letters (plain picture labels read on any photo); width in points. */
  halo?: { color: Color; width: number }
}

export interface LineItem {
  t: 'line'
  x1: number
  y1: number
  x2: number
  y2: number
  /** Points. */
  width: number
  color: Color
}

export interface RectItem extends Rect {
  t: 'rect'
  fill: Color | null
  stroke: Color | null
  /** Points. */
  width: number
  /** Corner radius, inches. */
  radius: number
}

/** Where a picture is read from: the report folders, the files remembered per job, an upload, or the app's brand assets. */
export type ImageSource = 'photos' | 'screenshots' | 'cover' | 'calibration' | 'uploads' | 'brand'

export interface ImageRef {
  source: ImageSource
  file: string
}

/** What the builders need to know about a picture before laying it out (read from the file). */
export interface ImageInfo {
  /** Pixel size of the file as stored. */
  width: number
  height: number
  /** EXIF orientation 1-8 (1 = as stored). */
  orientation: number
}

/**
 * A picture on a page: the file, its edits and where the visible part lands. The visible part is the picture after
 * its EXIF orientation, then `rotate`, then `crop` (the crop box is in the upright, unturned picture, so it turns with
 * it); `box` has exactly its shape. Marks are drawn over it as vectors, clipped to the box.
 */
export interface ImageItem extends Rect {
  t: 'image'
  ref: ImageRef
  /** Pixel size after the EXIF orientation (the picture the crop and marks refer to). */
  upright: { w: number; h: number }
  orientation: number
  rotate: Rotation
  crop: FracBox | null
  /** Drawn marks (redactions are not marks on the page: they are in `redactions`), lowest z first. */
  marks: Mark[]
  /** Auto brightness / contrast (levels stretched per channel) on the pixels, on screen and in the PDF. */
  autoLevels?: boolean
  /** Areas whose pixels are removed (black or blurred) before the picture is shown or embedded (R5). */
  redactions?: Redaction[]
  /** Which picture of the report this is (the markup editor finds its printed size and slot from it). */
  place?: ImagePlace
  /** Embedded once per key: same file, same crop, same pixel edits. */
  key: string
}

/** A redacted area of a picture, in its upright 0-1 fractions. */
export interface Redaction {
  box: FracBox
  mode: 'black' | 'blur'
}

/** A drawing sheet (engine/sheetModel.ts) printed as vectors: `region` of the sheet (paper inches, y up) into `box`. */
export interface SheetItem {
  t: 'sheet'
  model: SheetModel
  region: { x: number; y: number; w: number; h: number }
  box: Rect
  /** Marks over the sheet (format 10), in fractions of the printed region (x right, y down); lowest z first. */
  marks?: Mark[]
  /** Which drawing sheet of the report this is (its marks are stored under it). */
  place?: ImagePlace
}

/** A sheet item's marks frame: its box on the page, the region's shape as the "pixels". */
export const sheetFrame = (it: Pick<SheetItem, 'box' | 'region'>) => ({ ...it.box, crop: null, rotate: 0 as const, upright: { w: it.region.w, h: it.region.h } })

/** A page of an uploaded PDF, copied as vectors (pdf-lib embedPage) into `box`, turned by `rotate`. */
export interface PdfPageItem {
  t: 'pdfPage'
  file: string
  /** 1 = the first page. */
  page: number
  rotate: Rotation
  box: Rect
  /** Darken a faint page: the page printed this many more times over itself, multiplied (0 = as it is). */
  darken?: number
  /** Marks over the page (R5), in fractions of the page as it is stored (before the turn); lowest z first. */
  marks?: Mark[]
  /** The page's own size (inches, unturned), the marks' frame. */
  pageSize?: { w: number; h: number }
  place?: ImagePlace
}

export type PathCmd = ['M', number, number] | ['L', number, number] | ['C', number, number, number, number, number, number] | ['Z']

/** A vector path (picture marks, rounded boxes, circles). */
export interface PathItem {
  t: 'path'
  d: PathCmd[]
  stroke: Color | null
  fill: Color | null
  /** Points. */
  width: number
  /** Of the whole path. */
  opacity: number
  /** Of the fill only (a highlighted box). */
  fillOpacity: number
  cap: 'round' | 'butt'
  /** Multiplied onto what is under it (the highlighter: a marker on paper). */
  blend?: 'multiply'
}

/** A clickable area that goes to another page of the report (the contents). */
export interface LinkItem extends Rect {
  t: 'link'
  page: number
}

export type PageItem = TextItem | LineItem | RectItem | PathItem | ImageItem | SheetItem | PdfPageItem | LinkItem

export interface ReportPage {
  /** Inches: letter 8.5 x 11 portrait or 11 x 8.5 landscape (an uploaded full-size page keeps its own). */
  size: { w: number; h: number }
  /** The template section that made it. */
  sectionId: string
  /** The report step that fills it (the Pages view jumps there). */
  step: ReportStepId
  /** Short name for the Pages view and bookmarks ("Scan 12", "Photos 2"). */
  label: string
  /** Footer: the standard one, only the page number (an uploaded page at full size) or none (the cover). */
  footer: 'standard' | 'number' | 'none'
  items: PageItem[]
}

export interface Bookmark {
  title: string
  /** Index into the pages. */
  page: number
  children: Bookmark[]
}

export interface ContentsEntry {
  title: string
  page: number
}

export interface ReportDocument {
  pages: ReportPage[]
  bookmarks: Bookmark[]
  contents: ContentsEntry[]
  /** Things the PDF leaves out or shows as a placeholder, for the export summary and Review. */
  notes: string[]
  title: string
  author: string
}

/** A rectangle as a path, with rounded corners when radius > 0. */
export function rectPath(r: Rect, radius = 0): PathCmd[] {
  const k = Math.min(radius, r.w / 2, r.h / 2)
  if (k <= 0) return [['M', r.x, r.y], ['L', r.x + r.w, r.y], ['L', r.x + r.w, r.y + r.h], ['L', r.x, r.y + r.h], ['Z']]
  const c = k * 0.5523
  const { x, y, w, h } = r
  return [
    ['M', x + k, y], ['L', x + w - k, y], ['C', x + w - k + c, y, x + w, y + k - c, x + w, y + k],
    ['L', x + w, y + h - k], ['C', x + w, y + h - k + c, x + w - k + c, y + h, x + w - k, y + h],
    ['L', x + k, y + h], ['C', x + k - c, y + h, x, y + h - k + c, x, y + h - k],
    ['L', x, y + k], ['C', x, y + k - c, x + k - c, y, x + k, y], ['Z'],
  ]
}

/** An ellipse filling a rectangle, as four curves. */
export function ellipsePath(r: Rect): PathCmd[] {
  const rx = r.w / 2
  const ry = r.h / 2
  const cx = r.x + rx
  const cy = r.y + ry
  const kx = rx * 0.5523
  const ky = ry * 0.5523
  return [
    ['M', cx + rx, cy], ['C', cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry], ['C', cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy],
    ['C', cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry], ['C', cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy], ['Z'],
  ]
}

// --- Picture geometry ---------------------------------------------------------------------------

/** Stored pixel fraction (y down) -> upright fraction for an EXIF orientation. */
export function orientPoint(o: number, [sx, sy]: readonly [number, number]): [number, number] {
  switch (o) {
    case 2: return [1 - sx, sy]
    case 3: return [1 - sx, 1 - sy]
    case 4: return [sx, 1 - sy]
    case 5: return [sy, sx]
    case 6: return [1 - sy, sx]
    case 7: return [1 - sy, 1 - sx]
    case 8: return [sy, 1 - sx]
    default: return [sx, sy]
  }
}

/** Pixel size after the EXIF orientation (5-8 swap width and height). */
export function uprightSize(info: ImageInfo): { w: number; h: number } {
  return info.orientation >= 5 && info.orientation <= 8 ? { w: info.height, h: info.width } : { w: info.width, h: info.height }
}

const FULL: FracBox = { x0: 0, y0: 0, x1: 1, y1: 1 }

/** Width over height of the visible part (after crop and turn). */
export function visibleAspect(upright: { w: number; h: number }, crop: FracBox | null, rotate: Rotation): number {
  const c = crop ?? FULL
  const w = (c.x1 - c.x0) * upright.w
  const h = (c.y1 - c.y0) * upright.h
  return rotate === 90 || rotate === 270 ? h / w : w / h
}

/** Upright fraction (crop and marks space) -> point on the page, for a picture item. */
export function imagePoint(item: Pick<ImageItem, 'x' | 'y' | 'w' | 'h' | 'crop' | 'rotate'>, [u, v]: readonly [number, number]): [number, number] {
  const c = item.crop ?? FULL
  const cu = (u - c.x0) / (c.x1 - c.x0)
  const cv = (v - c.y0) / (c.y1 - c.y0)
  const [fu, fv] = item.rotate === 90 ? [1 - cv, cu] : item.rotate === 180 ? [1 - cu, 1 - cv] : item.rotate === 270 ? [cv, 1 - cu] : [cu, cv]
  return [item.x + fu * item.w, item.y + fv * item.h]
}

/**
 * The affine map from a picture's stored pixels (unit square, y down: (0,0) top-left) to the page, as
 * [a, b, c, d, e, f] with page = (a*sx + c*sy + e, b*sx + d*sy + f). `region` is the part of the upright picture the
 * stored pixels show (all of it for the original file; the crop box for a picture already cut to it).
 */
export function storedToPage(item: Pick<ImageItem, 'x' | 'y' | 'w' | 'h' | 'crop' | 'rotate'>, orientation: number, region: FracBox = FULL): [number, number, number, number, number, number] {
  const at = (sx: number, sy: number) => {
    const [ox, oy] = orientPoint(orientation, [sx, sy])
    return imagePoint(item, [region.x0 + ox * (region.x1 - region.x0), region.y0 + oy * (region.y1 - region.y0)])
  }
  const o = at(0, 0)
  const x = at(1, 0)
  const y = at(0, 1)
  return [x[0] - o[0], x[1] - o[1], y[0] - o[0], y[1] - o[1], o[0], o[1]]
}

/**
 * The key a picture is embedded under: the same file with the same crop is embedded once. Pixel edits (auto levels,
 * redactions) make it another picture.
 */
export function imageKey(ref: ImageRef, crop: FracBox | null, pixels: { autoLevels?: boolean; redactions?: readonly Redaction[] } = {}): string {
  const c = crop ? `${crop.x0},${crop.y0},${crop.x1},${crop.y1}` : 'all'
  const lv = pixels.autoLevels ? '|levels' : ''
  const rd = pixels.redactions?.length ? `|r:${pixels.redactions.map((r) => `${r.mode[0]}${r.box.x0},${r.box.y0},${r.box.x1},${r.box.y1}`).join(';')}` : ''
  return `${ref.source}|${ref.file}|${c}${lv}${rd}`
}

/** Every picture the document prints, with its largest printed size in inches (of the visible part, unturned). */
export interface ImageNeed {
  key: string
  ref: ImageRef
  crop: FracBox | null
  orientation: number
  printedW: number
  printedH: number
  autoLevels: boolean
  redactions: Redaction[]
}

export function imageNeeds(doc: Pick<ReportDocument, 'pages'>): ImageNeed[] {
  const out = new Map<string, ImageNeed>()
  for (const page of doc.pages) {
    for (const it of page.items) {
      if (it.t !== 'image') continue
      const turned = it.rotate === 90 || it.rotate === 270
      const w = turned ? it.h : it.w
      const h = turned ? it.w : it.h
      const had = out.get(it.key)
      if (!had) out.set(it.key, { key: it.key, ref: it.ref, crop: it.crop, orientation: it.orientation, printedW: w, printedH: h, autoLevels: it.autoLevels ?? false, redactions: it.redactions ?? [] })
      else if (w > had.printedW) out.set(it.key, { ...had, printedW: w, printedH: h })
    }
  }
  return [...out.values()]
}
