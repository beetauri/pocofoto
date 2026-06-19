import * as Sentry from '@sentry/react'

const dsn = 'https://37e76835c6905119d5eea9072c4518ea@o4511554579529728.ingest.de.sentry.io/4511591670218832'

export function createSentryOptions({ isProduction, mode, release }) {
  return {
    dsn,
    environment: mode,
    release,
    dataCollection: {},
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
      Sentry.consoleLoggingIntegration({
        levels: ['debug', 'info', 'log', 'warn', 'error', 'trace', 'assert']
      }),
      Sentry.extraErrorDataIntegration({ depth: 5 }),
      Sentry.httpClientIntegration(),
      Sentry.browserProfilingIntegration()
    ],
    tracesSampleRate: isProduction ? 0.2 : 1.0,
    profileSessionSampleRate: isProduction ? 0.1 : 1.0,
    profileLifecycle: 'trace',
    tracePropagationTargets: [
      'localhost',
      '127.0.0.1',
      /^https:\/\/[^/]+\.cloudfunctions\.net\//
    ],
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    enableLogs: true
  }
}

export function initializeSentry() {
  Sentry.init(createSentryOptions({
    isProduction: import.meta.env.PROD,
    mode: import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE
  }))
}

export function syncSentryUser(firebaseUser, sentry = Sentry) {
  sentry.setUser(firebaseUser ? {
    id: firebaseUser.uid,
    email: firebaseUser.email || undefined,
    username: firebaseUser.displayName || undefined
  } : null)
}

export function showSentryReport(eventId) {
  Sentry.showReportDialog({
    eventId,
    title: 'Tell us what happened',
    subtitle: 'Pocofoto encountered an unexpected problem.',
    subtitle2: 'Your report is linked to the error our team received.',
    labelComments: 'What were you doing when this happened?',
    labelSubmit: 'Send report',
    successMessage: 'Your report was sent. Thank you.'
  })
}

export const SentryErrorBoundary = Sentry.ErrorBoundary
