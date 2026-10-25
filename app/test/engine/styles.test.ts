// Text sizes and colors from the Drawing step: every text type's size and color reaches both the .lsp
// and the preview, the same way; defaults change nothing (appOutput.test.ts holds the fingerprints).

import { describe, expect, it } from 'vitest'
import type { Project } from '../../src/data/schema.ts'
import { LINE_LAYERS, SETTINGS, TEXT_TYPES } from '../../src/data/settings.ts'
import { aciHex, colorName } from '../../src/engine/aci.ts'
import { LAYER_COLOR, buildDrawing, type Drawing } from '../../src/engine/drawing.ts'
import { appLayerSetup, panelScales, sizedHeight, textSizeRules } from '../../src/engine/styles.ts'
import { TEXTRESIZE_LAYERS } from '../../src/export/lsp/appLibrary.ts'
import { exportLsp } from '../../src/export/lsp/exportLsp.ts'
import { buildRenderModel } from '../../src/ui/preview/renderModel.ts'
import { sampleProject } from '../../src/ui/sampleJob.ts'
import { AUTOMATIC_TEXT } from '../automaticText.ts'

/** The sample job with every kind of text drawn (weld labels, reference labels and the head 12 o'clock marker on). */
function fullSample(settings: Record<string, unknown> = {}): Project {
  const p = sampleProject()
  return {
    ...p,
    vessel: { ...p.vessel, referenceLabelMode: 'Auto Cardinal' },
    circWelds: p.circWelds.map((w) => ({ ...w, showLabel: true })),
    longSeams: p.longSeams.map((w) => ({ ...w, showLabel: true })),
    settings: { ...p.settings, ...AUTOMATIC_TEXT, showWeldLabels: true, showHeadClockReferences: true, showVesselReferenceLabels: true, ...settings } as Project['settings'],
  }
}

const lsp = (p: Project) => exportLsp(p, { processedImageFolder: 'X:\\img', generatedAt: new Date(2026, 0, 2, 3, 4, 5) })
const lspV5 = (p: Project) => exportLsp(p, { processedImageFolder: 'X:\\img', generatedAt: new Date(2026, 0, 2, 3, 4, 5), compat: 'v5.0' })
/** The (SL_Layer ...) lines the drawing command writes right after (SL_SetupLayers). */
function setupLines(p: Project): string[] {
  const all = lsp(p).split('\r\n')
  const start = all.indexOf('  (SL_SetupLayers)') + 1
  let end = start
  while (all[end].startsWith('  (SL_Layer ')) end++
  return all.slice(start, end)
}
const textsOn =(d: Drawing, layer: string) => d.items.flatMap((i) => i.shapes).filter((s) => s.t === 'text' && s.layer === layer) as { h: number }[]

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
  it("are v5.0's TEXTRESIZE layers plus the app's, with the same default colors", () => {
    const layers = setupTextLayers()
    const defaults = SETTINGS as Record<string, { default: unknown }>
    expect(new Set(TEXT_TYPES.filter((t) => !('appLayer' in t)).map((t) => t.layer))).toEqual(new Set(layers.keys()))
    for (const t of TEXT_TYPES) {
      expect(defaults[`${t.key}Color`].default, t.layer).toBe('appLayer' in t ? LAYER_COLOR[t.layer] ?? 7 : layers.get(t.layer))
    }
  })

  it("are exactly the layers the app's TEXTRESIZE offers", () => {
    expect(TEXTRESIZE_LAYERS.map(([, l]) => l).sort()).toEqual(TEXT_TYPES.map((t) => t.layer).sort())
    const out = lsp(fullSample())
    for (const [label, layer] of TEXTRESIZE_LAYERS) expect(out).toContain(`(list "${label}" "${layer}")`)
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

  it('the default sizes are the fixed heights chosen on 2026-10-25; everything else Automatic', () => {
    const d = sampleProject().settings as unknown as Record<string, unknown>
    const fixed = Object.fromEntries(TEXT_TYPES.filter((t) => d[`${t.key}Size`] === 'Fixed height').map((t) => [t.key, d[`${t.key}Height`]]))
    expect(fixed).toEqual({
      objectText: 3, shellNozzleText: 4, shellMutText: 3, xRulerText: 3, xAxisLabelText: 4, yRulerText: 3, yAxisLabelText: 4,
      headTitleText: 4, headNozzleText: 4, headMutText: 3, legendText: 3, titleBlockText: 3,
    })
    expect(TEXT_TYPES.filter((t) => !(t.key in fixed)).map((t) => d[`${t.key}Size`])).toEqual(Array(5).fill('Automatic'))
  })

  it('Automatic sizes give no size rules, no color changes and no scaled legend or title block', () => {
    const s = fullSample().settings
    expect(textSizeRules(s).size).toBe(0)
    // Only the layers the app adds, in their colors.
    expect(appLayerSetup(s)).toEqual([['NOZZLE_LEADERS', 7], ['HEAD_NOZZLE_LEADERS', 7], ['X_AXIS_LABEL_TEXT', 1], ['REFERENCE_TEXT', 1], ['Y_AXIS_LABEL_TEXT', 5]])
    expect(panelScales(s)).toEqual({ legend: 1, title: 1 })
    expect(lsp(fullSample())).not.toMatch(/SL_LEGEND_SCALE|SL_TITLE_SCALE/)
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
    // Bigger ruler numbers can crowd the end number, so one before it may be left out (rulerNumberFits).
    if (t.layer === 'X_RULER_TEXT' || t.layer === 'Y_RULER_TEXT') {
      expect(after.length).toBeGreaterThanOrEqual(before.length - 2)
      after.forEach((h) => expect(h).toBeCloseTo(before[0] * 1.5, 6)) // all ruler numbers are one height
    } else {
      expect(after).toHaveLength(before.length)
      after.forEach((h, i) => expect(h).toBeCloseTo(before[i] * 1.5, 6))
    }
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
    expect(setupLines(p)).toContain(`  (SL_Layer "${t.layer}" 30)`)
    const model = buildRenderModel(buildDrawing(p))
    expect(model.items.flatMap((i) => i.texts).filter((x) => x.color === 30)).toHaveLength(before.length)
  })
})

describe.each(LINE_LAYERS)('line layer $layer', (l) => {
  it('color reaches the .lsp layer setup and the preview', () => {
    const p = fullSample({ [`${l.key}Color`]: 250 })
    expect(setupLines(p)).toContain(`  (SL_Layer "${l.layer}" 250)`)
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
