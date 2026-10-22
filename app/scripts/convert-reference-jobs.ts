// Converts old AxisBuilder / Scan Layout Generator job workbooks into the current v5.0 workbook, so
// fresh v5.0 .lsp files can be generated as reference jobs for the web app's parity tests.
//
//   node scripts/convert-reference-jobs.ts <jobs folder> [--only NAME] [--force] [--template FILE]
//
// <jobs folder> holds one folder per job. Each job folder has the old .xlsm, optionally the AUT .csv,
// and the scan photos in screenshots\ (or images\); a job may instead keep these in an original\
// subfolder. Nothing in the job's own files is changed. Output goes to <job>\v5.0\:
//   <job>_v5.0.xlsm       copy of AxisBuilder_v5.0_Stable.xlsm filled with the job (by Excel, macros off)
//   conversion-report.txt import report, CSV check, round-trip check, things to look at
//
// How: the app's importer (importWorkbook) finds every value in the old workbook (it knows the older
// row layouts and column orders). The ORIGINAL cell values are then copied into the v5.0 rows, so the
// job arrives exactly as it was (duplicate names, OCR REVIEW text and hand edits included). Finally the
// new workbook is imported again and compared with the old one.
//
// Never commit anything from the jobs folder: it holds real client data.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'
import { FIELD_TABLES, type FieldDef } from '../src/data/settings.ts'
import type { ListKey, Project } from '../src/data/schema.ts'
import { importWorkbook, v5Columns, type ImportResult } from '../src/data/xlsmImport.ts'
import { importAutCsv } from '../src/data/autCsvImport.ts'
import { matchScanImages } from '../src/data/imageMatch.ts'

const here = dirname(fileURLToPath(import.meta.url))

// --- Arguments ---------------------------------------------------------------------------------

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(name)
const option = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const root = args.find((a, i) => !a.startsWith('--') && !['--only', '--template'].includes(args[i - 1]))
if (!root) {
  console.error('Usage: node scripts/convert-reference-jobs.ts <jobs folder> [--only NAME] [--force] [--template FILE]')
  process.exit(2)
}
const templatePath = resolve(option('--template') ?? join(here, '..', '..', 'AxisBuilder_v5.0_Stable.xlsm'))
const only = option('--only')
const force = flag('--force')

// --- v5.0 workbook layout (current template; CLAUDE.md "Sheet layout") ---------------------------

const PS = 'Project Settings'
const DI = 'Drawing Information'
type LabelSheet = typeof PS | typeof DI
const SHEETS = [PS, DI, 'Scan Import', 'Scan Images', 'Shell Features', 'Head Features']

/** What New Project clears, plus the whole scan tables (as Import AUT does). */
const CLEAR = [
  { sheet: PS, range: 'B5' }, { sheet: PS, range: 'B10:B11' }, { sheet: PS, range: 'B21:B22' }, { sheet: PS, range: 'B32:B36' },
  { sheet: DI, range: 'B4:B11' }, { sheet: DI, range: 'B16:B23' }, { sheet: DI, range: 'B24:C28' },
  { sheet: 'Scan Import', range: 'A3:L202' },
  { sheet: 'Scan Images', range: 'A3:E202' },
  { sheet: 'Shell Features', range: 'A3:D12' }, { sheet: 'Shell Features', range: 'A15:F24' },
  { sheet: 'Shell Features', range: 'A27:H66' }, { sheet: 'Shell Features', range: 'A69:G88' },
  { sheet: 'Shell Features', range: 'A91:E110' },
  { sheet: 'Head Features', range: 'A4:J24' }, { sheet: 'Head Features', range: 'A28:I47' },
]

/** First data row and capacity of each list in the v5.0 workbook. Heads: Head 1 block, then Head 2 block. */
const TARGET: Record<ListKey, { sheet: string; first: number; max: number; head2First?: number }> = {
  circWelds: { sheet: 'Shell Features', first: 3, max: 10 },
  longSeams: { sheet: 'Shell Features', first: 15, max: 10 },
  shellNozzles: { sheet: 'Shell Features', first: 27, max: 40 },
  objects: { sheet: 'Shell Features', first: 69, max: 20 },
  shellMut: { sheet: 'Shell Features', first: 91, max: 20 },
  headNozzles: { sheet: 'Head Features', first: 4, max: 10, head2First: 14 },
  headMut: { sheet: 'Head Features', first: 28, max: 5, head2First: 33 },
  scans: { sheet: 'Scan Import', first: 3, max: 150 },
  scanImages: { sheet: 'Scan Images', first: 3, max: 150 },
}

/** Scan Import formulas F:K, exactly as v5.0 Import AUT writes them (R1C1). */
const SCAN_FORMULAS: Record<string, string> = {
  F: '=IFERROR(RC[-3]-RC[-4],"")',
  G: '=IFERROR(RC[-2]-RC[-3],"")',
  H: '=IF(OR(RC[-6]="",RC[-2]=""),"",RC[-6]+RC[-2]/2)',
  I: '=IF(OR(RC[-5]="",RC[-2]=""),"",RC[-5]+RC[-2]/2)',
  J: '=IF(OR(RC[-4]="",RC[-3]=""),"",IF(RC[-3]>RC[-4],90,0))',
  K:
    '=IF(OR(RC[-5]="",RC[-4]=""),"",MAX(0.45,MIN(MIN(RC[-5],RC[-4])*0.42,' +
    '(MAX(RC[-5],RC[-4])*0.82)/(MAX(1,LEN(RC[-10]))*0.6))*' +
    'IFERROR(INDEX(\'Project Settings\'!C2,MATCH("Text Scale Factor",\'Project Settings\'!C1,0)),1)))',
}

// --- Helpers -----------------------------------------------------------------------------------

type Write =
  | { sheet: string; cell: string; type: 'number'; value: number; format?: string }
  | { sheet: string; cell: string; type: 'text' | 'textForce'; value: string }
  | { sheet: string; cell: string; type: 'bool'; value: boolean }
  | { sheet: string; cell: string; type: 'formula'; value: string }

const labelKey = (s: string) => s.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()

/** Row of each column-A label on a sheet (first occurrence). */
function labelRows(ws: XLSX.WorkSheet | undefined): Map<string, number> {
  const rows = new Map<string, number>()
  if (!ws?.['!ref']) return rows
  const last = XLSX.utils.decode_range(ws['!ref']).e.r + 1
  for (let r = 1; r <= last; r++) {
    const v = ws[`A${r}`]?.v
    if (typeof v === 'string' && !rows.has(labelKey(v))) rows.set(labelKey(v), r)
  }
  return rows
}

/** Text Excel would turn into a number, date or formula when typed into a General cell. */
const wouldConvert = (s: string) => /^[-+]?[\d.,\s:/]+(\s?[ap]m)?$/i.test(s.trim()) || s.startsWith('=')

/** A write that copies the old cell's value as it was (blank old cell = no write; the target was cleared). */
function copyCell(oldWs: XLSX.WorkSheet, from: string, sheet: string, to: string): Write | null {
  const c = oldWs[from] as XLSX.CellObject | undefined
  if (!c || c.v === undefined || c.v === null || c.t === 'z' || c.t === 'e') return null
  if (c.t === 'n') return { sheet, cell: to, type: 'number', value: c.v as number, format: c.z && c.z !== 'General' ? String(c.z) : undefined }
  if (c.t === 'b') return { sheet, cell: to, type: 'bool', value: Boolean(c.v) }
  const s = String(c.v)
  if (s.trim() === '') return null
  return { sheet, cell: to, type: wouldConvert(s) ? 'textForce' : 'text', value: s }
}

/** Head clock value as text, the way v5.0 needs it ("3:30" stays text). Excel time numbers are converted. */
function clockText(oldWs: XLSX.WorkSheet, from: string): { text: string | null; note?: string } {
  const c = oldWs[from] as XLSX.CellObject | undefined
  if (!c || c.v === undefined || c.v === null || String(c.v).trim() === '') return { text: null }
  if (c.t === 'n') {
    const v = c.v as number
    if (v > 0 && v < 1) {
      const total = Math.round(v * 1440)
      const h = Math.floor(total / 60)
      const m = total % 60
      const t = m === 0 ? String(h) : `${h}:${String(m).padStart(2, '0')}`
      return { text: t, note: `Excel time ${v} written as text "${t}"` }
    }
    return { text: String(v) }
  }
  return { text: String(c.v).trim() }
}

function windowsPath(p: string): string {
  return resolve(p).replace(/\//g, '\\')
}

// --- Job discovery -----------------------------------------------------------------------------

interface Job {
  name: string
  dir: string
  workbook: string
  csv?: string
  images?: string
  outDir: string
}

function findJobs(rootDir: string): Job[] {
  const jobs: Job[] = []
  for (const name of readdirSync(rootDir).sort()) {
    const dir = join(rootDir, name)
    if (!statSync(dir).isDirectory()) continue
    const src = existsSync(join(dir, 'original')) ? join(dir, 'original') : dir
    const files = readdirSync(src)
    const xlsm = files.filter((f) => /\.xls[mx]$/i.test(f) && !f.startsWith('~$'))
    if (xlsm.length !== 1) {
      console.log(`${name}: skipped (expected one .xlsm in ${basename(src)}, found ${xlsm.length})`)
      continue
    }
    const csv = files.find((f) => /\.csv$/i.test(f))
    const imgDir = ['screenshots', 'images'].map((d) => join(src, d)).find((d) => existsSync(d))
    jobs.push({ name, dir, workbook: join(src, xlsm[0]), csv: csv && join(src, csv), images: imgDir, outDir: join(dir, 'v5.0') })
  }
  return jobs
}

// --- Plan ----------------------------------------------------------------------------------------

interface Note {
  section: string
  text: string
}

function buildPlan(job: Job, old: ImportResult, oldWb: XLSX.WorkBook, template: XLSX.WorkBook, notes: Note[]) {
  const writes: Write[] = []
  const lastWrites: Write[] = [] // converter overrides: written last so nothing replaces them
  const tplRows: Record<LabelSheet, Map<string, number>> = { [PS]: labelRows(template.Sheets[PS]), [DI]: labelRows(template.Sheets[DI]) }
  const oldRows: Record<LabelSheet, Map<string, number>> = { [PS]: labelRows(oldWb.Sheets[PS]), [DI]: labelRows(oldWb.Sheets[DI]) }
  const usedOldRows: Record<LabelSheet, Set<number>> = { [PS]: new Set<number>(), [DI]: new Set<number>() }
  const refAnchor = tplRows[PS].get(labelKey('Reference Label Mode')) ?? 0
  const refKeys = ['refLabel0', 'refLabel90', 'refLabel180', 'refLabel270', 'refLabel360']
  const overrides: Record<string, string> = {
    originalImageFolder: job.images ? windowsPath(job.images) : '',
    processedImageFolder: windowsPath(join(job.outDir, 'Processed_Images')),
  }

  // Settings, vessel and project info: copy each value found in the old workbook to the v5.0 row.
  for (const table of FIELD_TABLES) {
    for (const [key, def] of Object.entries(table.fields as Record<string, FieldDef>)) {
      if (def.onSheet === false) continue
      const sheet = def.excelSheet
      const refIndex = refKeys.indexOf(key)
      const tplRow = refIndex >= 0 ? refAnchor + 3 + refIndex : (tplRows[sheet].get(labelKey(def.excelLabel)) ?? 0)
      if (!tplRow || (refIndex >= 0 && !refAnchor)) {
        notes.push({ section: 'Settings', text: `The v5.0 template has no "${def.excelLabel}" row; not written.` })
        continue
      }
      const to = `B${tplRow}`
      if (key in overrides) {
        const oldSrc = old.sources.fields[table.section]?.[key]
        if (oldSrc) usedOldRows[sheet].add(oldSrc.row)
        lastWrites.push({ sheet, cell: to, type: 'text', value: overrides[key] })
        notes.push({ section: 'Settings', text: `${def.excelLabel} set to ${overrides[key] || '(blank)'} (converter).` })
        continue
      }
      const src = old.sources.fields[table.section]?.[key]
      if (!src) {
        if (key === 'autHatchTransparency') {
          writes.push({ sheet, cell: to, type: 'number', value: 50 })
          notes.push({ section: 'Settings', text: 'AUT Hatch Transparency: no row in the old workbook; 50 written (decision).' })
        } else {
          const tv = template.Sheets[sheet]?.[to]?.v
          notes.push({ section: 'Settings', text: `${def.excelLabel}: no row in the old workbook; v5.0 template value kept (${tv ?? 'blank'}).` })
        }
        continue
      }
      usedOldRows[sheet].add(src.row)
      const w = copyCell(oldWb.Sheets[src.sheet], `B${src.row}`, sheet, to)
      if (w) writes.push(w)
    }
  }

  // Rows the app has no field for (e.g. Text Scale Factor): copy to the same label in v5.0 when it exists.
  for (const sheet of [PS, DI] as const) {
    for (const [label, row] of oldRows[sheet]) {
      if (usedOldRows[sheet].has(row) || label === 'setting' || label === 'field') continue
      const v = oldWb.Sheets[sheet][`B${row}`]?.v
      if (v === undefined || v === null || String(v).trim() === '') continue
      const tplRow = tplRows[sheet].get(label)
      if (!tplRow || (sheet === PS && refAnchor && tplRow >= refAnchor + 3 && tplRow <= refAnchor + 7)) {
        notes.push({ section: 'Settings', text: `${sheet}: old row "${label}" (${String(v).slice(0, 40)}) has no place in v5.0; not copied.` })
        continue
      }
      const w = copyCell(oldWb.Sheets[sheet], `B${row}`, sheet, `B${tplRow}`)
      if (w) writes.push(w)
      notes.push({ section: 'Settings', text: `"${oldWb.Sheets[sheet][`A${row}`].v}" copied as is (not used by the app).` })
    }
  }

  // Lists: copy each imported row's original cells into the v5.0 rows and columns.
  const v5 = v5Columns()
  const v47HeadIncludeYes = old.summary.reorderedSections.includes('headNozzles')
  for (const list of Object.keys(TARGET) as ListKey[]) {
    const t = TARGET[list]
    const src = old.sources.rows[list]
    const items = old.project[list] as Record<string, unknown>[]
    const next = { 'HEAD 1': t.first, 'HEAD 2': t.head2First ?? t.first }
    let row = t.first
    items.forEach((item, i) => {
      let target: number
      if (t.head2First !== undefined) {
        const h = item.head as 'HEAD 1' | 'HEAD 2'
        target = next[h]++
        const end = h === 'HEAD 1' ? t.head2First - 1 : t.head2First + t.max - 1
        if (target > end) throw new Error(`${list}: more than ${t.max} rows for ${h}; the v5.0 sheet has no room. Ask before converting.`)
      } else {
        target = row++
        if (target >= t.first + t.max) throw new Error(`${list}: more than ${t.max} rows; the v5.0 sheet has no room. Ask before converting.`)
      }
      const oldWs = oldWb.Sheets[t.sheet] // same sheet name in old and new workbooks
      for (const [field, toCol] of Object.entries(v5[list])) {
        const fromCol = src[i].cols[field]
        const to = `${toCol}${target}`
        if (field === 'head') {
          writes.push({ sheet: t.sheet, cell: to, type: 'text', value: String(item.head) })
          continue
        }
        if (list === 'headNozzles' && field === 'include' && v47HeadIncludeYes) {
          writes.push({ sheet: t.sheet, cell: to, type: 'text', value: 'YES' })
          continue
        }
        if (!fromCol) continue
        const from = `${fromCol}${src[i].row}`
        if (field === 'clock') {
          const ct = clockText(oldWs, from)
          if (ct.text !== null) writes.push({ sheet: t.sheet, cell: to, type: 'textForce', value: ct.text })
          if (ct.note) notes.push({ section: 'Head Features', text: `${String(item.id)}: ${ct.note}.` })
          continue
        }
        const w = copyCell(oldWs, from, t.sheet, to)
        if (w) writes.push(w)
      }
      if (list === 'scans') {
        for (const [c, f] of Object.entries(SCAN_FORMULAS)) writes.push({ sheet: t.sheet, cell: `${c}${target}`, type: 'formula', value: f })
      }
    })
  }
  if (v47HeadIncludeYes) {
    notes.push({
      section: 'Head Features',
      text: 'Older column order: "Include Label" meant the label only, so head nozzles are written with Include = YES (decision). ' +
        'v5.0 has no label-only switch for head nozzles, so they will be drawn with labels.',
    })
  }
  return [...writes, ...lastWrites]
}

// --- Round-trip check ----------------------------------------------------------------------------

interface Diff {
  where: string
  before: unknown
  after: unknown
  expected?: string
}

function sortHeads<T extends Record<string, unknown>>(items: T[]): T[] {
  return [...items].sort((a, b) => String(a.head).localeCompare(String(b.head)))
}

function compareProjects(a: Project, b: Project, expected: (where: string) => string | undefined): Diff[] {
  const diffs: Diff[] = []
  const push = (where: string, before: unknown, after: unknown) => {
    if (JSON.stringify(before) !== JSON.stringify(after)) diffs.push({ where, before, after, expected: expected(where) })
  }
  for (const section of ['project', 'vessel', 'settings'] as const) {
    const sa = a[section] as Record<string, unknown>
    const sb = b[section] as Record<string, unknown>
    for (const k of Object.keys(sa)) push(`${section}.${k}`, sa[k], sb[k])
  }
  for (const list of Object.keys(TARGET) as ListKey[]) {
    let la = a[list] as Record<string, unknown>[]
    let lb = b[list] as Record<string, unknown>[]
    if (list === 'headNozzles' || list === 'headMut') {
      la = sortHeads(la)
      lb = sortHeads(lb)
    }
    if (la.length !== lb.length) push(`${list} (count)`, la.length, lb.length)
    for (let i = 0; i < Math.min(la.length, lb.length); i++) {
      for (const k of Object.keys(la[i])) push(`${list}[${i + 1}] ${String(la[i].id ?? la[i].scanId)}.${k}`, la[i][k], lb[i][k])
    }
  }
  return diffs
}

// --- PowerShell / Excel ------------------------------------------------------------------------

function runExcel(planPath: string): { ok: boolean; signedBefore: boolean | null; signedAfter: boolean | null; cellsWritten: number; error: string | null } {
  const script = readFileSync(join(here, 'fill-v5-workbook.ps1'), 'utf8')
  const command = `& { ${script} } -PlanPath '${planPath.replace(/'/g, "''")}'`
  const encoded = Buffer.from(command, 'utf16le').toString('base64')
  const res = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
    encoding: 'utf8',
    timeout: 300_000,
    windowsHide: true,
  })
  const line = (res.stdout ?? '').trim().split(/\r?\n/).filter((l) => l.startsWith('{')).pop()
  if (!line) throw new Error(`Excel step failed: ${res.error?.message ?? ''} ${res.stderr ?? ''}`.trim())
  return JSON.parse(line)
}

// --- Report --------------------------------------------------------------------------------------

function fmt(v: unknown): string {
  return v === null || v === undefined || v === '' ? '(blank)' : typeof v === 'string' ? `"${v}"` : JSON.stringify(v)
}

function writeReport(job: Job, out: string, old: ImportResult, notes: Note[], csvLines: string[], imageLine: string,
  excel: ReturnType<typeof runExcel>, diffs: Diff[]) {
  const lines: string[] = []
  const unexpected = diffs.filter((d) => !d.expected)
  const look: string[] = []
  lines.push(`AxisBuilder reference job conversion - ${job.name}`, `Converted: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, '')
  lines.push('FILES', `  Old workbook: ${job.workbook}`, `  AUT CSV:      ${job.csv ?? '(none)'}`, `  Images:       ${job.images ?? '(none)'}`,
    `  v5.0 output:  ${out}`, '')
  lines.push('RESULT')
  lines.push(`  Excel fill: ${excel.ok ? `OK, ${excel.cellsWritten} cells written` : `FAILED - ${excel.error}`}`)
  lines.push(`  Signature: before save ${excel.signedBefore ? 'signed' : 'NOT signed'}, after save ${excel.signedAfter ? 'signed' : 'NOT signed'}`)
  lines.push(`  Round-trip check: ${diffs.length === 0 ? 'identical' : `${diffs.length} difference(s), ${unexpected.length} unexpected`}`, '')

  lines.push('OLD WORKBOOK', `  Layout: Shell Features ${old.summary.layout}; columns by header: ${old.summary.reorderedSections.join(', ') || 'standard order'}`,
    `  Settings and info found: ${old.summary.fieldsFound} of ${old.summary.fieldsTotal}`,
    `  Rows: ${Object.entries(old.summary.counts).map(([k, n]) => `${k} ${n}`).join(', ')}`, '')

  lines.push('IMPORT REPORT (old workbook, read by the app)')
  if (old.report.length === 0) lines.push('  (nothing to report)')
  for (const e of old.report) lines.push(`  [${e.kind}] ${e.sheet} ${e.cell}: ${e.value ? `${fmt(e.value)} - ` : ''}${e.message}`)
  if (old.summary.missingData.length) {
    lines.push('  Needed before export in the app:')
    for (const m of old.summary.missingData) lines.push(`    ${m}`)
  }
  lines.push('')

  lines.push('CONVERSION NOTES')
  const bySection = new Map<string, string[]>()
  for (const n of notes) bySection.set(n.section, [...(bySection.get(n.section) ?? []), n.text])
  for (const [s, texts] of bySection) {
    lines.push(`  ${s}:`)
    for (const t of texts) lines.push(`    ${t}`)
  }
  lines.push('')

  lines.push('AUT CSV CHECK (scans were copied from the old workbook, not re-imported from the CSV)')
  for (const l of csvLines) lines.push(`  ${l}`)
  lines.push('', 'SCAN IMAGES', `  ${imageLine}`, '')

  lines.push('ROUND-TRIP CHECK (new v5.0 workbook read back by the app, compared with the old workbook)')
  if (diffs.length === 0) lines.push('  No differences.')
  for (const d of diffs) lines.push(`  ${d.expected ? 'expected  ' : 'UNEXPECTED'} ${d.where}: ${fmt(d.before)} -> ${fmt(d.after)}${d.expected ? ` (${d.expected})` : ''}`)
  lines.push('')

  if (!excel.ok) look.push('The Excel step failed; the v5.0 workbook is not usable. See RESULT.')
  if (excel.ok && !excel.signedAfter) look.push('The v5.0 workbook is not signed after saving. Open it on your PC and check Tools > Digital Signature in the VBA editor.')
  if (unexpected.length) look.push(`${unexpected.length} unexpected round-trip difference(s); see ROUND-TRIP CHECK.`)
  for (const e of old.report.filter((x) => x.kind === 'review' || x.kind === 'invalid')) look.push(`${e.sheet} ${e.cell}: ${e.message}`)
  for (const n of notes.filter((x) => /decision/.test(x.text))) look.push(n.text)
  for (const l of csvLines.filter((x) => x.startsWith('EDITED'))) look.push(`CSV: ${l}`)
  lines.push('LOOK AT')
  if (look.length === 0) lines.push('  Nothing.')
  for (const l of look) lines.push(`  - ${l}`)
  lines.push('')
  writeFileSync(join(job.outDir, 'conversion-report.txt'), lines.join('\r\n'))
  return { unexpected: unexpected.length, look: look.length }
}

// --- Main ----------------------------------------------------------------------------------------

if (!existsSync(templatePath)) throw new Error(`v5.0 template not found: ${templatePath}`)
const templateBytes = readFileSync(templatePath)
const template = XLSX.read(templateBytes, { cellNF: true })

for (const job of findJobs(resolve(root))) {
  if (only && job.name !== only) continue
  const out = join(job.outDir, `${job.name}_v5.0.xlsm`)
  if (resolve(out) === templatePath) throw new Error('Refusing to write to the v5.0 template itself.')
  if (existsSync(out) && !force) {
    console.log(`${job.name}: ${out} already exists; use --force to replace it.`)
    continue
  }
  console.log(`${job.name}: converting ${basename(job.workbook)}`)
  const oldBytes = readFileSync(job.workbook)
  const old = importWorkbook(oldBytes)
  const oldWb = XLSX.read(oldBytes, { cellNF: true })
  const notes: Note[] = []
  const writes = buildPlan(job, old, oldWb, template, notes)

  // CSV check: which scans differ from the CSV, and how.
  const csvLines: string[] = []
  if (job.csv) {
    const c = importAutCsv(readFileSync(job.csv))
    if (!c.ok) csvLines.push(`The CSV does not import cleanly (${c.report.filter((e) => e.kind === 'blocking').length} blocking problem(s)).`)
    const wbScans = new Map(old.project.scans.map((s) => [s.id.toUpperCase(), s]))
    let swapped = 0
    for (const s of c.scans) {
      const w = wbScans.get(s.id)
      if (!w) {
        csvLines.push(`MISSING ${s.id}: in the CSV but not in the old workbook.`)
        continue
      }
      const same = w.xStart === s.xStart && w.xStop === s.xStop && w.yStart === s.yStart && w.yStop === s.yStop
      const flipped =
        Math.min(w.xStart ?? NaN, w.xStop ?? NaN) === Math.min(s.xStart ?? NaN, s.xStop ?? NaN) &&
        Math.max(w.xStart ?? NaN, w.xStop ?? NaN) === Math.max(s.xStart ?? NaN, s.xStop ?? NaN) &&
        Math.min(w.yStart ?? NaN, w.yStop ?? NaN) === Math.min(s.yStart ?? NaN, s.yStop ?? NaN) &&
        Math.max(w.yStart ?? NaN, w.yStop ?? NaN) === Math.max(s.yStart ?? NaN, s.yStop ?? NaN)
      if (same) continue
      if (flipped) swapped++
      else csvLines.push(`EDITED ${s.id}: CSV ${[s.xStart, s.xStop, s.yStart, s.yStop].join(', ')} -> workbook ${[w.xStart, w.xStop, w.yStart, w.yStop].join(', ')} (hand edit kept).`)
    }
    for (const s of old.project.scans) if (!c.scans.some((x) => x.id === s.id.toUpperCase())) csvLines.push(`EXTRA ${s.id}: in the old workbook but not in the CSV.`)
    csvLines.unshift(`${c.scans.length} scans in the CSV, ${old.project.scans.length} in the old workbook; ${swapped} with start/stop flipped (v5.0's own validation does this; same rectangle).`)
  } else {
    csvLines.push('No CSV in the job folder.')
  }

  // Images: do the job's photos match its scans?
  let imageLine = 'No image folder found.'
  if (job.images) {
    const links = new Map(old.project.scanImages.map((i) => [i.scanId, i.imageFile]))
    const m = matchScanImages(old.project.scans.map((s) => ({ id: s.id, imageFile: links.get(s.id) })), readdirSync(job.images))
    imageLine = `Folder ${job.images}: format ${m.chosenPattern ?? '(none)'}; ${m.counts.matched} matched, ${m.counts.choose} to choose, ${m.counts.noMatch} with no match.`
  }

  // Copy the template and let Excel fill it.
  mkdirSync(job.outDir, { recursive: true })
  copyFileSync(templatePath, out)
  const planPath = join(tmpdir(), `axisbuilder-plan-${process.pid}-${job.name}.json`)
  writeFileSync(planPath, JSON.stringify({ output: windowsPath(out), sheets: SHEETS, clear: CLEAR, writes }), 'utf8')
  let excel: ReturnType<typeof runExcel>
  try {
    excel = runExcel(windowsPath(planPath))
  } finally {
    rmSync(planPath, { force: true })
  }

  // Round trip: read the new workbook back and compare.
  let diffs: Diff[] = []
  if (excel.ok) {
    const again = importWorkbook(readFileSync(out))
    const notFound = new Set(old.report.filter((e) => e.kind === 'notFound').map((e) => labelKey(e.value)))
    diffs = compareProjects(old.project, again.project, (where) => {
      if (where === 'settings.originalImageFolder' || where === 'settings.processedImageFolder') return 'set by the converter'
      if (/^headNozzles\[.*\.include$/.test(where) && old.summary.reorderedSections.includes('headNozzles')) return 'decision: Include = YES'
      const key = where.split('.')[1]
      for (const t of FIELD_TABLES) {
        const def = (t.fields as Record<string, FieldDef>)[key]
        if (def && where.startsWith(t.section) && notFound.has(labelKey(def.excelLabel))) return 'not in the old workbook; v5.0 value'
      }
      return undefined
    })
  }
  const r = writeReport(job, out, old, notes, csvLines, imageLine, excel, diffs)
  console.log(`${job.name}: ${excel.ok ? 'done' : 'EXCEL FAILED'}; round-trip unexpected differences: ${r.unexpected}; items to look at: ${r.look}`)
}
