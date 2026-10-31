// Photos and pages, R3 minimum (design "Photos: markup, crop, labels"): the report's photos from the report photo
// folder or picked as files, each with its thumbnail (phone orientation applied), caption, "own page", a quarter turn
// left or right, moved by the arrows or by dragging the handle (as Manual UT rows), removed; and Photos per page of
// each photo section. The crop tool, custom sheets, reference pages and markup come later (R4 / R5).

import { useMemo, useState } from 'react'
import { IMAGE_EXTENSIONS } from '../../data/imageMatch.ts'
import { addPhotos, dropTarget, movePhotoTo, removePhoto, rotatePhoto, setPhoto, setPhotosPerPage } from '../../report/edits.ts'
import { PHOTOS_PER_PAGE, type PhotosPerPage } from '../../report/schema.ts'
import { templateOf } from '../../report/templates/registry.ts'
import { IMAGE_ACCEPT, rememberFile } from '../../state/files.ts'
import type { FileHandleLike } from '../../state/session.ts'
import { plural } from '../../state/steps.ts'
import { useApp } from '../appContext.ts'
import { Thumb } from '../ImageFolderPanel.tsx'
import { ReportBox, ReportCheckbox, ReportSelect } from './boxes.tsx'
import { ReportFolderBar } from './FilePick.tsx'
import { perPageOf } from '../../report/pages/photos.ts'
import { photoSlot, refKey } from './reportFiles.ts'
import { useReport } from './reportContext.ts'
import { ReportStepIssues, type ReportStepProps } from './ReportWorkspace.tsx'

const STEP = 'pages' as const
const isImage = (name: string) => (IMAGE_EXTENSIONS as readonly string[]).includes(name.split('.').pop()?.toLowerCase() ?? '')
const PER_PAGE_LABEL: Record<string, string> = { auto: 'Automatic', 1: '1 (each photo fills the page)', 2: '2 side by side', 4: '4 (2 x 2)' }

/** The file picker for several pictures (Edge/Chrome); [] when cancelled, undefined when the browser has none. */
async function pickImageFiles(): Promise<FileHandleLike[] | undefined> {
  const picker = (window as unknown as { showOpenFilePicker?: (o: object) => Promise<FileHandleLike[]> }).showOpenFilePicker
  if (!picker) return undefined
  try {
    return await picker.call(window, { id: 'axisbuilder-report-photos', multiple: true, types: [{ description: 'Pictures', accept: IMAGE_ACCEPT }] })
  } catch {
    return []
  }
}

export function PhotosStep({ status }: ReportStepProps) {
  const app = useApp()
  const p = app.state.job!.history.present
  const report = p.report!
  const template = templateOf(report.templateId)
  const { photos: folder, pages } = useReport()
  const [adding, setAdding] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const photoSections = template.sections.filter((s) => s.pageType === 'photos')

  async function chooseFiles() {
    setNote(null)
    const handles = await pickImageFiles()
    if (handles === undefined) {
      setNote('This browser can only add photos from the report photo folder: choose the folder above, then "Add photos from the folder".')
      return
    }
    if (handles.length === 0) return
    for (const h of handles) await rememberFile(app.browserStore, p.jobId, photoSlot(h.name), h).catch(() => {})
    app.edit(`Add ${plural(handles.length, 'photo')}`, (q) => addPhotos(q, handles.map((h) => h.name)))
    pages.retry()
  }

  return (
    <>
      <ReportStepIssues status={status} />
      <section aria-labelledby="photos-head">
        <h2 id="photos-head">Photos</h2>
        <p className="muted">
          Photos print in this order, each keeping its shape, with its caption under it. Phone photos stored sideways print upright; turn one by hand
          with ⟲ / ⟳. Files are linked by name, never copied into the job file.
        </p>
        <ReportFolderBar folder={folder} label="Report photo folder" />
        <div className="button-row">
          <button type="button" className="btn" disabled={folder.status !== 'ready'} onClick={() => setAdding(!adding)}>
            {adding ? 'Close the folder list' : 'Add photos from the folder'}
          </button>
          <button type="button" className="btn" onClick={() => void chooseFiles()} title="Pick photo files from anywhere (Edge / Chrome remember them for this job)">
            Choose photo files...
          </button>
        </div>
        {note && <p className="msg msg-warning">{note}</p>}
        {adding && folder.photoFolder && <AddFromFolder onDone={() => setAdding(false)} />}
        {photoSections.map((s) => (
          <ReportSelect key={s.id} label={photoSections.length > 1 ? `Photos per page (${s.title})` : 'Photos per page'} step={STEP} boxKey={`report.photosPerPage.${s.id}`}
            value={String(perPageOf(report, s.id, s.options?.perPage))}
            options={PHOTOS_PER_PAGE.map((v) => ({ value: String(v), label: PER_PAGE_LABEL[String(v)] }))}
            set={(q, v: string) => setPhotosPerPage(q, s.id, (v === 'auto' ? 'auto' : Number(v)) as PhotosPerPage)}
            help="Automatic: two photos share a page side by side when both still print at a good size (two portraits always do); otherwise a photo has the page to itself." />
        ))}
        <PhotoTable />
      </section>
      <section aria-labelledby="pages-later">
        <h2 id="pages-later">More pages</h2>
        <p className="coming-soon">
          Coming later: cropping photos and marking them up (arrows, boxes, labels), custom sheets, reference pages from pictures or PDFs, and which drawings go
          in. The Drawings section prints the rollout, the scan overlay and any section sheets for now.
        </p>
      </section>
    </>
  )
}

function AddFromFolder({ onDone }: { onDone: () => void }) {
  const app = useApp()
  const p = app.state.job!.history.present
  const { photos: folder, pages } = useReport()
  const have = useMemo(() => new Set(p.report!.photos.map((x) => x.file.toLowerCase())), [p.report])
  const files = (folder.files ?? []).filter((f) => isImage(f) && !have.has(f.toLowerCase()))
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const add = (list: string[]) => {
    if (list.length) app.edit(`Add ${plural(list.length, 'photo')}`, (q) => addPhotos(q, list))
    pages.retry()
    onDone()
  }
  if (files.length === 0) return <p className="muted">Every picture in {folder.name} is in the list already.</p>
  return (
    <div className="photo-picker">
      <p className="muted">
        {plural(files.length, 'picture')} in {folder.name} not in the report yet. Tick the ones to add (they go to the end of the list).
      </p>
      <ul className="photo-pick-list">
        {files.map((f) => (
          <li key={f}>
            <label>
              <input type="checkbox" checked={picked.has(f)} onChange={() => setPicked((s) => {
                const n = new Set(s)
                if (n.has(f)) n.delete(f)
                else n.add(f)
                return n
              })} />
              <Thumb folder={folder.photoFolder!} name={f} />
              <span>{f}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="button-row">
        <button type="button" className="btn btn-primary" disabled={picked.size === 0} onClick={() => add(files.filter((f) => picked.has(f)))}>
          Add {picked.size ? plural(picked.size, 'photo') : 'the ticked photos'}
        </button>
        <button type="button" className="btn" onClick={() => add(files)}>
          Add all {files.length}
        </button>
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function PhotoTable() {
  const app = useApp()
  const p = app.state.job!.history.present
  const list = p.report!.photos
  const { pages } = useReport()
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [drop, setDrop] = useState<{ index: number; below: boolean } | null>(null)
  const endDrag = () => {
    setDragFrom(null)
    setDrop(null)
  }
  const dropHere = () => {
    const to = dragFrom !== null && drop ? dropTarget(dragFrom, drop.index, drop.below) : null
    if (to !== null) app.edit('Move a photo', (q) => movePhotoTo(q, dragFrom!, to))
    endDrag()
  }
  if (list.length === 0) return <p className="muted">No photos yet. Add them from the report photo folder or choose photo files.</p>
  return (
    <table className="grid photo-list">
      <thead>
        <tr>
          <th className="num">#</th>
          <th>Photo</th>
          <th>Caption</th>
          <th>Own page</th>
          <th>Turn, order</th>
        </tr>
      </thead>
      <tbody>
        {list.map((ph, i) => {
          const pic = pages.pictures.get(refKey({ source: 'photos', file: ph.file }))
          const turned = ph.rotate === 90 || ph.rotate === 270
          const mark = drop?.index === i && dragFrom !== null ? (drop.below ? 'drop-below' : 'drop-above') : ''
          const label = `photo ${i + 1} (${ph.file})`
          return (
            <tr key={`${ph.file}-${i}`} id={`report-photo-${i}`} className={[dragFrom === i ? 'row-dragging' : '', mark].filter(Boolean).join(' ') || undefined}
              onDragOver={(e) => {
                e.preventDefault()
                const box = e.currentTarget.getBoundingClientRect()
                const below = e.clientY > box.top + box.height / 2
                if (dragFrom !== null && (drop?.index !== i || drop.below !== below)) setDrop({ index: i, below })
              }}
              onDrop={(e) => {
                e.preventDefault()
                dropHere()
              }}>
              <td className="num row-no">
                <span className="drag-cell">
                  <span className="drag-handle" draggable title="Drag to move this photo up or down" aria-hidden="true"
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/plain', String(i))
                      const tr = e.currentTarget.closest('tr')
                      if (tr) e.dataTransfer.setDragImage(tr, 16, 16)
                      setDragFrom(i)
                    }}
                    onDragEnd={endDrag}>
                    ⠿
                  </span>
                  {i + 1}
                </span>
              </td>
              <td>
                <span className="photo-cell">
                  {pic ? (
                    <img className="photo-thumb" src={pic.thumb} alt="" style={ph.rotate ? { transform: `rotate(${ph.rotate}deg)${turned ? ' scale(0.75)' : ''}` } : undefined} />
                  ) : (
                    <span className="photo-thumb thumb-empty" title={pic === null ? 'Not found in the report photo folder or the photo files picked' : 'Reading...'} />
                  )}
                  <span className="muted">{ph.file}{pic === null ? ' (not found)' : ''}</span>
                </span>
              </td>
              <td className="photo-caption">
                <ReportBox compact label="Caption" where={`Photo ${i + 1}, caption`} value={ph.caption} placeholder="e.g. North side of the vessel"
                  set={(q, v: string) => setPhoto(q, i, { caption: v })} boxKey={`report.photo.${i}.caption`} step={STEP} />
              </td>
              <td>
                <ReportCheckbox compact label="Own page" where={`Photo ${i + 1}, own page`} value={ph.alone} set={(q, v: boolean) => setPhoto(q, i, { alone: v })}
                  boxKey={`report.photo.${i}.alone`} step={STEP} help="Prints alone on its page, full size." />
              </td>
              <td>
                <span className="button-row row-buttons">
                  <button type="button" className="icon-btn" onClick={() => app.edit('Turn a photo left', (q) => rotatePhoto(q, i, 'left'))} aria-label={`Turn ${label} left`} title="Turn left (a quarter, anticlockwise)">⟲</button>
                  <button type="button" className="icon-btn" onClick={() => app.edit('Turn a photo right', (q) => rotatePhoto(q, i, 'right'))} aria-label={`Turn ${label} right`} title="Turn right (a quarter, clockwise)">⟳</button>
                  <button type="button" className="icon-btn" onClick={() => app.edit('Move a photo', (q) => movePhotoTo(q, i, i - 1))} disabled={i === 0} aria-label={`Move ${label} up`} title="Move up">↑</button>
                  <button type="button" className="icon-btn" onClick={() => app.edit('Move a photo', (q) => movePhotoTo(q, i, i + 1))} disabled={i === list.length - 1} aria-label={`Move ${label} down`} title="Move down">↓</button>
                  <button type="button" className="icon-btn icon-danger" onClick={() => app.edit('Remove a photo', (q) => removePhoto(q, i))} aria-label={`Remove ${label}`} title="Remove from the report (the file stays)">✕</button>
                </span>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
