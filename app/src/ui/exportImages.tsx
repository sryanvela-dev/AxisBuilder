// The processed scan images, brought up to date before a CAD file is written (Make CAD drawing and Make DXF): the ones
// missing or out of date (the photo changed, or the scan's shape) are processed; replacing older ones asks first.

import { MARKER_FILE } from '../export/images/marker.ts'
import { createFitter } from '../export/images/fitClient.ts'
import { checkTargetFolder, planProcessing, pngSize, runProcessing, staleJobs, type ExistingImage } from '../export/images/process.ts'
import type { Project } from '../data/schema.ts'
import { listFiles, type DirectoryHandleLike } from '../state/folders.ts'
import type { Job } from '../state/session.ts'
import { jobTitle } from '../state/session.ts'
import { plural } from '../state/steps.ts'
import type { AppApi } from './appContext.ts'
import type { PhotoFolder } from './photoFolder.ts'
import { writeFile } from './writeFiles.ts'

export interface ImageRun {
  app: AppApi
  project: Project
  job: Job
  photoFolder: PhotoFolder | null
  root: DirectoryHandleLike
  folder: string
  setBusy: (text: string | null) => void
}

/**
 * Brings the processed images up to date: the files written and notes for the summary, a string = why it stopped (the
 * folder holds another job's images), or 'cancel' = the user stopped it.
 */
export async function bringImagesUpToDate(r: ImageRun): Promise<{ written: string[]; notes: string[] } | string | 'cancel'> {
  if (!r.project.settings.generateOverlayDrawing) return { written: [], notes: [] }
  const plan = planProcessing(r.project, r.photoFolder?.names ?? null)
  if (!r.photoFolder) return { written: [], notes: ['The photo folder is not open, so no images were processed. Open it on the Images step to include the photos.'] }
  if (plan.jobs.length === 0) return { written: [], notes: [] }
  r.setBusy('Checking the processed images...')
  const result = await processStale(r, plan, r.photoFolder)
  if (typeof result === 'string') return result
  return { written: result.written.map((n) => `${r.folder}\\${n}`), notes: result.notes }
}

async function processStale(r: ImageRun, plan: ReturnType<typeof planProcessing>, photoFolder: PhotoFolder): Promise<{ written: string[]; notes: string[] } | string | 'cancel'> {
  const { app, project: p, job, root, folder } = r
  let names: string[] = []
  let marker: string | null = null
  let dir: DirectoryHandleLike | null = null
  try {
    dir = await root.getDirectoryHandle(folder)
    names = await listFiles(dir)
    const markerName = names.find((n) => n.toLowerCase() === MARKER_FILE.toLowerCase())
    if (markerName) marker = await (await (await dir.getFileHandle(markerName)).getFile()).text()
  } catch {
    // No folder yet.
  }
  const check = checkTargetFolder(names, marker, p.jobId, plan, jobTitle(job))
  if (check.kind === 'otherJob') return `${root.name}\\${folder} holds the processed images of "${check.marker.jobName || 'another job'}". Nothing was changed.`
  const existing = new Map<string, ExistingImage>()
  if (dir) {
    for (const n of check.existing) {
      const f = await (await dir.getFileHandle(n)).getFile()
      const size = pngSize(new Uint8Array(await f.slice(0, 24).arrayBuffer()))
      if (size) existing.set(n.toLowerCase(), { lastModified: f.lastModified, ...size })
    }
  }
  const photoTimes = new Map<string, number>()
  for (const j of plan.jobs) {
    const f = await photoFolder.getFile(j.photoName)
    if (f) photoTimes.set(j.photoName, f.lastModified)
  }
  const stale = staleJobs(plan, existing, photoTimes)
  const upToDate = plan.jobs.length - stale.length
  if (stale.length === 0) return { written: [], notes: [`All ${plural(plan.jobs.length, 'processed image')} were up to date.`] }
  const replacing = stale.filter((j) => existing.has(j.outName.toLowerCase()))
  if (replacing.length > 0) {
    const answer = await app.ask<'replace' | 'keep' | 'cancel'>({
      title: 'Replace out-of-date processed images?',
      message: (
        <p>
          {plural(replacing.length, 'processed image')} in {folder} {replacing.length === 1 ? 'is' : 'are'} older than {replacing.length === 1 ? 'its photo' : 'their photos'}, or
          no longer the shape of {replacing.length === 1 ? 'its scan' : 'their scans'}.
        </p>
      ),
      buttons: [
        { id: 'replace', label: 'Replace them', primary: true },
        { id: 'keep', label: 'Keep them' },
        { id: 'cancel', label: 'Cancel' },
      ],
      cancelId: 'cancel',
    })
    if (answer === 'cancel') return 'cancel'
    if (answer === 'keep') stale.splice(0, stale.length, ...stale.filter((j) => !existing.has(j.outName.toLowerCase())))
  }
  r.setBusy(`Processing ${plural(stale.length, 'image')}...`)
  const fitter = createFitter()
  try {
    const out = await root.getDirectoryHandle(folder, { create: true })
    const result = await runProcessing({
      plan: { jobs: stale, skipped: [] },
      keep: new Set(),
      maxSide: p.settings.maxImageSide,
      marker: { jobId: p.jobId, jobName: jobTitle(job) },
      io: {
        readPhoto: async (name) => {
          const f = await photoFolder.getFile(name)
          if (!f) throw new Error('not found')
          return f
        },
        fit: fitter.fit,
        write: (name, data) => writeFile(out, { name, data }),
      },
      onProgress: (done, total, current) => r.setBusy(`Processing images: ${done} of ${total}${current ? ` (${current})` : ''}`),
    })
    const notes = [`${plural(result.processed.length, 'image')} processed; ${upToDate} already up to date.`]
    for (const f of result.failed) notes.push(`${f.scanId}: ${f.reason}`)
    return { written: result.processed.map((x) => x.outName), notes }
  } finally {
    fitter.close()
  }
}

/** The pixel size of each processed image in the folder (PNG headers), by file name in lower case. */
export async function processedImageSizes(root: DirectoryHandleLike, folder: string): Promise<Map<string, [number, number]>> {
  const out = new Map<string, [number, number]>()
  let dir: DirectoryHandleLike
  try {
    dir = await root.getDirectoryHandle(folder)
  } catch {
    return out
  }
  for (const n of await listFiles(dir)) {
    if (!/\.png$/i.test(n)) continue
    const f = await (await dir.getFileHandle(n)).getFile()
    const size = pngSize(new Uint8Array(await f.slice(0, 24).arrayBuffer()))
    if (size) out.set(n.toLowerCase(), [size.width, size.height])
  }
  return out
}
