// The report PDF outside the browser (tests and npm run report:pdf): pictures read from folders on disk with their
// size and EXIF orientation (embedded as they are; the placement applies orientation, turn and crop), the drawing's
// scan photos cut and stretched with jpeg-js, the bundled fonts. A picture with pixel edits (auto levels, redactions)
// is decoded, turned upright, cut to its crop, changed with the app's own pixel code (report/imageProcess.ts) and
// encoded again, as the browser does, so the redacted pixels never reach the PDF.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import jpeg from 'jpeg-js'
import { REPORT_FONT_FILES } from '../../../scripts/gen-font-metrics.ts'
import { resolveImageFile } from '../../../src/data/imageMatch.ts'
import { photoLink } from '../../../src/data/photos.ts'
import type { Project } from '../../../src/data/schema.ts'
import { photoNeeds, type SheetModel } from '../../../src/engine/sheetModel.ts'
import { preparePhotos, type PhotoReader } from '../../../src/export/pdf/photos.ts'
import type { ReportFontId } from '../../../src/report/fonts.ts'
import { applyPixelEdits, cropPixels, hasPixelEdits, uprightPixels } from '../../../src/report/imageProcess.ts'
import { readImageInfo } from '../../../src/report/imageInfo.ts'
import { imageNeeds, type ImageInfo, type ImageRef, type ReportDocument } from '../../../src/report/pageModel.ts'
import type { PreparedImage } from '../../../src/report/pdf/writeReportPdf.ts'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, '..', '..', '..', 'src')

export const REPORT_FONTS = Object.fromEntries(
  Object.entries(REPORT_FONT_FILES).map(([id, file]) => [id, new Uint8Array(readFileSync(join(SRC, 'assets', 'fonts', file)))]),
) as Record<ReportFontId, Uint8Array>
export const DRAWING_FONT = new Uint8Array(readFileSync(join(SRC, 'assets', 'fonts', 'Arimo-Regular.ttf')))
export const LOGO_FILE = join(SRC, 'assets', 'brand', 'integrity-epc-logo.png')
/** The template's bundled pictures (the fixed pages). */
export const REPORT_ASSETS = join(SRC, 'assets', 'report')

/** Folders for each picture source (brand and asset are the app's own). */
export type ReportFolders = Partial<Record<'photos' | 'screenshots' | 'cover' | 'calibration' | 'uploads', string>>

/** Reads report pictures from folders: info for the builders, bytes for the PDF; `extra` = pictures held in memory. */
export function folderImages(folders: ReportFolders, extra: ReadonlyMap<string, Uint8Array> = new Map()) {
  const cache = new Map<string, Uint8Array | null>()
  const bytesOf = (ref: ImageRef): Uint8Array | null => {
    const key = `${ref.source}|${ref.file}`
    if (!cache.has(key)) {
      let b: Uint8Array | null = extra.get(ref.file) ?? null
      if (!b && ref.source === 'brand') b = new Uint8Array(readFileSync(LOGO_FILE))
      if (!b && ref.source === 'asset' && existsSync(join(REPORT_ASSETS, ref.file))) b = new Uint8Array(readFileSync(join(REPORT_ASSETS, ref.file)))
      const dir = ref.source === 'brand' || ref.source === 'asset' ? undefined : folders[ref.source]
      if (!b && dir && existsSync(join(dir, ref.file))) b = new Uint8Array(readFileSync(join(dir, ref.file)))
      cache.set(key, b)
    }
    return cache.get(key)!
  }
  const image = (ref: ImageRef): ImageInfo | null => {
    const b = bytesOf(ref)
    const info = b ? readImageInfo(b) : null
    return info ? { width: info.width, height: info.height, orientation: info.orientation } : null
  }
  const prepared = (doc: Pick<ReportDocument, 'pages'>): Map<string, PreparedImage> => {
    const out = new Map<string, PreparedImage>()
    for (const n of imageNeeds(doc)) {
      const b = bytesOf(n.ref)
      const info = b ? readImageInfo(b) : null
      if (!b || !info) continue
      if (hasPixelEdits(n) && info.format === 'jpg') {
        const raw = jpeg.decode(b, { useTArray: true })
        const px = cropPixels(uprightPixels({ data: raw.data, width: raw.width, height: raw.height }, info.orientation), n.crop)
        applyPixelEdits(px, n, n.crop ?? undefined)
        const enc = jpeg.encode({ data: Buffer.from(px.data.buffer, px.data.byteOffset, px.data.byteLength), width: px.width, height: px.height }, 92)
        out.set(n.key, { bytes: new Uint8Array(enc.data), format: 'jpg', orientation: 1, region: n.crop })
      } else out.set(n.key, { bytes: b, format: info.format, orientation: info.orientation, region: null })
    }
    return out
  }
  return { image, prepared }
}

/** The drawing's scan photos from a folder, cut and stretched like the browser's (jpeg-js, bilinear). */
export function folderPhotoReader(p: Project, folder: string): PhotoReader {
  const names = existsSync(folder) ? readdirSync(folder) : []
  const fileOf = (scanId: string) => {
    const link = photoLink(p, scanId)
    const name = link && link.include ? resolveImageFile(link.imageFile, names) : null
    return name ? join(folder, name) : null
  }
  return {
    async size(scanId) {
      const f = fileOf(scanId)
      const info = f ? readImageInfo(new Uint8Array(readFileSync(f))) : null
      return info ? { width: info.width, height: info.height } : null
    },
    async jpeg(scanId, part, outW, outH) {
      const f = fileOf(scanId)
      if (!f) throw new Error('not found')
      const src = jpeg.decode(readFileSync(f), { useTArray: true })
      const data = Buffer.alloc(outW * outH * 4)
      for (let y = 0; y < outH; y++) {
        const sy = Math.min(src.height - 1, ((y + 0.5) / outH) * src.height)
        for (let x = 0; x < outW; x++) {
          const sx = Math.min(src.width - 1, part.x + ((x + 0.5) / outW) * part.width)
          const i = (Math.floor(sy) * src.width + Math.floor(sx)) * 4
          const o = (y * outW + x) * 4
          data[o] = src.data[i]
          data[o + 1] = src.data[i + 1]
          data[o + 2] = src.data[i + 2]
          data[o + 3] = 255
        }
      }
      return new Uint8Array(jpeg.encode({ data, width: outW, height: outH }, 90).data)
    },
  }
}

/** The drawing photos the document's drawing pages show. */
export async function sheetPhotosFor(p: Project, doc: Pick<ReportDocument, 'pages'>, folder: string | undefined, dpi: number) {
  const models: SheetModel[] = doc.pages.flatMap((pg) => pg.items.flatMap((i) => (i.t === 'sheet' ? [i.model] : [])))
  if (!folder) return new Map()
  return (await preparePhotos(photoNeeds(models), folderPhotoReader(p, folder), dpi)).photos
}
