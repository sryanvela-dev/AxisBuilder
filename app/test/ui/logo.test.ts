// The logo files (npm run icons, scripts/gen-icons.ts): up to date, the right sizes, the letters as shapes, and the
// manifest and index.html pointing at them (Phase 6).
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { renderIconFiles } from '../../scripts/gen-icons.ts'

const app = (path: string) => new URL(`../../${path}`, import.meta.url)
const files = renderIconFiles()

function pngSize(buf: Buffer): [number, number] {
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG')
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)]
}

/** RGBA rows of one of our PNGs (one IDAT, filter 0 on every row, as rgbaPng writes them). */
function pngPixels(buf: Buffer): { w: number; h: number; at: (x: number, y: number) => number[] } {
  const [w, h] = pngSize(buf)
  const len = buf.readUInt32BE(33)
  expect(buf.subarray(37, 41).toString('ascii')).toBe('IDAT')
  const raw = inflateSync(buf.subarray(41, 41 + len))
  return { w, h, at: (x, y) => [...raw.subarray(y * (w * 4 + 1) + 1 + x * 4, y * (w * 4 + 1) + 5 + x * 4)] }
}

describe('logo files', () => {
  it('are up to date (run `npm run icons` if this fails) and the same on every run', () => {
    for (const [path, data] of files) {
      const disk = readFileSync(app(path))
      expect(Buffer.compare(disk, Buffer.from(data)), path).toBe(0)
    }
    const again = renderIconFiles()
    for (const [path, data] of files) expect(Buffer.compare(Buffer.from(again.get(path)!), Buffer.from(data)), path).toBe(0)
  })

  it('the PNG icons are the sizes the manifest and iOS ask for', () => {
    expect(pngSize(readFileSync(app('public/pwa-192x192.png')))).toEqual([192, 192])
    expect(pngSize(readFileSync(app('public/pwa-512x512.png')))).toEqual([512, 512])
    expect(pngSize(readFileSync(app('public/maskable-512x512.png')))).toEqual([512, 512])
    expect(pngSize(readFileSync(app('public/apple-touch-icon.png')))).toEqual([180, 180])
  })

  it('the maskable icon keeps the X inside the middle 80% circle and fills the square to the edge', () => {
    const { w, h, at } = pngPixels(readFileSync(app('public/maskable-512x512.png')))
    const square = at(0, 0)
    expect(square[3]).toBe(255)
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        if (Math.hypot(x + 0.5 - w / 2, y + 0.5 - h / 2) > 0.4 * w) expect(at(x, y), `${x},${y}`).toEqual(square)
      }
    }
  })

  it('the wordmarks have the letters as shapes (no text, no font) and the X as lines', () => {
    for (const theme of ['light', 'dark']) {
      const svg = readFileSync(app(`src/assets/logo/wordmark-${theme}.svg`), 'utf8')
      expect(svg).not.toMatch(/<text|font-family|@font-face|<tspan/)
      expect(svg).toMatch(/<path fill="#[0-9a-f]{6}" d="M/)
      expect(svg).toMatch(/stroke-linecap="round"/)
    }
    expect(readFileSync(app('src/assets/logo/wordmark-light.svg'), 'utf8')).toContain('#1f5fbf')
    expect(readFileSync(app('src/assets/logo/wordmark-dark.svg'), 'utf8')).toContain('#5b9bff')
  })

  it('the manifest and index.html point at the icons', () => {
    const config = readFileSync(app('vite.config.ts'), 'utf8')
    expect(config).toContain("{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }")
    expect(config).toContain("{ src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' }")
    expect(config).toContain("{ src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }")
    const html = readFileSync(app('index.html'), 'utf8')
    expect(html).toContain('href="/favicon.svg"')
    expect(html).toContain('href="/apple-touch-icon.png"')
  })
})
