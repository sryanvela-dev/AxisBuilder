// Columns of the field data tables. Names come from LIST_META and ranges from the item schemas
// (schema.ts); this file only says what kind of value each column holds, so the tables, paste and
// checks read and show it the same way.

import { z } from 'zod'
import {
  circWeldSchema,
  headMutSchema,
  headNozzleSchema,
  idKey,
  ID_GROUPS,
  LIST_META,
  longSeamSchema,
  objectSchema,
  shellMutSchema,
  shellNozzleSchema,
  type ListKey,
  type Project,
} from './schema.ts'
import {
  parseClock,
  parseHead,
  parseLabelMode,
  parseLength,
  parseNozzleMinT,
  parseNumber,
  parseRadius,
  parseYesNo,
  type Parsed,
} from './parse.ts'

export const FIELD_LISTS = ['circWelds', 'longSeams', 'shellNozzles', 'objects', 'shellMut', 'headNozzles', 'headMut'] as const
export type FieldListKey = (typeof FIELD_LISTS)[number]

export type ColumnKind = 'id' | 'text' | 'length' | 'thickness' | 'nozzleMinT' | 'clock' | 'percent' | 'yesNo' | 'labelMode' | 'radius' | 'head'

export interface ColumnSpec {
  key: string
  kind: ColumnKind
  units?: string
}

const c = (key: string, kind: ColumnKind): ColumnSpec => {
  const units = kind === 'length' || kind === 'thickness' || kind === 'nozzleMinT' ? 'in' : kind === 'percent' ? '%' : undefined
  return units ? { key, kind, units } : { key, kind }
}

/** Table columns per list, in the order shown (the order of the v5.0 sheets). */
export const TABLE_COLUMNS: Record<FieldListKey, ColumnSpec[]> = {
  circWelds: [c('id', 'id'), c('y', 'length'), c('include', 'yesNo'), c('showLabel', 'yesNo')],
  longSeams: [c('id', 'id'), c('x', 'length'), c('startY', 'length'), c('stopY', 'length'), c('include', 'yesNo'), c('showLabel', 'yesNo')],
  shellNozzles: [
    c('id', 'id'), c('diameter', 'length'), c('x', 'length'), c('y', 'length'), c('minT', 'nozzleMinT'),
    c('notes', 'text'), c('include', 'yesNo'), c('labelMode', 'labelMode'),
  ],
  objects: [
    c('id', 'id'), c('x', 'length'), c('y', 'length'), c('circWidth', 'length'), c('length', 'length'),
    c('include', 'yesNo'), c('notes', 'text'),
  ],
  shellMut: [c('id', 'id'), c('x', 'length'), c('y', 'length'), c('minT', 'thickness'), c('notes', 'text')],
  headNozzles: [
    c('head', 'head'), c('id', 'id'), c('diameter', 'length'), c('clock', 'clock'), c('radiusPosition', 'radius'),
    c('customRadiusPercent', 'percent'), c('minT', 'nozzleMinT'), c('notes', 'text'), c('labelMode', 'labelMode'),
    c('include', 'yesNo'),
  ],
  headMut: [
    c('head', 'head'), c('id', 'id'), c('clock', 'clock'), c('radiusPosition', 'radius'), c('customRadiusPercent', 'percent'),
    c('minT', 'thickness'), c('labelMode', 'labelMode'), c('include', 'yesNo'), c('notes', 'text'),
  ],
}

export const ITEM_SCHEMAS: Record<FieldListKey, z.ZodType> = {
  circWelds: circWeldSchema,
  longSeams: longSeamSchema,
  shellNozzles: shellNozzleSchema,
  objects: objectSchema,
  shellMut: shellMutSchema,
  headNozzles: headNozzleSchema,
  headMut: headMutSchema,
}

/** Column title with units, e.g. "Diameter (in)". */
export function columnTitle(list: FieldListKey, col: ColumnSpec): string {
  const name = (LIST_META[list].fields as Record<string, string>)[col.key]
  return col.units && !name.endsWith(col.units) ? `${name} (${col.units})` : name
}

export function columnName(list: FieldListKey, key: string): string {
  return (LIST_META[list].fields as Record<string, string>)[key]
}

/** Reads cell text for a column. Blank gives null (the caller decides whether blank is allowed). */
export function parseCell(kind: ColumnKind, text: string): Parsed<unknown> {
  switch (kind) {
    case 'id':
    case 'text':
      return { ok: true, value: text.trim() }
    case 'length':
    case 'thickness':
      return parseLength(text)
    case 'nozzleMinT':
      return parseNozzleMinT(text)
    case 'clock':
      return parseClock(text)
    case 'percent':
      return parseNumber(text)
    case 'yesNo':
      return parseYesNo(text)
    case 'labelMode':
      return parseLabelMode(text)
    case 'radius':
      return parseRadius(text)
    case 'head':
      return parseHead(text)
  }
}

/** How a stored value is shown in its cell. */
export function formatCell(_kind: ColumnKind, value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return String(Math.round(value * 10000) / 10000)
  return String(value)
}

/** One plain sentence for a schema problem with a value, e.g. "Must be more than 0." */
export function schemaProblem(issue: z.core.$ZodIssue): string {
  switch (issue.code) {
    case 'too_small':
      return issue.inclusive ? `Must be at least ${String(issue.minimum)}.` : `Must be more than ${String(issue.minimum)}.`
    case 'too_big':
      return issue.inclusive ? `Must be at most ${String(issue.maximum)}.` : `Must be less than ${String(issue.maximum)}.`
    case 'invalid_type':
      return issue.input === null ? 'Must not be blank.' : 'Not a valid value.'
    case 'custom':
      return issue.message.charAt(0).toUpperCase() + issue.message.slice(1) + '.'
    default:
      return 'Not a valid value.'
  }
}

/**
 * Puts one typed value into a row. Returns the new row, or the problem (a schema range, or a blank
 * name). Text is trimmed; an ID must not be blank.
 */
export function setCell(list: FieldListKey, item: Record<string, unknown>, key: string, value: unknown): { ok: true; item: Record<string, unknown> } | { ok: false; problem: string } {
  const col = TABLE_COLUMNS[list].find((x) => x.key === key)
  if (col?.kind === 'id' && (value === '' || value === null)) return { ok: false, problem: 'A name is needed. Enter one, like N1.' }
  if (col?.kind === 'yesNo' && value === null) value = key === 'include'
  if (col?.kind === 'labelMode' && value === null) value = 'AUTO'
  if (col?.kind === 'head' && value === null) return { ok: false, problem: 'Choose HEAD 1 or HEAD 2.' }
  const next = { ...item, [key]: value }
  const res = ITEM_SCHEMAS[list].safeParse(next)
  if (!res.success) {
    const issue = res.error.issues.find((i) => i.path[0] === key)
    if (issue) return { ok: false, problem: schemaProblem(issue) }
  }
  return { ok: true, item: next }
}

/** IDs already used by the lists that share names with `list` (shell + head nozzles, shell + head MUT). */
export function usedIds(project: Project, list: ListKey): Set<string> {
  const group = ID_GROUPS.find((g) => g.includes(list)) ?? [list]
  const out = new Set<string>()
  for (const l of group) for (const it of project[l] as Record<string, unknown>[]) out.add(idKey(String(it[LIST_META[l].idField])))
  return out
}

const DEFAULT_PREFIX: Record<FieldListKey, string> = {
  circWelds: 'C', longSeams: 'L', shellNozzles: 'N', objects: 'OBJ', shellMut: 'M', headNozzles: 'N', headMut: 'M',
}

/** A free name for a new row: the last row's name with the next number ("N3" -> "N4"), never one in use. */
export function nextId(project: Project, list: FieldListKey): string {
  const used = usedIds(project, list)
  const items = project[list] as { id: string }[]
  const last = items[items.length - 1]?.id ?? ''
  const m = /^(.*?)(\d+)$/.exec(last)
  const prefix = m ? m[1] : DEFAULT_PREFIX[list]
  let n = m ? Number(m[2]) + 1 : 1
  while (used.has(idKey(`${prefix}${n}`))) n++
  return `${prefix}${n}`
}

/** A free copy name: "N1" -> "N1 (2)", "N1 (3)", ... (the importer's style). */
export function copyId(project: Project, list: FieldListKey, id: string): string {
  const used = usedIds(project, list)
  const base = id.replace(/ \(\d+\)$/, '')
  let n = 2
  while (used.has(idKey(`${base} (${n})`))) n++
  return `${base} (${n})`
}

/** An empty row (measurements blank, defaults from the schema). */
export function newItem(list: FieldListKey, id: string, head: 'HEAD 1' | 'HEAD 2' = 'HEAD 1'): Record<string, unknown> {
  const raw: Record<string, unknown> = { id }
  for (const col of TABLE_COLUMNS[list]) {
    if (col.kind === 'length' || col.kind === 'clock') raw[col.key] = null
    if (col.kind === 'head') raw[col.key] = head
  }
  return ITEM_SCHEMAS[list].parse(raw) as Record<string, unknown>
}
