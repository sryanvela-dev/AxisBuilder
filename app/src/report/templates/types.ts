// Report templates are data (report design section 3): a definition the code reads, never special cases in code. A
// job saves the template's id and version; the page builders (R3) and the calculations take everything that differs
// between report types from here: sections in order, cover / header / footer fields, table columns, the comment
// ladder and its wording, and the scope and summary text blocks.

/** Shared building blocks; any template can use them. */
export const PAGE_TYPES = ['cover', 'contents', 'scopeSummary', 'calibration', 'photos', 'drawing', 'table', 'cscan', 'custom', 'uploaded', 'fixedText'] as const
export type PageTypeId = (typeof PAGE_TYPES)[number]

/** When an optional section is on before the user chooses: always, or only when it has something to print. */
export type SectionDefault = boolean | 'whenAny'

export interface SectionDef {
  /** 'scope-summary', 'calibration', ... (report.sections is keyed by it). */
  id: string
  /** Shown in the header band and the contents. */
  title: string
  pageType: PageTypeId
  /** Can be turned off per job. */
  optional: boolean
  defaultOn: SectionDefault
  /** Page-type settings, e.g. { orientation: 'portrait' } or which table it prints. */
  options?: Record<string, unknown>
}

/** A job field a template prints: where it is stored and its label. */
export interface FieldRef {
  /** 'project.client', 'report.job.jobNumber', 'calc.nominal' (worked out), ... */
  source: string
  label: string
  /** Optional cover / header fields are off until the user turns them on. */
  optional?: boolean
  /** Footer: printed before the value ("Job ", "Rev "). */
  prefix?: string
  /** Footer: the lead field (bold, first) or the one in the middle; others are joined after the lead. */
  place?: 'lead' | 'centre'
}

/** A table column: key into the row the calculations produce, header text, number format. */
export interface ColumnRef {
  key: string
  header: string
  /** Decimals for numbers; undefined = text. */
  decimals?: number
  /** Printed only when the row type has the value (e.g. Avg T for MUT scans). */
  optional?: boolean
  /** Group header above this column and its neighbours with the same group ("Circumferential (X)"). */
  group?: string
  /** Unit printed after numbers: inches (0.736"), percent (2.72%). */
  unit?: 'in' | '%'
  /** Drop trailing zeros (positions: 115", 22.5"). */
  trim?: boolean
}

/** One choice in a comment-builder list: its stored id and the words it adds to the sentence. */
export interface Choice {
  id: string
  /** Shown in the dropdown. */
  label: string
  /** Words written in the comment ('' = nothing). */
  words: string
}

export interface LadderDef {
  /** Upper wall loss % of every band but the last (5 / 16 / 30: <=5, >5-16, >16-30, >30). */
  cutoffs: readonly number[]
  /** One per band, mildest first; `words` starts the comment ("No significant"). */
  severity: readonly Choice[]
  /** Print colour per band (wall loss in tables, tiles): 'normal' | 'amber' | 'red'. */
  colors: readonly LadderColor[]
  /** Form of the loss; '' id = blank. */
  forms: readonly Choice[]
  /** Cause; the blank choice's words are the noun used when no cause is picked ("wall loss"). */
  causes: readonly Choice[]
  surfaces: readonly Choice[]
  /** Mid-wall indication; the 'none' choice adds no sentence. */
  midWall: readonly Choice[]
  /** Forms whose words are the noun when no cause is picked ("Moderate I.D. pitting detected."). */
  formIsNoun: readonly string[]
}

export type LadderColor = 'normal' | 'amber' | 'red'

/**
 * A sentence of the scope or summary. `text` holds {placeholders} filled from the data (calc/textFill) and
 * [a|b] choices are not used: a block is either on or off.
 */
export interface TextBlockDef {
  id: string
  /** Which text it belongs to. */
  part: 'scope' | 'summary' | 'calibration' | 'temperature'
  /** Shown on the scope builder's switch. */
  label: string
  text: string
  defaultOn: boolean
  /** Review asks for a second look while the text is the template's own (e.g. the purpose). */
  checkDefault?: boolean
  /** Only one block of a group is used: the first whose condition holds (e.g. findings by ladder band). */
  group?: string
  /** Condition for a grouped block, e.g. 'band=0', 'mutReadings>0'. */
  when?: string
}

/** A picture on a fixed page: a picture bundled with the app, a drawing of an example job, or a slot not decided yet. */
export type FixedPicture =
  /** A file in src/assets/report/ (its pixel size written here; a test checks it), printed as it is. */
  | { slot: string; kind: 'asset'; file: string; px: { w: number; h: number }; caption?: string; /** Never wider than this (inches). */ maxW?: number }
  /** An example job's main sheet (report/exampleJobs.ts), printed as vectors with its scan photos (Overlays). */
  | { slot: string; kind: 'example'; job: string; caption?: string }
  /** Not decided yet: left out (the page closes up) and Review notes it with this text, never blocking. */
  | { slot: string; kind: 'pending'; note: string }

/**
 * Part of a fixed page: paragraphs and their pictures. Every part starts a page. 'side': the text on the left and the
 * pictures in a column on the right; 'below': the text across the page and the pictures in a row under it, as large
 * as the rest of the page allows.
 */
export interface FixedPagePart {
  layout: 'side' | 'below'
  /** Paragraphs, each with an optional heading. */
  paragraphs: { heading?: string; text: string }[]
  pictures: FixedPicture[]
}

/** A fixed page (Equipment, Guide to Interpretation): text and pictures bundled with the app. */
export interface FixedPageDef {
  sectionId: string
  parts: FixedPagePart[]
}

/** Client MUT / CML naming (later, XTO). */
export interface NamingRule {
  pattern: string
}

export interface ReportTemplate {
  id: string
  /** A job remembers the version it was made with; a newer version never changes it silently. */
  version: number
  name: string
  /** Cover title lines. */
  title: readonly [string, string]
  sections: readonly SectionDef[]
  coverFields: readonly FieldRef[]
  headerFields: readonly FieldRef[]
  footerFields: readonly FieldRef[]
  scanColumns: readonly ColumnRef[]
  readingColumns: readonly ColumnRef[]
  ladder: LadderDef
  textBlocks: readonly TextBlockDef[]
  readingNaming?: NamingRule
  fixedPages: readonly FixedPageDef[]
  /** Where coverage comes from (section 13): the drawing's figure, the CSV alone, or not printed. */
  coverage: 'drawing' | 'csv' | 'none'
  /** Default report-only job values (examination type, ...). */
  jobDefaults: { examinationType: string }
}
