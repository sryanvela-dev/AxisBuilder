// The markup editor's background: the picture's thumbnail with auto levels applied (made with the PDF's pixel code),
// or the plain thumbnail while it is made, when levels are off, or while "before" is held.

import { useEffect, useState } from 'react'
import type { FracBox } from '../../../report/schema.ts'
import type { ReadPicture } from '../reportFiles.ts'
import { processThumb } from './processThumb.ts'

/** The picture's thumbnail with auto levels applied (the editor's background), or the plain one. */
export function useLevelsThumb(pic: ReadPicture | null | undefined, on: boolean, crop: FracBox | null): string | null {
  const [made, setMade] = useState<{ key: string; url: string } | null>(null)
  const key = pic ? `${pic.thumb}|${JSON.stringify(crop)}` : ''
  useEffect(() => {
    if (!pic || !on) return
    let alive = true
    void processThumb(pic.thumb, { autoLevels: true, redactions: [], crop }).then((url) => {
      if (!alive) URL.revokeObjectURL(url)
      else setMade((old) => {
        if (old) URL.revokeObjectURL(old.url)
        return { key, url }
      })
    }).catch(() => {})
    return () => {
      alive = false
    }
    // `key` stands for the picture and the crop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, on])
  useEffect(() => () => {
    if (made) URL.revokeObjectURL(made.url)
  }, [made])
  if (!pic) return null
  return on && made?.key === key ? made.url : pic.thumb
}

