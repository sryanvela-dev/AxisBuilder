// Fingerprints of the app's .lsp with all settings at their defaults (test/export/fingerprints.ts).
// appOutput.test.ts checks the exporter still writes exactly test/export/appOutput.sha256.json, so new
// settings can't change the drawing until someone changes them.
//   npm run fingerprints:check   lists which jobs' output differs from the saved fingerprints (writes nothing)
//   npm run fingerprints:write   saves the current fingerprints; only after an approved change to the app output
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { computeFingerprints } from '../test/export/fingerprints.ts'

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'export', 'appOutput.sha256.json')
const out = computeFingerprints()
if (process.argv.includes('--check')) {
  const saved = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>
  for (const [job, sha] of Object.entries(out)) console.log(`${job}: ${saved[job] === sha ? 'same' : 'CHANGED'}`)
} else {
  writeFileSync(file, JSON.stringify(out, null, 2) + '\n')
  console.log(`Wrote ${Object.keys(out).length} fingerprints`)
}
