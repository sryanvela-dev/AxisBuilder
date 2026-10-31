// Writes a report PDF outside the browser, to look at (never into the repo):
//   npm run report:pdf -- --out "<folder>"
// prints the V-100 sample with a made-up report (photos from public/sample-photos plus a made-up sideways phone
// photo; --screenshots "<dir>" adds data-page screenshots named "Scan 1.png" ...). A saved job can be printed instead:
//   npm run report:pdf -- --out "<folder>" --job "<job.axb>" [--photos "<dir>"] [--screenshots "<dir>"]
//     [--cover "<dir>"] [--calibration "<dir>"] [--uploads "<dir>"] [--drawing-photos "<dir>"]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openProject } from '../src/data/projectFile.ts'
import type { Project } from '../src/data/schema.ts'
import { reportPdfName } from '../src/export/files.ts'
import { buildReport } from '../src/report/pages/index.ts'
import { writeReportPdf } from '../src/report/pdf/writeReportPdf.ts'
import { sampleWithReport } from '../test/report/pages/fixture.ts'
import { DRAWING_FONT, REPORT_FONTS, folderImages, sheetPhotosFor, type ReportFolders } from '../test/report/pages/nodeFiles.ts'
import { madeUpPhoto } from '../test/report/pages/photos.ts'

const arg = (name: string) => {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : undefined
}
const out = arg('--out')
if (!out) {
  console.log('Usage: npm run report:pdf -- --out "<folder outside the repo>" [--job "<job.axb>" --photos ... --screenshots ... --drawing-photos ...]')
  process.exit(1)
}
const here = dirname(fileURLToPath(import.meta.url))
const samplePhotos = join(here, '..', 'public', 'sample-photos')

let project: Project
let folders: ReportFolders
const extra = new Map<string, Uint8Array>()
const job = arg('--job')
if (job) {
  const r = openProject(readFileSync(job, 'utf8'))
  if (!r.ok) throw new Error(r.errors.join('\n'))
  if (!r.project.report) throw new Error('That job has no report: start it in the app first.')
  project = r.project
  folders = { photos: arg('--photos'), screenshots: arg('--screenshots'), cover: arg('--cover'), calibration: arg('--calibration'), uploads: arg('--uploads') }
} else {
  extra.set('phone-portrait.jpg', madeUpPhoto(900, 1200, 6))
  project = sampleWithReport((p) => {
    const r = p.report!
    r.coverPhoto = 'S5.jpg'
    r.photos = [
      { file: 'S1.jpg', caption: 'North side of the vessel', alone: false, crop: null, rotate: 0, adjust: { autoLevels: false, darken: 0 }, markup: [] },
      { file: 'phone-portrait.jpg', caption: 'Phone photo stored sideways (EXIF orientation 6)', alone: false, crop: null, rotate: 0, adjust: { autoLevels: false, darken: 0 }, markup: [] },
      { file: 'S3.jpg', caption: 'Nozzle N2 area', alone: false, crop: { x0: 0.2, y0: 0.1, x1: 0.8, y1: 0.9 }, rotate: 0, adjust: { autoLevels: false, darken: 0 }, markup: [] },
      { file: 'S4.jpg', caption: 'Turned a quarter', alone: true, crop: null, rotate: 90, adjust: { autoLevels: false, darken: 0 }, markup: [] },
    ]
  })
  folders = { photos: samplePhotos, cover: samplePhotos, screenshots: arg('--screenshots') }
}

const files = folderImages(folders, extra)
const doc = buildReport({ project, image: files.image, pdfPages: () => null })
const sheetPhotos = await sheetPhotosFor(project, doc, job ? arg('--drawing-photos') : samplePhotos, project.settings.pdfPhotoDpi)
const bytes = await writeReportPdf({ doc, fonts: REPORT_FONTS, drawingFont: DRAWING_FONT, images: files.prepared(doc), sheetPhotos, pdfs: new Map() })
mkdirSync(out, { recursive: true })
const name = reportPdfName(project.project.projectName || 'Report', project.project.client)
writeFileSync(join(out, name), bytes)
console.log(`${join(out, name)}: ${doc.pages.length} pages, ${(bytes.length / 1024 / 1024).toFixed(2)} MB`)
for (const n of doc.notes) console.log(`  - ${n}`)
