// The DXF of the drawing in model space (Phase 7a), written from the engine's drawing (engine/drawing.ts: every item
// in logical inches on its CAD layer, with wrapping, placed and moved labels, leaders, arrowheads and MUT areas), placed
// where the .lsp draws it: SL_tf_x / SL_tf_y turn logical (x, y) into CAD (x, y), the same as engine/transform.ts
// toVisual (Vertical (x, y), Horizontal CW (y, -x), Horizontal CCW (-y, x)), and texts and arcs turn by SL_rot (the
// orientation's rotation). The right panel is the engine's, which is the .lsp's (engine/layout.ts). Layers, colors,
// line weights and transparency as the .lsp sets them up (SL_SetupLayers plus the app's layers), photos as IMAGE
// entities linked relative to the DXF (the processed images in the job folder's Processed_Images). Pure: the caller
// passes the processed images' pixel sizes it found. See app/docs/dxf-export.md.

import type { Project } from '../../data/schema.ts'
import { LAYER_COLOR, TRANSPARENT_LAYERS, buildDrawing, groupOfLayer, type Drawing, type LayerGroup, type Shape } from '../../engine/drawing.ts'
import { drawnScans, imageInserts, type ImageInsert } from '../../engine/layout.ts'
import { hasMutAreas } from '../../engine/mutAreas.ts'
import { textGeometry } from '../../engine/sheetModel.ts'
import { appLayerSetup, lineWeights } from '../../engine/styles.ts'
import { rotationOffset, toVisual, type Orientation } from '../../engine/transform.ts'
import { processedFolderName } from '../images/process.ts'
import { nearestLineWeight, writeDxf, type DxfEntity, type DxfLayer, type Pt } from './dxfFile.ts'

/** SL_SetupLayers (and SL_SetupViewportLayers): the layers and colors every .lsp drawing starts with, in its order. */
export const SETUP_LAYERS: readonly [string, number][] = [
  ['VESSEL', 7], ['SCANS', 7], ['SCAN_IMAGES', 7], ['AUT_HATCH', 5], ['SUPPORTS', 6], ['NOZZLES', 7], ['X_AXIS', 1], ['Y_AXIS', 5],
  ['LEGEND', 7], ['LEGEND_SAMPLE', 7], ['LEGEND_AUT_HATCH', 5], ['LEGEND_MUT_HATCH', 3], ['MANUAL_UT_HATCH', 3], ['MUT_TEXT', 7],
  ['CIRC_WELDS', 7], ['LONG_SEAMS', 7], ['CENTERLINE', 7], ['TITLE_BLOCK', 7], ['HEADS', 7], ['SCAN_TEXT', 7], ['SUPPORT_TEXT', 7],
  ['SHELL_NOZZLE_TEXT', 7], ['HEAD_NOZZLE_TEXT', 7], ['SHELL_MUT_TEXT', 7], ['HEAD_MUT_TEXT', 7], ['X_RULER_TEXT', 1], ['Y_RULER_TEXT', 5],
  ['LEGEND_TEXT', 7], ['CIRC_WELD_TEXT', 7], ['LONG_SEAM_TEXT', 7], ['TITLE_BLOCK_TEXT', 7], ['HEAD_TITLE_TEXT', 7], ['HEAD_CLOCK_TEXT', 7],
  ['SLG_VIEWPORTS', 7], ['REPORT_VIEWPORT', 7],
]
/** Layers the .lsp makes not printable. */
const NO_PLOT = new Set(['SLG_VIEWPORTS'])

/**
 * The text style's font. The .lsp writes text in the drawing's current style, which in a new AutoCAD or DraftSight
 * drawing is "Standard" with Arial; the app measures text with Arimo, which has Arial's widths.
 */
export const DXF_FONT = 'arial.ttf'

export interface DxfOptions {
  /** CAD visibility groups switched off in the preview: their layers are written, but turned off. */
  hidden?: ReadonlySet<LayerGroup>
  /** Pixel size of each processed image found in the job folder, by file name (lower case). */
  imageSizes?: ReadonlyMap<string, [number, number]>
}

export interface DxfResult {
  text: string
  /** The image files the DXF links (relative to the DXF), with whether their size was read from the file. */
  images: { file: string; fileName: string; sized: boolean }[]
}

/** The image path written into the DXF: relative to the DXF in the job folder (".\Processed_Images\SCAN_1_FIT.png"). */
export function relativeImagePath(folderName: string, fileName: string): string {
  return `.\\${folderName}\\${fileName}`
}

/** v5.0's processed image size (40 px per inch, at least 100 px each way), when the file's own size isn't known. */
export function fallbackPixels(w: number, h: number): [number, number] {
  return [Math.max(100, Math.round(Math.abs(w) * 40)), Math.max(100, Math.round(Math.abs(h) * 40))]
}

export function exportDxf(p: Project, options: DxfOptions = {}): DxfResult {
  const d = buildDrawing(p)
  return drawingToDxf(p, d, options)
}

export function drawingToDxf(p: Project, d: Drawing, options: DxfOptions = {}): DxfResult {
  const s = p.settings
  const o = d.orientation as Orientation
  const off = rotationOffset(o)
  const V = (x: number, y: number): Pt => toVisual(o, x, y)
  const folder = processedFolderName(s.processedImageFolder)
  const useImages = s.generateOverlayDrawing
  const inserts = useImages && p.vessel.length !== null && p.vessel.height !== null ? imageInserts(p, drawnScans(p), false) : []
  const images: DxfResult['images'] = []

  const entities: DxfEntity[] = []
  const box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity]
  const grow = (q: Pt) => {
    box[0] = Math.min(box[0], q[0])
    box[1] = Math.min(box[1], q[1])
    box[2] = Math.max(box[2], q[0])
    box[3] = Math.max(box[3], q[1])
  }
  const add = (e: DxfEntity, pts: Pt[]) => {
    entities.push(e)
    for (const q of pts) grow(q)
  }

  for (const item of d.items) for (const sh of item.shapes) shape(sh)

  function shape(sh: Shape) {
    const layer = sh.layer
    switch (sh.t) {
      case 'line': {
        const a = V(sh.x1, sh.y1)
        const b = V(sh.x2, sh.y2)
        add({ t: 'LINE', layer, a, b }, [a, b])
        return
      }
      case 'rect': {
        // RECTANGLE in the .lsp: a closed polyline from the first corner.
        const pts = [V(sh.x, sh.y), V(sh.x + sh.w, sh.y), V(sh.x + sh.w, sh.y + sh.h), V(sh.x, sh.y + sh.h)]
        add({ t: 'LWPOLYLINE', layer, pts, closed: true }, pts)
        return
      }
      case 'circle': {
        const c = V(sh.cx, sh.cy)
        add({ t: 'CIRCLE', layer, c, r: sh.r }, [[c[0] - sh.r, c[1] - sh.r], [c[0] + sh.r, c[1] + sh.r]])
        return
      }
      case 'arc': {
        const c = V(sh.cx, sh.cy)
        const pts: Pt[] = []
        const a0 = sh.a0 + off
        const a1 = sh.a1 + off
        const span = ((((a1 - a0) % 360) + 360) % 360) || 360
        for (let k = 0; k <= 16; k++) {
          const a = ((a0 + (span * k) / 16) * Math.PI) / 180
          pts.push([c[0] + sh.r * Math.cos(a), c[1] + sh.r * Math.sin(a)])
        }
        add({ t: 'ARC', layer, c, r: sh.r, a0, a1 }, pts)
        return
      }
      case 'poly': {
        const pts = sh.pts.map((q) => V(q[0], q[1]))
        if (sh.fill && sh.dot) {
          // A dot: a filled donut (a closed two-arc polyline as wide as half the dot), as DONUT draws it.
          const c = V(sh.dot.c[0], sh.dot.c[1])
          const r = sh.dot.d / 4
          add({ t: 'LWPOLYLINE', layer, pts: [[c[0] - r, c[1]], [c[0] + r, c[1]]], closed: true, bulges: [1, 1], width: sh.dot.d / 2 }, pts)
          return
        }
        if (sh.fill && pts.length >= 3 && pts.length <= 4) {
          // A closed arrowhead: a SOLID (the .lsp draws DraftSight's direction arrowheads the same way). A four-sided
          // SOLID takes its corners in a zigzag.
          add({ t: 'SOLID', layer, pts: pts.length === 4 ? [pts[0], pts[1], pts[3], pts[2]] : pts }, pts)
          return
        }
        if (sh.fill) {
          // Any other filled shape: a fan of triangles.
          for (let k = 1; k + 1 < pts.length; k++) add({ t: 'SOLID', layer, pts: [pts[0], pts[k], pts[k + 1]] }, [pts[0], pts[k], pts[k + 1]])
          return
        }
        const first = pts[0]
        const last = pts[pts.length - 1]
        const closed = pts.length > 3 && Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-9
        add({ t: 'LWPOLYLINE', layer, pts: closed ? pts.slice(0, -1) : pts, closed }, pts)
        return
      }
      case 'text': {
        if (sh.text === '') return
        const at = V(sh.x, sh.y)
        // SL_Text: the rotation turned with the drawing, written as whole degrees (rtos h 2 0).
        const rot = Math.round(sh.rot + off)
        const g = textGeometry({ x: at[0], y: at[1], h: sh.h, rot, text: sh.text, just: sh.just })
        add({ t: 'TEXT', layer, at, base: g.start, h: sh.h, rot, text: sh.text, just: sh.just }, g.corners)
        return
      }
      case 'image': {
        if (!useImages) return
        const ins = inserts.find((x) => x.scanId === sh.scanId && (sh.from === undefined || (x.crop !== undefined && Math.abs(x.crop[0] - sh.from) < 1e-9)))
        if (ins) image(ins, layer)
        return
      }
    }
  }

  /** SL_InsertFitImage: the image's lower-left corner at the scan's (x, y), its width along X and height along Y, turned with the drawing. */
  function image(ins: ImageInsert, layer: string) {
    const x = Math.min(ins.x, ins.x + ins.w)
    const y = Math.min(ins.y, ins.y + ins.h)
    const w = Math.abs(ins.w)
    const h = Math.abs(ins.h)
    const known = options.imageSizes?.get(ins.fileName.toLowerCase())
    const px = known ?? fallbackPixels(w, h)
    const at = V(x, y)
    const ex = V(x + 1, y)
    const ey = V(x, y + 1)
    const u: Pt = [((ex[0] - at[0]) * w) / px[0], ((ex[1] - at[1]) * w) / px[0]]
    const v: Pt = [((ey[0] - at[0]) * h) / px[1], ((ey[1] - at[1]) * h) / px[1]]
    const file = relativeImagePath(folder, ins.fileName)
    if (!images.some((i) => i.file === file)) images.push({ file, fileName: ins.fileName, sized: known !== undefined })
    add({ t: 'IMAGE', layer, file, at, u, v, px }, [at, V(x + w, y), V(x, y + h), V(x + w, y + h)])
  }

  if (!Number.isFinite(box[0])) box.splice(0, 4, 0, 0, 100, 100)
  return { text: writeDxf({ layers: dxfLayers(p, d, entities, options.hidden), entities, extents: box, imageFrames: s.showScanBordersOnOverlay, font: DXF_FONT }), images }
}

/**
 * The layer table: "0", SL_SetupLayers, the app's layers (appLayerSetup; the MUT outline layer only with a MUT area, as
 * the .lsp), then any other layer an entity is on. Colors with the Drawing step's changes; line weights from the
 * Drawing step rounded to a standard weight; the hatch layers and the centerline see-through as in the .lsp.
 */
export function dxfLayers(p: Project, d: Drawing, entities: readonly DxfEntity[], hidden: ReadonlySet<LayerGroup> = new Set()): DxfLayer[] {
  const s = p.settings
  const colors = new Map<string, number>([['0', 7], ...SETUP_LAYERS])
  for (const [name, color] of appLayerSetup(s, hasMutAreas(p))) colors.set(name, color)
  for (const [name, color] of Object.entries(d.layerColors)) if (colors.has(name)) colors.set(name, color)
  for (const e of entities) if (!colors.has(e.layer)) colors.set(e.layer, d.layerColors[e.layer] ?? LAYER_COLOR[e.layer] ?? 7)
  const weight = lineWeights(s)
  return [...colors].map(([name, color]): DxfLayer => ({
    name,
    color: Math.min(255, Math.max(1, Math.round(color))),
    lineWeight: name === '0' ? 25 : nearestLineWeight(weight(name) * 25.4),
    transparency: TRANSPARENT_LAYERS.includes(name) ? d.hatchTransparency : name === 'CENTERLINE' ? d.centerlineTransparency : 0,
    off: name !== '0' && groupOfLayer(name) !== 'always' && hidden.has(groupOfLayer(name)),
    plot: !NO_PLOT.has(name),
  }))
}
