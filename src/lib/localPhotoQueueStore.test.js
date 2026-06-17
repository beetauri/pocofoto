import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createLocalPhotoQueueKey,
  createLocalPhotoQueueStore
} from './localPhotoQueueStore.js';

function createFakeAdapter() {
  const values = new Map();
  return {
    async put(key, value) {
      values.set(key, value);
    },
    async get(key) {
      return values.get(key) || null;
    },
    async delete(key) {
      values.delete(key);
    }
  };
}

test('creates user and couple scoped queue keys', () => {
  assert.equal(createLocalPhotoQueueKey('user-a', 'couple-a'), 'user-a::couple-a::local-photo-queue');
  assert.equal(createLocalPhotoQueueKey('user-a', 'couple-b'), 'user-a::couple-b::local-photo-queue');
});

test('saves, loads, and clears local queued photos with an adapter', async () => {
  const store = createLocalPhotoQueueStore(createFakeAdapter());
  const queueKey = createLocalPhotoQueueKey('user-a', 'couple-a');
  const queuedPhotos = [
    {
      id: 'local-1',
      blob: new Blob(['photo'], { type: 'image/jpeg' }),
      caption: null,
      coupleId: 'couple-a',
      errorMessage: '',
      localOnly: true,
      senderId: 'user-a',
      sentAt: '2026-06-17T10:00:00.000Z',
      status: 'pending',
      timestamp: '2026-06-17T10:00:00.000Z'
    }
  ];

  await store.saveQueue(queueKey, queuedPhotos);

  assert.equal(await store.loadQueue(createLocalPhotoQueueKey('user-b', 'couple-a')), null);
  assert.deepEqual(await store.loadQueue(queueKey), queuedPhotos);

  await store.clearQueue(queueKey);

  assert.equal(await store.loadQueue(queueKey), null);
});
