// Report data in the project file (format 7, report design section 4): everything under the file's `report` key,
// null for a drawing-only job. Shared values (job fields, scans, MUT rows, nozzles, coverage) are never copied here;
// the report keeps only what it adds: components, report-only job fields, calibration, results per scan, reading
// details, photos, pages, text, section switches and options. Files (screenshots, photos, uploads) are linked by file
// name, not copied in.
//
// Choice values from the comment builder (severity, form, cause, surface, mid-wall) are stored as the template's
// choice ids, so a client template can word them differently; the checks look them up in the job's template.

import { z } from 'zod'
import { NPS_SIZES } from './calc/pipeWalls.ts'

// --- Building blocks -------------------------------------------------------------------------

const nonBlank = z
  .string()
  .refine((s) => s.trim().length > 0, { message: 'must not be blank' })
  .refine((s) => s.trim() === s, { message: 'must not start or end with a space' })
const text = z.string().default('')
/** Inches; null = not entered yet. */
const length = z.number().gte(0).nullable().default(null)
/** A wall thickness in inches, greater than 0; null = not entered yet. */
const thickness = z.number().gt(0).nullable().default(null)
/** A measured thickness (0 allowed: a through-wall reading); null = not entered yet. */
const reading = z.number().gte(0).nullable().default(null)
/** A linked file (screenshot, photo, PDF) by its name in the job's folders; null = none. */
const file = z.string().nullable().default(null)
const choiceId = z.string().nullable().default(null)

export const COMPONENT_KINDS = ['shell', 'course', 'head', 'boot', 'line', 'other'] as const
export const READING_TYPES = ['UTT', 'MUT scan'] as const
export const NOMINAL_MODES = ['component', 'pipe', 'custom'] as const
/** Values that were worked out, not read or typed (shown as "calculated"). */
export const CALCULATED_FIELDS = ['readings', 'incrX', 'incrY'] as const
export const SHEET_LAYOUTS = ['1 large', '2 side by side', '2 + side panel', '4 grid'] as const

// --- 4.0 Components --------------------------------------------------------------------------

export const componentSchema = z.strictObject({
  /** Stable internal id ('shell', 'head1', 'c3'); results and readings point at it. */
  id: nonBlank,
  /** "Shell", "Shell course 1", "Boot", "Head 1". */
  name: nonBlank,
  kind: z.enum(COMPONENT_KINDS),
  /** Inches; required before export (report/checks.ts). */
  nominal: thickness,
  /** Blank = the job's material. */
  material: z.string().nullable().default(null),
  size: z
    .strictObject({
      circumference: length,
      length,
      diameter: length,
      nps: z.enum(NPS_SIZES).nullable().default(null),
    })
    .prefault({}),
  /** Shell courses / plates: the Y band in inches; scans are assigned by their Y position. */
  yRange: z.tuple([z.number(), z.number()]).nullable().default(null),
  notes: text,
})

// --- 4.1 Report-only job fields --------------------------------------------------------------

const person = z.strictObject({ name: text, title: text })

export const reportJobSchema = z.strictObject({
  /** Job number on the cover and footer (blank never prints "0"). */
  jobNumber: text,
  /** Report revision on the cover and footer. */
  reportRevision: text,
  /** Revision of the project's procedure. */
  procedureRevision: text,
  /** Empty = the template's ("Corrosion Mapping Examination"). */
  examinationType: text,
  techs: z.array(person).default([]),
  reviewer: person.nullable().default(null),
  acceptanceCriteria: text,
  surfaceCondition: text,
  inspectionSurface: text,
  technique: text,
  coordinates: text,
  costCenter: text,
  /** Optional cover fields turned on (FieldRef sources, e.g. 'project.unit'). */
  coverExtras: z.array(z.string()).default([]),
})

// --- 4.2 Calibration and equipment -----------------------------------------------------------

const equipment = z.strictObject({ maker: text, model: text, serial: text })

export const transducerSchema = z.strictObject({
  maker: text,
  /** "Longitudinal", "Shear". */
  mode: text,
  element: z.enum(['', 'Single', 'Dual']).default(''),
  /** As printed, e.g. 0.375". */
  size: text,
  /** As printed, e.g. "5 MHz". */
  frequency: text,
  angle: text,
  serial: text,
})

export const calibrationSchema = z.strictObject({
  block: z.strictObject({ name: text, thicknessRange: text, material: text }).prefault({}),
  referenceReflector: text,
  system: equipment.prefault({}),
  /** Up to 4 channels; only filled ones print. */
  transducers: z.array(transducerSchema).max(4).default([]),
  scanner: z
    .strictObject({
      maker: text, model: text, serial: text,
      drive: z.enum(['', 'Automated', 'Manual']).default(''),
      wheelsOrientation: text, wheelsScanSpeed: text, wheelsDirection: z.enum(['', 'Horizontal', 'Vertical']).default(''),
      armOrientation: text, armScanSpeed: text, armDirection: z.enum(['', 'Horizontal', 'Vertical']).default(''),
      track: z.boolean().nullable().default(null),
      armLength: text,
    })
    .prefault({}),
  /** The job's scan increments (inches): the default for pasted scans and the scope sentence. */
  increments: z.strictObject({ x: thickness, y: thickness }).prefault({}),
  /** Dynamic calibration screenshot. */
  dynamicImage: file,
})

// --- 4.3 Scan results ------------------------------------------------------------------------

/** Comment builder picks (design 4.3.1), shared by scan results and manual readings. */
const commentFields = {
  /** Ladder severity chosen by hand (flagged); null = from the ladder. */
  severityOverride: choiceId,
  form: z.string().default(''),
  /** Blank = "wall loss". */
  cause: z.string().default(''),
  surface: z.string().default('ID'),
  midWall: z.string().default('none'),
  /** Free text instead of the built comment (flagged). */
  commentOverride: z.string().nullable().default(null),
}

export const scanResultSchema = z.strictObject({
  /** The drawing scan's ID (case and outer spaces ignored); followed through renames, removed with the scan. */
  scanId: nonBlank,
  /** null = automatic: by Y band among the shell courses, or the only shell. */
  componentId: z.string().nullable().default(null),
  /** Extra wording, e.g. "Bottom". */
  location: z.string().nullable().default(null),
  incrX: thickness,
  incrY: thickness,
  readings: z.number().int().gte(0).nullable().default(null),
  minT: reading,
  avgT: reading,
  /** Nom. 'T' from the CSV, kept for reference; wall loss uses the component's nominal. */
  csvNomT: reading,
  /** Wall Remain % from the CSV: read, compared with the recalculated wall loss, never used. */
  csvWallRemain: z.number().nullable().default(null),
  csvComment: text,
  /** Values worked out rather than read (readings from positions and increments, job increments). */
  calculated: z.array(z.enum(CALCULATED_FIELDS)).default([]),
  ...commentFields,
  /** Full data-page screenshot. */
  dataImage: file,
  /** Listed in the report (separate from the drawing's Include). */
  inReport: z.boolean().default(true),
})

// --- 4.4 Manual readings ---------------------------------------------------------------------

/** A drawing row, keyed like moved labels: list + ID + which of the rows with that ID. */
const rowRef = <L extends readonly [string, ...string[]]>(lists: L) =>
  z.strictObject({ list: z.enum(lists), id: z.string(), occurrence: z.number().int().min(0).default(0) })

export const MUT_LISTS = ['shellMut', 'headMut'] as const
export const NOZZLE_LISTS = ['shellNozzles', 'headNozzles'] as const

export const readingSchema = z.strictObject({
  /** A linked row: a shell or head MUT row of the drawing (ID, position, Min T, notes, area come from it). */
  link: rowRef(MUT_LISTS).nullable().default(null),
  /** A report row's nozzle, when it is linked to one (its ID and size come from the nozzle). */
  nozzle: rowRef(NOZZLE_LISTS).nullable().default(null),
  /** Report rows: "Nozzle 3"; linked rows use the drawing's ID. */
  name: text,
  /** "North", "Top". */
  location: text,
  componentId: z.string().nullable().default(null),
  type: z.enum(READING_TYPES).default('UTT'),
  /** Report rows; a linked row uses the drawing row's Min T. */
  minT: reading,
  avgT: reading,
  maxT: reading,
  /** MUT scan area (sq in) for a report row; a linked row uses its drawn area. */
  area: length,
  nominalMode: z.enum(NOMINAL_MODES).default('custom'),
  pipeSize: z.enum(NPS_SIZES).nullable().default(null),
  /** Pipe: a wall chosen by hand (null = the suggestion); custom: the typed nominal. */
  nominal: thickness,
  /** Not measured, with the reason printed ("U-Bolt Obstruction"); left out of the math. */
  na: z.string().nullable().default(null),
  ...commentFields,
})

// --- 4.5 - 4.6 Photos, custom sheets, uploads ------------------------------------------------

export const photoSchema = z.strictObject({ file: nonBlank, caption: text, alone: z.boolean().default(false) })

const box = z.strictObject({ x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number() })
export const blockSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('image'), file: nonBlank, caption: text }),
  z.strictObject({
    kind: z.literal('view'),
    view: z.union([z.enum(['head1', 'head2', 'main']), z.string().regex(/^section:\d+$/), z.strictObject({ crop: box })]),
  }),
  z.strictObject({
    kind: z.literal('cscanBoxes'),
    scanId: z.string().nullable().default(null),
    comment: text,
    stats: z.array(z.strictObject({ label: text, value: text })).default([]),
  }),
  z.strictObject({ kind: z.literal('text'), title: text, body: text }),
  z.strictObject({ kind: z.literal('table'), title: text, rows: z.array(z.array(z.string())).default([]) }),
])

export const customSheetSchema = z.strictObject({
  id: nonBlank,
  title: text,
  /** Placed after this section (default: the C-scans). */
  after: z.string().default('cscan'),
  layout: z.enum(SHEET_LAYOUTS).default('1 large'),
  blocks: z.array(blockSchema).default([]),
})

export const uploadSchema = z.strictObject({
  file: nonBlank,
  /** PDF page (1 = the first); null for an image. */
  page: z.number().int().min(1).nullable().default(null),
  title: text,
  after: z.string().default('cscan'),
  frame: z.enum(['standard', 'full']).default('standard'),
  rotate: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0),
})

// --- 4.7 - 4.9 Text, sections, options ------------------------------------------------------

export const reportTextSchema = z.strictObject({
  scope: z
    .strictObject({
      /** Text blocks switched on or off; a block not listed uses the template's default. */
      blocks: z.record(z.string(), z.boolean()).default({}),
      fields: z.strictObject({ purpose: text, areaCovered: text, limitations: text }).prefault({}),
      /** Scope edited by hand (kept until Regenerate). */
      edited: z.string().nullable().default(null),
    })
    .prefault({}),
  summary: z
    .strictObject({
      blocks: z.record(z.string(), z.boolean()).default({}),
      edited: z.string().nullable().default(null),
      /** ISO date-times, to tell the user the data changed after the edit. */
      editedAt: z.string().nullable().default(null),
      generatedAt: z.string().nullable().default(null),
    })
    .prefault({}),
})

export const sectionStateSchema = z.strictObject({
  on: z.boolean(),
  order: z.number().optional(),
  title: z.string().optional(),
})

/** Ladder cutoffs: three increasing wall loss percentages. */
const cutoffs = z
  .tuple([z.number(), z.number(), z.number()])
  .refine(([a, b, c]) => a >= 0 && a < b && b < c, { message: 'must be three increasing percentages from 0 up' })

export const reportOptionsSchema = z.strictObject({
  /** null = the template's cutoffs; a job may change them (flagged). */
  ladder: z.strictObject({ cutoffs: cutoffs.nullable().default(null) }).prefault({}),
  tempCorrection: z.strictObject({ on: z.boolean().default(false), tempF: z.number().nullable().default(null) }).prefault({}),
  drawings: z
    .strictObject({
      rollout: z.boolean().default(true),
      overlay: z.boolean().default(true),
      sections: z.enum(['as drawing', 'off']).default('as drawing'),
    })
    .prefault({}),
  cscanStats: z.strictObject({ temperature: z.boolean().default(false) }).prefault({}),
  numberWords: z.boolean().default(true),
})

// --- The report ------------------------------------------------------------------------------

export const reportSchema = z
  .strictObject({
    templateId: nonBlank,
    templateVersion: z.number().int().min(1),
    components: z.array(componentSchema).default([]),
    job: reportJobSchema.prefault({}),
    calibration: calibrationSchema.prefault({}),
    scanResults: z.array(scanResultSchema).default([]),
    readings: z.array(readingSchema).default([]),
    photos: z.array(photoSchema).default([]),
    coverPhoto: file,
    customSheets: z.array(customSheetSchema).default([]),
    uploads: z.array(uploadSchema).default([]),
    text: reportTextSchema.prefault({}),
    sections: z.record(z.string(), sectionStateSchema).default({}),
    options: reportOptionsSchema.prefault({}),
  })
  .superRefine((r, ctx) => {
    const ids = new Set<string>()
    r.components.forEach((c, i) => {
      if (ids.has(c.id)) ctx.addIssue({ code: 'custom', path: ['components', i, 'id'], message: `"${c.id}" is used by another component` })
      ids.add(c.id)
    })
    const where = (list: 'scanResults' | 'readings', i: number) => ({ path: [list, i, 'componentId'] })
    r.scanResults.forEach((s, i) => {
      if (s.componentId !== null && !ids.has(s.componentId)) ctx.addIssue({ code: 'custom', ...where('scanResults', i), message: `"${s.componentId}" does not match any component` })
    })
    r.readings.forEach((s, i) => {
      if (s.componentId !== null && !ids.has(s.componentId)) ctx.addIssue({ code: 'custom', ...where('readings', i), message: `"${s.componentId}" does not match any component` })
    })
    const seen = new Set<string>()
    r.scanResults.forEach((s, i) => {
      const k = s.scanId.trim().toLowerCase()
      if (seen.has(k)) ctx.addIssue({ code: 'custom', path: ['scanResults', i, 'scanId'], message: `"${s.scanId}" has two result rows` })
      seen.add(k)
    })
  })

export type Report = z.output<typeof reportSchema>
export type ReportInput = z.input<typeof reportSchema>
export type Component = z.output<typeof componentSchema>
export type ComponentKind = (typeof COMPONENT_KINDS)[number]
export type ScanResult = z.output<typeof scanResultSchema>
export type Reading = z.output<typeof readingSchema>
export type ReadingType = (typeof READING_TYPES)[number]
export type NominalMode = (typeof NOMINAL_MODES)[number]
export type Transducer = z.output<typeof transducerSchema>
export type CalculatedField = (typeof CALCULATED_FIELDS)[number]
export type MutList = (typeof MUT_LISTS)[number]
export type NozzleListKey = (typeof NOZZLE_LISTS)[number]

/** Plain names for the report's lists and fields, for error messages ("Report, scan results, item 3 (SCAN 3): ..."). */
export const REPORT_META: Record<string, { name: string; idField?: string; fields: Record<string, string> }> = {
  components: { name: 'components', idField: 'name', fields: { id: 'Component ID', name: 'Name', kind: 'Kind', nominal: 'Nominal', yRange: 'Y band' } },
  scanResults: {
    name: 'scan results', idField: 'scanId',
    fields: { scanId: 'Scan', componentId: 'Component', incrX: 'X increment', incrY: 'Y increment', readings: 'Readings', minT: "Min 'T'", avgT: "Avg 'T'", csvWallRemain: 'Wall Remain %' },
  },
  readings: { name: 'manual readings', idField: 'name', fields: { componentId: 'Component', minT: "Min 'T'", avgT: "Avg 'T'", maxT: "Max 'T'", nominal: 'Nominal', pipeSize: 'Pipe size', type: 'Type' } },
  photos: { name: 'photos', idField: 'file', fields: { file: 'File' } },
  customSheets: { name: 'custom sheets', idField: 'title', fields: {} },
  uploads: { name: 'reference pages', idField: 'file', fields: { page: 'Page' } },
  job: { name: 'job fields', fields: {} },
  calibration: { name: 'calibration', fields: { transducers: 'Transducers' } },
  options: { name: 'options', fields: { cutoffs: 'Ladder cutoffs', tempF: 'Temperature' } },
}

/** "Report, scan results, item 4 (SCAN 4): " + field name, for a Zod issue path under `report`. */
export function describeReportPath(path: readonly PropertyKey[], report: unknown): { prefix: string; field: string } {
  const [list, index, field] = path
  const meta = typeof list === 'string' ? REPORT_META[list] : undefined
  if (!meta) return { prefix: 'Report: ', field: path.map(String).join('.') }
  if (typeof index !== 'number') {
    const last = path[path.length - 1]
    return { prefix: `Report, ${meta.name}: `, field: index === undefined ? '' : (meta.fields[String(last)] ?? String(last)) }
  }
  const items = (report as Record<string, unknown> | null)?.[list as string]
  const item = Array.isArray(items) ? (items[index] as Record<string, unknown> | undefined) : undefined
  const idValue = item && meta.idField ? item[meta.idField] : undefined
  const idText = typeof idValue === 'string' && idValue.trim() ? ` (${idValue.trim()})` : ''
  const fieldName = field === undefined ? '' : (meta.fields[String(field)] ?? `"${String(field)}"`)
  return { prefix: `Report, ${meta.name}, item ${index + 1}${idText}: `, field: fieldName }
}
