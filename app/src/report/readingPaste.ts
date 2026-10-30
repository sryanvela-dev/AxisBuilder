// Manual readings pasted from Excel (design 5, Manual UT): report rows only (the drawing's MUT rows are already
// listed). Like the scan sheet paste, a column match step comes first: the app guesses each column from its header,
// else takes them in this order; the user fixes any guess. Columns not pasted stay blank, never invented.

import { headerKey } from '../data/autCsvImport.ts'
import { parseLength, parseNumber } from '../data/parse.ts'
import type { Reading } from './schema.ts'

export const READING_PASTE_COLUMNS = [
  { key: 'name', label: 'Name', accepted: ['name', 'id', 'nozzle', 'cml', 'tml', 'point'] },
  { key: 'location', label: 'Location', accepted: ['location', 'position', 'loc', 'orientation'] },
  { key: 'type', label: 'Type', accepted: ['type', 'kind', 'method'] },
  { key: 'minT', label: "Min 'T'", accepted: ['mint', 'min', 'minthickness', 'thickness', 'reading', 'utt', 't'] },
  { key: 'avgT', label: "Avg 'T'", accepted: ['avgt', 'avet', 'avg', 'ave', 'average'] },
  { key: 'maxT', label: "Max 'T'", accepted: ['maxt', 'max', 'maximum'] },
  { key: 'area', label: 'Area (sq in)', accepted: ['area', 'areasqin', 'sqin'] },
  { key: 'nominal', label: 'Nominal', accepted: ['nominal', 'nom', 'nomt', 'nominalthickness'] },
  { key: 'na', label: 'N/A reason', accepted: ['na', 'n/a', 'nareason', 'reason', 'notmeasured'] },
] as const

export type ReadingPasteKey = (typeof READING_PASTE_COLUMNS)[number]['key']

export interface ReadingPasteMapping {
  hasHeader: boolean
  columns: (ReadingPasteKey | null)[]
}

export function matchReadingHeader(header: string): ReadingPasteKey | null {
  const k = headerKey(header).replace(/\(.*\)$/, '')
  if (k === '') return null
  return READING_PASTE_COLUMNS.find((c) => (c.accepted as readonly string[]).includes(k))?.key ?? null
}

/** By header when at least half of the first row's cells name a column, else in the order above. */
export function guessReadingMapping(rows: readonly string[][]): ReadingPasteMapping {
  const first = rows[0] ?? []
  const width = Math.max(0, ...rows.map((r) => r.length))
  const matched = first.map(matchReadingHeader)
  const filled = first.filter((h) => h.trim() !== '').length
  const hits = matched.filter((m) => m !== null).length
  if (hits > 0 && hits * 2 >= filled) {
    const seen = new Set<ReadingPasteKey>()
    return {
      hasHeader: true,
      columns: Array.from({ length: width }, (_, i) => {
        const m = matched[i] ?? null
        if (m === null || seen.has(m)) return null
        seen.add(m)
        return m
      }),
    }
  }
  return { hasHeader: false, columns: Array.from({ length: width }, (_, i) => READING_PASTE_COLUMNS[i]?.key ?? null) }
}

export interface ReadingPasteResult {
  rows: Partial<Reading>[]
  /** Cells that could not be used (left blank). */
  rejected: { row: number; column: string; value: string; reason: string }[]
}

const typeOf = (t: string): Reading['type'] | null => {
  const k = headerKey(t)
  if (k === '' || k === 'utt' || k === 'ut' || k === 'spot') return 'UTT'
  if (k === 'mutscan' || k === 'mut' || k === 'scan') return 'MUT scan'
  return null
}

/** The report rows a paste adds (a row with every used cell blank is skipped). */
export function buildReadingPaste(rows: readonly string[][], mapping: ReadingPasteMapping): ReadingPasteResult {
  const out: Partial<Reading>[] = []
  const rejected: ReadingPasteResult['rejected'] = []
  const label = (k: ReadingPasteKey) => READING_PASTE_COLUMNS.find((c) => c.key === k)!.label
  const body = mapping.hasHeader ? rows.slice(1) : rows
  body.forEach((cells, i) => {
    const rowNo = i + 1 + (mapping.hasHeader ? 1 : 0)
    const r: Partial<Reading> = {}
    let any = false
    mapping.columns.forEach((k, c) => {
      if (k === null) return
      const raw = (cells[c] ?? '').trim()
      if (raw === '') return
      any = true
      const reject = (reason: string) => rejected.push({ row: rowNo, column: label(k), value: raw, reason })
      if (k === 'name' || k === 'location') r[k] = raw
      else if (k === 'na') r.na = raw
      else if (k === 'type') {
        const t = typeOf(raw)
        if (t) r.type = t
        else reject('Type is UTT or MUT scan.')
      } else if (k === 'area') {
        const v = parseNumber(raw)
        if (v.ok && v.value !== null && v.value >= 0) r.area = v.value
        else reject('Not an area (a number of square inches).')
      } else {
        const v = parseLength(raw)
        const ok = v.ok && v.value !== null && (k === 'nominal' ? v.value > 0 : v.value >= 0)
        if (!ok) reject('Not a thickness in inches.')
        else if (k === 'nominal') r.nominal = v.value
        else r[k] = v.value
      }
    })
    if (!any) return
    // A typed nominal is a custom one; without one the row uses its component's nominal.
    r.nominalMode = r.nominal !== undefined ? 'custom' : 'component'
    out.push(r)
  })
  return { rows: out, rejected }
}
