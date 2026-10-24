// The SVG drawing: pan by dragging, zoom with the wheel or buttons, fit to window. Items are drawn in
// logical coordinates inside the orientation matrix (texts outside it, so they read the right way up).

import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type PointerEvent, type WheelEvent } from 'react'
import { aciCss } from '../../engine/aci.ts'
import type { DrawingItem, LayerGroup } from '../../engine/drawing.ts'
import type { RenderItem, RenderModel } from './renderModel.ts'

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
  const drag = useRef<{ x: number; y: number; box: Box; moved: boolean } | null>(null)
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

  function onPointerDown(e: PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return
    drag.current = { x: e.clientX, y: e.clientY, box, moved: false }
  }
  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 4) return
    if (!d.moved) svg.current?.setPointerCapture(e.pointerId)
    d.moved = true
    const s = scale(d.box)
    setBox({ ...d.box, x: d.box.x - dx / s, y: d.box.y - dy / s })
  }
  function onPointerUp(e: PointerEvent<SVGSVGElement>) {
    const d = drag.current
    drag.current = null
    if (d?.moved) {
      svg.current?.releasePointerCapture(e.pointerId)
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
      className="drawing"
      viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
      preserveAspectRatio="xMidYMid meet"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
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
          <path key={x.layer} d={x.d} style={x.opacity < 1 ? { ...colorStyle(x.color), opacity: x.opacity } : colorStyle(x.color)} />
        ))}
        {circles.map((x, i) => (
          <circle key={i} cx={x.cx} cy={x.cy} r={x.r} style={colorStyle(x.color)} />
        ))}
      </g>
      {texts.map((t, i) => (
        <text key={i} x={t.x} y={t.y} fontSize={t.size} textAnchor={t.anchor} transform={t.rotate ? `rotate(${t.rotate} ${t.x} ${t.y})` : undefined} style={colorStyle(t.color)}>
          {t.text}
        </text>
      ))}
    </g>
  )
})
