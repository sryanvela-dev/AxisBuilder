// Text measured with the font bundled for the printed sheets (Arimo, metric-compatible with Arial): the PDF,
// the report images and the Sheets view draw with it, so these widths are what prints.

import { FONT_CAP_HEIGHT, FONT_UNITS_PER_EM, FONT_WIDTHS } from './fontMetrics.generated.ts'

/** Capital height over font size: CAD text heights are capital heights. */
export const CAP = FONT_CAP_HEIGHT / FONT_UNITS_PER_EM

/** Width of a text at a font size. */
export function textWidth(text: string, fontSize: number): number {
  let units = 0
  for (const ch of text) {
    const c = ch.codePointAt(0)!
    units += c >= 32 && c <= 255 ? FONT_WIDTHS[c - 32] : FONT_UNITS_PER_EM * 0.6
  }
  return (units / FONT_UNITS_PER_EM) * fontSize
}

/** Width of a CAD text of capital height h. */
export const capTextWidth = (text: string, h: number) => textWidth(text, h / CAP)
