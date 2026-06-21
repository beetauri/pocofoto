import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import './i18n'
import App from './App.jsx'
import SentryErrorFallback from './components/SentryErrorFallback.jsx'
import {
  markPwaReloadPending,
  markPwaUpdateReady,
  setPwaUpdateServiceWorker
} from './pwaUpdates'
import {
  initializeSentry,
  SentryErrorBoundary
} from './sentry'

initializeSentry()

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
  <SentryErrorBoundary fallback={SentryErrorFallback}>
    <StrictMode>
      <App />
    </StrictMode>
  </SentryErrorBoundary>,
)
