// The "Move labels" tool of the preview's drawing mode (Phase 5b): hover outlines a label that can be moved (nozzle,
// weld, seam, object and MUT labels),
// click selects it (and its table row), drag moves the label (lined up with other labels unless Shift is held; Ctrl
// keeps it level or plumb with where it started), and the round handle on the selected label's leader end moves the
// leader end around the circle (Ctrl: right, up, left or down only). The project changes once, on drop (one undo step).

import { useRef, useState } from 'react'
import { rowOverride } from '../../data/overrides.ts'
import type { LabelOverride, Project } from '../../data/schema.ts'
import type { PlacedLabel } from '../../engine/drawing.ts'
import { dropPlaced, dropTip } from '../../engine/labelDrag.ts'
import { textLeader } from '../../engine/textLabels.ts'
import { leaderStyle, leaderToLabel, visualAngle, type Pt } from '../../engine/leaders.ts'
import { findSnap, type Snap } from '../../engine/snap.ts'
import { toLogical, toVisual, type Orientation } from '../../engine/transform.ts'
import { svgToVisual, visualToSvg, type DrawingTool, type ToolPointer } from './drawingTool.ts'
import { SnapMarker } from './SnapMarker.tsx'

type Box = [number, number, number, number]
export type LabelPart = 'label' | 'tip'

/** Pixels: how close the pointer must be to a label, a handle or a snap. */
const HIT_PX = 5
const SNAP_PX = 8
const HANDLE_PX = 5

/** The label's box as the drawing reads. */
export function labelBoxVisual(o: Orientation, pl: PlacedLabel): Box {
  const [x, y] = toVisual(o, pl.x, pl.y)
  return [x - pl.w / 2, y - pl.h / 2, x + pl.w / 2, y + pl.h / 2]
}

/** A nozzle label's leader end on the circle as the drawing reads; null for an inside label or a text label. */
export function tipVisual(o: Orientation, pl: PlacedLabel): Pt | null {
  const l = pl.nozzle
  return l?.leader ? toVisual(o, l.leader[0][0], l.leader[0][1]) : null
}

const inBox = (b: Box, q: Pt, tol: number) => q[0] >= b[0] - tol && q[0] <= b[2] + tol && q[1] >= b[1] - tol && q[1] <= b[3] + tol

/** What is under the pointer (visual point): the selected label's leader end first, then the nearest label. */
export function hitLabel(o: Orientation, labels: readonly PlacedLabel[], q: Pt, tol: number, selectedKey: string | null): { pl: PlacedLabel; part: LabelPart } | null {
  const sel = labels.find((x) => x.key === selectedKey)
  const tip = sel && sel.txt !== '' ? tipVisual(o, sel) : null
  if (sel && tip && Math.hypot(q[0] - tip[0], q[1] - tip[1]) <= tol * 1.6) return { pl: sel, part: 'tip' }
  let best: { pl: PlacedLabel; d: number } | null = null
  for (const pl of labels) {
    if (pl.txt === '') continue
    const b = labelBoxVisual(o, pl)
    if (!inBox(b, q, tol)) continue
    const d = Math.hypot(q[0] - (b[0] + b[2]) / 2, q[1] - (b[1] + b[3]) / 2)
    if (!best || d < best.d) best = { pl, d }
  }
  return best ? { pl: best.pl, part: 'label' } : null
}

/** Where a label being dragged would land, as the drawing reads: its box and leader (null = inside, no leader). */
export function labelGhost(o: Orientation, p: Project, pl: PlacedLabel, change: Partial<Pick<LabelOverride, 'label' | 'tip'>>, tip: number | null): { box: Box; path: Pt[] | null } {
  const l = pl.nozzle
  const av = toVisual(o, pl.anchor[0], pl.anchor[1])
  const label = change.label
  const centre: Pt = label === 'inside' && l ? [l.insideX, l.y] : label && label !== 'inside' ? toLogical(o, av[0] + label.dx, av[1] + label.dy) : [pl.x, pl.y]
  const cv = toVisual(o, centre[0], centre[1])
  const box: Box = [cv[0] - pl.w / 2, cv[1] - pl.h / 2, cv[0] + pl.w / 2, cv[1] + pl.h / 2]
  const visual = (path: Pt[] | null) => path?.map((q) => toVisual(o, q[0], q[1])) ?? null
  if (!l) return { box, path: visual(textLeader(o, p, pl.text?.target ?? null, centre, pl.w, pl.h)) }
  if (label === 'inside' || (label === undefined && l.leader === null)) return { box, path: null }
  const sp = leaderToLabel(o, leaderStyle(p.settings), [l.x, l.y], l.r, change.tip !== undefined ? change.tip : tip, centre, l.tw, l.sh, l.tipArc)
  return { box, path: visual(sp.path) }
}

interface Drag {
  pl: PlacedLabel
  part: LabelPart
  /** Label center minus the pointer, as the drawing reads (the label keeps where it was grabbed). */
  grab: Pt
  /** Label center (or leader end) when the drag started. */
  start: Pt
  snap: Snap
}

export interface LabelToolProps {
  project: Project
  labels: readonly PlacedLabel[]
  selectedKey: string | null
  select: (pl: PlacedLabel | null) => void
  /** A drop: the change to store (one undo step). */
  change: (pl: PlacedLabel, change: Partial<Pick<LabelOverride, 'label' | 'tip'>>, what: LabelPart) => void
  menu: (pl: PlacedLabel, clientX: number, clientY: number) => void
}

export function useLabelTool(props: LabelToolProps): DrawingTool {
  const { project: p, labels, selectedKey } = props
  const o = p.vessel.orientation as Orientation
  const [hover, setHover] = useState<{ key: string; part: LabelPart } | null>(null)
  // The drag lives in a ref (pointer events can come faster than React renders); the state only redraws the marks.
  const dragRef = useRef<Drag | null>(null)
  const [drag, setDragState] = useState<Drag | null>(null)
  const setDrag = (d: Drag | null) => {
    dragRef.current = d
    setDragState(d)
  }
  const tipOverride = (pl: PlacedLabel) => rowOverride(p, pl.list, pl.index)?.tip ?? null

  const hit = (e: ToolPointer) => hitLabel(o, labels, svgToVisual(e.svg), HIT_PX / e.scale, selectedKey)

  /** The dragged label's center (or the leader end) for this pointer, snapped. */
  const snapFor = (d: Omit<Drag, 'snap'>, e: ToolPointer): Snap => {
    const q = svgToVisual(e.svg)
    const tol = SNAP_PX / e.scale
    if (d.part === 'tip') {
      // On the circle always; Ctrl holds it to right, up, left or down of the center.
      const l = d.pl.nozzle!
      const c = toVisual(o, l.x, l.y)
      const arc: [number, number] | null = l.tipArc ? [visualAngle(o, l.tipArc[0]), visualAngle(o, l.tipArc[1])] : null
      const s = findSnap({ segs: [], circles: [{ c, r: l.r, arc }] }, q, Math.max(l.r * 4, tol), { ortho: e.mods.ctrl, from: c, kinds: ['on'] })
      return s.kind ? s : { pt: q, kind: null }
    }
    const at: Pt = [q[0] + d.grab[0], q[1] + d.grab[1]]
    const others = labels.filter((x) => x.key !== d.pl.key && x.txt !== '').map((x) => toVisual(o, x.x, x.y))
    return findSnap({ segs: [], circles: [] }, at, tol, { free: e.mods.shift, ortho: e.mods.ctrl, from: d.start, align: others, kinds: ['align'] })
  }

  /** What a drop at this snap stores. */
  const changeFor = (d: Drag): Partial<Pick<LabelOverride, 'label' | 'tip'>> => {
    const at = toLogical(o, d.snap.pt[0], d.snap.pt[1])
    return d.part === 'tip' ? dropTip(o, d.pl.nozzle!, at) : dropPlaced(o, d.pl, at)
  }

  return {
    hover(e) {
      const drag = dragRef.current
      if (drag) return drag.part === 'tip' ? 'crosshair' : 'move'
      const h = hit(e)
      const key = h ? { key: h.pl.key, part: h.part } : null
      if (key?.key !== hover?.key || key?.part !== hover?.part) setHover(key)
      return h ? (h.part === 'tip' ? 'crosshair' : 'move') : null
    },
    down(e) {
      const h = hit(e)
      if (!h) return false
      props.select(h.pl)
      const start = h.part === 'tip' ? tipVisual(o, h.pl)! : toVisual(o, h.pl.x, h.pl.y)
      const q = svgToVisual(e.svg)
      const base = { pl: h.pl, part: h.part, grab: [start[0] - q[0], start[1] - q[1]] as Pt, start }
      setDrag({ ...base, snap: { pt: start, kind: null } })
      return true
    },
    move(e) {
      const d = dragRef.current
      if (d) setDrag({ ...d, snap: snapFor(d, e) })
    },
    up(e, moved) {
      const cur = dragRef.current
      if (!cur) return
      const d = { ...cur, snap: snapFor(cur, e) }
      setDrag(null)
      if (moved) props.change(d.pl, changeFor(d), d.part)
    },
    clickEmpty() {
      props.select(null)
    },
    menu(e) {
      const h = hit(e)
      if (!h) return false
      props.select(h.pl)
      props.menu(h.pl, e.clientX, e.clientY)
      return true
    },
    leave() {
      if (!dragRef.current) setHover(null)
    },
    overlay(scale) {
      const out = []
      const pad = 2 / scale
      const rect = (b: Box, cls: string, key: string) => {
        const [x0, y0] = visualToSvg([b[0], b[3]])
        return <rect key={key} className={cls} x={x0 - pad} y={y0 - pad} width={b[2] - b[0] + 2 * pad} height={b[3] - b[1] + 2 * pad} />
      }
      const hovered = hover && !drag ? labels.find((x) => x.key === hover.key) : undefined
      if (hovered && hovered.key !== selectedKey && hovered.txt !== '') out.push(rect(labelBoxVisual(o, hovered), 'move-hover', 'hover'))
      const sel = labels.find((x) => x.key === selectedKey)
      if (sel && sel.txt !== '') {
        out.push(rect(labelBoxVisual(o, sel), sel.moved ? 'move-selected moved' : 'move-selected', 'sel'))
        const tip = tipVisual(o, sel)
        if (tip && drag?.part !== 'tip') {
          const [x, y] = visualToSvg(tip)
          out.push(<circle key="tip" className={`move-handle${hover?.part === 'tip' ? ' hot' : ''}`} cx={x} cy={y} r={HANDLE_PX / scale} />)
        }
      }
      if (drag) {
        const g = labelGhost(o, p, drag.pl, changeFor(drag), tipOverride(drag.pl))
        out.push(rect(g.box, 'move-ghost', 'ghost'))
        if (g.path) out.push(<polyline key="ghost-leader" className="move-ghost" points={g.path.map((q) => visualToSvg(q).join(',')).join(' ')} />)
        if (drag.part === 'tip' && g.path) {
          const [x, y] = visualToSvg(g.path[0])
          out.push(<circle key="tip" className="move-handle hot" cx={x} cy={y} r={HANDLE_PX / scale} />)
        }
        out.push(<SnapMarker key="snap" snap={drag.snap} scale={scale} />)
      }
      return <g className="move-overlay">{out}</g>
    },
  }
}
