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
/** Custom sheets and uploads go after this section unless the user moves them (they print in their own section). */
export const DEFAULT_PLACE_AFTER = 'cscan'
export const SHEET_LAYOUTS = ['1 large', '2 side by side', '2 + side panel', '4 grid'] as const

/** A drawing row, keyed like moved labels: list + ID + which of the rows with that ID. */
const rowRef = <L extends readonly [string, ...string[]]>(lists: L) =>
  z.strictObject({ list: z.enum(lists), id: z.string(), occurrence: z.number().int().min(0).default(0) })

// --- Image edits (format 8; design "Photos: markup, crop, labels") ---------------------------
// Every image-like item (photos, the cover photo, data-page screenshots, the calibration screenshot, custom-sheet
// images, uploads) carries the same edits. The file itself is never changed. Positions are fractions 0-1 of the
// picture as it stands after its phone (EXIF) orientation and before `rotate` (x to the right, y down), so a quarter
// turn turns the crop and the marks with the picture. Items that are only a file name (cover photo, data-page and
// calibration screenshots) keep the name and carry the edits beside it (`coverPhotoEdits`, ...).

export const ROTATIONS = [0, 90, 180, 270] as const
export type Rotation = (typeof ROTATIONS)[number]
const rotation = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])
const unit = z.number().min(0).max(1)
const point = z.tuple([unit, unit])
/** A box in 0-1 picture fractions, x0 < x1 and y0 < y1. */
const fracBox = z
  .strictObject({ x0: unit, y0: unit, x1: unit, y1: unit })
  .refine((b) => b.x0 < b.x1 && b.y0 < b.y1, { message: 'must have its first corner above and left of the second' })

export const MARK_KINDS = ['rect', 'ellipse', 'highlight', 'pen', 'line', 'arrow', 'label', 'badge', 'redaction'] as const
export type MarkKind = (typeof MARK_KINDS)[number]
/** Rows a mark can be linked to (live data labels): a scan or a shell / head MUT row. */
export const MARK_LINK_LISTS = ['scans', 'shellMut', 'headMut'] as const
export type MarkLinkList = (typeof MARK_LINK_LISTS)[number]

export const markStyleSchema = z.strictObject({
  /** CSS hex colour of lines and outlines; null = none. Default red (a finding). */
  stroke: z.string().nullable().default('#d62828'),
  /** CSS hex fill; null = none (a highlighted box: a fill with fillOpacity below 1). */
  fill: z.string().nullable().default(null),
  fillOpacity: unit.default(1),
  /** Opacity of the whole mark (highlighter strokes are see-through). */
  opacity: unit.default(1),
  /** Line width in points at print size. */
  width: z.number().gt(0).default(1.5),
  /** Stroke ends: flat (marker) or round. */
  ends: z.enum(['flat', 'round']).default('round'),
  /** Text size in points at print size (labels, badges). */
  textSize: z.number().gt(0).default(9),
  textColor: z.string().default('#ffffff'),
  // Format 10 (R5, labels):
  /** Bold text (headings, findings). */
  bold: z.boolean().default(false),
  /** The report's bundled fonts: Roboto (text) or Montserrat (headings). */
  font: z.enum(['roboto', 'montserrat']).default('roboto'),
  /** Opacity of a label's or badge's box background (slightly see-through reads well on any photo). */
  bgOpacity: unit.default(0.9),
  /** A thin contrasting outline round a label or badge box, and a halo round plain text, so it reads on any photo. */
  halo: z.boolean().default(true),
})

const markBase = {
  id: nonBlank,
  style: markStyleSchema.prefault({}),
  /** Live data label: the scan or MUT row it shows (followed through renames; a deleted row leaves it for Review). */
  link: rowRef(MARK_LINK_LISTS).nullable().default(null),
  /** Drawing order: higher on top. */
  z: z.number().default(0),
  locked: z.boolean().default(false),
}

/** Turn of a box mark in degrees, clockwise, about its centre, in the picture's own pixels (format 10). */
const angle = z.number().min(-360).max(360).default(0)
/** Arrow ends, as the drawing's leaders (format 10). */
export const ARROW_HEADS = ['closed', 'open', 'dot', 'none'] as const

export const markSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('rect'), ...markBase, box: fracBox, angle }),
  z.strictObject({ kind: z.literal('ellipse'), ...markBase, box: fracBox, angle }),
  /** Highlighter: freehand points, or a straight stroke (two points). */
  z.strictObject({ kind: z.literal('highlight'), ...markBase, points: z.array(point).min(2), straight: z.boolean().default(false) }),
  z.strictObject({ kind: z.literal('pen'), ...markBase, points: z.array(point).min(2) }),
  z.strictObject({ kind: z.literal('line'), ...markBase, from: point, to: point }),
  z.strictObject({ kind: z.literal('arrow'), ...markBase, from: point, to: point, head: z.enum(ARROW_HEADS).default('closed') }),
  /**
   * Text label or callout: centred at `at`, optional leader to `leader` with its end. A live data label (format 10) has
   * a `link` and a `template` with fields ("{scan} · Min {minT} in"); `text` holds the last filled text, so a label
   * whose row was deleted still prints it (Review warns).
   */
  z.strictObject({
    kind: z.literal('label'), ...markBase, at: point, text,
    template: z.string().default(''),
    callout: z.enum(['rounded', 'square', 'pill', 'plain']).default('rounded'),
    leader: point.nullable().default(null),
    leaderEnd: z.enum(['arrow', 'dot', 'none']).default('arrow'),
  }),
  /** Numbered badge; `text` is its line in the key printed under the picture. */
  z.strictObject({ kind: z.literal('badge'), ...markBase, at: point, n: z.number().int().min(1), text }),
  /** Removes the pixels: the PDF and the Pages view get the picture with that area blacked out or blurred (R5). */
  z.strictObject({ kind: z.literal('redaction'), ...markBase, box: fracBox, mode: z.enum(['black', 'blur']).default('black') }),
])

export const imageEditsShape = {
  /** Part of the picture that prints; null = all of it. */
  crop: fracBox.nullable().default(null),
  /** Quarter turns clockwise, on top of the file's own (EXIF) orientation. */
  rotate: rotation.default(0),
  adjust: z.strictObject({
    autoLevels: z.boolean().default(false),
    /** Darken a faint page: 0 off, 1 darker, 2 much darker (format 9; uploaded PDF pages print over themselves, multiplied). */
    darken: z.number().int().min(0).max(2).default(0),
  }).prefault({}),
  markup: z.array(markSchema).default([]),
}
export const imageEditsSchema = z.strictObject(imageEditsShape)

/** Photos per page of a photo section. */
export const PHOTOS_PER_PAGE = ['auto', 1, 2, 4] as const
export type PhotosPerPage = (typeof PHOTOS_PER_PAGE)[number]
const photosPerPage = z.union([z.literal('auto'), z.literal(1), z.literal(2), z.literal(4)])

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
  dynamicImageEdits: imageEditsSchema.prefault({}),
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
  dataImageEdits: imageEditsSchema.prefault({}),
  /** Listed in the report (separate from the drawing's Include). */
  inReport: z.boolean().default(true),
})

// --- 4.4 Manual readings ---------------------------------------------------------------------

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

export const photoSchema = z.strictObject({ file: nonBlank, caption: text, alone: z.boolean().default(false), ...imageEditsShape })

const box = z.strictObject({ x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number() })
export const blockSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('image'), file: nonBlank, caption: text, ...imageEditsShape }),
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
  after: z.string().default(DEFAULT_PLACE_AFTER),
  layout: z.enum(SHEET_LAYOUTS).default('1 large'),
  blocks: z.array(blockSchema).default([]),
})

export const uploadSchema = z.strictObject({
  file: nonBlank,
  /** PDF page (1 = the first); null for an image. */
  page: z.number().int().min(1).nullable().default(null),
  title: text,
  after: z.string().default(DEFAULT_PLACE_AFTER),
  frame: z.enum(['standard', 'full']).default('standard'),
  ...imageEditsShape,
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
      /** 'as drawing' = the scans version (hatched, no photos), as before; 'overlays' with the photos; 'both' = scans, then overlays. */
      sections: z.enum(['as drawing', 'overlays', 'both', 'off']).default('as drawing'),
    })
    .prefault({}),
  cscanStats: z.strictObject({ temperature: z.boolean().default(false) }).prefault({}),
  numberWords: z.boolean().default(true),
  /** Photos per page by photo section id; a section not listed uses its template option, else 'auto'. */
  photosPerPage: z.record(z.string(), photosPerPage).default({}),
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
    coverPhotoEdits: imageEditsSchema.prefault({}),
    customSheets: z.array(customSheetSchema).default([]),
    uploads: z.array(uploadSchema).default([]),
    /**
     * Marks on the drawing sheets the report prints (format 10, user 2026-11-01), by sheet: 'rollout', 'overlay',
     * '<scans|overlays>:overview' / ':<section n>', 'sheet:<custom sheet id>:<block>'. Fractions of the sheet as printed.
     */
    drawingMarkup: z.record(z.string(), z.array(markSchema)).default({}),
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
export type Photo = z.output<typeof photoSchema>
export type Upload = z.output<typeof uploadSchema>
export type CustomSheet = z.output<typeof customSheetSchema>
export type Block = z.output<typeof blockSchema>
export type Mark = z.output<typeof markSchema>
export type MarkStyle = z.output<typeof markStyleSchema>
export type ImageEdits = z.output<typeof imageEditsSchema>
export type FracBox = z.output<typeof fracBox>

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
