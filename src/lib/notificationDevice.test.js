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
  const store = createNotificationDeviceStore({
    storage,
    randomUUID: () => 'device-1',
    now: () => 1000
  });

  assert.equal(store.getDeviceId(), 'device-1');
  assert.equal(store.getDeviceId(), 'device-1');
  store.dismissPrompt('user-a');
  assert.equal(store.isPromptDismissed('user-a'), true);
  assert.equal(store.isPromptDismissed('user-b'), false);
});

test('recent event ids are bounded and reject duplicates', () => {
  const store = createNotificationDeviceStore({
    storage: memoryStorage(),
    randomUUID: () => 'device-1',
    now: () => 1000,
    maxRecentEvents: 2
  });

  assert.equal(store.rememberEvent('event-1'), true);
  assert.equal(store.rememberEvent('event-1'), false);
  store.rememberEvent('event-2');
  store.rememberEvent('event-3');
  assert.equal(store.hasSeenEvent('event-1'), false);
});

test('permission state maps unsupported and browser values', () => {
  assert.equal(notificationPermissionState(undefined), 'unsupported');
  assert.equal(notificationPermissionState({ permission: 'default' }), 'default');
  assert.equal(notificationPermissionState({ permission: 'denied' }), 'denied');
  assert.equal(notificationPermissionState({ permission: 'granted' }), 'granted');
  assert.equal(notificationPermissionState({ permission: 'unexpected' }), 'unsupported');
});
