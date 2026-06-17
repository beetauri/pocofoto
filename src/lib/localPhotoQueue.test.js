import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LOCAL_PHOTO_STATUS,
  appendLocalPhoto,
  createLocalPhoto,
  deleteLocalPhoto,
  findNextUploadableLocalPhoto,
  markLocalPhotoFailed,
  markLocalPhotoPending,
  markLocalPhotoUploading,
  mergeServerAndLocalPhotos,
  replaceLocalPhotoWithServerPhoto
} from './localPhotoQueue.js';

const baseInput = {
  blob: new Blob(['photo'], { type: 'image/jpeg' }),
  caption: { type: 'text', text: 'hello' },
  coupleId: 'couple-a',
  objectUrl: 'blob:local-a',
  senderId: 'user-a',
  sentAt: '2026-06-17T10:00:00.000Z'
};

test('creates local pending photos with feed-safe fields', () => {
  const photo = createLocalPhoto({ ...baseInput, id: 'local-1' });

  assert.equal(photo.id, 'local-1');
  assert.equal(photo.localOnly, true);
  assert.equal(photo.status, LOCAL_PHOTO_STATUS.PENDING);
  assert.equal(photo.photoUrl, 'blob:local-a');
  assert.equal(photo.senderId, 'user-a');
  assert.equal(photo.timestamp, '2026-06-17T10:00:00.000Z');
  assert.deepEqual(photo.caption, { type: 'text', text: 'hello' });
});

test('appends local photos after previous local photos', () => {
  const first = createLocalPhoto({ ...baseInput, id: 'local-1', sentAt: '2026-06-17T10:00:00.000Z' });
  const second = createLocalPhoto({ ...baseInput, id: 'local-2', objectUrl: 'blob:local-b', sentAt: '2026-06-17T10:00:01.000Z' });

  const queue = appendLocalPhoto(appendLocalPhoto([], first), second);

  assert.deepEqual(queue.map((photo) => photo.id), ['local-1', 'local-2']);
});

test('merges local photos before server photos without reshuffling pending items', () => {
  const serverPhotos = [
    { id: 'server-new', timestamp: '2026-06-17T10:05:00.000Z' },
    { id: 'server-old', timestamp: '2026-06-17T09:59:00.000Z' }
  ];
  const localPhotos = [
    createLocalPhoto({ ...baseInput, id: 'local-1', sentAt: '2026-06-17T10:00:00.000Z' }),
    createLocalPhoto({ ...baseInput, id: 'local-2', sentAt: '2026-06-17T10:00:01.000Z' })
  ];

  const merged = mergeServerAndLocalPhotos(serverPhotos, localPhotos);

  assert.deepEqual(merged.map((photo) => photo.id), ['local-1', 'local-2', 'server-new', 'server-old']);
});

test('selects pending uploads sequentially and skips failed items', () => {
  const failed = markLocalPhotoFailed(
    markLocalPhotoUploading(createLocalPhoto({ ...baseInput, id: 'local-1' })),
    'network'
  );
  const pending = createLocalPhoto({ ...baseInput, id: 'local-2', objectUrl: 'blob:local-b' });

  assert.equal(findNextUploadableLocalPhoto([failed, pending])?.id, 'local-2');
});

test('retry affects only the requested failed photo', () => {
  const failedA = markLocalPhotoFailed(createLocalPhoto({ ...baseInput, id: 'local-1' }), 'network');
  const failedB = markLocalPhotoFailed(createLocalPhoto({ ...baseInput, id: 'local-2' }), 'timeout');

  const nextQueue = markLocalPhotoPending([failedA, failedB], 'local-2');

  assert.equal(nextQueue[0].status, LOCAL_PHOTO_STATUS.FAILED);
  assert.equal(nextQueue[1].status, LOCAL_PHOTO_STATUS.PENDING);
  assert.equal(nextQueue[1].errorMessage, '');
});

test('delete removes only the requested local photo', () => {
  const first = createLocalPhoto({ ...baseInput, id: 'local-1' });
  const second = createLocalPhoto({ ...baseInput, id: 'local-2' });

  const nextQueue = deleteLocalPhoto([first, second], 'local-1');

  assert.deepEqual(nextQueue.map((photo) => photo.id), ['local-2']);
});

test('server replacement removes the local item and returns server photo for reconciliation', () => {
  const localQueue = [
    createLocalPhoto({ ...baseInput, id: 'local-1' }),
    createLocalPhoto({ ...baseInput, id: 'local-2', objectUrl: 'blob:local-b' })
  ];
  const serverPhoto = {
    id: 'server-1',
    photoUrl: 'https://example.test/photo.jpg',
    senderId: 'user-a',
    timestamp: '2026-06-17T10:00:00.000Z',
    liked: false
  };

  const result = replaceLocalPhotoWithServerPhoto(localQueue, 'local-1', serverPhoto);

  assert.deepEqual(result.localPhotos.map((photo) => photo.id), ['local-2']);
  assert.deepEqual(result.serverPhoto, serverPhoto);
});
