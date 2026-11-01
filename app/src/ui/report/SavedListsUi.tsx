// Saved lists on screen (design 4.10): "Pick saved..." and "Save to list" next to a record (examiner, AUT system,
// transducer, scanner, calibration block), and the Saved lists dialog to edit, delete, export and import them. The lists
// are this computer's (report/savedLists.ts); picking copies the values into the job.

import { useState } from 'react'
import {
  RECORD_LISTS,
  RECORD_LIST_IDS,
  SAVED_LISTS_FILE_NAME,
  STRING_LISTS,
  STRING_LIST_IDS,
  addRecord,
  listsFromFile,
  listsToFile,
  mergeLists,
  removeRecord,
  removeString,
  renameString,
  toRecord,
  updateRecord,
  type RecordListId,
  type SavedRecord,
} from '../../report/savedLists.ts'
import { pickWithInput } from '../../state/projectFiles.ts'
import { useReport } from './reportContext.ts'

/** "a transducer", "an examiner", "an AUT system". */
const an = (w: string) => `${/^[aeiou]/i.test(w) ? 'an' : 'a'} ${w}`

/** "Pick saved..." (fills every field of the record) and "Save to list" (adds the current values). */
export function RecordPicker<K extends RecordListId>(props: { list: K; current: object; onPick: (rec: SavedRecord<K>) => void; label?: string; pickOnly?: boolean }) {
  const { savedLists, changeLists } = useReport()
  const meta = RECORD_LISTS[props.list]
  const saved = savedLists.records[props.list] as SavedRecord<K>[]
  const rec = toRecord(props.list, props.current)
  const blank = Object.values(rec).every((v) => v === '' || v === null)
  const already = saved.some((s) => JSON.stringify(toRecord(props.list, s)).toLowerCase() === JSON.stringify(rec).toLowerCase())
  return (
    <span className="record-picker">
      <select
        value=""
        aria-label={`Pick a saved ${meta.one}${props.label ? ` for ${props.label}` : ''}`}
        title={saved.length ? `Fill in ${an(meta.one)} saved on this computer` : `No ${meta.one} saved on this computer yet`}
        disabled={saved.length === 0}
        onChange={(e) => {
          const i = Number(e.target.value)
          if (e.target.value !== '' && saved[i]) props.onPick(saved[i])
        }}
      >
        <option value="">Pick saved {meta.one}...</option>
        {saved.map((s, i) => (
          <option key={i} value={i}>
            {meta.title(s as Record<string, unknown>)}
          </option>
        ))}
      </select>
      {!props.pickOnly && <button type="button" className="btn btn-small" disabled={blank || already} onClick={() => changeLists((l) => addRecord(l, props.list, props.current))}
        title={already ? `Already saved on this computer` : blank ? 'Fill something in first' : `Keep these values on this computer for the next job`}>
        {already ? 'Saved' : 'Save to list'}
      </button>}
    </span>
  )
}

const FIELD_OPTIONS: Record<string, readonly string[]> = {
  element: ['', 'Single', 'Dual'],
  drive: ['', 'Automated', 'Manual'],
  wheelsDirection: ['', 'Horizontal', 'Vertical'],
  armDirection: ['', 'Horizontal', 'Vertical'],
}

const fieldName = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())

/** The Saved lists dialog: every list, rename / delete values, edit / delete records, export and import a file. */
export function SavedListsDialog({ onClose }: { onClose: () => void }) {
  const { savedLists, changeLists } = useReport()
  const [editing, setEditing] = useState<{ list: RecordListId; index: number } | null>(null)
  const [message, setMessage] = useState('')

  function exportFile() {
    const blob = new Blob([listsToFile(savedLists)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = SAVED_LISTS_FILE_NAME
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setMessage(`Downloaded ${SAVED_LISTS_FILE_NAME}. Import it on the other computer.`)
  }

  async function importFile() {
    const file = await pickWithInput('.json,application/json')
    if (!file) return
    const res = listsFromFile(await file.text())
    if (!res.ok) {
      setMessage(`${file.name}: ${res.problem}`)
      return
    }
    changeLists((l) => mergeLists(l, res.lists))
    setMessage(`Added what was new from ${file.name}. Nothing was deleted.`)
  }

  const total = STRING_LIST_IDS.reduce((n, id) => n + savedLists.strings[id].length, 0) + RECORD_LIST_IDS.reduce((n, id) => n + savedLists.records[id].length, 0)

  return (
    <div className="dialog-backdrop" onKeyDown={(e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }}>
      <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-labelledby="saved-lists-title">
        <h2 id="saved-lists-title">Saved lists on this computer</h2>
        <p className="muted">
          Values kept in this browser for the next job ({total} saved). They are never in the job file: picking one copies it into the job.
          Export them to a file to move them to another computer.
        </p>
        <div className="button-row">
          <button type="button" className="btn" onClick={exportFile} disabled={total === 0}>Export to a file</button>
          <button type="button" className="btn" onClick={() => void importFile()}>Import a file</button>
          {message && <span role="status">{message}</span>}
        </div>
        <div className="saved-lists">
          {RECORD_LIST_IDS.map((id) => {
            const meta = RECORD_LISTS[id]
            const recs = savedLists.records[id] as Record<string, unknown>[]
            return (
              <section key={id}>
                <h3>{meta.name} <span className="muted">({recs.length})</span></h3>
                {recs.length === 0 ? <p className="muted">None yet. Use "Save to list" next to {an(meta.one)}.</p> : (
                  <ul className="saved-list">
                    {recs.map((r, i) => (
                      <li key={i}>
                        {editing?.list === id && editing.index === i ? (
                          <div className="saved-edit">
                            {Object.entries(r).filter(([k]) => id !== 'labelStyles' || k === 'name').map(([k, v]) => (
                              <label key={k} className="saved-edit-field">
                                <span className="muted">{fieldName(k)}</span>
                                {k === 'track' ? (
                                  <select value={v === null ? '' : v ? 'yes' : 'no'} onChange={(e) => changeLists((l) => updateRecord(l, id, i, { track: e.target.value === '' ? null : e.target.value === 'yes' }))}>
                                    <option value="">(blank)</option><option value="yes">Yes</option><option value="no">No</option>
                                  </select>
                                ) : FIELD_OPTIONS[k] ? (
                                  <select value={String(v)} onChange={(e) => changeLists((l) => updateRecord(l, id, i, { [k]: e.target.value }))}>
                                    {FIELD_OPTIONS[k].map((o) => <option key={o} value={o}>{o || '(blank)'}</option>)}
                                  </select>
                                ) : (
                                  <input type="text" defaultValue={String(v ?? '')} onBlur={(e) => changeLists((l) => updateRecord(l, id, i, { [k]: e.target.value.trim() }))} />
                                )}
                              </label>
                            ))}
                            <button type="button" className="btn btn-small" onClick={() => setEditing(null)}>Done</button>
                          </div>
                        ) : (
                          <>
                            <span className="saved-value">{meta.title(r)}</span>
                            <button type="button" className="btn btn-small" onClick={() => setEditing({ list: id, index: i })}>Edit</button>
                            <button type="button" className="btn btn-small" onClick={() => changeLists((l) => removeRecord(l, id, i))}>Delete</button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
          {STRING_LIST_IDS.map((id) => {
            const values = savedLists.strings[id]
            return (
              <section key={id}>
                <h3>{STRING_LISTS[id].name} <span className="muted">({values.length})</span></h3>
                {values.length === 0 ? <p className="muted">None yet. Type a value in its box, then "+ Save ... to the list" in the dropdown.</p> : (
                  <ul className="saved-list">
                    {values.map((v) => (
                      <li key={v}>
                        <input type="text" className="saved-value" defaultValue={v} aria-label={`Rename ${v}`}
                          onBlur={(e) => changeLists((l) => renameString(l, id, v, e.target.value))} />
                        <button type="button" className="btn btn-small" onClick={() => changeLists((l) => removeString(l, id, v))}>Delete</button>
                      </li>
                    ))}
                  </ul>
                )}
                {STRING_LISTS[id].builtIn.length > 0 && <p className="muted">Always offered: {STRING_LISTS[id].builtIn.join(', ')}.</p>}
              </section>
            )
          })}
        </div>
        <div className="button-row dialog-buttons">
          <button type="button" className="btn btn-primary" onClick={onClose} autoFocus>Close</button>
        </div>
      </div>
    </div>
  )
}

/** "Saved lists" button that opens the dialog (shown on the report steps that use lists). */
export function SavedListsButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="btn btn-small" onClick={() => setOpen(true)} title="Examiners, equipment and other values kept on this computer">
        Saved lists...
      </button>
      {open && <SavedListsDialog onClose={() => setOpen(false)} />}
    </>
  )
}
