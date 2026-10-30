// The figures every report page and check reads (design 8): one row per scan in the report and per manual reading,
// each against its own nominal, then the totals and the coverage. Pure; nothing here is stored.

import { countedScans, coveragePercent, drawnScans } from '../../engine/layout.ts'
import { mutAreaSize, mutCoverageArea } from '../../engine/mutAreas.ts'
import { circumference, scanXRange } from '../../engine/wrap.ts'
import { idKey, type Project, type Scan } from '../../data/schema.ts'
import { linkedRow, readingComponent, resultOf, scanComponent } from '../report.ts'
import type { Component, Reading, Report, ScanResult } from '../schema.ts'
import { templateOf } from '../templates/registry.ts'
import type { LadderColor, LadderDef, ReportTemplate } from '../templates/types.ts'
import { buildComment, ladderBand, ladderColor, wallLossPercent, type BuiltComment } from './ladder.ts'
import { correctedThickness, readingsFromIncrements } from './numbers.ts'
import { pickPipeWall, pipeSize, type PipePick } from './pipeWalls.ts'

/** The ladder a job uses: the template's, with the job's own cutoffs when it changed them. */
export function jobLadder(report: Report, template: ReportTemplate = templateOf(report.templateId)): LadderDef {
  const cutoffs = report.options.ladder.cutoffs
  return cutoffs ? { ...template.ladder, cutoffs } : template.ladder
}

interface Graded {
  wallLoss: number | null
  band: number | null
  color: LadderColor | null
  comment: BuiltComment | null
}

function grade(ladder: LadderDef, minT: number | null, nominal: number | null, picks: Parameters<typeof buildComment>[2]): Graded {
  const wallLoss = wallLossPercent(minT, nominal)
  if (wallLoss === null) return { wallLoss, band: null, color: null, comment: null }
  const band = ladderBand(wallLoss, ladder.cutoffs)
  return { wallLoss, band, color: ladderColor(ladder, band), comment: buildComment(ladder, band, picks) }
}

// --- Scans -----------------------------------------------------------------------------------

/** X run of a scan as the AUT unit scanned it: across the seam the short way round, else |X stop - X start|. */
export function scanSpanX(scan: Scan, C: number | null): number | null {
  if (scan.xStart === null || scan.xStop === null) return null
  const { a, b } = scanXRange(scan, C)
  return Math.abs(b - a)
}

export interface ScanRow {
  scan: Scan
  /** The stored result, or undefined (a drawing scan with no results yet; still listed). */
  result: ScanResult | undefined
  component: Component | undefined
  readings: number | null
  /** Readings worked out from the positions (stored readings blank): shown "calculated". */
  readingsCalculated: boolean
  /** After temperature correction when it is on. */
  minT: number | null
  avgT: number | null
  nominal: number | null
  /** Scan area on the vessel, sq in (gross, as the drawing's coverage). */
  area: number | null
  wallLoss: number | null
  band: number | null
  color: LadderColor | null
  comment: BuiltComment | null
}

/** One row per drawing scan that is in the report (its result's "In report" on, or no result yet), in scan order. */
export function scanRows(p: Project, report: Report, ladder: LadderDef = jobLadder(report)): ScanRow[] {
  const C = circumference(p)
  const temp = report.options.tempCorrection
  return p.scans.flatMap((scan) => {
    const result = resultOf(report, scan.id)
    if (result && !result.inReport) return []
    const component = scanComponent(report, scan, result)
    const spanX = scanSpanX(scan, C)
    const spanY = scan.yStart === null || scan.yStop === null ? null : Math.abs(scan.yStop - scan.yStart)
    const stored = result?.readings ?? null
    const worked = stored === null
      ? readingsFromIncrements(spanX, spanY, result?.incrX ?? report.calibration.increments.x, result?.incrY ?? report.calibration.increments.y)
      : null
    const minT = correctedThickness(result?.minT ?? null, temp)
    const avgT = correctedThickness(result?.avgT ?? null, temp)
    const nominal = component?.nominal ?? null
    const g = result ? grade(ladder, minT, nominal, result) : { wallLoss: null, band: null, color: null, comment: null }
    return [{
      scan, result, component,
      readings: stored ?? worked, readingsCalculated: stored === null && worked !== null,
      minT, avgT, nominal,
      area: spanX === null || spanY === null ? null : spanX * spanY,
      ...g,
    }]
  })
}

export interface Totals {
  scans: number
  /** Sum of the readings (overlaps are flagged by the checks, not removed). */
  readings: number
  /** Lowest minimum and its scan. */
  min: { value: number; scanId: string } | null
  /** Average of the scan averages, weighted by readings (user, 2026-10-28). */
  average: number | null
  /** Worst wall loss of any scan, each against its own component's nominal. */
  wallLoss: { value: number; scanId: string; band: number; color: LadderColor } | null
}

/** Totals of a set of scan rows (the whole scan sheet, or one component's rows). */
export function totalsOf(rows: readonly ScanRow[]): Totals {
  let readings = 0
  let weighted = 0
  let weight = 0
  let min: Totals['min'] = null
  let wallLoss: Totals['wallLoss'] = null
  for (const r of rows) {
    if (r.readings !== null) readings += r.readings
    if (r.avgT !== null && r.readings !== null && r.readings > 0) {
      weighted += r.avgT * r.readings
      weight += r.readings
    }
    if (r.minT !== null && (min === null || r.minT < min.value)) min = { value: r.minT, scanId: r.scan.id }
    if (r.wallLoss !== null && (wallLoss === null || r.wallLoss > wallLoss.value)) {
      wallLoss = { value: r.wallLoss, scanId: r.scan.id, band: r.band!, color: r.color! }
    }
  }
  return { scans: rows.length, readings, min, average: weight > 0 ? weighted / weight : null, wallLoss }
}

/** Totals per component, in the components' order (a component with no scans is left out). */
export function totalsByComponent(report: Report, rows: readonly ScanRow[]): { component: Component; totals: Totals }[] {
  return report.components.flatMap((component) => {
    const own = rows.filter((r) => r.component?.id === component.id)
    return own.length ? [{ component, totals: totalsOf(own) }] : []
  })
}

// --- Coverage --------------------------------------------------------------------------------

export interface Coverage {
  /** Circumference x length, sq in. */
  componentArea: number
  /** Gross scanned area (issue #9: overlaps counted twice), sq in, and %. */
  autArea: number
  autPercent: number
  /** Hatched part of the shell MUT areas, sq in, and %. */
  mutArea: number
  mutPercent: number
  /** The drawing's own coverage figure (AUT + MUT). */
  combinedPercent: number
}

/**
 * Coverage as the drawing works it out (engine/layout coveragePercent, engine/mutAreas mutCoverageArea), shown
 * whatever the drawing's "Show coverage %" is. Null without a vessel size.
 */
export function reportCoverage(p: Project): Coverage | null {
  const q = p.settings.showCoveragePercentage ? p : { ...p, settings: { ...p.settings, showCoveragePercentage: true } }
  const counted = countedScans(q, drawnScans(q), false)
  const mutArea = mutCoverageArea(q)
  const autPercent = coveragePercent(q, counted)
  const mutPercent = coveragePercent(q, [], mutArea)
  const combinedPercent = coveragePercent(q, counted, mutArea)
  if (autPercent === null || mutPercent === null || combinedPercent === null) return null
  const componentArea = q.vessel.length! * q.vessel.height!
  return { componentArea, autArea: (autPercent / 100) * componentArea, autPercent, mutArea, mutPercent, combinedPercent }
}

// --- Manual readings -------------------------------------------------------------------------

export interface ReadingRow {
  reading: Reading
  index: number
  /** Linked rows: the drawing's ID; nozzle rows: the nozzle's ID when no name is typed. */
  name: string
  component: Component | undefined
  /** N/A: the reason, and no figures. */
  na: string | null
  minT: number | null
  avgT: number | null
  maxT: number | null
  /** MUT scan area, sq in (a linked row: its drawn area). */
  area: number | null
  nominal: number | null
  /** Pipe rows: the suggested wall (null for an unknown size or no reading). */
  pipePick: PipePick | null
  /** Pipe rows: a wall chosen by hand instead of the suggestion (flagged). */
  pipeOverridden: boolean
  wallLoss: number | null
  band: number | null
  color: LadderColor | null
  comment: BuiltComment | null
}

/** Rows that belong to one nozzle for the pipe pick: the same linked nozzle, else the same name. */
const nozzleKey = (r: Reading, name: string) => (r.nozzle ? `${r.nozzle.list}:${idKey(r.nozzle.id)}:${r.nozzle.occurrence}` : `name:${idKey(name)}`)

/** The thickest value a row measured (UTT: its reading; MUT scan: max, else avg, else min). */
const thickestOf = (r: { minT: number | null; avgT: number | null; maxT: number | null }) =>
  Math.max(...[r.minT, r.avgT, r.maxT].filter((v): v is number => v !== null))

export function readingRows(p: Project, report: Report, ladder: LadderDef = jobLadder(report)): ReadingRow[] {
  const temp = report.options.tempCorrection
  const base = report.readings.map((reading, index) => {
    const row = linkedRow(p, reading)
    const nozzleId = reading.nozzle?.id ?? ''
    const name = row ? row.id : reading.name.trim() || nozzleId
    const drawnArea = row && reading.link ? mutAreaSize(p, reading.link.list, row)?.sqIn ?? null : null
    return {
      reading, index, name, row,
      component: readingComponent(p, report, reading),
      minT: correctedThickness(row ? row.minT : reading.minT, temp),
      avgT: correctedThickness(reading.avgT, temp),
      maxT: correctedThickness(reading.maxT, temp),
      area: drawnArea ?? reading.area,
    }
  })
  // Thickest reading per nozzle, over all its rows that were measured.
  const thickest = new Map<string, number>()
  for (const b of base) {
    if (b.reading.na !== null) continue
    const t = thickestOf(b)
    if (!Number.isFinite(t)) continue
    const k = nozzleKey(b.reading, b.name)
    thickest.set(k, Math.max(thickest.get(k) ?? 0, t))
  }
  return base.map((b) => {
    const r = b.reading
    let nominal: number | null = null
    let pipePick: PipePick | null = null
    if (r.nominalMode === 'component') nominal = b.component?.nominal ?? null
    else if (r.nominalMode === 'custom') nominal = r.nominal
    else {
      pipePick = r.pipeSize === null ? null : pickPipeWall(r.pipeSize, thickest.get(nozzleKey(r, b.name)) ?? null)
      nominal = r.nominal ?? pipePick?.wall.wall ?? null
    }
    const pipeOverridden = r.nominalMode === 'pipe' && r.nominal !== null && r.nominal !== pipePick?.wall.wall
    if (r.na !== null) {
      return { reading: r, index: b.index, name: b.name, component: b.component, na: r.na, minT: null, avgT: null, maxT: null, area: b.area,
        nominal, pipePick, pipeOverridden, wallLoss: null, band: null, color: null, comment: null }
    }
    return { reading: r, index: b.index, name: b.name, component: b.component, na: null, minT: b.minT, avgT: b.avgT, maxT: b.maxT, area: b.area,
      nominal, pipePick, pipeOverridden, ...grade(ladder, b.minT, nominal, r) }
  })
}

/** Manual table totals (design 6.8): rows measured, and the minimum with its name. */
export function readingTotals(rows: readonly ReadingRow[]): { readings: number; min: { value: number; name: string } | null } {
  let readings = 0
  let min: { value: number; name: string } | null = null
  for (const r of rows) {
    if (r.na !== null || r.minT === null) continue
    readings++
    if (min === null || r.minT < min.value) min = { value: r.minT, name: r.name }
  }
  return { readings, min }
}

/** The pipe walls a pipe row can pick from (for the dropdown and the checks). */
export function pipeWallsFor(nps: string | null) {
  return nps === null ? [] : (pipeSize(nps)?.walls ?? [])
}
