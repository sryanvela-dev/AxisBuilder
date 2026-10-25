// The original scan photos for the PDF and the report images, read from the open photo folder in the browser.
// Photos are read one at a time and let go straight after, so a job with 150 photos doesn't hold them all.

import { resolveImageFile } from '../data/imageMatch.ts'
import { photoLink } from '../data/photos.ts'
import type { Project } from '../data/schema.ts'
import type { PhotoReader } from '../export/pdf/photos.ts'
import type { ReportPhoto } from '../export/report/reportImages.ts'
import type { PhotoFolder } from './photoFolder.ts'

export async function photoFile(p: Project, folder: PhotoFolder | null, scanId: string): Promise<File | null> {
  if (!folder) return null
  const link = photoLink(p, scanId)
  if (!link || !link.include) return null
  const name = resolveImageFile(link.imageFile, folder.names)
  return name ? folder.getFile(name) : null
}

/** PDF photos: each cut and stretched on a canvas and saved as a JPEG (quality 0.9). */
export function browserPhotoReader(p: Project, folder: PhotoFolder | null): PhotoReader {
  const sizes = new Map<string, { width: number; height: number } | null>()
  return {
    async size(scanId) {
      if (!sizes.has(scanId)) {
        let size: { width: number; height: number } | null = null
        try {
          const f = await photoFile(p, folder, scanId)
          if (f) {
            const bmp = await createImageBitmap(f)
            size = { width: bmp.width, height: bmp.height }
            bmp.close()
          }
        } catch {
          // not a readable picture
        }
        sizes.set(scanId, size)
      }
      return sizes.get(scanId)!
    },
    async jpeg(scanId, part, outW, outH) {
      const f = await photoFile(p, folder, scanId)
      if (!f) throw new Error('not found')
      const bmp = await createImageBitmap(f)
      try {
        const canvas = new OffscreenCanvas(outW, outH)
        const ctx = canvas.getContext('2d')!
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(bmp, part.x, 0, part.width, bmp.height, 0, 0, outW, outH)
        return new Uint8Array(await (await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 })).arrayBuffer())
      } finally {
        bmp.close()
      }
    },
  }
}

/** The photos one sheet shows, as bitmaps (close them with closePhotos after drawing the sheet). */
export async function sheetBitmaps(p: Project, folder: PhotoFolder | null, scanIds: Iterable<string>): Promise<{ photos: Map<string, ReportPhoto>; missing: string[] }> {
  const photos = new Map<string, ReportPhoto>()
  const missing: string[] = []
  for (const id of new Set(scanIds)) {
    try {
      const f = await photoFile(p, folder, id)
      if (!f) {
        missing.push(id)
        continue
      }
      const bmp = await createImageBitmap(f)
      photos.set(id, { image: bmp, width: bmp.width, height: bmp.height })
    } catch {
      missing.push(id)
    }
  }
  return { photos, missing }
}

export function closePhotos(photos: ReadonlyMap<string, ReportPhoto>) {
  for (const ph of photos.values()) (ph.image as ImageBitmap).close?.()
}
