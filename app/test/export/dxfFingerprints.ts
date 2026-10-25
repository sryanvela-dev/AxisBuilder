// SHA-256 of the DXF of every golden job and the sample job (all settings at their defaults, no image sizes read, so
// v5.0's 40 px per inch). Used by scripts/dxf-fingerprints.ts (npm run dxf:check / dxf:write) and dxf.test.ts.
import { createHash } from 'node:crypto'
import { exportDxf } from '../../src/export/dxf/exportDxf.ts'
import { goldenJobs } from './pdfJobs.ts'

export function computeDxfFingerprints(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const j of goldenJobs()) out[j.name] = createHash('sha256').update(exportDxf(j.project).text).digest('hex')
  return out
}
