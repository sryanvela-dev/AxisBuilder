// Live data labels (design 14 "Labels" 4, R5): a picture label linked to a scan or a shell / head MUT row, its text
// filled from a template with fields ("{scan} · Min {minT} in · {wallLoss}% WL") from the report data. The filled text
// is also stored on the mark (`text`) after every edit (refreshLiveLabels, run by syncReport), so a label whose row
// was deleted still prints its last text and Review warns; nothing vanishes from a page silently. Links follow renames
// (report/sync.ts followMarkLinks).

import { idKey, type Project } from '../data/schema.ts'
import { rowOf } from '../data/overrides.ts'
import { readingRows, scanRows } from './calc/results.ts'
import { mapMarkup } from './imageItems.ts'
import type { Mark, MarkLinkList, Report } from './schema.ts'

/** The fields a template can use, per kind of row, with what each shows. */
export const LIVE_FIELDS: Record<'scans' | 'mut', { key: string; name: string }[]> = {
  scans: [
    { key: 'scan', name: 'Scan ID' },
    { key: 'minT', name: "Min 'T' (in)" },
    { key: 'avgT', name: "Avg 'T' (in)" },
    { key: 'wallLoss', name: 'Wall loss (%)' },
    { key: 'nominal', name: 'Nominal (in)' },
    { key: 'component', name: 'Component' },
    { key: 'readings', name: 'Readings' },
  ],
  mut: [
    { key: 'id', name: 'MUT ID' },
    { key: 'minT', name: "Min 'T' (in)" },
    { key: 'avgT', name: "Avg 'T' (in)" },
    { key: 'maxT', name: "Max 'T' (in)" },
    { key: 'wallLoss', name: 'Wall loss (%)' },
    { key: 'nominal', name: 'Nominal (in)' },
    { key: 'component', name: 'Component' },
  ],
}

/** The template a new live label starts with. */
export function defaultTemplate(list: MarkLinkList): string {
  return list === 'scans' ? '{scan} · Min {minT} in · {wallLoss}% WL' : '{id} · Min {minT} in'
}

/** What a missing value prints as. */
export const NO_VALUE = '–'

const thick = (n: number | null) => (n === null ? NO_VALUE : n.toFixed(3))
const pctNum = (n: number | null) => (n === null ? NO_VALUE : n.toFixed(2))

/** The values a linked row gives the template's fields; null when the row is no longer in the drawing. */
export function liveValues(p: Project, link: NonNullable<Mark['link']>): Record<string, string> | null {
  const report = p.report
  if (link.list === 'scans') {
    const scan = p.scans.find((s) => idKey(s.id) === idKey(link.id))
    if (!scan) return null
    const row = report ? scanRows(p, report).find((r) => idKey(r.scan.id) === idKey(link.id)) : undefined
    return {
      scan: scan.id,
      minT: thick(row?.minT ?? null),
      avgT: thick(row?.avgT ?? null),
      wallLoss: pctNum(row?.wallLoss ?? null),
      nominal: thick(row?.nominal ?? null),
      component: row?.component?.name ?? NO_VALUE,
      readings: row?.readings === null || row?.readings === undefined ? NO_VALUE : String(row.readings),
    }
  }
  const rows = p[link.list]
  const i = rowOf(rows, link.id, link.occurrence)
  if (i < 0) return null
  const drawn = rows[i]
  const rr = report ? readingRows(p, report).find((r) => r.reading.link?.list === link.list && idKey(r.reading.link.id) === idKey(link.id) && r.reading.link.occurrence === link.occurrence) : undefined
  return {
    id: drawn.id,
    minT: thick(rr?.minT ?? drawn.minT ?? null),
    avgT: thick(rr?.avgT ?? null),
    maxT: thick(rr?.maxT ?? null),
    wallLoss: pctNum(rr?.wallLoss ?? null),
    nominal: thick(rr?.nominal ?? null),
    component: rr?.component?.name ?? NO_VALUE,
  }
}

/** A template with its {fields} filled; an unknown field is left as typed, so a typo shows. */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (all, key: string) => values[key] ?? all)
}

export const isLive = (m: Mark): m is Extract<Mark, { kind: 'label' }> => m.kind === 'label' && m.link !== null && m.template.trim() !== ''

/** A live label's text from the data now; null when it isn't live or its row is gone (print the stored text). */
export function liveText(p: Project, m: Mark): string | null {
  if (!isLive(m)) return null
  const v = liveValues(p, m.link!)
  return v ? fillTemplate(m.template, v) : null
}

/** A mark as it prints: a live label with its text filled now (or its last text when the row is gone). */
export function withLiveText(p: Project, m: Mark): Mark {
  const t = liveText(p, m)
  return t === null || m.kind !== 'label' || t === m.text ? m : { ...m, text: t }
}

/** Every live label's stored text brought up to date (the same report when nothing changed). */
export function refreshLiveLabels(p: Project, report: Report): Report {
  return mapMarkup(report, (marks) => {
    if (!marks.some(isLive)) return marks
    const q = { ...p, report }
    let changed = false
    const out = marks.map((m) => {
      const n = withLiveText(q, m)
      if (n !== m) changed = true
      return n
    })
    return changed ? out : marks
  })
}
