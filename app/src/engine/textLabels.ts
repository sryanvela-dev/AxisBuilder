// Plain text labels that can be moved by hand in the preview (Phase 5b follow-up, user 2026-10-25): circ weld and long
// seam labels, object IDs and shell MUT labels. `textLabelSpecs` says where each is drawn automatically (as the .lsp
// draws it); `placeTextLabel` applies a move (project.labelOverrides): the label goes where it was put, as an offset
// from its automatic spot as the drawing reads. A moved MUT label gets a leader to its point (the point is otherwise
// only marked by the label); a moved object ID outside its rectangle gets a leader to the rectangle's nearest edge.
// Weld and seam labels stay plain text. A move that puts the label off the shell falls back to automatic (`fallback`).

import { rowOverride } from '../data/overrides.ts'
import type { MovableLabelList, Project } from '../data/schema.ts'
import { offsetPoint } from './labels.ts'
import { leaderStyle, leaderToLabel, type Pt } from './leaders.ts'
import { sizedHeight, textSizeRules } from './styles.ts'
import { readableRot, rotationOffset, toVisual, type Orientation } from './transform.ts'
import { circumference, isWrapped, labelPieceIndex, objectPieces } from './wrap.ts'

export type TextLabelList = Exclude<MovableLabelList, 'shellNozzles' | 'headNozzles'>
export const TEXT_LABEL_LISTS: readonly TextLabelList[] = ['circWelds', 'longSeams', 'objects', 'shellMut']

/** What a moved label's leader goes to: a point (MUT) or a rectangle's edge (object, logical [x0, y0, x1, y1]). */
export type LeaderTarget = { kind: 'point'; pt: Pt } | { kind: 'rect'; box: [number, number, number, number] }

export interface TextLabelSpec {
  list: TextLabelList
  index: number
  id: string
  txt: string
  /** The automatic spot (logical), the text height before the Drawing step's size, the logical rotation (as SL_Text). */
  ax: number
  ay: number
  th: number
  rot: number
  /** The layer the text is drawn with (SL_Text's layer argument; SL_TextLayer maps it to the text layer). */
  layer: string
  target: LeaderTarget | null
}

/** SL_FitTextHeight */
export function fitTextHeight(w: number, h: number, txt: string): number {
  const byShort = Math.min(w, h) * 0.22
  const byLong = (Math.max(w, h) * 0.78) / (Math.max(1, txt.length) * 0.85)
  return Math.max(0.45, Math.min(byShort, byLong))
}

/** SL_LabelRot (app): tall labels read upright in Horizontal CCW too. */
export function labelRot(o: Orientation, w: number, h: number): number {
  return h > w ? (o === 'Horizontal CCW' ? -90 : 90) : 0
}

/** SL_TextLayer: geometry layer -> its text layer. */
export function textLayer(layer: string): string {
  const map: Record<string, string> = {
    SCANS: 'SCAN_TEXT', SUPPORTS: 'SUPPORT_TEXT', NOZZLES: 'SHELL_NOZZLE_TEXT', MUT_TEXT: 'SHELL_MUT_TEXT', X_AXIS: 'X_RULER_TEXT',
    Y_AXIS: 'Y_RULER_TEXT', LEGEND: 'LEGEND_TEXT', CIRC_WELDS: 'CIRC_WELD_TEXT', LONG_SEAMS: 'LONG_SEAM_TEXT', TITLE_BLOCK: 'TITLE_BLOCK_TEXT',
  }
  return map[layer] ?? layer
}

const complete = (...v: (number | null)[]) => v.every((n) => n !== null && Number.isFinite(n))

/** Every movable text label the drawing draws, at its automatic spot (the same conditions as buildDrawing / the .lsp). */
export function textLabelSpecs(p: Project): TextLabelSpec[] {
  const s = p.settings
  const o = p.vessel.orientation as Orientation
  const L = p.vessel.length
  const H = p.vessel.height
  const sized = L !== null && H !== null && L > 0 && H > 0
  const out: TextLabelSpec[] = []
  if (s.showSupportsOnOverlay) {
    const C = circumference(p)
    p.objects.forEach((ob, index) => {
      if (!ob.include || !complete(ob.x, ob.y, ob.circWidth, ob.length) || ob.id === '') return
      const pieces = objectPieces(ob, C)
      const pc = isWrapped(pieces) ? pieces[labelPieceIndex(pieces)] : pieces[0]
      const w = pc.x1 - pc.x0
      const h = ob.length!
      out.push({
        list: 'objects', index, id: ob.id, txt: ob.id, ax: pc.x0 + w / 2, ay: ob.y! + h / 2, th: fitTextHeight(w, h, ob.id), rot: labelRot(o, w, h),
        layer: 'SUPPORTS', target: { kind: 'rect', box: [pc.x0, ob.y!, pc.x1, ob.y! + h] },
      })
    })
  }
  p.shellMut.forEach((m, index) => {
    if (!complete(m.x, m.y) || m.id === '') return
    out.push({ list: 'shellMut', index, id: m.id, txt: m.id, ax: m.x!, ay: m.y!, th: 1.5, rot: readableRot(o), layer: 'SHELL_MUT_TEXT', target: { kind: 'point', pt: [m.x!, m.y!] } })
  })
  if (s.showWeldsOnOverlay && sized && s.showWeldLabels) {
    p.circWelds.forEach((cw, index) => {
      if (!cw.include || !complete(cw.y) || !cw.showLabel || !cw.id) return
      out.push({ list: 'circWelds', index, id: cw.id, txt: cw.id, ax: H - 3, ay: cw.y!, th: 2, rot: 0, layer: 'CIRC_WELDS', target: null })
    })
    p.longSeams.forEach((ls, index) => {
      if (!ls.include || !complete(ls.x) || !ls.showLabel || !ls.id) return
      const y1 = ls.startY === null || ls.startY < 0 ? 0 : ls.startY
      const y2 = ls.stopY === null || ls.stopY < 0 ? L : ls.stopY
      let labelY = y1 + 6
      if (labelY > y2 - 2) labelY = y1 + (y2 - y1) / 2
      out.push({ list: 'longSeams', index, id: ls.id, txt: ls.id, ax: ls.x!, ay: labelY, th: 2, rot: o === 'Horizontal CCW' ? -90 : 90, layer: 'LONG_SEAMS', target: null })
    })
  }
  return out
}

/** A text's box as the drawing reads: [width, height] (a text turned a quarter turn on the sheet is tall). */
export function textBoxSize(o: Orientation, txt: string, sh: number, rot: number): [number, number] {
  const tw = Math.max(1, txt.length) * sh * 0.6
  const turned = Math.abs(((((rot + rotationOffset(o)) % 180) + 180) % 180) - 90) < 1
  return turned ? [sh, tw] : [tw, sh]
}

/** The leader from a moved label back to its item, or null (no target, or the label still touches it). */
export function textLeader(o: Orientation, p: Project, target: LeaderTarget | null, centre: Pt, w: number, h: number): Pt[] | null {
  if (!target) return null
  const cv = toVisual(o, centre[0], centre[1])
  let q: Pt
  if (target.kind === 'point') {
    const pv = toVisual(o, target.pt[0], target.pt[1])
    if (Math.abs(pv[0] - cv[0]) <= w / 2 && Math.abs(pv[1] - cv[1]) <= h / 2) return null
    q = target.pt
  } else {
    const [x0, y0, x1, y1] = target.box
    if (centre[0] >= x0 && centre[0] <= x1 && centre[1] >= y0 && centre[1] <= y1) return null
    q = [Math.min(x1, Math.max(x0, centre[0])), Math.min(y1, Math.max(y0, centre[1]))]
  }
  return leaderToLabel(o, leaderStyle(p.settings), q, 0, null, centre, w, h).path
}

export interface TextPlacement {
  /** Label center as drawn (logical). */
  x: number
  y: number
  /** Box as the drawing reads, at the Drawing step's size. */
  w: number
  h: number
  leader: Pt[] | null
  moved: boolean
  fallback?: string
}

/** Where a text label is drawn: its automatic spot, or where it was moved. */
export function placeTextLabel(p: Project, spec: TextLabelSpec): TextPlacement {
  const o = p.vessel.orientation as Orientation
  const sh = sizedHeight(textSizeRules(p.settings), textLayer(spec.layer), spec.th)
  const [w, h] = textBoxSize(o, spec.txt, sh, spec.rot)
  const auto: TextPlacement = { x: spec.ax, y: spec.ay, w, h, leader: null, moved: false }
  const ov = rowOverride(p, spec.list, spec.index)
  if (!ov || ov.label === null || ov.label === 'inside') return auto
  const [x, y] = offsetPoint(o, [spec.ax, spec.ay], ov.label)
  const H = p.vessel.height
  const L = p.vessel.length
  if (H !== null && L !== null && (x < 0 || y < 0 || x > H || y > L)) return { ...auto, fallback: 'it was off the shell' }
  return { x, y, w, h, leader: textLeader(o, p, spec.target, [x, y], w, h), moved: true }
}

/** Text labels moved by hand that could not be used (they are placed automatically), for the Review warnings. */
export function textLabelFallbacks(p: Project): { list: TextLabelList; index: number; id: string; why: string }[] {
  if (!p.labelOverrides.some((o) => (TEXT_LABEL_LISTS as readonly string[]).includes(o.list))) return []
  return textLabelSpecs(p).flatMap((sp) => {
    const why = placeTextLabel(p, sp).fallback
    return why ? [{ list: sp.list, index: sp.index, id: sp.id, why }] : []
  })
}
