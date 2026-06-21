import { RefreshCw, Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { showSentryReport } from '../sentry'

export default function SentryErrorFallback({
  eventId,
  onReport = showSentryReport,
  onReload = () => window.location.reload()
}) {
  const { t } = useTranslation('errors')
  return (
    <main className="sentry-error-screen">
      <section className="sentry-error-card" role="alert">
        <img src="/pocoface-icon-1024.png" alt="" />
        <div>
          <p className="sentry-error-eyebrow">{t('fatal.eyebrow')}</p>
          <h1>{t('fatal.title')}</h1>
          <p>{t('fatal.body')}</p>
        </div>
        <div className="sentry-error-actions">
          <button className="btn-primary" type="button" onClick={onReload}>
            <RefreshCw aria-hidden="true" />
            {t('fatal.reload')}
          </button>
          <button className="btn-ghost" type="button" onClick={() => onReport(eventId)}>
            <Send aria-hidden="true" />
            {t('fatal.report')}
          </button>
        </div>
      </section>
    </main>
  )
}
