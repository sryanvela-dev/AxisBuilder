// Import report tables (Excel job and AUT CSV), shared by the import review and the step pages.

import type { AutReportEntry, AutReportKind } from '../data/autCsvImport.ts'
import type { ReportEntry, ReportKind } from '../data/xlsmImport.ts'

const KIND_LABEL: Record<ReportKind | AutReportKind, string> = {
  invalid: 'Not usable',
  review: 'Check this',
  changed: 'Changed',
  skipped: 'Not imported',
  notFound: 'Not found',
  blocking: 'Stops import',
  wrapped: 'Across the seam',
}

export function WorkbookReportTable({ entries }: { entries: ReportEntry[] }) {
  if (entries.length === 0) return <p className="muted">Every value imported as it was.</p>
  return (
    <div className="table-wrap">
      <table className="report">
        <thead>
          <tr>
            <th>Sheet</th>
            <th>Cell</th>
            <th>Value found</th>
            <th>What happened</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={i}>
              <td>{e.sheet}</td>
              <td>{e.cell}</td>
              <td className="value">{e.value}</td>
              <td>
                <span className={`kind kind-${e.kind}`}>{KIND_LABEL[e.kind]}</span>
              </td>
              <td>{e.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function AutReportTable({ entries }: { entries: AutReportEntry[] }) {
  if (entries.length === 0) return null
  return (
    <div className="table-wrap">
      <table className="report">
        <thead>
          <tr>
            <th>CSV line</th>
            <th>Column</th>
            <th>Value found</th>
            <th>What happened</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={i}>
              <td className="num">{e.row ?? ''}</td>
              <td>{e.column}</td>
              <td className="value">{e.value}</td>
              <td>
                <span className={`kind kind-${e.kind === 'blocking' ? 'invalid' : e.kind}`}>{KIND_LABEL[e.kind]}</span>
              </td>
              <td>{e.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
