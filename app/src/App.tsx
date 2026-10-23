import { AppStoreProvider } from './ui/AppStore.tsx'
import { useApp } from './ui/appContext.ts'
import { ErrorBoundary } from './ui/ErrorBoundary.tsx'
import { JobScreen, Notices } from './ui/JobScreen.tsx'
import { StartScreen } from './ui/StartScreen.tsx'

function Root() {
  const app = useApp()
  if (app.state.job) return <JobScreen />
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
