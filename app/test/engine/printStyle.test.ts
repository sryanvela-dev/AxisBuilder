// Printed line weights and colors (PDF, report images, Sheets view): CAD's default 0.25 mm except the vessel
// (0.35) and the hatch and leaders (0.13); CAD's exact colors by default, softer shades as an option.
import { describe, expect, it } from 'vitest'
import { PDFArray, PDFDocument, PDFRawStream, PDFStream, decodePDFRawStream } from 'pdf-lib'
import { createEmptyProject } from '../../src/data/projectFile.ts'
import { printRgb } from '../../src/engine/aci.ts'
import { lineWeights } from '../../src/engine/styles.ts'
import { goldenJobs, jobPdf } from '../export/pdfJobs.ts'

const mm = (inches: number) => Math.round(inches * 25.4 * 100) / 100

describe('line weights', () => {
  it('defaults to CAD\'s 0.25 mm, the vessel 0.35, the hatch and leaders 0.13', () => {
    const w = lineWeights(createEmptyProject().settings)
    expect(mm(w('VESSEL'))).toBe(0.35)
    for (const l of ['AUT_HATCH', 'NOZZLE_LEADERS', 'HEAD_NOZZLE_LEADERS', 'LEGEND_AUT_HATCH', 'REPORT_LEGEND_MUT']) expect(mm(w(l)), l).toBe(0.13)
    for (const l of ['SCANS', 'SUPPORTS', 'NOZZLES', 'CIRC_WELDS', 'LONG_SEAMS', 'CENTERLINE', 'HEADS', 'X_AXIS', 'Y_AXIS', 'LEGEND', 'TITLE_BLOCK', 'REPORT_X_RULER']) {
      expect(mm(w(l)), l).toBe(0.25)
    }
  })
})

describe('colors', () => {
  it('prints CAD\'s exact colors, 7 black on white', () => {
    expect(printRgb(1)).toEqual([255, 0, 0])
    expect(printRgb(3)).toEqual([0, 255, 0])
    expect(printRgb(5)).toEqual([0, 0, 255])
    expect(printRgb(7)).toEqual([0, 0, 0])
    expect(printRgb(5, true)).toEqual([0, 51, 204])
    expect(printRgb(7, true)).toEqual([0, 0, 0])
  })

  it('the PDF uses them, or the softer shades when chosen', async () => {
    const p = goldenJobs()[0].project
    const content = async (soft: boolean) => {
      const r = await jobPdf({ ...p, settings: { ...p.settings, drawingColors: soft ? 'Softer for screens' : 'Exact CAD colors' } })
      const doc = await PDFDocument.load(r.bytes)
      const c = doc.getPages()[0].node.Contents()!
      const streams = c instanceof PDFArray ? c.asArray().map((x) => doc.context.lookup(x) as PDFStream) : [c]
      return streams.map((s) => new TextDecoder('latin1').decode(s instanceof PDFRawStream ? decodePDFRawStream(s).decode() : s.getContents())).join('\n')
    }
    const exact = await content(false)
    expect(exact).toContain('\n1 0 0 RG')
    expect(exact).toContain('\n0 0 1 RG')
    const soft = await content(true)
    expect(soft).not.toContain('\n0 0 1 RG')
    expect(soft).toContain('\n0 0.2 0.8 RG')
  })
})
