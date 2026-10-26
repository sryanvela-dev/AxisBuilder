// Made-up scan photos for the sample job, drawn in the browser when it opens (no files ship with the app): a smooth
// C-scan-like color map, different for each scan, with "SAMPLE" on it so nobody takes it for real data. They stand in
// for the photo folder, so the preview, Process images, the PDF and the report images all have photos to show.

import type { PhotoFolder } from './photoFolder.ts'

const W = 720
const H = 360

// Blue -> cyan -> green -> yellow -> red, as an AUT amplitude map.
const STOPS: [number, number, number][] = [[20, 40, 140], [30, 150, 210], [60, 180, 90], [235, 215, 60], [210, 50, 40]]

function palette(v: number): [number, number, number] {
  const t = Math.min(0.999, Math.max(0, v)) * (STOPS.length - 1)
  const i = Math.floor(t)
  const f = t - i
  const [a, b] = [STOPS[i], STOPS[i + 1]]
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
}

async function photo(name: string, n: number): Promise<File> {
  // A few soft spots per scan, placed by a fixed recipe so every scan looks different but the same each time.
  const spots = [0, 1, 2, 3].map((k) => ({
    x: ((n * 37 + k * 53) % 100) / 100,
    y: ((n * 61 + k * 29) % 100) / 100,
    r: 0.08 + (((n + k) * 17) % 10) / 100,
    a: k % 2 ? -0.35 : 0.45,
  }))
  const canvas = new OffscreenCanvas(W, H)
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(W, H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W
      const v = y / H
      let val = 0.45 + 0.08 * Math.sin(u * 9 + n) + 0.05 * Math.cos(v * 7 - n)
      for (const s of spots) val += s.a * Math.exp(-(((u - s.x) * 0.5) ** 2 + (v - s.y) ** 2) / (s.r * s.r))
      const [r, g, b] = palette(val)
      const o = (y * W + x) * 4
      img.data[o] = r
      img.data[o + 1] = g
      img.data[o + 2] = b
      img.data[o + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.font = 'bold 44px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('SAMPLE', W / 2, H / 2 - 10)
  ctx.font = 'bold 30px sans-serif'
  ctx.fillText(`SCAN ${n}`, W / 2, H / 2 + 34)
  const blob = await canvas.convertToBlob({ type: 'image/png' })
  return new File([blob], name, { type: 'image/png' })
}

/** The sample job's photo folder: one made-up photo per file name (the sample's links), each made on first read. */
export function samplePhotoFolder(names: string[]): PhotoFolder {
  const made = new Map<string, Promise<File>>()
  return {
    name: 'Sample photos (made up)',
    names,
    getFile: async (name) => {
      const n = names.indexOf(name) + 1
      if (n === 0) return null
      if (!made.has(name)) made.set(name, photo(name, n))
      return made.get(name)!
    },
  }
}
