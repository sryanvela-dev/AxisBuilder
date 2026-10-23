// Size of a processed scan image (see docs/overlay-image-scaling.md, "Web app"): keep the photo's own
// detail and correct only its shape. One direction is stretched so width:height equals the scan's
// width:height; the other direction is never shrunk. When the long side would pass the size cap, both
// directions are scaled down together, so the shape stays exact. The image is never smaller than the
// Excel version made it (40 px per inch of scan, at least 100 px each way): if the capped size is, it is
// raised to the smallest exact-shape size that covers that.

/** The Excel version's resolution: pixels per inch of scan, and its smallest side. */
export const EXCEL_PX_PER_IN = 40
export const EXCEL_MIN_SIDE = 100

export interface FitSize {
  width: number
  height: number
  /** The image was scaled down to the size cap. */
  capped: boolean
  /** The image was made bigger to match the Excel version's size (photo small, or cap too tight). */
  raised: boolean
  /** Which direction was stretched to fix the shape (none when the photo already had it). */
  stretched: 'width' | 'height' | 'none'
}

/** The Excel version's size for a scan (inches): w x 40 by h x 40 px, at least 100 px each way. */
export function excelSize(scanW: number, scanH: number): { width: number; height: number } {
  return {
    width: Math.max(EXCEL_MIN_SIDE, Math.round(scanW * EXCEL_PX_PER_IN)),
    height: Math.max(EXCEL_MIN_SIDE, Math.round(scanH * EXCEL_PX_PER_IN)),
  }
}

/**
 * Pixel size of the processed image for a photo of photoW x photoH and a scan of scanW x scanH inches.
 * Whole pixels: the side not given exactly is rounded to the nearest pixel, so
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
  let capped = false
  if (Math.max(width, height) > maxSide) {
    capped = true
    if (width >= height) {
      width = maxSide
      height = Math.max(1, Math.round(maxSide / ratio))
    } else {
      height = maxSide
      width = Math.max(1, Math.round(maxSide * ratio))
    }
  }
  // Never smaller than the Excel version's image (same exact shape, covering its size).
  const excel = excelSize(scanW, scanH)
  if (width < excel.width || height < excel.height) {
    let w = excel.width
    let h = Math.round(w / ratio)
    if (h < excel.height) {
      h = excel.height
      w = Math.round(h * ratio)
    }
    if (w > width || h > height) return { width: w, height: h, capped, raised: true, stretched }
  }
  return { width, height, capped, raised: false, stretched }
}
