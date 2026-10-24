// Where nozzle labels go, worked out by the app (approved change, 2026-10-23). v5.0's LISP decides this
// in CAD while it draws (SL_CircleSmart, SL_HeadNozzle); the app uses the same rules here and writes the
// positions into the .lsp, so the preview and CAD place every label exactly the same.
//
// Shell nozzles: SL_CircleSmart's rules unchanged (inside when it fits, else the first free spot of eight
// around the circle, avoiding scan images, objects and earlier nozzles and labels).
// Head nozzles: SL_HeadNozzle's rules, plus a new check: a label placed outside is moved further out along
// its leader until it no longer overlaps another head label, a head nozzle or head MUT text.

import type { Project, Scan } from '../data/schema.ts'
import { clockPositionDegrees, drawnScans, imageInserts, panelOf, radiusFactor, shouldShowHead, type Panel } from './layout.ts'
import { sizedHeight, textSizeRules } from './styles.ts'
import { arcBox, circumference, nozzlePieces, scanPieces, type ArcPiece } from './wrap.ts'
import { headVector, readableRot, type Orientation } from './transform.ts'

export type Box = [number, number, number, number]

export interface NozzleLabel {
  /** Circle center and radius (logical). */
  x: number
  y: number
  r: number
  txt: string
  /** Text height before the Drawing step's size (SL_Text in the .lsp applies that, as the preview does). */
  th: number
  /** Label center. */
  tx: number
  ty: number
  /** Leader line from the circle to the label, or null when the label is inside. */
  leader: [number, number, number, number] | null
  /**
   * A nozzle across the circumference seam: its pieces (the main one first, then the overhang at the other
   * edge), drawn instead of the whole circle. x, y is then the main piece's center (engine/wrap.ts).
   */
  arcs?: ArcPiece[]
  /** No clear spot was found: what the label overlaps ("scan 12"), for the Review warning. */
  crowded?: string
}

/** SL_BBox: approximate text box. */
export function textBox(cx: number, cy: number, tw: number, th: number, rot: number): Box {
  const [hw, hh] = Math.abs(rot) === 90 ? [th / 2, tw / 2] : [tw / 2, th / 2]
  return [cx - hw, cy - hh, cx + hw, cy + hh]
}

/** How many times a crowded outside label's leader is made longer (one label height and a half each) before giving up. */
const LONGER_LEADERS = 3

const overlap = (a: Box, b: Box) => !(a[2] <= b[0] || a[0] >= b[2] || a[3] <= b[1] || a[1] >= b[3])
const finite = (b: Box) => b.every((v) => Number.isFinite(v))

/** Shell nozzle labels by nozzle index (included nozzles with all values), in SL_CircleSmart order. */
export function shellNozzleLabels(p: Project, scans: Scan[]): Map<number, NozzleLabel> {
  const s = p.settings
  const o = p.vessel.orientation as Orientation
  const out = new Map<number, NozzleLabel>()
  if (!s.showNozzlesOnOverlay || p.vessel.length === null || p.vessel.height === null) return out
  // What labels keep clear of, with what each is (for the Review warning when a label can't be kept clear).
  const avoid: Box[] = []
  const names: string[] = []
  const keep = (b: Box, what: string) => {
    avoid.push(b)
    names.push(what)
  }
  for (const img of imageInserts(p, scans, false)) {
    const b: Box = [img.x, img.y, img.x + img.w, img.y + img.h]
    if (finite(b)) keep(b, `scan ${img.scanId}`)
  }
  // Every drawn scan too, with or without a photo (app change 23; SL_CircleSmart avoids only the inserted photos,
  // so with no photo, or "Use scan images" off, labels could land on scans).
  for (const sc of scans) {
    if (!sc.include || sc.xStart === null || sc.xStop === null || sc.yStart === null || sc.yStop === null) continue
    for (const pc of scanPieces(sc, circumference(p))) {
      const b: Box = [Math.min(pc.x0, pc.x1), Math.min(sc.yStart, sc.yStop), Math.max(pc.x0, pc.x1), Math.max(sc.yStart, sc.yStop)]
      if (finite(b) && b[2] > b[0] && b[3] > b[1]) keep(b, `scan ${sc.id}`)
    }
  }
  if (s.showSupportsOnOverlay) {
    for (const ob of p.objects) {
      if (ob.include && ob.x !== null && ob.y !== null && ob.circWidth !== null && ob.length !== null) keep([ob.x, ob.y, ob.x + ob.circWidth, ob.y + ob.length], `object ${ob.id}`)
    }
  }
  const H = p.vessel.height
  const L = p.vessel.length
  const lr = readableRot(o)
  const rules = textSizeRules(s)
  const C = circumference(p)
  p.shellNozzles.forEach((n, index) => {
    if (!n.include || n.x === null || n.y === null || n.diameter === null) return
    const { y, diameter: dia, id: txt } = n
    const r = dia / 2
    // Across the seam: the label goes with the main piece; every piece keeps other labels away.
    const pieces = nozzlePieces(n, C)
    const x = pieces[0].cx
    const wrapped = pieces.length > 1 || pieces[0].arc !== null
    const mode = n.labelMode.toUpperCase() || 'AUTO'
    const th = Math.max(1.6, Math.min(2.4, dia * 0.22))
    const sh = sizedHeight(rules, 'SHELL_NOZZLE_TEXT', th)
    const tw = Math.max(1, txt.length) * sh * 0.6
    // Across the seam (user rule, 2026-10-23): split about in half (center within a quarter radius of the edge)
    // always gets a leader; a partial split keeps the label inside the larger part when it fits there.
    const v0 = Math.max(0, x - r)
    const v1 = C === null ? x + r : Math.min(C, x + r)
    const halfSplit = wrapped && C !== null && Math.min(x, C - x) < r * 0.25
    const room = wrapped ? v1 - v0 : dia
    // Inside only when the label's width and height both fit the circle (or the larger piece) with a margin
    // (app change 23; v5.0 checked the width only). The label is turned with the drawing's readable rotation.
    const [bw, bh] = Math.abs(lr) === 90 ? [sh, tw] : [tw, sh]
    const insideOK = dia >= s.minNozzleInsideLabelDiameter && bw < room * 0.75 && bh < dia * 0.75
    let outside = mode === 'OUTSIDE' || (mode === 'AUTO' && !insideOK) || !s.smartNozzleLabels
    if (mode === 'INSIDE') outside = false
    if (halfSplit) outside = true
    const inX = wrapped ? (v0 + v1) / 2 : x
    const arcs = wrapped ? { arcs: pieces } : {}
    let label: NozzleLabel = { x, y, r, txt, th, tx: inX, ty: y, leader: null, ...arcs }
    /** SL_CircleSmart's eight spots around the circle centered at cx; across the seam only leaders from the drawn part (a0..a1). */
    const placeOutside = (cx: number, a0: number, a1: number): { tx: number; ty: number; leader: [number, number, number, number]; crowded?: string } => {
      const spots = (ld: number): [number, number, number, number][] => {
        const candidates: [number, number, number, number][] = [
          [cx + r + ld + tw / 2, y, cx + r, y],
          [cx + r + ld + tw / 2, y + r + ld, cx + r, y + r],
          [cx + r + ld + tw / 2, y - r - ld, cx + r, y - r],
          [cx - r - ld - tw / 2, y, cx - r, y],
          [cx - r - ld - tw / 2, y + r + ld, cx - r, y + r],
          [cx - r - ld - tw / 2, y - r - ld, cx - r, y - r],
          [cx, y + r + ld + tw / 2, cx, y + r],
          [cx, y - r - ld - tw / 2, cx, y - r],
        ]
        const usable = wrapped ? candidates.filter((c) => c[2] >= a0 - 1e-6 && c[2] <= a1 + 1e-6) : candidates
        return usable.length ? usable : candidates
      }
      const offShell = (bb: Box) => bb[0] < 0 || bb[1] < 0 || bb[2] > H || bb[3] > L
      const clear = (bb: Box) => !offShell(bb) && !avoid.some((a) => overlap(bb, a))
      // SL_CircleSmart's eight spots at the set leader length; when none is clear, the leader is made longer a few
      // times (app change 23) before the label is placed where it overlaps and a Review warning says so.
      let found: [number, number, number, number] | undefined
      for (let k = 0; k <= LONGER_LEADERS && !found; k++) found = spots(s.nozzleLeaderLength + k * sh * 1.6).find((c) => clear(textBox(c[0], c[1], tw, sh, lr)))
      let crowded: string | undefined
      if (!found) {
        found = spots(s.nozzleLeaderLength)[0]
        const bb = textBox(found[0], found[1], tw, sh, lr)
        const hit = avoid.findIndex((a) => overlap(bb, a))
        crowded = hit >= 0 ? names[hit] : 'the edge of the shell'
      }
      keep(textBox(found[0], found[1], tw, sh, lr), `the label of ${txt}`)
      return { tx: found[0], ty: found[1], leader: [found[2], found[3], found[0], found[1]], ...(crowded ? { crowded } : {}) }
    }
    if (txt !== '' && outside) label = { x, y, r, txt, th, ...placeOutside(x, v0, v1), ...arcs }
    out.set(index, label)
    for (const pc of pieces) keep(arcBox(pc), `nozzle ${txt || index + 1}`)
  })
  return out
}

/** Nozzle labels that could not be kept clear of everything else, for the Review warnings (app change 23). */
export function crowdedLabels(p: Project): { list: 'shellNozzles' | 'headNozzles'; index: number; id: string; overlaps: string }[] {
  if (p.vessel.length === null || p.vessel.height === null) return []
  const out: { list: 'shellNozzles' | 'headNozzles'; index: number; id: string; overlaps: string }[] = []
  for (const [index, l] of shellNozzleLabels(p, drawnScans(p))) if (l.crowded) out.push({ list: 'shellNozzles', index, id: l.txt, overlaps: l.crowded })
  const { headDia, panel } = panelOf(p)
  for (const [index, l] of headNozzleLabels(p, panel, headDia)) if (l.crowded) out.push({ list: 'headNozzles', index, id: l.txt, overlaps: l.crowded })
  return out
}

/** Head nozzle labels by nozzle index (included nozzles on a shown head, with a diameter). */
export function headNozzleLabels(p: Project, panel: Panel, headDia: number): Map<number, NozzleLabel> {
  const s = p.settings
  const o = p.vessel.orientation as Orientation
  const out = new Map<number, NozzleLabel>()
  const mode = s.headViewMode
  if (mode === 'NONE' || !s.showHeadNozzles) return out
  const lr = readableRot(o)
  const rules = textSizeRules(s)
  const r = headDia / 2
  const center = (head: string): [number, number] => (head === 'HEAD 1' ? [panel.head1X, panel.head1Y] : [panel.head2X, panel.head2Y])
  const shown = p.headNozzles.map((n, index) => ({ n, index })).filter(({ n }) => n.include && shouldShowHead(mode, n.head) && n.diameter !== null)

  // Everything a head label must keep clear of: head MUT text and every head nozzle circle.
  const avoid: Box[] = []
  const names: string[] = []
  for (const m of p.headMut) {
    if (!m.include || !shouldShowHead(mode, m.head) || m.id === '') continue
    const [cx, cy] = center(m.head)
    const [dx, dy] = headVector(o, clockPositionDegrees(m.clock))
    const f = r * radiusFactor(m)
    const mh = sizedHeight(rules, 'HEAD_MUT_TEXT', 1.5)
    avoid.push(textBox(cx + f * dx, cy + f * dy, m.id.length * mh * 0.6, mh, lr))
    names.push(`MUT ${m.id}`)
  }
  const bodies = shown.map(({ n }) => {
    const [cx, cy] = center(n.head)
    const [dx, dy] = headVector(o, clockPositionDegrees(n.clock))
    const f = r * radiusFactor(n)
    return { x: cx + f * dx, y: cy + f * dy, dx, dy, nozR: n.diameter! / 2 }
  })
  const bodyBoxes: Box[] = bodies.map((b) => [b.x - b.nozR, b.y - b.nozR, b.x + b.nozR, b.y + b.nozR])
  avoid.push(...bodyBoxes)
  names.push(...shown.map(({ n, index }) => `head nozzle ${n.id || index + 1}`))

  shown.forEach(({ n, index }, i) => {
    const { x, y, dx, dy, nozR } = bodies[i]
    const dia = n.diameter!
    const txt = n.id
    const th = Math.max(1.4, Math.min(2.2, dia * 0.22))
    const sh = sizedHeight(rules, 'HEAD_NOZZLE_TEXT', th)
    const tw = Math.max(1, txt.length) * sh * 0.6
    const m = n.labelMode.toUpperCase() || 'AUTO'
    // Width and height must both fit (app change 23; v5.0 checked the width only).
    const insideOK = dia >= s.minNozzleInsideLabelDiameter + 2 && txt.length * sh * 0.55 < dia * 0.65 && sh < dia * 0.65
    let outside = m === 'OUTSIDE' || (m === 'AUTO' && !insideOK)
    if (m === 'INSIDE') outside = false
    if (txt === '' || !outside) {
      out.set(index, { x, y, r: nozR, txt, th, tx: x, ty: y, leader: null })
      if (txt !== '') {
        avoid.push(textBox(x, y, tw, sh, lr))
        names.push(`the label of ${txt}`)
      }
      return
    }
    // SL_HeadNozzle: leader along the clock direction, text beyond it; moved out step by step if crowded.
    const ld = s.headNozzleLeaderLength
    const step = sh * 1.6
    const own = bodyBoxes[i]
    let k = 0
    for (; k <= 6; k++) {
      const t = nozR + ld + 8 + k * step
      const bb = textBox(x + t * dx, y + t * dy, tw, sh, lr)
      if (!avoid.some((a) => a !== own && overlap(bb, a))) break
    }
    // Still crowded at the longest leader: placed at the first spot, with a Review warning (app change 23).
    let crowded: string | undefined
    if (k > 6) {
      k = 0
      const t = nozR + ld + 8
      const bb = textBox(x + t * dx, y + t * dy, tw, sh, lr)
      const hit = avoid.findIndex((a) => a !== own && overlap(bb, a))
      crowded = hit >= 0 ? names[hit] : undefined
    }
    const tDist = nozR + ld + 8 + k * step
    const lEnd = nozR + ld + 4 + k * step
    const label: NozzleLabel = {
      x, y, r: nozR, txt, th, tx: x + tDist * dx, ty: y + tDist * dy, leader: [x + nozR * dx, y + nozR * dy, x + lEnd * dx, y + lEnd * dy], ...(crowded ? { crowded } : {}),
    }
    out.set(index, label)
    avoid.push(textBox(label.tx, label.ty, tw, sh, lr))
    names.push(`the label of ${txt}`)
  })
  return out
}
