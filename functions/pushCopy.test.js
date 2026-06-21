import test from 'node:test';
import assert from 'node:assert/strict';

import { pushCopy } from './pushCopy.js';

test('photo notification uses the Pocofoto voice', () => {
  assert.deepEqual(pushCopy.photoReceived('Alex'), {
    title: 'A little photo from your person 📸',
    body: 'Alex sent you a moment.'
  });
});

test('like notification stays warm and clear', () => {
  assert.deepEqual(pushCopy.photoLiked('Alex'), {
    title: 'Your photo got some love',
    body: 'Alex loved your photo.'
  });
});

test('pairing notifications describe the exact event', () => {
  assert.equal(pushCopy.pairingRequest('Alex').body, 'Alex wants to be your person.');
  assert.equal(pushCopy.pairingAccepted('Alex').body, 'Alex paired up with you.');
  assert.equal(pushCopy.pairingRemoved('Alex').body, 'Alex ended the pairing.');
});
