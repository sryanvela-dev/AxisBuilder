// Every per-job value that v5.0 keeps on the Project Settings and Drawing Information sheets,
// defined once: internal key, v5.0 Excel label, plain name, description, type, units, range or
// choices, default, app step and suggested level. The project file schema (schema.ts) and the
// settings review doc (docs/settings-review.md) are both built from these tables.
//
// Defaults are the values in the v5.0 workbook (New Project keeps them), except fields that New
// Project clears, which default to blank. Where the VBA falls back to a different value when the
// row is missing, `v5` says so.

import { z } from 'zod'

export type AppStep = 'Project' | 'Field data' | 'AUT scans' | 'Images' | 'Drawing' | 'Export'
export type Level = 'Basic' | 'Advanced'
export type ExcelSheet = 'Project Settings' | 'Drawing Information'

/** Groups of settings on the step forms, in the order shown. */
export const SETTING_GROUPS = [
  { id: 'job', step: 'Project', title: 'Job information', intro: 'Printed in the title block of the drawing.' },
  { id: 'vessel', step: 'Project', title: 'Vessel size and orientation', intro: 'Size of the shell layout and which way it is drawn.' },
  { id: 'axes', step: 'Project', title: 'Axis directions', intro: 'Direction text printed along the rulers.' },
  { id: 'refLabels', step: 'Project', title: 'Reference labels', intro: 'Labels printed around the vessel, such as TDC and BDC.' },
  { id: 'heads', step: 'Field data', title: 'Heads', intro: 'Head views drawn beside the shell layout, and their names.' },
  { id: 'scans', step: 'AUT scans', title: 'Scan drawing and checks', intro: 'How scanned areas are hatched, and how overlapping scans are treated.' },
  { id: 'images', step: 'Images', title: 'Scan images', intro: 'Whether photos are used, and how the processed copies are made.' },
  { id: 'textStyles', step: 'Drawing', title: 'Text sizes and colors', intro: 'One row per kind of text (each has its own CAD layer). Automatic is the size the drawing has always used.' },
  { id: 'rulers', step: 'Drawing', title: 'Rulers and labels', intro: 'Rulers along the shell, reference labels and direction arrows.' },
  { id: 'nozzleLabels', step: 'Drawing', title: 'Nozzle labels', intro: 'When a nozzle label goes inside its circle, and how long the leaders are.' },
  { id: 'legendTitle', step: 'Drawing', title: 'Legend and title block', intro: 'The legend, the coverage figure and the title block.' },
  { id: 'headsDrawing', step: 'Drawing', title: 'Head views', intro: 'How the head views are drawn. Which heads are shown, and their names, are on the Field data step.' },
  { id: 'showHide', step: 'Drawing', title: 'Show or hide', intro: 'What the drawing includes (the legend and title block are above). In CAD the AB... commands turn the same groups on and off.' },
  { id: 'lineStyles', step: 'Drawing', title: 'Line colors and transparency', intro: 'Colors of the main drawing layers (standard CAD color numbers) and how transparent the hatch and centerline are.' },
  { id: 'sections', step: 'Drawing', title: 'Section sheets', intro: 'Zoomed-in letter-size sheets of a long vessel, one per length of shell, that a client can read. Off unless you switch it on.' },
  { id: 'export', step: 'Export', title: 'CAD program and checks', intro: 'Which CAD program the drawing file is for, and the checks before export.' },
] as const satisfies readonly { id: string; step: AppStep; title: string; intro: string }[]

export type SettingGroupId = (typeof SETTING_GROUPS)[number]['id']

/** A setting is shown only while another value is one of `values` (and, with `and`, another condition too). */
export interface ShowWhen {
  section: 'project' | 'vessel' | 'settings'
  key: string
  values: readonly string[]
  and?: ShowWhen
}

interface BaseDef {
  /** Label in column A of the v5.0 sheet (exact text, without trailing spaces). */
  excelLabel: string
  excelSheet: ExcelSheet
  /** Older labels the VBA also accepts. */
  legacyLabels?: readonly string[]
  /** Plain-language name for the app. */
  name: string
  /** One sentence. */
  description: string
  units?: string
  step: AppStep
  /** Form group on its step (see SETTING_GROUPS). */
  group?: SettingGroupId
  /** Not shown in the app: kept in the file only for the v5.0-compatible output (the app doesn't use it). */
  hidden?: boolean
  /** Shown only while another value is one of `values` (a hidden value is kept, not cleared). */
  showWhen?: ShowWhen
  level: Level
  /** How v5.0 actually uses it, when that is worth knowing (unused, other fallback, ...). */
  v5?: string
  /** False when the VBA reads the label but the v5.0 sheet has no such row. */
  onSheet?: boolean
}

export interface TextDef extends BaseDef {
  type: 'text'
  default: string
  /** Longer free text (a multi-line box). */
  multiline?: boolean
}

export interface NumberDef extends BaseDef {
  type: 'number'
  /** A CAD color number (1-255), shown as a color picker. */
  color?: boolean
  /** null = not entered yet. Only allowed when `nullable` is set. */
  default: number | null
  nullable?: boolean
  integer?: boolean
  /** Inclusive minimum. */
  min?: number
  /** Value must be greater than this. */
  greaterThan?: number
  /** Inclusive maximum. */
  max?: number
}

export interface YesNoDef extends BaseDef {
  type: 'yesNo'
  default: boolean
}

export interface ChoiceDef<C extends readonly [string, ...string[]] = readonly [string, ...string[]]>
  extends BaseDef {
  type: 'choice'
  choices: C
  /** Blank ('') is also allowed. */
  allowBlank?: boolean
  default: C[number] | ''
}

/** A calendar date stored as "YYYY-MM-DD" ('' = blank). Printed as "Oct-22-2026" (see formatDate). */
export interface DateDef extends BaseDef {
  type: 'date'
  default: ''
}

export type FieldDef = TextDef | NumberDef | YesNoDef | ChoiceDef | DateDef

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/** True for a real calendar date written as YYYY-MM-DD. */
export function isIsoDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(y, mo - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d
}

/** "2026-10-22" -> "Oct-22-2026" (month-day-year, as printed on the drawing). Blank stays blank. */
export function formatDate(iso: string): string {
  if (iso === '') return ''
  if (!isIsoDate(iso)) throw new Error(`Not a date: ${iso}`)
  const [y, mo, d] = iso.split('-')
  return `${MONTHS[Number(mo) - 1]}-${d}-${y}`
}

// Builders attach the Zod schema to each definition so the schema can't drift from the table.

function text<D extends Omit<TextDef, 'type'>>(d: D) {
  return { ...d, type: 'text' as const, schema: z.string().default(d.default) }
}

function num<D extends Omit<NumberDef, 'type'>>(d: D) {
  let s = z.number()
  if (d.integer) s = s.int()
  if (d.min !== undefined) s = s.gte(d.min)
  if (d.greaterThan !== undefined) s = s.gt(d.greaterThan)
  if (d.max !== undefined) s = s.lte(d.max)
  type Value = D extends { nullable: true } ? number | null : number
  const schema = (d.nullable ? s.nullable().default(d.default) : s.default(d.default as number)) as unknown as z.ZodDefault<
    z.ZodType<Value>
  >
  return { ...d, type: 'number' as const, schema }
}

function yesNo<D extends Omit<YesNoDef, 'type'>>(d: D) {
  return { ...d, type: 'yesNo' as const, schema: z.boolean().default(d.default) }
}

function choice<const C extends readonly [string, ...string[]], D extends Omit<ChoiceDef<C>, 'type' | 'choices'>>(
  choices: C,
  d: D,
) {
  type Value = D extends { allowBlank: true } ? C[number] | '' : C[number]
  const values: readonly string[] = d.allowBlank ? [...choices, ''] : choices
  const schema = z.enum(values as [string, ...string[]]).default(d.default) as unknown as z.ZodDefault<
    z.ZodType<Value>
  >
  return { ...d, type: 'choice' as const, choices, schema }
}

function date<D extends Omit<DateDef, 'type'>>(d: D) {
  const schema = z
    .string()
    .refine((s) => s === '' || isIsoDate(s), { message: 'must be a real date written as YYYY-MM-DD, or blank' })
    .default(d.default)
  return { ...d, type: 'date' as const, schema }
}

const PS = 'Project Settings' as const

export const TEXT_SIZE_MODES = ['Automatic', 'Scale', 'Fixed height'] as const

export const SECTION_SPLITS = ['Number of sections', 'Readable size', 'Manual'] as const
const SECTIONS_ON = { section: 'settings', key: 'makeSectionSheets', values: ['true'] } as const satisfies ShowWhen
const sectionsWhen = (split: (typeof SECTION_SPLITS)[number]): ShowWhen => ({ ...SECTIONS_ON, and: { section: 'settings', key: 'sectionSplit', values: [split] } })

/**
 * The text layers whose size and color the Drawing step sets (the same 14 TEXTRESIZE knows), with the
 * settings key prefix and the automatic main height (null when it varies). Must match the textStyle(...)
 * calls in SETTINGS (a test checks).
 */
export const TEXT_TYPES = [
  { key: 'scanText', layer: 'SCAN_TEXT', base: null },
  { key: 'objectText', layer: 'SUPPORT_TEXT', base: null },
  { key: 'shellNozzleText', layer: 'SHELL_NOZZLE_TEXT', base: null },
  { key: 'shellMutText', layer: 'SHELL_MUT_TEXT', base: 1.5 },
  { key: 'circWeldText', layer: 'CIRC_WELD_TEXT', base: 2 },
  { key: 'longSeamText', layer: 'LONG_SEAM_TEXT', base: 2 },
  { key: 'xRulerText', layer: 'X_RULER_TEXT', base: 1.8 },
  { key: 'xAxisLabelText', layer: 'X_AXIS_LABEL_TEXT', base: 2.5, appLayer: true },
  { key: 'referenceText', layer: 'REFERENCE_TEXT', base: 1.5, appLayer: true },
  { key: 'yRulerText', layer: 'Y_RULER_TEXT', base: 1.8 },
  { key: 'yAxisLabelText', layer: 'Y_AXIS_LABEL_TEXT', base: 2.5, appLayer: true },
  { key: 'headTitleText', layer: 'HEAD_TITLE_TEXT', base: 2.3 },
  { key: 'headNozzleText', layer: 'HEAD_NOZZLE_TEXT', base: null },
  { key: 'headMutText', layer: 'HEAD_MUT_TEXT', base: 1.5 },
  { key: 'headClockText', layer: 'HEAD_CLOCK_TEXT', base: 1.7 },
  { key: 'legendText', layer: 'LEGEND_TEXT', base: 2 },
  { key: 'titleBlockText', layer: 'TITLE_BLOCK_TEXT', base: 1.8 },
] as const

/**
 * The geometry layers whose color the Drawing step sets (settings key prefix + CAD layer). appLayer:
 * a layer the app's drawing adds (text or lines v5.0 kept on a shared layer), here and in TEXT_TYPES.
 */
export const LINE_LAYERS = [
  { key: 'vessel', layer: 'VESSEL' },
  { key: 'scanOutline', layer: 'SCANS' },
  { key: 'hatch', layer: 'AUT_HATCH' },
  { key: 'object', layer: 'SUPPORTS' },
  { key: 'shellNozzle', layer: 'NOZZLES' },
  { key: 'circWeld', layer: 'CIRC_WELDS' },
  { key: 'longSeam', layer: 'LONG_SEAMS' },
  { key: 'centerline', layer: 'CENTERLINE' },
  { key: 'shellNozzleLeader', layer: 'NOZZLE_LEADERS', appLayer: true },
  { key: 'head', layer: 'HEADS' },
  { key: 'headNozzleLeader', layer: 'HEAD_NOZZLE_LEADERS', appLayer: true },
  { key: 'xRuler', layer: 'X_AXIS' },
  { key: 'yRuler', layer: 'Y_AXIS' },
] as const

/**
 * Size and color of one kind of text. base = the height the drawing normally uses for its main text
 * (null when it varies, e.g. scan labels fitted to their box). Fixed height scales a layer's texts in
 * proportion to that base (a title stays bigger than its lines); with no base, every text gets the height.
 */
function textStyle<K extends string>(key: K, name: string, color: number, base: number | null) {
  const lower = name.charAt(0).toLowerCase() + name.slice(1)
  const when = (v: string) => ({ section: 'settings' as const, key: `${key}Size`, values: [v] })
  const common = { excelSheet: PS, onSheet: false, group: 'textStyles' as const, step: 'Drawing' as const, level: 'Basic' as const }
  const v5 = 'App only. In v5.0 the size is fixed in the LISP (TEXTRESIZE changes it in CAD).'
  const auto = base === null ? 'sized to fit' : `${base} in`
  return {
    [`${key}Size`]: choice(TEXT_SIZE_MODES, {
      ...common, excelLabel: `${name} Size`, name: `${name}: size`,
      description: `How big ${lower} are: Automatic (as the drawing always made them, ${auto}), Scale (a multiple of that) or Fixed height.`,
      default: 'Automatic', v5,
    }),
    [`${key}Scale`]: num({
      ...common, excelLabel: `${name} Scale`, name: `${name}: scale`, showWhen: when('Scale'),
      description: `Multiple of the automatic size of ${lower}, e.g. 1.5 = half as big again.`,
      units: 'x', greaterThan: 0, max: 10, default: 1, v5,
    }),
    [`${key}Height`]: num({
      ...common, excelLabel: `${name} Height`, name: `${name}: height`, showWhen: when('Fixed height'),
      description: base === null ? `Height of every one of the ${lower}.` : `Height of the main text (${base} in automatic); other text on the same layer keeps its proportion.`,
      units: 'in', greaterThan: 0, max: 50, default: base ?? 2, v5,
    }),
    [`${key}Color`]: num({
      ...common, excelLabel: `${name} Color`, name: `${name}: color`, color: true,
      description: `CAD color of ${lower}.`, integer: true, min: 1, max: 255, default: color, v5: 'App only. v5.0 sets this layer color in SL_SetupLayers.',
    }),
  } as unknown as { [P in `${K}Size`]: ReturnType<typeof textSizeChoice> } & { [P in `${K}Scale` | `${K}Height` | `${K}Color`]: ReturnType<typeof plainNumber> }
}

function layerColor<K extends string>(key: K, name: string, color: number) {
  return {
    [`${key}Color`]: num({
      excelSheet: PS, onSheet: false, group: 'lineStyles', step: 'Drawing', level: 'Basic', color: true,
      excelLabel: `${name} Color`, name: `${name}: color`, description: `CAD color of the ${name.toLowerCase()} layer.`,
      integer: true, min: 1, max: 255, default: color, v5: 'App only. v5.0 sets this layer color in SL_SetupLayers.',
    }),
  } as unknown as { [P in `${K}Color`]: ReturnType<typeof plainNumber> }
}

// Only for the return types above.
const textSizeChoice = () => choice(TEXT_SIZE_MODES, { excelLabel: '', excelSheet: PS, name: '', description: '', default: 'Automatic', step: 'Drawing', level: 'Basic' })
const plainNumber = () => num({ excelLabel: '', excelSheet: PS, name: '', description: '', default: 1, step: 'Drawing', level: 'Basic' })
const DI = 'Drawing Information' as const

// ---------------------------------------------------------------------------------------------
// Project: file name and title block / inspection information (Drawing Information sheet).
// ---------------------------------------------------------------------------------------------
export const PROJECT_FIELDS = {
  projectName: text({
    excelLabel: 'Project Name', excelSheet: PS, name: 'Project name',
    description: 'Name of the job; also used to name the job and drawing files.',
    default: '', group: 'job', step: 'Project', level: 'Basic',
    v5: 'OCR import fills it from the Equipment ID. Blank gives the file name "Scan_Layout".',
  }),
  drawingTitle: text({
    excelLabel: 'Drawing Title', excelSheet: DI, name: 'Drawing title',
    description: 'Main title printed in the title block.',
    default: '', group: 'job', step: 'Project', level: 'Basic',
    v5: 'Blank prints "AUT COVERAGE MAP".',
  }),
  component: text({
    excelLabel: 'Component', excelSheet: DI, name: 'Component',
    description: 'Vessel or equipment ID printed in the title block.',
    default: '', group: 'job', step: 'Project', level: 'Basic',
  }),
  unit: text({
    excelLabel: 'Unit', excelSheet: DI, name: 'Unit',
    description: 'Unit, area or facility printed in the title block.',
    default: '', group: 'job', step: 'Project', level: 'Basic',
  }),
  client: text({
    excelLabel: 'Client', excelSheet: DI, name: 'Client',
    description: 'Client name printed in the title block.',
    default: '', group: 'job', step: 'Project', level: 'Basic',
  }),
  inspector: text({
    excelLabel: 'Inspector', excelSheet: DI, name: 'Inspector',
    description: 'Inspector name printed in the title block.',
    default: '', group: 'job', step: 'Project', level: 'Basic',
  }),
  date: date({
    excelLabel: 'Date', excelSheet: DI, name: 'Date',
    description: 'Inspection or drawing date printed in the title block as month-day-year (Oct-22-2026).',
    default: '', group: 'job', step: 'Project', level: 'Basic',
    v5: 'Printed as the cell shows it; no fixed date format.',
  }),
  revision: text({
    excelLabel: 'Revision', excelSheet: DI, name: 'Revision',
    description: 'Drawing revision printed in the title block.',
    default: '', group: 'job', step: 'Project', level: 'Basic',
  }),
  drawingNotes: text({
    excelLabel: 'Notes', excelSheet: DI, name: 'Drawing note',
    description: 'Optional short note for the drawing.',
    multiline: true, default: '', group: 'job', step: 'Project', level: 'Advanced',
    v5: 'Stored only; not drawn.',
  }),
  equipmentType: choice(['Vessel', 'Tank', 'Pipe', 'Sphere', 'Exchanger', 'Column', 'Other'], {
    excelLabel: 'Equipment Type', excelSheet: DI, name: 'Equipment type',
    description: 'Kind of equipment inspected.',
    allowBlank: true, default: '', group: 'job', step: 'Project', level: 'Advanced',
    v5: 'Stored only; not drawn.',
  }),
  inspectionMethod: choice(['AUT', 'PAUT', 'MUT', 'AUT + MUT', 'PAUT + MUT', 'UT Shearwave', 'Visual'], {
    excelLabel: 'Inspection Method', excelSheet: DI, name: 'Inspection method',
    description: 'Inspection method used on the job.',
    allowBlank: true, default: '', group: 'job', step: 'Project', level: 'Advanced',
    v5: 'Stored only; not drawn.',
  }),
  procedure: text({
    excelLabel: 'Procedure', excelSheet: DI, name: 'Procedure',
    description: 'Inspection procedure number.',
    default: '', group: 'job', step: 'Project', level: 'Advanced',
    v5: 'Stored only; not drawn.',
  }),
  reportNumber: text({
    excelLabel: 'Report Number', excelSheet: DI, name: 'Report number',
    description: 'Inspection report number.',
    default: '', group: 'job', step: 'Project', level: 'Advanced',
    v5: 'Stored only; not drawn.',
  }),
  workOrder: text({
    excelLabel: 'Work Order', excelSheet: DI, name: 'Work order',
    description: 'Work order number for the job.',
    default: '', group: 'job', step: 'Project', level: 'Advanced',
    v5: 'Stored only; not drawn.',
  }),
  service: text({
    excelLabel: 'Service', excelSheet: DI, name: 'Service',
    description: 'Process service of the equipment.',
    default: '', group: 'job', step: 'Project', level: 'Advanced',
    v5: 'Stored only; not drawn.',
  }),
  material: choice(['Carbon Steel', 'Stainless Steel', 'Duplex', 'Inconel', 'Chrome-Moly', 'Aluminum', 'Other'], {
    excelLabel: 'Material', excelSheet: DI, name: 'Material',
    description: 'Shell material.',
    allowBlank: true, default: '', group: 'job', step: 'Project', level: 'Advanced',
    v5: 'Stored only; not drawn.',
  }),
  inspectionScope: choice(
    ['External AUT Mapping', 'Internal Corrosion Survey', 'Shell and Head Inspection', 'Nozzle Inspection', 'CML Monitoring'],
    {
      excelLabel: 'Inspection Scope', excelSheet: DI, name: 'Inspection scope',
      description: 'Scope of the inspection.',
      allowBlank: true, default: '', group: 'job', step: 'Project', level: 'Advanced',
      v5: 'Stored only; not drawn.',
    },
  ),
  inspectionNotes: text({
    excelLabel: 'Notes:', excelSheet: DI, name: 'Inspection notes',
    description: 'Free-text inspection notes, including vessel notes from the field form.',
    multiline: true, default: '', group: 'job', step: 'Project', level: 'Basic',
    v5: 'OCR import appends the field-form vessel notes here. Stored only; not drawn.',
  }),
}

// ---------------------------------------------------------------------------------------------
// Vessel: size, orientation, axis directions and reference labels (Project Settings sheet).
// Logical X = circumference ("Vessel Height"), logical Y = length ("Vessel Length").
// ---------------------------------------------------------------------------------------------
export const VESSEL_FIELDS = {
  orientation: choice(['Vertical', 'Horizontal CW', 'Horizontal CCW'], {
    excelLabel: 'Vessel Orientation', excelSheet: PS, name: 'Orientation',
    description: 'How the shell rollout is turned on the drawing.',
    default: 'Horizontal CW', group: 'vessel', step: 'Project', level: 'Basic',
    v5: 'Also accepts field-form wording such as "Clockwise Horizontal".',
  }),
  length: num({
    excelLabel: 'Vessel Length', excelSheet: PS, name: 'Shell length (Y)',
    description: 'Length of the shell along the vessel axis (the Y direction of the layout).',
    units: 'in', nullable: true, greaterThan: 0, default: null, group: 'vessel', step: 'Project', level: 'Basic',
    v5: 'Required to generate. Export falls back to 144 if the row is missing.',
  }),
  height: num({
    excelLabel: 'Vessel Height', excelSheet: PS, name: 'Circumference (X)',
    description: 'Distance around the shell (the X direction of the layout).',
    units: 'in', nullable: true, greaterThan: 0, default: null, group: 'vessel', step: 'Project', level: 'Basic',
    v5: 'Required to generate. Export falls back to 151 if the row is missing.',
  }),
  xAxisCardinal: choice(['North', 'South', 'East', 'West'], {
    excelLabel: 'X Axis Cardinal Direction', excelSheet: PS, name: 'X axis compass direction',
    description: 'Compass direction printed after "X AXIS DIRECTION" when no direction text is given.',
    allowBlank: true, default: 'South', group: 'axes', step: 'Project', level: 'Basic',
    v5: 'Code fallback is blank.',
  }),
  yAxisCardinal: choice(['North', 'South', 'East', 'West'], {
    excelLabel: 'Y Axis Cardinal Direction', excelSheet: PS, name: 'Y axis compass direction',
    description: 'Compass direction printed after "Y AXIS DIRECTION" when no direction text is given.',
    allowBlank: true, default: 'East', group: 'axes', step: 'Project', level: 'Basic',
    v5: 'Code fallback is blank.',
  }),
  xAxisDirectionText: text({
    excelLabel: 'X Axis Direction Text', excelSheet: PS, legacyLabels: ['X Axis Custom Direction'],
    name: 'X axis direction text',
    description: 'Text printed after "X AXIS DIRECTION" (for example CW LOOKING NORTH); overrides the compass direction.',
    default: '', group: 'axes', step: 'Project', level: 'Basic',
    v5: 'Filled by OCR import. Printed in upper case.',
  }),
  yAxisDirectionText: text({
    excelLabel: 'Y Axis Direction Text', excelSheet: PS, legacyLabels: ['Y Axis Custom Direction'],
    name: 'Y axis direction text',
    description: 'Text printed after "Y AXIS DIRECTION" (for example TOWARD NORTH); overrides the compass direction.',
    default: '', group: 'axes', step: 'Project', level: 'Basic',
    v5: 'Filled by OCR import. Printed in upper case.',
  }),
  referenceLabelMode: choice(['None', 'Auto Cardinal', 'Custom Cardinal'], {
    excelLabel: 'Reference Label Mode', excelSheet: PS, name: 'Reference label mode',
    description: 'Auto Cardinal uses the chosen label set; Custom Cardinal uses the five custom labels below.',
    default: 'Custom Cardinal', group: 'refLabels', step: 'Project', level: 'Basic',
    v5: 'Code fallback is Auto Cardinal. OCR import sets Custom Cardinal.',
  }),
  referenceLabelSet: choice(['TDC/BDC', 'NDC/SDC', 'NamePlate DC'], {
    excelLabel: 'Reference Label Set', excelSheet: PS, name: 'Reference label set',
    description: 'Predefined labels for Auto Cardinal mode (TDC/BDC for horizontal, NDC/SDC or NamePlate DC for vertical).',
    showWhen: { section: 'vessel', key: 'referenceLabelMode', values: ['Auto Cardinal'] },
    default: 'TDC/BDC', group: 'refLabels', step: 'Project', level: 'Basic',
  }),
  refLabel0: text({
    excelLabel: 'Ref 0° Label', excelSheet: PS, name: '0° reference label',
    description: 'Custom label at 0° around the vessel; blank draws nothing.',
    showWhen: { section: 'vessel', key: 'referenceLabelMode', values: ['Custom Cardinal'] },
    default: '', group: 'refLabels', step: 'Project', level: 'Basic',
    v5: 'VBA reads the five custom labels by position (3 to 7 rows below Reference Label Mode), not by label.',
  }),
  refLabel90: text({
    excelLabel: 'Ref 90° Label', excelSheet: PS, name: '90° reference label',
    description: 'Custom label at 90° around the vessel; blank draws nothing.',
    showWhen: { section: 'vessel', key: 'referenceLabelMode', values: ['Custom Cardinal'] },
    default: '', group: 'refLabels', step: 'Project', level: 'Basic',
  }),
  refLabel180: text({
    excelLabel: 'Ref 180° Label', excelSheet: PS, name: '180° reference label',
    description: 'Custom label at 180° around the vessel; blank draws nothing.',
    showWhen: { section: 'vessel', key: 'referenceLabelMode', values: ['Custom Cardinal'] },
    default: '', group: 'refLabels', step: 'Project', level: 'Basic',
  }),
  refLabel270: text({
    excelLabel: 'Ref 270° Label', excelSheet: PS, name: '270° reference label',
    description: 'Custom label at 270° around the vessel; blank draws nothing.',
    showWhen: { section: 'vessel', key: 'referenceLabelMode', values: ['Custom Cardinal'] },
    default: '', group: 'refLabels', step: 'Project', level: 'Basic',
  }),
  refLabel360: text({
    excelLabel: 'Ref 360° Label', excelSheet: PS, name: '360° reference label',
    description: 'Custom label at 360° (back to the start) around the vessel; blank draws nothing.',
    showWhen: { section: 'vessel', key: 'referenceLabelMode', values: ['Custom Cardinal'] },
    default: '', group: 'refLabels', step: 'Project', level: 'Basic',
  }),
}

// ---------------------------------------------------------------------------------------------
// Settings: drawing, label, hatch, head view, validation and image options (Project Settings).
// ---------------------------------------------------------------------------------------------
export const SETTINGS = {
  // AXIS / RULER
  outputCommand: text({
    excelLabel: 'Output Command', excelSheet: PS, name: 'CAD command name',
    description: 'CAD command name for the exported .lsp.',
    default: 'SCANLAYOUT', hidden: true, step: 'Drawing', level: 'Advanced',
    v5: 'Not read by the VBA; the command is always AXISBUILDER. App: planned feature (to be designed).',
  }),
  rulerPlacement: choice(
    ['None', 'Top', 'Bottom', 'Left', 'Right', 'Top + Left', 'Bottom + Left', 'Top + Right', 'Bottom + Right'],
    {
      excelLabel: 'Ruler Placement', excelSheet: PS, name: 'Ruler position',
      description: 'Where the rulers sit around the vessel as seen on the drawing.',
      default: 'Bottom + Left', group: 'rulers', step: 'Drawing', level: 'Basic',
    },
  ),
  rulerSpacing: num({
    excelLabel: 'Ruler Spacing', excelSheet: PS, name: 'Ruler tick spacing',
    description: 'Distance between ruler ticks.',
    units: 'in', greaterThan: 0, default: 12, group: 'rulers', step: 'Drawing', level: 'Basic',
    v5: 'The v5.0 workbook has 20; the code fallback is 12.',
  }),
  rulerOffset: num({
    excelLabel: 'Ruler Offset', excelSheet: PS, name: 'Ruler gap',
    description: 'Gap between the vessel outline and the rulers.',
    units: 'in', min: 0, default: 2, group: 'rulers', step: 'Drawing', level: 'Advanced',
  }),
  showRulers: yesNo({
    excelLabel: 'Show Rulers', excelSheet: PS, legacyLabels: ['Show Ruler'], name: 'Show rulers',
    description: 'Draw the X and Y rulers with their axis direction labels.',
    default: true, group: 'rulers', step: 'Drawing', level: 'Basic',
  }),
  showDirectionLabels: yesNo({
    excelLabel: 'Show Direction Labels', excelSheet: PS, name: 'Show direction labels',
    description: 'Show the axis direction labels.',
    default: true, hidden: true, step: 'Drawing', level: 'Advanced',
    v5: 'Read by the older layout export but never used. App: planned feature (to be designed).',
  }),
  arrowLengthMode: choice(['Text Based', 'Fixed'], {
    excelLabel: 'Arrow Length Mode', excelSheet: PS, name: 'Direction arrow length mode',
    description: 'Whether direction arrows size to their text or use a fixed length.',
    default: 'Text Based', hidden: true, step: 'Drawing', level: 'Advanced',
    v5: 'Not read by the VBA. App: planned feature (to be designed).',
  }),
  arrowLength: num({
    excelLabel: 'Arrow Length', excelSheet: PS, name: 'Fixed arrow length',
    description: 'Direction arrow length when the arrow length mode is Fixed.',
    units: 'in', greaterThan: 0, default: 28, hidden: true, step: 'Drawing', level: 'Advanced',
    v5: 'Not read by the VBA. App: planned feature (to be designed).',
  }),
  arrowHeadSize: num({
    excelLabel: 'Arrow Head Size', excelSheet: PS, name: 'Arrow head size',
    description: 'Size of direction arrow heads.',
    units: 'in', greaterThan: 0, default: 3, group: 'rulers', step: 'Drawing', level: 'Advanced',
  }),

  // VESSEL / REFERENCE INDICATORS (display options; the labels themselves are in VESSEL_FIELDS)
  showVesselReferenceLabels: yesNo({
    excelLabel: 'Show Vessel Reference Labels', excelSheet: PS, name: 'Show reference labels',
    description: 'Draw the start, stop and centerline reference labels around the vessel.',
    default: true, group: 'rulers', step: 'Drawing', level: 'Basic',
    v5: 'Code fallback is NO.',
  }),
  referenceLabelTickLength: num({
    excelLabel: 'Reference Label Tick Length', excelSheet: PS, name: 'Reference tick length',
    description: 'Length of the tick mark drawn at each reference label.',
    units: 'in', greaterThan: 0, default: 2, group: 'rulers', step: 'Drawing', level: 'Advanced',
    v5: 'Code fallback is 3; zero or less is replaced by 3.',
  }),

  // SCAN LABELS / HATCH
  autHatchEnabled: yesNo({
    excelLabel: 'AUT Hatch Enabled', excelSheet: PS, name: 'Hatch AUT scans',
    description: 'Fill scanned areas with hatch lines and show the AUT sample in the legend.',
    default: true, group: 'scans', step: 'AUT scans', level: 'Basic',
  }),
  autHatchPattern: text({
    excelLabel: 'AUT Hatch Pattern', excelSheet: PS, name: 'Hatch pattern name',
    description: 'Hatch pattern name (informational only).',
    default: 'ANSI31', hidden: true, step: 'AUT scans', level: 'Advanced',
    v5: 'Not read by the VBA; the drawing always uses its own 45-degree line hatch. App: planned feature (to be designed).',
  }),
  autHatchScale: num({
    excelLabel: 'AUT Hatch Scale', excelSheet: PS, legacyLabels: ['Hatch Scale'], name: 'Hatch line spacing',
    description: 'Spacing between hatch lines; larger is wider.',
    units: 'in', greaterThan: 0, default: 2.5, group: 'scans', step: 'AUT scans', level: 'Advanced',
  }),
  autHatchAngle: num({
    excelLabel: 'AUT Hatch Angle', excelSheet: PS, name: 'Hatch angle',
    description: 'Hatch line angle, reserved for future use.',
    units: 'degrees', default: 45, hidden: true, step: 'AUT scans', level: 'Advanced',
    v5: 'Written to the .lsp but not used; hatch is always 45 degrees. App: planned feature (to be designed).',
  }),
  autHatchTransparency: num({
    excelLabel: 'AUT Hatch Transparency', excelSheet: PS, name: 'Hatch transparency',
    description: 'Transparency of all hatch layers, 0 = solid, 90 = most transparent.',
    units: '%', integer: true, min: 0, max: 90, default: 50, group: 'lineStyles', step: 'Drawing', level: 'Basic',
    v5: 'The v5.0 workbook has 70; the code fallback and sheet note say 50. The sheet label has a trailing space.',
  }),

  // NOZZLE LABELS
  smartNozzleLabels: yesNo({
    excelLabel: 'Smart Nozzle Labels', excelSheet: PS, name: 'Smart nozzle labels',
    description: 'Place AUTO nozzle labels so they avoid scans and objects.',
    default: true, group: 'nozzleLabels', step: 'Drawing', level: 'Advanced',
  }),
  minNozzleInsideLabelDiameter: num({
    excelLabel: 'Minimum Nozzle Inside Label Diameter', excelSheet: PS, name: 'Smallest nozzle labeled inside',
    description: 'AUTO nozzle labels go outside the circle, with a leader, below this diameter.',
    units: 'in', min: 0, default: 6, group: 'nozzleLabels', step: 'Drawing', level: 'Advanced',
    v5: 'Code fallback is 8.',
  }),
  nozzleLeaderLength: num({
    excelLabel: 'Nozzle Leader Length', excelSheet: PS, name: 'Nozzle leader length',
    description: 'Leader line length for shell nozzle labels placed outside.',
    units: 'in', greaterThan: 0, default: 4, group: 'nozzleLabels', step: 'Drawing', level: 'Advanced',
    v5: 'Code fallback is 6.',
  }),

  // WELDS / REFERENCES
  showWeldLabels: yesNo({
    excelLabel: 'Show Weld Labels', excelSheet: PS, name: 'Show weld labels',
    description: 'Master switch for circ weld and long seam labels.',
    default: true, group: 'showHide', step: 'Drawing', level: 'Basic',
  }),
  showCenterline: yesNo({
    excelLabel: 'Show Centerline', excelSheet: PS, name: 'Show vessel centerline',
    description: 'Draw the long-dash vessel centerline.',
    default: true, group: 'showHide', step: 'Drawing', level: 'Basic',
  }),
  centerlineTransparency: num({
    excelLabel: 'Centerline Transparency', excelSheet: PS, onSheet: false, name: 'Centerline transparency',
    description: 'Transparency of the vessel centerline, 0 = solid, 90 = most transparent.',
    units: '%', integer: true, min: 0, max: 90, default: 50, group: 'lineStyles', step: 'Drawing', level: 'Advanced',
    v5: 'App only (user, 2026-10-23). v5.0 draws the centerline solid.',
  }),

  // LEGEND / TITLE BLOCK
  legendEnabled: yesNo({
    excelLabel: 'Legend Enabled', excelSheet: PS, name: 'Legend (older layout)',
    description: 'Draw the legend in the older geometry-only layout export.',
    default: true, hidden: true, step: 'Drawing', level: 'Advanced',
    v5: 'Older layout export only; the master drawing uses Show Legend On Overlay. App: planned, controlled in the app and shown/hidden by a CAD command.',
  }),
  showTitleBlock: yesNo({
    excelLabel: 'Show Title Block', excelSheet: PS, name: 'Title block (older layout)',
    description: 'Draw the title block in the older geometry-only layout export.',
    default: true, hidden: true, step: 'Drawing', level: 'Advanced',
    v5: 'Older layout export only; the master drawing uses Show Title Block On Overlay. Code fallback is NO. App: planned, controlled in the app and shown/hidden by a CAD command.',
  }),

  // VALIDATION
  enableValidation: yesNo({
    excelLabel: 'Enable Validation', excelSheet: PS, name: 'Check data before export',
    description: 'Run scan, image and overlap checks before generating the drawing.',
    default: true, group: 'export', step: 'Export', level: 'Advanced',
  }),
  overlapDetection: choice(['OFF', 'WARN', 'BLOCK'], {
    excelLabel: 'Overlap Detection', excelSheet: PS, name: 'Scan overlap check',
    description: 'OFF ignores overlapping scans, WARN asks before continuing, BLOCK stops the export.',
    default: 'WARN', group: 'scans', step: 'AUT scans', level: 'Advanced',
  }),
  showValidationSummary: yesNo({
    excelLabel: 'Show Validation Summary', excelSheet: PS, name: 'Show check summary',
    description: 'Show a summary of the checks after generating.',
    default: true, group: 'export', step: 'Export', level: 'Advanced',
  }),

  // HEAD VIEWS
  headViewMode: choice(['NONE', 'HEAD 1', 'HEAD 2', 'BOTH'], {
    excelLabel: 'Head View Mode', excelSheet: PS, name: 'Head views',
    description: 'Which head views to draw beside the shell layout. Head nozzles and head MUT are only drawn on a head that is shown.',
    default: 'NONE', group: 'heads', step: 'Field data', level: 'Basic',
  }),
  headViewSize: choice(['SMALL', 'MEDIUM', 'LARGE'], {
    excelLabel: 'Head View Size', excelSheet: PS, name: 'Head view size',
    description: 'Size of the head views (24%, 30% or 38% of the circumference, at least 24 in).',
    default: 'SMALL', group: 'headsDrawing', step: 'Drawing', level: 'Advanced',
  }),
  showHeadNozzles: yesNo({
    excelLabel: 'Show Head Nozzles', excelSheet: PS, name: 'Show head nozzles',
    description: 'Draw nozzles on the head views.',
    default: true, group: 'headsDrawing', step: 'Drawing', level: 'Advanced',
  }),
  head1Label: text({
    excelLabel: 'Head 1 Label', excelSheet: PS, name: 'Head 1 name',
    description: 'Title printed on the Head 1 view (for example NORTH HEAD).',
    showWhen: { section: 'settings', key: 'headViewMode', values: ['HEAD 1', 'BOTH'] },
    default: 'HEAD 1', group: 'heads', step: 'Field data', level: 'Basic',
    v5: 'The v5.0 workbook has EAST HEAD. Printed in upper case.',
  }),
  head2Label: text({
    excelLabel: 'Head 2 Label', excelSheet: PS, name: 'Head 2 name',
    description: 'Title printed on the Head 2 view (for example SOUTH HEAD).',
    showWhen: { section: 'settings', key: 'headViewMode', values: ['HEAD 2', 'BOTH'] },
    default: 'HEAD 2', group: 'heads', step: 'Field data', level: 'Basic',
    v5: 'The v5.0 workbook has WEST HEAD. Printed in upper case.',
  }),
  headNozzleLeaderLength: num({
    excelLabel: 'Head Nozzle Leader Length', excelSheet: PS, name: 'Head nozzle leader length',
    description: 'Leader line length for head nozzle labels placed outside.',
    units: 'in', greaterThan: 0, default: 8, group: 'headsDrawing', step: 'Drawing', level: 'Advanced',
  }),
  showHeadCenterlines: yesNo({
    excelLabel: 'Show Head Centerlines', excelSheet: PS, name: 'Show head centerlines',
    description: 'Draw crosshair centerlines on the head views.',
    default: false, group: 'headsDrawing', step: 'Drawing', level: 'Advanced',
  }),
  showHeadClockReferences: yesNo({
    excelLabel: 'Show Head Clock References', excelSheet: PS, legacyLabels: ['Show Head Clock Reference'],
    name: 'Show head 12 o\'clock marker',
    description: 'Draw the 12 o\'clock reference arrow and text on the head views.',
    default: false, group: 'headsDrawing', step: 'Drawing', level: 'Advanced',
  }),

  // OVERLAY DRAWING / IMAGE PREPROCESSING
  generateOverlayDrawing: yesNo({
    excelLabel: 'Generate Overlay Drawing', excelSheet: PS, name: 'Use scan images',
    description: 'Include scan photos in the drawing.',
    default: true, group: 'images', step: 'Images', level: 'Advanced',
    v5: 'Only used by the Home status check (NO skips the image check); the master export always processes images.',
  }),
  originalImageFolder: text({
    excelLabel: 'Original Image Folder', excelSheet: PS, legacyLabels: ['Image Folder'], name: 'Scan image folder',
    description: 'Folder that holds the scan photos.',
    default: '', hidden: true, step: 'Images', level: 'Basic',
    v5: 'Windows path; blank uses the workbook folder.',
  }),
  processedImageFolder: text({
    excelLabel: 'Processed Image Folder', excelSheet: PS, name: 'Processed image folder',
    description: 'Subfolder (or full path) for the stretched, drawing-ready copies of the scan photos.',
    default: 'Processed_Images', group: 'images', step: 'Images', level: 'Advanced',
  }),
  overlayPixelsPerInch: num({
    excelLabel: 'Overlay Pixels Per Inch', excelSheet: PS, name: 'Processed image resolution',
    description: 'Resolution of the processed scan images.',
    units: 'px/in', greaterThan: 0, default: 40, hidden: true, step: 'Images', level: 'Advanced',
    v5: 'Sheet says do not change from 40.',
  }),
  draftSightImagePixelsPerUnit: num({
    excelLabel: 'DraftSight Image Pixels Per Unit', excelSheet: PS, name: 'CAD image calibration',
    description: 'Inserted image pixels per drawing unit; image scale = this value / image resolution.',
    units: 'px/in', greaterThan: 0, default: 400, hidden: true, step: 'Images', level: 'Advanced',
    v5: 'Sheet says do not change from 400. Used for AutoCAD output too.',
  }),
  overlayPreprocessRotation: choice(['NONE', 'AUTO', 'CW90', 'CCW90'], {
    excelLabel: 'Overlay Preprocess Rotation', excelSheet: PS, name: 'Image rotation override',
    description: 'Rotation applied to scan photos during processing; NONE is the tested baseline.',
    default: 'NONE', hidden: true, step: 'Images', level: 'Advanced',
    v5: 'Code fallback is AUTO. Sheet says do not change from NONE.',
  }),
  maxImageSide: num({
    excelLabel: 'Largest Processed Image Side', excelSheet: PS, onSheet: false, name: 'Largest processed image side',
    description: 'Longest side of a processed scan image. A larger one is scaled down (the shape stays exactly that of the scan) so the drawing stays quick to open, but never below the size the Excel version made (40 px per inch of scan).',
    units: 'px', integer: true, min: 500, max: 10000, default: 4096, group: 'images', step: 'Images', level: 'Advanced',
    v5: 'App only. v5.0 sized every image at 40 px per inch of scan; the app never goes below that.',
  }),
  showVesselOnOverlay: yesNo({
    excelLabel: 'Show Vessel On Overlay', excelSheet: PS, name: 'Draw vessel outline',
    description: 'Draw the vessel outline and centerline in the drawing.',
    default: true, group: 'showHide', step: 'Drawing', level: 'Advanced',
  }),
  showWeldsOnOverlay: yesNo({
    excelLabel: 'Show Welds On Overlay', excelSheet: PS, name: 'Draw welds',
    description: 'Draw circ welds and long seams in the drawing.',
    default: true, group: 'showHide', step: 'Drawing', level: 'Advanced',
  }),
  showSupportsOnOverlay: yesNo({
    excelLabel: 'Show Supports On Overlay', excelSheet: PS, name: 'Draw objects',
    description: 'Draw supports and other objects in the drawing.',
    default: true, group: 'showHide', step: 'Drawing', level: 'Advanced',
  }),
  showNozzlesOnOverlay: yesNo({
    excelLabel: 'Show Nozzles On Overlay', excelSheet: PS, name: 'Draw shell nozzles',
    description: 'Draw shell nozzles in the drawing.',
    default: true, group: 'showHide', step: 'Drawing', level: 'Advanced',
  }),
  showLegendOnOverlay: yesNo({
    excelLabel: 'Show Legend On Overlay', excelSheet: PS, name: 'Draw legend',
    description: 'Draw the legend in the drawing.',
    default: true, group: 'legendTitle', step: 'Drawing', level: 'Basic',
  }),
  showTitleBlockOnOverlay: yesNo({
    excelLabel: 'Show Title Block On Overlay', excelSheet: PS, name: 'Draw title block',
    description: 'Draw the title block in the drawing.',
    default: true, group: 'legendTitle', step: 'Drawing', level: 'Basic',
  }),
  showScanBordersOnOverlay: yesNo({
    excelLabel: 'Show Scan Borders On Overlay', excelSheet: PS, name: 'Show image frames',
    description: 'Show frames around the scan images (sets CAD IMAGEFRAME).',
    default: true, group: 'showHide', step: 'Drawing', level: 'Advanced',
    v5: 'Code fallback is NO, and the sheet note says default NO.',
  }),
  cadPlatform: choice(['DraftSight', 'AutoCAD'], {
    excelLabel: 'CAD Platform', excelSheet: PS, name: 'CAD program',
    description: 'CAD program the .lsp is written for.',
    default: 'DraftSight', group: 'export', step: 'Export', level: 'Basic',
    v5: 'Set by the Home toggle. Anything other than AutoCAD means DraftSight.',
  }),

  // TEXT SIZES AND COLORS (app only): one set per text layer, the same layers TEXTRESIZE knows.
  ...textStyle('scanText', 'Scan labels', 7, null),
  ...textStyle('objectText', 'Object labels', 7, null),
  ...textStyle('shellNozzleText', 'Shell nozzle labels', 7, null),
  ...textStyle('shellMutText', 'Shell MUT labels', 7, 1.5),
  ...textStyle('circWeldText', 'Circ weld labels', 7, 2),
  ...textStyle('longSeamText', 'Long seam labels', 7, 2),
  ...textStyle('xRulerText', 'X ruler numbers', 1, 1.8),
  ...textStyle('xAxisLabelText', 'X axis direction label', 1, 2.5),
  ...textStyle('referenceText', 'Reference labels', 1, 1.5),
  ...textStyle('yRulerText', 'Y ruler numbers', 5, 1.8),
  ...textStyle('yAxisLabelText', 'Y axis direction label', 5, 2.5),
  ...textStyle('headTitleText', 'Head titles', 7, 2.3),
  ...textStyle('headNozzleText', 'Head nozzle labels', 7, null),
  ...textStyle('headMutText', 'Head MUT labels', 7, 1.5),
  ...textStyle('headClockText', "Head 12 o'clock text", 7, 1.7),
  ...textStyle('legendText', 'Legend text', 7, 2),
  ...textStyle('titleBlockText', 'Title block text', 7, 1.8),

  // LINE COLORS (app only): the main geometry layers.
  ...layerColor('vessel', 'Vessel outline', 7),
  ...layerColor('scanOutline', 'Scan outlines', 7),
  ...layerColor('hatch', 'Scan hatch', 5),
  ...layerColor('object', 'Objects', 6),
  ...layerColor('shellNozzle', 'Shell nozzles', 7),
  ...layerColor('circWeld', 'Circ welds', 7),
  ...layerColor('longSeam', 'Long seams', 7),
  ...layerColor('centerline', 'Centerline', 7),
  ...layerColor('shellNozzleLeader', 'Shell nozzle leaders', 7),
  ...layerColor('head', 'Head views', 7),
  ...layerColor('headNozzleLeader', 'Head nozzle leaders', 7),
  ...layerColor('xRuler', 'X ruler', 1),
  ...layerColor('yRuler', 'Y ruler', 5),

  // SECTION SHEETS (app only, Phase 3f-2): the plan is worked out by engine/sections.ts; the .lsp builds
  // exactly these sheets (ABSECTIONSHEETS). Off by default: nothing about sections is drawn or written.
  makeSectionSheets: yesNo({
    excelLabel: 'Make Section Sheets', excelSheet: PS, onSheet: false, name: 'Make section sheets',
    description: 'Plan zoomed-in letter-size sheets along the shell, shown in the preview and built in CAD by the ABSECTIONSHEETS command.',
    default: false, group: 'sections', step: 'Drawing', level: 'Basic', v5: 'App only. v5.0 asks for one section length in CAD (SECTIONPAGES).',
  }),
  sectionSplit: choice(SECTION_SPLITS, {
    excelLabel: 'Section Split', excelSheet: PS, onSheet: false, name: 'How to split',
    description: 'Number of sections: equal lengths. Readable size: as many as it takes for the smallest scan label to print at the size below. Manual: the ranges you type.',
    default: 'Readable size', showWhen: SECTIONS_ON, group: 'sections', step: 'Drawing', level: 'Basic',
  }),
  sectionCount: num({
    excelLabel: 'Section Count', excelSheet: PS, onSheet: false, name: 'Number of sections',
    description: 'How many equal sections the shell length is split into.',
    integer: true, min: 1, max: 50, default: 4, showWhen: sectionsWhen('Number of sections'), group: 'sections', step: 'Drawing', level: 'Basic',
  }),
  sectionMinLabel: num({
    excelLabel: 'Section Smallest Label', excelSheet: PS, onSheet: false, name: 'Smallest scan label on the sheet',
    description: 'Height of the smallest scan label on the printed letter-size sheet. 0.08 in (about 6 pt) is the smallest most people read without effort.',
    units: 'in', greaterThan: 0, max: 1, default: 0.08, showWhen: sectionsWhen('Readable size'), group: 'sections', step: 'Drawing', level: 'Basic',
  }),
  sectionRanges: text({
    excelLabel: 'Section Ranges', excelSheet: PS, onSheet: false, name: 'Section ranges',
    description: 'Start and end along the shell of each section, e.g. 0-180, 180-360, 360-480 (inches; lengths like 15\' 6" work too).',
    default: '', showWhen: sectionsWhen('Manual'), group: 'sections', step: 'Drawing', level: 'Basic',
  }),
  sectionSnap: yesNo({
    excelLabel: 'Section Snap', excelSheet: PS, onSheet: false, name: 'Snap boundaries to welds and gaps',
    description: 'Move each boundary between sections to the nearest circ weld or gap between scans (within a quarter of a section), so no scan is cut in two.',
    default: true, showWhen: { ...SECTIONS_ON, and: { section: 'settings', key: 'sectionSplit', values: ['Number of sections', 'Readable size'] } },
    group: 'sections', step: 'Drawing', level: 'Basic',
  }),
  sectionOverlap: num({
    excelLabel: 'Section Overlap', excelSheet: PS, onSheet: false, name: 'Overlap between sections',
    description: 'How far each sheet shows past its boundary into the next section.',
    units: 'in', min: 0, max: 120, default: 6, showWhen: SECTIONS_ON, group: 'sections', step: 'Drawing', level: 'Basic',
  }),
  sectionMatchLines: yesNo({
    excelLabel: 'Section Match Lines', excelSheet: PS, onSheet: false, name: 'Match lines',
    description: 'A line at each boundary with "SEE SECTION n" for the sheet that carries on from there.',
    default: true, showWhen: SECTIONS_ON, group: 'sections', step: 'Drawing', level: 'Basic',
  }),
  sectionOverview: yesNo({
    excelLabel: 'Section Overview', excelSheet: PS, onSheet: false, name: 'Overview sheet first',
    description: 'A first sheet with the whole shell and a numbered box for each section.',
    default: true, showWhen: SECTIONS_ON, group: 'sections', step: 'Drawing', level: 'Basic',
  }),
  sectionSkipEmpty: yesNo({
    excelLabel: 'Section Skip Empty', excelSheet: PS, onSheet: false, name: 'Skip sections with nothing on them',
    description: 'Leave out sections with no scans, nozzles or MUT points; the others are numbered in order.',
    default: true, showWhen: SECTIONS_ON, group: 'sections', step: 'Drawing', level: 'Basic',
  }),
  sectionNumberInTitle: yesNo({
    excelLabel: 'Section Number In Title', excelSheet: PS, onSheet: false, name: 'Show "Section n of N"',
    description: 'Print "SECTION n OF N" at the top of each section sheet.',
    default: true, showWhen: SECTIONS_ON, group: 'sections', step: 'Drawing', level: 'Basic',
  }),
  sectionRulerTextScale: num({
    excelLabel: 'Section Ruler Text Scale', excelSheet: PS, onSheet: false, name: 'Ruler text size on sheets',
    description: 'Multiplier for the ruler text on the section sheets (SECTIONPAGES asks for this in CAD; 2 is its default).',
    units: 'x', greaterThan: 0, max: 10, default: 2, showWhen: SECTIONS_ON, group: 'sections', step: 'Drawing', level: 'Advanced',
  }),

  // Read by the VBA but not on the v5.0 sheet.
  showCoveragePercentage: yesNo({
    excelLabel: 'Show Coverage Percentage', excelSheet: PS, onSheet: false, name: 'Show coverage %',
    description: 'Print the scan coverage percentage in the legend.',
    default: true, group: 'legendTitle', step: 'Drawing', level: 'Basic',
    v5: 'Not on the sheet, so v5.0 always uses the fallback YES.',
  }),
}

type SchemaShape<T extends Record<string, { schema: z.ZodType }>> = { [K in keyof T]: T[K]['schema'] }

export function shapeOf<T extends Record<string, { schema: z.ZodType }>>(fields: T): SchemaShape<T> {
  return Object.fromEntries(Object.entries(fields).map(([k, d]) => [k, d.schema])) as SchemaShape<T>
}

/** All field tables with the file section each one is stored under. */
export const FIELD_TABLES = [
  { section: 'project', title: 'Project information', fields: PROJECT_FIELDS },
  { section: 'vessel', title: 'Vessel', fields: VESSEL_FIELDS },
  { section: 'settings', title: 'Settings', fields: SETTINGS },
] as const

export type FieldSection = (typeof FIELD_TABLES)[number]['section']

/** Looks up a field definition by file section and key. */
export function fieldDef(section: string, key: string): FieldDef | undefined {
  const table = FIELD_TABLES.find((t) => t.section === section)
  return table ? (table.fields as Record<string, FieldDef>)[key] : undefined
}

export interface GroupField {
  section: FieldSection
  key: string
  /** The definition with its value schema. */
  def: FieldDef & { schema: z.ZodType }
}

/** The fields of one form group, in table order. */
export function groupFields(group: SettingGroupId): GroupField[] {
  return FIELD_TABLES.flatMap((t) =>
    Object.entries(t.fields as Record<string, FieldDef & { schema: z.ZodType }>)
      .filter(([, d]) => d.group === group && !d.hidden)
      .map(([key, def]) => ({ section: t.section, key, def })),
  )
}

/** Values of the three setting sections, as stored in a project. */
export type SectionValues = Record<FieldSection, Record<string, unknown>>

/** False when the field's showWhen condition is not met (the field doesn't apply right now). */
export function isFieldShown(def: FieldDef, values: SectionValues): boolean {
  for (let w: ShowWhen | undefined = def.showWhen; w; w = w.and) {
    if (!w.values.includes(String(values[w.section][w.key]))) return false
  }
  return true
}
