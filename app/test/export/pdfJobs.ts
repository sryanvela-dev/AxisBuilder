// The PDF of every golden job and the sample job, with made-up photos (no real photos are in the repo), for
// test/export/pdf.test.ts and scripts/pdf-report.ts (npm run pdf:report: the file sizes).
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import jpeg from 'jpeg-js'
import { openProject } from '../../src/data/projectFile.ts'
import type { Project } from '../../src/data/schema.ts'
import { buildDrawing } from '../../src/engine/drawing.ts'
import { activeSectionPlan } from '../../src/engine/sections.ts'
import { photoNeeds, sheetModels, type SheetModel } from '../../src/engine/sheetModel.ts'
import { preparePhotos, type PhotoReader } from '../../src/export/pdf/photos.ts'
import { writePdf } from '../../src/export/pdf/writePdf.ts'
import { sampleProject } from '../../src/ui/sampleJob.ts'

const here = dirname(fileURLToPath(import.meta.url))
export const FONT = new Uint8Array(readFileSync(join(here, '..', '..', 'src', 'assets', 'fonts', 'Arimo-Regular.ttf')))
/** The reference jobs' photos are 1915 x 957 px. */
export const PHOTO = { width: 1915, height: 957 }

/** A photo-like picture (smooth shading with fine grain, so it compresses like a scan photo, not like noise). */
export function madeUpJpeg(w: number, h: number, quality = 90): Uint8Array {
  const data = Buffer.alloc(w * h * 4)
  let seed = 12345
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const v = 120 + 60 * Math.sin(x / 37) * Math.cos(y / 23) + (rnd() - 0.5) * 30
      data[i] = Math.max(0, Math.min(255, v + 20))
      data[i + 1] = Math.max(0, Math.min(255, v))
      data[i + 2] = Math.max(0, Math.min(255, v - 30))
      data[i + 3] = 255
    }
  }
  return new Uint8Array(jpeg.encode({ data, width: w, height: h }, quality).data)
}

export const madeUpReader: PhotoReader = {
  size: async () => PHOTO,
  jpeg: async (_id, _part, w, h) => madeUpJpeg(w, h),
}

export function goldenJobs(): { name: string; project: Project }[] {
  const golden = join(here, '..', 'golden')
  const out: { name: string; project: Project }[] = []
  for (const name of readdirSync(golden, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
    const r = openProject(readFileSync(join(golden, name, 'project.json'), 'utf8'))
    if (!r.ok) throw new Error(r.errors.join('\n'))
    out.push({ name, project: r.project })
  }
  const s = sampleProject()
  out.push({ name: 'sample', project: { ...s, scanImages: s.scans.map((x) => ({ scanId: x.id, imageFile: `${x.id}.png`, processedImage: '', include: true })) } })
  return out
}

export const withSections = (p: Project, on: boolean): Project => ({ ...p, settings: { ...p.settings, makeSectionSheets: on } })

export interface JobPdf {
  models: SheetModel[]
  bytes: Uint8Array
  photoSizes: Map<string, { width: number; height: number }>
}

export async function jobPdf(p: Project, dpi = p.settings.pdfPhotoDpi, layers = true): Promise<JobPdf> {
  const models = sheetModels(p, buildDrawing(p), activeSectionPlan(p))
  const { photos } = await preparePhotos(photoNeeds(models), madeUpReader, dpi)
  const bytes = await writePdf({ models, font: FONT, photos, layers, title: 'Test', date: new Date(2026, 0, 2) })
  return { models, bytes, photoSizes: new Map([...photos].map(([k, v]) => [k, { width: v.width, height: v.height }])) }
}
