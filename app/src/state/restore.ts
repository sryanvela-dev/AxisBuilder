// The job's files in this browser: every folder and file the job uses (drawing photos, job folder, report photos,
// screenshots, cover photo, calibration screenshot, uploaded pages), whether each can be read now, is waiting for the
// browser's OK (Chrome and Edge ask once more after a job is reopened or restored), or is not found here.
//
// The job file keeps only file names. Two ways back, without anyone having to keep files in a set place:
// - "Restore files": asks for every waiting folder and file from one click.
// - "Find files...": the user picks any folder; it and its subfolders are searched by name for every file not found, and
//   what it finds is remembered for the job as if it had been chosen here (another browser or PC, or a moved folder).

import type { Project } from '../data/schema.ts'
import { listFiles, recallFolderFor, rememberFolder, type DirectoryHandleLike, type FolderKind } from './folders.ts'
import { recallFile, rememberFile, type FileSlot } from './files.ts'
import type { FileHandleLike } from './session.ts'
import type { KeyValueStore } from './storage.ts'

type Handle = DirectoryHandleLike | FileHandleLike
type Mode = 'read' | 'readwrite'

/** One group of files, read from one folder and/or picked one by one. */
export type JobFilesGroupId = 'photos' | 'reportPhotos' | 'screenshots' | 'cover' | 'calibration' | 'uploads' | 'job'

export interface JobFilesGroup {
  id: JobFilesGroupId
  what: string
  /** The folder the files are read from, if the group has one. */
  folderKind: FolderKind | null
  mode: Mode
  /** The folder in this browser (its name), '' when none. */
  folderName: string
  /** 'none' = no folder known here, 'lost' = known but can't be opened (moved, renamed, deleted). */
  folder: 'none' | 'waiting' | 'ready' | 'lost' | null
  /** Each file the job names in this group and where it stands. */
  files: { name: string; state: 'ok' | 'waiting' | 'missing' }[]
  /** Folders or files to ask the browser about ("Restore files"). */
  waiting: RestoreItem[]
  /** Overall: everything readable, something waiting for the OK, or something not found here. */
  state: 'ok' | 'waiting' | 'missing' | 'notChosen'
}

export interface RestoreItem {
  /** What it is, for the bar ("Photo folder", "Cover photo", ...). */
  what: string
  name: string
  handle: Handle
  mode: Mode
}

const unique = (names: (string | null | undefined)[]) => [...new Set(names.filter((x): x is string => !!x))]

/** The report's files that may be picked one by one (not from a folder): slot, what it is, the file name the job keeps. */
export function reportFileSlots(p: Project): { slot: FileSlot; what: string; name: string }[] {
  const r = p.report
  if (!r) return []
  const out: { slot: FileSlot; what: string; name: string }[] = []
  if (r.coverPhoto) out.push({ slot: 'coverPhoto', what: 'Cover photo', name: r.coverPhoto })
  if (r.calibration.dynamicImage) out.push({ slot: 'dynamicImage', what: 'Calibration screenshot', name: r.calibration.dynamicImage })
  for (const n of reportPhotoNames(p)) out.push({ slot: `photo:${n}`, what: 'Photo', name: n })
  for (const n of unique(r.uploads.map((u) => u.file))) out.push({ slot: `upload:${n}`, what: 'Uploaded page', name: n })
  return out
}

/** Report photos and custom-sheet pictures (one name once). */
function reportPhotoNames(p: Project): string[] {
  const r = p.report
  if (!r) return []
  return unique([...r.photos.map((x) => x.file), ...r.customSheets.flatMap((s) => s.blocks.flatMap((b) => (b.kind === 'image' ? [b.file] : [])))])
}

interface GroupSpec {
  id: JobFilesGroupId
  what: string
  folderKind: FolderKind | null
  mode: Mode
  names: string[]
  /** Slot of a file picked one by one, by name. */
  slot?: (name: string) => FileSlot
}

/** The groups this job uses, with the file names it keeps. */
function groupSpecs(p: Project): GroupSpec[] {
  const out: GroupSpec[] = []
  if (p.settings.generateOverlayDrawing) {
    const names = unique(p.scanImages.filter((l) => l.include).map((l) => l.imageFile))
    if (names.length) out.push({ id: 'photos', what: 'Scan photos (drawing)', folderKind: 'photos', mode: 'read', names })
  }
  const r = p.report
  if (r) {
    const photos = reportPhotoNames(p)
    if (photos.length) out.push({ id: 'reportPhotos', what: 'Report photos and pictures', folderKind: 'reportPhotos', mode: 'read', names: photos, slot: (n) => `photo:${n}` })
    const shots = unique(r.scanResults.map((s) => s.dataImage))
    if (shots.length) out.push({ id: 'screenshots', what: 'Data-page screenshots', folderKind: 'screenshots', mode: 'read', names: shots })
    if (r.coverPhoto) out.push({ id: 'cover', what: 'Cover photo', folderKind: null, mode: 'read', names: [r.coverPhoto], slot: () => 'coverPhoto' })
    if (r.calibration.dynamicImage) out.push({ id: 'calibration', what: 'Calibration screenshot', folderKind: null, mode: 'read', names: [r.calibration.dynamicImage], slot: () => 'dynamicImage' })
    const uploads = unique(r.uploads.map((u) => u.file))
    if (uploads.length) out.push({ id: 'uploads', what: 'Uploaded pages', folderKind: null, mode: 'read', names: uploads, slot: (n) => `upload:${n}` })
  }
  out.push({ id: 'job', what: 'Job folder (exports are written here)', folderKind: 'job', mode: 'readwrite', names: [] })
  return out
}

async function permission(h: Handle, mode: Mode): Promise<PermissionState> {
  try {
    return (await h.queryPermission?.({ mode })) ?? 'granted'
  } catch {
    return 'denied'
  }
}

/**
 * Every group of files the job uses and where each file stands in this browser. `builtInPhotos`: the drawing photos are
 * the app's own (a job saved from the sample) while no photo folder is chosen.
 */
export async function jobFiles(store: KeyValueStore, p: Project, builtInPhotos = false): Promise<JobFilesGroup[]> {
  const out: JobFilesGroup[] = []
  for (const g of groupSpecs(p)) {
    const waiting: RestoreItem[] = []
    let folder: JobFilesGroup['folder'] = null
    let folderName = ''
    let inFolder: Set<string> | null = null
    if (g.folderKind) {
      const found = await recallFolderFor(store, p.jobId, p.project.projectName, g.folderKind).catch(() => null)
      const h = found && found.from !== 'last' ? found.handle : null
      folder = 'none'
      if (h) {
        folderName = h.name
        if ((await permission(h, g.mode)) !== 'granted') {
          folder = 'waiting'
          waiting.push({ what: folderWhat(g.id), name: h.name, handle: h, mode: g.mode })
        } else {
          try {
            inFolder = new Set((await listFiles(h)).map((n) => n.toLowerCase()))
            folder = 'ready'
          } catch {
            folder = 'lost'
          }
        }
      }
    }
    if (g.id === 'photos' && builtInPhotos && folder === 'none') {
      out.push({ id: g.id, what: g.what, folderKind: g.folderKind, mode: g.mode, folderName: 'Built into the app (sample)', folder, files: g.names.map((name) => ({ name, state: 'ok' })), waiting, state: 'ok' })
      continue
    }
    const files: JobFilesGroup['files'] = []
    for (const name of g.names) {
      if (inFolder?.has(name.toLowerCase())) {
        files.push({ name, state: 'ok' })
        continue
      }
      const h = g.slot ? await recallFile(store, p.jobId, g.slot(name)).catch(() => null) : null
      if (h && h.name.toLowerCase() === name.toLowerCase()) {
        if ((await permission(h, 'read')) !== 'granted') {
          files.push({ name, state: 'waiting' })
          waiting.push({ what: g.id === 'reportPhotos' ? 'Photo' : g.what.replace(/s$/, ''), name, handle: h, mode: 'read' })
          continue
        }
        const readable = await h.getFile().then(() => true, () => false)
        files.push({ name, state: readable ? 'ok' : 'missing' })
        continue
      }
      // In a folder that waits for the OK: not known until then.
      files.push({ name, state: folder === 'waiting' ? 'waiting' : 'missing' })
    }
    const state: JobFilesGroup['state'] = waiting.length ? 'waiting'
      : files.some((f) => f.state === 'missing') || folder === 'lost' ? 'missing'
      : g.id === 'job' && folder === 'none' ? 'notChosen'
      : 'ok'
    out.push({ id: g.id, what: g.what, folderKind: g.folderKind, mode: g.mode, folderName, folder, files, waiting, state })
  }
  return out
}

function folderWhat(id: JobFilesGroupId): string {
  return { photos: 'Photo folder', reportPhotos: 'Report photo folder', screenshots: 'Screenshots folder', job: 'Job folder' }[id as string] ?? 'Folder'
}

/** Everything the job uses that is remembered in this browser and waiting for the browser's OK. */
export async function itemsToRestore(store: KeyValueStore, p: Project): Promise<RestoreItem[]> {
  return (await jobFiles(store, p)).flatMap((g) => g.waiting)
}

/** File names not found in this browser (nothing remembered, moved, or not in the folder), by group. */
export const missingNames = (groups: JobFilesGroup[]) =>
  groups.flatMap((g) => g.files.filter((f) => f.state === 'missing').map((f) => ({ group: g.id, name: f.name })))

/**
 * Asks for each item in turn; call it from a click. Returns those still waiting: the ones refused, and any the browser
 * would not ask about from this click (it may allow only so many questions per click; the next click asks for the rest).
 */
export async function restoreItems(items: RestoreItem[]): Promise<RestoreItem[]> {
  const left: RestoreItem[] = []
  for (const it of items) {
    try {
      if (((await it.handle.requestPermission?.({ mode: it.mode })) ?? 'granted') !== 'granted') left.push(it)
    } catch {
      left.push(it)
    }
  }
  return left
}

/** Told when files were restored or found, so every screen reads its folders and pictures again. */
export const restoreEvents = new EventTarget()
export const notifyRestored = () => restoreEvents.dispatchEvent(new Event('restored'))

// --- Find files -------------------------------------------------------------------------------------------------------

/** How deep the search goes below the picked folder, and when it stops (a whole drive would take too long). */
export const SEARCH_DEPTH = 6
export const SEARCH_FOLDER_LIMIT = 5000
/** Folders never searched: system and program folders that never hold job photos. */
const SKIP = /^(\$recycle\.bin|system volume information|node_modules|\.git|appdata|windows|program files( \(x86\))?|programdata)$/i

interface Found {
  dir: DirectoryHandleLike
  /** File names directly in it, lower case -> as written. */
  files: Map<string, string>
}

/** Every folder under `root` (itself first) with the files directly in it; `onFolder` reports progress. */
export async function folderTree(root: DirectoryHandleLike, onFolder?: (count: number) => void): Promise<{ folders: Found[]; complete: boolean }> {
  const folders: Found[] = []
  let complete = true
  const walk = async (dir: DirectoryHandleLike, level: number) => {
    if (folders.length >= SEARCH_FOLDER_LIMIT) {
      complete = false
      return
    }
    const files = new Map<string, string>()
    const subs: string[] = []
    try {
      for await (const e of dir.values()) {
        if (e.kind === 'file') files.set(e.name.toLowerCase(), e.name)
        else if (!SKIP.test(e.name)) subs.push(e.name)
      }
    } catch {
      return
    }
    folders.push({ dir, files })
    onFolder?.(folders.length)
    if (level >= SEARCH_DEPTH) {
      if (subs.length) complete = false
      return
    }
    for (const s of subs) {
      const sub = await dir.getDirectoryHandle(s).catch(() => null)
      if (sub) await walk(sub, level + 1)
    }
  }
  await walk(root, 0)
  return { folders, complete }
}

const PICTURE = /.(png|jpe?g)$/i
const stem = (name: string) => name.toLowerCase().replace(PICTURE, '')

/**
 * The file in a folder that stands for `name`: the same name (case ignored), or for a picture the same name with another
 * picture extension (S1.jpg for S1.png: a photo saved again as JPEG). null when none.
 */
function fileFor(f: Found, name: string): string | null {
  const exact = f.files.get(name.toLowerCase())
  if (exact) return exact
  if (!PICTURE.test(name)) return null
  const want = stem(name)
  for (const real of f.files.values()) if (PICTURE.test(real) && stem(real) === want) return real
  return null
}

/** The folder holding the most of `names`, and how many (null when none holds any). */
function bestFolder(folders: Found[], names: string[]): { found: Found; count: number } | null {
  let best: { found: Found; count: number } | null = null
  for (const f of folders) {
    const count = names.filter((x) => fileFor(f, x)).length
    if (count > (best?.count ?? 0)) best = { found: f, count }
  }
  return best
}

export interface FindResult {
  /** Files linked by this search. */
  found: number
  /** Names still not found. */
  notFound: string[]
  /** False when the search stopped early (very many folders, or deeper than SEARCH_DEPTH). */
  complete: boolean
  /** Files found under another name (case, or another picture extension): the job's links to change (`renameLinkedFiles`). */
  renames: { from: string; to: string }[]
}

/**
 * Links the files not found in this browser from `root` and its subfolders, by name (case ignored; a picture also by the
 * same name with another picture extension). A group read from a folder (drawing photos, report photos, screenshots) takes
 * the folder holding most of its files, unless its own folder already holds as many; report photos and single files found
 * elsewhere are remembered one by one. Files found under another name come back in `renames`.
 */
export async function findFiles(store: KeyValueStore, p: Project, groups: JobFilesGroup[], root: DirectoryHandleLike, onFolder?: (count: number) => void): Promise<FindResult> {
  const { folders, complete } = await folderTree(root, onFolder)
  const jobName = p.project.projectName
  const specs = new Map(groupSpecs(p).map((g) => [g.id, g]))
  let found = 0
  const notFound: string[] = []
  const renames: { from: string; to: string }[] = []
  const renamed = (from: string, to: string) => {
    if (from !== to && !renames.some((r) => r.from === from)) renames.push({ from, to })
  }
  for (const g of groups) {
    const missing = g.files.filter((f) => f.state === 'missing').map((f) => f.name)
    if (!missing.length) continue
    const spec = specs.get(g.id)!
    let left = missing
    if (g.folderKind) {
      const all = g.files.map((f) => f.name)
      const best = bestFolder(folders, all)
      const ownCount = g.folder === 'ready' ? g.files.filter((f) => f.state === 'ok').length : 0
      if (best && best.count > ownCount) {
        await rememberFolder(store, p.jobId, g.folderKind, best.found.dir, jobName)
        left = []
        for (const n of missing) {
          const real = fileFor(best.found, n)
          if (real) {
            found++
            renamed(n, real)
          } else left.push(n)
        }
      }
    }
    for (const name of left) {
      let hit: { where: Found; real: string } | null = null
      if (spec.slot) for (const f of folders) {
        const real = fileFor(f, name)
        if (real) {
          hit = { where: f, real }
          break
        }
      }
      const h = hit ? ((await hit.where.dir.getFileHandle(hit.real).catch(() => null)) as FileHandleLike | null) : null
      if (h && hit && spec.slot) {
        await rememberFile(store, p.jobId, spec.slot(hit.real), h)
        renamed(name, hit.real)
        found++
      } else notFound.push(name)
    }
  }
  return { found, notFound, complete, renames }
}

/** Changes every link to a file found under another name (drawing photos, report pictures, screenshots, cover, uploads). */
export function renameLinkedFiles(p: Project, renames: { from: string; to: string }[]): Project {
  if (!renames.length) return p
  const to = new Map(renames.map((r) => [r.from, r.to]))
  const n = <T extends string | null>(name: T): T => ((name !== null && to.get(name)) ?? name) as T
  const r = p.report
  return {
    ...p,
    scanImages: p.scanImages.map((l) => (to.has(l.imageFile) ? { ...l, imageFile: n(l.imageFile) } : l)),
    report: r && {
      ...r,
      coverPhoto: n(r.coverPhoto),
      calibration: { ...r.calibration, dynamicImage: n(r.calibration.dynamicImage) },
      photos: r.photos.map((x) => (to.has(x.file) ? { ...x, file: n(x.file) } : x)),
      customSheets: r.customSheets.map((s) => ({ ...s, blocks: s.blocks.map((b) => (b.kind === 'image' && to.has(b.file) ? { ...b, file: n(b.file) } : b)) })),
      scanResults: r.scanResults.map((x) => (x.dataImage && to.has(x.dataImage) ? { ...x, dataImage: n(x.dataImage) } : x)),
      uploads: r.uploads.map((u) => (to.has(u.file) ? { ...u, file: n(u.file) } : u)),
    },
  }
}
