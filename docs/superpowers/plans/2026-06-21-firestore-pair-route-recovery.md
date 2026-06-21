# Firestore Pair Route Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover the affected paired user once and permanently prevent cache-only Firestore state or listener errors from routing known paired users to Pairing.

**Architecture:** A startup recovery helper clears Firestore persistence once for the SHA-256-matched affected user before Firestore starts. A separate pure route-decision module interprets snapshot metadata so only server-confirmed null state can downgrade a pairing; `App.jsx` applies decisions and records Sentry breadcrumbs.

**Tech Stack:** React 19, Firebase JavaScript SDK 12.13, Cloud Firestore persistent local cache, Sentry React SDK 10.58, Node test runner, Vite 8, Cloudflare Pages

---

## File Map

- Create `src/lib/firestoreRecovery.js`: one-time targeted Firestore persistence recovery.
- Create `src/lib/firestoreRecovery.test.js`: recovery eligibility, success, repeat, and failure tests.
- Create `src/lib/pairRouteState.js`: pure metadata-aware route decisions.
- Create `src/lib/pairRouteState.test.js`: complete route decision matrix.
- Modify `src/firebase.js`: wait for restored Auth and run recovery before Firestore use.
- Modify `src/App.jsx`: apply decisions from cache/server snapshots and listener errors.
- Modify `src/sentry.js`: record non-sensitive route-decision breadcrumbs.
- Modify `src/lib/firebasePersistence.test.js`: verify recovery startup ordering.
- Modify `src/components/AppOfflineRouting.test.js`: verify metadata-aware listener integration.
- Modify `src/lib/sentryConfig.test.js`: verify breadcrumb structure.
- Modify `package.json` and `package-lock.json`: bump the release to `0.3.3`.

### Task 1: Add The Pure Pair Route Decision Policy

**Files:**
- Create: `src/lib/pairRouteState.js`
- Create: `src/lib/pairRouteState.test.js`

- [ ] **Step 1: Write the failing decision-matrix tests**

Create `src/lib/pairRouteState.test.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  decidePairListenerError,
  decidePairSnapshot
} from './pairRouteState.js'

test('accepts and persists a couple id from cache or server', () => {
  for (const fromCache of [true, false]) {
    assert.deepEqual(decidePairSnapshot({
      snapshotExists: true,
      snapshotCoupleId: 'couple-a',
      fromCache,
      currentCoupleId: null,
      cachedCoupleId: null
    }), {
      state: 'paired',
      coupleId: 'couple-a',
      persist: true,
      reason: fromCache ? 'cache-paired' : 'server-paired'
    })
  }
})

test('cache-only null cannot downgrade a known pairing', () => {
  assert.deepEqual(decidePairSnapshot({
    snapshotExists: true,
    snapshotCoupleId: null,
    fromCache: true,
    currentCoupleId: null,
    cachedCoupleId: 'couple-a'
  }), {
    state: 'paired',
    coupleId: 'couple-a',
    persist: false,
    reason: 'ignored-cache-unpaired'
  })
})

test('cache-only null without a known pairing remains unknown', () => {
  assert.deepEqual(decidePairSnapshot({
    snapshotExists: false,
    snapshotCoupleId: null,
    fromCache: true,
    currentCoupleId: null,
    cachedCoupleId: null
  }), {
    state: 'unknown',
    coupleId: null,
    persist: false,
    reason: 'cache-unpaired-unconfirmed'
  })
})

test('server-confirmed null is authoritative', () => {
  assert.deepEqual(decidePairSnapshot({
    snapshotExists: true,
    snapshotCoupleId: null,
    fromCache: false,
    currentCoupleId: 'couple-a',
    cachedCoupleId: 'couple-a'
  }), {
    state: 'unpaired',
    coupleId: null,
    persist: true,
    reason: 'server-unpaired'
  })
})

test('listener errors preserve known pairings and otherwise remain unknown', () => {
  assert.deepEqual(decidePairListenerError({
    currentCoupleId: null,
    cachedCoupleId: 'couple-a'
  }), {
    state: 'paired',
    coupleId: 'couple-a',
    persist: false,
    reason: 'listener-error-preserved-pairing'
  })

  assert.deepEqual(decidePairListenerError({
    currentCoupleId: null,
    cachedCoupleId: null
  }), {
    state: 'unknown',
    coupleId: null,
    persist: false,
    reason: 'listener-error-unknown'
  })
})
```

- [ ] **Step 2: Run the route tests and verify RED**

Run:

```bash
node --test src/lib/pairRouteState.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `pairRouteState.js`.

- [ ] **Step 3: Implement the minimal route policy**

Create `src/lib/pairRouteState.js`:

```js
function knownCoupleId(currentCoupleId, cachedCoupleId) {
  return currentCoupleId || cachedCoupleId || null
}

export function decidePairSnapshot({
  snapshotExists,
  snapshotCoupleId,
  fromCache,
  currentCoupleId,
  cachedCoupleId
}) {
  if (snapshotCoupleId) {
    return {
      state: 'paired',
      coupleId: snapshotCoupleId,
      persist: true,
      reason: fromCache ? 'cache-paired' : 'server-paired'
    }
  }

  const knownId = knownCoupleId(currentCoupleId, cachedCoupleId)
  if (fromCache) {
    if (knownId) {
      return {
        state: 'paired',
        coupleId: knownId,
        persist: false,
        reason: 'ignored-cache-unpaired'
      }
    }
    return {
      state: 'unknown',
      coupleId: null,
      persist: false,
      reason: 'cache-unpaired-unconfirmed'
    }
  }

  return {
    state: 'unpaired',
    coupleId: null,
    persist: true,
    reason: snapshotExists ? 'server-unpaired' : 'server-user-missing'
  }
}

export function decidePairListenerError({ currentCoupleId, cachedCoupleId }) {
  const knownId = knownCoupleId(currentCoupleId, cachedCoupleId)
  if (knownId) {
    return {
      state: 'paired',
      coupleId: knownId,
      persist: false,
      reason: 'listener-error-preserved-pairing'
    }
  }
  return {
    state: 'unknown',
    coupleId: null,
    persist: false,
    reason: 'listener-error-unknown'
  }
}
```

- [ ] **Step 4: Run the route tests and verify GREEN**

Run:

```bash
node --test src/lib/pairRouteState.test.js
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit the route policy**

```bash
git add src/lib/pairRouteState.js src/lib/pairRouteState.test.js
git commit -m "add authoritative pair route policy"
```

### Task 2: Add The One-Time Firestore Recovery Helper

**Files:**
- Create: `src/lib/firestoreRecovery.js`
- Create: `src/lib/firestoreRecovery.test.js`

- [ ] **Step 1: Write failing recovery tests**

Create `src/lib/firestoreRecovery.test.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  FIRESTORE_RECOVERY_EPOCH_KEY,
  runFirestoreRecovery
} from './firestoreRecovery.js'

function createStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  }
}

test('does not clear persistence for a non-target user', async () => {
  let clears = 0
  const result = await runFirestoreRecovery({
    db: {},
    userId: 'other-user',
    storage: createStorage(),
    digestUserId: async () => 'not-target',
    clearPersistence: async () => { clears += 1 }
  })
  assert.deepEqual(result, { status: 'not-targeted' })
  assert.equal(clears, 0)
})

test('clears the target once and records completion', async () => {
  const storage = createStorage()
  let clears = 0
  const options = {
    db: {},
    userId: 'target-user',
    storage,
    digestUserId: async () => 'e83bfb2a4c7fee83e80ede04fa70edbaa69829e97ba1a0ee0b159afa06dbae39',
    clearPersistence: async () => { clears += 1 }
  }

  assert.deepEqual(await runFirestoreRecovery(options), { status: 'cleared' })
  assert.equal(storage.getItem(FIRESTORE_RECOVERY_EPOCH_KEY), 'completed')
  assert.deepEqual(await runFirestoreRecovery(options), { status: 'already-completed' })
  assert.equal(clears, 1)
})

test('failed clearing leaves the epoch incomplete for retry', async () => {
  const storage = createStorage()
  const error = Object.assign(new Error('Other tab active'), {
    code: 'failed-precondition'
  })
  const result = await runFirestoreRecovery({
    db: {},
    userId: 'target-user',
    storage,
    digestUserId: async () => 'e83bfb2a4c7fee83e80ede04fa70edbaa69829e97ba1a0ee0b159afa06dbae39',
    clearPersistence: async () => { throw error }
  })

  assert.deepEqual(result, { status: 'failed', error })
  assert.equal(storage.getItem(FIRESTORE_RECOVERY_EPOCH_KEY), null)
})
```

- [ ] **Step 2: Run the recovery tests and verify RED**

Run:

```bash
node --test src/lib/firestoreRecovery.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `firestoreRecovery.js`.

- [ ] **Step 3: Implement the recovery helper**

Create `src/lib/firestoreRecovery.js`:

```js
const TARGET_USER_DIGEST = 'e83bfb2a4c7fee83e80ede04fa70edbaa69829e97ba1a0ee0b159afa06dbae39'

export const FIRESTORE_RECOVERY_EPOCH_KEY = 'pocofoto:firestore-recovery:pair-route-v1'

export async function digestUserId(userId) {
  const bytes = new TextEncoder().encode(userId)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function runFirestoreRecovery({
  db,
  userId,
  storage = globalThis.localStorage,
  digestUserId: createDigest = digestUserId,
  clearPersistence
}) {
  if (!userId) return { status: 'not-targeted' }
  if (storage?.getItem(FIRESTORE_RECOVERY_EPOCH_KEY) === 'completed') {
    return { status: 'already-completed' }
  }
  if (await createDigest(userId) !== TARGET_USER_DIGEST) {
    return { status: 'not-targeted' }
  }

  try {
    await clearPersistence(db)
    storage?.setItem(FIRESTORE_RECOVERY_EPOCH_KEY, 'completed')
    return { status: 'cleared' }
  } catch (error) {
    return { status: 'failed', error }
  }
}
```

- [ ] **Step 4: Run the recovery tests and verify GREEN**

Run:

```bash
node --test src/lib/firestoreRecovery.test.js
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit the recovery helper**

```bash
git add src/lib/firestoreRecovery.js src/lib/firestoreRecovery.test.js
git commit -m "add one-time firestore recovery"
```

### Task 3: Run Recovery Before Firestore Starts

**Files:**
- Modify: `src/firebase.js`
- Modify: `src/lib/firebasePersistence.test.js`

- [ ] **Step 1: Add a failing startup-order test**

Append to `src/lib/firebasePersistence.test.js`:

```js
test('Firestore recovery runs after auth restoration and before Firestore exports', () => {
  assert.match(firebaseSource, /await auth\.authStateReady\(\)/)
  assert.match(firebaseSource, /clearIndexedDbPersistence/)
  assert.match(firebaseSource, /runFirestoreRecovery/)

  const authReady = firebaseSource.indexOf('await auth.authStateReady()')
  const recovery = firebaseSource.indexOf('await runFirestoreRecovery')
  const storage = firebaseSource.indexOf('const storage = getStorage(app)')
  assert.ok(authReady >= 0 && recovery > authReady)
  assert.ok(storage > recovery)
})
```

- [ ] **Step 2: Run the startup test and verify RED**

Run:

```bash
node --test src/lib/firebasePersistence.test.js
```

Expected: FAIL because Auth readiness and recovery are not wired.

- [ ] **Step 3: Wire recovery into `src/firebase.js`**

Add `clearIndexedDbPersistence` to the `firebase/firestore` imports and import the helper:

```js
import {
  clearIndexedDbPersistence,
  // existing Firestore imports
} from 'firebase/firestore'
import { runFirestoreRecovery } from './lib/firestoreRecovery'
```

Immediately after `const auth = getAuth(app)`, restore Auth before constructing consumers:

```js
await auth.authStateReady()
```

After the existing `initializeFirestore`/`getFirestore` block and before Storage, Functions, emulator connection, or any Firestore operation, run:

```js
const firestoreRecovery = USE_FIREBASE_EMULATORS
  ? { status: 'not-targeted' }
  : await runFirestoreRecovery({
      db,
      userId: auth.currentUser?.uid || null,
      clearPersistence: clearIndexedDbPersistence
    })

if (firestoreRecovery.status === 'failed') {
  console.warn('Firestore persistence recovery deferred.', {
    code: firestoreRecovery.error?.code || 'unknown'
  })
}
```

Export `firestoreRecovery` with the existing Firebase exports so runtime diagnostics can report its status without rerunning it.

- [ ] **Step 4: Run recovery and startup tests**

Run:

```bash
node --test src/lib/firestoreRecovery.test.js src/lib/firebasePersistence.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit startup recovery**

```bash
git add src/firebase.js src/lib/firebasePersistence.test.js
git commit -m "run firestore recovery at startup"
```

### Task 4: Apply Metadata-Aware Routing In App

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/AppOfflineRouting.test.js`

- [ ] **Step 1: Replace brittle route assertions with failing behavior-wiring assertions**

Update `src/components/AppOfflineRouting.test.js` to retain the existing route-cache and Offline Hold assertions, then add:

```js
test('App requests metadata changes and delegates pair snapshot decisions', () => {
  assert.match(appSource, /includeMetadataChanges: true/)
  assert.match(appSource, /decidePairSnapshot\(\{/)
  assert.match(appSource, /fromCache: snap\.metadata\.fromCache/)
  assert.match(appSource, /decidePairListenerError\(\{/)
})

test('App clears route storage only for authoritative unpaired decisions', () => {
  assert.match(appSource, /decision\.state === 'unpaired'/)
  assert.match(appSource, /if \(decision\.persist\)/)
  assert.doesNotMatch(appSource, /else if \(connectionStatus\.isOnline\)[\s\S]*clearCachedUserRoute/)
})
```

- [ ] **Step 2: Run the App routing tests and verify RED**

Run:

```bash
node --test src/components/AppOfflineRouting.test.js
```

Expected: FAIL because `App.jsx` does not request metadata changes or use the decision helper.

- [ ] **Step 3: Add one decision applicator inside the pairing effect**

Import the route helpers:

```js
import {
  decidePairListenerError,
  decidePairSnapshot
} from './lib/pairRouteState'
```

Inside the pairing `useEffect`, add:

```js
const applyPairDecision = (decision) => {
  coupleIdRef.current = decision.coupleId
  setCoupleId(decision.coupleId)
  setPairStateKnown(decision.state !== 'unknown')
  setCheckingPair(false)
  setLoading(false)

  if (!decision.persist) return
  if (decision.state === 'unpaired') {
    clearCachedUserRoute(user.uid)
  } else {
    setCachedUserRoute(user.uid, { coupleId: decision.coupleId })
  }
}
```

Replace the listener with the metadata-aware overload:

```js
const userRef = doc(db, 'users', user.uid)
const unsub = onSnapshot(userRef, { includeMetadataChanges: true }, (snap) => {
  const decision = decidePairSnapshot({
    snapshotExists: snap.exists(),
    snapshotCoupleId: snap.exists() ? (snap.data().coupleId || null) : null,
    fromCache: snap.metadata.fromCache,
    currentCoupleId: coupleId,
    cachedCoupleId: cachedRoute?.coupleId || null
  })
  applyPairDecision(decision)
}, (error) => {
  captureHandledException(error, {
    operation: 'user-route-listener',
    online: connectionStatus.isOnline,
    hasCachedCoupleId: Boolean(cachedRoute?.coupleId),
    authUserMatches: auth.currentUser?.uid === user.uid
  })
  applyPairDecision(decidePairListenerError({
    currentCoupleId: coupleId,
    cachedCoupleId: cachedRoute?.coupleId || null
  }))
})
```

Add `coupleId` to the pairing effect dependency list. To avoid recreating the listener after every authoritative decision, hold the current ID in a ref if the dependency causes repeated subscriptions during the RED/GREEN run:

```js
const coupleIdRef = useRef(coupleId)
useEffect(() => {
  coupleIdRef.current = coupleId
}, [coupleId])
```

Then pass `coupleIdRef.current` to both decision helpers and keep the listener dependencies as `[user, connectionStatus.isOnline]`. Updating the ref inside `applyPairDecision` ensures back-to-back cache and server callbacks observe the latest decision before React commits the state update.

- [ ] **Step 4: Run route unit and integration tests**

Run:

```bash
node --test src/lib/pairRouteState.test.js src/components/AppOfflineRouting.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit metadata-aware routing**

```bash
git add src/App.jsx src/components/AppOfflineRouting.test.js
git commit -m "require server-confirmed pairing removal"
```

### Task 5: Add Recovery And Route Diagnostics

**Files:**
- Modify: `src/sentry.js`
- Modify: `src/lib/sentryConfig.test.js`
- Modify: `src/App.jsx`

- [ ] **Step 1: Write the failing breadcrumb helper test**

Append to `src/lib/sentryConfig.test.js`:

```js
test('records non-sensitive pair route breadcrumbs', () => {
  const calls = []
  const sentry = { addBreadcrumb: (breadcrumb) => calls.push(breadcrumb) }

  recordPairRouteDecision({
    reason: 'ignored-cache-unpaired',
    fromCache: true,
    hasSnapshotCoupleId: false,
    hadKnownCoupleId: true,
    state: 'paired'
  }, sentry)

  assert.deepEqual(calls, [{
    category: 'pair-route',
    level: 'info',
    message: 'ignored-cache-unpaired',
    data: {
      fromCache: true,
      hasSnapshotCoupleId: false,
      hadKnownCoupleId: true,
      state: 'paired'
    }
  }])
})
```

Add `recordPairRouteDecision` to the test import from `../sentry.js`.

- [ ] **Step 2: Run the Sentry test and verify RED**

Run:

```bash
node --test src/lib/sentryConfig.test.js
```

Expected: FAIL because `recordPairRouteDecision` is not exported.

- [ ] **Step 3: Implement the breadcrumb helper**

Add to `src/sentry.js`:

```js
export function recordPairRouteDecision(decision, sentry = Sentry) {
  const { reason, ...data } = decision
  sentry.addBreadcrumb({
    category: 'pair-route',
    level: 'info',
    message: reason,
    data
  })
}
```

- [ ] **Step 4: Record every snapshot and listener-error decision**

Import `recordPairRouteDecision` in `src/App.jsx`. Before applying each snapshot decision, call:

```js
recordPairRouteDecision({
  reason: decision.reason,
  fromCache: snap.metadata.fromCache,
  hasSnapshotCoupleId: Boolean(snapshotCoupleId),
  hadKnownCoupleId: Boolean(coupleIdRef.current || cachedRoute?.coupleId),
  state: decision.state
})
```

For the listener error decision, use `fromCache: null` and `hasSnapshotCoupleId: false`. Do not include raw UID or `coupleId` values.

Report the exported `firestoreRecovery.status` once after Sentry initializes by adding a breadcrumb from `App.jsx` during its existing startup effect:

```js
recordPairRouteDecision({
  reason: `firestore-recovery-${firestoreRecovery.status}`,
  fromCache: null,
  hasSnapshotCoupleId: false,
  hadKnownCoupleId: false,
  state: 'startup'
})
```

- [ ] **Step 5: Run focused diagnostics tests**

Run:

```bash
node --test src/lib/sentryConfig.test.js src/components/AppOfflineRouting.test.js
```

Expected: all tests pass.

- [ ] **Step 6: Commit diagnostics**

```bash
git add src/sentry.js src/lib/sentryConfig.test.js src/App.jsx
git commit -m "trace firestore route decisions"
```

### Task 6: Bump Release And Run Full Verification

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Bump the release version**

Run:

```bash
npm version patch --no-git-tag-version
```

Expected: both package files move from `0.3.2` to `0.3.3`.

- [ ] **Step 2: Run the complete unit suite**

Run:

```bash
npm run test:unit
```

Expected: all Node and Vitest tests pass with zero failures.

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: ESLint exits 0 with no errors.

- [ ] **Step 4: Build the production PWA**

Run:

```bash
npm run build
```

Expected: Vite and `vite-plugin-pwa` exit 0 and generate `dist/sw.js`.

- [ ] **Step 5: Review the release diff**

Run:

```bash
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors; only the files listed by this plan are modified or created.

- [ ] **Step 6: Commit the verified release**

```bash
git add package.json package-lock.json src/firebase.js src/App.jsx src/sentry.js src/lib/firestoreRecovery.js src/lib/firestoreRecovery.test.js src/lib/pairRouteState.js src/lib/pairRouteState.test.js src/lib/firebasePersistence.test.js src/lib/sentryConfig.test.js src/components/AppOfflineRouting.test.js
git commit -m "fix stale firestore pairing route"
```

### Task 7: Release And Verify The Affected User

**Files:**
- No code changes.

- [ ] **Step 1: Push the verified release to `main`**

Run:

```bash
git push origin main
```

Expected: `origin/main` points to the `0.3.3` release commit and Cloudflare Pages starts its production build.

- [ ] **Step 2: Confirm Cloudflare Pages succeeds**

Check the GitHub check run for the release commit.

Expected: `Cloudflare Pages` completes with `success` for the exact commit on `main`.

- [ ] **Step 3: Apply the update on the affected device**

Close every other Pocofoto tab/window, open the installed PWA, accept `Update now`, and reopen once if the service worker reloads it.

Expected: the recovery epoch clears Firestore persistence once and does not clear Firebase Authentication.

- [ ] **Step 4: Verify the PostHog route sequence**

Inspect the affected PostHog person after the release timestamp.

Expected:

```text
app_open
screen_view: auth
session_started: hasCoupleId true
screen_view: offline-hold (optional and brief)
screen_view: main
```

No later `screen_view: pairing` should occur in that launch.

- [ ] **Step 5: Verify Sentry diagnostics**

Inspect breadcrumbs for the affected launch.

Expected: `firestore-recovery-cleared` or `firestore-recovery-already-completed`, followed by `server-paired`; no new handled `user-route-listener` exception.

- [ ] **Step 6: Verify server data remains unchanged**

Use Firebase Admin read-only checks for the affected user and couple documents.

Expected: the user retains the same non-null `coupleId`, the couple document exists, and both members remain listed.

- [ ] **Step 7: Record cleanup requirement**

Create a follow-up note or issue to remove the affected-user digest and startup recovery call in the next routine release. Keep `pairRouteState`, its tests, and route breadcrumbs permanently.

## Plan Self-Review

- Spec coverage: one-time affected-user recovery, server-authoritative routing, error behavior, diagnostics, tests, release, and cleanup are mapped to Tasks 1-7.
- Scope: the reset touches only Firestore persistence and never clears Auth, Cache Storage, local photo queues, or review drafts.
- Type consistency: route decisions consistently use `{ state, coupleId, persist, reason }`; recovery consistently returns `{ status }` or `{ status: 'failed', error }`.
- Placeholder scan: no deferred implementation steps remain.
