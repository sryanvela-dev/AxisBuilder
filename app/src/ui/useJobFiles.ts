// The job's files in this browser for the Restore files bar and the Job files panel (state/restore.ts): where each group
// stands, "Restore files" (one click asks for everything waiting) and "Find files..." (search a folder and its subfolders).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { pickFolder, rememberFolder } from '../state/folders.ts'
import {
  findFiles,
  jobFiles,
  missingNames,
  notifyRestored,
  renameLinkedFiles,
  reportFileSlots,
  restoreEvents,
  restoreItems,
  type JobFilesGroup,
} from '../state/restore.ts'
import { useApp } from './appContext.ts'
import { usesSamplePhotos } from './samplePhotos.ts'

export interface JobFiles {
  /** null while being read. */
  groups: JobFilesGroup[] | null
  waitingCount: number
  missingCount: number
  busy: boolean
  /** What the last Restore / Find did, when something is left to say. */
  note: string
  /** Folders searched so far while Find files runs. */
  searched: number
  restore: () => Promise<void>
  find: () => Promise<void>
  /** Chooses the folder of one group (Edge / Chrome folder picker). */
  chooseFolder: (g: JobFilesGroup) => Promise<void>
}

const listNames = (names: string[]) => `${names.slice(0, 6).join(', ')}${names.length > 6 ? ` and ${names.length - 6} more` : ''}`

export function useJobFiles(): JobFiles {
  const app = useApp()
  const store = app.browserStore
  const p = app.state.job!.history.present
  const [groups, setGroups] = useState<JobFilesGroup[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [searched, setSearched] = useState(0)
  // Looked up again when the job or the files it names change, not on every edit.
  const uses = useMemo(
    () => JSON.stringify([
      p.jobId, p.project.projectName, p.settings.generateOverlayDrawing, p.scanImages.map((l) => [l.imageFile, l.include]),
      reportFileSlots(p).map((s) => s.slot), p.report?.scanResults.map((x) => x.dataImage),
    ]),
    [p],
  )
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const again = () => setTick((n) => n + 1)
    restoreEvents.addEventListener('restored', again)
    return () => restoreEvents.removeEventListener('restored', again)
  }, [])
  useEffect(() => {
    let alive = true
    const now = app.state.job!.history.present
    void jobFiles(store, now, app.state.job!.source === 'sample' || usesSamplePhotos(now)).then((g) => alive && setGroups(g), () => {})
    return () => {
      alive = false
    }
    // `uses` stands for the parts of the project read here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, uses, tick])

  const waiting = useMemo(() => (groups ?? []).flatMap((g) => g.waiting), [groups])
  const missing = useMemo(() => missingNames(groups ?? []), [groups])

  const restore = useCallback(async () => {
    setBusy(true)
    const left = await restoreItems(waiting)
    setBusy(false)
    setNote(left.length === 0 ? '' : left.length < waiting.length
      ? 'The browser asked about some of them; click Restore files again for the rest.'
      : 'The browser did not give access. Click Restore files again and choose Allow.')
    notifyRestored()
  }, [waiting])

  const find = useCallback(async () => {
    if (!groups) return
    const root = await pickFolder({ mode: 'read', id: 'axisbuilder-find' })
    if (!root) return
    setBusy(true)
    setSearched(0)
    const res = await findFiles(store, app.state.job!.history.present, groups, root, setSearched).catch(() => null)
    setBusy(false)
    // Found under another name (S1.png for S1.jpg): the job's links follow, one undo step.
    if (res?.renames.length) app.edit(`Link ${res.renames.length} found file${res.renames.length === 1 ? '' : 's'}`, (q) => renameLinkedFiles(q, res.renames))
    if (!res) setNote(`${root.name} could not be searched.`)
    else if (res.notFound.length === 0) setNote(`Found all ${res.found} in ${root.name}.`)
    else {
      setNote(`Found ${res.found} in ${root.name}${res.complete ? ' and its subfolders' : ' (the search stopped early: very many folders; pick a folder closer to the files)'}. ` +
        `Not found: ${listNames(res.notFound)}. Try another folder, or choose them where they are used.`)
    }
    notifyRestored()
  }, [groups, store, app])

  const chooseFolder = useCallback(async (g: JobFilesGroup) => {
    if (!g.folderKind) return
    const h = await pickFolder({ mode: g.mode, id: `axisbuilder-${g.folderKind}` })
    if (!h) return
    await rememberFolder(store, p.jobId, g.folderKind, h, p.project.projectName).catch(() => {})
    notifyRestored()
  }, [store, p.jobId, p.project.projectName])

  return { groups, waitingCount: waiting.length, missingCount: missing.length, busy, note, searched, restore, find, chooseFolder }
}
