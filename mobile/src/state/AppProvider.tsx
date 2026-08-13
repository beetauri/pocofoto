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
  firestoreClient,
  signInWithGoogle,
  signOutNative
} from '../services/firebase';
import { captureHandledException, initAnalytics, syncSentryUser, trackEvent } from '../services/analytics';
import { clearCachedUserRoute, getCachedUserRoute, setCachedUserRoute } from '../services/routeCache';
import { disableNotifications } from '../services/notifications';
import { decidePairListenerError, decidePairSnapshot } from '../domain/pairRoute';
import type { UserProfile } from '../types';

type AppContextValue = {
  user: User | null;
  profile: UserProfile | null;
  partnerProfile: UserProfile | null;
  coupleId: string | null;
  pairStateKnown: boolean;
  loading: boolean;
  connection: ConnectionState;
  isOnline: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  setCoupleId: (coupleId: string | null) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

function profileFromSnapshot(snapshot: DocumentSnapshot): UserProfile | null {
  return snapshot.exists() ? (snapshot.data() as UserProfile) : null;
}

async function ensureUserDocument(user: User) {
  const userRef = doc(firestoreClient, 'users', user.uid);
  await setDoc(userRef, {
    email: user.email || '',
    normalizedEmail: user.email?.trim().toLowerCase() || '',
    displayName: user.displayName || '',
    photoURL: user.photoURL || '',
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

  useEffect(() => {
    coupleIdRef.current = coupleId;
  }, [coupleId]);

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
        captureHandledException(error, { operation: 'user-route-listener', online: connection !== 'offline' });
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
  }, [user, connection]);

  useEffect(() => {
    if (!user || !coupleId) {
      setPartnerProfile(null);
      return undefined;
    }
    let stopPartnerListener: (() => void) | undefined;
    const stopCoupleListener = onSnapshot(doc(firestoreClient, 'couples', coupleId), (snapshot) => {
      const users = (snapshot.data()?.users as string[] | undefined) || [];
      const partnerId = users.find((id) => id !== user.uid);
      stopPartnerListener?.();
      stopPartnerListener = partnerId
        ? onSnapshot(doc(firestoreClient, 'users', partnerId), (partnerSnapshot) => {
          setPartnerProfile(profileFromSnapshot(partnerSnapshot));
        }, (error) => captureHandledException(error, { operation: 'partner-profile-listener' }))
        : undefined;
      if (!partnerId) setPartnerProfile(null);
    }, (error) => captureHandledException(error, { operation: 'couple-profile-listener' }));

    return () => {
      stopPartnerListener?.();
      stopCoupleListener();
    };
  }, [coupleId, user]);

  const signIn = useCallback(async () => {
    await signInWithGoogle();
    trackEvent('auth_signed_in', { method: 'google' });
  }, []);

  const signOut = useCallback(async () => {
    if (user) {
      await disableNotifications().catch(() => undefined);
      await clearCachedUserRoute(user.uid);
    }
    await signOutNative();
    trackEvent('auth_signed_out');
  }, [user]);

  const setCoupleId = useCallback((nextCoupleId: string | null) => {
    coupleIdRef.current = nextCoupleId;
    setCoupleIdState(nextCoupleId);
    setPairStateKnown(true);
    if (user) {
      void (nextCoupleId ? setCachedUserRoute(user.uid, nextCoupleId) : clearCachedUserRoute(user.uid));
    }
  }, [user]);

  const value = useMemo(() => ({
    user,
    profile,
    partnerProfile,
    coupleId,
    pairStateKnown,
    loading,
    connection,
    isOnline: connection !== 'offline',
    signIn,
    signOut,
    setCoupleId
  }), [user, profile, partnerProfile, coupleId, pairStateKnown, loading, connection, signIn, signOut, setCoupleId]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}
