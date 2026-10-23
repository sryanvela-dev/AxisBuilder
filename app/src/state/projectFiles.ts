// Opening and saving the project file (.axb: the project as JSON). In Edge/Chrome the File System
// Access API is used, so Save writes back to the job's own file; other browsers open with a normal
// file picker and save by downloading a copy. A file is never replaced without asking: the first
// Save over a file opened from disk asks once, and so does a Save when the file changed elsewhere.
// Browser access is passed in (FilePlatform), so the logic is tested without a browser.

import { openProject, ProjectFileError, saveProject } from '../data/projectFile.ts'
import type { Project } from '../data/schema.ts'
import type { FileHandleLike, JobFile } from './session.ts'

export const PROJECT_EXTENSION = '.axb'
export const OPEN_ACCEPT = '.axb,.json,application/json'

const PICKER_TYPES = [{ description: 'AxisBuilder job', accept: { 'application/json': ['.axb', '.json'] } }]
const SAVE_TYPES = [{ description: 'AxisBuilder job', accept: { 'application/json': ['.axb'] } }]

export interface FilePlatform {
  /** Edge/Chrome only. Rejects with an AbortError when cancelled. */
  showOpenFilePicker?: (options: { types: typeof PICKER_TYPES; multiple: false }) => Promise<FileHandleLike[]>
  /** Edge/Chrome only. The browser itself asks before replacing an existing file. */
  showSaveFilePicker?: (options: { suggestedName: string; types: typeof SAVE_TYPES }) => Promise<FileHandleLike>
  /** Fallback open (a hidden file input). null = cancelled. */
  pickFile: (accept: string) => Promise<File | null>
  /** Fallback save: the browser downloads the file (never replaces an existing one). */
  download: (fileName: string, text: string) => void
}

export type OpenJobResult =
  | { status: 'cancelled' }
  | { status: 'error'; fileName: string; errors: string[] }
  | { status: 'opened'; project: Project; file: JobFile; migratedFrom?: number }

function isAbort(err: unknown): boolean {
  return err instanceof DOMException ? err.name === 'AbortError' : (err as { name?: string } | null)?.name === 'AbortError'
}

/** Asks for a project file and reads it. */
export async function openJobFile(platform: FilePlatform): Promise<OpenJobResult> {
  if (platform.showOpenFilePicker) {
    let handles: FileHandleLike[]
    try {
      handles = await platform.showOpenFilePicker({ types: PICKER_TYPES, multiple: false })
    } catch (err) {
      if (isAbort(err)) return { status: 'cancelled' }
      throw err
    }
    const handle = handles[0]
    if (!handle) return { status: 'cancelled' }
    return readJobFile(await handle.getFile(), handle)
  }
  const file = await platform.pickFile(OPEN_ACCEPT)
  return file ? readJobFile(file, null) : { status: 'cancelled' }
}

/** Reads a project file (from a picker, a recent job or a dropped file). */
export async function readJobFile(file: File, handle: FileHandleLike | null): Promise<OpenJobResult> {
  if (/\.(xlsm|xlsx|xls)$/i.test(file.name)) {
    return { status: 'error', fileName: file.name, errors: ['This is an Excel workbook, not an AxisBuilder job file. Use "Import old Excel job" instead.'] }
  }
  if (/\.csv$/i.test(file.name)) {
    return { status: 'error', fileName: file.name, errors: ['This is a CSV file, not an AxisBuilder job file. AUT CSV files are imported in the AUT scans step.'] }
  }
  const opened = openProject(await file.text())
  if (!opened.ok) return { status: 'error', fileName: file.name, errors: opened.errors }
  const jobFile: JobFile = { name: file.name, handle, lastModified: file.lastModified, writeConfirmed: false }
  return opened.migratedFrom === undefined
    ? { status: 'opened', project: opened.project, file: jobFile }
    : { status: 'opened', project: opened.project, file: jobFile, migratedFrom: opened.migratedFrom }
}

/** A question Save needs answered before it replaces a file. */
export type SaveQuestion =
  /** First Save over a file that was opened from disk. */
  | { kind: 'replaceOpened'; fileName: string }
  /** The file changed on disk since it was opened or saved here. */
  | { kind: 'changedElsewhere'; fileName: string }

export type SaveAnswer = 'replace' | 'saveAs' | 'cancel'

export interface SaveRequest {
  project: Project
  /** The job's current file (null = never saved). */
  file: JobFile | null
  /** Always ask for a new place (Save as). */
  saveAs: boolean
  /** Name offered when asking for a place, e.g. "V-101.axb". */
  suggestedName: string
  ask: (question: SaveQuestion) => Promise<SaveAnswer>
}

export type SaveOutcome =
  | { status: 'cancelled' }
  /** Written to a file on disk; Save will write there again. */
  | { status: 'saved'; file: JobFile }
  /** Downloaded a copy (browsers without the File System Access API). */
  | { status: 'downloaded'; file: JobFile }
  | { status: 'error'; message: string }

/** "V-101 / Unit 3" -> "V-101 _ Unit 3.axb". */
export function suggestedFileName(projectName: string, currentFile: JobFile | null): string {
  if (currentFile) return currentFile.name.replace(/\.json$/i, PROJECT_EXTENSION)
  const base = projectName.replace(/[<>:"/\\|?*]+/g, '_').trim().replace(/[. ]+$/, '') || 'Untitled job'
  return base + PROJECT_EXTENSION
}

async function canWrite(handle: FileHandleLike): Promise<boolean> {
  if (!handle.createWritable) return false
  if (!handle.queryPermission) return true
  if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true
  return (await handle.requestPermission?.({ mode: 'readwrite' })) === 'granted'
}

async function writeTo(handle: FileHandleLike, text: string): Promise<JobFile> {
  const w = await handle.createWritable!()
  await w.write(text)
  await w.close()
  const written = await handle.getFile()
  return { name: handle.name, handle, lastModified: written.lastModified, writeConfirmed: true }
}

export async function saveJob(platform: FilePlatform, req: SaveRequest): Promise<SaveOutcome> {
  let text: string
  try {
    text = saveProject(req.project)
  } catch (err) {
    const message = err instanceof ProjectFileError ? err.errors.join('\n') : String(err)
    return { status: 'error', message }
  }

  try {
    const handle = req.file?.handle
    if (!req.saveAs && handle && (await canWrite(handle))) {
      let question: SaveQuestion | null = null
      const onDisk = await handle.getFile().catch(() => null)
      if (onDisk && req.file!.lastModified !== null && onDisk.lastModified !== req.file!.lastModified) {
        question = { kind: 'changedElsewhere', fileName: handle.name }
      } else if (!req.file!.writeConfirmed) {
        question = { kind: 'replaceOpened', fileName: handle.name }
      }
      const answer: SaveAnswer = question ? await req.ask(question) : 'replace'
      if (answer === 'cancel') return { status: 'cancelled' }
      if (answer === 'replace') return { status: 'saved', file: await writeTo(handle, text) }
      // 'saveAs': fall through to the picker
    }

    if (platform.showSaveFilePicker) {
      let target: FileHandleLike
      try {
        target = await platform.showSaveFilePicker({ suggestedName: req.suggestedName, types: SAVE_TYPES })
      } catch (err) {
        if (isAbort(err)) return { status: 'cancelled' }
        throw err
      }
      return { status: 'saved', file: await writeTo(target, text) }
    }

    platform.download(req.suggestedName, text)
    return { status: 'downloaded', file: { name: req.suggestedName, handle: null, lastModified: null, writeConfirmed: false } }
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) }
  }
}

/** The real browser: File System Access API where available, file input and download elsewhere. */
export function browserFilePlatform(): FilePlatform {
  const w = window as unknown as Pick<FilePlatform, 'showOpenFilePicker' | 'showSaveFilePicker'>
  return {
    showOpenFilePicker: w.showOpenFilePicker?.bind(window),
    showSaveFilePicker: w.showSaveFilePicker?.bind(window),
    pickFile: pickWithInput,
    download: (fileName, text) => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
      a.download = fileName
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
    },
  }
}

/** Opens a file input; resolves null if the user cancels. */
export function pickWithInput(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null))
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}
