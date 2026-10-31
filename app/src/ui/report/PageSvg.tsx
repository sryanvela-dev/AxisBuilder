// One report page drawn as SVG from the page model (report/pageModel.ts), the same model the PDF draws: text in the
// bundled brand fonts, rules, boxes, pictures (upright thumbnails, turned and cut as the PDF places them) with their
// marks, drawing sheets through the Sheets view's own drawing code, and uploaded PDF pages as pictures drawn by pdf.js
// (the PDF copies the page itself), with their marks. A picture with auto levels or redactions is drawn from its
// processed thumbnail (`processedKey`, made with the PDF's own pixel code); until that is ready, redactions show as
// solid boxes, never the pixels under them.

import { useId } from 'react'
import { drawSteps } from '../../engine/sheetModel.ts'
import { FONT_CSS } from '../../report/fonts.ts'
import { markItems } from '../../report/marks.ts'
import { imagePoint, rectPath, storedToPage, type ImageItem, type PageItem, type ReportPage } from '../../report/pageModel.ts'
import { pdfPageMarks } from '../../report/pdf/writeReportPdf.ts'
import { pathD, processedKey } from './svgPaths.ts'
import { Step } from '../preview/SheetsView.tsx'
import { refKey, type ReadPicture } from './reportFiles.ts'
import { pdfPageKey } from './useReportPages.ts'

const f = (n: number) => String(Math.round(n * 10000) / 10000)

/** Text, rules, boxes and paths (all a picture's marks are these), as SVG in page inches. */
export function BasicItem({ it }: { it: PageItem }) {
  switch (it.t) {
    case 'text': {
      const css = FONT_CSS[it.font]
      const halo = it.halo ? { stroke: it.halo.color, strokeWidth: it.halo.width / 72, strokeLinejoin: 'round' as const, paintOrder: 'stroke' } : {}
      return (
        <text x={it.x} y={it.y} fontFamily={`'${css.family}', Arial, sans-serif`} fontWeight={css.weight} fontSize={it.size / 72} fill={it.color}
          textAnchor={it.align === 'center' ? 'middle' : it.align === 'right' ? 'end' : 'start'} xmlSpace="preserve" {...halo}>
          {it.text}
        </text>
      )
    }
    case 'line':
      return <line x1={it.x1} y1={it.y1} x2={it.x2} y2={it.y2} stroke={it.color} strokeWidth={it.width / 72} />
    case 'rect':
      return <path d={pathD(rectPath(it, it.radius))} fill={it.fill ?? 'none'} stroke={it.stroke ?? 'none'} strokeWidth={it.width / 72} />
    case 'path':
      return (
        <path d={pathD(it.d)} fill={it.fill ?? 'none'} fillOpacity={it.fillOpacity} stroke={it.stroke ?? 'none'} strokeWidth={it.width / 72} opacity={it.opacity}
          strokeLinecap={it.cap === 'round' ? 'round' : 'butt'} strokeLinejoin="round" style={it.blend === 'multiply' ? { mixBlendMode: 'multiply' } : undefined} />
      )
    default:
      return null
  }
}

/** Solid stand-ins for redactions while the processed thumbnail is being made (never the pixels under them). */
function redactionBoxes(it: ImageItem) {
  return (it.redactions ?? []).map((r, k) => {
    const a = imagePoint(it, [r.box.x0, r.box.y0])
    const b = imagePoint(it, [r.box.x1, r.box.y1])
    return <rect key={`r${k}`} x={Math.min(a[0], b[0])} y={Math.min(a[1], b[1])} width={Math.abs(b[0] - a[0])} height={Math.abs(b[1] - a[1])} fill={r.mode === 'black' ? '#000' : '#8a8f96'} />
  })
}

interface Props {
  page: ReportPage
  pictures: ReadonlyMap<string, ReadPicture | null>
  /** The drawing's scan photo thumbnails by scan ID (overlay drawing). */
  sheetThumbs: ReadonlyMap<string, string>
  /** One screen pixel in page inches (drawing lines never thinner). */
  minW: number
}

function Item({ it, props, id }: { it: PageItem; props: Props; id: string }) {
  switch (it.t) {
    case 'text': case 'line': case 'rect': case 'path':
      return <BasicItem it={it} />
    case 'image': {
      const raw = props.pictures.get(refKey(it.ref))
      if (!raw) return <rect x={it.x} y={it.y} width={it.w} height={it.h} fill="#EEF0F3" stroke="#C9DAEA" strokeWidth={0.5 / 72} />
      const processed = it.autoLevels || it.redactions?.length ? props.pictures.get(processedKey(it.key)) : undefined
      const pic = processed ?? raw
      // The thumbnail is upright already: only the turn and the crop are left to place.
      const [a, b, c, d, e, g] = storedToPage(it, 1)
      return (
        <g clipPath={`url(#${id})`}>
          <defs>
            <clipPath id={id}>
              <rect x={it.x} y={it.y} width={it.w} height={it.h} />
            </clipPath>
          </defs>
          <image href={pic.thumb} x={0} y={0} width={1} height={1} preserveAspectRatio="none" transform={`matrix(${[a, b, c, d, e, g].map(f).join(' ')})`} />
          {!processed && redactionBoxes(it)}
          {/* Not isolated: the highlighter multiplies onto the picture under it. */}
          {markItems(it).map((m, k) => (
            <BasicItem key={k} it={m} />
          ))}
        </g>
      )
    }
    case 'sheet': {
      const { model: m, region, box } = it
      const k = box.w / region.w
      const H = m.paper.h
      return (
        <g clipPath={`url(#${id})`}>
          <defs>
            <clipPath id={id}>
              <rect x={box.x} y={box.y} width={box.w} height={box.h} />
            </clipPath>
            {m.clip && (
              <clipPath id={`${id}-c`}>
                <rect x={m.clip.x} y={H - m.clip.y - m.clip.h} width={m.clip.w} height={m.clip.h} />
              </clipPath>
            )}
          </defs>
          <g className="sheet-model" transform={`translate(${f(box.x - region.x * k)} ${f(box.y + (region.y + region.h - H) * k)}) scale(${f(k)})`}>
            <g clipPath={m.clip ? `url(#${id}-c)` : undefined}>
              {drawSteps(m.drawing).map((s, n) => (
                <Step key={n} s={s} H={H} thumbs={props.sheetThumbs} minW={props.minW / k} soft={m.soft} />
              ))}
            </g>
            {drawSteps(m.sheet).map((s, n) => (
              <Step key={`s${n}`} s={s} H={H} thumbs={props.sheetThumbs} minW={props.minW / k} soft={m.soft} />
            ))}
          </g>
        </g>
      )
    }
    case 'pdfPage': {
      const pic = props.pictures.get(pdfPageKey(it.file, it.page))
      if (pic) {
        // The picture is the page unturned; turn it about the box's centre so it fills the box.
        const turned = it.rotate === 90 || it.rotate === 270
        const w = turned ? it.box.h : it.box.w
        const h = turned ? it.box.w : it.box.h
        const cx = it.box.x + it.box.w / 2
        const cy = it.box.y + it.box.h / 2
        // Darken as the PDF does it: the page again on top, multiplied.
        return (
          <g style={{ isolation: 'isolate' }}>
            <g transform={it.rotate ? `rotate(${it.rotate} ${f(cx)} ${f(cy)})` : undefined} style={{ isolation: 'isolate' }}>
              {Array.from({ length: 1 + (it.darken ?? 0) }, (_, k) => (
                <image key={k} href={pic.thumb} x={cx - w / 2} y={cy - h / 2} width={w} height={h} preserveAspectRatio="none"
                  style={k > 0 ? { mixBlendMode: 'multiply' } : undefined} />
              ))}
            </g>
            <PdfMarks it={it} id={id} />
          </g>
        )
      }
      return (
        <g>
          <rect x={it.box.x} y={it.box.y} width={it.box.w} height={it.box.h} fill="#F6F8FA" stroke="#C9DAEA" strokeWidth={0.75 / 72} />
          <text x={it.box.x + it.box.w / 2} y={it.box.y + it.box.h / 2} fontSize={10 / 72} fill="#7A8594" textAnchor="middle" fontFamily="'AB Roboto', Arial, sans-serif">
            {`${it.file}, page ${it.page}`}
          </text>
          <PdfMarks it={it} id={id} />
        </g>
      )
    }
    default:
      return null
  }
}

export function PageSvg(props: Props & { className?: string; label?: string; viewBox?: string; svgRef?: React.Ref<SVGSVGElement> } & React.SVGProps<SVGSVGElement>) {
  const { page, pictures, sheetThumbs, minW, className, label, viewBox, svgRef, ...rest } = props
  const id = useId().replace(/:/g, '')
  return (
    <svg ref={svgRef} className={`report-page${className ? ` ${className}` : ''}`} viewBox={viewBox ?? `0 0 ${page.size.w} ${page.size.h}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={label ?? page.label} {...rest}>
      <rect className="report-paper" x={0} y={0} width={page.size.w} height={page.size.h} />
      {page.items.map((it, k) => (
        <Item key={k} it={it} props={{ page, pictures, sheetThumbs, minW }} id={`${id}-${k}`} />
      ))}
    </svg>
  )
}

/** The marks over an uploaded PDF page, clipped to it. */
function PdfMarks({ it, id }: { it: Extract<PageItem, { t: 'pdfPage' }>; id: string }) {
  const marks = pdfPageMarks(it)
  if (!marks.length) return null
  return (
    <g clipPath={`url(#${id}-m)`}>
      <defs>
        <clipPath id={`${id}-m`}>
          <rect x={it.box.x} y={it.box.y} width={it.box.w} height={it.box.h} />
        </clipPath>
      </defs>
      {marks.map((m, k) => (
        <BasicItem key={k} it={m} />
      ))}
    </g>
  )
}
