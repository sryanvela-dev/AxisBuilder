// Makes an anonymized golden reference job for the parity tests from a converted v5.0 job folder.
//
//   node scripts/make-golden.ts "<REF v5.0 folder>" REF1      (npm run golden:make -- ...)
//   node scripts/make-golden.ts "<REF1 v5.0 folder>" REF1-CCW --xlsm REF1_v5.0.xlsm
//        --lsp "<file>_CCW.lsp" --set "vessel.orientation=Horizontal CCW"
//
// Reads <folder>\<name>_v5.0.xlsm (or --xlsm) imported with importWorkbook, applies any --set
// overrides (for a variant generated after changing settings in the workbook without saving it), and
// the one .lsp in the folder (or --lsp) that v5.0 generated from it. Then writes app/test/golden/<name>/:
//   project.json  the imported job, identifying text replaced with neutral values
//   v5.0.lsp      the v5.0 output with the SAME replacements, byte for byte otherwise (ANSI, CRLF)
//   README.md     what the job covers and which fields were replaced (names only, never the values)
//   golden.json   test data: the settings overrides and the label differences the parity test allows
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
import { IMAGE_DIR_PLACEHOLDER, splitLsp } from '../test/golden/lspSections.ts'

const here = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const positional: string[] = []
const sets: [string, string][] = []
let xlsmName: string | undefined
let lspName: string | undefined
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--xlsm') xlsmName = argv[++i]
  else if (argv[i] === '--lsp') lspName = argv[++i]
  else if (argv[i] === '--set') {
    const m = /^([a-z]+\.[A-Za-z0-9]+)=(.*)$/.exec(argv[++i] ?? '')
    if (!m) throw new Error('--set needs section.key=value, e.g. vessel.orientation=Horizontal CCW')
    sets.push([m[1], m[2]])
  } else positional.push(argv[i])
}
const [srcDir, name] = positional
if (!srcDir || !name || !/^[A-Za-z0-9_-]+$/.test(name)) {
  console.error('Usage: node scripts/make-golden.ts "<REF v5.0 folder>" <NAME> [--xlsm FILE] [--lsp FILE] [--set section.key=value]...')
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
const xlsm = join(dir, xlsmName ?? `${name}_v5.0.xlsm`)
if (!existsSync(xlsm)) throw new Error('Workbook not found in the source folder')
const lspFiles = lspName ? [lspName] : readdirSync(dir).filter((f) => /\.lsp$/i.test(f))
if (lspFiles.length !== 1) throw new Error(`Expected exactly one .lsp in the source folder (or --lsp), found ${lspFiles.length}`)

const imported = importWorkbook(readFileSync(xlsm))
const project: Project = structuredClone(imported.project)

// Settings overrides for a variant (given as text; numbers and Yes/No converted).
for (const [path, text] of sets) {
  const [section, key] = path.split('.') as ['project' | 'vessel' | 'settings', string]
  const target = project[section] as Record<string, unknown> | undefined
  if (!target || !(key in target)) throw new Error(`Unknown setting ${path}`)
  const old = target[key]
  target[key] = typeof old === 'number' ? Number(text) : typeof old === 'boolean' ? /^(yes|true|1)$/i.test(text) : text
}

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

// The LISP section of each list, for the label differences the parity test allows.
const SECTION_OF: Record<string, string> = {
  'Circ welds': 'welds', 'Long seams': 'welds', 'Shell nozzles': 'nozzles', Objects: 'objects', 'Shell MUT': 'shellMut',
  'Head nozzles': 'headNozzles', 'Head MUT': 'headMut', 'AUT scans': 'scans',
}
const lspSections = splitLsp(lsp)
const golden = {
  overrides: Object.fromEntries(sets),
  // Only labels the drawing prints (e.g. head nozzles are not drawn with head views off).
  allowedRenames: renames.flatMap((r) => {
    const section = SECTION_OF[r.listName]
    if (!section) throw new Error(`No LISP section for renamed ${r.listName}`)
    const text = lspSections.find((s) => s.name === section)!.text
    return text.includes(`"${r.from}"`) ? [{ section, app: `"${r.to}"`, v5: `"${r.from}"` }] : []
  }),
}
writeFileSync(join(out, 'golden.json'), JSON.stringify(golden, null, 2) + '\n')

const settingsText = sets.length
  ? [
      '## Settings changed for this job',
      '',
      'v5.0 generated this .lsp after these settings were changed in the workbook (not saved), so',
      '`project.json` has them too:',
      '',
      ...sets.map(([k, v]) => `- \`${k}\` = "${v}"`),
      '',
    ].join('\n')
  : ''

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

${settingsText}${renamedText}
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
