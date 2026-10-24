// Lists, for every golden job, the items the app draws across the circumference seam (engine/wrap.ts):
//   npm run wrap:report
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openProject } from '../src/data/projectFile.ts'
import { drawnScans } from '../src/engine/layout.ts'
import { circumference, isWrapped, nozzlePieces, objectPieces, scanPieces } from '../src/engine/wrap.ts'

const golden = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'golden')
const r = (n: number) => String(Math.round(n * 1000) / 1000)
for (const job of readdirSync(golden, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
  const opened = openProject(readFileSync(join(golden, job, 'project.json'), 'utf8'))
  if (!opened.ok) continue
  const p = opened.project
  const C = circumference(p)
  const lines: string[] = []
  for (const sc of drawnScans(p)) {
    if (sc.include && sc.xStart !== null && sc.xStop !== null && isWrapped(scanPieces(sc, C))) lines.push(`scan ${sc.id}: X ${r(sc.xStart)} to ${r(sc.xStop)}`)
  }
  for (const o of p.objects) {
    if (!o.include || o.x === null || o.circWidth === null) continue
    const pieces = objectPieces(o, C)
    if (isWrapped(pieces) || pieces[0].x0 !== o.x) lines.push(`object ${o.id}: X ${r(o.x)} + ${r(o.circWidth)} -> ${pieces.map((pc) => `${r(pc.x0)}..${r(pc.x1)}`).join(' and ')}`)
  }
  for (const n of p.shellNozzles) {
    if (!n.include || n.x === null || n.y === null || n.diameter === null) continue
    const pieces = nozzlePieces(n, C)
    if (pieces.some((pc) => pc.arc !== null || pc.cx !== n.x)) lines.push(`nozzle ${n.id}: X ${r(n.x)}, diameter ${r(n.diameter)} -> ${pieces.length} piece(s)`)
  }
  console.log(`${job} (circumference ${C === null ? '?' : r(C)}): ${lines.length ? '' : 'nothing wraps'}`)
  for (const l of lines) console.log(`  ${l}`)
}
