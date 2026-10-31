import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderReportFontMetrics } from '../../scripts/gen-font-metrics.ts'
import { fitText, measure, wrapText } from '../../src/report/fonts.ts'

describe('report fonts', () => {
  it('the generated metrics are up to date (npm run gen:font-metrics)', () => {
    expect(readFileSync(new URL('../../src/report/fontMetrics.generated.ts', import.meta.url), 'utf8')).toBe(renderReportFontMetrics())
  })

  it('measures with each font: bold is wider than regular, size scales the width', () => {
    expect(measure('Scan Sheet', 'roboto-700', 10)).toBeGreaterThan(measure('Scan Sheet', 'roboto-400', 10))
    expect(measure('Scan Sheet', 'roboto-400', 20)).toBeCloseTo(2 * measure('Scan Sheet', 'roboto-400', 10), 10)
    expect(measure('–’…', 'roboto-400', 10)).toBeGreaterThan(0)
  })

  it('wraps at spaces and line breaks, never wider than the width', () => {
    const text = 'Integrity EPC was asked to perform an Automated Ultrasonic Testing (AUT) Corrosion Mapping Examination on V-100.\nSecond paragraph.'
    const lines = wrapText(text, 'roboto-400', 9.5, 3)
    expect(lines.length).toBeGreaterThan(3)
    expect(lines[lines.length - 1]).toBe('Second paragraph.')
    for (const l of lines) expect(measure(l, 'roboto-400', 9.5)).toBeLessThanOrEqual(3)
    expect(wrapText('', 'roboto-400', 9, 2)).toEqual([])
    expect(wrapText('Averyveryveryverylongwordthatdoesnotfit', 'roboto-400', 12, 0.8).length).toBeGreaterThan(1)
  })

  it('shortens text with an ellipsis to fit', () => {
    const t = fitText('No significant I.D. wall loss detected.', 'roboto-400', 8, 1)
    expect(t.endsWith('…')).toBe(true)
    expect(measure(t, 'roboto-400', 8)).toBeLessThanOrEqual(1)
  })
})
