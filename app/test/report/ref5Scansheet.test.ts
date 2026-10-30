// The reference job REF5's scansheet.csv (scan names and numbers only; the job's names are not in the repo), checked
// against the figures its printed report gives (report design section 8).

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '../../src/data/projectFile.ts'
import type { Project } from '../../src/data/schema.ts'
import { readingsFromIncrements } from '../../src/report/calc/numbers.ts'
import { scanRows, scanSpanX, totalsOf } from '../../src/report/calc/results.ts'
import { formatWallLoss } from '../../src/report/calc/ladder.ts'
import { countText } from '../../src/report/calc/numbers.ts'
import { applyScansheet, importScansheet } from '../../src/report/scansheetImport.ts'

const CSV = readFileSync(new URL('../fixtures/report/ref5-scansheet.csv', import.meta.url))

function job(): Project {
  const p = createEmptyProject()
  // Made-up shell size, larger than every scan (no seam rules apply).
  const empty = { ...p, vessel: { ...p.vessel, length: 400, height: 400 } }
  return applyScansheet(empty, importScansheet(CSV, empty))
}

describe('REF5 scansheet.csv', () => {
  it('imports 17 scans with no problems and the shell nominal 0.736', () => {
    const p = createEmptyProject()
    const imp = importScansheet(CSV, { ...p, vessel: { ...p.vessel, length: 400, height: 400 } })
    expect(imp.ok).toBe(true)
    expect(imp.report.filter((e) => e.kind !== 'note')).toEqual([])
    const q = job()
    expect(q.scans).toHaveLength(17)
    expect(q.report!.components[0].nominal).toBe(0.736)
  })

  it('gives the totals of the printed report', () => {
    const p = job()
    const rows = scanRows(p, p.report!)
    const t = totalsOf(rows)
    expect(t.scans).toBe(17)
    expect(countText(t.scans)).toBe('seventeen (17)')
    expect(t.readings).toBe(3_171_045)
    expect(t.min).toEqual({ value: 0.716, scanId: 'SCAN 16' })
    expect(formatWallLoss(t.wallLoss!.value)).toBe('2.72%')
    expect(t.wallLoss!.scanId).toBe('SCAN 16')
    expect(t.average!).toBeCloseTo(0.7336, 4)
    expect(t.average!.toFixed(3)).toBe('0.734')
  })

  it('writes "No significant I.D. wall loss detected." on every scan', () => {
    const p = job()
    const comments = scanRows(p, p.report!).map((r) => r.comment!.text)
    expect(new Set(comments)).toEqual(new Set(['No significant I.D. wall loss detected.']))
  })

  it('works out the readings of all 17 rows exactly as the CSV gives them', () => {
    const p = job()
    for (const [i, scan] of p.scans.entries()) {
      const r = p.report!.scanResults[i]
      expect(readingsFromIncrements(scanSpanX(scan, 400), scan.yStop! - scan.yStart!, r.incrX, r.incrY), scan.id).toBe(r.readings)
    }
  })
})
