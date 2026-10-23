// "Find a setting": matches a typed text against every setting shown in the app, by its plain name,
// its description and its label on the Excel sheet (and older Excel labels). Pure, so it can be tested.

import { FIELD_TABLES, SETTING_GROUPS, type FieldDef, type FieldSection, type SettingGroupId } from './settings.ts'

export interface SettingHit {
  section: FieldSection
  key: string
  def: FieldDef
  group: SettingGroupId
  /** What matched besides the name, e.g. 'Excel: "Show Ruler"'; null when the name matched. */
  matched: string | null
}

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

interface Entry {
  section: FieldSection
  key: string
  def: FieldDef
  group: SettingGroupId
  name: string
  excel: string[]
  rest: string
}

let entries: Entry[] | null = null

function allEntries(): Entry[] {
  if (entries) return entries
  entries = FIELD_TABLES.flatMap((t) =>
    Object.entries(t.fields as Record<string, FieldDef>)
      .filter(([, d]) => !d.hidden && d.group !== undefined)
      .map(([key, def]) => {
        const group = SETTING_GROUPS.find((g) => g.id === def.group)!
        // App-only settings have no real Excel label: theirs is made up, so it is not offered as one.
        const excel = def.onSheet === false ? [] : [def.excelLabel, ...(def.legacyLabels ?? [])]
        return { section: t.section, key, def, group: group.id, name: norm(def.name), excel, rest: norm(`${def.description} ${group.title}`) }
      }),
  )
  return entries
}

/**
 * Settings matching every word of the query, best first: name starting with it, name containing it,
 * an Excel label containing it, then the description or group. At most `limit` hits.
 */
export function searchSettings(query: string, limit = 12): SettingHit[] {
  const q = norm(query)
  if (q.length < 2) return []
  const words = q.split(' ')
  const has = (text: string) => words.every((w) => text.includes(w))
  const scored: { hit: SettingHit; score: number; order: number }[] = []
  allEntries().forEach((e, order) => {
    let score = 0
    let matched: string | null = null
    if (e.name.startsWith(q)) score = 4
    else if (has(e.name)) score = 3
    else {
      const label = e.excel.find((l) => has(norm(l)))
      if (label !== undefined) {
        score = 2
        matched = `Excel: "${label}"`
      } else if (has(`${e.name} ${e.rest}`)) {
        score = 1
        matched = 'description'
      }
    }
    if (score > 0) scored.push({ hit: { section: e.section, key: e.key, def: e.def, group: e.group, matched }, score, order })
  })
  scored.sort((a, b) => b.score - a.score || a.order - b.order)
  return scored.slice(0, limit).map((s) => s.hit)
}
