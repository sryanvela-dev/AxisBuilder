// Checks on the project as entered, each placed on the setting or row it is about. Errors block
// export (missing values, repeated names, a long seam that starts after it stops); warnings
// don't (an item outside the shell, head items that are not drawn). Every check says what is
// wrong and how to fix it.
//
// The errors include exactly what findMissingData and findDuplicateIds report (the exporter's own
// refusal), so the step bar and the export never disagree; a test keeps the two in step.

import { formatNumber } from './parse.ts'
import { LIST_META, ID_GROUPS, REQUIRED_FOR_EXPORT, idKey, type ListKey, type Project } from './schema.ts'
import { SETTINGS, VESSEL_FIELDS, fieldDef } from './settings.ts'

export type Severity = 'error' | 'warning'

export type CheckPlace =
  | { kind: 'setting'; section: 'project' | 'vessel' | 'settings'; key: string }
  | { kind: 'row'; list: ListKey; index: number; field?: string }
  | { kind: 'list'; list: ListKey }

export interface Check {
  severity: Severity
  place: CheckPlace
  /** What is wrong, e.g. 'Diameter is blank.' */
  text: string
  /** How to fix it, e.g. 'Enter the diameter, or switch Include off.' */
  fix: string
  /** True for the checks the exporter itself refuses on (missing value, repeated name). */
  exportRule?: boolean
}

const fieldName = (list: ListKey, key: string) => (LIST_META[list].fields as Record<string, string>)[key]
const itemsOf = (p: Project, list: ListKey) => p[list] as Record<string, unknown>[]

/** "Shell nozzles, row 3 (N3)" */
export function placeText(p: Project, place: CheckPlace): string {
  if (place.kind === 'setting') {
    return fieldDef(place.section, place.key)?.name ?? place.key
  }
  const meta = LIST_META[place.list]
  if (place.kind === 'list') return meta.name
  const item = itemsOf(p, place.list)[place.index]
  const id = item ? String(item[meta.idField]) : ''
  return `${meta.name}, row ${place.index + 1}${id ? ` (${id})` : ''}`
}

/** The check as one sentence with its place: "Shell nozzles, row 3 (N3): Diameter is blank. Enter ..." */
export function checkSentence(p: Project, c: Check): string {
  return `${placeText(p, c.place)}: ${c.text} ${c.fix}`
}

const inches = (n: number) => `${formatNumber(n)} in`
/** "Diameter" -> "diameter"; "X position" stays. */
const lc = (name: string) => (/^[A-Z]( |$)/.test(name) ? name : name.charAt(0).toLowerCase() + name.slice(1))
/** "Shell length (Y)" -> "shell length". */
const plainSize = (name: string) => lc(name.replace(/\s*\([XY]\)$/, ''))

export function checkProject(p: Project): Check[] {
  const out: Check[] = []
  const len = p.vessel.length
  const circ = p.vessel.height

  if (p.project.projectName.trim() === '') {
    out.push({
      severity: 'warning', place: { kind: 'setting', section: 'project', key: 'projectName' },
      text: 'Not entered yet.', fix: 'Enter a name for the job; it is used to name the job and drawing files.',
    })
  }

  // Vessel size
  for (const key of ['length', 'height'] as const) {
    if (p.vessel[key] === null) {
      out.push({
        severity: 'error', exportRule: true, place: { kind: 'setting', section: 'vessel', key },
        text: 'Not entered yet.', fix: `Enter the ${plainSize(VESSEL_FIELDS[key].name)} in inches on the Project step.`,
      })
    }
  }

  // Missing values (as findMissingData: items switched off are not checked; shell MUT has no switch)
  for (const list of Object.keys(REQUIRED_FOR_EXPORT) as ListKey[]) {
    itemsOf(p, list).forEach((item, index) => {
      if (item.include === false) return
      const offHint = 'include' in item ? ', or untick Include if it is not drawn' : ', or delete the row'
      for (const f of REQUIRED_FOR_EXPORT[list]) {
        if (item[f] !== null) continue
        const what = f === 'clock' ? 'the clock position (like 3 or 3:30)' : `the ${lc(fieldName(list, f))}`
        out.push({ severity: 'error', exportRule: true, place: { kind: 'row', list, index, field: f }, text: `${fieldName(list, f)} is blank.`, fix: `Enter ${what}${offHint}.` })
      }
      if (item.radiusPosition === null) {
        out.push({
          severity: 'error', exportRule: true, place: { kind: 'row', list, index, field: 'radiusPosition' },
          text: 'Radius position is not chosen.', fix: 'Choose one from the list.',
        })
      }
      if (item.radiusPosition === 'CUSTOM' && item.customRadiusPercent === null) {
        out.push({
          severity: 'error', exportRule: true, place: { kind: 'row', list, index, field: 'customRadiusPercent' },
          text: 'Custom radius % is blank.', fix: 'Enter how far out from the center it is (0 = center, 100 = edge), or choose another radius position.',
        })
      }
    })
  }

  // Repeated names (as findDuplicateIds: the later one is flagged)
  for (const lists of ID_GROUPS) {
    const first = new Map<string, { list: ListKey; index: number }>()
    for (const list of lists) {
      const meta = LIST_META[list]
      itemsOf(p, list).forEach((item, index) => {
        const id = String(item[meta.idField])
        const earlier = first.get(idKey(id))
        if (!earlier) {
          first.set(idKey(id), { list, index })
          return
        }
        const where = earlier.list === list ? `row ${earlier.index + 1}` : `${LIST_META[earlier.list].name}, row ${earlier.index + 1}`
        out.push({
          severity: 'error', exportRule: true, place: { kind: 'row', list, index, field: meta.idField },
          text: `The name "${id}" is also used in ${where}.`, fix: 'Give each one its own name (names are compared ignoring capitals).',
        })
      })
    }
  }

  // Long seams that start after they stop
  p.longSeams.forEach((s, index) => {
    if (s.include && s.startY !== null && s.stopY !== null && s.startY > s.stopY) {
      out.push({
        severity: 'error', place: { kind: 'row', list: 'longSeams', index, field: 'startY' },
        text: `Start Y (${inches(s.startY)}) is after Stop Y (${inches(s.stopY)}).`, fix: 'Swap the two values, or correct the one that is wrong.',
      })
    }
  })

  // Items outside the shell (warnings: v5.0 draws them anyway)
  const outside = (list: ListKey, index: number, field: string, value: number | null, limit: number | null, limitName: string) => {
    if (value === null) return
    if (value < 0) {
      out.push({ severity: 'warning', place: { kind: 'row', list, index, field }, text: `${fieldName(list, field)} (${inches(value)}) is below 0, outside the shell.`, fix: 'Check the value.' })
    } else if (limit !== null && value > limit) {
      out.push({
        severity: 'warning', place: { kind: 'row', list, index, field },
        text: `${fieldName(list, field)} (${inches(value)}) is past the ${limitName} (${inches(limit)}).`, fix: `Check the value, or the ${limitName} on the Project step.`,
      })
    }
  }
  const lenName = plainSize(VESSEL_FIELDS.length.name)
  const circName = plainSize(VESSEL_FIELDS.height.name)
  p.circWelds.forEach((w, i) => w.include && outside('circWelds', i, 'y', w.y, len, lenName))
  p.longSeams.forEach((s, i) => {
    if (!s.include) return
    outside('longSeams', i, 'x', s.x, circ, circName)
    outside('longSeams', i, 'startY', s.startY, len, lenName)
    outside('longSeams', i, 'stopY', s.stopY, len, lenName)
  })
  p.shellNozzles.forEach((n, i) => {
    if (!n.include) return
    outside('shellNozzles', i, 'x', n.x, circ, circName)
    outside('shellNozzles', i, 'y', n.y, len, lenName)
  })
  p.objects.forEach((o, i) => {
    if (!o.include) return
    outside('objects', i, 'x', o.x, circ, circName)
    outside('objects', i, 'y', o.y, len, lenName)
    if (o.x !== null && o.circWidth !== null && circ !== null && o.x >= 0 && o.x <= circ && o.x + o.circWidth > circ) {
      out.push({
        severity: 'warning', place: { kind: 'row', list: 'objects', index: i, field: 'circWidth' },
        text: `It reaches ${inches(o.x + o.circWidth)} around, past the ${circName} (${inches(circ)}).`, fix: 'Check the X position and the width.',
      })
    }
    if (o.y !== null && o.length !== null && len !== null && o.y >= 0 && o.y <= len && o.y + o.length > len) {
      out.push({
        severity: 'warning', place: { kind: 'row', list: 'objects', index: i, field: 'length' },
        text: `It reaches ${inches(o.y + o.length)} along the shell, past the ${lenName} (${inches(len)}).`, fix: 'Check the Y position and the length.',
      })
    }
  })
  p.shellMut.forEach((m, i) => {
    outside('shellMut', i, 'x', m.x, circ, circName)
    outside('shellMut', i, 'y', m.y, len, lenName)
  })

  // Head items that are not drawn because their head view is off
  const mode = p.settings.headViewMode
  const shown = (head: string) => mode === 'BOTH' || mode === head
  const headView = SETTINGS.headViewMode.name
  for (const list of ['headNozzles', 'headMut'] as const) {
    const hidden = (p[list] as { head: string; include: boolean }[]).filter((x) => x.include && !shown(x.head))
    if (hidden.length === 0) continue
    const heads = [...new Set(hidden.map((x) => x.head))].join(' and ')
    out.push({
      severity: 'warning', place: { kind: 'list', list },
      text: `${hidden.length === 1 ? '1 is' : `${hidden.length} are`} on ${heads}, but ${headView} is ${mode}, so ${hidden.length === 1 ? 'it is' : 'they are'} not drawn.`,
      fix: `Set ${headView} (in Heads, above) to show ${mode === 'NONE' ? 'the heads you need' : 'both heads'}, or ignore this if you don't need head views.`,
    })
  }

  return out
}

/** Checks on one row (or one cell when `field` is given). */
export function checksAt(checks: Check[], list: ListKey, index: number, field?: string): Check[] {
  return checks.filter((c) => c.place.kind === 'row' && c.place.list === list && c.place.index === index && (field === undefined || c.place.field === field))
}
