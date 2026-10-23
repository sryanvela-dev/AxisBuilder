// Turns the engine's drawing (logical coordinates) into what the SVG preview draws: one path per item
// and layer for lines and rectangles, circles, texts placed and rotated like CAD, image rectangles, and
// the bounds for "fit to window". Pure, so it can be tested and memoized.

import { LAYER_COLOR, TRANSPARENT_LAYERS, groupOfLayer, type Drawing, type DrawingItem, type LayerGroup } from '../../engine/drawing.ts'
import { rotationOffset, toVisual, type Orientation } from '../../engine/transform.ts'

/** SVG matrix(a b c d 0 0) mapping logical (x, y) to SVG (x right, y down) for the orientation. */
export function svgMatrix(o: Orientation): [number, number, number, number] {
  if (o === 'Vertical') return [1, 0, 0, -1]
  if (o === 'Horizontal CCW') return [0, -1, -1, 0]
  return [0, 1, 1, 0]
}

/** Logical point -> SVG point. */
export function toSvg(o: Orientation, x: number, y: number): [number, number] {
  const [vx, vy] = toVisual(o, x, y)
  return [vx, -vy]
}

export interface RenderPath {
  layer: string
  group: LayerGroup
  color: number
  /** Path data in logical coordinates (drawn inside the orientation matrix). */
  d: string
  /** 1 = solid; hatch layers and the centerline get their transparency. */
  opacity: number
}

export interface RenderText {
  x: number
  y: number
  /** SVG rotation in degrees (clockwise, as SVG measures it). */
  rotate: number
  size: number
  anchor: 'middle' | 'start'
  text: string
  group: LayerGroup
  color: number
}

export interface RenderItem {
  key: string
  item: DrawingItem
  paths: RenderPath[]
  circles: { cx: number; cy: number; r: number; group: LayerGroup; color: number }[]
  texts: RenderText[]
  images: { x: number; y: number; w: number; h: number; scanId: string }[]
  /** Something to click: true for items with a row behind them. */
  selectable: boolean
}

export interface RenderModel {
  orientation: Orientation
  matrix: [number, number, number, number]
  items: RenderItem[]
  /** SVG-space bounds of everything: [minX, minY, maxX, maxY]. */
  bounds: [number, number, number, number]
  hatchOpacity: number
}

const n = (v: number) => Math.round(v * 1000) / 1000

/** CAD text height is the height of capital letters; a browser font's capitals are about 0.72 of its size. */
const CAP_HEIGHT = 0.72

const opacityOf = (transparency: number) => 1 - Math.min(90, Math.max(0, transparency)) / 100

export function buildRenderModel(d: Drawing): RenderModel {
  const o = d.orientation
  const hatchOpacity = opacityOf(d.hatchTransparency)
  const centerlineOpacity = opacityOf(d.centerlineTransparency)
  const colorOf = (layer: string) => d.layerColors[layer] ?? LAYER_COLOR[layer] ?? 7
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const grow = (x: number, y: number) => {
    const [sx, sy] = toSvg(o, x, y)
    if (sx < minX) minX = sx
    if (sx > maxX) maxX = sx
    if (sy < minY) minY = sy
    if (sy > maxY) maxY = sy
  }
  const items = d.items.map((item): RenderItem => {
    const byLayer = new Map<string, string[]>()
    const circles: RenderItem['circles'] = []
    const texts: RenderText[] = []
    const images: RenderItem['images'] = []
    const path = (layer: string, seg: string) => {
      const list = byLayer.get(layer)
      if (list) list.push(seg)
      else byLayer.set(layer, [seg])
    }
    for (const s of item.shapes) {
      switch (s.t) {
        case 'line':
          path(s.layer, `M${n(s.x1)} ${n(s.y1)}L${n(s.x2)} ${n(s.y2)}`)
          grow(s.x1, s.y1)
          grow(s.x2, s.y2)
          break
        case 'rect':
          path(s.layer, `M${n(s.x)} ${n(s.y)}h${n(s.w)}v${n(s.h)}h${n(-s.w)}Z`)
          grow(s.x, s.y)
          grow(s.x + s.w, s.y + s.h)
          break
        case 'circle':
          circles.push({ cx: s.cx, cy: s.cy, r: s.r, group: groupOfLayer(s.layer), color: colorOf(s.layer) })
          grow(s.cx - s.r, s.cy - s.r)
          grow(s.cx + s.r, s.cy + s.r)
          break
        case 'text': {
          const [x, y] = toSvg(o, s.x, s.y)
          texts.push({
            x, y, rotate: -(s.rot + rotationOffset(o)), size: s.h / CAP_HEIGHT, anchor: s.just === 'ML' ? 'start' : 'middle', text: s.text,
            group: groupOfLayer(s.layer), color: colorOf(s.layer),
          })
          grow(s.x, s.y)
          break
        }
        case 'image':
          images.push({ x: s.x, y: s.y, w: s.w, h: s.h, scanId: s.scanId })
          grow(s.x, s.y)
          grow(s.x + s.w, s.y + s.h)
          break
      }
    }
    const paths = [...byLayer].map(([layer, segs]) => ({
      layer, group: groupOfLayer(layer), color: colorOf(layer), d: segs.join(''),
      opacity: TRANSPARENT_LAYERS.includes(layer) ? hatchOpacity : layer === 'CENTERLINE' ? centerlineOpacity : 1,
    }))
    return { key: item.key, item, paths, circles, texts, images, selectable: item.source !== null }
  })
  if (!Number.isFinite(minX)) [minX, minY, maxX, maxY] = [0, 0, 100, 100]
  return {
    orientation: o,
    matrix: svgMatrix(o),
    items,
    bounds: [minX, minY, maxX, maxY],
    hatchOpacity,
  }
}
