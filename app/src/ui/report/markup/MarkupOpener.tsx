// Opens the full-size markup window when another screen asks (openMarkup), e.g. Review's Go to on a picture whose
// live label lost its row. Lives once in the report workspace.

import { useEffect, useState } from 'react'
import { MARKUP_ENABLED } from '../../../featureFlags.ts'
import type { ImagePlace } from '../../../report/imageItems.ts'
import { useApp } from '../../appContext.ts'
import { MarkupWindow } from './MarkupWindow.tsx'
import { markupEvents, markupTargetFor } from './targets.ts'

export function MarkupOpener() {
  const app = useApp()
  const [at, setAt] = useState<ImagePlace | null>(null)
  useEffect(() => {
    const on = (e: Event) => setAt((e as CustomEvent<ImagePlace>).detail)
    markupEvents.addEventListener('open', on)
    return () => markupEvents.removeEventListener('open', on)
  }, [])
  const report = app.state.job?.history.present.report
  const target = at && report && MARKUP_ENABLED ? markupTargetFor(report, at) : null
  if (!target) return null
  return <MarkupWindow target={target} onClose={() => setAt(null)} />
}
