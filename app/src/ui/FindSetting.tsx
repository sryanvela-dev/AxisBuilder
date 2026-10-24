// "Find a setting" in the job's top bar: type part of a name (or the label it had in Excel), pick a
// result, and the app goes to that step and group and highlights the setting.

import { useId, useState } from 'react'
import { SETTING_GROUPS, fieldDef, isFieldShown } from '../data/settings.ts'
import { searchSettings, type SettingHit } from '../data/settingsSearch.ts'
import { STEP_OF_APP_STEP, stepInfo } from '../state/steps.ts'
import { useApp } from './appContext.ts'
import { settingElementId } from './placeIds.ts'

/** Asks the setting's group to show it (opens "Show advanced"); SettingsGroup listens. */
export const REVEAL_EVENT = 'axisbuilder:reveal-setting'
export type RevealDetail = { section: string; key: string }

export function FindSetting() {
  const app = useApp()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listId = useId()
  const hits = searchSettings(query)

  function go(hit: SettingHit) {
    setOpen(false)
    setQuery('')
    const p = app.state.job!.history.present
    const values = { project: p.project, vessel: p.vessel, settings: p.settings }
    // A setting that doesn't apply with the current choices: show the one that switches it on.
    let target = { section: hit.section as string, key: hit.key }
    let note: string | null = null
    if (!isFieldShown(hit.def, values)) {
      // The first condition that is not met (a setting can depend on two, e.g. section sheets on and the split).
      let when = hit.def.showWhen
      while (when && when.values.includes(String((values[when.section] as Record<string, unknown>)[when.key]))) when = when.and
      if (when) {
        const ctl = fieldDef(when.section, when.key)
        const shown = when.values.map((v) => (v === 'true' ? 'on' : v === 'false' ? 'off' : v)).join(' or ')
        target = { section: when.section, key: when.key }
        note = `"${hit.def.name}" shows when ${ctl?.name ?? when.key} is ${shown}.`
      }
    }
    app.goToStep(STEP_OF_APP_STEP[hit.def.step])
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent<RevealDetail>(REVEAL_EVENT, { detail: target }))
      highlight(target.section, target.key, note)
    }, 60)
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((a) => Math.min(hits.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === 'Enter' && hits[active]) {
      e.preventDefault()
      go(hits[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const shown = open && query.trim().length >= 2
  return (
    <div className="find-setting">
      <input
        type="search"
        placeholder="Find a setting"
        aria-label="Find a setting by name or its Excel label"
        role="combobox"
        aria-expanded={shown}
        aria-controls={listId}
        aria-activedescendant={shown && hits[active] ? `${listId}-${active}` : undefined}
        aria-autocomplete="list"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setActive(0)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKey}
      />
      {shown && (
        <ul className="find-results" id={listId} role="listbox" aria-label="Settings found">
          {hits.length === 0 && <li className="muted find-none">No setting matches "{query.trim()}".</li>}
          {hits.map((h, i) => (
            <li
              key={`${h.section}.${h.key}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : undefined}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(h)}
            >
              <strong>{h.def.name}</strong>
              <span className="muted">
                {stepInfo(STEP_OF_APP_STEP[h.def.step]).title} › {SETTING_GROUPS.find((g) => g.id === h.group)!.title}
                {h.matched && h.matched !== 'description' ? ` · ${h.matched}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Scrolls to the setting, marks it for a few seconds and puts the cursor in it. Waits (up to a second)
 * for the box to appear: the step page, or the group's advanced settings, may still be rendering.
 * The mark is a data attribute, which React leaves alone when it re-renders the box.
 */
function highlight(section: string, key: string, note: string | null, tries = 20) {
  const el = document.getElementById(settingElementId(section, key))
  if (!el) {
    if (tries > 0) window.setTimeout(() => highlight(section, key, note, tries - 1), 50)
    return
  }
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  el.setAttribute('data-found', note ?? '')
  window.setTimeout(() => el.removeAttribute('data-found'), 4000)
  el.querySelector<HTMLElement>('input, select, textarea, button')?.focus({ preventScroll: true })
}
