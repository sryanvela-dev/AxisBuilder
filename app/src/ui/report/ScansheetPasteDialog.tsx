// Paste a scan sheet from Excel (design 5): paste the cells, check what each pasted column holds (the app guesses from
// the titles, else takes the scansheet.csv order), see how many rows match the job's scans and what was worked out,
// then use it. Columns not pasted stay blank; a second paste matched by scan number fills in what the first lacked.

import { useMemo, useRef, useEffect, useState } from 'react'
import { parseClipboardTable } from '../../data/paste.ts'
import { SCANSHEET_COLUMNS, buildScansheetPaste, guessScansheetMapping, type ScansheetImport, type ScansheetMapping } from '../../report/scansheetImport.ts'
import { useApp } from '../appContext.ts'
import { ScansheetReport } from './ScansheetReport.tsx'

export function ScansheetPasteDialog({ onClose, onUse }: { onClose: () => void; onUse: (imp: ScansheetImport) => void }) {
  const app = useApp()
  const project = app.state.job!.history.present
  const [text, setTextOnly] = useState('')
  const rows = useMemo(() => parseClipboardTable(text), [text])
  const [mapping, setMapping] = useState<ScansheetMapping>(() => guessScansheetMapping([]))
  const area = useRef<HTMLTextAreaElement>(null)
  useEffect(() => area.current?.focus(), [])
  const setText = (t: string) => {
    setTextOnly(t)
    setMapping(guessScansheetMapping(parseClipboardTable(t)))
  }
  const imp = useMemo(() => (rows.length === 0 ? null : buildScansheetPaste(project, rows, mapping)), [project, rows, mapping])
  const matched = imp?.rows.filter((r) => r.scanId !== null).length ?? 0
  const width = mapping.columns.length
  const headerRow = mapping.hasHeader ? rows[0] : null
  return (
    <div className="dialog-backdrop" onKeyDown={(e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }}>
      <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-labelledby="scansheet-paste-title">
        <h2 id="scansheet-paste-title">Paste a scan sheet</h2>
        {rows.length === 0 ? (
          <>
            <p>
              In Excel, select the scan sheet rows (with or without the title row) and copy them (Ctrl+C). Then click in the box below and press
              Ctrl+V. Any columns will do: at least the scan names, plus whatever results you have.
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
                    {Array.from({ length: width }, (_, i) => (
                      <th key={i}>{headerRow?.[i]?.trim() || `Column ${i + 1}`}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Holds</td>
                    {mapping.columns.map((key, i) => (
                      <td key={i}>
                        <select value={key ?? ''} aria-label={`What pasted column ${i + 1} holds`}
                          onChange={(e) => {
                            const v = (e.target.value || null) as ScansheetMapping['columns'][number]
                            setMapping({ ...mapping, columns: mapping.columns.map((k, j) => (j === i ? v : k === v ? null : k)) })
                          }}>
                          <option value="">Leave out</option>
                          {SCANSHEET_COLUMNS.map((c) => (
                            <option key={c.key} value={c.key}>{c.label}</option>
                          ))}
                        </select>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="muted">First value</td>
                    {Array.from({ length: width }, (_, i) => (
                      <td key={i} className="muted">{rows[mapping.hasHeader ? 1 : 0]?.[i] ?? ''}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            {imp && (
              <>
                <p className={imp.ok ? '' : 'error'}>
                  {imp.ok
                    ? imp.mode === 'create'
                      ? `${imp.scans.length} scans will be made in the drawing, with their results.`
                      : `${matched} of ${imp.rows.length} rows match a scan of the job by scan number.`
                    : 'This paste can’t be used yet; see below.'}
                </p>
                <ScansheetReport entries={imp.report} />
              </>
            )}
            <p className="muted">Blank cells stay blank. You can undo the whole paste with Ctrl+Z.</p>
          </>
        )}
        <div className="button-row dialog-buttons">
          {rows.length > 0 && (
            <button type="button" className="btn" onClick={() => setText('')}>Paste something else</button>
          )}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!imp?.ok || (imp.mode === 'match' && matched === 0)} onClick={() => imp && onUse(imp)}>
            Use these rows
          </button>
        </div>
      </div>
    </div>
  )
}
