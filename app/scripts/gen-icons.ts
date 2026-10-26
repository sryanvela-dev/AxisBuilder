// Writes the AxisBuilder logo files from one design (option D in docs/logo-examples.html):   npm run icons
//   src/assets/logo/wordmark-light.svg, wordmark-dark.svg  "AXISBUILDER" with the X replaced by a curve-stitched X
//   src/assets/logo/icon.svg, public/favicon.svg           the X on a dark rounded square
//   public/pwa-192x192.png, pwa-512x512.png, maskable-512x512.png, apple-touch-icon.png
// The letters are outlines from Archivo Black (src/assets/logo/ArchivoBlack-Regular.ttf, SIL Open Font License), so
// the logo looks the same everywhere with no font loaded; the X is lines. The output is the same on every run
// (test/ui/logo.test.ts fails when a file is out of date).
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import fontkit from '@pdf-lib/fontkit'
import { rasterIcon, rgbaPng, type IconScene, type Rgb } from './iconRaster.ts'

const APP = join(dirname(fileURLToPath(import.meta.url)), '..')
export const LOGO_DIR = join(APP, 'src', 'assets', 'logo')
const FONT_FILE = join(LOGO_DIR, 'ArchivoBlack-Regular.ttf')

/** Logo colors: the X and the letters on a light and on a dark background, and the icon's square. */
export const LOGO_COLORS = {
  light: { x: '#1f5fbf', letters: '#1d2733' },
  dark: { x: '#5b9bff', letters: '#eef1f5' },
  iconSquare: '#1d2733',
  iconX: '#5b9bff',
} as const

/** The wordmark's X: height as a multiple of the letters' cap height, width / height, threads per quarter. */
export const WORDMARK_X = { size: 2.2, ratio: 0.95, n: 16 } as const

type Seg = [number, number, number, number]

const r1 = (v: number) => (Math.round(v * 10) / 10).toString()

// Point i on one arm (from the origin out) joined to point n - i on the next arm: the curve-stitching chart.
function stitch(cx: number, cy: number, a: readonly number[], b: readonly number[], n: number): Seg[] {
  const out: Seg[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const u = 1 - t
    out.push([cx + (a[0] - cx) * t, cy + (a[1] - cy) * t, cx + (b[0] - cx) * u, cy + (b[1] - cy) * u])
  }
  return out
}

/** The X in the box (x, y, w, h): the threads of all four quarters and the two diagonals (the axes). */
export function xLines(x: number, y: number, w: number, h: number, n: number): { threads: Seg[]; axes: Seg[] } {
  const c = [x + w / 2, y + h / 2]
  const TL = [x, y]
  const TR = [x + w, y]
  const BR = [x + w, y + h]
  const BL = [x, y + h]
  const threads = [[TL, TR], [TR, BR], [BR, BL], [BL, TL]].flatMap(([a, b]) => stitch(c[0], c[1], a, b, n))
  return { threads, axes: [[x, y, x + w, y + h], [x + w, y, x, y + h]] }
}

const segPath = (segs: Seg[]) => segs.map(([a, b, c, d]) => `M${r1(a)} ${r1(b)}L${r1(c)} ${r1(d)}`).join('')

// --- Wordmark ---------------------------------------------------------------------------------

interface Wordmark {
  width: number
  height: number
  letters: string
  threads: Seg[]
  axes: Seg[]
  thread: number
  axis: number
}

function wordmarkGeometry(): Wordmark {
  const font = fontkit.create(readFileSync(FONT_FILE))
  const cap = font.capHeight
  // Sizes from the examples page, where the cap height is 72 and the stroke widths and gap are in hundredths of an em.
  const unit = cap / 72
  const thread = 2.2 * unit
  const axis = thread * 2.2
  const gap = 10 * unit
  const h = cap * WORDMARK_X.size
  const w = h * WORDMARK_X.ratio
  const pad = axis / 2 + 2
  const top = -(cap / 2 + h / 2) - pad // y down, baseline at 0
  let d = ''
  const glyphs = (text: string, x0: number): number => {
    const run = font.layout(text)
    let x = x0
    run.glyphs.forEach((g, i) => {
      // fontkit has the path commands but its types leave them out.
      for (const c of (g.path as unknown as { commands: { command: string; args: number[] }[] }).commands) {
        const pts: string[] = []
        for (let k = 0; k < c.args.length; k += 2) pts.push(`${r1(x + c.args[k])} ${r1(-top - c.args[k + 1])}`)
        d += { moveTo: 'M', lineTo: 'L', quadraticCurveTo: 'Q', bezierCurveTo: 'C', closePath: 'Z' }[c.command] + pts.join(' ')
      }
      x += run.positions[i].xAdvance
    })
    return x
  }
  const afterA = glyphs('A', pad)
  const xLeft = afterA + gap
  const { threads, axes } = xLines(xLeft, pad, w, h, WORDMARK_X.n)
  const end = glyphs('ISBUILDER', xLeft + w + gap)
  return { width: end + pad, height: h + 2 * pad, letters: d, threads, axes, thread, axis }
}

export function wordmarkSvg(theme: 'light' | 'dark'): string {
  const g = wordmarkGeometry()
  const c = LOGO_COLORS[theme]
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r1(g.width)} ${r1(g.height)}" role="img" aria-label="AxisBuilder">`,
    `<path fill="${c.letters}" d="${g.letters}"/>`,
    `<path fill="none" stroke="${c.x}" stroke-width="${r1(g.thread)}" stroke-linecap="round" d="${segPath(g.threads)}"/>`,
    `<path fill="none" stroke="${c.x}" stroke-width="${r1(g.axis)}" stroke-linecap="round" d="${segPath(g.axes)}"/>`,
    '</svg>',
    '',
  ].join('\n')
}

// --- Icon -------------------------------------------------------------------------------------

/** One icon design in a 100-unit square: corner radius and the X's box (the X is centered). */
export interface IconKind {
  radius: number
  box: number
}

/** The app icon: X at 90% of a rounded square. */
export const ICON: IconKind = { radius: 16, box: 90 }
/** Maskable PWA icon: square to the edge, the X inside the middle 80% circle the launcher may cut to. */
export const MASKABLE: IconKind = { radius: 0, box: 54 }
/** Apple touch icon: square to the edge (iOS rounds the corners itself). */
export const APPLE: IconKind = { radius: 0, box: 78 }

const ICON_THREADS = 9

function iconGeometry(kind: IconKind) {
  const o = (100 - kind.box) / 2
  const { threads, axes } = xLines(o, o, kind.box, kind.box, ICON_THREADS)
  // As the examples page: 3.2 units in a 106-unit view box around the X.
  const thread = (3.2 * kind.box) / 106
  return { threads, axes, thread, axis: thread * 1.9 }
}

export function iconSvg(kind: IconKind = ICON): string {
  const g = iconGeometry(kind)
  const square = kind.radius > 0 ? `<rect width="100" height="100" rx="${kind.radius}"/>` : '<rect width="100" height="100"/>'
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="AxisBuilder">',
    `<clipPath id="ab-square">${square}</clipPath>`,
    `<g clip-path="url(#ab-square)">`,
    square.replace('/>', ` fill="${LOGO_COLORS.iconSquare}"/>`),
    `<path fill="none" stroke="${LOGO_COLORS.iconX}" stroke-width="${r1(g.thread)}" stroke-linecap="round" d="${segPath(g.threads)}"/>`,
    `<path fill="none" stroke="${LOGO_COLORS.iconX}" stroke-width="${r1(g.axis)}" stroke-linecap="round" d="${segPath(g.axes)}"/>`,
    '</g>',
    '</svg>',
    '',
  ].join('\n')
}

const rgb = (hex: string): Rgb => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]

export function iconPng(kind: IconKind, px: number): Buffer {
  const g = iconGeometry(kind)
  const scene: IconScene = {
    size: 100,
    radius: kind.radius,
    background: rgb(LOGO_COLORS.iconSquare),
    lineColor: rgb(LOGO_COLORS.iconX),
    lines: [...g.threads.map((seg) => ({ seg, width: g.thread })), ...g.axes.map((seg) => ({ seg, width: g.axis }))],
  }
  return rgbaPng(px, px, rasterIcon(scene, px))
}

/** Every logo file: path relative to app/ -> contents. */
export function renderIconFiles(): Map<string, string | Buffer> {
  const icon = iconSvg()
  return new Map<string, string | Buffer>([
    ['src/assets/logo/wordmark-light.svg', wordmarkSvg('light')],
    ['src/assets/logo/wordmark-dark.svg', wordmarkSvg('dark')],
    ['src/assets/logo/icon.svg', icon],
    ['public/favicon.svg', icon],
    ['public/pwa-192x192.png', iconPng(ICON, 192)],
    ['public/pwa-512x512.png', iconPng(ICON, 512)],
    ['public/maskable-512x512.png', iconPng(MASKABLE, 512)],
    ['public/apple-touch-icon.png', iconPng(APPLE, 180)],
  ])
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const [path, data] of renderIconFiles()) {
    writeFileSync(join(APP, path), data)
    console.log(`Wrote ${path}`)
  }
}
