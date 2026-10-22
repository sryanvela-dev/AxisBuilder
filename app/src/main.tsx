import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { reloadAfterUpdate } from './ui/reloadAfterUpdate.ts'

// After an update the old page may ask for a code file the new version replaced; reload to get the new one.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadAfterUpdate()) event.preventDefault()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
