// "Restore files": after a job is reopened or restored, Chrome and Edge ask once more before the app may read the folders
// and files remembered for it (folders.ts, files.ts). This lists everything the job uses that is waiting for that OK and
// asks for all of it from one click, so the drawing's photos and the report's pictures come back together.

import type { Project } from '../data/schema.ts'
import { recallFolder, type DirectoryHandleLike, type FolderKind } from './folders.ts'
import { recallFile, type FileSlot } from './files.ts'
import type { FileHandleLike } from './session.ts'
import type { KeyValueStore } from './storage.ts'

export interface RestoreItem {
  /** What it is, for the bar ("Photo folder", "Cover photo", ...). */
  what: string
  name: string
  handle: DirectoryHandleLike | FileHandleLike
  mode: 'read' | 'readwrite'
}

const FOLDERS: { kind: FolderKind; what: string; mode: 'read' | 'readwrite'; used: (p: Project) => boolean }[] = [
  { kind: 'photos', what: 'Photo folder', mode: 'read', used: (p) => p.settings.generateOverlayDrawing && p.scanImages.some((l) => l.imageFile) },
  { kind: 'job', what: 'Job folder', mode: 'readwrite', used: () => true },
  { kind: 'reportPhotos', what: 'Report photo folder', mode: 'read', used: (p) => p.report !== null },
  { kind: 'screenshots', what: 'Screenshots folder', mode: 'read', used: (p) => p.report !== null },
]

/** The report's files picked one by one (not from a folder): slot, what it is, the file name the job keeps. */
export function reportFileSlots(p: Project): { slot: FileSlot; what: string; name: string }[] {
  const r = p.report
  if (!r) return []
  const out: { slot: FileSlot; what: string; name: string }[] = []
  if (r.coverPhoto) out.push({ slot: 'coverPhoto', what: 'Cover photo', name: r.coverPhoto })
  if (r.calibration.dynamicImage) out.push({ slot: 'dynamicImage', what: 'Calibration screenshot', name: r.calibration.dynamicImage })
  for (const ph of r.photos) out.push({ slot: `photo:${ph.file}`, what: 'Photo', name: ph.file })
  for (const sh of r.customSheets) for (const b of sh.blocks) if (b.kind === 'image') out.push({ slot: `photo:${b.file}`, what: 'Picture', name: b.file })
  for (const u of r.uploads) out.push({ slot: `upload:${u.file}`, what: 'Uploaded page', name: u.file })
  const seen = new Set<string>()
  return out.filter((x) => (seen.has(x.slot) ? false : (seen.add(x.slot), true)))
}

async function permission(h: RestoreItem['handle'], mode: 'read' | 'readwrite'): Promise<PermissionState> {
  try {
    return (await h.queryPermission?.({ mode })) ?? 'granted'
  } catch {
    return 'denied'
  }
}

/** Everything the job uses that is remembered in this browser and waiting for the browser's OK. */
export async function itemsToRestore(store: KeyValueStore, p: Project): Promise<RestoreItem[]> {
  const out: RestoreItem[] = []
  for (const f of FOLDERS) {
    if (!f.used(p)) continue
    const h = await recallFolder(store, p.jobId, f.kind).catch(() => null)
    if (h && (await permission(h, f.mode)) !== 'granted') out.push({ what: f.what, name: h.name, handle: h, mode: f.mode })
  }
  for (const s of reportFileSlots(p)) {
    const h = await recallFile(store, p.jobId, s.slot).catch(() => null)
    if (h && h.name === s.name && (await permission(h, 'read')) !== 'granted') out.push({ what: s.what, name: h.name, handle: h, mode: 'read' })
  }
  return out
}

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

/** Told when files were restored, so every screen reads its folders and pictures again. */
export const restoreEvents = new EventTarget()
export const notifyRestored = () => restoreEvents.dispatchEvent(new Event('restored'))
