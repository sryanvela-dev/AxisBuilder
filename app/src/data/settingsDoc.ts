// Renders docs/settings-review.md from the field tables in settings.ts.
// Regenerate with `npm run docs:settings`; a test fails when the doc is out of date.

import { FIELD_TABLES, SETTING_GROUPS, type FieldDef } from './settings.ts'

function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

function typeText(d: FieldDef): string {
  switch (d.type) {
    case 'text':
      return 'Text'
    case 'date':
      return 'Date'
    case 'yesNo':
      return 'Yes/No'
    case 'choice':
      return 'Choice'
    case 'number':
      return d.integer ? 'Whole number' : 'Number'
  }
}

function rangeText(d: FieldDef): string {
  switch (d.type) {
    case 'text':
      return 'Any text'
    case 'date':
      return 'Real date or blank; printed as Oct-22-2026'
    case 'yesNo':
      return 'Yes / No'
    case 'choice':
      return d.choices.join(' / ') + (d.allowBlank ? ' / (blank)' : '')
    case 'number': {
      const parts: string[] = []
      if (d.min !== undefined && d.max !== undefined) parts.push(`${d.min} to ${d.max}`)
      else if (d.min !== undefined) parts.push(`≥ ${d.min}`)
      else if (d.max !== undefined) parts.push(`≤ ${d.max}`)
      if (d.greaterThan !== undefined) parts.push(`> ${d.greaterThan}`)
      if (parts.length === 0) parts.push('Any number')
      if (d.nullable) parts.push('or blank')
      return parts.join(', ')
    }
  }
}

function defaultText(d: FieldDef): string {
  if (d.default === null || d.default === '') return '(blank)'
  if (d.default === true) return 'Yes'
  if (d.default === false) return 'No'
  return String(d.default)
}

export function renderSettingsReview(): string {
  const lines: string[] = [
    '# Settings review',
    '',
    'Every per-job value a v5.0 job keeps on the **Project Settings** and **Drawing Information** sheets,',
    'as the web app defines it. Generated from `app/src/data/settings.ts`; do not edit the tables by hand.',
    '',
    'To change a level (or anything else), note the change here or tell Claude; the change is made in',
    '`settings.ts` and this file is regenerated with `npm run docs:settings` (run in `app/`).',
    '',
    '- **Default**: the value in the v5.0 workbook (New Project keeps these), or blank for values New Project clears.',
    '  Where the VBA uses a different value when the row is missing, the v5.0 notes say so.',
    '- **Step**: the app step the value belongs to (Project, Field data, AUT scans, Images, Export), and its group on that step.',
    '- **Level**: suggested Basic (always shown) or Advanced (behind an "Advanced" switch).',
    '- All lengths are in inches.',
    '- "App: planned" in the v5.0 notes marks settings v5.0 does not use yet that the app will get code for.',
    '',
  ]

  for (const table of FIELD_TABLES) {
    lines.push(`## ${table.title} (\`${table.section}\`)`, '')
    lines.push(
      '| Key | Excel label | Plain name | Description | Type | Units | Range / choices | Default | Step | Level | v5.0 notes |',
      '|---|---|---|---|---|---|---|---|---|---|---|',
    )
    for (const [key, d] of Object.entries(table.fields as Record<string, FieldDef>)) {
      const label =
        `${d.excelSheet === 'Drawing Information' ? 'Drawing Information: ' : ''}${d.excelLabel}` +
        (d.legacyLabels?.length ? ` (also: ${d.legacyLabels.join(', ')})` : '') +
        (d.onSheet === false ? ' (not on sheet)' : '')
      lines.push(
        '| ' +
          [
            `\`${key}\``,
            label,
            d.name,
            d.description,
            typeText(d),
            d.units ?? '',
            rangeText(d),
            defaultText(d),
            d.group ? `${d.step}: ${SETTING_GROUPS.find((g) => g.id === d.group)!.title}` : d.step,
            d.level,
            d.v5 ?? '',
          ]
            .map(cell)
            .join(' | ') +
          ' |',
      )
    }
    lines.push('')
  }
  return lines.join('\n')
}
