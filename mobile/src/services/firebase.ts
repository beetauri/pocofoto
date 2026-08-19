import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import { getApp } from '@react-native-firebase/app';
import { connectAuthEmulator, GoogleAuthProvider, getAuth, signInWithCredential, signOut } from '@react-native-firebase/auth';
import { connectFirestoreEmulator, getFirestore } from '@react-native-firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from '@react-native-firebase/functions';
import { getMessaging } from '@react-native-firebase/messaging';
import { connectStorageEmulator, getStorage } from '@react-native-firebase/storage';
import {
  FIREBASE_FUNCTIONS_REGION,
  FIREBASE_PROJECT_ID,
  GOOGLE_WEB_CLIENT_ID,
  USE_FIREBASE_EMULATORS,
  getFirebaseEmulatorHost
} from './config';

export const firebaseApp = getApp();
export const authClient = getAuth(firebaseApp);
export const firestoreClient = getFirestore(firebaseApp);
export const storageClient = getStorage(firebaseApp);
export const functionsClient = getFunctions(firebaseApp, FIREBASE_FUNCTIONS_REGION);
export const messagingClient = getMessaging(firebaseApp);

let emulatorsConnected = false;

function configureEmulators() {
  if (!USE_FIREBASE_EMULATORS || emulatorsConnected) return;

  const host = getFirebaseEmulatorHost();
  connectAuthEmulator(authClient, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(firestoreClient, host, 8080);
  connectStorageEmulator(storageClient, host, 9199);
  connectFunctionsEmulator(functionsClient, host, 5001);
  emulatorsConnected = true;
}

configureEmulators();

export function configureGoogleSignIn() {
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID || undefined,
    profileImageSize: 256
  });
}

export async function signInWithGoogle() {
  configureGoogleSignIn();
  if (process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === 'true') {
    throw new Error('Google sign-in is not available against the Auth Emulator on native builds.');
  }
  if (!GOOGLE_WEB_CLIENT_ID) {
    throw new Error('Missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID for native Google sign-in.');
  }

  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response) || !response.data.idToken) {
    throw new Error('Google sign-in did not return an ID token.');
  }

  const credential = GoogleAuthProvider.credential(response.data.idToken);
  return signInWithCredential(authClient, credential);
}

export async function signOutNative() {
  await GoogleSignin.signOut().catch(() => undefined);
  return signOut(authClient);
}

export async function callFunction<TResponse = unknown, TPayload = Record<string, unknown>>(
  name: string,
  payload?: TPayload
): Promise<TResponse> {
  const callable = httpsCallable<TPayload, TResponse>(functionsClient, name);
  const result = await callable(payload as TPayload);
  return result.data;
}

export const firebaseProject = FIREBASE_PROJECT_ID;
