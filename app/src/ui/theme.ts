// The screen theme: Auto (follows Windows, prefers-color-scheme), Light or Dark. The choice is kept for this browser
// (not in the project file). The resolved theme goes on <html> as data-theme="light" | "dark" with color-scheme, so the
// CSS only needs [data-theme='dark'] rules. index.html sets it before the first paint with the same key and rule.

import { useSyncExternalStore } from 'react'

export type ThemeChoice = 'auto' | 'light' | 'dark'
export type Theme = 'light' | 'dark'

export const THEME_CHOICES: ThemeChoice[] = ['auto', 'light', 'dark']
export const THEME_KEY = 'axisbuilder:theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

export interface ThemeState {
  choice: ThemeChoice
  theme: Theme
}

/** What the store needs from the browser; tests pass their own. */
export interface ThemeEnv {
  storage?: Pick<Storage, 'getItem' | 'setItem'>
  media?: Pick<MediaQueryList, 'matches' | 'addEventListener' | 'removeEventListener'>
  root?: HTMLElement
}

/** A stored value as a choice: anything unknown or missing is Auto. */
export function parseChoice(v: unknown): ThemeChoice {
  return v === 'light' || v === 'dark' ? v : 'auto'
}

export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): Theme {
  return choice === 'auto' ? (prefersDark ? 'dark' : 'light') : choice
}

export function createThemeStore(env: ThemeEnv) {
  const read = (): ThemeChoice => {
    try {
      return parseChoice(env.storage?.getItem(THEME_KEY))
    } catch {
      return 'auto'
    }
  }
  const make = (choice: ThemeChoice): ThemeState => ({ choice, theme: resolveTheme(choice, env.media?.matches ?? false) })

  let state = make(read())
  const listeners = new Set<() => void>()

  const apply = () => {
    if (!env.root) return
    env.root.dataset.theme = state.theme
    env.root.style.colorScheme = state.theme
  }
  const update = (next: ThemeState) => {
    if (next.choice === state.choice && next.theme === state.theme) return
    state = next
    apply()
    for (const l of listeners) l()
  }

  // Windows switched light / dark: only Auto follows it.
  env.media?.addEventListener('change', () => update(make(state.choice)))
  apply()

  return {
    get: (): ThemeState => state,
    set(choice: ThemeChoice) {
      try {
        env.storage?.setItem(THEME_KEY, choice)
      } catch {
        // storage blocked: the choice lasts until the page closes
      }
      update(make(choice))
    },
    subscribe(l: () => void) {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
  }
}

function browserEnv(): ThemeEnv {
  if (typeof window === 'undefined') return {}
  let storage: ThemeEnv['storage']
  try {
    storage = window.localStorage
  } catch {
    // storage blocked (private window or site data off): Auto
  }
  return { storage, media: window.matchMedia?.(DARK_QUERY), root: document.documentElement }
}

const store = createThemeStore(browserEnv())

export function setThemeChoice(choice: ThemeChoice) {
  store.set(choice)
}

/** The theme choice and the resolved theme; re-renders when either changes. */
export function useTheme(): ThemeState {
  return useSyncExternalStore(store.subscribe, store.get)
}
