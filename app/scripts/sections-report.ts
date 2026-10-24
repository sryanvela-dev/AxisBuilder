// Prints the section plan (engine/sections.ts) of every golden job with section sheets switched on and the
// suggested values:   npm run sections:report
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openProject } from '../src/data/projectFile.ts'
import { sectionPlan } from '../src/engine/sections.ts'

const golden = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'golden')
const r = (n: number, d = 3) => String(Math.round(n * 10 ** d) / 10 ** d)
for (const job of readdirSync(golden, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
  const opened = openProject(readFileSync(join(golden, job, 'project.json'), 'utf8'))
  if (!opened.ok) continue
  const p = { ...opened.project, settings: { ...opened.project.settings, makeSectionSheets: true } }
  const plan = sectionPlan(p)
  console.log(`${job}: ${p.vessel.orientation}, ${r(p.vessel.length!)} long, ${r(p.vessel.height!)} around`)
  if (typeof plan === 'string') {
    console.log(`  no plan (${plan})`)
    continue
  }
  for (const n of plan.notes) console.log(`  note: ${n}`)
  for (const n of plan.problems) console.log(`  problem: ${n}`)
  if (plan.overview) console.log('  sheet 0: overview')
  for (const s of plan.sections) {
    const label = s.smallestLabel === null ? 'no scans' : `smallest label ${r(s.smallestLabel)} in`
    const scale = `1:${r(1 / s.scale, 1)}`
    const match = [s.prev ? `see ${s.prev}` : '', s.next ? `see ${s.next}` : ''].filter(Boolean).join(', ')
    console.log(`  section ${s.n}: ${r(s.start)} to ${r(s.end)} (sheet shows ${r(s.viewStart)} to ${r(s.viewEnd)}), scale ${scale}, ${label}${match ? `, match lines: ${match}` : ''}`)
  }
}
