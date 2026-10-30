// What every report screen shares: the report folders (photos, screenshots) and the saved lists of this computer.
// Provided by ReportWorkspace.

import { createContext, useContext } from 'react'
import type { SavedLists } from '../../report/savedLists.ts'
import type { RememberedFolder } from '../useRememberedFolder.ts'

export interface ReportShared {
  /** Report photos and the cover photo. */
  photos: RememberedFolder
  /** Data-page screenshots and the dynamic calibration screenshot. */
  screenshots: RememberedFolder
  savedLists: SavedLists
  /** Changes the saved lists (kept in this browser; nothing changes when the function returns the same lists). */
  changeLists: (change: (l: SavedLists) => SavedLists) => void
}

export const ReportContext = createContext<ReportShared | null>(null)

export function useReport(): ReportShared {
  const v = useContext(ReportContext)
  if (!v) throw new Error('useReport must be used inside ReportWorkspace')
  return v
}
