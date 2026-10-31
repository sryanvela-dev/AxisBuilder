// The sample job's scan photos (public/sample-photos/, made by npm run sample:make). They stand in for the photo folder,
// so the preview, Process images, the PDF and the report images all have photos to show. The service worker keeps
// them, so the sample works offline too.

import type { Project } from '../data/schema.ts'
import type { PhotoFolder } from './photoFolder.ts'
import { sampleProject } from './sampleJob.ts'

/** The sample job's photo folder: the photos it links, each read on first use. */
export function samplePhotoFolder(names: string[]): PhotoFolder {
  const read = new Map<string, Promise<File | null>>()
  const load = async (name: string): Promise<File | null> => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}sample-photos/${encodeURIComponent(name)}`)
      if (!res.ok) return null
      return new File([await res.blob()], name, { type: 'image/jpeg' })
    } catch {
      return null
    }
  }
  return {
    name: 'Sample photos',
    names,
    getFile: async (name) => {
      if (!names.includes(name)) return null
      if (!read.has(name)) read.set(name, load(name))
      return read.get(name)!
    },
  }
}

let sample: Project | null = null

/**
 * A job saved from the sample job (opened again from its file, restored, or imported under a new id): the sample's scans
 * and photo names exactly. Its photos are the app's own, so they show without a photo folder. A real job never matches:
 * every scan position and every photo name must be the sample's.
 */
export function usesSamplePhotos(p: Project): boolean {
  sample ??= sampleProject()
  const s = sample
  if (p.scans.length !== s.scans.length || p.scanImages.length === 0) return false
  const same = p.scans.every((x, i) => {
    const y = s.scans[i]
    return x.id === y.id && x.xStart === y.xStart && x.xStop === y.xStop && x.yStart === y.yStart && x.yStop === y.yStop
  })
  const photos = new Map(s.scanImages.map((l) => [l.scanId, l.imageFile]))
  return same && p.scanImages.every((l) => !l.imageFile || photos.get(l.scanId) === l.imageFile)
}
