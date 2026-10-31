// The Pages view (report design 5): every report page in order, as the PDF prints it (drawn from the same page model),
// with its page number, zoom (wheel, + / −), pan (drag), previous / next and Fit, full size (Escape closes). Clicking a
// page goes to the report step that fills it. Beside each report step, the pages panel shows the pages that step
// affects; clicking one opens it here.

import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import type { ReportDocument } from '../../report/pageModel.ts'
import { reportStepInfo } from '../../state/reportSteps.ts'
import type { ReportStepId } from '../../state/session.ts'
import { PreviewSplitter } from '../preview/PreviewSplitter.tsx'
import { PageSvg } from './PageSvg.tsx'
import { addReportFonts } from './reportFonts.ts'
import type { ReadPicture } from './reportFiles.ts'

type Box = { x: number; y: number; w: number; h: number }

interface ViewProps {
  doc: ReportDocument
  pictures: ReadonlyMap<string, ReadPicture | null>
  sheetThumbs: ReadonlyMap<string, string>
}

export function PagesView({ doc, pictures, sheetThumbs, start, onClose, onGo }: ViewProps & { start: number; onClose: () => void; onGo: (step: ReportStepId) => void }) {
  const [i, setI] = useState(Math.min(start, doc.pages.length - 1))
  const page = doc.pages[Math.min(i, doc.pages.length - 1)]
  const full = (): Box => ({ x: -0.15, y: -0.15, w: page.size.w + 0.3, h: page.size.h + 0.3 })
  const [zoomed, setBox] = useState<Box | null>(null)
  const box = zoomed ?? full()
  const svg = useRef<SVGSVGElement>(null)
  const drag = useRef<{ x: number; y: number; box: Box; moved: boolean } | null>(null)
  const [screen, setScreen] = useState({ w: 1000, h: 800 })
  useEffect(() => addReportFonts(), [])
  useEffect(() => {
    const el = svg.current
    if (!el) return
    const ro = new ResizeObserver(() => setScreen({ w: el.clientWidth || 1000, h: el.clientHeight || 800 }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const go = (n: number) => {
    setI(Math.max(0, Math.min(doc.pages.length - 1, n)))
    setBox(null)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'PageDown' || (e.key === 'ArrowRight' && !zoomed)) go(i + 1)
      else if (e.key === 'PageUp' || (e.key === 'ArrowLeft' && !zoomed)) go(i - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const at = (cx: number, cy: number): [number, number] => {
    const r = svg.current!.getBoundingClientRect()
    const k = Math.max(box.w / r.width, box.h / r.height)
    return [box.x + box.w / 2 + (cx - r.left - r.width / 2) * k, box.y + box.h / 2 + (cy - r.top - r.height / 2) * k]
  }
  const zoom = (factor: number, cx = box.x + box.w / 2, cy = box.y + box.h / 2) => {
    const w = Math.min(full().w * 2, Math.max(0.4, box.w / factor))
    const h = (w * box.h) / box.w
    setBox({ x: cx - ((cx - box.x) * w) / box.w, y: cy - ((cy - box.y) * h) / box.h, w, h })
  }
  function onWheel(e: WheelEvent<SVGSVGElement>) {
    const [cx, cy] = at(e.clientX, e.clientY)
    zoom(e.deltaY < 0 ? 1.25 : 1 / 1.25, cx, cy)
  }
  function onPointerDown(e: PointerEvent<SVGSVGElement>) {
    drag.current = { x: e.clientX, y: e.clientY, box, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    const d = drag.current
    if (!d) return
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) d.moved = true
    if (!d.moved) return
    const r = svg.current!.getBoundingClientRect()
    const k = Math.max(d.box.w / r.width, d.box.h / r.height)
    setBox({ ...d.box, x: d.box.x - (e.clientX - d.x) * k, y: d.box.y - (e.clientY - d.y) * k })
  }
  function onPointerUp() {
    const d = drag.current
    drag.current = null
    // A click (no drag) on the page goes to the step that fills it.
    if (d && !d.moved) onGo(page.step)
  }
  const minW = Math.max(box.w / screen.w, box.h / screen.h)
  return (
    <div className="pages-full" role="dialog" aria-label="Report pages">
      <div className="sheets-bar">
        <button type="button" className="btn btn-small" onClick={() => go(i - 1)} disabled={i === 0}>
          Previous
        </button>
        <button type="button" className="btn btn-small" onClick={() => go(i + 1)} disabled={i >= doc.pages.length - 1}>
          Next
        </button>
        <span>
          Page {i + 1} of {doc.pages.length}: {page.label}
        </span>
        <span className="button-row sheets-zoom">
          <button type="button" className="icon-btn" onClick={() => zoom(1.4)} aria-label="Zoom in on the page" title="Zoom in (or use the mouse wheel)">
            +
          </button>
          <button type="button" className="icon-btn" onClick={() => zoom(1 / 1.4)} aria-label="Zoom out of the page" title="Zoom out">
            −
          </button>
          <button type="button" className="btn btn-small" onClick={() => setBox(null)} title="Show the whole page">
            Fit
          </button>
          <button type="button" className="btn btn-small" onClick={() => onGo(page.step)} title="Go to the step that fills this page">
            Go to {reportStepInfo(page.step).title}
          </button>
          <button type="button" className="btn btn-small" onClick={onClose} title="Close (Escape)">
            Close
          </button>
        </span>
      </div>
      <PageSvg
        svgRef={svg}
        className="report-page-full"
        page={page}
        pictures={pictures}
        sheetThumbs={sheetThumbs}
        minW={minW}
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
        label={`Page ${i + 1}: ${page.label}. Click to go to ${reportStepInfo(page.step).title}.`}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
    </div>
  )
}

const OPEN_KEY = 'axisbuilder:reportPagesOpen'
function loadOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== '0'
  } catch {
    return true
  }
}

/** The pages panel beside a report step: the pages that step fills (all of them on Review and Export). */
export function PagesPanel({ doc, pictures, sheetThumbs, step, onGo, loading }: ViewProps & { step: ReportStepId; onGo: (step: ReportStepId) => void; loading: boolean }) {
  const [open, setOpenState] = useState(loadOpen)
  const [full, setFull] = useState<number | null>(null)
  useEffect(() => addReportFonts(), [])
  const setOpen = (v: boolean) => {
    setOpenState(v)
    try {
      localStorage.setItem(OPEN_KEY, v ? '1' : '0')
    } catch {
      // storage blocked: kept until the page closes
    }
  }
  if (!open) {
    return (
      <aside className="preview preview-closed" aria-label="Report pages">
        <button type="button" className="btn preview-open-btn" onClick={() => setOpen(true)} title="Show the report pages">
          Pages
        </button>
      </aside>
    )
  }
  const all = step === 'reportReview' || step === 'reportExport'
  const shown = doc.pages.map((p, n) => ({ p, n })).filter(({ p }) => all || p.step === step)
  return (
    <aside className="preview pages-panel" aria-label="Report pages">
      <PreviewSplitter />
      <div className="preview-head">
        <strong>Report pages</strong>
        <span className="muted">
          {all ? `${doc.pages.length} pages` : `${shown.length} of ${doc.pages.length} pages from this step`}
          {loading ? ', reading pictures...' : ''}
        </span>
        <span className="button-row">
          <button type="button" className="btn btn-small" onClick={() => setFull(shown[0]?.n ?? 0)} title="Every page full size, as the PDF prints it">
            All pages
          </button>
          <button type="button" className="btn btn-small" onClick={() => setOpen(false)} title="Hide the pages">
            Hide
          </button>
        </span>
      </div>
      <div className="pages-list">
        {shown.length === 0 && <p className="muted pages-empty">Nothing from this step is in the report yet.</p>}
        {shown.map(({ p, n }) => (
          <button key={n} type="button" className="page-thumb" onClick={() => setFull(n)} title={`Open page ${n + 1} full size`}>
            <PageSvg page={p} pictures={pictures} sheetThumbs={sheetThumbs} minW={0.02} />
            <span className="page-thumb-label">
              Page {n + 1} · {p.label}
            </span>
          </button>
        ))}
      </div>
      {full !== null && (
        <PagesView doc={doc} pictures={pictures} sheetThumbs={sheetThumbs} start={full} onClose={() => setFull(null)} onGo={(s) => {
          setFull(null)
          onGo(s)
        }} />
      )}
    </aside>
  )
}
