// Web Worker: decodes one photo, stretches it to its processed size (fit.ts) and returns a PNG.
// Runs off the main thread so the screen stays responsive while ~150 photos are processed.
// For a piece of a scan across the circumference seam, only that part of the photo's width is used
// (cropSource), and the piece gets its own exact shape.

import { cropSource, fitSize } from './fit.ts'

export interface FitRequest {
  id: number
  photo: Blob
  scanW: number
  scanH: number
  maxSide: number
  /** Part of the photo's width to use (fractions), or null for all of it. */
  crop: [number, number] | null
}

export type FitResponse =
  | { id: number; ok: true; blob: Blob; width: number; height: number; capped: boolean; raised: boolean }
  | { id: number; ok: false; error: string }

const scope = self as unknown as { onmessage: ((e: MessageEvent<FitRequest>) => void) | null; postMessage: (m: FitResponse) => void }

scope.onmessage = async (e) => {
  const { id, photo, scanW, scanH, maxSide, crop } = e.data
  try {
    const bitmap = await createImageBitmap(photo)
    const src = cropSource(bitmap.width, crop)
    const size = fitSize(src.width, bitmap.height, scanW, scanH, maxSide)
    const canvas = new OffscreenCanvas(size.width, size.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no drawing surface')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, src.x, 0, src.width, bitmap.height, 0, 0, size.width, size.height)
    bitmap.close()
    const blob = await canvas.convertToBlob({ type: 'image/png' })
    scope.postMessage({ id, ok: true, blob, width: size.width, height: size.height, capped: size.capped, raised: size.raised })
  } catch (err) {
    scope.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
