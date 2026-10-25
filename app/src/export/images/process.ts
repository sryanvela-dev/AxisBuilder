// Making the processed scan images: which scans get one (and why the others don't), what is already
// in the target folder, and the run itself. Reading photos, fitting them (a Web Worker in the app)
// and writing files are passed in, so the rules are tested without a browser.

import { pieceImageName, processedImageNames, resolveImageFile } from '../../data/imageMatch.ts'
import { drawnScans } from '../../engine/layout.ts'
import { circumference, isWrapped, scanPieces } from '../../engine/wrap.ts'
import { idKey, type Project } from '../../data/schema.ts'
import { MARKER_FILE, markerText, parseMarker, type JobMarker } from './marker.ts'

/** The Processed_Images folder name: the setting when it is a plain folder name, else Processed_Images. */
export function processedFolderName(setting: string): string {
  const name = setting.trim()
  return name === '' || /[\\/:*?"<>|]/.test(name) ? 'Processed_Images' : name
}

export interface PhotoJob {
  scanId: string
  scanIndex: number
  /** File name in the photo folder. */
  photoName: string
  /** File name in Processed_Images, e.g. "SCAN_1_FIT.png" (processedImageNames, as the .lsp uses). */
  outName: string
  /** Scan size (inches): the processed image gets exactly this width:height. */
  scanW: number
  scanH: number
  /**
   * A scan across the circumference seam is split: each piece gets the part of the photo across its width
   * (fractions of the photo width, from the scan's start), its own file (SCAN_5_FIT_A.png / _B.png) and scanW.
   */
  crop?: [number, number]
}

export interface Skipped {
  scanId: string
  reason: string
}

export interface ProcessPlan {
  jobs: PhotoJob[]
  skipped: Skipped[]
}

/**
 * The scans to process, in table order. `photoNames` = the files in the photo folder (null when it is not
 * open; then no scan with a photo can be processed).
 */
export function planProcessing(project: Project, photoNames: readonly string[] | null): ProcessPlan {
  const outNames = processedImageNames(project.scans.map((s) => s.id))
  const drawn = drawnScans(project)
  const C = circumference(project)
  const links = new Map(project.scanImages.map((l) => [idKey(l.scanId), l]))
  const jobs: PhotoJob[] = []
  const skipped: Skipped[] = []
  project.scans.forEach((s, scanIndex) => {
    const skip = (reason: string) => skipped.push({ scanId: s.id, reason })
    if (!s.include) return skip('The scan is not drawn (Include is off).')
    const link = links.get(idKey(s.id))
    if (link && !link.include) return skip('Its photo is switched off.')
    if (!link || link.imageFile.trim() === '') return skip('No photo is chosen for it.')
    if (s.xStart === null || s.xStop === null || s.yStart === null || s.yStop === null) return skip('Its position is not complete.')
    if (!photoNames) return skip('The photo folder is not open.')
    const photo = resolveImageFile(link.imageFile, photoNames)
    if (!photo) return skip(`${link.imageFile} is not in the photo folder.`)
    const pieces = scanPieces(drawn[scanIndex], C)
    if (isWrapped(pieces)) {
      pieces.forEach((pc, piece) => jobs.push({
        scanId: s.id,
        scanIndex,
        photoName: photo,
        outName: pieceImageName(outNames.get(s.id)!, piece),
        scanW: pc.x1 - pc.x0,
        scanH: Math.abs(s.yStop! - s.yStart!),
        crop: [pc.from, pc.to],
      }))
      return
    }
    jobs.push({
      scanId: s.id,
      scanIndex,
      photoName: photo,
      outName: outNames.get(s.id)!,
      scanW: Math.abs(s.xStop - s.xStart),
      scanH: Math.abs(s.yStop - s.yStart),
    })
  })
  return { jobs, skipped }
}

/** Width and height of a PNG from its first 24 bytes (IHDR), or null when it isn't a PNG. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (bytes.length < 24 || sig.some((b, i) => bytes[i] !== b)) return null
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: v.getUint32(16), height: v.getUint32(20) }
}

/** What is known about a processed image already in the folder. */
export interface ExistingImage {
  lastModified: number
  width: number
  height: number
}

/**
 * The jobs whose processed image is missing or out of date (decided by the user for "Make CAD drawing"):
 * not there yet, older than its photo, or no longer the shape of its scan (more than a pixel off).
 */
export function staleJobs(plan: ProcessPlan, existing: ReadonlyMap<string, ExistingImage>, photoTimes: ReadonlyMap<string, number>): PhotoJob[] {
  return plan.jobs.filter((j) => {
    const e = existing.get(j.outName.toLowerCase())
    if (!e) return true
    const photo = photoTimes.get(j.photoName)
    if (photo !== undefined && photo > e.lastModified) return true
    return Math.abs(e.width - (e.height * j.scanW) / j.scanH) > 1
  })
}

export type FolderCheck =
  /** The folder holds another job's processed images: stop. */
  | { kind: 'otherJob'; marker: JobMarker }
  | {
      kind: 'ok'
      /** Processed images of this run that are already there (replacing them needs a yes). */
      existing: string[]
      /** True when the folder has files but no marker (e.g. made by the Excel version). */
      unmarked: boolean
    }

/** Looks at the target Processed_Images folder before anything is written. */
export function checkTargetFolder(fileNames: readonly string[], markerFileText: string | null, jobId: string, plan: ProcessPlan): FolderCheck {
  const marker = markerFileText === null ? null : parseMarker(markerFileText)
  if (marker && marker.jobId !== jobId) return { kind: 'otherJob', marker }
  const present = new Set(fileNames.map((n) => n.toLowerCase()))
  const existing = plan.jobs.map((j) => j.outName).filter((n) => present.has(n.toLowerCase()))
  const others = fileNames.filter((n) => n.toLowerCase() !== MARKER_FILE.toLowerCase())
  return { kind: 'ok', existing, unmarked: !marker && others.length > 0 }
}

export interface FitResult {
  blob: Blob
  width: number
  height: number
  capped: boolean
  /** Made bigger to match the Excel version's size. */
  raised: boolean
}

export interface ProcessIO {
  readPhoto: (name: string) => Promise<Blob>
  /** crop: only this part of the photo's width (fractions), for a piece of a scan across the seam. */
  fit: (photo: Blob, scanW: number, scanH: number, maxSide: number, crop?: [number, number]) => Promise<FitResult>
  write: (name: string, data: Blob | string) => Promise<void>
}

export interface RunOptions {
  plan: ProcessPlan
  /** Output names already in the folder that the user chose to keep. */
  keep: ReadonlySet<string>
  maxSide: number
  marker: JobMarker
  io: ProcessIO
  onProgress?: (done: number, total: number, current: string) => void
  signal?: AbortSignal
}

export interface RunSummary {
  processed: { scanId: string; outName: string; width: number; height: number; capped: boolean; raised: boolean }[]
  skipped: Skipped[]
  failed: Skipped[]
  cancelled: boolean
}

export async function runProcessing(o: RunOptions): Promise<RunSummary> {
  const summary: RunSummary = { processed: [], skipped: [...o.plan.skipped], failed: [], cancelled: false }
  const todo = o.plan.jobs.filter((j) => {
    if (!o.keep.has(j.outName)) return true
    summary.skipped.push({ scanId: j.scanId, reason: `${j.outName} was already there and kept.` })
    return false
  })
  // The marker goes first, so the folder is claimed for this job even if the run stops halfway.
  await o.io.write(MARKER_FILE, markerText(o.marker, o.plan.jobs.length))
  for (let i = 0; i < todo.length; i++) {
    const j = todo[i]
    o.onProgress?.(i, todo.length, j.scanId)
    if (o.signal?.aborted) {
      summary.cancelled = true
      for (const k of todo.slice(i)) summary.skipped.push({ scanId: k.scanId, reason: 'Not done: cancelled.' })
      break
    }
    let photo: Blob
    try {
      photo = await o.io.readPhoto(j.photoName)
    } catch (err) {
      summary.failed.push({ scanId: j.scanId, reason: `${j.photoName} could not be read (${message(err)}).` })
      continue
    }
    let fitted: FitResult
    try {
      fitted = await o.io.fit(photo, j.scanW, j.scanH, o.maxSide, j.crop)
    } catch (err) {
      summary.failed.push({ scanId: j.scanId, reason: `${j.photoName} could not be opened as a picture (${message(err)}).` })
      continue
    }
    try {
      await o.io.write(j.outName, fitted.blob)
    } catch (err) {
      summary.failed.push({ scanId: j.scanId, reason: `${j.outName} could not be written (${message(err)}).` })
      continue
    }
    summary.processed.push({ scanId: j.scanId, outName: j.outName, width: fitted.width, height: fitted.height, capped: fitted.capped, raised: fitted.raised })
  }
  if (!summary.cancelled) o.onProgress?.(todo.length, todo.length, '')
  return summary
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
