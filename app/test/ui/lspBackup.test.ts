// The .lsp is frozen (2026-10-31): it sits in a closed Backup section at the bottom of the Export step, with the CAD
// program setting inside it, and "Find a setting" opens that section.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { groupFields, SETTING_GROUPS } from '../../src/data/settings.ts'
import { searchSettings } from '../../src/data/settingsSearch.ts'
import { opensLspBackup } from '../../src/ui/lspBackup.ts'

const source = readFileSync(new URL('../../src/ui/exportStep.tsx', import.meta.url), 'utf8')
const body = (name: string) => {
  const start = source.indexOf(`function ${name}(`)
  return source.slice(start, source.indexOf('\n}\n', start))
}

describe('the .lsp backup section', () => {
  it('holds the CAD program, which no other Export group shows', () => {
    expect(groupFields('lspBackup').map((f) => f.key)).toEqual(['cadPlatform'])
    expect(SETTING_GROUPS.find((g) => g.id === 'lspBackup')?.step).toBe('Export')
    expect(groupFields('export').map((f) => f.key)).not.toContain('cadPlatform')
  })

  it('Find a setting finds the CAD program there and opens the section', () => {
    const hit = searchSettings('CAD program').find((h) => h.key === 'cadPlatform')
    expect(hit?.group).toBe('lspBackup')
    expect(opensLspBackup({ section: 'settings', key: 'cadPlatform' })).toBe(true)
    expect(opensLspBackup({ section: 'settings', key: 'enableValidation' })).toBe(false)
    expect(body('LspBackup')).toContain("addEventListener(REVEAL_EVENT, reveal)")
    expect(body('LspBackup')).toContain('opensLspBackup((e as CustomEvent<RevealDetail>).detail) && ref.current) ref.current.open = true')
  })

  it('is closed by default, at the bottom of the step, with the .lsp panel and the CAD program inside', () => {
    const backup = body('LspBackup')
    expect(backup).toMatch(/<details ref=\{ref\} className="export-backup-section">/)
    expect(backup).not.toMatch(/<details[^>]*\bopen\b/)
    expect(backup).toContain('<summary>Backup: CAD drawing (.lsp)</summary>')
    expect(backup).toContain('<LspPanel disabled={disabled} />')
    expect(backup).toContain('<SettingsGroup group="lspBackup" step="export" />')
    const step = body('ExportStep')
    expect(step).not.toContain('<LspPanel')
    expect(step.trimEnd().split('\n').slice(-4).join('\n')).toContain('<LspBackup ')
  })
})
