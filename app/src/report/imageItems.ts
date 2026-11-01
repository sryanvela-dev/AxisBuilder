// Every picture in a report that carries image edits (format 8: crop, rotate, adjust, markup): photos, the cover
// photo, data-page screenshots, the calibration screenshot, custom-sheet images and uploads. One place lists them, so
// syncing mark links, the checks and (R5) the markup editor all see the same set.

import type { ImageEdits, Mark, Report } from './schema.ts'

/** Where a picture is in the report, for messages and Go to. */
export type ImagePlace =
  | { kind: 'photo'; index: number }
  | { kind: 'cover' }
  | { kind: 'calibration' }
  | { kind: 'dataImage'; scanId: string }
  | { kind: 'sheetImage'; sheetId: string; block: number }
  | { kind: 'upload'; index: number }
  /** A drawing sheet the report prints (Drawings pages, custom-sheet views); marks only, no file (format 10). */
  | { kind: 'drawing'; key: string }

export interface ImageItem {
  place: ImagePlace
  /** File name; null when the slot has no picture yet (its edits are kept). */
  file: string | null
  edits: ImageEdits
}

const editsOf = (x: ImageEdits): ImageEdits => ({ crop: x.crop, rotate: x.rotate, adjust: x.adjust, markup: x.markup })

/** The edits of a drawing sheet: its marks, nothing else (a drawing is vectors: no crop, turn or pixel edits). */
export const drawingEdits = (markup: Mark[]): ImageEdits => ({ crop: null, rotate: 0, adjust: { autoLevels: false, darken: 0 }, markup })

/** "The rollout drawing", "Section sheet 2 (overlay)", for messages and titles. */
export function drawingName(r: Report, key: string): string {
  if (key === 'rollout') return 'The rollout drawing'
  if (key === 'overlay') return 'The scan overlay drawing'
  const custom = /^sheet:(.+):(\d+)$/.exec(key)
  if (custom) return `A drawing view on the custom sheet "${r.customSheets.find((s) => s.id === custom[1])?.title.trim() || 'Untitled'}"`
  const [set, which] = key.split(':')
  const tag = set === 'overlays' ? ' (overlay)' : ''
  return which === 'overview' ? `The overview sheet${tag}` : `Section sheet ${which}${tag}`
}

/** Every picture with its edits, in report order. */
export function imageItems(r: Report): ImageItem[] {
  const out: ImageItem[] = []
  out.push({ place: { kind: 'cover' }, file: r.coverPhoto, edits: r.coverPhotoEdits })
  out.push({ place: { kind: 'calibration' }, file: r.calibration.dynamicImage, edits: r.calibration.dynamicImageEdits })
  r.photos.forEach((p, index) => out.push({ place: { kind: 'photo', index }, file: p.file, edits: editsOf(p) }))
  r.scanResults.forEach((s) => out.push({ place: { kind: 'dataImage', scanId: s.scanId }, file: s.dataImage, edits: s.dataImageEdits }))
  r.customSheets.forEach((sh) =>
    sh.blocks.forEach((b, block) => {
      if (b.kind === 'image') out.push({ place: { kind: 'sheetImage', sheetId: sh.id, block }, file: b.file, edits: editsOf(b) })
    }),
  )
  r.uploads.forEach((u, index) => out.push({ place: { kind: 'upload', index }, file: u.file, edits: editsOf(u) }))
  for (const [key, marks] of Object.entries(r.drawingMarkup ?? {})) if (marks.length) out.push({ place: { kind: 'drawing', key }, file: null, edits: drawingEdits(marks) })
  return out
}

/**
 * The report with every picture's markup passed through `change` (a list returned unchanged keeps its item, so an
 * unchanged report is returned as is).
 */
export function mapMarkup(r: Report, change: (marks: Mark[]) => Mark[]): Report {
  let changed = false
  const fix = <T extends { markup: Mark[] }>(x: T): T => {
    if (x.markup.length === 0) return x
    const m = change(x.markup)
    if (m === x.markup) return x
    changed = true
    return { ...x, markup: m }
  }
  const coverPhotoEdits = fix(r.coverPhotoEdits)
  const dynamicImageEdits = fix(r.calibration.dynamicImageEdits)
  const photos = r.photos.map(fix)
  const scanResults = r.scanResults.map((s) => {
    const e = fix(s.dataImageEdits)
    return e === s.dataImageEdits ? s : { ...s, dataImageEdits: e }
  })
  const customSheets = r.customSheets.map((sh) => {
    const blocks = sh.blocks.map((b) => (b.kind === 'image' ? fix(b) : b))
    return blocks.every((b, i) => b === sh.blocks[i]) ? sh : { ...sh, blocks }
  })
  const uploads = r.uploads.map(fix)
  let drawingMarkup = r.drawingMarkup ?? {}
  for (const [key, marks] of Object.entries(drawingMarkup)) {
    const m = marks.length ? change(marks) : marks
    if (m !== marks) {
      changed = true
      drawingMarkup = { ...drawingMarkup, [key]: m }
    }
  }
  if (!changed) return r
  return {
    ...r, coverPhotoEdits, photos, scanResults, customSheets, uploads, drawingMarkup,
    calibration: dynamicImageEdits === r.calibration.dynamicImageEdits ? r.calibration : { ...r.calibration, dynamicImageEdits },
  }
}
