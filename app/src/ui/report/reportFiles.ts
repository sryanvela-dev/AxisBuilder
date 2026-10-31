// The report's pictures in the browser: where each is read from (the report photo folder or a photo picked as a file,
// the screenshots folder, the remembered cover, calibration and uploaded files, the app's logo), their size and phone (EXIF)
// orientation for the page builders, upright thumbnails for the Pages view, and the pictures made ready for the PDF
// (turned upright, cut to their crop, at about 300 dpi of their printed size; never more than the file has).

import logoUrl from '../../assets/brand/integrity-epc-logo.png?url'
import { readImageInfo } from '../../report/imageInfo.ts'
import type { ImageInfo, ImageRef, ReportDocument } from '../../report/pageModel.ts'
import { imageNeeds } from '../../report/pageModel.ts'
import { applyPixelEdits, hasPixelEdits } from '../../report/imageProcess.ts'
import type { PreparedImage } from '../../report/pdf/writeReportPdf.ts'
import type { Report } from '../../report/schema.ts'
import { recallFile, type FileSlot } from '../../state/files.ts'
import type { KeyValueStore } from '../../state/storage.ts'
import type { PhotoFolder } from '../photoFolder.ts'

export interface ReportFileSources {
  /** The report photo folder (photos, custom-sheet pictures). */
  photos: PhotoFolder | null
  /** The data-page screenshots folder. */
  screenshots: PhotoFolder | null
  store: KeyValueStore
  jobId: string
}

/** Every picture the report shows, once each. */
export function reportImageRefs(r: Report): ImageRef[] {
  const out: ImageRef[] = [{ source: 'brand', file: 'integrity-epc-logo.png' }]
  if (r.coverPhoto) out.push({ source: 'cover', file: r.coverPhoto })
  if (r.calibration.dynamicImage) out.push({ source: 'calibration', file: r.calibration.dynamicImage })
  for (const p of r.photos) out.push({ source: 'photos', file: p.file })
  for (const s of r.scanResults) if (s.dataImage) out.push({ source: 'screenshots', file: s.dataImage })
  for (const sh of r.customSheets) for (const b of sh.blocks) if (b.kind === 'image') out.push({ source: 'photos', file: b.file })
  for (const u of r.uploads) if (!/\.pdf$/i.test(u.file) && u.page === null) out.push({ source: 'uploads', file: u.file })
  const seen = new Set<string>()
  return out.filter((x) => (seen.has(refKey(x)) ? false : (seen.add(refKey(x)), true)))
}

export const refKey = (r: ImageRef) => `${r.source}|${r.file}`

/** A photo picked as a file (not from the folder) is remembered per job under this slot. */
export const photoSlot = (name: string): FileSlot => `photo:${name}`
/** An uploaded reference page (picture or PDF) is remembered per job under this slot. */
export const uploadSlot = (name: string): FileSlot => `upload:${name}`

async function remembered(src: ReportFileSources, slot: FileSlot, name: string): Promise<File | null> {
  const h = await recallFile(src.store, src.jobId, slot).catch(() => null)
  if (!h || h.name.toLowerCase() !== name.toLowerCase()) return null
  try {
    const perm = (await h.queryPermission?.({ mode: 'read' })) ?? 'granted'
    return perm === 'granted' ? await h.getFile() : null
  } catch {
    return null
  }
}

/** Reads one picture file; null when it can't be found or opened (yet: a remembered file may need an "Allow" click). */
export async function readReportFile(src: ReportFileSources, ref: ImageRef): Promise<File | null> {
  try {
    switch (ref.source) {
      case 'brand': {
        const res = await fetch(logoUrl)
        return res.ok ? new File([await res.blob()], ref.file, { type: 'image/png' }) : null
      }
      case 'photos':
        return (src.photos?.names.includes(ref.file) ? await src.photos.getFile(ref.file) : null) ?? (await remembered(src, photoSlot(ref.file), ref.file))
      case 'screenshots':
        return src.screenshots?.names.includes(ref.file) ? await src.screenshots.getFile(ref.file) : null
      case 'cover':
        return await remembered(src, 'coverPhoto', ref.file)
      case 'calibration':
        return await remembered(src, 'dynamicImage', ref.file)
      case 'uploads':
        return await readUploadFile(src, ref.file)
      default:
        return null
    }
  } catch {
    return null
  }
}

/** An uploaded file (picture or PDF): picked as a file and remembered, else from the report photo folder. */
export async function readUploadFile(src: ReportFileSources, name: string): Promise<File | null> {
  try {
    return (await remembered(src, uploadSlot(name), name)) ?? (src.photos?.names.includes(name) ? await src.photos.getFile(name) : null)
  } catch {
    return null
  }
}

export interface ReadPicture {
  info: ImageInfo
  /** Upright thumbnail (phone orientation applied) for the Pages view and the photo list. */
  thumb: string
}

const THUMB_SIDE = 1400

/** Size, orientation and an upright thumbnail of a picture file; null when it isn't a JPEG or PNG it can read. */
export async function readPicture(file: File): Promise<ReadPicture | null> {
  const info = readImageInfo(new Uint8Array(await file.arrayBuffer()))
  if (!info) return null
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const k = Math.min(1, THUMB_SIDE / Math.max(bmp.width, bmp.height))
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(bmp.width * k)), Math.max(1, Math.round(bmp.height * k)))
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const blob = await canvas.convertToBlob({ type: info.format === 'png' ? 'image/png' : 'image/jpeg', quality: 0.85 })
    return { info: { width: info.width, height: info.height, orientation: info.orientation }, thumb: URL.createObjectURL(blob) }
  } finally {
    bmp.close()
  }
}

/**
 * The document's pictures ready for the PDF, each once: a picture already upright, uncut, not bigger than needed and
 * without pixel edits is embedded as it is; any other is turned upright, cut to its crop and scaled to `dpi` of its
 * largest printed size, then auto levels and redactions change its pixels (report/imageProcess.ts) before it is
 * encoded, so a redacted area's original pixels never reach the PDF.
 */
export async function preparePictures(doc: Pick<ReportDocument, 'pages'>, src: ReportFileSources, dpi: number, onProgress?: (done: number, total: number) => void): Promise<{ images: Map<string, PreparedImage>; missing: string[] }> {
  const needs = imageNeeds(doc)
  const images = new Map<string, PreparedImage>()
  const missing: string[] = []
  let done = 0
  for (const n of needs) {
    try {
      const file = await readReportFile(src, n.ref)
      const bytes = file ? new Uint8Array(await file.arrayBuffer()) : null
      const info = bytes ? readImageInfo(bytes) : null
      if (!file || !bytes || !info) {
        missing.push(n.ref.file)
        continue
      }
      const c = n.crop ?? { x0: 0, y0: 0, x1: 1, y1: 1 }
      const turned = info.orientation >= 5
      const uw = turned ? info.height : info.width
      const uh = turned ? info.width : info.height
      const cw = (c.x1 - c.x0) * uw
      const ch = (c.y1 - c.y0) * uh
      const k = Math.min(1, (n.printedW * dpi) / cw, (n.printedH * dpi) / ch)
      // The logo is small and has a see-through background: always as it is.
      if (n.ref.source === 'brand' || (info.orientation === 1 && !n.crop && k >= 0.95 && !hasPixelEdits(n))) {
        images.set(n.key, { bytes, format: info.format, orientation: 1, region: null })
      } else {
        const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
        try {
          const w = Math.max(1, Math.round(cw * k))
          const h = Math.max(1, Math.round(ch * k))
          const canvas = new OffscreenCanvas(w, h)
          const ctx = canvas.getContext('2d')!
          ctx.imageSmoothingQuality = 'high'
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, w, h)
          ctx.drawImage(bmp, c.x0 * bmp.width, c.y0 * bmp.height, (c.x1 - c.x0) * bmp.width, (c.y1 - c.y0) * bmp.height, 0, 0, w, h)
          if (hasPixelEdits(n)) {
            const px = ctx.getImageData(0, 0, w, h)
            applyPixelEdits(px, n, c)
            ctx.putImageData(px, 0, 0)
          }
          const jpeg = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 })).arrayBuffer())
          images.set(n.key, { bytes: jpeg, format: 'jpg', orientation: 1, region: n.crop })
        } finally {
          bmp.close()
        }
      }
    } catch {
      missing.push(n.ref.file)
    }
    onProgress?.(++done, needs.length)
  }
  return { images, missing }
}

/**
 * Asks once for the remembered files the report uses (cover photo, calibration screenshot, photos picked as files) that
 * need an "Allow" click after the job was reopened. Call it from a click.
 */
export async function allowReportFiles(src: ReportFileSources, r: Report): Promise<void> {
  const slots: [FileSlot, string][] = []
  if (r.coverPhoto) slots.push(['coverPhoto', r.coverPhoto])
  if (r.calibration.dynamicImage) slots.push(['dynamicImage', r.calibration.dynamicImage])
  for (const p of r.photos) if (!src.photos?.names.includes(p.file)) slots.push([photoSlot(p.file), p.file])
  for (const sh of r.customSheets) for (const b of sh.blocks) if (b.kind === 'image' && !src.photos?.names.includes(b.file)) slots.push([photoSlot(b.file), b.file])
  for (const u of r.uploads) slots.push([uploadSlot(u.file), u.file])
  const seen = new Set<string>()
  for (const [slot, name] of slots) {
    if (seen.has(slot)) continue
    seen.add(slot)
    const h = await recallFile(src.store, src.jobId, slot).catch(() => null)
    if (!h || h.name !== name) continue
    try {
      if (((await h.queryPermission?.({ mode: 'read' })) ?? 'granted') !== 'granted') await h.requestPermission?.({ mode: 'read' })
    } catch {
      // left out: it prints as a grey box
    }
  }
}
