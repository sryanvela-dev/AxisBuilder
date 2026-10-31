// Checks on the report (report design section 9, and section 14 for pictures): errors block the report PDF, warnings
// and notes never do. Each says what is wrong and how to fix it, like the drawing's checks (data/checks.ts), and says
// where it is (place) so the Review step and the step's own list can go to it. Some carry a one-click fix (actions).

import { scanOverlaps } from '../data/checks.ts'
import { rowOf } from '../data/overrides.ts'
import { formatNumber } from '../data/parse.ts'
import { idKey, type Project } from '../data/schema.ts'
import { activeSectionPlan } from '../engine/sections.ts'
import type { ReportStepId } from '../state/reportStepIds.ts'
import { jobLadder, readingRows, scanRows } from './calc/results.ts'
import { wallLossPercent } from './calc/ladder.ts'
import { sectionOn, sectionTitle, setSectionOn } from './edits.ts'
import { imageItems, type ImagePlace } from './imageItems.ts'
import { bandsOf } from './report.ts'
import type { FracBox, Mark, Report } from './schema.ts'
import { fieldPlace, isEdited, missingSentences, missingWords } from './summary.ts'
import { templateOf } from './templates/registry.ts'
import type { SectionDef } from './templates/types.ts'

export type ReportCheckPlace =
  | { kind: 'component'; id: string }
  | { kind: 'scan'; scanId: string }
  | { kind: 'reading'; index: number }
  /** A report picture (photo, cover, screenshot, ...): its place in the report. */
  | { kind: 'picture'; at: ImagePlace }
  /** A box or part of a step page, by its element id. */
  | { kind: 'field'; step: ReportStepId; elementId: string }
  /** A report section (the switch that turns it on or off). */
  | { kind: 'section'; id: string }
  /** A custom sheet on Photos and pages. */
  | { kind: 'sheet'; id: string }

/** A one-click fix: turn a section off. */
export interface ReportCheckAction {
  label: string
  kind: 'sectionOff'
  sectionId: string
}

export interface ReportCheck {
  /** error: blocks the PDF; warning: worth a look; note: for information. */
  severity: 'error' | 'warning' | 'note'
  place: ReportCheckPlace
  text: string
  fix: string
  actions?: ReportCheckAction[]
  /** The step that lists it, when not the step of its place (a summary sentence waiting for a Calibration value). */
  listOn?: ReportStepId
}

/** Wall Remain % from the CSV may differ from the recalculated value by this much (rounding). */
export const WALL_REMAIN_TOLERANCE = 0.1
/** A reading this much over its nominal (15%) is worth a second look (design 9). */
export const THICK_FACTOR = 1.15

/** The step whose page holds a section's content (where "Go to" takes you). */
export function sectionStep(def: SectionDef): ReportStepId {
  switch (def.pageType) {
    case 'photos': case 'custom': case 'uploaded': case 'drawing': return 'pages'
    case 'table': return def.options?.table === 'readings' ? 'manual' : 'results'
    case 'cscan': return 'results'
    case 'scopeSummary': return 'summary'
    case 'calibration': return 'calibration'
    default: return 'setup'
  }
}

/** Why a section that is on has nothing to print, or null when it has something. */
export function emptySection(p: Project, r: Report, def: SectionDef, scanCount: number): string | null {
  switch (def.pageType) {
    case 'photos': return r.photos.length === 0 ? 'has no photos' : null
    case 'custom': return r.customSheets.length === 0 ? 'has no custom sheets' : null
    case 'uploaded': return r.uploads.length === 0 ? 'has no reference pages' : null
    case 'cscan': return scanCount === 0 ? 'has no scans' : null
    case 'table': return def.options?.table === 'readings' ? (r.readings.length === 0 ? 'has no manual readings' : null) : scanCount === 0 ? 'has no scans' : null
    case 'drawing': {
      const o = r.options.drawings
      const sections = o.sections === 'as drawing' && activeSectionPlan(p) !== null
      const overlay = o.overlay && p.settings.generateOverlayDrawing && p.scans.length > 0
      const rollout = o.rollout && p.vessel.length !== null && p.vessel.height !== null
      return rollout || overlay || sections ? null : 'has no drawings chosen'
    }
    default: return null
  }
}

/** The part of a mark's 0-1 box, for "outside the crop". */
function markBounds(m: Mark): FracBox {
  const pts: (readonly [number, number])[] =
    m.kind === 'rect' || m.kind === 'ellipse' || m.kind === 'redaction' ? [[m.box.x0, m.box.y0], [m.box.x1, m.box.y1]]
      : m.kind === 'highlight' || m.kind === 'pen' ? m.points
        : m.kind === 'line' || m.kind === 'arrow' ? [m.from, m.to]
          : m.kind === 'label' ? [m.at, ...(m.leader ? [m.leader] : [])]
            : [m.at]
  const xs = pts.map((q) => q[0])
  const ys = pts.map((q) => q[1])
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

const outside = (b: FracBox, crop: FracBox) => b.x1 < crop.x0 || b.x0 > crop.x1 || b.y1 < crop.y0 || b.y0 > crop.y1

/** "The cover photo", "photo 3 (IMG_1.jpg)", for messages about pictures. */
export function pictureName(r: Report, at: ImagePlace, file: string | null): string {
  const f = file ? ` (${file})` : ''
  switch (at.kind) {
    case 'cover': return `The cover photo${f}`
    case 'calibration': return `The calibration screenshot${f}`
    case 'photo': return `Photo ${at.index + 1}${f}`
    case 'dataImage': return `The data page of ${at.scanId}${f}`
    case 'upload': return `Reference page ${at.index + 1}${f}`
    case 'sheetImage': {
      const sh = r.customSheets.find((s) => s.id === at.sheetId)
      return `A picture on the custom sheet "${sh?.title.trim() || 'Untitled'}"${f}`
    }
  }
}

function linkMissing(p: Project, m: Mark): boolean {
  if (!m.link) return false
  if (m.link.list === 'scans') return !p.scans.some((s) => idKey(s.id) === idKey(m.link!.id))
  return rowOf(p[m.link.list], m.link.id, m.link.occurrence) < 0
}

export function checkReport(p: Project): ReportCheck[] {
  const report = p.report
  if (!report) return []
  const out: ReportCheck[] = []
  const t = templateOf(report.templateId)
  const ladder = jobLadder(report, t)
  const field = (step: ReportStepId, elementId: string): ReportCheckPlace => ({ kind: 'field', step, elementId })

  // --- Setup: cover fields, components -------------------------------------------------------
  const required: [string, string, string][] = [
    [p.project.client, 'client', 'Client'],
    [p.project.component, 'component', 'Equipment ID'],
    [p.project.date, 'date', 'Date'],
  ]
  for (const [v, key, name] of required) {
    if (String(v ?? '').trim() === '') {
      out.push({ severity: 'error', place: field('setup', `setting-project-${key}`), text: `The cover has no ${name}.`, fix: `Enter the ${name} (it is the job's own, shared with the drawing).` })
    }
  }
  if (!report.job.techs.some((x) => x.name.trim() !== '')) {
    out.push({ severity: 'error', place: field('setup', 'report-examiners'), text: 'The cover names no examiner.', fix: 'Add at least one examiner with a name.' })
  }
  for (const c of report.components) {
    if (c.nominal === null) {
      out.push({ severity: 'error', place: { kind: 'component', id: c.id }, text: `${c.name} has no nominal thickness.`,
        fix: 'Enter its nominal; every scan and reading on it is measured against it.' })
    }
  }

  // --- Sections that are on with nothing to print ------------------------------------------------
  const rows = scanRows(p, report, ladder)
  for (const def of t.sections) {
    if (!sectionOn(report, def)) continue
    const why = emptySection(p, report, def, rows.length)
    if (why === null) continue
    out.push({
      severity: 'error', place: { kind: 'section', id: def.id }, text: `${sectionTitle(report, def)} is on but ${why}.`,
      fix: def.optional ? 'Add what it should print, or turn the section off.' : 'Add what it should print.',
      actions: def.optional ? [{ label: 'Turn the section off', kind: 'sectionOff', sectionId: def.id }] : undefined,
    })
  }

  // --- Calibration -------------------------------------------------------------------------------
  if (report.options.tempCorrection.on && report.options.tempCorrection.tempF === null) {
    out.push({ severity: 'error', place: field('calibration', 'report-field-temperature'), text: 'Temperature correction is on but has no temperature.',
      fix: 'Enter the surface temperature, or turn the correction off.' })
  }
  if (report.options.ladder.cutoffs !== null) {
    out.push({ severity: 'warning', place: field('results', 'report-field-ladder'), text: `The severity bands were changed for this job (${report.options.ladder.cutoffs.join(' / ')}%).`,
      fix: 'Check that is what the client asked for.' })
  }

  // --- Scans in the report -----------------------------------------------------------------------
  const cscanOn = t.sections.some((d) => d.pageType === 'cscan' && sectionOn(report, d))
  for (const r of rows) {
    const place = { kind: 'scan' as const, scanId: r.scan.id }
    if (!r.component) {
      out.push({ severity: 'error', place, text: `${r.scan.id} has no component.`,
        fix: report.components.length === 0 ? 'Add a component (e.g. Shell) with its nominal.' : 'Pick the component it was scanned on.' })
    }
    // A scan with neither (nothing imported yet) gets one line, not two.
    if (r.minT === null && r.readings === null) {
      out.push({ severity: 'error', place, text: `${r.scan.id} has no results yet.`, fix: 'Import the scansheet, type them in, or take the scan out of the report.' })
    } else {
      if (r.minT === null) out.push({ severity: 'error', place, text: `${r.scan.id} has no Min 'T'.`, fix: 'Import the scansheet, type it in, or take the scan out of the report.' })
      if (r.readings === null) out.push({ severity: 'error', place, text: `${r.scan.id} has no readings.`, fix: 'Import the scansheet, or enter the readings or the scan increments.' })
    }
    // Crossing two shell-course / plate bands (when no component was picked).
    if (!r.result?.componentId) {
      const bands = bandsOf(report, r.scan)
      if (bands.length > 1) {
        out.push({ severity: 'warning', place, text: `${r.scan.id} crosses ${bands.map((b) => b.name).join(' and ')}; it is measured against ${r.component?.name ?? 'neither'}.`,
          fix: 'Pick the component it belongs to.' })
      }
    }
    if (!r.scan.include) {
      out.push({ severity: 'warning', place, text: `${r.scan.id} is switched off in the drawing but is in the report.`, fix: 'Take it out of the report, or switch it on in the drawing (AUT scans).' })
    }
    if (cscanOn && r.result && !r.result.dataImage) {
      out.push({ severity: 'warning', place, text: `${r.scan.id} has no data-page screenshot; its C-scan page shows an empty box.`, fix: 'Match the screenshots, or pick the file for this scan.' })
    }
    // Wall Remain % in the CSV against the recalculated wall loss.
    const remain = r.result?.csvWallRemain ?? null
    const rawMin = r.result?.minT ?? null
    const loss = wallLossPercent(rawMin, r.nominal)
    if (remain !== null && loss !== null && Math.abs(100 - loss - remain) > WALL_REMAIN_TOLERANCE + 1e-9) {
      out.push({ severity: 'warning', place,
        text: `Wall Remain ${formatNumber(remain)}% in the CSV; ${formatNumber(rawMin!)} on ${formatNumber(r.nominal!)} is ${(100 - loss).toFixed(2)}%.`,
        fix: 'The report uses the recalculated value. Check the nominal and the CSV.' })
    }
    if (r.nominal !== null && r.minT !== null && r.minT > r.nominal * THICK_FACTOR) {
      out.push({ severity: 'warning', place, text: `${r.scan.id}: Min 'T' ${formatNumber(r.minT)} is more than 15% over the nominal ${formatNumber(r.nominal)}.`,
        fix: 'Check the component and its nominal.' })
    }
    if (r.result?.severityOverride) {
      out.push({ severity: 'warning', place, text: `${r.scan.id}: the severity was set by hand.`, fix: 'Listed for a second look; clear it to use the ladder.' })
    }
    if (r.result?.commentOverride !== null && r.result?.commentOverride !== undefined) {
      out.push({ severity: 'warning', place, text: `${r.scan.id}: the comment was written by hand.`, fix: 'Listed for a second look; clear it to use the built comment.' })
    }
  }
  // Drawing scans taken out of the report.
  for (const s of report.scanResults) {
    const scan = p.scans.find((x) => idKey(x.id) === idKey(s.scanId))
    if (scan && scan.include && !s.inReport) {
      out.push({ severity: 'warning', place: { kind: 'scan', scanId: scan.id }, text: `${scan.id} is drawn but left out of the report.`, fix: 'Put it back in the report, or switch it off in the drawing.' })
    }
  }

  // Overlapping scans: their readings are counted twice in the total.
  const inReport = new Set(rows.map((r) => idKey(r.scan.id)))
  for (const o of scanOverlaps(p)) {
    if (!inReport.has(idKey(o.a.id)) || !inReport.has(idKey(o.b.id))) continue
    out.push({ severity: 'warning', place: { kind: 'scan', scanId: o.b.id }, text: `${o.b.id} overlaps ${o.a.id} by ${formatNumber(o.area)} sq in.`,
      fix: 'Both scans’ readings are counted in the total. Fine for a rescan; otherwise check the positions.' })
  }

  // --- Manual readings ---------------------------------------------------------------------------
  for (const r of readingRows(p, report, ladder)) {
    const place = { kind: 'reading' as const, index: r.index }
    // With its position, so a nozzle's rows read apart ("N2 North").
    const name = [r.name || `Row ${r.index + 1}`, r.reading.location.trim()].filter(Boolean).join(' ')
    if (r.na !== null) continue
    if (!r.component && r.reading.nominalMode === 'component') {
      out.push({ severity: 'error', place, text: `${name} has no component.`, fix: 'Pick the component it was measured on, or give it its own nominal.' })
    } else if (r.nominal === null && r.reading.nominalMode !== 'component') {
      // (A component without a nominal is listed once, above.)
      const fix = r.reading.nominalMode === 'pipe'
        ? (r.reading.pipeSize === null ? 'Enter the pipe size, or switch the row to a custom nominal.' : 'Enter a reading so a wall can be suggested, or pick one.')
        : 'Type the nominal.'
      out.push({ severity: 'error', place, text: `${name} has no nominal.`, fix })
    }
    const thickest = Math.max(...[r.minT, r.avgT, r.maxT].filter((v): v is number => v !== null))
    if (r.pipePick?.flagged && !r.pipeOverridden) {
      out.push({ severity: 'warning', place, text: `${name}: the thickest reading is more than 15% over the suggested wall (${r.pipePick.wall.names[0]}, ${formatNumber(r.pipePick.wall.wall)}").`,
        fix: 'Check the pipe size and the readings, or pick the wall.' })
    } else if (r.nominal !== null && Number.isFinite(thickest) && thickest > r.nominal * THICK_FACTOR) {
      out.push({ severity: 'warning', place, text: `${name}: a reading of ${formatNumber(thickest)} is more than 15% over the nominal ${formatNumber(r.nominal)}.`,
        fix: 'Check the nominal and the reading.' })
    }
    if (r.pipeOverridden) out.push({ severity: 'warning', place, text: `${name}: the pipe wall was chosen by hand.`, fix: 'Listed for a second look.' })
    if (r.reading.severityOverride) out.push({ severity: 'warning', place, text: `${name}: the severity was set by hand.`, fix: 'Listed for a second look; clear it to use the ladder.' })
    if (r.reading.commentOverride !== null) out.push({ severity: 'warning', place, text: `${name}: the comment was written by hand.`, fix: 'Listed for a second look; clear it to use the built comment.' })
  }

  // --- Pictures (design 14) -------------------------------------------------------------------------
  for (const it of imageItems(report)) {
    if (!it.file) continue
    const what = pictureName(report, it.place, it.file)
    const place = { kind: 'picture' as const, at: it.place }
    if (it.edits.markup.some((m) => m.kind === 'redaction')) {
      out.push({ severity: 'note', place, text: `${what} has a redaction box: redaction comes in a later version, so the PDF does not hide that part yet.`,
        fix: 'Leave the picture out until then if what it covers must not be seen.' })
    }
    const lost = it.edits.markup.filter((m) => linkMissing(p, m))
    if (lost.length > 0) {
      out.push({ severity: 'warning', place, text: `${what} has ${lost.length === 1 ? 'a label' : `${lost.length} labels`} linked to ${lost.map((m) => m.link!.id).join(', ')}, which ${lost.length === 1 ? 'is' : 'are'} no longer in the drawing.`,
        fix: 'Link the label to another row, or delete it.' })
    }
    const crop = it.edits.crop
    if (crop) {
      const hidden = it.edits.markup.filter((m) => outside(markBounds(m), crop))
      if (hidden.length > 0) {
        out.push({ severity: 'note', place, text: `${what}: ${hidden.length === 1 ? 'a mark is' : `${hidden.length} marks are`} outside the crop, so ${hidden.length === 1 ? 'it does' : 'they do'} not print.`,
          fix: 'Widen the crop to show it; nothing was deleted.' })
      }
    }
  }

  // --- Custom sheets ------------------------------------------------------------------------------
  const plan = activeSectionPlan(p)
  for (const sh of report.customSheets) {
    const place = { kind: 'sheet' as const, id: sh.id }
    const title = sh.title.trim() || 'Untitled'
    if (sh.blocks.length === 0) out.push({ severity: 'warning', place, text: `The custom sheet "${title}" has nothing on it.`, fix: 'Add a block, or remove the sheet.' })
    for (const b of sh.blocks) {
      if (b.kind === 'view' && typeof b.view === 'string' && b.view.startsWith('section:')) {
        const n = Number(b.view.slice(8))
        if (!plan || n > plan.sections.length) {
          out.push({ severity: 'warning', place, text: `The custom sheet "${title}" shows section sheet ${n}, which the drawing does not have.`, fix: 'Pick another view, or turn section sheets on (Drawing step).' })
        }
      }
      if (b.kind === 'view' && (b.view === 'head1' || b.view === 'head2')) {
        const mode = p.settings.headViewMode
        const shown = mode === 'BOTH' || mode === (b.view === 'head1' ? 'HEAD 1' : 'HEAD 2')
        if (!shown) out.push({ severity: 'warning', place, text: `The custom sheet "${title}" shows ${b.view === 'head1' ? 'head 1' : 'head 2'}, which the drawing does not draw.`, fix: 'Pick another view, or turn the head view on (Field data, Heads).' })
      }
      if (b.kind === 'cscanBoxes' && b.scanId !== null && !p.scans.some((s) => idKey(s.id) === idKey(b.scanId!))) {
        out.push({ severity: 'warning', place, text: `The custom sheet "${title}" shows ${b.scanId}, which is no longer in the drawing.`, fix: 'Pick another scan.' })
      }
    }
  }

  // --- Summary: sentences left out, text edited by hand ------------------------------------------------
  for (const part of ['scope', 'summary'] as const) {
    for (const m of missingSentences(p, report, part, t)) {
      const at = fieldPlace(m.fields[0])
      out.push({
        severity: 'warning', place: field(at.step, at.elementId), listOn: 'summary',
        text: `${part === 'scope' ? 'Scope' : 'Summary'}: the "${m.block.label}" sentence is left out until ${missingWords(m)} ${missingWords(m).includes(', ') ? 'are' : 'is'} filled in.`,
        fix: m.block.checkDefault ? 'Fill it in and check the wording; the template asks for it.' : 'Fill it in, or turn the sentence off on the Summary step.',
      })
    }
    if (isEdited(report, part)) {
      out.push({ severity: 'warning', place: field('summary', `report-field-${part}-text`), text: `The ${part} text was edited by hand, so it no longer follows the data.`,
        fix: 'Listed for a second look; Regenerate shows the new text beside yours.' })
    }
  }
  return out
}

/** Applies a check's one-click fix. */
export function applyReportCheckAction(p: Project, action: ReportCheckAction): Project {
  return action.kind === 'sectionOff' ? setSectionOn(p, action.sectionId, false) : p
}
