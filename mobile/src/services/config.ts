import Constants from 'expo-constants';
import { Platform } from 'react-native';

type MobileExtra = {
  firebaseProjectId?: string;
  firebaseFunctionsRegion?: string;
  googleWebClientId?: string;
};

const extra = (Constants.expoConfig?.extra || {}) as MobileExtra;

export const FIREBASE_PROJECT_ID =
  process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || extra.firebaseProjectId || 'sixth-bonbon-402909';
export const FIREBASE_FUNCTIONS_REGION =
  process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION || extra.firebaseFunctionsRegion || 'us-central1';
export const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || extra.googleWebClientId || '';

export const USE_FIREBASE_EMULATORS =
  __DEV__ && process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS !== 'false';

export function getFirebaseEmulatorHost(): string {
  return process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST || (Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1');
}
