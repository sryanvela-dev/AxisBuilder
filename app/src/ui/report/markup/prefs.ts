// The markup editor's last tool, colour, widths and label settings, kept per browser (design 14: "last colour / width
// remembered"). localStorage can be blocked or full (private windows, policies): every read and write is wrapped, and
// the editor works the same with the defaults.

import { DEFAULT_PREFS, TOOL_IDS, type ToolId, type ToolPrefs } from '../../../report/markTools.ts'

const KEY = 'axisbuilder:markup'

export interface StoredPrefs {
  tool: ToolId
  prefs: ToolPrefs
}

/** What was kept, with anything missing or unreadable at its default. */
export function readPrefs(): StoredPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<StoredPrefs> | null
    const tool = raw && TOOL_IDS.includes(raw.tool as ToolId) ? (raw.tool as ToolId) : 'select'
    const prefs = { ...DEFAULT_PREFS }
    const got = (raw?.prefs ?? {}) as Record<string, unknown>
    for (const k of Object.keys(DEFAULT_PREFS) as (keyof ToolPrefs)[]) {
      if (typeof got[k] === typeof DEFAULT_PREFS[k]) (prefs as Record<string, unknown>)[k] = got[k]
    }
    return { tool, prefs }
  } catch {
    return { tool: 'select', prefs: { ...DEFAULT_PREFS } }
  }
}

export function writePrefs(p: StoredPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    // Not kept: the next editor starts from the defaults.
  }
}
