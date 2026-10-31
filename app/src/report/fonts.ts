// The report's fonts (report design 6, brand: Montserrat for headings, Roboto for body text), bundled in
// src/assets/fonts and embedded whole in the PDF. Text is measured here with the fonts' own widths
// (fontMetrics.generated.ts, npm run gen:font-metrics), so the page builders lay out exactly what prints.

import { REPORT_FONT_METRICS } from './fontMetrics.generated.ts'

export type ReportFontId = keyof typeof REPORT_FONT_METRICS
export const REPORT_FONT_IDS = Object.keys(REPORT_FONT_METRICS) as ReportFontId[]

/** CSS family and weight of each font (the Pages view draws with @font-face rules of these names). */
export const FONT_CSS: Record<ReportFontId, { family: string; weight: number }> = {
  'montserrat-600': { family: 'AB Montserrat', weight: 600 },
  'montserrat-700': { family: 'AB Montserrat', weight: 700 },
  'roboto-400': { family: 'AB Roboto', weight: 400 },
  'roboto-500': { family: 'AB Roboto', weight: 500 },
  'roboto-700': { family: 'AB Roboto', weight: 700 },
}

const PT = 72

/** Width in inches of a text at a size in points. */
export function measure(text: string, font: ReportFontId, sizePt: number): number {
  const m = REPORT_FONT_METRICS[font]
  const extra = m.extra as Readonly<Record<number, number>>
  let units = 0
  for (const ch of text) {
    const c = ch.codePointAt(0)!
    units += c >= 32 && c <= 255 ? m.widths[c - 32] : (extra[c] ?? m.unitsPerEm * 0.6)
  }
  return ((units / m.unitsPerEm) * sizePt) / PT
}

/** Ascent, descent (positive, below the baseline) and cap height in inches at a size in points. */
export function fontBox(font: ReportFontId, sizePt: number): { ascent: number; descent: number; cap: number } {
  const m = REPORT_FONT_METRICS[font]
  const k = sizePt / PT / m.unitsPerEm
  return { ascent: m.ascent * k, descent: -m.descent * k, cap: m.capHeight * k }
}

/**
 * Words wrapped to a width (inches): lines of text, breaking at spaces and at explicit line breaks; a word longer
 * than the width is broken by characters. Empty text gives no lines.
 */
export function wrapText(text: string, font: ReportFontId, sizePt: number, width: number): string[] {
  const out: string[] = []
  for (const para of text.replace(/\r\n?/g, '\n').split('\n')) {
    const words = para.split(/ +/).filter((w) => w !== '')
    if (words.length === 0) {
      out.push('')
      continue
    }
    let line = ''
    for (const word of words) {
      const tryLine = line ? `${line} ${word}` : word
      if (measure(tryLine, font, sizePt) <= width + 1e-9) {
        line = tryLine
        continue
      }
      if (line) out.push(line)
      if (measure(word, font, sizePt) <= width + 1e-9) {
        line = word
        continue
      }
      // A word wider than the line: broken by characters.
      let part = ''
      for (const ch of word) {
        if (part && measure(part + ch, font, sizePt) > width) {
          out.push(part)
          part = ''
        }
        part += ch
      }
      line = part
    }
    out.push(line)
  }
  while (out.length > 0 && out[out.length - 1] === '') out.pop()
  return out
}

/** The text shortened with "…" to fit a width (table cells that must stay on one line). */
export function fitText(text: string, font: ReportFontId, sizePt: number, width: number): string {
  if (measure(text, font, sizePt) <= width + 1e-9) return text
  let t = text
  while (t.length > 0 && measure(`${t}…`, font, sizePt) > width) t = t.slice(0, -1)
  return `${t.trimEnd()}…`
}
