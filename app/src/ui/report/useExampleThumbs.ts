// Thumbnails of the example jobs' scan photos (report/exampleJobs.ts) for the Pages view, keyed by their prefixed scan
// IDs like the job's own (usePhotoThumbs). The photos never change, so each is made once per visit.

import { useEffect, useMemo, useState } from 'react'
import { resolveImageFile } from '../../data/imageMatch.ts'
import { photoLink } from '../../data/photos.ts'
import type { PhotoReader } from '../../export/pdf/photos.ts'
import { EXAMPLE_JOBS, exampleJobsIn, examplePhotoNames, exampleProject, exampleScanId } from '../../report/exampleJobs.ts'
import type { ReportDocument } from '../../report/pageModel.ts'
import { thumbnail } from '../preview/usePhotoThumbs.ts'
import { samplePhotoFolder } from '../samplePhotos.ts'
import { browserPhotoReader } from '../sheetPhotos.ts'

const made = new Map<string, Promise<ReadonlyMap<string, string>>>()

function jobThumbs(job: string): Promise<ReadonlyMap<string, string>> {
  if (!made.has(job)) {
    made.set(job, (async () => {
      const p = exampleProject(job)!
      const names = examplePhotoNames(job)
      const folder = samplePhotoFolder(names, EXAMPLE_JOBS[job].photos)
      const out = new Map<string, string>()
      for (const s of p.scans) {
        const link = photoLink(p, s.id)
        const name = link && link.include ? resolveImageFile(link.imageFile, names) : null
        if (!name) continue
        try {
          const f = await folder.getFile(name)
          if (f) out.set(exampleScanId(job, s.id), await thumbnail(f))
        } catch {
          // not readable (offline before the first visit): the sheet shows the scan without its photo
        }
      }
      return out
    })())
  }
  return made.get(job)!
}

/** The job's own drawing thumbnails with the example jobs' added, for the jobs the document shows. */
export function useExampleThumbs(doc: Pick<ReportDocument, 'pages'> | null, own: ReadonlyMap<string, string>): ReadonlyMap<string, string> {
  const jobs = useMemo(() => (doc ? exampleJobsIn(doc.pages.flatMap((pg) => pg.items.flatMap((i) => (i.t === 'sheet' ? [i.model] : [])))) : []).join('|'), [doc])
  const [loaded, setLoaded] = useState<ReadonlyMap<string, string>>(new Map())
  useEffect(() => {
    if (!jobs) return
    let alive = true
    void Promise.all(jobs.split('|').map(jobThumbs)).then((maps) => {
      if (alive) setLoaded(new Map(maps.flatMap((m) => [...m])))
    })
    return () => {
      alive = false
    }
  }, [jobs])
  return useMemo(() => (jobs && loaded.size ? new Map([...own, ...loaded]) : own), [jobs, loaded, own])
}

/** The PDF's photo reader for an example job's scans (by their own IDs), from its bundled photo folder. */
export function examplePhotoReader(job: string): PhotoReader | null {
  const p = exampleProject(job)
  return p ? browserPhotoReader(p, samplePhotoFolder(examplePhotoNames(job), EXAMPLE_JOBS[job].photos)) : null
}
