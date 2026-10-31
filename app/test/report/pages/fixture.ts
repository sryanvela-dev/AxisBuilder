// A V-100 sample job with a report filled in, for the page builder and PDF tests (made-up values, no client data).
import { projectFileSchema, type Project } from '../../../src/data/schema.ts'
import type { ImageInfo, ImageRef } from '../../../src/report/pageModel.ts'
import { createReport } from '../../../src/report/report.ts'
import { scanResultSchema } from '../../../src/report/schema.ts'
import { SAMPLE_DATA } from '../../../src/ui/sampleJobData.ts'

export function sampleWithReport(change: (p: Project) => void = () => {}): Project {
  const p = projectFileSchema.parse(SAMPLE_DATA)
  const r = createReport(p)
  r.components = r.components.map((c) => ({ ...c, nominal: c.kind === 'shell' ? 0.736 : 0.75 }))
  r.job = { ...r.job, jobNumber: '1000001', reportRevision: '0', techs: [{ name: 'A. Tech', title: 'AUT Specialist, Level II' }, { name: 'B. Helper', title: 'AUT Assistant' }] }
  r.text.scope.fields = { purpose: 'detect any possible internal corrosion, pitting, or damage that may be present', areaCovered: 'the bottom 6 feet of the vessel', limitations: '' }
  r.calibration = { ...r.calibration, increments: { x: 0.125, y: 0.05 }, transducers: [{ maker: 'AUT Solutions', mode: 'Longitudinal', element: 'Single', size: '0.375"', frequency: '5 MHz', angle: '0°', serial: 'T-1' }] }
  r.scanResults = p.scans.map((s, i) => scanResultSchema.parse({ scanId: s.id, readings: 100000 + i * 1000, minT: 0.716 + (i % 5) * 0.001, avgT: 0.73 + (i % 3) * 0.002, dataImage: `Scan ${i + 1}.png` }))
  p.report = r
  change(p)
  return projectFileSchema.parse(p)
}

/** Picture sizes for the tests: photos named "<w>x<h>[-o<orientation>].jpg", screenshots 1600 x 900, the rest none. */
export function fakeImages(ref: ImageRef): ImageInfo | null {
  const m = /(\d+)x(\d+)(?:-o(\d))?/.exec(ref.file)
  if (m) return { width: Number(m[1]), height: Number(m[2]), orientation: m[3] ? Number(m[3]) : 1 }
  if (ref.source === 'screenshots' || ref.source === 'brand' || ref.source === 'cover' || ref.source === 'calibration') return { width: 1600, height: 900, orientation: 1 }
  return null
}
