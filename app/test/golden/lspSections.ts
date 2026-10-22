// Golden-file harness: splits a v5.0 master .lsp into named sections that follow the order in which
// SLG_Utilities.ExportAxisBuilderLSP writes it, and compares two .lsp files section by section.
//
// Each section starts at a line the VBA always emits (a comment, a defun or a call). Sections the job
// doesn't produce (for example head views when Head View Mode is NONE) are simply empty. Splitting and
// joining gives back the exact text.

export const SECTION_NAMES = [
  // Header (WriteLispHeader start)
  'header', // ";;; AxisBuilder v5.0 ..." lines, including the generation timestamp
  'platform', // SL_CAD_PLATFORM, SL_HATCH_TRANSPARENCY
  // Fixed function library
  'libCore', // point/transform helpers, layers, viewport layers, ABVIEWPORTFIX, SL_SetupLayers
  'libText', // text and legend reflow helpers, TEXTRESIZE
  'nozzleWrap', // NOZZLEWRAP
  'objectWrap', // OBJECTWRAP
  'sectionViewports', // viewport / paper-space helpers, SECTIONVIEWPORTS
  'sectionPages', // SECTIONPAGES
  'menuLauncher', // AXISBUILDER master launcher (first definition), SCANMENU
  'drawingHelpers', // hatch, labels, MUT points, nozzles, arrows, rulers, legend, welds, title block, heads
  'imageHelpers', // overlay image insertion helpers
  // Job values
  'jobSettings', // SL_ORIENTATION ... section-page title/legend lines
  // Drawing command c:SCANOVERLAY
  'drawSetup',
  'vessel',
  'scans',
  'images',
  'objects',
  'nozzles',
  'shellMut',
  'welds',
  'rulers',
  'referenceLabels',
  'headViews',
  'headNozzles',
  'headMut',
  'legend',
  'titleBlock',
  'drawFinish', // zoom, viewport assignment, end of c:SCANOVERLAY, AXISDRAWING alias
  // Commands
  'visibility', // layout/overlay views
  'layerGroups', // grouped layer toggles, ABVISIBILITY
  'launcher', // one-drawing AXISBUILDER launcher
  'footer', // SCANMENU alias and load message
] as const

export type SectionName = (typeof SECTION_NAMES)[number]

interface Start {
  /** The line that starts the section. */
  match: RegExp
  /** Also take the ";;" comment lines directly above it (banner comments). */
  withCommentsAbove?: boolean
}

const STARTS: Record<SectionName, Start> = {
  header: { match: /^;;; AxisBuilder / },
  platform: { match: /^\(setq SL_CAD_PLATFORM / },
  libCore: { match: /^\(defun SL_pt / },
  libText: { match: /^\(defun SL_Line / },
  nozzleWrap: { match: /^;; NOZZLEWRAP /, withCommentsAbove: true },
  objectWrap: { match: /^;; OBJECTWRAP /, withCommentsAbove: true },
  sectionViewports: { match: /^\(defun SL_LockViewport /, withCommentsAbove: true },
  sectionPages: { match: /^;; SECTIONPAGES /, withCommentsAbove: true },
  menuLauncher: { match: /^;; AXISBUILDER - master launcher/, withCommentsAbove: true },
  drawingHelpers: { match: /^\(defun SL_HatchRect / },
  imageHelpers: { match: /^;;; (Overlay|AutoCAD overlay) image insertion helpers/ },
  jobSettings: { match: /^\(setq SL_ORIENTATION / },
  drawSetup: { match: /^\(defun c:SCANOVERLAY / },
  vessel: { match: /^ {2};; Vessel border/ },
  scans: { match: /^ {2};; Layout scan geometry/ },
  images: { match: /^ {2};; Scan image overlays/ },
  objects: { match: /^ {2};; Supports \/ structures/ },
  nozzles: { match: /^ {2};; Nozzles$/ },
  shellMut: { match: /^ {2};; Shell MUT points/ },
  welds: { match: /^ {2};; Welds$/ },
  rulers: { match: /^ {2};; Optional rulers/ },
  referenceLabels: { match: /^ {2};; Optional vessel reference indicators/ },
  headViews: { match: /^ {2};; Optional head views/ },
  headNozzles: { match: /^ {2};; Head nozzles/ },
  headMut: { match: /^ {2};; Head MUT points/ },
  legend: { match: /^ {2}\(SL_Legend / },
  titleBlock: { match: /^ {2}\(SL_TitleBlock / },
  drawFinish: { match: /^ {2}\(command "ZOOM"/ },
  visibility: { match: /^;; Layer visibility controls/ },
  layerGroups: { match: /^;; Grouped visibility controls/ },
  launcher: { match: /^;; One-drawing AXISBUILDER launcher/ },
  footer: { match: /^;; Backward-compatible alias/ },
}

export interface Section {
  name: SectionName
  /** 1-based line number of the section's first line in the file (0 when the section is empty). */
  firstLine: number
  /** The section's exact text, line endings included. */
  text: string
}

/** Lines with their line endings kept, so joining them gives back the exact text. */
function linesOf(text: string): string[] {
  return text.match(/[^\r\n]*(?:\r\n|\n|\r)|[^\r\n]+$/g) ?? []
}

const bare = (line: string) => line.replace(/\r?\n$|\r$/, '')

/** Splits a v5.0 master .lsp into the sections above (in order; missing ones are empty). */
export function splitLsp(text: string): Section[] {
  const lines = linesOf(text)
  const starts: (number | null)[] = []
  let from = 0
  for (const name of SECTION_NAMES) {
    const spec = STARTS[name]
    let at = -1
    for (let i = from; i < lines.length; i++) {
      if (spec.match.test(bare(lines[i]))) {
        at = i
        break
      }
    }
    if (at < 0) {
      starts.push(null)
      continue
    }
    if (spec.withCommentsAbove) while (at > from && /^;;/.test(bare(lines[at - 1]))) at--
    starts.push(at)
    from = at + 1
  }
  // Anything before the first found section belongs to it.
  const firstFound = starts.findIndex((s) => s !== null)
  if (firstFound >= 0) starts[firstFound] = 0
  return SECTION_NAMES.map((name, i) => {
    const start = starts[i]
    if (start === null) return { name, firstLine: 0, text: '' }
    const next = starts.slice(i + 1).find((s): s is number => s !== null) ?? lines.length
    return { name, firstLine: start + 1, text: lines.slice(start, next).join('') }
  })
}

/** Joins sections back into the file text. */
export function joinLsp(sections: readonly Section[]): string {
  return sections.map((s) => s.text).join('')
}

/** Fixed placeholder for the folder of the processed scan images (absolute paths differ per PC). */
export const IMAGE_DIR_PLACEHOLDER = '<PROCESSED_IMAGES>'

/**
 * Removes what may legitimately differ between two runs: line endings, the generation timestamp and
 * absolute image folders (replaced by the placeholder). Nothing else is touched.
 */
export function normalizeLsp(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/^(;;; Generated from Excel on ).*$/m, '$1<TIMESTAMP>')
    .replace(/"[A-Za-z]:[\\/][^"]*[\\/]([^"\\/]+)"/g, `"${IMAGE_DIR_PLACEHOLDER}/$1"`)
}

export interface SectionDiff {
  name: SectionName
  status: 'same' | 'different' | 'missing' | 'extra'
  /** First differing line (1-based, within the file) with both versions, for status 'different'. */
  firstDifference?: { expectedLine: number; actualLine: number; expected: string; actual: string }
}

/** Compares two .lsp files section by section after normalizing both. */
export function compareLsp(expected: string, actual: string): SectionDiff[] {
  const exp = splitLsp(normalizeLsp(expected))
  const act = splitLsp(normalizeLsp(actual))
  return exp.map((e, i) => {
    const a = act[i]
    if (e.text === a.text) return { name: e.name, status: 'same' }
    if (a.text === '') return { name: e.name, status: 'missing' }
    if (e.text === '') return { name: e.name, status: 'extra' }
    const el = e.text.split('\n')
    const al = a.text.split('\n')
    let k = 0
    while (k < el.length && k < al.length && el[k] === al[k]) k++
    return {
      name: e.name,
      status: 'different',
      firstDifference: {
        expectedLine: e.firstLine + k,
        actualLine: a.firstLine + k,
        expected: el[k] ?? '(end of section)',
        actual: al[k] ?? '(end of section)',
      },
    }
  })
}

/** A readable report of the sections that differ (empty string when everything matches). */
export function formatDiffs(diffs: readonly SectionDiff[]): string {
  return diffs
    .filter((d) => d.status !== 'same')
    .map((d) => {
      if (d.status === 'missing') return `[${d.name}] missing from the app output`
      if (d.status === 'extra') return `[${d.name}] only in the app output (v5.0 has no such section)`
      const f = d.firstDifference!
      return `[${d.name}] first difference:\n  v5.0 line ${f.expectedLine}: ${f.expected}\n  app  line ${f.actualLine}: ${f.actual}`
    })
    .join('\n')
}
