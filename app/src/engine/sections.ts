// Section sheets (Phase 3f-2): the plan of zoomed-in letter-size sheets along the shell length. Everything
// about the sections is worked out here, from the Drawing step settings, so the preview, the .lsp
// (ABSECTIONSHEETS) and, later, the PDF all use the same ranges. Sections run along Y (the shell length);
// each sheet shows the whole circumference of its length, as v5.0's SECTIONPAGES does.
//
// Sheet geometry follows SECTIONPAGES: the template viewport is the printable area; the section gets 68% of
// its width and 92% of its height (the rest is the information panel and the rulers). The app assumes a
// letter sheet in landscape with half-inch margins, a 10 x 7.5 in viewport; CAD uses the real one.
// Horizontal layouts run the length across the sheet; Vertical runs it up the sheet, with the circumference
// across (an app addition: SECTIONPAGES and ABSECTIONSHEETS build horizontal sheets only). What goes on each
// sheet (rulers, references, title panel, match lines) is engine/sheets.ts.

import { parseLength } from '../data/parse.ts'
import type { PAPER_SIZES } from '../data/settings.ts'
import type { Project } from '../data/schema.ts'
import { fitTextHeight, type DrawingItem, type Shape } from './drawing.ts'
import { readableRot, type Orientation } from './transform.ts'
import { drawnScans } from './layout.ts'
import { sizedHeight, textSizeRules } from './styles.ts'
import { circumference, labelPieceIndex, scanPieces } from './wrap.ts'

/** Paper sizes (inches, landscape) for setting "Paper size". */
export const PAPER: Record<(typeof PAPER_SIZES)[number], { w: number; h: number }> = {
  Letter: { w: 11, h: 8.5 },
  '11x17 (Tabloid)': { w: 17, h: 11 },
  Legal: { w: 14, h: 8.5 },
  A4: { w: 297 / 25.4, h: 210 / 25.4 },
}
/** Margin around the sheet's template area (inches). */
export const SHEET_MARGIN = 0.5
export type SheetArea = { w: number; h: number }

/** The job's paper, landscape (inches). */
export function paperOf(p: Project): { w: number; h: number } {
  return PAPER[p.settings.paperSize] ?? PAPER.Letter
}

/** The template viewport area the app assumes on the job's paper: landscape, half-inch margins. */
export function sheetArea(p: Project): SheetArea {
  const paper = paperOf(p)
  return { w: paper.w - 2 * SHEET_MARGIN, h: paper.h - 2 * SHEET_MARGIN }
}

/** The template viewport on letter paper (inches): landscape, half-inch margins. */
export const LETTER_AREA = { w: 10, h: 7.5 } as const
/** SECTIONPAGES: the section's part of the viewport. */
export const SECTION_SHARE = { w: 0.68, h: 0.92 } as const

export interface Section {
  /** 1..count, after empty sections are skipped. */
  n: number
  /** The section's own part of the shell length (boundary to boundary). */
  start: number
  end: number
  /** What its sheet shows: the section plus the overlap each side (within the shell). */
  viewStart: number
  viewEnd: number
  /** Paper inches per inch of shell on the sheet. */
  scale: number
  /** Height on the sheet of the smallest scan label in this section, or null when it has no scans. */
  smallestLabel: number | null
  /** The neighbouring sections that carry on from a boundary (for match lines), or null. */
  prev: number | null
  next: number | null
}

export interface SectionPlan {
  sections: Section[]
  overview: boolean
  matchLines: boolean
  numberInTitle: boolean
  rulerTextScale: number
  /** Sections left out because nothing is on them. */
  skipped: number
  /** Plain-language notes on how the plan was made (shown on the Drawing step). */
  notes: string[]
  /** Things that need fixing (e.g. a manual range that can't be read). */
  problems: string[]
}

/** Why there is no plan: sections off, or the vessel size is missing. */
export type NoPlan = 'off' | 'noSize'

const r3 = (n: number) => Math.round(n * 1000) / 1000

/** Scan labels as drawn: height (model inches, after the Drawing step's size) and Y range. */
export function scanLabels(p: Project): { id: string; h: number; y0: number; y1: number }[] {
  const C = circumference(p)
  const rules = textSizeRules(p.settings)
  const out: { id: string; h: number; y0: number; y1: number }[] = []
  for (const sc of drawnScans(p)) {
    if (!sc.include || sc.xStart === null || sc.xStop === null || sc.yStart === null || sc.yStop === null || sc.id === '') continue
    const pieces = scanPieces(sc, C)
    const pc = pieces[labelPieceIndex(pieces)]
    const w = Math.abs(pc.x1 - pc.x0)
    const h = Math.abs(sc.yStop - sc.yStart)
    if (!(w > 0 && h > 0)) continue
    out.push({ id: sc.id, h: sizedHeight(rules, 'SCAN_TEXT', fitTextHeight(w, h, sc.id)), y0: Math.min(sc.yStart, sc.yStop), y1: Math.max(sc.yStart, sc.yStop) })
  }
  return out
}

/**
 * Where a sheet's viewport goes inside the template viewport area (paper inches from its bottom-left, as
 * SECTIONPAGES places it) for a view `viewLen` long of a shell `C` around.
 */
export function sheetViewport(viewLen: number, C: number, orientation = 'Horizontal CW', area: SheetArea = LETTER_AREA): { left: number; bottom: number; w: number; h: number; scale: number } {
  const W = area.w
  const H = area.h
  const scale = sheetScale(viewLen, C, orientation, area)
  const usableW = W * SECTION_SHARE.w
  const usableH = H * usableUp(orientation)
  // Horizontal: the length runs across the sheet; Vertical: up the sheet, the circumference across.
  const vertical = orientation === 'Vertical'
  const w = (vertical ? C : viewLen) * scale
  const h = (vertical ? viewLen : C) * scale
  return { left: W * 0.13 + (usableW - w) / 2, bottom: H * 0.08 + (usableH - h) / 2, w, h, scale }
}

/**
 * Where a position y along the shell lands on a sheet showing viewStart..viewEnd, measured from the
 * viewport's left (Horizontal) or bottom (Vertical): Horizontal CW runs left to right, Horizontal CCW right
 * to left (as SECTIONPAGES' zoom windows do), Vertical bottom to top.
 */
export function paperAlong(y: number, viewStart: number, viewEnd: number, scale: number, orientation: string): number {
  return (orientation === 'Horizontal CCW' ? viewEnd - y : y - viewStart) * scale
}

/**
 * The share of the area's height the viewport may use: SECTIONPAGES' 92%; a vertical sheet keeps 6% more free
 * at the top for its title and the reference labels along the top edge.
 */
function usableUp(orientation: string): number {
  return orientation === 'Vertical' ? SECTION_SHARE.h - 0.06 : SECTION_SHARE.h
}

/** SECTIONPAGES' scale for a sheet showing `viewLen` of a shell `C` around (Vertical: the length up the sheet). */
export function sheetScale(viewLen: number, C: number, orientation = 'Horizontal CW', area: SheetArea = LETTER_AREA): number {
  const across = area.w * SECTION_SHARE.w
  const up = area.h * usableUp(orientation)
  return orientation === 'Vertical' ? Math.min(across / C, up / viewLen) : Math.min(across / viewLen, up / C)
}

/**
 * "0-180, 180-360" -> [[0, 180], [180, 360]]. A range is two lengths joined by "-" or "to" (each length as
 * typed anywhere in the app: 12.5, 12 1/2, 12-1/2, 10' 6").
 */
export function parseRanges(text: string): { ranges: [number, number][]; problems: string[] } {
  const ranges: [number, number][] = []
  const problems: string[] = []
  for (const part of text.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean)) {
    let found: [number, number] | null = null
    const seps = [...part.matchAll(/\s*(?:-|–|\bto\b)\s*/gi)]
    for (const m of seps) {
      const a = parseLength(part.slice(0, m.index))
      const b = parseLength(part.slice(m.index! + m[0].length))
      if (a.ok && b.ok && a.value !== null && b.value !== null) {
        found = [a.value, b.value]
        break
      }
    }
    if (!found) problems.push(`"${part}" is not a range like 0-180.`)
    else if (!(found[1] > found[0])) problems.push(`"${part}": the end must be after the start.`)
    else ranges.push(found)
  }
  return { ranges, problems }
}

/** Y values where a section boundary cuts no scan: circ welds, and the middle of gaps between scans. */
export function snapCandidates(p: Project): number[] {
  const L = p.vessel.length ?? 0
  const out = p.circWelds.filter((w) => w.include && w.y !== null && w.y > 0 && w.y < L).map((w) => w.y!)
  const spans = drawnScans(p)
    .filter((s) => s.include && s.yStart !== null && s.yStop !== null)
    .map((s) => [Math.min(s.yStart!, s.yStop!), Math.max(s.yStart!, s.yStop!)] as [number, number])
    .sort((a, b) => a[0] - b[0])
  let end = -Infinity
  for (const [a, b] of spans) {
    if (end > -Infinity && a > end) out.push((a + end) / 2)
    end = Math.max(end, b)
  }
  return out.sort((a, b) => a - b)
}

/** The section plan, or why there is none. */
export function sectionPlan(p: Project): SectionPlan | NoPlan {
  const s = p.settings
  if (!s.makeSectionSheets) return 'off'
  const o = p.vessel.orientation
  const vertical = o === 'Vertical'
  const area = sheetArea(p)
  const L = p.vessel.length
  const C = circumference(p)
  if (L === null || !(L > 0) || C === null) return 'noSize'
  const ov = s.sectionOverlap
  const notes: string[] = []
  const problems: string[] = []
  const labels = scanLabels(p)

  // 1. Boundaries
  let bounds: [number, number][]
  if (s.sectionSplit === 'Manual') {
    const parsed = parseRanges(s.sectionRanges)
    problems.push(...parsed.problems)
    bounds = []
    for (const [a, b] of parsed.ranges) {
      if (a < 0 || b > L + 1e-6) problems.push(`${r3(a)}-${r3(b)} is outside the shell (0 to ${r3(L)}); left out.`)
      else bounds.push([a, b])
    }
    if (parsed.ranges.length === 0 && parsed.problems.length === 0) problems.push('Type the section ranges, e.g. 0-180, 180-360.')
  } else {
    let n = s.sectionCount
    if (s.sectionSplit === 'Readable size') {
      const hMin = labels.length ? Math.min(...labels.map((l) => l.h)) : null
      if (hMin === null) {
        n = 1
        notes.push('No scan labels, so one section.')
      } else {
        const want = s.sectionMinLabel / hMin
        const best = sheetScale(1e-9, C, o, area) // limited by the circumference only
        const scale = Math.min(want, best)
        // The length runs across a horizontal sheet and up a vertical one.
        const sheetLen = (vertical ? area.h * usableUp(o) : area.w * SECTION_SHARE.w) / scale
        const segLen = Math.max(1, sheetLen - 2 * ov)
        n = Math.max(1, Math.ceil(L / segLen - 1e-9))
        const each = `${n} section${n === 1 ? '' : 's'} of about ${r3(L / n)} in`
        if (want > best) {
          notes.push(`The whole circumference (${r3(C)} in) has to fit the sheet's ${vertical ? 'width' : 'height'}, so the smallest scan label (${r3(hMin)} in) prints at ${r3(hMin * best)} in at most, not ${s.sectionMinLabel} in. ${each}; shorter sections would not print it any bigger.`)
        } else notes.push(`Smallest scan label ${r3(hMin)} in: ${each} print it at ${s.sectionMinLabel} in or more.`)
      }
    }
    const b = Array.from({ length: n + 1 }, (_, i) => (L * i) / n)
    // 2. Snap the boundaries between sections to a weld or a gap between scans (within a quarter section).
    if (s.sectionSnap && n > 1) {
      const cands = snapCandidates(p)
      const tol = L / n / 4
      for (let i = 1; i < n; i++) {
        const best = cands.filter((c) => c > b[i - 1] + 1 && c < (L * (i + 1)) / n - 1 && Math.abs(c - b[i]) <= tol).sort((x, y) => Math.abs(x - b[i]) - Math.abs(y - b[i]))[0]
        if (best !== undefined) b[i] = best
      }
    }
    bounds = b.slice(1).map((end, i) => [b[i], end] as [number, number])
  }

  // 3. Sections, without the empty ones when asked.
  const has = (a: number, e: number) =>
    labels.some((l) => l.y1 > a && l.y0 < e) ||
    p.shellNozzles.some((nz) => nz.include && nz.y !== null && nz.y + (nz.diameter ?? 0) / 2 > a && nz.y - (nz.diameter ?? 0) / 2 < e) ||
    p.shellMut.some((m) => m.y !== null && m.y >= a && m.y <= e) ||
    p.scans.some((sc) => sc.include && sc.yStart !== null && sc.yStop !== null && Math.max(sc.yStart, sc.yStop) > a && Math.min(sc.yStart, sc.yStop) < e)
  let kept = bounds
  if (s.sectionSkipEmpty) kept = bounds.filter(([a, e]) => has(a, e))
  const skipped = bounds.length - kept.length
  if (skipped) notes.push(`${skipped} empty section${skipped === 1 ? '' : 's'} left out.`)
  const sections: Section[] = kept.map(([start, end], i) => {
    const viewStart = Math.max(0, start - ov)
    const viewEnd = Math.min(L, end + ov)
    const scale = sheetScale(viewEnd - viewStart, C, o, area)
    const inIt = labels.filter((l) => l.y1 > viewStart && l.y0 < viewEnd)
    return {
      n: i + 1, start: r3(start), end: r3(end), viewStart: r3(viewStart), viewEnd: r3(viewEnd), scale,
      smallestLabel: inIt.length ? Math.min(...inIt.map((l) => l.h)) * scale : null,
      prev: null, next: null,
    }
  })
  for (let i = 1; i < sections.length; i++) {
    if (Math.abs(sections[i].start - sections[i - 1].end) < 1e-6) {
      sections[i].prev = sections[i - 1].n
      sections[i - 1].next = sections[i].n
    }
  }
  return {
    sections, overview: s.sectionOverview, matchLines: s.sectionMatchLines, numberInTitle: s.sectionNumberInTitle,
    rulerTextScale: s.sectionRulerTextScale, skipped, notes, problems,
  }
}

/**
 * The plan drawn on the preview (layer SECTION_PLAN, not written to CAD): each section's range across the
 * whole circumference with its number; the overlap each sheet shows past it is dashed.
 */
export function sectionPlanItems(p: Project, plan: SectionPlan): DrawingItem[] {
  const C = circumference(p)!
  const lr = readableRot(p.vessel.orientation as Orientation)
  const th = Math.max(2.5, C * 0.025)
  return plan.sections.map((s) => {
    const shapes: Shape[] = [
      { t: 'rect', x: 0, y: s.start, w: C, h: s.end - s.start, layer: 'SECTION_PLAN' },
      { t: 'text', x: C - th * 1.5, y: (s.start + s.end) / 2, h: th, rot: lr, text: `SECTION ${s.n}`, just: 'MC', layer: 'SECTION_PLAN' },
    ]
    // The overlap: dashes across the shell where the sheet's view ends.
    for (const y of [s.viewStart, s.viewEnd]) {
      if (Math.abs(y - s.start) < 1e-6 || Math.abs(y - s.end) < 1e-6) continue
      for (let x = 0; x < C; x += 10) shapes.push({ t: 'line', x1: x, y1: y, x2: Math.min(C, x + 5), y2: y, layer: 'SECTION_PLAN' })
    }
    return { key: `section:${s.n}`, source: null, shapes, info: `Section ${s.n}: ${r3(s.start)} to ${r3(s.end)} in along the shell (sheet shows ${r3(s.viewStart)} to ${r3(s.viewEnd)})` }
  })
}

/** The plan, or null when there is none (for code that only needs to know whether to draw it). */
export function activeSectionPlan(p: Project): SectionPlan | null {
  const plan = sectionPlan(p)
  return typeof plan === 'string' ? null : plan
}
