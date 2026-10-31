// Pixel edits on report pictures (design 14, R5): auto brightness / contrast and redaction. Pure functions on RGBA pixel
// data, so the browser (canvas, report/pdf embed and the Pages view's thumbnails) and Node (tests, npm run report:pdf)
// run exactly the same code.
//
// - Auto levels: each colour channel stretched from its 0.5th to its 99.5th percentile (a small clip, so a few specks of
//   glare or shadow don't decide it), measured over the part of the picture that prints.
// - Redaction: the pixels themselves are replaced, never covered: black boxes are set to black; blurred boxes become a
//   coarse mosaic (at least 4 blocks across the short side, so lettering can't be read back) that is then smoothed.
//   The PDF embeds the changed pixels only, so the original area is not in the file to be lifted out.

import type { Redaction } from './pageModel.ts'
import type { FracBox } from './schema.ts'

const FULL: FracBox = { x0: 0, y0: 0, x1: 1, y1: 1 }

export interface Pixels {
  data: Uint8ClampedArray | Uint8Array
  width: number
  height: number
}

/** Clip of the levels stretch: this share of the pixels at each end is let go. */
export const LEVELS_CLIP = 0.005

/** Per channel [low, high] of the pixels inside `region` (fractions of the data), with the small clip. */
export function levelsOf(px: Pixels, region: FracBox = FULL): [number, number][] {
  const { data, width, height } = px
  const x0 = Math.max(0, Math.floor(region.x0 * width))
  const x1 = Math.min(width, Math.ceil(region.x1 * width))
  const y0 = Math.max(0, Math.floor(region.y0 * height))
  const y1 = Math.min(height, Math.ceil(region.y1 * height))
  const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)]
  // Every pixel of a small picture; a sample of a big one (a stretch needs no more).
  const step = Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / 400000)))
  let n = 0
  for (let y = y0; y < y1; y += step) {
    for (let x = x0; x < x1; x += step) {
      const i = (y * width + x) * 4
      hist[0][data[i]]++
      hist[1][data[i + 1]]++
      hist[2][data[i + 2]]++
      n++
    }
  }
  const cut = Math.floor(n * LEVELS_CLIP)
  return hist.map((h): [number, number] => {
    let lo = 0
    let acc = 0
    while (lo < 255 && acc + h[lo] <= cut) acc += h[lo++]
    let hi = 255
    acc = 0
    while (hi > 0 && acc + h[hi] <= cut) acc += h[hi--]
    return [lo, Math.max(hi, lo)]
  })
}

/** The levels stretch applied in place (a channel with almost no range is left alone). */
export function applyLevels(px: Pixels, levels: readonly [number, number][]): void {
  const maps = levels.map(([lo, hi]) => {
    const m = new Uint8Array(256)
    const range = hi - lo
    for (let v = 0; v < 256; v++) m[v] = range < 8 ? v : Math.max(0, Math.min(255, Math.round(((v - lo) * 255) / range)))
    return m
  })
  const d = px.data
  for (let i = 0; i < d.length; i += 4) {
    d[i] = maps[0][d[i]]
    d[i + 1] = maps[1][d[i + 1]]
    d[i + 2] = maps[2][d[i + 2]]
  }
}

/** A redaction box in pixels of data that shows `covers` of the upright picture (clipped to the data). */
export function redactionRect(r: Redaction, covers: FracBox, width: number, height: number): { x0: number; y0: number; x1: number; y1: number } | null {
  const sx = (u: number) => ((u - covers.x0) / (covers.x1 - covers.x0)) * width
  const sy = (v: number) => ((v - covers.y0) / (covers.y1 - covers.y0)) * height
  const x0 = Math.max(0, Math.floor(sx(r.box.x0)))
  const x1 = Math.min(width, Math.ceil(sx(r.box.x1)))
  const y0 = Math.max(0, Math.floor(sy(r.box.y0)))
  const y1 = Math.min(height, Math.ceil(sy(r.box.y1)))
  return x1 > x0 && y1 > y0 ? { x0, y0, x1, y1 } : null
}

/** Mosaic block of a blurred box, pixels: at least 4 blocks across the short side, at most 24 along the long one. */
export function blurBlock(w: number, h: number): number {
  return Math.max(2, Math.ceil(Math.max(Math.min(w, h) / 4, Math.max(w, h) / 24)))
}

/** Replaces the pixels of one box: black, or a coarse mosaic smoothed into a blur. */
export function redactRect(px: Pixels, rc: { x0: number; y0: number; x1: number; y1: number }, mode: 'black' | 'blur'): void {
  const { data, width } = px
  if (mode === 'black') {
    for (let y = rc.y0; y < rc.y1; y++) for (let x = rc.x0; x < rc.x1; x++) {
      const i = (y * width + x) * 4
      data[i] = 0
      data[i + 1] = 0
      data[i + 2] = 0
      data[i + 3] = 255
    }
    return
  }
  const w = rc.x1 - rc.x0
  const h = rc.y1 - rc.y0
  const b = blurBlock(w, h)
  const bw = Math.ceil(w / b)
  const bh = Math.ceil(h / b)
  // 1. Mosaic: the average colour of each block.
  const avg = new Float32Array(bw * bh * 3)
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    let r = 0
    let g = 0
    let bl = 0
    let n = 0
    for (let y = rc.y0 + by * b; y < Math.min(rc.y1, rc.y0 + (by + 1) * b); y++) for (let x = rc.x0 + bx * b; x < Math.min(rc.x1, rc.x0 + (bx + 1) * b); x++) {
      const i = (y * width + x) * 4
      r += data[i]
      g += data[i + 1]
      bl += data[i + 2]
      n++
    }
    const k = (by * bw + bx) * 3
    avg[k] = r / n
    avg[k + 1] = g / n
    avg[k + 2] = bl / n
  }
  // 2. Smooth: each pixel blends the block colours around it (bilinear between block centres), so it reads as a blur.
  const at = (bx: number, by: number, c: number) => avg[(Math.min(bh - 1, Math.max(0, by)) * bw + Math.min(bw - 1, Math.max(0, bx))) * 3 + c]
  for (let y = rc.y0; y < rc.y1; y++) {
    const fy = (y - rc.y0 + 0.5) / b - 0.5
    const y0 = Math.floor(fy)
    const ty = fy - y0
    for (let x = rc.x0; x < rc.x1; x++) {
      const fx = (x - rc.x0 + 0.5) / b - 0.5
      const x0 = Math.floor(fx)
      const tx = fx - x0
      const i = (y * width + x) * 4
      for (let c = 0; c < 3; c++) {
        const top = at(x0, y0, c) * (1 - tx) + at(x0 + 1, y0, c) * tx
        const bottom = at(x0, y0 + 1, c) * (1 - tx) + at(x0 + 1, y0 + 1, c) * tx
        data[i + c] = Math.round(top * (1 - ty) + bottom * ty)
      }
      data[i + 3] = 255
    }
  }
}

export interface PixelEdits {
  autoLevels: boolean
  redactions: readonly Redaction[]
}

/** Whether a picture's pixels must be changed before it is shown or embedded. */
export const hasPixelEdits = (e: { autoLevels?: boolean; redactions?: readonly Redaction[] }) => !!e.autoLevels || (e.redactions?.length ?? 0) > 0

/**
 * A picture's pixel edits applied in place. `covers` = the part of the upright picture the data shows (the crop for a
 * picture already cut to it, all of it for a thumbnail); `measure` = the part the levels are measured on (the crop: what
 * prints), in the upright picture's fractions.
 */
export function applyPixelEdits(px: Pixels, edits: PixelEdits, covers: FracBox = FULL, measure: FracBox | null = null): void {
  if (edits.autoLevels) {
    const m = measure ?? covers
    const local: FracBox = {
      x0: Math.max(0, (m.x0 - covers.x0) / (covers.x1 - covers.x0)), y0: Math.max(0, (m.y0 - covers.y0) / (covers.y1 - covers.y0)),
      x1: Math.min(1, (m.x1 - covers.x0) / (covers.x1 - covers.x0)), y1: Math.min(1, (m.y1 - covers.y0) / (covers.y1 - covers.y0)),
    }
    applyLevels(px, levelsOf(px, local))
  }
  for (const r of edits.redactions) {
    const rc = redactionRect(r, covers, px.width, px.height)
    if (rc) redactRect(px, rc, r.mode)
  }
}

/** Pixels turned upright for an EXIF orientation (1-8), as the browser's imageOrientation 'from-image' does. */
export function uprightPixels(px: Pixels, orientation: number): Pixels {
  if (orientation <= 1 || orientation > 8) return px
  const { data, width: W, height: H } = px
  const swap = orientation >= 5
  const w = swap ? H : W
  const h = swap ? W : H
  const out = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // Upright (x, y) -> stored (sx, sy), the inverse of pageModel's orientPoint.
    let sx: number
    let sy: number
    switch (orientation) {
      case 2: sx = W - 1 - x; sy = y; break
      case 3: sx = W - 1 - x; sy = H - 1 - y; break
      case 4: sx = x; sy = H - 1 - y; break
      case 5: sx = y; sy = x; break
      case 6: sx = y; sy = H - 1 - x; break
      case 7: sx = W - 1 - y; sy = H - 1 - x; break
      default: sx = W - 1 - y; sy = x; break
    }
    const i = (sy * W + sx) * 4
    const o = (y * w + x) * 4
    out[o] = data[i]
    out[o + 1] = data[i + 1]
    out[o + 2] = data[i + 2]
    out[o + 3] = data[i + 3]
  }
  return { data: out, width: w, height: h }
}

/** The part `box` (upright fractions) of upright pixels, as new pixels. */
export function cropPixels(px: Pixels, box: FracBox | null): Pixels {
  if (!box) return px
  const x0 = Math.max(0, Math.round(box.x0 * px.width))
  const y0 = Math.max(0, Math.round(box.y0 * px.height))
  const w = Math.max(1, Math.min(px.width, Math.round(box.x1 * px.width)) - x0)
  const h = Math.max(1, Math.min(px.height, Math.round(box.y1 * px.height)) - y0)
  const out = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) out.set(px.data.subarray(((y0 + y) * px.width + x0) * 4, ((y0 + y) * px.width + x0 + w) * 4), y * w * 4)
  return { data: out, width: w, height: h }
}
