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

export const CURRENT_SCHEMA_VERSION = 1

// --- Building blocks -------------------------------------------------------------------------

const id = z
  .string()
  .refine((s) => s.trim().length > 0, { message: 'must not be blank' })
  .refine((s) => s.trim() === s, { message: 'must not start or end with a space' })

const position = z.number()
const positiveSize = z.number().gt(0)
const thickness = z.number().gte(0)
/** Min. T on nozzles: a thickness, "TOL" (v5.0 accepts it there), or not recorded. */
const nozzleMinT = z.union([thickness, z.literal('TOL')]).nullable().default(null)
const mutMinT = thickness.nullable().default(null)
const include = z.boolean().default(true)
const notes = z.string().default('')

export const LABEL_MODES = ['AUTO', 'INSIDE', 'OUTSIDE'] as const
export const HEADS = ['HEAD 1', 'HEAD 2'] as const
export const RADIUS_POSITIONS = ['CENTER', 'HALF', 'THREE_QUARTER', 'OUTER', 'CUSTOM'] as const

const labelMode = z.enum(LABEL_MODES).default('AUTO')
const head = z.enum(HEADS)
const radiusPosition = z.enum(RADIUS_POSITIONS).default('CENTER')

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

const clock = z.string().refine(isValidClock, {
  message: 'must be a clock position from 1 to 12, such as 3, 1:30 or 10.5',
})

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
  startY: position.nullable().default(null),
  /** Blank = seam runs to the vessel length. */
  stopY: position.nullable().default(null),
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
})

export const shellMutSchema = z.strictObject({
  id,
  x: position,
  y: position,
  minT: mutMinT,
  notes,
})

/** 0 = head center, 100 = head edge (v5.0's 0-1 factor x 100). */
const customRadiusPercent = z.number().gte(0).lte(100).nullable().default(null)

export const headNozzleSchema = z
  .strictObject({
    head,
    id,
    diameter: positiveSize,
    clock,
    radiusPosition,
    /** Percent of the head radius from the center. Required when radiusPosition is CUSTOM. */
    customRadiusPercent,
    minT: nozzleMinT,
    notes,
    labelMode,
    include,
  })
  .superRefine(requireCustomFactor)

export const headMutSchema = z
  .strictObject({
    head,
    id,
    clock,
    radiusPosition,
    customRadiusPercent,
    minT: mutMinT,
    labelMode,
    include,
    notes,
  })
  .superRefine(requireCustomFactor)

function requireCustomFactor(
  item: { radiusPosition: string; customRadiusPercent: number | null },
  ctx: z.RefinementCtx,
) {
  if (item.radiusPosition === 'CUSTOM' && item.customRadiusPercent === null) {
    ctx.addIssue({
      code: 'custom',
      path: ['customRadiusPercent'],
      message: 'is required when the radius position is CUSTOM',
    })
  }
}

export const scanSchema = z
  .strictObject({
    id,
    xStart: position,
    xStop: position,
    yStart: position,
    yStop: position,
    include,
  })
  .superRefine((s, ctx) => {
    if (s.xStart === s.xStop) {
      ctx.addIssue({ code: 'custom', path: ['xStop'], message: 'must differ from X start (the scan has no width)' })
    }
    if (s.yStart === s.yStop) {
      ctx.addIssue({ code: 'custom', path: ['yStop'], message: 'must differ from Y start (the scan has no height)' })
    }
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

// --- Whole file ------------------------------------------------------------------------------

/** Plain names for lists and their fields, used in error messages and the docs. */
export const LIST_META = {
  circWelds: {
    name: 'Circ welds', idField: 'id',
    fields: { id: 'Weld ID', y: 'Y position', include: 'Include', showLabel: 'Label' },
  },
  longSeams: {
    name: 'Long seams', idField: 'id',
    fields: { id: 'Seam ID', x: 'X position', startY: 'Start Y', stopY: 'Stop Y', include: 'Include', showLabel: 'Label' },
  },
  shellNozzles: {
    name: 'Shell nozzles', idField: 'id',
    fields: {
      id: 'Nozzle name', diameter: 'Diameter', x: 'X position', y: 'Y position', minT: 'Min. T',
      notes: 'Notes', include: 'Include', labelMode: 'Label mode',
    },
  },
  objects: {
    name: 'Objects', idField: 'id',
    fields: {
      id: 'Object ID', x: 'X position', y: 'Y position', circWidth: 'Circ. width', length: 'Length',
      include: 'Include', notes: 'Notes',
    },
  },
  shellMut: {
    name: 'Shell MUT', idField: 'id',
    fields: { id: 'MUT ID', x: 'X position', y: 'Y position', minT: 'Min. T', notes: 'Notes' },
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
      include: 'Include', notes: 'Notes',
    },
  },
  scans: {
    name: 'AUT scans', idField: 'id',
    fields: { id: 'Scan name', xStart: 'X start', xStop: 'X stop', yStart: 'Y start', yStop: 'Y stop', include: 'Include' },
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
}

export const projectFileSchema = z.strictObject(projectFileShape).superRefine((file, ctx) => {
  checkUniqueIds(file, ['circWelds'], ctx)
  checkUniqueIds(file, ['longSeams'], ctx)
  checkUniqueIds(file, ['shellNozzles', 'headNozzles'], ctx)
  checkUniqueIds(file, ['objects'], ctx)
  checkUniqueIds(file, ['shellMut', 'headMut'], ctx)
  checkUniqueIds(file, ['scans'], ctx)
  checkUniqueIds(file, ['scanImages'], ctx)

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

/** Reports every repeated ID across the given lists, which share one set of IDs. */
function checkUniqueIds(file: Record<ListKey, Record<string, unknown>[]>, lists: ListKey[], ctx: z.RefinementCtx) {
  const first = new Map<string, { list: ListKey; index: number }>()
  for (const list of lists) {
    const field = LIST_META[list].idField
    file[list].forEach((item, i) => {
      const value = String(item[field])
      const earlier = first.get(idKey(value))
      if (earlier === undefined) {
        first.set(idKey(value), { list, index: i })
        return
      }
      const where = earlier.list === list ? '' : `${LIST_META[earlier.list].name}, `
      ctx.addIssue({
        code: 'custom',
        path: [list, i, field],
        message: `"${value}" is already used by ${where}item ${earlier.index + 1}; IDs must be unique`,
      })
    })
  }
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
