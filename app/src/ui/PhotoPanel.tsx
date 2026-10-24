// Images step, part 1: the photo folder, matching photos to scans, and the table of which photo each
// scan uses (with the processed file name it gets).

import { useState, type ChangeEvent } from 'react'
import { pieceImageName, processedImageNames } from '../data/imageMatch.ts'
import { drawnScans } from '../engine/layout.ts'
import { circumference, isWrapped, scanPieces } from '../engine/wrap.ts'
import { PHOTO_STATE_TEXT, imageFiles, photoLink, photoState, setPhotoLink, type PhotoState } from '../data/photos.ts'
import { useApp } from './appContext.ts'
import { useJobChecks } from './checksContext.ts'
import { ImageFolderPanel, Thumb } from './ImageFolderPanel.tsx'
import { folderFromInput } from './photoFolder.ts'
import { photoElementId } from './placeIds.ts'
import { useSelection } from './selectionContext.ts'
import type { RememberedFolder } from './useRememberedFolder.ts'

const STATE_KIND: Record<PhotoState, string> = {
  scanOff: 'other', photoOff: 'other', none: 'invalid', found: 'changed', missing: 'invalid', chosen: 'review',
}

/** Folder name, state and the buttons to choose or allow it. */
export function FolderBar(props: { folder: RememberedFolder; label: string; chooseLabel: string; what: string; inputFallback?: boolean }) {
  const f = props.folder
  const inputId = `folder-input-${props.label.replace(/\W/g, '')}`
  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) f.useInputFolder(folderFromInput(e.target.files))
    e.target.value = ''
  }
  return (
    <div className="folder-bar">
      <span className="folder-label">{props.label}:</span>
      {f.status === 'ready' && (
        <span>
          <strong>{f.name}</strong> <span className="muted">({f.files?.length ?? 0} files)</span>
        </span>
      )}
      {f.status === 'none' && <span className="muted">not chosen yet</span>}
      {f.status === 'loading' && <span className="muted">...</span>}
      {f.status === 'allow' && (
        <span>
          <strong>{f.name}</strong> <span className="muted">(the browser asks before {props.what} it again)</span>
        </span>
      )}
      {f.status === 'lost' && (
        <span className="error">
          {f.name} can&apos;t be opened any more (moved, renamed or deleted?). Choose it again.
        </span>
      )}
      <span className="button-row">
        {f.status === 'allow' && (
          <button type="button" className="btn btn-primary" onClick={() => void f.allow()}>
            Allow access to {f.name}
          </button>
        )}
        {f.canPick ? (
          <button type="button" className={f.status === 'none' || f.status === 'lost' ? 'btn btn-primary' : 'btn'} onClick={() => void f.choose()}>
            {f.status === 'ready' || f.status === 'allow' ? 'Choose another folder' : props.chooseLabel}
          </button>
        ) : props.inputFallback ? (
          <>
            <button type="button" className="btn btn-primary" onClick={() => document.getElementById(inputId)?.click()}>
              {props.chooseLabel}
            </button>
            <input id={inputId} type="file" hidden onChange={onInput} {...{ webkitdirectory: '' }} />
          </>
        ) : null}
        {f.status === 'ready' && f.handle && (
          <button type="button" className="btn" onClick={() => void f.refresh()} title="Read the folder again (after adding files)">
            Refresh
          </button>
        )}
      </span>
    </div>
  )
}

export function PhotoPanel({ photos }: { photos: RememberedFolder }) {
  const app = useApp()
  const { checks } = useJobChecks()
  const p = app.state.job!.history.present
  const [matching, setMatching] = useState(false)
  const { selected, select } = useSelection()
  const folder = photos.photoFolder
  const names = folder ? imageFiles(folder.names) : null
  const outNames = processedImageNames(p.scans.map((s) => s.id))
  const drawn = drawnScans(p)
  const C = circumference(p)
  const noneChosen = p.scanImages.every((l) => l.imageFile.trim() === '')
  const showMatch = !!folder && (matching || noneChosen)
  const counts = p.scans.reduce<Record<PhotoState, number>>(
    (acc, s) => {
      acc[photoState(s, photoLink(p, s.id), names).state]++
      return acc
    },
    { scanOff: 0, photoOff: 0, none: 0, found: 0, missing: 0, chosen: 0 },
  )

  return (
    <section className="photo-panel">
      <h2>Photos</h2>
      <p className="muted">
        One photo per scan, showing only the scan area. The folder is remembered for this job in this browser (not in the job file).
      </p>
      <FolderBar folder={photos} label="Photo folder" chooseLabel="Choose photo folder" what="reading" inputFallback />
      {folder && !showMatch && (
        <div className="button-row">
          <button type="button" className="btn" onClick={() => setMatching(true)}>
            Match photos to scans again
          </button>
        </div>
      )}
      {showMatch && folder && (
        <ImageFolderPanel
          key={`${folder.name}|${folder.names.length}|${p.scans.map((s) => s.id).join('|')}`}
          project={p}
          folder={folder}
          onApply={(next) => app.edit('Match photos to scans', () => next)}
          onClose={() => setMatching(false)}
        />
      )}

      <h3>Photo of each scan</h3>
      <p>
        {counts.found + counts.chosen} of {p.scans.length - counts.scanOff} drawn scans have a photo
        {counts.missing ? `, ${counts.missing} chosen but not in the folder` : ''}
        {counts.photoOff ? `, ${counts.photoOff} drawn without one` : ''}.
      </p>
      <div className="table-wrap table-limit-tall">
        <table className="grid photos">
          <thead>
            <tr>
              <th>Scan</th>
              <th>Photo</th>
              <th>Photo file</th>
              <th>State</th>
              <th>Processed image</th>
              <th>Use photo</th>
            </tr>
          </thead>
          <tbody>
            {p.scans.map((s, index) => {
              const link = photoLink(p, s.id)
              const st = photoState(s, link, names)
              const problem = checks.find((c) => c.place.kind === 'photo' && c.place.index === index)
              return (
                <tr
                  key={`${s.id}-${index}`}
                  id={photoElementId(index)}
                  className={[problem ? 'has-messages' : '', selected?.list === 'scans' && selected.index === index ? 'row-selected' : ''].filter(Boolean).join(' ') || undefined}
                  onClick={() => select({ list: 'scans', index })}
                  onFocus={() => select({ list: 'scans', index })}
                >
                  <td>{s.id}</td>
                  <td>{folder ? <Thumb folder={folder} name={st.state === 'found' ? st.file : null} /> : <span className="thumb thumb-empty" />}</td>
                  <td>
                    {names && st.state !== 'scanOff' && st.state !== 'photoOff' ? (
                      <select
                        value={st.state === 'found' ? st.file! : ''}
                        aria-label={`Photo file for ${s.id}`}
                        onChange={(e) => app.edit(`Choose the photo of ${s.id}`, (proj) => setPhotoLink(proj, s.id, { imageFile: e.target.value, include: true }))}
                      >
                        <option value="">{st.state === 'missing' ? `${st.file} (not in folder)` : 'Choose...'}</option>
                        {names.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="value">{link?.imageFile || ''}</span>
                    )}
                  </td>
                  <td>
                    <span className={`kind kind-${STATE_KIND[st.state]}`}>{PHOTO_STATE_TEXT[st.state]}</span>
                    {problem && <div className={`msg msg-${problem.severity}`}>{problem.fix}</div>}
                  </td>
                  <td className="value">
                    {st.state === 'scanOff' || st.state === 'photoOff' ? (
                      <span className="muted">none</span>
                    ) : isWrapped(scanPieces(drawn[index], C)) ? (
                      // Across the seam: one image per piece, each the part of the photo for that piece.
                      <span title="The scan runs across the seam: one image per piece">
                        {pieceImageName(outNames.get(s.id)!, 0)}, {pieceImageName(outNames.get(s.id)!, 1)}
                      </span>
                    ) : (
                      outNames.get(s.id)
                    )}
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={s.include && (link?.include ?? true)}
                      disabled={!s.include}
                      title={s.include ? 'Untick to draw this scan without a photo' : 'The scan is not drawn (AUT scans step)'}
                      aria-label={`Use a photo for ${s.id}`}
                      onChange={(e) =>
                        app.edit(`${e.target.checked ? 'Use' : "Don't use"} a photo for ${s.id}`, (proj) => setPhotoLink(proj, s.id, { include: e.target.checked }))
                      }
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
