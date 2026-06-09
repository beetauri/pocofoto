import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mainScreenSource = readFileSync(new URL('./MainScreen.jsx', import.meta.url), 'utf8');
const firestoreRulesSource = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');

test('captions allow up to 36 characters in the client and Firestore rules', () => {
  assert.match(mainScreenSource, /const MAX_CAPTION_LENGTH = 36;/);
  assert.match(firestoreRulesSource, /caption\.text\.size\(\) <= 36/);
});
