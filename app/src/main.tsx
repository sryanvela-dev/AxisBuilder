import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { registerSW } from 'virtual:pwa-register'
import App from './App.tsx'
import { reloadAfterUpdate } from './ui/reloadAfterUpdate.ts'

// Offline support. With autoUpdate, a new version installs in the background and the page reloads
// once onto it as soon as it takes over, so the user never stays on the old build.
registerSW({ immediate: true })

// After an update the old page may ask for a code file the new version replaced; reload to get the new one.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadAfterUpdate()) event.preventDefault()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
