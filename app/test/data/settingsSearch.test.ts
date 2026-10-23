import { describe, expect, it } from 'vitest'
import { FIELD_TABLES, SETTING_GROUPS, type FieldDef } from '../../src/data/settings.ts'
import { searchSettings } from '../../src/data/settingsSearch.ts'

const keys = (q: string) => searchSettings(q).map((h) => h.key)

describe('Find a setting', () => {
  it('finds settings by their plain name', () => {
    expect(keys('hatch line spacing')[0]).toBe('autHatchScale')
    expect(keys('legend text: color')[0]).toBe('legendTextColor')
    expect(keys('head view size')[0]).toBe('headViewSize')
  })

  it('finds settings by their Excel label and older Excel labels', () => {
    const hit = searchSettings('AUT Hatch Scale').find((h) => h.key === 'autHatchScale')
    expect(hit?.matched).toBe('Excel: "AUT Hatch Scale"')
    expect(keys('Hatch Scale')).toContain('autHatchScale') // older label
    expect(keys('Show Ruler')).toContain('showRulers') // older label "Show Ruler"
    expect(keys('X Axis Custom Direction')).toContain('xAxisDirectionText')
  })

  it('finds settings by words of their description', () => {
    expect(keys('transparent')).toContain('centerlineTransparency')
  })

  it('needs every word, ignores case and punctuation, and ranks name matches first', () => {
    expect(keys('SCAN labels')[0]).toBe('scanTextSize')
    expect(keys('zzz nothing')).toEqual([])
    expect(keys('a')).toEqual([])
  })

  it('does not offer made-up Excel labels for app-only settings', () => {
    for (const h of searchSettings('color', 200)) if (h.def.onSheet === false) expect(h.matched ?? '').not.toMatch(/^Excel/)
  })

  it('finds every setting shown in the app by its own name, never a hidden one', () => {
    for (const t of FIELD_TABLES) {
      for (const [key, def] of Object.entries(t.fields as Record<string, FieldDef>)) {
        const found = searchSettings(def.name, 500).some((h) => h.key === key && h.section === t.section)
        expect(found, `${t.section}.${key}`).toBe(!def.hidden && def.group !== undefined)
      }
    }
  })

  it('every hit is in a group of its own step', () => {
    for (const h of searchSettings('show', 500)) expect(SETTING_GROUPS.find((g) => g.id === h.group)!.step).toBe(h.def.step)
  })
})
