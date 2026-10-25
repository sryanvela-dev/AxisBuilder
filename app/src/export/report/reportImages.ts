// Report images (Phase 4b, replaces the TightPDF tool): one JPEG per sheet, drawn from the same sheet model as
// the PDF and the Sheets view, cropped to the extents of everything printed (or the drawing only), worked out
// from the model rather than from the pixels. TightPDF's defaults: 300 DPI, quality 95, no chroma
// subsampling (4:4:4), 8 px of white padding, the DPI written into the JPEG.

import jpeg from 'jpeg-js'
import { printRgb } from '../../engine/aci.ts'
import { drawSteps, isPanelPrim, textGeometry, type Box, type DrawStep, type ImagePrim, type SheetModel } from '../../engine/sheetModel.ts'

export type ReportCrop = 'Everything printed' | 'Drawing only'

export interface ReportFrame {
  /** Paper inches of the image's left and top edges (the padding is outside these). */
  left: number
  top: number
  dpi: number
  pad: number
  /** Pixels. */
  width: number
  height: number
}

/** The image's size and place: the extents at dpi, rounded up to whole pixels, plus the padding on each side. */
export function reportFrame(m: SheetModel, crop: ReportCrop, dpi: number, pad: number): ReportFrame {
  const b: Box = crop === 'Drawing only' ? m.extents.drawingOnly : m.extents.all
  return {
    left: b[0], top: b[3], dpi, pad,
    width: Math.max(1, Math.ceil((b[2] - b[0]) * dpi - 1e-6)) + 2 * pad,
    height: Math.max(1, Math.ceil((b[3] - b[1]) * dpi - 1e-6)) + 2 * pad,
  }
}

/** The parts of CanvasRenderingContext2D the report images use (a canvas in the browser, a recorder in tests). */
export interface Ctx2D {
  save(): void
  restore(): void
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void
  beginPath(): void
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  bezierCurveTo(a: number, b: number, c: number, d: number, e: number, f: number): void
  closePath(): void
  rect(x: number, y: number, w: number, h: number): void
  clip(): void
  stroke(): void
  fillRect(x: number, y: number, w: number, h: number): void
  fillText(text: string, x: number, y: number): void
  drawImage(image: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void
  lineWidth: number
  lineCap: CanvasLineCap
  lineJoin: CanvasLineJoin
  strokeStyle: string | CanvasGradient | CanvasPattern
  fillStyle: string | CanvasGradient | CanvasPattern
  globalAlpha: number
  font: string
  textBaseline: CanvasTextBaseline
  textAlign: CanvasTextAlign
}

export interface ReportPhoto {
  image: CanvasImageSource
  width: number
  height: number
}

export const REPORT_FONT = 'AxisBuilder Arimo'

/**
 * Draws one sheet into ctx (frame.width x frame.height px): white background, the drawing (clipped to the
 * section viewport), then the sheet's own lines and text. "Drawing only" leaves out the title, legend and
 * head views. photos: scanId -> the original photo (the part for a seam piece is cut out here).
 */
export function drawReportSheet(ctx: Ctx2D, m: SheetModel, frame: ReportFrame, crop: ReportCrop, photos: ReadonlyMap<string, ReportPhoto>) {
  const k = frame.dpi
  const keep = crop === 'Drawing only' ? (s: DrawStep) => !isPanelPrim(s.kind === 'path' ? s : s.prim) : () => true
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, frame.width, frame.height)
  // Paper inches (y up) -> pixels (y down).
  ctx.setTransform(k, 0, 0, -k, frame.pad - frame.left * k, frame.pad + frame.top * k)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.save()
  if (m.clip) {
    ctx.beginPath()
    ctx.rect(m.clip.x, m.clip.y, m.clip.w, m.clip.h)
    ctx.clip()
  }
  for (const s of drawSteps(m.drawing)) if (keep(s)) step(ctx, s, photos, m.soft, 1 / k)
  ctx.restore()
  for (const s of drawSteps(m.sheet)) if (keep(s)) step(ctx, s, photos, m.soft, 1 / k)
}

const css = (n: number, soft: boolean) => {
  const [r, g, b] = printRgb(n, soft)
  return `rgb(${r}, ${g}, ${b})`
}

/** minW: one pixel, the thinnest line drawn (a hairline at a low DPI would fade out). */
function step(ctx: Ctx2D, s: DrawStep, photos: ReadonlyMap<string, ReportPhoto>, soft: boolean, minW: number) {
  if (s.kind === 'path') {
    ctx.globalAlpha = s.style.opacity
    ctx.strokeStyle = css(s.style.color, soft)
    ctx.lineWidth = Math.max(s.style.weight, minW)
    ctx.beginPath()
    for (const o of s.ops) {
      if (o[0] === 'M') ctx.moveTo(o[1], o[2])
      else if (o[0] === 'L') ctx.lineTo(o[1], o[2])
      else if (o[0] === 'C') ctx.bezierCurveTo(o[1], o[2], o[3], o[4], o[5], o[6])
      else ctx.closePath()
    }
    ctx.stroke()
    ctx.globalAlpha = 1
    return
  }
  if (s.kind === 'text') {
    const p = s.prim
    const g = textGeometry(p)
    const rad = (p.rot * Math.PI) / 180
    ctx.save()
    // Text is drawn y down: flip back about its baseline start, turned with the text.
    ctx.transform(Math.cos(rad), Math.sin(rad), Math.sin(rad), -Math.cos(rad), g.start[0], g.start[1])
    ctx.fillStyle = css(p.style.color, soft)
    // Canvas font sizes are CSS pixels; 1 unit here = 1 inch, so the size is set in a scaled-up unit.
    ctx.transform(1 / 100, 0, 0, 1 / 100, 0, 0)
    ctx.font = `${g.size * 100}px '${REPORT_FONT}'`
    ctx.fillText(p.text, 0, 0)
    ctx.restore()
    return
  }
  image(ctx, s.prim, photos.get(s.prim.scanId))
}

function image(ctx: Ctx2D, p: ImagePrim, ph: ReportPhoto | undefined) {
  if (!ph) return
  const x0 = p.crop ? Math.round(ph.width * p.crop[0]) : 0
  const x1 = p.crop ? Math.max(x0 + 1, Math.round(ph.width * p.crop[1])) : ph.width
  const rad = (p.rot * Math.PI) / 180
  ctx.save()
  // The photo's top-left at the image's top-left corner, turned with the drawing, y down inside the photo.
  ctx.transform(Math.cos(rad), Math.sin(rad), Math.sin(rad), -Math.cos(rad), p.x - p.h * Math.sin(rad), p.y + p.h * Math.cos(rad))
  ctx.drawImage(ph.image, x0, 0, x1 - x0, ph.height, 0, 0, p.w, p.h)
  ctx.restore()
}


// --- JPEG --------------------------------------------------------------------------------------------

/** JPEG of RGBA pixels: 4:4:4 (jpeg-js never subsamples), quality 1-100, the DPI written into the JFIF header. */
export function encodeReportJpeg(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number, quality: number, dpi: number): Uint8Array {
  const out = new Uint8Array(withBuffer(() => jpeg.encode({ data: rgba, width, height }, quality).data))
  return setJpegDpi(out, dpi)
}

/**
 * jpeg-js returns its bytes with Node's Buffer.from when it runs as a CommonJS module, which it does once Vite
 * bundles it; in the browser there is no Buffer, so a stand-in is lent for the call.
 */
function withBuffer<T>(f: () => T): T {
  const g = globalThis as { Buffer?: unknown }
  if (g.Buffer !== undefined) return f()
  g.Buffer = { from: (a: ArrayLike<number>) => Uint8Array.from(a) }
  try {
    return f()
  } finally {
    delete g.Buffer
  }
}

/** Writes the resolution into the JFIF APP0 header (units = dots per inch). */
export function setJpegDpi(bytes: Uint8Array, dpi: number): Uint8Array {
  const jfif = bytes[2] === 0xff && bytes[3] === 0xe0 && String.fromCharCode(...bytes.subarray(6, 11)) === 'JFIF\0'
  if (!jfif) throw new Error('The JPEG has no JFIF header.')
  const d = Math.max(1, Math.min(65535, Math.round(dpi)))
  bytes[13] = 1
  bytes[14] = d >> 8
  bytes[15] = d & 0xff
  bytes[16] = d >> 8
  bytes[17] = d & 0xff
  return bytes
}

/** What a JPEG says about itself (for the tests): size, DPI and each component's sampling (0x11 = none). */
export function jpegInfo(bytes: Uint8Array): { width: number; height: number; units: number; xDpi: number; yDpi: number; sampling: number[] } {
  const units = bytes[13]
  const xDpi = (bytes[14] << 8) | bytes[15]
  const yDpi = (bytes[16] << 8) | bytes[17]
  let i = 2
  while (i < bytes.length) {
    if (bytes[i] !== 0xff) throw new Error('Not a JPEG.')
    const marker = bytes[i + 1]
    const len = (bytes[i + 2] << 8) | bytes[i + 3]
    if (marker === 0xc0 || marker === 0xc2) {
      const height = (bytes[i + 5] << 8) | bytes[i + 6]
      const width = (bytes[i + 7] << 8) | bytes[i + 8]
      const n = bytes[i + 9]
      const sampling = Array.from({ length: n }, (_, c) => bytes[i + 11 + c * 3])
      return { width, height, units, xDpi, yDpi, sampling }
    }
    i += 2 + len
  }
  throw new Error('No frame header in the JPEG.')
}
