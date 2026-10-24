// What goes on each section sheet (Phase 3f-2): the viewport of the drawing plus everything SECTIONPAGES
// draws in paper space around it (rulers, reference labels, the title and legend panel), the title
// "SECTION n OF N", match lines and, on the overview, a numbered box per section. Shapes are in paper
// inches from the bottom-left of the template viewport area (y up), with SECTIONPAGES' layer names, so the
// preview draws them now and the PDF export (Phase 4) can print exactly the same sheets.
//
// Horizontal sheets follow SECTIONPAGES (SL_PaperSectionRulers, SL_PaperSectionReferences,
// SL_PaperSectionInfo) number for number. Vertical sheets are the app's own: the same parts, turned so the
// length runs up the sheet (circumference ruler below the viewport, length ruler on its left, reference
// labels along its top).

import { vbaFormatFixed } from '../export/lsp/vbaFormat.ts'
import type { Project } from '../data/schema.ts'
import {
  axisLabels,
  countedScans,
  coveragePercent,
  drawnReferenceLabels,
  drawnScans,
  sectionReferenceLabels,
  titleLines,
} from './layout.ts'
import { LETTER_AREA, paperAlong, sheetViewport, type Section, type SectionPlan } from './sections.ts'
import { capTextWidth } from './textMetrics.ts'

export type PaperShape =
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; layer: string }
  | { t: 'rect'; x: number; y: number; w: number; h: number; layer: string }
  /** rot in degrees counter-clockwise; MC = centered, ML = left end at x. */
  | { t: 'text'; x: number; y: number; h: number; rot: number; text: string; just: 'MC' | 'ML'; layer: string }

/** The title and legend panel's layers (left out of a "drawing only" report image). */
export const PANEL_LAYERS = new Set(['REPORT_TITLE', 'REPORT_LEGEND', 'REPORT_LEGEND_AUT', 'REPORT_LEGEND_MUT', 'REPORT_LEGEND_AUT_BOX', 'REPORT_LEGEND_MUT_BOX'])

/** SECTIONPAGES' paper layer colors (CAD color numbers). */
export const PAPER_LAYER_COLOR: Record<string, number> = {
  REPORT_X_RULER: 1, REPORT_Y_RULER: 5, REPORT_X_REFERENCE: 1, REPORT_TITLE: 7, REPORT_SHEET_TITLE: 7, REPORT_LEGEND: 7,
  REPORT_LEGEND_AUT: 5, REPORT_LEGEND_MUT: 3, REPORT_LEGEND_AUT_BOX: 5, REPORT_LEGEND_MUT_BOX: 3,
  REPORT_VIEWPORT: 7, REPORT_MATCH_LINE: 1, REPORT_SECTION_BOX: 3,
}

export interface SheetPage {
  kind: 'overview' | 'section'
  section: Section | null
  title: string
  /** The part of the shell length the viewport shows. */
  viewStart: number
  viewEnd: number
  /** The viewport (paper inches) and its scale (paper inch per shell inch). */
  vp: { left: number; bottom: number; w: number; h: number; scale: number }
  shapes: PaperShape[]
}

class PaperPen {
  shapes: PaperShape[] = []
  line(x1: number, y1: number, x2: number, y2: number, layer: string) {
    this.shapes.push({ t: 'line', x1, y1, x2, y2, layer })
  }
  rect(x: number, y: number, w: number, h: number, layer: string) {
    this.shapes.push({ t: 'rect', x, y, w, h, layer })
  }
  text(x: number, y: number, h: number, rot: number, text: string, layer: string, just: 'MC' | 'ML' = 'MC') {
    if (text !== '') this.shapes.push({ t: 'text', x, y, h, rot, text, just, layer })
  }
  /** SL_PaperArrow */
  arrow(x1: number, y1: number, x2: number, y2: number, size: number, layer: string) {
    const dx = x2 - x1
    const dy = y2 - y1
    const len = Math.hypot(dx, dy)
    if (!(len > 1e-6)) return
    const ux = dx / len
    const uy = dy / len
    const px = -uy
    const py = ux
    this.line(x1, y1, x2, y2, layer)
    this.line(x2, y2, x2 - size * ux - 0.55 * size * px, y2 - size * uy - 0.55 * size * py, layer)
    this.line(x2, y2, x2 - size * ux + 0.55 * size * px, y2 - size * uy + 0.55 * size * py, layer)
  }
  /** SL_PaperHatchRect: 45-degree lines. */
  hatch(x: number, y: number, w: number, h: number, step: number, layer: string) {
    for (let k = -h; k <= w; k += step) {
      const x1 = Math.max(0, k)
      const x2 = Math.min(w, h + k)
      if (x2 > x1) this.line(x + x1, y + x1 - k, x + x2, y + x2 - k, layer)
    }
  }
}

const inch = (v: number) => `${Math.round(v)}"`
/** SL_LabelArrowLength txt 2.5 0 (as the drawing's rulers). */
const arrowLength = (txt: string) => Math.max(14, txt.length * 2.5 * 0.6)

/** Ticks from a to b every `spacing`, plus b itself when the last tick falls short of it (SL_PaperSectionRulers). */
function ticks(a: number, b: number, spacing: number): number[] {
  const out: number[] = []
  let pos = a
  if (spacing > 0) for (; pos <= b + 1e-9; pos += spacing) out.push(pos)
  const last = out.length ? out[out.length - 1] : -Infinity
  if (b - last > 0.001) out.push(b)
  return out
}

/** The sheets in printing order: the overview (when asked), then the sections. */
export function sheetPages(p: Project, plan: SectionPlan): SheetPage[] {
  const L = p.vessel.length!
  const N = plan.sections.length
  const pages: SheetPage[] = []
  if (plan.overview) pages.push(page(p, plan, null, 'OVERVIEW', 0, L))
  for (const s of plan.sections) {
    pages.push(page(p, plan, s, plan.numberInTitle ? `SECTION ${s.n} OF ${N}` : `SECTION ${s.n}`, s.viewStart, s.viewEnd))
  }
  return pages
}

function page(p: Project, plan: SectionPlan, section: Section | null, title: string, vs: number, ve: number): SheetPage {
  const s = p.settings
  const o = p.vessel.orientation
  const vertical = o === 'Vertical'
  const C = p.vessel.height!
  const vp = sheetViewport(ve - vs, C, o)
  const u = LETTER_AREA.h / 7.5 // SECTIONPAGES' paper unit
  const pen = new PaperPen()
  const mult = plan.rulerTextScale
  const lines = titleLines(p, false)
  const refs = drawnReferenceLabels(p) !== null ? sectionReferenceLabels(p) : []
  // App layout (user, 2026-10-23): the title/legend panel sits just right of the drawing (past the reference
  // labels on horizontal sheets) and the two are centred on the sheet together. SECTIONPAGES keeps the panel at
  // 86.5% of the width, which leaves a gap when the section is short. Text widths are measured with the font the
  // PDF prints with (engine/textMetrics.ts).
  const panelW = Math.max(1.45 * u, ...lines.map((t, i) => capTextWidth(t, (i === 0 ? 0.12 : 0.09) * u)))
  /** Half the room a text takes across its baseline (capital height plus a little for descenders). */
  const textHalf = (h: number) => 0.8 * h
  const sideTicks = vertical ? ticks(vs, ve, s.rulerSpacing) : ticks(0, C, s.rulerSpacing)
  // Everything that grows with the drawing's scale: the rulers, the reference labels and the gap to the panel.
  // Rulers (app layout, 2026-10-24): numbers, axis label and arrow are stacked outward from the ruler by their
  // measured sizes with a clear gap between each, so wide numbers and long labels don't run into each other.
  const roomAt = (sc: number) => {
    const refsW = vertical ? 0 : 3 * sc + 1.5 * sc + Math.max(0, ...refs.map((t) => capTextWidth(t, 1.8 * sc * mult)))
    const tick = 3 * sc
    const numH = 1.8 * sc * mult
    const labelH = 2.5 * sc * mult
    const gap = Math.max(1.5 * sc, 0.04 * u)
    const head = s.arrowHeadSize * sc
    const sideNumW = Math.max(0, ...sideTicks.map((pos) => capTextWidth(inch(pos), numH)))
    /** From the side ruler outward: its numbers' right edge, the axis label's center, the arrow. */
    const sideLabel = tick + gap + sideNumW + gap + textHalf(labelH)
    const sideArrow = sideLabel + textHalf(labelH) + gap + 0.55 * head
    /** From the bottom ruler down: its numbers' center, the axis label's center, the arrow. */
    const bottomNum = tick + gap + numH / 2
    const bottomLabel = bottomNum + textHalf(numH) + gap + textHalf(labelH)
    const bottomArrow = bottomLabel + textHalf(labelH) + gap + 0.55 * head
    const leftRoom = s.rulerOffset * sc + sideArrow + 0.55 * head + 0.3 * u // the side ruler, its label and arrow
    // Panel gap (user, 2026-10-24): in step with the drawing's size, 0.25 in on a short section up to 0.5 in.
    const gapToPanel = refsW + Math.min(0.5, Math.max(0.25, 0.06 * vp.w)) * u
    return { tick, numH, labelH, gap, head, sideLabel, sideArrow, bottomNum, bottomLabel, bottomArrow, leftRoom, gapToPanel }
  }
  let room = roomAt(vp.scale)
  // A drawing too wide for the sheet with its panel (a long overview) is drawn smaller, so the panel keeps its room
  // instead of being pushed onto the drawing.
  for (let i = 0; i < 4 && room.leftRoom + vp.w + room.gapToPanel + panelW > LETTER_AREA.w + 1e-9; i++) {
    const k = Math.max(0.1, (LETTER_AREA.w - room.leftRoom - room.gapToPanel - panelW) / vp.w)
    vp.bottom += (vp.h * (1 - k)) / 2
    vp.w *= k
    vp.h *= k
    vp.scale *= k
    room = roomAt(vp.scale)
  }
  const sc = vp.scale
  const { tick, numH, labelH, gap, head, sideLabel, sideArrow, bottomNum, bottomLabel, bottomArrow, leftRoom, gapToPanel } = room
  const groupW = vp.w + gapToPanel + panelW
  if (leftRoom + groupW <= LETTER_AREA.w + 1e-9) vp.left = leftRoom + (LETTER_AREA.w - leftRoom - groupW) / 2
  const infoXApp = Math.min(LETTER_AREA.w - panelW, vp.left + vp.w + gapToPanel)
  const labels = axisLabels(p)
  /** A side-ruler number, its right edge a gap past the tick. */
  const sideNumX = (rulerX: number, pos: number) => rulerX - tick - gap - capTextWidth(inch(pos), numH) / 2
  const top = vp.bottom + vp.h
  const right = vp.left + vp.w
  const along = (y: number) => paperAlong(y, vs, ve, sc, o)
  /**
   * Which tick numbers to write: every one, except a number that would touch the next one written (e.g. 300 next to
   * the end at 302); the end of the ruler is always kept. side = numbers stacked up the side, else along the bottom.
   */
  const numbered = (list: { pos: number; at: number }[], side: boolean): Set<number> => {
    const keep = new Set<number>()
    let last: { pos: number; at: number } | null = null
    for (const t of [...list].reverse()) {
      const room = side ? 2 * textHalf(numH) + gap / 2 : (capTextWidth(inch(t.pos), numH) + (last ? capTextWidth(inch(last.pos), numH) : 0)) / 2 + gap
      if (last && Math.abs(t.at - last.at) < room) continue
      keep.add(t.pos)
      last = t
    }
    return keep
  }

  if (!vertical) {
    // X ruler (around the shell) outside the viewport's left edge, red.
    const rulerX = vp.left - s.rulerOffset * sc
    pen.line(rulerX, vp.bottom, rulerX, top, 'REPORT_X_RULER')
    const xTicks = ticks(0, C, s.rulerSpacing).map((pos) => ({ pos, at: o === 'Horizontal CCW' ? vp.bottom + pos * sc : top - pos * sc }))
    const xShown = numbered(xTicks, true)
    for (const { pos, at: py } of xTicks) {
      pen.line(rulerX, py, rulerX - tick, py, 'REPORT_X_RULER')
      if (xShown.has(pos)) pen.text(sideNumX(rulerX, pos), py, numH, 0, inch(pos), 'REPORT_X_RULER')
    }
    const midY = vp.bottom + vp.h / 2
    pen.text(rulerX - sideLabel, midY, labelH, 90, labels.x, 'REPORT_X_RULER')
    const ax = Math.min(0.7 * vp.h, arrowLength(labels.x) * sc)
    const arrowX = rulerX - sideArrow
    if (o === 'Horizontal CCW') pen.arrow(arrowX, midY - ax / 2, arrowX, midY + ax / 2, head, 'REPORT_X_RULER')
    else pen.arrow(arrowX, midY + ax / 2, arrowX, midY - ax / 2, head, 'REPORT_X_RULER')
    // Y ruler (along the shell) below the viewport, blue.
    const rulerY = vp.bottom - s.rulerOffset * sc
    pen.line(vp.left, rulerY, right, rulerY, 'REPORT_Y_RULER')
    const yTicks = ticks(vs, ve, s.rulerSpacing).map((pos) => ({ pos, at: vp.left + along(pos) }))
    const yShown = numbered(yTicks, false)
    for (const { pos, at: px } of yTicks) {
      pen.line(px, rulerY, px, rulerY - tick, 'REPORT_Y_RULER')
      if (yShown.has(pos)) pen.text(px, rulerY - bottomNum, numH, 0, inch(pos), 'REPORT_Y_RULER')
    }
    const midX = vp.left + vp.w / 2
    pen.text(midX, rulerY - bottomLabel, labelH, 0, labels.y, 'REPORT_Y_RULER')
    const ay = Math.min(0.7 * vp.w, arrowLength(labels.y) * sc)
    const arrowY = rulerY - bottomArrow
    if (o === 'Horizontal CCW') pen.arrow(midX + ay / 2, arrowY, midX - ay / 2, arrowY, head, 'REPORT_Y_RULER')
    else pen.arrow(midX - ay / 2, arrowY, midX + ay / 2, arrowY, head, 'REPORT_Y_RULER')
  } else {
    // Vertical: X ruler (around the shell) below the viewport, Y ruler (along it) on its left.
    const rulerY = vp.bottom - s.rulerOffset * sc
    pen.line(vp.left, rulerY, right, rulerY, 'REPORT_X_RULER')
    const xTicks = ticks(0, C, s.rulerSpacing).map((pos) => ({ pos, at: vp.left + pos * sc }))
    const xShown = numbered(xTicks, false)
    for (const { pos, at: px } of xTicks) {
      pen.line(px, rulerY, px, rulerY - tick, 'REPORT_X_RULER')
      if (xShown.has(pos)) pen.text(px, rulerY - bottomNum, numH, 0, inch(pos), 'REPORT_X_RULER')
    }
    const midX = vp.left + vp.w / 2
    pen.text(midX, rulerY - bottomLabel, labelH, 0, labels.x, 'REPORT_X_RULER')
    const ax = Math.min(0.7 * vp.w, arrowLength(labels.x) * sc)
    pen.arrow(midX - ax / 2, rulerY - bottomArrow, midX + ax / 2, rulerY - bottomArrow, head, 'REPORT_X_RULER')
    const rulerX = vp.left - s.rulerOffset * sc
    pen.line(rulerX, vp.bottom, rulerX, top, 'REPORT_Y_RULER')
    const yTicks = ticks(vs, ve, s.rulerSpacing).map((pos) => ({ pos, at: vp.bottom + along(pos) }))
    const yShown = numbered(yTicks, true)
    for (const { pos, at: py } of yTicks) {
      pen.line(rulerX, py, rulerX - tick, py, 'REPORT_Y_RULER')
      if (yShown.has(pos)) pen.text(sideNumX(rulerX, pos), py, numH, 0, inch(pos), 'REPORT_Y_RULER')
    }
    const midY = vp.bottom + vp.h / 2
    pen.text(rulerX - sideLabel, midY, labelH, 90, labels.y, 'REPORT_Y_RULER')
    const ay = Math.min(0.7 * vp.h, arrowLength(labels.y) * sc)
    pen.arrow(rulerX - sideArrow, midY - ay / 2, rulerX - sideArrow, midY + ay / 2, head, 'REPORT_Y_RULER')
  }

  // Reference labels (SL_PaperSectionReferences): at 0, 1/4, 1/2, 3/4 and all the way round.
  if (refs.length) {
    const gap = 1.5 * sc
    const h = 1.8 * sc * mult
    refs.forEach((txt, i) => {
      if (txt === '') return
      if (!vertical) {
        const py = o === 'Horizontal CCW' ? vp.bottom + C * (i / 4) * sc : top - C * (i / 4) * sc
        pen.line(right, py, right + tick, py, 'REPORT_X_REFERENCE')
        pen.text(right + tick + gap, py, h, 0, txt, 'REPORT_X_REFERENCE', 'ML')
      } else {
        const px = vp.left + C * (i / 4) * sc
        pen.line(px, top, px, top + tick, 'REPORT_X_REFERENCE')
        pen.text(px, top + tick + gap + h / 2, h, 0, txt, 'REPORT_X_REFERENCE')
      }
    })
  }

  // Title and legend panel (SL_PaperSectionInfo).
  const infoX = infoXApp
  const infoTop = vertical ? LETTER_AREA.h * 0.6 : vp.bottom + 2.55 * u
  let y = infoTop
  pen.text(infoX, y, 0.12 * u, 0, lines[0], 'REPORT_TITLE', 'ML')
  y -= 0.19 * u
  for (const txt of lines.slice(1)) {
    if (txt === '') continue
    pen.text(infoX, y, 0.09 * u, 0, txt, 'REPORT_TITLE', 'ML')
    y -= 0.15 * u
  }
  y = infoTop - 1.4 * u
  pen.text(infoX, y, 0.11 * u, 0, 'LEGEND', 'REPORT_LEGEND', 'ML')
  y -= 0.38 * u
  const boxW = 0.3 * u
  const boxH = 0.16 * u
  // The keys stacked one above the other, as in the drawing's own legend (app layout, user 2026-10-24;
  // SECTIONPAGES puts them side by side).
  if (s.autHatchEnabled) {
    pen.rect(infoX, y, boxW, boxH, 'REPORT_LEGEND_AUT_BOX')
    pen.hatch(infoX, y, boxW, boxH, 0.055 * u, 'REPORT_LEGEND_AUT')
    pen.text(infoX + 0.38 * u, y + boxH / 2, 0.085 * u, 0, 'AUT', 'REPORT_LEGEND', 'ML')
    y -= boxH + 0.08 * u
  }
  pen.rect(infoX, y, boxW, boxH, 'REPORT_LEGEND_MUT_BOX')
  pen.hatch(infoX, y, boxW, boxH, 0.055 * u, 'REPORT_LEGEND_MUT')
  pen.text(infoX + 0.38 * u, y + boxH / 2, 0.085 * u, 0, 'MUT', 'REPORT_LEGEND', 'ML')
  y -= 0.27 * u
  const counted = countedScans(p, drawnScans(p), false)
  const coverage = coveragePercent(p, counted)
  for (const txt of [
    `Total Scans: ${counted.length}`,
    coverage === null ? '' : `Coverage: ${vbaFormatFixed(coverage, 1, 1)}%`,
    vertical ? 'Orientation: Vertical' : 'Orientation: Horizontal',
    'Overlay: Enabled',
  ]) {
    if (txt === '') continue
    pen.text(infoX, y, 0.082 * u, 0, txt, 'REPORT_LEGEND', 'ML')
    y -= 0.145 * u
  }

  // Sheet title, above the viewport (Vertical: at the top of the sheet area, clear of the reference labels).
  pen.text(vp.left + vp.w / 2, vertical ? LETTER_AREA.h - 0.15 * u : top + 0.22 * u, 0.18 * u, 0, title, 'REPORT_SHEET_TITLE')

  // Overview: a numbered box for each section. Sections: match lines.
  const across = (y0: number, y1: number, layer: string) => {
    const a = along(y0)
    const b = along(y1)
    if (!vertical) pen.rect(vp.left + Math.min(a, b), vp.bottom, Math.abs(b - a), vp.h, layer)
    else pen.rect(vp.left, vp.bottom + Math.min(a, b), vp.w, Math.abs(b - a), layer)
  }
  if (!section) {
    for (const sec of plan.sections) {
      across(sec.start, sec.end, 'REPORT_SECTION_BOX')
      const m = along((sec.start + sec.end) / 2)
      if (!vertical) pen.text(vp.left + m, top - 0.2 * u, 0.14 * u, 0, String(sec.n), 'REPORT_SECTION_BOX')
      else pen.text(right - 0.2 * u, vp.bottom + m, 0.14 * u, 0, String(sec.n), 'REPORT_SECTION_BOX')
    }
  } else if (plan.matchLines) {
    for (const [at, other] of [[section.start, section.prev], [section.end, section.next]] as const) {
      if (other === null) continue
      const d = along(at)
      const text = `MATCH LINE - SEE SECTION ${other}`
      if (!vertical) {
        pen.line(vp.left + d, vp.bottom, vp.left + d, top, 'REPORT_MATCH_LINE')
        pen.text(vp.left + d - 0.08 * u, vp.bottom + vp.h / 2, 0.1 * u, 90, text, 'REPORT_MATCH_LINE')
      } else {
        pen.line(vp.left, vp.bottom + d, right, vp.bottom + d, 'REPORT_MATCH_LINE')
        pen.text(vp.left + vp.w / 2, vp.bottom + d + 0.08 * u, 0.1 * u, 0, text, 'REPORT_MATCH_LINE')
      }
    }
  }
  return { kind: section ? 'section' : 'overview', section, title, viewStart: vs, viewEnd: ve, vp, shapes: pen.shapes }
}
