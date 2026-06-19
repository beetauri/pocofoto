import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  createSentryRelease,
  getSentryBuildConfig
} from './sentryBuildConfig.mjs'

const viteSource = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')

test('creates one release name from package version and commit', () => {
  assert.equal(
    createSentryRelease('0.3.0', 'abc1234'),
    'pocofoto@0.3.0+abc1234'
  )
})

test('enables uploads only when every Sentry build variable exists', () => {
  assert.deepEqual(getSentryBuildConfig({
    SENTRY_AUTH_TOKEN: 'token',
    SENTRY_ORG: 'pocofoto',
    SENTRY_PROJECT: 'pocofoto-pwa'
  }), {
    enabled: true,
    authToken: 'token',
    org: 'pocofoto',
    project: 'pocofoto-pwa'
  })

  assert.deepEqual(getSentryBuildConfig({
    SENTRY_AUTH_TOKEN: 'token',
    SENTRY_ORG: 'pocofoto'
  }), {
    enabled: false,
    authToken: 'token',
    org: 'pocofoto',
    project: ''
  })
})

test('Vite gates private source-map upload and deletes uploaded maps', () => {
  assert.match(viteSource, /sentryVitePlugin/)
  assert.match(viteSource, /sourcemap:\s*sentryBuild\.enabled \? 'hidden' : false/)
  assert.match(viteSource, /filesToDeleteAfterUpload:\s*'\.\/dist\/\*\*\/\*\.map'/)
  assert.match(viteSource, /'import\.meta\.env\.VITE_SENTRY_RELEASE'/)
})
