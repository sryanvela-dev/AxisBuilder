// Every button with no words on it (an icon or a sign like + or ×) has a tooltip and a name for screen readers,
// read from the source of every screen; the step bar items have tooltips; every shown setting is described (Phase 6).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PROJECT_FIELDS, SETTINGS, VESSEL_FIELDS } from '../../src/data/settings.ts'

const UI = new URL('../../src/ui/', import.meta.url)

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? tsxFiles(p) : p.endsWith('.tsx') ? [p] : []
  })
}

interface ButtonSource {
  file: string
  line: number
  open: string
  content: string
}

/** Every <button ...>...</button> in the screens' source: its opening tag and what is between the tags. */
function buttons(): ButtonSource[] {
  const out: ButtonSource[] = []
  for (const file of tsxFiles(fileURLToPath(UI))) {
    const src = readFileSync(file, 'utf8')
    const re = /<button\b/g
    let m: RegExpExecArray | null
    while ((m = re.exec(src))) {
      // The opening tag ends at the first '>' outside braces.
      let i = m.index + 7
      let depth = 0
      for (; i < src.length; i++) {
        const c = src[i]
        if (c === '{') depth++
        else if (c === '}') depth--
        else if (c === '>' && depth === 0) break
      }
      const open = src.slice(m.index, i + 1)
      const close = src.indexOf('</button>', i)
      const content = open.endsWith('/>') ? '' : src.slice(i + 1, close)
      out.push({ file: file.slice(file.lastIndexOf('ui') + 3), line: src.slice(0, m.index).split('\n').length, open, content })
    }
  }
  return out
}

/** The words a sighted user reads on the button: the text between the tags, plus quoted strings in {...}. */
function visibleWords(content: string): string {
  const quoted = [...content.matchAll(/(['"`])((?:(?!\1).)*)\1/g)].map((q) => q[2]).join(' ')
  const plain = content.replace(/\{[^}]*\}/g, ' ').replace(/<[^>]*>/g, ' ')
  // A name in braces ({s.title}, {label}) is text on the button too.
  const named = /\{[^}]*(title|label|name|text|\bid\b)[^}]*\}/i.test(content) ? 'named' : ''
  return `${plain} ${quoted} ${named}`
}

describe('buttons without words', () => {
  const all = buttons()

  it('finds the buttons in the screens', () => {
    expect(all.length).toBeGreaterThan(100)
  })

  it('every button with no words on it has a tooltip (title) and a name (aria-label)', () => {
    const iconOnly = all.filter((b) => !/[A-Za-z]{2,}/.test(visibleWords(b.content)))
    expect(iconOnly.length).toBeGreaterThan(0)
    const missing = iconOnly.filter((b) => !/\btitle=/.test(b.open) || !/\baria-label=/.test(b.open))
    expect(missing.map((b) => `${b.file}:${b.line} ${b.content.trim().slice(0, 30)}`)).toEqual([])
  })

  it('the step bar items have a tooltip with the step and its state', () => {
    const src = readFileSync(new URL('JobScreen.tsx', UI), 'utf8')
    expect(src).toMatch(/className=\{`step step-\$\{st\.state\}[^]*?title=\{`\$\{s\.title\}: \$\{STATE_TEXT\[st\.state\]\}/)
  })
})

describe('settings', () => {
  it('every setting shown in the app has a description', () => {
    const all = { ...PROJECT_FIELDS, ...VESSEL_FIELDS, ...SETTINGS } as Record<string, { description: string; hidden?: boolean }>
    const missing = Object.entries(all).filter(([, d]) => !d.hidden && d.description.trim().length < 15).map(([k]) => k)
    expect(missing).toEqual([])
  })
})
