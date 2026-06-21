import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FIRESTORE_RECOVERY_EPOCH_KEY,
  runFirestoreRecovery
} from './firestoreRecovery.js';

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
}

test('does not clear persistence for a non-target user', async () => {
  let clears = 0;
  const result = await runFirestoreRecovery({
    db: {},
    userId: 'other-user',
    storage: createStorage(),
    digestUserId: async () => 'not-target',
    clearPersistence: async () => { clears += 1; }
  });

  assert.deepEqual(result, { status: 'not-targeted' });
  assert.equal(clears, 0);
});

test('clears the target once and records completion', async () => {
  const storage = createStorage();
  let clears = 0;
  const options = {
    db: {},
    userId: 'target-user',
    storage,
    digestUserId: async () => 'e83bfb2a4c7fee83e80ede04fa70edbaa69829e97ba1a0ee0b159afa06dbae39',
    clearPersistence: async () => { clears += 1; }
  };

  assert.deepEqual(await runFirestoreRecovery(options), { status: 'cleared' });
  assert.equal(storage.getItem(FIRESTORE_RECOVERY_EPOCH_KEY), 'completed');
  assert.deepEqual(await runFirestoreRecovery(options), { status: 'already-completed' });
  assert.equal(clears, 1);
});

test('failed clearing leaves the epoch incomplete for retry', async () => {
  const storage = createStorage();
  const error = Object.assign(new Error('Other tab active'), {
    code: 'failed-precondition'
  });
  const result = await runFirestoreRecovery({
    db: {},
    userId: 'target-user',
    storage,
    digestUserId: async () => 'e83bfb2a4c7fee83e80ede04fa70edbaa69829e97ba1a0ee0b159afa06dbae39',
    clearPersistence: async () => { throw error; }
  });

  assert.deepEqual(result, { status: 'failed', error });
  assert.equal(storage.getItem(FIRESTORE_RECOVERY_EPOCH_KEY), null);
});

test('a successful clear is not reported as failed when localStorage rejects the marker', async () => {
  const storage = {
    getItem: () => null,
    setItem: () => { throw new Error('Storage unavailable'); }
  };
  const result = await runFirestoreRecovery({
    db: {},
    userId: 'target-user',
    storage,
    digestUserId: async () => 'e83bfb2a4c7fee83e80ede04fa70edbaa69829e97ba1a0ee0b159afa06dbae39',
    clearPersistence: async () => {}
  });

  assert.deepEqual(result, { status: 'cleared' });
});
