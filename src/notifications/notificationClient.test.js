import assert from 'node:assert/strict';
import test from 'node:test';

import { createNotificationClient, formatTokenFingerprint } from './notificationClient.js';

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
  const client = createNotificationClient({
    notificationApi: { permission: 'granted' },
    getDeviceId: () => 'device-1',
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
  assert.equal(calls.at(-1).name, 'removeFcmToken');
  assert.deepEqual(calls.at(-1).data, { deviceId: 'device-1' });
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
