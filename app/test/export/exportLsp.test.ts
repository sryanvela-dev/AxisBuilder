import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { openProject, type Project } from '../../src/data/index.ts'
import { ExportBlockedError, clockPositionDegrees, exportLsp, exportProblems } from '../../src/export/lsp/exportLsp.ts'
import { SECTION_NAMES, splitLsp, type SectionName } from '../golden/lspSections.ts'

// These cover branches REF1 (Horizontal CW, DraftSight) can't prove. The expected text follows the
// v5.0 VBA; it is not yet confirmed by a real v5.0 run (see app/docs/phase2-notes.md).

function ref1(change?: (p: Project) => void): Project {
  const r = openProject(readFileSync(new URL('../golden/REF1/project.json', import.meta.url), 'utf8'))
  if (!r.ok) throw new Error(r.errors.join('\n'))
  const p = structuredClone(r.project)
  change?.(p)
  return p
}

const opts = { processedImageFolder: 'C:\\Jobs\\Processed', generatedAt: new Date(2026, 0, 2, 3, 4, 5) }
const exportText = (p: Project) => exportLsp(p, opts)
const section = (text: string, name: SectionName) => splitLsp(text).find((s) => s.name === name)!.text

describe('output format', () => {
  const out = exportText(ref1())

  it('uses CRLF line endings and ends with one', () => {
    expect(out.endsWith('(princ)\r\n')).toBe(true)
    expect(out.split('\n').length - 1).toBe(out.split('\r\n').length - 1)
  })

  it('writes the header like v5.0', () => {
    expect(out.startsWith(';;; AxisBuilder v5.0 - One Generated Layered Drawing\r\n;;; Generated from Excel on 2026-01-02 03:04:05\r\n')).toBe(true)
  })

  it('writes image paths with forward slashes under the processed folder', () => {
    expect(section(out, 'images')).toContain('"C:/Jobs/Processed/S1_FIT_B12.png"')
  })
})

describe('AutoCAD output (not yet proven by a REF job)', () => {
  const out = exportText(ref1((p) => (p.settings.cadPlatform = 'AutoCAD')))

  it('switches the platform lines', () => {
    expect(out).toContain(';;; Load in AutoCAD with APPLOAD/LOADAPPLICATION, then type AXISBUILDER.\r\n')
    expect(out).toContain('(setq SL_CAD_PLATFORM "AUTOCAD")\r\n')
    expect(out).not.toContain('(setq SL_CAD_PLATFORM "DRAFTSIGHT")')
  })

  it('uses the AutoCAD image helpers and drawing command', () => {
    expect(section(out, 'imageHelpers')).toMatch(/^;;; AutoCAD overlay image insertion helpers/)
    expect(section(out, 'imageHelpers')).not.toContain('EDITIMAGE')
    expect(section(out, 'drawSetup')).toContain('(defun c:SCANOVERLAY ( / *error* vesselXLen vesselYLen spacing oldOsmode oldCmdecho oldNomutt)')
    expect(section(out, 'drawSetup')).toContain('  (setvar "NOMUTT" 1)')
    expect(section(out, 'drawFinish')).toContain('  (SL_ActivateSheet "Layout1")')
    expect(section(out, 'drawFinish')).toContain('  (setvar "CMDECHO" oldCmdecho)')
  })

  it('still splits into every section', () => {
    expect(splitLsp(out).filter((s) => s.text === '').map((s) => s.name)).toEqual([])
    expect(splitLsp(out).map((s) => s.name)).toEqual([...SECTION_NAMES])
  })
})

describe('other orientations (not yet proven by a REF job)', () => {
  it('Vertical: rulers, reference labels and right panel', () => {
    const out = exportText(ref1((p) => (p.vessel.orientation = 'Vertical')))
    expect(section(out, 'rulers')).toContain('  ;; Vertical/default visual BOTTOM + LEFT rulers\r\n  (SL_RulerX 0.0 (- 0.0 2.) vesselXLen spacing "X_AXIS"')
    expect(section(out, 'referenceLabels')).toContain('  (SL_Line 0.0 vesselYLen 0.0 (+ vesselYLen 2.) "X_AXIS")')
    // Panel left = circumference 302 + 12; legend anchor 10.8 above the vessel bottom.
    expect(section(out, 'legend')).toContain('  (SL_Legend 314. 10.8)')
    expect(section(out, 'jobSettings')).toContain('(setq SL_LEGEND_ORIENTATION_TEXT "Orientation: Vertical")')
  })

  it('Horizontal CCW: rulers and right panel', () => {
    const out = exportText(ref1((p) => (p.vessel.orientation = 'Horizontal CCW')))
    expect(section(out, 'rulers')).toContain('  ;; Horizontal CCW visual BOTTOM + LEFT rulers\r\n  (SL_RulerY_CCW_Bottom (- 0.0 2.) 0.0 vesselYLen spacing "Y_AXIS"')
    expect(section(out, 'legend')).toContain('  (SL_Legend 15.8 -27.)')
  })

  it('reference labels go to the opposite side when the X ruler is on that side', () => {
    const out = exportText(ref1((p) => {
      p.vessel.orientation = 'Vertical'
      p.settings.rulerPlacement = 'Top + Left'
    }))
    expect(section(out, 'referenceLabels')).toContain('  (SL_Line 0.0 0.0 0.0 (- 0.0 2.) "X_AXIS")')
    expect(section(out, 'rulers')).toContain('  ;; Vertical/default visual TOP + LEFT rulers')
  })

  it('a right-side ruler moves the panel 15 in farther right (Vertical and CW)', () => {
    const out = exportText(ref1((p) => (p.settings.rulerPlacement = 'Bottom + Right')))
    expect(section(out, 'legend')).toContain('  (SL_Legend 271.2 387.)')
  })
})

describe('v5.0 quirks kept on purpose', () => {
  it('coverage and the scan count leave out a scan entered reversed, but it is still drawn', () => {
    const p = ref1((x) => {
      const s = x.scans[0]
      ;[s.xStart, s.xStop] = [s.xStop, s.xStart]
    })
    const out = exportText(p)
    expect(out).toContain('(setq SL_LEGEND_TOTAL_SCANS_TEXT "Total Scans: 16")')
    expect(section(out, 'scans')).toContain(`(SL_LabelRect 115. 2. 72. 20. "${p.scans[0].id}"`)
  })

  it('without validation, reversed scans are drawn as entered', () => {
    const p = ref1((x) => {
      x.settings.enableValidation = false
      const s = x.scans[0]
      ;[s.xStart, s.xStop] = [s.xStop, s.xStart]
    })
    expect(section(exportText(p), 'scans')).toContain(`(SL_LabelRect 187. 2. -72. 20. "${p.scans[0].id}"`)
  })

  it('a scan switched off keeps its image unless the image row is off', () => {
    const off = ref1((x) => (x.scans[0].include = false))
    const out = exportText(off)
    expect(section(out, 'scans')).not.toContain(`"${off.scans[0].id}" "SCANS"`)
    expect(section(out, 'images')).toContain('/S1_FIT_B12.png"')
    const imageOff = ref1((x) => (x.scanImages[0].include = false))
    expect(section(exportText(imageOff), 'images')).not.toContain('/S1_FIT_B12.png"')
  })

  it('the Head MUT comment is written whenever head views are on, even with no head MUT', () => {
    expect(section(exportText(ref1()), 'headMut')).toBe('  ;; Head MUT points - overlay right panel\r\n\r\n')
  })
})

describe('head clock positions (v5.0 ClockPositionDegrees)', () => {
  it('converts clock text to degrees', () => {
    expect(clockPositionDegrees('3')).toBe(90)
    expect(clockPositionDegrees('3:30')).toBe(105)
    expect(clockPositionDegrees('10.5')).toBe(315)
    expect(clockPositionDegrees('12')).toBe(0)
    expect(clockPositionDegrees('12:30')).toBe(15)
    expect(clockPositionDegrees('90\u00b0')).toBe(90)
    expect(clockPositionDegrees('')).toBe(0)
    expect(clockPositionDegrees(null)).toBe(0)
  })
})

describe('export guard', () => {
  it('refuses repeated names until they are renamed', () => {
    const p = ref1((x) => (x.headNozzles[0].id = 'N1'))
    expect(exportProblems(p)).toEqual([
      'Head nozzles, item 1 (N1): Nozzle "N1" is also used by Shell nozzles, item 1; rename one before export.',
    ])
    expect(() => exportText(p)).toThrow(ExportBlockedError)
  })

  it('refuses missing measurements', () => {
    const p = ref1((x) => (x.vessel.length = null))
    expect(() => exportText(p)).toThrow('Vessel: Shell length (Y) is not entered yet.')
  })

  it('exports a complete project', () => {
    expect(exportProblems(ref1())).toEqual([])
  })
})
