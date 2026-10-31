// Size and phone (EXIF) orientation of a picture file, read from its bytes: JPEG (SOF marker and the APP1 Exif
// orientation tag) and PNG (IHDR). Phones often store a portrait photo sideways with an orientation tag; browsers
// follow the tag, pdf-lib does not, so the report applies it itself (pageModel.ts orientPoint). Pure, so the browser,
// the scripts and the tests read pictures the same way.

import type { ImageInfo } from './pageModel.ts'

export type ImageFormat = 'jpg' | 'png'

export function imageFormat(bytes: Uint8Array): ImageFormat | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg'
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png'
  return null
}

/** Size and orientation of a JPEG or PNG; null for anything else or a damaged file. */
export function readImageInfo(bytes: Uint8Array): (ImageInfo & { format: ImageFormat }) | null {
  const format = imageFormat(bytes)
  if (format === 'png') {
    if (bytes.length < 24) return null
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return { format, width: dv.getUint32(16), height: dv.getUint32(20), orientation: 1 }
  }
  if (format === 'jpg') return readJpeg(bytes)
  return null
}

function readJpeg(bytes: Uint8Array): (ImageInfo & { format: 'jpg' }) | null {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let orientation = 1
  let i = 2
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return null
    const marker = bytes[i + 1]
    if (marker === 0xff) {
      i++
      continue
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2
      continue
    }
    const len = dv.getUint16(i + 2)
    if (len < 2 || i + 2 + len > bytes.length) return null
    if (marker === 0xe1) orientation = exifOrientation(bytes, i + 4, len - 2) ?? orientation
    // Start of frame (baseline, progressive, ...): height then width.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { format: 'jpg', height: dv.getUint16(i + 5), width: dv.getUint16(i + 7), orientation }
    }
    i += 2 + len
  }
  return null
}

/** The orientation tag (0x0112) of an APP1 Exif segment starting at `at`, or null. */
function exifOrientation(bytes: Uint8Array, at: number, len: number): number | null {
  // "Exif\0\0" then a TIFF header.
  if (len < 14 || bytes[at] !== 0x45 || bytes[at + 1] !== 0x78 || bytes[at + 2] !== 0x69 || bytes[at + 3] !== 0x66) return null
  const tiff = at + 6
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const little = bytes[tiff] === 0x49
  if (!little && bytes[tiff] !== 0x4d) return null
  const u16 = (o: number) => dv.getUint16(o, little)
  const u32 = (o: number) => dv.getUint32(o, little)
  const end = at + len
  const ifd = tiff + u32(tiff + 4)
  if (ifd + 2 > end) return null
  const n = u16(ifd)
  for (let k = 0; k < n; k++) {
    const e = ifd + 2 + k * 12
    if (e + 12 > end) return null
    if (u16(e) === 0x0112) {
      const v = u16(e + 8)
      return v >= 1 && v <= 8 ? v : null
    }
  }
  return null
}

/** A JPEG with an Exif orientation tag put in after its start marker (for tests and made-up photos). */
export function withExifOrientation(jpeg: Uint8Array, orientation: number): Uint8Array {
  // APP1: "Exif\0\0", big-endian TIFF header, one IFD with one entry (orientation, SHORT, 1).
  const tiff = [0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0, 0, 0]
  const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]
  const seg = [0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body]
  const out = new Uint8Array(jpeg.length + seg.length)
  out.set(jpeg.subarray(0, 2), 0)
  out.set(seg, 2)
  out.set(jpeg.subarray(2), 2 + seg.length)
  return out
}
