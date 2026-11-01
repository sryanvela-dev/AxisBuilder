// Small thumbnails of the matched scan photos for the preview (made once per photo, in the browser),
// so 150 photos don't each load at full size.

import { useEffect, useMemo, useState } from 'react'
import { resolveImageFile } from '../../data/imageMatch.ts'
import { photoLink } from '../../data/photos.ts'
import type { Project } from '../../data/schema.ts'
import type { PhotoFolder } from '../photoFolder.ts'

const THUMB_SIDE = 384

export async function thumbnail(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, THUMB_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)))
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return URL.createObjectURL(await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 }))
}

/** scanId -> thumbnail URL, for the scans whose photo is in the open folder. Empty while off. */
export function usePhotoThumbs(project: Project, folder: PhotoFolder | null, enabled: boolean): ReadonlyMap<string, string> {
  // Thumbnails of the current folder: file name -> URL ('' when the file could not be read).
  const [cache, setCache] = useState<{ folder: PhotoFolder | null; urls: ReadonlyMap<string, string> }>({ folder: null, urls: new Map() })
  const urls = useMemo(() => (cache.folder === folder ? cache.urls : new Map<string, string>()), [cache, folder])

  const wanted = useMemo(() => {
    const out: [string, string][] = []
    if (!enabled || !folder) return out
    for (const s of project.scans) {
      const link = photoLink(project, s.id)
      if (!link || !link.include || !link.imageFile.trim()) continue
      const file = resolveImageFile(link.imageFile, folder.names)
      if (file) out.push([s.id, file])
    }
    return out
  }, [project, folder, enabled])
  const missingKey = wanted.filter(([, f]) => !urls.has(f)).map(([, f]) => f).join('|')

  useEffect(() => {
    if (!folder || !missingKey) return
    let alive = true
    void (async () => {
      for (const name of missingKey.split('|')) {
        if (!alive) return
        let url = ''
        try {
          const f = await folder.getFile(name)
          if (f) url = await thumbnail(f)
        } catch {
          // not a readable picture: no thumbnail
        }
        if (!alive) {
          if (url) URL.revokeObjectURL(url)
          return
        }
        setCache((c) => {
          const next = new Map(c.folder === folder ? c.urls : [])
          next.set(name, url)
          return { folder, urls: next }
        })
      }
    })()
    return () => {
      alive = false
    }
  }, [folder, missingKey])

  // Free the thumbnails of a folder that is no longer shown.
  useEffect(() => {
    const shown = cache.urls
    return () => {
      if (cache.folder !== folder) for (const u of shown.values()) if (u) URL.revokeObjectURL(u)
    }
  }, [cache, folder])

  return useMemo(() => {
    const out = new Map<string, string>()
    for (const [scanId, file] of wanted) {
      const url = urls.get(file)
      if (url) out.set(scanId, url)
    }
    return out
  }, [wanted, urls])
}
