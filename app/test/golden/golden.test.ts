import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { openProject } from '../../src/data/index.ts'
import { exportLsp } from '../../src/export/lsp/exportLsp.ts'
import {
  SECTION_NAMES,
  compareLsp,
  formatDiffs,
  joinLsp,
  normalizeLsp,
  splitLsp,
  type SectionName,
} from './lspSections.ts'

const golden = (job: string, file: string) => new URL(`./${job}/${file}`, import.meta.url)
// v5.0 writes ANSI; latin1 maps every byte to one character and back unchanged.
const readLsp = (job: string) => readFileSync(golden(job, 'v5.0.lsp')).toString('latin1')

describe('golden job REF1', () => {
  const lsp = readLsp('REF1')

  it('project.json loads and passes the schema', () => {
    const r = openProject(readFileSync(golden('REF1', 'project.json'), 'utf8'))
    if (!r.ok) throw new Error(r.errors.join('\n'))
    expect(r.project.scans.length).toBeGreaterThan(0)
    expect(r.project.settings.processedImageFolder).toBe('<PROCESSED_IMAGES>')
  })

  it('v5.0.lsp keeps v5.0 line endings and has no absolute paths', () => {
    expect(lsp.split('\n').length - 1).toBe(lsp.split('\r\n').length - 1)
    expect(lsp).not.toMatch(/"[A-Za-z]:[\\/]/)
  })

  it('splits into every section, in order, and joins back to the exact file', () => {
    const sections = splitLsp(lsp)
    expect(sections.map((s) => s.name)).toEqual([...SECTION_NAMES])
    expect(joinLsp(sections)).toBe(lsp)
    // REF1 has head views but no shell MUT or head MUT points: those sections hold only their comment.
    for (const s of sections) expect(s.text, s.name).not.toBe('')
  })

  it('puts each drawing call in its own section', () => {
    const byName = Object.fromEntries(splitLsp(lsp).map((s) => [s.name, s.text])) as Record<SectionName, string>
    expect(byName.welds).toMatch(/\(SL_CircWeld /)
    expect(byName.nozzles).toMatch(/\(SL_CircleSmart /)
    expect(byName.images).toMatch(/\(SL_InsertFitImage /)
    expect(byName.headNozzles).toMatch(/\(SL_HeadNozzle /)
    expect(byName.titleBlock).toMatch(/^ {2}\(SL_TitleBlock /)
    expect(byName.nozzles).not.toMatch(/SL_CircWeld|SL_HeadNozzle/)
  })

  it('finds no differences between the file and itself', () => {
    expect(compareLsp(lsp, lsp).every((d) => d.status === 'same')).toBe(true)
    expect(formatDiffs(compareLsp(lsp, lsp))).toBe('')
  })

  it('reports a one-character change in the right section and line', () => {
    const at = lsp.indexOf('(SL_CircWeld ')
    const lineNo = lsp.slice(0, at).split('\n').length
    const changed = lsp.slice(0, at) + '(SL_CircWelD ' + lsp.slice(at + '(SL_CircWeld '.length)
    const diffs = compareLsp(lsp, changed)
    expect(diffs.filter((d) => d.status !== 'same').map((d) => d.name)).toEqual(['welds'])
    const f = diffs.find((d) => d.name === 'welds')!.firstDifference!
    expect(f.expectedLine).toBe(lineNo)
    expect(f.actual).toContain('(SL_CircWelD ')
    expect(formatDiffs(diffs)).toMatch(/^\[welds\] first difference:\n {2}v5\.0 line \d+: .*\n {2}app {2}line \d+: /)
  })

  it('ignores only line endings, the timestamp and image folders', () => {
    const other = lsp
      .replace(/\r\n/g, '\n')
      .replace(/(;;; Generated from Excel on ).*/, '$1 2030-01-01 00:00:00')
      .replace(/"<PROCESSED_IMAGES>\/([^"]+)"/g, '"D:/Some/Other/Folder/$1"')
    expect(normalizeLsp(other)).toBe(normalizeLsp(lsp))
    expect(compareLsp(lsp, other.replace('vesselXLen 302.', 'vesselXLen 303.')).some((d) => d.status !== 'same')).toBe(true)
  })
})

// Per-section parity with v5.0 for every golden job (one folder each, made by make-golden).
const JOBS = readdirSync(new URL('./', import.meta.url), { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(golden(d.name, 'golden.json')))
  .map((d) => d.name)
  .sort()

/**
 * golden.json: `allowedRenames` are the label differences allowed on purpose (README "Renamed for
 * export"): v5.0 printed the repeated name, the app prints the renamed one. Each must occur exactly
 * once in its section, in order. `overrides` are already in project.json (README lists them).
 */
interface GoldenJson {
  overrides: Record<string, string>
  allowedRenames: { section: SectionName; app: string; v5: string }[]
}

/** The time v5.0 wrote on line 2, so the whole file can be compared byte for byte. */
function generatedAt(lsp: string): Date {
  const m = /^;;; Generated from Excel on (\d+)-(\d+)-(\d+) (\d+):(\d+):(\d+)\r?$/m.exec(lsp)
  if (!m) throw new Error('No v5.0 timestamp on line 2')
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number)
  return new Date(y, mo - 1, d, h, mi, s)
}

/** The app output for a golden job, with the allowed label differences put back to the v5.0 text. */
function jobOutput(job: string, compat?: 'v5.0'): string {
  const r = openProject(readFileSync(golden(job, 'project.json'), 'utf8'))
  if (!r.ok) throw new Error(r.errors.join('\n'))
  const spec = JSON.parse(readFileSync(golden(job, 'golden.json'), 'utf8')) as GoldenJson
  const out = exportLsp(r.project, {
    compat,
    processedImageFolder: '<PROCESSED_IMAGES>',
    generatedAt: generatedAt(readLsp(job)),
  })
  const sections = splitLsp(out)
  for (const a of spec.allowedRenames) {
    const sec = sections.find((x) => x.name === a.section)!
    const count = sec.text.split(a.app).length - 1
    if (count !== 1) throw new Error(`Allowed difference ${a.app} found ${count} times in ${a.section}; expected exactly once.`)
    sec.text = sec.text.replace(a.app, a.v5)
  }
  return joinLsp(sections)
}
const ref1Output = (compat?: 'v5.0') => jobOutput('REF1', compat)

describe.each(JOBS)('%s parity with v5.0 (exporter in v5.0 mode vs golden .lsp)', (job) => {
  const lsp = readLsp(job)
  const output = jobOutput(job, 'v5.0')
  const diffs = compareLsp(lsp, output)

  it('v5.0.lsp splits into every section and has no absolute paths', () => {
    expect(splitLsp(lsp).map((s) => s.name)).toEqual([...SECTION_NAMES])
    expect(lsp).not.toMatch(/"[A-Za-z]:[\\/]/)
  })

  for (const name of SECTION_NAMES) {
    it(`section ${name} matches v5.0`, () => {
      const diff = diffs.find((d) => d.name === name)!
      expect(diff.status, formatDiffs([diff])).toBe('same')
    })
  }

  it('matches the whole v5.0 file byte for byte (apart from the allowed labels)', () => {
    expect(output === lsp, formatDiffs(diffs)).toBe(true)
  })
})

describe('REF1 app output: v5.0 plus the requested changes only', () => {
  const app = ref1Output()
  const diffs = compareLsp(readLsp('REF1'), app)

  it('differs from v5.0 only in the sections the changes touch', () => {
    // REF1 has no reversed or switched-off scans and shows its reference labels, so changes 1, 2 and 5
    // don't show here (unit tests cover them). Changes 8-11 (2026-10-23) add the app LISP block (imageHelpers), the
    // centerline transparency (drawSetup) and the nozzle labels placed by the app (nozzles, headNozzles).
    expect(diffs.filter((d) => d.status !== 'same').map((d) => d.name)).toEqual(['header', 'imageHelpers', 'jobSettings', 'drawSetup', 'images', 'nozzles', 'headNozzles', 'titleBlock'])
  })

  it('drops the unused overlay values, names images by scan, prints the date as Oct-13-2026', () => {
    expect(app).not.toMatch(/SL_OVERLAY_PPI|SL_OVERLAY_SCALE/)
    expect(app).toContain('"<PROCESSED_IMAGES>/SCAN_1_FIT.png"')
    expect(app).not.toContain('_FIT_B12.png')
    expect(app).toContain('"DATE: Oct-13-2026"')
    expect(app).not.toContain('"DATE: 10/13/26"')
  })
})
