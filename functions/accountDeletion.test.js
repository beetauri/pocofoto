import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAccountDeletionPlan } from './accountDeletion.js';

test('deletion removes only user-owned records and preserves the couple photo tree', () => {
  const plan = buildAccountDeletionPlan({
    uid: 'u1',
    coupleId: 'c1',
    coupleUsers: ['u1', 'u2']
  });

  assert.deepEqual(plan.remainingCoupleUsers, ['u2']);
  assert.ok(plan.deleteUserDocument);
  assert.ok(plan.deletePrivateSubcollections);
  assert.ok(plan.deleteUserContactsDocument);
  assert.ok(plan.deleteUserStorageFiles);
  assert.ok(plan.deleteAuthUser);
  assert.equal(plan.deleteCoupleDocument, false);
  assert.equal(plan.deleteCouplePhotos, false);
  assert.ok(plan.cancelPairingArtifacts);
});

test('deletion preserves a historical couple record when the deleted user was the only member', () => {
  const plan = buildAccountDeletionPlan({ uid: 'u1', coupleId: 'c1', coupleUsers: ['u1'] });

  assert.deepEqual(plan.remainingCoupleUsers, []);
  assert.equal(plan.deleteCoupleDocument, false);
  assert.equal(plan.deleteCouplePhotos, false);
});
