// The photo folder and job folder of the open job, shared by the Images step and the preview.

import { createContext, useContext } from 'react'
import type { RememberedFolder } from './useRememberedFolder.ts'

export interface JobFolders {
  photos: RememberedFolder
  jobFolder: RememberedFolder
}

export const FoldersContext = createContext<JobFolders | null>(null)

export function useJobFolders(): JobFolders {
  const f = useContext(FoldersContext)
  if (!f) throw new Error('useJobFolders must be used inside the job screen')
  return f
}
