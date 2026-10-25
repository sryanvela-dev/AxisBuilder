// "Move labels" in the drawing preview (Phase 5b): the label tool wired to the job (one undo step per drop, a run of
// arrow-key nudges on one label is one step), the status line, Reset, the right-click menu and the keys (Esc clears
// the selection, arrows nudge NUDGE in, Shift+arrows NUDGE_BIG).

import { useEffect, useState, type ReactNode } from 'react'
import { resetOverride, rowOverride, setOverride } from '../../data/overrides.ts'
import { idKey, type LabelOverride, type Project } from '../../data/schema.ts'
import type { Drawing, PlacedLabel } from '../../engine/drawing.ts'
import { NUDGE, NUDGE_BIG, nudgeLabel } from '../../engine/labelDrag.ts'
import type { Orientation } from '../../engine/transform.ts'
import { useApp } from '../appContext.ts'
import { useSelection } from '../selectionContext.ts'
import { useLabelTool, type LabelPart } from './labelTool.tsx'
import type { DrawingTool } from './drawingTool.ts'

const typing = (t: EventTarget | null) => (t as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]') != null

/** The label key of the selected row, when it is a nozzle with a label. */
export function selectedLabelKey(selected: { list: string; index: number } | null): string | null {
  return selected && (selected.list === 'shellNozzles' || selected.list === 'headNozzles') ? `${selected.list}:${selected.index}` : null
}

/** A label's first row with its ID owns the move (repeated names: the later rows can't be moved until renamed). */
function ownsId(p: Project, pl: PlacedLabel): boolean {
  return p[pl.list].findIndex((n) => idKey(n.id) === idKey(pl.id)) === pl.index
}

export function useMoveLabels(on: boolean, project: Project, drawing: Drawing): {
  tool: DrawingTool | null
  status: ReactNode
  menu: ReactNode
} {
  const app = useApp()
  const { selected, select } = useSelection()
  const [message, setMessage] = useState('')
  const [menuAt, setMenuAt] = useState<{ pl: PlacedLabel; x: number; y: number } | null>(null)
  const selectedKey = selectedLabelKey(selected)
  const sel = drawing.labels.find((x) => x.key === selectedKey && x.label.txt !== '') ?? null
  const o = project.vessel.orientation as Orientation

  const store = (pl: PlacedLabel, change: Partial<Pick<LabelOverride, 'label' | 'tip'>>, what: LabelPart | 'nudge') => {
    if (!ownsId(app.state.job!.history.present, pl)) {
      setMessage(`${pl.id} is used by another row too: rename one before moving its label.`)
      return
    }
    setMessage('')
    const label = what === 'tip' ? `Move leader end of ${pl.id}` : `Move label ${pl.id}`
    app.edit(label, (p) => setOverride(p, pl.list, pl.id, change), what === 'nudge' ? `nudge:${pl.key}` : undefined)
  }
  const reset = (pl: PlacedLabel) => app.edit(`Reset position of ${pl.id}`, (p) => resetOverride(p, pl.list, pl.id))

  const tool = useLabelTool({
    project,
    labels: drawing.labels,
    selectedKey,
    select: (pl) => {
      setMenuAt(null)
      select(pl ? { list: pl.list, index: pl.index } : null)
    },
    change: store,
    menu: (pl, x, y) => setMenuAt({ pl, x, y }),
  })

  // A run of nudges is one undo step until another label (or none) is selected.
  const { dispatch } = app
  useEffect(() => {
    if (on) dispatch({ type: 'endEditGroup' })
  }, [selectedKey, on, dispatch])

  // Keys: Esc closes the menu or clears the selection (before full size closes); arrows nudge the selected label.
  useEffect(() => {
    if (!on) return
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target) || document.querySelector('.dialog-backdrop')) return
      if (e.key === 'Escape' && (menuAt || selected)) {
        e.stopPropagation()
        if (menuAt) setMenuAt(null)
        else select(null)
        return
      }
      const dir: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }
      const d = dir[e.key]
      if (!d || !sel || e.ctrlKey || e.metaKey || e.altKey) return
      e.preventDefault()
      e.stopPropagation()
      const step = e.shiftKey ? NUDGE_BIG : NUDGE
      store(sel, nudgeLabel(o, sel.label, d[0] * step, d[1] * step), 'nudge')
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

  if (!on) return { tool: null, status: null, menu: null }

  const moved = sel ? rowOverride(project, sel.list, sel.index) !== undefined : false
  const status = (
    <div className="move-status" role="status">
      <span>
        <strong>Move labels:</strong> drag a nozzle label, or the round handle on its leader end. Shift = no snap, Ctrl = level
        or plumb. Arrow keys nudge {NUDGE} in (Shift: {NUDGE_BIG} in). Esc clears.
      </span>
      {sel && (
        <span className="move-selection">
          <strong>{sel.id}</strong>
          {moved ? <span className="moved-chip">Moved by hand</span> : <span className="muted">placed automatically</span>}
          {moved && (
            <button type="button" className="btn btn-small" onClick={() => reset(sel)}>
              Reset position
            </button>
          )}
        </span>
      )}
      {message && <span className="move-message">{message}</span>}
    </div>
  )
  const menu = menuAt && (
    <div className="move-menu" role="menu" style={{ left: menuAt.x, top: menuAt.y }} onPointerDown={(e) => e.stopPropagation()}>
      <div className="move-menu-title">{menuAt.pl.id}</div>
      <button type="button" role="menuitem" disabled={!rowOverride(project, menuAt.pl.list, menuAt.pl.index)} onClick={() => {
        reset(menuAt.pl)
        setMenuAt(null)
      }}>
        Reset position
      </button>
    </div>
  )
  return { tool, status, menu }
}
