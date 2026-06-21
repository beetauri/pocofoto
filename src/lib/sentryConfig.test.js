import assert from 'node:assert/strict'
import test from 'node:test'

import {
  captureHandledException,
  createSentryOptions,
  replayPrivacyOptions,
  syncSentryUser
} from '../sentry.js'

test('disables all built-in Replay masking and blocking', () => {
  assert.deepEqual(replayPrivacyOptions, {
    maskAllText: false,
    maskAllInputs: false,
    blockAllMedia: false,
    mask: [],
    block: [],
    ignore: []
  })
})

test('uses balanced production sampling and complete integrations', () => {
  const options = createSentryOptions({
    isProduction: true,
    mode: 'production',
    release: 'pocofoto@0.3.0+abc1234'
  })

  assert.equal(options.environment, 'production')
  assert.equal(options.release, 'pocofoto@0.3.0+abc1234')
  assert.equal(options.tracesSampleRate, 0.2)
  assert.equal(options.profileSessionSampleRate, 0.1)
  assert.equal(options.profileLifecycle, 'trace')
  assert.equal(options.replaysSessionSampleRate, 0.1)
  assert.equal(options.replaysOnErrorSampleRate, 1.0)
  assert.equal(options.enableLogs, true)
  assert.deepEqual(options.dataCollection, {
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
  })

  const integrationNames = options.integrations.map((integration) => integration.name)
  for (const name of [
    'BrowserTracing',
    'Replay',
    'ConsoleLogs',
    'ExtraErrorData',
    'HttpClient',
    'BrowserProfiling'
  ]) {
    assert.ok(integrationNames.includes(name), `missing ${name}`)
  }
})

test('uses full tracing and profiling during development', () => {
  const options = createSentryOptions({
    isProduction: false,
    mode: 'development',
    release: 'pocofoto@0.3.0+dev'
  })

  assert.equal(options.tracesSampleRate, 1.0)
  assert.equal(options.profileSessionSampleRate, 1.0)
})

test('sets and clears complete Firebase user context', () => {
  const calls = []
  const sentry = { setUser: (user) => calls.push(user) }

  syncSentryUser({
    uid: 'firebase-user',
    email: 'person@example.com',
    displayName: 'Poco User'
  }, sentry)
  syncSentryUser(null, sentry)

  assert.deepEqual(calls, [
    {
      id: 'firebase-user',
      email: 'person@example.com',
      username: 'Poco User'
    },
    null
  ])
})

test('captures handled exceptions with scoped diagnostic context', () => {
  const calls = []
  const sentry = {
    captureException: (error, context) => calls.push({ error, context })
  }
  const error = Object.assign(new Error('Listener failed'), {
    code: 'permission-denied'
  })

  captureHandledException(error, {
    operation: 'user-route-listener',
    online: true,
    hasCachedCoupleId: false
  }, sentry)

  assert.deepEqual(calls, [{
    error,
    context: {
      tags: {
        operation: 'user-route-listener',
        errorCode: 'permission-denied'
      },
      extra: {
        online: true,
        hasCachedCoupleId: false
      }
    }
  }])
})
