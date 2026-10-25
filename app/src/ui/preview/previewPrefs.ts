// The preview's own choices (open or hidden, which layer groups are ticked), kept for this browser and shared
// with the Export step: "As the preview" exports what is ticked here.

import { useSyncExternalStore } from 'react'
import type { LayerGroup } from '../../engine/drawing.ts'

const STORE_KEY = 'axisbuilder:preview'

export interface PreviewPrefs {
  open: boolean
  hidden: LayerGroup[]
}

function load(): PreviewPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(STORE_KEY) ?? '') as PreviewPrefs
    if (typeof p.open === 'boolean' && Array.isArray(p.hidden)) return p
  } catch {
    // no saved preferences
  }
  return { open: true, hidden: [] }
}

let current: PreviewPrefs = load()
const listeners = new Set<() => void>()

export function previewPrefs(): PreviewPrefs {
  return current
}

export function setPreviewPrefs(p: PreviewPrefs) {
  current = p
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(p))
  } catch {
    // storage blocked: the choice lasts until the page closes
  }
  for (const l of listeners) l()
}

export function usePreviewPrefs(): PreviewPrefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    previewPrefs,
    previewPrefs,
  )
}
