// The SVG drawing: pan by dragging, zoom with the wheel or buttons, fit to window. Items are drawn in
// logical coordinates inside the orientation matrix (texts outside it, so they read the right way up).

import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type WheelEvent } from 'react'
import { aciCss } from '../../engine/aci.ts'
import type { DrawingItem, LayerGroup } from '../../engine/drawing.ts'
import type { RenderItem, RenderModel } from './renderModel.ts'
import type { DrawingTool, ToolPointer } from './drawingTool.ts'

/** The CAD color as the CSS variable --c (the stylesheet strokes and fills with it; highlights win). */
const colorStyle = (n: number) => ({ '--c': aciCss(n) }) as CSSProperties

export type Highlight = 'error' | 'warning'

export interface DrawingViewHandle {
  fit: () => void
  zoom: (factor: number) => void
}

interface Props {
  model: RenderModel
  hidden: ReadonlySet<LayerGroup>
  highlights: ReadonlyMap<string, Highlight>
  selectedKey: string | null
  thumbs: ReadonlyMap<string, string>
  onPick: (item: DrawingItem) => void
  /** Changes when the drawing should be fitted again (another job or orientation). */
  fitKey: string
  /** Drawing mode: the tool takes clicks and drags first (drawingTool.ts); null = clicks go to the row. */
  tool?: DrawingTool | null
}

type Box = { x: number; y: number; w: number; h: number }

const NO_THUMBS: ReadonlyMap<string, string> = new Map()

function fitBox(b: [number, number, number, number]): Box {
  const w = Math.max(1, b[2] - b[0])
  const h = Math.max(1, b[3] - b[1])
  const m = Math.max(w, h) * 0.04
  return { x: b[0] - m, y: b[1] - m, w: w + 2 * m, h: h + 2 * m }
}

export const DrawingView = forwardRef<DrawingViewHandle, Props>(function DrawingView(props, ref) {
  const { model } = props
  const svg = useRef<SVGSVGElement>(null)
  const [box, setBox] = useState<Box>(() => fitBox(model.bounds))
  /** pan: dragging moves the view; tool: the drawing-mode tool took the drag. */
  const drag = useRef<{ x: number; y: number; box: Box; moved: boolean; mode: 'pan' | 'tool' } | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  /** Space held: a left drag pans even over something the tool could take. */
  const space = useRef(false)
  const tool = props.tool ?? null
  const bounds = useRef(model.bounds)
  useEffect(() => {
    bounds.current = model.bounds
  }, [model.bounds])

  const fit = useCallback(() => setBox(fitBox(bounds.current)), [])
  useEffect(() => {
    fit()
  }, [props.fitKey, fit])

  /** Screen pixels per drawing unit (viewBox is shown with "meet"). */
  const scale = (b: Box) => {
    const el = svg.current
    if (!el) return 1
    return Math.min(el.clientWidth / b.w, el.clientHeight / b.h) || 1
  }

  // The view size, measured, so the tool can draw its marks a fixed number of pixels big while rendering.
  const [size, setSize] = useState<[number, number]>([0, 0])
  const toolOn = tool !== null
  useEffect(() => {
    const el = svg.current
    if (!el || !toolOn) return
    const ro = new ResizeObserver(() => setSize((s) => (s[0] === el.clientWidth && s[1] === el.clientHeight ? s : [el.clientWidth, el.clientHeight])))
    ro.observe(el)
    return () => ro.disconnect()
  }, [toolOn])
  const renderScale = Math.min(size[0] / box.w, size[1] / box.h) || 1

  const zoomAt = useCallback((factor: number, clientX?: number, clientY?: number) => {
    setBox((b) => {
      const el = svg.current
      let px = b.x + b.w / 2
      let py = b.y + b.h / 2
      if (el && clientX !== undefined && clientY !== undefined) {
        const pt = el.createSVGPoint()
        pt.x = clientX
        pt.y = clientY
        const m = el.getScreenCTM()
        if (m) {
          const p = pt.matrixTransform(m.inverse())
          px = p.x
          py = p.y
        }
      }
      const w = b.w / factor
      const h = b.h / factor
      return { x: px - (px - b.x) / factor, y: py - (py - b.y) / factor, w, h }
    })
  }, [])

  useImperativeHandle(ref, () => ({ fit, zoom: (f) => zoomAt(f) }), [fit, zoomAt])

  function onWheel(e: WheelEvent<SVGSVGElement>) {
    zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX, e.clientY)
  }

  // The page must not scroll while the wheel zooms the drawing.
  useEffect(() => {
    const el = svg.current
    if (!el) return
    const stop = (e: globalThis.WheelEvent) => e.preventDefault()
    el.addEventListener('wheel', stop, { passive: false })
    return () => el.removeEventListener('wheel', stop)
  }, [])

  // Space+drag pans in drawing mode (not while typing in a box).
  useEffect(() => {
    if (!toolOn) return
    const typing = (e: KeyboardEvent) => (e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]')
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !typing(e)) {
        space.current = true
        e.preventDefault()
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') space.current = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      space.current = false
    }
  }, [toolOn])

  /** The pointer for the tool: SVG point, screen scale and the keys held. */
  function pointer(e: { clientX: number; clientY: number; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): ToolPointer {
    const el = svg.current
    let pt: [number, number] = [0, 0]
    const m = el?.getScreenCTM()
    if (el && m) {
      const sp = el.createSVGPoint()
      sp.x = e.clientX
      sp.y = e.clientY
      const q = sp.matrixTransform(m.inverse())
      pt = [q.x, q.y]
    }
    return { svg: pt, scale: scale(box), mods: { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey }, clientX: e.clientX, clientY: e.clientY }
  }

  function onPointerDown(e: PointerEvent<SVGSVGElement>) {
    // Middle button pans; so does a left drag with Space held, or one the tool does not take.
    if (e.button === 1) e.preventDefault()
    if (e.button !== 0 && e.button !== 1) return
    const takes = e.button === 0 && !space.current && tool !== null && tool.down(pointer(e))
    drag.current = { x: e.clientX, y: e.clientY, box, moved: false, mode: takes ? 'tool' : 'pan' }
    if (takes || e.button === 1) svg.current?.setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    const d = drag.current
    if (!d) {
      if (tool) setCursor(space.current ? null : tool.hover(pointer(e)))
      return
    }
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 4) return
    if (!d.moved && d.mode === 'pan') svg.current?.setPointerCapture(e.pointerId)
    d.moved = true
    if (d.mode === 'tool') {
      tool?.move(pointer(e))
      return
    }
    const s = scale(d.box)
    setBox({ ...d.box, x: d.box.x - dx / s, y: d.box.y - dy / s })
  }
  function onPointerUp(e: PointerEvent<SVGSVGElement>) {
    const d = drag.current
    drag.current = null
    if (svg.current?.hasPointerCapture(e.pointerId)) svg.current.releasePointerCapture(e.pointerId)
    if (d?.mode === 'tool') {
      tool?.up(pointer(e), d.moved)
      return
    }
    if (d?.moved || e.button !== 0) return
    if (tool) {
      tool.clickEmpty?.()
      return
    }
    // A click, not a drag: pick the item under the pointer.
    const key = (e.target as Element).closest?.('[data-key]')?.getAttribute('data-key')
    const item = key ? props.model.items.find((i) => i.key === key) : undefined
    if (item?.item.source) props.onPick(item.item)
  }

  const [a, b, c, d] = model.matrix
  return (
    <svg
      ref={svg}
      className={tool ? 'drawing drawing-mode' : 'drawing'}
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      preserveAspectRatio="xMidYMid meet"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => tool?.leave?.()}
      onContextMenu={(e: MouseEvent<SVGSVGElement>) => {
        if (tool?.menu?.(pointer(e))) e.preventDefault()
      }}
      style={tool && cursor ? { cursor } : undefined}
      role="img"
      aria-label="Drawing preview"
    >
      {model.items.map((it) => (
        <DrawingItemView
          key={it.key}
          it={it}
          matrix={`matrix(${a} ${b} ${c} ${d} 0 0)`}
          hidden={props.hidden}
          highlight={props.highlights.get(it.key) ?? null}
          selected={props.selectedKey === it.key}
          thumbs={it.images.length ? props.thumbs : NO_THUMBS}
          hatchOpacity={model.hatchOpacity}
        />
      ))}
      {tool?.overlay(renderScale)}
    </svg>
  )
})

/** One drawing item (also used by the Sheets view). */
export const DrawingItemView = memo(function DrawingItemView(p: {
  it: RenderItem
  matrix: string
  hidden: ReadonlySet<LayerGroup>
  highlight: Highlight | null
  selected: boolean
  thumbs: ReadonlyMap<string, string>
  hatchOpacity: number
}) {
  const { it, hidden } = p
  const show = (g: LayerGroup) => g === 'always' || !hidden.has(g)
  const paths = it.paths.filter((x) => show(x.group))
  const circles = it.circles.filter((x) => show(x.group))
  const texts = it.texts.filter((x) => show(x.group))
  const images = hidden.has('images') ? [] : it.images
  if (paths.length + circles.length + texts.length + images.length === 0) return null
  const cls = ['item', it.selectable ? 'pickable' : '', p.highlight ? `hl-${p.highlight}` : '', p.selected ? 'selected' : ''].filter(Boolean).join(' ')
  return (
    <g className={cls} data-key={it.key}>
      <title>{it.item.info}</title>
      <g transform={p.matrix}>
        {images.map((im, i) => {
          const url = p.thumbs.get(im.scanId)
          if (!url) return null
          const w = Math.abs(im.w)
          const h = Math.abs(im.h)
          const at = `translate(${Math.min(im.x, im.x + im.w)} ${Math.max(im.y, im.y + im.h)}) scale(1 -1)`
          if (!im.crop) return <image key={im.scanId} href={url} width={w} height={h} preserveAspectRatio="none" transform={at} />
          // A piece of a scan across the seam: the whole photo at the whole scan's width, clipped to this piece.
          const full = w / (im.crop[1] - im.crop[0])
          return (
            <g key={`${im.scanId}:${i}`} transform={at}>
              <svg x={0} y={0} width={w} height={h} viewBox={`0 0 ${w} ${h}`} overflow="hidden">
                <image href={url} x={-im.crop[0] * full} width={full} height={h} preserveAspectRatio="none" />
              </svg>
            </g>
          )
        })}
        {paths.map((x) => (
          <path key={x.fill ? `${x.layer}:fill` : x.layer} className={x.fill ? 'filled' : undefined} d={x.d} style={x.opacity < 1 ? { ...colorStyle(x.color), opacity: x.opacity } : colorStyle(x.color)} />
        ))}
        {circles.map((x, i) => (
          <circle key={i} cx={x.cx} cy={x.cy} r={x.r} style={colorStyle(x.color)} />
        ))}
      </g>
      {texts.map((t, i) => (
        <text key={i} x={t.x} y={t.y} dy={t.dy} fontSize={t.size} textAnchor={t.anchor} transform={t.rotate ? `rotate(${t.rotate} ${t.x} ${t.y})` : undefined} style={colorStyle(t.color)}>
          {t.text}
        </text>
      ))}
    </g>
  )
})
