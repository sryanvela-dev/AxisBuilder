// Picture marks as vector items on the page: the PDF writer, the Pages view and the markup editor all draw a picture's
// marks from here, over the picture and clipped to it, so what the editor shows is what prints. Sizes in the style
// (line width, text size) are points at print size, so a label looks the same on every photo whatever its resolution
// or crop. Redactions are not drawn here: they remove the pixels of the picture itself (report/imageProcess.ts).
//
// Geometry (box turn, label box, leader start, smooth strokes) comes from report/markGeometry.ts, so the editor's hit
// tests and handles use exactly the shapes drawn here.

import {
  badgeRadius, boxCorners, boxPoint, boxToView, labelBaselines, labelLines, labelRadius, labelRect, leaderStart, markFont, smoothCurve, toView,
  type MarkFrame, type Pt,
} from './markGeometry.ts'
import { fontBox } from './fonts.ts'
import { rectPath, type PageItem, type PathCmd, type PathItem } from './pageModel.ts'
import type { Mark, MarkStyle } from './schema.ts'

const PT = 1 / 72

/** Near-black or white, whichever stands out against a colour (outlines and halos that read on any photo). */
export function contrastOf(hex: string): string {
  const c = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!c) return '#ffffff'
  const n = parseInt(c[1], 16)
  const lin = (v: number) => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  }
  const l = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  return l > 0.36 ? '#1a1a1a' : '#ffffff'
}

interface PathOpts {
  stroke?: string | null
  fill?: string | null
  width?: number
  opacity?: number
  fillOpacity?: number
  cap?: 'round' | 'butt'
  blend?: 'multiply'
}

function path(d: PathCmd[], s: MarkStyle, o: PathOpts = {}): PathItem {
  return {
    t: 'path', d,
    stroke: o.stroke === undefined ? s.stroke : o.stroke,
    fill: o.fill === undefined ? s.fill : o.fill,
    width: o.width ?? s.width,
    opacity: o.opacity ?? s.opacity,
    fillOpacity: o.fillOpacity ?? s.fillOpacity,
    cap: o.cap ?? (s.ends === 'flat' ? 'butt' : 'round'),
    ...(o.blend ? { blend: o.blend } : {}),
  }
}

const polyline = (pts: readonly Pt[]): PathCmd[] => pts.map((p, i): PathCmd => (i === 0 ? ['M', p[0], p[1]] : ['L', p[0], p[1]]))
const polygon = (pts: readonly Pt[]): PathCmd[] => [...polyline(pts), ['Z']]

/** A smooth curve through the points (freehand pen and highlighter). */
function curve(pts: readonly Pt[]): PathCmd[] {
  if (pts.length < 3) return polyline(pts)
  const segs = smoothCurve(pts)
  return [['M', pts[0][0], pts[0][1]], ...segs.map(([, a, b, e]): PathCmd => ['C', a[0], a[1], b[0], b[1], e[0], e[1]])]
}

const circle = (c: Pt, r: number): PathCmd[] => {
  const k = r * 0.5523
  const [x, y] = c
  return [['M', x + r, y], ['C', x + r, y + k, x + k, y + r, x, y + r], ['C', x - k, y + r, x - r, y + k, x - r, y], ['C', x - r, y - k, x - k, y - r, x, y - r], ['C', x + k, y - r, x + r, y - k, x + r, y], ['Z']]
}

/** Length of an arrowhead, inches, from the line width (as the drawing's leaders: about 4.5 widths, at least 0.09 in). */
export const arrowLength = (s: Pick<MarkStyle, 'width'>) => Math.max(0.09, s.width * PT * 4.5)

/** The end of a line: closed (filled triangle), open (two strokes), dot, or none. Returns the items and where the line should stop. */
function lineEnd(from: Pt, to: Pt, s: MarkStyle, kind: 'closed' | 'open' | 'dot' | 'none' | 'arrow'): { items: PageItem[]; stop: Pt } {
  if (kind === 'none') return { items: [], stop: to }
  if (kind === 'dot') {
    const r = Math.max(0.03, s.width * PT * 1.6)
    return { items: [path(circle(to, r), s, { stroke: null, fill: s.stroke, fillOpacity: 1 })], stop: to }
  }
  const len = arrowLength(s)
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const d = Math.hypot(dx, dy) || 1
  const ux = dx / d
  const uy = dy / d
  const bx = to[0] - ux * Math.min(len, d)
  const by = to[1] - uy * Math.min(len, d)
  const half = len * 0.45
  const left: Pt = [bx - uy * half, by + ux * half]
  const right: Pt = [bx + uy * half, by - ux * half]
  if (kind === 'open') return { items: [path(polyline([left, to, right]), s, { fill: null, cap: 'round' })], stop: to }
  // Closed: the line stops inside the head so a flat end never shows past the point.
  return { items: [path(polygon([to, left, right]), s, { width: 0.1, fill: s.stroke, fillOpacity: 1 })], stop: [bx + ux * 0.2 * len, by + uy * 0.2 * len] }
}

/** The page items of one mark (none for a redaction). `f` = where the picture's visible part is on the page. */
export function markItemsOf(f: MarkFrame, m: Mark): PageItem[] {
  const s = m.style
  const P = (q: readonly [number, number]) => toView(f, q)
  switch (m.kind) {
    case 'rect': {
      const g = boxToView(f, m.box, m.angle)
      return [path(polygon(boxCorners(g)), s)]
    }
    case 'ellipse': {
      const g = boxToView(f, m.box, m.angle)
      const rx = g.w / 2
      const ry = g.h / 2
      const kx = rx * 0.5523
      const ky = ry * 0.5523
      const L = (x: number, y: number) => boxPoint(g, [x, y])
      const c = (a: Pt, b: Pt, e: Pt): PathCmd => ['C', a[0], a[1], b[0], b[1], e[0], e[1]]
      const start = L(rx, 0)
      return [path([
        ['M', start[0], start[1]],
        c(L(rx, ky), L(kx, ry), L(0, ry)), c(L(-kx, ry), L(-rx, ky), L(-rx, 0)),
        c(L(-rx, -ky), L(-kx, -ry), L(0, -ry)), c(L(kx, -ry), L(rx, -ky), L(rx, 0)), ['Z'],
      ], s)]
    }
    case 'highlight': {
      const pts = (m.straight ? [m.points[0], m.points[m.points.length - 1]] : m.points).map(P)
      // Drawn see-through and multiplied, like a marker on paper: the picture shows through, darker where it is dark.
      return [path(m.straight ? polyline(pts) : curve(pts), s, { fill: null, blend: 'multiply' })]
    }
    case 'pen':
      return [path(curve(m.points.map(P)), s, { fill: null })]
    case 'line':
      return [path(polyline([P(m.from), P(m.to)]), s, { fill: null })]
    case 'arrow': {
      const a = P(m.from)
      const b = P(m.to)
      const end = lineEnd(a, b, s, m.head)
      return [path(polyline([a, end.stop]), s, { fill: null }), ...end.items]
    }
    case 'label':
      return labelItems(f, m)
    case 'badge': {
      const c = P(m.at)
      const r = badgeRadius(s)
      const fillColor = s.fill ?? s.stroke ?? '#d62828'
      const font = markFont({ ...s, bold: true })
      const out: PageItem[] = [path(circle(c, r), s, {
        fill: fillColor, fillOpacity: s.bgOpacity, stroke: s.halo ? contrastOf(fillColor) : null, width: 0.9, opacity: s.opacity,
      })]
      const size = s.textSize * 0.95
      out.push({ t: 'text', x: c[0], y: c[1] + fontBox(font, size).cap / 2, text: String(m.n), font, size, color: s.textColor, align: 'center' })
      return out
    }
    case 'redaction':
      return []
  }
}

function labelItems(f: MarkFrame, m: Extract<Mark, { kind: 'label' }>): PageItem[] {
  const s = m.style
  const box = labelRect(f, m)
  const radius = labelRadius(m, box)
  const fillColor = s.fill ?? s.stroke ?? '#d62828'
  const out: PageItem[] = []
  if (m.leader) {
    const end = toView(f, m.leader)
    const start = leaderStart(box, radius, end)
    if (start) {
      const color = s.stroke ?? fillColor
      const ls = { ...s, stroke: color }
      const tip = lineEnd(start, end, ls, m.leaderEnd)
      // A thin halo under the leader keeps it visible on dark and light parts of the photo alike.
      if (s.halo) out.push(path(polyline([start, tip.stop]), ls, { stroke: contrastOf(color), width: s.width + 1.2, fill: null, opacity: s.opacity * 0.7, cap: 'round' }))
      out.push(path(polyline([start, tip.stop]), ls, { fill: null }), ...tip.items)
    }
  }
  if (m.callout !== 'plain') {
    out.push(path(rectPath(box, radius), s, {
      fill: fillColor, fillOpacity: s.bgOpacity,
      stroke: s.halo ? contrastOf(fillColor) : (s.stroke !== fillColor ? s.stroke : null), width: 0.75, cap: 'round',
    }))
  }
  const font = markFont(s)
  const halo = m.callout === 'plain' && s.halo ? { color: contrastOf(s.textColor), width: Math.max(1, s.textSize * 0.22) } : undefined
  labelLines(m.text).forEach((line, i) => {
    out.push({ t: 'text', x: box.x + box.w / 2, y: labelBaselines(m, box)[i], text: line, font, size: s.textSize, color: s.textColor, align: 'center', ...(halo ? { halo } : {}) })
  })
  return out
}

/** Every drawn mark of a picture, lowest z first. */
export function markItems(f: MarkFrame & { marks: readonly Mark[] }): PageItem[] {
  return [...f.marks].sort((a, b) => a.z - b.z).flatMap((m) => markItemsOf(f, m))
}
