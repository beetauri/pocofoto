import { notificationDeviceStore, notificationPermissionState } from '../lib/notificationDevice.js';

const MESSAGING_SW_PATH = '/firebase-messaging-sw.js';
const MESSAGING_SW_SCOPE = '/firebase-cloud-messaging-push-scope';
const vapidKey = import.meta.env?.VITE_FIREBASE_VAPID_KEY || '';

export function formatTokenFingerprint(token) {
  let hash = 0;
  for (let index = 0; index < token.length; index += 1) {
    hash = ((hash << 5) - hash + token.charCodeAt(index)) | 0;
  }
  return `fp-${Math.abs(hash).toString(36).padStart(6, '0').slice(0, 10)}`;
}

export function readNotificationIntent(search = (typeof window !== 'undefined' ? window.location.search : '')) {
  const params = new URLSearchParams(search || '');
  if (params.get('notification') === 'photo' && params.get('photoId')) {
    return {
      type: 'photo',
      photoId: params.get('photoId')
    };
  }
  if (params.get('pairing') === 'requests') {
    return {
      type: 'pairing'
    };
  }
  return null;
}

export function clearNotificationIntent({
  history = typeof window !== 'undefined' ? window.history : null,
  location = typeof window !== 'undefined' ? window.location : null
} = {}) {
  if (!history?.replaceState || !location) return;
  const params = new URLSearchParams(location.search || '');
  params.delete('notification');
  params.delete('photoId');
  params.delete('pairing');
  const nextSearch = params.toString();
  const nextUrl = `${location.pathname}${nextSearch ? `?${nextSearch}` : ''}${location.hash || ''}`;
  history.replaceState(history.state, '', nextUrl);
}

function userAgentSummary() {
  return typeof navigator === 'undefined' ? '' : navigator.userAgent;
}

async function defaultMessagingRegistration() {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return null;
  return navigator.serviceWorker.register(MESSAGING_SW_PATH, { scope: MESSAGING_SW_SCOPE });
}

async function defaultGetToken(options) {
  const { getMessagingToken } = await import('../firebase.js');
  return getMessagingToken(options);
}

async function defaultDeleteToken() {
  const { deleteMessagingToken } = await import('../firebase.js');
  return deleteMessagingToken();
}

async function defaultCallable(name, data) {
  const { functions, httpsCallable } = await import('../firebase.js');
  return httpsCallable(functions, name)(data).then((response) => response.data);
}

function currentNotificationApi() {
  return typeof window !== 'undefined' ? window.Notification : undefined;
}

export function createNotificationClient({
  notificationApi = currentNotificationApi(),
  getDeviceId = () => notificationDeviceStore.getDeviceId(),
  getNotificationsEnabled = () => notificationDeviceStore.getNotificationsEnabled(),
  setNotificationsEnabled = (enabled) => notificationDeviceStore.setNotificationsEnabled(enabled),
  getMessagingRegistration = defaultMessagingRegistration,
  getToken = defaultGetToken,
  deleteToken = defaultDeleteToken,
  call = defaultCallable,
  userAgent = userAgentSummary(),
  vapidKey: configuredVapidKey = vapidKey
} = {}) {
  const getPermission = () => notificationPermissionState(notificationApi);
  let localEnabled = getNotificationsEnabled();

  async function registerCurrentToken() {
    if (!configuredVapidKey) return { status: 'unsupported', reason: 'missing-vapid-key' };
    const registration = await getMessagingRegistration();
    if (!registration) return { status: 'unsupported', reason: 'missing-service-worker' };
    const token = await getToken({
      vapidKey: configuredVapidKey,
      serviceWorkerRegistration: registration
    });
    if (!token) return { status: 'no-token', reason: 'no-token' };
    const deviceId = getDeviceId();
    const response = await call('registerFcmToken', {
      token,
      deviceId,
      permission: getPermission(),
      userAgent
    });
    return {
      status: 'registered',
      tokenFingerprint: response?.tokenFingerprint || formatTokenFingerprint(token),
      deviceId
    };
  }

  async function removeCurrentRegistration() {
    const deviceId = getDeviceId();
    try {
      await deleteToken();
    } catch {
      // Server cleanup still owns the user-visible remove result.
    }
    await call('removeFcmToken', { deviceId });
    return { status: 'removed', deviceId };
  }

  return {
    getStatus() {
      const permission = getPermission();
      return {
        permission,
        supported: permission !== 'unsupported',
        enabled: localEnabled ?? permission === 'granted'
      };
    },
    async enable() {
      if (getPermission() === 'unsupported') return { status: 'unsupported' };
      const permission = notificationApi.permission === 'granted'
        ? 'granted'
        : await notificationApi.requestPermission();
      if (permission !== 'granted') return { status: permission };
      const result = await registerCurrentToken();
      if (result.status === 'registered') {
        localEnabled = true;
        setNotificationsEnabled(true);
      }
      return result;
    },
    async removeCurrentRegistration() {
      return removeCurrentRegistration();
    },
    async disable() {
      const result = await removeCurrentRegistration();
      localEnabled = false;
      setNotificationsEnabled(false);
      return { status: 'disabled', deviceId: result.deviceId };
    },
    async syncGrantedPermission() {
      const permission = getPermission();
      if (permission !== 'granted') return { status: permission };
      if (getNotificationsEnabled() === false) {
        localEnabled = false;
        return { status: 'disabled' };
      }
      const result = await registerCurrentToken();
      if (result.status === 'registered') {
        localEnabled = true;
        setNotificationsEnabled(true);
      }
      return result;
    },
    async cleanupBeforeLogout() {
      return removeCurrentRegistration();
    },
    async getDiagnostics() {
      const deviceId = getDeviceId();
      const registration = await getMessagingRegistration().catch(() => null);
      const response = await call('getNotificationDiagnostics', { deviceId }).catch((error) => ({
        ok: false,
        errorCode: error?.code || 'unknown',
        errorMessage: error?.message || ''
      }));
      return {
        ...response,
        deviceId,
        permission: getPermission(),
        supported: getPermission() !== 'unsupported',
        workerState: registration?.active?.state || registration?.installing?.state || registration?.waiting?.state || 'missing'
      };
    },
    async testThisDevice() {
      return call('sendTestPushToThisDevice', { deviceId: getDeviceId() });
    },
    async testPartnerDevices() {
      return call('sendTestPushToPartnerDevices', { deviceId: getDeviceId() });
    }
  };
}

export const notificationClient = createNotificationClient();
