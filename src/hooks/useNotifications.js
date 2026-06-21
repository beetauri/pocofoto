import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { notificationClient } from '../notifications/notificationClient';
import { notificationDeviceStore } from '../lib/notificationDevice';

function messageFromPayload(payload, t) {
  const data = payload?.data || {};
  if (data.body) return data.body;
  if (data.type === 'photo_received') return t('foreground.photo');
  if (data.type === 'like_received') return t('foreground.loved');
  if (data.type === 'pairing_request') return t('foreground.pairingRequest');
  if (data.type === 'pairing_accepted') return t('foreground.pairingAccepted');
  if (data.type === 'pairing_removed') return t('foreground.pairingRemoved');
  return payload?.notification?.body || t('foreground.generic');
}

export function useNotifications({
  user,
  paired,
  online,
  client = notificationClient,
  store = notificationDeviceStore
}) {
  const { t } = useTranslation('notifications');
  const [status, setStatus] = useState(() => client.getStatus());
  const [promptDismissed, setPromptDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [diagnostics, setDiagnostics] = useState(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [foregroundMessage, setForegroundMessage] = useState('');

  useEffect(() => {
    if (!user) return;
    setPromptDismissed(store.isPromptDismissed(user.uid));
  }, [store, user]);

  useEffect(() => {
    if (!user || !online) return;
    const current = client.getStatus();
    setStatus(current);
    if (current.permission !== 'granted') return;
    let active = true;
    client.syncGrantedPermission()
      .then(() => {
        if (active) setStatus(client.getStatus());
      })
      .catch((error) => {
        console.warn('Notification startup sync failed.', { code: error?.code || 'unknown' });
      });
    return () => {
      active = false;
    };
  }, [client, online, user]);

  const showPrompt = Boolean(
    user
      && paired
      && online
      && !promptDismissed
      && status.permission === 'default'
  );

  const refreshDiagnostics = useCallback(async () => {
    const nextDiagnostics = await client.getDiagnostics();
    setDiagnostics(nextDiagnostics);
    setStatus(client.getStatus());
    return nextDiagnostics;
  }, [client]);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      const result = await client.enable();
      setStatus(client.getStatus());
      await refreshDiagnostics().catch(() => null);
      return result;
    } finally {
      setBusy(false);
    }
  }, [client, refreshDiagnostics]);

  const registerDevice = useCallback(async () => {
    setBusy(true);
    try {
      const result = await client.registerDevice();
      setStatus(client.getStatus());
      if (result?.status === 'registered') await refreshDiagnostics().catch(() => null);
      return result;
    } finally {
      setBusy(false);
    }
  }, [client, refreshDiagnostics]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const result = await client.disable();
      setStatus(client.getStatus());
      await refreshDiagnostics().catch(() => null);
      return result;
    } finally {
      setBusy(false);
    }
  }, [client, refreshDiagnostics]);

  const dismissPrompt = useCallback(() => {
    if (!user) return;
    store.dismissPrompt(user.uid);
    setPromptDismissed(true);
  }, [store, user]);

  const cleanupBeforeLogout = useCallback(async () => {
    return client.cleanupBeforeLogout();
  }, [client]);

  const handleTestError = useCallback((error) => {
    const retryAfterSeconds = error?.details?.retryAfterSeconds || error?.customData?.retryAfterSeconds || 0;
    if (retryAfterSeconds > 0) setCooldownUntil(Date.now() + retryAfterSeconds * 1000);
    throw error;
  }, []);

  const testThisDevice = useCallback(async () => {
    try {
      const result = await client.testThisDevice();
      await refreshDiagnostics().catch(() => null);
      return result;
    } catch (error) {
      return handleTestError(error);
    }
  }, [client, handleTestError, refreshDiagnostics]);

  const testPartnerDevices = useCallback(async () => {
    try {
      const result = await client.testPartnerDevices();
      await refreshDiagnostics().catch(() => null);
      return result;
    } catch (error) {
      return handleTestError(error);
    }
  }, [client, handleTestError, refreshDiagnostics]);

  const handleForegroundMessage = useCallback((payload) => {
    const eventId = payload?.data?.eventId || payload?.data?.photoId || payload?.data?.type || '';
    if (eventId && !store.rememberEvent(eventId)) return;
    setForegroundMessage(messageFromPayload(payload, t));
  }, [store, t]);

  const clearForegroundMessage = useCallback(() => setForegroundMessage(''), []);

  return useMemo(() => ({
    status,
    showPrompt,
    busy,
    enable,
    registerDevice,
    disable,
    dismissPrompt,
    cleanupBeforeLogout,
    diagnostics,
    refreshDiagnostics,
    testThisDevice,
    testPartnerDevices,
    cooldownUntil,
    foregroundMessage,
    handleForegroundMessage,
    clearForegroundMessage
  }), [
    status,
    showPrompt,
    busy,
    enable,
    registerDevice,
    disable,
    dismissPrompt,
    cleanupBeforeLogout,
    diagnostics,
    refreshDiagnostics,
    testThisDevice,
    testPartnerDevices,
    cooldownUntil,
    foregroundMessage,
    handleForegroundMessage,
    clearForegroundMessage
  ]);
}
