import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { getInitialNotification, onMessage, onNotificationOpenedApp, type RemoteMessage } from '@react-native-firebase/messaging';
import * as Notifications from 'expo-notifications';
import { messagingClient } from '../services/firebase';
import {
  disableNotifications,
  dismissNotificationPrompt,
  enableNotifications,
  getNotificationPromptDismissed,
  getNotificationDiagnostics,
  getNotificationsEnabled,
  readNotificationPermission,
  testPartnerDevices,
  testThisDevice,
  type NotificationPermission
} from '../services/notifications';
import { shouldShowNativeNotificationPrompt, type NativeNotificationPermission } from '../domain/notificationPrompt';
import { useApp } from '../state/AppProvider';

export type NotificationIntent = { type: 'photo'; photoId: string } | { type: 'pairing' };

function messageFromPayload(message: RemoteMessage, t: (key: string) => string) {
  const data = (message.data || {}) as Record<string, unknown>;
  if (data.body) return String(data.body);
  if (data.type === 'photo_received') return t('foreground.photo');
  if (data.type === 'like_received') return t('foreground.loved');
  if (data.type === 'pairing_request') return t('foreground.pairingRequest');
  if (data.type === 'pairing_accepted') return t('foreground.pairingAccepted');
  if (data.type === 'pairing_removed') return t('foreground.pairingRemoved');
  return message.notification?.body || t('foreground.generic');
}

function intentFromData(data: Record<string, unknown>): NotificationIntent | null {
  const type = String(data.type || '');
  const photoId = data.photoId ? String(data.photoId) : '';
  if ((type === 'photo_received' || type === 'like_received') && photoId) return { type: 'photo', photoId };
  if (type === 'pairing_request' || type === 'pairing_removed') return { type: 'pairing' };
  return null;
}

function intentFromMessage(message: RemoteMessage | null): NotificationIntent | null {
  return intentFromData((message?.data || {}) as Record<string, unknown>);
}

function useNotificationsController() {
  const { user, coupleId } = useApp();
  const { t } = useTranslation('notifications');
  const [permission, setPermission] = useState<NotificationPermission>('unknown');
  const [enabled, setEnabled] = useState(false);
  const [promptDismissed, setPromptDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Record<string, any>>({});
  const [foregroundMessage, setForegroundMessage] = useState('');
  const [notificationIntent, setNotificationIntent] = useState<NotificationIntent | null>(null);
  const recentEventIdsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    void Promise.all([readNotificationPermission(), getNotificationsEnabled(), getNotificationPromptDismissed(user.uid)]).then(([nextPermission, nextEnabled, nextDismissed]) => {
      if (!active) return;
      setPermission(nextPermission);
      setEnabled(nextEnabled);
      setPromptDismissed(nextDismissed);
    });
    const handleOpened = (message: RemoteMessage | null) => {
      if (!active) return;
      const intent = intentFromMessage(message);
      if (intent) setNotificationIntent(intent);
    };
    const stopForeground = onMessage(messagingClient, (message) => {
      const data = (message.data || {}) as Record<string, unknown>;
      const eventId = String(data.eventId || data.photoId || data.type || '');
      if (eventId && recentEventIdsRef.current.includes(eventId)) return;
      if (eventId) {
        recentEventIdsRef.current = [...recentEventIdsRef.current.filter((id) => id !== eventId), eventId].slice(-50);
      }
      setForegroundMessage(messageFromPayload(message, t));
    });
    const stopOpened = onNotificationOpenedApp(messagingClient, handleOpened);
    void getInitialNotification(messagingClient).then(handleOpened);
    const notificationResponse = Notifications.addNotificationResponseReceivedListener((response) => {
      if (!active) return;
      const intent = intentFromData(response.notification.request.content.data as Record<string, unknown>);
      if (intent) setNotificationIntent(intent);
    });
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const intent = intentFromData(response.notification.request.content.data as Record<string, unknown>);
      if (intent) setNotificationIntent(intent);
    });
    return () => { active = false; stopForeground(); stopOpened(); notificationResponse.remove(); };
  }, [t, user]);

  const showPrompt = shouldShowNativeNotificationPrompt({
    paired: Boolean(coupleId),
    permission: permission as NativeNotificationPermission,
    enabled,
    dismissed: promptDismissed
  });

  const dismissPrompt = useCallback(() => {
    if (!user) return;
    setPromptDismissed(true);
    void dismissNotificationPrompt(user.uid);
  }, [user]);

  const clearNotificationIntent = useCallback(() => setNotificationIntent(null), []);
  const clearForegroundMessage = useCallback(() => setForegroundMessage(''), []);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      const result = await enableNotifications();
      setPermission(result.permission);
      setEnabled(result.status === 'registered');
      return result;
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      await disableNotifications();
      setEnabled(false);
    } finally {
      setBusy(false);
    }
  }, []);

  const refreshDiagnostics = useCallback(async () => {
    setBusy(true);
    try {
      const next = await getNotificationDiagnostics();
      setDiagnostics(next as Record<string, any>);
      return next;
    } finally {
      setBusy(false);
    }
  }, []);

  const runTest = useCallback(async (test: () => Promise<unknown>) => {
    setBusy(true);
    try {
      const result = await test();
      setDiagnostics((current) => ({ ...current, lastTest: result }));
      return result;
    } finally {
      setBusy(false);
    }
  }, []);

  const testThisDeviceAction = useCallback(() => runTest(testThisDevice), [runTest]);
  const testPartnerDevicesAction = useCallback(() => runTest(testPartnerDevices), [runTest]);

  return useMemo(() => ({
    status: { permission, enabled },
    showPrompt,
    dismissPrompt,
    diagnostics,
    busy,
    foregroundMessage,
    clearForegroundMessage,
    notificationIntent,
    clearNotificationIntent,
    enable,
    disable,
    registerDevice: enable,
    refreshDiagnostics,
    testThisDevice: testThisDeviceAction,
    testPartnerDevices: testPartnerDevicesAction
  }), [busy, clearForegroundMessage, clearNotificationIntent, diagnostics, disable, dismissPrompt, enable, enabled, foregroundMessage, notificationIntent, permission, refreshDiagnostics, showPrompt, testPartnerDevicesAction, testThisDeviceAction]);
}

type NotificationsContextValue = ReturnType<typeof useNotificationsController>;
const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: PropsWithChildren) {
  const value = useNotificationsController();
  return createElement(NotificationsContext.Provider, { value }, children);
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error('useNotifications must be used inside NotificationsProvider');
  return context;
}
