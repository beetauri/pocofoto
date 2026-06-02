import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'

const PWA_RELOAD_GUARD_KEY = 'pocofoto:pwa-update-reloaded-at'
const PWA_RELOAD_GUARD_WINDOW_MS = 30 * 1000

registerSW({
  immediate: true,
  onNeedReload() {
    const lastReload = Number(window.sessionStorage.getItem(PWA_RELOAD_GUARD_KEY) || 0)
    if (Date.now() - lastReload < PWA_RELOAD_GUARD_WINDOW_MS) return

    window.sessionStorage.setItem(PWA_RELOAD_GUARD_KEY, String(Date.now()))
    window.location.reload()
  },
  onRegisterError(error) {
    console.error('PWA service worker registration failed', error)
  }
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
