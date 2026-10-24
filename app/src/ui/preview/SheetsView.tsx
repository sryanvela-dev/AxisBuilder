// The Sheets view of the preview: the section sheets as they will print (letter, landscape, on white paper),
// one at a time: the overview, then each section. Everything on a sheet comes from engine/sheets.ts
// (rulers, reference labels, title and legend panel, match lines, overview boxes); the drawing inside the
// viewport is the preview's own render model, so it shows what the drawing shows.

import { useState, type CSSProperties } from 'react'
import type { Project } from '../../data/schema.ts'
import { aciCss } from '../../engine/aci.ts'
import type { LayerGroup } from '../../engine/drawing.ts'
import { LETTER_AREA, type SectionPlan } from '../../engine/sections.ts'
import { PAPER_LAYER_COLOR, sheetPages, type PaperShape } from '../../engine/sheets.ts'
import { DrawingItemView } from './DrawingView.tsx'
import { toSvg, type RenderModel } from './renderModel.ts'

const PAPER = { w: 11, h: 8.5 } as const
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
        <button type="button" className="btn btn-small" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0}>
          Previous
        </button>
        <span>
          Sheet {i + 1} of {pages.length}: {sec ? `section ${sec.n} (${fmt(sec.start)} to ${fmt(sec.end)} in)` : 'overview'}
        </span>
        <button type="button" className="btn btn-small" onClick={() => setI(Math.min(pages.length - 1, i + 1))} disabled={i >= pages.length - 1}>
          Next
        </button>
      </div>
      <svg className="drawing sheet" viewBox={`0 0 ${PAPER.w} ${PAPER.h}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Sheet ${i + 1}: ${page.title}`}>
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
      <p className="muted sheets-note">
        Letter, landscape, a 10 x 7.5 in printable area, scale 1:{fmt(1 / vp.scale)}. In CAD the sheets use your template sheet's viewport, so
        the scale there can differ a little.
      </p>
    </div>
  )
}

const fmt = (n: number) => String(Math.round(n * 10) / 10)
