// The DXF image-path test kit (Phase 7a): which way of writing an image's path in a DXF do DraftSight and AutoCAD find,
// and keep when the folder moves?
//
//   npm run dxfpath:test -- "<output folder>"
//
// Writes into the output folder (outside the repo; a test output, never committed):
//   P1 ... P5 .dxf      one tiny drawing each, linking one picture by a different path form (see METHODS)
//   Processed_Images\   the pictures P1.png .. P4.png;  P5.png sits next to the DXFs
//   README.txt          what to open and what to look for in each program
// The DXFs are written by the app's own DXF writer (src/export/dxf/dxfFile.ts), as the real export writes them.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeDxf, type DxfEntity } from '../src/export/dxf/dxfFile.ts'
import { DXF_FONT } from '../src/export/dxf/exportDxf.ts'
import { simplePng } from './simplePng.ts'

const outArg = process.argv[2]
if (!outArg) {
  console.error('Usage: npm run dxfpath:test -- "<output folder outside the repo>"')
  process.exit(1)
}
const outDir = resolve(outArg)
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
if (!relative(repo, outDir).startsWith('..')) {
  console.error('The folder is inside the repo. Choose one outside it (the kit is a test output, never committed).')
  process.exit(1)
}
const imgDir = join(outDir, 'Processed_Images')
mkdirSync(imgDir, { recursive: true })

const METHODS: { code: string; path: string; note: string; rgb: [number, number, number]; nextToDxf?: boolean }[] = [
  { code: 'P1', path: '.\\Processed_Images\\P1.png', note: 'relative, starting with .\\ (what the app writes)', rgb: [200, 40, 40] },
  { code: 'P2', path: 'Processed_Images\\P2.png', note: 'relative, no .\\', rgb: [30, 140, 60] },
  { code: 'P3', path: 'Processed_Images/P3.png', note: 'relative with a forward slash', rgb: [40, 80, 200] },
  { code: 'P4', path: join(imgDir, 'P4.png'), note: 'full Windows path (as v5.0 writes; for comparison)', rgb: [220, 120, 20] },
  { code: 'P5', path: 'P5.png', note: 'file name only, picture next to the DXF', rgb: [150, 60, 170], nextToDxf: true },
]

for (const m of METHODS) {
  writeFileSync(m.nextToDxf ? join(outDir, `${m.code}.png`) : join(imgDir, `${m.code}.png`), simplePng(480, 240, m.rgb))
  // A 24 x 12 in frame with the picture fitted inside it, and a note saying which path form this is.
  const entities: DxfEntity[] = [
    { t: 'LWPOLYLINE', layer: 'SCANS', pts: [[0, 0], [24, 0], [24, 12], [0, 12]], closed: true },
    { t: 'IMAGE', layer: 'SCAN_IMAGES', file: m.path, at: [0, 0], u: [24 / 480, 0], v: [0, 12 / 240], px: [480, 240] },
    { t: 'TEXT', layer: 'SCAN_TEXT', at: [0, -3], base: [0, -3.75], h: 1.5, rot: 0, text: `${m.code}: ${m.note}`, just: 'ML' },
    { t: 'TEXT', layer: 'SCAN_TEXT', at: [0, -6], base: [0, -6.5], h: 1, rot: 0, text: `Path in the file: ${m.path}`, just: 'ML' },
  ]
  const layers = ['0', 'SCANS', 'SCAN_IMAGES', 'SCAN_TEXT'].map((name) => ({ name, color: 7, lineWeight: 25, transparency: 0, off: false, plot: true }))
  writeFileSync(join(outDir, `${m.code}.dxf`), writeDxf({ layers, entities, extents: [-1, -8, 25, 13], imageFrames: true, font: DXF_FONT }), 'latin1')
}

const lines = [
  'AxisBuilder DXF image-path test (Phase 7a)',
  '==========================================',
  '',
  'Each P1..P5 .dxf is a 24 x 12 in frame that should show a colored picture inside it (white frame, a white',
  'diagonal, a dark block in the TOP LEFT corner: if that block is anywhere else, the picture is turned or flipped).',
  'The text under the frame says which way the picture\'s path is written.',
  '',
  ...METHODS.map((m) => `  ${m.code}  ${m.note}`),
  '',
  'In DraftSight and in AutoCAD:',
  '  1. Open each P*.dxf from this folder (File > Open, file type DXF). Zoom Extents if needed.',
  '     Write down for each: picture shown? right way up? any message when opening?',
  '  2. Close them. Move or copy this whole folder somewhere else (or rename it), open each again.',
  '     Which pictures are still found?',
  '  3. Open P1.dxf, save it as a DWG in the same folder, close and open the DWG. Picture still there?',
  '     In the image manager (AutoCAD: EXTERNALREFERENCES; DraftSight: the References palette / IMAGE),',
  '     what path does it show for P1 (relative or full)?',
  '',
  'Results (fill in):',
  '              DraftSight            AutoCAD',
  '              open  moved  DWG      open  moved  DWG',
  ...METHODS.map((m) => `  ${m.code}         ____  _____  ___      ____  _____  ___`),
  '',
  'The app writes P1\'s form. If P1 fails anywhere and another form works, tell Claude which.',
]
writeFileSync(join(outDir, 'README.txt'), lines.join('\r\n') + '\r\n')
console.log(`DXF image-path test kit written to ${outDir}`)
