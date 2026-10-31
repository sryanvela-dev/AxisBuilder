// Made-up photos for the report tests and the sample report PDF (no client photos): a sky-and-ground picture that
// shows which way is up, stored as a phone stores a portrait photo when asked (EXIF orientation).
import jpeg from 'jpeg-js'
import { withExifOrientation } from '../../../src/report/imageInfo.ts'

/**
 * An upright picture `uw` wide and `uh` tall (blue sky on top, brown ground below, a red marker top-left), stored so
 * that applying EXIF `orientation` shows it upright: for 6 the pixels are stored turned a quarter anticlockwise.
 */
export function madeUpPhoto(uw: number, uh: number, orientation = 1): Uint8Array {
  const swap = orientation >= 5
  const w = swap ? uh : uw
  const h = swap ? uw : uh
  const data = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Stored pixel -> upright pixel (orientation 6: upright = stored turned clockwise).
      const [ux, uy] = orientation === 6 ? [h - 1 - y, x] : orientation === 8 ? [y, w - 1 - x] : orientation === 3 ? [w - 1 - x, h - 1 - y] : [x, y]
      const sky = uy < uh * 0.55
      const marker = ux < uw * 0.15 && uy < uh * 0.15
      const i = (y * w + x) * 4
      data[i] = marker ? 220 : sky ? 90 : 140
      data[i + 1] = marker ? 30 : sky ? 150 : 100
      data[i + 2] = marker ? 30 : sky ? 230 : 60
      data[i + 3] = 255
    }
  }
  const bytes = new Uint8Array(jpeg.encode({ data, width: w, height: h }, 85).data)
  return orientation === 1 ? bytes : withExifOrientation(bytes, orientation)
}
