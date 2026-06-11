import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPushMessage,
  createLikeReceivedEvent,
  createPairingAcceptedEvent,
  createPairingRemovedEvent,
  createPairingRequestEvent,
  createPhotoReceivedEvent,
  dedupeRegistrations,
  enforceTestCooldown,
  tokenFingerprint
} from './push.js';

test('data-only messages contain stable event identity and no notification payload', () => {
  const message = buildPushMessage({
    eventId: 'photo:p1',
    type: 'photo_received',
    title: 'New photo',
    body: 'Bilal sent you a photo.',
    data: { photoId: 'p1' }
  });

  assert.equal(message.notification, undefined);
  assert.equal(message.data.eventId, 'photo:p1');
  assert.equal(message.data.type, 'photo_received');
  assert.equal(message.data.body, 'Bilal sent you a photo.');
});

test('duplicate token values target one device response slot', () => {
  const registrations = dedupeRegistrations([
    { ref: 'a', token: 'same' },
    { ref: 'b', token: 'same' },
    { ref: 'c', token: 'other' }
  ]);

  assert.deepEqual(registrations.map((item) => item.token), ['same', 'other']);
});

test('test cooldown applies across both diagnostic actions', () => {
  assert.throws(() => enforceTestCooldown({ lastTestAtMs: 1000, nowMs: 9000, cooldownMs: 10000 }), /2000/);
  assert.doesNotThrow(() => enforceTestCooldown({ lastTestAtMs: 1000, nowMs: 11000, cooldownMs: 10000 }));
});

test('token fingerprints are stable and do not expose the token', () => {
  const fingerprint = tokenFingerprint('secret-token');

  assert.equal(fingerprint, tokenFingerprint('secret-token'));
  assert.equal(fingerprint.includes('secret-token'), false);
});

test('photo and like events use deterministic event ids and approved copy', () => {
  assert.deepEqual(createPhotoReceivedEvent({ photoId: 'p1', coupleId: 'c1', senderName: 'Bilal' }), {
    eventId: 'photo_received:c1:p1',
    type: 'photo_received',
    title: "You've got a new photo!",
    body: 'Bilal sent you a photo.',
    data: { coupleId: 'c1', photoId: 'p1' },
    link: '/',
    ttlSeconds: 86400
  });
  assert.equal(
    createLikeReceivedEvent({ photoId: 'p1', coupleId: 'c1', likerId: 'u1', likeTimestamp: 't1', senderName: 'Bilal' }).eventId,
    'like_received:c1:p1:u1:t1'
  );
});

test('pairing events have stable ids and approved destinations', () => {
  assert.equal(createPairingRequestEvent({ requestId: 'r1', senderName: 'Bilal' }).eventId, 'pairing_request:r1');
  assert.equal(createPairingAcceptedEvent({ requestId: 'r1', senderName: 'Ada' }).eventId, 'pairing_accepted:r1');
  assert.equal(createPairingRemovedEvent({ coupleId: 'c1', removalId: 'remove-1', senderName: 'Ada' }).eventId, 'pairing_removed:c1:remove-1');
});
