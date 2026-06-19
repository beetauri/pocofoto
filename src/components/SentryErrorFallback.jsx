import { RefreshCw, Send } from 'lucide-react'

import { showSentryReport } from '../sentry'

export default function SentryErrorFallback({
  eventId,
  onReport = showSentryReport,
  onReload = () => window.location.reload()
}) {
  return (
    <main className="sentry-error-screen">
      <section className="sentry-error-card" role="alert">
        <img src="/pocoface-icon-1024.png" alt="" />
        <div>
          <p className="sentry-error-eyebrow">Unexpected error</p>
          <h1>Pocofoto needs a quick restart</h1>
          <p>Your photos are safe. The error was sent to our team.</p>
        </div>
        <div className="sentry-error-actions">
          <button className="btn-primary" type="button" onClick={onReload}>
            <RefreshCw aria-hidden="true" />
            Reload Pocofoto
          </button>
          <button className="btn-ghost" type="button" onClick={() => onReport(eventId)}>
            <Send aria-hidden="true" />
            Report this problem
          </button>
        </div>
      </section>
    </main>
  )
}
