# Reliable Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reliable per-device notification lifecycle, deduplicated foreground/background delivery for five event types, and production-safe current-device and partner diagnostics.

**Architecture:** Move browser permission, device identity, token synchronization, dismissal state, and foreground deduplication into focused client modules consumed through one React hook. Move backend event construction, token ownership, multicast behavior, cooldowns, and expiry into a testable push module used by Firebase callable and Firestore trigger wrappers. Keep the existing PWA and messaging service workers separate; send data-only messages and let the messaging worker own background display.

**Tech Stack:** React 19, Vite 8, Firebase Web SDK 12, Firebase Cloud Messaging, Firestore, Firebase Functions v2, Node test runner, Vitest, service workers.

---

## File Map

- Create `src/lib/notificationDevice.js`: local device ID, per-user prompt dismissal, event deduplication, and permission-state helpers.
- Create `src/lib/notificationDevice.test.js`: deterministic unit coverage for local notification state.
- Create `src/notifications/notificationClient.js`: service-worker registration, token retrieval/deletion, callable wrappers, and diagnostic snapshot.
- Create `src/notifications/notificationClient.test.js`: dependency-injected lifecycle tests.
- Create `src/hooks/useNotifications.js`: authenticated startup sync, online refresh, prompt eligibility, foreground receipt, enable/disable, logout cleanup, and diagnostics state.
- Create `src/hooks/useNotifications.test.jsx`: hook lifecycle and non-blocking cleanup tests.
- Create `src/components/NotificationPrompt.jsx`: one-time paired-user explanation.
- Create `src/components/NotificationPrompt.test.jsx`: prompt action tests.
- Create `src/components/NotificationSettings.jsx`: current-device switch and collapsed production diagnostics.
- Create `src/components/NotificationSettings.test.jsx`: control, denied-state, zero-token, and cooldown tests.
- Create `functions/push.js`: backend registration ownership, data payloads, multicast, deduplication, cooldown, diagnostics, and expiry helpers.
- Create `functions/push.test.js`: backend unit tests with in-memory Firestore/messaging adapters.
- Modify `functions/package.json`: add a Node test script.
- Modify `functions/index.js`: thin callable/trigger wrappers and pairing push hooks.
- Modify `src/firebase.js`: expose `deleteToken` and messaging access through existing wrappers.
- Modify `src/App.jsx`: own the notification hook, prompt, foreground toast, and practical destination intent.
- Modify `src/components/MainScreen.jsx`: replace legacy push debug state/UI with `NotificationSettings`; clean up token before logout.
- Modify `src/components/PairingScreen.jsx`: manual enable action for unpaired users and logout cleanup.
- Modify `src/pushNotifications.js`: remove the old one-shot flow or reduce it to compatibility re-exports before deleting it.
- Modify `public/firebase-messaging-sw.js`: consume data-only messages, deduplicate event IDs, display once, and resolve click destinations.
- Create `public/firebase-messaging-sw-core.js`: pure worker helpers exposed through `self.PocofotoMessaging` for worker and Node tests.
- Create `src/components/FirebaseMessagingWorker.test.js`: verify worker payload mapping, event deduplication contract, and click destinations.
- Modify `src/index.css`: prompt, settings, diagnostics, and Pairing-screen notification action styles.
- Modify `firestore.rules`: explicitly deny client access to the backend-owned token registry.
- Modify `README.md`: document lifecycle, production diagnostics, and manual verification.
- Modify `package.json` and `package-lock.json`: bump the app version for the completed notification fix.

## Task 1: Local Device State And Event Deduplication

**Files:**
- Create: `src/lib/notificationDevice.js`
- Create: `src/lib/notificationDevice.test.js`

- [ ] **Step 1: Write failing tests for stable device identity and per-user dismissal**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createNotificationDeviceStore,
  notificationPermissionState
} from './notificationDevice.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}

test('device id remains stable and prompt dismissal is scoped by user', () => {
  const storage = memoryStorage();
  const store = createNotificationDeviceStore({ storage, randomUUID: () => 'device-1', now: () => 1000 });
  assert.equal(store.getDeviceId(), 'device-1');
  assert.equal(store.getDeviceId(), 'device-1');
  store.dismissPrompt('user-a');
  assert.equal(store.isPromptDismissed('user-a'), true);
  assert.equal(store.isPromptDismissed('user-b'), false);
});

test('recent event ids are bounded and reject duplicates', () => {
  const store = createNotificationDeviceStore({
    storage: memoryStorage(), randomUUID: () => 'device-1', now: () => 1000, maxRecentEvents: 2
  });
  assert.equal(store.rememberEvent('event-1'), true);
  assert.equal(store.rememberEvent('event-1'), false);
  store.rememberEvent('event-2');
  store.rememberEvent('event-3');
  assert.equal(store.hasSeenEvent('event-1'), false);
});

test('permission state maps unsupported and browser values', () => {
  assert.equal(notificationPermissionState(undefined), 'unsupported');
  assert.equal(notificationPermissionState({ permission: 'denied' }), 'denied');
  assert.equal(notificationPermissionState({ permission: 'granted' }), 'granted');
});
```

- [ ] **Step 2: Run the focused test and verify the module is missing**

Run: `node --test src/lib/notificationDevice.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `notificationDevice.js`.

- [ ] **Step 3: Implement the local store**

```js
const DEVICE_ID_KEY = 'pocofoto:notifications:device-id';
const DISMISS_PREFIX = 'pocofoto:notifications:prompt-dismissed:';
const RECENT_EVENTS_KEY = 'pocofoto:notifications:recent-events';

export function notificationPermissionState(notificationApi) {
  if (!notificationApi) return 'unsupported';
  return ['default', 'granted', 'denied'].includes(notificationApi.permission)
    ? notificationApi.permission
    : 'unsupported';
}

export function createNotificationDeviceStore({
  storage = window.localStorage,
  randomUUID = () => crypto.randomUUID(),
  now = () => Date.now(),
  maxRecentEvents = 50
} = {}) {
  function readRecent() {
    try { return JSON.parse(storage.getItem(RECENT_EVENTS_KEY) || '[]'); } catch { return []; }
  }
  return {
    getDeviceId() {
      const existing = storage.getItem(DEVICE_ID_KEY);
      if (existing) return existing;
      const next = randomUUID();
      storage.setItem(DEVICE_ID_KEY, next);
      return next;
    },
    dismissPrompt(uid) { storage.setItem(`${DISMISS_PREFIX}${uid}`, String(now())); },
    isPromptDismissed(uid) { return Boolean(storage.getItem(`${DISMISS_PREFIX}${uid}`)); },
    hasSeenEvent(eventId) { return readRecent().some((event) => event.id === eventId); },
    rememberEvent(eventId) {
      const recent = readRecent();
      if (recent.some((event) => event.id === eventId)) return false;
      storage.setItem(RECENT_EVENTS_KEY, JSON.stringify(
        [...recent, { id: eventId, seenAt: now() }].slice(-maxRecentEvents)
      ));
      return true;
    }
  };
}
```

- [ ] **Step 4: Run the test and full Node unit suite**

Run: `node --test src/lib/notificationDevice.test.js && npm run test:unit`

Expected: PASS.

- [ ] **Step 5: Commit the local device-state unit**

```bash
git add src/lib/notificationDevice.js src/lib/notificationDevice.test.js
git commit -m "add notification device state"
```

## Task 2: Browser Notification Client

**Files:**
- Create: `src/notifications/notificationClient.js`
- Create: `src/notifications/notificationClient.test.js`
- Modify: `src/firebase.js`
- Modify: `src/pushNotifications.js`

- [ ] **Step 1: Write failing dependency-injected lifecycle tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { createNotificationClient } from './notificationClient.js';

test('granted startup registers current token without requesting permission', async () => {
  const calls = [];
  const client = createNotificationClient({
    notificationApi: { permission: 'granted', requestPermission: async () => 'granted' },
    getDeviceId: () => 'device-1',
    getMessagingRegistration: async () => ({ active: {} }),
    getToken: async () => 'token-1',
    deleteToken: async () => true,
    call: async (name, data) => { calls.push({ name, data }); return { ok: true }; },
    vapidKey: 'vapid'
  });
  const result = await client.syncGrantedPermission();
  assert.equal(result.status, 'registered');
  assert.equal(calls[0].name, 'registerFcmToken');
  assert.equal(calls[0].data.deviceId, 'device-1');
});

test('enable requests permission only from the explicit action', async () => {
  let requests = 0;
  const client = createNotificationClient({
    notificationApi: { permission: 'default', requestPermission: async () => { requests += 1; return 'denied'; } },
    getDeviceId: () => 'device-1', getMessagingRegistration: async () => ({}),
    getToken: async () => 'unused', deleteToken: async () => true,
    call: async () => ({ ok: true }), vapidKey: 'vapid'
  });
  assert.equal((await client.enable()).status, 'denied');
  assert.equal(requests, 1);
});

test('disable removes server registration even if local token deletion fails', async () => {
  const calls = [];
  const client = createNotificationClient({
    notificationApi: { permission: 'granted' }, getDeviceId: () => 'device-1',
    getMessagingRegistration: async () => ({}), getToken: async () => 'token-1',
    deleteToken: async () => { throw new Error('local delete failed'); },
    call: async (name, data) => { calls.push({ name, data }); return { ok: true }; }, vapidKey: 'vapid'
  });
  const result = await client.disable();
  assert.equal(result.status, 'disabled');
  assert.equal(calls.at(-1).name, 'removeFcmToken');
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node --test src/notifications/notificationClient.test.js`

Expected: FAIL because `notificationClient.js` does not exist.

- [ ] **Step 3: Expose Firebase messaging deletion and implement the client**

In `src/firebase.js`, wrap and export `deleteToken` alongside `getMessagingToken` and `onForegroundMessage`:

```js
import { deleteToken as realDeleteToken } from 'firebase/messaging';

const deleteMessagingToken = async () => {
  const supported = await realMessagingIsSupported();
  if (!supported) return false;
  return realDeleteToken(getMessaging(app));
};
```

In `src/notifications/notificationClient.js`, export `createNotificationClient(deps)` and a production `notificationClient`. The public methods must be:

```js
{
  getStatus(),
  enable(),
  disable(),
  syncGrantedPermission(),
  cleanupBeforeLogout(),
  getDiagnostics(),
  testThisDevice(),
  testPartnerDevices()
}
```

Use `/firebase-messaging-sw.js` with scope `/firebase-cloud-messaging-push-scope`, pass `{ token, deviceId, permission, userAgent }` to `registerFcmToken`, pass `{ deviceId }` to `removeFcmToken`, and never return or log the raw token. Reduce `src/pushNotifications.js` to compatibility exports from the new client, then update imports in later tasks before deleting the compatibility layer.

- [ ] **Step 4: Run client tests and lint**

Run: `node --test src/notifications/notificationClient.test.js && npm run lint`

Expected: PASS.

- [ ] **Step 5: Commit the browser client**

```bash
git add src/firebase.js src/pushNotifications.js src/notifications/notificationClient.js src/notifications/notificationClient.test.js
git commit -m "add notification lifecycle client"
```

## Task 3: Authenticated Notification Hook And Prompt

**Files:**
- Create: `src/hooks/useNotifications.js`
- Create: `src/hooks/useNotifications.test.jsx`
- Create: `src/components/NotificationPrompt.jsx`
- Create: `src/components/NotificationPrompt.test.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: Write failing hook tests**

```jsx
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useNotifications } from './useNotifications';

describe('useNotifications', () => {
  it('silently syncs a granted returning user and shows no prompt', async () => {
    const client = { getStatus: vi.fn(() => ({ permission: 'granted' })), syncGrantedPermission: vi.fn().mockResolvedValue({ status: 'registered' }) };
    const store = { isPromptDismissed: vi.fn(() => false), rememberEvent: vi.fn(() => true) };
    const { result } = renderHook(() => useNotifications({ user: { uid: 'u1' }, paired: true, online: true, client, store }));
    await waitFor(() => expect(client.syncGrantedPermission).toHaveBeenCalledOnce());
    expect(result.current.showPrompt).toBe(false);
  });

  it('shows the one-time prompt to paired users with default permission', () => {
    const client = { getStatus: () => ({ permission: 'default' }) };
    const store = { isPromptDismissed: () => false };
    const { result } = renderHook(() => useNotifications({ user: { uid: 'u1' }, paired: true, online: true, client, store }));
    expect(result.current.showPrompt).toBe(true);
  });

  it('permanently dismisses the prompt for this user and device', () => {
    const store = { isPromptDismissed: () => false, dismissPrompt: vi.fn() };
    const { result } = renderHook(() => useNotifications({ user: { uid: 'u1' }, paired: true, online: true, client: { getStatus: () => ({ permission: 'default' }) }, store }));
    act(() => result.current.dismissPrompt());
    expect(store.dismissPrompt).toHaveBeenCalledWith('u1');
    expect(result.current.showPrompt).toBe(false);
  });
});
```

- [ ] **Step 2: Write failing prompt tests**

```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import NotificationPrompt from './NotificationPrompt';

it('offers enable and permanent not-now actions', async () => {
  const onEnable = vi.fn();
  const onDismiss = vi.fn();
  render(<NotificationPrompt open onEnable={onEnable} onDismiss={onDismiss} busy={false} />);
  await userEvent.click(screen.getByRole('button', { name: 'Enable notifications' }));
  await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
  expect(onEnable).toHaveBeenCalledOnce();
  expect(onDismiss).toHaveBeenCalledOnce();
});
```

- [ ] **Step 3: Run focused tests and verify missing modules**

Run: `npx vitest run src/hooks/useNotifications.test.jsx src/components/NotificationPrompt.test.jsx`

Expected: FAIL with module-not-found errors.

- [ ] **Step 4: Implement the hook and prompt**

The hook must return this stable interface:

```js
{
  status,
  showPrompt,
  enable,
  disable,
  dismissPrompt,
  cleanupBeforeLogout,
  diagnostics,
  refreshDiagnostics,
  testThisDevice,
  testPartnerDevices,
  cooldownUntil,
  foregroundMessage,
  clearForegroundMessage
}
```

In `App.jsx`, instantiate the hook from `{ user, paired: Boolean(coupleId), online: connectionStatus.isOnline }`, register `onForegroundMessage` through the hook, and render `NotificationPrompt` only after the main route is ready. Map `photo_received`, `like_received`, `pairing_request`, `pairing_accepted`, and `pairing_removed` to the approved toast copy. Ignore repeated `eventId` values through the local device store.

- [ ] **Step 5: Run hook/prompt tests and app lint**

Run: `npx vitest run src/hooks/useNotifications.test.jsx src/components/NotificationPrompt.test.jsx && npm run lint`

Expected: PASS.

- [ ] **Step 6: Commit startup sync and onboarding**

```bash
git add src/hooks/useNotifications.js src/hooks/useNotifications.test.jsx src/components/NotificationPrompt.jsx src/components/NotificationPrompt.test.jsx src/App.jsx
git commit -m "add notification onboarding lifecycle"
```

## Task 4: Profile Settings, Pairing Enablement, And Logout Cleanup

**Files:**
- Create: `src/components/NotificationSettings.jsx`
- Create: `src/components/NotificationSettings.test.jsx`
- Modify: `src/components/MainScreen.jsx`
- Modify: `src/components/PairingScreen.jsx`
- Modify: `src/App.jsx`
- Modify: `src/index.css`

- [ ] **Step 1: Write failing settings tests**

```jsx
it('keeps denied notifications visible with generic settings guidance', () => {
  render(<NotificationSettings status={{ permission: 'denied', enabled: false }} diagnostics={{}} />);
  expect(screen.getByRole('switch', { name: 'Notifications' })).not.toBeChecked();
  expect(screen.getByText('Enable notifications in your browser or device settings.')).toBeVisible();
});

it('keeps diagnostics collapsed and reports zero registered devices as non-success', async () => {
  render(<NotificationSettings status={{ permission: 'granted', enabled: true }} diagnostics={{ lastTest: { outcome: 'no_registered_devices', tokenCount: 0 } }} />);
  expect(screen.queryByText('No registered devices')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Notification diagnostics' }));
  expect(screen.getByText('No registered devices')).toBeVisible();
});

it('offers current-device and partner-device tests', async () => {
  const testThisDevice = vi.fn();
  const testPartnerDevices = vi.fn();
  render(<NotificationSettings status={{ permission: 'granted', enabled: true }} diagnostics={{}} onTestThisDevice={testThisDevice} onTestPartnerDevices={testPartnerDevices} />);
  await userEvent.click(screen.getByRole('button', { name: 'Notification diagnostics' }));
  expect(screen.getByRole('button', { name: 'Test this device' })).toBeVisible();
  expect(screen.getByRole('button', { name: "Test partner's devices" })).toBeVisible();
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx vitest run src/components/NotificationSettings.test.jsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the settings component and wire both screens**

Replace the legacy `VITE_ENABLE_PUSH_DEBUG` panel and handlers in `MainScreen.jsx` with `NotificationSettings`. Diagnostics are always present in production but collapsed by default. Pass the hook interface from `App.jsx` to both `MainScreen` and `PairingScreen`.

Add a Pairing-screen `Enable notifications` action that is manual only. For both logout paths, use:

```js
const handleLogout = async () => {
  try {
    await cleanupNotificationsBeforeLogout();
  } catch (error) {
    console.warn('Notification cleanup before logout failed.', { code: error?.code || 'unknown' });
  } finally {
    await signOut(auth);
  }
};
```

Do not automatically display `NotificationPrompt` on the Pairing screen.

- [ ] **Step 4: Add focused styles**

Add styles for `.notification-prompt`, `.notification-setting`, `.notification-diagnostics`, `.notification-status`, and `.pairing-notification-action`. Preserve 44px touch targets, existing glass surfaces, safe-area behavior, reduced-motion behavior, and current mobile hover policy.

- [ ] **Step 5: Run component tests and mobile policy tests**

Run: `npx vitest run src/components/NotificationSettings.test.jsx src/components/NotificationPrompt.test.jsx && node --test src/components/mobileHoverPolicy.test.js src/components/PairingOfflineActions.test.js`

Expected: PASS.

- [ ] **Step 6: Commit notification controls**

```bash
git add src/App.jsx src/components/MainScreen.jsx src/components/PairingScreen.jsx src/components/NotificationSettings.jsx src/components/NotificationSettings.test.jsx src/index.css
git commit -m "add notification settings and diagnostics ui"
```

## Task 5: Testable Backend Push Core And Token Ownership

**Files:**
- Create: `functions/push.js`
- Create: `functions/push.test.js`
- Modify: `functions/package.json`
- Modify: `functions/index.js`
- Modify: `firestore.rules`

- [ ] **Step 1: Add the Functions test command**

Change `functions/package.json` scripts to include:

```json
"test": "node --test *.test.js"
```

- [ ] **Step 2: Write failing backend tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPushMessage,
  dedupeRegistrations,
  enforceTestCooldown,
  tokenFingerprint
} from './push.js';

test('data-only messages contain stable event identity and no notification payload', () => {
  const message = buildPushMessage({ eventId: 'photo:p1', type: 'photo_received', title: 'New photo', body: 'Bilal sent you a photo.', data: { photoId: 'p1' } });
  assert.equal(message.notification, undefined);
  assert.equal(message.data.eventId, 'photo:p1');
  assert.equal(message.data.type, 'photo_received');
});

test('duplicate token values target one device response slot', () => {
  const registrations = dedupeRegistrations([
    { ref: 'a', token: 'same' }, { ref: 'b', token: 'same' }, { ref: 'c', token: 'other' }
  ]);
  assert.deepEqual(registrations.map((item) => item.token), ['same', 'other']);
});

test('test cooldown applies across both diagnostic actions', () => {
  assert.throws(() => enforceTestCooldown({ lastTestAtMs: 1000, nowMs: 9000, cooldownMs: 10000 }), /2000/);
  assert.doesNotThrow(() => enforceTestCooldown({ lastTestAtMs: 1000, nowMs: 11000, cooldownMs: 10000 }));
});

test('token fingerprints are stable and do not expose the token', () => {
  const fingerprint = tokenFingerprint('secret-token');
  assert.equal(fingerprint, tokenFingerprint('secret-token'));
  assert.equal(fingerprint.includes('secret-token'), false);
});
```

- [ ] **Step 3: Run Functions tests and verify the module is missing**

Run: `npm --prefix functions test`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `push.js`.

- [ ] **Step 4: Implement backend push primitives**

Export these functions from `functions/push.js`:

```js
tokenFingerprint(token)
buildPushMessage({ eventId, type, title, body, data, link, ttlSeconds })
dedupeRegistrations(registrations)
registerDeviceToken({ db, uid, token, deviceId, permission, userAgent, now })
removeDeviceToken({ db, uid, deviceId })
loadActiveRegistrations({ db, uid, now, maxAgeDays: 60 })
sendPushToUser({ db, messaging, uid, event, context, now })
enforceTestCooldown({ lastTestAtMs, nowMs, cooldownMs: 10000 })
recordTestCooldown({ db, uid, now })
getNotificationDiagnostics({ db, uid, deviceId, partnerId, now })
expireStaleRegistrations({ db, now, maxAgeDays: 60 })
```

Use a backend-owned global registry such as `fcmTokenRegistry/{tokenFingerprint}` to enforce single-user ownership. Store device records at `users/{uid}/fcmTokens/{deviceId}` so device removal does not require the client to send the raw token. Use a Firestore transaction when moving ownership.

- [ ] **Step 5: Convert callable wrappers to the new schema**

In `functions/index.js`:

- `registerFcmToken` accepts `{ token, deviceId, permission, userAgent }`.
- `removeFcmToken` accepts `{ deviceId }`.
- Add `getNotificationDiagnostics`.
- Add `sendTestPushToThisDevice`.
- Replace `sendTestPushNotification` with `sendTestPushToPartnerDevices` while retaining a temporary compatibility export if the deployed old client still calls the old name.
- Add scheduled `expireFcmTokens`.

Return this result shape consistently:

```js
{
  ok: outcome === 'sent',
  outcome,
  tokenCount,
  successCount,
  failureCount,
  staleDeletedCount,
  failureCodes
}
```

Use `outcome: 'no_registered_devices'` when `tokenCount === 0`.

- [ ] **Step 6: Lock down the global registry in rules**

Add:

```firestore
match /fcmTokenRegistry/{fingerprint} {
  allow read, write: if false;
}
```

Keep `users/{uid}/fcmTokens/{deviceId}` backend-only.

- [ ] **Step 7: Run Functions tests and lint**

Run: `npm --prefix functions test && npm run lint:functions`

Expected: PASS.

- [ ] **Step 8: Commit token ownership and diagnostics backend**

```bash
git add functions/push.js functions/push.test.js functions/package.json functions/index.js firestore.rules
git commit -m "add reliable push token backend"
```

## Task 6: Data-Only Photo And Like Delivery

**Files:**
- Modify: `functions/push.test.js`
- Modify: `functions/index.js`
- Modify: `functions/push.js`

- [ ] **Step 1: Add failing event-construction tests**

```js
test('photo and like events use deterministic event ids and approved copy', () => {
  assert.deepEqual(createPhotoReceivedEvent({ photoId: 'p1', coupleId: 'c1', senderName: 'Bilal' }), {
    eventId: 'photo_received:c1:p1', type: 'photo_received', title: "You've got a new photo!",
    body: 'Bilal sent you a photo.', data: { coupleId: 'c1', photoId: 'p1' }, link: '/', ttlSeconds: 86400
  });
  assert.equal(createLikeReceivedEvent({ photoId: 'p1', coupleId: 'c1', likerId: 'u1', likeTimestamp: 't1', senderName: 'Bilal' }).eventId, 'like_received:c1:p1:u1:t1');
});
```

- [ ] **Step 2: Run the focused test and verify missing exports**

Run: `node --test --test-name-pattern="photo and like" functions/push.test.js`

Expected: FAIL because event builders are not exported.

- [ ] **Step 3: Implement builders and update triggers**

Export `createPhotoReceivedEvent` and `createLikeReceivedEvent` from `functions/push.js`. Update `notifyPhotoReceived` and `notifyPhotoLiked` to call `sendPushToUser` with data-only messages. Preserve current recipient validation and structured logs, adding `eventId` and `outcome`.

- [ ] **Step 4: Run Functions tests and lint**

Run: `npm --prefix functions test && npm run lint:functions`

Expected: PASS.

- [ ] **Step 5: Commit data-only photo and like pushes**

```bash
git add functions/push.js functions/push.test.js functions/index.js
git commit -m "deduplicate photo and like pushes"
```

## Task 7: Pairing Request, Acceptance, And Removal Pushes

**Files:**
- Modify: `functions/push.test.js`
- Modify: `functions/push.js`
- Modify: `functions/index.js`

- [ ] **Step 1: Add failing pairing-event tests**

```js
test('pairing events have stable ids and approved destinations', () => {
  assert.equal(createPairingRequestEvent({ requestId: 'r1', senderName: 'Bilal' }).eventId, 'pairing_request:r1');
  assert.equal(createPairingAcceptedEvent({ requestId: 'r1', senderName: 'Ada' }).eventId, 'pairing_accepted:r1');
  assert.equal(createPairingRemovedEvent({ coupleId: 'c1', removalId: 'remove-1', senderName: 'Ada' }).eventId, 'pairing_removed:c1:remove-1');
});
```

- [ ] **Step 2: Run the focused test and verify missing exports**

Run: `node --test --test-name-pattern="pairing events" functions/push.test.js`

Expected: FAIL because pairing event builders do not exist.

- [ ] **Step 3: Add pairing event builders and send hooks**

- Add `notifyPairingRequest` with `onDocumentCreated('pairingRequests/{requestId}')`. Validate `senderId`, `recipientId`, and `status === 'pending'`, then send `pairing_request` to the recipient. This covers every current or future request-creation path without coupling delivery to one callable.
- In `acceptPairingRequest`, capture the original sender, create the couple, resolve the request, then send `pairing_accepted` to the original sender.
- In `removePairing`, generate a `removalId` before clearing relationship data, write it to the Firestore in-app notification, and send `pairing_removed` to each former partner.
- Do not make pairing success depend on FCM; catch send failures, log them with the event ID, and preserve the completed pairing operation.
- Pairing-code redemption creates a couple immediately and therefore sends `pairing_accepted` to the code creator using an event ID derived from the code and resulting couple.

- [ ] **Step 4: Run Functions tests and lint**

Run: `npm --prefix functions test && npm run lint:functions`

Expected: PASS.

- [ ] **Step 5: Commit pairing push events**

```bash
git add functions/push.js functions/push.test.js functions/index.js
git commit -m "send pairing push notifications"
```

## Task 8: Messaging Service Worker Display And Click Routing

**Files:**
- Create: `public/firebase-messaging-sw-core.js`
- Modify: `public/firebase-messaging-sw.js`
- Create: `src/components/FirebaseMessagingWorker.test.js`
- Modify: `public/_headers`

- [ ] **Step 1: Write failing source contract tests**

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const worker = readFileSync(new URL('../../public/firebase-messaging-sw.js', import.meta.url), 'utf8');
const core = readFileSync(new URL('../../public/firebase-messaging-sw-core.js', import.meta.url), 'utf8');

test('messaging worker uses data-only payloads and event-id deduplication', () => {
  assert.match(worker, /payload\.data/);
  assert.match(worker, /rememberEvent/);
  assert.doesNotMatch(worker, /payload\.notification/);
  assert.match(core, /pairing=requests/);
  assert.match(core, /photoId/);
});
```

- [ ] **Step 2: Run the focused test and verify core file is missing**

Run: `node --test src/components/FirebaseMessagingWorker.test.js`

Expected: FAIL reading `firebase-messaging-sw-core.js`.

- [ ] **Step 3: Implement worker helpers and one-display ownership**

`firebase-messaging-sw-core.js` must expose through `self.PocofotoMessaging`:

```js
parsePushData(data)
notificationOptions(event)
destinationFor(event)
rememberEvent(eventId, cachesApi)
```

Use a small Cache Storage entry set under `pocofoto-push-events-v1` to remember up to 50 event IDs. In `firebase-messaging-sw.js`, call `rememberEvent(event.eventId)` before `showNotification`. Use event-specific tags and place all routing data in `options.data`.

- [ ] **Step 4: Implement practical click destinations**

- Pairing events: `/?pairing=requests`.
- Photo/like events: `/?notification=photo&photoId=<encoded id>`.
- Fallback: `/`.
- Focus and navigate an existing same-origin window before opening a new one.

- [ ] **Step 5: Verify worker cache headers and tests**

Ensure `public/_headers` keeps both `/firebase-messaging-sw.js` and `/firebase-messaging-sw-core.js` at `Cache-Control: no-cache`.

Run: `node --test src/components/FirebaseMessagingWorker.test.js && npm run build`

Expected: PASS and both worker files appear in `dist/`.

- [ ] **Step 6: Commit worker delivery**

```bash
git add public/firebase-messaging-sw.js public/firebase-messaging-sw-core.js public/_headers src/components/FirebaseMessagingWorker.test.js
git commit -m "deduplicate background push display"
```

## Task 9: Practical Notification Destinations And Diagnostics Completion

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/MainScreen.jsx`
- Modify: `src/components/PairingScreen.jsx`
- Modify: `src/components/NotificationSettings.jsx`
- Modify: `src/components/NotificationSettings.test.jsx`
- Modify: `src/hooks/useNotifications.js`
- Modify: `src/hooks/useNotifications.test.jsx`

- [ ] **Step 1: Add failing destination and cooldown UI tests**

```jsx
it('turns a photo notification query into a one-shot focus intent', () => {
  const intent = readNotificationIntent('?notification=photo&photoId=p1');
  expect(intent).toEqual({ type: 'photo', photoId: 'p1' });
});

it('disables both tests during the shared cooldown', async () => {
  render(<NotificationSettings status={{ permission: 'granted', enabled: true }} diagnostics={{}} cooldownUntil={Date.now() + 10000} />);
  await userEvent.click(screen.getByRole('button', { name: 'Notification diagnostics' }));
  expect(screen.getByRole('button', { name: 'Test this device' })).toBeDisabled();
  expect(screen.getByRole('button', { name: "Test partner's devices" })).toBeDisabled();
});
```

- [ ] **Step 2: Run focused tests and verify missing intent helper**

Run: `npx vitest run src/hooks/useNotifications.test.jsx src/components/NotificationSettings.test.jsx`

Expected: FAIL for the missing `readNotificationIntent` behavior.

- [ ] **Step 3: Implement one-shot destination handling**

Export `readNotificationIntent(search)` and `clearNotificationIntent()` from the notification client layer. Pass `{ type: 'photo', photoId }` to `MainScreen`; if that photo is already in the loaded collection, switch to Home and call the existing history/home positioning path. Otherwise switch to Home without fetching older photos. Pairing query state routes to the Pairing screen's existing request list.

- [ ] **Step 4: Complete production diagnostics behavior**

- Refresh diagnostics when the disclosure opens and after enable, disable, or test actions.
- Show permission, support, worker status, device ID, token fingerprint, registration time, enabled state, partner token count, and last test counts.
- Never show the raw token.
- On `resource-exhausted`, parse `retryAfterSeconds`, set `cooldownUntil`, and disable both actions.
- Label `no_registered_devices` exactly as `No registered devices`.
- Label accepted sends as `Accepted by FCM`; do not claim device display.

- [ ] **Step 5: Run focused UI tests and lint**

Run: `npx vitest run src/hooks/useNotifications.test.jsx src/components/NotificationSettings.test.jsx && npm run lint`

Expected: PASS.

- [ ] **Step 6: Commit destinations and final diagnostics**

```bash
git add src/App.jsx src/components/MainScreen.jsx src/components/PairingScreen.jsx src/components/NotificationSettings.jsx src/components/NotificationSettings.test.jsx src/hooks/useNotifications.js src/hooks/useNotifications.test.jsx
git commit -m "complete notification diagnostics flow"
```

## Task 10: Documentation, Version, And Full Verification

**Files:**
- Modify: `README.md`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Update notification documentation**

Document:

- Automatic prompt timing for newly and already paired users.
- Manual Pairing/Profile enablement.
- Current-device-only switch behavior.
- Granted startup synchronization and 60-day expiry.
- Data-only foreground/background ownership.
- Five notification event types.
- Production diagnostics and 10-second test cooldown.
- The distinction between FCM acceptance and device display.

- [ ] **Step 2: Bump the app version**

Run: `npm version patch --no-git-tag-version`

Expected: `package.json` and `package-lock.json` advance from the current version by one patch release.

- [ ] **Step 3: Run all automated verification**

Run:

```bash
npm run test:unit
npm --prefix functions test
npm run lint
npm run lint:functions
npm run build
```

Expected: all commands PASS. The build may retain the existing large-chunk warning but must produce `dist/sw.js`, `dist/firebase-messaging-sw.js`, and `dist/firebase-messaging-sw-core.js`.

- [ ] **Step 4: Run emulator verification**

Run: `npm run emulators:fresh`

Verify with two authenticated browser sessions:

1. Enable current-device notifications from Pairing and Profile.
2. Confirm token ownership moves when the same browser changes accounts.
3. Confirm logout removes the current device registration.
4. Send photo, like, pairing request, acceptance, and removal events.
5. Confirm foreground produces one toast and background produces one system notification.
6. Confirm current-device and partner tests return explicit counts.
7. Confirm a repeated test within 10 seconds returns the cooldown error.

Expected: Firestore Emulator shows device-ID token documents, one global fingerprint owner per token, and no duplicate event display.

- [ ] **Step 5: Perform a real-device smoke test before deployment**

Use two real paired accounts on separate installed PWAs/browsers and verify `default`, `granted`, and `denied` permission states, reload, PWA update reload, background, closed PWA, multiple devices, and account switching. Compare client diagnostics with Firebase Functions logs; FCM acceptance alone is not sufficient evidence.

- [ ] **Step 6: Commit docs and version**

```bash
git add README.md package.json package-lock.json
git commit -m "document reliable push notifications"
```

## Deployment Order

Deployment is deliberately separate from implementation and requires explicit approval.

1. Deploy Firestore rules and backend Functions first.
2. Verify compatibility callables remain available for the currently deployed client.
3. Deploy the new web build.
4. Register one current device and inspect `registerFcmToken` plus diagnostics logs.
5. Run current-device and partner tests.
6. Send one real photo and one like in foreground and background.
7. Verify pairing request and acceptance with an unpaired recipient.
8. After the client rollout is established, remove compatibility callable aliases in a later cleanup release.
