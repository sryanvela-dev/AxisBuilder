// The report's brand fonts in the browser: their bundled files (for the PDF) and the @font-face rules the Pages view's
// text uses (report/fonts.ts FONT_CSS names).

import montserrat600 from '../../assets/fonts/Montserrat-SemiBold.ttf?url'
import montserrat700 from '../../assets/fonts/Montserrat-Bold.ttf?url'
import roboto400 from '../../assets/fonts/Roboto-Regular.ttf?url'
import roboto500 from '../../assets/fonts/Roboto-Medium.ttf?url'
import roboto700 from '../../assets/fonts/Roboto-Bold.ttf?url'
import { FONT_CSS, type ReportFontId } from '../../report/fonts.ts'

export const FONT_URLS: Record<ReportFontId, string> = {
  'montserrat-600': montserrat600, 'montserrat-700': montserrat700, 'roboto-400': roboto400, 'roboto-500': roboto500, 'roboto-700': roboto700,
}

let fontsAdded = false
/** Adds the report fonts to the page once (the Pages view's text uses them by name). */
export function addReportFonts() {
  if (fontsAdded || typeof document === 'undefined' || typeof FontFace === 'undefined') return
  fontsAdded = true
  for (const [id, url] of Object.entries(FONT_URLS) as [ReportFontId, string][]) {
    const css = FONT_CSS[id]
    const face = new FontFace(css.family, `url(${url})`, { weight: String(css.weight) })
    document.fonts.add(face)
    void face.load().catch(() => {})
  }
}
