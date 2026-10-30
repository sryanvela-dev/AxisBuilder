// The title block (app change 29, user 2026-10-29): "Equipment ID" instead of "Component", Location, and Unit only when
// it is filled. compat 'v5.0' keeps v5.0's seven lines.

import { describe, expect, it } from 'vitest'
import type { Project } from '../../src/data/schema.ts'
import { buildDrawing } from '../../src/engine/drawing.ts'
import { panelOf, titleLines } from '../../src/engine/layout.ts'
import { panelScales } from '../../src/engine/styles.ts'
import { exportLsp } from '../../src/export/lsp/exportLsp.ts'
import { olderSample } from '../fixtures/olderSample.ts'

function job(project: Partial<Project['project']>): Project {
  const p = olderSample()
  return { ...p, project: { ...p.project, component: 'V-200', location: 'Example Plant', ...project } }
}

describe('title block lines', () => {
  it('prints Equipment ID, Location and Unit when Unit is filled', () => {
    const lines = titleLines(job({ unit: 'Unit 3' }), false)
    expect(lines.slice(1, 4)).toEqual(['EQUIPMENT ID: V-200', 'LOCATION: Example Plant', 'UNIT: Unit 3'])
    expect(lines).toHaveLength(8)
  })

  it('leaves Unit out when it is blank (seven lines, no gap)', () => {
    const lines = titleLines(job({ unit: '  ' }), false)
    expect(lines).toHaveLength(7)
    expect(lines.some((l) => l.startsWith('UNIT'))).toBe(false)
    expect(lines[3]).toMatch(/^CLIENT: /)
  })

  it('keeps v5.0 lines in compat mode', () => {
    const lines = titleLines(job({ unit: '' }), true)
    expect(lines).toHaveLength(7)
    expect(lines[1]).toBe('COMPONENT: V-200')
    expect(lines[2]).toBe('UNIT: ')
  })

  it('makes room for the eighth line: the title moves up one line, the heads stay', () => {
    const seven = panelOf(job({ unit: '' })).panel
    const eight = panelOf(job({ unit: 'Unit 3' })).panel
    expect([eight.head1X, eight.head1Y]).toEqual([seven.head1X, seven.head1Y])
    const d = Math.hypot(eight.titleX - seven.titleX, eight.titleY - seven.titleY)
    // One line: 3.4 in times the title block's scale (its text size on the Drawing step).
    expect(d).toBeCloseTo(3.4 * panelScales(job({}).settings).title, 6)
  })

  it('writes the same lines to the .lsp and the preview', () => {
    const p = job({ unit: 'Unit 3' })
    const lsp = exportLsp(p, { processedImageFolder: 'X:\\img' })
    const call = lsp.split('\r\n').find((l) => l.startsWith('  (SL_TitleBlockLines '))!
    for (const line of titleLines(p, false)) expect(call).toContain(`"${line}"`)
    expect(lsp).toContain('(defun SL_TitleBlockLines (x y lines')
    const texts = buildDrawing(p).items.find((i) => i.key === 'titleBlock')?.shapes.flatMap((s) => (s.t === 'text' ? [s.text] : []))
    expect(texts).toEqual(titleLines(p, false))
  })
})
