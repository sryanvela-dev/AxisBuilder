// AUT Equipment and Guide to Interpretation (design 6.12): the template's fixed text and pictures, part by part (every
// part starts a page). 'side' parts put the text on the left and the pictures in a column on the right; 'below' parts
// put the text across the page and the pictures in a row under it, as large as the page allows. Text that does not fit
// flows onto another page, so nothing is clipped. Pictures are bundled with the app (src/assets/report/, printed as they
// are, with labels over them), diagrams the app draws as vectors (diagrams.ts) or an example job's sheet printed as
// vectors (report/exampleJobs.ts).

import { exampleSheet } from '../exampleJobs.ts'
import { fontBox, measure, wrapText } from '../fonts.ts'
import { imageKey, type ImageRef, type PageItem, type Rect } from '../pageModel.ts'
import type { FixedPagePart, FixedPicture, PictureLabel } from '../templates/types.ts'
import { content, standardPage, type PageBuilder } from './common.ts'
import { DIAGRAM_ASPECT, diagramItems } from './diagrams.ts'
import { sheetItem } from './drawing.ts'
import { COLORS, F, fitBox, lineHeight, text } from './layout.ts'

const SIZE = 9.5
const HEAD = 11
const CAPTION = 8.5
/** Room under a picture for its caption (inches). */
const CAPTION_H = 0.26
/** Width of the picture column of a 'side' part. */
const SIDE_W = 3.4
/** Gap between pictures, and between the text and the pictures. */
const GAP = 0.2
/** A 'below' part's pictures go onto a page of their own when less than this height is left under the text. */
const MIN_BELOW = 2.2

type Shown = FixedPicture

/** The bundled picture of an asset slot (its file under src/assets/report/). */
export const assetRef = (file: string): ImageRef => ({ source: 'asset', file })

/** The pictures of a part that print (an unknown example job is left out). */
export const shownPictures = (part: FixedPagePart): Shown[] =>
  part.pictures.filter((x) => x.kind !== 'example' || exampleSheet(x.job) !== null)

/** Width / height of a picture as it prints. */
function aspectOf(pic: Shown): number {
  if (pic.kind === 'asset') return pic.px.w / pic.px.h
  if (pic.kind === 'drawn') return DIAGRAM_ASPECT[pic.diagram]
  const it = sheetItem(exampleSheet(pic.job)!, { x: 0, y: 0, w: 1, h: 1 })
  return it.region.w / it.region.h
}

/** The picture fitted into `box` (its shape kept, never wider than its maxW), caption under it. */
function pictureItems(pic: Shown, box: Rect): PageItem[] {
  const room = { ...box, w: pic.kind === 'asset' && pic.maxW ? Math.min(box.w, pic.maxW) : box.w, h: box.h - (pic.caption ? CAPTION_H : 0) }
  room.x = box.x + (box.w - room.w) / 2
  const items: PageItem[] = []
  let placed: Rect
  if (pic.kind === 'asset') {
    placed = fitBox(pic.px.w / pic.px.h, room, 'top')
    const ref = assetRef(pic.file)
    items.push({ t: 'image', ref, ...placed, upright: { ...pic.px }, orientation: 1, rotate: 0, crop: null, marks: [], key: imageKey(ref, null) })
    for (const l of pic.labels ?? []) items.push(...labelItems(l, placed))
  } else if (pic.kind === 'drawn') {
    placed = fitBox(DIAGRAM_ASPECT[pic.diagram], room, 'top')
    items.push(...diagramItems(pic.diagram, placed))
  } else {
    const it = sheetItem(exampleSheet(pic.job)!, room)
    it.box = fitBox(it.region.w / it.region.h, room, 'top')
    placed = it.box
    items.push(it, { t: 'rect', ...placed, fill: null, stroke: COLORS.line, width: 0.75, radius: 0 })
  }
  if (pic.caption) items.push(text(placed.x + placed.w / 2, placed.y + placed.h + 0.06 + fontBox(F.label, CAPTION).ascent, pic.caption, F.label, CAPTION, COLORS.muted, 'center'))
  return items
}

const TAB = 9
/** A label over a picture: a thin outline round the part it names and a filled tab with its name. */
function labelItems(l: PictureLabel, pic: Rect): PageItem[] {
  const fx = (f: number) => pic.x + f * pic.w
  const fy = (f: number) => pic.y + f * pic.h
  const pad = 0.05
  const w = measure(l.text, F.title, TAB) + 2 * pad
  const h = fontBox(F.title, TAB).cap + 2 * 0.045
  const x = l.right ? fx(l.at[0]) - w : fx(l.at[0])
  const y = fy(l.at[1])
  return [
    { t: 'rect', x: fx(l.box[0]), y: fy(l.box[1]), w: fx(l.box[2]) - fx(l.box[0]), h: fy(l.box[3]) - fy(l.box[1]), fill: null, stroke: COLORS.orange, width: 1.25, radius: 0.02 },
    { t: 'rect', x, y, w, h, fill: COLORS.orange, stroke: null, width: 0, radius: 0.02 },
    text(x + pad, y + 0.045 + fontBox(F.title, TAB).cap, l.text, F.title, TAB, COLORS.white),
  ]
}

/** The height a column of pictures takes at width `w` (each at most its maxW wide). */
function columnHeight(pics: readonly Shown[], w: number): number {
  return pics.reduce((h, p, i) => h + (i ? GAP : 0) + Math.min(w, p.kind === 'asset' && p.maxW ? p.maxW : w) / aspectOf(p) + (p.caption ? CAPTION_H : 0), 0)
}

export const buildFixedText: PageBuilder = (c, def, title) => {
  const fixed = c.t.fixedPages.find((f) => f.sectionId === def.id)
  if (!fixed) return { pages: [standardPage(c, def, title, title, '', [])], bookmarks: [] }
  const area = content()
  const bottom = area.y + area.h
  const lh = lineHeight(SIZE)
  const body = fontBox(F.body, SIZE)
  const pages: PageItem[][] = []

  for (const part of fixed.parts) {
    const pics = shownPictures(part)
    const side = part.layout === 'side' && pics.length > 0
    const textW = side ? area.w - SIDE_W - 0.3 : area.w
    pages.push([])
    const first = pages.length - 1
    // Paragraph blocks: heading + lines, a heading never split from its first line.
    type Piece = { kind: 'head'; text: string } | { kind: 'line'; text: string } | { kind: 'gap' }
    const pieces: Piece[] = []
    for (const para of part.paragraphs) {
      if (pieces.length) pieces.push({ kind: 'gap' })
      if (para.heading) pieces.push({ kind: 'head', text: para.heading })
      for (const l of wrapText(para.text, F.body, SIZE, textW)) pieces.push({ kind: 'line', text: l })
    }
    const hOf = (p: Piece) => (p.kind === 'head' ? 0.3 : p.kind === 'gap' ? 0.1 : lh)
    let y = area.y
    for (const p of pieces) {
      const need = p.kind === 'head' ? hOf(p) + lh : hOf(p)
      if (y + need > bottom && p.kind !== 'gap') {
        pages.push([])
        y = area.y
      }
      if (p.kind === 'gap') {
        if (y > area.y) y += hOf(p)
        continue
      }
      const items = pages[pages.length - 1]
      if (p.kind === 'head') items.push(text(area.x, y + fontBox(F.title, HEAD).ascent, p.text, F.title, HEAD, COLORS.blue))
      else items.push(text(area.x, y + (lh - body.ascent - body.descent) / 2 + body.ascent, p.text, F.body, SIZE))
      y += hOf(p)
    }
    if (!pics.length) continue

    if (side) {
      // A column on the right of the part's first page, as wide as SIDE_W allows and no taller than the page.
      let w = SIDE_W
      const h = columnHeight(pics, w)
      if (h > area.h) w *= area.h / h
      let py = area.y
      for (const pic of pics) {
        const pw = Math.min(w, pic.kind === 'asset' && pic.maxW ? pic.maxW : w)
        const ph = pw / aspectOf(pic) + (pic.caption ? CAPTION_H : 0)
        pages[first].push(...pictureItems(pic, { x: area.x + area.w - SIDE_W, y: py, w: SIDE_W, h: ph }))
        py += ph + GAP
      }
      continue
    }

    // Below the text: a row across the page, all the same height, as large as the rest of the page allows.
    let top = y > area.y ? y + GAP : area.y
    if (bottom - top < MIN_BELOW) {
      pages.push([])
      top = area.y
    }
    const items = pages[pages.length - 1]
    const capH = pics.some((p) => p.caption) ? CAPTION_H : 0
    const sum = pics.reduce((s, p) => s + aspectOf(p), 0)
    const rowW = area.w - GAP * (pics.length - 1) * 1.5
    const ph = Math.min(bottom - top - capH, rowW / sum)
    let px = area.x + (area.w - (ph * sum + GAP * 1.5 * (pics.length - 1))) / 2
    for (const pic of pics) {
      const pw = ph * aspectOf(pic)
      items.push(...pictureItems(pic, { x: px, y: top, w: pw, h: ph + (pic.caption ? CAPTION_H : 0) }))
      px += pw + GAP * 1.5
    }
  }
  return { pages: pages.map((items, i) => standardPage(c, def, i ? `${title} ${i + 1}` : title, title, '', items)), bookmarks: [] }
}
