import { functions, getMessagingToken, httpsCallable } from './firebase';

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';

export async function requestAndRegisterPushToken() {
  if (!vapidKey || typeof window === 'undefined' || !('Notification' in window)) {
    return { ok: false, reason: 'unsupported' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, reason: permission };
  }

  const registration = await navigator.serviceWorker?.register('/firebase-messaging-sw.js', {
    scope: '/firebase-cloud-messaging-push-scope'
  });
  const token = await getMessagingToken({
    vapidKey,
    serviceWorkerRegistration: registration
  });
  if (!token) {
    return { ok: false, reason: 'no-token' };
  }

  await httpsCallable(functions, 'registerFcmToken')({
    token,
    userAgent: navigator.userAgent
  });
  return { ok: true, reason: 'registered' };
}

export async function sendTestPushNotification() {
  const callSendTestPushNotification = httpsCallable(functions, 'sendTestPushNotification');
  const response = await callSendTestPushNotification();
  return response.data;
}
