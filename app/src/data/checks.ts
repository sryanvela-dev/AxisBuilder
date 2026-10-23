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
  /** The photo of a scan (Images step); index is the scan's row. */
  | { kind: 'photo'; index: number; scanId: string }

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
  if (place.kind === 'photo') return `Photo of ${place.scanId}`
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

  checkScans(p, out, outside, lenName, circName)
  checkPhotos(p, out)

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

type Outside = (list: ListKey, index: number, field: string, value: number | null, limit: number | null, limitName: string) => void

/** AUT scans, following v5.0: reversed start/stop, outside the shell, overlaps (Overlap Detection). */
function checkScans(p: Project, out: Check[], outside: Outside, lenName: string, circName: string) {
  const flips = p.settings.enableValidation
  const checkName = SETTINGS.enableValidation.name
  p.scans.forEach((s, index) => {
    if (!s.include) return
    for (const [a, b, axis] of [['xStart', 'xStop', 'X'], ['yStart', 'yStop', 'Y']] as const) {
      const start = s[a]
      const stop = s[b]
      if (start === null || stop === null || start <= stop) continue
      out.push({
        severity: 'warning', place: { kind: 'row', list: 'scans', index, field: a },
        text: `${axis} start (${inches(start)}) is more than ${axis} stop (${inches(stop)}).`,
        fix: flips
          ? `The drawing swaps them, as v5.0 did, so the scan runs from ${inches(stop)} to ${inches(start)}. Swap them here if you want the table to match.`
          : `"${checkName}" is off, so the drawing uses them as typed and the photo can land in the wrong place. Swap them.`,
      })
    }
    for (const [f, limit, name] of [['xStart', p.vessel.height, circName], ['xStop', p.vessel.height, circName], ['yStart', p.vessel.length, lenName], ['yStop', p.vessel.length, lenName]] as const) {
      outside('scans', index, f, s[f], limit, name)
    }
  })

  const mode = p.settings.overlapDetection
  if (mode === 'OFF') return
  const rects = p.scans
    .map((s, index) => ({ s, index }))
    .filter(({ s }) => s.include && s.xStart !== null && s.xStop !== null && s.yStart !== null && s.yStop !== null)
    .map(({ s, index }) => ({
      id: s.id, index,
      x0: Math.min(s.xStart!, s.xStop!), x1: Math.max(s.xStart!, s.xStop!),
      y0: Math.min(s.yStart!, s.yStop!), y1: Math.max(s.yStart!, s.yStop!),
    }))
  const setting = SETTINGS.overlapDetection.name
  for (let j = 1; j < rects.length; j++) {
    for (let i = 0; i < j; i++) {
      const a = rects[i]
      const b = rects[j]
      const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)
      const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)
      if (w <= 0 || h <= 0) continue
      out.push({
        severity: mode === 'BLOCK' ? 'error' : 'warning', place: { kind: 'row', list: 'scans', index: b.index, field: 'id' },
        text: `Overlaps ${a.id} (row ${a.index + 1}) by ${formatNumber(w * h)} sq in.`,
        fix: mode === 'BLOCK'
          ? `"${setting}" is BLOCK, so export stops. Correct the positions, untick Include on one of them, or set the check to WARN.`
          : 'Fine for a rescan or extra coverage (the coverage % counts both). Otherwise check the positions.',
      })
    }
  }
}

/**
 * Scan photos, following v5.0: with "Check data before export" on, every scan that is drawn needs its photo
 * (v5.0 stops the export); with it off, a missing photo is only a warning. A scan whose photo is switched off,
 * or a switched-off scan, needs none; with "Use scan images" off, no photo is needed at all.
 */
function checkPhotos(p: Project, out: Check[]) {
  if (!p.settings.generateOverlayDrawing) return
  const links = new Map(p.scanImages.map((l) => [idKey(l.scanId), l]))
  p.scans.forEach((s, index) => {
    if (!s.include) return
    const link = links.get(idKey(s.id))
    if (link && (!link.include || link.imageFile.trim() !== '')) return
    out.push({
      severity: p.settings.enableValidation ? 'error' : 'warning', place: { kind: 'photo', index, scanId: s.id },
      text: 'No photo chosen.',
      fix: 'Choose the photo folder and match the photos, or untick "Use photo" to draw this scan without one.',
    })
  })
}

/** Checks on one row (or one cell when `field` is given). */
export function checksAt(checks: Check[], list: ListKey, index: number, field?: string): Check[] {
  return checks.filter((c) => c.place.kind === 'row' && c.place.list === list && c.place.index === index && (field === undefined || c.place.field === field))
}
