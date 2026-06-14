const DEVICE_ID_KEY = 'pocofoto:notifications:device-id';
const DISMISS_PREFIX = 'pocofoto:notifications:prompt-dismissed:';
const RECENT_EVENTS_KEY = 'pocofoto:notifications:recent-events';
const DEVICE_ENABLED_KEY = 'pocofoto:notifications:device-enabled';

function browserStorage() {
  return typeof window !== 'undefined' ? window.localStorage : null;
}

function fallbackStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}

function safeRandomUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `device-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export function notificationPermissionState(notificationApi) {
  if (!notificationApi) return 'unsupported';
  return ['default', 'granted', 'denied'].includes(notificationApi.permission)
    ? notificationApi.permission
    : 'unsupported';
}

export function createNotificationDeviceStore({
  storage = browserStorage() || fallbackStorage(),
  randomUUID = safeRandomUUID,
  now = () => Date.now(),
  maxRecentEvents = 50
} = {}) {
  function readRecent() {
    try {
      const parsed = JSON.parse(storage.getItem(RECENT_EVENTS_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeRecent(events) {
    storage.setItem(RECENT_EVENTS_KEY, JSON.stringify(events.slice(-maxRecentEvents)));
  }

  return {
    getDeviceId() {
      const existing = storage.getItem(DEVICE_ID_KEY);
      if (existing) return existing;
      const next = randomUUID();
      storage.setItem(DEVICE_ID_KEY, next);
      return next;
    },
    dismissPrompt(uid) {
      storage.setItem(`${DISMISS_PREFIX}${uid}`, String(now()));
    },
    isPromptDismissed(uid) {
      return Boolean(storage.getItem(`${DISMISS_PREFIX}${uid}`));
    },
    setNotificationsEnabled(enabled) {
      storage.setItem(DEVICE_ENABLED_KEY, enabled ? 'true' : 'false');
    },
    getNotificationsEnabled() {
      const value = storage.getItem(DEVICE_ENABLED_KEY);
      if (value === null) return null;
      return value === 'true';
    },
    hasSeenEvent(eventId) {
      return readRecent().some((event) => event.id === eventId);
    },
    rememberEvent(eventId) {
      const recent = readRecent();
      if (recent.some((event) => event.id === eventId)) return false;
      writeRecent([...recent, { id: eventId, seenAt: now() }]);
      return true;
    }
  };
}

export const notificationDeviceStore = createNotificationDeviceStore();
