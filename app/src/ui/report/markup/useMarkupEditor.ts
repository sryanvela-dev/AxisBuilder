// The markup editor's state and behaviour (design 14 "Editor", R5), host-agnostic: it takes the picture (its place in
// the report), the frame the marks are drawn in (view inches: the picture as it prints, turned and cropped) and the zoom
// (screen pixels per view inch), and holds the tool, the selection, drags and keys. The full-screen window draws
// <MarkupToolbar> and <MarkupStage> where it likes.
//
// Every finished change is one app.edit() (one undo step): a drag is stored when the pointer goes up (the stage shows a
// draft while dragging), a run of arrow-key nudges on the same marks merges into one step.
//
// Keys: tool letters (TOOLS), Delete, Ctrl+D duplicate, Ctrl+A select all, ] / [ forward / back (Shift: to the front /
// back), Ctrl+L lock, arrows nudge (Shift: more), Esc cancels the drag, closes the menu or clears the selection.
// Shift: boxes square, lines and the straight highlighter 0 / 45 / 90 degrees, box resize keeps the shape, turns in
// 15 degree steps, and frees a move from snapping. Alt frees a drawn point from snapping.

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { ImagePlace } from '../../../report/imageItems.ts'
import { addMark, duplicateMarks, removeMarks, reorderMarks, replaceMark, setLocked, type NewMark } from '../../../report/markEdits.ts'
import {
  dragHandle, markAt, markBounds, markHandles, marksInside, moveMark, snapMove, snapPoint, snapPoints, snapTargets,
  type MarkFrame, type MarkHandle, type Pt,
} from '../../../report/markGeometry.ts'
import { isFreehand, markFromDrag, markFromStroke, TOOLS, type ToolId, type ToolPrefs } from '../../../report/markTools.ts'
import type { Rect } from '../../../report/pageModel.ts'
import { pictureAt, setPictureEdits } from '../../../report/pagesEdits.ts'
import { markSchema, type Mark } from '../../../report/schema.ts'
import type { LabelStyle } from '../../../report/markEdits.ts'
import { useApp } from '../../appContext.ts'
import { readPrefs, writePrefs } from './prefs.ts'

const EMPTY: Mark[] = []
/** Arrow-key nudge, view inches (Shift: NUDGE_BIG). */
export const NUDGE = 0.02
export const NUDGE_BIG = 0.2
/** Pointer tolerances, screen pixels. */
const HIT_PX = 6
const HANDLE_PX = 8
const SNAP_PX = 7
/** A press that moves less than this (screen pixels) is a click. */
const CLICK_PX = 3
/** The turn handle's distance above a box, screen pixels. */
export const ROTATE_PX = 24

type Drag =
  | { kind: 'move'; start: Mark[]; p0: Pt; ids: Set<string>; moved: boolean; client: Pt }
  | { kind: 'handle'; start: Mark[]; id: string; h: MarkHandle; moved: boolean; client: Pt }
  | { kind: 'band'; p0: Pt }
  | { kind: 'stroke'; pts: Pt[] }
  | { kind: 'create'; a: Pt; client: Pt }

export interface EditorProps {
  at: ImagePlace
  frame: MarkFrame
  /** Screen pixels per view inch. */
  ppi: number
  /** Redaction can be offered (pictures yes, uploaded PDF pages no). */
  allowRedaction: boolean
}

export interface ContextMenuAt {
  x: number
  y: number
}

export function useMarkupEditor(props: EditorProps) {
  const { at, frame, ppi, allowRedaction } = props
  const app = useApp()
  const report = app.state.job!.history.present.report!
  const item = pictureAt(report, at)
  const stored = item?.edits.markup ?? EMPTY
  const [kept, setKept] = useState(readPrefs)
  const tool: ToolId = !allowRedaction && kept.tool === 'redaction' ? 'select' : kept.tool
  const prefs = kept.prefs
  const [sel, setSelState] = useState<ReadonlySet<string>>(new Set())
  const [draft, setDraft] = useState<Mark[] | null>(null)
  const [creating, setCreating] = useState<Mark | null>(null)
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null })
  const [band, setBand] = useState<Rect | null>(null)
  const [menu, setMenu] = useState<ContextMenuAt | null>(null)
  const [status, setStatus] = useState('')
  /** Bumped to ask the toolbar to put the cursor in the selected label's text box. */
  const [textFocus, setTextFocus] = useState(0)
  /** A label style picked for new labels and badges (null = the tool's own look). */
  const [newStyle, setNewStyle] = useState<LabelStyle | null>(null)
  const drag = useRef<Drag | null>(null)
  const marks = draft ?? stored
  const tol = HIT_PX / ppi
  const placeKey = JSON.stringify(at)

  // Selected marks that no longer exist (undo, a delete elsewhere) drop out of the selection.
  const selection = useMemo(() => new Set([...sel].filter((id) => marks.some((m) => m.id === id))), [sel, marks])
  const selected = useMemo(() => marks.filter((m) => selection.has(m.id)), [marks, selection])

  const setSel = useCallback((next: ReadonlySet<string>) => {
    setSelState(next)
    // A run of nudges ends when the selection changes.
    app.dispatch({ type: 'endEditGroup' })
  }, [app])

  const commit = useCallback((label: string, next: Mark[], group?: string) => {
    app.edit(label, (p) => setPictureEdits(p, at, { markup: next }), group)
  }, [app, at])

  const setTool = useCallback((t: ToolId) => {
    setKept((k) => {
      const n = { ...k, tool: t }
      writePrefs(n)
      return n
    })
    setCreating(null)
    setStatus(TOOLS.find((x) => x.id === t)?.hint ?? '')
    // A drawing tool starts with nothing selected, so the settings shown are the tool's.
    if (t !== 'select') setSelState(new Set())
  }, [])

  const setPrefs = useCallback((change: Partial<ToolPrefs>) => {
    setKept((k) => {
      const n = { ...k, prefs: { ...k.prefs, ...change } }
      writePrefs(n)
      return n
    })
  }, [])

  // --- Pointer ------------------------------------------------------------------------------------------
  /** Pointer -> view inches (the events are on the stage's SVG itself). */
  const viewAt = useCallback((e: { clientX: number; clientY: number; currentTarget: Element }): Pt => {
    const r = e.currentTarget.getBoundingClientRect()
    if (r.width === 0) return [frame.x, frame.y]
    return [frame.x + ((e.clientX - r.left) / r.width) * frame.w, frame.y + ((e.clientY - r.top) / r.height) * frame.h]
  }, [frame])

  const points = useMemo(() => snapPoints(frame, marks), [frame, marks])
  const snapped = (p: Pt, free: boolean): Pt => {
    const s = snapPoint(p, points, SNAP_PX / ppi, free)
    setGuides({ x: s.guideX, y: s.guideY })
    return s.pt
  }

  const handleAt = (p: Pt): { id: string; h: MarkHandle } | null => {
    if (selected.length !== 1 || selected[0].locked) return null
    const m = selected[0]
    for (const h of markHandles(frame, m, ROTATE_PX / ppi)) {
      if (Math.hypot(h.at[0] - p[0], h.at[1] - p[1]) <= HANDLE_PX / ppi) return { id: m.id, h: h.h }
    }
    return null
  }

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    // The editor (its host's focusable root) takes the keys from here on.
    ;(e.currentTarget.closest('[tabindex="-1"]') as HTMLElement | null)?.focus({ preventScroll: true })
    setMenu(null)
    const p = viewAt(e)
    const client: Pt = [e.clientX, e.clientY]
    if (tool === 'select') {
      const h = handleAt(p)
      if (h) {
        drag.current = { kind: 'handle', start: marks, id: h.id, h: h.h, moved: false, client }
        return
      }
      const hit = markAt(frame, marks, p, tol)
      if (hit) {
        let next = selection
        if (e.shiftKey) {
          next = new Set(selection)
          if (next.has(hit.id)) next.delete(hit.id)
          else next.add(hit.id)
        } else if (!selection.has(hit.id)) next = new Set([hit.id])
        if (next !== selection) setSel(next)
        const ids = new Set([...next].filter((id) => !marks.find((m) => m.id === id)?.locked))
        if (ids.has(hit.id)) drag.current = { kind: 'move', start: marks, p0: p, ids, moved: false, client }
        else if (hit.locked) setStatus('This mark is locked: unlock it (Ctrl+L) to move it.')
        return
      }
      if (!e.shiftKey && selection.size) setSel(new Set())
      drag.current = { kind: 'band', p0: p }
      return
    }
    // A drawing tool with a mark still selected (the one just made): its handles and body move and resize it, a click
    // anywhere else only lets go of it; the next drag draws.
    if (selection.size) {
      const h = handleAt(p)
      if (h) {
        drag.current = { kind: 'handle', start: marks, id: h.id, h: h.h, moved: false, client }
        return
      }
      const hit = markAt(frame, marks, p, tol)
      if (hit && selection.has(hit.id) && !hit.locked) {
        drag.current = { kind: 'move', start: marks, p0: p, ids: new Set([...selection].filter((id) => !marks.find((m) => m.id === id)?.locked)), moved: false, client }
        return
      }
      setSel(new Set())
      return
    }
    const start = snapped(p, e.altKey)
    if (isFreehand(tool)) drag.current = { kind: 'stroke', pts: [p] }
    else drag.current = { kind: 'create', a: start, client }
  }

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current
    const p = viewAt(e)
    if (!d) return
    const far = (c: Pt) => Math.hypot(e.clientX - c[0], e.clientY - c[1]) > CLICK_PX
    switch (d.kind) {
      case 'move': {
        if (!d.moved && !far(d.client)) return
        d.moved = true
        const moving = d.start.filter((m) => d.ids.has(m.id))
        const b = moving.map((m) => markBounds(frame, m)).reduce((u, r) => ({ x: Math.min(u.x, r.x), y: Math.min(u.y, r.y), w: Math.max(u.x + u.w, r.x + r.w) - Math.min(u.x, r.x), h: Math.max(u.y + u.h, r.y + r.h) - Math.min(u.y, r.y) }))
        const s = snapMove(b, [p[0] - d.p0[0], p[1] - d.p0[1]], snapTargets(frame, d.start, d.ids), SNAP_PX / ppi, e.shiftKey)
        setGuides({ x: s.guideX, y: s.guideY })
        setDraft(d.start.map((m) => (d.ids.has(m.id) ? moveMark(frame, m, s.d) : m)))
        return
      }
      case 'handle': {
        if (!d.moved && !far(d.client)) return
        d.moved = true
        const m = d.start.find((x) => x.id === d.id)
        if (!m) return
        const q = d.h === 'rotate' ? p : snapped(p, e.altKey || e.shiftKey)
        setDraft(replaceMark(d.start, dragHandle(frame, m, d.h, q, e.shiftKey)))
        return
      }
      case 'band':
        setBand({ x: Math.min(d.p0[0], p[0]), y: Math.min(d.p0[1], p[1]), w: Math.abs(p[0] - d.p0[0]), h: Math.abs(p[1] - d.p0[1]) })
        return
      case 'stroke': {
        const last = d.pts[d.pts.length - 1]
        if (Math.hypot(p[0] - last[0], p[1] - last[1]) * ppi < 1.5) return
        d.pts.push(p)
        // Preview: the raw points; the stored stroke is smoothed when the pointer goes up.
        const preview = markFromStroke(tool, prefs, frame, d.pts)
        setCreating(preview ? toMark(preview) : null)
        return
      }
      case 'create': {
        const b = snapped(p, e.altKey)
        const made = markFromDrag(tool, prefs, frame, d.a, b, e.shiftKey, newStyle)
        setCreating(made && far(d.client) ? toMark(made) : null)
        return
      }
    }
  }

  /** A new mark stays selected (to adjust, restyle or type into) until Enter, Esc or a click elsewhere. */
  const add = (made: NewMark, what: string, typeText: boolean) => {
    const { marks: next, id } = addMark(stored, made)
    commit(`Add ${what}`, next)
    setSel(new Set([id]))
    if (typeText) setTextFocus((n) => n + 1)
  }

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current
    drag.current = null
    setGuides({ x: null, y: null })
    setCreating(null)
    if (!d) return
    const p = viewAt(e)
    switch (d.kind) {
      case 'move':
        if (d.moved && draft) commit(d.ids.size === 1 ? 'Move a mark' : `Move ${d.ids.size} marks`, draft)
        setDraft(null)
        return
      case 'handle':
        if (d.moved && draft) commit(d.h === 'rotate' ? 'Turn a mark' : 'Resize a mark', draft)
        setDraft(null)
        return
      case 'band': {
        setBand(null)
        const r = { x: Math.min(d.p0[0], p[0]), y: Math.min(d.p0[1], p[1]), w: Math.abs(p[0] - d.p0[0]), h: Math.abs(p[1] - d.p0[1]) }
        if (r.w * ppi > CLICK_PX || r.h * ppi > CLICK_PX) {
          const inside = marksInside(frame, marks, r).map((m) => m.id)
          setSel(new Set(e.shiftKey ? [...selection, ...inside] : inside))
        }
        return
      }
      case 'stroke': {
        const made = markFromStroke(tool, prefs, frame, [...d.pts, p])
        if (made) add(made, tool === 'pen' ? 'a pen stroke' : 'a highlight', false)
        return
      }
      case 'create': {
        const b = Math.hypot(e.clientX - d.client[0], e.clientY - d.client[1]) > CLICK_PX ? snapped(p, e.altKey) : d.a
        setGuides({ x: null, y: null })
        const made = markFromDrag(tool, prefs, frame, d.a, b, e.shiftKey, newStyle)
        if (!made) {
          setStatus(TOOLS.find((t) => t.id === tool)?.hint ?? '')
          return
        }
        add(made, TOOLS.find((t) => t.id === tool)?.label.toLowerCase() ?? 'a mark', made.kind === 'label' || made.kind === 'badge')
        return
      }
    }
  }

  const onContextMenu = (e: React.MouseEvent<SVGSVGElement>) => {
    e.preventDefault()
    const p = viewAt(e)
    const hit = markAt(frame, marks, p, tol)
    if (!hit) {
      setMenu(null)
      return
    }
    if (!selection.has(hit.id)) setSel(new Set([hit.id]))
    const r = e.currentTarget.getBoundingClientRect()
    setMenu({ x: e.clientX - r.left, y: e.clientY - r.top })
  }

  /** Double-click a label or badge: type its text. */
  const onDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const hit = markAt(frame, marks, viewAt(e), tol)
    if (hit && (hit.kind === 'label' || hit.kind === 'badge')) {
      setSel(new Set([hit.id]))
      setTextFocus((n) => n + 1)
    }
  }

  // --- Actions ------------------------------------------------------------------------------------------
  const unlocked = useMemo(() => new Set(selected.filter((m) => !m.locked).map((m) => m.id)), [selected])

  const actions = {
    remove: () => {
      if (!unlocked.size) {
        if (selected.length) setStatus('Locked marks are kept: unlock them first (Ctrl+L).')
        return
      }
      commit(unlocked.size === 1 ? 'Delete a mark' : `Delete ${unlocked.size} marks`, removeMarks(stored, unlocked))
      if (unlocked.size < selected.length) setStatus('Locked marks were kept.')
      setSel(new Set())
    },
    duplicate: () => {
      if (!selected.length) return
      const d = duplicateMarks(stored, selection)
      commit(selected.length === 1 ? 'Duplicate a mark' : `Duplicate ${selected.length} marks`, d.marks)
      setSel(new Set(d.ids))
    },
    order: (how: 'forward' | 'back' | 'front' | 'backmost') => {
      if (!selected.length) return
      const next = reorderMarks(stored, selection, how)
      if (next.some((m, i) => m !== stored[i])) commit(how === 'forward' || how === 'front' ? 'Bring forward' : 'Send back', next)
    },
    lock: () => {
      if (!selected.length) return
      const lockIt = selected.some((m) => !m.locked)
      commit(lockIt ? 'Lock marks' : 'Unlock marks', setLocked(stored, selection, lockIt))
    },
    selectAll: () => setSel(new Set(stored.map((m) => m.id))),
    nudge: (dx: number, dy: number) => {
      if (!unlocked.size) return
      const next = stored.map((m) => (unlocked.has(m.id) ? moveMark(frame, m, [dx, dy]) : m))
      commit('Nudge marks', next, `markup-nudge:${placeKey}:${[...unlocked].sort().join(',')}`)
    },
    /** A change to the selected marks (style, text, link...), one undo step (or merged under `group`). */
    change: (label: string, fn: (marks: Mark[]) => Mark[], group?: string) => {
      const next = fn(stored)
      if (next.some((m, i) => m !== stored[i]) || next.length !== stored.length) commit(label, next, group)
    },
  }

  // --- Keys ---------------------------------------------------------------------------------------------
  const onKeyDown = (e: ReactKeyboardEvent) => {
    const t = e.target as HTMLElement
    const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable
    if (e.key === 'Escape') {
      if (drag.current) {
        drag.current = null
        setDraft(null)
        setCreating(null)
        setBand(null)
        setGuides({ x: null, y: null })
      } else if (menu) setMenu(null)
      else if (selection.size && !typing) setSel(new Set())
      else if (tool !== 'select' && !typing) setTool('select')
      else return
      e.stopPropagation()
      e.preventDefault()
      return
    }
    if (typing) return
    const ctrl = e.ctrlKey || e.metaKey
    const key = e.key.toLowerCase()
    const arrows: Record<string, Pt> = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }
    let handled = true
    if (arrows[key] && selection.size) {
      const s = e.shiftKey ? NUDGE_BIG : NUDGE
      actions.nudge(arrows[key][0] * s, arrows[key][1] * s)
    } else if (key === 'delete' || key === 'backspace') actions.remove()
    else if (key === 'enter' && selection.size) setSel(new Set())
    else if (ctrl && key === 'd') actions.duplicate()
    else if (ctrl && key === 'a') actions.selectAll()
    else if (ctrl && key === 'l') actions.lock()
    else if (e.key === ']' || e.key === '}') actions.order(e.shiftKey ? 'front' : 'forward')
    else if (e.key === '[' || e.key === '{') actions.order(e.shiftKey ? 'backmost' : 'back')
    else if (!ctrl && !e.altKey) {
      const t2 = TOOLS.find((x) => x.key.toLowerCase() === key && (x.id !== 'redaction' || allowRedaction))
      if (t2) setTool(t2.id)
      else handled = false
    } else handled = false
    if (handled) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  useEffect(() => {
    // Leaving the editor ends a run of nudges.
    return () => app.dispatch({ type: 'endEditGroup' })
  }, [app])

  const cursor = tool === 'select' ? 'default' : 'crosshair'

  return {
    at, frame, ppi, allowRedaction, item, marks, stored, tool, prefs, selection, selected, creating, guides, band, menu, status, textFocus, cursor, newStyle,
    setTool, setPrefs, setSel, setMenu, setStatus, setNewStyle, commit, actions,
    pointer: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onContextMenu, onDoubleClick },
    onKeyDown,
  }
}

export type MarkupEditorState = ReturnType<typeof useMarkupEditor>

/** A made mark for previews (an id and drawing order on top). */
function toMark(m: NewMark): Mark {
  return markSchema.parse({ ...m, id: 'preview', z: 1e6 })
}

