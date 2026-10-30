// The AUT Solutions scansheet.csv with results (report design section 5), and the same columns pasted from Excel.
//
// One import for both sides: the positions go through the drawing's own AUT CSV import (data/autCsvImport.ts: "cal"
// rows skipped, duplicates, reversed X, across the seam), and the results (increments, readings, Min / Avg / Nom 'T',
// Wall Remain %, comments) become the report's scan results. With no scans in the job the CSV creates them; otherwise
// rows are matched to the drawing's scans by scan number and positions that differ are listed for the user to choose.
// Wall Remain % is read but never trusted: wall loss is recalculated, and a difference over 0.1% is listed.
//
// A paste (from Excel, often without every column) goes through the same steps after a column match: columns not
// pasted stay blank, readings and increments that can be worked out exactly are filled in and marked "calculated",
// a blank Min / Avg 'T' is left blank and listed. A second paste matched by scan number fills in what the first lacked.

import { headerKey, importAutCsv, normalizeScanName, parseCsv, decodeCsv, replaceScans, type AutReportEntry } from '../data/autCsvImport.ts'
import { scanNumberFromName } from '../data/imageMatch.ts'
import { idKey, type Project, type Scan } from '../data/schema.ts'
import { circumference } from '../engine/wrap.ts'
import { wallLossPercent } from './calc/ladder.ts'
import { readingsFromIncrements } from './calc/numbers.ts'
import { scanSpanX } from './calc/results.ts'
import { createReport, resultOf, scanComponent } from './report.ts'
import { scanResultSchema, type CalculatedField, type Report, type ScanResult } from './schema.ts'

// --- Columns ---------------------------------------------------------------------------------

export const SCANSHEET_COLUMNS = [
  { key: 'name', label: 'File Name', accepted: ['filename', 'scanname', 'file', 'scan', 'name'] },
  { key: 'xStart', label: 'X-Start', accepted: ['xstart'] },
  { key: 'xStop', label: 'X-Stop', accepted: ['xstop'] },
  { key: 'yStart', label: 'Y-Start', accepted: ['ystart'] },
  { key: 'yStop', label: 'Y-Stop', accepted: ['ystop'] },
  { key: 'incrX', label: 'X-Incr.', accepted: ['xincr', 'xincrement', 'xinterval', 'xindex'] },
  { key: 'incrY', label: 'Y-Incr.', accepted: ['yincr', 'yincrement', 'yinterval', 'yindex'] },
  { key: 'readings', label: 'Readings', accepted: ['readings', 'reading', 'points'] },
  { key: 'minT', label: "Min. 'T'", accepted: ['mint', 'min', 'minthk', 'minthickness', 'minimumthickness'] },
  { key: 'avgT', label: "Ave 'T'", accepted: ['avet', 'avgt', 'ave', 'avg', 'average', 'averagethickness', 'avethickness'] },
  { key: 'nomT', label: "Nom. 'T'", accepted: ['nomt', 'nom', 'nominal', 'nominalthickness'] },
  { key: 'wallRemain', label: 'Wall Remain %', accepted: ['wallremain%', 'wallremain', 'remain%', 'wallremaining%', 'wallremaining'] },
  { key: 'comment', label: 'Comments', accepted: ['comments', 'comment'] },
] as const

export type ScansheetKey = (typeof SCANSHEET_COLUMNS)[number]['key']
const POSITION_KEYS = ['xStart', 'xStop', 'yStart', 'yStop'] as const

/** The column a header names (ignoring case, spaces and - _ . ' "), or null. */
export function matchScansheetHeader(header: string): ScansheetKey | null {
  const k = headerKey(header)
  if (k === '') return null
  return SCANSHEET_COLUMNS.find((c) => (c.accepted as readonly string[]).includes(k))?.key ?? null
}

export interface ScansheetMapping {
  /** The first row holds column titles. */
  hasHeader: boolean
  /** Per pasted column: the scansheet column it holds, or null to leave it out. */
  columns: (ScansheetKey | null)[]
}

/**
 * The app's guess at what each pasted column is: by header when most of the first row's cells name a column, else
 * in the CSV's own order. The user fixes any guess before the rows are read.
 */
export function guessScansheetMapping(rows: readonly string[][]): ScansheetMapping {
  const first = rows[0] ?? []
  const width = Math.max(0, ...rows.map((r) => r.length))
  const matched = first.map(matchScansheetHeader)
  const filled = first.filter((h) => h.trim() !== '').length
  const hits = matched.filter((m) => m !== null).length
  if (hits > 0 && hits * 2 >= filled) {
    const seen = new Set<ScansheetKey>()
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
  return { hasHeader: false, columns: Array.from({ length: width }, (_, i) => SCANSHEET_COLUMNS[i]?.key ?? null) }
}

// --- Reading the rows ------------------------------------------------------------------------

export type ScansheetReportKind =
  | AutReportEntry['kind']
  /** A value that could not be read (left blank). */
  | 'missing'
  /** Worked out and marked "calculated". */
  | 'calculated'
  /** Read, and differs from what the app works out (Wall Remain %, readings). */
  | 'mismatch'
  /** A drawing position that differs from the CSV (the user chooses). */
  | 'position'
  /** A row with no matching scan in the drawing, or a drawing scan the file lacks. */
  | 'unmatched'
  /** A start larger than its stop, swapped (as the drawing draws it). */
  | 'swapped'
  | 'note'

export interface ScansheetReportEntry {
  /** Line in the CSV, or pasted row (1 = first row, header included); null for the whole file. */
  row: number | null
  column: string
  value: string
  kind: ScansheetReportKind
  message: string
}

/** The results of one row, keyed by the CSV's scan name. */
export interface ScansheetRow {
  row: number
  name: string
  /** The drawing scan it matched (by scan number), or null. */
  scanId: string | null
  values: Partial<Record<Exclude<ScansheetKey, 'name' | 'comment'>, number>>
  comment: string
  calculated: CalculatedField[]
}

export interface PositionDiff {
  scanId: string
  csv: Pick<Scan, 'xStart' | 'xStop' | 'yStart' | 'yStop'>
  drawing: Pick<Scan, 'xStart' | 'xStop' | 'yStart' | 'yStop'>
}

export interface ScansheetImport {
  /** False when a blocking problem was found; nothing should be applied. */
  ok: boolean
  /** 'create': the job had no scans and the file makes them; 'match': results matched to the drawing's scans. */
  mode: 'create' | 'match'
  /** The scans read from the file (create mode: the job's new scans). */
  scans: Scan[]
  rows: ScansheetRow[]
  positionDiffs: PositionDiff[]
  report: ScansheetReportEntry[]
}

const NUMBER_RE = /^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/

/** A number cell; "97.9%" and "1,234" are read too. */
function numberCell(text: string): number | null | 'bad' {
  const t = text.trim().replace(/,/g, '').replace(/%$/, '').replace(/^(\d*\.?\d+)\s*("|in|'')$/, '$1')
  if (t === '') return null
  return NUMBER_RE.test(t) ? Number(t) : 'bad'
}

const quote = (s: string) => `"${s.replace(/"/g, '""')}"`

/** Reads a scansheet CSV (bytes or text). Never throws; check `ok` and `report`. */
export function importScansheet(input: ArrayBuffer | Uint8Array | string, project: Project): ScansheetImport {
  const text = typeof input === 'string' ? input.replace(/^﻿/, '') : decodeCsv(input)
  const records = parseCsv(text)
  if (records.length === 0) {
    return { ok: false, mode: project.scans.length ? 'match' : 'create', scans: [], rows: [], positionDiffs: [],
      report: [{ row: null, column: '', value: '', kind: 'blocking', message: 'The CSV is empty.' }] }
  }
  const header = records[0].fields
  const columns = header.map(matchScansheetHeader)
  const seen = new Set<ScansheetKey>()
  const mapping: ScansheetMapping = { hasHeader: true, columns: columns.map((c) => (c === null || seen.has(c) ? null : (seen.add(c), c))) }
  return readScansheet(project, records.map((r) => r.fields), mapping, records.map((r) => r.line), 'csv')
}

/** Reads rows pasted from Excel with the user's column match. */
export function buildScansheetPaste(project: Project, rows: readonly string[][], mapping: ScansheetMapping): ScansheetImport {
  const all = mapping.hasHeader ? rows : [mapping.columns.map((c) => c ?? ''), ...rows]
  const lines = all.map((_, i) => (mapping.hasHeader ? i + 1 : i))
  return readScansheet(project, all, { ...mapping, hasHeader: true }, lines, 'paste')
}

/**
 * Rows (header first) with their column keys. `lines` gives each row's number for the report (CSV line, or pasted
 * row; 0 = a header made up for a paste without one).
 */
function readScansheet(project: Project, rows: readonly string[][], mapping: ScansheetMapping, lines: readonly number[], source: 'csv' | 'paste'): ScansheetImport {
  const report: ScansheetReportEntry[] = []
  const col = new Map<ScansheetKey, number>()
  mapping.columns.forEach((k, i) => {
    if (k !== null && !col.has(k)) col.set(k, i)
  })
  const label = (k: ScansheetKey) => SCANSHEET_COLUMNS.find((c) => c.key === k)!.label
  const C = circumference(project)
  const mode = project.scans.length === 0 ? 'create' : 'match'
  const fail = (message: string): ScansheetImport => ({ ok: false, mode, scans: [], rows: [], positionDiffs: [], report: [...report, { row: null, column: '', value: '', kind: 'blocking', message }] })

  if (!col.has('name')) return fail(`No scan name column ("File Name").`)
  const hasPositions = POSITION_KEYS.every((k) => col.has(k))
  if (mode === 'create' && !hasPositions) {
    return fail(`The job has no scans yet, so the ${source === 'csv' ? 'file' : 'paste'} needs X-Start, X-Stop, Y-Start and Y-Stop to place them (missing: ${POSITION_KEYS.filter((k) => !col.has(k)).map(label).join(', ')}).`)
  }
  if (source === 'csv') {
    for (const c of SCANSHEET_COLUMNS) {
      if (!col.has(c.key)) report.push({ row: lines[0], column: c.label, value: '', kind: 'note', message: `No "${c.label}" column; left blank.` })
    }
  }

  // Positions: through the drawing's own AUT CSV import, so every position rule is the same as the AUT scans step.
  let csvScans: Scan[] = []
  if (hasPositions) {
    const keys = ['name', ...POSITION_KEYS] as const
    const mini = rows.map((r, i) => (i === 0 ? 'File Name,X-Start,X-Stop,Y-Start,Y-Stop' : keys.map((k) => quote(r[col.get(k)!] ?? '')).join(',')))
    const aut = importAutCsv(mini.join('\r\n'), { circumference: C })
    // Lines of the made-up CSV are row index + 1; give back the original line numbers.
    for (const e of aut.report) report.push({ ...e, row: e.row === null ? null : (lines[e.row - 1] ?? e.row) })
    if (!aut.ok) return { ok: false, mode, scans: [], rows: [], positionDiffs: [], report }
    // Starts larger than their stops are swapped, as the drawing draws them (user, 2026-10-29). Across the seam the CSV
    // runs past the circumference or below 0 instead, so a reversed X is never a scan across the seam.
    csvScans = aut.scans.map((s) => {
      const flipX = s.xStart !== null && s.xStop !== null && s.xStart > s.xStop
      const flipY = s.yStart !== null && s.yStop !== null && s.yStart > s.yStop
      if (!flipX && !flipY) return s
      const line = lines[rows.findIndex((r, i) => i > 0 && normalizeScanName(r[col.get('name')!] ?? '') === s.id)] ?? null
      const what = [flipX && `X ${s.xStart} to ${s.xStop}`, flipY && `Y ${s.yStart} to ${s.yStop}`].filter(Boolean).join(', ')
      report.push({ row: line, column: flipX ? 'X-Start' : 'Y-Start', value: what, kind: 'swapped',
        message: `Scan ${s.id}: start larger than stop (${what}); swapped, as the drawing draws it.` })
      return {
        ...s,
        ...(flipX && { xStart: s.xStop, xStop: s.xStart }),
        ...(flipY && { yStart: s.yStop, yStop: s.yStart }),
      }
    })
  }

  // Results, per row.
  const out: ScansheetRow[] = []
  const firstRow = new Map<string, number>()
  const report0 = report.length
  rows.slice(1).forEach((cells, i) => {
    const line = lines[i + 1]
    if (cells.every((c) => c.trim() === '')) return
    const name = normalizeScanName(cells[col.get('name')!] ?? '')
    if (name === '' || name.toLowerCase() === 'cal') return // listed by the position import (CSV) or plainly skipped
    if (firstRow.has(idKey(name))) {
      if (!hasPositions) report.push({ row: line, column: 'File Name', value: name, kind: 'blocking', message: `Duplicate scan name ${name} (also on row ${firstRow.get(idKey(name))}).` })
      return
    }
    firstRow.set(idKey(name), line)
    const values: ScansheetRow['values'] = {}
    for (const c of SCANSHEET_COLUMNS) {
      if (c.key === 'name' || c.key === 'comment' || !col.has(c.key)) continue
      const raw = cells[col.get(c.key)!] ?? ''
      const v = numberCell(raw)
      if (v === 'bad') {
        if (!(POSITION_KEYS as readonly string[]).includes(c.key)) report.push({ row: line, column: c.label, value: raw.trim(), kind: 'invalid', message: `Scan ${name}: ${c.label} is not a number; left blank.` })
        continue
      }
      if (v !== null) values[c.key] = v
    }
    out.push({ row: line, name, scanId: null, values, comment: col.has('comment') ? (cells[col.get('comment')!] ?? '').trim() : '', calculated: [] })
  })
  if (report.slice(report0).some((e) => e.kind === 'blocking')) return { ok: false, mode, scans: [], rows: [], positionDiffs: [], report }
  if (out.length === 0) return fail('No scan rows were found.')

  // Positions as read (after the seam rules), by scan name.
  const csvByName = new Map(csvScans.map((s) => [idKey(s.id), s]))

  // Match to the drawing's scans by scan number (create mode: the scans this file makes).
  const target = mode === 'create' ? csvScans : project.scans
  const byNumber = new Map<number, Scan[]>()
  for (const s of target) {
    const n = scanNumberFromName(s.id)
    byNumber.set(n, [...(byNumber.get(n) ?? []), s])
  }
  const positionDiffs: PositionDiff[] = []
  const used = new Set<string>()
  for (const r of out) {
    const exact = target.find((s) => idKey(s.id) === idKey(r.name))
    const n = scanNumberFromName(r.name)
    const candidates = n < 0 ? [] : (byNumber.get(n) ?? [])
    const scan = exact ?? (candidates.length === 1 ? candidates[0] : undefined)
    if (!scan || used.has(idKey(scan.id))) {
      const why = candidates.length > 1 ? `several drawing scans have number ${n}` : 'no drawing scan has its number'
      report.push({ row: r.row, column: 'File Name', value: r.name, kind: 'unmatched', message: `Scan ${r.name}: ${why}; its results are not imported.` })
      continue
    }
    used.add(idKey(scan.id))
    r.scanId = scan.id
    const read = csvByName.get(idKey(r.name))
    // A drawing scan stored with a start above its stop is the same position as the swapped one in the file.
    const drawn = unreversed(scan)
    if (mode === 'match' && read && POSITION_KEYS.some((k) => !same(read[k], drawn[k]))) {
      positionDiffs.push({ scanId: scan.id, csv: pick(read), drawing: pick(scan) })
      report.push({ row: r.row, column: 'X-Start', value: posText(read), kind: 'position',
        message: `Scan ${scan.id}: the drawing has ${posText(scan)}, the ${source === 'csv' ? 'file' : 'paste'} ${posText(read)}. Choose which to keep.` })
    }
  }
  if (mode === 'match') {
    const missing = project.scans.filter((s) => !used.has(idKey(s.id)))
    if (missing.length > 0 && source === 'csv') {
      report.push({ row: null, column: '', value: '', kind: 'unmatched', message: `No results in the file for ${missing.map((s) => s.id).join(', ')}.` })
    }
  }

  // Worked out: increments from the job, readings from the size; compared: readings, Wall Remain %.
  const reportData = project.report
  for (const r of out) {
    if (r.scanId === null) continue
    const scan = (mode === 'create' ? csvScans : project.scans).find((s) => s.id === r.scanId)!
    const shape = csvByName.get(idKey(r.name)) ?? scan
    const jobIncr = reportData?.calibration.increments
    for (const [k, j] of [['incrX', jobIncr?.x], ['incrY', jobIncr?.y]] as const) {
      if (r.values[k] === undefined && j != null) {
        r.values[k] = j
        r.calculated.push(k)
        report.push({ row: r.row, column: label(k), value: String(j), kind: 'calculated', message: `Scan ${r.name}: ${label(k)} taken from the job (${j}).` })
      }
    }
    const worked = readingsFromIncrements(scanSpanX(shape, circumference(project)), shape.yStart === null || shape.yStop === null ? null : shape.yStop - shape.yStart, r.values.incrX ?? null, r.values.incrY ?? null)
    if (r.values.readings === undefined) {
      if (worked !== null) {
        r.values.readings = worked
        r.calculated.push('readings')
        report.push({ row: r.row, column: 'Readings', value: String(worked), kind: 'calculated', message: `Scan ${r.name}: readings worked out from the size and increments (${worked.toLocaleString('en-US')}).` })
      } else {
        report.push({ row: r.row, column: 'Readings', value: '', kind: 'missing', message: `Scan ${r.name}: no readings, and not enough to work them out.` })
      }
    } else if (worked !== null && worked !== r.values.readings) {
      report.push({ row: r.row, column: 'Readings', value: String(r.values.readings), kind: 'mismatch',
        message: `Scan ${r.name}: ${r.values.readings.toLocaleString('en-US')} readings; the size and increments give ${worked.toLocaleString('en-US')}.` })
    }
    for (const k of ['minT', 'avgT'] as const) {
      if (r.values[k] === undefined) report.push({ row: r.row, column: label(k), value: '', kind: 'missing', message: `Scan ${r.name}: ${label(k)} is blank; type it in or paste it later.` })
    }
    if (r.values.wallRemain !== undefined && r.values.minT !== undefined) {
      const component = reportData ? scanComponent(reportData, scan, resultOf(reportData, scan.id)) : undefined
      const nominal = component?.nominal ?? r.values.nomT ?? null
      const loss = wallLossPercent(r.values.minT, nominal)
      if (loss !== null && Math.abs(100 - loss - r.values.wallRemain) > 0.1 + 1e-9) {
        report.push({ row: r.row, column: 'Wall Remain %', value: String(r.values.wallRemain), kind: 'mismatch',
          message: `Scan ${r.name}: Wall Remain ${r.values.wallRemain}% in the file; ${r.values.minT} on ${nominal} is ${(100 - loss).toFixed(2)}%. The report uses the recalculated value.` })
      }
    }
  }

  const result: ScansheetImport = { ok: true, mode, scans: mode === 'create' ? csvScans : [], rows: out, positionDiffs, report }
  const before = reportData ?? createReport(project)
  const after = fillShellNominal(before, result)
  if (after !== before) {
    const nominal = after.components.find((c, i) => c.nominal !== before.components[i].nominal)!.nominal
    report.push({ row: null, column: "Nom. 'T'", value: String(nominal), kind: 'note', message: `The shell's nominal is blank; it is set to ${nominal} from the ${source === 'csv' ? 'file' : 'paste'}.` })
  }
  return result
}

const same = (a: number | null, b: number | null) => a === b || (a !== null && b !== null && Math.abs(a - b) < 1e-6)
/** The scan with a start above its stop swapped (X only when it is not marked across the seam). */
function unreversed(s: Scan): Scan {
  const flipX = !s.acrossSeam && s.xStart !== null && s.xStop !== null && s.xStart > s.xStop
  const flipY = s.yStart !== null && s.yStop !== null && s.yStart > s.yStop
  if (!flipX && !flipY) return s
  return { ...s, ...(flipX && { xStart: s.xStop, xStop: s.xStart }), ...(flipY && { yStart: s.yStop, yStop: s.yStart }) }
}
const pick = (s: Scan) => ({ xStart: s.xStart, xStop: s.xStop, yStart: s.yStart, yStop: s.yStop })
const posText = (s: Pick<Scan, 'xStart' | 'xStop' | 'yStart' | 'yStop'>) => `X ${s.xStart} to ${s.xStop}, Y ${s.yStart} to ${s.yStop}`

// --- Applying --------------------------------------------------------------------------------

export interface ApplyOptions {
  /** Scans (by ID) whose position is taken from the file instead of the drawing (match mode). */
  useFilePositions?: ReadonlySet<string>
  /** Fill a blank shell nominal from the file when every row gives the same Nom. 'T' (default: on). */
  fillNominal?: boolean
}

/**
 * The project with the import applied (one undo step): create mode puts the scans in the drawing (as the AUT scans
 * step's import does); results go into the report (started if the job has none). A re-import keeps the comment picks,
 * overrides, component, location and screenshot of each scan, and replaces what the file gives.
 */
export function applyScansheet(project: Project, imp: ScansheetImport, options: ApplyOptions = {}): Project {
  if (!imp.ok) return project
  let p = imp.mode === 'create' ? replaceScans(project, imp.scans) : project
  if (imp.mode === 'match' && options.useFilePositions?.size) {
    const diffs = new Map(imp.positionDiffs.map((d) => [idKey(d.scanId), d]))
    p = { ...p, scans: p.scans.map((s) => (options.useFilePositions!.has(s.id) && diffs.has(idKey(s.id)) ? { ...s, ...diffs.get(idKey(s.id))!.csv } : s)) }
  }
  // Matched drawing scans stored with a start above the stop are swapped too, so both sides agree with the file.
  if (imp.mode === 'match') {
    const matched = new Set(imp.rows.flatMap((x) => (x.scanId === null ? [] : [idKey(x.scanId)])))
    const scans = p.scans.map((sc) => (matched.has(idKey(sc.id)) ? unreversed(sc) : sc))
    if (scans.some((sc, i) => sc !== p.scans[i])) p = { ...p, scans }
  }
  let report: Report = p.report ?? createReport(p)
  if (options.fillNominal !== false) report = fillShellNominal(report, imp)

  const results = new Map(report.scanResults.map((r) => [idKey(r.scanId), r]))
  for (const r of imp.rows) {
    if (r.scanId === null) continue
    const old = results.get(idKey(r.scanId)) ?? scanResultSchema.parse({ scanId: r.scanId })
    const v = r.values
    const next: ScanResult = {
      ...old,
      scanId: r.scanId,
      ...(v.incrX !== undefined && { incrX: v.incrX }),
      ...(v.incrY !== undefined && { incrY: v.incrY }),
      ...(v.readings !== undefined && { readings: Math.round(v.readings) }),
      ...(v.minT !== undefined && { minT: v.minT }),
      ...(v.avgT !== undefined && { avgT: v.avgT }),
      ...(v.nomT !== undefined && { csvNomT: v.nomT }),
      ...(v.wallRemain !== undefined && { csvWallRemain: v.wallRemain }),
      ...(r.comment !== '' && { csvComment: r.comment }),
      calculated: [...old.calculated.filter((f) => v[f] === undefined), ...r.calculated],
    }
    results.set(idKey(r.scanId), next)
  }
  // In scan order, as the scan sheet prints them.
  const scanResults = p.scans.flatMap((s) => results.get(idKey(s.id)) ?? [])
  return { ...p, report: { ...report, scanResults } }
}

/** The shell's nominal from the file when it is blank and every row gives one and the same Nom. 'T'. */
function fillShellNominal(report: Report, imp: ScansheetImport): Report {
  const noms = new Set(imp.rows.flatMap((r) => (r.values.nomT === undefined ? [] : [r.values.nomT])))
  const shells = report.components.filter((c) => c.kind === 'shell' || c.kind === 'course')
  if (noms.size !== 1 || shells.length !== 1 || shells[0].nominal !== null) return report
  const [nominal] = noms
  if (!(nominal > 0)) return report
  return { ...report, components: report.components.map((c) => (c === shells[0] ? { ...c, nominal } : c)) }
}
