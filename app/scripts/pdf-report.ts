// PDF size of every golden job and the sample job, section sheets off and on, with made-up photos of the
// reference jobs' photo size (test/export/pdfJobs.ts):   npm run pdf:report
// npm run pdf:report -- --out "<folder>" also writes the PDFs there, to look at (never into the repo).
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { goldenJobs, jobPdf, withSections } from '../test/export/pdfJobs.ts'

const outAt = process.argv.indexOf('--out')
const outDir = outAt > 0 ? process.argv[outAt + 1] : null
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(2)} MB`
for (const { name, project } of goldenJobs()) {
  for (const on of [false, true]) {
    const r = await jobPdf(withSections(project, on))
    const pages = r.models.map((m) => (m.paper.w > m.paper.h ? 'L' : 'P')).join('')
    const px = [...r.photoSizes.values()].reduce((a, s) => a + s.width * s.height, 0)
    console.log(`${name.padEnd(9)} sections ${on ? 'on ' : 'off'}: ${String(r.models.length).padStart(2)} pages (${pages}), ${String(r.photoSizes.size).padStart(3)} photos, ${(px / 1e6).toFixed(1)} MP, ${mb(r.bytes.length)}`)
    if (outDir) writeFileSync(join(outDir, `${name}${on ? ' sections' : ''}.pdf`), r.bytes)
  }
}
