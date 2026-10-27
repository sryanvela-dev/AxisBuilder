// Theme: Auto · Light · Dark, a three-part switch (a radio group: arrow keys move and choose, one tab stop).

import { useRef, type KeyboardEvent } from 'react'
import { setThemeChoice, THEME_CHOICES, useTheme, type ThemeChoice } from './theme.ts'

const LABEL: Record<ThemeChoice, string> = { auto: 'Auto', light: 'Light', dark: 'Dark' }
const HINT: Record<ThemeChoice, string> = {
  auto: 'Follow the Windows light or dark setting',
  light: 'Always light',
  dark: 'Always dark',
}

export function ThemeSwitch({ className = '' }: { className?: string }) {
  const { choice } = useTheme()
  const group = useRef<HTMLDivElement>(null)

  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? THEME_CHOICES.length - 1 : null
    if (!step && to === null) return
    e.preventDefault()
    const i = to ?? (THEME_CHOICES.indexOf(choice) + step + THEME_CHOICES.length) % THEME_CHOICES.length
    setThemeChoice(THEME_CHOICES[i])
    group.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[i]?.focus()
  }

  return (
    <div className={`theme-switch ${className}`} role="radiogroup" aria-label="Theme" ref={group} onKeyDown={onKeyDown}>
      <span className="theme-switch-title" aria-hidden="true">
        Theme
      </span>
      {THEME_CHOICES.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={c === choice}
          tabIndex={c === choice ? 0 : -1}
          title={HINT[c]}
          onClick={() => setThemeChoice(c)}
        >
          {LABEL[c]}
        </button>
      ))}
    </div>
  )
}
