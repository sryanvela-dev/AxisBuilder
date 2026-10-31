// One picture picked as a file in one step (the cover photo, the dynamic calibration screenshot): "Choose photo..." opens
// the file picker, whatever the file is called. The job keeps the file's name; this browser keeps the file (state/files.ts)
// to show it, and after reopening the job asks for one "Allow" click. Other browsers can still pick it for this session.

import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import type { Project } from '../../data/schema.ts'
import { forgetFile, pickImageFile, recallFile, rememberFile, type FileSlot } from '../../state/files.ts'
import { pickWithInput } from '../../state/projectFiles.ts'
import type { FileHandleLike } from '../../state/session.ts'
import type { ImagePlace } from '../../report/imageItems.ts'
import type { ImageRef } from '../../report/pageModel.ts'
import { useApp } from '../appContext.ts'
import { CropButton } from './PictureWindow.tsx'

type Status = 'loading' | 'none' | 'allow' | 'ready' | 'lost'

/** The remembered file of a slot: its handle (Edge/Chrome) or a file picked this session, and the picture to show. */
function useRememberedFile(slot: FileSlot) {
  const app = useApp()
  const store = app.browserStore
  const jobId = app.state.job!.history.present.jobId
  const [handle, setHandle] = useState<FileHandleLike | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<Status>('loading')

  const open = useCallback(async (h: FileHandleLike) => {
    setHandle(h)
    try {
      setFile(await h.getFile())
      setStatus('ready')
    } catch {
      setFile(null)
      setStatus('lost')
    }
  }, [])

  useEffect(() => {
    let alive = true
    void (async () => {
      const h = await recallFile(store, jobId, slot).catch(() => null)
      if (!alive) return
      if (!h) {
        setStatus('none')
        return
      }
      setHandle(h)
      let perm: PermissionState = 'granted'
      try {
        perm = (await h.queryPermission?.({ mode: 'read' })) ?? 'granted'
      } catch {
        perm = 'denied'
      }
      if (!alive) return
      if (perm === 'granted') await open(h)
      else setStatus('allow')
    })()
    return () => {
      alive = false
    }
  }, [store, jobId, slot, open])

  /** Opens the file picker; the picked file's name, or null when cancelled. */
  const choose = useCallback(async (): Promise<string | null> => {
    const h = await pickImageFile(`axisbuilder-${slot}`)
    if (h === null) return null
    if (h === undefined) {
      const f = await pickWithInput('image/png,image/jpeg')
      if (!f) return null
      setHandle(null)
      setFile(f)
      setStatus('ready')
      return f.name
    }
    await rememberFile(store, jobId, slot, h).catch(() => {})
    await open(h)
    return h.name
  }, [slot, store, jobId, open])

  const allow = useCallback(async () => {
    if (!handle) return
    try {
      if (((await handle.requestPermission?.({ mode: 'read' })) ?? 'granted') === 'granted') await open(handle)
    } catch {
      setStatus('lost')
    }
  }, [handle, open])

  const forget = useCallback(async () => {
    await forgetFile(store, jobId, slot).catch(() => {})
    setHandle(null)
    setFile(null)
    setStatus('none')
  }, [store, jobId, slot])

  return { status, name: file?.name ?? handle?.name ?? null, file, choose, allow, forget }
}

export function PhotoPick(props: { label: string; slot: FileSlot; value: string | null; set: (p: Project, name: string | null) => Project; help?: string; crop?: { at: ImagePlace; picture: ImageRef } }) {
  const app = useApp()
  const id = useId()
  const f = useRememberedFile(props.slot)
  const value = props.value
  // The remembered file is this value's (a different name: the job was given another file elsewhere, or undo).
  const same = value !== null && f.name !== null && f.name.toLowerCase() === value.toLowerCase()
  const url = useMemo(() => (same && f.file ? URL.createObjectURL(f.file) : ''), [same, f.file])
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url)
  }, [url])

  async function choose() {
    const name = await f.choose()
    if (name !== null) app.edit(`Change ${props.label}`, (p) => props.set(p, name))
  }
  async function remove() {
    app.edit(`Remove ${props.label}`, (p) => props.set(p, null))
    await f.forget()
  }

  return (
    <div className="field photo-pick">
      <span className="field-label" id={`${id}-label`}>
        {props.label}
      </span>
      <div className="photo-pick-row">
        {url ? <img className="photo-pick-img" src={url} alt={value ?? ''} /> : <span className="photo-pick-img photo-pick-empty" aria-hidden="true" />}
        <div className="photo-pick-side">
          {value === null ? (
            <span className="muted">No picture chosen.</span>
          ) : (
            <strong className="photo-pick-name">{value}</strong>
          )}
          {value !== null && !same && f.status !== 'allow' && f.status !== 'loading' && (
            <span className="muted">Not on this computer's list: choose it again to see it here.</span>
          )}
          {value !== null && same && f.status === 'allow' && <span className="muted">The browser asks before showing it again.</span>}
          {f.status === 'lost' && same && <span className="msg msg-warning">It can't be opened any more (moved, renamed or deleted?). Choose it again.</span>}
          <div className="button-row">
            {value !== null && same && f.status === 'allow' && (
              <button type="button" className="btn btn-primary" onClick={() => void f.allow()}>
                Allow access
              </button>
            )}
            <button type="button" className={value === null ? 'btn btn-primary' : 'btn'} onClick={() => void choose()} aria-describedby={`${id}-label`}>
              {value === null ? 'Choose picture...' : 'Choose another...'}
            </button>
            {value !== null && props.crop && <CropButton at={props.crop.at} picture={props.crop.picture} name={props.label.toLowerCase()} />}
            {value !== null && (
              <button type="button" className="btn" onClick={() => void remove()}>
                Remove
              </button>
            )}
          </div>
          {props.help && <p className="field-help muted">{props.help}</p>}
        </div>
      </div>
    </div>
  )
}
