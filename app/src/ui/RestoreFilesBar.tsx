// The "Restore files" bar under the top bar, in the drawing and the report (state/restore.ts): shown while folders or files
// the job uses are waiting for the browser's OK after the job was reopened or restored. One click asks for all of them.

import { useEffect, useMemo, useState } from 'react'
import { itemsToRestore, notifyRestored, reportFileSlots, restoreEvents, restoreItems, type RestoreItem } from '../state/restore.ts'
import { useApp } from './appContext.ts'

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

export function RestoreFilesBar() {
  const app = useApp()
  const store = app.browserStore
  const p = app.state.job!.history.present
  const [items, setItems] = useState<RestoreItem[]>([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  // Looked up again when the job or the files it uses change, not on every edit.
  const uses = useMemo(
    () => JSON.stringify([p.jobId, p.settings.generateOverlayDrawing && p.scanImages.some((l) => l.imageFile), p.report !== null, reportFileSlots(p).map((s) => s.slot)]),
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
    void itemsToRestore(store, app.state.job!.history.present).then((list) => alive && setItems(list)).catch(() => {})
    return () => {
      alive = false
    }
    // `uses` stands for the parts of the project read here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, uses, tick])

  if (items.length === 0) return null
  const folders = items.filter((i) => i.handle.kind === 'directory').length
  const files = items.length - folders
  const what = [folders ? plural(folders, 'folder') : '', files ? plural(files, 'file') : ''].filter(Boolean).join(' and ')
  const restore = async () => {
    setBusy(true)
    const left = await restoreItems(items)
    setBusy(false)
    notifyRestored()
    setNote(left.length === 0 ? '' : left.length < items.length
      ? 'The browser asked about some of them; click again for the rest.'
      : 'The browser did not give access. Click again, or choose the files again where they are used.')
  }
  return (
    <div className="restore-bar" role="status">
      <span>
        <strong>{what} from this computer</strong> {items.length === 1 ? 'is' : 'are'} waiting for the browser&apos;s OK, as after every
        reopen: {items.map((i) => `${i.what} ${i.name}`).join(', ')}.{note && <> {note}</>}
      </span>
      <button type="button" className="btn btn-primary btn-small" disabled={busy} onClick={() => void restore()}
        title="The browser asks once for each folder and each file picked on its own; choose Allow (or Allow on every visit)">
        Restore files
      </button>
    </div>
  )
}
