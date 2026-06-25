import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./MainScreen.jsx', import.meta.url), 'utf8');

test('missing Firestore profile photos are restored from Google auth', () => {
  assert.match(
    source,
    /if \(!myProfile \|\| myProfile\.profilePic \|\| !user\.photoURL\) return;[\s\S]*updateDoc\(doc\(db, 'users', user\.uid\), \{[\s\S]*profilePic: user\.photoURL/
  );
});

test('removing a custom profile photo reverts to the Google photo', () => {
  assert.match(
    source,
    /const fallbackProfilePic = user\.photoURL \|\| '';[\s\S]*handleRemoveProfilePhoto[\s\S]*profilePic: fallbackProfilePic/
  );
  assert.doesNotMatch(
    source,
    /handleRemoveProfilePhoto[\s\S]*profilePic: ''[\s\S]*profile_photo_removed/
  );
});
