// Draws the app icon (a filled square, maybe rounded, with straight round-capped lines on it) into an RGBA PNG,
// for npm run icons. Written here instead of a library so the result is the same on every run: 4 x 4 samples per
// pixel, the lines clipped to the square, transparent outside it.
import { crc32, deflateSync } from 'node:zlib'

export type Rgb = readonly [number, number, number]

export interface IconScene {
  /** Size of the design in units (the square is 0..size both ways). */
  size: number
  /** Corner radius of the square in units (0 = sharp corners). */
  radius: number
  background: Rgb
  /** Line segments [x1, y1, x2, y2] in units, y down, each with its width; drawn with round ends. */
  lines: { seg: readonly [number, number, number, number]; width: number }[]
  lineColor: Rgb
}

const N = 4

function insideRounded(x: number, y: number, size: number, r: number): boolean {
  if (x < 0 || y < 0 || x > size || y > size) return false
  if (r <= 0) return true
  const cx = Math.min(Math.max(x, r), size - r)
  const cy = Math.min(Math.max(y, r), size - r)
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

/** RGBA pixels (row 0 at the top) of the scene drawn at px x px. */
export function rasterIcon(scene: IconScene, px: number): Uint8Array {
  const k = px / scene.size
  const ss = px * N
  const inLine = new Uint8Array(ss * ss)
  for (const { seg, width } of scene.lines) {
    const [x1, y1, x2, y2] = seg.map((v) => v * k * N)
    const hw = (width * k * N) / 2
    const dx = x2 - x1
    const dy = y2 - y1
    const len2 = dx * dx + dy * dy
    const i0 = Math.max(0, Math.floor(Math.min(x1, x2) - hw))
    const i1 = Math.min(ss - 1, Math.ceil(Math.max(x1, x2) + hw))
    const j0 = Math.max(0, Math.floor(Math.min(y1, y2) - hw))
    const j1 = Math.min(ss - 1, Math.ceil(Math.max(y1, y2) + hw))
    for (let j = j0; j <= j1; j++) {
      const sy = j + 0.5
      for (let i = i0; i <= i1; i++) {
        const sx = i + 0.5
        const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((sx - x1) * dx + (sy - y1) * dy) / len2))
        const ex = sx - (x1 + t * dx)
        const ey = sy - (y1 + t * dy)
        if (ex * ex + ey * ey <= hw * hw) inLine[j * ss + i] = 1
      }
    }
  }
  const out = new Uint8Array(px * px * 4)
  const [br, bg, bb] = scene.background
  const [lr, lg, lb] = scene.lineColor
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      let a = 0
      let r = 0
      let g = 0
      let b = 0
      for (let sj = 0; sj < N; sj++) {
        for (let si = 0; si < N; si++) {
          const i = x * N + si
          const j = y * N + sj
          if (!insideRounded((i + 0.5) / N / k, (j + 0.5) / N / k, scene.size, scene.radius)) continue
          a++
          if (inLine[j * ss + i]) {
            r += lr
            g += lg
            b += lb
          } else {
            r += br
            g += bg
            b += bb
          }
        }
      }
      const o = (y * px + x) * 4
      if (a > 0) {
        out[o] = Math.round(r / a)
        out[o + 1] = Math.round(g / a)
        out[o + 2] = Math.round(b / a)
        out[o + 3] = Math.round((a * 255) / (N * N))
      }
    }
  }
  return out
}

/** An RGBA PNG (color type 6, no interlace). */
export function rgbaPng(w: number, h: number, rgba: Uint8Array): Buffer {
  const row = 1 + w * 4
  const raw = Buffer.alloc(row * h)
  for (let y = 0; y < h; y++) {
    raw[y * row] = 0
    raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * row + 1)
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}
