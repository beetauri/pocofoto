import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'
import {
  markPwaReloadPending,
  markPwaUpdateReady,
  setPwaUpdateServiceWorker
} from './pwaUpdates'

Sentry.init({
  dsn: 'https://37e76835c6905119d5eea9072c4518ea@o4511554579529728.ingest.de.sentry.io/4511591670218832',
  dataCollection: {
    // Set userInfo to false and httpBodies to [] here to disable collecting them.
  },
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration()
  ],
  tracesSampleRate: 1.0,
  tracePropagationTargets: [
    'localhost',
    '127.0.0.1',
    /^https:\/\/[^/]+\.cloudfunctions\.net\//
  ],
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  enableLogs: true
})

const PWA_RELOAD_GUARD_KEY = 'pocofoto:pwa-update-reloaded-at'
const PWA_RELOAD_GUARD_WINDOW_MS = 30 * 1000
const PWA_UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000

let pwaRegistration = null

function reloadForPwaUpdate() {
  const lastReload = Number(window.sessionStorage.getItem(PWA_RELOAD_GUARD_KEY) || 0)
  if (Date.now() - lastReload < PWA_RELOAD_GUARD_WINDOW_MS) return

  markPwaReloadPending()
  window.sessionStorage.setItem(PWA_RELOAD_GUARD_KEY, String(Date.now()))
  window.location.reload()
}

function checkForPwaUpdate() {
  if (!pwaRegistration || document.visibilityState === 'hidden') return
  pwaRegistration.update().catch((error) => {
    console.debug('PWA update check skipped', error)
  })
}

const updateServiceWorker = registerSW({
  immediate: true,
  onNeedRefresh() {
    markPwaUpdateReady()
  },
  onNeedReload() {
    reloadForPwaUpdate()
  },
  onRegisteredSW(_swScriptUrl, registration) {
    pwaRegistration = registration || null
    checkForPwaUpdate()
  },
  onRegisterError(error) {
    console.error('PWA service worker registration failed', error)
  }
})

setPwaUpdateServiceWorker(updateServiceWorker)

window.addEventListener('focus', checkForPwaUpdate)
window.addEventListener('online', checkForPwaUpdate)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    checkForPwaUpdate()
  }
})
window.setInterval(checkForPwaUpdate, PWA_UPDATE_CHECK_INTERVAL_MS)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
