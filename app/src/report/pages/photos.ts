// Photos (design 6.5 and "Photos: markup, crop, labels"): photos in list order, each keeping its shape, caption under
// it. Photos per page: 1, 2 (side by side, equal heights, so mixed shapes are never squashed), 4 (2 x 2) or Automatic:
// two photos share a page side by side when both still print at a good size (two portraits always do), else a photo
// gets the page to itself; a lone photo of either shape fills the page. "Own page" (alone) always prints alone.

import { uprightSize, visibleAspect, type PageItem, type Rect } from '../pageModel.ts'
import type { Photo, PhotosPerPage } from '../schema.ts'
import { content, placeImage, standardPage, type BuildContext, type PageBuilder } from './common.ts'
import { COLORS, F, fitBox, textBlock } from './layout.ts'

const GAP = 0.25
const CAPTION = 9
const CAPTION_H = 0.36
/** A pair is used in Automatic when each photo keeps at least this share of the area it would have alone. */
const PAIR_SHARE = 0.35

export interface PhotoSlot {
  index: number
  /** Where the photo (without its caption) goes. */
  box: Rect
}

/** Photo boxes in a row of equal heights across the area (captions under them). */
export function rowLayout(aspects: readonly number[], area: Rect, captions: boolean): Rect[] {
  const capH = captions ? CAPTION_H : 0
  const n = aspects.length
  const sum = aspects.reduce((a, b) => a + b, 0)
  const h = Math.min(area.h - capH, (area.w - GAP * (n - 1)) / sum)
  const total = sum * h + GAP * (n - 1)
  let x = area.x + (area.w - total) / 2
  const y = area.y + (area.h - capH - h) / 2
  return aspects.map((a) => {
    const r = { x, y, w: a * h, h }
    x += a * h + GAP
    return r
  })
}

/** Photo boxes in a 2 x 2 grid, each fitted to its cell. */
export function gridLayout(aspects: readonly number[], area: Rect, captions: boolean): Rect[] {
  const capH = captions ? CAPTION_H : 0
  const cw = (area.w - GAP) / 2
  const ch = (area.h - GAP) / 2
  return aspects.map((a, i) => fitBox(a, { x: area.x + (i % 2) * (cw + GAP), y: area.y + Math.floor(i / 2) * (ch + GAP), w: cw, h: ch - capH }))
}

const areaOf = (r: Rect) => r.w * r.h

/** Pages of photo indexes for the chosen Photos per page. */
export function photoPages(photos: readonly { aspect: number; alone: boolean }[], perPage: PhotosPerPage, area: Rect): number[][] {
  const pages: number[][] = []
  let i = 0
  const n = perPage === 'auto' ? 2 : perPage
  while (i < photos.length) {
    if (photos[i].alone || n === 1) {
      pages.push([i++])
      continue
    }
    const group = [i]
    let j = i + 1
    while (group.length < n && j < photos.length && !photos[j].alone) group.push(j++)
    if (perPage === 'auto' && group.length === 2) {
      const pair = rowLayout(group.map((k) => photos[k].aspect), area, true)
      const ok = group.every((k, m) => areaOf(pair[m]) >= PAIR_SHARE * areaOf(rowLayout([photos[k].aspect], area, true)[0]))
      if (!ok) group.pop()
    }
    pages.push(group)
    i += group.length
  }
  return pages
}

export function perPageOf(c: BuildContext, sectionId: string, templateDefault: unknown): PhotosPerPage {
  const own = c.r.options.photosPerPage[sectionId]
  if (own !== undefined) return own
  return templateDefault === 1 || templateDefault === 2 || templateDefault === 4 ? templateDefault : 'auto'
}

export const buildPhotos: PageBuilder = (c, def, title) => {
  const area = content()
  const perPage = perPageOf(c, def.id, def.options?.perPage)
  const photos: (Photo & { aspect: number })[] = c.r.photos.map((ph) => {
    const info = c.image({ source: 'photos', file: ph.file })
    return { ...ph, aspect: info ? visibleAspect(uprightSize(info), ph.crop, ph.rotate) : 4 / 3 }
  })
  const pages = photoPages(photos, perPage, area).map((group, n) => {
    const captions = group.some((k) => photos[k].caption.trim() !== '')
    const boxes = group.length === 4 || (perPage === 4 && group.length > 2) ? gridLayout(group.map((k) => photos[k].aspect), area, captions) : rowLayout(group.map((k) => photos[k].aspect), area, captions)
    const items: PageItem[] = []
    group.forEach((k, m) => {
      const ph = photos[k]
      const placed = placeImage(c, { source: 'photos', file: ph.file }, ph, boxes[m], 'Photo not found')
      items.push(...placed.items)
      if (ph.caption.trim()) {
        const w = Math.max(boxes[m].w, 2)
        items.push(...textBlock(ph.caption.trim(), boxes[m].x + boxes[m].w / 2 - w / 2, boxes[m].y + boxes[m].h + 0.05, w, F.body, CAPTION, COLORS.text, { align: 'center', maxLines: 2, k: 1.3 }).items)
      }
    })
    return standardPage(c, def, `${title} ${n + 1}`, title, '', items)
  })
  return { pages, bookmarks: [] }
}
