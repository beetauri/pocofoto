import { createHash } from 'node:crypto';
import { pushCopy } from './pushCopy.js';

const STALE_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token'
]);

export function tokenFingerprint(token) {
  return createHash('sha256').update(String(token)).digest('hex').slice(0, 16);
}

export function buildPushMessage({ eventId, type, title, body, data = {}, link = '/', ttlSeconds = 86400 }) {
  return {
    data: Object.fromEntries(Object.entries({
      ...data,
      eventId,
      type,
      title,
      body,
      link
    }).map(([key, value]) => [key, String(value)])),
    webpush: {
      headers: {
        TTL: String(ttlSeconds)
      },
      fcmOptions: { link }
    }
  };
}

export function dedupeRegistrations(registrations) {
  const seen = new Set();
  return registrations.filter((registration) => {
    if (!registration?.token || seen.has(registration.token)) return false;
    seen.add(registration.token);
    return true;
  });
}

export function enforceTestCooldown({ lastTestAtMs = 0, nowMs = Date.now(), cooldownMs = 10000 }) {
  const remainingMs = cooldownMs - (nowMs - lastTestAtMs);
  if (remainingMs > 0) {
    const error = new Error(`Test push cooldown active. Retry in ${remainingMs}ms.`);
    error.code = 'resource-exhausted';
    error.retryAfterSeconds = Math.ceil(remainingMs / 1000);
    throw error;
  }
}

export function createPhotoReceivedEvent({ photoId, coupleId, senderName: name }) {
  return {
    eventId: `photo_received:${coupleId}:${photoId}`,
    type: 'photo_received',
    ...pushCopy.photoReceived(name),
    data: { coupleId, photoId },
    link: '/',
    ttlSeconds: 86400
  };
}

export function createLikeReceivedEvent({ photoId, coupleId, likerId, likeTimestamp, senderName: name }) {
  return {
    eventId: `like_received:${coupleId}:${photoId}:${likerId}:${likeTimestamp}`,
    type: 'like_received',
    ...pushCopy.photoLiked(name),
    data: { coupleId, photoId, likerId },
    link: '/',
    ttlSeconds: 86400
  };
}

export function createPairingRequestEvent({ requestId, senderName: name }) {
  return {
    eventId: `pairing_request:${requestId}`,
    type: 'pairing_request',
    ...pushCopy.pairingRequest(name),
    data: { requestId },
    link: '/?pairing=requests',
    ttlSeconds: 86400
  };
}

export function createPairingAcceptedEvent({ requestId, senderName: name }) {
  return {
    eventId: `pairing_accepted:${requestId}`,
    type: 'pairing_accepted',
    ...pushCopy.pairingAccepted(name),
    data: { requestId },
    link: '/',
    ttlSeconds: 86400
  };
}

export function createPairingRemovedEvent({ coupleId, removalId, senderName: name }) {
  return {
    eventId: `pairing_removed:${coupleId}:${removalId}`,
    type: 'pairing_removed',
    ...pushCopy.pairingRemoved(name),
    data: { coupleId, removalId },
    link: '/?pairing=requests',
    ttlSeconds: 86400
  };
}

export async function registerDeviceToken({ db, uid, token, deviceId, permission = 'granted', userAgent = '', now }) {
  const fingerprint = tokenFingerprint(token);
  const userTokenRef = db.doc(`users/${uid}/fcmTokens/${deviceId}`);
  const registryRef = db.doc(`fcmTokenRegistry/${fingerprint}`);
  const timestamp = now();

  await db.runTransaction(async (transaction) => {
    const registrySnap = await transaction.get(registryRef);
    const owner = registrySnap.exists ? registrySnap.data() : null;
    if (owner?.uid && owner.uid !== uid && owner.deviceId) {
      transaction.delete(db.doc(`users/${owner.uid}/fcmTokens/${owner.deviceId}`));
    }
    transaction.set(userTokenRef, {
      token,
      tokenFingerprint: fingerprint,
      userAgent: String(userAgent).slice(0, 180),
      permission,
      enabled: true,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastSeenAt: timestamp
    }, { merge: true });
    transaction.set(registryRef, { uid, deviceId, updatedAt: timestamp }, { merge: true });
  });

  return { ok: true, tokenFingerprint: fingerprint };
}

export async function removeDeviceToken({ db, uid, deviceId }) {
  const tokenRef = db.doc(`users/${uid}/fcmTokens/${deviceId}`);
  const snap = await tokenRef.get();
  const fingerprint = snap.exists ? snap.data().tokenFingerprint : null;
  await tokenRef.delete();
  if (fingerprint) await db.doc(`fcmTokenRegistry/${fingerprint}`).delete();
  return { ok: true };
}

export async function loadActiveRegistrations({ db, uid, now, maxAgeDays = 60 }) {
  const cutoff = now().toMillis() - maxAgeDays * 24 * 60 * 60 * 1000;
  const snap = await db.collection(`users/${uid}/fcmTokens`).get();
  return snap.docs
    .map((doc) => ({ id: doc.id, ref: doc.ref, ...doc.data() }))
    .filter((registration) => registration.enabled !== false && registration.token)
    .filter((registration) => (registration.lastSeenAt?.toMillis?.() || 0) >= cutoff);
}

function summarizeFailures(responses) {
  const failureDetails = responses
    .map((result, index) => result.success ? null : {
      tokenIndex: index,
      code: result.error?.code || 'unknown',
      message: result.error?.message || ''
    })
    .filter(Boolean);
  return {
    failureDetails,
    failureCodes: [...new Set(failureDetails.map((failure) => failure.code))]
  };
}

export async function sendPushToUser({ db, messaging, uid, event, context = {}, now }) {
  const registrations = dedupeRegistrations(await loadActiveRegistrations({ db, uid, now }));
  const tokenCount = registrations.length;
  console.log('push_send_started', { ...context, eventId: event.eventId, notificationType: event.type, recipientId: uid });
  if (tokenCount === 0) {
    const result = { outcome: 'no_registered_devices', tokenCount: 0, successCount: 0, failureCount: 0, staleDeletedCount: 0, failureCodes: [] };
    console.log('push_send_completed', { ...context, eventId: event.eventId, recipientId: uid, ...result });
    return result;
  }

  const response = await messaging.sendEachForMulticast({
    tokens: registrations.map((registration) => registration.token),
    ...buildPushMessage(event)
  });
  const { failureDetails, failureCodes } = summarizeFailures(response.responses);
  const staleDeletes = response.responses
    .map((result, index) => (!result.success && STALE_TOKEN_CODES.has(result.error?.code)) ? registrations[index].ref.delete() : null)
    .filter(Boolean);
  await Promise.all(staleDeletes);
  const result = {
    outcome: response.successCount > 0 ? 'sent' : 'failed',
    tokenCount,
    successCount: response.successCount,
    failureCount: response.failureCount,
    staleDeletedCount: staleDeletes.length,
    failureCodes
  };
  console.log('push_send_completed', { ...context, eventId: event.eventId, recipientId: uid, ...result, failureDetails });
  return result;
}

export async function getNotificationDiagnostics({ db, uid, deviceId, partnerId, now }) {
  const currentSnap = await db.doc(`users/${uid}/fcmTokens/${deviceId}`).get();
  const partnerRegistrations = partnerId ? await loadActiveRegistrations({ db, uid: partnerId, now }) : [];
  return {
    ok: true,
    registered: currentSnap.exists,
    tokenFingerprint: currentSnap.exists ? currentSnap.data().tokenFingerprint : null,
    lastSeenAt: currentSnap.exists ? currentSnap.data().lastSeenAt : null,
    enabled: currentSnap.exists ? currentSnap.data().enabled !== false : false,
    partnerTokenCount: dedupeRegistrations(partnerRegistrations).length
  };
}

export async function expireStaleRegistrations({ db, now, maxAgeDays = 60 }) {
  const cutoff = now().toMillis() - maxAgeDays * 24 * 60 * 60 * 1000;
  const stale = await db.collectionGroup('fcmTokens').where('lastSeenAt', '<', now.constructor.fromMillis(cutoff)).get();
  await Promise.all(stale.docs.map((doc) => doc.ref.delete()));
  return { expiredCount: stale.size };
}
