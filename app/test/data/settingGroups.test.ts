import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { reportTargets } from '../../src/data/reportTargets.ts'
import { createEmptyProject } from '../../src/data/projectFile.ts'
import { FIELD_TABLES, SETTING_GROUPS, groupFields, isFieldShown, type FieldDef, type SectionValues } from '../../src/data/settings.ts'
import { importWorkbook } from '../../src/data/xlsmImport.ts'

const allFields = FIELD_TABLES.flatMap((t) => Object.entries(t.fields as Record<string, FieldDef>).map(([key, def]) => ({ section: t.section, key, def })))

function values(over: Partial<{ vessel: Record<string, unknown>; settings: Record<string, unknown> }> = {}): SectionValues {
  const p = createEmptyProject()
  return { project: p.project, vessel: { ...p.vessel, ...over.vessel }, settings: { ...p.settings, ...over.settings } }
}

describe('setting groups', () => {
  it('every setting that is shown is placed on a step, in a group of that step (nothing unplaced)', () => {
    for (const f of allFields.filter((x) => !x.def.hidden)) {
      const group = SETTING_GROUPS.find((g) => g.id === f.def.group)
      expect(group, `${f.section}.${f.key}`).toBeDefined()
      expect(group!.step, `${f.section}.${f.key}`).toBe(f.def.step)
    }
  })

  it('the v5.0-only settings the app does not use are hidden from the forms, and kept in the file', () => {
    const hidden = allFields.filter((f) => f.def.hidden).map((f) => f.key)
    expect(hidden).toEqual([
      'outputCommand', 'showDirectionLabels', 'arrowLengthMode', 'arrowLength', 'autHatchPattern', 'autHatchAngle', 'legendEnabled',
      'showTitleBlock', 'originalImageFolder', 'overlayPixelsPerInch', 'draftSightImagePixelsPerUnit', 'overlayPreprocessRotation',
    ])
    expect(groupFields('images').map((f) => f.key)).toEqual(['generateOverlayDrawing', 'processedImageFolder', 'maxImageSide'])
    expect(groupFields('scans').map((f) => f.key)).toEqual(['autHatchEnabled', 'autHatchScale', 'overlapDetection'])
    expect(Object.keys(createEmptyProject().settings)).toEqual(expect.arrayContaining(hidden))
    expect(createEmptyProject().settings.maxImageSide).toBe(4096)
  })

  it('groups keep the order of settings.ts', () => {
    expect(groupFields('vessel').map((f) => f.key)).toEqual(['orientation', 'length', 'height'])
    expect(groupFields('heads').map((f) => `${f.section}.${f.key}`)).toEqual(['settings.headViewMode', 'settings.head1Label', 'settings.head2Label'])
  })

  it('a showWhen condition names a real choice setting and one of its choices', () => {
    for (const f of allFields.filter((x) => x.def.showWhen)) {
      const w = f.def.showWhen!
      const target = allFields.find((x) => x.section === w.section && x.key === w.key)?.def
      expect(target?.type, `${f.key} -> ${w.key}`).toBe('choice')
      for (const v of w.values) expect(target!.type === 'choice' && (target!.choices as readonly string[]).includes(v), `${f.key}: ${v}`).toBe(true)
    }
  })
})

describe('settings that only apply sometimes', () => {
  const def = (key: string) => allFields.find((f) => f.key === key)!.def

  it('the five custom reference labels show only for Custom Cardinal, the label set only for Auto Cardinal', () => {
    const custom = values({ vessel: { referenceLabelMode: 'Custom Cardinal' } })
    const auto = values({ vessel: { referenceLabelMode: 'Auto Cardinal' } })
    const none = values({ vessel: { referenceLabelMode: 'None' } })
    const labels = ['refLabel0', 'refLabel90', 'refLabel180', 'refLabel270', 'refLabel360']
    expect(labels.map((k) => isFieldShown(def(k), custom))).toEqual([true, true, true, true, true])
    expect(labels.map((k) => isFieldShown(def(k), auto))).toEqual([false, false, false, false, false])
    expect(isFieldShown(def('referenceLabelSet'), auto)).toBe(true)
    expect(isFieldShown(def('referenceLabelSet'), custom)).toBe(false)
    expect(isFieldShown(def('referenceLabelSet'), none)).toBe(false)
    expect(isFieldShown(def('referenceLabelMode'), none)).toBe(true)
  })

  it('head names show only for heads that are drawn', () => {
    const shown = (mode: string) => [isFieldShown(def('head1Label'), values({ settings: { headViewMode: mode } })), isFieldShown(def('head2Label'), values({ settings: { headViewMode: mode } }))]
    expect(shown('NONE')).toEqual([false, false])
    expect(shown('HEAD 1')).toEqual([true, false])
    expect(shown('HEAD 2')).toEqual([false, true])
    expect(shown('BOTH')).toEqual([true, true])
  })
})

describe('import report links', () => {
  it('links report entries to the setting or row they are about', () => {
    const r = importWorkbook(readFileSync(join(import.meta.dirname, '..', 'fixtures', 'xlsm', 'v5-current.xlsx')))
    const targets = reportTargets(r.report, r.sources, r.project)
    expect(targets).toHaveLength(r.report.length)
    const linked = r.report.map((e, i) => ({ e, t: targets[i] })).filter((x) => x.t)
    expect(linked.some((x) => x.t!.kind === 'setting')).toBe(true)
    expect(linked.some((x) => x.t!.kind === 'row')).toBe(true)
    for (const { e, t } of linked) {
      if (t!.kind !== 'row') continue
      const ids = (r.project[t!.list] as Record<string, unknown>[]).map((it) => String(it.id ?? it.scanId))
      expect(ids, `${e.sheet} ${e.cell}`).toContain(t!.id)
    }
  })
})
