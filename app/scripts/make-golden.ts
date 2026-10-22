// Makes an anonymized golden reference job for the parity tests from a converted v5.0 job folder.
//
//   node scripts/make-golden.ts "<REF v5.0 folder>" REF1      (npm run golden:make -- ...)
//
// Reads <folder>\<name>_v5.0.xlsm (imported with importWorkbook) and the one .lsp that v5.0 generated
// from it, then writes app/test/golden/<name>/:
//   project.json  the imported job, identifying text replaced with neutral values
//   v5.0.lsp      the v5.0 output with the SAME replacements, byte for byte otherwise (ANSI, CRLF)
//   README.md     what the job covers and which fields were replaced (names only, never the values)
//
// Replacements are made only inside LISP strings, so code and numbers are never touched. Absolute
// folders become fixed placeholders. The script prints field names and counts, never the values.
// The source folder holds real client data: nothing from it may be committed except these outputs.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Project } from '../src/data/schema.ts'
import { saveProject } from '../src/data/projectFile.ts'
import { importWorkbook } from '../src/data/xlsmImport.ts'
import { IMAGE_DIR_PLACEHOLDER } from '../test/golden/lspSections.ts'

const here = dirname(fileURLToPath(import.meta.url))
const [srcDir, name] = process.argv.slice(2)
if (!srcDir || !name || !/^[A-Za-z0-9_-]+$/.test(name)) {
  console.error('Usage: node scripts/make-golden.ts "<REF v5.0 folder>" <NAME>   (NAME like REF1)')
  process.exit(2)
}

const IMAGE_FOLDER_PLACEHOLDER = '<IMAGE_FOLDER>'

/** Fields that can name the client, site or people, with their neutral replacement. */
const PROJECT_FIELDS: Record<string, (job: string) => string> = {
  projectName: (job) => `VESSEL ${job}`,
  component: (job) => `VESSEL ${job}`,
  client: () => 'CLIENT A',
  unit: () => 'UNIT 1',
  inspector: () => 'INSPECTOR A',
  procedure: () => 'PROCEDURE 1',
  reportNumber: () => 'REPORT 1',
  workOrder: () => 'WORK ORDER 1',
  service: () => 'SERVICE A',
  drawingNotes: () => 'NOTE',
  inspectionNotes: () => 'NOTE',
}
const LIST_NOTE_FIELDS = ['shellNozzles', 'objects', 'shellMut', 'headNozzles', 'headMut'] as const

// --- Inputs --------------------------------------------------------------------------------------

const dir = resolve(srcDir)
const xlsm = join(dir, `${name}_v5.0.xlsm`)
if (!existsSync(xlsm)) throw new Error(`Not found: ${name}_v5.0.xlsm in the source folder`)
const lspFiles = readdirSync(dir).filter((f) => /\.lsp$/i.test(f))
if (lspFiles.length !== 1) throw new Error(`Expected exactly one .lsp in the source folder, found ${lspFiles.length}`)

const imported = importWorkbook(readFileSync(xlsm))
const project: Project = structuredClone(imported.project)

// Repeated names: the importer renames the later ones ("N1" -> "N1 (2)") and reports each rename.
// List them in the README; the parity test allows exactly these label differences.
const renames = imported.report.flatMap((e) => {
  const m = /^(.*?): "(.*)" is also used by .*; renamed to "(.*)"/.exec(e.message)
  return m ? [{ listName: m[1], from: m[2], to: m[3] }] : []
})
// ANSI bytes as latin1 text: every byte maps to one character and back unchanged.
let lsp = readFileSync(join(dir, lspFiles[0])).toString('latin1')

// --- Replacements --------------------------------------------------------------------------------

const replacements: { field: string; from: string; to: string }[] = []
const info = project.project as Record<string, unknown>
for (const [field, make] of Object.entries(PROJECT_FIELDS)) {
  const v = info[field]
  if (typeof v !== 'string' || v.trim() === '') continue
  const to = make(name)
  replacements.push({ field: `project.${field}`, from: v, to })
  info[field] = to
}
for (const list of LIST_NOTE_FIELDS) {
  for (const item of project[list] as { notes: string }[]) {
    if (item.notes.trim() === '') continue
    replacements.push({ field: `${list}.notes`, from: item.notes, to: 'NOTE' })
    item.notes = 'NOTE'
  }
}

// Folders: the settings get the placeholders; the .lsp paths are handled below.
const folders: { field: string; from: string; to: string }[] = []
for (const [field, to] of [['originalImageFolder', IMAGE_FOLDER_PLACEHOLDER], ['processedImageFolder', IMAGE_DIR_PLACEHOLDER]] as const) {
  const v = project.settings[field]
  if (v) folders.push({ field: `settings.${field}`, from: v, to })
  project.settings[field] = to
}

/** Applies a replacement inside every LISP string literal, in the given case and upper case. */
function replaceInStrings(text: string, from: string, to: string): { text: string; count: number } {
  let count = 0
  const variants = [...new Set([from, from.toUpperCase()])]
  const out = text.replace(/"((?:[^"\\]|\\.)*)"/g, (_m, body: string) => {
    let b = body
    for (const v of variants) {
      const parts = b.split(v)
      count += parts.length - 1
      b = parts.join(to)
    }
    return `"${b}"`
  })
  return { text: out, count }
}

// Longest values first, so a value that contains another (a name and its short form) is replaced whole.
const counts: Record<string, number> = {}
for (const r of [...replacements].sort((a, b) => b.from.length - a.from.length)) {
  const res = replaceInStrings(lsp, r.from, r.to)
  lsp = res.text
  counts[r.field] = (counts[r.field] ?? 0) + res.count
}

// Absolute paths inside strings: a known image folder becomes its placeholder; anything else stops.
let pathCount = 0
lsp = lsp.replace(/"((?:[^"\\]|\\.)*)"/g, (m, body: string) => {
  if (!/^[A-Za-z]:[\\/]/.test(body)) return m
  const norm = body.replace(/\\\\|\\/g, '/')
  for (const f of folders) {
    const prefix = f.from.replace(/\\/g, '/').replace(/\/$/, '') + '/'
    if (norm.toLowerCase().startsWith(prefix.toLowerCase())) {
      pathCount++
      return `"${f.to}/${norm.slice(prefix.length)}"`
    }
  }
  throw new Error('The .lsp has an absolute path outside the job image folders; ask before continuing.')
})
// A drive letter not preceded by a letter, then a folder name (so "run:\n" in a message doesn't count).
if (/(^|[^A-Za-z])[A-Za-z]:[\\/]+[^\s"\\/]+[\\/]/.test(lsp)) {
  throw new Error('An absolute path is left in the .lsp outside a string; ask before continuing.')
}

// --- Outputs -------------------------------------------------------------------------------------

const out = join(here, '..', 'test', 'golden', name)
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'v5.0.lsp'), Buffer.from(lsp, 'latin1'))
writeFileSync(join(out, 'project.json'), saveProject(project))

const p = project
const c = imported.summary.counts
const renamedText = renames.length
  ? [
      '## Renamed for export',
      '',
      'v5.0 allowed a name to be used twice; the app needs unique names, so the importer renamed these',
      '(and listed them in its import report). The `.lsp` (v5.0) and the app output differ by exactly',
      'these labels, which the parity test allows:',
      '',
      ...renames.map((r) => `- ${r.listName}: "${r.from}" -> "${r.to}"`),
      '',
    ].join('\n')
  : ''
const readme = `# ${name}

Golden reference job for the parity tests: the v5.0 workbook data (\`project.json\`) and the master
\`.lsp\` that AxisBuilder v5.0 generated from it (\`v5.0.lsp\`, tested in CAD by the user).
Made with \`npm run golden:make\` from a real job, anonymized. Don't edit these files by hand.

## What the job covers

| | |
|---|---|
| Orientation | ${p.vessel.orientation} |
| Shell | length ${p.vessel.length} in, circumference ${p.vessel.height} in |
| Shell Features layout (source workbook) | ${imported.summary.layout} |
| CAD platform | ${p.settings.cadPlatform} |
| Head views | ${p.settings.headViewMode} (${p.settings.headViewSize}) |
| Circ welds / long seams | ${c.circWelds} / ${c.longSeams} |
| Shell nozzles / objects / shell MUT | ${c.shellNozzles} / ${c.objects} / ${c.shellMut} |
| Head nozzles / head MUT | ${c.headNozzles} / ${c.headMut} |
| AUT scans / scan images | ${c.scans} / ${c.scanImages} |
| Reference labels | ${p.vessel.referenceLabelMode}, ${p.vessel.referenceLabelSet} |
| AUT hatch | ${p.settings.autHatchEnabled ? 'on' : 'off'}, transparency ${p.settings.autHatchTransparency} |

${renamedText}
## What was replaced

Identifying text was replaced with neutral values in both files (only inside LISP strings in the
\`.lsp\`; geometry, settings, scan names and numbers are unchanged):

${replacements.map((r) => `- \`${r.field}\` -> "${r.to}"`).join('\n') || '- (none)'}
${folders.map((f) => `- \`${f.field}\` -> \`${f.to}\``).join('\n')}
- Absolute image paths in the \`.lsp\` -> \`${IMAGE_DIR_PLACEHOLDER}/<file>\`

No scan photos are included. The \`.lsp\` keeps v5.0's ANSI encoding and CRLF line endings
(\`.gitattributes\`: \`-text\`) and its generation timestamp; the comparison ignores the timestamp.
`
writeFileSync(join(out, 'README.md'), readme)

console.log(`Wrote test/golden/${name}/ (project.json, v5.0.lsp, README.md)`)
for (const r of replacements) console.log(`  ${r.field}: replaced (${counts[r.field] ?? 0} in the .lsp)`)
for (const f of folders) console.log(`  ${f.field}: placeholder`)
console.log(`  absolute image paths in the .lsp: ${pathCount}`)
