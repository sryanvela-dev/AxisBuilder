// The Sheets view of the preview: every printed sheet as it will print (on the chosen paper, white), one at a
// time: the main sheet, then (with section sheets on) the overview and each section. Everything comes from
// engine/sheetModel.ts, the same model the PDF and the report images draw, so what is checked here is what
// prints. Photos are the preview's thumbnails; the PDF embeds them from the original photos.

import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import type { Project } from '../../data/schema.ts'
import { printCss } from '../../engine/aci.ts'
import type { Drawing, LayerGroup } from '../../engine/drawing.ts'
import type { SectionPlan } from '../../engine/sections.ts'
import { drawSteps, sheetModels, textGeometry, type DrawStep, type PathOp, type SheetModel } from '../../engine/sheetModel.ts'

type Box = { x: number; y: number; w: number; h: number }
const fullBox = (m: SheetModel): Box => ({ x: -0.1, y: -0.1, w: m.paper.w + 0.2, h: m.paper.h + 0.2 })

/** Paper path (y up) -> SVG path data (y down). */
function pathData(ops: readonly PathOp[], H: number): string {
  const f = (n: number) => String(Math.round(n * 10000) / 10000)
  return ops
    .map((o) => (o[0] === 'Z' ? 'Z' : o[0] === 'C' ? `C${f(o[1])} ${f(H - o[2])} ${f(o[3])} ${f(H - o[4])} ${f(o[5])} ${f(H - o[6])}` : `${o[0]}${f(o[1])} ${f(H - o[2])}`))
    .join('')
}

/** minW = one screen pixel in paper inches (thin lines never drawn fainter than a pixel); soft = softer colors. */
function Step({ s, H, thumbs, minW, soft }: { s: DrawStep; H: number; thumbs: ReadonlyMap<string, string>; minW: number; soft: boolean }) {
  if (s.kind === 'path') {
    // Inline styles: the drawing view's CSS (theme colors, hairlines that keep their screen width) must not apply here.
    return <path d={pathData(s.ops, H)} style={{ fill: 'none', stroke: printCss(s.style.color, soft), strokeWidth: Math.max(s.style.weight, minW), strokeOpacity: s.style.opacity, vectorEffect: 'none' }} />
  }
  if (s.kind === 'text') {
    const p = s.prim
    const g = textGeometry(p)
    const x = g.start[0]
    const y = H - g.start[1]
    return (
      <text x={x} y={y} fontSize={g.size} style={{ fill: printCss(p.style.color, soft) }} transform={p.rot ? `rotate(${-p.rot} ${x} ${y})` : undefined}>
        {p.text}
      </text>
    )
  }
  const p = s.prim
  const url = thumbs.get(p.scanId)
  if (!url) return null
  // The photo's bottom-left corner at (x, y), turned with the drawing; a seam piece shows its part of the photo.
  const at = `translate(${p.x} ${H - p.y}) rotate(${-p.rot})`
  if (!p.crop) return <image href={url} x={0} y={-p.h} width={p.w} height={p.h} preserveAspectRatio="none" transform={at} />
  const full = p.w / (p.crop[1] - p.crop[0])
  return (
    <g transform={at}>
      <svg x={0} y={-p.h} width={p.w} height={p.h} viewBox={`0 0 ${p.w} ${p.h}`} overflow="hidden">
        <image href={url} x={-p.crop[0] * full} width={full} height={p.h} preserveAspectRatio="none" />
      </svg>
    </g>
  )
}

export function SheetsView(props: { drawing: Drawing; plan: SectionPlan | null; project: Project; hidden: ReadonlySet<LayerGroup>; thumbs: ReadonlyMap<string, string> }) {
  const { plan, project: p, drawing, hidden } = props
  const pages = useMemo(() => sheetModels(p, drawing, plan, { hidden }), [p, drawing, plan, hidden])
  const [i, setI] = useState(0)
  const page = pages[Math.min(i, pages.length - 1)]
  // Zoom and pan (paper inches): wheel zooms about the pointer, drag pans, Fit shows the whole sheet.
  const [zoomed, setBox] = useState<Box | null>(null)
  const box = zoomed ?? fullBox(page)
  const svg = useRef<SVGSVGElement>(null)
  // The sheet's size on screen, for the one-pixel minimum line width.
  const [screen, setScreen] = useState({ w: 800, h: 600 })
  useEffect(() => {
    const el = svg.current
    if (!el) return
    const ro = new ResizeObserver(() => setScreen({ w: el.clientWidth || 800, h: el.clientHeight || 600 }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const minW = 1 / Math.min(screen.w / box.w, screen.h / box.h)
  const drag = useRef<{ x: number; y: number; box: Box } | null>(null)
  const go = (n: number) => {
    setI(n)
    setBox(null)
  }
  /** Screen point -> sheet SVG point. */
  const at = (clientX: number, clientY: number): [number, number] => {
    const r = svg.current!.getBoundingClientRect()
    const k = Math.max(box.w / r.width, box.h / r.height)
    return [box.x + box.w / 2 + (clientX - r.left - r.width / 2) * k, box.y + box.h / 2 + (clientY - r.top - r.height / 2) * k]
  }
  const zoom = (f: number, cx = box.x + box.w / 2, cy = box.y + box.h / 2) => {
    const w = Math.min(fullBox(page).w * 2, Math.max(0.3, box.w / f))
    const h = (w * box.h) / box.w
    setBox({ x: cx - ((cx - box.x) * w) / box.w, y: cy - ((cy - box.y) * h) / box.h, w, h })
  }
  function onWheel(e: WheelEvent<SVGSVGElement>) {
    const [cx, cy] = at(e.clientX, e.clientY)
    zoom(e.deltaY < 0 ? 1.25 : 1 / 1.25, cx, cy)
  }
  function onPointerDown(e: PointerEvent<SVGSVGElement>) {
    drag.current = { x: e.clientX, y: e.clientY, box }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    const d = drag.current
    if (!d) return
    const r = svg.current!.getBoundingClientRect()
    const k = Math.max(d.box.w / r.width, d.box.h / r.height)
    setBox({ ...d.box, x: d.box.x - (e.clientX - d.x) * k, y: d.box.y - (e.clientY - d.y) * k })
  }
  const H = page.paper.h
  const sec = page.section
  const clipId = `sheet-clip-${i}`
  return (
    <div className="sheets">
      <div className="sheets-bar">
        <button type="button" className="btn btn-small" onClick={() => go(Math.max(0, i - 1))} disabled={i === 0}>
          Previous
        </button>
        <span>
          Sheet {i + 1} of {pages.length}: {sec ? `section ${sec.n} (${fmt(sec.start)} to ${fmt(sec.end)} in)` : page.kind === 'main' ? 'drawing' : 'overview'}
        </span>
        <button type="button" className="btn btn-small" onClick={() => go(Math.min(pages.length - 1, i + 1))} disabled={i >= pages.length - 1}>
          Next
        </button>
        <span className="button-row sheets-zoom">
          <button type="button" className="icon-btn" onClick={() => zoom(1.4)} aria-label="Zoom in on the sheet" title="Zoom in (or use the mouse wheel)">
            +
          </button>
          <button type="button" className="icon-btn" onClick={() => zoom(1 / 1.4)} aria-label="Zoom out of the sheet" title="Zoom out">
            −
          </button>
          <button type="button" className="btn btn-small" onClick={() => setBox(null)} title="Show the whole sheet">
            Fit
          </button>
        </span>
        <span className="muted sheets-note" title="As the PDF prints it. In CAD the section sheets use your template sheet's viewport, so the scale there can differ a little.">
          {p.settings.paperSize}, {page.paper.w > page.paper.h ? 'landscape' : 'portrait'}, scale 1:{fmt(1 / page.scale)}
        </span>
      </div>
      <svg
        ref={svg}
        className="drawing sheet sheet-model"
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Sheet ${i + 1}: ${page.title}`}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
      >
        <rect className="sheet-paper" x={0} y={0} width={page.paper.w} height={H} />
        {page.clip && (
          <defs>
            <clipPath id={clipId}>
              <rect x={page.clip.x} y={H - page.clip.y - page.clip.h} width={page.clip.w} height={page.clip.h} />
            </clipPath>
          </defs>
        )}
        <g clipPath={page.clip ? `url(#${clipId})` : undefined}>
          {drawSteps(page.drawing).map((s, k) => (
            <Step key={k} s={s} H={H} thumbs={props.thumbs} minW={minW} soft={page.soft} />
          ))}
        </g>
        <g>
          {drawSteps(page.sheet).map((s, k) => (
            <Step key={k} s={s} H={H} thumbs={props.thumbs} minW={minW} soft={page.soft} />
          ))}
        </g>
      </svg>
    </div>
  )
}

const fmt = (n: number) => String(Math.round(n * 10) / 10)
