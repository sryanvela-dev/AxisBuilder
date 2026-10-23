// The job marker file written next to the processed images (Processed_Images\AXISBUILDER_JOB.txt).
// It says which job the images belong to, so the app never mixes two jobs in one folder and the CAD
// side (Phase 3f) can check it is loading the right job's images. Plain "KEY: value" lines, easy to
// read in AutoLISP.

export const MARKER_FILE = 'AXISBUILDER_JOB.txt'

export interface JobMarker {
  jobId: string
  jobName: string
}

export function markerText(marker: JobMarker, imageCount: number, madeAt: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const made = `${madeAt.getFullYear()}-${pad(madeAt.getMonth() + 1)}-${pad(madeAt.getDate())} ${pad(madeAt.getHours())}:${pad(madeAt.getMinutes())}`
  // One line each, no line breaks inside values (CAD reads it line by line).
  const clean = (s: string) => s.replace(/[\r\n]+/g, ' ').trim()
  return [
    'AXISBUILDER PROCESSED IMAGES',
    `JOB ID: ${clean(marker.jobId)}`,
    `JOB NAME: ${clean(marker.jobName)}`,
    `MADE: ${made}`,
    `IMAGES: ${imageCount}`,
    '',
  ].join('\r\n')
}

/** Reads a marker file; null if the text is not one. */
export function parseMarker(text: string): JobMarker | null {
  const lines = text.split(/\r?\n/)
  if (lines[0]?.trim() !== 'AXISBUILDER PROCESSED IMAGES') return null
  const value = (key: string) => lines.find((l) => l.startsWith(`${key}:`))?.slice(key.length + 1).trim() ?? ''
  const jobId = value('JOB ID')
  return jobId ? { jobId, jobName: value('JOB NAME') } : null
}
