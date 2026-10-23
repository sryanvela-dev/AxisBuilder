// SHA-256 of the app's .lsp for every golden job and the sample job (all settings at their defaults).
// Used by scripts/app-output-fingerprints.ts (writes appOutput.sha256.json) and appOutput.test.ts.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openProject } from '../../src/data/projectFile.ts'
import { exportLsp } from '../../src/export/lsp/exportLsp.ts'
import { sampleProject } from '../../src/ui/sampleJob.ts'

const golden = join(dirname(fileURLToPath(import.meta.url)), '..', 'golden')
const OPTIONS = { processedImageFolder: 'X:\\img', generatedAt: new Date(2026, 0, 2, 3, 4, 5) }
const sha = (s: string) => createHash('sha256').update(s).digest('hex')

export function computeFingerprints(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const job of readdirSync(golden, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
    const r = openProject(readFileSync(join(golden, job, 'project.json'), 'utf8'))
    if (!r.ok) throw new Error(r.errors.join('\n'))
    out[job] = sha(exportLsp(r.project, OPTIONS))
  }
  const s = sampleProject()
  out.sample = sha(exportLsp({ ...s, scanImages: s.scans.map((x) => ({ scanId: x.id, imageFile: `${x.id}.png`, processedImage: '', include: true })) }, OPTIONS))
  return out
}
