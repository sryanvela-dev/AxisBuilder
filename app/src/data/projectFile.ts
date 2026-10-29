// Project file format: JSON with a schemaVersion field.
//
// openProject parses, upgrades older versions through MIGRATIONS, validates, and fills missing
// optional values with defaults. Invalid data is never accepted: it returns plain-language errors.

import type { z } from 'zod'
import { fieldDef } from './settings.ts'
import { describeReportPath } from '../report/schema.ts'
import {
  CURRENT_SCHEMA_VERSION,
  LIST_META,
  newJobId,
  projectFileSchema,
  type ListKey,
  type Project,
  type ProjectInput,
} from './schema.ts'

/**
 * Upgrades a file from one schema version to the next. MIGRATIONS[n] takes version-n data and
 * returns version-(n + 1) data, including the new schemaVersion. Add one entry per new version.
 */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>

export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  // Format 2 adds the job ID.
  1: (data) => ({ ...data, schemaVersion: 2, jobId: newJobId() }),
  // Format 3 adds the Drawing step settings (text sizes and colors, layer colors, centerline
  // transparency). They all have defaults, so nothing needs converting.
  2: (data) => ({ ...data, schemaVersion: 3 }),
  // Format 4 adds per-item wrapping across the circumference seam (noWrap on shell nozzles, objects and scans;
  // acrossSeam on scans). All have defaults, so nothing needs converting.
  3: (data) => ({ ...data, schemaVersion: 4 }),
  // Format 5 adds labels moved by hand in the drawing preview (labelOverrides); older files have none.
  4: (data) => ({ ...data, schemaVersion: 5 }),
  // Format 6 adds MUT areas drawn in the preview (`area` on shell and head MUT rows); older files have none.
  5: (data) => ({ ...data, schemaVersion: 6 }),
  // Format 7 adds the AUT report (`report`, null = none) and two shared job fields, Location and Equipment name
  // (blank by default). Older files have no report.
  6: (data) => ({ ...data, schemaVersion: 7, report: null }),
}

export interface OpenOptions {
  /** Override the migration table (used by tests). */
  migrations?: Readonly<Record<number, Migration>>
}

export type OpenResult =
  | { ok: true; project: Project; migratedFrom?: number }
  | { ok: false; errors: string[] }

export class ProjectFileError extends Error {
  readonly errors: string[]
  constructor(errors: string[]) {
    super(`The project is not valid:\n${errors.join('\n')}`)
    this.name = 'ProjectFileError'
    this.errors = errors
  }
}

/** A new, empty project with every default filled in. */
export function createEmptyProject(): Project {
  return projectFileSchema.parse({ schemaVersion: CURRENT_SCHEMA_VERSION })
}

/** Validates the project (filling defaults) and returns it as a JSON string. Throws ProjectFileError if invalid. */
export function saveProject(project: ProjectInput): string {
  const result = projectFileSchema.safeParse(project, { reportInput: true })
  if (!result.success) throw new ProjectFileError(formatIssues(result.error.issues, project))
  return JSON.stringify(result.data, null, 2) + '\n'
}

/** Reads a project from a JSON string. Never throws for bad input; check `ok`. */
export function openProject(json: string, options: OpenOptions = {}): OpenResult {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return { ok: false, errors: ['The file is not a valid AxisBuilder project file (it is not readable JSON).'] }
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ['The file is not a valid AxisBuilder project file (no project data found).'] }
  }

  const migrated = migrate(raw as Record<string, unknown>, options.migrations ?? MIGRATIONS)
  if (!migrated.ok) return migrated

  const result = projectFileSchema.safeParse(migrated.data, { reportInput: true })
  if (!result.success) return { ok: false, errors: formatIssues(result.error.issues, migrated.data) }

  return migrated.from === undefined
    ? { ok: true, project: result.data }
    : { ok: true, project: result.data, migratedFrom: migrated.from }
}

type MigrateResult =
  | { ok: true; data: Record<string, unknown>; from?: number }
  | { ok: false; errors: string[] }

/** Runs the migration chain from the file's schemaVersion up to CURRENT_SCHEMA_VERSION. */
export function migrate(
  data: Record<string, unknown>,
  migrations: Readonly<Record<number, Migration>>,
): MigrateResult {
  const version = data.schemaVersion
  if (version === undefined) {
    return { ok: false, errors: ['The file has no schemaVersion, so it is not an AxisBuilder project file.'] }
  }
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
    return { ok: false, errors: [`The file's schemaVersion (${JSON.stringify(version)}) is not a valid version number.`] }
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [
        `This project was saved by a newer version of AxisBuilder (file format ${version}; this app reads up to ${CURRENT_SCHEMA_VERSION}). Update the app and try again.`,
      ],
    }
  }
  if (version === CURRENT_SCHEMA_VERSION) return { ok: true, data }

  let current = data
  for (let v = version; v < CURRENT_SCHEMA_VERSION; v++) {
    const step = migrations[v]
    if (!step) {
      return { ok: false, errors: [`Project files in format ${v} can't be upgraded by this version of the app.`] }
    }
    current = step(current)
    if (current.schemaVersion !== v + 1) {
      return { ok: false, errors: [`Upgrading the file from format ${v} failed (internal error).`] }
    }
  }
  return { ok: true, data: current, from: version }
}

// --- Plain-language error messages ----------------------------------------------------------

const SECTION_NAMES: Record<string, string> = {
  project: 'Project information',
  vessel: 'Vessel',
  settings: 'Settings',
}

/** Turns Zod issues into sentences like "Shell nozzles, item 3 (N3): Diameter must be greater than 0." */
export function formatIssues(issues: readonly z.core.$ZodIssue[], input: unknown): string[] {
  return issues.map((issue) => {
    const where = describePath(issue.path, input)
    const what = describeProblem(issue)
    return `${where.prefix}${where.field ? where.field + ' ' : ''}${what}.`
  })
}

function describePath(path: readonly PropertyKey[], input: unknown): { prefix: string; field: string } {
  const [first, second, third] = path
  if (path.length === 0) return { prefix: 'Project file: ', field: '' }

  if (typeof first === 'string' && first in SECTION_NAMES) {
    if (second === undefined) return { prefix: '', field: SECTION_NAMES[first] }
    const def = fieldDef(first, String(second))
    return { prefix: `${SECTION_NAMES[first]}: `, field: def ? def.name : `"${String(second)}"` }
  }

  if (typeof first === 'string' && first in LIST_META) {
    const meta = LIST_META[first as ListKey]
    if (second === undefined) return { prefix: '', field: meta.name }
    if (typeof second !== 'number') return { prefix: `${meta.name}: `, field: '' }
    const item = getAt(input, [first, second])
    const itemId = item && typeof item === 'object' ? (item as Record<string, unknown>)[meta.idField] : undefined
    const idText = typeof itemId === 'string' && itemId.trim() ? ` (${itemId.trim()})` : ''
    const fields = meta.fields as Record<string, string>
    const field = third === undefined ? '' : (fields[String(third)] ?? `"${String(third)}"`)
    return { prefix: `${meta.name}, item ${second + 1}${idText}: `, field }
  }

  if (first === 'report') {
    if (second === undefined) return { prefix: '', field: 'Report' }
    return describeReportPath(path.slice(1), getAt(input, ['report']))
  }
  if (first === 'schemaVersion') return { prefix: '', field: 'schemaVersion' }
  if (first === 'jobId') return { prefix: '', field: 'Job ID' }
  return { prefix: 'Project file: ', field: path.map(String).join('.') }
}

function describeProblem(issue: z.core.$ZodIssue): string {
  switch (issue.code) {
    case 'invalid_type': {
      if (issue.input === undefined) return 'is missing'
      if (issue.expected === 'int') return 'must be a whole number'
      const expected: Record<string, string> = {
        number: 'must be a number',
        string: 'must be text',
        boolean: 'must be yes or no (true/false)',
        array: 'must be a list',
        object: 'must be a group of values',
      }
      const got = issue.input === null ? 'empty' : JSON.stringify(issue.input)
      return `${expected[issue.expected] ?? `must be ${issue.expected}`} (found ${got})`
    }
    case 'too_small':
      return issue.inclusive
        ? `must be at least ${String(issue.minimum)}`
        : `must be greater than ${String(issue.minimum)}`
    case 'too_big':
      return issue.inclusive ? `must be at most ${String(issue.maximum)}` : `must be less than ${String(issue.maximum)}`
    case 'invalid_value': {
      const allowed = issue.values.map((v) => (v === '' ? '(blank)' : String(v)))
      const got = 'input' in issue && issue.input !== undefined ? ` (found ${JSON.stringify(issue.input)})` : ''
      return allowed.length === 1
        ? `must be ${allowed[0]}${got}`
        : `must be one of: ${allowed.join(', ')}${got}`
    }
    case 'invalid_union': {
      // Only Min. T on nozzles is a union: a thickness or "TOL".
      const got = 'input' in issue && issue.input !== undefined ? ` (found ${JSON.stringify(issue.input)})` : ''
      return `must be a thickness of 0 or more, "TOL", or empty${got}`
    }
    case 'unrecognized_keys':
      return `has unknown ${issue.keys.length === 1 ? 'field' : 'fields'}: ${issue.keys.join(', ')}`
    default:
      return issue.message
  }
}

function getAt(value: unknown, path: readonly PropertyKey[]): unknown {
  let v = value
  for (const key of path) {
    if (v === null || typeof v !== 'object') return undefined
    v = (v as Record<PropertyKey, unknown>)[key]
  }
  return v
}
