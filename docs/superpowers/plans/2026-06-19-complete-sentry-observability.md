# Complete Sentry Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Pocofoto's Sentry setup with balanced tracing and browser profiling, detailed logs and errors, authenticated user context, React crash feedback, release metadata, and private source-map uploads from Cloudflare Pages.

**Architecture:** `src/sentry.js` will own browser SDK configuration and expose narrow helpers for identity and feedback. A pure build helper will keep release naming and Sentry build-secret gating testable, while `vite.config.js` will upload hidden source maps only in credentialed production builds and delete them before deployment.

**Tech Stack:** React 19, Vite 8, Sentry JavaScript SDK 10.58, `@sentry/vite-plugin`, Firebase Authentication, Vitest, Node test runner, Cloudflare Pages

---

## File Map

- Create `src/sentry.js`: runtime SDK initialization, sampling, integrations, identity, and report-dialog helpers.
- Create `src/lib/sentryConfig.test.js`: runtime option and user-context unit tests.
- Create `src/components/SentryErrorFallback.jsx`: user-facing crash recovery and report actions.
- Create `src/components/SentryErrorFallback.test.jsx`: crash fallback interaction tests.
- Create `scripts/sentryBuildConfig.mjs`: pure release naming and build-secret validation.
- Create `scripts/sentryBuildConfig.test.js`: build configuration unit tests.
- Modify `src/main.jsx`: initialize Sentry and wrap the app in the root Error Boundary.
- Modify `src/App.jsx`: synchronize Firebase user state into Sentry.
- Modify `src/components/NotificationLifecycle.test.js`: assert Sentry identity follows auth lifecycle.
- Modify `src/index.css`: mobile-safe crash fallback styling.
- Modify `vite.config.js`: add release injection and conditional source-map upload.
- Modify `.env.example`: document non-public Sentry build variables.
- Modify `package.json` and `package-lock.json`: install `@sentry/vite-plugin` and include the new Node tests.

### Task 1: Add Testable Sentry Build Metadata

**Files:**
- Create: `scripts/sentryBuildConfig.mjs`
- Create: `scripts/sentryBuildConfig.test.js`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install the Vite plugin**

Run:

```bash
npm install --save-dev @sentry/vite-plugin
```

Expected: `@sentry/vite-plugin` appears in `devDependencies` and the lockfile changes only for its dependency graph.

- [ ] **Step 2: Write the failing build-config tests**

Create `scripts/sentryBuildConfig.test.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createSentryRelease,
  getSentryBuildConfig
} from './sentryBuildConfig.mjs'

test('creates one release name from package version and full commit', () => {
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
```

Update `test:unit` in `package.json` so the Node command starts with:

```json
"test:unit": "node --test scripts/*.test.js src/lib/*.test.js src/hooks/*.test.js src/components/*.test.js && vitest run src/components/*.test.jsx src/hooks/*.test.jsx"
```

- [ ] **Step 3: Run the test and verify RED**

Run:

```bash
node --test scripts/sentryBuildConfig.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/sentryBuildConfig.mjs`.

- [ ] **Step 4: Implement the pure build helper**

Create `scripts/sentryBuildConfig.mjs`:

```js
export function createSentryRelease(version, commit) {
  return `pocofoto@${version || '0.0.0'}+${commit || 'dev'}`
}

export function getSentryBuildConfig(env) {
  const authToken = env.SENTRY_AUTH_TOKEN || ''
  const org = env.SENTRY_ORG || ''
  const project = env.SENTRY_PROJECT || ''

  return {
    enabled: Boolean(authToken && org && project),
    authToken,
    org,
    project
  }
}
```

- [ ] **Step 5: Run the test and verify GREEN**

Run:

```bash
node --test scripts/sentryBuildConfig.test.js
```

Expected: 2 tests pass.

- [ ] **Step 6: Commit the build helper**

```bash
git add package.json package-lock.json scripts/sentryBuildConfig.mjs scripts/sentryBuildConfig.test.js
git commit -m "add sentry build metadata"
```

### Task 2: Centralize Runtime Sentry Configuration

**Files:**
- Create: `src/sentry.js`
- Create: `src/lib/sentryConfig.test.js`
- Modify: `src/main.jsx`

- [ ] **Step 1: Write failing runtime configuration tests**

Create `src/lib/sentryConfig.test.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createSentryOptions,
  syncSentryUser
} from '../sentry.js'

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
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
node --test src/lib/sentryConfig.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/sentry.js`.

- [ ] **Step 3: Implement `src/sentry.js`**

Create `src/sentry.js`:

```js
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
```

- [ ] **Step 4: Replace inline initialization in `src/main.jsx`**

Remove the direct `@sentry/react` import and inline `Sentry.init`. Add:

```js
import {
  initializeSentry,
  SentryErrorBoundary
} from './sentry'

initializeSentry()
```

Keep the Error Boundary import unused only until Task 4 wraps the root; Task 4 will complete that wiring before the full lint run.

- [ ] **Step 5: Run runtime tests and verify GREEN**

Run:

```bash
node --test src/lib/sentryConfig.test.js
```

Expected: 3 tests pass.

- [ ] **Step 6: Commit runtime configuration**

```bash
git add src/sentry.js src/lib/sentryConfig.test.js src/main.jsx
git commit -m "centralize sentry runtime config"
```

### Task 3: Synchronize Firebase Identity

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/NotificationLifecycle.test.js`

- [ ] **Step 1: Add a failing auth-lifecycle assertion**

Append to `src/components/NotificationLifecycle.test.js`:

```js
test('App synchronizes complete Firebase identity with Sentry', () => {
  assert.match(appSource, /import \{ syncSentryUser \} from '\.\/sentry';/)
  assert.match(
    appSource,
    /onAuthStateChanged\(auth, \(firebaseUser\) => \{[\s\S]*syncSentryUser\(firebaseUser\);[\s\S]*setUser\(firebaseUser\);/
  )
})
```

- [ ] **Step 2: Run the assertion and verify RED**

Run:

```bash
node --test src/components/NotificationLifecycle.test.js
```

Expected: FAIL because `syncSentryUser` is not imported or called.

- [ ] **Step 3: Wire the auth observer**

In `src/App.jsx`, add:

```js
import { syncSentryUser } from './sentry';
```

Update the auth callback:

```js
const unsub = onAuthStateChanged(auth, (firebaseUser) => {
  syncSentryUser(firebaseUser);
  setUser(firebaseUser);
  if (!firebaseUser) {
    // existing signed-out behavior remains unchanged
  }
});
```

- [ ] **Step 4: Run identity tests and verify GREEN**

Run:

```bash
node --test src/lib/sentryConfig.test.js src/components/NotificationLifecycle.test.js
```

Expected: all selected tests pass.

- [ ] **Step 5: Commit user identity wiring**

```bash
git add src/App.jsx src/components/NotificationLifecycle.test.js
git commit -m "attach firebase users to sentry"
```

### Task 4: Add React Crash Recovery And Feedback

**Files:**
- Create: `src/components/SentryErrorFallback.jsx`
- Create: `src/components/SentryErrorFallback.test.jsx`
- Modify: `src/main.jsx`
- Modify: `src/index.css`

- [ ] **Step 1: Write failing fallback interaction tests**

Create `src/components/SentryErrorFallback.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import SentryErrorFallback from './SentryErrorFallback'

describe('SentryErrorFallback', () => {
  it('reports the exact captured event', async () => {
    const user = userEvent.setup()
    const onReport = vi.fn()

    render(
      <SentryErrorFallback
        eventId="event-123"
        onReport={onReport}
        onReload={() => {}}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Report this problem' }))
    expect(onReport).toHaveBeenCalledWith('event-123')
  })

  it('offers a reload recovery action', async () => {
    const user = userEvent.setup()
    const onReload = vi.fn()

    render(
      <SentryErrorFallback
        eventId="event-123"
        onReport={() => {}}
        onReload={onReload}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Reload Pocofoto' }))
    expect(onReload).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run the component test and verify RED**

Run:

```bash
npx vitest run src/components/SentryErrorFallback.test.jsx
```

Expected: FAIL because `SentryErrorFallback.jsx` does not exist.

- [ ] **Step 3: Implement the fallback component**

Create `src/components/SentryErrorFallback.jsx`:

```jsx
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
```

- [ ] **Step 4: Wrap the root application**

In `src/main.jsx`, import the fallback and render:

```jsx
import SentryErrorFallback from './components/SentryErrorFallback.jsx'

createRoot(document.getElementById('root')).render(
  <SentryErrorBoundary fallback={SentryErrorFallback}>
    <StrictMode>
      <App />
    </StrictMode>
  </SentryErrorBoundary>,
)
```

- [ ] **Step 5: Add mobile-safe fallback styling**

Append to `src/index.css`:

```css
.sentry-error-screen {
  display: grid;
  min-height: 100dvh;
  padding: max(24px, env(safe-area-inset-top)) 20px max(24px, env(safe-area-inset-bottom));
  place-items: center;
  background: var(--bg-primary);
}

.sentry-error-card {
  display: grid;
  width: min(100%, 400px);
  gap: 22px;
  padding: 28px;
  border: 1px solid var(--glass-border);
  border-radius: 28px;
  background: var(--bg-card);
  box-shadow: 0 26px 80px rgba(0, 0, 0, 0.48);
}

.sentry-error-card > img {
  width: 64px;
  height: 64px;
  border-radius: 18px;
}

.sentry-error-eyebrow {
  color: var(--danger);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.sentry-error-card h1 {
  margin-top: 6px;
  color: var(--text-primary);
  font-size: 26px;
  line-height: 1.08;
}

.sentry-error-card h1 + p {
  margin-top: 10px;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.5;
}

.sentry-error-actions {
  display: grid;
  gap: 10px;
}

.sentry-error-actions button {
  display: inline-flex;
  min-height: 48px;
  align-items: center;
  justify-content: center;
  gap: 9px;
}

.sentry-error-actions svg {
  width: 18px;
  height: 18px;
}
```

- [ ] **Step 6: Run the fallback tests and verify GREEN**

Run:

```bash
npx vitest run src/components/SentryErrorFallback.test.jsx
```

Expected: 2 tests pass.

- [ ] **Step 7: Commit crash recovery**

```bash
git add src/components/SentryErrorFallback.jsx src/components/SentryErrorFallback.test.jsx src/main.jsx src/index.css
git commit -m "add sentry crash recovery"
```

### Task 5: Configure Vite Source Maps And Release Injection

**Files:**
- Modify: `vite.config.js`
- Modify: `.env.example`
- Modify: `scripts/sentryBuildConfig.test.js`

- [ ] **Step 1: Add failing release and source-map configuration assertions**

Append to `scripts/sentryBuildConfig.test.js`:

```js
import { readFileSync } from 'node:fs'

const viteSource = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')

test('Vite gates private source-map upload and deletes uploaded maps', () => {
  assert.match(viteSource, /sentryVitePlugin/)
  assert.match(viteSource, /sourcemap:\s*sentryBuild\.enabled \? 'hidden' : false/)
  assert.match(viteSource, /filesToDeleteAfterUpload:\s*'\.\/dist\/\*\*\/\*\.map'/)
  assert.match(viteSource, /'import\.meta\.env\.VITE_SENTRY_RELEASE'/)
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node --test scripts/sentryBuildConfig.test.js
```

Expected: FAIL because `vite.config.js` does not contain the Sentry Vite plugin configuration.

- [ ] **Step 3: Configure `vite.config.js`**

Add imports:

```js
import { sentryVitePlugin } from '@sentry/vite-plugin'
import {
  createSentryRelease,
  getSentryBuildConfig
} from './scripts/sentryBuildConfig.mjs'
```

After `buildCommit`, add:

```js
const sentryRelease = createSentryRelease(buildVersion, buildCommit)
const sentryBuild = getSentryBuildConfig(process.env)
```

Add runtime release injection under `define`:

```js
'import.meta.env.VITE_SENTRY_RELEASE': JSON.stringify(sentryRelease)
```

Set the build source-map option:

```js
build: {
  sourcemap: sentryBuild.enabled ? 'hidden' : false,
  // existing rollupOptions remain unchanged
}
```

Append this conditional plugin after `VitePWA(...)`:

```js
sentryBuild.enabled && sentryVitePlugin({
  authToken: sentryBuild.authToken,
  org: sentryBuild.org,
  project: sentryBuild.project,
  release: {
    name: sentryRelease
  },
  sourcemaps: {
    filesToDeleteAfterUpload: './dist/**/*.map'
  }
})
```

Finish the plugin array with `.filter(Boolean)`.

- [ ] **Step 4: Document Cloudflare-only build variables**

Append to `.env.example`:

```dotenv
# Build-only Sentry credentials for production CI. Never prefix these with VITE_.
SENTRY_AUTH_TOKEN=sntrys_your_ci_token
SENTRY_ORG=your-sentry-org-slug
SENTRY_PROJECT=pocofoto-pwa
```

- [ ] **Step 5: Run build-config tests and verify GREEN**

Run:

```bash
node --test scripts/sentryBuildConfig.test.js
```

Expected: all build-config tests pass.

- [ ] **Step 6: Verify a credential-free local build**

Run:

```bash
env -u SENTRY_AUTH_TOKEN -u SENTRY_ORG -u SENTRY_PROJECT npm run build
find dist -name '*.map' -print
```

Expected: build succeeds and `find` prints nothing.

- [ ] **Step 7: Commit source-map automation**

```bash
git add vite.config.js .env.example scripts/sentryBuildConfig.test.js
git commit -m "upload sentry source maps"
```

### Task 6: Full Verification And Production Handoff

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run the complete unit suite**

Run:

```bash
npm run test:unit
```

Expected: all Node and Vitest tests pass.

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected: ESLint exits with no errors.

- [ ] **Step 3: Run the production build**

Run:

```bash
npm run build
```

Expected: Vite and PWA generation complete successfully; the existing large-chunk warning may remain.

- [ ] **Step 4: Review release metadata and diff**

Run:

```bash
git diff --check
git status --short
git log --oneline main..HEAD
```

Expected: no whitespace errors, only intentional files are changed, and all implementation commits are present after the approved spec commit.

- [ ] **Step 5: Push and deploy only when explicitly requested**

Use the Pocofoto live-release workflow: push the verified feature branch, land it on `main`, push `main`, and wait for Cloudflare Pages CI/CD. Do not use Wrangler or a `production` branch.

- [ ] **Step 6: Verify the credentialed deployment**

For the deployed release commit:

```bash
gh api repos/beetauri/pocofoto/commits/<DEPLOYED_SHA>/check-runs \
  --jq '.check_runs[] | select(.name == "Cloudflare Pages") | {status, conclusion, details_url, title: .output.title}'
```

Expected: Cloudflare Pages reports `completed` and `success`. Review its build log for the Sentry upload success message, then confirm the same release and artifact bundle in Sentry when the browser ad blocker permits the settings page to load.
