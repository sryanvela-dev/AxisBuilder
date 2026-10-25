// Project file schema: everything one v5.0 job holds.
//
// Coordinates use the logical model of v5.0: X = circumference (0..vessel.height),
// Y = length (0..vessel.length). Orientation is applied only when drawing.
// Lists have no fixed row limits. IDs must be unique within each list, compared the way
// the VBA compares scan names: ignoring case and outer spaces. The heads are part of the
// vessel, so nozzle names are unique across shell + head nozzles, and MUT IDs across shell +
// head MUT.

import { z } from 'zod'
import { PROJECT_FIELDS, SETTINGS, VESSEL_FIELDS, shapeOf } from './settings.ts'

export const CURRENT_SCHEMA_VERSION = 6

/** A new job ID: random, so two jobs never share one (copies made with "Save as" keep theirs). */
export function newJobId(): string {
  return globalThis.crypto.randomUUID()
}

// --- Building blocks -------------------------------------------------------------------------

const id = z
  .string()
  .refine((s) => s.trim().length > 0, { message: 'must not be blank' })
  .refine((s) => s.trim() === s, { message: 'must not start or end with a space' })

// Measurements an item needs before it can be drawn. null = not entered yet (for example an
// unreadable OCR "REVIEW" value from an imported workbook). The key must still be present.
// findMissingData lists them; export refuses to run until they are filled in.
const position = z.number().nullable()
const positiveSize = z.number().gt(0).nullable()
const thickness = z.number().gte(0)
/** Min. T on nozzles: a thickness, "TOL" (v5.0 accepts it there), or not recorded. */
const nozzleMinT = z.union([thickness, z.literal('TOL')]).nullable().default(null)
const mutMinT = thickness.nullable().default(null)
const include = z.boolean().default(true)
/** Don't wrap across the circumference seam (X = 0 and X = circumference are the same line); default: wrap. */
const noWrap = z.boolean().default(false)
const notes = z.string().default('')
/**
 * A MUT area drawn in the preview (format 6): its corners in order, or null for a MUT point only. Shell MUT: logical
 * inches (X around, Y along; X may run past the seam, the drawing wraps it). Head MUT: in head radii from the head's
 * center as the head view reads (first = toward 3 o'clock, second = toward 12 o'clock), so an area stays on its head
 * when the right panel moves or the head view changes size. Fewer than 3 corners or a crossing outline still saves;
 * Review warns (data/checks.ts).
 */
const mutArea = z.array(z.tuple([z.number(), z.number()])).nullable().default(null)

export const LABEL_MODES = ['AUTO', 'INSIDE', 'OUTSIDE'] as const
export const HEADS = ['HEAD 1', 'HEAD 2'] as const
export const RADIUS_POSITIONS = ['CENTER', 'HALF', 'THREE_QUARTER', 'OUTER', 'CUSTOM'] as const

const labelMode = z.enum(LABEL_MODES).default('AUTO')
const head = z.enum(HEADS)
/** Blank in v5.0 means CENTER. null = not selected yet (an unknown value from an imported workbook). */
const radiusPosition = z.enum(RADIUS_POSITIONS).nullable().default('CENTER')

/**
 * Head clock position as written on the field form (12 = top, 3 = right): whole hours ("3"),
 * hours:minutes ("1:30", minutes 00-59) or decimal hours ("10.5"). Hours 1-12 only; 12.5 means
 * half past 12. Degrees ("90°", accepted by v5.0) are not allowed.
 */
export function isValidClock(s: string): boolean {
  let m = /^(\d{1,2})(?:\.\d+)?$/.exec(s)
  if (m) {
    const hours = Number(s)
    return hours >= 1 && hours < 13
  }
  m = /^(\d{1,2}):([0-5]\d)$/.exec(s)
  if (m) return Number(m[1]) >= 1 && Number(m[1]) <= 12
  return false
}

const clock = z
  .string()
  .refine(isValidClock, { message: 'must be a clock position from 1 to 12, such as 3, 1:30 or 10.5' })
  .nullable()

// --- List items ------------------------------------------------------------------------------

export const circWeldSchema = z.strictObject({
  id,
  y: position,
  include,
  showLabel: z.boolean().default(false),
})

export const longSeamSchema = z.strictObject({
  id,
  x: position,
  /** Blank = seam starts at Y 0. */
  startY: position.default(null),
  /** Blank = seam runs to the vessel length. */
  stopY: position.default(null),
  include,
  showLabel: z.boolean().default(false),
})

export const shellNozzleSchema = z.strictObject({
  id,
  diameter: positiveSize,
  x: position,
  y: position,
  minT: nozzleMinT,
  notes,
  include,
  labelMode,
  noWrap,
})

export const objectSchema = z.strictObject({
  id,
  /** Lower-left corner, logical coordinates. */
  x: position,
  y: position,
  /** Size along X (circumference). */
  circWidth: positiveSize,
  /** Size along Y (length). */
  length: positiveSize,
  include,
  notes,
  noWrap,
})

export const shellMutSchema = z.strictObject({
  id,
  x: position,
  y: position,
  minT: mutMinT,
  notes,
  area: mutArea,
})

/** 0 = head center, 100 = head edge (v5.0's 0-1 factor x 100). */
const customRadiusPercent = z.number().gte(0).lte(100).nullable().default(null)

export const headNozzleSchema = z.strictObject({
  head,
  id,
  diameter: positiveSize,
  clock,
  radiusPosition,
  /** Percent of the head radius from the center. Needed (see findMissingData) when radiusPosition is CUSTOM. */
  customRadiusPercent,
  minT: nozzleMinT,
  notes,
  labelMode,
  include,
})

export const headMutSchema = z.strictObject({
  head,
  id,
  clock,
  radiusPosition,
  customRadiusPercent,
  minT: mutMinT,
  labelMode,
  include,
  notes,
  area: mutArea,
})

/** A scan with no width or height can be saved (so a half-typed job always saves); checks.ts blocks its export. */
export const scanSchema = z.strictObject({
  id,
  xStart: position,
  xStop: position,
  yStart: position,
  yStop: position,
  include,
  noWrap,
  /**
   * For X start greater than X stop: true = the scan runs from X start across the circumference seam to
   * X stop. False = reversed: the drawing swaps start and stop (as the Excel version does) and a check asks.
   */
  acrossSeam: z.boolean().default(false),
})

export const scanImageSchema = z.strictObject({
  /** ID of the scan this photo belongs to. */
  scanId: id,
  /** Photo file name, e.g. "S1.png". Blank = default name from the scan number. */
  imageFile: z.string().default(''),
  /** Processed (drawing-ready) file name. Blank = default name from the scan number. */
  processedImage: z.string().default(''),
  include,
})

/** Lists whose labels can be moved by hand in the drawing preview (Phase 5b): nozzles, then the plain text labels (head MUT: area labels only, 5c). */
export const MOVABLE_LABEL_LISTS = ['shellNozzles', 'headNozzles', 'circWelds', 'longSeams', 'objects', 'shellMut', 'headMut'] as const
export type MovableLabelList = (typeof MOVABLE_LABEL_LISTS)[number]
export type NozzleList = 'shellNozzles' | 'headNozzles'

/**
 * A label moved by hand in the drawing preview (format 5), keyed by its item's list, ID and which of the rows with
 * that ID it is (nozzle names may repeat), not by its row number, so it survives sorting and inserted rows; renames
 * and deletes are followed (data/overrides.ts). Measured as the drawing reads (right and up on the sheet, inches) from
 * where the label is drawn automatically: a nozzle's center (across the seam: its main piece), a MUT point, the spot of
 * a weld, seam or object label.
 */
export const labelOverrideSchema = z.strictObject({
  list: z.enum(MOVABLE_LABEL_LISTS),
  id: z.string(),
  /** Which of the rows with this ID (0 = the first). */
  occurrence: z.number().int().min(0).default(0),
  /** Label center as an offset; 'inside' = inside a nozzle circle, no leader; null = automatic. */
  label: z.union([z.strictObject({ dx: z.number(), dy: z.number() }), z.literal('inside')]).nullable().default(null),
  /** Nozzles: where the leader meets the circle, in degrees (0 = right, counter-clockwise as the drawing reads); null = automatic. */
  tip: z.number().nullable().default(null),
})

// --- Whole file ------------------------------------------------------------------------------

/** Plain names for lists and their fields, used in error messages and the docs. */
export const LIST_META = {
  circWelds: {
    name: 'Circ welds', idField: 'id',
    fields: { id: 'Weld ID', y: 'Y position', include: 'Include', showLabel: 'Show label' },
  },
  longSeams: {
    name: 'Long seams', idField: 'id',
    fields: { id: 'Seam ID', x: 'X position', startY: 'Start Y', stopY: 'Stop Y', include: 'Include', showLabel: 'Show label' },
  },
  shellNozzles: {
    name: 'Shell nozzles', idField: 'id',
    fields: {
      id: 'Nozzle name', diameter: 'Diameter', x: 'X position', y: 'Y position', minT: 'Min. T',
      notes: 'Notes', include: 'Include', labelMode: 'Label mode', noWrap: "Don't wrap",
    },
  },
  objects: {
    name: 'Objects', idField: 'id',
    fields: {
      id: 'Object ID', x: 'X position', y: 'Y position', circWidth: 'Circ. width', length: 'Length',
      include: 'Include', notes: 'Notes', noWrap: "Don't wrap",
    },
  },
  shellMut: {
    name: 'Shell MUT', idField: 'id',
    fields: { id: 'MUT ID', x: 'X position', y: 'Y position', minT: 'Min. T', notes: 'Notes', area: 'Area' },
  },
  headNozzles: {
    name: 'Head nozzles', idField: 'id',
    fields: {
      head: 'Head', id: 'Nozzle', diameter: 'Nozzle diameter', clock: 'Clock position',
      radiusPosition: 'Radius position', customRadiusPercent: 'Custom radius %', minT: 'Min. T',
      notes: 'Notes', labelMode: 'Label mode', include: 'Include',
    },
  },
  headMut: {
    name: 'Head MUT', idField: 'id',
    fields: {
      head: 'Head', id: 'MUT ID', clock: 'Clock position', radiusPosition: 'Radius position',
      customRadiusPercent: 'Custom radius %', minT: 'Min. T', labelMode: 'Label mode',
      include: 'Include', notes: 'Notes', area: 'Area',
    },
  },
  scans: {
    name: 'AUT scans', idField: 'id',
    fields: {
      id: 'Scan name', xStart: 'X start', xStop: 'X stop', yStart: 'Y start', yStop: 'Y stop', include: 'Include',
      noWrap: "Don't wrap", acrossSeam: 'Across the seam',
    },
  },
  scanImages: {
    name: 'Scan images', idField: 'scanId',
    fields: { scanId: 'Scan', imageFile: 'Image file', processedImage: 'Processed image', include: 'Include' },
  },
} as const

export type ListKey = keyof typeof LIST_META

/** Key used to compare IDs: the VBA ignores case and outer spaces. */
export function idKey(value: string): string {
  return value.trim().toLowerCase()
}

const projectFileShape = {
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  /** Stable ID of the job (format 2): written next to the processed images so CAD can tell jobs apart. */
  jobId: z
    .string()
    .refine((v) => v.trim().length > 0, { message: 'must not be blank' })
    .default(() => newJobId()),
  project: z.strictObject(shapeOf(PROJECT_FIELDS)).prefault({}),
  vessel: z.strictObject(shapeOf(VESSEL_FIELDS)).prefault({}),
  settings: z.strictObject(shapeOf(SETTINGS)).prefault({}),
  circWelds: z.array(circWeldSchema).default([]),
  longSeams: z.array(longSeamSchema).default([]),
  shellNozzles: z.array(shellNozzleSchema).default([]),
  objects: z.array(objectSchema).default([]),
  shellMut: z.array(shellMutSchema).default([]),
  headNozzles: z.array(headNozzleSchema).default([]),
  headMut: z.array(headMutSchema).default([]),
  scans: z.array(scanSchema).default([]),
  scanImages: z.array(scanImageSchema).default([]),
  /** Labels moved by hand in the drawing preview (format 5). */
  labelOverrides: z.array(labelOverrideSchema).default([]),
}

// Repeated IDs are allowed in a file (v5.0 allowed them, and jobs are imported as they are);
// findDuplicateIds lists them and export refuses until they are renamed (nozzles excepted: REPEATS_ALLOWED).
export const projectFileSchema = z.strictObject(projectFileShape).superRefine((file, ctx) => {
  const scanIds = new Set(file.scans.map((s) => idKey(s.id)))
  file.scanImages.forEach((img, i) => {
    if (!scanIds.has(idKey(img.scanId))) {
      ctx.addIssue({
        code: 'custom',
        path: ['scanImages', i, 'scanId'],
        message: `"${img.scanId}" does not match any AUT scan`,
      })
    }
  })
})

/** Lists that share one set of IDs: the heads are part of the vessel, so nozzle and MUT names never repeat. */
export const ID_GROUPS: ListKey[][] = [
  ['circWelds'],
  ['longSeams'],
  ['shellNozzles', 'headNozzles'],
  ['objects'],
  ['shellMut', 'headMut'],
  ['scans'],
  ['scanImages'],
]

/**
 * Lists whose names may repeat (user, 2026-10-25): two nozzles may carry the same label (e.g. two "TOL"). Review still
 * warns about a repeated nozzle name (data/checks.ts), but export goes on.
 */
export const REPEATS_ALLOWED: readonly ListKey[] = ['shellNozzles', 'headNozzles']
export const repeatsAllowed = (lists: readonly ListKey[]) => lists.every((l) => REPEATS_ALLOWED.includes(l))

/**
 * Every repeated ID (ignoring case and outer spaces) that blocks export, as sentences (repeated nozzle names don't:
 * REPEATS_ALLOWED). The project may still be saved and opened; export refuses until these are renamed.
 */
export function findDuplicateIds(project: Pick<Project, ListKey>): string[] {
  const out: string[] = []
  for (const lists of ID_GROUPS) {
    if (repeatsAllowed(lists)) continue
    const first = new Map<string, { list: ListKey; index: number }>()
    for (const list of lists) {
      const meta = LIST_META[list]
      const fields = meta.fields as Record<string, string>
      ;(project[list] as Record<string, unknown>[]).forEach((item, i) => {
        const value = String(item[meta.idField])
        const earlier = first.get(idKey(value))
        if (earlier === undefined) {
          first.set(idKey(value), { list, index: i })
          return
        }
        const where = earlier.list === list ? '' : `${LIST_META[earlier.list].name}, `
        out.push(
          `${meta.name}, item ${i + 1} (${value}): ${fields[meta.idField]} "${value}" is also used by ${where}item ${earlier.index + 1}; rename one before export.`,
        )
      })
    }
  }
  return out
}

/** Measurements each list needs before it can be drawn (null = not entered yet). */
export const REQUIRED_FOR_EXPORT: { [K in ListKey]: string[] } = {
  circWelds: ['y'],
  longSeams: ['x'],
  shellNozzles: ['diameter', 'x', 'y'],
  objects: ['x', 'y', 'circWidth', 'length'],
  shellMut: ['x', 'y'],
  headNozzles: ['diameter', 'clock'],
  headMut: ['clock'],
  scans: ['xStart', 'xStop', 'yStart', 'yStop'],
  scanImages: [],
}

/**
 * Lists values that must be filled in before the drawing can be generated, as sentences.
 * Like v5.0's generation check, items switched off (Include = No) are not checked; shell MUT
 * has no Include and is always checked. A valid project may still have missing data.
 */
export function findMissingData(project: Project): string[] {
  const out: string[] = []
  if (project.vessel.length === null) out.push('Vessel: Shell length (Y) is not entered yet.')
  if (project.vessel.height === null) out.push('Vessel: Circumference (X) is not entered yet.')
  for (const list of Object.keys(REQUIRED_FOR_EXPORT) as ListKey[]) {
    const meta = LIST_META[list]
    const fields = meta.fields as Record<string, string>
    ;(project[list] as Record<string, unknown>[]).forEach((item, i) => {
      if (item.include === false) return
      const missing = REQUIRED_FOR_EXPORT[list].filter((f) => item[f] === null)
      if (item.radiusPosition === null) missing.push('radiusPosition')
      if (item.radiusPosition === 'CUSTOM' && item.customRadiusPercent === null) missing.push('customRadiusPercent')
      for (const f of missing) {
        const verb = f === 'radiusPosition' ? 'is not selected yet' : 'is not entered yet'
        out.push(`${meta.name}, item ${i + 1} (${String(item[meta.idField])}): ${fields[f]} ${verb}.`)
      }
    })
  }
  return out
}

/** A valid project, with every default filled in. */
export type Project = z.output<typeof projectFileSchema>
/** What a project file may contain before defaults are filled. */
export type ProjectInput = z.input<typeof projectFileSchema>

export type CircWeld = z.output<typeof circWeldSchema>
export type LongSeam = z.output<typeof longSeamSchema>
export type ShellNozzle = z.output<typeof shellNozzleSchema>
export type ShellObject = z.output<typeof objectSchema>
export type ShellMut = z.output<typeof shellMutSchema>
export type HeadNozzle = z.output<typeof headNozzleSchema>
export type HeadMut = z.output<typeof headMutSchema>
export type Scan = z.output<typeof scanSchema>
export type ScanImage = z.output<typeof scanImageSchema>
export type LabelOverride = z.output<typeof labelOverrideSchema>
/** A MUT area's corners (see mutArea). */
export type MutArea = [number, number][]
