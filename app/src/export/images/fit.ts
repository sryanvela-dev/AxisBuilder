// Size of a processed scan image (see docs/overlay-image-scaling.md, "Web app"): keep the photo's own
// detail and correct only its shape. One direction is stretched so width:height equals the scan's
// width:height; the other direction is never shrunk. Only when the long side would pass the size cap
// are both directions scaled down together, so the shape stays exact.

export interface FitSize {
  width: number
  height: number
  /** The image was scaled down to the size cap. */
  capped: boolean
  /** Which direction was stretched to fix the shape (none when the photo already had it). */
  stretched: 'width' | 'height' | 'none'
}

/**
 * Pixel size of the processed image for a photo of photoW x photoH and a scan of scanW x scanH (any
 * units). Whole pixels: the side not given exactly is rounded to the nearest pixel, so
 * |width - height * scanW / scanH| <= 0.5.
 */
export function fitSize(photoW: number, photoH: number, scanW: number, scanH: number, maxSide: number): FitSize {
  if (!(photoW > 0 && photoH > 0)) throw new Error('The photo has no size.')
  if (!(scanW > 0 && scanH > 0)) throw new Error('The scan has no size.')
  const ratio = scanW / scanH
  let width: number
  let height: number
  let stretched: FitSize['stretched']
  if (Math.abs(photoW / photoH - ratio) < 1e-9) {
    width = photoW
    height = photoH
    stretched = 'none'
  } else if (photoW / photoH < ratio) {
    // Too narrow for the scan: stretch the width.
    height = photoH
    width = Math.max(photoW, Math.round(photoH * ratio))
    stretched = 'width'
  } else {
    // Too wide: stretch the height.
    width = photoW
    height = Math.max(photoH, Math.round(photoW / ratio))
    stretched = 'height'
  }
  if (Math.max(width, height) <= maxSide) return { width, height, capped: false, stretched }
  if (width >= height) return { width: maxSide, height: Math.max(1, Math.round(maxSide / ratio)), capped: true, stretched }
  return { width: Math.max(1, Math.round(maxSide * ratio)), height: maxSide, capped: true, stretched }
}
