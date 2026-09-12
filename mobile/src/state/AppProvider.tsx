import {
  onAuthStateChanged,
  type User,
  updateProfile
} from '@react-native-firebase/auth';
import {
  doc,
  onSnapshot,
  setDoc,
  type DocumentSnapshot
} from '@react-native-firebase/firestore';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { useConnectionState, type ConnectionState } from '../services/network';
import {
  authClient,
  callFunction,
  firestoreClient,
  signInWithGoogle,
  signOutNative
} from '../services/firebase';
import { signInWithApple } from '../services/appleAuth';
import { captureHandledException, initAnalytics, syncSentryUser, trackEvent } from '../services/analytics';
import { clearCachedUserRoute, getCachedUserRoute, setCachedUserRoute } from '../services/routeCache';
import { disableNotifications } from '../services/notifications';
import { decidePairListenerError, decidePairSnapshot } from '../domain/pairRoute';
import type { UserProfile } from '../types';

type AppBaseValue = {
  user: User | null;
  profile: UserProfile | null;
  partnerProfile: UserProfile | null;
  coupleId: string | null;
  pairStateKnown: boolean;
  loading: boolean;
  signIn: () => Promise<void>;
  signInApple: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  setCoupleId: (coupleId: string | null) => void;
};

type NetworkValue = {
  connection: ConnectionState;
  isOnline: boolean;
};

type AppContextValue = AppBaseValue & NetworkValue;

const AppContext = createContext<AppBaseValue | null>(null);
const NetworkContext = createContext<NetworkValue | null>(null);

function profileFromSnapshot(snapshot: DocumentSnapshot): UserProfile | null {
  return snapshot.exists() ? { uid: snapshot.id, ...(snapshot.data() as UserProfile) } : null;
}

async function ensureUserDocument(user: User) {
  const userRef = doc(firestoreClient, 'users', user.uid);
  const provider = user.providerData.some((item) => item.providerId === 'apple.com') ? 'apple' : 'google';
  await setDoc(userRef, {
    email: user.email || '',
    normalizedEmail: user.email?.trim().toLowerCase() || '',
    displayName: user.displayName || '',
    photoURL: user.photoURL || '',
    provider,
    updatedAt: new Date().toISOString()
  }, { merge: true });
  if (!user.displayName && user.email) {
    await updateProfile(user, { displayName: user.email.split('@')[0] });
  }
}

export function AppProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [partnerProfile, setPartnerProfile] = useState<UserProfile | null>(null);
  const [coupleId, setCoupleIdState] = useState<string | null>(null);
  const [pairStateKnown, setPairStateKnown] = useState(false);
  const [loading, setLoading] = useState(true);
  const coupleIdRef = useRef<string | null>(null);
  const connection = useConnectionState();
  const connectionRef = useRef(connection);
  const coupleListenerSeqRef = useRef(0);

  useEffect(() => {
    coupleIdRef.current = coupleId;
  }, [coupleId]);

  useEffect(() => {
    connectionRef.current = connection;
  }, [connection]);

  useEffect(() => {
    void initAnalytics();
    return onAuthStateChanged(authClient, (nextUser) => {
      syncSentryUser(nextUser);
      setUser(nextUser);
      if (!nextUser) {
        setProfile(null);
        setCoupleIdState(null);
        coupleIdRef.current = null;
        setPairStateKnown(false);
        setLoading(false);
        return;
      }
      void ensureUserDocument(nextUser).catch((error) => captureHandledException(error, { operation: 'ensure-user-document' }));
    });
  }, []);

  useEffect(() => {
    if (!user) return undefined;

    let active = true;
    let stopUserListener: (() => void) | undefined;
    setPairStateKnown(false);
    setLoading(true);

    void getCachedUserRoute(user.uid).then((cachedRoute) => {
      if (!active) return;
      if (cachedRoute?.coupleId) {
        coupleIdRef.current = cachedRoute.coupleId;
        setCoupleIdState(cachedRoute.coupleId);
        setLoading(false);
      }

      const userRef = doc(firestoreClient, 'users', user.uid);
      stopUserListener = onSnapshot(userRef, { includeMetadataChanges: true }, (snapshot) => {
        if (!active) return;
        setProfile(profileFromSnapshot(snapshot));
        const data = snapshot.data() as UserProfile | undefined;
        const decision = decidePairSnapshot({
          snapshotExists: snapshot.exists(),
          snapshotCoupleId: data?.coupleId || null,
          fromCache: snapshot.metadata.fromCache,
          currentCoupleId: coupleIdRef.current,
          cachedCoupleId: cachedRoute?.coupleId || null
        });
        setCoupleIdState(decision.coupleId);
        setPairStateKnown(decision.state !== 'unknown');
        setLoading(false);
        if (decision.persist) {
          void (decision.coupleId
            ? setCachedUserRoute(user.uid, decision.coupleId)
            : clearCachedUserRoute(user.uid));
        }
      }, (error) => {
        captureHandledException(error, { operation: 'user-route-listener', online: connectionRef.current !== 'offline' });
        const decision = decidePairListenerError(coupleIdRef.current, cachedRoute?.coupleId || null);
        setCoupleIdState(decision.coupleId);
        setPairStateKnown(false);
        setLoading(false);
      });
    });

    return () => {
      active = false;
      stopUserListener?.();
    };
  }, [user]);

  useEffect(() => {
    if (!user || !coupleId) {
      setPartnerProfile(null);
      return undefined;
    }
    const seq = ++coupleListenerSeqRef.current;
    let coupleSeq = 0;
    let disposed = false;
    let stopPartnerListener: (() => void) | undefined;
    const stopCoupleListener = onSnapshot(doc(firestoreClient, 'couples', coupleId), (snapshot) => {
      if (disposed || seq !== coupleListenerSeqRef.current) return;
      const mySeq = ++coupleSeq;
      const users = (snapshot.data()?.users as string[] | undefined) || [];
      const partnerId = users.find((id) => id !== user.uid);
      stopPartnerListener?.();
      stopPartnerListener = partnerId
        ? onSnapshot(doc(firestoreClient, 'users', partnerId), (partnerSnapshot) => {
          if (disposed || seq !== coupleListenerSeqRef.current || mySeq !== coupleSeq) return;
          setPartnerProfile(profileFromSnapshot(partnerSnapshot));
        }, (error) => captureHandledException(error, { operation: 'partner-profile-listener' }))
        : undefined;
      if (!partnerId) setPartnerProfile(null);
    }, (error) => captureHandledException(error, { operation: 'couple-profile-listener' }));

    return () => {
      disposed = true;
      stopPartnerListener?.();
      stopCoupleListener();
    };
  }, [coupleId, user]);

  const signIn = useCallback(async () => {
    await signInWithGoogle();
    trackEvent('auth_signed_in', { method: 'google' });
  }, []);

  const signInApple = useCallback(async () => {
    await signInWithApple();
    trackEvent('auth_signed_in', { method: 'apple' });
  }, []);

  const signOut = useCallback(async () => {
    if (user) {
      await disableNotifications().catch(() => undefined);
      await clearCachedUserRoute(user.uid);
    }
    await signOutNative();
    trackEvent('auth_signed_out');
  }, [user]);

  const deleteAccount = useCallback(async () => {
    if (!user) return;
    await disableNotifications().catch(() => undefined);
    await callFunction('deleteAccount');
    await clearCachedUserRoute(user.uid);
    await signOutNative().catch(() => undefined);
  }, [user]);

  const setCoupleId = useCallback((nextCoupleId: string | null) => {
    coupleIdRef.current = nextCoupleId;
    setCoupleIdState(nextCoupleId);
    setPairStateKnown(true);
    if (user) {
      void (nextCoupleId ? setCachedUserRoute(user.uid, nextCoupleId) : clearCachedUserRoute(user.uid));
    }
  }, [user]);

  const networkValue = useMemo<NetworkValue>(() => ({
    connection,
    isOnline: connection !== 'offline'
  }), [connection]);

  const value = useMemo(() => ({
    user,
    profile,
    partnerProfile,
    coupleId,
    pairStateKnown,
    loading,
    signIn,
    signInApple,
    signOut,
    deleteAccount,
    setCoupleId
  }), [user, profile, partnerProfile, coupleId, pairStateKnown, loading, signIn, signInApple, signOut, deleteAccount, setCoupleId]);

  return (
    <AppContext.Provider value={value}>
      <NetworkContext.Provider value={networkValue}>{children}</NetworkContext.Provider>
    </AppContext.Provider>
  );
}

export function useNetwork() {
  const context = useContext(NetworkContext);
  if (!context) throw new Error('useNetwork must be used inside AppProvider');
  return context;
}

export function useAppBase(): AppBaseValue {
  const app = useContext(AppContext);
  if (!app) throw new Error('useAppBase must be used inside AppProvider');
  return app;
}

export function useApp(): AppContextValue {
  const app = useContext(AppContext);
  const network = useContext(NetworkContext);
  if (!app) throw new Error('useApp must be used inside AppProvider');
  if (!network) throw new Error('useApp must be used inside AppProvider');
  return useMemo(() => ({ ...app, ...network }), [app, network]);
}
