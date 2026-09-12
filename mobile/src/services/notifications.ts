import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {
  AuthorizationStatus,
  deleteToken,
  getToken,
  hasPermission,
  registerDeviceForRemoteMessages,
  requestPermission
} from '@react-native-firebase/messaging';
import { callFunction, messagingClient } from './firebase';

const DEVICE_ID_KEY = 'pocofoto:native-device-id';
const ENABLED_KEY = 'pocofoto:native-notifications-enabled';
const PROMPT_DISMISSED_PREFIX = 'pocofoto:native-notifications-prompt-dismissed:';

export type NotificationPermission = 'granted' | 'denied' | 'unknown' | 'unsupported';

export function permissionFromStatus(status: number): NotificationPermission {
  if (status === AuthorizationStatus.AUTHORIZED || status === AuthorizationStatus.PROVISIONAL) return 'granted';
  if (status === AuthorizationStatus.DENIED) return 'denied';
  return 'unknown';
}

export async function getDeviceId() {
  try {
    const secured = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (secured) return secured;
  } catch {
    // SecureStore unavailable (e.g. web) — fall through to AsyncStorage.
  }
  // One-time migration: adopt a device id previously stored unencrypted.
  const legacy = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (legacy) {
    try {
      await SecureStore.setItemAsync(DEVICE_ID_KEY, legacy);
      await AsyncStorage.removeItem(DEVICE_ID_KEY);
    } catch {
      // Keep the AsyncStorage copy when SecureStore writes fail.
    }
    return legacy;
  }
  const next = `native-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    await SecureStore.setItemAsync(DEVICE_ID_KEY, next);
  } catch {
    await AsyncStorage.setItem(DEVICE_ID_KEY, next);
  }
  return next;
}

export async function getNotificationsEnabled() {
  return (await AsyncStorage.getItem(ENABLED_KEY)) === 'true';
}

export async function setNotificationsEnabled(enabled: boolean) {
  await AsyncStorage.setItem(ENABLED_KEY, enabled ? 'true' : 'false');
}

export async function getNotificationPromptDismissed(userId: string) {
  return (await AsyncStorage.getItem(`${PROMPT_DISMISSED_PREFIX}${userId}`)) === 'true';
}

export async function dismissNotificationPrompt(userId: string) {
  await AsyncStorage.setItem(`${PROMPT_DISMISSED_PREFIX}${userId}`, 'true');
}

export async function enableNotifications() {
  const permission = await requestPermission(messagingClient);
  const permissionState = permissionFromStatus(permission);
  if (permissionState !== 'granted') return { status: 'denied' as const, permission: permissionState };
  try {
    await registerDeviceForRemoteMessages(messagingClient);
  } catch (error) {
    console.warn('[notifications] registerDeviceForRemoteMessages failed', error);
    return {
      status: 'unavailable' as const,
      permission: permissionState,
      reason: 'registration-failed' as const,
      message: error instanceof Error ? error.message : 'Device registration for remote messages failed.'
    };
  }
  let token: string;
  try {
    token = await getToken(messagingClient);
  } catch (error) {
    console.warn('[notifications] getToken failed', error);
    return {
      status: 'unavailable' as const,
      permission: permissionState,
      reason: 'token-failed' as const,
      message: error instanceof Error ? error.message : 'Unable to get FCM token.'
    };
  }
  const deviceId = await getDeviceId();
  const result = await callFunction('registerFcmToken', {
    token,
    deviceId,
    permission: 'granted',
    userAgent: 'pocofoto-native'
  });
  await setNotificationsEnabled(true);
  return { status: 'registered' as const, permission: permissionState, deviceId, result };
}

export async function disableNotifications() {
  const deviceId = await getDeviceId();
  try {
    await callFunction('removeFcmToken', { deviceId });
  } catch (error) {
    console.warn('[notifications] removeFcmToken failed, keeping enabled state', error);
    throw new Error('Failed to remove push token from server. Notifications remain enabled.');
  }
  await deleteToken(messagingClient).catch((error) => console.warn('[notifications] deleteToken failed', error));
  await setNotificationsEnabled(false);
}

export async function readNotificationPermission(): Promise<NotificationPermission> {
  try {
    return permissionFromStatus(await hasPermission(messagingClient));
  } catch {
    return 'unsupported';
  }
}

export async function getNotificationDiagnostics() {
  return callFunction('getNotificationDiagnostics', { deviceId: await getDeviceId() });
}

export async function testThisDevice() {
  return callFunction('sendTestPushToThisDevice', { deviceId: await getDeviceId() });
}

export async function testPartnerDevices() {
  return callFunction('sendTestPushToPartnerDevices');
}
