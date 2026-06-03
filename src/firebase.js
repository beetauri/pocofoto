import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword as realSignInWithEmailAndPassword,
  createUserWithEmailAndPassword as realCreateUserWithEmailAndPassword,
  signOut as realSignOut,
  onAuthStateChanged as realOnAuthStateChanged,
  signInWithPopup as realSignInWithPopup,
  GoogleAuthProvider as realGoogleAuthProvider,
  updateProfile as realUpdateProfile,
  connectAuthEmulator
} from 'firebase/auth';
import {
  getFirestore,
  doc as realDoc,
  setDoc as realSetDoc,
  getDoc as realGetDoc,
  updateDoc as realUpdateDoc,
  onSnapshot as realOnSnapshot,
  collection as realCollection,
  query as realQuery,
  where as realWhere,
  getDocs as realGetDocs,
  addDoc as realAddDoc,
  orderBy as realOrderBy,
  connectFirestoreEmulator
} from 'firebase/firestore';
import {
  getStorage,
  ref as realRef,
  uploadBytes as realUploadBytes,
  getDownloadURL as realGetDownloadURL,
  connectStorageEmulator
} from 'firebase/storage';
import {
  getFunctions,
  httpsCallable as realHttpsCallable,
  connectFunctionsEmulator
} from 'firebase/functions';
import {
  getMessaging,
  getToken as realGetToken,
  isSupported as realMessagingIsSupported,
  onMessage as realOnMessage
} from 'firebase/messaging';
import { getAnalytics, isSupported as analyticsIsSupported } from 'firebase/analytics';

const USE_FIREBASE_EMULATORS = import.meta.env.DEV
  && import.meta.env.VITE_USE_REAL_FIREBASE !== 'true'
  && import.meta.env.VITE_USE_FIREBASE_EMULATORS !== 'false';

const projectId = USE_FIREBASE_EMULATORS
  ? (import.meta.env.VITE_FIREBASE_EMULATOR_PROJECT_ID || 'demo-locket-local')
  : (import.meta.env.VITE_FIREBASE_PROJECT_ID || 'sixth-bonbon-402909');

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || (USE_FIREBASE_EMULATORS ? 'demo-key' : 'AIzaSyCMAV8uQ8RelzrnIRxr9MyzrX5uFlDcDRw'),
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
  projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '386325909807',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:386325909807:web:f1d5f429e41f637bd751da',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-7RS2MJ6VPT'
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const analytics = typeof window !== 'undefined' && await analyticsIsSupported() ? getAnalytics(app) : null;
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app);

if (USE_FIREBASE_EMULATORS) {
  const emulatorState = globalThis.__LOCKET_FIREBASE_EMULATORS__ || {
    auth: false,
    firestore: false,
    storage: false,
    functions: false
  };

  if (!emulatorState.auth) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    emulatorState.auth = true;
  }

  if (!emulatorState.firestore) {
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    emulatorState.firestore = true;
  }

  if (!emulatorState.storage) {
    connectStorageEmulator(storage, '127.0.0.1', 9199);
    emulatorState.storage = true;
  }

  if (!emulatorState.functions) {
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    emulatorState.functions = true;
  }

  globalThis.__LOCKET_FIREBASE_EMULATORS__ = emulatorState;
}

const onAuthStateChanged = (_authInst, cb) => realOnAuthStateChanged(auth, cb);
const createUserWithEmailAndPassword = (_authInst, email, password) => realCreateUserWithEmailAndPassword(auth, email, password);
const signInWithEmailAndPassword = (_authInst, email, password) => realSignInWithEmailAndPassword(auth, email, password);
const signOut = (_authInst) => realSignOut(auth);
const signInWithPopup = (_authInst, provider) => realSignInWithPopup(auth, provider);
const updateProfile = (user, profile) => realUpdateProfile(user, profile);
const GoogleAuthProvider = realGoogleAuthProvider;

const doc = realDoc;
const setDoc = realSetDoc;
const getDoc = realGetDoc;
const updateDoc = realUpdateDoc;
const onSnapshot = realOnSnapshot;
const collection = realCollection;
const query = realQuery;
const where = realWhere;
const getDocs = realGetDocs;
const addDoc = realAddDoc;
const orderBy = realOrderBy;

const ref = realRef;
const uploadBytes = realUploadBytes;
const getDownloadURL = realGetDownloadURL;
const httpsCallable = (_functionsInst, name) => realHttpsCallable(functions, name);
const messagingIsSupported = realMessagingIsSupported;
const getMessagingToken = async (options) => {
  const supported = await realMessagingIsSupported();
  if (!supported) return null;
  return realGetToken(getMessaging(app), options);
};
const onForegroundMessage = async (handler) => {
  const supported = await realMessagingIsSupported();
  if (!supported) return () => {};
  return realOnMessage(getMessaging(app), handler);
};

export {
  app, analytics, auth, db, storage, functions,
  USE_FIREBASE_EMULATORS,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  signInWithPopup,
  updateProfile,
  GoogleAuthProvider,
  doc, setDoc, getDoc, updateDoc, onSnapshot,
  collection, query, where, getDocs, addDoc, orderBy,
  ref, uploadBytes, getDownloadURL,
  httpsCallable,
  messagingIsSupported,
  getMessagingToken,
  onForegroundMessage,
};
