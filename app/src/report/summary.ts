// The Summary step (report design 5 step 6, 4.7): the six number tiles, the scope builder (the template's blocks on /
// off, the purpose / area / limitations fields) and the generated scope and summary text. Text edited by hand is kept
// and flagged and is never replaced unless the user regenerates it (after seeing the new text beside theirs). A
// sentence missing a value is left out of the PDF and listed, with where to fill it in. Pure functions; each change is
// one app.edit() call, so one undo step.

import type { Project } from '../data/schema.ts'
import { reportCoverage, scanRows, totalsOf } from './calc/results.ts'
import type { TextField } from './calc/textFill.ts'
import { inch, pct, scanNumber, textParagraphs, textValues, thousands, type TextValues } from './pages/values.ts'
import type { Report } from './schema.ts'
import { templateOf } from './templates/registry.ts'
import type { LadderColor, ReportTemplate, TextBlockDef } from './templates/types.ts'
import type { ReportStepId } from '../state/reportStepIds.ts'

export type TextPart = 'scope' | 'summary'
export const SCOPE_FIELDS = ['purpose', 'areaCovered', 'limitations'] as const
export type ScopeField = (typeof SCOPE_FIELDS)[number]

const withReport = (p: Project, update: (r: Report) => Report): Project => {
  if (!p.report) return p
  const report = update(p.report)
  return report === p.report ? p : { ...p, report }
}

// --- Tiles -----------------------------------------------------------------------------------

export interface Tile {
  value: string
  label: string
  /** 'deep' = an ordinary figure; the minimum and wall loss take the worst scan's ladder colour. */
  tone: 'deep' | LadderColor
}

/** The six tiles, as the summary page prints them: scans, readings, coverage, minimum, wall loss, average. */
export function summaryTiles(p: Project, r: Report, tv: TextValues = textValues(p, r, templateOf(r.templateId))): Tile[] {
  const rows = scanRows(p, r)
  const t = totalsOf(rows)
  const cov = reportCoverage(p)
  const loss: Tile['tone'] = tv.lossColor === 'normal' ? 'deep' : tv.lossColor
  const nominal = tv.values.nominal
  return [
    { value: String(rows.length), label: 'AUT scans', tone: 'deep' },
    { value: t.readings ? thousands(t.readings) : '–', label: 'UT readings', tone: 'deep' },
    // Shell only (heads never count). With MUT areas the tile also gives the drawing's total, so the two agree.
    { value: cov ? pct(cov.autPercent) : '–', label: !cov ? 'AUT shell coverage' : cov.mutArea > 0 ? `AUT shell coverage; +${pct(cov.mutPercent)} MUT areas = ${pct(cov.combinedPercent)} total` : `AUT shell coverage (${thousands(cov.autArea)} sq in)`, tone: 'deep' },
    { value: t.min ? inch(t.min.value) : '–', label: t.min ? `Minimum, scan ${scanNumber(t.min.scanId)}` : 'Minimum', tone: loss },
    { value: t.wallLoss ? pct(t.wallLoss.value) : '–', label: nominal ? `Wall loss from ${nominal} nominal` : 'Wall loss', tone: loss },
    { value: t.average !== null ? inch(t.average) : '–', label: 'Average thickness', tone: 'deep' },
  ]
}

// --- Generated and edited text ------------------------------------------------------------------

const ownText = (r: Report, part: TextPart) => (part === 'scope' ? r.text.scope : r.text.summary)

/** True when the text was edited by hand (kept until Regenerate). */
export function isEdited(r: Report, part: TextPart): boolean {
  const e = ownText(r, part).edited
  return e !== null && e.trim() !== ''
}

/** The text the template's blocks give now (whatever was edited), complete sentences only, paragraphs apart. */
export function generatedText(p: Project, r: Report, part: TextPart, t: ReportTemplate = templateOf(r.templateId)): string {
  const unedited: Report = { ...r, text: { ...r.text, [part]: { ...ownText(r, part), edited: null } } }
  return textParagraphs(p, unedited, t, part).filter((x) => x.complete).map((x) => x.text).join('\n\n')
}

/** The text that prints: the edited text, else the generated. */
export function shownText(p: Project, r: Report, part: TextPart): string {
  return isEdited(r, part) ? ownText(r, part).edited!.trim() : generatedText(p, r, part)
}

/** A field in plain words, for the list of sentences left out ("the transducer (Calibration)"). */
export function fieldWords(k: TextField): string {
  if (k.startsWith('transducer')) return 'the transducer (Calibration)'
  if (k === 'incrX' || k === 'incrY') return 'the scan increments (Calibration)'
  const words: Partial<Record<TextField, string>> = {
    purpose: 'the purpose (Summary)', areaCovered: 'the area covered (Summary)', limitations: 'the limitations (Summary)',
    equipment: 'the Equipment ID', nominal: 'the nominal (Setup, components)', scanCount: 'the scans', readings: 'the readings (AUT results)',
    coveragePercent: 'the coverage (vessel size and scans)', coverageArea: 'the coverage (vessel size and scans)',
    mutCoveragePercent: 'the MUT areas (drawing)', mutCoverageArea: 'the MUT areas (drawing)', totalCoveragePercent: 'the coverage (vessel size and scans)',
    minT: "the Min 'T' (AUT results)", minScan: "the Min 'T' (AUT results)", wallLoss: 'the wall loss (nominal and Min \'T\')',
    avgT: "the Avg 'T' (AUT results)",
  }
  return words[k] ?? k
}

/** Where a field is filled in: the report step and the element to jump to. */
export function fieldPlace(k: TextField): { step: ReportStepId; elementId: string } {
  if (k === 'purpose' || k === 'areaCovered' || k === 'limitations') return { step: 'summary', elementId: `report-field-scope-${k}` }
  if (k.startsWith('transducer')) return { step: 'calibration', elementId: 'report-field-transducers' }
  if (k === 'incrX' || k === 'incrY') return { step: 'calibration', elementId: 'report-field-increments' }
  if (k === 'equipment') return { step: 'setup', elementId: 'setting-project-component' }
  if (k === 'nominal') return { step: 'setup', elementId: 'report-components' }
  if (k === 'coveragePercent' || k === 'coverageArea' || k === 'mutCoveragePercent' || k === 'mutCoverageArea' || k === 'totalCoveragePercent') return { step: 'setup', elementId: 'setting-vessel-height' }
  if (k === 'manualReadings') return { step: 'manual', elementId: 'report-readings' }
  return { step: 'results', elementId: 'report-results' }
}

export interface MissingSentence {
  part: TextPart
  block: TextBlockDef
  /** The blank values it needs, in the order the sentence uses them. */
  fields: TextField[]
}

/** Sentences of the generated text left out because a value is blank (none while the text is edited by hand). */
export function missingSentences(p: Project, r: Report, part: TextPart, t: ReportTemplate = templateOf(r.templateId)): MissingSentence[] {
  if (isEdited(r, part)) return []
  const tv = textValues(p, r, t)
  return textParagraphs(p, r, t, part, tv)
    .filter((x) => !x.complete && x.block)
    .map((x) => ({
      part, block: x.block!,
      fields: [...new Set((x.template.match(/\{\w+\}/g) ?? []).map((k) => k.slice(1, -1) as TextField).filter((k) => tv.values[k] === undefined))],
    }))
}

/** "the purpose (Summary), the area covered (Summary)" with repeats taken out. */
export function missingWords(m: MissingSentence): string {
  return [...new Set(m.fields.map(fieldWords))].join(', ')
}

// --- Changes -----------------------------------------------------------------------------------

/** Whether a text block is on (the job's choice, else the template's default). */
export function blockOn(r: Report, b: TextBlockDef): boolean {
  if (b.part !== 'scope' && b.part !== 'summary') return b.defaultOn
  return ownText(r, b.part).blocks[b.id] ?? b.defaultOn
}

/** Turns a scope or summary block on or off; the template's default removes the job's choice. */
export function setTextBlock(p: Project, part: TextPart, id: string, on: boolean): Project {
  return withReport(p, (r) => {
    const b = templateOf(r.templateId).textBlocks.find((x) => x.id === id && x.part === part)
    if (!b) return r
    const own = ownText(r, part)
    // Every block of a group switches together (the findings sentence by ladder band).
    const ids = b.group ? templateOf(r.templateId).textBlocks.filter((x) => x.group === b.group && x.part === part).map((x) => x.id) : [id]
    const blocks = { ...own.blocks }
    let changed = false
    for (const k of ids) {
      const def = templateOf(r.templateId).textBlocks.find((x) => x.id === k)!
      const before = blocks[k]
      if (on === def.defaultOn) delete blocks[k]
      else blocks[k] = on
      if (blocks[k] !== before) changed = true
    }
    return changed ? { ...r, text: { ...r.text, [part]: { ...own, blocks } } } : r
  })
}

export function setScopeField(p: Project, key: ScopeField, value: string): Project {
  return withReport(p, (r) => {
    const fields = r.text.scope.fields
    if (fields[key] === value) return r
    return { ...r, text: { ...r.text, scope: { ...r.text.scope, fields: { ...fields, [key]: value } } } }
  })
}

const sameText = (a: string, b: string) => a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim()

/**
 * The text as the user typed it: kept and flagged as edited by hand. Text equal to the generated (or blank) is not an
 * edit: the text follows the data again. `now` is an ISO date-time.
 */
export function editText(p: Project, part: TextPart, text: string, now: string): Project {
  return withReport(p, (r) => {
    const own = ownText(r, part)
    const edited = text.trim() === '' || sameText(text, generatedText(p, r, part)) ? null : text.replace(/\s+$/, '')
    if (edited === own.edited) return r
    const next = part === 'summary' ? { ...r.text.summary, edited, editedAt: edited === null ? null : now } : { ...r.text.scope, edited }
    return { ...r, text: { ...r.text, [part]: next } }
  })
}

/** Regenerate: the edit is dropped and the generated text prints again (asked first on the screen). */
export function regenerateText(p: Project, part: TextPart, now: string): Project {
  return withReport(p, (r) => {
    if (!isEdited(r, part) && ownText(r, part).edited === null) return r
    const next = part === 'summary' ? { ...r.text.summary, edited: null, editedAt: null, generatedAt: now } : { ...r.text.scope, edited: null }
    return { ...r, text: { ...r.text, [part]: next } }
  })
}
