// The row (or drawing item) selected in the job: clicking a drawing item selects its row, and a row
// that gets the cursor highlights its item in the preview.

import { createContext, useContext } from 'react'
import type { ListKey } from '../data/schema.ts'

export interface Selected {
  list: ListKey
  index: number
}

export interface SelectionApi {
  selected: Selected | null
  select: (s: Selected | null) => void
}

export const SelectionContext = createContext<SelectionApi>({ selected: null, select: () => {} })

export function useSelection(): SelectionApi {
  return useContext(SelectionContext)
}

/** Key of the drawing item for a row (engine DrawingItem.key). */
export function itemKey(s: Selected): string {
  return `${s.list}:${s.index}`
}
