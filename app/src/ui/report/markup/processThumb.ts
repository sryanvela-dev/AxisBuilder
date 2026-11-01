// A report picture's thumbnail with its pixel edits applied (auto levels, redactions) with the PDF's own code
// (report/imageProcess.ts), for the Pages view and the markup editor, so the screen shows what the PDF prints.

import { applyPixelEdits } from '../../../report/imageProcess.ts'
import type { Redaction } from '../../../report/pageModel.ts'
import type { FracBox } from '../../../report/schema.ts'

/** The thumbnail (an upright picture's object URL) with the edits applied, as a new object URL. */
export async function processThumb(url: string, edits: { autoLevels: boolean; redactions: readonly Redaction[]; crop: FracBox | null }): Promise<string> {
  const blob = await (await fetch(url)).blob()
  const bmp = await createImageBitmap(blob)
  try {
    const canvas = new OffscreenCanvas(bmp.width, bmp.height)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bmp, 0, 0)
    const px = ctx.getImageData(0, 0, bmp.width, bmp.height)
    applyPixelEdits(px, edits, undefined, edits.crop)
    ctx.putImageData(px, 0, 0)
    return URL.createObjectURL(await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.88 }))
  } finally {
    bmp.close()
  }
}
