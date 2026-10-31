// Changes made on the Photos and pages step (R4): a picture's crop and turn wherever it is in the report, custom sheets
// and their blocks, uploaded pages. Pure functions of the project like report/edits.ts: each screen action is one
// app.edit() call, so one undo step, and a change that changes nothing returns the same project.

import type { Project } from '../data/schema.ts'
import { imageItems, type ImagePlace } from './imageItems.ts'
import {
  blockSchema,
  customSheetSchema,
  uploadSchema,
  type Block,
  type CustomSheet,
  type ImageEdits,
  type Report,
  type Upload,
} from './schema.ts'

const withReport = (p: Project, update: (r: Report) => Report): Project => {
  if (!p.report) return p
  const report = update(p.report)
  return report === p.report ? p : { ...p, report }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Moves an item of a list so it ends up at `to`. */
function moved<T>(list: readonly T[], from: number, to: number): T[] | null {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return null
  const out = list.slice()
  const [x] = out.splice(from, 1)
  out.splice(to, 0, x)
  return out
}

// --- Picture edits, by where the picture is ---------------------------------------------------------

/** A picture's file and edits, or undefined when the place holds none. */
export function pictureAt(r: Report, at: ImagePlace) {
  return imageItems(r).find((x) => same(x.place, at))
}

/** Changes a picture's crop / turn (and later its marks), wherever it is. */
export function setPictureEdits(p: Project, at: ImagePlace, change: Partial<ImageEdits>): Project {
  return withReport(p, (r) => {
    const item = pictureAt(r, at)
    if (!item || Object.entries(change).every(([k, v]) => same(item.edits[k as keyof ImageEdits], v))) return r
    const apply = <T extends object>(x: T): T => ({ ...x, ...change })
    switch (at.kind) {
      case 'cover': return { ...r, coverPhotoEdits: apply(r.coverPhotoEdits) }
      case 'calibration': return { ...r, calibration: { ...r.calibration, dynamicImageEdits: apply(r.calibration.dynamicImageEdits) } }
      case 'photo': return { ...r, photos: r.photos.map((x, i) => (i === at.index ? apply(x) : x)) }
      case 'dataImage': return { ...r, scanResults: r.scanResults.map((s) => (s.scanId === at.scanId ? { ...s, dataImageEdits: apply(s.dataImageEdits) } : s)) }
      case 'upload': return { ...r, uploads: r.uploads.map((x, i) => (i === at.index ? apply(x) : x)) }
      case 'sheetImage':
        return {
          ...r,
          customSheets: r.customSheets.map((sh) => (sh.id !== at.sheetId ? sh : { ...sh, blocks: sh.blocks.map((b, i) => (i === at.block && b.kind === 'image' ? apply(b) : b)) })),
        }
    }
  })
}

// --- Custom sheets ------------------------------------------------------------------------------------

export const BLOCK_KINDS = ['image', 'view', 'cscanBoxes', 'text', 'table'] as const
export type BlockKind = (typeof BLOCK_KINDS)[number]
export const BLOCK_NAMES: Record<BlockKind, string> = {
  image: 'Picture', view: 'AxisBuilder view', cscanBoxes: 'C-scan boxes', text: 'Text', table: 'Small table',
}
/** How many blocks each layout holds (slots, in order). */
export const LAYOUT_SLOTS: Record<CustomSheet['layout'], number> = { '1 large': 1, '2 side by side': 2, '2 + side panel': 3, '4 grid': 4 }

/** A new, empty block of a kind (a picture needs its file: given here). */
export function newBlock(kind: BlockKind, file = ''): Block {
  switch (kind) {
    case 'image': return blockSchema.parse({ kind, file: file || 'picture.jpg' })
    case 'view': return blockSchema.parse({ kind, view: 'main' })
    case 'cscanBoxes': return blockSchema.parse({ kind })
    case 'text': return blockSchema.parse({ kind })
    case 'table': return blockSchema.parse({ kind, rows: [['Item', 'Value'], ['', '']] })
  }
}

/** Adds a sheet at the end ("Sheet 1", "Sheet 2", ... with a fresh id); returns the project and the new id. */
export function addCustomSheet(p: Project, layout: CustomSheet['layout'] = '1 large'): { project: Project; id: string } {
  if (!p.report) return { project: p, id: '' }
  const ids = new Set(p.report.customSheets.map((s) => s.id))
  let n = p.report.customSheets.length + 1
  while (ids.has(`sheet${n}`)) n++
  const sheet = customSheetSchema.parse({ id: `sheet${n}`, title: `Sheet ${p.report.customSheets.length + 1}`, layout })
  return { project: { ...p, report: { ...p.report, customSheets: [...p.report.customSheets, sheet] } }, id: sheet.id }
}

function withSheet(p: Project, id: string, update: (s: CustomSheet) => CustomSheet): Project {
  return withReport(p, (r) => {
    const i = r.customSheets.findIndex((s) => s.id === id)
    if (i < 0) return r
    const next = update(r.customSheets[i])
    return next === r.customSheets[i] ? r : { ...r, customSheets: r.customSheets.map((s, k) => (k === i ? next : s)) }
  })
}

/** Title, "print after" and layout of a sheet. */
export function setCustomSheet(p: Project, id: string, change: Partial<Pick<CustomSheet, 'title' | 'after' | 'layout'>>): Project {
  return withSheet(p, id, (s) => (Object.entries(change).every(([k, v]) => same(s[k as keyof CustomSheet], v)) ? s : { ...s, ...change }))
}

export function removeCustomSheet(p: Project, id: string): Project {
  return withReport(p, (r) => (r.customSheets.some((s) => s.id === id) ? { ...r, customSheets: r.customSheets.filter((s) => s.id !== id) } : r))
}

export function moveCustomSheet(p: Project, from: number, to: number): Project {
  return withReport(p, (r) => {
    const list = moved(r.customSheets, from, to)
    return list ? { ...r, customSheets: list } : r
  })
}

export function addBlock(p: Project, sheetId: string, block: Block): Project {
  return withSheet(p, sheetId, (s) => ({ ...s, blocks: [...s.blocks, block] }))
}

/** Replaces a block (a new kind starts empty; the same kind keeps what `change` doesn't name). */
export function setBlock(p: Project, sheetId: string, index: number, change: Partial<Block> & { kind?: Block['kind'] }): Project {
  return withSheet(p, sheetId, (s) => {
    const b = s.blocks[index]
    if (!b) return s
    const next = change.kind && change.kind !== b.kind ? newBlock(change.kind) : ({ ...b, ...change } as Block)
    return same(next, b) ? s : { ...s, blocks: s.blocks.map((x, i) => (i === index ? next : x)) }
  })
}

export function removeBlock(p: Project, sheetId: string, index: number): Project {
  return withSheet(p, sheetId, (s) => (s.blocks[index] ? { ...s, blocks: s.blocks.filter((_, i) => i !== index) } : s))
}

export function moveBlock(p: Project, sheetId: string, from: number, to: number): Project {
  return withSheet(p, sheetId, (s) => {
    const blocks = moved(s.blocks, from, to)
    return blocks ? { ...s, blocks } : s
  })
}

/** A small table typed as text: one row per line, cells split by "|" or tabs (pasted from Excel). */
export function tableFromText(text: string): string[][] {
  return text.split(/\r?\n/).filter((l) => l.trim() !== '').map((l) => l.split(/\t|\|/).map((c) => c.trim()))
}

export function tableToText(rows: readonly (readonly string[])[]): string {
  return rows.map((r) => r.join(' | ')).join('\n')
}

// --- Uploaded pages ------------------------------------------------------------------------------------

/** Adds uploads at the end: an image (page null) or one entry per picked PDF page; the title starts as the file name. */
export function addUploads(p: Project, entries: readonly { file: string; page: number | null }[]): Project {
  return withReport(p, (r) => {
    const have = new Set(r.uploads.map((u) => `${u.file.toLowerCase()}#${u.page ?? 0}`))
    const add = entries.filter((e) => !have.has(`${e.file.toLowerCase()}#${e.page ?? 0}`))
    if (add.length === 0) return r
    const base = (f: string) => f.replace(/\.[^.]+$/, '')
    const many = (f: string) => entries.filter((e) => e.file === f).length > 1
    const ups = add.map((e) => uploadSchema.parse({ file: e.file, page: e.page, title: e.page !== null && many(e.file) ? `${base(e.file)}, page ${e.page}` : base(e.file) }))
    return { ...r, uploads: [...r.uploads, ...ups] }
  })
}

/** Darken a faint uploaded page: 0 off, 1 darker, 2 much darker. */
export function setUploadDarken(p: Project, index: number, darken: number): Project {
  return withReport(p, (r) => {
    const u = r.uploads[index]
    if (!u || u.adjust.darken === darken) return r
    return { ...r, uploads: r.uploads.map((x, i) => (i === index ? { ...x, adjust: { ...x.adjust, darken } } : x)) }
  })
}

export function setUpload(p: Project, index: number, change: Partial<Pick<Upload, 'title' | 'after' | 'frame' | 'rotate'>>): Project {
  return withReport(p, (r) => {
    const u = r.uploads[index]
    if (!u || Object.entries(change).every(([k, v]) => same(u[k as keyof Upload], v))) return r
    return { ...r, uploads: r.uploads.map((x, i) => (i === index ? { ...x, ...change } : x)) }
  })
}

export function removeUpload(p: Project, index: number): Project {
  return withReport(p, (r) => (r.uploads[index] ? { ...r, uploads: r.uploads.filter((_, i) => i !== index) } : r))
}

export function moveUpload(p: Project, from: number, to: number): Project {
  return withReport(p, (r) => {
    const uploads = moved(r.uploads, from, to)
    return uploads ? { ...r, uploads } : r
  })
}

/** True for an uploaded PDF (or a page of one). */
export const isPdfUpload = (u: Pick<Upload, 'file' | 'page'>) => /\.pdf$/i.test(u.file) || u.page !== null
