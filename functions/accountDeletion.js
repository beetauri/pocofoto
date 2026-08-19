export function remainingCoupleUsers({ uid, coupleUsers = [] }) {
  return Array.isArray(coupleUsers)
    ? coupleUsers.filter((memberUid) => memberUid && memberUid !== uid)
    : [];
}

export function buildAccountDeletionPlan({ uid, coupleId = null, coupleUsers = [] }) {
  if (!uid || typeof uid !== 'string') throw new Error('A user ID is required.');

  return {
    uid,
    coupleId: typeof coupleId === 'string' && coupleId ? coupleId : null,
    remainingCoupleUsers: remainingCoupleUsers({ uid, coupleUsers }),
    deleteUserDocument: true,
    deletePrivateSubcollections: true,
    deleteUserContactsDocument: true,
    deleteUserStorageFiles: true,
    deleteAuthUser: true,
    cancelPairingArtifacts: true,
    deleteCoupleDocument: false,
    deleteCouplePhotos: false
  };
}
