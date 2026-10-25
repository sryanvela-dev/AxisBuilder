// "Go to" for an issue on the Review and Export steps: its step, then the field or row of its check.

import type { Issue } from '../state/steps.ts'
import { useApp } from './appContext.ts'
import { jumpTo } from './placeIds.ts'

export function useGoToIssue() {
  const app = useApp()
  return (issue: Issue) => {
    app.goToStep(issue.step)
    const place = issue.check?.place
    // After the step page has rendered.
    if (place) window.setTimeout(() => jumpTo(place), 60)
  }
}
