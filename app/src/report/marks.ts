// Picture marks (format 8) as vector items on the page: the PDF writer and the Pages view both draw a picture's marks
// from here, over the picture and clipped to it. Sizes in the style (line width, text size) are points at print size,
// so a label looks the same on every photo whatever its resolution or crop. Redactions are not drawn: they must remove
// the pixels in the PDF (R5); Review says so.

import { fontBox, measure } from './fonts.ts'
import { ellipsePath, imagePoint, rectPath, type ImageItem, type PageItem, type PathCmd, type Rect } from './pageModel.ts'
import type { Mark, MarkStyle } from './schema.ts'

const PT = 1 / 72

function boxOf(img: ImageItem, b: { x0: number; y0: number; x1: number; y1: number }): Rect {
  const a = imagePoint(img, [b.x0, b.y0])
  const c = imagePoint(img, [b.x1, b.y1])
  return { x: Math.min(a[0], c[0]), y: Math.min(a[1], c[1]), w: Math.abs(c[0] - a[0]), h: Math.abs(c[1] - a[1]) }
}

interface PathOpts {
  stroke?: boolean
  fill?: boolean
  width?: number
  /** A solid fill of this colour (arrowheads, dots, label boxes). */
  fillColor?: string | null
}

function path(d: PathCmd[], s: MarkStyle, o: PathOpts = {}): PageItem {
  const solid = o.fillColor !== undefined
  return {
    t: 'path', d,
    stroke: o.stroke === false ? null : s.stroke,
    fill: o.fill === false ? null : solid ? o.fillColor! : s.fill,
    width: o.width ?? s.width,
    opacity: s.opacity,
    fillOpacity: solid ? 1 : s.fillOpacity,
    cap: s.ends === 'flat' ? 'butt' : 'round',
  }
}

/** Filled triangle at `to`, pointing away from `from`. */
function arrowHead(from: [number, number], to: [number, number], s: MarkStyle): PageItem {
  const len = Math.max(0.09, s.width * PT * 4.5)
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const d = Math.hypot(dx, dy) || 1
  const ux = dx / d
  const uy = dy / d
  const bx = to[0] - ux * len
  const by = to[1] - uy * len
  const half = len * 0.45
  return path([['M', to[0], to[1]], ['L', bx - uy * half, by + ux * half], ['L', bx + uy * half, by - ux * half], ['Z']], s, { width: 0.1, fillColor: s.stroke })
}

function dot(at: [number, number], s: MarkStyle): PageItem {
  const r = Math.max(0.03, s.width * PT * 1.6)
  return path(ellipsePath({ x: at[0] - r, y: at[1] - r, w: 2 * r, h: 2 * r }), s, { stroke: false, fillColor: s.stroke })
}

const polyline = (pts: [number, number][]): PathCmd[] => pts.map((p, i): PathCmd => (i === 0 ? ['M', p[0], p[1]] : ['L', p[0], p[1]]))

/** The page items of one mark (none for a redaction). */
export function markItemsOf(img: ImageItem, m: Mark): PageItem[] {
  const s = m.style
  const P = (q: readonly [number, number]) => imagePoint(img, q)
  switch (m.kind) {
    case 'rect':
      return [path(rectPath(boxOf(img, m.box)), s)]
    case 'ellipse':
      return [path(ellipsePath(boxOf(img, m.box)), s)]
    case 'highlight':
      return [path(polyline((m.straight ? [m.points[0], m.points[m.points.length - 1]] : m.points).map(P)), s, { fill: false })]
    case 'pen':
      return [path(polyline(m.points.map(P)), s, { fill: false })]
    case 'line':
      return [path(polyline([P(m.from), P(m.to)]), s, { fill: false })]
    case 'arrow': {
      const a = P(m.from)
      const b = P(m.to)
      return [path(polyline([a, b]), s, { fill: false }), arrowHead(a, b, s)]
    }
    case 'label': {
      const size = s.textSize
      const font = 'roboto-500' as const
      const w = measure(m.text, font, size) + (m.callout === 'plain' ? 0.04 : 0.14)
      const h = (size * 1.5) / 72
      const [cx, cy] = P(m.at)
      const box = { x: cx - w / 2, y: cy - h / 2, w, h }
      const out: PageItem[] = []
      if (m.leader) {
        const end = P(m.leader)
        const start: [number, number] = [Math.max(box.x, Math.min(end[0], box.x + box.w)), Math.max(box.y, Math.min(end[1], box.y + box.h))]
        out.push(path(polyline([start, end]), s, { fill: false }))
        if (m.leaderEnd === 'arrow') out.push(arrowHead(start, end, s))
        if (m.leaderEnd === 'dot') out.push(dot(end, s))
      }
      if (m.callout !== 'plain') {
        const radius = m.callout === 'pill' ? h / 2 : m.callout === 'rounded' ? h * 0.25 : 0
        out.push({ ...(path(rectPath(box, radius), s, { width: 0.75, fillColor: s.fill ?? s.stroke }) as Extract<PageItem, { t: 'path' }>), fillOpacity: 0.92 })
      }
      out.push({ t: 'text', x: cx, y: cy + fontBox(font, size).cap / 2, text: m.text, font, size, color: s.textColor, align: 'center' })
      return out
    }
    case 'badge': {
      const size = s.textSize
      const r = (size * 0.95) / 72
      const [cx, cy] = P(m.at)
      return [
        path(ellipsePath({ x: cx - r, y: cy - r, w: 2 * r, h: 2 * r }), s, { width: 0.75, fillColor: s.fill ?? s.stroke }),
        { t: 'text', x: cx, y: cy + fontBox('roboto-700', size).cap / 2, text: String(m.n), font: 'roboto-700', size, color: s.textColor, align: 'center' },
      ]
    }
    case 'redaction':
      return []
  }
}

/** Every drawn mark of a picture, lowest z first. */
export function markItems(img: ImageItem): PageItem[] {
  return [...img.marks].sort((a, b) => a.z - b.z).flatMap((m) => markItemsOf(img, m))
}
