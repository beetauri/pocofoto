import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createOfflineReviewDraftStore,
  createReviewDraftKey
} from './offlineReviewDraft.js';

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

test('creates user and couple scoped draft keys', () => {
  assert.equal(createReviewDraftKey('user-a', 'couple-a'), 'user-a::couple-a');
  assert.equal(createReviewDraftKey('user-a', 'couple-b'), 'user-a::couple-b');
});

test('saves, loads, and clears a review draft with an adapter', async () => {
  const store = createOfflineReviewDraftStore(createFakeAdapter());
  const draftKey = createReviewDraftKey('user-a', 'couple-a');
  const draft = {
    blob: new Blob(['photo-bytes'], { type: 'image/jpeg' }),
    captionText: 'hi',
    updatedAt: '2026-06-10T00:00:00.000Z'
  };

  await store.saveDraft(draftKey, draft);

  assert.equal(await store.loadDraft(createReviewDraftKey('user-b', 'couple-a')), null);
  assert.deepEqual(await store.loadDraft(draftKey), draft);

  await store.clearDraft(draftKey);

  assert.equal(await store.loadDraft(draftKey), null);
});
