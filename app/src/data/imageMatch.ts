// Matches scan photos in a folder to scans, with the same rules as v5.0 SelectScanImageFolder
// (SLG_ScanImages) and ScanNumberFromName (SLG_Utilities). Matching only: no files are read or resized.
//
// - Scan number = the first group of digits in a name (SCAN01 -> 1, "Scan 12b" -> 12); none = no number.
// - Only .png, .jpg and .jpeg files count. Each file's naming pattern is its name (without extension)
//   with that digit group replaced by "#" (S1.png -> "S#"). Files without a number are ignored.
// - The pattern that covers the most scans is used. If several patterns cover scans, v5.0 asked which
//   one to use; here the result says so (needsPatternChoice) and the caller can pass `pattern`.
// - Per scan: exactly one file with its number in the chosen pattern = matched. Otherwise every file
//   with its number is a candidate, and the user chooses (v5.0's per-scan prompt). A scan whose
//   current image file is one of the candidates keeps it, as in v5.0.
// - applyImageChoices writes the files the user confirmed into the project's scan image links.

import type { Project } from './schema.ts'

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg'] as const

/** v5.0 ScanNumberFromName: first digit group as a number, or -1 (none, or longer than 9 digits). */
export function scanNumberFromName(name: string): number {
  const m = /\d+/.exec(name)
  if (!m || m[0].length > 9) return -1
  return Number(m[0])
}

/** v5.0 DefaultImageName: "S" + scan number (or the scan name if it has no number). */
export function defaultImageName(scanId: string): string {
  const n = scanNumberFromName(scanId)
  return `S${n < 0 ? scanId : n}`
}

/** v5.0 DefaultProcessedName: processed images are always PNG. */
export function defaultProcessedName(scanId: string): string {
  const n = scanNumberFromName(scanId)
  return `S${n < 0 ? scanId : n}_FIT_B12.png`
}

/**
 * The app's processed image file name for each scan: the scan's own name made file-safe, plus
 * "_FIT.png" ("SCAN 1" -> "SCAN_1_FIT.png"). Unlike v5.0's S<number> rule, "SCAN1" and "SCAN01" no
 * longer share a file, and scans without a number get a proper name. If two names still end up the
 * same after cleaning (ignoring case, as Windows does), the later ones get "_2", "_3", ...
 */
export function processedImageNames(scanIds: readonly string[]): Map<string, string> {
  const out = new Map<string, string>()
  const used = new Set<string>()
  for (const id of scanIds) {
    if (out.has(id)) continue
    const safe = id.trim().replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '') || 'SCAN'
    let name = `${safe}_FIT.png`
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${safe}_${n}_FIT.png`
    used.add(name.toLowerCase())
    out.set(id, name)
  }
  return out
}

/** Processed image of one piece of a scan wrapped across the seam: SCAN_5_FIT.png -> SCAN_5_FIT_A.png / _B.png. */
export function pieceImageName(fileName: string, piece: number): string {
  const letter = String.fromCharCode(65 + piece)
  return /\.png$/i.test(fileName) ? fileName.replace(/\.png$/i, `_${letter}.png`) : `${fileName}_${letter}`
}

function splitName(fileName: string): { base: string; ext: string } {
  const dot = fileName.lastIndexOf('.')
  return dot > 0
    ? { base: fileName.slice(0, dot), ext: fileName.slice(dot + 1).toLowerCase() }
    : { base: fileName, ext: '' }
}

/** The file's naming pattern: base name with the first digit group replaced by "#", or null. */
export function namingPattern(fileName: string): string | null {
  const { base } = splitName(fileName)
  const m = /\d+/.exec(base)
  if (!m || m[0].length > 9) return null
  return base.slice(0, m.index) + '#' + base.slice(m.index + m[0].length)
}

/** The naming pattern most of these files share (ignoring case; the first seen wins a tie), or null when none has one. */
export function commonPattern(fileNames: readonly (string | null | undefined)[]): string | null {
  const counts = new Map<string, { pattern: string; n: number }>()
  for (const f of fileNames) {
    const pattern = f ? namingPattern(f.trim()) : null
    if (pattern === null) continue
    const c = counts.get(pattern.toLowerCase()) ?? { pattern, n: 0 }
    c.n++
    counts.set(pattern.toLowerCase(), c)
  }
  let best: { pattern: string; n: number } | null = null
  for (const c of counts.values()) if (!best || c.n > best.n) best = c
  return best?.pattern ?? null
}

/**
 * The naming pattern to start matching with when files of another kind share the folder (the report's data-page
 * screenshots next to the overlay photos): the best pattern covering scans that isn't `avoid`. Undefined (the automatic
 * choice) when the automatic choice isn't `avoid`, or no other pattern covers any scan.
 */
export function startPattern(result: ImageMatchResult, avoid: string | null | undefined): string | undefined {
  if (!avoid || result.chosenPattern?.toLowerCase() !== avoid.toLowerCase()) return undefined
  return result.patterns.find((p) => p.scanCount > 0 && p.pattern.toLowerCase() !== avoid.toLowerCase())?.pattern
}

/**
 * v5.0 ResolveSourceImagePath, on a list of names: the exact file, else base name + .png, .jpg,
 * .jpeg in that order. Case-insensitive, like Windows. Returns the file name found, or null.
 */
export function resolveImageFile(imageName: string, fileNames: readonly string[]): string | null {
  const name = imageName.trim()
  if (name === '') return null
  const byLower = new Map(fileNames.map((f) => [f.toLowerCase(), f]))
  const exact = byLower.get(name.toLowerCase())
  if (exact) return exact
  const { base } = name.includes('.') ? splitName(name) : { base: name }
  for (const ext of IMAGE_EXTENSIONS) {
    const f = byLower.get(`${base}.${ext}`.toLowerCase())
    if (f) return f
  }
  return null
}

export interface ScanToMatch {
  id: string
  /** The scan's current image file name (Scan Images "Image File"), if any. */
  imageFile?: string
}

export type ScanMatchStatus =
  /** One file found (or the current file kept). */
  | 'matched'
  /** The user must pick: several files, or only files in another naming pattern. */
  | 'choose'
  /** No file for this scan. */
  | 'noMatch'

export interface ScanMatch {
  scanId: string
  /** Scan number from the name, or -1. */
  number: number
  status: ScanMatchStatus
  /** The matched file (status 'matched'). */
  file: string | null
  /** Files to choose from (status 'choose'). */
  candidates: string[]
  /** True when the scan kept its current image file. */
  keptExisting: boolean
  /** True when the match differs from the scan's current image file (v5.0 asked before replacing). */
  replacesExisting: boolean
  /** Plain-language explanation. */
  reason: string
}

export interface PatternInfo {
  pattern: string
  /** Scans that have a file in this pattern. */
  scanCount: number
  /** Image files in this pattern. */
  fileCount: number
  example: string
}

export interface ImageMatchResult {
  /** Every naming pattern in the folder, most scans covered first (then most files). */
  patterns: PatternInfo[]
  chosenPattern: string | null
  /** More than one pattern covers scans and no pattern was passed in: let the user confirm. */
  needsPatternChoice: boolean
  /** No file in the folder fits any scan: probably the wrong folder. */
  nothingFits: boolean
  scans: ScanMatch[]
  /** Files that were not considered, with the reason. */
  ignoredFiles: { name: string; reason: string }[]
  counts: Record<ScanMatchStatus, number>
}

interface ImageFile {
  name: string
  number: number
  pattern: string
}

/** Matches folder file names to scans. `pattern` overrides the automatic pattern choice. */
export function matchScanImages(
  scans: readonly ScanToMatch[],
  fileNames: readonly string[],
  options: { pattern?: string } = {},
): ImageMatchResult {
  const files: ImageFile[] = []
  const ignoredFiles: { name: string; reason: string }[] = []
  for (const name of fileNames) {
    const { ext } = splitName(name)
    if (!(IMAGE_EXTENSIONS as readonly string[]).includes(ext)) {
      ignoredFiles.push({ name, reason: 'Not a .png, .jpg or .jpeg file.' })
      continue
    }
    const pattern = namingPattern(name)
    if (pattern === null) {
      ignoredFiles.push({ name, reason: 'No number in the file name.' })
      continue
    }
    files.push({ name, number: scanNumberFromName(splitName(name).base), pattern })
  }
  // The current image file is looked up among all files, numbered or not (v5.0 checks the folder).
  const allNames = [...fileNames]

  // Patterns and how many scans each covers (pattern names compared ignoring case, like v5.0).
  const scanNumbers = scans.map((s) => scanNumberFromName(s.id))
  const patternMap = new Map<string, { pattern: string; example: string; numbers: Set<number>; files: number }>()
  for (const f of files) {
    const key = f.pattern.toLowerCase()
    const p = patternMap.get(key) ?? { pattern: f.pattern, example: f.name, numbers: new Set<number>(), files: 0 }
    p.numbers.add(f.number)
    p.files++
    patternMap.set(key, p)
  }
  const patterns: PatternInfo[] = [...patternMap.values()]
    .map((p) => ({
      pattern: p.pattern,
      example: p.example,
      fileCount: p.files,
      scanCount: scanNumbers.filter((n) => n >= 0 && p.numbers.has(n)).length,
    }))
    .sort((a, b) => b.scanCount - a.scanCount || b.fileCount - a.fileCount)
  const covering = patterns.filter((p) => p.scanCount > 0)

  const wanted = options.pattern?.toLowerCase()
  const chosen = wanted !== undefined ? (patternMap.get(wanted)?.pattern ?? options.pattern!) : (covering[0]?.pattern ?? null)
  const chosenKey = chosen?.toLowerCase()

  const results: ScanMatch[] = scans.map((scan, i) => {
    const number = scanNumbers[i]
    const current = scan.imageFile?.trim() ?? ''
    const currentFile = resolveImageFile(current, allNames)
    const base = { scanId: scan.id, number, file: null, candidates: [], keptExisting: false, replacesExisting: false }

    if (number < 0) {
      if (currentFile) return { ...base, status: 'matched', file: currentFile, keptExisting: true, reason: 'No number in the scan name; its current image file is in the folder.' }
      return { ...base, status: 'noMatch', reason: 'No number in the scan name, so no file can be matched.' }
    }
    const inChosen = files.filter((f) => f.number === number && f.pattern.toLowerCase() === chosenKey).map((f) => f.name)
    const candidates = inChosen.length > 0 ? inChosen : files.filter((f) => f.number === number).map((f) => f.name)

    if (inChosen.length === 1) {
      const file = inChosen[0]
      const replaces = current !== '' && currentFile?.toLowerCase() !== file.toLowerCase()
      return { ...base, status: 'matched', file, replacesExisting: replaces,
        reason: replaces ? `Matched ${file}; differs from the current image file ${current}.` : `Matched ${file}.` }
    }
    if (candidates.length > 0) {
      if (currentFile && candidates.some((c) => c.toLowerCase() === currentFile.toLowerCase())) {
        return { ...base, status: 'matched', file: currentFile, keptExisting: true, reason: `Kept the current image file ${currentFile}.` }
      }
      return { ...base, status: 'choose', candidates,
        reason: inChosen.length > 1
          ? `${inChosen.length} files with number ${number} in the "${chosen}" pattern; choose one.`
          : `No file in the "${chosen}" pattern; ${candidates.length} file(s) with number ${number} in another pattern; choose one.` }
    }
    if (currentFile) {
      return { ...base, status: 'matched', file: currentFile, keptExisting: true, reason: `No numbered match; kept the current image file ${currentFile}.` }
    }
    return { ...base, status: 'noMatch',
      reason: `No image file with number ${number} (expected e.g. ${defaultImageName(scan.id)}.png).` }
  })

  const counts = { matched: 0, choose: 0, noMatch: 0 }
  for (const r of results) counts[r.status]++
  return {
    patterns,
    chosenPattern: chosen,
    needsPatternChoice: options.pattern === undefined && covering.length > 1,
    nothingFits: scans.length > 0 && counts.matched + counts.choose === 0,
    scans: results,
    ignoredFiles,
    counts,
  }
}

/**
 * Writes the chosen image file per scan into the project's scan image links. `choices` maps scan ID
 * to a file name; scans not in it (or skipped) keep their current link. A new link keeps the scan's
 * processed image name and Include setting if it had a link before.
 */
export function applyImageChoices(project: Project, choices: ReadonlyMap<string, string>): Project {
  const links = new Map(project.scanImages.map((l) => [l.scanId.toLowerCase(), l]))
  const scanImages = project.scans.flatMap((scan) => {
    const old = links.get(scan.id.toLowerCase())
    const file = choices.get(scan.id)
    if (file === undefined) return old ? [old] : []
    return [{ scanId: scan.id, imageFile: file, processedImage: old?.processedImage ?? '', include: old?.include ?? true }]
  })
  return { ...project, scanImages }
}
