// Folders remembered per job in the browser (IndexedDB, not the .axb): the photo folder, the report's folders and the job
// folder that Processed_Images is written into. Edge/Chrome keep the folder handle, so reopening the
// job needs one "allow" click instead of picking the folder again.

import type { KeyValueStore } from './storage.ts'

/** 'reportPhotos' and 'screenshots' are the report's (photos and cover photo, data-page and calibration screenshots). */
export type FolderKind = 'photos' | 'job' | 'reportPhotos' | 'screenshots'

/** A folder from the File System Access API. Kept loose so tests can fake it. */
export interface DirectoryHandleLike {
  readonly kind: 'directory'
  readonly name: string
  values(): AsyncIterable<{ kind: 'file' | 'directory'; name: string }>
  getFileHandle(name: string, options?: { create?: boolean }): Promise<{
    getFile(): Promise<File>
    createWritable(): Promise<{ write(data: Blob | string): Promise<void>; close(): Promise<void> }>
  }>
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandleLike>
  queryPermission?(options: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
  requestPermission?(options: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
}

const key = (jobId: string, kind: FolderKind) => `folder:${jobId}:${kind}`

export async function rememberFolder(store: KeyValueStore, jobId: string, kind: FolderKind, handle: DirectoryHandleLike): Promise<void> {
  await store.set(key(jobId, kind), handle)
}

export async function recallFolder(store: KeyValueStore, jobId: string, kind: FolderKind): Promise<DirectoryHandleLike | null> {
  return (await store.get<DirectoryHandleLike>(key(jobId, kind))) ?? null
}

export async function forgetFolder(store: KeyValueStore, jobId: string, kind: FolderKind): Promise<void> {
  await store.delete(key(jobId, kind))
}

/** 'granted', or 'prompt' when the user has to click "Allow" first, or 'denied'. */
export async function folderPermission(handle: DirectoryHandleLike, mode: 'read' | 'readwrite'): Promise<PermissionState> {
  try {
    return (await handle.queryPermission?.({ mode })) ?? 'granted'
  } catch {
    return 'denied'
  }
}

/** Asks for access (must be called from a click). */
export async function requestFolder(handle: DirectoryHandleLike, mode: 'read' | 'readwrite'): Promise<boolean> {
  try {
    return ((await handle.requestPermission?.({ mode })) ?? 'granted') === 'granted'
  } catch {
    return false
  }
}

/** Names of the files directly in the folder (no subfolders), sorted. */
export async function listFiles(handle: DirectoryHandleLike): Promise<string[]> {
  const out: string[] = []
  for await (const e of handle.values()) if (e.kind === 'file') out.push(e.name)
  return out.sort((a, b) => a.localeCompare(b))
}

/** Folder picker (Edge/Chrome); null when cancelled, undefined when the browser has none. */
export async function pickFolder(options: { mode: 'read' | 'readwrite'; id: string; startIn?: DirectoryHandleLike }): Promise<DirectoryHandleLike | null | undefined> {
  const picker = (window as unknown as { showDirectoryPicker?: (o: object) => Promise<DirectoryHandleLike> }).showDirectoryPicker
  if (!picker) return undefined
  try {
    return await picker.call(window, { mode: options.mode, id: options.id, ...(options.startIn ? { startIn: options.startIn } : {}) })
  } catch {
    return null
  }
}
