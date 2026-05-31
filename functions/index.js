import admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

admin.initializeApp();

const db = admin.firestore();
const { FieldValue, Timestamp } = admin.firestore;

const REQUEST_TTL_MS = 24 * 60 * 60 * 1000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function requireUid(request) {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in is required.');
  }
  return uid;
}

function nowIso() {
  return new Date().toISOString();
}

function expiresAtFromNow() {
  return Timestamp.fromMillis(Date.now() + REQUEST_TTL_MS);
}

async function getUser(uid) {
  const snap = await db.doc(`users/${uid}`).get();
  if (!snap.exists) {
    throw new HttpsError('failed-precondition', 'User profile is not initialized.');
  }
  return { id: snap.id, ...snap.data() };
}

function assertUnpaired(user, label = 'User') {
  if (user.coupleId) {
    throw new HttpsError('failed-precondition', `${label} is already paired.`);
  }
}

function requestIsExpired(requestData) {
  const expires = requestData.expiresAt?.toMillis?.() || Date.parse(requestData.expiresAt || 0);
  return Number.isFinite(expires) && expires <= Date.now();
}

function displaySnapshot(user) {
  return {
    uid: user.id,
    email: user.email || '',
    displayName: user.displayName || user.email || 'Pocofoto user',
    profilePic: user.profilePic || ''
  };
}

async function invalidatePendingRequestsForUsers(userIds, reason, skipRequestId = null) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const refs = new Map();

  for (const uid of uniqueIds) {
    const senderSnap = await db.collection('pairingRequests')
      .where('senderId', '==', uid)
      .where('status', '==', 'pending')
      .get();
    senderSnap.forEach((doc) => refs.set(doc.id, doc.ref));

    const recipientSnap = await db.collection('pairingRequests')
      .where('recipientId', '==', uid)
      .where('status', '==', 'pending')
      .get();
    recipientSnap.forEach((doc) => refs.set(doc.id, doc.ref));
  }

  const batch = db.batch();
  let count = 0;
  for (const [id, ref] of refs.entries()) {
    if (id === skipRequestId) continue;
    batch.update(ref, {
      status: reason,
      respondedAt: FieldValue.serverTimestamp(),
      resolvedAt: FieldValue.serverTimestamp()
    });
    count += 1;
  }

  if (count > 0) {
    await batch.commit();
  }
}

async function invalidateActiveCodesForUsers(userIds, reason) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const refs = new Map();

  for (const uid of uniqueIds) {
    const codeSnap = await db.collection('pairingCodes')
      .where('creatorId', '==', uid)
      .where('status', '==', 'active')
      .get();
    codeSnap.forEach((doc) => refs.set(doc.id, doc.ref));
  }

  const batch = db.batch();
  let count = 0;
  for (const ref of refs.values()) {
    batch.update(ref, {
      status: reason,
      resolvedAt: FieldValue.serverTimestamp()
    });
    count += 1;
  }

  if (count > 0) {
    await batch.commit();
  }
}

async function createCoupleForUsers(uidA, uidB, source) {
  const coupleId = [uidA, uidB].sort().join('_');
  const coupleRef = db.doc(`couples/${coupleId}`);
  const userARef = db.doc(`users/${uidA}`);
  const userBRef = db.doc(`users/${uidB}`);

  await db.runTransaction(async (transaction) => {
    const [userASnap, userBSnap, coupleSnap] = await transaction.getAll(userARef, userBRef, coupleRef);
    if (!userASnap.exists || !userBSnap.exists) {
      throw new HttpsError('failed-precondition', 'Both users must exist before pairing.');
    }
    const userA = { id: uidA, ...userASnap.data() };
    const userB = { id: uidB, ...userBSnap.data() };
    assertUnpaired(userA, 'One user');
    assertUnpaired(userB, 'One user');

    if (!coupleSnap.exists) {
      transaction.set(coupleRef, {
        users: [uidA, uidB],
        currentPhotoUrl: null,
        senderId: null,
        timestamp: null,
        createdAt: nowIso(),
        createdBy: source
      });
    }
    transaction.update(userARef, { coupleId });
    transaction.update(userBRef, { coupleId });
  });

  await invalidatePendingRequestsForUsers([uidA, uidB], 'canceled');
  await invalidateActiveCodesForUsers([uidA, uidB], 'canceled');
  return coupleId;
}

export const removePairing = onCall(async (request) => {
  const uid = requireUid(request);
  const user = await getUser(uid);
  const coupleId = user.coupleId;
  if (!coupleId || typeof coupleId !== 'string') {
    throw new HttpsError('failed-precondition', 'You are not currently paired.');
  }

  const coupleRef = db.doc(`couples/${coupleId}`);
  let memberIds = [];

  await db.runTransaction(async (transaction) => {
    const coupleSnap = await transaction.get(coupleRef);
    if (!coupleSnap.exists) {
      throw new HttpsError('not-found', 'Pairing record not found.');
    }

    const couple = coupleSnap.data();
    const users = Array.isArray(couple.users) ? couple.users : [];
    if (!users.includes(uid)) {
      throw new HttpsError('permission-denied', 'You are not a member of this pairing.');
    }
    memberIds = users;

    const userRefs = users.map((memberUid) => db.doc(`users/${memberUid}`));
    const userSnaps = await Promise.all(userRefs.map((ref) => transaction.get(ref)));
    userSnaps.forEach((snap, index) => {
      if (!snap.exists) return;
      transaction.update(userRefs[index], {
        coupleId: null,
        lastUnpairedAt: FieldValue.serverTimestamp(),
        lastUnpairedCoupleId: coupleId
      });
    });

    transaction.update(coupleRef, {
      status: 'archived',
      archivedAt: FieldValue.serverTimestamp(),
      archivedBy: uid,
      active: false
    });
  });

  const partnerIds = memberIds.filter((memberUid) => memberUid !== uid);
  await invalidatePendingRequestsForUsers([uid, ...partnerIds], 'canceled');
  await invalidateActiveCodesForUsers([uid, ...partnerIds], 'canceled');

  const initiator = displaySnapshot(user);
  await Promise.all(partnerIds.map((partnerId) => {
    return db.collection(`users/${partnerId}/notifications`).add({
      type: 'pairing_removed',
      status: 'unread',
      coupleId,
      initiator,
      createdAt: FieldValue.serverTimestamp()
    });
  }));

  return { ok: true, coupleId };
});

export const acceptPairingRequest = onCall(async (request) => {
  const uid = requireUid(request);
  const requestId = request.data?.requestId;
  if (!requestId || typeof requestId !== 'string') {
    throw new HttpsError('invalid-argument', 'Pairing request ID is required.');
  }

  const requestRef = db.doc(`pairingRequests/${requestId}`);
  const requestSnap = await requestRef.get();
  if (!requestSnap.exists) {
    throw new HttpsError('not-found', 'Pairing request not found.');
  }
  const data = requestSnap.data();
  if (data.recipientId !== uid) {
    throw new HttpsError('permission-denied', 'Only the recipient can accept this request.');
  }
  if (data.status !== 'pending' || requestIsExpired(data)) {
    throw new HttpsError('failed-precondition', 'This pairing request is no longer active.');
  }

  const coupleId = await createCoupleForUsers(data.senderId, data.recipientId, 'pairing_request');
  await requestRef.update({
    status: 'accepted',
    coupleId,
    respondedAt: FieldValue.serverTimestamp()
  });
  await db.doc(`users/${uid}/notifications/${requestId}`).set({
    status: 'resolved',
    resolvedAt: FieldValue.serverTimestamp()
  }, { merge: true });

  return { coupleId };
});

export const declinePairingRequest = onCall(async (request) => {
  const uid = requireUid(request);
  const requestId = request.data?.requestId;
  const ref = db.doc(`pairingRequests/${requestId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Pairing request not found.');
  const data = snap.data();
  if (data.recipientId !== uid) throw new HttpsError('permission-denied', 'Only the recipient can decline this request.');
  if (data.status !== 'pending') throw new HttpsError('failed-precondition', 'This request is already resolved.');
  await ref.update({ status: 'declined', respondedAt: FieldValue.serverTimestamp() });
  await db.doc(`users/${uid}/notifications/${requestId}`).set({
    status: 'resolved',
    resolvedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return { ok: true };
});

export const cancelPairingRequest = onCall(async (request) => {
  const uid = requireUid(request);
  const requestId = request.data?.requestId;
  const ref = db.doc(`pairingRequests/${requestId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Pairing request not found.');
  const data = snap.data();
  if (data.senderId !== uid) throw new HttpsError('permission-denied', 'Only the sender can cancel this request.');
  if (data.status !== 'pending') throw new HttpsError('failed-precondition', 'This request is already resolved.');
  await ref.update({ status: 'canceled', respondedAt: FieldValue.serverTimestamp() });
  await db.doc(`users/${data.recipientId}/notifications/${requestId}`).set({
    status: 'resolved',
    resolvedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return { ok: true };
});

function randomCode(length = 6) {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export const createPairingCode = onCall(async (request) => {
  const uid = requireUid(request);
  const user = await getUser(uid);
  assertUnpaired(user, 'You');

  const existing = await db.collection('pairingCodes')
    .where('creatorId', '==', uid)
    .where('status', '==', 'active')
    .limit(1)
    .get();
  if (!existing.empty) {
    const doc = existing.docs[0];
    const data = doc.data();
    if (!requestIsExpired(data)) {
      return { code: doc.id, expiresAt: data.expiresAt };
    }
    await doc.ref.update({ status: 'expired', resolvedAt: FieldValue.serverTimestamp() });
  }

  let code = randomCode();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const ref = db.doc(`pairingCodes/${code}`);
    if (!(await ref.get()).exists) {
      await ref.set({
        creatorId: uid,
        creator: displaySnapshot(user),
        status: 'active',
        expiresAt: expiresAtFromNow(),
        createdAt: FieldValue.serverTimestamp()
      });
      return { code };
    }
    code = randomCode();
  }
  throw new HttpsError('resource-exhausted', 'Could not create a unique pairing code.');
});

export const redeemPairingCode = onCall(async (request) => {
  const uid = requireUid(request);
  const code = String(request.data?.code || '').trim().toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(code)) {
    throw new HttpsError('invalid-argument', 'Enter a valid pairing code.');
  }

  const codeRef = db.doc(`pairingCodes/${code}`);
  const codeSnap = await codeRef.get();
  if (!codeSnap.exists) throw new HttpsError('not-found', 'Invalid pairing code.');
  const codeData = codeSnap.data();
  if (codeData.creatorId === uid) throw new HttpsError('failed-precondition', 'You cannot pair with yourself.');
  if (codeData.status !== 'active' || requestIsExpired(codeData)) {
    throw new HttpsError('failed-precondition', 'This pairing code has expired.');
  }

  const redeemer = await getUser(uid);
  assertUnpaired(redeemer, 'You');
  const coupleId = await createCoupleForUsers(codeData.creatorId, uid, 'pairing_code');
  await codeRef.update({
    status: 'used',
    usedBy: uid,
    coupleId,
    resolvedAt: FieldValue.serverTimestamp()
  });
  return { coupleId };
});

export const registerFcmToken = onCall(async (request) => {
  const uid = requireUid(request);
  const token = request.data?.token;
  if (!token || typeof token !== 'string') {
    throw new HttpsError('invalid-argument', 'FCM token is required.');
  }
  const tokenId = encodeURIComponent(token).replace(/\./g, '%2E').slice(0, 1400);
  await db.doc(`users/${uid}/fcmTokens/${tokenId}`).set({
    token,
    userAgent: request.data?.userAgent || '',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return { ok: true };
});

export const removeFcmToken = onCall(async (request) => {
  const uid = requireUid(request);
  const token = request.data?.token;
  if (!token || typeof token !== 'string') {
    throw new HttpsError('invalid-argument', 'FCM token is required.');
  }
  const tokenId = encodeURIComponent(token).replace(/\./g, '%2E').slice(0, 1400);
  await db.doc(`users/${uid}/fcmTokens/${tokenId}`).delete();
  return { ok: true };
});

export const expirePairingArtifacts = onSchedule('every 15 minutes', async () => {
  const now = Timestamp.now();
  const pendingRequests = await db.collection('pairingRequests')
    .where('status', '==', 'pending')
    .where('expiresAt', '<=', now)
    .get();
  const activeCodes = await db.collection('pairingCodes')
    .where('status', '==', 'active')
    .where('expiresAt', '<=', now)
    .get();

  const batch = db.batch();
  pendingRequests.forEach((doc) => batch.update(doc.ref, {
    status: 'expired',
    resolvedAt: FieldValue.serverTimestamp()
  }));
  activeCodes.forEach((doc) => batch.update(doc.ref, {
    status: 'expired',
    resolvedAt: FieldValue.serverTimestamp()
  }));
  await batch.commit();
});
