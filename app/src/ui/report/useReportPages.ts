// The report as pages in the browser: its pictures read once each (size, phone orientation, upright thumbnail) and the
// page model built from the job and those sizes (report/pages buildReport), kept up to date as the job changes. The
// Pages view, the pages panel beside each step and "Make report PDF" all use the same document.

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { Project } from '../../data/schema.ts'
import type { LayerGroup } from '../../engine/drawing.ts'
import type { ImageRef, ReportDocument } from '../../report/pageModel.ts'
import { buildReport } from '../../report/pages/index.ts'
import { readPicture, readReportFile, refKey, reportImageRefs, type ReadPicture, type ReportFileSources } from './reportFiles.ts'

/** Where a source's files come from now (a new folder reads its pictures again). */
function sourceToken(src: ReportFileSources, ref: ImageRef): string {
  if (ref.source === 'photos') return `photos:${src.photos?.name ?? ''}:${src.photos?.names.length ?? 0}`
  if (ref.source === 'screenshots') return `shots:${src.screenshots?.name ?? ''}:${src.screenshots?.names.length ?? 0}`
  return ref.source
}

/** refKey -> picture (null = could not be read), read in the background. `retry` reads the missing ones again. */
export function useReportPictures(project: Project, src: ReportFileSources) {
  // What has been read (kept across renders for the reading loop), and the same as state for drawing.
  const cache = useRef(new Map<string, { token: string; pic: ReadPicture | null }>())
  const [pictures, setPictures] = useState<ReadonlyMap<string, ReadPicture | null>>(new Map())
  const [retries, setRetries] = useState(0)
  const refs = useMemo(() => (project.report ? reportImageRefs(project.report) : []), [project.report])

  useEffect(() => {
    let alive = true
    const known = cache.current
    void (async () => {
      for (const ref of refs) {
        const token = sourceToken(src, ref)
        const had = known.get(refKey(ref))
        if (had && had.token === token && (had.pic || retries === 0)) continue
        const file = await readReportFile(src, ref)
        const pic = file ? await readPicture(file).catch(() => null) : null
        if (!alive) {
          if (pic) URL.revokeObjectURL(pic.thumb)
          return
        }
        if (had?.pic) URL.revokeObjectURL(had.pic.thumb)
        known.set(refKey(ref), { token, pic })
        setPictures(new Map([...known].map(([k, v]) => [k, v.pic])))
      }
    })()
    return () => {
      alive = false
    }
  }, [refs, src, retries])

  useEffect(() => {
    const known = cache.current
    return () => known.forEach((x) => x.pic && URL.revokeObjectURL(x.pic.thumb))
  }, [])

  const retry = useCallback(() => setRetries((n) => n + 1), [])
  /** Pictures still being read. */
  const loading = refs.some((r) => !pictures.has(refKey(r)))
  return { pictures, retry, loading }
}

/** The page model of the job's report (null without a report), built from a slightly deferred copy of the job. */
export function useReportDocument(project: Project, pictures: ReadonlyMap<string, ReadPicture | null>, previewHidden: ReadonlySet<LayerGroup>): ReportDocument | null {
  const p = useDeferredValue(project)
  return useMemo(() => {
    if (!p.report) return null
    try {
      return buildReport({ project: p, image: (ref) => pictures.get(refKey(ref))?.info ?? null, previewHidden })
    } catch {
      return null
    }
  }, [p, pictures, previewHidden])
}
