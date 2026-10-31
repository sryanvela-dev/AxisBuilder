// Saved lists (report design 4.10): values a tech uses on job after job, kept per computer in this browser's storage
// (app.browserStore), never in the .axb. Picking from a list copies the values into the job, so the job file is complete
// on its own. Two kinds:
// - string lists (examination type, surface condition, ...): suggestions under a text box; a new value typed once joins
//   its list (user, 2026-10-28);
// - record lists (examiners, AUT systems, transducers, scanners, calibration blocks): "Pick saved..." fills every field,
//   "Save to list" adds the current values.
// Built-in values are offered too but never stored: for now the generic lists of the old IEPC AUT Report workbook (user,
// 2026-10-29; its technician names and procedure numbers left out), to be added to and then locked by the user.
// Export / import as a file moves them to a new laptop (approved improvement). Pure functions; the screens store them.

import { z } from 'zod'
import type { KeyValueStore } from '../state/storage.ts'

export const STRING_LISTS = {
  procedure: { name: 'Procedures', builtIn: [] },
  examinationType: { name: 'Examination types', builtIn: ['Corrosion Mapping Examination', 'HIC Examination', 'TOFD Examination', 'Time of Flight Diffraction (TOFD)', 'Pulse Echo'] },
  acceptanceCriteria: { name: 'Acceptance criteria', builtIn: ['ASME Section VIII', 'ASME B31.3', 'ASME B31.3 / Code Case 2235-6', 'Client'] },
  surfaceCondition: { name: 'Surface conditions', builtIn: ['As Welded', 'Power Buffed', 'Sand Blasted', 'Rusted', 'Poor', 'Fair', 'Good'] },
  inspectionSurface: { name: 'Inspection surfaces', builtIn: ['O.D. Surface', 'I.D. Surface', 'Outside Surface', 'Inside Surface'] },
  technique: { name: 'Techniques', builtIn: ['Pulse Echo', 'TOFD - D-scan', 'TOFD - B-scan', 'B-scan'] },
  examinerName: { name: 'Examiner names', builtIn: [] },
  examinerTitle: { name: 'Examiner titles', builtIn: ['AUT Assistant', 'Sr. NDE Specialist', 'ASNT/ACCP, Level III', 'NDT Level II', 'Sr. AUT Specialist, Level III', 'Sr. AUT Specialist, Level II', 'AUT Specialist, Level II', 'NDE Assistant'] },
  calibrationBlock: { name: 'Calibration blocks', builtIn: ['Rompus', 'AUT Calibration Block', 'IIW Block type II', 'Step Wedge', 'TOFD Notch Block'] },
  blockMaterial: { name: 'Block materials', builtIn: ['316 Stainless Steel', '302 Stainless Steel', '347 Stainless Steel'] },
  referenceReflector: { name: 'Reference reflectors', builtIn: ['0.040" I.D. Notch', '0.040" O.D. Notch', "3/4 'T' Side drilled hole", 'I.D. & O.D. Notches'] },
  systemMaker: { name: 'AUT system makers', builtIn: ['Wesdyne/Amdata'] },
  systemModel: { name: 'AUT system models', builtIn: ['Intraspect'] },
  probeMaker: { name: 'Transducer makers', builtIn: ['Megasonics', 'Danasonics', 'Technisonics', 'KBA', 'WK', 'Sigma', 'Panametrics', 'RTD', 'AUT Solutions'] },
  transducerMode: { name: 'Wave modes', builtIn: ['Longitudinal', 'Shear', 'Surface', 'Creeping'] },
  scannerModel: { name: 'Scanner models', builtIn: ['5080 scanner', '5080M scanner', '5090 scanner', 'TOFD Hand Scanner', '5085 scanner', '4040 Mouse Scanner'] },
  readingLocation: { name: 'Reading locations', builtIn: ['North', 'East', 'South', 'West', 'Top', 'Bottom'] },
  naReason: { name: 'N/A reasons', builtIn: ['U-Bolt Obstruction', 'Repad'] },
} as const satisfies Record<string, { name: string; builtIn: readonly string[] }>

export type StringListId = keyof typeof STRING_LISTS
export const STRING_LIST_IDS = Object.keys(STRING_LISTS) as StringListId[]

const t = z.string().default('')
const RECORD_SCHEMAS = {
  examiners: z.strictObject({ name: t, title: t }),
  systems: z.strictObject({ maker: t, model: t, serial: t }),
  transducers: z.strictObject({ maker: t, mode: t, element: z.enum(['', 'Single', 'Dual']).default(''), size: t, frequency: t, angle: t, serial: t }),
  scanners: z.strictObject({
    maker: t, model: t, serial: t, drive: z.enum(['', 'Automated', 'Manual']).default(''),
    wheelsOrientation: t, wheelsScanSpeed: t, wheelsDirection: z.enum(['', 'Horizontal', 'Vertical']).default(''),
    armOrientation: t, armScanSpeed: t, armDirection: z.enum(['', 'Horizontal', 'Vertical']).default(''),
    track: z.boolean().nullable().default(null), armLength: t,
  }),
  blocks: z.strictObject({ name: t, thicknessRange: t, material: t }),
}

export const RECORD_LISTS: Record<RecordListId, { name: string; one: string; title: (r: Record<string, unknown>) => string }> = {
  examiners: { name: 'Examiners', one: 'examiner', title: (r) => joined(r.name, r.title) },
  systems: { name: 'AUT systems', one: 'AUT system', title: (r) => joined(r.maker, r.model, r.serial && `S/N ${String(r.serial)}`) },
  transducers: { name: 'Transducers', one: 'transducer', title: (r) => joined(r.maker, r.size, r.frequency, r.mode, r.serial && `S/N ${String(r.serial)}`) },
  scanners: { name: 'Scanners', one: 'scanner', title: (r) => joined(r.maker, r.model, r.serial && `S/N ${String(r.serial)}`) },
  blocks: { name: 'Calibration blocks', one: 'calibration block', title: (r) => joined(r.name, r.thicknessRange, r.material) },
}

function joined(...parts: unknown[]): string {
  return parts.filter((x) => typeof x === 'string' && x.trim() !== '').map((x) => String(x).trim()).join(', ') || '(blank)'
}

export type RecordListId = keyof typeof RECORD_SCHEMAS
export const RECORD_LIST_IDS = Object.keys(RECORD_SCHEMAS) as RecordListId[]
export type SavedRecord<K extends RecordListId> = z.output<(typeof RECORD_SCHEMAS)[K]>

const savedListsSchema = z.strictObject({
  strings: z.strictObject(Object.fromEntries(STRING_LIST_IDS.map((id) => [id, z.array(z.string()).default([])])) as Record<StringListId, z.ZodDefault<z.ZodArray<z.ZodString>>>).prefault({}),
  records: z.strictObject(Object.fromEntries(RECORD_LIST_IDS.map((id) => [id, z.array(RECORD_SCHEMAS[id]).default([])])) as { [K in RecordListId]: z.ZodDefault<z.ZodArray<(typeof RECORD_SCHEMAS)[K]>> }).prefault({}),
})

export type SavedLists = z.output<typeof savedListsSchema>

export function emptySavedLists(): SavedLists {
  return savedListsSchema.parse({})
}

const key = (s: string) => s.trim().toLowerCase()

// --- String lists ----------------------------------------------------------------------------

/** A string list's saved values; lists read before a list was added to the app have none. */
const strs = (lists: SavedLists, id: StringListId): string[] => lists.strings[id] ?? []

/** The suggestions for a box: the saved values, then the built-in ones not saved (no doubles, ignoring case). */
export function suggestions(lists: SavedLists, id: StringListId): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const v of [...strs(lists, id), ...STRING_LISTS[id].builtIn]) {
    if (seen.has(key(v))) continue
    seen.add(key(v))
    out.push(v)
  }
  return out
}

/**
 * The lists with a value added (trimmed). A blank value, one already saved, or a built-in one (ignoring case) changes
 * nothing, so the same object comes back.
 */
export function addString(lists: SavedLists, id: StringListId, value: string): SavedLists {
  const v = value.trim()
  if (v === '' || suggestions(lists, id).some((s) => key(s) === key(v))) return lists
  return { ...lists, strings: { ...lists.strings, [id]: [...strs(lists, id), v] } }
}

export function removeString(lists: SavedLists, id: StringListId, value: string): SavedLists {
  const list = strs(lists, id).filter((s) => key(s) !== key(value))
  return list.length === strs(lists, id).length ? lists : { ...lists, strings: { ...lists.strings, [id]: list } }
}

/** Renames a saved value; a new name that is blank or already saved (another value) changes nothing. */
export function renameString(lists: SavedLists, id: StringListId, from: string, to: string): SavedLists {
  const v = to.trim()
  const list = strs(lists, id)
  const i = list.findIndex((s) => key(s) === key(from))
  if (i < 0 || v === '' || list.some((s, j) => j !== i && key(s) === key(v)) || list[i] === v) return lists
  return { ...lists, strings: { ...lists.strings, [id]: list.map((s, j) => (j === i ? v : s)) } }
}

// --- Record lists ----------------------------------------------------------------------------

const recordKey = (r: object) => JSON.stringify(Object.entries(r).map(([k, v]) => [k, typeof v === 'string' ? key(v) : v]))
const isBlank = (r: object) => Object.values(r).every((v) => v === '' || v === null)

/** A record from any object with the list's fields (extra fields left out, missing ones blank). */
export function toRecord<K extends RecordListId>(id: K, values: object): SavedRecord<K> {
  const shape = RECORD_SCHEMAS[id].shape as Record<string, unknown>
  const picked = Object.fromEntries(Object.keys(shape).filter((k) => k in values).map((k) => [k, (values as Record<string, unknown>)[k]]))
  return RECORD_SCHEMAS[id].parse(picked) as SavedRecord<K>
}

/** Adds a record; an all-blank one, or one equal to a saved one (ignoring case), changes nothing. */
export function addRecord<K extends RecordListId>(lists: SavedLists, id: K, values: object): SavedLists {
  const rec = toRecord(id, values)
  const list = lists.records[id] as object[]
  if (isBlank(rec) || list.some((r) => recordKey(r) === recordKey(rec))) return lists
  return { ...lists, records: { ...lists.records, [id]: [...list, rec] } }
}

export function updateRecord<K extends RecordListId>(lists: SavedLists, id: K, index: number, values: object): SavedLists {
  const list = lists.records[id] as object[]
  if (!list[index]) return lists
  const rec = toRecord(id, { ...list[index], ...values })
  return { ...lists, records: { ...lists.records, [id]: list.map((r, i) => (i === index ? rec : r)) } }
}

export function removeRecord(lists: SavedLists, id: RecordListId, index: number): SavedLists {
  const list = lists.records[id] as object[]
  if (!list[index]) return lists
  return { ...lists, records: { ...lists.records, [id]: list.filter((_, i) => i !== index) } }
}

// --- Merging, files, storage -----------------------------------------------------------------

/** Everything in `a`, plus what `b` has that `a` doesn't (an import adds; it never deletes). */
export function mergeLists(a: SavedLists, b: SavedLists): SavedLists {
  let out = a
  for (const id of STRING_LIST_IDS) for (const v of b.strings[id]) out = addSavedString(out, id, v)
  for (const id of RECORD_LIST_IDS) for (const r of b.records[id] as object[]) out = addRecord(out, id, r)
  return out
}

/** Like addString, but a built-in value is kept too (so a file round trip gives the same lists). */
function addSavedString(lists: SavedLists, id: StringListId, value: string): SavedLists {
  const v = value.trim()
  if (v === '' || strs(lists, id).some((s) => key(s) === key(v))) return lists
  return { ...lists, strings: { ...lists.strings, [id]: [...strs(lists, id), v] } }
}

const FILE_KIND = 'axisbuilder-saved-lists'
export const SAVED_LISTS_FILE_NAME = 'AxisBuilder saved lists.json'

/** The lists as a file (JSON) to move to another computer. */
export function listsToFile(lists: SavedLists): string {
  return `${JSON.stringify({ kind: FILE_KIND, version: 1, lists }, null, 2)}\n`
}

/** Reads a saved-lists file; a plain message when it isn't one. */
export function listsFromFile(text: string): { ok: true; lists: SavedLists } | { ok: false; problem: string } {
  let data: unknown
  try {
    data = JSON.parse(text.replace(/^﻿/, ''))
  } catch {
    return { ok: false, problem: 'This is not a saved-lists file (it is not JSON).' }
  }
  const d = data as { kind?: unknown; version?: unknown; lists?: unknown } | null
  if (!d || d.kind !== FILE_KIND) return { ok: false, problem: 'This is not an AxisBuilder saved-lists file.' }
  if (typeof d.version !== 'number' || d.version > 1) return { ok: false, problem: 'This file was made by a newer AxisBuilder. Update the app and try again.' }
  const res = savedListsSchema.safeParse(d.lists)
  if (!res.success) return { ok: false, problem: `The file is damaged: ${res.error.issues[0]?.path.join('.') || 'lists'} can't be read.` }
  return { ok: true, lists: res.data }
}

const STORE_KEY = 'savedLists'

/** The lists kept in this browser (empty when none or unreadable). */
export async function loadSavedLists(store: KeyValueStore): Promise<SavedLists> {
  const raw = await store.get<unknown>(STORE_KEY).catch(() => undefined)
  const res = savedListsSchema.safeParse(raw ?? {})
  return res.success ? res.data : emptySavedLists()
}

export async function storeSavedLists(store: KeyValueStore, lists: SavedLists): Promise<void> {
  await store.set(STORE_KEY, lists)
}
