// Imports the AUT Solutions ScanSheet CSV, with the same rules as v5.0 Import AUT (SLG_ImportAUT):
// - Columns are found by header name, not position. Headers are compared ignoring case, spaces and
//   - _ . ' " characters. Name: "File Name", "Scan Name" or "File"; plus X-Start, X-Stop, Y-Start, Y-Stop.
// - Scan names are trimmed, repeated spaces collapsed, and converted to upper case.
// - Rows named "cal" (calibration) and rows without a name are skipped.
// - Duplicate scan names (ignoring case and outer spaces), a missing column, a short row, or a blank
//   or non-numeric coordinate stop the import: nothing is imported, as in v5.0.
// Unlike v5.0 there is no 150-scan limit, every problem is listed (not only the first), and a scan
// with no width or height keeps its row with the stop value left blank. With the circumference given, a scan
// past it is read across the circumference seam (X = 0 and X = circumference are the same line): one running
// past the seam is kept as it is (the drawing wraps it), one wholly past the seam is moved back by one
// circumference. Both are listed in the report, never as problems.

import { CURRENT_SCHEMA_VERSION, idKey, type Project, type Scan } from './schema.ts'

export type AutReportKind =
  /** Stops the import; nothing is imported. */
  | 'blocking'
  /** The row was left out on purpose (calibration row, no scan name). */
  | 'skipped'
  /** The row was imported but a value could not be used and was left blank. */
  | 'invalid'
  /** The scan runs across the circumference seam (or was wholly past it and was moved back). */
  | 'wrapped'

export interface AutReportEntry {
  /** CSV line number (1 = header row); null for problems with the whole file. */
  row: number | null
  /** CSV column header, or '' when not about one column. */
  column: string
  value: string
  kind: AutReportKind
  message: string
}

export interface AutImportResult {
  /** False when a blocking problem was found; `scans` is then empty. */
  ok: boolean
  scans: Scan[]
  report: AutReportEntry[]
  summary: {
    /** Data rows read (not counting blank lines). */
    rowsRead: number
    imported: number
    calibrationRowsSkipped: number
  }
}

// --- CSV text --------------------------------------------------------------------------------

/** Decodes CSV bytes: UTF-8 (BOM removed), or Windows-1252 if the bytes are not valid UTF-8. */
export function decodeCsv(bytes: ArrayBuffer | Uint8Array): string {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    text = new TextDecoder('windows-1252').decode(bytes)
  }
  return text.replace(/^﻿/, '')
}

interface CsvRecord {
  /** Line number where the record starts (1-based). */
  line: number
  fields: string[]
}

/** Splits CSV text into records. Handles quoted fields (with commas, "" and line breaks) and CRLF, LF or CR. */
export function parseCsv(text: string): CsvRecord[] {
  const records: CsvRecord[] = []
  let fields: string[] = []
  let value = ''
  let inQuotes = false
  let line = 1
  let startLine = 1
  let any = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        value += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        if (ch === '\n' || (ch === '\r' && text[i + 1] !== '\n')) line++
        value += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      any = true
    } else if (ch === ',') {
      fields.push(value)
      value = ''
      any = true
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      fields.push(value)
      if (any || value !== '') records.push({ line: startLine, fields })
      fields = []
      value = ''
      any = false
      line++
      startLine = line
    } else {
      value += ch
      any = true
    }
  }
  fields.push(value)
  if (any || value !== '') records.push({ line: startLine, fields })
  return records
}

// --- Import ----------------------------------------------------------------------------------

/** v5.0 NormalizeHeader: lower case without spaces, - _ . ' and ". */
function headerKey(h: string): string {
  return h.trim().toLowerCase().replace(/[-_ .'"]/g, '')
}

/** v5.0 NormalizeImportText: trim, collapse repeated spaces, upper case. */
export function normalizeScanName(s: string): string {
  return s.trim().replace(/ {2,}/g, ' ').toUpperCase()
}

const COLUMNS = [
  { key: 'name', label: 'File Name', accepted: ['filename', 'scanname', 'file'] },
  { key: 'xStart', label: 'X-Start', accepted: ['xstart'] },
  { key: 'xStop', label: 'X-Stop', accepted: ['xstop'] },
  { key: 'yStart', label: 'Y-Start', accepted: ['ystart'] },
  { key: 'yStop', label: 'Y-Stop', accepted: ['ystop'] },
] as const

const NUMBER_RE = /^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/

/** Imports AUT ScanSheet CSV bytes or text. Never throws for bad input; check `ok` and `report`. */
export function importAutCsv(input: ArrayBuffer | Uint8Array | string, options: { circumference?: number | null } = {}): AutImportResult {
  const C = options.circumference ?? null
  const text = typeof input === 'string' ? input.replace(/^﻿/, '') : decodeCsv(input)
  const report: AutReportEntry[] = []
  const block = (row: number | null, column: string, value: string, message: string) =>
    report.push({ row, column, value, kind: 'blocking', message })
  const result = (scans: Scan[], rowsRead: number, cal: number): AutImportResult => {
    const ok = !report.some((e) => e.kind === 'blocking')
    return {
      ok,
      scans: ok ? scans : [],
      report,
      summary: { rowsRead, imported: ok ? scans.length : 0, calibrationRowsSkipped: cal },
    }
  }

  const records = parseCsv(text)
  if (records.length === 0) {
    block(null, '', '', 'The CSV is empty.')
    return result([], 0, 0)
  }

  // Header row: first occurrence of each normalized header wins, as in v5.0.
  const header = records[0]
  const index = new Map<string, number>()
  header.fields.forEach((h, i) => {
    const k = headerKey(h)
    if (k && !index.has(k)) index.set(k, i)
  })
  const col: Record<string, number> = {}
  for (const c of COLUMNS) {
    const found = c.accepted.map((a) => index.get(a)).find((i) => i !== undefined)
    if (found === undefined) {
      block(header.line, c.label, '', `Required column "${c.label}" not found in the header row` +
        (c.key === 'name' ? ' (accepted: File Name, Scan Name or File).' : '.'))
    } else {
      col[c.key] = found
    }
  }
  if (Object.keys(col).length < COLUMNS.length) return result([], records.length - 1, 0)

  const lastNeeded = Math.max(...Object.values(col))
  const scans: Scan[] = []
  const firstRow = new Map<string, number>()
  let cal = 0
  let rowsRead = 0

  for (const rec of records.slice(1)) {
    if (rec.fields.every((f) => f.trim() === '')) continue
    rowsRead++
    if (rec.fields.length <= lastNeeded) {
      block(rec.line, '', rec.fields.join(','),
        `The row has ${rec.fields.length} column(s); at least ${lastNeeded + 1} are needed for the required columns.`)
      continue
    }
    const rawName = rec.fields[col.name]
    const name = normalizeScanName(rawName)
    if (name === '') {
      report.push({ row: rec.line, column: 'File Name', value: '', kind: 'skipped', message: 'No scan name; row not imported.' })
      continue
    }
    if (name.toLowerCase() === 'cal') {
      cal++
      report.push({ row: rec.line, column: 'File Name', value: rawName.trim(), kind: 'skipped', message: 'Calibration row; not imported.' })
      continue
    }

    const values: Record<string, number | null> = {}
    let rowOk = true
    for (const c of COLUMNS.slice(1)) {
      const v = rec.fields[col[c.key]].trim()
      if (v === '') {
        block(rec.line, c.label, '', `Scan ${name}: ${c.label} is blank.`)
        rowOk = false
      } else if (!NUMBER_RE.test(v)) {
        block(rec.line, c.label, v, `Scan ${name}: ${c.label} is not a number.`)
        rowOk = false
      } else {
        values[c.key] = Number(v)
      }
    }

    const key = idKey(name)
    const first = firstRow.get(key)
    if (first !== undefined) {
      block(rec.line, 'File Name', rawName.trim(), `Duplicate scan name ${name} (also on row ${first}).`)
      continue
    }
    firstRow.set(key, rec.line)
    if (!rowOk) continue

    // A scan with no width or height can't be drawn; keep it with the stop value blank.
    for (const [a, b, what, label] of [
      ['xStart', 'xStop', 'width', 'X-Stop'],
      ['yStart', 'yStop', 'height', 'Y-Stop'],
    ] as const) {
      if (values[a] === values[b]) {
        report.push({ row: rec.line, column: label, value: String(values[b]), kind: 'invalid',
          message: `Scan ${name} has no ${what} (start = stop); ${label} left blank.` })
        values[b] = null
      }
    }
    // Across the circumference seam (only when the circumference is known).
    if (C !== null && C > 0 && values.xStart !== null && values.xStop !== null) {
      const lo = Math.min(values.xStart, values.xStop)
      const hi = Math.max(values.xStart, values.xStop)
      const shift = lo >= C ? -C : hi <= 0 ? C : 0
      const was = `${values.xStart} to ${values.xStop}`
      if (shift !== 0) {
        values.xStart += shift
        values.xStop += shift
        report.push({ row: rec.line, column: 'X-Start', value: was, kind: 'wrapped',
          message: `Scan ${name} is wholly past the circumference seam; read as ${values.xStart} to ${values.xStop}.` })
      } else if (lo < 0 || hi > C) {
        report.push({ row: rec.line, column: 'X-Stop', value: was, kind: 'wrapped',
          message: `Scan ${name} runs across the circumference seam; it is drawn in two pieces.` })
      }
    }
    scans.push({
      id: name,
      xStart: values.xStart,
      xStop: values.xStop,
      yStart: values.yStart,
      yStop: values.yStop,
      include: true,
      noWrap: false,
      acrossSeam: false,
    })
  }

  if (scans.length === 0 && !report.some((e) => e.kind === 'blocking')) {
    block(null, '', '', 'No scan rows were found in the CSV.')
  }
  return result(scans, rowsRead, cal)
}

/**
 * Puts imported scans into a project. Like v5.0, this replaces all scans and clears the scan image
 * links (they belong to the old scans).
 */
export function replaceScans(project: Project, scans: Scan[]): Project {
  return { ...project, schemaVersion: CURRENT_SCHEMA_VERSION, scans, scanImages: [] }
}
