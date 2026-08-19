import AsyncStorage from '@react-native-async-storage/async-storage';

export const ANALYTICS_CONSENT_KEY = 'pocofoto:analytics-consent';

export function readAnalyticsConsent(storage: { getItem: (key: string) => string | null }) {
  return storage.getItem(ANALYTICS_CONSENT_KEY) === 'true';
}

export function writeAnalyticsConsent(enabled: boolean) {
  return enabled ? 'true' : 'false';
}

export async function loadAnalyticsConsent() {
  return (await AsyncStorage.getItem(ANALYTICS_CONSENT_KEY)) === 'true';
}

export async function persistAnalyticsConsent(enabled: boolean) {
  const serialized = writeAnalyticsConsent(enabled);
  await AsyncStorage.setItem(ANALYTICS_CONSENT_KEY, serialized);
  return enabled;
}
