// Single files remembered per job in the browser (IndexedDB, not the .axb), like the folders in folders.ts: the report's
// cover photo and dynamic calibration screenshot, picked as a file in one step (user, 2026-10-29: photos are rarely
// named by scan, so picking from a folder list was harder). The job file keeps only the file's name; Edge/Chrome keep the
// file handle, so reopening the job needs one "Allow" click to show (and later print) the picture.

import type { FileHandleLike } from './session.ts'
import type { KeyValueStore } from './storage.ts'

/** Which file of the job: the report's cover photo or its dynamic calibration screenshot. */
export type FileSlot = 'coverPhoto' | 'dynamicImage'

const key = (jobId: string, slot: FileSlot) => `file:${jobId}:${slot}`

export async function rememberFile(store: KeyValueStore, jobId: string, slot: FileSlot, handle: FileHandleLike): Promise<void> {
  await store.set(key(jobId, slot), handle)
}

export async function recallFile(store: KeyValueStore, jobId: string, slot: FileSlot): Promise<FileHandleLike | null> {
  return (await store.get<FileHandleLike>(key(jobId, slot))) ?? null
}

export async function forgetFile(store: KeyValueStore, jobId: string, slot: FileSlot): Promise<void> {
  await store.delete(key(jobId, slot))
}

export const IMAGE_ACCEPT = { 'image/*': ['.png', '.jpg', '.jpeg'] }

/** The file picker for one image (Edge/Chrome); null when cancelled, undefined when the browser has none. */
export async function pickImageFile(id: string): Promise<FileHandleLike | null | undefined> {
  const picker = (window as unknown as { showOpenFilePicker?: (o: object) => Promise<FileHandleLike[]> }).showOpenFilePicker
  if (!picker) return undefined
  try {
    const [h] = await picker.call(window, { id, multiple: false, types: [{ description: 'Pictures', accept: IMAGE_ACCEPT }] })
    return h ?? null
  } catch {
    return null
  }
}
