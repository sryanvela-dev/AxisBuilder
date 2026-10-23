// Paste from Excel: paste copied cells, check how the pasted columns map to the table (and fix it),
// see the rows that will be added and every cell that can't be used, then add them as one undo step.

import { useEffect, useMemo, useRef, useState } from 'react'
import { TABLE_COLUMNS, columnTitle, formatCell, type TableListKey } from '../data/columns.ts'
import { LABEL_MODE_LABELS, RADIUS_LABELS } from '../data/parse.ts'
import { buildPastedRows, guessMapping, parseClipboardTable, type PasteMapping } from '../data/paste.ts'
import { LIST_META } from '../data/schema.ts'
import { useApp } from './appContext.ts'

const PREVIEW_ROWS = 8

export function PasteDialog({ list, initialText, onClose }: { list: TableListKey; initialText: string; onClose: () => void }) {
  const app = useApp()
  const project = app.state.job!.history.present
  const [text, setTextOnly] = useState(initialText)
  const rows = useMemo(() => parseClipboardTable(text), [text])
  const [mapping, setMapping] = useState<PasteMapping>(() => guessMapping(list, rows))
  const area = useRef<HTMLTextAreaElement>(null)
  /** New pasted text: guess the column mapping again. */
  const setText = (t: string) => {
    setTextOnly(t)
    setMapping(guessMapping(list, parseClipboardTable(t)))
  }
  const meta = LIST_META[list]
  const cols = TABLE_COLUMNS[list]

  useEffect(() => {
    if (!initialText) area.current?.focus()
  }, [initialText])

  const result = useMemo(() => buildPastedRows(project, list, rows, mapping), [project, list, rows, mapping])
  const width = mapping.columns.length
  const headerRow = mapping.hasHeader ? rows[0] : null
  const shown = (key: string, v: unknown) => {
    const col = cols.find((c) => c.key === key)!
    if (col.kind === 'yesNo') return v ? 'Yes' : 'No'
    if (col.kind === 'radius' && typeof v === 'string') return RADIUS_LABELS[v as keyof typeof RADIUS_LABELS]
    if (col.kind === 'labelMode' && typeof v === 'string') return LABEL_MODE_LABELS[v as keyof typeof LABEL_MODE_LABELS]
    return formatCell(col.kind, v)
  }

  function add() {
    if (result.items.length === 0) return
    app.edit(`Paste ${result.items.length} rows into ${meta.name}`, (p) => ({ ...p, [list]: [...(p[list] as unknown[]), ...result.items] }))
    onClose()
  }

  return (
    <div
      className="dialog-backdrop"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        }
      }}
    >
      <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-labelledby="paste-title">
        <h2 id="paste-title">Paste into {meta.name}</h2>
        {rows.length === 0 ? (
          <>
            <p>
              In Excel, select the cells (with or without the title row) and copy them (Ctrl+C). Then click in the box below
              and press Ctrl+V.
            </p>
            <textarea ref={area} className="paste-area" rows={6} value={text} onChange={(e) => setText(e.target.value)} aria-label="Pasted cells" />
          </>
        ) : (
          <>
            <p>
              {rows.length - (mapping.hasHeader ? 1 : 0)} rows pasted. Check where each pasted column goes; change it if it is
              wrong.
            </p>
            <label className="switch">
              <input type="checkbox" checked={mapping.hasHeader} onChange={(e) => setMapping({ ...mapping, hasHeader: e.target.checked })} />
              The first row holds column titles (it is not added)
            </label>
            <div className="table-wrap">
              <table className="grid mapping">
                <thead>
                  <tr>
                    <th>Pasted column</th>
                    {Array.from({ length: width }, (_, i) => (
                      <th key={i}>{headerRow?.[i]?.trim() || `Column ${i + 1}`}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Goes into</td>
                    {mapping.columns.map((key, i) => (
                      <td key={i}>
                        <select
                          value={key ?? ''}
                          aria-label={`Table column for pasted column ${i + 1}`}
                          onChange={(e) => {
                            const v = e.target.value || null
                            setMapping({ ...mapping, columns: mapping.columns.map((k, j) => (j === i ? v : k === v ? null : k)) })
                          }}
                        >
                          <option value="">Leave out</option>
                          {cols.map((c) => (
                            <option key={c.key} value={c.key}>
                              {columnTitle(list, c)}
                            </option>
                          ))}
                        </select>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="muted">First value</td>
                    {Array.from({ length: width }, (_, i) => (
                      <td key={i} className="muted">
                        {rows[mapping.hasHeader ? 1 : 0]?.[i] ?? ''}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            <h3>
              Rows to add ({result.items.length}){result.items.length > PREVIEW_ROWS ? `, first ${PREVIEW_ROWS} shown` : ''}
            </h3>
            <div className="table-wrap">
              <table className="grid preview">
                <thead>
                  <tr>
                    {cols.map((c) => (
                      <th key={c.key}>{columnTitle(list, c)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.items.slice(0, PREVIEW_ROWS).map((it, i) => (
                    <tr key={i}>
                      {cols.map((c) => (
                        <td key={c.key}>{shown(c.key, it[c.key])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {result.rejected.length > 0 && (
              <>
                <h3>Cells that can't be used ({result.rejected.length})</h3>
                <ul className="paste-list">
                  {result.rejected.map((r, i) => (
                    <li key={i}>
                      Row {r.row}, {r.column} "{r.value}": {r.reason}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {result.warnings.length + result.notes.length > 0 && (
              <ul className="paste-list">
                {result.warnings.map((w) => (
                  <li key={w} className="msg-warning">
                    {w}
                  </li>
                ))}
                {result.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
            <p className="muted">Blank cells get their default. You can undo the whole paste with Ctrl+Z.</p>
          </>
        )}
        <div className="button-row dialog-buttons">
          {rows.length > 0 && (
            <button type="button" className="btn" onClick={() => setText('')}>
              Paste something else
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={add} disabled={result.items.length === 0}>
            Add {result.items.length} {result.items.length === 1 ? 'row' : 'rows'}
          </button>
        </div>
      </div>
    </div>
  )
}
