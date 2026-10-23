// Which photo each scan uses (the project's scan image links) and its state for the Images step.

import { IMAGE_EXTENSIONS, resolveImageFile } from './imageMatch.ts'
import { idKey, type Project, type Scan, type ScanImage } from './schema.ts'

export function photoLink(p: Project, scanId: string): ScanImage | null {
  return p.scanImages.find((l) => idKey(l.scanId) === idKey(scanId)) ?? null
}

/** Changes one scan's photo link (making one if needed); links stay in scan order, like v5.0's Scan Images sheet. */
export function setPhotoLink(p: Project, scanId: string, change: { imageFile?: string; include?: boolean }): Project {
  const scan = p.scans.find((s) => idKey(s.id) === idKey(scanId))
  if (!scan) return p
  const old = photoLink(p, scanId)
  const link: ScanImage = { scanId: scan.id, imageFile: old?.imageFile ?? '', processedImage: old?.processedImage ?? '', include: old?.include ?? true, ...change }
  const order = new Map(p.scans.map((s, i) => [idKey(s.id), i]))
  const links = [...p.scanImages.filter((l) => idKey(l.scanId) !== idKey(scanId)), link]
  links.sort((a, b) => (order.get(idKey(a.scanId)) ?? 0) - (order.get(idKey(b.scanId)) ?? 0))
  return { ...p, scanImages: links }
}

export type PhotoState =
  /** The scan itself is switched off: no photo needed. */
  | 'scanOff'
  /** The scan is drawn without a photo (its photo is switched off). */
  | 'photoOff'
  | 'none'
  /** Chosen and found in the open photo folder. */
  | 'found'
  /** Chosen, but not in the open photo folder. */
  | 'missing'
  /** Chosen; the photo folder is not open, so it can't be checked. */
  | 'chosen'

export const PHOTO_STATE_TEXT: Record<PhotoState, string> = {
  scanOff: 'Scan not drawn',
  photoOff: 'Drawn without photo',
  none: 'No photo',
  found: 'Found',
  missing: 'Not in folder',
  chosen: 'Chosen (folder not open)',
}

export function photoState(scan: Scan, link: ScanImage | null, folderNames: readonly string[] | null): { state: PhotoState; file: string | null } {
  if (!scan.include) return { state: 'scanOff', file: null }
  if (link && !link.include) return { state: 'photoOff', file: null }
  const name = link?.imageFile.trim() ?? ''
  if (!name) return { state: 'none', file: null }
  if (!folderNames) return { state: 'chosen', file: name }
  const found = resolveImageFile(name, folderNames)
  return found ? { state: 'found', file: found } : { state: 'missing', file: name }
}

/** The image files in a folder listing (.png, .jpg, .jpeg), sorted. */
export function imageFiles(names: readonly string[]): string[] {
  return names.filter((n) => (IMAGE_EXTENSIONS as readonly string[]).includes(n.split('.').pop()?.toLowerCase() ?? '')).sort((a, b) => a.localeCompare(b))
}
