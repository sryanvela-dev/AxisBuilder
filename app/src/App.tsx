import { Suspense, lazy } from 'react'
import { AppStoreProvider } from './ui/AppStore.tsx'
import { useApp } from './ui/appContext.ts'
import { ErrorBoundary } from './ui/ErrorBoundary.tsx'
import { Notices } from './ui/Notices.tsx'
import { StartScreen } from './ui/StartScreen.tsx'

// The job screen (steps, preview, drawing engine, exports) loads on its own, so the start screen comes up quickly.
// The service worker keeps it for offline use like the rest of the build.
const JobScreen = lazy(() => import('./ui/JobScreen.tsx').then((m) => ({ default: m.JobScreen })))

function Root() {
  const app = useApp()
  if (app.state.job) {
    return (
      <Suspense fallback={<p className="muted loading-job">Opening the job...</p>}>
        <JobScreen />
      </Suspense>
    )
  }
  return (
    <>
      <Notices />
      <StartScreen />
    </>
  )
}

function App() {
  return (
    <AppStoreProvider>
      <ErrorBoundary where="AxisBuilder">
        <Root />
      </ErrorBoundary>
    </AppStoreProvider>
  )
}

export default App
