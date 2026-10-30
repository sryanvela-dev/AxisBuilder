// The scansheet import report (a CSV or a paste): one line per problem, value worked out or difference found.

import type { ScansheetReportEntry, ScansheetReportKind } from '../../report/scansheetImport.ts'

const KIND: Partial<Record<ScansheetReportKind, { label: string; css: string }>> = {
  blocking: { label: 'Stopped', css: 'invalid' },
  invalid: { label: 'Not used', css: 'invalid' },
  missing: { label: 'Missing', css: 'review' },
  calculated: { label: 'Calculated', css: 'changed' },
  mismatch: { label: 'Differs', css: 'review' },
  position: { label: 'Position', css: 'review' },
  unmatched: { label: 'Not matched', css: 'review' },
  swapped: { label: 'Swapped', css: 'changed' },
  note: { label: 'Note', css: 'other' },
}

export function ScansheetReport({ entries }: { entries: readonly ScansheetReportEntry[] }) {
  if (entries.length === 0) return <p className="muted">Nothing to report: every row was read as it is.</p>
  return (
    <div className="table-wrap table-limit">
      <table className="report">
        <thead>
          <tr>
            <th>Row</th>
            <th>Column</th>
            <th>What</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => {
            const k = KIND[e.kind] ?? { label: e.kind.charAt(0).toUpperCase() + e.kind.slice(1), css: 'other' }
            return (
              <tr key={i}>
                <td className="num">{e.row ?? ''}</td>
                <td>{e.column}</td>
                <td>
                  <span className={`kind kind-${k.css}`}>{k.label}</span>
                </td>
                <td>{e.message}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
