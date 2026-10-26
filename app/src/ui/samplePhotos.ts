// The sample job's scan photos (public/sample-photos/, made by npm run sample:make). They stand in for the photo folder,
// so the preview, Process images, the PDF and the report images all have photos to show. The service worker keeps
// them, so the sample works offline too.

import type { PhotoFolder } from './photoFolder.ts'

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
