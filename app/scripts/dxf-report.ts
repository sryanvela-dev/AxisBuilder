// The DXF (Phase 7a) of every golden job and the sample job, for a check in DraftSight and AutoCAD:
//   npm run dxf:report -- --out "<folder>"
// Writes <folder>\<job>\<job> - AUT Coverage.dxf and, beside it, Processed_Images with a made-up picture for each scan
// image the DXF links (the size it assumes: v5.0's 40 px per inch). The folder must be outside the repo.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { exportDxf, fallbackPixels } from '../src/export/dxf/exportDxf.ts'
import { exportBaseName } from '../src/export/files.ts'
import { drawnScans, imageInserts } from '../src/engine/layout.ts'
import { goldenJobs } from '../test/export/pdfJobs.ts'
import { simplePng } from './simplePng.ts'

const outAt = process.argv.indexOf('--out')
if (outAt < 0 || !process.argv[outAt + 1]) {
  console.error('Usage: npm run dxf:report -- --out "<folder outside the repo>"')
  process.exit(1)
}
const outDir = resolve(process.argv[outAt + 1])
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
if (!relative(repo, outDir).startsWith('..')) {
  console.error('The folder is inside the repo. Choose one outside it (the DXFs are a test output, never committed).')
  process.exit(1)
}
const colors: [number, number, number][] = [[200, 60, 60], [60, 150, 80], [60, 90, 200], [210, 140, 40], [150, 70, 170]]
for (const { name, project } of goldenJobs()) {
  const dir = join(outDir, name)
  mkdirSync(join(dir, 'Processed_Images'), { recursive: true })
  const r = exportDxf(project)
  const file = `${exportBaseName(name)}.dxf`
  writeFileSync(join(dir, file), r.text, 'latin1')
  const inserts = project.settings.generateOverlayDrawing ? imageInserts(project, drawnScans(project), false) : []
  inserts.forEach((ins, i) => {
    const [w, h] = fallbackPixels(ins.w, ins.h)
    writeFileSync(join(dir, 'Processed_Images', ins.fileName), simplePng(w, h, colors[i % colors.length]))
  })
  console.log(`${name.padEnd(9)} ${file}: ${(r.text.length / 1024).toFixed(0)} KB, ${r.images.length} images`)
}
console.log(`Written to ${outDir}`)
