// Text sizes and colors from the Drawing step: every text type's size and color reaches both the .lsp
// and the preview, the same way; defaults change nothing (appOutput.test.ts holds the fingerprints).

import { describe, expect, it } from 'vitest'
import type { Project } from '../../src/data/schema.ts'
import { LINE_LAYERS, SETTINGS, TEXT_TYPES } from '../../src/data/settings.ts'
import { aciHex, colorName } from '../../src/engine/aci.ts'
import { buildDrawing, type Drawing } from '../../src/engine/drawing.ts'
import { changedLayerColors, sizedHeight, textSizeRules } from '../../src/engine/styles.ts'
import { exportLsp } from '../../src/export/lsp/exportLsp.ts'
import { buildRenderModel } from '../../src/ui/preview/renderModel.ts'
import { sampleProject } from '../../src/ui/sampleJob.ts'

/** The sample job with every kind of text drawn (weld labels and the head 12 o'clock marker on). */
function fullSample(settings: Record<string, unknown> = {}): Project {
  const p = sampleProject()
  return {
    ...p,
    circWelds: p.circWelds.map((w) => ({ ...w, showLabel: true })),
    longSeams: p.longSeams.map((w) => ({ ...w, showLabel: true })),
    settings: { ...p.settings, showWeldLabels: true, showHeadClockReferences: true, ...settings } as Project['settings'],
  }
}

const lsp = (p: Project) => exportLsp(p, { processedImageFolder: 'X:\\img', generatedAt: new Date(2026, 0, 2, 3, 4, 5) })
const lspV5 = (p: Project) => exportLsp(p, { processedImageFolder: 'X:\\img', generatedAt: new Date(2026, 0, 2, 3, 4, 5), compat: 'v5.0' })
const textsOn = (d: Drawing, layer: string) => d.items.flatMap((i) => i.shapes).filter((s) => s.t === 'text' && s.layer === layer) as { h: number }[]

/** The text layers SL_SetupLayers makes for TEXTRESIZE, with their colors. */
function setupTextLayers(): Map<string, number> {
  const all = lsp(fullSample()).split('\r\n')
  const start = all.indexOf('  ;; Dedicated text-only layers used by the TEXTRESIZE command.')
  const lines = all.slice(start, all.indexOf(')', start))
  const out = new Map<string, number>()
  for (const l of lines) {
    const m = /^ {2}\(SL_Layer "(\w+_TEXT)" (\d+)\)$/.exec(l)
    if (m) out.set(m[1], Number(m[2]))
  }
  return out
}

describe('text types', () => {
  it('are exactly the text layers TEXTRESIZE knows, with the same default colors', () => {
    const layers = setupTextLayers()
    expect(new Set(TEXT_TYPES.map((t) => t.layer))).toEqual(new Set(layers.keys()))
    for (const t of TEXT_TYPES) expect((SETTINGS as Record<string, { default: unknown }>)[`${t.key}Color`].default, t.layer).toBe(layers.get(t.layer))
  })

  it('each has a size, scale, height and color setting on the Drawing step', () => {
    const defs = SETTINGS as Record<string, { step: string; group?: string }>
    for (const t of TEXT_TYPES) {
      for (const k of ['Size', 'Scale', 'Height', 'Color']) {
        expect(defs[`${t.key}${k}`], `${t.key}${k}`).toBeDefined()
        expect(defs[`${t.key}${k}`].group).toBe('textStyles')
      }
    }
  })

  it('the full sample draws text on every text layer (so the tests below cover each one)', () => {
    const d = buildDrawing(fullSample())
    for (const t of TEXT_TYPES) expect(textsOn(d, t.layer).length, t.layer).toBeGreaterThan(0)
  })

  it('defaults give no size rules and no color changes', () => {
    const s = fullSample().settings
    expect(textSizeRules(s).size).toBe(0)
    expect(changedLayerColors(s)).toEqual([])
    expect(lsp(fullSample())).not.toContain('SL_TEXT_SIZES')
  })
})

describe.each(TEXT_TYPES)('$layer', (t) => {
  const base = buildDrawing(fullSample())
  const before = textsOn(base, t.layer).map((s) => s.h)

  it('Scale reaches the .lsp and the preview', () => {
    const p = fullSample({ [`${t.key}Size`]: 'Scale', [`${t.key}Scale`]: 1.5 })
    const out = lsp(p)
    expect(out).toContain(`(list "${t.layer}" "SCALE" 1.5)`)
    expect(out).toContain('(rtos (SL_TextHeight textLayer h) 2 3)')
    // The size block redefines SL_Text after the library's own (the last definition wins in LISP).
    expect(out.lastIndexOf('(defun SL_Text (')).toBeGreaterThan(out.indexOf('SL_TEXT_SIZES'))
    const after = textsOn(buildDrawing(p), t.layer).map((s) => s.h)
    expect(after).toHaveLength(before.length)
    after.forEach((h, i) => expect(h).toBeCloseTo(before[i] * 1.5, 6))
    // Only this layer changes.
    for (const o of TEXT_TYPES.filter((x) => x.layer !== t.layer)) {
      expect(textsOn(buildDrawing(p), o.layer).map((s) => s.h)).toEqual(textsOn(base, o.layer).map((s) => s.h))
    }
  })

  it('Fixed height reaches the .lsp and the preview', () => {
    const p = fullSample({ [`${t.key}Size`]: 'Fixed height', [`${t.key}Height`]: 3 })
    expect(lsp(p)).toContain(`(list "${t.layer}" "HEIGHT" 3. ${t.base === null ? 'nil' : String(t.base).includes('.') ? t.base : `${t.base}.`})`)
    const after = textsOn(buildDrawing(p), t.layer).map((s) => s.h)
    after.forEach((h, i) => expect(h).toBeCloseTo(t.base === null ? 3 : before[i] * (3 / t.base!), 6))
    // The main text of the layer gets exactly the height.
    if (t.base !== null) expect(after.some((h) => Math.abs(h - 3) < 1e-9)).toBe(true)
  })

  it('Color reaches the .lsp layer setup and the preview', () => {
    const p = fullSample({ [`${t.key}Color`]: 30 })
    const out = lsp(p).split('\r\n')
    const setup = out.indexOf('  (SL_SetupLayers)')
    expect(out.indexOf(`  (SL_Layer "${t.layer}" 30)`)).toBe(setup + 1)
    const model = buildRenderModel(buildDrawing(p))
    expect(model.items.flatMap((i) => i.texts).filter((x) => x.color === 30)).toHaveLength(before.length)
  })
})

describe.each(LINE_LAYERS)('line layer $layer', (l) => {
  it('color reaches the .lsp layer setup and the preview', () => {
    const p = fullSample({ [`${l.key}Color`]: 250 })
    expect(lsp(p)).toContain(`\r\n  (SL_SetupLayers)\r\n  (SL_Layer "${l.layer}" 250)\r\n`)
    const d = buildDrawing(p)
    expect(d.layerColors[l.layer]).toBe(250)
    const model = buildRenderModel(d)
    for (const x of model.items.flatMap((i) => i.paths).filter((x) => x.layer === l.layer)) expect(x.color).toBe(250)
  })
})

describe('compat v5.0', () => {
  it('ignores sizes and colors', () => {
    const changed = fullSample({ scanTextSize: 'Scale', scanTextScale: 2, vesselColor: 3, legendTextColor: 1 })
    expect(lspV5(changed)).toBe(lspV5(fullSample()))
  })
})

describe('sizedHeight', () => {
  it('scales, sets or keeps the height', () => {
    const rules = textSizeRules({ ...fullSample().settings, legendTextSize: 'Fixed height', legendTextHeight: 4, scanTextSize: 'Scale', scanTextScale: 2 } as Project['settings'])
    expect(sizedHeight(rules, 'LEGEND_TEXT', 2)).toBe(4)
    expect(sizedHeight(rules, 'LEGEND_TEXT', 2.3)).toBeCloseTo(4.6)
    expect(sizedHeight(rules, 'SCAN_TEXT', 1.2)).toBeCloseTo(2.4)
    expect(sizedHeight(rules, 'TITLE_BLOCK_TEXT', 1.8)).toBe(1.8)
  })
})

describe('CAD colors', () => {
  it('match the standard color table', () => {
    expect(aciHex(1)).toBe('#ff0000')
    expect(aciHex(5)).toBe('#0000ff')
    expect(aciHex(10)).toBe('#ff0000')
    expect(aciHex(11)).toBe('#ff8080')
    expect(aciHex(30)).toBe('#ff8000')
    expect(aciHex(250)).toBe('#333333')
    expect(aciHex(255)).toBe('#ffffff')
    expect(colorName(3)).toBe('3 Green')
    expect(colorName(42)).toBe('Color 42')
  })
})
