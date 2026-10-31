// Filling the template's text blocks: {placeholder} -> value. The values themselves are worked out by the summary
// step (R4); this is the one list of names a template may use, so a template test can catch a misspelt one.

export const TEXT_FIELDS = [
  'equipment', 'equipmentKind', 'examinationType', 'purpose', 'areaCovered', 'limitations',
  'transducerMaker', 'transducerSize', 'transducerFrequency', 'transducerAngle', 'transducerMode', 'incrX', 'incrY',
  'scanCount', 'readings', 'coveragePercent', 'coverageArea', 'minT', 'minScan', 'wallLoss', 'nominal', 'avgT',
  'manualReadings', 'mutCoveragePercent', 'mutCoverageArea', 'totalCoveragePercent',
] as const
export type TextField = (typeof TEXT_FIELDS)[number]

/** The {names} a text uses. */
export function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1])
}

/** The text with every {name} replaced; a name with no value is left as written so it shows up on review. */
export function fillText(text: string, values: Partial<Record<TextField, string>>): string {
  return text.replace(/\{(\w+)\}/g, (all, name: string) => values[name as TextField] ?? all)
}

/** A grouped or conditional block's `when` ("band=2", "manualReadings>0") against numbers. */
export function blockApplies(when: string | undefined, values: Record<string, number>): boolean {
  if (when === undefined) return true
  const m = /^(\w+)(=|>|<)(-?\d+(?:\.\d+)?)$/.exec(when)
  if (!m) return false
  const v = values[m[1]]
  if (v === undefined) return false
  const n = Number(m[3])
  return m[2] === '=' ? v === n : m[2] === '>' ? v > n : v < n
}
