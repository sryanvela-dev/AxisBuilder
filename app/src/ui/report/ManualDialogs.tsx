// Manual UT dialogs: "Add nozzle readings" (design 5: pick nozzles and positions, one linked UTT row each, no doubles,
// the last positions remembered in this browser) and paste report rows from Excel with a column match step.

import { useEffect, useMemo, useRef, useState } from 'react'
import { formatNumber } from '../../data/parse.ts'
import { parseClipboardTable } from '../../data/paste.ts'
import { NOZZLE_POSITIONS, addNozzleReadings, addReportReadings, type NozzlePick } from '../../report/edits.ts'
import { READING_PASTE_COLUMNS, buildReadingPaste, guessReadingMapping, type ReadingPasteMapping } from '../../report/readingPaste.ts'
import { plural } from '../../state/steps.ts'
import { useApp } from '../appContext.ts'

const POSITIONS_KEY = 'axisbuilder:nozzlePositions'

function rememberedPositions(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(POSITIONS_KEY) ?? 'null') as unknown
    if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v.filter((x) => (NOZZLE_POSITIONS as readonly string[]).includes(x))
  } catch {
    // Blocked or bad storage: no remembered choice.
  }
  return ['North', 'East', 'South', 'West']
}

function rememberPositions(list: string[]) {
  try {
    localStorage.setItem(POSITIONS_KEY, JSON.stringify(list))
  } catch {
    // Not remembered; nothing else depends on it.
  }
}

function Backdrop({ onClose, children, labelledBy }: { onClose: () => void; children: React.ReactNode; labelledBy: string }) {
  return (
    <div className="dialog-backdrop" onKeyDown={(e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }}>
      <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        {children}
      </div>
    </div>
  )
}

export function NozzleReadingsDialog({ onClose }: { onClose: () => void }) {
  const app = useApp()
  const p = app.state.job!.history.present
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [positions, setPositions] = useState<string[]>(rememberedPositions)
  const nozzles: (NozzlePick & { label: string; key: string })[] = [
    ...p.shellNozzles.map((n, index) => ({ list: 'shellNozzles' as const, index, key: `s${index}`, label: `${n.id} (shell${n.diameter === null ? '' : `, ${formatNumber(n.diameter)} in`})` })),
    ...p.headNozzles.map((n, index) => ({ list: 'headNozzles' as const, index, key: `h${index}`, label: `${n.id} (${n.head === 'HEAD 1' ? 'head 1' : 'head 2'}${n.diameter === null ? '' : `, ${formatNumber(n.diameter)} in`})` })),
  ]
  const toggle = <T,>(set: Set<T>, v: T) => {
    const n = new Set(set)
    if (n.has(v)) n.delete(v)
    else n.add(v)
    return n
  }
  const chosen = nozzles.filter((n) => picked.has(n.key))
  const ordered = NOZZLE_POSITIONS.filter((x) => positions.includes(x))

  async function add() {
    rememberPositions(ordered)
    const res = addNozzleReadings(p, chosen, ordered)
    if (res.added > 0) app.edit(`Add nozzle readings (${res.added})`, () => res.project)
    onClose()
    await app.ask({
      title: 'Nozzle readings',
      message: (
        <p>
          {res.added > 0 ? `${plural(res.added, 'row')} added, before the MUT rows.` : 'No row added.'}
          {res.skipped > 0 ? ` ${plural(res.skipped, 'nozzle and position')} already had a row and ${res.skipped === 1 ? 'was' : 'were'} left out.` : ''}
        </p>
      ),
      buttons: [{ id: 'ok', label: 'OK', primary: true }],
      cancelId: 'ok',
    })
  }

  return (
    <Backdrop onClose={onClose} labelledBy="nozzle-readings-title">
      <h2 id="nozzle-readings-title">Add nozzle readings</h2>
      <p>One UTT row for each nozzle and position, linked to the nozzle, with the pipe nominal suggested from its size. A time-saver: rows that already exist are left out.</p>
      {nozzles.length === 0 ? (
        <p className="muted">The drawing has no nozzles yet (Field data step).</p>
      ) : (
        <>
          <h3>Nozzles</h3>
          <div className="button-row">
            <button type="button" className="btn btn-small" onClick={() => setPicked(new Set(nozzles.map((n) => n.key)))}>All</button>
            <button type="button" className="btn btn-small" onClick={() => setPicked(new Set())}>None</button>
          </div>
          <div className="check-grid">
            {nozzles.map((n) => (
              <label key={n.key} className="switch">
                <input type="checkbox" checked={picked.has(n.key)} onChange={() => setPicked(toggle(picked, n.key))} /> {n.label}
              </label>
            ))}
          </div>
          <h3>Positions</h3>
          <div className="check-grid">
            {NOZZLE_POSITIONS.map((x) => (
              <label key={x} className="switch">
                <input type="checkbox" checked={positions.includes(x)} onChange={() => setPositions([...toggle(new Set(positions), x)])} /> {x}
              </label>
            ))}
          </div>
        </>
      )}
      <div className="button-row dialog-buttons">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={chosen.length === 0 || ordered.length === 0} onClick={() => void add()}>
          Add {plural(chosen.length * ordered.length, 'row')}
        </button>
      </div>
    </Backdrop>
  )
}

export function ReadingPasteDialog({ onClose }: { onClose: () => void }) {
  const app = useApp()
  const [text, setTextOnly] = useState('')
  const rows = useMemo(() => parseClipboardTable(text), [text])
  const [mapping, setMapping] = useState<ReadingPasteMapping>(() => guessReadingMapping([]))
  const area = useRef<HTMLTextAreaElement>(null)
  useEffect(() => area.current?.focus(), [])
  const setText = (t: string) => {
    setTextOnly(t)
    setMapping(guessReadingMapping(parseClipboardTable(t)))
  }
  const result = useMemo(() => buildReadingPaste(rows, mapping), [rows, mapping])
  const width = mapping.columns.length
  const headerRow = mapping.hasHeader ? rows[0] : null
  function add() {
    app.edit(`Paste ${plural(result.rows.length, 'reading')}`, (q) => addReportReadings(q, result.rows))
    onClose()
  }
  return (
    <Backdrop onClose={onClose} labelledBy="reading-paste-title">
      <h2 id="reading-paste-title">Paste readings</h2>
      {rows.length === 0 ? (
        <>
          <p>
            In Excel, select the readings (with or without the title row) and copy them (Ctrl+C). Then click in the box below and press Ctrl+V. They
            are added as report rows; the drawing's MUT rows are already listed.
          </p>
          <textarea ref={area} className="paste-area" rows={6} value={text} onChange={(e) => setText(e.target.value)} aria-label="Pasted cells" />
        </>
      ) : (
        <>
          <p>{rows.length - (mapping.hasHeader ? 1 : 0)} rows pasted. Check what each pasted column holds; change it if it is wrong.</p>
          <label className="switch">
            <input type="checkbox" checked={mapping.hasHeader} onChange={(e) => setMapping({ ...mapping, hasHeader: e.target.checked })} />
            The first row holds column titles
          </label>
          <div className="table-wrap">
            <table className="grid mapping">
              <thead>
                <tr>
                  <th>Pasted column</th>
                  {Array.from({ length: width }, (_, i) => <th key={i}>{headerRow?.[i]?.trim() || `Column ${i + 1}`}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Holds</td>
                  {mapping.columns.map((key, i) => (
                    <td key={i}>
                      <select value={key ?? ''} aria-label={`What pasted column ${i + 1} holds`}
                        onChange={(e) => {
                          const v = (e.target.value || null) as ReadingPasteMapping['columns'][number]
                          setMapping({ ...mapping, columns: mapping.columns.map((k, j) => (j === i ? v : k === v ? null : k)) })
                        }}>
                        <option value="">Leave out</option>
                        {READING_PASTE_COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                      </select>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="muted">First value</td>
                  {Array.from({ length: width }, (_, i) => <td key={i} className="muted">{rows[mapping.hasHeader ? 1 : 0]?.[i] ?? ''}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
          {result.rejected.length > 0 && (
            <>
              <h3>Cells that can't be used ({result.rejected.length})</h3>
              <ul className="paste-list">
                {result.rejected.map((r, i) => <li key={i}>Row {r.row}, {r.column} "{r.value}": {r.reason}</li>)}
              </ul>
            </>
          )}
          <p className="muted">A row with a nominal gets that nominal (custom); without one it uses its component's. You can undo the paste with Ctrl+Z.</p>
        </>
      )}
      <div className="button-row dialog-buttons">
        {rows.length > 0 && <button type="button" className="btn" onClick={() => setText('')}>Paste something else</button>}
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={result.rows.length === 0} onClick={add}>
          Add {plural(result.rows.length, 'row')}
        </button>
      </div>
    </Backdrop>
  )
}
