// The Sheets view of the preview: the section sheets as they will print (letter, landscape, on white paper),
// one at a time: the overview, then each section. Everything on a sheet comes from engine/sheets.ts
// (rulers, reference labels, title and legend panel, match lines, overview boxes); the drawing inside the
// viewport is the preview's own render model, so it shows what the drawing shows.

import { useRef, useState, type CSSProperties, type PointerEvent, type WheelEvent } from 'react'
import type { Project } from '../../data/schema.ts'
import { aciCss } from '../../engine/aci.ts'
import type { LayerGroup } from '../../engine/drawing.ts'
import { LETTER_AREA, type SectionPlan } from '../../engine/sections.ts'
import { PAPER_LAYER_COLOR, sheetPages, type PaperShape } from '../../engine/sheets.ts'
import { DrawingItemView } from './DrawingView.tsx'
import { toSvg, type RenderModel } from './renderModel.ts'

const PAPER = { w: 11, h: 8.5 } as const
type Box = { x: number; y: number; w: number; h: number }
/** The whole sheet, with a small margin. */
const FULL: Box = { x: -0.1, y: -0.1, w: PAPER.w + 0.2, h: PAPER.h + 0.2 }
/** The template viewport area on the sheet: half-inch margins. */
const AREA = { x: (PAPER.w - LETTER_AREA.w) / 2, y: (PAPER.h - LETTER_AREA.h) / 2 }
/** CAD text height is the capital height; a browser font's capitals are about 0.72 of its size. */
const CAP_HEIGHT = 0.72

/** Paper inches (y up from the area's bottom-left) -> sheet SVG (y down). */
const X = (x: number) => AREA.x + x
const Y = (y: number) => PAPER.h - AREA.y - y
const color = (layer: string) => ({ '--c': aciCss(PAPER_LAYER_COLOR[layer] ?? 7) }) as CSSProperties

function Shape({ s }: { s: PaperShape }) {
  if (s.t === 'line') return <line x1={X(s.x1)} y1={Y(s.y1)} x2={X(s.x2)} y2={Y(s.y2)} style={color(s.layer)} />
  if (s.t === 'rect') return <rect x={X(s.x)} y={Y(s.y + s.h)} width={s.w} height={s.h} style={color(s.layer)} />
  const x = X(s.x)
  const y = Y(s.y)
  return (
    <text x={x} y={y} fontSize={s.h / CAP_HEIGHT} textAnchor={s.just === 'ML' ? 'start' : 'middle'} transform={s.rot ? `rotate(${-s.rot} ${x} ${y})` : undefined} style={color(s.layer)}>
      {s.text}
    </text>
  )
}

export function SheetsView(props: { model: RenderModel; plan: SectionPlan; project: Project; hidden: ReadonlySet<LayerGroup>; thumbs: ReadonlyMap<string, string> }) {
  const { plan, project: p } = props
  const pages = sheetPages(p, plan)
  const [i, setI] = useState(0)
  // Zoom and pan (paper inches): wheel zooms about the pointer, drag pans, Fit shows the whole sheet.
  const [box, setBox] = useState<Box>(FULL)
  const svg = useRef<SVGSVGElement>(null)
  const drag = useRef<{ x: number; y: number; box: Box } | null>(null)
  const go = (n: number) => {
    setI(n)
    setBox(FULL)
  }
  /** Screen point -> sheet SVG point. */
  const at = (clientX: number, clientY: number): [number, number] => {
    const r = svg.current!.getBoundingClientRect()
    const k = Math.max(box.w / r.width, box.h / r.height)
    return [box.x + box.w / 2 + (clientX - r.left - r.width / 2) * k, box.y + box.h / 2 + (clientY - r.top - r.height / 2) * k]
  }
  const zoom = (f: number, cx = box.x + box.w / 2, cy = box.y + box.h / 2) => {
    const w = Math.min(FULL.w * 2, Math.max(0.3, box.w / f))
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
  const page = pages[Math.min(i, pages.length - 1)]
  if (!page) return <p className="preview-note">No section sheets: {plan.problems[0] ?? 'nothing to show.'}</p>
  const C = p.vessel.height!
  const { vp } = page
  // The viewport shows the shell from viewStart to viewEnd, all the way round, in the drawing's SVG coordinates.
  const o = p.vessel.orientation as Parameters<typeof toSvg>[0]
  const corners = [toSvg(o, 0, page.viewStart), toSvg(o, C, page.viewStart), toSvg(o, 0, page.viewEnd), toSvg(o, C, page.viewEnd)]
  const minX = Math.min(...corners.map((c) => c[0]))
  const minY = Math.min(...corners.map((c) => c[1]))
  const maxX = Math.max(...corners.map((c) => c[0]))
  const maxY = Math.max(...corners.map((c) => c[1]))
  const [a, b, c, d] = props.model.matrix
  const sec = page.section
  return (
    <div className="sheets">
      <div className="sheets-bar">
        <button type="button" className="btn btn-small" onClick={() => go(Math.max(0, i - 1))} disabled={i === 0}>
          Previous
        </button>
        <span>
          Sheet {i + 1} of {pages.length}: {sec ? `section ${sec.n} (${fmt(sec.start)} to ${fmt(sec.end)} in)` : 'overview'}
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
          <button type="button" className="btn btn-small" onClick={() => setBox(FULL)} title="Show the whole sheet">
            Fit
          </button>
        </span>
        <span className="muted sheets-note" title="In CAD the sheets use your template sheet's viewport, so the scale there can differ a little.">
          Letter, landscape, scale 1:{fmt(1 / vp.scale)}
        </span>
      </div>
      <svg
        ref={svg}
        className="drawing sheet"
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Sheet ${i + 1}: ${page.title}`}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
      >
        <rect className="sheet-paper" x={0} y={0} width={PAPER.w} height={PAPER.h} />
        <svg x={X(vp.left)} y={Y(vp.bottom + vp.h)} width={vp.w} height={vp.h} viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} preserveAspectRatio="none" overflow="hidden">
          {props.model.items
            .filter((it) => !it.key.startsWith('section:'))
            .map((it) => (
              <DrawingItemView key={it.key} it={it} matrix={`matrix(${a} ${b} ${c} ${d} 0 0)`} hidden={props.hidden} highlight={null} selected={false}
                thumbs={props.thumbs} hatchOpacity={props.model.hatchOpacity} />
            ))}
        </svg>
        <rect className="sheet-viewport" x={X(vp.left)} y={Y(vp.bottom + vp.h)} width={vp.w} height={vp.h} />
        <g className="sheet-paper-space">
          {page.shapes.map((s, k) => (
            <Shape key={k} s={s} />
          ))}
        </g>
      </svg>
    </div>
  )
}

const fmt = (n: number) => String(Math.round(n * 10) / 10)
