// Writes test/export/appOutput.sha256.json: fingerprints of the app's .lsp with all settings at their
// defaults (test/export/fingerprints.ts). appOutput.test.ts checks the exporter still writes exactly this,
// so new settings can't change the drawing until someone changes them. Regenerate only after an approved
// change to the app output:  npx tsx scripts/app-output-fingerprints.ts
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { computeFingerprints } from '../test/export/fingerprints.ts'

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'export', 'appOutput.sha256.json')
const out = computeFingerprints()
writeFileSync(file, JSON.stringify(out, null, 2) + '\n')
console.log(`Wrote ${Object.keys(out).length} fingerprints`)
