// Temporary test screen: open a v5.0 .xlsm job or an AUT CSV, match a scan image folder, see what
// imported, save a project file. Everything runs in the browser; nothing is uploaded.

import { useState, type ChangeEvent } from 'react'
import { LIST_META, type ListKey, type Project } from '../data/schema.ts'
import { createEmptyProject, saveProject } from '../data/projectFile.ts'
import { importAutCsv, replaceScans, type AutImportResult, type AutReportKind } from '../data/autCsvImport.ts'
import type { ImportResult, ReportKind } from '../data/xlsmImport.ts'
import { isStaleCodeError, reloadAfterUpdate } from './reloadAfterUpdate.ts'
import { ImageFolderPanel } from './ImageFolderPanel.tsx'

const KIND_LABEL: Record<ReportKind | AutReportKind, string> = {
  invalid: 'Invalid',
  review: 'Review',
  changed: 'Changed',
  skipped: 'Not imported',
  notFound: 'Not found',
  blocking: 'Stops import',
}

export function ImportTest() {
  const [project, setProject] = useState<Project | null>(null)
  const [projectSource, setProjectSource] = useState('')
  const [xlsm, setXlsm] = useState<{ fileName: string; result: ImportResult } | null>(null)
  const [csv, setCsv] = useState<{ fileName: string; result: AutImportResult } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  async function onOpenXlsm(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(`Reading ${file.name}...`)
    setError('')
    try {
      const { importWorkbook } = await import('../data/xlsmImport.ts')
      const result = importWorkbook(await file.arrayBuffer())
      setXlsm({ fileName: file.name, result })
      setProject(result.project)
      setProjectSource(file.name)
      setCsv(null)
    } catch (err) {
      if (isStaleCodeError(err) && reloadAfterUpdate()) return
      setError(`${file.name}: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy('')
    }
  }

  async function onOpenCsv(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    const result = importAutCsv(await file.arrayBuffer())
    setCsv({ fileName: file.name, result })
    if (result.ok) {
      // Like v5.0: the new scans replace the old ones and their image links.
      setProject(replaceScans(project ?? createEmptyProject(), result.scans))
      if (!project) setProjectSource(file.name)
    }
  }

  function onSave() {
    if (!project) return
    const blob = new Blob([saveProject(project)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    const base = project.project.projectName || projectSource.replace(/\.[^.]+$/, '') || 'project'
    a.download = `${base}.axisbuilder.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const s = xlsm?.result.summary
  return (
    <main className="import-test">
      <header>
        <h1>AxisBuilder</h1>
        <p className="muted">
          Test screen: import a v5.0 job, an AUT CSV and a scan image folder. Files are read in this browser; nothing
          is uploaded.
        </p>
      </header>

      <div className="actions">
        <label className="button">
          Open .xlsm job
          <input type="file" accept=".xlsm,.xlsx" onChange={onOpenXlsm} hidden />
        </label>
        <label className="button">
          Open AUT CSV
          <input type="file" accept=".csv,text/csv" onChange={onOpenCsv} hidden />
        </label>
        <button type="button" className="button" onClick={onSave} disabled={!project}>
          Save project file
        </button>
        {busy && <span className="muted">{busy}</span>}
      </div>
      {project && (
        <p className="muted status-line">
          Current project: {project.project.projectName || projectSource} ({project.scans.length} scans)
        </p>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {csv && (
        <section>
          <h2>AUT CSV: {csv.fileName}</h2>
          <p className={csv.result.ok ? '' : 'error'}>
            {csv.result.ok
              ? `${csv.result.summary.imported} scans imported from ${csv.result.summary.rowsRead} rows` +
                (csv.result.summary.calibrationRowsSkipped ? `, ${csv.result.summary.calibrationRowsSkipped} calibration row(s) skipped` : '') +
                '. They replace the scans in the current project.'
              : 'Import stopped; nothing was imported. Fix the CSV and open it again.'}
          </p>
          {csv.result.report.length > 0 && (
            <div className="table-wrap">
              <table className="report">
                <thead>
                  <tr>
                    <th>CSV row</th>
                    <th>Column</th>
                    <th>Value found</th>
                    <th>What happened</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {csv.result.report.map((e, i) => (
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
          )}
        </section>
      )}

      {project && (
        <ImageFolderPanel key={project.scans.map((x) => x.id).join('|')} project={project} onApply={setProject} />
      )}

      {xlsm && s && (
        <>
          <section>
            <h2>Workbook: {xlsm.fileName}</h2>
            <dl className="facts">
              <dt>Project</dt>
              <dd>{xlsm.result.project.project.projectName || '(no name)'}</dd>
              <dt>Shell Features layout</dt>
              <dd>{s.layout}</dd>
              <dt>Settings and info found</dt>
              <dd>
                {s.fieldsFound} of {s.fieldsTotal}
              </dd>
              <dt>Report entries</dt>
              <dd>{xlsm.result.report.length}</dd>
            </dl>
            <table className="counts">
              <thead>
                <tr>
                  <th>Section</th>
                  <th>Rows imported</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(s.counts) as ListKey[]).map((k) => (
                  <tr key={k}>
                    <td>{LIST_META[k].name}</td>
                    <td className="num">{s.counts[k]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <h2>Needed before export ({s.missingData.length + s.duplicateIds.length})</h2>
            {s.missingData.length + s.duplicateIds.length === 0 ? (
              <p className="muted">Nothing missing.</p>
            ) : (
              <ul>
                {[...s.missingData, ...s.duplicateIds].map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2>Import report ({xlsm.result.report.length})</h2>
            {xlsm.result.report.length === 0 ? (
              <p className="muted">Every value imported as it was.</p>
            ) : (
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
                    {xlsm.result.report.map((e, i) => (
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
            )}
          </section>
        </>
      )}
    </main>
  )
}
