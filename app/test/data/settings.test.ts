import { describe, expect, it } from 'vitest'
import { FIELD_TABLES, type FieldDef } from '../../src/data/settings.ts'
import { renderSettingsReview } from '../../src/data/settingsDoc.ts'
import settingsReviewDoc from '../../docs/settings-review.md?raw'

const allFields = FIELD_TABLES.flatMap((t) =>
  Object.entries(t.fields as Record<string, FieldDef & { schema: { safeParse(v: unknown): { success: boolean } } }>).map(
    ([key, def]) => ({ section: t.section, key, def }),
  ),
)

describe('field tables', () => {
  it('each default passes its own schema', () => {
    for (const { key, def } of allFields) {
      expect(def.schema.safeParse(def.default).success, key).toBe(true)
    }
  })

  it('choice defaults are among the choices', () => {
    for (const { key, def } of allFields) {
      if (def.type !== 'choice') continue
      const allowed: string[] = [...def.choices, ...(def.allowBlank ? [''] : [])]
      expect(allowed, key).toContain(def.default)
    }
  })

  it('keys and Excel labels are unique per sheet', () => {
    const keys = allFields.map((f) => f.key)
    expect(new Set(keys).size).toBe(keys.length)
    const labels = allFields.map((f) => `${f.def.excelSheet}|${f.def.excelLabel.toLowerCase()}`)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('every field has a one-sentence description', () => {
    for (const { key, def } of allFields) {
      expect(def.description, key).toMatch(/^[A-Z0-9].*\.$/)
      expect(def.name.length, key).toBeGreaterThan(0)
    }
  })
})

describe('docs/settings-review.md', () => {
  it('is up to date (run `npm run docs:settings` if this fails)', () => {
    expect(settingsReviewDoc.replace(/\r\n/g, '\n')).toBe(renderSettingsReview())
  })
})
