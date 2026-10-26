// Fingerprints of the DXF (Phase 7a) of every golden job and the sample job (test/export/dxfFingerprints.ts).
// dxf.test.ts checks the DXF still matches test/export/dxfOutput.sha256.json, so changes to it show up.
//   npm run dxf:check   lists which jobs' DXF differs from the saved fingerprints (writes nothing)
//   npm run dxf:write   saves the current fingerprints; only after an approved change to the DXF
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { computeDxfFingerprints } from '../test/export/dxfFingerprints.ts'

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'export', 'dxfOutput.sha256.json')
const out = computeDxfFingerprints()
if (process.argv.includes('--check')) {
  const saved = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>
  for (const [job, sha] of Object.entries(out)) console.log(`${job}: ${saved[job] === sha ? 'same' : 'CHANGED'}`)
} else {
  writeFileSync(file, JSON.stringify(out, null, 2) + '\n')
  console.log(`Wrote ${Object.keys(out).length} DXF fingerprints`)
}
