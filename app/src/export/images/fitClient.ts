// Talks to the fit worker: one photo at a time, as a promise.

import type { FitResult } from './process.ts'
import type { FitRequest, FitResponse } from './fitWorker.ts'

export interface Fitter {
  fit: (photo: Blob, scanW: number, scanH: number, maxSide: number) => Promise<FitResult>
  close: () => void
}

export function createFitter(): Fitter {
  const worker = new Worker(new URL('./fitWorker.ts', import.meta.url), { type: 'module' })
  const waiting = new Map<number, { resolve: (r: FitResult) => void; reject: (e: Error) => void }>()
  let next = 1
  worker.onmessage = (e: MessageEvent<FitResponse>) => {
    const w = waiting.get(e.data.id)
    if (!w) return
    waiting.delete(e.data.id)
    if (e.data.ok) w.resolve({ blob: e.data.blob, width: e.data.width, height: e.data.height, capped: e.data.capped })
    else w.reject(new Error(e.data.error))
  }
  worker.onerror = (e) => {
    for (const w of waiting.values()) w.reject(new Error(e.message || 'the image worker stopped'))
    waiting.clear()
  }
  return {
    fit: (photo, scanW, scanH, maxSide) =>
      new Promise((resolve, reject) => {
        const id = next++
        waiting.set(id, { resolve, reject })
        const req: FitRequest = { id, photo, scanW, scanH, maxSide }
        worker.postMessage(req)
      }),
    close: () => worker.terminate(),
  }
}
