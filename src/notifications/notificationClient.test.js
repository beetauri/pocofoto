import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createNotificationClient,
  formatTokenFingerprint,
  readNotificationIntent
} from './notificationClient.js';

test('granted startup registers current token without requesting permission', async () => {
  const calls = [];
  const client = createNotificationClient({
    notificationApi: { permission: 'granted', requestPermission: async () => 'granted' },
    getDeviceId: () => 'device-1',
    getMessagingRegistration: async () => ({ active: {} }),
    getToken: async () => 'token-1',
    deleteToken: async () => true,
    call: async (name, data) => {
      calls.push({ name, data });
      return { ok: true, tokenFingerprint: 'fp-token-1' };
    },
    vapidKey: 'vapid',
    userAgent: 'Test Browser'
  });

  const result = await client.syncGrantedPermission();

  assert.equal(result.status, 'registered');
  assert.equal(result.tokenFingerprint, 'fp-token-1');
  assert.deepEqual(calls, [{
    name: 'registerFcmToken',
    data: {
      token: 'token-1',
      deviceId: 'device-1',
      permission: 'granted',
      userAgent: 'Test Browser'
    }
  }]);
});

test('enable requests permission only from the explicit action', async () => {
  let requests = 0;
  const client = createNotificationClient({
    notificationApi: {
      permission: 'default',
      requestPermission: async () => {
        requests += 1;
        return 'denied';
      }
    },
    getDeviceId: () => 'device-1',
    getMessagingRegistration: async () => ({}),
    getToken: async () => 'unused',
    deleteToken: async () => true,
    call: async () => ({ ok: true }),
    vapidKey: 'vapid'
  });

  assert.equal((await client.syncGrantedPermission()).status, 'default');
  assert.equal(requests, 0);
  assert.equal((await client.enable()).status, 'denied');
  assert.equal(requests, 1);
});

test('disable removes server registration even if local token deletion fails', async () => {
  const calls = [];
  let preference = null;
  const client = createNotificationClient({
    notificationApi: { permission: 'granted' },
    getDeviceId: () => 'device-1',
    getNotificationsEnabled: () => preference,
    setNotificationsEnabled: (enabled) => {
      preference = enabled;
    },
    getMessagingRegistration: async () => ({}),
    getToken: async () => 'token-1',
    deleteToken: async () => {
      throw new Error('local delete failed');
    },
    call: async (name, data) => {
      calls.push({ name, data });
      return { ok: true };
    },
    vapidKey: 'vapid'
  });

  const result = await client.disable();

  assert.equal(result.status, 'disabled');
  assert.equal(client.getStatus().enabled, false);
  assert.equal(preference, false);
  assert.equal(calls.at(-1).name, 'removeFcmToken');
  assert.deepEqual(calls.at(-1).data, { deviceId: 'device-1' });
});

test('startup sync respects a stored current-device opt-out', async () => {
  const calls = [];
  const client = createNotificationClient({
    notificationApi: { permission: 'granted' },
    getDeviceId: () => 'device-1',
    getNotificationsEnabled: () => false,
    setNotificationsEnabled: () => {},
    getMessagingRegistration: async () => ({}),
    getToken: async () => 'token-1',
    deleteToken: async () => true,
    call: async (name, data) => {
      calls.push({ name, data });
      return { ok: true };
    },
    vapidKey: 'vapid'
  });

  assert.equal(client.getStatus().enabled, false);
  assert.equal((await client.syncGrantedPermission()).status, 'disabled');
  assert.deepEqual(calls, []);
});

test('logout cleanup removes registration without persisting a disabled preference', async () => {
  const calls = [];
  let preference = true;
  const client = createNotificationClient({
    notificationApi: { permission: 'granted' },
    getDeviceId: () => 'device-1',
    getNotificationsEnabled: () => preference,
    setNotificationsEnabled: (enabled) => {
      preference = enabled;
    },
    getMessagingRegistration: async () => ({}),
    getToken: async () => 'token-1',
    deleteToken: async () => true,
    call: async (name, data) => {
      calls.push({ name, data });
      return { ok: true };
    },
    vapidKey: 'vapid'
  });

  assert.equal((await client.cleanupBeforeLogout()).status, 'removed');
  assert.equal(preference, true);
  assert.equal(calls.at(-1).name, 'removeFcmToken');
});

test('diagnostics and token fingerprints never expose raw tokens', async () => {
  const client = createNotificationClient({
    notificationApi: { permission: 'granted' },
    getDeviceId: () => 'device-1',
    getMessagingRegistration: async () => ({ active: { state: 'activated' } }),
    getToken: async () => 'secret-token-value',
    deleteToken: async () => true,
    call: async (name) => name === 'getNotificationDiagnostics'
      ? { ok: true, tokenFingerprint: formatTokenFingerprint('secret-token-value') }
      : { ok: true },
    vapidKey: 'vapid'
  });

  const diagnostics = await client.getDiagnostics();

  assert.equal(diagnostics.deviceId, 'device-1');
  assert.equal(diagnostics.workerState, 'activated');
  assert.equal(diagnostics.tokenFingerprint.includes('secret-token-value'), false);
});

test('notification click search params become app intents', () => {
  assert.deepEqual(readNotificationIntent('?notification=photo&photoId=photo-1'), {
    type: 'photo',
    photoId: 'photo-1'
  });
  assert.deepEqual(readNotificationIntent('?pairing=requests'), { type: 'pairing' });
  assert.equal(readNotificationIntent('?notification=photo'), null);
});
