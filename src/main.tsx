import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Self-hosted, precached by the service worker. A PWA used in a gym basement
// cannot depend on a font CDN. `wdth` carries both the weight and width axes,
// which the hero numerals need.
import '@fontsource-variable/archivo/wdth.css'
import '@fontsource/instrument-serif/400.css'

import './styles/app.css'

import { App } from './app/App'
import { bootstrapDatabase } from './db/seed'
import { platform } from './lib/platform'

const container = document.querySelector('#root')
if (!container) throw new Error('Root element missing from index.html')

async function start(root: Element) {
  // Seed before first paint so no screen renders an "empty library" state that
  // would only ever be visible for a few milliseconds.
  try {
    await bootstrapDatabase()
  } catch (error) {
    // IndexedDB can be unavailable entirely — private browsing, a locked-down
    // enterprise profile, a corrupt store. Render anyway: an app with an empty
    // library is recoverable and self-explanatory; a white screen is not.
    console.error('Gymmy could not prepare its database:', error)
  }

  // A request, not a guarantee — iOS evicts storage for uninstalled sites under
  // pressure. This is why export/import ships in M1 rather than at the end.
  void platform.storage.requestPersistence()

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void start(container)
