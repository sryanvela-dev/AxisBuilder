// Example jobs bundled with the app, drawn on the template's fixed pages (Guide to Interpretation's rollouts): the job's
// main sheet with its scan photos ("Overlays": photos, no hatch), as vectors through the same sheet model as the
// report's own Drawings pages, so the example always shows the app's current drawing style. Their photos live in
// public/<photos>/ (precached), read by the browser from the site and by Node (npm run report:pdf) from the folder.
//
// Their scan IDs are given a prefix on the sheet (`exampleScanId`), so their photos never mix with the job's own scans.
// Adding one (e.g. a vertical example) is an entry here: its data file (made like the sample, npm run sample:make) and
// its photo folder.

import { projectFileSchema, type Project } from '../data/schema.ts'
import { buildDrawing } from '../engine/drawing.ts'
import { sheetModels, type SheetModel } from '../engine/sheetModel.ts'
import { exportRuns } from '../export/exportSets.ts'
import type { PhotoReader } from '../export/pdf/photos.ts'
import { SAMPLE_DATA } from '../ui/sampleJobData.ts'

export interface ExampleJob {
  /** The job file's data (anonymized). */
  data: unknown
  /** Its scan photos: a folder under public/ (the site serves and precaches it). */
  photos: string
}

export const EXAMPLE_JOBS: Readonly<Record<string, ExampleJob>> = {
  /** The V-100 sample job (horizontal vessel), photos shared with the sample job. */
  v100: { data: SAMPLE_DATA, photos: 'sample-photos' },
}

const PREFIX = 'example:'

/** The scan ID an example job's photo has on its sheet: "example:v100:SCAN 1". */
export const exampleScanId = (job: string, scanId: string) => `${PREFIX}${job}:${scanId}`

/** The example job and its own scan ID, or null for a scan of the job itself. */
export function parseExampleScanId(id: string): { job: string; scanId: string } | null {
  if (!id.startsWith(PREFIX)) return null
  const rest = id.slice(PREFIX.length)
  const i = rest.indexOf(':')
  return i > 0 && EXAMPLE_JOBS[rest.slice(0, i)] ? { job: rest.slice(0, i), scanId: rest.slice(i + 1) } : null
}

const projects = new Map<string, Project>()
const sheets = new Map<string, SheetModel>()

/** The example job's project; null for an unknown name. */
export function exampleProject(job: string): Project | null {
  const def = EXAMPLE_JOBS[job]
  if (!def) return null
  if (!projects.has(job)) projects.set(job, projectFileSchema.parse(structuredClone(def.data)))
  return projects.get(job)!
}

/** The example job's main sheet with its photos and no hatch, scan IDs prefixed (made once). */
export function exampleSheet(job: string): SheetModel | null {
  const p = exampleProject(job)
  if (!p) return null
  if (!sheets.has(job)) {
    const m = sheetModels(p, buildDrawing(p), null, { hidden: exportRuns('Overlays', [])[0].hidden })[0]
    sheets.set(job, { ...m, drawing: m.drawing.map((x) => (x.t === 'image' ? { ...x, scanId: exampleScanId(job, x.scanId) } : x)) })
  }
  return sheets.get(job)!
}

/** The example jobs whose sheets these drawing sheets show (their photos are needed). */
export function exampleJobsIn(models: readonly SheetModel[]): string[] {
  const out = new Set<string>()
  for (const m of models) for (const x of m.drawing) if (x.t === 'image') {
    const e = parseExampleScanId(x.scanId)
    if (e) out.add(e.job)
  }
  return [...out]
}

/** The scan photo files an example job links (its photo folder's names). */
export const examplePhotoNames = (job: string): string[] => exampleProject(job)?.scanImages.filter((l) => l.include && l.imageFile).map((l) => l.imageFile) ?? []

/** A photo reader for the job's own scans and, by their prefixed IDs, the example jobs' (each with its own reader). */
export function withExamplePhotos(own: PhotoReader, example: (job: string) => PhotoReader | null): PhotoReader {
  const readers = new Map<string, PhotoReader | null>()
  const route = (id: string): [PhotoReader | null, string] => {
    const e = parseExampleScanId(id)
    if (!e) return [own, id]
    if (!readers.has(e.job)) readers.set(e.job, example(e.job))
    return [readers.get(e.job)!, e.scanId]
  }
  return {
    size: async (id) => {
      const [r, s] = route(id)
      return r ? r.size(s) : null
    },
    jpeg: async (id, part, w, h) => {
      const [r, s] = route(id)
      if (!r) throw new Error('not found')
      return r.jpeg(s, part, w, h)
    },
  }
}
