import * as Sentry from '@sentry/react'

const dsn = 'https://37e76835c6905119d5eea9072c4518ea@o4511554579529728.ingest.de.sentry.io/4511591670218832'

export const replayPrivacyOptions = {
  maskAllText: false,
  maskAllInputs: false,
  blockAllMedia: false,
  mask: [],
  block: [],
  ignore: []
}

export function createSentryOptions({ isProduction, mode, release }) {
  return {
    dsn,
    environment: mode,
    release,
    dataCollection: {
      userInfo: true,
      cookies: true,
      httpHeaders: { request: true, response: true },
      httpBodies: [
        'incomingRequest',
        'outgoingRequest',
        'incomingResponse',
        'outgoingResponse'
      ],
      queryParams: true,
      genAI: { inputs: true, outputs: true },
      stackFrameVariables: true,
      frameContextLines: 10
    },
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(replayPrivacyOptions),
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

export function captureHandledException(error, context = {}, sentry = Sentry) {
  const {
    operation = 'unknown',
    ...extra
  } = context

  sentry.captureException(error, {
    tags: {
      operation,
      errorCode: error?.code || 'unknown'
    },
    extra
  })
}

export function recordPairRouteDecision(decision, sentry = Sentry) {
  const { reason, ...data } = decision
  sentry.addBreadcrumb({
    category: 'pair-route',
    level: 'info',
    message: reason,
    data
  })
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
