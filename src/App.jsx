import { lazy, Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { auth, db, onAuthStateChanged, doc, onSnapshot, onForegroundMessage } from './firebase';
import { initAnalytics, trackEvent, identifyUser, resetAnalytics } from './analytics';
import AuthScreen from './components/AuthScreen';
import PairingScreen from './components/PairingScreen';
import MainScreen from './components/MainScreen';

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
    <div style={{
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

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [coupleId, setCoupleId] = useState(null);
  const [checkingPair, setCheckingPair] = useState(false);
  const [pairingNotice, setPairingNotice] = useState('');
  const [foregroundToast, setForegroundToast] = useState('');
  const trackedAppOpen = useRef(false);

  useEffect(() => {
    initAnalytics();
    if (!trackedAppOpen.current) {
      trackEvent('app_open');
      trackedAppOpen.current = true;
    }
  }, []);

  // Listen for auth changes
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        trackEvent('auth_signed_out');
        resetAnalytics();
        setCoupleId(null);
        setPairingNotice('');
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // Check if user is paired
  useEffect(() => {
    if (!user) return;
    identifyUser(user.uid, {
      email: user.email || '',
      displayName: user.displayName || ''
    });
    trackEvent('session_started', {
      userId: user.uid,
      hasCoupleId: Boolean(coupleId)
    });
    setCheckingPair(true);

    const unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setCoupleId(data.coupleId || null);
      }
      setCheckingPair(false);
      setLoading(false);
    }, () => {
      // Error handler — user doc might not exist yet
      setCheckingPair(false);
      setLoading(false);
    });

    return () => unsub();
  }, [user, coupleId]);

  useEffect(() => {
    if (!user) return undefined;
    let unsubscribe = null;
    let active = true;

    onForegroundMessage((payload) => {
      console.debug('Foreground push received.', {
        type: payload?.data?.type || null,
        notificationTitle: payload?.notification?.title || null
      });
      trackEvent('push_foreground_received', {
        type: payload?.data?.type || 'unknown'
      });
      const message = payload?.data?.type === 'photo_received'
        ? 'New photo from your person'
        : (payload?.notification?.body || 'New Pocofoto update');
      setForegroundToast(message);
      window.setTimeout(() => setForegroundToast(''), 3200);
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
  }, [user]);

  const handlePaired = (newCoupleId) => {
    setPairingNotice('');
    setCoupleId(newCoupleId);
    trackEvent('pairing_completed', { coupleId: newCoupleId });
  };

  const handlePairingRemoved = (message = 'Pairing removed. You can pair again whenever you are ready.') => {
    setPairingNotice(message);
    setCoupleId(null);
    trackEvent('pairing_removed');
  };

  const handleNoticeConsumed = useCallback(() => {
    setPairingNotice('');
  }, []);

  let screen = 'auth';
  if (user && !coupleId && !checkingPair) screen = 'pairing';
  if (user && coupleId) screen = 'main';

  useEffect(() => {
    trackEvent('screen_view', { screen });
  }, [screen]);

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <>
      <AnimatePresence mode="wait">
        {screen === 'auth' && (
          <motion.div key="auth" {...pageTransition} style={{ height: '100%' }}>
            <AuthScreen />
          </motion.div>
        )}
        {screen === 'pairing' && (
          <motion.div key="pairing" {...pageTransition} style={{ height: '100%' }}>
            <PairingScreen
              user={user}
              onPaired={handlePaired}
              initialNotice={pairingNotice}
              onNoticeConsumed={handleNoticeConsumed}
            />
          </motion.div>
        )}
        {screen === 'main' && (
          <motion.div key="main" {...pageTransition} style={{ height: '100%' }}>
            <MainScreen
              user={user}
              coupleId={coupleId}
              onPairingRemoved={handlePairingRemoved}
            />
          </motion.div>
        )}
      </AnimatePresence>
      {Retune && (
        <Suspense fallback={null}>
          <Retune />
        </Suspense>
      )}
      <AnimatePresence>
        {foregroundToast && (
          <motion.div
            className="toast"
            initial={{ opacity: 0, y: 18, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 18, x: '-50%' }}
          >
            {foregroundToast}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
