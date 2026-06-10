import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const firebaseSource = readFileSync(new URL('../firebase.js', import.meta.url), 'utf8');

test('Firestore is configured with persistent local cache and multi-tab coordination', () => {
  assert.match(firebaseSource, /\binitializeFirestore\b/);
  assert.match(firebaseSource, /\bpersistentLocalCache\b/);
  assert.match(firebaseSource, /\bpersistentMultipleTabManager\b/);
});
