// What the report prints for a field, a number or a template text block: one place for the formats (0.736", 2.72%,
// 3,171,045, October 13, 2026) and for the values the scope and summary sentences fill in (calc/textFill TEXT_FIELDS).

import { scanNumberFromName } from '../../data/imageMatch.ts'
import type { Project } from '../../data/schema.ts'
import { countText } from '../calc/numbers.ts'
import { reportCoverage, readingRows, readingTotals, scanRows, totalsOf } from '../calc/results.ts'
import { blockApplies, fillText, placeholders, type TextField } from '../calc/textFill.ts'
import type { Report } from '../schema.ts'
import type { FieldRef, ReportTemplate, TextBlockDef } from '../templates/types.ts'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "2026-10-13" -> "October 13, 2026"; blank stays blank. */
export function longDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : iso
}

/** 0.736 -> 0.736" (fixed decimals). */
export const inch = (n: number, decimals = 3) => `${n.toFixed(decimals)}"`
/** 115 -> 115", 22.5 -> 22.5" (up to three decimals, trailing zeros dropped). */
export const inchTrim = (n: number) => `${trimNum(n, 3)}"`
export const trimNum = (n: number, decimals = 3) => String(Number(n.toFixed(decimals)))
export const pct = (n: number, decimals = 2) => `${n.toFixed(decimals)}%`
export const thousands = (n: number) => Math.round(n).toLocaleString('en-US')

/** "SCAN 16" -> "16" (the scan number, as the drawing matches photos); an ID without digits stays as it is. */
export function scanNumber(id: string): string {
  const n = scanNumberFromName(id)
  return n >= 0 ? String(n) : id
}

/** A scan's printed title: "Scan 16" (or the ID when it has no number). */
export const scanTitle = (id: string) => (scanNumberFromName(id) >= 0 ? `Scan ${scanNumberFromName(id)}` : id)

/** The examination type: the job's, else the template's. */
export const examinationType = (r: Report, t: ReportTemplate) => r.job.examinationType.trim() || t.jobDefaults.examinationType

/** "V-100" + "Inlet Separator" -> "Inlet Separator V-100" (whichever are filled). */
export function equipmentWords(p: Project): string {
  return [p.project.equipmentName.trim(), p.project.component.trim()].filter((s) => s !== '').join(' ')
}

/** The nominal the header prints: the shell's, or "See scan sheet" when the shell parts differ. */
export function headerNominal(r: Report): string {
  const shells = r.components.filter((c) => c.kind === 'shell' || c.kind === 'course')
  const noms = [...new Set(shells.map((c) => c.nominal).filter((n): n is number => n !== null))]
  if (noms.length === 0) return ''
  return noms.length === 1 ? inch(noms[0]) : 'See scan sheet'
}

/** The printed value of a template field ('' = blank, not printed). */
export function fieldValue(p: Project, r: Report, t: ReportTemplate, ref: FieldRef): string {
  const [root, ...rest] = ref.source.split('.')
  const key = rest.join('.')
  if (root === 'calc' && key === 'nominal') return headerNominal(r)
  if (root === 'project') {
    const v = (p.project as Record<string, unknown>)[key]
    if (key === 'date') return longDate(String(v ?? ''))
    return typeof v === 'string' ? v.trim() : v === null || v === undefined ? '' : String(v)
  }
  if (root === 'vessel') {
    const v = (p.vessel as Record<string, unknown>)[key]
    if (typeof v === 'number') return inch(v)
    if (key === 'xAxisDirectionText') return (p.vessel.xAxisDirectionText.trim() || p.vessel.xAxisCardinal).trim()
    if (key === 'yAxisDirectionText') return (p.vessel.yAxisDirectionText.trim() || p.vessel.yAxisCardinal).trim()
    return typeof v === 'string' ? v.trim() : ''
  }
  if (root === 'report' && rest[0] === 'job') {
    const k = rest[1]
    if (k === 'examinationType') return examinationType(r, t)
    if (k === 'techs') return r.job.techs.map((x) => x.name.trim()).filter((s) => s).join(', ')
    if (k === 'reviewer') return r.job.reviewer?.name.trim() ?? ''
    const v = (r.job as Record<string, unknown>)[k]
    return typeof v === 'string' ? v.trim() : ''
  }
  return ''
}

// --- Scope and summary text ------------------------------------------------------------------

/** Values that are figures (coloured in the summary). */
export const FIGURE_FIELDS: readonly TextField[] = ['scanCount', 'readings', 'coveragePercent', 'mutCoveragePercent', 'totalCoveragePercent', 'minT', 'wallLoss', 'nominal', 'avgT', 'manualReadings']

export interface TextValues {
  values: Partial<Record<TextField, string>>
  /** For the `when` of grouped blocks: band = the worst scan's ladder band, manualReadings = readings measured, mutArea = the
   * hatched area of the shell MUT areas (sq in). */
  numbers: Record<string, number>
  /** Ladder colour of the worst wall loss ('normal' | 'amber' | 'red'), for the minimum and wall loss figures. */
  lossColor: 'normal' | 'amber' | 'red'
}

/** Every value the template's text blocks can use, worked out from the job (blank ones left out). */
export function textValues(p: Project, r: Report, t: ReportTemplate): TextValues {
  const rows = scanRows(p, r)
  const totals = totalsOf(rows)
  const coverage = reportCoverage(p)
  const manual = readingTotals(readingRows(p, r))
  const tr = r.calibration.transducers.find((x) => x.maker || x.size || x.frequency)
  const shell = r.components.find((c) => c.kind === 'shell') ?? r.components[0]
  const nominal = totals.wallLoss ? rows.find((x) => x.scan.id === totals.wallLoss!.scanId)?.nominal ?? shell?.nominal : shell?.nominal
  const v: Partial<Record<TextField, string>> = {}
  const put = (k: TextField, s: string | null | undefined) => {
    if (s !== null && s !== undefined && s.trim() !== '') v[k] = s.trim()
  }
  put('equipment', equipmentWords(p))
  // Blank equipment type: "equipment" (a neutral word, so the sentence still prints).
  put('equipmentKind', p.project.equipmentType ? p.project.equipmentType.toLowerCase() : 'equipment')
  put('examinationType', examinationType(r, t))
  put('purpose', r.text.scope.fields.purpose)
  put('areaCovered', r.text.scope.fields.areaCovered)
  put('limitations', r.text.scope.fields.limitations)
  put('transducerMaker', tr?.maker)
  put('transducerSize', tr?.size)
  put('transducerFrequency', tr?.frequency)
  put('transducerAngle', tr?.angle)
  put('transducerMode', tr?.mode.toLowerCase())
  const ix = r.calibration.increments.x
  const iy = r.calibration.increments.y
  if (ix !== null) put('incrX', inch(ix))
  if (iy !== null) put('incrY', inch(iy))
  if (rows.length > 0) put('scanCount', countText(rows.length, r.options.numberWords))
  if (totals.readings > 0) put('readings', thousands(totals.readings))
  if (coverage) {
    put('coveragePercent', pct(coverage.autPercent))
    put('coverageArea', thousands(coverage.autArea))
    // Shell MUT areas (hatched part): only when the job has some; the drawing's figure is the total.
    if (coverage.mutArea > 0) {
      put('mutCoveragePercent', pct(coverage.mutPercent))
      put('mutCoverageArea', thousands(coverage.mutArea))
      put('totalCoveragePercent', pct(coverage.combinedPercent))
    }
  }
  if (totals.min) {
    put('minT', inch(totals.min.value))
    put('minScan', scanNumber(totals.min.scanId))
  }
  if (totals.wallLoss) put('wallLoss', pct(totals.wallLoss.value))
  if (nominal !== null && nominal !== undefined) put('nominal', inch(nominal))
  if (totals.average !== null) put('avgT', inch(totals.average))
  if (manual.readings > 0) put('manualReadings', String(manual.readings))
  return {
    values: v,
    numbers: { band: totals.wallLoss?.band ?? 0, manualReadings: manual.readings, scans: rows.length, mutArea: coverage?.mutArea ?? 0 },
    lossColor: totals.wallLoss?.color ?? 'normal',
  }
}

export interface Paragraph {
  /** The sentence(s) with {fields} left in, so figures can be coloured. */
  template: string
  text: string
  /** False when a value it needs is blank: left out of the PDF (Review asks for it). */
  complete: boolean
  block: TextBlockDef | null
}

/**
 * The paragraphs of the scope or the summary: the text edited by hand when there is one, else the template's blocks
 * that are on (a grouped block: the first whose condition holds) filled with the job's values.
 */
export function textParagraphs(p: Project, r: Report, t: ReportTemplate, part: 'scope' | 'summary', tv: TextValues = textValues(p, r, t)): Paragraph[] {
  const own = part === 'scope' ? r.text.scope : r.text.summary
  if (own.edited !== null && own.edited.trim() !== '') {
    return own.edited.split(/\n\s*\n/).map((s) => s.trim()).filter((s) => s).map((s) => ({ template: s, text: s, complete: true, block: null }))
  }
  const out: Paragraph[] = []
  const usedGroups = new Set<string>()
  for (const b of t.textBlocks) {
    if (b.part !== part) continue
    if (!(own.blocks[b.id] ?? b.defaultOn)) continue
    if (b.group && usedGroups.has(b.group)) continue
    if (!blockApplies(b.when, tv.numbers)) continue
    if (b.group) usedGroups.add(b.group)
    const complete = placeholders(b.text).every((k) => tv.values[k as TextField] !== undefined)
    out.push({ template: b.text, text: fillText(b.text, tv.values), complete, block: b })
  }
  return out
}

/** A template text of another part (calibration note, temperature note), filled; null when off or incomplete. */
export function noteText(t: ReportTemplate, part: 'calibration' | 'temperature'): string | null {
  const b = t.textBlocks.find((x) => x.part === part)
  if (!b || !b.defaultOn) return null
  return placeholders(b.text).length === 0 ? b.text : null
}
