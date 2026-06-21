const TARGET_USER_DIGEST = 'e83bfb2a4c7fee83e80ede04fa70edbaa69829e97ba1a0ee0b159afa06dbae39';

export const FIRESTORE_RECOVERY_EPOCH_KEY = 'pocofoto:firestore-recovery:pair-route-v1';

export async function digestUserId(userId) {
  const bytes = new TextEncoder().encode(userId);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, '0')
  ).join('');
}

export async function runFirestoreRecovery({
  db,
  userId,
  storage = globalThis.localStorage,
  digestUserId: createDigest = digestUserId,
  clearPersistence
}) {
  if (!userId) return { status: 'not-targeted' };

  try {
    if (storage?.getItem(FIRESTORE_RECOVERY_EPOCH_KEY) === 'completed') {
      return { status: 'already-completed' };
    }
  } catch {
    // Continue without an epoch marker when localStorage is unavailable.
  }

  if (await createDigest(userId) !== TARGET_USER_DIGEST) {
    return { status: 'not-targeted' };
  }

  try {
    await clearPersistence(db);
    try {
      storage?.setItem(FIRESTORE_RECOVERY_EPOCH_KEY, 'completed');
    } catch {
      // The clear succeeded; lack of a marker only means a later launch may retry.
    }
    return { status: 'cleared' };
  } catch (error) {
    return { status: 'failed', error };
  }
}
