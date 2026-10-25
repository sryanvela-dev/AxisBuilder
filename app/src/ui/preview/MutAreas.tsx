// "MUT areas" in the drawing preview (Phase 5c): draw a MUT area corner by corner (snapping to the job's lines), find one
// by clicking inside a closed space (Pick inside), and edit it afterwards: drag a corner, drag or click a + handle on an
// edge to add a corner, select a corner and press Delete to remove it, delete the whole area (the row stays). Works on
// the shell and on the head views. Every change is one undo step (edit()).

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { addMutWithArea, deleteArea, insertCorner, moveCorner, removeCorner, setArea } from '../../data/mutAreaEdits.ts'
import type { HeadMut, Project, ShellMut } from '../../data/schema.ts'
import {
  areaFrame, areaGeometry, areaHit, drawableArea, formatAreaSize, mutAreaLayouts, mutAreaSize, pickInside, targetAt, targetOf,
  type AreaTarget, type MutList,
} from '../../engine/mutAreas.ts'
import { polygonArea } from '../../engine/polygon.ts'
import { findSnap, type Snap, type SnapGeom } from '../../engine/snap.ts'
import type { Orientation } from '../../engine/transform.ts'
import { useApp } from '../appContext.ts'
import { IDLE, useAreaTool, type AreaPhase, type AreaRow, type AreaToolApi } from '../areaToolContext.ts'
import { useSelection, type Selected } from '../selectionContext.ts'
import { addPoint, drawSnap, parseTypedPoint, removeLast, typedFrame } from './areaDraw.ts'
import { svgToVisual, visualToSvg, type DrawingTool, type ToolPointer } from './drawingTool.ts'
import { previewPrefs, setPreviewPrefs } from './previewPrefs.ts'
import { SnapMarker } from './SnapMarker.tsx'
import { CornerBox } from './CornerBox.tsx'

type Pt = [number, number]
type Row = AreaRow

/** A drag of a corner (corner) or of an edge's + handle (after = the corner before it). */
interface Drag {
  row: Row
  corner: number | null
  after: number | null
  start: Pt
  snap: Snap
}

/** Pixels: how close the pointer must be to a corner, a handle or a snap. */
const HANDLE_PX = 6
const SNAP_PX = 9

const isMutList = (l: string): l is MutList => l === 'shellMut' || l === 'headMut'
const typing = (t: EventTarget | null) => (t as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]') != null
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])
const rowOf = (p: Project, r: Row): ShellMut | HeadMut | undefined => (p[r.list] as (ShellMut | HeadMut)[])[r.index]
const targetName = (t: AreaTarget) => (t.kind === 'shell' ? 'the shell' : t.head === 'HEAD 1' ? 'head 1' : 'head 2')
const sameRow = (a: Row | null | undefined, b: Row | null | undefined) => !!a && !!b && a.list === b.list && a.index === b.index

/**
 * Starts drawing (or picking) an area from anywhere (the Field data table's Draw area / Pick inside): the preview opens
 * on the drawing with the MUT areas tool, the row selected. row null = a new MUT row.
 */
export function startArea(api: AreaToolApi, select: (s: Selected | null) => void, mode: 'draw' | 'pick', row: Row | null, target: AreaTarget | null) {
  const prefs = previewPrefs()
  if (!prefs.open) setPreviewPrefs({ ...prefs, open: true })
  api.setTool('areas')
  if (row) select(row)
  api.setPhase(mode === 'draw' ? { kind: 'draw', row, target, pts: [] } : { kind: 'pick', row })
}

export function useMutAreas(on: boolean, project: Project): { tool: DrawingTool | null; status: ReactNode; menu: ReactNode } {
  const app = useApp()
  const { selected, select } = useSelection()
  const api = useAreaTool()
  const o = project.vessel.orientation as Orientation
  const phase = api.phase
  // The latest phase, also in a ref: pointer events can come faster than React renders. src is the phase the change
  // was made from, so a phase set from outside (the table) is taken as it is.
  const live = useRef<{ src: AreaPhase; value: AreaPhase } | null>(null)
  const cur = (): AreaPhase => (live.current && live.current.src === phase ? live.current.value : phase)
  const setPhase = (ph: AreaPhase) => {
    live.current = { src: phase, value: ph }
    api.setPhase(ph)
  }
  const dragRef = useRef<Drag | null>(null)
  const [drag, setDragState] = useState<Drag | null>(null)
  const setDrag = (d: Drag | null) => {
    dragRef.current = d
    setDragState(d)
  }
  const [cursor, setCursor] = useState<{ snap: Snap; target: AreaTarget } | null>(null)
  const [cornerSel, setCornerSel] = useState<{ row: Row; corner: number } | null>(null)
  const [message, setMessage] = useState<{ text: string; retry?: Row | null } | null>(null)
  const [menuAt, setMenuAt] = useState<{ x: number; y: number; row: Row; corner: number | null } | null>(null)
  const [typed, setTyped] = useState('')
  const [typedProblem, setTypedProblem] = useState<string | null>(null)

  const present = () => app.state.job!.history.present
  const selRow: Row | null = selected && isMutList(selected.list) && rowOf(project, selected as Row) ? (selected as Row) : null
  const selItem = selRow ? rowOf(project, selRow) : undefined
  const selTarget = selRow && selItem ? targetOf(selRow.list, selItem) : null
  const selFrame = selTarget ? areaFrame(project, selTarget) : null
  /** What typed corner values mean for the selected area (X / Y on the shell; right / up from a head's center). */
  const selTf = selTarget ? typedFrame(project, selTarget) : null
  /** The selected row's area as stored, as the drawing reads (corners past the seam stay where they were drawn). */
  const selPts: Pt[] | null = selFrame && selItem?.area ? selItem.area.map((q) => selFrame.toVisual(q)) : null
  /** The selected corner, only while its row is the selected one. */
  const corner = cornerSel && sameRow(cornerSel.row, selRow) && selItem?.area && cornerSel.corner < selItem.area.length ? cornerSel.corner : null
  const setCorner = (c: number | null) => setCornerSel(c === null || !selRow ? null : { row: selRow, corner: c })
  const layouts = useMemo(() => mutAreaLayouts(project), [project])

  // Snap lines per target, worked out once per project version and edited row (that row's own area left out).
  const geom = useRef<{ p: Project; key: string; map: Map<string, SnapGeom> } | null>(null)
  const geomFor = (t: AreaTarget): SnapGeom => {
    const ph = cur()
    const editing: Row | null = ph.kind !== 'idle' ? ph.row : dragRef.current ? dragRef.current.row : selRow
    const key = editing ? `${editing.list}:${editing.index}` : ''
    if (!geom.current || geom.current.p !== project || geom.current.key !== key) geom.current = { p: project, key, map: new Map() }
    const tk = t.kind === 'shell' ? 'shell' : t.head
    let g = geom.current.map.get(tk)
    if (!g) {
      g = areaGeometry(project, t, editing ?? undefined)
      geom.current.map.set(tk, g)
    }
    return g
  }

  const finish = () => {
    setPhase(IDLE)
    setCursor(null)
    setTyped('')
    setTypedProblem(null)
  }

  /** Stores a closed shape (visual points) on its row, or on a new MUT row. */
  const commit = (row: Row | null, target: AreaTarget, pts: Pt[]) => {
    const p = present()
    const frame = areaFrame(p, target)
    if (!frame || pts.length < 3) return
    const stored = pts.map((q) => frame.toStored(q))
    if (row) {
      const id = rowOf(p, row)?.id ?? ''
      app.edit(`Draw the MUT area of ${id}`, (q) => setArea(q, row.list, row.index, stored))
      select(row)
    } else {
      const r = addMutWithArea(p, target, stored)
      app.edit(`Add ${r.id} with its MUT area`, () => r.project)
      select({ list: r.list, index: r.index })
    }
    finish()
  }

  /** Starts drawing (or picking) for a row, or for a new MUT row (null). */
  const start = (mode: 'draw' | 'pick', row: Row | null) => {
    setMessage(null)
    setMenuAt(null)
    setCornerSel(null)
    const item = row ? rowOf(present(), row) : undefined
    startArea(api, select, mode, row, row && item ? targetOf(row.list, item) : null)
  }

  // A run of edits is not grouped: each drop is its own undo step.
  const { dispatch } = app
  useEffect(() => {
    if (on) dispatch({ type: 'endEditGroup' })
  }, [on, dispatch, phase.kind])

  const removeSelectedCorner = () => {
    if (!selRow || corner === null || !selItem?.area) return
    if (selItem.area.length <= 3) {
      setMessage({ text: 'An area needs at least 3 corners. Delete the area instead, or draw it again.' })
      return
    }
    app.edit(`Remove a corner of the MUT area of ${selItem.id}`, (q) => removeCorner(q, selRow.list, selRow.index, corner))
    setCorner(null)
  }
  const removeArea = (row: Row) => {
    const item = rowOf(present(), row)
    if (!item?.area) return
    app.edit(`Delete the MUT area of ${item.id}`, (q) => deleteArea(q, row.list, row.index))
    setCornerSel(null)
  }

  // Keys: Esc cancels (before full size closes), Backspace takes the last corner away, Enter closes, Delete removes.
  useEffect(() => {
    if (!on) return
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('.dialog-backdrop')) return
      const ph = cur()
      const inBox = typing(e.target)
      if (e.key === 'Escape') {
        if (ph.kind !== 'idle' || menuAt || corner !== null || selRow || message) {
          e.stopPropagation()
          e.preventDefault()
          if (menuAt) setMenuAt(null)
          else if (ph.kind !== 'idle') finish()
          else if (message) setMessage(null)
          else if (corner !== null) setCorner(null)
          else select(null)
        }
        return
      }
      if (inBox) return
      if (ph.kind === 'draw') {
        if (e.key === 'Backspace') {
          e.preventDefault()
          setPhase({ ...ph, pts: removeLast(ph.pts) })
        } else if (e.key === 'Enter' && ph.pts.length >= 3) {
          e.preventDefault()
          commit(ph.row, ph.target ?? targetAt(present(), ph.pts[0]), ph.pts)
        }
        return
      }
      if (ph.kind === 'idle' && (e.key === 'Delete' || e.key === 'Backspace') && selRow && selItem?.area) {
        e.preventDefault()
        if (corner !== null) removeSelectedCorner()
        else if (e.key === 'Delete') removeArea(selRow)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  // The menu closes on any click elsewhere.
  useEffect(() => {
    if (!menuAt) return
    const close = () => setMenuAt(null)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [menuAt])

  /** The selected area's corner or + handle under the pointer. */
  const handleAt = (v: Pt, tol: number): { corner: number } | { after: number } | null => {
    if (!selPts) return null
    for (let i = 0; i < selPts.length; i++) if (dist(selPts[i], v) <= tol) return { corner: i }
    for (let i = 0; i < selPts.length; i++) {
      const a = selPts[i]
      const b = selPts[(i + 1) % selPts.length]
      if (dist([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], v) <= tol) return { after: i }
    }
    return null
  }
  /** The area under the pointer (the smallest, when areas overlap). */
  const areaAt = (v: Pt): Row | null => {
    const hits = layouts.filter((a) => areaHit(o, a, v))
    if (!hits.length) return null
    const size = (a: (typeof hits)[number]) => a.pieces.reduce((t, pc) => t + polygonArea(pc), 0)
    const a = hits.reduce((best, x) => (size(x) < size(best) ? x : best))
    return { list: a.list, index: a.index }
  }

  const drawTarget = (ph: Extract<AreaPhase, { kind: 'draw' }>, v: Pt): AreaTarget => ph.target ?? (ph.pts.length ? targetAt(project, ph.pts[0]) : targetAt(project, v))

  const snapFor = (e: ToolPointer): { snap: Snap; target: AreaTarget } | null => {
    const ph = cur()
    const v = svgToVisual(e.svg)
    const tol = SNAP_PX / e.scale
    if (ph.kind === 'draw') {
      const target = drawTarget(ph, v)
      return { snap: drawSnap(geomFor(target), ph.pts, v, tol, e.mods), target }
    }
    const d = dragRef.current
    if (d) {
      const item = rowOf(project, d.row)
      if (!item) return null
      const target = targetOf(d.row.list, item)
      return { snap: findSnap(geomFor(target), v, tol, { free: e.mods.shift, ortho: e.mods.ctrl, from: d.start, kinds: ['endpoint', 'intersection', 'center', 'perpendicular', 'on'] }), target }
    }
    return null
  }

  const tool: DrawingTool = {
    hover(e) {
      const ph = cur()
      if (ph.kind === 'draw') {
        setCursor(snapFor(e))
        return 'crosshair'
      }
      if (ph.kind === 'pick') return 'cell'
      if (dragRef.current) return 'move'
      const v = svgToVisual(e.svg)
      const h = handleAt(v, HANDLE_PX / e.scale)
      if (h) return 'corner' in h ? 'move' : 'copy'
      return areaAt(v) ? 'pointer' : null
    },
    down(e) {
      setMenuAt(null)
      const ph = cur()
      if (ph.kind !== 'idle') return true
      const v = svgToVisual(e.svg)
      const h = handleAt(v, HANDLE_PX / e.scale)
      if (h && selRow) {
        const start = 'corner' in h ? selPts![h.corner] : (() => {
          const a = selPts![h.after]
          const b = selPts![(h.after + 1) % selPts!.length]
          return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as Pt
        })()
        setDrag({ row: selRow, corner: 'corner' in h ? h.corner : null, after: 'after' in h ? h.after : null, start, snap: { pt: start, kind: null } })
        if ('corner' in h) setCorner(h.corner)
        return true
      }
      const hit = areaAt(v)
      if (hit) {
        setMessage(null)
        select(hit)
        return true
      }
      return false
    },
    move(e) {
      const ph = cur()
      if (ph.kind === 'draw') {
        setCursor(snapFor(e))
        return
      }
      const d = dragRef.current
      if (d) {
        const s = snapFor(e)
        if (s) setDrag({ ...d, snap: s.snap })
      }
    },
    up(e, moved) {
      const ph = cur()
      const v = svgToVisual(e.svg)
      if (ph.kind === 'draw') {
        const s = snapFor(e)
        if (!s) return
        const res = addPoint(ph.pts, s.snap.pt, HANDLE_PX / e.scale)
        const target = ph.target ?? (ph.pts.length ? targetAt(project, ph.pts[0]) : s.target)
        if (res.closed) commit(ph.row, target, res.pts)
        else setPhase({ ...ph, target, pts: res.pts })
        return
      }
      if (ph.kind === 'pick') {
        if (moved) return
        const item = ph.row ? rowOf(present(), ph.row) : undefined
        const target = ph.row && item ? targetOf(ph.row.list, item) : targetAt(present(), v)
        const found = pickInside(present(), target, v, ph.row ?? undefined)
        if (!found) {
          setMessage({ text: `No closed space was found there on ${targetName(target)}: the lines around that spot don't close. Draw the area corner by corner instead.`, retry: ph.row })
          finish()
          return
        }
        commit(ph.row, target, found)
        return
      }
      const dr = dragRef.current
      if (!dr) return
      setDrag(null)
      const item = rowOf(present(), dr.row)
      if (!item) return
      const frame = areaFrame(present(), targetOf(dr.row.list, item))
      if (!frame) return
      const s = moved ? (snapFor(e)?.snap ?? dr.snap) : null
      if (dr.corner !== null) {
        if (!s) return // a click: the corner is selected
        app.edit(`Move a corner of the MUT area of ${item.id}`, (q) => moveCorner(q, dr.row.list, dr.row.index, dr.corner!, frame.toStored(s.pt)))
      } else if (dr.after !== null) {
        const at = s ? s.pt : dr.start
        app.edit(`Add a corner to the MUT area of ${item.id}`, (q) => insertCorner(q, dr.row.list, dr.row.index, dr.after!, frame.toStored(at)))
        setCorner(dr.after + 1)
      }
    },
    clickEmpty() {
      setMenuAt(null)
      if (corner !== null) setCorner(null)
      else if (selRow) select(null)
    },
    menu(e) {
      const ph = cur()
      if (ph.kind === 'draw') {
        // Right-click closes the shape, as Enter does.
        if (ph.pts.length >= 3) commit(ph.row, drawTarget(ph, ph.pts[0]), ph.pts)
        return true
      }
      if (ph.kind === 'pick') return true
      const v = svgToVisual(e.svg)
      const h = handleAt(v, HANDLE_PX / e.scale)
      if (h && 'corner' in h && selRow) {
        setCorner(h.corner)
        setMenuAt({ x: e.clientX, y: e.clientY, row: selRow, corner: h.corner })
        return true
      }
      const hit = areaAt(v)
      if (!hit) return false
      select(hit)
      setMenuAt({ x: e.clientX, y: e.clientY, row: hit, corner: null })
      return true
    },
    leave() {
      if (cur().kind === 'draw') setCursor(null)
    },
    overlay(scale) {
      const out: ReactNode[] = []
      const svgPts = (pts: Pt[]) => pts.map((q) => visualToSvg(q).join(',')).join(' ')
      const hs = HANDLE_PX / scale
      if (phase.kind === 'draw') {
        const pts = phase.pts
        const next = cursor?.snap.pt
        if (pts.length) out.push(<polyline key="shape" className="area-draft" points={svgPts(next ? [...pts, next] : pts)} />)
        if (pts.length >= 2 && next) out.push(<line key="close" className="area-close-guide" x1={visualToSvg(next)[0]} y1={visualToSvg(next)[1]} x2={visualToSvg(pts[0])[0]} y2={visualToSvg(pts[0])[1]} />)
        pts.forEach((q, i) => {
          const [x, y] = visualToSvg(q)
          const near = i === 0 && pts.length >= 3 && next !== undefined && dist(next, q) <= hs
          out.push(<rect key={`p${i}`} className={`move-handle${near ? ' hot' : ''}`} x={x - hs / 2} y={y - hs / 2} width={hs} height={hs} />)
        })
        if (cursor) out.push(<SnapMarker key="snap" snap={cursor.snap} scale={scale} />)
      }
      if (selPts && phase.kind === 'idle') {
        const pts = drag?.corner != null ? selPts.map((q, i) => (i === drag.corner ? drag.snap.pt : q)) : drag?.after != null ? [...selPts.slice(0, drag.after + 1), drag.snap.pt, ...selPts.slice(drag.after + 1)] : selPts
        out.push(<polygon key="sel" className="move-selected area-selected" points={svgPts(pts)} />)
        if (!drag) {
          selPts.forEach((a, i) => {
            const b = selPts[(i + 1) % selPts.length]
            const [x, y] = visualToSvg([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])
            out.push(<path key={`m${i}`} className="area-plus" d={`M${x - hs / 2} ${y}H${x + hs / 2}M${x} ${y - hs / 2}V${y + hs / 2}`} />)
          })
        }
        pts.forEach((q, i) => {
          const [x, y] = visualToSvg(q)
          const hot = drag ? (drag.corner === i || (drag.after !== null && i === drag.after + 1)) : corner === i
          out.push(<rect key={`c${i}`} className={`move-handle${hot ? ' hot' : ''}`} x={x - hs / 2} y={y - hs / 2} width={hs} height={hs} />)
        })
        if (drag && drag.snap.kind) out.push(<SnapMarker key="snap" snap={drag.snap} scale={scale} />)
      }
      return <g className="move-overlay">{out}</g>
    },
  }

  if (!on) return { tool: null, status: null, menu: null }

  // --- Status line ---------------------------------------------------------------------------------------
  const typedTarget: AreaTarget | null = phase.kind === 'draw' ? (phase.target ?? (phase.pts.length ? targetAt(project, phase.pts[0]) : cursor?.target ?? null)) : null
  const tf = typedTarget ? typedFrame(project, typedTarget) : null
  const addTyped = () => {
    if (phase.kind !== 'draw') return
    const target = typedTarget ?? { kind: 'shell' as const }
    const frame = typedFrame(project, target)
    if (!frame) return
    const last = phase.pts.length ? frame.fromVisual(phase.pts[phase.pts.length - 1]) : null
    const r = parseTypedPoint(typed, last)
    if (!r.ok) {
      setTypedProblem(r.problem)
      return
    }
    const v = frame.toVisual(r.pt)
    const res = addPoint(phase.pts, v, 1e-6)
    setTyped('')
    setTypedProblem(null)
    if (res.closed) commit(phase.row, target, res.pts)
    else setPhase({ ...phase, target: phase.target ?? target, pts: res.pts })
  }
  const rowName = (r: Row | null) => (r ? (rowOf(project, r)?.id ?? '') : '')
  let body: ReactNode
  const phaseItem = phase.kind !== 'idle' && phase.row ? rowOf(project, phase.row) : undefined
  if (phase.kind !== 'idle' && phase.row && phaseItem && !areaFrame(project, targetOf(phase.row.list, phaseItem))) {
    // A head MUT on a head that is not drawn: nothing to draw on yet.
    body = (
      <span>
        <strong>{phaseItem.id}</strong> is on {'head' in phaseItem ? phaseItem.head : 'a head'}, which is not drawn, so its area can't be drawn yet. Show it with
        Head views (Field data step, Heads).{' '}
        <button type="button" className="btn btn-small" onClick={finish}>Cancel</button>
      </span>
    )
  } else if (phase.kind === 'draw') {
    const who = phase.row ? `the MUT area of ${rowName(phase.row)}` : 'a new MUT area (on the shell, or on a head if the first corner is in one)'
    body = (
      <>
        <span>
          <strong>Drawing {who}:</strong> click the corners; click the first corner again, press Enter or right-click to close it. Backspace takes the last corner
          away, Esc cancels. Corners snap to lines, corners and crossings; Shift = no snap, Ctrl = level or plumb with the last corner.
          {typedTarget?.kind === 'shell' && ' A corner past the left or right edge of the shell wraps round to the other edge.'}
        </span>
        <span className="area-coords">
          {cursor && tf ? <>Cursor: {tf.describe(tf.fromVisual(cursor.snap.pt))} in</> : <span className="muted">Move over the drawing to see the cursor position.</span>}
          {phase.pts.length > 0 && tf && <> · {phase.pts.length} {phase.pts.length === 1 ? 'corner' : 'corners'}, last {tf.describe(tf.fromVisual(phase.pts[phase.pts.length - 1]))} in</>}
        </span>
        <span className="area-typed">
          <label>
            Next corner (in):{' '}
            <input type="text" value={typed} placeholder={typedTarget?.kind === 'head' ? 'right, up' : 'X, Y'} onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addTyped()
                }
              }} aria-invalid={typedProblem ? true : undefined} title="Type X, Y in inches (or @dX, dY from the last corner), then Enter" />
          </label>
          <button type="button" className="btn btn-small" onClick={addTyped} disabled={typed.trim() === ''}>Add</button>
          {phase.pts.length >= 3 && <button type="button" className="btn btn-small btn-primary" onClick={() => commit(phase.row, typedTarget ?? { kind: 'shell' }, phase.pts)}>Close the area</button>}
          <button type="button" className="btn btn-small" onClick={finish}>Cancel</button>
          {typedProblem && <span className="msg-error">{typedProblem}</span>}
        </span>
      </>
    )
  } else if (phase.kind === 'pick') {
    body = (
      <span>
        <strong>Pick inside{phase.row ? ` for ${rowName(phase.row)}` : ''}:</strong> click inside a space closed all round by lines (welds, seams, scan edges,
        objects, the shell edge; on a head: the head circle, centerlines, nozzles). Esc cancels.{' '}
        <button type="button" className="btn btn-small" onClick={finish}>Cancel</button>
      </span>
    )
  } else if (selRow && selItem) {
    const size = mutAreaSize(project, selRow.list, selItem)
    const where = selTarget ? targetName(selTarget) : ''
    body = (
      <span className="move-selection">
        <strong>{selItem.id}</strong>
        <span className="muted">{selRow.list === 'shellMut' ? 'shell MUT' : `head MUT, ${(selItem as HeadMut).head}`}</span>
        {size ? <span>Area {size.approx ? 'about ' : ''}{formatAreaSize(size.sqIn)}</span> : selItem.area ? <span className="moved-chip">Area not drawn (fewer than 3 corners)</span> : <span className="muted">no area yet</span>}
        <button type="button" className="btn btn-small btn-primary" onClick={() => start('draw', selRow)}>{selItem.area ? 'Draw again' : 'Draw area'}</button>
        <button type="button" className="btn btn-small" onClick={() => start('pick', selRow)}>Pick inside</button>
        {selItem.area && <button type="button" className="btn btn-small" onClick={() => removeArea(selRow)}>Delete area</button>}
        {drawableArea(selItem) && <span className="muted">Drag a corner to move it (on {where}); drag or click a + to add one; click a corner and press Delete to remove it.</span>}
        {selItem.area && selFrame && selTf && (
          <details className="area-corners">
            <summary>Corners ({selItem.area.length}): type exact values</summary>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{selRow.list === 'shellMut' ? 'X (in)' : 'Right (in)'}</th>
                  <th>{selRow.list === 'shellMut' ? 'Y (in)' : 'Up (in)'}</th>
                </tr>
              </thead>
              <tbody>
                {selItem.area.map((q, i) => {
                  const t = selTf.fromVisual(selFrame.toVisual(q))
                  const store = (k: 0 | 1, value: number) => {
                    const next: Pt = k === 0 ? [value, t[1]] : [t[0], value]
                    app.edit(`Move a corner of the MUT area of ${selItem.id}`, (p) => moveCorner(p, selRow.list, selRow.index, i, selFrame.toStored(selTf.toVisual(next))))
                  }
                  return (
                    <tr key={i} className={corner === i ? 'area-corner-selected' : undefined} onFocus={() => setCorner(i)}>
                      <td>{i + 1}</td>
                      <td><CornerBox value={t[0]} label={`Corner ${i + 1}, ${selRow.list === 'shellMut' ? 'X' : 'right'}`} store={(v) => store(0, v)} /></td>
                      <td><CornerBox value={t[1]} label={`Corner ${i + 1}, ${selRow.list === 'shellMut' ? 'Y' : 'up'}`} store={(v) => store(1, v)} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </details>
        )}
      </span>
    )
  } else {
    body = (
      <span>
        <strong>MUT areas:</strong> click an area to select it, select a MUT row in Field data, or start a new one:{' '}
        <button type="button" className="btn btn-small btn-primary" onClick={() => start('draw', null)}>New: draw area</button>{' '}
        <button type="button" className="btn btn-small" onClick={() => start('pick', null)}>New: pick inside</button>
      </span>
    )
  }
  const status = (
    <div className="move-status area-status" role="status">
      {body}
      {message && (
        <span className="msg msg-warning area-message">
          {message.text}{' '}
          {message.retry !== undefined && (
            <button type="button" className="btn btn-small" onClick={() => start('draw', message.retry ?? null)}>Draw area instead</button>
          )}
        </span>
      )}
    </div>
  )
  const menuRow = menuAt ? rowOf(project, menuAt.row) : undefined
  const menu = menuAt && menuRow && (
    <div className="move-menu" role="menu" style={{ left: menuAt.x, top: menuAt.y }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="move-menu-title">{menuRow.id}</div>
      {menuAt.corner !== null && (
        <button type="button" role="menuitem" disabled={(menuRow.area?.length ?? 0) <= 3} onClick={() => {
          app.edit(`Remove a corner of the MUT area of ${menuRow.id}`, (q) => removeCorner(q, menuAt.row.list, menuAt.row.index, menuAt.corner!))
          setCorner(null)
          setMenuAt(null)
        }}>
          Remove corner
        </button>
      )}
      <button type="button" role="menuitem" onClick={() => {
        setMenuAt(null)
        start('draw', menuAt.row)
      }}>
        Draw again
      </button>
      <button type="button" role="menuitem" onClick={() => {
        removeArea(menuAt.row)
        setMenuAt(null)
      }}>
        Delete area
      </button>
    </div>
  )
  return { tool, status, menu }
}

