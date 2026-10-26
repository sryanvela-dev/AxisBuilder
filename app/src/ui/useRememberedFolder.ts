// A folder remembered for the open job (state/folders.ts): the photo folder (read) or the job folder
// (read and write). After reopening a job, Edge/Chrome need one "Allow" click; other browsers can
// only read a folder picked with a file input, which is not remembered.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  folderPermission,
  listFiles,
  pickFolder,
  recallFolder,
  rememberFolder,
  requestFolder,
  type DirectoryHandleLike,
  type FolderKind,
} from '../state/folders.ts'
import { useApp } from './appContext.ts'
import type { PhotoFolder } from './photoFolder.ts'

export type FolderStatus =
  | 'loading'
  /** Nothing chosen yet. */
  | 'none'
  /** Remembered; the browser needs an "Allow" click. */
  | 'allow'
  | 'ready'
  /** Remembered, but it can't be opened any more (moved, renamed or deleted). */
  | 'lost'

export interface RememberedFolder {
  status: FolderStatus
  name: string
  handle: DirectoryHandleLike | null
  /** File names directly in the folder, when ready. */
  files: string[] | null
  /** For reading photos (thumbnails, processing), when ready. */
  photoFolder: PhotoFolder | null
  /** False when the browser has no folder picker (only a file input; nothing is remembered). */
  canPick: boolean
  choose: () => Promise<void>
  allow: () => Promise<void>
  refresh: () => Promise<void>
  /** Uses folder contents picked with a file input (browsers without a folder picker). */
  useInputFolder: (folder: PhotoFolder) => void
}

const hasPicker = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window

export function useRememberedFolder(kind: FolderKind, mode: 'read' | 'readwrite', startIn?: DirectoryHandleLike | null): RememberedFolder {
  const app = useApp()
  const store = app.browserStore
  const jobId = app.state.job!.history.present.jobId
  const [handle, setHandle] = useState<DirectoryHandleLike | null>(null)
  const [status, setStatus] = useState<FolderStatus>('loading')
  const [files, setFiles] = useState<string[] | null>(null)
  const [inputFolder, setInputFolder] = useState<PhotoFolder | null>(null)

  const open = useCallback(async (h: DirectoryHandleLike) => {
    setHandle(h)
    try {
      setFiles(await listFiles(h))
      setStatus('ready')
    } catch {
      setFiles(null)
      setStatus('lost')
    }
  }, [])

  useEffect(() => {
    let alive = true
    void (async () => {
      const h = await recallFolder(store, jobId, kind).catch(() => null)
      if (!alive) return
      if (!h) {
        setStatus('none')
        return
      }
      setHandle(h)
      if ((await folderPermission(h, mode)) === 'granted') await open(h)
      else if (alive) setStatus('allow')
    })()
    return () => {
      alive = false
    }
  }, [store, jobId, kind, mode, open])

  const choose = useCallback(async () => {
    const h = await pickFolder({ mode, id: `axisbuilder-${kind}`, startIn: startIn ?? handle ?? undefined })
    if (!h) return
    setInputFolder(null)
    await rememberFolder(store, jobId, kind, h).catch(() => {})
    await open(h)
  }, [mode, kind, startIn, handle, store, jobId, open])

  const allow = useCallback(async () => {
    if (handle && (await requestFolder(handle, mode))) await open(handle)
  }, [handle, mode, open])

  const refresh = useCallback(async () => {
    if (handle && status === 'ready') await open(handle)
  }, [handle, status, open])

  // One object per folder listing, so thumbnails are not reloaded on every render.
  const photoFolder = useMemo<PhotoFolder | null>(() => {
    if (inputFolder) return inputFolder
    if (status !== 'ready' || !handle || !files) return null
    return {
      name: handle.name,
      names: files,
      getFile: async (n) => {
        try {
          return await (await handle.getFileHandle(n)).getFile()
        } catch {
          return null
        }
      },
    }
  }, [inputFolder, status, handle, files])

  if (inputFolder) {
    return {
      status: 'ready', name: inputFolder.name, handle: null, files: inputFolder.names, photoFolder, canPick: hasPicker(),
      choose, allow, refresh, useInputFolder: setInputFolder,
    }
  }
  return { status, name: handle?.name ?? '', handle, files: status === 'ready' ? files : null, photoFolder, canPick: hasPicker(), choose, allow, refresh, useInputFolder: setInputFolder }
}
