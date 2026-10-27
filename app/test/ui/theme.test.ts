// The theme switch (ui/theme.ts): Auto by default, the choice kept per browser, bad or blocked storage = Auto, Auto
// following Windows, data-theme / color-scheme on the root; index.html uses the same key before the first paint.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createThemeStore, parseChoice, resolveTheme, THEME_KEY, type ThemeEnv } from '../../src/ui/theme.ts'

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
}

function fakeMedia(dark: boolean) {
  const listeners = new Set<() => void>()
  return {
    matches: dark,
    addEventListener: (_: string, l: () => void) => void listeners.add(l),
    removeEventListener: (_: string, l: () => void) => void listeners.delete(l),
    /** Windows switched light / dark. */
    flip(to: boolean) {
      this.matches = to
      for (const l of listeners) l()
    },
  }
}

function fakeRoot() {
  return { dataset: {} as Record<string, string>, style: {} as Record<string, string> }
}

function store(env: { storage?: unknown; media?: unknown; root?: unknown }) {
  return createThemeStore(env as ThemeEnv)
}

describe('theme', () => {
  it('reads unknown, missing or bad stored values as Auto', () => {
    expect(parseChoice('light')).toBe('light')
    expect(parseChoice('dark')).toBe('dark')
    for (const v of [null, undefined, '', 'auto', 'Dark', 'blue', '{"x":1}', 3]) expect(parseChoice(v)).toBe('auto')
  })

  it('resolves Auto from Windows and keeps Light / Dark as chosen', () => {
    expect(resolveTheme('auto', false)).toBe('light')
    expect(resolveTheme('auto', true)).toBe('dark')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('starts on Auto with nothing saved and puts the resolved theme on the root', () => {
    const root = fakeRoot()
    const s = store({ storage: fakeStorage(), media: fakeMedia(true), root })
    expect(s.get()).toEqual({ choice: 'auto', theme: 'dark' })
    expect(root.dataset.theme).toBe('dark')
    expect(root.style.colorScheme).toBe('dark')
  })

  it('saves the choice and reads it back in a new page', () => {
    const storage = fakeStorage()
    const root = fakeRoot()
    const s = store({ storage, media: fakeMedia(true), root })
    let calls = 0
    s.subscribe(() => calls++)
    s.set('light')
    expect(storage.data.get(THEME_KEY)).toBe('light')
    expect(s.get()).toEqual({ choice: 'light', theme: 'light' })
    expect(root.dataset.theme).toBe('light')
    expect(root.style.colorScheme).toBe('light')
    expect(calls).toBe(1)
    expect(store({ storage, media: fakeMedia(true), root: fakeRoot() }).get()).toEqual({ choice: 'light', theme: 'light' })
  })

  it('falls back to Auto when the saved value is bad or storage throws, and still switches for this page', () => {
    expect(store({ storage: fakeStorage({ [THEME_KEY]: 'purple' }), media: fakeMedia(false) }).get().choice).toBe('auto')
    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    const s = store({ storage: blocked, media: fakeMedia(false), root: fakeRoot() })
    expect(s.get()).toEqual({ choice: 'auto', theme: 'light' })
    s.set('dark')
    expect(s.get()).toEqual({ choice: 'dark', theme: 'dark' })
    expect(store({}).get()).toEqual({ choice: 'auto', theme: 'light' })
  })

  it('Auto follows Windows at once; Light and Dark do not', () => {
    const media = fakeMedia(false)
    const root = fakeRoot()
    const s = store({ storage: fakeStorage(), media, root })
    media.flip(true)
    expect(s.get().theme).toBe('dark')
    expect(root.dataset.theme).toBe('dark')
    s.set('light')
    media.flip(false)
    media.flip(true)
    expect(s.get()).toEqual({ choice: 'light', theme: 'light' })
    s.set('auto')
    expect(s.get().theme).toBe('dark')
  })

  it('index.html sets the theme before the first paint with the same key, and the CSS has no media-query dark colors', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
    const head = html.slice(0, html.indexOf('</head>'))
    expect(head).toContain(`localStorage.getItem('${THEME_KEY}')`)
    expect(head).toContain("setAttribute('data-theme'")
    expect(head).toContain('colorScheme')
    const css = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8')
    expect(css).not.toContain('prefers-color-scheme')
    expect(css).toContain(":root[data-theme='dark']")
  })
})
