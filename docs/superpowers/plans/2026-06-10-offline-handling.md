# Offline Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent offline startup from showing nonfunctional pairing UI, show persistent connection status, and allow offline photo capture while keeping send/pair actions online-only.

**Architecture:** Add a small connection-status layer at the app root, then feed that state into routing, pairing actions, and the camera send boundary. Use shadcn `Alert` for the banner surface, Firestore persistent local cache plus a tiny user route cache for paired startup, and IndexedDB for the currently reviewed unsent capture.

**Tech Stack:** React 19, Vite, Firebase Auth/Firestore/Storage, vite-plugin-pwa Workbox runtime caching, shadcn/ui, IndexedDB, node:test/Vitest source and component checks.

---

## File Structure

- Create `src/lib/connectionStatus.js`: browser online/offline state, restored transition, subscription helper.
- Create `src/lib/userRouteCache.js`: user-scoped `coupleId` route cache in `localStorage`.
- Create `src/lib/offlineReviewDraft.js`: IndexedDB storage for the active reviewed photo draft.
- Create `src/components/ConnectionBanner.jsx`: fixed top shadcn `Alert` wrapper for offline/restored connection states.
- Create `src/components/ui/alert.jsx`: install from shadcn registry using `npx shadcn@latest add alert`.
- Modify `src/firebase.js`: initialize Firestore with persistent local cache when available.
- Modify `src/App.jsx`: consume connection status, render banner, use route cache, and avoid Pairing when pair state is unknown offline.
- Modify `src/components/MainScreen.jsx`: allow capture offline, persist current review draft, disable send while offline, restore draft after reload.
- Modify `src/components/PairingScreen.jsx`: disable pairing actions while offline and show inline offline copy.
- Modify `src/index.css`: fixed banner positioning, red/green variants, top offset for update banner.
- Modify `vite.config.js`: tune Firebase Storage image runtime cache for viewed-photo resilience.
- Modify `package.json` and `package-lock.json`: bump patch version.
- Add tests under `src/lib/*.test.js` and `src/components/*.test.js`.

---

### Task 1: Connection Status Store

**Files:**
- Create: `src/lib/connectionStatus.js`
- Create: `src/lib/connectionStatus.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/connectionStatus.test.js`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createConnectionStatusStore,
  getInitialConnectionStatus
} from './connectionStatus.js';

test('initial connection status reads navigator online state', () => {
  assert.equal(getInitialConnectionStatus({ onLine: false }).status, 'offline');
  assert.equal(getInitialConnectionStatus({ onLine: true }).status, 'online');
});

test('store emits offline then restored and clears restored after delay', () => {
  const listeners = {};
  const timers = [];
  const win = {
    navigator: { onLine: true },
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    removeEventListener(type) {
      delete listeners[type];
    },
    setTimeout(handler, delay) {
      timers.push({ handler, delay });
      return timers.length;
    },
    clearTimeout() {}
  };

  const store = createConnectionStatusStore(win, { restoredDuration: 3000 });
  const states = [];
  const unsubscribe = store.subscribe((state) => states.push(state.status));

  win.navigator.onLine = false;
  listeners.offline();
  win.navigator.onLine = true;
  listeners.online();

  assert.deepEqual(states, ['offline', 'restored']);
  assert.equal(timers[0].delay, 3000);

  timers[0].handler();
  assert.equal(store.getSnapshot().status, 'online');

  unsubscribe();
  store.destroy();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node --test src/lib/connectionStatus.test.js
```

Expected: FAIL because `src/lib/connectionStatus.js` does not exist.

- [ ] **Step 3: Implement the status store**

Create `src/lib/connectionStatus.js`:

```js
const DEFAULT_RESTORED_DURATION = 3000;

function canUseWindow(win) {
  return Boolean(win?.addEventListener && win?.navigator);
}

export function getInitialConnectionStatus(navigatorLike = globalThis.navigator) {
  return {
    isOnline: navigatorLike?.onLine !== false,
    status: navigatorLike?.onLine === false ? 'offline' : 'online'
  };
}

export function createConnectionStatusStore(
  win = typeof window !== 'undefined' ? window : null,
  { restoredDuration = DEFAULT_RESTORED_DURATION } = {}
) {
  let state = getInitialConnectionStatus(win?.navigator);
  let restoredTimer = null;
  const listeners = new Set();

  const emit = () => {
    listeners.forEach((listener) => listener(state));
  };

  const setState = (nextState) => {
    state = nextState;
    emit();
  };

  const clearRestoredTimer = () => {
    if (!restoredTimer || !win?.clearTimeout) return;
    win.clearTimeout(restoredTimer);
    restoredTimer = null;
  };

  const handleOffline = () => {
    clearRestoredTimer();
    setState({ isOnline: false, status: 'offline' });
  };

  const handleOnline = () => {
    clearRestoredTimer();
    setState({ isOnline: true, status: 'restored' });
    restoredTimer = win.setTimeout(() => {
      restoredTimer = null;
      setState({ isOnline: true, status: 'online' });
    }, restoredDuration);
  };

  if (canUseWindow(win)) {
    win.addEventListener('offline', handleOffline);
    win.addEventListener('online', handleOnline);
  }

  return {
    getSnapshot() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy() {
      clearRestoredTimer();
      if (!canUseWindow(win)) return;
      win.removeEventListener('offline', handleOffline);
      win.removeEventListener('online', handleOnline);
    }
  };
}

export const connectionStatusStore = createConnectionStatusStore();
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
node --test src/lib/connectionStatus.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/connectionStatus.js src/lib/connectionStatus.test.js
git commit -m "add connection status store"
```

---

### Task 2: Shadcn Alert Banner

**Files:**
- Create: `src/components/ui/alert.jsx`
- Create: `src/components/ConnectionBanner.jsx`
- Create: `src/components/ConnectionBanner.test.js`
- Modify: `src/index.css`
- Modify: `src/App.jsx`

- [ ] **Step 1: Install the shadcn Alert primitive**

Run:

```bash
npx shadcn@latest add alert
```

Expected: creates `src/components/ui/alert.jsx`.

After the command, verify the file exports these symbols:

```bash
rg -n "export \\{ Alert, AlertTitle, AlertDescription \\}" src/components/ui/alert.jsx
```

Expected: one match.

- [ ] **Step 2: Write the failing source tests**

Create `src/components/ConnectionBanner.test.js`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const bannerSource = readFileSync(new URL('./ConnectionBanner.jsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../index.css', import.meta.url), 'utf8');

test('connection banner uses shadcn alert surface with offline and restored copy', () => {
  assert.match(bannerSource, /from ['"]\.\/ui\/alert['"]/);
  assert.match(bannerSource, /You're offline/);
  assert.match(bannerSource, /Capture still works\. Reconnect to send or pair\./);
  assert.match(bannerSource, /Back online/);
  assert.match(bannerSource, /connection-banner--offline/);
  assert.match(bannerSource, /connection-banner--restored/);
});

test('app renders the connection banner from root connection status', () => {
  assert.match(appSource, /connectionStatusStore/);
  assert.match(appSource, /<ConnectionBanner\s+status=\{connectionStatus\.status\}/);
});

test('connection banner is fixed at the safe-area top', () => {
  assert.match(cssSource, /\.connection-banner\s*\{/);
  assert.match(cssSource, /top:\s*calc\(var\(--safe-top\) \+ 12px\)/);
  assert.match(cssSource, /\.connection-banner--offline/);
  assert.match(cssSource, /\.connection-banner--restored/);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run:

```bash
node --test src/components/ConnectionBanner.test.js
```

Expected: FAIL because `ConnectionBanner.jsx` does not exist and `App.jsx` does not render it.

- [ ] **Step 4: Implement `ConnectionBanner`**

Create `src/components/ConnectionBanner.jsx`:

```jsx
import { Wifi, WifiOff } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

import { Alert, AlertDescription, AlertTitle } from './ui/alert';

const bannerMotion = {
  initial: { opacity: 0, y: -18, x: '-50%' },
  animate: { opacity: 1, y: 0, x: '-50%' },
  exit: { opacity: 0, y: -18, x: '-50%' },
  transition: { duration: 0.24, ease: [0.4, 0, 0.2, 1] }
};

export default function ConnectionBanner({ status }) {
  const visible = status === 'offline' || status === 'restored';
  const restored = status === 'restored';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={status}
          className={`connection-banner connection-banner--${status}`}
          role="status"
          aria-live="polite"
          {...bannerMotion}
        >
          <Alert variant={restored ? 'default' : 'destructive'}>
            {restored ? <Wifi aria-hidden="true" /> : <WifiOff aria-hidden="true" />}
            <AlertTitle>{restored ? 'Back online' : "You're offline"}</AlertTitle>
            {!restored && (
              <AlertDescription>
                Capture still works. Reconnect to send or pair.
              </AlertDescription>
            )}
          </Alert>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 5: Wire the banner into `App.jsx`**

Modify `src/App.jsx` imports:

```jsx
import ConnectionBanner from './components/ConnectionBanner';
import { connectionStatusStore } from './lib/connectionStatus';
```

Add state inside `App`:

```jsx
const [connectionStatus, setConnectionStatus] = useState(() => connectionStatusStore.getSnapshot());
```

Add this effect:

```jsx
useEffect(() => {
  return connectionStatusStore.subscribe(setConnectionStatus);
}, []);
```

Render near the existing `UpdateBanner`:

```jsx
<ConnectionBanner status={connectionStatus.status} />
<UpdateBanner offsetForConnectionBanner={connectionStatus.status === 'offline' || connectionStatus.status === 'restored'} />
```

- [ ] **Step 6: Add banner CSS**

Add near existing `.update-banner` rules in `src/index.css`:

```css
.connection-banner {
  position: fixed;
  top: calc(var(--safe-top) + 12px);
  left: 50%;
  z-index: 1300;
  width: min(420px, calc(100vw - 24px));
}

.connection-banner [data-slot="alert"] {
  min-height: 64px;
  border-radius: 24px;
  border-width: 1px;
  box-shadow: 0 18px 54px rgba(0, 0, 0, 0.38);
  -webkit-backdrop-filter: blur(24px);
  backdrop-filter: blur(24px);
}

.connection-banner--offline [data-slot="alert"] {
  border-color: rgba(255, 95, 95, 0.42);
  background: rgba(92, 18, 22, 0.92);
  color: #fff6f6;
}

.connection-banner--restored [data-slot="alert"] {
  border-color: rgba(80, 220, 148, 0.42);
  background: rgba(13, 79, 51, 0.92);
  color: #f2fff8;
}

.update-banner.has-connection-banner-offset {
  top: calc(var(--safe-top) + 88px);
}
```

- [ ] **Step 7: Offset `UpdateBanner` when connection banner is visible**

Modify `src/components/UpdateBanner.jsx` signature and className:

```jsx
export default function UpdateBanner({ offsetForConnectionBanner = false }) {
```

For both update banner `motion.div` elements, change:

```jsx
className="update-banner"
```

to:

```jsx
className={`update-banner ${offsetForConnectionBanner ? 'has-connection-banner-offset' : ''}`}
```

For the success banner, use:

```jsx
className={`update-banner update-banner-success ${offsetForConnectionBanner ? 'has-connection-banner-offset' : ''}`}
```

- [ ] **Step 8: Run tests**

Run:

```bash
node --test src/components/ConnectionBanner.test.js
npm run test:unit
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/components/ui/alert.jsx src/components/ConnectionBanner.jsx src/components/ConnectionBanner.test.js src/components/UpdateBanner.jsx src/App.jsx src/index.css
git commit -m "add offline connection banner"
```

---

### Task 3: Route Cache And Offline Startup Routing

**Files:**
- Create: `src/lib/userRouteCache.js`
- Create: `src/lib/userRouteCache.test.js`
- Create: `src/components/AppOfflineRouting.test.js`
- Modify: `src/App.jsx`

- [ ] **Step 1: Write route cache tests**

Create `src/lib/userRouteCache.test.js`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearCachedUserRoute,
  getCachedUserRoute,
  setCachedUserRoute
} from './userRouteCache.js';

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
}

test('route cache stores coupleId by user id', () => {
  const storage = createStorage();

  setCachedUserRoute('user-a', { coupleId: 'couple-a' }, storage);
  setCachedUserRoute('user-b', { coupleId: null }, storage);

  assert.equal(getCachedUserRoute('user-a', storage).coupleId, 'couple-a');
  assert.equal(getCachedUserRoute('user-b', storage).coupleId, null);
});

test('route cache clears user entry', () => {
  const storage = createStorage();

  setCachedUserRoute('user-a', { coupleId: 'couple-a' }, storage);
  clearCachedUserRoute('user-a', storage);

  assert.equal(getCachedUserRoute('user-a', storage), null);
});
```

- [ ] **Step 2: Write App routing source test**

Create `src/components/AppOfflineRouting.test.js`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');

test('app uses cached pair route and avoids pairing when offline pair state is unknown', () => {
  assert.match(appSource, /getCachedUserRoute/);
  assert.match(appSource, /setPairStateKnown/);
  assert.match(appSource, /OfflineHoldScreen/);
  assert.match(appSource, /pairStateKnown && connectionStatus\.isOnline/);
});
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
node --test src/lib/userRouteCache.test.js src/components/AppOfflineRouting.test.js
```

Expected: FAIL because the cache module and routing changes do not exist.

- [ ] **Step 4: Implement route cache**

Create `src/lib/userRouteCache.js`:

```js
const ROUTE_CACHE_PREFIX = 'pocofoto:user-route:';

function storageKey(userId) {
  return `${ROUTE_CACHE_PREFIX}${userId}`;
}

function canUseStorage(storage) {
  return Boolean(storage?.getItem && storage?.setItem && storage?.removeItem);
}

export function getCachedUserRoute(userId, storage = globalThis.localStorage) {
  if (!userId || !canUseStorage(storage)) return null;
  try {
    const raw = storage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      coupleId: typeof parsed.coupleId === 'string' && parsed.coupleId.length > 0 ? parsed.coupleId : null,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : ''
    };
  } catch {
    return null;
  }
}

export function setCachedUserRoute(userId, route, storage = globalThis.localStorage) {
  if (!userId || !canUseStorage(storage)) return;
  const payload = {
    coupleId: route?.coupleId || null,
    updatedAt: new Date().toISOString()
  };
  storage.setItem(storageKey(userId), JSON.stringify(payload));
}

export function clearCachedUserRoute(userId, storage = globalThis.localStorage) {
  if (!userId || !canUseStorage(storage)) return;
  storage.removeItem(storageKey(userId));
}
```

- [ ] **Step 5: Modify App route state**

Modify imports in `src/App.jsx`:

```jsx
import { clearCachedUserRoute, getCachedUserRoute, setCachedUserRoute } from './lib/userRouteCache';
```

Add state:

```jsx
const [pairStateKnown, setPairStateKnown] = useState(false);
```

In the auth effect, when `!firebaseUser`, add:

```jsx
setPairStateKnown(false);
```

In the user-doc effect, before `setCheckingPair(true)`, seed from route cache:

```jsx
const cachedRoute = getCachedUserRoute(user.uid);
if (cachedRoute?.coupleId) {
  setCoupleId(cachedRoute.coupleId);
  setPairStateKnown(true);
}
```

In the snapshot success handler, after reading data:

```jsx
const nextCoupleId = data.coupleId || null;
setCoupleId(nextCoupleId);
setPairStateKnown(true);
setCachedUserRoute(user.uid, { coupleId: nextCoupleId });
```

If the user doc does not exist:

```jsx
setCoupleId(null);
setPairStateKnown(true);
setCachedUserRoute(user.uid, { coupleId: null });
```

In the snapshot error handler:

```jsx
const cachedRoute = getCachedUserRoute(user.uid);
if (cachedRoute?.coupleId) {
  setCoupleId(cachedRoute.coupleId);
  setPairStateKnown(true);
} else if (connectionStatus.isOnline) {
  setCoupleId(null);
  setPairStateKnown(true);
  clearCachedUserRoute(user.uid);
} else {
  setPairStateKnown(false);
}
setCheckingPair(false);
setLoading(false);
```

Add `connectionStatus.isOnline` to the user-doc effect dependency list.

- [ ] **Step 6: Add offline hold screen and route guard**

Add this component near `LoadingScreen` in `src/App.jsx`:

```jsx
function OfflineHoldScreen() {
  return (
    <div className="app-route-layer offline-hold-screen">
      <div className="loading-logo-mark">
        <img src="/pocoface-icon-1024.png" alt="" />
      </div>
      <img className="logo-lockup-image loading-logotype" src="/pocofoto-logotype.svg" alt="Pocofoto" />
      <p>Reconnect to finish loading Pocofoto.</p>
    </div>
  );
}
```

Replace screen selection with:

```jsx
let screen = 'auth';
if (user && !pairStateKnown && !checkingPair) screen = 'offline-hold';
if (user && !coupleId && pairStateKnown && connectionStatus.isOnline && !checkingPair) screen = 'pairing';
if (user && coupleId) screen = 'main';
```

Render:

```jsx
{screen === 'offline-hold' && (
  <motion.div key="offline-hold" className="app-route-layer" {...pageTransition} style={{ height: '100%' }}>
    <OfflineHoldScreen />
  </motion.div>
)}
```

Add CSS:

```css
.offline-hold-screen {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  padding: calc(var(--safe-top) + 28px) 24px calc(var(--safe-bottom) + 28px);
  color: var(--text-primary);
  text-align: center;
}

.offline-hold-screen p {
  max-width: 280px;
  color: var(--text-secondary);
  font-size: 15px;
  font-weight: 700;
  line-height: 1.35;
}
```

- [ ] **Step 7: Run tests**

Run:

```bash
node --test src/lib/userRouteCache.test.js src/components/AppOfflineRouting.test.js
npm run test:unit
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/userRouteCache.js src/lib/userRouteCache.test.js src/components/AppOfflineRouting.test.js src/App.jsx src/index.css
git commit -m "fix offline startup routing"
```

---

### Task 4: Firebase Persistence And Viewed Photo Runtime Cache

**Files:**
- Modify: `src/firebase.js`
- Modify: `vite.config.js`
- Create: `src/lib/firebasePersistence.test.js`
- Create: `src/components/PhotoRuntimeCache.test.js`

- [ ] **Step 1: Write source tests**

Create `src/lib/firebasePersistence.test.js`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const firebaseSource = readFileSync(new URL('../firebase.js', import.meta.url), 'utf8');

test('firestore is initialized with persistent local cache', () => {
  assert.match(firebaseSource, /initializeFirestore/);
  assert.match(firebaseSource, /persistentLocalCache/);
  assert.match(firebaseSource, /persistentMultipleTabManager/);
});
```

Create `src/components/PhotoRuntimeCache.test.js`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const viteSource = readFileSync(new URL('../../vite.config.js', import.meta.url), 'utf8');

test('firebase storage photos use viewed-photo runtime cache', () => {
  assert.match(viteSource, /firebase-storage-cache/);
  assert.match(viteSource, /handler:\s*'StaleWhileRevalidate'/);
  assert.match(viteSource, /maxEntries:\s*80/);
  assert.match(viteSource, /maxAgeSeconds:\s*60 \* 60 \* 24 \* 30/);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
node --test src/lib/firebasePersistence.test.js src/components/PhotoRuntimeCache.test.js
```

Expected: FAIL because persistence and cache tuning are not in place.

- [ ] **Step 3: Initialize Firestore with persistent cache**

Modify Firestore imports in `src/firebase.js`:

```js
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc as realDoc,
  ...
} from 'firebase/firestore';
```

Replace:

```js
const db = getFirestore(app);
```

with:

```js
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  });
} catch {
  db = getFirestore(app);
}
```

- [ ] **Step 4: Tune Workbox Firebase Storage cache**

In `vite.config.js`, replace the Firebase Storage runtime caching object:

```js
{
  urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\/.*/i,
  handler: 'StaleWhileRevalidate',
  options: {
    cacheName: 'firebase-storage-cache',
    expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 },
    cacheableResponse: { statuses: [0, 200] }
  }
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
node --test src/lib/firebasePersistence.test.js src/components/PhotoRuntimeCache.test.js
npm run test:unit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/firebase.js vite.config.js src/lib/firebasePersistence.test.js src/components/PhotoRuntimeCache.test.js
git commit -m "enable offline firestore and photo cache"
```

---

### Task 5: Offline Review Draft Persistence And Send Boundary

**Files:**
- Create: `src/lib/offlineReviewDraft.js`
- Create: `src/lib/offlineReviewDraft.test.js`
- Create: `src/components/MainScreenOfflineCapture.test.js`
- Modify: `src/App.jsx`
- Modify: `src/components/MainScreen.jsx`

- [ ] **Step 1: Write IndexedDB draft tests**

Create `src/lib/offlineReviewDraft.test.js`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createOfflineReviewDraftStore,
  createReviewDraftKey
} from './offlineReviewDraft.js';

test('review draft keys are scoped to user and couple', () => {
  assert.equal(createReviewDraftKey('user-a', 'couple-a'), 'user-a::couple-a');
});

test('review draft store saves, loads, and clears draft payloads', async () => {
  const records = new Map();
  const store = createOfflineReviewDraftStore({
    async get(key) {
      return records.get(key) || null;
    },
    async set(key, value) {
      records.set(key, value);
    },
    async delete(key) {
      records.delete(key);
    }
  });

  const blob = new Blob(['photo'], { type: 'image/jpeg' });
  await store.saveDraft({ userId: 'user-a', coupleId: 'couple-a', blob, captionText: 'hi' });

  const draft = await store.loadDraft({ userId: 'user-a', coupleId: 'couple-a' });
  assert.equal(draft.captionText, 'hi');
  assert.equal(draft.blob.type, 'image/jpeg');

  await store.clearDraft({ userId: 'user-a', coupleId: 'couple-a' });
  assert.equal(await store.loadDraft({ userId: 'user-a', coupleId: 'couple-a' }), null);
});
```

- [ ] **Step 2: Write MainScreen source test**

Create `src/components/MainScreenOfflineCapture.test.js`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mainSource = readFileSync(new URL('./MainScreen.jsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');

test('main screen permits capture offline but disables send until online', () => {
  assert.match(appSource, /<MainScreen[\s\S]*isOnline=\{connectionStatus\.isOnline\}/);
  assert.match(mainSource, /isOnline/);
  assert.match(mainSource, /saveOfflineReviewDraft/);
  assert.match(mainSource, /loadOfflineReviewDraft/);
  assert.match(mainSource, /clearOfflineReviewDraft/);
  assert.match(mainSource, /Reconnect to send/);
  assert.match(mainSource, /if \(!isOnline\) \{/);
});
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
node --test src/lib/offlineReviewDraft.test.js src/components/MainScreenOfflineCapture.test.js
```

Expected: FAIL because the draft store and MainScreen wiring do not exist.

- [ ] **Step 4: Implement IndexedDB draft storage**

Create `src/lib/offlineReviewDraft.js`:

```js
const DB_NAME = 'pocofoto-offline-drafts';
const DB_VERSION = 1;
const STORE_NAME = 'reviewDrafts';

export function createReviewDraftKey(userId, coupleId) {
  return `${userId}::${coupleId}`;
}

function openDraftDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onerror = () => reject(request.error || new Error('Could not open draft database'));
    request.onsuccess = () => resolve(request.result);
  });
}

async function withStore(mode, callback) {
  const db = await openDraftDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const request = callback(store);
      request.onerror = () => reject(request.error || new Error('Draft database request failed'));
      request.onsuccess = () => resolve(request.result || null);
    });
  } finally {
    db.close();
  }
}

const indexedDbAdapter = {
  get(key) {
    return withStore('readonly', (store) => store.get(key));
  },
  set(key, value) {
    return withStore('readwrite', (store) => store.put(value, key));
  },
  delete(key) {
    return withStore('readwrite', (store) => store.delete(key));
  }
};

export function createOfflineReviewDraftStore(adapter = indexedDbAdapter) {
  return {
    async saveDraft({ userId, coupleId, blob, captionText = '' }) {
      if (!userId || !coupleId || !blob) return;
      await adapter.set(createReviewDraftKey(userId, coupleId), {
        blob,
        captionText,
        updatedAt: new Date().toISOString()
      });
    },
    async loadDraft({ userId, coupleId }) {
      if (!userId || !coupleId) return null;
      return adapter.get(createReviewDraftKey(userId, coupleId));
    },
    async clearDraft({ userId, coupleId }) {
      if (!userId || !coupleId) return;
      await adapter.delete(createReviewDraftKey(userId, coupleId));
    }
  };
}

const defaultDraftStore = createOfflineReviewDraftStore();

export const saveOfflineReviewDraft = (payload) => defaultDraftStore.saveDraft(payload);
export const loadOfflineReviewDraft = (payload) => defaultDraftStore.loadDraft(payload);
export const clearOfflineReviewDraft = (payload) => defaultDraftStore.clearDraft(payload);
```

- [ ] **Step 5: Pass connection state into MainScreen**

In `src/App.jsx`, change the `MainScreen` render:

```jsx
<MainScreen
  user={user}
  coupleId={coupleId}
  isOnline={connectionStatus.isOnline}
  onPairingRemoved={handlePairingRemoved}
  onBackgroundSourceChange={setBackgroundSource}
/>
```

- [ ] **Step 6: Restore and persist review draft in MainScreen**

Modify the `MainScreen` signature:

```jsx
export default function MainScreen({ user, coupleId, isOnline = true, onPairingRemoved, onBackgroundSourceChange }) {
```

Import draft helpers:

```jsx
import {
  clearOfflineReviewDraft,
  loadOfflineReviewDraft,
  saveOfflineReviewDraft
} from '../lib/offlineReviewDraft';
```

Add this effect after `clearReviewPhoto` is defined:

```jsx
useEffect(() => {
  let active = true;

  loadOfflineReviewDraft({ userId: user.uid, coupleId }).then((draft) => {
    if (!active || !draft?.blob || reviewPhoto) return;
    const url = URL.createObjectURL(draft.blob);
    reviewPhotoUrlRef.current = url;
    setReviewPhoto({ blob: draft.blob, url });
    setCaptionText(draft.captionText || '');
    setSendAnimationState('idle');
  }).catch((err) => {
    console.warn('Could not restore offline review draft.', err);
  });

  return () => {
    active = false;
  };
}, [coupleId, reviewPhoto, user.uid]);
```

In `handleCapture`, after creating `blob`, before `setReviewPhoto`, save the draft:

```jsx
await saveOfflineReviewDraft({
  userId: user.uid,
  coupleId,
  blob,
  captionText: ''
}).catch((err) => {
  console.warn('Could not save offline review draft.', err);
});
```

In `handleCaptionChange`, after setting caption text, save the draft if `reviewPhoto` exists:

```jsx
if (reviewPhoto?.blob) {
  saveOfflineReviewDraft({
    userId: user.uid,
    coupleId,
    blob: reviewPhoto.blob,
    captionText: nextValue
  }).catch((err) => {
    console.warn('Could not update offline review draft caption.', err);
  });
}
```

In `clearReviewPhoto`, clear the draft:

```jsx
clearOfflineReviewDraft({ userId: user.uid, coupleId }).catch((err) => {
  console.warn('Could not clear offline review draft.', err);
});
```

- [ ] **Step 7: Disable only send while offline**

Change `captureDisabled` to keep capture local:

```jsx
const captureDisabled = uploading || sendingReviewPhoto || sendAnimationState !== 'idle';
const sendDisabled = captureDisabled || !isOnline;
```

In `handleSendReviewPhoto`, add before `setSendingReviewPhoto(true)`:

```jsx
if (!isOnline) {
  showToast('Reconnect to send', 2600);
  return;
}
```

Change the shutter button:

```jsx
aria-label={isReviewingPhoto && !isOnline ? 'Reconnect to send' : isReviewingPhoto ? 'Send photo' : 'Capture photo'}
disabled={isReviewingPhoto ? sendDisabled : captureDisabled}
```

After `uploadPhotoBlob(...)` succeeds, clear the draft:

```jsx
await clearOfflineReviewDraft({ userId: user.uid, coupleId });
```

- [ ] **Step 8: Run tests**

Run:

```bash
node --test src/lib/offlineReviewDraft.test.js src/components/MainScreenOfflineCapture.test.js
npm run test:unit
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/offlineReviewDraft.js src/lib/offlineReviewDraft.test.js src/components/MainScreenOfflineCapture.test.js src/App.jsx src/components/MainScreen.jsx
git commit -m "preserve offline photo review draft"
```

---

### Task 6: Pairing Offline Action Guard

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/PairingScreen.jsx`
- Create: `src/components/PairingOfflineActions.test.js`

- [ ] **Step 1: Write source test**

Create `src/components/PairingOfflineActions.test.js`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appSource = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const pairingSource = readFileSync(new URL('./PairingScreen.jsx', import.meta.url), 'utf8');

test('pairing actions are disabled while offline', () => {
  assert.match(appSource, /<PairingScreen[\s\S]*isOnline=\{connectionStatus\.isOnline\}/);
  assert.match(pairingSource, /isOnline = true/);
  assert.match(pairingSource, /Pairing needs connection/);
  assert.match(pairingSource, /disabled=\{!isOnline \|\|/);
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
node --test src/components/PairingOfflineActions.test.js
```

Expected: FAIL because `isOnline` is not wired into PairingScreen.

- [ ] **Step 3: Pass `isOnline` into PairingScreen**

In `src/App.jsx`, change:

```jsx
<PairingScreen
  user={user}
  onPaired={handlePaired}
  initialNotice={pairingNotice}
  onNoticeConsumed={handleNoticeConsumed}
/>
```

to:

```jsx
<PairingScreen
  user={user}
  isOnline={connectionStatus.isOnline}
  onPaired={handlePaired}
  initialNotice={pairingNotice}
  onNoticeConsumed={handleNoticeConsumed}
/>
```

- [ ] **Step 4: Disable pairing actions**

Modify signature:

```jsx
export default function PairingScreen({ user, isOnline = true, onPaired, initialNotice = '', onNoticeConsumed }) {
```

Before the pairing action UI, render:

```jsx
{!isOnline && (
  <div className="pairing-offline-note" role="status">
    Pairing needs connection. You can continue when you're back online.
  </div>
)}
```

For pairing action buttons, add `!isOnline ||` to the existing disabled expressions. Examples:

```jsx
disabled={!isOnline || workingId === 'create-code'}
disabled={!isOnline || workingId === 'redeem-code' || inputCode.trim().length === 0}
disabled={!isOnline || workingId === request.id}
disabled={!isOnline || workingId === 'cancel'}
```

Add CSS:

```css
.pairing-offline-note {
  margin: 10px 0 14px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 95, 95, 0.28);
  border-radius: 18px;
  background: rgba(92, 18, 22, 0.72);
  color: #fff6f6;
  font-size: 13px;
  font-weight: 750;
  line-height: 1.3;
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
node --test src/components/PairingOfflineActions.test.js
npm run test:unit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx src/components/PairingScreen.jsx src/components/PairingOfflineActions.test.js src/index.css
git commit -m "disable pairing actions offline"
```

---

### Task 7: Version Bump And Full Verification

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Bump patch version**

Run:

```bash
npm version patch --no-git-tag-version
```

Expected: `package.json` and `package-lock.json` both move from `0.2.21` to `0.2.22` unless another version has already landed; if so, accept npm's next patch value.

- [ ] **Step 2: Run all required verification**

Run:

```bash
npm run test:unit
npm run lint
npm run build
```

Expected: all pass.

- [ ] **Step 3: Manual browser verification**

Run:

```bash
npm run dev
```

Open the app and verify:

- Offline mode shows the red shadcn Alert banner.
- Reconnect turns the banner green and hides it after about 3 seconds.
- A previously paired signed-in user with cached route state opens Main, not Pairing, while offline.
- If pair state is unknown while offline, the offline hold screen appears.
- Camera capture works offline.
- Reviewed offline capture survives reload.
- Send is disabled/offline-gated and becomes available after reconnect.
- Pairing actions are disabled while offline.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "bump version for offline handling"
```

---

## Self-Review Checklist

- Spec coverage: covered persistent red/green banner, shadcn Alert surface, offline startup routing, route cache, Firestore cache, viewed-photo cache tuning, offline capture draft, disabled send, disabled pairing actions, tests, build/lint, and version bump.
- Placeholder scan: no TBD/TODO/later placeholders remain.
- Type consistency: `connectionStatus.status`, `connectionStatus.isOnline`, `isOnline`, `pairStateKnown`, and draft helper names are consistent across tasks.
- Scope check: no multi-photo offline queue/outbox, no proactive viewed-photo prefetch, no live push/deploy.
