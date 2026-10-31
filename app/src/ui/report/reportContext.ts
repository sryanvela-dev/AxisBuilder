// What every report screen shares: the report folders (photos, screenshots) and the saved lists of this computer.
// Provided by ReportWorkspace.

import { createContext, useContext } from 'react'
import type { ReportDocument } from '../../report/pageModel.ts'
import type { PdfInfo } from '../../report/pdfInfo.ts'
import type { SavedLists } from '../../report/savedLists.ts'
import type { RememberedFolder } from '../useRememberedFolder.ts'
import type { ReadPicture, ReportFileSources } from './reportFiles.ts'

export interface ReportShared {
  /** Report photos and the cover photo. */
  photos: RememberedFolder
  /** Data-page screenshots and the dynamic calibration screenshot. */
  screenshots: RememberedFolder
  savedLists: SavedLists
  /** Changes the saved lists (kept in this browser; nothing changes when the function returns the same lists). */
  changeLists: (change: (l: SavedLists) => SavedLists) => void
  /** The report as pages (null while it can't be built) and its pictures, shared by the Pages view and the export. */
  pages: {
    doc: ReportDocument | null
    pictures: ReadonlyMap<string, ReadPicture | null>
    sources: ReportFileSources
    /** Reads the pictures that could not be read again (after an "Allow" click or a new folder). */
    retry: () => void
    /** Uploaded PDFs: each file's pages, why it can't be used, or 'missing' (not found yet). */
    pdfInfo: ReadonlyMap<string, PdfInfo | 'missing'>
  }
}

export const ReportContext = createContext<ReportShared | null>(null)

export function useReport(): ReportShared {
  const v = useContext(ReportContext)
  if (!v) throw new Error('useReport must be used inside ReportWorkspace')
  return v
}
