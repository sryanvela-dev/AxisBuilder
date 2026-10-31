// The crop tool's geometry (design 14, R4): pure functions, unit-tested. The tool shows a picture upright (its phone /
// EXIF orientation applied) and turned by its quarter turns; the user drags a box on what they see. The stored crop is
// in the upright picture before the turn (format 8), so a later turn turns the crop with the picture. Boxes here are
// fractions 0-1 of the picture as shown ("turned") or as stored ("upright"), x to the right, y down.

import type { FracBox, Rotation } from './schema.ts'

export type Point = readonly [number, number]
export const FULL_BOX: FracBox = { x0: 0, y0: 0, x1: 1, y1: 1 }
/** The smallest crop, as a fraction of the shown picture's side. */
export const MIN_SIDE = 0.03

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

/** Upright point -> the same point on the turned picture (as pageModel imagePoint turns it). */
export function turnPoint(rotate: Rotation, [u, v]: Point): [number, number] {
  return rotate === 90 ? [1 - v, u] : rotate === 180 ? [1 - u, 1 - v] : rotate === 270 ? [v, 1 - u] : [u, v]
}

/** Turned point -> upright point (the inverse of turnPoint). */
export function unturnPoint(rotate: Rotation, [x, y]: Point): [number, number] {
  return rotate === 90 ? [y, 1 - x] : rotate === 180 ? [1 - x, 1 - y] : rotate === 270 ? [1 - y, x] : [x, y]
}

function boxThrough(a: Point, b: Point): FracBox {
  return { x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]) }
}

/** A stored (upright) crop as the box the user sees on the turned picture. */
export function turnBox(rotate: Rotation, b: FracBox): FracBox {
  return boxThrough(turnPoint(rotate, [b.x0, b.y0]), turnPoint(rotate, [b.x1, b.y1]))
}

/** A box drawn on the turned picture as the crop to store. */
export function unturnBox(rotate: Rotation, b: FracBox): FracBox {
  return boxThrough(unturnPoint(rotate, [b.x0, b.y0]), unturnPoint(rotate, [b.x1, b.y1]))
}

/** Pixel size of the picture as shown (upright, then turned). */
export function turnedSize(upright: { w: number; h: number }, rotate: Rotation): { w: number; h: number } {
  return rotate === 90 || rotate === 270 ? { w: upright.h, h: upright.w } : upright
}

/** Width over height, in pixels, of a box on a picture of `size`. */
export function boxAspect(b: FracBox, size: { w: number; h: number }): number {
  return ((b.x1 - b.x0) * size.w) / ((b.y1 - b.y0) * size.h)
}

/** The largest box with this pixel aspect (width / height) centred on the picture. */
export function presetBox(aspect: number, size: { w: number; h: number }): FracBox {
  const own = size.w / size.h
  if (aspect >= own) {
    const h = own / aspect
    return { x0: 0, y0: (1 - h) / 2, x1: 1, y1: (1 + h) / 2 }
  }
  const w = aspect / own
  return { x0: (1 - w) / 2, y0: 0, x1: (1 + w) / 2, y1: 1 }
}

/**
 * A preset shape for this picture: 4:3 and 3:2 lie the way the picture lies (a portrait picture gets 3:4), "original"
 * is the picture's own shape, "square" 1:1.
 */
export function presetAspect(preset: 'original' | '4:3' | '3:2' | 'square', size: { w: number; h: number }): number {
  const portrait = size.h > size.w
  const r = preset === 'original' ? size.w / size.h : preset === 'square' ? 1 : preset === '4:3' ? 4 / 3 : 3 / 2
  return preset === 'original' || preset === 'square' || !portrait ? r : 1 / r
}

/** The box with this pixel aspect, as large as fits inside `b` and the picture, about the same centre. */
export function fitAspect(b: FracBox, aspect: number, size: { w: number; h: number }): FracBox {
  const cx = (b.x0 + b.x1) / 2
  const cy = (b.y0 + b.y1) / 2
  // Work in pixels: shrink the long side of the box to the aspect.
  let w = (b.x1 - b.x0) * size.w
  let h = (b.y1 - b.y0) * size.h
  if (w / h > aspect) w = h * aspect
  else h = w / aspect
  const fw = w / size.w
  const fh = h / size.h
  const x0 = Math.min(Math.max(cx - fw / 2, 0), 1 - fw)
  const y0 = Math.min(Math.max(cy - fh / 2, 0), 1 - fh)
  return { x0, y0, x1: x0 + fw, y1: y0 + fh }
}

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move'

/**
 * The box after dragging a handle by (dx, dy) (fractions of the shown picture) from where the drag started. `aspect`
 * (pixels, width / height) keeps the shape; null = free. The opposite corner or side stays put; the box stays on the
 * picture and never gets smaller than MIN_SIDE.
 */
export function dragBox(start: FracBox, handle: Handle, dx: number, dy: number, aspect: number | null, size: { w: number; h: number }): FracBox {
  if (handle === 'move') {
    const w = start.x1 - start.x0
    const h = start.y1 - start.y0
    const x0 = Math.min(Math.max(start.x0 + dx, 0), 1 - w)
    const y0 = Math.min(Math.max(start.y0 + dy, 0), 1 - h)
    return { x0, y0, x1: x0 + w, y1: y0 + h }
  }
  const left = handle.includes('w')
  const right = handle.includes('e')
  const top = handle.includes('n')
  const bottom = handle.includes('s')
  let { x0, y0, x1, y1 } = start
  if (left) x0 = Math.min(clamp01(start.x0 + dx), start.x1 - MIN_SIDE)
  if (right) x1 = Math.max(clamp01(start.x1 + dx), start.x0 + MIN_SIDE)
  if (top) y0 = Math.min(clamp01(start.y0 + dy), start.y1 - MIN_SIDE)
  if (bottom) y1 = Math.max(clamp01(start.y1 + dy), start.y0 + MIN_SIDE)
  if (aspect === null) return { x0, y0, x1, y1 }

  // Keep the shape: the dragged size decides, the other side follows from the fixed corner (or about the centre for a
  // side handle), then the whole box shrinks if it would leave the picture.
  const k = size.w / size.h
  const corner = (left || right) && (top || bottom)
  let fw = x1 - x0
  let fh = y1 - y0
  if (corner) {
    // The larger relative change wins.
    if (fw / (start.x1 - start.x0) >= fh / (start.y1 - start.y0)) fh = (fw * k) / aspect
    else fw = (fh * aspect) / k
  } else if (left || right) fh = (fw * k) / aspect
  else fw = (fh * aspect) / k
  // Room on the picture from the fixed side(s).
  const ax = left ? start.x1 : right ? start.x0 : (start.x0 + start.x1) / 2
  const ay = top ? start.y1 : bottom ? start.y0 : (start.y0 + start.y1) / 2
  const roomW = left ? ax : right ? 1 - ax : 2 * Math.min(ax, 1 - ax)
  const roomH = top ? ay : bottom ? 1 - ay : 2 * Math.min(ay, 1 - ay)
  const s = Math.min(1, roomW / fw, roomH / fh)
  fw *= s
  fh *= s
  x0 = left ? ax - fw : right ? ax : ax - fw / 2
  y0 = top ? ay - fh : bottom ? ay : ay - fh / 2
  return { x0, y0, x1: x0 + fw, y1: y0 + fh }
}

/** A crop that keeps (almost) the whole picture is stored as no crop. */
export function storedCrop(b: FracBox): FracBox | null {
  const e = 0.001
  return b.x0 <= e && b.y0 <= e && b.x1 >= 1 - e && b.y1 >= 1 - e ? null : { x0: clamp01(b.x0), y0: clamp01(b.y0), x1: clamp01(b.x1), y1: clamp01(b.y1) }
}

/** A quarter turn on top of the current one: right = clockwise. */
export function turned(rotate: Rotation, dir: 'left' | 'right'): Rotation {
  return ((rotate + (dir === 'right' ? 90 : 270)) % 360) as Rotation
}

// --- "A part of the main drawing" on a custom sheet (user, 2026-10-31: the picker works like the crop tool) ----------
// The part is stored in paper inches of the main sheet, y up (schema `view.crop`); the picker edits it as a box of
// fractions of the sheet, y down, with the crop tool's own dragBox / fitAspect / presetBox (size = the paper in inches).

export type PaperBox = { x0: number; y0: number; x1: number; y1: number }

/** The stored part (paper inches, y up) -> fractions of the sheet, y down. */
export function paperToFrac(b: PaperBox, paper: { w: number; h: number }): FracBox {
  const x0 = Math.min(b.x0, b.x1)
  const x1 = Math.max(b.x0, b.x1)
  const top = Math.max(b.y0, b.y1)
  const bottom = Math.min(b.y0, b.y1)
  return { x0: clamp01(x0 / paper.w), y0: clamp01((paper.h - top) / paper.h), x1: clamp01(x1 / paper.w), y1: clamp01((paper.h - bottom) / paper.h) }
}

/** Fractions of the sheet, y down -> the stored part (paper inches, y up). */
export function fracToPaper(f: FracBox, paper: { w: number; h: number }): PaperBox {
  return { x0: f.x0 * paper.w, x1: f.x1 * paper.w, y0: (1 - f.y1) * paper.h, y1: (1 - f.y0) * paper.h }
}

/** The picker's starting box: the stored part, or the largest box of the slot's shape (whole sheet when free). */
export function startViewBox(current: PaperBox | null, paper: { w: number; h: number }, slotAspect: number | null): FracBox {
  if (current) return paperToFrac(current, paper)
  return slotAspect === null ? FULL_BOX : presetBox(slotAspect, paper)
}
