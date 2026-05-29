import admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();
const { FieldValue, Timestamp } = admin.firestore;

const CONTACTS_SCOPE = 'https://www.googleapis.com/auth/contacts.readonly';
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

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function contactDocId(email) {
  return encodeURIComponent(email).replace(/\./g, '%2E');
}

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
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

async function notifyPairingRequest(requestRef, sender, recipientId) {
  const notificationRef = db
    .collection('users')
    .doc(recipientId)
    .collection('notifications')
    .doc(requestRef.id);

  await notificationRef.set({
    type: 'pairing_request',
    requestId: requestRef.id,
    status: 'unread',
    sender: displaySnapshot(sender),
    createdAt: FieldValue.serverTimestamp()
  });

  const tokensSnap = await db.collection(`users/${recipientId}/fcmTokens`).get();
  const tokens = tokensSnap.docs.map((doc) => doc.data().token).filter(Boolean);
  if (tokens.length === 0) return;

  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: {
      title: 'New pairing invite',
      body: `${sender.displayName || sender.email || 'Someone'} wants to pair with you on Pocofoto.`
    },
    webpush: {
      fcmOptions: {
        link: '/?pairing=requests'
      }
    },
    data: {
      type: 'pairing_request',
      requestId: requestRef.id
    }
  });

  const staleDeletes = [];
  response.responses.forEach((result, index) => {
    if (!result.success && [
      'messaging/registration-token-not-registered',
      'messaging/invalid-registration-token'
    ].includes(result.error?.code)) {
      staleDeletes.push(tokensSnap.docs[index].ref.delete());
    }
  });
  await Promise.all(staleDeletes);
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
  return coupleId;
}

export const importGoogleContacts = onCall(async (request) => {
  const uid = requireUid(request);
  const accessToken = request.data?.accessToken;
  if (!accessToken || typeof accessToken !== 'string') {
    throw new HttpsError('invalid-argument', 'Google Contacts access token is required.');
  }

  const contacts = new Map();
  if (process.env.FUNCTIONS_EMULATOR === 'true' && Array.isArray(request.data?.mockContacts)) {
    for (const contact of request.data.mockContacts) {
      const email = normalizeEmail(contact.email);
      if (email) {
        contacts.set(email, {
          email,
          displayName: contact.displayName || '',
          photo: contact.photo || ''
        });
      }
    }
  } else {
  let pageToken = '';
  do {
    const url = new URL('https://people.googleapis.com/v1/people/me/connections');
    url.searchParams.set('pageSize', '1000');
    url.searchParams.set('personFields', 'names,emailAddresses,photos');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new HttpsError(
        response.status === 401 || response.status === 403 ? 'permission-denied' : 'unavailable',
        `Unable to import Google contacts with ${CONTACTS_SCOPE}.`
      );
    }

    const payload = await response.json();
    for (const person of payload.connections || []) {
      const name = person.names?.find((item) => item.metadata?.primary)?.displayName
        || person.names?.[0]?.displayName
        || '';
      const photo = person.photos?.find((item) => item.metadata?.primary)?.url
        || person.photos?.[0]?.url
        || '';
      for (const item of person.emailAddresses || []) {
        const email = normalizeEmail(item.value);
        if (email) contacts.set(email, { email, displayName: name, photo });
      }
    }
    pageToken = payload.nextPageToken || '';
  } while (pageToken);
  }

  const existing = await db.collection(`userContacts/${uid}/contacts`).get();
  const writer = db.bulkWriter();
  const importedIds = new Set([...contacts.keys()].map(contactDocId));
  existing.docs.forEach((doc) => {
    if (!importedIds.has(doc.id)) writer.delete(doc.ref);
  });

  const importedAt = FieldValue.serverTimestamp();
  for (const contact of contacts.values()) {
    writer.set(db.doc(`userContacts/${uid}/contacts/${contactDocId(contact.email)}`), {
      ...contact,
      importedAt
    });
  }
  await writer.close();

  await db.doc(`users/${uid}`).set({
    contactsImportedAt: importedAt,
    contactsCount: contacts.size,
    updatedAt: importedAt
  }, { merge: true });

  return { count: contacts.size };
});

export const listEligibleContacts = onCall(async (request) => {
  const uid = requireUid(request);
  const contactSnap = await db.collection(`userContacts/${uid}/contacts`).get();
  const contactsByEmail = new Map();
  contactSnap.forEach((doc) => {
    const contact = doc.data();
    const email = normalizeEmail(contact.email);
    if (email) contactsByEmail.set(email, contact);
  });

  const emails = [...contactsByEmail.keys()];
  const matches = new Map();
  for (const group of chunk(emails, 10)) {
    const usersSnap = await db.collection('users')
      .where('normalizedEmail', 'in', group)
      .get();
    usersSnap.forEach((doc) => {
      if (doc.id === uid) return;
      const user = doc.data();
      if (user.coupleId) return;
      const email = normalizeEmail(user.normalizedEmail || user.email);
      const contact = contactsByEmail.get(email);
      if (!contact) return;
      matches.set(doc.id, {
        uid: doc.id,
        email,
        displayName: user.displayName || contact.displayName || email,
        profilePic: user.profilePic || contact.photo || '',
        contactName: contact.displayName || ''
      });
    });
  }

  return {
    contactsImportedAt: (await db.doc(`users/${uid}`).get()).data()?.contactsImportedAt || null,
    contacts: [...matches.values()].sort((a, b) => a.displayName.localeCompare(b.displayName))
  };
});

export const sendPairingRequest = onCall(async (request) => {
  const senderId = requireUid(request);
  const recipientId = request.data?.recipientId;
  if (!recipientId || typeof recipientId !== 'string' || recipientId === senderId) {
    throw new HttpsError('invalid-argument', 'A valid recipient is required.');
  }

  const sender = await getUser(senderId);
  const recipient = await getUser(recipientId);
  assertUnpaired(sender, 'You');
  assertUnpaired(recipient, 'This user');

  const contactRef = db.doc(`userContacts/${senderId}/contacts/${contactDocId(normalizeEmail(recipient.email))}`);
  if (!(await contactRef.get()).exists) {
    throw new HttpsError('permission-denied', 'Recipient must be in your imported Google contacts.');
  }

  const activeOutgoing = await db.collection('pairingRequests')
    .where('senderId', '==', senderId)
    .where('status', '==', 'pending')
    .limit(1)
    .get();
  if (!activeOutgoing.empty) {
    throw new HttpsError('failed-precondition', 'You already have a pending pairing request.');
  }

  const requestRef = await db.collection('pairingRequests').add({
    senderId,
    recipientId,
    status: 'pending',
    sender: displaySnapshot(sender),
    recipient: displaySnapshot(recipient),
    expiresAt: expiresAtFromNow(),
    createdAt: FieldValue.serverTimestamp()
  });

  await notifyPairingRequest(requestRef, sender, recipientId);
  return { requestId: requestRef.id };
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
