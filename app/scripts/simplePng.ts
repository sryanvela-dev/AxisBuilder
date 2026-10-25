// A plain RGB PNG for the test kits and reports (scripts only): a solid color with a lighter frame and diagonal, so
// its edges and which way up it is show in CAD.
import { crc32, deflateSync } from 'node:zlib'

export function simplePng(w: number, h: number, rgb: readonly [number, number, number]): Buffer {
  const row = 1 + w * 3
  const raw = Buffer.alloc(row * h)
  const edge = Math.max(2, Math.round(Math.min(w, h) / 40))
  for (let y = 0; y < h; y++) {
    raw[y * row] = 0
    for (let x = 0; x < w; x++) {
      const light = x < edge || y < edge || x >= w - edge || y >= h - edge || Math.abs(x / w - y / h) < edge / Math.max(w, h)
      // A dark corner block at the top left (row 0 is the top of the picture), to tell which way up it is.
      const mark = x < w / 6 && y < h / 6
      const i = y * row + 1 + x * 3
      const c = mark ? [20, 20, 20] : light ? [255, 255, 255] : rgb
      raw[i] = c[0]
      raw[i + 1] = c[1]
      raw[i + 2] = c[2]
    }
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
  ihdr[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
