// The divider on the preview's left edge: drag it (or use the arrow keys) to give the step page or the
// preview more room. The width is kept in the browser, one for the drawing steps and one for the report steps, so
// switching between Drawing and Report keeps each its own (user, 2026-10-31).

import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react'

export type SplitterKind = 'drawing' | 'report'
/** The drawing keeps the key it always had, so a width saved before stays. */
const STORE_KEY: Record<SplitterKind, string> = { drawing: 'axisbuilder:previewWidth', report: 'axisbuilder:previewWidth:report' }
/** Narrowest preview and narrowest step page (px). */
const MIN_PREVIEW = 320
const MIN_PAGE = 360
/** This page's widths, also when storage is blocked. */
const kept: Partial<Record<SplitterKind, number>> = {}

function load(kind: SplitterKind): number | null {
  if (kept[kind] !== undefined) return kept[kind]
  try {
    const n = Number(localStorage.getItem(STORE_KEY[kind]))
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

function save(kind: SplitterKind, w: number) {
  kept[kind] = Math.round(w)
  try {
    localStorage.setItem(STORE_KEY[kind], String(Math.round(w)))
  } catch {
    // storage blocked: the width lasts until the page closes
  }
}

export function PreviewSplitter({ kind }: { kind: SplitterKind }) {
  const self = useRef<HTMLDivElement>(null)
  const drag = useRef<{ right: number } | null>(null)

  const work = () => self.current?.closest<HTMLElement>('.work') ?? null
  const apply = (w: number) => {
    const el = work()
    if (!el) return w
    const clamped = Math.round(Math.max(MIN_PREVIEW, Math.min(el.clientWidth - MIN_PAGE, w)))
    el.style.setProperty('--preview-w', `${clamped}px`)
    el.classList.add('preview-sized')
    return clamped
  }

  // The page area is shared by both workspaces: take this workspace's width, or the default when it has none.
  useEffect(() => {
    const w = load(kind)
    if (w !== null) apply(w)
    else {
      const el = work()
      el?.style.removeProperty('--preview-w')
      el?.classList.remove('preview-sized')
    }
  }, [kind])

  const width = () => self.current?.parentElement?.getBoundingClientRect().width ?? MIN_PREVIEW

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    const aside = self.current?.parentElement
    if (!aside) return
    drag.current = { right: aside.getBoundingClientRect().right }
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (drag.current) apply(drag.current.right - e.clientX)
  }
  function onPointerUp() {
    if (!drag.current) return
    drag.current = null
    save(kind, width())
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 80 : 20
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    save(kind, apply(width() + (e.key === 'ArrowLeft' ? step : -step)))
  }

  return (
    <div
      ref={self}
      className="preview-splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label="Drag to make the page or the preview wider (or use the arrow keys)"
      title="Drag to make the page or the preview wider"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
    />
  )
}
