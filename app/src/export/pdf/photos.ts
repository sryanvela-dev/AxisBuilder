// Photos for the PDF: each photo (or photo piece, for a scan across the seam) at about the PDF photo
// resolution of its largest printed size, never more than the photo itself has. Shape rule as the processed
// images (docs/overlay-image-scaling.md): the photo is stretched in one direction to the scan's exact
// width:height; it is not cropped (only split at the seam).

import type { PhotoNeed } from '../../engine/sheetModel.ts'
import { cropSource } from '../images/fit.ts'
import type { PdfPhoto } from './writePdf.ts'

/**
 * Pixel size of a printed photo: the source part (srcW x srcH px) stretched to the printed shape
 * (printedW x printedH in), then scaled down to dpi pixels per printed inch if it has more. At least 1 px.
 */
export function printPhotoSize(srcW: number, srcH: number, printedW: number, printedH: number, dpi: number): { width: number; height: number } {
  const ratio = printedW / printedH
  let width = srcW
  let height = srcH
  if (srcW / srcH < ratio) width = Math.max(srcW, Math.round(srcH * ratio))
  else if (srcW / srcH > ratio) height = Math.max(srcH, Math.round(srcW / ratio))
  const tw = Math.max(1, Math.round(printedW * dpi))
  if (width > tw) {
    width = tw
    height = Math.max(1, Math.round(tw / ratio))
  }
  const th = Math.max(1, Math.round(printedH * dpi))
  if (height > th) {
    height = th
    width = Math.max(1, Math.round(th * ratio))
  }
  return { width: Math.max(1, width), height: Math.max(1, height) }
}

/** Reads the job's photos (the browser's photo folder, or made-up photos in tests). */
export interface PhotoReader {
  /** Pixel size of the scan's photo, or null when it can't be found or read. */
  size(scanId: string): Promise<{ width: number; height: number } | null>
  /** The columns x .. x+width of the photo, stretched to outW x outH, as JPEG bytes. */
  jpeg(scanId: string, part: { x: number; width: number }, outW: number, outH: number): Promise<Uint8Array>
}

export interface PreparedPhotos {
  photos: Map<string, PdfPhoto>
  /** Scans whose photo could not be read (left off the PDF). */
  missing: string[]
}

export async function preparePhotos(needs: readonly PhotoNeed[], reader: PhotoReader, dpi: number, onProgress?: (done: number, total: number) => void): Promise<PreparedPhotos> {
  const photos = new Map<string, PdfPhoto>()
  const missing = new Set<string>()
  let done = 0
  for (const n of needs) {
    const src = await reader.size(n.scanId)
    if (!src) missing.add(n.scanId)
    else {
      const part = cropSource(src.width, n.crop)
      const size = printPhotoSize(part.width, src.height, n.printedW, n.printedH, dpi)
      try {
        photos.set(n.key, { jpeg: await reader.jpeg(n.scanId, part, size.width, size.height), ...size })
      } catch {
        missing.add(n.scanId)
      }
    }
    onProgress?.(++done, needs.length)
  }
  return { photos, missing: [...missing] }
}
