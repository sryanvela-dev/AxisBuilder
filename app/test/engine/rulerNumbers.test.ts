// Ruler end numbers (app change 22): a tick number that would crowd the ruler's end number is left out (its tick
// stays), the end is always numbered; the same rule in the preview / sheets / PDF (engine) and the app's .lsp.
import { describe, expect, it } from 'vitest'
import { buildDrawing, rulerNumberFits } from '../../src/engine/drawing.ts'
import { exportLsp } from '../../src/export/lsp/exportLsp.ts'
import { goldenJobs } from '../export/pdfJobs.ts'

const OPTIONS = { processedImageFolder: 'X:\\img', generatedAt: new Date(2026, 0, 2, 3, 4, 5) }

describe('ruler end numbers', () => {
  it('leaves out a number that crowds the end and always keeps the end', () => {
    // 300" next to the end at 302": the gap needed is 1.8 x (1 + 0.3 x 8) = 6.12.
    expect(rulerNumberFits(300, 302, 1.8)).toBe(false)
    expect(rulerNumberFits(288, 302, 1.8)).toBe(true)
    expect(rulerNumberFits(302, 302, 1.8)).toBe(true)
    expect(rulerNumberFits(0, 302, 1.8)).toBe(true)
    // Bigger numbers need more room.
    expect(rulerNumberFits(294, 302, 1.8)).toBe(true)
    expect(rulerNumberFits(294, 302, 3)).toBe(false)
  })

  it('writes the same rule into the app .lsp (all nine ruler functions), never in compat v5.0', () => {
    const p = goldenJobs()[0].project
    const app = exportLsp(p, OPTIONS)
    expect(app.match(/\(if \(SL_RulerNumberFits pos length layer\) \(SL_Text /g)).toHaveLength(9)
    expect(app).toContain('(defun SL_RulerNumberFits (pos length layer / h d)')
    const v5 = exportLsp(p, { ...OPTIONS, compat: 'v5.0' })
    expect(v5).not.toContain('SL_RulerNumberFits')
  })

  it('leaves out these numbers in the golden jobs', () => {
    const dropped: Record<string, string[]> = {}
    for (const { name, project } of goldenJobs()) {
      const d = buildDrawing(project)
      for (const it of d.items.filter((i) => i.key.startsWith('ruler:'))) {
        const ticks = it.shapes.filter((s) => s.t === 'line').length - 1 - 1 // minus the ruler line and the arrow's shaft (its head is a polygon)
        const numbers = it.shapes.filter((s) => s.t === 'text' && /^\d+"$/.test(s.text)).map((s) => (s.t === 'text' ? s.text : ''))
        if (numbers.length < ticks) (dropped[name] ??= []).push(`${it.key}: ${ticks - numbers.length} left out, last ${numbers.slice(-2).join(', ')}`)
      }
    }
    // REF1 (302 around, every 20): 300" next to 302"; REF2 (339, every 12): 336"; REF3 / REF4 (458, every 12): 456".
    // At the default 3 in ruler numbers (2026-10-25) also REF2 Y 672" next to 680" and the sample X 180" next to 189".
    const ref1 = ['ruler:X_AXIS: 1 left out, last 280", 302"']
    expect(dropped).toEqual({
      REF1: ref1, 'REF1-ACAD': ref1, 'REF1-CCW': ref1, 'REF1-OFF': ref1,
      REF2: ['ruler:Y_AXIS: 1 left out, last 660", 680"', 'ruler:X_AXIS: 1 left out, last 324", 339"'],
      REF3: ['ruler:X_AXIS: 1 left out, last 444", 458"'],
      REF4: ['ruler:X_AXIS: 1 left out, last 444", 458"'],
      sample: ['ruler:X_AXIS: 1 left out, last 168", 189"'],
    })
  })
})
