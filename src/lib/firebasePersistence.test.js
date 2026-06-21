import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const firebaseSource = readFileSync(new URL('../firebase.js', import.meta.url), 'utf8');

test('Firestore is configured with persistent local cache and multi-tab coordination', () => {
  assert.match(firebaseSource, /\binitializeFirestore\b/);
  assert.match(firebaseSource, /\bpersistentLocalCache\b/);
  assert.match(firebaseSource, /\bpersistentMultipleTabManager\b/);
});

test('Firestore recovery runs after auth restoration and before Firestore consumers', () => {
  assert.match(firebaseSource, /await auth\.authStateReady\(\)/);
  assert.match(firebaseSource, /clearIndexedDbPersistence/);
  assert.match(firebaseSource, /runFirestoreRecovery/);

  const authReady = firebaseSource.indexOf('await auth.authStateReady()');
  const recovery = firebaseSource.indexOf('await runFirestoreRecovery');
  const storage = firebaseSource.indexOf('const storage = getStorage(app)');
  assert.ok(authReady >= 0 && recovery > authReady);
  assert.ok(storage > recovery);
});

test('Auth emulator connects before waiting for restored auth state', () => {
  const emulatorConnect = firebaseSource.indexOf('connectAuthEmulator(auth');
  const authReady = firebaseSource.indexOf('await auth.authStateReady()');
  assert.ok(emulatorConnect >= 0 && emulatorConnect < authReady);
});
