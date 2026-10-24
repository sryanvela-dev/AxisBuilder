// Job layout shared by the LISP exporter and the preview: everything v5.0's VBA works out before the
// drawing is made (moved here unchanged from export/lsp/exportLsp.ts). Each function names the VBA
// routine it follows; v5.0 quirks are kept on purpose (app/docs/phase2-notes.md).

import { defaultProcessedName, pieceImageName, processedImageNames } from '../data/imageMatch.ts'
import type { HeadMut, HeadNozzle, Project, Scan } from '../data/schema.ts'
import { formatDate } from '../data/settings.ts'
import { panelScales } from './styles.ts'
import { circumference, isWrapped, scanPieces, scanXRange } from './wrap.ts'

export const ucaseTrim = (s: string) => s.trim().toUpperCase()

/** Orientation as v5.0 compares it: "VERTICAL", "HORIZONTAL CW", "HORIZONTAL CCW". */
export function orientationKey(p: Project): string {
  return p.vessel.orientation.toUpperCase()
}

/** v5.0 NormalizeHeadName (the app already stores "HEAD 1" / "HEAD 2"). */
export function shouldShowHead(headMode: string, head: string): boolean {
  return headMode === 'BOTH' || (headMode === 'HEAD 1' && head === 'HEAD 1') || (headMode === 'HEAD 2' && head === 'HEAD 2')
}

/** v5.0 RadiusFactor (the app stores CUSTOM as a percent of the radius). */
export function radiusFactor(item: HeadNozzle | HeadMut): number {
  switch (item.radiusPosition ?? 'CENTER') {
    case 'CENTER':
      return 0
    case 'HALF':
      return 0.5
    case 'THREE_QUARTER':
      return 0.75
    case 'OUTER':
      return 1
    case 'CUSTOM':
      return item.customRadiusPercent === null ? 0.5 : item.customRadiusPercent / 100
  }
}

/** v5.0 ClockPositionDegrees: hours or H:MM (12 = 0 degrees), degrees with a degree sign. */
export function clockPositionDegrees(clockText: string | null): number {
  const t = (clockText ?? '').trim()
  if (t === '' || t.toUpperCase() === 'REVIEW') return 0
  const num = (s: string) => (/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s.trim()) ? Number(s) : NaN)
  if (t.endsWith('°')) {
    const d = num(t.slice(0, -1))
    return Number.isNaN(d) ? 0 : d
  }
  let hr: number
  let mn = 0
  if (t.includes(':')) {
    const parts = t.split(':')
    hr = num(parts[0])
    mn = num(parts[1])
    if (Number.isNaN(hr) || Number.isNaN(mn)) return 0
  } else {
    hr = num(t)
    if (Number.isNaN(hr)) return 0
  }
  if (hr === 12) hr = 0
  return hr * 30 + mn * 0.5
}

/** v5.0 HeadViewDiameter. */
export function headViewDiameter(headSize: string, vesselHeight: number): number {
  let d: number
  switch (headSize) {
    case 'MEDIUM':
      d = vesselHeight * 0.3
      break
    case 'LARGE':
      d = vesselHeight * 0.38
      break
    default:
      d = vesselHeight * 0.24
  }
  return d < 24 ? 24 : d
}

/** v5.0 AxisDirectionText + AxisLabel. */
export function axisLabel(base: string, directionText: string, cardinal: string): string {
  const dir = ucaseTrim(directionText) !== '' ? ucaseTrim(directionText) : ucaseTrim(cardinal)
  return dir === '' ? base : `${base} ${dir}`
}

export function axisLabels(p: Project): { x: string; y: string } {
  return {
    x: axisLabel('X AXIS DIRECTION', p.vessel.xAxisDirectionText, p.vessel.xAxisCardinal),
    y: axisLabel('Y AXIS DIRECTION', p.vessel.yAxisDirectionText, p.vessel.yAxisCardinal),
  }
}

// --- Right-side panel (v5.0 ComputeRightPanelLayout and helpers) ------------------------------------

export interface Panel {
  legendX: number
  legendY: number
  head1X: number
  head1Y: number
  head2X: number
  head2Y: number
  titleX: number
  titleY: number
}

/**
 * ComputeRightPanelLayout. scales (app only, engine/styles.ts panelScales): a legend or title block drawn
 * bigger takes that much more room, and what is above it moves up. 1 and 1 give v5.0's layout.
 */
export function computeRightPanelLayout(ori: string, placement: string, vesselHeight: number, vesselLength: number,
  headDia: number, headMode: string, scales: { legend: number; title: number } = { legend: 1, title: 1 }): Panel {
  // RightPanelExtraForRightRuler
  const extra = (ori === 'VERTICAL' || ori === 'HORIZONTAL CW') &&
    (placement === 'RIGHT' || placement === 'TOP + RIGHT' || placement === 'BOTTOM + RIGHT') ? 15 : 0
  // RightPanelLeft (gap 12; CCW gap 12)
  const panelLeft = ori === 'HORIZONTAL CW' ? vesselLength + 12 + extra : ori === 'HORIZONTAL CCW' ? 12 : vesselHeight + 12 + extra
  // VisualVesselBottom
  const panelBottom = ori === 'HORIZONTAL CW' ? -vesselHeight : 0
  const r = headDia / 2
  const headGap = 14
  const legendClearance = 18
  const titleBlockHeight = 6 * 3.4 * scales.title
  const titleClearance = 16
  const legendVisualBottom = panelBottom
  const legendVisualTop = legendVisualBottom + 36 * scales.legend
  const ls = scales.legend

  let h2VX = panelLeft + r
  let h2VY = legendVisualTop + legendClearance + r
  let h1VX = h2VX
  let h1VY = h2VY + headDia + headGap
  let titleVX: number
  let titleVY: number
  switch (headMode) {
    case 'HEAD 1':
    case 'HEAD 2':
      h2VX = h1VX
      h2VY = h1VY
      titleVX = panelLeft
      titleVY = h1VY + r + titleClearance + titleBlockHeight
      break
    case 'BOTH':
      titleVX = panelLeft
      titleVY = h1VY + r + titleClearance + titleBlockHeight
      break
    default:
      h1VX = panelLeft + r
      h1VY = legendVisualTop + legendClearance
      h2VX = h1VX
      h2VY = h1VY
      titleVX = panelLeft
      titleVY = legendVisualTop + legendClearance + titleBlockHeight
  }
  // VisualToLogicalX / VisualToLogicalY
  const lx = (vx: number, vy: number) => (ori === 'HORIZONTAL CW' ? -vy : ori === 'HORIZONTAL CCW' ? vy : vx)
  const ly = (vx: number, vy: number) => (ori === 'HORIZONTAL CW' ? vx : ori === 'HORIZONTAL CCW' ? -vx : vy)
  let legendX: number
  let legendY: number
  if (ori === 'HORIZONTAL CW') {
    legendX = -legendVisualBottom - 30.8 * ls
    legendY = panelLeft
  } else if (ori === 'HORIZONTAL CCW') {
    legendX = legendVisualBottom + 15.8 * ls
    legendY = -(panelLeft + 15 * ls)
  } else {
    legendX = panelLeft
    legendY = legendVisualBottom + 10.8 * ls
  }
  return {
    legendX,
    legendY,
    head1X: lx(h1VX, h1VY),
    head1Y: ly(h1VX, h1VY),
    head2X: lx(h2VX, h2VY),
    head2Y: ly(h2VX, h2VY),
    titleX: lx(titleVX, titleVY),
    titleY: ly(titleVX, titleVY),
  }
}

/** Head view size and the right panel of a project (both need the vessel size). v5 = v5.0's layout. */
export function panelOf(p: Project, v5 = false): { headDia: number; panel: Panel } {
  const headDia = headViewDiameter(p.settings.headViewSize, p.vessel.height!)
  const panel = computeRightPanelLayout(orientationKey(p), p.settings.rulerPlacement.toUpperCase().trim(), p.vessel.height!, p.vessel.length!, headDia,
    p.settings.headViewMode, v5 ? undefined : panelScales(p.settings))
  return { headDia, panel }
}

// --- Reference labels (v5.0 PrintVesselReferenceLabels / WriteSectionPageSettings) -----------------

const SET_LABELS: Record<string, string[]> = {
  NDC: ['N.D.C.', 'E.D.C.', 'S.D.C.', 'W.D.C.', 'N.D.C.'],
  NP: ['NAMEPLATE D.C.', 'NP + 90°', '180° OPPOSITE', 'NP + 270°', 'NAMEPLATE D.C.'],
  TDC: ['T.D.C.', 'R.D.C.', 'B.D.C.', 'L.D.C.', 'T.D.C.'],
}

export function setLabels(setRef: string): string[] {
  if (setRef === 'NDC/SDC' || setRef === 'NDC / SDC') return SET_LABELS.NDC
  if (['NAMEPLATE DC', 'NAMEPLATE D.C.', 'NAMEPLATE D.C', 'NPDC'].includes(setRef)) return SET_LABELS.NP
  return SET_LABELS.TDC
}

/** ReadCustomReferenceLabels: the five custom label cells, as they are. */
export function customLabels(p: Project): string[] {
  const v = p.vessel
  return [v.refLabel0, v.refLabel90, v.refLabel180, v.refLabel270, v.refLabel360]
}

/** The reference labels the main drawing shows, or null when it shows none (PrintVesselReferenceLabels). */
export function drawnReferenceLabels(p: Project): string[] | null {
  if (!p.settings.showVesselReferenceLabels) return null
  const modeRef = ucaseTrim(p.vessel.referenceLabelMode)
  let labels: string[]
  if (modeRef === 'CUSTOM CARDINAL' || modeRef === 'CUSTOM') labels = customLabels(p)
  else if (modeRef === 'NONE' || modeRef === 'OFF' || modeRef === 'NO') return null
  else labels = setLabels(ucaseTrim(p.vessel.referenceLabelSet))
  return labels.every((l) => l.trim() === '') ? null : labels
}

/** The labels written to the section-page settings (always a full set). */
export function sectionReferenceLabels(p: Project): string[] {
  const modeRef = ucaseTrim(p.vessel.referenceLabelMode)
  return modeRef === 'CUSTOM CARDINAL' || modeRef === 'CUSTOM' ? customLabels(p) : setLabels(ucaseTrim(p.vessel.referenceLabelSet))
}

/** PrintVesselReferenceLabels: where the ticks go, the tick length and text sizes. */
export interface ReferenceLabels {
  labels: string[]
  /** True: along y = 0, pointing out (negative); false: along y = vessel length, pointing out (positive). */
  atStart: boolean
  tickLen: number
  textGap: number
  textH: number
}

export function referenceLabelLayout(p: Project): ReferenceLabels | null {
  const labels = drawnReferenceLabels(p)
  if (!labels) return null
  let tickLen = p.settings.referenceLabelTickLength
  if (tickLen <= 0) tickLen = 3
  const ori = orientationKey(p)
  const placement = ucaseTrim(p.settings.rulerPlacement) || 'BOTTOM + LEFT'
  const atStart = ori === 'HORIZONTAL CW' ? placement.includes('RIGHT') : ori === 'HORIZONTAL CCW' ? placement.includes('LEFT') : placement.includes('TOP')
  return { labels, atStart, tickLen, textGap: 1.25, textH: 1.5 }
}

/** The five positions along X, as fractions of the vessel's X length. */
export const REFERENCE_POSITIONS = [0, 0.25, 0.5, 0.75, 1] as const

// --- Title block ---------------------------------------------------------------------------------

/**
 * GetDrawingInfoValue("Date"): v5.0 prints the cell's displayed text. The v5.0 workbook's Date cell is
 * formatted m/d/yy, so a date prints as "10/13/26".
 */
function displayDate(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  return `${m}/${d}/${String(y % 100).padStart(2, '0')}`
}

/**
 * The seven title block lines (GetDrawingInfoValue: blank title -> "AUT COVERAGE MAP"). The date is
 * v5.0's m/d/yy, or Oct-22-2026 in the app (change 10).
 */
export function titleLines(p: Project, v5: boolean): string[] {
  const i = p.project
  return [
    i.drawingTitle.trim() === '' ? 'AUT COVERAGE MAP' : i.drawingTitle,
    `COMPONENT: ${i.component}`,
    `UNIT: ${i.unit}`,
    `CLIENT: ${i.client}`,
    `INSPECTOR: ${i.inspector}`,
    `DATE: ${v5 ? displayDate(i.date) : formatDate(i.date)}`,
    `REV: ${i.revision}`,
  ]
}

// --- Scans, coverage and images ----------------------------------------------------------------------

/**
 * Validation (Enable Validation) flips reversed scan coordinates before drawing. In the app, a reversed scan
 * marked "across the seam" is not flipped: it runs from X start to X stop + circumference (engine/wrap.ts).
 */
export function drawnScans(p: Project, v5 = false): Scan[] {
  const C = circumference(p)
  return p.scans.map((sc) => {
    if (!v5 && sc.xStart !== null && sc.xStop !== null && sc.xStart > sc.xStop && sc.acrossSeam && !sc.noWrap && C !== null) {
      const out = { ...sc, xStop: scanXRange(sc, C).b }
      if (p.settings.enableValidation && out.yStart! > out.yStop!) [out.yStart, out.yStop] = [out.yStop, out.yStart]
      return out
    }
    if (!p.settings.enableValidation) return sc
    const out = { ...sc }
    if (out.xStart! > out.xStop!) [out.xStart, out.xStop] = [out.xStop, out.xStart]
    if (out.yStart! > out.yStop!) [out.yStart, out.yStop] = [out.yStop, out.yStart]
    return out
  })
}

/**
 * Scans that count for coverage and Total Scans. v5.0 counts them before the flip, so a reversed scan is
 * left out (change 1: the app counts it).
 */
export function countedScans(p: Project, scans: Scan[], v5: boolean): Scan[] {
  return (v5 ? p.scans : scans).filter((sc) => sc.include && sc.xStop! - sc.xStart! > 0 && sc.yStop! - sc.yStart! > 0)
}

/** Coverage % (gross scanned area / shell area), or null when it is not shown. */
export function coveragePercent(p: Project, counted: Scan[]): number | null {
  const vesselArea = p.vessel.length! * p.vessel.height!
  if (!(vesselArea > 0) || !p.settings.showCoveragePercentage) return null
  const area = counted.reduce((a, sc) => a + (sc.xStop! - sc.xStart!) * (sc.yStop! - sc.yStart!), 0)
  return (area / vesselArea) * 100
}

export interface ImageInsert {
  scanId: string
  /** For a scan wrapped across the seam: which piece (0 = A, where it starts; 1 = B). */
  piece?: number
  /** For a piece: the part of the photo it shows, as fractions of the photo width. */
  crop?: [number, number]
  /** Processed image file name. */
  fileName: string
  x: number
  y: number
  w: number
  h: number
}

/**
 * The scan images the drawing inserts, in order. Scan Images is rebuilt from Scan Import first
 * (SyncScanImagesFromScanImport), so every scan gets a row whose Include follows its old image row
 * (default YES), even if the scan itself is off (change 2: the app skips a switched-off scan).
 */
export function imageInserts(p: Project, scans: Scan[], v5: boolean): ImageInsert[] {
  const imageInclude = new Map<string, boolean>()
  for (const img of p.scanImages) if (!imageInclude.has(img.scanId.toUpperCase())) imageInclude.set(img.scanId.toUpperCase(), img.include)
  const appNames = processedImageNames(scans.map((sc) => sc.id))
  const out: ImageInsert[] = []
  for (const sc of scans) {
    if (imageInclude.get(sc.id.toUpperCase()) === false) continue
    if (!v5 && !sc.include) continue
    const row = scans.find((x) => x.id.toUpperCase() === sc.id.toUpperCase())! // FindScanRow: first match
    // A scan across the seam gets one image per piece, each the part of the photo for that piece.
    const pieces = v5 ? [] : scanPieces(row, circumference(p))
    if (isWrapped(pieces)) {
      pieces.forEach((pc, piece) => out.push({
        scanId: sc.id, piece, crop: [pc.from, pc.to], fileName: pieceImageName(appNames.get(sc.id)!, piece),
        x: pc.x0, y: row.yStart!, w: pc.x1 - pc.x0, h: row.yStop! - row.yStart!,
      }))
      continue
    }
    out.push({
      scanId: sc.id,
      fileName: v5 ? defaultProcessedName(sc.id) : appNames.get(sc.id)!, // change 3
      x: row.xStart!,
      y: row.yStart!,
      w: row.xStop! - row.xStart!,
      h: row.yStop! - row.yStart!,
    })
  }
  return out
}
