// A folder remembered for the open job (state/folders.ts): the photo folder (read) or the job folder
// (read and write). After reopening or restoring a job, Edge/Chrome need one "Restore" click (the browser asks again);
// other browsers can only read a folder picked with a file input, which is not remembered. A job that comes back with a
// new id finds the folder of a job with the same name; failing that, the last folder used is offered (state/folders.ts).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  folderPermission,
  listFiles,
  pickFolder,
  recallFolderFor,
  rememberFolder,
  requestFolder,
  type DirectoryHandleLike,
  type FolderKind,
} from '../state/folders.ts'
import { restoreEvents } from '../state/restore.ts'
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
  /** Nothing remembered for this job; `suggested` is the last folder used in this browser, offered with one click. */
  | 'suggest'

export interface RememberedFolder {
  status: FolderStatus
  name: string
  handle: DirectoryHandleLike | null
  /** The last folder used in this browser, while status is 'suggest'. */
  suggested: DirectoryHandleLike | null
  /** File names directly in the folder, when ready. */
  files: string[] | null
  /** For reading photos (thumbnails, processing), when ready. */
  photoFolder: PhotoFolder | null
  /** False when the browser has no folder picker (only a file input; nothing is remembered). */
  canPick: boolean
  choose: () => Promise<void>
  allow: () => Promise<void>
  /** Uses the suggested folder (asks the browser first; must be called from a click). */
  useSuggested: () => Promise<void>
  refresh: () => Promise<void>
  /** Uses folder contents picked with a file input (browsers without a folder picker). */
  useInputFolder: (folder: PhotoFolder) => void
}

const hasPicker = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window

export function useRememberedFolder(kind: FolderKind, mode: 'read' | 'readwrite', startIn?: DirectoryHandleLike | null): RememberedFolder {
  const app = useApp()
  const store = app.browserStore
  const jobId = app.state.job!.history.present.jobId
  const jobName = app.state.job!.history.present.project.projectName
  // Read when the job opens and when a folder is kept; renaming the job does not reload the folder.
  const name = useRef(jobName)
  // Before the effect below, which reads it.
  useEffect(() => {
    name.current = jobName
  }, [jobName])
  const [handle, setHandle] = useState<DirectoryHandleLike | null>(null)
  const [suggested, setSuggested] = useState<DirectoryHandleLike | null>(null)
  const [status, setStatus] = useState<FolderStatus>('loading')
  const [files, setFiles] = useState<string[] | null>(null)
  const [inputFolder, setInputFolder] = useState<PhotoFolder | null>(null)
  // "Restore files" (RestoreFilesBar) asked the browser: look again.
  const [restored, setRestored] = useState(0)
  useEffect(() => {
    const again = () => setRestored((n) => n + 1)
    restoreEvents.addEventListener('restored', again)
    return () => restoreEvents.removeEventListener('restored', again)
  }, [])

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
      const found = await recallFolderFor(store, jobId, name.current, kind).catch(() => null)
      if (!alive) return
      setSuggested(null)
      if (!found) {
        setStatus('none')
        return
      }
      if (found.from === 'last') {
        setSuggested(found.handle)
        setStatus('suggest')
        return
      }
      const h = found.handle
      // Found by the job's name: kept for this job too.
      if (found.from === 'name') await rememberFolder(store, jobId, kind, h, name.current).catch(() => {})
      setHandle(h)
      if ((await folderPermission(h, mode)) === 'granted') await open(h)
      else if (alive) setStatus('allow')
    })()
    return () => {
      alive = false
    }
  }, [store, jobId, kind, mode, open, restored])

  const choose = useCallback(async () => {
    const h = await pickFolder({ mode, id: `axisbuilder-${kind}`, startIn: startIn ?? handle ?? undefined })
    if (!h) return
    setSuggested(null)
    await rememberFolder(store, jobId, kind, h, name.current).catch(() => {})
    await open(h)
    // After open: while the status was still 'none' the sample job would put its own photos back.
    setInputFolder(null)
  }, [mode, kind, startIn, handle, store, jobId, open])

  const useSuggested = useCallback(async () => {
    if (!suggested || !(await requestFolder(suggested, mode))) return
    setSuggested(null)
    await rememberFolder(store, jobId, kind, suggested, name.current).catch(() => {})
    await open(suggested)
    setInputFolder(null)
  }, [suggested, mode, store, jobId, kind, open])

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
      status: 'ready', name: inputFolder.name, handle: null, suggested: null, files: inputFolder.names, photoFolder, canPick: hasPicker(),
      choose, allow, useSuggested, refresh, useInputFolder: setInputFolder,
    }
  }
  return {
    status, name: handle?.name ?? '', handle, suggested, files: status === 'ready' ? files : null, photoFolder, canPick: hasPicker(),
    choose, allow, useSuggested, refresh, useInputFolder: setInputFolder,
  }
}
