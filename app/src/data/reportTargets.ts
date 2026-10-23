// Links each import report entry to the setting or row it is about (from the cell address and the
// importer's `sources`), so the step pages can show it next to that setting or row. Rows are linked
// by their name, which stays right when rows are moved later.

import type { ListKey, Project } from './schema.ts'
import { LIST_META } from './schema.ts'
import type { ImportSources, ReportEntry } from './xlsmImport.ts'

export type ReportTarget =
  | { kind: 'setting'; section: 'project' | 'vessel' | 'settings'; key: string }
  | { kind: 'row'; list: ListKey; id: string }

const LIST_SHEET: Record<ListKey, string> = {
  circWelds: 'Shell Features', longSeams: 'Shell Features', shellNozzles: 'Shell Features', objects: 'Shell Features',
  shellMut: 'Shell Features', headNozzles: 'Head Features', headMut: 'Head Features', scans: 'Scan Import', scanImages: 'Scan Images',
}

function rowOf(cell: string): number | null {
  const m = /^(?:[A-Z]{1,3}|row\s+)(\d+)$/i.exec(cell.trim())
  return m ? Number(m[1]) : null
}

export function reportTargets(report: ReportEntry[], sources: ImportSources, project: Project): (ReportTarget | null)[] {
  return report.map((e) => {
    const row = rowOf(e.cell)
    if (row === null) return null
    for (const [section, keys] of Object.entries(sources.fields)) {
      for (const [key, src] of Object.entries(keys)) {
        if (src.sheet === e.sheet && src.row === row) return { kind: 'setting', section: section as 'project' | 'vessel' | 'settings', key }
      }
    }
    for (const list of Object.keys(sources.rows) as ListKey[]) {
      if (LIST_SHEET[list] !== e.sheet) continue
      const i = sources.rows[list].findIndex((r) => r.row === row)
      const item = (project[list] as Record<string, unknown>[])[i]
      if (i >= 0 && item) return { kind: 'row', list, id: String(item[LIST_META[list].idField]) }
    }
    return null
  })
}
