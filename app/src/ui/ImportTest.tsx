// Temporary test screen: open a v5.0 .xlsm job, see what imported, save a project file.
// Everything runs in the browser; nothing is uploaded.

import { useState, type ChangeEvent } from 'react'
import { LIST_META, type ListKey } from '../data/schema.ts'
import { saveProject } from '../data/projectFile.ts'
import type { ImportResult, ReportKind } from '../data/xlsmImport.ts'

const KIND_LABEL: Record<ReportKind, string> = {
  invalid: 'Invalid',
  review: 'Review',
  changed: 'Changed',
  skipped: 'Not imported',
  notFound: 'Not found',
}

export function ImportTest() {
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onOpen(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setError('')
    setResult(null)
    setFileName(file.name)
    try {
      const { importWorkbook } = await import('../data/xlsmImport.ts')
      setResult(importWorkbook(await file.arrayBuffer()))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function onSave() {
    if (!result) return
    const blob = new Blob([saveProject(result.project)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    const base = result.project.project.projectName || fileName.replace(/\.[^.]+$/, '') || 'project'
    a.download = `${base}.axisbuilder.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const s = result?.summary
  return (
    <main className="import-test">
      <header>
        <h1>AxisBuilder</h1>
        <p className="muted">Test screen: import a v5.0 job. The file is read in this browser; nothing is uploaded.</p>
      </header>

      <div className="actions">
        <label className="button">
          Open .xlsm job
          <input type="file" accept=".xlsm,.xlsx" onChange={onOpen} hidden />
        </label>
        <button type="button" className="button" onClick={onSave} disabled={!result}>
          Save project file
        </button>
        {busy && <span className="muted">Reading {fileName}...</span>}
      </div>

      {error && (
        <p className="error" role="alert">
          {fileName}: {error}
        </p>
      )}

      {result && s && (
        <>
          <section>
            <h2>{fileName}</h2>
            <dl className="facts">
              <dt>Project</dt>
              <dd>{result.project.project.projectName || '(no name)'}</dd>
              <dt>Shell Features layout</dt>
              <dd>{s.layout}</dd>
              <dt>Settings and info found</dt>
              <dd>
                {s.fieldsFound} of {s.fieldsTotal}
              </dd>
              <dt>Report entries</dt>
              <dd>{result.report.length}</dd>
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
            <h2>Needed before export ({s.missingData.length})</h2>
            {s.missingData.length === 0 ? (
              <p className="muted">Nothing missing.</p>
            ) : (
              <ul>
                {s.missingData.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2>Import report ({result.report.length})</h2>
            {result.report.length === 0 ? (
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
                    {result.report.map((e, i) => (
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
