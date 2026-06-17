# Inline Local Photo Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the review/send flow so sent photos appear immediately at the end of the existing feed as local pending items, upload sequentially, survive relaunch, and reconcile into server-authoritative order after confirmation.

**Architecture:** Keep one feed by extending the existing paginated photo source with a local-only queue appended after server photos. `MainScreen` owns upload orchestration because it already owns capture, caption, Firebase Storage, Firestore writes, and review drafts. A small IndexedDB-backed queue store persists local blobs and statuses across reloads; pure queue helpers make append/update/reconcile behavior testable without rendering the full camera screen.

**Tech Stack:** React, Vite, Firebase Storage, Firestore, IndexedDB, Node test runner, existing CSS.

---

## Issue Source

Linear issue: `POC-100` - "Refactor review/send flow for inline local photo queue"

Key requirements:
- One feed only; no separate outbox.
- Send appends a local pending photo to the end of the feed immediately.
- Multiple sends append in send order.
- Uploads start sequentially in send/capture order.
- Pending and failed items stay fixed inline until resolved or deleted.
- Partner photos arriving during local pending uploads must not reshuffle pending items.
- Success replaces the local item with the real server item and reconciles to server order.
- Pending UI: centered spinner + `Sending…` beneath image instead of normal metadata.
- Failure UI: red Retry button + icon-only Delete button beneath image.
- Failed items do not block later queued photos.
- Retry/delete are photo-specific.
- Pending and failed local items survive relaunch; pending resumes automatically.

## Current Repo Facts

- `src/components/MainScreen.jsx` owns review state, capture, send, upload, Firestore photo creation, and feed rendering.
- `handleSendReviewPhoto` currently awaits `uploadPhotoBlob`, so the review UI blocks until upload completes.
- `captureDisabled` currently includes `uploading` and `sendingReviewPhoto`, so users cannot keep shooting while a review photo is sending.
- `src/hooks/usePaginatedPhotos.js` currently returns only server-backed photos from Firestore pages plus local optimistic field updates.
- `src/hooks/photoPagination.js` currently dedupes server pages with `mergePhotoPages`.
- `src/lib/offlineReviewDraft.js` already demonstrates the local IndexedDB adapter style used by this project.
- Existing tests often use pure helper assertions and source-level assertions where full browser/camera rendering is too heavy.

## File Structure

- Create `src/lib/localPhotoQueue.js`
  - Pure queue constants and helpers.
  - Local item factory.
  - Append/update/delete helpers.
  - Server/local feed merge helper.
  - Queue selection helper that skips failed items.
- Create `src/lib/localPhotoQueue.test.js`
  - Unit tests for append order, fixed pending placement, failed skip behavior, retry isolation, delete isolation, and server reconciliation.
- Create `src/lib/localPhotoQueueStore.js`
  - IndexedDB-backed persistence for per-user/per-couple queued photo records.
  - Stores `Blob`, caption payload, object URL source metadata, status, error text, and timestamps.
  - Recreates `photoUrl` object URLs after load in `MainScreen`, not in the store.
- Create `src/lib/localPhotoQueueStore.test.js`
  - Adapter-level tests matching the existing offline draft style.
- Modify `src/hooks/usePaginatedPhotos.js`
  - Accept an optional `localPhotos` array.
  - Return `photos` as `mergeServerAndLocalPhotos(mergePhotoPages(firstPage, olderPages), localPhotos)`.
  - Expose `insertServerPhotoLocal(serverPhoto)` so a just-created server item can replace a local queue item immediately before the Firestore snapshot catches up.
- Modify `src/hooks/usePaginatedPhotos.test.js`
  - Add assertions for local photos appended after server photos and server replacement behavior.
- Modify `src/components/MainScreen.jsx`
  - Add local queue state and persistence load/save effects.
  - Change send flow to enqueue immediately, clear review UI, and allow continued capture.
  - Add sequential upload pump that skips failed items and continues later queued photos.
  - Add photo-specific retry/delete handlers.
  - Render pending/failed metadata actions instead of normal meta/status/like controls.
  - Avoid revoking review object URLs after ownership transfers to the local queue.
- Modify `src/components/MainScreenOfflineCapture.test.js`
  - Update offline/send assertions for the new queue behavior.
- Add or modify `src/components/MainScreenLocalQueue.test.js`
  - Source-level coverage for queue pump, `Sending…`, Retry/Delete handlers, and capture no longer blocked by queue uploads.
- Modify `src/index.css`
  - Add pending and failed inline metadata styles under existing `.photo-meta-row` area.
  - Keep layout height stable to prevent feed jumps.

---

### Task 1: Add Pure Local Queue Helpers

**Files:**
- Create: `src/lib/localPhotoQueue.js`
- Create: `src/lib/localPhotoQueue.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/localPhotoQueue.test.js`:

```js
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

test('merges local photos after server photos without reshuffling pending items', () => {
  const serverPhotos = [
    { id: 'server-new', timestamp: '2026-06-17T10:05:00.000Z' },
    { id: 'server-old', timestamp: '2026-06-17T09:59:00.000Z' }
  ];
  const localPhotos = [
    createLocalPhoto({ ...baseInput, id: 'local-1', sentAt: '2026-06-17T10:00:00.000Z' }),
    createLocalPhoto({ ...baseInput, id: 'local-2', sentAt: '2026-06-17T10:00:01.000Z' })
  ];

  const merged = mergeServerAndLocalPhotos(serverPhotos, localPhotos);

  assert.deepEqual(merged.map((photo) => photo.id), ['server-new', 'server-old', 'local-1', 'local-2']);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --test src/lib/localPhotoQueue.test.js
```

Expected: FAIL because `src/lib/localPhotoQueue.js` does not exist yet.

- [ ] **Step 3: Implement pure helpers**

Create `src/lib/localPhotoQueue.js`:

```js
export const LOCAL_PHOTO_STATUS = {
  PENDING: 'pending',
  UPLOADING: 'uploading',
  FAILED: 'failed'
};

export function createLocalPhotoId(now = Date.now, random = Math.random) {
  return `local-photo-${now()}-${Math.floor(random() * 1e9).toString(36)}`;
}

export function createLocalPhoto({
  id = createLocalPhotoId(),
  blob,
  caption = null,
  coupleId,
  objectUrl,
  senderId,
  sentAt = new Date().toISOString(),
  status = LOCAL_PHOTO_STATUS.PENDING,
  errorMessage = ''
}) {
  return {
    id,
    localOnly: true,
    blob,
    caption,
    coupleId,
    errorMessage,
    liked: false,
    photoUrl: objectUrl,
    senderId,
    sentAt,
    status,
    timestamp: sentAt
  };
}

export function appendLocalPhoto(localPhotos, photo) {
  return [...localPhotos, photo];
}

export function updateLocalPhoto(localPhotos, photoId, updater) {
  return localPhotos.map((photo) => {
    if (photo.id !== photoId) return photo;
    return typeof updater === 'function' ? updater(photo) : { ...photo, ...updater };
  });
}

export function markLocalPhotoUploading(localPhotosOrPhoto, photoId = null) {
  if (Array.isArray(localPhotosOrPhoto)) {
    return updateLocalPhoto(localPhotosOrPhoto, photoId, {
      status: LOCAL_PHOTO_STATUS.UPLOADING,
      errorMessage: ''
    });
  }
  return {
    ...localPhotosOrPhoto,
    status: LOCAL_PHOTO_STATUS.UPLOADING,
    errorMessage: ''
  };
}

export function markLocalPhotoFailed(localPhotosOrPhoto, photoIdOrMessage, maybeMessage = '') {
  if (Array.isArray(localPhotosOrPhoto)) {
    return updateLocalPhoto(localPhotosOrPhoto, photoIdOrMessage, {
      status: LOCAL_PHOTO_STATUS.FAILED,
      errorMessage: maybeMessage || 'Upload failed'
    });
  }
  return {
    ...localPhotosOrPhoto,
    status: LOCAL_PHOTO_STATUS.FAILED,
    errorMessage: photoIdOrMessage || 'Upload failed'
  };
}

export function markLocalPhotoPending(localPhotos, photoId) {
  return updateLocalPhoto(localPhotos, photoId, {
    status: LOCAL_PHOTO_STATUS.PENDING,
    errorMessage: ''
  });
}

export function deleteLocalPhoto(localPhotos, photoId) {
  return localPhotos.filter((photo) => photo.id !== photoId);
}

export function findNextUploadableLocalPhoto(localPhotos) {
  return localPhotos.find((photo) => photo.status === LOCAL_PHOTO_STATUS.PENDING) || null;
}

export function mergeServerAndLocalPhotos(serverPhotos, localPhotos) {
  const serverIds = new Set(serverPhotos.map((photo) => photo.id));
  const unresolvedLocalPhotos = localPhotos.filter((photo) => photo.localOnly && !serverIds.has(photo.id));
  return [...serverPhotos, ...unresolvedLocalPhotos];
}

export function replaceLocalPhotoWithServerPhoto(localPhotos, localPhotoId, serverPhoto) {
  return {
    localPhotos: deleteLocalPhoto(localPhotos, localPhotoId),
    serverPhoto
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
node --test src/lib/localPhotoQueue.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/localPhotoQueue.js src/lib/localPhotoQueue.test.js
git commit -m "add local photo queue helpers"
```

---

### Task 2: Add IndexedDB Persistence for Queued Photos

**Files:**
- Create: `src/lib/localPhotoQueueStore.js`
- Create: `src/lib/localPhotoQueueStore.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/localPhotoQueueStore.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --test src/lib/localPhotoQueueStore.test.js
```

Expected: FAIL because the queue store does not exist yet.

- [ ] **Step 3: Implement the store**

Create `src/lib/localPhotoQueueStore.js`:

```js
const DB_NAME = 'pocofoto-local-photo-queue';
const STORE_NAME = 'queuedPhotos';
const DB_VERSION = 1;

export function createLocalPhotoQueueKey(userId, coupleId) {
  return `${userId}::${coupleId}::local-photo-queue`;
}

function getIndexedDB() {
  if (typeof indexedDB === 'undefined') return null;
  return indexedDB;
}

function createIndexedDBAdapter() {
  const openDatabase = () => new Promise((resolve, reject) => {
    const idb = getIndexedDB();
    if (!idb) {
      reject(new Error('IndexedDB is unavailable.'));
      return;
    }

    const request = idb.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onerror = () => reject(request.error || new Error('Unable to open local photo queue database.'));
    request.onsuccess = () => resolve(request.result);
  });

  const runTransaction = async (mode, operation) => {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      const request = operation(store);

      request.onerror = () => reject(request.error || new Error('Local photo queue operation failed.'));
      request.onsuccess = () => resolve(request.result || null);
      transaction.oncomplete = () => db.close();
      transaction.onerror = () => {
        db.close();
        reject(transaction.error || new Error('Local photo queue transaction failed.'));
      };
      transaction.onabort = () => {
        db.close();
        reject(transaction.error || new Error('Local photo queue transaction aborted.'));
      };
    });
  };

  return {
    put(key, value) {
      return runTransaction('readwrite', (store) => store.put(value, key));
    },
    get(key) {
      return runTransaction('readonly', (store) => store.get(key));
    },
    delete(key) {
      return runTransaction('readwrite', (store) => store.delete(key));
    }
  };
}

export function createLocalPhotoQueueStore(adapter = createIndexedDBAdapter()) {
  return {
    saveQueue(key, photos) {
      return adapter.put(key, photos);
    },
    loadQueue(key) {
      return adapter.get(key);
    },
    clearQueue(key) {
      return adapter.delete(key);
    }
  };
}

const defaultStore = createLocalPhotoQueueStore();

export function saveLocalPhotoQueue(key, photos) {
  return defaultStore.saveQueue(key, photos);
}

export function loadLocalPhotoQueue(key) {
  return defaultStore.loadQueue(key);
}

export function clearLocalPhotoQueue(key) {
  return defaultStore.clearQueue(key);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
node --test src/lib/localPhotoQueueStore.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/localPhotoQueueStore.js src/lib/localPhotoQueueStore.test.js
git commit -m "persist local photo queue"
```

---

### Task 3: Merge Local Queue Into Existing Feed Hook

**Files:**
- Modify: `src/hooks/usePaginatedPhotos.js`
- Modify: `src/hooks/usePaginatedPhotos.test.js`

- [ ] **Step 1: Write the failing tests**

Update `src/hooks/usePaginatedPhotos.test.js` imports:

```js
import {
  INITIAL_PHOTO_LIMIT,
  PHOTO_PAGE_SIZE,
  mergePhotoPages
} from './photoPagination.js';
import { mergeServerAndLocalPhotos } from '../lib/localPhotoQueue.js';
```

Add these tests:

```js
test('appends local queue photos after merged server pages', () => {
  const serverPhotos = mergePhotoPages(
    [{ id: 'server-2' }, { id: 'server-1' }],
    [[{ id: 'older-1' }]]
  );
  const photos = mergeServerAndLocalPhotos(serverPhotos, [
    { id: 'local-1', localOnly: true },
    { id: 'local-2', localOnly: true }
  ]);

  assert.deepEqual(photos.map((photo) => photo.id), ['server-2', 'server-1', 'older-1', 'local-1', 'local-2']);
});

test('usePaginatedPhotos accepts local photos and exposes server insertion for reconciliation', () => {
  assert.match(source, /export function usePaginatedPhotos\(coupleId, localPhotos = \[\]\)/);
  assert.match(source, /mergeServerAndLocalPhotos\(mergePhotoPages\(firstPage, olderPages\), localPhotos\)/);
  assert.match(source, /const insertServerPhotoLocal = useCallback/);
  assert.match(source, /insertServerPhotoLocal/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --test src/hooks/usePaginatedPhotos.test.js
```

Expected: FAIL until `usePaginatedPhotos` accepts local photos and imports the merge helper.

- [ ] **Step 3: Implement hook merge and server insertion**

Modify `src/hooks/usePaginatedPhotos.js`:

```js
import { mergeServerAndLocalPhotos } from '../lib/localPhotoQueue.js';
```

Change the function signature:

```js
export function usePaginatedPhotos(coupleId, localPhotos = []) {
```

Replace the existing `photos` memo with:

```js
const photos = useMemo(
  () => mergeServerAndLocalPhotos(mergePhotoPages(firstPage, olderPages), localPhotos),
  [firstPage, olderPages, localPhotos]
);
```

Add this callback after `updatePhotoLocal`:

```js
const insertServerPhotoLocal = useCallback((serverPhoto) => {
  if (!serverPhoto?.id) return;

  const insertSorted = (page) => {
    const withoutDuplicate = page.filter((photo) => photo.id !== serverPhoto.id);
    return [...withoutDuplicate, serverPhoto].sort((a, b) => {
      const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return bTime - aTime;
    });
  };

  setFirstPage((page) => insertSorted(page));
  firstPageRef.current = insertSorted(firstPageRef.current);
}, []);
```

Return it:

```js
return {
  photos,
  loadingPhotos,
  loadingMorePhotos,
  photoLoadError,
  hasMorePhotos,
  loadMorePhotos,
  updatePhotoLocal,
  insertServerPhotoLocal
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
node --test src/hooks/usePaginatedPhotos.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePaginatedPhotos.js src/hooks/usePaginatedPhotos.test.js
git commit -m "merge local photo queue into feed"
```

---

### Task 4: Refactor MainScreen Send Flow Into an Inline Queue

**Files:**
- Modify: `src/components/MainScreen.jsx`
- Modify: `src/components/MainScreenOfflineCapture.test.js`
- Create: `src/components/MainScreenLocalQueue.test.js`

- [ ] **Step 1: Write failing source-level tests**

Create `src/components/MainScreenLocalQueue.test.js`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./MainScreen.jsx', import.meta.url), 'utf8');

test('MainScreen wires local queued photos into the shared feed hook', () => {
  assert.match(source, /usePaginatedPhotos\(coupleId, localPhotos\)/);
  assert.match(source, /setLocalPhotos\(\(current\) => appendLocalPhoto\(current, localPhoto\)\)/);
});

test('review send enqueues immediately instead of awaiting upload', () => {
  assert.match(source, /const handleSendReviewPhoto = \(\) => \{/);
  assert.match(source, /const localPhoto = createLocalPhoto/);
  assert.match(source, /preserveObjectUrl: true/);
  assert.doesNotMatch(source, /await uploadPhotoBlob\(reviewPhoto\.blob, caption\);[\s\S]*setSendAnimationState\('sent'\)/);
});

test('queue uploads sequentially and failed items do not block later pending items', () => {
  assert.match(source, /queueUploadInFlightRef/);
  assert.match(source, /findNextUploadableLocalPhoto\(localPhotosRef\.current\)/);
  assert.match(source, /markLocalPhotoFailed/);
  assert.match(source, /processLocalPhotoQueue/);
});

test('retry and delete are photo-specific', () => {
  assert.match(source, /const handleRetryLocalPhoto = useCallback\(\(photoId\) =>/);
  assert.match(source, /markLocalPhotoPending\(current, photoId\)/);
  assert.match(source, /const handleDeleteLocalPhoto = useCallback\(\(photoId\) =>/);
  assert.match(source, /deleteLocalPhoto\(current, photoId\)/);
});

test('capture is not blocked by background queue uploads', () => {
  assert.match(source, /const \[queueUploadingPhotoId, setQueueUploadingPhotoId\] = useState\(null\)/);
  assert.doesNotMatch(source, /const captureDisabled = uploading\s*\|\|\s*sendingReviewPhoto/);
});
```

Update `src/components/MainScreenOfflineCapture.test.js`:

```js
test('MainScreen blocks queueing a review photo while offline', () => {
  assert.match(mainScreenSource, /Reconnect to send/);
  assert.match(mainScreenSource, /if \(!isOnline\) \{/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --test src/components/MainScreenLocalQueue.test.js src/components/MainScreenOfflineCapture.test.js
```

Expected: FAIL until `MainScreen` is refactored.

- [ ] **Step 3: Add imports and queue state**

In `src/components/MainScreen.jsx`, add imports:

```js
import {
  LOCAL_PHOTO_STATUS,
  appendLocalPhoto,
  createLocalPhoto,
  deleteLocalPhoto,
  findNextUploadableLocalPhoto,
  markLocalPhotoFailed,
  markLocalPhotoPending,
  markLocalPhotoUploading,
  replaceLocalPhotoWithServerPhoto
} from '../lib/localPhotoQueue';
import {
  clearLocalPhotoQueue,
  createLocalPhotoQueueKey,
  loadLocalPhotoQueue,
  saveLocalPhotoQueue
} from '../lib/localPhotoQueueStore';
```

Add state/refs near review state:

```js
const [localPhotos, setLocalPhotos] = useState([]);
const [queueUploadingPhotoId, setQueueUploadingPhotoId] = useState(null);
const localPhotosRef = useRef([]);
const queueUploadInFlightRef = useRef(false);
```

Add queue key near `reviewDraftKey`:

```js
const localPhotoQueueKey = user?.uid && coupleId ? createLocalPhotoQueueKey(user.uid, coupleId) : null;
```

Pass local photos into the hook and receive the insertion callback:

```js
const {
  photos,
  loadingPhotos,
  loadingMorePhotos,
  photoLoadError,
  hasMorePhotos,
  loadMorePhotos,
  updatePhotoLocal,
  insertServerPhotoLocal
} = usePaginatedPhotos(coupleId, localPhotos);
```

Keep the ref synced:

```js
useEffect(() => {
  localPhotosRef.current = localPhotos;
}, [localPhotos]);
```

- [ ] **Step 4: Load and persist queue records**

Add a queue load effect:

```js
useEffect(() => {
  let active = true;
  if (!localPhotoQueueKey) {
    setLocalPhotos([]);
    return undefined;
  }

  loadLocalPhotoQueue(localPhotoQueueKey)
    .then((savedPhotos) => {
      if (!active || !Array.isArray(savedPhotos)) return;
      const restoredPhotos = savedPhotos.map((photo) => ({
        ...photo,
        photoUrl: URL.createObjectURL(photo.blob),
        status: photo.status === LOCAL_PHOTO_STATUS.FAILED
          ? LOCAL_PHOTO_STATUS.FAILED
          : LOCAL_PHOTO_STATUS.PENDING
      }));
      setLocalPhotos(restoredPhotos);
    })
    .catch((err) => {
      console.warn('Unable to restore local photo queue.', err);
    });

  return () => {
    active = false;
  };
}, [localPhotoQueueKey]);
```

Add persistence:

```js
useEffect(() => {
  if (!localPhotoQueueKey) return;
  const persistablePhotos = localPhotos.map(({ photoUrl, ...photo }) => photo);
  if (persistablePhotos.length === 0) {
    clearLocalPhotoQueue(localPhotoQueueKey).catch((err) => {
      console.warn('Unable to clear local photo queue.', err);
    });
    return;
  }
  saveLocalPhotoQueue(localPhotoQueueKey, persistablePhotos).catch((err) => {
    console.warn('Unable to persist local photo queue.', err);
  });
}, [localPhotoQueueKey, localPhotos]);
```

Add cleanup for object URLs:

```js
useEffect(() => () => {
  localPhotosRef.current.forEach((photo) => {
    if (photo.photoUrl?.startsWith('blob:')) URL.revokeObjectURL(photo.photoUrl);
  });
}, []);
```

- [ ] **Step 5: Return server photo from upload helper**

Change the end of `uploadPhotoBlob` so it returns the created server photo:

```js
const photoRef = await addDoc(collection(db, 'couples', coupleId, 'photos'), photoPayload);

await updateDoc(doc(db, 'couples', coupleId), {
  currentPhotoUrl: url,
  senderId: user.uid,
  timestamp: timestampStr,
  liked: false,
  lastLike: null
});

const createdPhotoId = photoRef?.id || photoRef?._id;
trackEvent('photo_sent', { coupleId, photoId: createdPhotoId || null });

return {
  id: createdPhotoId,
  ...photoPayload
};
```

- [ ] **Step 6: Add sequential upload pump**

Add this callback after `uploadPhotoBlob`:

```js
const processLocalPhotoQueue = useCallback(async () => {
  if (queueUploadInFlightRef.current || !isOnline) return;
  const nextPhoto = findNextUploadableLocalPhoto(localPhotosRef.current);
  if (!nextPhoto) return;

  queueUploadInFlightRef.current = true;
  setQueueUploadingPhotoId(nextPhoto.id);
  setLocalPhotos((current) => markLocalPhotoUploading(current, nextPhoto.id));

  try {
    const serverPhoto = await uploadPhotoBlob(nextPhoto.blob, nextPhoto.caption);
    const result = replaceLocalPhotoWithServerPhoto(localPhotosRef.current, nextPhoto.id, serverPhoto);
    if (nextPhoto.photoUrl?.startsWith('blob:')) URL.revokeObjectURL(nextPhoto.photoUrl);
    setLocalPhotos(result.localPhotos);
    insertServerPhotoLocal(result.serverPhoto);
    showToast('Photo sent');
  } catch (err) {
    console.error(err);
    setLocalPhotos((current) => markLocalPhotoFailed(current, nextPhoto.id, err?.message || "Couldn't send photo"));
  } finally {
    queueUploadInFlightRef.current = false;
    setQueueUploadingPhotoId(null);
  }
}, [insertServerPhotoLocal, isOnline, showToast, uploadPhotoBlob]);
```

If ESLint reports `uploadPhotoBlob` is unstable, wrap `uploadHistoryThumbnail` and `uploadPhotoBlob` in `useCallback` with explicit dependencies:

```js
const uploadHistoryThumbnail = useCallback(async (blob, timestampStr) => {
  ...
}, [coupleId]);

const uploadPhotoBlob = useCallback(async (blob, caption = null) => {
  ...
}, [coupleId, uploadHistoryThumbnail, user.uid]);
```

Trigger the pump when queue or connectivity changes:

```js
useEffect(() => {
  processLocalPhotoQueue();
}, [isOnline, localPhotos, processLocalPhotoQueue]);
```

This effect is what advances the queue after each success or failure. A failed item is skipped by `findNextUploadableLocalPhoto`, so later pending photos continue without an explicit recursive call.

- [ ] **Step 7: Change review send to enqueue immediately**

Change `clearReviewPhoto` to optionally preserve the object URL:

```js
const clearReviewPhoto = useCallback(({ preserveObjectUrl = false } = {}) => {
  if (!preserveObjectUrl && reviewPhotoUrlRef.current) {
    URL.revokeObjectURL(reviewPhotoUrlRef.current);
  }
  reviewPhotoUrlRef.current = null;
  setReviewPhoto(null);
  setCaptionText('');
  setSendingReviewPhoto(false);
  setSendAnimationState('idle');
}, []);
```

Replace `handleSendReviewPhoto`:

```js
const handleSendReviewPhoto = () => {
  if (!reviewPhoto || sendingReviewPhoto) return;
  if (!isOnline) {
    showToast('Reconnect to send', 3000);
    return;
  }

  triggerHaptic('tap');
  setSendingReviewPhoto(true);

  const caption = buildCaptionPayload(captionText);
  const localPhoto = createLocalPhoto({
    blob: reviewPhoto.blob,
    caption,
    coupleId,
    objectUrl: reviewPhoto.url,
    senderId: user.uid
  });

  setLocalPhotos((current) => appendLocalPhoto(current, localPhoto));
  clearCurrentReviewDraft();
  clearReviewPhoto({ preserveObjectUrl: true });
  scrollToCamera('auto');
  trackEvent('photo_send_queued', { coupleId, localPhotoId: localPhoto.id });
};
```

- [ ] **Step 8: Allow capture while queue uploads run**

Change capture disabling:

```js
const captureDisabled = sendingReviewPhoto
  || sendAnimationState !== 'idle'
  || cameraBusy;
const sendDisabled = captureDisabled || !isOnline;
```

Keep `setUploading(true)` in `handleCapture`; it can continue to drive capture spinner while the capture blob is being created. Do not use `queueUploadingPhotoId` to disable the shutter.

- [ ] **Step 9: Add retry and delete handlers**

Add handlers:

```js
const handleRetryLocalPhoto = useCallback((photoId) => {
  setLocalPhotos((current) => markLocalPhotoPending(current, photoId));
}, []);

const handleDeleteLocalPhoto = useCallback((photoId) => {
  const photo = localPhotosRef.current.find((item) => item.id === photoId);
  if (photo?.photoUrl?.startsWith('blob:')) URL.revokeObjectURL(photo.photoUrl);
  setLocalPhotos((current) => deleteLocalPhoto(current, photoId));
}, []);
```

- [ ] **Step 10: Run tests to verify they pass**

Run:

```bash
node --test src/components/MainScreenLocalQueue.test.js src/components/MainScreenOfflineCapture.test.js
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/components/MainScreen.jsx src/components/MainScreenOfflineCapture.test.js src/components/MainScreenLocalQueue.test.js
git commit -m "queue review sends inline"
```

---

### Task 5: Render Pending and Failed Inline UI

**Files:**
- Modify: `src/components/MainScreen.jsx`
- Modify: `src/index.css`
- Modify: `src/components/MainScreenLocalQueue.test.js`

- [ ] **Step 1: Write failing UI source tests**

Append tests to `src/components/MainScreenLocalQueue.test.js`:

```js
test('pending local photos replace metadata with centered sending state', () => {
  assert.match(source, /photo-local-status/);
  assert.match(source, /Sending…/);
  assert.match(source, /photo\.localOnly && photo\.status !== LOCAL_PHOTO_STATUS\.FAILED/);
});

test('failed local photos show retry and icon-only delete actions', () => {
  assert.match(source, /photo-local-actions failed/);
  assert.match(source, /Retry/);
  assert.match(source, /aria-label="Delete failed photo"/);
  assert.match(source, /handleRetryLocalPhoto\(photo\.id\)/);
  assert.match(source, /handleDeleteLocalPhoto\(photo\.id\)/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --test src/components/MainScreenLocalQueue.test.js
```

Expected: FAIL until UI states are rendered.

- [ ] **Step 3: Render local states inside the existing feed card**

In the `photos.map` render block, add:

```js
const isLocalPhoto = Boolean(photo.localOnly);
const isLocalFailed = isLocalPhoto && photo.status === LOCAL_PHOTO_STATUS.FAILED;
const isLocalSending = isLocalPhoto && photo.status !== LOCAL_PHOTO_STATUS.FAILED;
```

Replace the current `<div className="photo-meta-row">...</div>` with:

```jsx
{isLocalSending ? (
  <div className="photo-meta-row photo-local-status">
    <div className="photo-local-sending" role="status" aria-label="Sending photo">
      <div className="spinner" />
      <span>Sending…</span>
    </div>
  </div>
) : isLocalFailed ? (
  <div className="photo-meta-row photo-local-actions failed">
    <button
      className="photo-retry-btn"
      type="button"
      onClick={() => handleRetryLocalPhoto(photo.id)}
    >
      Retry
    </button>
    <button
      className="photo-delete-btn"
      type="button"
      aria-label="Delete failed photo"
      onClick={() => handleDeleteLocalPhoto(photo.id)}
    >
      <TrashIcon />
    </button>
  </div>
) : (
  <div className="photo-meta-row">
    <div className="photo-meta">
      <strong>{isPhotoMine ? 'You' : senderName}</strong>
      <span>{timeAgo(photoTimestamp)}</span>
    </div>
    {isPhotoMine ? (
      <div className="status-chip" aria-label={photo.liked ? 'Liked' : 'Sent'}>
        {photo.liked ? <HeartIcon filled /> : <SendIcon />}
        {photo.liked ? 'Liked' : 'Sent'}
      </div>
    ) : (
      <motion.button
        className="like-btn"
        type="button"
        aria-label={photo.liked ? 'Unlike photo' : 'Like photo'}
        onClick={() => handleLikePhoto(photo)}
        whileTap={{ scale: 0.86 }}
        style={{ color: photo.liked ? 'var(--accent)' : '#fff' }}
      >
        <HeartIcon filled={photo.liked} />
      </motion.button>
    )}
  </div>
)}
```

If `TrashIcon` does not already exist in `MainScreen.jsx`, add it next to the other local icon components:

```jsx
function TrashIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-2 6h10l-.7 11H7.7L7 9Zm3 2v7h2v-7h-2Zm4 0v7h2v-7h-2Z" fill="currentColor" />
    </svg>
  );
}
```

- [ ] **Step 4: Add CSS**

Append near the existing `.photo-meta-row` styles in `src/index.css`:

```css
.photo-local-status,
.photo-local-actions {
  justify-content: center;
  min-height: 58px;
}

.photo-local-sending {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-muted);
  font-size: 14px;
  font-weight: 800;
}

.photo-local-sending .spinner {
  width: 18px;
  height: 18px;
}

.photo-local-actions.failed {
  gap: 12px;
}

.photo-retry-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 118px;
  height: 44px;
  border-radius: var(--radius-full);
  background: #ef4444;
  color: #ffffff;
  font-size: 15px;
  font-weight: 850;
}

.photo-delete-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-full);
  background: rgba(239, 68, 68, 0.14);
  color: #ff6b6b;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
node --test src/components/MainScreenLocalQueue.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/MainScreen.jsx src/index.css src/components/MainScreenLocalQueue.test.js
git commit -m "add inline queue photo states"
```

---

### Task 6: Full Verification

**Files:**
- No new files.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
node --test src/lib/localPhotoQueue.test.js src/lib/localPhotoQueueStore.test.js src/hooks/usePaginatedPhotos.test.js src/components/MainScreenLocalQueue.test.js src/components/MainScreenOfflineCapture.test.js
```

Expected: PASS.

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: PASS and `dist/` generated.

- [ ] **Step 4: Manual emulator verification**

Run:

```bash
npm run emulators
```

Then in two browser sessions:

1. Sign in as paired users.
2. User A captures and sends three photos quickly.
3. Confirm all three appear at the end of the single feed immediately in send order.
4. Confirm the first upload starts, then the next pending item uploads only after the previous upload attempt resolves.
5. While User A has pending items, send a partner photo from User B.
6. Confirm User A's local pending items stay fixed at the end until each resolves.
7. Confirm each successful local item disappears from the local pending position and appears as the real server item in timestamp-desc server order.
8. Simulate a failed upload by going offline after queueing one photo.
9. Confirm the failed item remains inline and shows Retry plus icon-only Delete.
10. Queue another photo after the failed one and restore network.
11. Confirm the later photo uploads and the failed one remains failed.
12. Tap Retry on the failed photo.
13. Confirm only that photo retries.
14. Queue another failed photo and tap Delete.
15. Confirm only that failed item is removed.
16. Queue one pending and one failed item, reload the app.
17. Confirm the pending item returns inline and resumes automatically, while the failed item returns failed with Retry/Delete.

- [ ] **Step 5: Commit verification-only fixes if needed**

If lint/build/manual verification exposes a bug, fix only the queue-related issue, rerun the failing command, then commit:

```bash
git add src
git commit -m "fix local photo queue verification issues"
```

---

## Acceptance Mapping

- Immediate feed insert: Task 4, Step 7.
- Multiple queued photos inline: Task 1 append order, Task 4 queue state, Task 6 manual steps 2-3.
- Single feed only: Task 3 passes local photos into `usePaginatedPhotos`; no outbox file/component is introduced.
- Pending at end and visually stable: Task 1 `mergeServerAndLocalPhotos`, Task 3 hook merge, Task 6 partner-photo check.
- Sequential uploads: Task 4 `queueUploadInFlightRef` and `findNextUploadableLocalPhoto`.
- Failed does not block later queued uploads: Task 1 failed skip test, Task 4 pump finally re-enters queue.
- Retry/delete photo-specific: Task 1 retry/delete tests, Task 4 handlers, Task 5 UI wiring.
- Success reconciles to server order: Task 3 `insertServerPhotoLocal`, Task 4 `replaceLocalPhotoWithServerPhoto`.
- Relaunch restores pending/failed: Task 2 persistence, Task 4 load effect.
- Pending UI: Task 5 centered spinner + `Sending…`.
- Failed UI: Task 5 Retry + icon-only Delete.

## Risks and Notes

- `Blob` persistence in IndexedDB is supported by modern browsers, but storage pressure can evict data. This plan keeps scope to "survive app relaunch" and does not add a durable offline outbox.
- Existing `uploadBlobWithTimeout` cancels long uploads. A timed-out local photo becomes failed and requires explicit Retry, matching POC-100.
- Object URL ownership must be handled carefully: once a review photo is enqueued, the review cleanup must preserve the URL and queue deletion/success must revoke it.
- The existing offline draft remains useful for an unsent review photo. Once the user taps Send, ownership moves from review draft to local queue and the review draft should be cleared.
