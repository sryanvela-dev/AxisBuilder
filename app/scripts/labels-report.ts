// Where every nozzle label goes (engine/labels.ts) in the golden jobs, at the default nozzle text size and at 2x:
// inside or outside, the label point, the leader length and anything it overlaps.
//   npm run labels:report -- [REF1 REF2 ...]   (default: REF1 and REF2)
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openProject } from '../src/data/projectFile.ts'
import type { Project } from '../src/data/schema.ts'
import { drawnScans, panelOf } from '../src/engine/layout.ts'
import { headNozzleLabels, shellNozzleLabels, type NozzleLabel } from '../src/engine/labels.ts'

const golden = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'golden')
const jobs = process.argv.slice(2).length ? process.argv.slice(2) : ['REF1', 'REF2']
const r1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1)
const line = (l: NozzleLabel) => {
  const where = l.leader ? `outside at ${r1(l.tx)}, ${r1(l.ty)}, leader ${r1(l.leader.slice(1).reduce((n, q, i) => n + Math.hypot(q[0] - l.leader![i][0], q[1] - l.leader![i][1]), 0))}` : 'inside'
  return `${l.txt.padEnd(8)} ${where}${(l as { crowded?: string }).crowded ? `  OVERLAPS ${(l as { crowded?: string }).crowded}` : ''}`
}
for (const job of jobs) {
  const opened = openProject(readFileSync(join(golden, job, 'project.json'), 'utf8'))
  if (!opened.ok) continue
  for (const scale of [1, 2]) {
    const p: Project = scale === 1 ? opened.project : {
      ...opened.project,
      settings: { ...opened.project.settings, shellNozzleTextSize: 'Scale', shellNozzleTextScale: scale, headNozzleTextSize: 'Scale', headNozzleTextScale: scale },
    }
    console.log(`${job}, nozzle text ${scale}x`)
    for (const l of shellNozzleLabels(p, drawnScans(p)).values()) console.log(`  shell  ${line(l)}`)
    const { headDia, panel } = panelOf(p)
    for (const l of headNozzleLabels(p, panel, headDia).values()) console.log(`  head   ${line(l)}`)
  }
}
