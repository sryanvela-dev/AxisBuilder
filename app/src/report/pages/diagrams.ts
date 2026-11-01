// Diagrams drawn by the app for the fixed pages, as vectors (sharp at any size, in the Pages view and the PDF alike).
// Each is laid out on its own canvas (units, y down) and scaled into the box it is given; text sizes scale with it.
//
// 'scan-views' (AUT Equipment, Displays): a plate with the scanner's raster path on top (C-scan, plan view), the
// cross-section on its front face (B-scan, along the Y-axis stroke), its end face (D-scan / B', along the X-axis index),
// the transducer and its beam to an internal reflector, and the A-scan at that point: white full-wave (rectified)
// signal on black with a grid, like the AUT Solutions display.

import { fontBox } from '../fonts.ts'
import type { PageItem, PathCmd, Rect } from '../pageModel.ts'
import { F } from './layout.ts'

export type DiagramId = 'scan-views'

/** Width / height of each diagram's canvas. */
export const DIAGRAM_ASPECT: Readonly<Record<DiagramId, number>> = { 'scan-views': 10.6 / 6.6 }

export function diagramItems(id: DiagramId, box: Rect): PageItem[] {
  switch (id) {
    case 'scan-views':
      return scanViews(box)
  }
}

type P = [number, number]

const INK = '#1F2A36'
const MUTED = '#55616E'
const EDGE = '#4A5560'
const BLUE = '#2875BA'
const RED = '#C0262D'
const ORANGE = '#F47E1F'

function scanViews(box: Rect): PageItem[] {
  const W = 10.6
  const k = box.w / W
  const X = (x: number) => box.x + x * k
  const Y = (y: number) => box.y + y * k
  const pt = (u: number) => u * k * 72
  const items: PageItem[] = []
  const path = (pts: P[], o: { stroke?: string | null; fill?: string | null; width?: number; close?: boolean; fillOpacity?: number; opacity?: number; round?: boolean } = {}) => {
    const d: PathCmd[] = pts.map(([x, y], i) => (i ? ['L', X(x), Y(y)] : ['M', X(x), Y(y)]))
    if (o.close) d.push(['Z'])
    items.push({ t: 'path', d, stroke: o.stroke === undefined ? null : o.stroke, fill: o.fill ?? null, width: o.width ?? 0.75, opacity: o.opacity ?? 1, fillOpacity: o.fillOpacity ?? 1, cap: o.round ? 'round' : 'butt' })
  }
  const text = (x: number, y: number, s: string, size: number, font: (typeof F)[keyof typeof F], color: string, align: 'left' | 'center' | 'right' = 'left') => {
    // y = the middle of the capital letters.
    items.push({ t: 'text', x: X(x), y: Y(y) + fontBox(font, pt(size)).cap / 2, text: s, font, size: pt(size), color, align })
  }
  /** A straight arrow with a filled head at `b`. */
  const arrow = (a: P, b: P, color: string, width = 1.4, head = 0.16) => {
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const len = Math.hypot(dx, dy)
    const ux = dx / len
    const uy = dy / len
    const base: P = [b[0] - ux * head, b[1] - uy * head]
    path([a, base], { stroke: color, width })
    path([b, [base[0] - uy * head * 0.45, base[1] + ux * head * 0.45], [base[0] + uy * head * 0.45, base[1] - ux * head * 0.45]], { fill: color, close: true })
  }
  /** A label: bold title and a plain line under it, with a thin leader from `from` to the dot at `to`. */
  const callout = (x: number, y: number, title: string, sub: string, align: 'left' | 'right', from: P, to: P) => {
    path([from, to], { stroke: INK, width: 0.6 })
    path(circle(to, 0.045), { fill: INK, close: true })
    text(x, y, title, 0.2, F.title, INK, align)
    text(x, y + 0.3, sub, 0.16, F.body, MUTED, align)
  }

  // --- The plate: front face a true rectangle, depth drawn up and to the right ---------------------------
  const L = 6.4
  const T = 1.15
  const D: P = [1.7, -1.15]
  const o: P = [1.1, 3.65] // front, bottom, left
  const ftl: P = [o[0], o[1] - T]
  const ftr: P = [o[0] + L, o[1] - T]
  const fbr: P = [o[0] + L, o[1]]
  const add = (p: P, q: P, s = 1): P => [p[0] + q[0] * s, p[1] + q[1] * s]
  /** A point on the top face: u along the length (Y-axis stroke), v into the depth (X-axis index). */
  const top = (u: number, v: number): P => add([ftl[0] + L * u, ftl[1]], D, v)
  path([ftl, ftr, add(ftr, D), add(ftl, D)], { fill: '#E4E8EC', stroke: EDGE, width: 0.9, close: true })
  path([ftr, add(ftr, D), add(fbr, D), fbr], { fill: '#B9C2CB', stroke: EDGE, width: 0.9, close: true })
  path([o, ftl, ftr, fbr], { fill: '#CDD4DB', stroke: EDGE, width: 0.9, close: true })

  // Raster path on the top face: strokes along Y, an index step in X between them.
  const rows = [0.86, 0.68, 0.5, 0.32, 0.14]
  const raster: P[] = []
  rows.forEach((v, i) => {
    const [u0, u1] = i % 2 ? [0.9, 0.08] : [0.08, 0.9]
    raster.push(top(u0, v), top(u1, v))
  })
  path(raster, { stroke: BLUE, width: 1.3, round: true })
  for (let i = 0; i < rows.length; i++) {
    const [u0, u1] = i % 2 ? [0.9, 0.08] : [0.08, 0.9]
    const a = top(u0 + (u1 - u0) * 0.52, rows[i])
    arrow(a, top(u0 + (u1 - u0) * 0.6, rows[i]), BLUE, 0.01, 0.12)
  }
  // Y-axis stroke along the back edge, X-axis index along the left edge (toward the front).
  arrow(top(0.18, 1.2), top(0.62, 1.2), BLUE, 1.5)
  text(top(0.4, 1.2)[0], top(0.4, 1.2)[1] - 0.24, 'Y-axis stroke (scan)', 0.15, F.label, BLUE, 'center')
  arrow(add(top(0, 0.92), [-0.32, 0]), add(top(0, 0.2), [-0.32, 0]), RED, 1.5)
  text(top(0, 0.56)[0] - 0.5, top(0, 0.56)[1], 'X-axis index', 0.15, F.label, RED, 'right')

  // Transducer near the front edge, its beam down the front face to a reflector.
  const tx = top(0.34, 0.1)
  const s = 0.5
  const tb: P = [tx[0] - s / 2, tx[1] - 0.05] // body's front bottom left
  const tD: P = [0.3, -0.2]
  path([[tb[0], tb[1] - s], [tb[0] + s, tb[1] - s], add([tb[0] + s, tb[1] - s], tD), add([tb[0], tb[1] - s], tD)], { fill: '#6B747E', stroke: '#2B3138', width: 0.7, close: true })
  path([[tb[0] + s, tb[1] - s], add([tb[0] + s, tb[1] - s], tD), add([tb[0] + s, tb[1]], tD), [tb[0] + s, tb[1]]], { fill: '#3A4148', stroke: '#2B3138', width: 0.7, close: true })
  path([tb, [tb[0], tb[1] - s], [tb[0] + s, tb[1] - s], [tb[0] + s, tb[1]]], { fill: '#4C545C', stroke: '#2B3138', width: 0.7, close: true })
  path([[tb[0], tb[1] - 0.13], [tb[0] + s, tb[1] - 0.13]], { stroke: '#9AA3AC', width: 0.8 })
  // Cable: out of the top, curving up and left.
  const c0: P = add([tb[0] + s / 2, tb[1] - s], tD, 0.5)
  items.push({ t: 'path', d: [['M', X(c0[0]), Y(c0[1])], ['C', X(c0[0]), Y(c0[1] - 0.7), X(c0[0] - 0.6), Y(c0[1] - 0.9), X(c0[0] - 1.2), Y(c0[1] - 1.05)]], stroke: '#2B3138', fill: null, width: pt(0.07), opacity: 1, fillOpacity: 1, cap: 'round' })
  // Beam on the front face (a cut-away): from the transducer to the back wall.
  const bx = tx[0]
  path([[bx - 0.06, ftl[1]], [bx + 0.06, ftl[1]], [bx + 0.2, o[1]], [bx - 0.2, o[1]]], { fill: '#3B91CE', fillOpacity: 0.35, close: true })
  path([[bx, ftl[1]], [bx, o[1]]], { stroke: BLUE, width: 0.8 })
  const refl: P = [bx + 0.02, ftl[1] + T * 0.48]
  path(ellipse(refl, 0.2, 0.07), { fill: ORANGE, stroke: '#A44F0A', width: 0.6, close: true })
  // Front and back wall on the cross-section.
  text(o[0] + 0.12, ftl[1] + 0.16, 'Front wall (O.D.)', 0.14, F.body, MUTED)
  text(o[0] + 0.12, o[1] - 0.17, 'Back wall (I.D.)', 0.14, F.body, MUTED)
  // B-scan on the front face itself.
  text(o[0] + L - 0.15, ftl[1] + T / 2 - 0.12, 'B-SCAN', 0.22, F.title, INK, 'right')
  text(o[0] + L - 0.15, ftl[1] + T / 2 + 0.2, 'side view along the Y-axis stroke', 0.16, F.body, '#3C4651', 'right')

  // C-scan: the top face; D-scan (B'): the end face.
  callout(10.45, 0.55, 'C-SCAN', 'top (plan) view of the scanned area', 'right', [10.45 - 2.75, 0.9], top(0.8, 0.64))
  const endMid: P = add([fbr[0], fbr[1] - T / 2], D, 0.5)
  callout(10.45, 3.95, "D-SCAN (B')", 'end view along the X-axis index', 'right', [10.45 - 2.5, 3.72], endMid)

  // --- A-scan: the waveform at the reflector -------------------------------------------------------
  const ax = 1.1
  const ay = 4.25
  const aw = 5.9
  const ah = 2.3
  path([[ax, ay], [ax + aw, ay], [ax + aw, ay + ah], [ax, ay + ah]], { fill: '#000000', stroke: '#000000', width: 0.75, close: true })
  // Leader from the reflector down to the A-scan.
  path([[refl[0], refl[1] + 0.07], [refl[0], ay]], { stroke: ORANGE, width: 0.9 })
  path(circle([refl[0], ay], 0.045), { fill: ORANGE, close: true })
  text(ax + 0.15, ay + 0.2, 'A-SCAN', 0.2, F.title, '#FFFFFF')
  text(ax + 1.2, ay + 0.2, 'waveform at one point (full-wave)', 0.15, F.body, '#B8BEC5')
  const px0 = ax + 0.55
  const px1 = ax + aw - 0.15
  const py0 = ay + 0.68
  const py1 = ay + ah - 0.38
  for (let i = 0; i <= 4; i++) {
    const y = py1 - ((py1 - py0) * i) / 4
    path([[px0, y], [px1, y]], { stroke: '#3A3F45', width: 0.4 })
    if (i % 2 === 0) text(px0 - 0.08, y, String(i * 25), 0.13, F.body, '#9AA2AA', 'right')
  }
  for (let i = 0; i <= 10; i++) {
    const x = px0 + ((px1 - px0) * i) / 10
    path([[x, py0], [x, py1]], { stroke: '#3A3F45', width: 0.4 })
  }
  text(px0 - 0.42, (py0 + py1) / 2, '%', 0.13, F.body, '#9AA2AA', 'center')
  text((px0 + px1) / 2, py1 + 0.22, 'Depth / time of flight', 0.14, F.body, '#B8BEC5', 'center')
  // Full-wave (rectified) echoes: interface, internal reflector, back wall, over a low noise floor.
  const echoes = [{ at: 0.07, amp: 0.97 }, { at: 0.43, amp: 0.62 }, { at: 0.74, amp: 0.86 }]
  const N = 1600
  const trace: P[] = []
  for (let i = 0; i <= N; i++) {
    const t = i / N
    let a = 0.02 + 0.045 * noise(i) ** 2
    for (const e of echoes) a += e.amp * Math.exp(-(((t - e.at) / 0.012) ** 2)) * Math.abs(Math.cos((Math.PI * (t - e.at)) / 0.0085))
    trace.push([px0 + (px1 - px0) * t, py1 - (py1 - py0) * Math.min(a, 1)])
  }
  path(trace, { stroke: '#FFFFFF', width: 0.7 })
  // Gate over the reflector.
  const gate = py1 - (py1 - py0) * 0.3
  path([[px0 + (px1 - px0) * 0.33, gate], [px0 + (px1 - px0) * 0.55, gate]], { stroke: '#E03A3A', width: 1.6 })
  const label = (t: number, amp: number, s: string) => text(px0 + (px1 - px0) * t, py1 - (py1 - py0) * Math.min(amp, 0.97) - 0.15, s, 0.14, F.label, '#FFFFFF', 'center')
  label(0.07, 0.97, 'Front wall')
  label(0.43, 0.62, 'Internal reflector')
  label(0.74, 0.86, 'Back wall')
  text(px0 + (px1 - px0) * 0.32, gate, 'Gate', 0.13, F.label, '#E03A3A', 'right')
  return items
}

/** Smooth, repeatable noise in 0..1 (no random numbers: the diagram is the same every time). */
function noise(i: number): number {
  const h = (n: number) => {
    const x = Math.sin(n * 12.9898) * 43758.5453
    return x - Math.floor(x)
  }
  const a = Math.floor(i / 4)
  const f = (i % 4) / 4
  return h(a) * (1 - f) + h(a + 1) * f
}

function circle(c: P, r: number): P[] {
  return ellipse(c, r, r)
}

function ellipse(c: P, rx: number, ry: number): P[] {
  return Array.from({ length: 32 }, (_, i): P => [c[0] + rx * Math.cos((i / 32) * 2 * Math.PI), c[1] + ry * Math.sin((i / 32) * 2 * Math.PI)])
}
