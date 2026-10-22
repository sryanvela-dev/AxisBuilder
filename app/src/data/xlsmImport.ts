// Imports an existing v5.0 AxisBuilder workbook (.xlsm/.xlsx bytes) into a project, plus a report.
//
// Sheets are read the way v5.0 reads them:
// - Project Settings / Drawing Information by label in column A (value in column B), ignoring case
//   and extra or non-breaking spaces, including older labels. The five custom reference labels are
//   read by position below "Reference Label Mode", as the VBA does.
// - Shell Features / Head Features by section header text, so both the current layout and the
//   older 20-nozzle layout import. Columns are found by their header text (older versions such as
//   v4.7 order the Head Features columns differently); without a header row, the v5.0 columns are used.
// - Scan Import: inputs only (A-E, L); the formula columns F-K are ignored. Scan Images: A-D.
//
// Nothing is accepted or dropped silently: every value that is skipped, changed or invalid is listed
// in the report with sheet, cell, value and reason. Bad values are left blank (or at their default)
// so the project still opens.

import * as XLSX from 'xlsx'
import { FIELD_TABLES, formatDate, isIsoDate, type FieldDef } from './settings.ts'
import {
  LIST_META,
  findMissingData,
  idKey,
  isValidClock,
  projectFileSchema,
  CURRENT_SCHEMA_VERSION,
  type ListKey,
  type Project,
} from './schema.ts'
import { formatIssues } from './projectFile.ts'

export type ReportKind =
  /** The value could not be used; left blank or at its default. */
  | 'invalid'
  /** OCR "REVIEW" text or a yellow-highlighted cell. */
  | 'review'
  /** The value was converted or renamed; the new value is in the message. */
  | 'changed'
  /** A row or value the app does not keep. */
  | 'skipped'
  /** A label or section the workbook does not have; the default was used. */
  | 'notFound'

export interface ReportEntry {
  sheet: string
  /** Cell address such as "B10", or a row range such as "rows 27-66". */
  cell: string
  /** The value found, as text ('' when blank or not applicable). */
  value: string
  kind: ReportKind
  message: string
}

export interface ImportSummary {
  /** Shell Features layout: current (40 nozzle rows) or older (20 nozzle rows). */
  layout: 'current' | 'older (20 nozzles)' | 'other'
  counts: Record<ListKey, number>
  /** Settings/info fields found in the workbook, out of those v5.0 keeps on its sheets. */
  fieldsFound: number
  fieldsTotal: number
  /** Sections whose columns were found by header in a different order from v5.0. */
  reorderedSections: ListKey[]
  /** Values that must be filled in before export (see findMissingData). */
  missingData: string[]
}

/** Where each imported value came from in the workbook (used to copy jobs between workbooks). */
export interface ImportSources {
  /** Settings / project / vessel fields found: section -> key -> sheet and row (value in column B). */
  fields: Record<string, Record<string, { sheet: string; row: number }>>
  /** Per list, one entry per imported item (same order): its row and the column of each field (null = no such column). */
  rows: Record<ListKey, { row: number; cols: Record<string, string | null> }[]>
}

export interface ImportResult {
  project: Project
  report: ReportEntry[]
  summary: ImportSummary
  sources: ImportSources
}

export class XlsmImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'XlsmImportError'
  }
}

const SHEET = {
  settings: 'Project Settings',
  info: 'Drawing Information',
  shell: 'Shell Features',
  head: 'Head Features',
  scans: 'Scan Import',
  images: 'Scan Images',
} as const

/** OCR import review fill RGB(255,255,153) and the generation check's RGB(255,255,0). */
const FLAG_FILLS: Record<string, string> = {
  FFFF99: 'highlighted yellow for review by the OCR import',
  FFFF00: 'highlighted yellow by the v5.0 generation check',
}

// --- Text helpers ----------------------------------------------------------------------------

/** Case-insensitive label key that ignores outer, repeated and non-breaking spaces. */
function labelKey(s: string): string {
  return s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
}

function hasReview(s: string): boolean {
  return /review/i.test(s)
}

/** A cell that holds only an OCR review marker, e.g. "REVIEW" or "REVIEW: smudged". */
function isReviewValue(s: string): boolean {
  return /^\s*review\b/i.test(s)
}

const NUMBER_RE = /^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/

// --- Report ----------------------------------------------------------------------------------

class Report {
  readonly entries: ReportEntry[] = []
  private readonly cells = new Set<string>()

  add(sheet: string, cell: string, value: unknown, kind: ReportKind, message: string) {
    const entry = { sheet, cell, value: displayValue(value), kind, message }
    if (this.entries.some((e) => e.sheet === sheet && e.cell === cell && e.message === message)) return
    this.entries.push(entry)
    this.cells.add(`${sheet}!${cell}`)
  }

  has(sheet: string, cell: string): boolean {
    return this.cells.has(`${sheet}!${cell}`)
  }
}

function displayValue(v: unknown): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  return String(v)
}

// --- Sheet reader ----------------------------------------------------------------------------

type Raw = string | number | boolean | undefined

class Sheet {
  readonly name: string
  readonly report: Report
  readonly lastRow: number
  private readonly ws: XLSX.WorkSheet | undefined

  constructor(name: string, ws: XLSX.WorkSheet | undefined, report: Report) {
    this.name = name
    this.ws = ws
    this.report = report
    this.lastRow = ws?.['!ref'] ? XLSX.utils.decode_range(ws['!ref']).e.r + 1 : 0
  }

  get exists(): boolean {
    return this.ws !== undefined
  }

  /** Raw cell value; undefined for empty cells. Excel error cells are reported and read as empty. */
  raw(col: string, row: number): Raw {
    const c = this.ws?.[`${col}${row}`] as XLSX.CellObject | undefined
    if (!c || c.t === 'z' || c.v === undefined || c.v === null) return undefined
    if (c.t === 'e') {
      this.report.add(this.name, `${col}${row}`, c.w ?? '#ERROR', 'invalid', 'The cell holds an Excel error; left blank.')
      return undefined
    }
    if (c.v instanceof Date) return c.v.toISOString()
    if (typeof c.v === 'string' && c.v.trim() === '') return undefined
    return c.v
  }

  text(col: string, row: number): string {
    const v = this.raw(col, row)
    return v === undefined ? '' : displayValue(v).trim()
  }

  /** Every highlighted cell on the sheet: [address, value, reason]. */
  flaggedCells(): [string, Raw, string][] {
    if (!this.ws) return []
    const out: [string, Raw, string][] = []
    for (const addr of Object.keys(this.ws)) {
      if (addr.startsWith('!')) continue
      const c = this.ws[addr] as XLSX.CellObject & { s?: { patternType?: string; fgColor?: { rgb?: string } } }
      const rgb = c.s?.patternType === 'solid' ? c.s.fgColor?.rgb?.slice(-6).toUpperCase() : undefined
      if (rgb && FLAG_FILLS[rgb]) out.push([addr, c.v as Raw, FLAG_FILLS[rgb]])
    }
    return out
  }

  /** Row of the first cell in columns A-L whose text matches one of the titles, or 0. */
  findTitleRow(titles: readonly string[], from = 1): number {
    const keys = new Set(titles.map(labelKey))
    for (let r = from; r <= this.lastRow; r++) {
      for (const col of 'ABCDEFGHIJKL') {
        const v = this.raw(col, r)
        if (typeof v === 'string' && keys.has(labelKey(v))) return r
      }
    }
    return 0
  }
}

// --- Value parsers ---------------------------------------------------------------------------
// Each parser reports what it rejects or changes and returns the value to store.

interface Cell {
  sheet: Sheet
  col: string
  row: number
}

const at = (c: Cell) => `${c.col}${c.row}`

function report(c: Cell, value: unknown, kind: ReportKind, message: string) {
  c.sheet.report.add(c.sheet.name, at(c), value, kind, message)
}

interface NumberRule {
  min?: number
  greaterThan?: number
  max?: number
  integer?: boolean
}

function ruleText(r: NumberRule): string {
  const parts: string[] = []
  if (r.greaterThan !== undefined) parts.push(`greater than ${r.greaterThan}`)
  if (r.min !== undefined && r.max !== undefined) parts.push(`${r.min} to ${r.max}`)
  else if (r.min !== undefined) parts.push(`at least ${r.min}`)
  else if (r.max !== undefined) parts.push(`at most ${r.max}`)
  if (r.integer) parts.push('a whole number')
  return parts.join(', ')
}

/** Number or null (blank / unusable). `blankMeans` finishes the "left ..." sentence. */
function parseNumber(c: Cell, rule: NumberRule = {}, blankMeans = 'left blank'): number | null {
  const v = c.sheet.raw(c.col, c.row)
  if (v === undefined) return null
  let n: number
  if (typeof v === 'number') n = v
  else if (typeof v === 'string' && NUMBER_RE.test(v.trim())) n = Number(v.trim())
  else if (typeof v === 'string' && hasReview(v)) {
    report(c, v, 'review', `OCR could not read this value; ${blankMeans}.`)
    return null
  } else {
    report(c, v, 'invalid', `Not a number; ${blankMeans}.`)
    return null
  }
  const ok =
    (rule.greaterThan === undefined || n > rule.greaterThan) &&
    (rule.min === undefined || n >= rule.min) &&
    (rule.max === undefined || n <= rule.max) &&
    (!rule.integer || Number.isInteger(n))
  if (!ok) {
    report(c, v, 'invalid', `Must be ${ruleText(rule)}; ${blankMeans}.`)
    return null
  }
  return n
}

const YES = new Set(['YES', 'Y', 'TRUE', '1'])
const NO = new Set(['NO', 'N', 'FALSE', '0'])

/** Yes/No cell. Blank gives `blank` (v5.0's behaviour for that column). */
function parseYesNo(c: Cell, blank: boolean, blankText = blank ? 'Yes' : 'No'): boolean {
  const v = c.sheet.raw(c.col, c.row)
  if (v === undefined) return blank
  if (typeof v === 'boolean') return v
  const t = String(v).trim().toUpperCase()
  if (YES.has(t)) return true
  if (NO.has(t)) return false
  report(c, v, hasReview(t) ? 'review' : 'invalid', `Not YES or NO; read as blank (${blankText}).`)
  return blank
}

/** Free text. A cell that is only an OCR REVIEW marker is left blank; REVIEW inside longer text is kept and listed. */
function parseText(c: Cell): string {
  const t = c.sheet.text(c.col, c.row)
  if (t === '') return ''
  if (isReviewValue(t)) {
    report(c, t, 'review', 'OCR could not read this value; left blank.')
    return ''
  }
  if (hasReview(t)) report(c, t, 'review', 'The text contains an OCR REVIEW note; kept as is, please check it.')
  return t
}

function canonicalChoice(value: string, choices: readonly string[], aliases: Record<string, string> = {}) {
  const k = labelKey(value).toUpperCase()
  const direct = choices.find((ch) => labelKey(ch).toUpperCase() === k)
  if (direct !== undefined) return { value: direct, alias: false }
  const viaAlias = aliases[k]
  return viaAlias !== undefined ? { value: viaAlias, alias: true } : undefined
}

/** v5.0's spellings that mean one of the choices (keys upper case, single spaces). */
const CHOICE_ALIASES: Record<string, Record<string, string>> = {
  // NormalizeVesselOrientation (also replaces "_" and "-" with spaces).
  orientation: {
    'VERTICAL VESSEL': 'Vertical',
    'CW HORIZONTAL': 'Horizontal CW',
    'HORIZONTAL CLOCKWISE': 'Horizontal CW',
    'CLOCKWISE HORIZONTAL': 'Horizontal CW',
    'CCW HORIZONTAL': 'Horizontal CCW',
    'HORIZONTAL COUNTERCLOCKWISE': 'Horizontal CCW',
    'COUNTERCLOCKWISE HORIZONTAL': 'Horizontal CCW',
    'HORIZONTAL COUNTER CLOCKWISE': 'Horizontal CCW',
    'COUNTER CLOCKWISE HORIZONTAL': 'Horizontal CCW',
  },
  referenceLabelMode: { CUSTOM: 'Custom Cardinal', OFF: 'None', NO: 'None', AUTO: 'Auto Cardinal' },
  referenceLabelSet: {
    'NDC / SDC': 'NDC/SDC',
    'NAMEPLATE D.C.': 'NamePlate DC',
    'NAMEPLATE D.C': 'NamePlate DC',
    NPDC: 'NamePlate DC',
  },
  rulerPlacement: { OFF: 'None', NO: 'None' },
}

function parseChoice(c: Cell, key: string, def: Extract<FieldDef, { type: 'choice' }>): string {
  const v = c.sheet.raw(c.col, c.row)
  const fallback = def.default
  if (v === undefined) return fallback
  let t = String(v).trim()
  if (key === 'orientation') t = t.replace(/[_-]/g, ' ')
  if (def.allowBlank && t === '') return ''
  const found = canonicalChoice(t, def.choices, CHOICE_ALIASES[key])
  if (found) {
    if (found.alias) report(c, v, 'changed', `Read as "${found.value}".`)
    return found.value
  }
  const usedText = fallback === '' ? 'left blank' : `default "${fallback}" used`
  report(
    c,
    v,
    hasReview(t) ? 'review' : 'invalid',
    `Not one of: ${def.choices.join(', ')}; ${usedText}.`,
  )
  return fallback
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

function isoDate(y: number, m: number, d: number): string {
  const s = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return isIsoDate(s) ? s : ''
}

/** Excel date or date text to "YYYY-MM-DD" ('' if unusable). */
function parseDate(c: Cell): string {
  const v = c.sheet.raw(c.col, c.row)
  if (v === undefined) return ''
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v)
    const iso = d ? isoDate(d.y, d.m, d.d) : ''
    if (iso) return iso
  } else {
    const t = String(v).trim()
    if (isReviewValue(t)) {
      report(c, v, 'review', 'OCR could not read this date; left blank.')
      return ''
    }
    let iso = ''
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t)
    if (m) iso = isoDate(+m[1], +m[2], +m[3])
    m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(t)
    if (m) iso = isoDate(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[1], +m[2])
    m = /^([A-Za-z]{3})[a-z]*[ -](\d{1,2}),?[ -](\d{4})$/.exec(t)
    if (m && MONTHS.includes(m[1].toUpperCase())) iso = isoDate(+m[3], MONTHS.indexOf(m[1].toUpperCase()) + 1, +m[2])
    if (iso) {
      report(c, v, 'changed', `Date text read as ${formatDate(iso)} (month-day-year).`)
      return iso
    }
  }
  report(c, v, 'invalid', 'Not a date; left blank.')
  return ''
}

/** Clock text from hours and minutes ("3", "3:30"). */
function clockText(hours: number, minutes: number): string {
  return minutes === 0 ? String(hours) : `${hours}:${String(minutes).padStart(2, '0')}`
}

/**
 * Head clock position. Text "3:30" or "10.5" is kept; an Excel time number (older workbooks turned
 * "3:30" into 3:30 AM) is converted; degrees ("90°") are converted and marked for review.
 */
function parseClock(c: Cell): string | null {
  const v = c.sheet.raw(c.col, c.row)
  if (v === undefined) return null
  if (typeof v === 'number') {
    if (v > 0 && v < 1) {
      const total = Math.round(v * 24 * 60)
      const h = Math.floor(total / 60)
      const m = total % 60
      if (h >= 1 && h <= 12) {
        const clock = clockText(h, m)
        report(c, v, 'changed', `Excel time value read as clock position ${clock}.`)
        return clock
      }
    } else if (isValidClock(String(v))) {
      return String(v)
    }
    report(c, v, 'invalid', 'Not a clock position from 1 to 12; left blank.')
    return null
  }
  const t = String(v).trim()
  if (hasReview(t)) {
    report(c, v, 'review', 'OCR could not read this clock position; left blank.')
    return null
  }
  const deg = /^(\d+(?:\.\d+)?)\s*°$/.exec(t)
  if (deg) {
    const total = Math.round(((Number(deg[1]) % 360) / 30) * 60)
    const h = Math.floor(total / 60) === 0 ? 12 : Math.floor(total / 60)
    const clock = clockText(h, total % 60)
    report(c, v, 'review', `Degrees converted to clock position ${clock}; please check it.`)
    return clock
  }
  const hm = /^(\d{1,2}):(\d{2})(?::00)?$/.exec(t)
  const normalized = hm ? `${Number(hm[1])}:${hm[2]}` : t
  if (isValidClock(normalized)) return normalized
  report(c, v, 'invalid', 'Not a clock position from 1 to 12 (such as 3, 1:30 or 10.5); left blank.')
  return null
}

// --- Settings, vessel and project info -------------------------------------------------------

interface LabelIndex {
  rows: Map<string, number>
  used: Set<number>
}

function indexLabels(sheet: Sheet): LabelIndex {
  const rows = new Map<string, number>()
  for (let r = 1; r <= sheet.lastRow; r++) {
    const v = sheet.raw('A', r)
    if (typeof v === 'string' && !rows.has(labelKey(v))) rows.set(labelKey(v), r)
  }
  return { rows, used: new Set() }
}

function importFields(
  sheets: Record<string, Sheet>,
  result: Record<string, Record<string, unknown>>,
  sources: ImportSources['fields'],
) {
  const index = {
    [SHEET.settings]: indexLabels(sheets[SHEET.settings]),
    [SHEET.info]: indexLabels(sheets[SHEET.info]),
  }
  let found = 0
  let total = 0
  const refRow = index[SHEET.settings].rows.get(labelKey('Reference Label Mode')) ?? 0
  const refKeys = ['refLabel0', 'refLabel90', 'refLabel180', 'refLabel270', 'refLabel360']

  for (const table of FIELD_TABLES) {
    const out: Record<string, unknown> = {}
    for (const [key, def] of Object.entries(table.fields as Record<string, FieldDef>)) {
      if (def.onSheet === false) continue
      total++
      const sheet = sheets[def.excelSheet]
      const idx = index[def.excelSheet]
      let row = 0
      const refIndex = refKeys.indexOf(key)
      if (refIndex >= 0) {
        // The VBA reads the custom labels by position: 3 to 7 rows below Reference Label Mode.
        row = refRow ? refRow + 3 + refIndex : 0
        if (row && !/^ref\b.*label$/i.test(labelKey(sheet.text('A', row)))) {
          sheet.report.add(sheet.name, `A${row}`, sheet.text('A', row), 'notFound',
            `Expected the "${def.excelLabel}" row here (${3 + refIndex} rows below Reference Label Mode); blank used.`)
          continue
        }
      } else {
        for (const label of [def.excelLabel, ...(def.legacyLabels ?? [])]) {
          row = idx.rows.get(labelKey(label)) ?? 0
          if (row) break
        }
      }
      if (!row) {
        const shown = def.default === '' || def.default === null ? 'blank' : `"${displayValue(def.default)}"`
        sheet.report.add(sheet.name, 'column A', def.excelLabel, 'notFound', `No "${def.excelLabel}" row; ${shown} used.`)
        continue
      }
      found++
      idx.used.add(row)
      ;(sources[table.section] ??= {})[key] = { sheet: sheet.name, row }
      const c: Cell = { sheet, col: 'B', row }
      switch (def.type) {
        case 'text':
          out[key] = parseText(c)
          break
        case 'date':
          out[key] = parseDate(c)
          break
        case 'yesNo':
          out[key] = parseYesNo(c, def.default)
          break
        case 'choice':
          out[key] = parseChoice(c, key, def)
          break
        case 'number': {
          const shown = def.default === null ? 'left blank' : `default ${def.default} used`
          const n = parseNumber(c, def, shown)
          out[key] = n ?? def.default
          break
        }
      }
    }
    result[table.section] = out
  }

  // Rows the app has no field for (dropped settings, extra rows) are listed, never dropped silently.
  for (const name of [SHEET.settings, SHEET.info] as const) {
    const sheet = sheets[name]
    for (const [label, row] of index[name].rows) {
      if (index[name].used.has(row) || label === 'setting' || label === 'field') continue
      const value = sheet.raw('B', row)
      if (value === undefined) continue
      sheet.report.add(name, `B${row}`, value, 'skipped', `The app has no "${sheet.text('A', row)}" setting; not imported.`)
    }
  }
  return { found, total }
}

// --- Lists -----------------------------------------------------------------------------------

type ColumnKind =
  | 'id'
  | 'position'
  | 'size'
  | 'nozzleMinT'
  | 'mutMinT'
  | 'notes'
  | 'include'
  | 'showLabel'
  | 'labelMode'
  | 'head'
  | 'clock'
  | 'radius'
  | 'customPercent'
  | 'fileName'

interface Column {
  col: string
  key: string
  kind: ColumnKind
}

/** Kinds that hold real data; a row with only these blank is empty (OCR pre-fills the others). */
const DATA_KINDS = new Set<ColumnKind>([
  'id', 'position', 'size', 'nozzleMinT', 'mutMinT', 'notes', 'clock', 'customPercent', 'fileName',
])

const RADIUS_ALIASES: Record<string, string> = {
  C: 'CENTER', CENTER: 'CENTER',
  H: 'HALF', HALF: 'HALF', 'HALF RADIUS': 'HALF',
  T: 'THREE_QUARTER', THREE_QUARTER: 'THREE_QUARTER', 'THREE QUARTER': 'THREE_QUARTER',
  'THREE-QUARTER': 'THREE_QUARTER', '3/4': 'THREE_QUARTER', '3-4': 'THREE_QUARTER',
  O: 'OUTER', OUTER: 'OUTER', 'OUTER RADIUS': 'OUTER',
  X: 'CUSTOM', CUSTOM: 'CUSTOM', 'CUSTOM RADIUS': 'CUSTOM',
}

function parseColumn(c: Cell, kind: ColumnKind): unknown {
  switch (kind) {
    case 'position':
      return parseNumber(c)
    case 'size':
      return parseNumber(c, { greaterThan: 0 })
    case 'nozzleMinT': {
      const t = c.sheet.text(c.col, c.row)
      return t.toUpperCase() === 'TOL' ? 'TOL' : parseNumber(c, { min: 0 })
    }
    case 'mutMinT':
      return parseNumber(c, { min: 0 })
    case 'notes':
    case 'fileName':
      return parseText(c)
    case 'include':
      return parseYesNo(c, true)
    case 'showLabel':
      return parseYesNo(c, false)
    case 'labelMode': {
      const t = c.sheet.text(c.col, c.row).toUpperCase()
      if (t === '') return 'AUTO'
      if (t === 'AUTO' || t === 'INSIDE' || t === 'OUTSIDE') return t
      report(c, t, hasReview(t) ? 'review' : 'invalid', 'Not AUTO, INSIDE or OUTSIDE; AUTO used.')
      return 'AUTO'
    }
    case 'clock':
      return parseClock(c)
    case 'radius': {
      const raw = c.sheet.text(c.col, c.row)
      if (raw === '') return 'CENTER'
      const found = RADIUS_ALIASES[labelKey(raw).toUpperCase()]
      if (found) return found
      report(c, raw, hasReview(raw) ? 'review' : 'invalid',
        'Not CENTER, HALF, THREE_QUARTER, OUTER or CUSTOM; left unselected, choose a radius position (v5.0 drew it at half radius).')
      return null
    }
    case 'customPercent': {
      const f = parseNumber(c, { min: 0, max: 1 })
      // v5.0 stores a 0-1 fraction of the radius; the app stores a percent.
      return f === null ? null : Math.round(f * 100 * 1e6) / 1e6
    }
    case 'id':
    case 'head':
      return c.sheet.text(c.col, c.row)
  }
}

interface SectionSpec {
  list: ListKey
  sheet: string
  titles: readonly string[]
  /** Column A text of the column-header row. */
  header: string
  /** v5.0 rows (current layout) used if the section header can't be found. */
  fallback: [number, number]
  columns: Column[]
}

const col = (c: string, key: string, kind: ColumnKind): Column => ({ col: c, key, kind })

/** Column header texts per list field (current v5.0 names first). Used to find columns by name. */
const HEADER_NAMES: Record<ListKey, Record<string, string[]>> = {
  circWelds: { id: ['Weld ID'], y: ['Y Position'], include: ['Include'], showLabel: ['Label'] },
  longSeams: {
    id: ['Seam ID'], x: ['X Position'], startY: ['Start Y'], stopY: ['Stop Y'], include: ['Include'], showLabel: ['Label'],
  },
  shellNozzles: {
    id: ['Nozzle Name'], diameter: ['Diameter'], x: ['X'], y: ['Y'], minT: ['Min. T.', 'Min T'], notes: ['Notes'],
    include: ['Include'], labelMode: ['Label Mode'],
  },
  objects: {
    id: ['Object ID'], x: ['X Position'], y: ['Y Position'], circWidth: ['Circ. Width'], length: ['Length'],
    include: ['Include'], notes: ['Notes'],
  },
  shellMut: { id: ['MUT ID'], x: ['X Position'], y: ['Y Position'], minT: ['Min. T.', 'Min T'], notes: ['Notes'] },
  headNozzles: {
    head: ['Head'], id: ['Nozzle'], diameter: ['Nozzle Diameter'], clock: ['Clock Position'],
    radiusPosition: ['Radius Position'], customRadiusPercent: ['Custom Radius Factor'], minT: ['Min. T.', 'Min T'],
    notes: ['Notes'], labelMode: ['Label Mode'], include: ['Include Label', 'Include'],
  },
  headMut: {
    head: ['Head'], id: ['MUT ID'], clock: ['Clock Position'], radiusPosition: ['Radius Position'],
    customRadiusPercent: ['Custom Radius Factor'], minT: ['Min. T.', 'Min T'], labelMode: ['Label Mode'],
    include: ['Include Label', 'Include'], notes: ['Notes'],
  },
  scans: { id: ['Scan Name'], xStart: ['X Start'], xStop: ['X Stop'], yStart: ['Y Start'], yStop: ['Y Stop'], include: ['Include'] },
  scanImages: { scanId: ['Scan Name'], imageFile: ['Image File'], processedImage: ['Processed Image'], include: ['Include'] },
}

const SECTIONS: SectionSpec[] = [
  {
    list: 'circWelds', sheet: SHEET.shell, header: 'Weld ID', fallback: [3, 12],
    titles: ['Circumfrential Welds', 'Circumferential Welds', 'Circ Welds'],
    columns: [col('A', 'id', 'id'), col('B', 'y', 'position'), col('C', 'include', 'include'), col('D', 'showLabel', 'showLabel')],
  },
  {
    list: 'longSeams', sheet: SHEET.shell, header: 'Seam ID', fallback: [15, 24],
    titles: ['Long Seam Welds', 'Long Seams'],
    columns: [
      col('A', 'id', 'id'), col('B', 'x', 'position'), col('C', 'startY', 'position'), col('D', 'stopY', 'position'),
      col('E', 'include', 'include'), col('F', 'showLabel', 'showLabel'),
    ],
  },
  {
    list: 'shellNozzles', sheet: SHEET.shell, header: 'Nozzle Name', fallback: [27, 66],
    titles: ['Shell Nozzles', 'Nozzles / Circles', 'Nozzles'],
    columns: [
      col('A', 'id', 'id'), col('B', 'diameter', 'size'), col('C', 'x', 'position'), col('D', 'y', 'position'),
      col('E', 'minT', 'nozzleMinT'), col('F', 'notes', 'notes'), col('G', 'include', 'include'),
      col('H', 'labelMode', 'labelMode'),
    ],
  },
  {
    list: 'objects', sheet: SHEET.shell, header: 'Object ID', fallback: [69, 88],
    titles: ['Objects'],
    columns: [
      col('A', 'id', 'id'), col('B', 'x', 'position'), col('C', 'y', 'position'), col('D', 'circWidth', 'size'),
      col('E', 'length', 'size'), col('F', 'include', 'include'), col('G', 'notes', 'notes'),
    ],
  },
  {
    list: 'shellMut', sheet: SHEET.shell, header: 'MUT ID', fallback: [91, 110],
    titles: ['Shell MUT', 'Shell M.U.T.'],
    columns: [
      col('A', 'id', 'id'), col('B', 'x', 'position'), col('C', 'y', 'position'), col('D', 'minT', 'mutMinT'),
      col('E', 'notes', 'notes'),
    ],
  },
  {
    list: 'headNozzles', sheet: SHEET.head, header: 'Head', fallback: [4, 23],
    titles: ['Head Nozzles'],
    columns: [
      col('A', 'head', 'head'), col('B', 'id', 'id'), col('C', 'diameter', 'size'), col('D', 'clock', 'clock'),
      col('E', 'radiusPosition', 'radius'), col('F', 'customRadiusPercent', 'customPercent'),
      col('G', 'minT', 'nozzleMinT'), col('H', 'notes', 'notes'), col('I', 'labelMode', 'labelMode'),
      col('J', 'include', 'include'),
    ],
  },
  {
    list: 'headMut', sheet: SHEET.head, header: 'Head', fallback: [28, 47],
    titles: ['Head MUT', 'Head M.U.T.', 'Head MUT Readings'],
    columns: [
      col('A', 'head', 'head'), col('B', 'id', 'id'), col('C', 'clock', 'clock'), col('D', 'radiusPosition', 'radius'),
      col('E', 'customRadiusPercent', 'customPercent'), col('F', 'minT', 'mutMinT'), col('G', 'labelMode', 'labelMode'),
      col('H', 'include', 'include'), col('I', 'notes', 'notes'),
    ],
  },
  {
    list: 'scans', sheet: SHEET.scans, header: 'Scan Name', fallback: [3, 152],
    titles: ['Scan Import'],
    columns: [
      col('A', 'id', 'id'), col('B', 'xStart', 'position'), col('C', 'xStop', 'position'), col('D', 'yStart', 'position'),
      col('E', 'yStop', 'position'), col('L', 'include', 'include'),
    ],
  },
  {
    list: 'scanImages', sheet: SHEET.images, header: 'Scan Name', fallback: [3, 152],
    titles: ['Scan Images'],
    columns: [
      col('A', 'scanId', 'id'), col('B', 'imageFile', 'fileName'), col('C', 'processedImage', 'fileName'),
      col('D', 'include', 'include'),
    ],
  },
]

const ALL_TITLES = new Map<string, Set<string>>()
for (const s of SECTIONS) {
  const set = ALL_TITLES.get(s.sheet) ?? new Set<string>()
  s.titles.forEach((t) => set.add(labelKey(t)))
  ALL_TITLES.set(s.sheet, set)
}

/** First and last data row of a section, found by its header text like the VBA does. */
/** First and last data row, and the column-header row (0 if not found). */
function sectionRows(sheet: Sheet, spec: SectionSpec): [number, number, number] {
  const title = sheet.findTitleRow(spec.titles)
  if (!title) {
    sheet.report.add(sheet.name, `rows ${spec.fallback[0]}-${spec.fallback[1]}`, '', 'notFound',
      `Section header "${spec.titles[0]}" not found; read the v5.0 rows ${spec.fallback[0]}-${spec.fallback[1]}.`)
    return [...spec.fallback, 0]
  }
  let first = title + 2
  let headerRow = 0
  for (let r = title + 1; r <= title + 3; r++) {
    if (labelKey(sheet.text('A', r)) === labelKey(spec.header)) {
      first = r + 1
      headerRow = r
      break
    }
  }
  const titles = ALL_TITLES.get(spec.sheet)!
  let last = sheet.lastRow
  for (let r = first; r <= sheet.lastRow; r++) {
    if (titles.has(labelKey(sheet.text('A', r)))) {
      last = r - 1
      break
    }
  }
  return [first, last, headerRow]
}

/**
 * The column of each field: found by header text when the section has a header row. A field whose
 * header is missing keeps its v5.0 column only if that column has no other header; otherwise the field
 * has no column in this layout (col '').
 */
function resolveColumns(sheet: Sheet, spec: SectionSpec, headerRow: number): Column[] {
  if (!headerRow) return spec.columns
  const byHeader = new Map<string, string>()
  for (const letter of 'ABCDEFGHIJKL') {
    const t = sheet.text(letter, headerRow)
    if (t && !byHeader.has(labelKey(t))) byHeader.set(labelKey(t), letter)
  }
  return spec.columns.map((c) => {
    const names = HEADER_NAMES[spec.list][c.key] ?? []
    const found = names.map((h) => byHeader.get(labelKey(h))).find(Boolean)
    if (found) return { ...c, col: found }
    if (sheet.text(c.col, headerRow) === '') return c
    sheet.report.add(sheet.name, `row ${headerRow}`, '', 'notFound',
      `${LIST_META[spec.list].name}: no "${names[0] ?? c.key}" column in this layout; left blank.`)
    return { ...c, col: '' }
  })
}

/** The value a field gets when its column does not exist in the workbook (same as a blank cell). */
function blankValue(kind: ColumnKind): unknown {
  switch (kind) {
    case 'include':
      return true
    case 'showLabel':
      return false
    case 'labelMode':
      return 'AUTO'
    case 'radius':
      return 'CENTER'
    case 'notes':
    case 'fileName':
      return ''
    default:
      return null
  }
}

function importSection(
  sheet: Sheet,
  spec: SectionSpec,
): { items: Record<string, unknown>[]; rows: number[]; first: number; columns: Column[]; reordered: boolean } {
  const items: Record<string, unknown>[] = []
  const rows: number[] = []
  if (!sheet.exists) return { items, rows, first: 0, columns: spec.columns, reordered: false }
  const [first, last, headerRow] = sectionRows(sheet, spec)
  const columns = resolveColumns(sheet, spec, headerRow)
  const reordered = columns.some((c, i) => c.col !== spec.columns[i].col)
  const idCol = columns.find((c) => c.kind === 'id')!
  const headCol = columns.find((c) => c.kind === 'head')

  for (let r = first; r <= last; r++) {
    const dataCells = columns.filter((c) => c.col && DATA_KINDS.has(c.kind) && sheet.raw(c.col, r) !== undefined)
    if (dataCells.length === 0) continue
    const id = sheet.text(idCol.col, r)
    const where: Cell = { sheet, col: idCol.col, row: r }
    if (id === '') {
      sheet.report.add(sheet.name, `row ${r}`, '', 'skipped', `${LIST_META[spec.list].name}: the row has data but no ID; not imported.`)
      continue
    }
    if (hasReview(id)) {
      report(where, id, 'review', `${LIST_META[spec.list].name}: OCR could not read the ID; row not imported.`)
      continue
    }
    const item: Record<string, unknown> = {}
    if (headCol) {
      const h = sheet.text(headCol.col, r).toUpperCase().replace(/_/g, ' ')
      const head = ({ H1: 'HEAD 1', '1': 'HEAD 1', HEAD1: 'HEAD 1', 'HEAD 1': 'HEAD 1',
        H2: 'HEAD 2', '2': 'HEAD 2', HEAD2: 'HEAD 2', 'HEAD 2': 'HEAD 2' } as Record<string, string>)[h]
      if (!head) {
        report({ sheet, col: headCol.col, row: r }, h, 'invalid', `Head must be HEAD 1 or HEAD 2; row "${id}" not imported.`)
        continue
      }
      item.head = head
    }
    for (const c of columns) {
      if (c.kind === 'head') continue
      item[c.key] = c.kind === 'id' ? id : c.col ? parseColumn({ sheet, col: c.col, row: r }, c.kind) : blankValue(c.kind)
    }
    items.push(item)
    rows.push(r)
  }
  return { items, rows, first, columns, reordered }
}

/** Renames repeated IDs (shared across the given lists) so nothing is dropped; each rename is listed. */
function makeIdsUnique(
  lists: { spec: SectionSpec; items: Record<string, unknown>[]; rows: number[] }[],
  sheets: Record<string, Sheet>,
) {
  const used = new Map<string, string>()
  for (const { spec, items, rows } of lists) {
    const field = LIST_META[spec.list].idField
    items.forEach((item, i) => {
      const id = String(item[field])
      if (!used.has(idKey(id))) {
        used.set(idKey(id), spec.list)
        return
      }
      let n = 2
      while (used.has(idKey(`${id} (${n})`))) n++
      const renamed = `${id} (${n})`
      used.set(idKey(renamed), spec.list)
      item[field] = renamed
      const idCol = spec.columns.find((c) => c.kind === 'id')!.col
      sheets[spec.sheet].report.add(spec.sheet, `${idCol}${rows[i]}`, id, 'changed',
        `${LIST_META[spec.list].name}: ID already used; renamed to "${renamed}" (IDs must be unique).`)
    })
  }
}

// --- Entry point -----------------------------------------------------------------------------

/** Imports a v5.0 workbook. Throws XlsmImportError only if the file is not a readable AxisBuilder workbook. */
export function importWorkbook(bytes: ArrayBuffer | Uint8Array): ImportResult {
  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(bytes, { type: 'array', cellStyles: true, cellFormula: false, cellHTML: false })
  } catch {
    throw new XlsmImportError('The file could not be read as an Excel workbook.')
  }
  if (!wb.Sheets[SHEET.settings]) {
    throw new XlsmImportError(`This is not an AxisBuilder v5.0 workbook (no "${SHEET.settings}" sheet).`)
  }

  const rep = new Report()
  const sheets: Record<string, Sheet> = {}
  for (const name of Object.values(SHEET)) {
    sheets[name] = new Sheet(name, wb.Sheets[name], rep)
    if (!wb.Sheets[name]) rep.add(name, '', '', 'notFound', `The workbook has no "${name}" sheet; nothing imported from it.`)
  }

  const data: Record<string, unknown> = { schemaVersion: CURRENT_SCHEMA_VERSION }
  const fieldSources: ImportSources['fields'] = {}
  const fields = importFields(sheets, data as Record<string, Record<string, unknown>>, fieldSources)

  const lists = SECTIONS.map((spec) => ({ spec, ...importSection(sheets[spec.sheet], spec) }))
  const byList = Object.fromEntries(lists.map((l) => [l.spec.list, l])) as Record<ListKey, (typeof lists)[number]>

  // Scans with no width or height can't be drawn; v5.0 blocks them. The stop value is left blank.
  byList.scans.items.forEach((s, i) => {
    for (const [a, b, what] of [['xStart', 'xStop', 'width'], ['yStart', 'yStop', 'height']] as const) {
      if (s[a] !== null && s[a] === s[b]) {
        const c = b === 'xStop' ? 'C' : 'E'
        rep.add(SHEET.scans, `${c}${byList.scans.rows[i]}`, s[b], 'invalid',
          `Scan "${String(s.id)}" has no ${what} (start = stop); stop left blank.`)
        s[b] = null
      }
    }
  })

  makeIdsUnique([byList.circWelds], sheets)
  makeIdsUnique([byList.longSeams], sheets)
  makeIdsUnique([byList.shellNozzles, byList.headNozzles], sheets)
  makeIdsUnique([byList.objects], sheets)
  makeIdsUnique([byList.shellMut, byList.headMut], sheets)
  makeIdsUnique([byList.scans], sheets)

  // Scan Images rows must point at a scan; one image row per scan.
  const scanIds = new Map(byList.scans.items.map((s) => [idKey(String(s.id)), String(s.id)]))
  const imaged = new Set<string>()
  const keep: number[] = []
  byList.scanImages.items.forEach((img, i) => {
    const row = byList.scanImages.rows[i]
    const key = idKey(String(img.scanId))
    const scanId = scanIds.get(key)
    if (!scanId) {
      rep.add(SHEET.images, `A${row}`, img.scanId, 'skipped', 'No AUT scan with this name on Scan Import; image row not imported.')
    } else if (imaged.has(key)) {
      rep.add(SHEET.images, `A${row}`, img.scanId, 'skipped', 'This scan already has an image row above; row not imported.')
    } else {
      imaged.add(key)
      img.scanId = scanId
      keep.push(i)
    }
  })
  byList.scanImages.items = keep.map((i) => byList.scanImages.items[i])
  byList.scanImages.rows = keep.map((i) => byList.scanImages.rows[i])

  // Scan Images notes (column F) have no place in the project; the template's instruction note is ignored.
  const images = sheets[SHEET.images]
  for (let r = 3; r <= images.lastRow; r++) {
    const note = images.text('F', r)
    if (note && !note.startsWith('The Image File column controls')) {
      rep.add(SHEET.images, `F${r}`, note, 'skipped', 'Scan Images notes are not kept by the app.')
    }
  }

  for (const l of lists) data[l.spec.list] = l.items

  // Yellow-highlighted cells not already listed: the value was kept.
  for (const sheet of Object.values(sheets)) {
    for (const [addr, value, why] of sheet.flaggedCells()) {
      if (!rep.has(sheet.name, addr)) rep.add(sheet.name, addr, value, 'review', `Cell is ${why}; value kept, please check it.`)
    }
  }

  const parsed = projectFileSchema.safeParse(data, { reportInput: true })
  if (!parsed.success) {
    // The importer should never build an invalid project; this is a bug if it happens.
    throw new XlsmImportError(`Import produced an invalid project:\n${formatIssues(parsed.error.issues, data).join('\n')}`)
  }
  const project = parsed.data

  const objectsStart = byList.objects.first
  return {
    project,
    report: rep.entries,
    summary: {
      layout: objectsStart === 69 ? 'current' : objectsStart === 49 ? 'older (20 nozzles)' : 'other',
      counts: Object.fromEntries(lists.map((l) => [l.spec.list, project[l.spec.list].length])) as Record<ListKey, number>,
      fieldsFound: fields.found,
      fieldsTotal: fields.total,
      reorderedSections: lists.filter((l) => l.reordered).map((l) => l.spec.list),
      missingData: findMissingData(project),
    },
    sources: {
      fields: fieldSources,
      rows: Object.fromEntries(
        lists.map((l) => [
          l.spec.list,
          l.rows.map((row) => ({ row, cols: Object.fromEntries(l.columns.map((c) => [c.key, c.col || null])) })),
        ]),
      ) as ImportSources['rows'],
    },
  }
}

/** The v5.0 workbook column of each list field (current layout), e.g. headNozzles.clock -> "D". */
export function v5Columns(): Record<ListKey, Record<string, string>> {
  return Object.fromEntries(
    SECTIONS.map((s) => [s.list, Object.fromEntries(s.columns.map((c) => [c.key, c.col]))]),
  ) as Record<ListKey, Record<string, string>>
}
