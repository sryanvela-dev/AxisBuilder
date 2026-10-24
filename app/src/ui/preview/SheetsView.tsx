// The Sheets view of the preview: the section sheets as they will print (letter, landscape), one at a time:
// the overview with a numbered box per section, then each section with its match lines and "SECTION n OF N".
// The geometry is engine/sections.ts (SECTIONPAGES' layout); the drawing is the preview's own render model.

import { useState } from 'react'
import type { Project } from '../../data/schema.ts'
import { LETTER_AREA, paperX, sheetViewport, type Section, type SectionPlan } from '../../engine/sections.ts'
import type { LayerGroup } from '../../engine/drawing.ts'
import { DrawingItemView } from './DrawingView.tsx'
import { toSvg, type RenderModel } from './renderModel.ts'

const PAPER = { w: 11, h: 8.5 } as const
/** The template viewport area on the sheet: half-inch margins. */
const AREA = { x: (PAPER.w - LETTER_AREA.w) / 2, y: (PAPER.h - LETTER_AREA.h) / 2 }

interface Page {
  kind: 'overview' | 'section'
  section?: Section
}

export function SheetsView(props: { model: RenderModel; plan: SectionPlan; project: Project; hidden: ReadonlySet<LayerGroup>; thumbs: ReadonlyMap<string, string> }) {
  const { plan, project: p } = props
  const pages: Page[] = [...(plan.overview ? [{ kind: 'overview' as const }] : []), ...plan.sections.map((section) => ({ kind: 'section' as const, section }))]
  const [i, setI] = useState(0)
  const page = pages[Math.min(i, pages.length - 1)]
  if (!page) return <p className="preview-note">No section sheets: {plan.problems[0] ?? 'nothing to show.'}</p>
  const L = p.vessel.length!
  const C = p.vessel.height!
  const N = plan.sections.length
  const [vs, ve] = page.kind === 'overview' ? [0, L] : [page.section!.viewStart, page.section!.viewEnd]
  const vp = sheetViewport(ve - vs, C)
  // Paper (inches, y up from the area's bottom-left) -> sheet SVG (y down).
  const X = (x: number) => AREA.x + x
  const Y = (y: number) => PAPER.h - AREA.y - y
  const vpX = X(vp.left)
  const vpY = Y(vp.bottom + vp.h)
  // The model view: the shell from vs to ve, all the way round, in the drawing's SVG coordinates.
  const o = p.vessel.orientation as Parameters<typeof toSvg>[0]
  const corners = [toSvg(o, 0, vs), toSvg(o, C, vs), toSvg(o, 0, ve), toSvg(o, C, ve)]
  const minX = Math.min(...corners.map((c) => c[0]))
  const minY = Math.min(...corners.map((c) => c[1]))
  const maxX = Math.max(...corners.map((c) => c[0]))
  const maxY = Math.max(...corners.map((c) => c[1]))
  const [a, b, c, d] = props.model.matrix
  const u = LETTER_AREA.h / 7.5 // SECTIONPAGES' paper unit
  const line = (y: number) => vpX + paperX(y, vs, ve, vp.scale, p.vessel.orientation)
  const sec = page.section
  const title =
    page.kind === 'overview' ? 'OVERVIEW' : plan.numberInTitle ? `SECTION ${sec!.n} OF ${N}` : `SECTION ${sec!.n}`
  return (
    <div className="sheets">
      <div className="sheets-bar">
        <button type="button" className="btn btn-small" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0}>
          Previous
        </button>
        <span>
          Sheet {i + 1} of {pages.length}: {page.kind === 'overview' ? 'overview' : `section ${sec!.n} (${fmt(sec!.start)} to ${fmt(sec!.end)} in)`}
        </span>
        <button type="button" className="btn btn-small" onClick={() => setI(Math.min(pages.length - 1, i + 1))} disabled={i >= pages.length - 1}>
          Next
        </button>
      </div>
      <svg className="drawing sheet" viewBox={`0 0 ${PAPER.w} ${PAPER.h}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Sheet ${i + 1}: ${title}`}>
        <rect className="sheet-paper" x={0} y={0} width={PAPER.w} height={PAPER.h} />
        <rect className="sheet-area" x={AREA.x} y={AREA.y} width={LETTER_AREA.w} height={LETTER_AREA.h} />
        <svg x={vpX} y={vpY} width={vp.w} height={vp.h} viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} preserveAspectRatio="none" overflow="hidden">
          {props.model.items
            .filter((it) => !it.key.startsWith('section:'))
            .map((it) => (
              <DrawingItemView key={it.key} it={it} matrix={`matrix(${a} ${b} ${c} ${d} 0 0)`} hidden={props.hidden} highlight={null} selected={false}
                thumbs={props.thumbs} hatchOpacity={props.model.hatchOpacity} />
            ))}
        </svg>
        <rect className="sheet-viewport" x={vpX} y={vpY} width={vp.w} height={vp.h} />
        <text className="sheet-title" x={vpX + vp.w / 2} y={vpY - 0.22 * u} fontSize={0.18 * u} textAnchor="middle">
          {title}
        </text>
        {page.kind === 'overview' &&
          plan.sections.map((s) => {
            const x0 = Math.min(line(s.start), line(s.end))
            const x1 = Math.max(line(s.start), line(s.end))
            return (
              <g key={s.n} className="sheet-box">
                <rect x={x0} y={vpY} width={x1 - x0} height={vp.h} />
                <text x={(x0 + x1) / 2} y={vpY + 0.2 * u} fontSize={0.14 * u} textAnchor="middle">
                  {s.n}
                </text>
              </g>
            )
          })}
        {page.kind === 'section' &&
          plan.matchLines &&
          [
            { at: sec!.start, other: sec!.prev },
            { at: sec!.end, other: sec!.next },
          ]
            .filter((m) => m.other !== null)
            .map((m) => {
              const x = line(m.at)
              return (
                <g key={m.at} className="sheet-match">
                  <line x1={x} y1={vpY} x2={x} y2={vpY + vp.h} />
                  <text x={x} y={vpY + vp.h / 2} fontSize={0.1 * u} textAnchor="middle" transform={`rotate(-90 ${x} ${vpY + vp.h / 2}) translate(0 ${-0.08 * u})`}>
                    MATCH LINE - SEE SECTION {m.other}
                  </text>
                </g>
              )
            })}
        <text className="sheet-panel" x={X(LETTER_AREA.w * 0.865)} y={Y(vp.bottom + 2.55 * u)} fontSize={0.09 * u}>
          Title and legend
        </text>
      </svg>
      <p className="muted sheets-note">
        Letter, landscape, with a 10 x 7.5 in printable area. In CAD the sheets use your template sheet's viewport, so the scale there can
        differ a little.
      </p>
    </div>
  )
}

const fmt = (n: number) => String(Math.round(n * 1000) / 1000)
