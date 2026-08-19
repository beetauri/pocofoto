import admin from 'firebase-admin';
import { pushCopy } from './pushCopy.js';
import { buildAccountDeletionPlan, remainingCoupleUsers } from './accountDeletion.js';
import { isCaptionAllowed, validateReportInput } from './safety.js';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
  createLikeReceivedEvent,
  createPairingAcceptedEvent,
  createPairingRemovedEvent,
  createPairingRequestEvent,
  createPhotoReceivedEvent,
  enforceTestCooldown,
  expireStaleRegistrations,
  getNotificationDiagnostics as loadNotificationDiagnostics,
  registerDeviceToken,
  removeDeviceToken,
  sendPushToUser
} from './push.js';

admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();
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

function nowTimestamp() {
  return Timestamp.now();
}

function toHttpsError(error) {
  if (error instanceof HttpsError) return error;
  if (error?.code === 'resource-exhausted') {
    return new HttpsError('resource-exhausted', error.message, { retryAfterSeconds: error.retryAfterSeconds || 10 });
  }
  return new HttpsError('internal', error?.message || 'Push notification failed.');
}

async function sendEventBestEffort(recipientId, event, context = {}) {
  try {
    return await sendPushToUser({ db, messaging, uid: recipientId, event, context, now: nowTimestamp });
  } catch (error) {
    console.error('push_send_best_effort_failed', {
      ...context,
      eventId: event.eventId,
      recipientId,
      code: error?.code || 'unknown',
      message: error?.message || ''
    });
    return { outcome: 'failed', tokenCount: 0, successCount: 0, failureCount: 0, staleDeletedCount: 0, failureCodes: [error?.code || 'unknown'] };
  }
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

async function getCoupleMembership(uid) {
  const user = await getUser(uid);
  const coupleId = typeof user.coupleId === 'string' ? user.coupleId : null;
  if (!coupleId) throw new HttpsError('failed-precondition', 'You are not currently paired.');

  const coupleSnap = await db.doc(`couples/${coupleId}`).get();
  if (!coupleSnap.exists) throw new HttpsError('not-found', 'Pairing record not found.');
  const users = Array.isArray(coupleSnap.data().users) ? coupleSnap.data().users : [];
  if (!users.includes(uid)) throw new HttpsError('permission-denied', 'You are not a member of this pairing.');
  return { user, coupleId, couple: coupleSnap.data(), users };
}

async function areUsersBlocked(uidA, uidB) {
  const [blockedByA, blockedByB] = await Promise.all([
    db.doc(`users/${uidA}/private/blockedUsers/${uidB}`).get(),
    db.doc(`users/${uidB}/private/blockedUsers/${uidA}`).get()
  ]);
  return blockedByA.exists || blockedByB.exists;
}

function assertUsersNotBlocked(blockingUid, targetUid) {
  return areUsersBlocked(blockingUid, targetUid).then((blocked) => {
    if (blocked) throw new HttpsError('permission-denied', 'This user is blocked.');
  });
}

async function removeFcmRegistryEntries(uid) {
  const tokenSnap = await db.collection(`users/${uid}/fcmTokens`).get();
  const batch = db.batch();
  let count = 0;
  tokenSnap.forEach((tokenDoc) => {
    const fingerprint = tokenDoc.data().tokenFingerprint;
    if (fingerprint) {
      batch.delete(db.doc(`fcmTokenRegistry/${fingerprint}`));
      count += 1;
    }
  });
  if (count > 0) await batch.commit();
}

async function deleteUserOwnedFirestoreData(uid) {
  await removeFcmRegistryEntries(uid);
  await db.recursiveDelete(db.doc(`users/${uid}`));
  await db.recursiveDelete(db.doc(`userContacts/${uid}`));
}

async function deleteUserStorageFiles(uid) {
  const [files] = await admin.storage().bucket().getFiles({ prefix: `users/${uid}/` });
  await Promise.all(files.map((file) => file.delete()));
}

async function deleteFirebaseAuthUser(uid) {
  try {
    await admin.auth().deleteUser(uid);
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
  }
}

async function removePairingForUser(uid) {
  const user = await getUser(uid);
  const coupleId = user.coupleId;
  if (!coupleId || typeof coupleId !== 'string') {
    throw new HttpsError('failed-precondition', 'You are not currently paired.');
  }

  const coupleRef = db.doc(`couples/${coupleId}`);
  let memberIds = [];

  await db.runTransaction(async (transaction) => {
    const coupleSnap = await transaction.get(coupleRef);
    if (!coupleSnap.exists) throw new HttpsError('not-found', 'Pairing record not found.');

    const couple = coupleSnap.data();
    const users = Array.isArray(couple.users) ? couple.users : [];
    if (!users.includes(uid)) throw new HttpsError('permission-denied', 'You are not a member of this pairing.');
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
  await Promise.all(partnerIds.map(async (partnerId) => {
    const notificationRef = await db.collection(`users/${partnerId}/notifications`).add({
      type: 'pairing_removed',
      status: 'unread',
      coupleId,
      initiator,
      createdAt: FieldValue.serverTimestamp()
    });
    await sendEventBestEffort(partnerId, createPairingRemovedEvent({
      coupleId,
      removalId: notificationRef.id,
      senderName: initiator.displayName
    }), {
      notificationType: 'pairing_removed',
      coupleId,
      senderId: uid
    });
  }));

  return { coupleId, memberIds };
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

export const notifyPhotoReceived = onDocumentCreated('couples/{coupleId}/photos/{photoId}', async (event) => {
  const photo = event.data?.data();
  const senderId = photo?.senderId;
  const { coupleId, photoId } = event.params;
  if (photo?.caption?.text && !isCaptionAllowed(photo.caption.text)) {
    await event.data.ref.update({ caption: FieldValue.delete() });
    console.warn('unsafe_caption_removed', { coupleId, photoId });
  }
  console.log('notify_photo_received_started', {
    coupleId,
    photoId,
    senderId: senderId || null
  });
  if (!senderId || !coupleId || !photoId) {
    console.log('notify_photo_received_skipped', {
      reason: 'missing_required_fields',
      coupleId: coupleId || null,
      photoId: photoId || null,
      senderId: senderId || null
    });
    return;
  }

  const coupleSnap = await db.doc(`couples/${coupleId}`).get();
  if (!coupleSnap.exists) {
    console.log('notify_photo_received_skipped', {
      reason: 'couple_not_found',
      coupleId,
      photoId,
      senderId
    });
    return;
  }

  const users = Array.isArray(coupleSnap.data().users) ? coupleSnap.data().users : [];
  const recipientId = users.find((uid) => uid !== senderId);
  if (!recipientId) {
    console.log('notify_photo_received_skipped', {
      reason: 'recipient_not_found',
      coupleId,
      photoId,
      senderId
    });
    return;
  }
  console.log('notify_photo_received_recipient_resolved', {
    coupleId,
    photoId,
    senderId,
    recipientId
  });

  const senderSnap = await db.doc(`users/${senderId}`).get();
  const sender = senderSnap.exists ? { id: senderId, ...senderSnap.data() } : { id: senderId };
  const senderName = sender.displayName || sender.email || 'Your person';

  const pushEvent = createPhotoReceivedEvent({ photoId, coupleId, senderName });
  const sendResult = await sendEventBestEffort(recipientId, pushEvent, {
    notificationType: 'photo_received',
    coupleId,
    photoId,
    senderId
  });
  console.log('notify_photo_received_completed', {
    coupleId,
    photoId,
    senderId,
    recipientId,
    ...sendResult
  });
});

export const notifyPhotoLiked = onDocumentUpdated('couples/{coupleId}', async (event) => {
  const beforeLike = event.data?.before.data()?.lastLike || null;
  const after = event.data?.after.data();
  const like = after?.lastLike || null;
  const { coupleId } = event.params;
  const likerId = like?.userId;
  const photoId = like?.photoId;
  const likeTimestamp = like?.timestamp || null;
  const beforeTimestamp = beforeLike?.timestamp || null;

  console.log('notify_photo_liked_started', {
    coupleId,
    likerId: likerId || null,
    photoId: photoId || null,
    likeTimestamp
  });

  if (!like || !likerId || !photoId || !likeTimestamp) {
    console.log('notify_photo_liked_skipped', {
      reason: 'missing_like_fields',
      coupleId,
      likerId: likerId || null,
      photoId: photoId || null,
      likeTimestamp
    });
    return;
  }

  if (beforeTimestamp === likeTimestamp) {
    console.log('notify_photo_liked_skipped', {
      reason: 'unchanged_like_timestamp',
      coupleId,
      likerId,
      photoId,
      likeTimestamp
    });
    return;
  }

  const users = Array.isArray(after?.users) ? after.users : [];
  const recipientId = users.find((uid) => uid !== likerId);
  if (!recipientId || !users.includes(likerId)) {
    console.log('notify_photo_liked_skipped', {
      reason: 'recipient_not_found',
      coupleId,
      likerId,
      photoId
    });
    return;
  }

  const likerSnap = await db.doc(`users/${likerId}`).get();
  const liker = likerSnap.exists ? { id: likerId, ...likerSnap.data() } : { id: likerId };
  const likerName = liker.displayName || liker.email || 'Your person';

  const pushEvent = createLikeReceivedEvent({ photoId, coupleId, likerId, likeTimestamp, senderName: likerName });
  const sendResult = await sendEventBestEffort(recipientId, pushEvent, {
    notificationType: 'like_received',
    coupleId,
    photoId,
    senderId: likerId
  });
  console.log('notify_photo_liked_completed', {
    coupleId,
    photoId,
    likerId,
    recipientId,
    ...sendResult
  });
});

export const removePairing = onCall(async (request) => {
  const uid = requireUid(request);
  return { ok: true, ...(await removePairingForUser(uid)) };
});

export const deleteAccount = onCall(async (request) => {
  const uid = requireUid(request);
  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();
  const userData = userSnap.exists ? userSnap.data() : {};
  const coupleId = typeof userData.coupleId === 'string' ? userData.coupleId : null;
  const coupleUsers = [];

  if (coupleId) {
    await db.runTransaction(async (transaction) => {
      const coupleRef = db.doc(`couples/${coupleId}`);
      const coupleSnap = await transaction.get(coupleRef);
      if (!coupleSnap.exists) return;
      const users = Array.isArray(coupleSnap.data().users) ? coupleSnap.data().users : [];
      coupleUsers.push(...users);
      if (users.includes(uid)) {
        transaction.update(coupleRef, { users: remainingCoupleUsers({ uid, coupleUsers: users }) });
      }
    });
  }

  const plan = buildAccountDeletionPlan({ uid, coupleId, coupleUsers });
  await invalidatePendingRequestsForUsers([uid], 'canceled');
  await invalidateActiveCodesForUsers([uid], 'canceled');

  const reports = await db.collection('contentReports').where('reporterId', '==', uid).get();
  if (!reports.empty) {
    const batch = db.batch();
    reports.forEach((report) => batch.update(report.ref, {
      reporterId: null,
      reporterDeletedAt: FieldValue.serverTimestamp()
    }));
    await batch.commit();
  }

  await deleteUserOwnedFirestoreData(uid);
  await deleteUserStorageFiles(uid);
  await deleteFirebaseAuthUser(uid);
  return { ok: true, preservedCoupleId: plan.coupleId, preservedCouplePhotos: plan.deleteCouplePhotos === false };
});

export const reportContent = onCall(async (request) => {
  const uid = requireUid(request);
  const { photoId, reason } = validateReportInput(request.data || {});
  const { coupleId } = await getCoupleMembership(uid);
  const photoSnap = await db.doc(`couples/${coupleId}/photos/${photoId}`).get();
  if (!photoSnap.exists) throw new HttpsError('not-found', 'Photo not found.');

  const reportRef = db.collection('contentReports').doc();
  await reportRef.set({
    reporterId: uid,
    coupleId,
    photoId,
    reportedUserId: photoSnap.data()?.senderId || null,
    reason,
    status: 'open',
    createdAt: FieldValue.serverTimestamp()
  });
  return { ok: true, reportId: reportRef.id };
});

export const blockUser = onCall(async (request) => {
  const uid = requireUid(request);
  const blockedUid = typeof request.data?.blockedUid === 'string' ? request.data.blockedUid.trim() : '';
  if (!blockedUid || blockedUid.includes('/') || blockedUid === uid) {
    throw new HttpsError('invalid-argument', 'A different user ID is required.');
  }
  await getUser(blockedUid);

  await db.doc(`users/${uid}/private/blockedUsers/${blockedUid}`).set({
    blockedUid,
    blockedAt: FieldValue.serverTimestamp()
  });

  const userSnap = await db.doc(`users/${uid}`).get();
  if (userSnap.data()?.coupleId) {
    const coupleSnap = await db.doc(`couples/${userSnap.data().coupleId}`).get();
    const coupleUsers = coupleSnap.exists && Array.isArray(coupleSnap.data().users) ? coupleSnap.data().users : [];
    if (coupleUsers.includes(blockedUid)) await removePairingForUser(uid);
  }

  return { ok: true };
});

async function getPartnerIdForUser(uid) {
  const user = await getUser(uid);
  const coupleId = user.coupleId;
  if (!coupleId || typeof coupleId !== 'string') {
    throw new HttpsError('failed-precondition', 'You are not currently paired.');
  }
  const coupleSnap = await db.doc(`couples/${coupleId}`).get();
  if (!coupleSnap.exists) throw new HttpsError('not-found', 'Pairing record not found.');
  const users = Array.isArray(coupleSnap.data().users) ? coupleSnap.data().users : [];
  if (!users.includes(uid)) throw new HttpsError('permission-denied', 'You are not a member of this pairing.');
  const partnerId = users.find((memberUid) => memberUid !== uid);
  if (!partnerId) throw new HttpsError('failed-precondition', 'Paired user not found.');
  return { user, coupleId, partnerId };
}

async function enforceAndRecordTestCooldown(uid) {
  const ref = db.doc(`users/${uid}/private/notificationDiagnostics`);
  const snap = await ref.get();
  enforceTestCooldown({
    lastTestAtMs: snap.exists ? (snap.data().lastTestPushAt?.toMillis?.() || 0) : 0,
    nowMs: Date.now(),
    cooldownMs: 10000
  });
  await ref.set({ lastTestPushAt: FieldValue.serverTimestamp() }, { merge: true });
}

export const sendTestPushToPartnerDevices = onCall(async (request) => {
  const senderId = requireUid(request);
  try {
    await enforceAndRecordTestCooldown(senderId);
    const { user, coupleId, partnerId } = await getPartnerIdForUser(senderId);
    const senderName = user.displayName || user.email || 'Your person';
    const event = {
      eventId: `debug_partner:${senderId}:${Date.now()}`,
      type: 'debug_test',
      ...pushCopy.debugPartner(senderName),
      data: { coupleId, senderId },
      link: '/',
      ttlSeconds: 300
    };
    const sendResult = await sendPushToUser({ db, messaging, uid: partnerId, event, context: { notificationType: 'debug_test', coupleId, senderId }, now: nowTimestamp });
    return { ok: sendResult.outcome === 'sent', recipientId: partnerId, ...sendResult };
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const sendTestPushNotification = sendTestPushToPartnerDevices;

export const sendTestPushToThisDevice = onCall(async (request) => {
  const uid = requireUid(request);
  const deviceId = request.data?.deviceId;
  if (!deviceId || typeof deviceId !== 'string') throw new HttpsError('invalid-argument', 'Device ID is required.');
  try {
    const snap = await db.doc(`users/${uid}/fcmTokens/${deviceId}`).get();
    if (!snap.exists || snap.data().enabled === false) {
      return { ok: false, outcome: 'no_registered_devices', tokenCount: 0, successCount: 0, failureCount: 0, staleDeletedCount: 0, failureCodes: [] };
    }
    await enforceAndRecordTestCooldown(uid);
    const event = {
      eventId: `debug_device:${uid}:${deviceId}:${Date.now()}`,
      type: 'debug_test',
      ...pushCopy.debugDevice(),
      data: { deviceId },
      link: '/',
      ttlSeconds: 300
    };
    const data = Object.fromEntries(Object.entries({
      ...event.data,
      eventId: event.eventId,
      type: event.type,
      title: event.title,
      body: event.body,
      link: event.link
    }).map(([key, value]) => [key, String(value)]));
    const response = await messaging.sendEachForMulticast({
      tokens: [snap.data().token],
      data,
      webpush: { headers: { TTL: '300' }, fcmOptions: { link: '/' } }
    });
    return {
      ok: response.successCount > 0,
      outcome: response.successCount > 0 ? 'sent' : 'failed',
      tokenCount: 1,
      successCount: response.successCount,
      failureCount: response.failureCount,
      staleDeletedCount: 0,
      failureCodes: response.responses.filter((item) => !item.success).map((item) => item.error?.code || 'unknown')
    };
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const getNotificationDiagnostics = onCall(async (request) => {
  const uid = requireUid(request);
  const deviceId = request.data?.deviceId;
  if (!deviceId || typeof deviceId !== 'string') throw new HttpsError('invalid-argument', 'Device ID is required.');
  const partnerId = await getPartnerIdForUser(uid).then((result) => result.partnerId).catch(() => null);
  return loadNotificationDiagnostics({ db, uid, deviceId, partnerId, now: nowTimestamp });
});

export const registerFcmToken = onCall(async (request) => {
  const uid = requireUid(request);
  const { token, deviceId, permission, userAgent } = request.data || {};
  if (!token || typeof token !== 'string') throw new HttpsError('invalid-argument', 'FCM token is required.');
  if (!deviceId || typeof deviceId !== 'string') throw new HttpsError('invalid-argument', 'Device ID is required.');
  console.log('fcm_token_registration_started', { uid, deviceIdLength: deviceId.length });
  const result = await registerDeviceToken({ db, uid, token, deviceId, permission, userAgent, now: nowTimestamp });
  console.log('fcm_token_registration_completed', { uid, deviceId, tokenFingerprint: result.tokenFingerprint });
  return result;
});

export const removeFcmToken = onCall(async (request) => {
  const uid = requireUid(request);
  const deviceId = request.data?.deviceId;
  if (!deviceId || typeof deviceId !== 'string') throw new HttpsError('invalid-argument', 'Device ID is required.');
  return removeDeviceToken({ db, uid, deviceId });
});

export const expireFcmTokens = onSchedule('every 24 hours', async () => {
  const result = await expireStaleRegistrations({ db, now: nowTimestamp, maxAgeDays: 60 });
  console.log('fcm_token_expiry_completed', result);
  return result;
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
  await assertUsersNotBlocked(data.senderId, uid);

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

  const accepter = await getUser(uid);
  await sendEventBestEffort(data.senderId, createPairingAcceptedEvent({
    requestId,
    senderName: accepter.displayName || accepter.email || 'Your person'
  }), {
    notificationType: 'pairing_accepted',
    coupleId,
    senderId: uid
  });

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
  await assertUsersNotBlocked(codeData.creatorId, uid);

  const redeemer = await getUser(uid);
  assertUnpaired(redeemer, 'You');
  const coupleId = await createCoupleForUsers(codeData.creatorId, uid, 'pairing_code');
  await codeRef.update({
    status: 'used',
    usedBy: uid,
    coupleId,
    resolvedAt: FieldValue.serverTimestamp()
  });
  const redeemerUser = await getUser(uid);
  await sendEventBestEffort(codeData.creatorId, createPairingAcceptedEvent({
    requestId: `code:${code}`,
    senderName: redeemerUser.displayName || redeemerUser.email || 'Your person'
  }), {
    notificationType: 'pairing_accepted',
    coupleId,
    senderId: uid
  });
  return { coupleId };
});

export const notifyPairingRequest = onDocumentCreated('pairingRequests/{requestId}', async (event) => {
  const requestData = event.data?.data();
  const { requestId } = event.params;
  if (!requestData || requestData.status !== 'pending' || !requestData.senderId || !requestData.recipientId) return;
  const sender = requestData.sender || await getUser(requestData.senderId).catch(() => ({ displayName: 'Your person' }));
  await sendEventBestEffort(requestData.recipientId, createPairingRequestEvent({
    requestId,
    senderName: sender.displayName || sender.email || 'Your person'
  }), {
    notificationType: 'pairing_request',
    requestId,
    senderId: requestData.senderId
  });
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
