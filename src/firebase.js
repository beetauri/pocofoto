import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword as realSignInWithEmailAndPassword, 
  createUserWithEmailAndPassword as realCreateUserWithEmailAndPassword, 
  signOut as realSignOut, 
  onAuthStateChanged as realOnAuthStateChanged,
  signInWithPopup as realSignInWithPopup,
  GoogleAuthProvider as realGoogleAuthProvider
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
  orderBy as realOrderBy 
} from 'firebase/firestore';
import { 
  getStorage, 
  ref as realRef, 
  uploadBytes as realUploadBytes, 
  getDownloadURL as realGetDownloadURL 
} from 'firebase/storage';

// Mock exports
import * as mock from './mockBackend';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCMAV8uQ8RelzrnIRxr9MyzrX5uFlDcDRw",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "sixth-bonbon-402909.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "sixth-bonbon-402909",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "sixth-bonbon-402909.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "386325909807",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:386325909807:web:f1d5f429e41f637bd751da"
};

const USE_REAL_FIREBASE = import.meta.env.VITE_USE_REAL_FIREBASE === 'true';

let auth, db, storage;
let onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, signInWithPopup, GoogleAuthProvider;
let doc, setDoc, getDoc, updateDoc, onSnapshot, collection, query, where, getDocs, addDoc, orderBy;
let ref, uploadBytes, getDownloadURL;

if (USE_REAL_FIREBASE) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);

  onAuthStateChanged = (authInst, cb) => realOnAuthStateChanged(auth, cb);
  createUserWithEmailAndPassword = (authInst, email, password) => realCreateUserWithEmailAndPassword(auth, email, password);
  signInWithEmailAndPassword = (authInst, email, password) => realSignInWithEmailAndPassword(auth, email, password);
  signOut = (authInst) => realSignOut(auth);
  signInWithPopup = (authInst, provider) => realSignInWithPopup(auth, provider);
  GoogleAuthProvider = realGoogleAuthProvider;

  doc = realDoc;
  setDoc = realSetDoc;
  getDoc = realGetDoc;
  updateDoc = realUpdateDoc;
  onSnapshot = realOnSnapshot;
  collection = realCollection;
  query = realQuery;
  where = realWhere;
  getDocs = realGetDocs;
  addDoc = realAddDoc;
  orderBy = realOrderBy;

  ref = realRef;
  uploadBytes = realUploadBytes;
  getDownloadURL = realGetDownloadURL;
} else {
  auth = mock.auth;
  db = mock.db;
  storage = mock.storage;

  onAuthStateChanged = mock.onAuthStateChanged;
  createUserWithEmailAndPassword = mock.createUserWithEmailAndPassword;
  signInWithEmailAndPassword = mock.signInWithEmailAndPassword;
  signOut = mock.signOut;
  signInWithPopup = mock.signInWithPopup;
  GoogleAuthProvider = mock.GoogleAuthProvider;

  doc = mock.doc;
  setDoc = mock.setDoc;
  getDoc = mock.getDoc;
  updateDoc = mock.updateDoc;
  onSnapshot = mock.onSnapshot;
  collection = mock.collection;
  query = mock.query;
  where = mock.where;
  getDocs = mock.getDocs;
  addDoc = mock.addDoc;
  orderBy = mock.orderBy;

  ref = mock.ref;
  uploadBytes = mock.uploadBytes;
  getDownloadURL = mock.getDownloadURL;
}

export {
  auth, db, storage,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  signInWithPopup,
  GoogleAuthProvider,
  doc, setDoc, getDoc, updateDoc, onSnapshot,
  collection, query, where, getDocs, addDoc, orderBy,
  ref, uploadBytes, getDownloadURL,
};
