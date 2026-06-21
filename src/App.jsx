import { lazy, Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { auth, db, firestoreRecovery, onAuthStateChanged, doc, onSnapshot, onForegroundMessage } from './firebase';
import { initAnalytics, trackEvent, identifyUser, resetAnalytics, startScrollDepthTracking } from './analytics';
import AuthScreen from './components/AuthScreen';
import AppBackground from './components/AppBackground';
import PairingScreen from './components/PairingScreen';
import MainScreen from './components/MainScreen';
import UpdateBanner from './components/UpdateBanner';
import ConnectionBanner from './components/ConnectionBanner';
import NotificationPrompt from './components/NotificationPrompt';
import { Toaster } from './components/ui/sonner';
import { connectionStatusStore } from './lib/connectionStatus';
import { useNotifications } from './hooks/useNotifications';
import { clearNotificationIntent, readNotificationIntent } from './notifications/notificationClient';
import {
  clearCachedUserRoute,
  getCachedUserRoute,
  setCachedUserRoute
} from './lib/userRouteCache';
import { triggerHaptic } from './lib/haptics';
import {
  captureHandledException,
  recordPairRouteDecision,
  syncSentryUser
} from './sentry';
import {
  decidePairListenerError,
  decidePairSnapshot
} from './lib/pairRouteState';

const Retune = import.meta.env.DEV
  ? lazy(() => import('retune').then((module) => ({ default: module.Retune })))
  : null;

const pageTransition = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 1.04 },
  transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] }
};

function LoadingScreen() {
  return (
    <div className="app-route-layer" style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 24
    }}>
      <div className="loading-logo-mark">
        <img src="/pocoface-icon-1024.png" alt="" />
      </div>
      <img className="logo-lockup-image loading-logotype" src="/pocofoto-logotype.svg" alt="Pocofoto" />
    </div>
  );
}

function OfflineHoldScreen() {
  const { t } = useTranslation('errors');
  return (
    <div className="offline-hold-screen">
      <div className="loading-logo-mark">
        <img src="/pocoface-icon-1024.png" alt="" />
      </div>
      <img className="logo-lockup-image loading-logotype" src="/pocofoto-logotype.svg" alt="Pocofoto" />
      <p>{t('offlineHold')}</p>
    </div>
  );
}

export default function App() {
  const { t } = useTranslation('pairing');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [coupleId, setCoupleId] = useState(null);
  const [checkingPair, setCheckingPair] = useState(false);
  const [pairStateKnown, setPairStateKnown] = useState(false);
  const [pairingNotice, setPairingNotice] = useState('');
  const [connectionStatus, setConnectionStatus] = useState(() => connectionStatusStore.getSnapshot());
  const [notificationIntent, setNotificationIntent] = useState(() => readNotificationIntent());
  const trackedAppOpen = useRef(false);
  const coupleIdRef = useRef(coupleId);
  const notifications = useNotifications({
    user,
    paired: Boolean(coupleId),
    online: connectionStatus.isOnline
  });
  const {
    handleForegroundMessage,
    clearForegroundMessage
  } = notifications;

  useEffect(() => {
    initAnalytics();
    recordPairRouteDecision({
      reason: `firestore-recovery-${firestoreRecovery.status}`,
      fromCache: null,
      hasSnapshotCoupleId: false,
      hadKnownCoupleId: false,
      state: 'startup'
    });
    const stopScrollTracking = startScrollDepthTracking();
    if (!trackedAppOpen.current) {
      trackEvent('app_open');
      trackedAppOpen.current = true;
    }
    return () => stopScrollTracking();
  }, []);

  useEffect(() => {
    coupleIdRef.current = coupleId;
  }, [coupleId]);

  useEffect(() => connectionStatusStore.subscribe((nextStatus) => {
    setConnectionStatus(nextStatus);
  }), []);

  // Listen for auth changes
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      syncSentryUser(firebaseUser);
      setUser(firebaseUser);
      if (!firebaseUser) {
        trackEvent('auth_signed_out');
        resetAnalytics();
        coupleIdRef.current = null;
        setCoupleId(null);
        setPairStateKnown(false);
        setCheckingPair(false);
        setPairingNotice('');
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) return;
    const cachedRoute = getCachedUserRoute(user.uid);
    identifyUser(user.uid, {
      email: user.email || '',
      displayName: user.displayName || ''
    });
    trackEvent('session_started', {
      userId: user.uid,
      hasCoupleId: Boolean(cachedRoute?.coupleId)
    });
  }, [user]);

  // Check if user is paired
  useEffect(() => {
    if (!user) return;
    const cachedRoute = getCachedUserRoute(user.uid);
    setPairStateKnown(false);
    if (cachedRoute?.coupleId) {
      coupleIdRef.current = cachedRoute.coupleId;
      setCoupleId(cachedRoute.coupleId);
      setLoading(false);
    } else {
      coupleIdRef.current = null;
      setCoupleId(null);
      setLoading(true);
    }
    setCheckingPair(true);

    const applyPairDecision = (decision) => {
      coupleIdRef.current = decision.coupleId;
      setCoupleId(decision.coupleId);
      setPairStateKnown(decision.state !== 'unknown');
      setCheckingPair(false);
      setLoading(false);

      if (!decision.persist) return;
      if (decision.state === 'unpaired') {
        clearCachedUserRoute(user.uid);
      } else {
        setCachedUserRoute(user.uid, { coupleId: decision.coupleId });
      }
    };

    const userRef = doc(db, 'users', user.uid);
    const unsub = onSnapshot(userRef, { includeMetadataChanges: true }, (snap) => {
      const snapshotCoupleId = snap.exists() ? (snap.data().coupleId || null) : null;
      const hadKnownCoupleId = Boolean(coupleIdRef.current || cachedRoute?.coupleId);
      const decision = decidePairSnapshot({
        snapshotExists: snap.exists(),
        snapshotCoupleId,
        fromCache: snap.metadata.fromCache,
        currentCoupleId: coupleIdRef.current,
        cachedCoupleId: cachedRoute?.coupleId || null
      });
      recordPairRouteDecision({
        reason: decision.reason,
        fromCache: snap.metadata.fromCache,
        hasSnapshotCoupleId: Boolean(snapshotCoupleId),
        hadKnownCoupleId,
        state: decision.state
      });
      applyPairDecision(decision);
    }, (error) => {
      captureHandledException(error, {
        operation: 'user-route-listener',
        online: connectionStatus.isOnline,
        hasCachedCoupleId: Boolean(cachedRoute?.coupleId),
        authUserMatches: auth.currentUser?.uid === user.uid
      });
      const hadKnownCoupleId = Boolean(coupleIdRef.current || cachedRoute?.coupleId);
      const decision = decidePairListenerError({
        currentCoupleId: coupleIdRef.current,
        cachedCoupleId: cachedRoute?.coupleId || null
      });
      recordPairRouteDecision({
        reason: decision.reason,
        fromCache: null,
        hasSnapshotCoupleId: false,
        hadKnownCoupleId,
        state: decision.state
      });
      applyPairDecision(decision);
    });

    return () => unsub();
  }, [user, connectionStatus.isOnline]);

  useEffect(() => {
    if (!user) return undefined;
    let unsubscribe = null;
    let active = true;

    onForegroundMessage((payload) => {
      console.debug('Foreground push received.', {
        type: payload?.data?.type || null,
        eventId: payload?.data?.eventId || null
      });
      trackEvent('push_foreground_received', {
        type: payload?.data?.type || 'unknown'
      });
      handleForegroundMessage(payload);
      window.setTimeout(() => clearForegroundMessage(), 3200);
    }).then((handlerUnsubscribe) => {
      if (!active) {
        handlerUnsubscribe?.();
        return;
      }
      unsubscribe = handlerUnsubscribe;
    }).catch((err) => {
      console.warn('Foreground push listener skipped.', err);
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [clearForegroundMessage, handleForegroundMessage, user]);

  const handlePaired = (newCoupleId) => {
    setPairingNotice('');
    coupleIdRef.current = newCoupleId;
    setCoupleId(newCoupleId);
    if (user) {
      setPairStateKnown(true);
      setCachedUserRoute(user.uid, { coupleId: newCoupleId });
    }
    triggerHaptic('success');
    trackEvent('pairing_completed', { coupleId: newCoupleId });
  };

  const handlePairingRemoved = (message) => {
    setPairingNotice(message || t('removedDefault'));
    coupleIdRef.current = null;
    setCoupleId(null);
    if (user) {
      setPairStateKnown(true);
      setCachedUserRoute(user.uid, { coupleId: null });
    }
    trackEvent('pairing_removed');
  };

  const handleNoticeConsumed = useCallback(() => {
    setPairingNotice('');
  }, []);

  const handleNotificationIntentConsumed = useCallback(() => {
    clearNotificationIntent();
    setNotificationIntent(null);
  }, []);

  let screen = 'auth';
  if (user && !pairStateKnown && !checkingPair) screen = 'offline-hold';
  if (user && !coupleId && pairStateKnown && connectionStatus.isOnline && !checkingPair) screen = 'pairing';
  if (user && coupleId) screen = 'main';

  useEffect(() => {
    trackEvent('screen_view', { screen });
  }, [screen]);

  useEffect(() => {
    if (notificationIntent?.type !== 'pairing') return;
    if (screen === 'auth' || screen === 'offline-hold') return;
    handleNotificationIntentConsumed();
  }, [handleNotificationIntentConsumed, notificationIntent, screen]);

  if (loading) {
    return (
      <>
        <AppBackground />
        <LoadingScreen />
      </>
    );
  }

  return (
    <>
      <AppBackground />
      <AnimatePresence mode="wait">
        {screen === 'auth' && (
          <motion.div key="auth" className="app-route-layer" {...pageTransition} style={{ height: '100%' }}>
            <AuthScreen />
          </motion.div>
        )}
        {screen === 'pairing' && (
          <motion.div key="pairing" className="app-route-layer" {...pageTransition} style={{ height: '100%' }}>
            <PairingScreen
              user={user}
              isOnline={connectionStatus.isOnline}
              onPaired={handlePaired}
              initialNotice={pairingNotice}
              onNoticeConsumed={handleNoticeConsumed}
              notificationControls={notifications}
            />
          </motion.div>
        )}
        {screen === 'offline-hold' && (
          <motion.div key="offline-hold" className="app-route-layer" {...pageTransition} style={{ height: '100%' }}>
            <OfflineHoldScreen />
          </motion.div>
        )}
        {screen === 'main' && (
          <motion.div key="main" className="app-route-layer" {...pageTransition} style={{ height: '100%' }}>
            <MainScreen
              user={user}
              coupleId={coupleId}
              isOnline={connectionStatus.isOnline}
              onPairingRemoved={handlePairingRemoved}
              notificationControls={notifications}
              notificationIntent={notificationIntent}
              onNotificationIntentConsumed={handleNotificationIntentConsumed}
            />
          </motion.div>
        )}
      </AnimatePresence>
      {Retune && (
        <Suspense fallback={null}>
          <Retune />
        </Suspense>
      )}
      <NotificationPrompt
        open={notifications.showPrompt && screen === 'main'}
        onEnable={notifications.enable}
        onDismiss={notifications.dismissPrompt}
        busy={notifications.busy}
      />
      <AnimatePresence>
        {notifications.foregroundMessage && (
          <motion.div
            className="toast"
            initial={{ opacity: 0, y: 18, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 18, x: '-50%' }}
          >
            {notifications.foregroundMessage}
          </motion.div>
        )}
      </AnimatePresence>
      <ConnectionBanner status={connectionStatus.status} />
      <UpdateBanner offsetForConnectionBanner={connectionStatus.status === 'offline' || connectionStatus.status === 'restored'} />
      <Toaster />
    </>
  );
}
